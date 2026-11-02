import { test, expect, type Page } from "@playwright/test";
import { defaults } from "../../lib/catalog";
const at = new Date(Date.now() - 3600000).toISOString();
const pieces = Array.from({ length: 4 }, (_, i) => ({
  id: 97001 + i,
  source: "vinted",
  sourceId: String(97001 + i),
  sourceKey: `vinted:${97001 + i}`,
  sourceUrl: `https://www.vinted.se/items/${97001 + i}-fixture`,
  brand: i % 2 ? "Auralee" : "Lemaire",
  title: ["Cotton shirt", "Wool jacket", "Linen trousers", "Cotton knit"][i],
  price: 400,
  currency: "SEK",
  size: "M",
  gender: "men",
  genderSource: "provider",
  condition: "Good",
  image: "",
  imageUrl: "https://images1.vinted.net/fixture.webp",
  category: "",
  style: "",
  rarity: 0,
  age: 1,
  fetchedAt: at,
}));
const settings = {
  ...defaults,
  following: ["Our Legacy"],
  excluded: [],
  styles: [],
  saved: [],
  dismissed: [],
  tasteFeedback: [],
  styleRules: {},
  gender: { selected: ["men", "women", "unisex"], includeUnknown: true },
  sizing: { enabled: false, selected: [], includeOneSize: true, includeUnspecified: true },
};
const id = "11111111-1111-4111-8111-111111111111";
test.beforeEach(async ({ page }) => {
  await page.addInitScript((settings) => {
    localStorage.setItem("forme-onboarding-complete", "1");
    if (!localStorage.getItem("forme-v2"))
      localStorage.setItem("forme-v2", JSON.stringify(settings));
  }, settings);
  await page.route("**/api/listings", (route) =>
    route.fulfill({ json: { fetchedAt: at, items: pieces } }),
  );
  await page.route("**/api/profile", (route) => route.fulfill({ json: { sync: "off" } }));
  for (const name of ["size-profile", "local-profile", "refresh"])
    await page.route(`**/api/${name}`, (route) =>
      route.fulfill({ status: 503, json: { error: "Isolated fixture" } }),
    );
  await page.route("https://images1.vinted.net/**", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
});
async function mockLearning(
  page: Page,
  eligible = false,
  options: { preselected?: boolean; counts?: Record<string, number>; uncounted?: unknown } = {},
) {
  let offline = false,
    revision = 0;
  const events = new Map<string, any>(),
    exposures = new Map<string, any>(),
    selections: any[] = [],
    snapshots = { count: 0 };
  const keys = pieces.map((row) => row.sourceKey),
    engines = Object.fromEntries(
      ["current", "river", "river-regularized", "gorse"].map((name) => [
        name,
        {
          mode: name === "current" ? "current" : "learned",
          keys: name === "current" ? keys : [...keys].reverse(),
        },
      ]),
    );
  let selected: any = options.preselected
    ? { engine: "river", runId: id, channel: "shopping" }
    : null;
  await page.route("**/api/learning**", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          events: events.size,
          selection: { revision, selected, history: [] },
          canTrain: true,
          job: null,
          runs: [
            {
              id,
              channel: "shopping",
              createdAt: at,
              engines,
              training: { positive: 6, negative: 6 },
            },
          ],
          reports: ["shopping", "preview"].map((channel) => ({
            channel,
            counts: {
              positive: 0,
              style: 0,
              material: 0,
              color: 0,
              price: 0,
              data: 0,
              unneeded: 0,
              similar: 0,
              unknown: 0,
              unscored: 0,
              ...(channel === "shopping" ? options.counts : {}),
            },
            ...(channel === "shopping" && options.uncounted
              ? { uncounted: options.uncounted }
              : {}),
            metric: "Only judged pairs count.",
            engines: Object.fromEntries(
              Object.keys(engines).map((name) => [
                name,
                {
                  eligible: eligible && channel === "shopping",
                  status: eligible ? "ready-for-review" : "insufficient-evidence",
                  pairs: eligible ? 20 : 0,
                  days: eligible ? 5 : 0,
                },
              ]),
            ),
          })),
        },
      });
    const body = route.request().postDataJSON();
    if (body.action === "snapshot") {
      snapshots.count++;
      return route.fulfill({
        json: {
          id: crypto.randomUUID(),
          createdAt: at,
          items: pieces,
          engines,
          training: { positive: 6, negative: 6 },
          selectedKeys: selected ? engines[selected.engine].keys : null,
          selectedName: selected ? selected.engine : "current",
        },
      });
    }
    if (offline)
      return route.fulfill({
        status: 503,
        json: { error: "Offline fixture. Feedback remains on this device." },
      });
    if (body.action === "events") {
      body.events.forEach((event: any) => events.set(event.id, event));
      return route.fulfill({ json: { ack: body.events.map((event: any) => event.id) } });
    }
    if (body.action === "exposure") {
      exposures.set(body.exposure.id, body.exposure);
      return route.fulfill({ json: { id: body.exposure.id } });
    }
    if (body.action === "select") {
      selections.push(body);
      revision++;
      selected =
        body.engine === "current"
          ? null
          : { engine: body.engine, runId: body.runId, channel: "shopping" };
      return route.fulfill({ json: { revision, selected, history: [] } });
    }
    return route.fulfill({ json: {} });
  });
  return {
    events,
    exposures,
    selections,
    snapshots,
    offline: (value: boolean) => {
      offline = value;
    },
  };
}
test("immediate hide, optional price reason and offline feedback survive reload without changing saves or spending", async ({
  page,
}) => {
  const mock = await mockLearning(page);
  let paid = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/api\/(refresh|translate)/.test(request.url())) paid++;
  });
  await page.goto("/discover");
  await expect(page.getByTestId("listing-97001")).toBeVisible();
  await expect.poll(() => mock.exposures.size).toBeGreaterThan(0);
  mock.offline(true);
  await page.getByRole("button", { name: "Not for me: Cotton shirt", exact: true }).click();
  await expect(page.getByTestId("listing-97001")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Add reason", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Too expensive", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("forme-v2")!).tasteFeedback[0].reason),
    )
    .toBe("price");
  await page.reload();
  await expect(page.getByTestId("listing-97001")).toHaveCount(0);
  mock.offline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect
    .poll(() => [...mock.events.values()].map((row) => row.action))
    .toEqual(["dismiss", "reason"]);
  expect([...mock.events.values()][1].targetId).toBe([...mock.events.values()][0].id);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("forme-v2")!).saved)).toEqual(
    [],
  );
  await page.goto("/settings");
  await page.getByRole("button", { name: "Restore Cotton shirt", exact: true }).click();
  await expect
    .poll(() => [...mock.events.values()].map((row) => row.action))
    .toEqual(["dismiss", "reason", "restore"]);
  expect(paid).toBe(0);
});
test("feedback before account verification stays durable and joins the confirmed local scope after reload", async ({
  page,
}) => {
  const mock = await mockLearning(page);
  let resolved = false;
  await page.route("**/api/profile", (route) =>
    route.fulfill(
      resolved
        ? { json: { sync: "off" } }
        : { status: 503, json: { error: "Temporarily offline" } },
    ),
  );
  await page.goto("/following");
  await page.goto("/discover");
  await page.getByRole("button", { name: "Not for me: Cotton shirt", exact: true }).click();
  await page.getByRole("button", { name: "Add reason", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Not my style", exact: true }).click();
  expect(mock.events.size).toBe(0);
  expect(
    await page.evaluate(
      () =>
        Object.keys(localStorage).filter((key) => key.includes(":pending:") && key.includes(":op:"))
          .length,
    ),
  ).toBe(2);
  resolved = true;
  await page.reload();
  await expect
    .poll(() => [...mock.events.values()].map((row) => row.action))
    .toEqual(["dismiss", "reason"]);
  expect([...mock.events.values()][1].targetId).toBe([...mock.events.values()][0].id);
});

test("successive shopping judgments retain the same frozen prediction pool", async ({ page }) => {
  const mock = await mockLearning(page);
  await page.goto("/discover");
  await expect.poll(() => mock.exposures.size).toBeGreaterThan(0);
  await page
    .getByTestId("listing-97001")
    .getByRole("button", { name: "Save Lemaire Cotton shirt", exact: true })
    .click();
  await expect
    .poll(() => [...mock.events.values()].some((row) => row.action === "save"))
    .toBe(true);
  await page.waitForTimeout(850); // allow the feedback-driven context request to complete
  await page
    .getByTestId("listing-97002")
    .getByRole("button", { name: "Not for me: Wool jacket", exact: true })
    .click();
  await expect
    .poll(() => [...mock.events.values()].some((row) => row.action === "dismiss"))
    .toBe(true);
  const save = [...mock.events.values()].find((row) => row.action === "save"),
    hide = [...mock.events.values()].find((row) => row.action === "dismiss");
  expect(mock.exposures.get(save.exposureId).runId).toBe(mock.exposures.get(hide.exposureId).runId);
  expect(
    [...mock.exposures.values()].some(
      (row) =>
        row.trigger === "visible" &&
        Object.values(row.positions).some((position) => (position as number) > 0),
    ),
  ).toBe(true);
});
test("activation needs sufficient evidence and the owner's approval; rollback returns to Current", async ({
  page,
}) => {
  await mockLearning(page);
  await page.goto("/tools/learning");
  for (const button of await page
    .getByRole("button", { name: "Review activation", exact: true })
    .all())
    await expect(button).toBeDisabled();
  const mock = await mockLearning(page, true);
  await page.reload();
  const shopping = page.locator(".learning-report").filter({ hasText: "Shopping judgments" });
  await shopping.getByRole("button", { name: "Review activation", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  // there is no private-preview consent box any more: the comparison feature that needed it is gone
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Activate River", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Activate River", exact: true }).click();
  await expect(page.getByRole("button", { name: "Return to Current", exact: true })).toBeVisible();
  expect(mock.selections[0]).toMatchObject({ engine: "river", expectedRevision: 0 });
  expect(mock.selections[0].allowPreviewTraining).toBeUndefined();
  await page.getByRole("button", { name: "Return to Current", exact: true }).click();
  await expect(page.getByText("Current remains selected.", { exact: true })).toBeVisible();
  expect(mock.selections[1]).toMatchObject({ engine: "current", expectedRevision: 1 });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("the comparison feature is gone: no card, no preview report, no preview page", async ({
  page,
}) => {
  await mockLearning(page);
  await page.goto("/tools/learning");
  await expect(page.getByRole("heading", { name: "Live ranking" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create learning comparison" })).toHaveCount(0);
  await expect(page.getByText("Give fresh feedback")).toHaveCount(0);
  await expect(page.getByText("Private preview judgments")).toHaveCount(0);
  await expect(page.locator(".learning-report")).toHaveCount(1);
  await page.goto("/tools");
  await expect(page.getByRole("heading", { name: "Collection tools" })).toBeVisible();
  await expect(page.getByText("Ranking preview")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /ranking preview/i })).toHaveCount(0);
});
test("learning API rejects foreign origins and malformed events without training", async ({
  request,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  expect(
    (
      await request.post("/api/learning", {
        headers: { origin: "https://elsewhere.example" },
        data: { action: "train" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/learning", {
        headers: { origin, "Content-Type": "application/json" },
        data: "null",
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/learning", {
        headers: { origin },
        data: { action: "events", events: [{ id: "invalid" }] },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/learning", {
        headers: { origin },
        data: { action: "clear", confirmation: "yes" },
      })
    ).status(),
  ).toBe(400);
});

// ---------------------------------------------------------------------------------------------- one ranking per visit
// A vote used to re-run the ranking request, uploading a fresh ~2 MB catalogue each time; at the owner's voting pace the history
// slowed until answers arrived later than votes, and the answers were thrown away. One request per visit to a feed is enough.
test("voting on Discover does not ask for a new ranking each time: one per visit", async ({
  page,
}) => {
  const mock = await mockLearning(page);
  await page.goto("/discover");
  await expect(page.getByTestId("listing-97001")).toBeVisible();
  await expect.poll(() => mock.exposures.size).toBeGreaterThan(0);
  await page.waitForTimeout(900);
  const atStart = mock.snapshots.count;
  expect(atStart).toBeGreaterThan(0);
  expect(atStart).toBeLessThanOrEqual(2);
  await page
    .getByTestId("listing-97001")
    .getByRole("button", { name: "Save Lemaire Cotton shirt", exact: true })
    .click();
  await expect
    .poll(() => [...mock.events.values()].some((row) => row.action === "save"))
    .toBe(true);
  await page
    .getByTestId("listing-97002")
    .getByRole("button", { name: "Not for me: Wool jacket", exact: true })
    .click();
  await expect
    .poll(() => [...mock.events.values()].some((row) => row.action === "dismiss"))
    .toBe(true);
  await page
    .getByTestId("listing-97003")
    .getByRole("button", { name: "Not for me: Linen trousers", exact: true })
    .click();
  await expect
    .poll(() => [...mock.events.values()].filter((row) => row.action === "dismiss").length)
    .toBe(2);
  await page.waitForTimeout(1200); // longer than the request's own 350 ms delay: a re-request would have happened by now
  expect(mock.snapshots.count).toBe(atStart);
  // and the votes are still tied to that one ranking
  const runs = new Set(
    [...mock.events.values()].map((row) => mock.exposures.get(row.exposureId)?.runId),
  );
  expect(runs.size).toBe(1);
  expect(runs.has(undefined)).toBe(false);
});
test("changing the feed itself still asks for a new ranking: filters, and a new visit", async ({
  page,
}) => {
  const mock = await mockLearning(page);
  await page.goto("/discover");
  await expect(page.getByTestId("listing-97001")).toBeVisible();
  await page.waitForTimeout(900);
  const atStart = mock.snapshots.count;
  await page.getByRole("button", { name: "My sizes and departments", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: "Women", exact: true }).uncheck();
  await dialog.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect.poll(() => mock.snapshots.count, { timeout: 8000 }).toBeGreaterThan(atStart);
  const afterFilter = mock.snapshots.count;
  await page.goto("/following");
  await page.goto("/discover");
  await expect(page.getByTestId("listing-97001")).toBeVisible();
  await expect.poll(() => mock.snapshots.count, { timeout: 8000 }).toBeGreaterThan(afterFilter);
});
test("while a learned version is selected, a vote still refreshes whether it applies", async ({
  page,
}) => {
  const mock = await mockLearning(page, false, { preselected: true });
  await page.goto("/discover");
  await expect(page.getByTestId("listing-97001")).toBeVisible();
  await page.waitForTimeout(900);
  const atStart = mock.snapshots.count;
  await page
    .getByTestId("listing-97001")
    .getByRole("button", { name: "Save Lemaire Cotton shirt", exact: true })
    .click();
  await expect.poll(() => mock.snapshots.count, { timeout: 8000 }).toBeGreaterThan(atStart);
});
// ---------------------------------------------------------------------------------------------- votes not counted, and why
const uncountedFixture = {
  total: 143,
  reasons: {
    noRanking: 88,
    exposureLost: 12,
    outsideWindow: 0,
    olderPolicy: 0,
    beforeRanking: 40,
    usedToTrain: 2,
    notListed: 1,
  },
  brands: { "Our Legacy": 60, Auralee: 20, "Some Other Brand": 8 },
};
test("the Learning page says how many votes count and why the others do not, in plain words", async ({
  page,
}) => {
  await page.addInitScript((value) => localStorage.setItem("forme-v2", JSON.stringify(value)), {
    ...settings,
    following: ["Our Legacy", "Auralee"],
  });
  await mockLearning(page, false, {
    counts: { positive: 1, style: 46 },
    uncounted: uncountedFixture,
  });
  await page.goto("/tools/learning");
  const note = page.locator(".uncounted-note");
  await expect(note).toContainText(
    "47 of 190 of your saves and “Not my style” hides are counted by the silent test.",
  );
  await expect(note).toContainText(
    "The other 143 are not, and that does not count against any model.",
  );
  await note.getByText("Why some votes are not counted").click();
  await expect(note).toContainText(
    "88 had no Discover ranking on screen when you voted (at least 80 on brands you follow, which Discover never ranks).",
  );
  await expect(note).toContainText(
    "12 were shown on Discover, but the record of that never reached your history.",
  );
  await expect(note).toContainText("40 were cast before the ranking for that visit was saved.");
  await expect(note).toContainText("2 were on pieces the models had already trained on.");
  await expect(note).toContainText("1 were not among the pieces in the ranking that was shown.");
  await expect(note.getByText(/evaluation window/)).toHaveCount(0); // a zero is not listed
  await expect(note.getByText(/older rule/)).toHaveCount(0);
});
test("the explanation never claims followed-brand votes it cannot see: with no followed brands there is no such clause", async ({
  page,
}) => {
  await page.addInitScript((value) => localStorage.setItem("forme-v2", JSON.stringify(value)), {
    ...settings,
    following: ["Somebody Else"],
  });
  await mockLearning(page, false, {
    counts: { positive: 0, style: 5 },
    uncounted: { total: 3, reasons: { noRanking: 3 }, brands: { "Our Legacy": 3 } },
  });
  await page.goto("/tools/learning");
  const note = page.locator(".uncounted-note");
  await expect(note).toContainText("5 of 8");
  await note.getByText("Why some votes are not counted").click();
  await expect(note).toContainText(
    "3 had no Discover ranking on screen when you voted. Votes on other pages",
  );
  await expect(note.getByText(/on brands you follow/)).toHaveCount(0);
});
test("when every vote counts the note says so and offers no list of reasons; with no votes at all there is no note", async ({
  page,
}) => {
  await mockLearning(page, false, {
    counts: { positive: 2, style: 8 },
    uncounted: { total: 0, reasons: {}, brands: {} },
  });
  await page.goto("/tools/learning");
  await expect(page.locator(".uncounted-note")).toContainText(
    "10 of 10 of your saves and “Not my style” hides are counted by the silent test.",
  );
  await expect(page.getByText("Why some votes are not counted")).toHaveCount(0);
  await expect(page.locator(".uncounted-note")).not.toContainText("The other");
});
test("an older server that sends no explanation does not break the page", async ({ page }) => {
  await mockLearning(page, false, { counts: { positive: 1, style: 2 } });
  await page.goto("/tools/learning");
  await expect(page.getByRole("heading", { name: "Recommendation quality" })).toBeVisible();
  await expect(page.locator(".uncounted-note")).toHaveCount(0);
});
test("the explanation fits a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 340, height: 700 });
  await mockLearning(page, false, {
    counts: { positive: 1, style: 46 },
    uncounted: uncountedFixture,
  });
  await page.goto("/tools/learning");
  const note = page.locator(".uncounted-note");
  await note.getByText("Why some votes are not counted").click();
  await expect(note).toContainText("88 had no Discover ranking");
  await note.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
