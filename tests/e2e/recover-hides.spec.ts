import { test, expect, type Page } from "@playwright/test";
import { defaults } from "../../lib/catalog";
import { createBackup } from "../../lib/settings-backup";

// Real incident: hides made on this browser were dropped when another device's changes replaced the local copy, which was kept aside.
// This offers them back. Nothing here touches the network except a stubbed /api/profile.
const row = (key: string, extra: Record<string, unknown> = {}) => ({
  key,
  brand: "Lemaire",
  traits: [],
  style: "",
  title: `Wool piece ${key.slice(-3)}`,
  ...extra,
});
const prefs = (hides: ReturnType<typeof row>[]) =>
  ({
    ...defaults,
    styleRules: {},
    saved: [],
    following: ["Auralee"],
    dismissed: hides.map((h) => h.key),
    tasteFeedback: hides,
  }) as any;
const settingsOf = (
  current: string[],
  older: { key: string; undated?: boolean; reason?: string }[],
) => {
  const mk = (key: string, undated?: boolean, reason?: string) =>
    row(key, {
      ...(undated ? {} : { hiddenAt: "2026-10-27T21:40:00.000Z" }),
      ...(reason ? { reason } : {}),
    });
  return {
    current: prefs(current.map((k) => mk(k, true))),
    aside: {
      savedAt: "2026-10-27T22:02:00.000Z",
      settings: prefs([
        ...current.map((k) => mk(k, true)),
        ...older.map((o) => mk(o.key, o.undated, o.reason)),
      ]),
      savedListings: [],
    },
  };
};
const rows = (page: Page) => page.locator("#hidden-pieces .hidden-piece");
const hidden = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("forme-v2")!).dismissed as string[]);
const notice = (page: Page) => page.locator(".recover-hides");
async function seed(
  page: Page,
  state: { current: any; aside: any },
  extra?: (page: Page) => Promise<void>,
) {
  await page.addInitScript(
    ([cur, aside]) => {
      localStorage.setItem("forme-onboarding-complete", "1");
      localStorage.setItem("forme-data-mode", "demo");
      if (!localStorage.getItem("forme-v2")) {
        localStorage.setItem("forme-v2", JSON.stringify(cur));
        localStorage.setItem("forme-v2-before-sync", JSON.stringify(aside));
      }
    },
    [state.current, state.aside],
  );
  await page.route("**/api/listings", (route) =>
    route.fulfill({ status: 503, json: { error: "static" } }),
  );
  for (const name of ["local-profile", "refresh", "learning"])
    await page.route(`**/api/${name}`, (route) =>
      route.fulfill({ status: 503, json: { error: "Isolated test" } }),
    );
  await page.route("**/api/size-profile", (route) => route.fulfill({ json: { profile: null } }));
  await page.route("**/api/profile", (route) => route.fulfill({ json: { sync: "off" } }));
  if (extra) await extra(page);
}

test("older hides the current list lacks are offered back with their exact number and the date the copy was set aside", async ({
  page,
}) => {
  await seed(
    page,
    settingsOf(
      ["vinted:101", "vinted:102"],
      [{ key: "vinted:201" }, { key: "vinted:202" }, { key: "vinted:203" }],
    ),
  );
  await page.goto("/settings");
  await expect(rows(page)).toHaveCount(2);
  // the date is shown in the reader's own time zone, so only its shape is checked
  await expect(notice(page)).toContainText(
    /3 pieces you hid on this browser were left out when your account was updated \(\d{1,2} \w{3} 2026, \d\d:\d\d\)/,
  );
  await expect(
    notice(page).getByRole("button", { name: "Bring them back", exact: true }),
  ).toBeVisible();
  await expect(notice(page).getByRole("button", { name: "Not now", exact: true })).toBeVisible();
});
test("bringing them back adds only those, keeps everything already hidden and each reason, and the notice does not return", async ({
  page,
}) => {
  await seed(
    page,
    settingsOf(
      ["vinted:101", "vinted:102"],
      [
        { key: "vinted:201", reason: "style" },
        { key: "vinted:202", reason: "color" },
        { key: "vinted:203", undated: true },
      ],
    ),
  );
  await page.goto("/settings");
  // two dated hides and one from before dates were recorded: all three are offered, because the person is asking for them
  await expect(notice(page)).toContainText("3 pieces you hid on this browser");
  await notice(page).getByRole("button", { name: "Bring them back", exact: true }).click();
  await expect(page.getByText("Brought back 3 hidden pieces.")).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
  await expect(rows(page)).toHaveCount(5);
  expect((await hidden(page)).sort()).toEqual([
    "vinted:101",
    "vinted:102",
    "vinted:201",
    "vinted:202",
    "vinted:203",
  ]);
  await expect(
    rows(page).filter({ hasText: "Wool piece 202" }).locator(".hidden-piece-reason"),
  ).toHaveText("Not the right colour"); // a reason given then travels with the hide
  await page.reload();
  await expect(rows(page)).toHaveCount(5);
  await expect(notice(page)).toHaveCount(0);
});
test("a piece brought back and then restored on purpose is not offered again", async ({ page }) => {
  await seed(page, settingsOf(["vinted:101"], [{ key: "vinted:201" }, { key: "vinted:202" }]));
  await page.goto("/settings");
  await notice(page).getByRole("button", { name: "Bring them back", exact: true }).click();
  await expect(rows(page)).toHaveCount(3);
  await page.getByRole("button", { name: "Restore Wool piece 201", exact: true }).click();
  await expect(rows(page)).toHaveCount(2);
  await expect(notice(page)).toHaveCount(0);
  await page.reload();
  await expect(rows(page)).toHaveCount(2);
  await expect(notice(page)).toHaveCount(0);
  expect((await hidden(page)).sort()).toEqual(["vinted:101", "vinted:202"]);
});
test('"Not now" changes nothing and stays dismissed after a reload', async ({ page }) => {
  await seed(page, settingsOf(["vinted:101"], [{ key: "vinted:201" }]));
  await page.goto("/settings");
  await notice(page).getByRole("button", { name: "Not now", exact: true }).click();
  await expect(notice(page)).toHaveCount(0);
  await expect(rows(page)).toHaveCount(1);
  expect(await hidden(page)).toEqual(["vinted:101"]);
  await page.reload();
  await expect(notice(page)).toHaveCount(0);
  await expect(rows(page)).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem("forme-v2-before-sync"))).not.toBeNull(); // the kept copy itself is never deleted
});
test("one missing piece reads naturally", async ({ page }) => {
  await seed(page, settingsOf(["vinted:101"], [{ key: "vinted:201" }]));
  await page.goto("/settings");
  await expect(notice(page)).toContainText("1 piece you hid on this browser was left out");
  await notice(page).getByRole("button", { name: "Bring it back", exact: true }).click();
  await expect(page.getByText("Brought back 1 hidden piece.")).toBeVisible();
});
test("nothing is offered when the older copy holds nothing the current list lacks, or when there is no older copy", async ({
  page,
}) => {
  await seed(page, settingsOf(["vinted:101", "vinted:102"], []));
  await page.goto("/settings");
  await expect(rows(page)).toHaveCount(2);
  await expect(notice(page)).toHaveCount(0);
  await page.evaluate(() => localStorage.removeItem("forme-v2-before-sync"));
  await page.reload();
  await expect(notice(page)).toHaveCount(0);
});
test("a newer kept copy is offered even after an earlier one was dealt with", async ({ page }) => {
  await seed(page, settingsOf(["vinted:101"], [{ key: "vinted:201" }]));
  await page.goto("/settings");
  await notice(page).getByRole("button", { name: "Not now", exact: true }).click();
  await expect(notice(page)).toHaveCount(0);
  await page.evaluate(() => {
    const a = JSON.parse(localStorage.getItem("forme-v2-before-sync")!);
    a.savedAt = "2026-10-28T09:00:00.000Z";
    a.settings.dismissed.push("vinted:301");
    a.settings.tasteFeedback.push({
      key: "vinted:301",
      brand: "Lemaire",
      traits: [],
      style: "",
      title: "Wool piece 301",
      hiddenAt: "2026-10-28T08:50:00.000Z",
    });
    localStorage.setItem("forme-v2-before-sync", JSON.stringify(a));
  });
  await page.reload();
  await expect(notice(page)).toContainText("2 pieces you hid on this browser were left out");
});
test("with an account, the recovered hides are sent up like any other edit", async ({ page }) => {
  const puts: any[] = [];
  const state = settingsOf(["vinted:101"], [{ key: "vinted:201" }, { key: "vinted:202" }]);
  await seed(page, state, async (p) => {
    await p.addInitScript(() => {
      if (!localStorage.getItem("forme-sync"))
        localStorage.setItem(
          "forme-sync",
          JSON.stringify({ user: "owner@example.com", rev: 5, dirty: false }),
        );
    });
    await p.route("**/api/profile", (route) => {
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON();
        puts.push(body);
        return route.fulfill({ json: { revision: body.expectedRevision + 1 } });
      }
      return route.fulfill({
        json: {
          sync: "ready",
          user: { email: "owner@example.com", role: "owner" },
          profile: {
            backup: createBackup(state.current, { mode: "live", collapsed: false }, []),
            revision: 5,
            updatedAt: "2026-10-27T22:02:00Z",
          },
        },
      });
    });
  });
  await page.goto("/settings");
  await expect(notice(page)).toContainText("2 pieces you hid");
  await notice(page).getByRole("button", { name: "Bring them back", exact: true }).click();
  await expect.poll(() => puts.length, { timeout: 8000 }).toBe(1);
  expect(puts[0].expectedRevision).toBe(5);
  expect([...puts[0].backup.settings.dismissed].sort()).toEqual([
    "vinted:101",
    "vinted:201",
    "vinted:202",
  ]);
  await expect(page.getByText("All changes saved to your account")).toBeVisible();
});
test("the notice fits a phone screen with comfortable tap targets", async ({ page }) => {
  await page.setViewportSize({ width: 340, height: 700 });
  await seed(
    page,
    settingsOf(
      ["vinted:101"],
      Array.from({ length: 57 }, (_, i) => ({ key: `vinted:${300 + i}` })),
    ),
  );
  await page.goto("/settings");
  await expect(notice(page)).toContainText("57 pieces you hid on this browser were left out");
  await notice(page).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const name of ["Bring them back", "Not now"]) {
    const box = (await notice(page).getByRole("button", { name, exact: true }).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(40);
    expect(box.x + box.width).toBeLessThanOrEqual(340);
  }
});
