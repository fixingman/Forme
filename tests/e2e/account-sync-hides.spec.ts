import { test, expect, type Page } from "@playwright/test";
import { defaults } from "../../lib/catalog";
import { createBackup } from "../../lib/settings-backup";

// Real incident: 57 "Not for me" hides made on this browser in a 31-minute window were lost when the account copy, updated
// elsewhere, replaced the local one. The account copy still wins, but a hide made since the last sync is carried across and sent up.
// The sync logic runs in the browser against /api/profile, so these tests stub that endpoint and exercise the real client code.
const me = { email: "owner@example.com", role: "owner" };
const row = (key: string, hiddenAt?: string, extra: Record<string, unknown> = {}) => ({
  key,
  brand: "Brand",
  traits: [],
  style: "",
  ...(hiddenAt ? { hiddenAt } : {}),
  ...extra,
});
const prefs = (following: string[], hides: { key: string; hiddenAt?: string; reason?: string }[]) =>
  ({
    ...defaults,
    styleRules: {},
    saved: [],
    following,
    dismissed: hides.map((h) => h.key),
    tasteFeedback: hides.map((h) => row(h.key, h.hiddenAt, h.reason ? { reason: h.reason } : {})),
  }) as any;
const backupOf = (following: string[], hides: { key: string; hiddenAt?: string }[] = []) =>
  createBackup(prefs(following, hides), { mode: "live", collapsed: false }, []);
const SYNCED = "2026-10-27T21:10:00.000Z",
  BEFORE = "2026-10-27T21:05:00.000Z",
  AFTER = "2026-10-27T21:30:00.000Z";
const hidden = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("forme-v2")!).dismissed as string[]);
const stored = (page: Page, key: string) =>
  page.evaluate(
    (k) =>
      JSON.parse(localStorage.getItem("forme-v2")!).tasteFeedback.find(
        (r: { key: string }) => r.key === k,
      ),
    key,
  );

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("forme-onboarding-complete", "1");
    localStorage.setItem("forme-data-mode", "demo");
  });
  await page.route("**/api/listings", (route) =>
    route.fulfill({ status: 503, json: { error: "static" } }),
  );
  await page.route("**/api/local-profile", (route) =>
    route.fulfill({ status: 503, json: { error: "Isolated test" } }),
  );
  await page.route("**/api/refresh", (route) =>
    route.fulfill({ status: 503, json: { error: "Isolated test" } }),
  );
  await page.route("**/api/learning", (route) =>
    route.fulfill({ status: 503, json: { error: "Isolated test" } }),
  );
  await page.route("**/api/size-profile", (route) => route.fulfill({ json: { profile: null } }));
});
/** This browser: synced at SYNCED (revision 3), then made `local` hides with unsent edits; the account moved on to revision 8 elsewhere. */
async function setup(
  page: Page,
  {
    local,
    remoteHides,
    marker = { user: "owner@example.com", rev: 3, dirty: true },
    syncedAt = SYNCED,
    failPut = false,
  }: {
    local: { key: string; hiddenAt?: string; reason?: string }[];
    remoteHides: { key: string; hiddenAt?: string }[];
    marker?: any;
    syncedAt?: string | null;
    failPut?: boolean;
  },
) {
  const puts: any[] = [];
  await page.addInitScript(
    ([value, m, at]) => {
      if (localStorage.getItem("forme-v2")) return;
      localStorage.setItem("forme-v2", JSON.stringify(value));
      localStorage.setItem("forme-sync", JSON.stringify(m));
      if (at) localStorage.setItem("forme-sync-at", at as string);
    },
    [prefs(["Auralee"], local), marker, syncedAt],
  );
  let revision = 8,
    remote = backupOf(["Auralee", "Hope"], remoteHides);
  await page.route("**/api/profile", (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      puts.push(body);
      if (failPut) return route.fulfill({ status: 500, json: {} });
      remote = body.backup;
      revision = body.expectedRevision + 1;
      return route.fulfill({ json: { revision } });
    }
    return route.fulfill({
      json: {
        sync: "ready",
        user: me,
        profile: { backup: remote, revision, updatedAt: "2026-10-27T22:02:00Z" },
      },
    });
  });
  return puts;
}

test("the account was updated elsewhere: its changes apply, and the hides made here since the last sync are kept and sent up", async ({
  page,
}) => {
  const puts = await setup(page, {
    local: [
      { key: "vinted:1", hiddenAt: AFTER, reason: "style" },
      { key: "vinted:2", hiddenAt: AFTER },
    ],
    remoteHides: [{ key: "vinted:90", hiddenAt: BEFORE }],
  });
  await page.goto("/settings");
  await expect(
    page.getByText(
      "Your account was updated on another device. Those changes were applied, and the 2 pieces you hid here since were kept.",
    ),
  ).toBeVisible();
  expect(await hidden(page)).toEqual(["vinted:90", "vinted:1", "vinted:2"]); // the account's hide first, mine kept, newest last
  expect((await stored(page, "vinted:1")).reason).toBe("style"); // a reason given here travels with the hide
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem("forme-v2")!).following),
  ).toEqual(["Auralee", "Hope"]); // the account's other changes won
  await expect.poll(() => puts.length, { timeout: 8000 }).toBe(1);
  expect(puts[0].expectedRevision).toBe(8); // sent on top of the revision just adopted
  expect(puts[0].backup.settings.dismissed).toEqual(["vinted:90", "vinted:1", "vinted:2"]);
  await expect(page.getByText("All changes saved to your account")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("forme-sync")!))).toEqual({
    user: "owner@example.com",
    rev: 9,
    dirty: false,
  });
  const aside = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("forme-v2-before-sync")!),
  );
  expect(aside.settings.dismissed).toEqual(["vinted:1", "vinted:2"]); // the older copy is still kept aside
});
test("a hide made before the last sync that the account lacks is not brought back: it was probably restored on purpose", async ({
  page,
}) => {
  const puts = await setup(page, {
    local: [
      { key: "vinted:old", hiddenAt: BEFORE },
      { key: "vinted:new", hiddenAt: AFTER },
    ],
    remoteHides: [],
  });
  await page.goto("/settings");
  await expect(page.getByText("the piece you hid here since were kept")).toBeVisible();
  expect(await hidden(page)).toEqual(["vinted:new"]);
  await expect.poll(() => puts.length, { timeout: 8000 }).toBe(1);
  expect(puts[0].backup.settings.dismissed).toEqual(["vinted:new"]);
});
test("nothing made here since the last sync: the plain conflict notice, no extra upload, nothing carried", async ({
  page,
}) => {
  const puts = await setup(page, {
    local: [{ key: "vinted:old", hiddenAt: BEFORE }],
    remoteHides: [{ key: "vinted:90", hiddenAt: BEFORE }],
  });
  await page.goto("/settings");
  await expect(
    page.getByText(
      "Your account was updated on another device. Those changes were applied; your unsynced edits here were kept aside.",
      { exact: false },
    ),
  ).toBeVisible();
  expect(await hidden(page)).toEqual(["vinted:90"]);
  await page.waitForTimeout(2500);
  expect(puts).toHaveLength(0);
});
test("with no recorded last-sync time (an older install), dated hides the account lacks are kept, and undated ones are not", async ({
  page,
}) => {
  const puts = await setup(page, {
    local: [{ key: "vinted:undated" }, { key: "vinted:dated", hiddenAt: BEFORE }],
    remoteHides: [],
    syncedAt: null,
  });
  await page.goto("/settings");
  await expect(page.getByText("the piece you hid here since were kept")).toBeVisible();
  expect(await hidden(page)).toEqual(["vinted:dated"]);
  await expect.poll(() => puts.length, { timeout: 8000 }).toBe(1);
});
test("a hide the account already has is not duplicated", async ({ page }) => {
  const puts = await setup(page, {
    local: [
      { key: "vinted:1", hiddenAt: AFTER },
      { key: "vinted:2", hiddenAt: AFTER },
    ],
    remoteHides: [{ key: "vinted:1", hiddenAt: AFTER }],
  });
  await page.goto("/settings");
  await expect(page.getByText("the piece you hid here since were kept")).toBeVisible();
  expect(await hidden(page)).toEqual(["vinted:1", "vinted:2"]);
  await expect.poll(() => puts.length, { timeout: 8000 }).toBe(1);
  expect(puts[0].backup.settings.dismissed).toEqual(["vinted:1", "vinted:2"]);
});
test("a browser that has never synced this account only keeps its copy aside, as before: no merge", async ({
  page,
}) => {
  const puts = await setup(page, {
    local: [{ key: "vinted:1", hiddenAt: AFTER }],
    remoteHides: [],
    marker: null,
    syncedAt: null,
  });
  await page.addInitScript(() => localStorage.removeItem("forme-sync"));
  await page.goto("/settings");
  await expect(
    page.getByText("Loaded the preferences saved in your account", { exact: false }),
  ).toBeVisible();
  expect(await hidden(page)).toEqual([]);
  const aside = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("forme-v2-before-sync")!),
  );
  expect(aside.settings.dismissed).toEqual(["vinted:1"]);
  await page.waitForTimeout(2500);
  expect(puts).toHaveLength(0);
});
test("another account's earlier use of this browser never leaks its hides into this account", async ({
  page,
}) => {
  const puts = await setup(page, {
    local: [{ key: "vinted:theirs", hiddenAt: AFTER }],
    remoteHides: [],
    marker: { user: "someone-else@example.com", rev: 3, dirty: true },
  });
  await page.goto("/settings");
  await expect(
    page.getByText("Loaded the preferences saved in your account", { exact: false }),
  ).toBeVisible();
  expect(await hidden(page)).toEqual([]);
  await page.waitForTimeout(2500);
  expect(puts).toHaveLength(0);
});
test("if sending the merged hides fails, they are kept and sent again later; a second conflict does not drop them", async ({
  page,
}) => {
  let failing = true,
    revision = 8,
    remote = backupOf(["Auralee", "Hope"], []);
  const puts: any[] = [];
  await page.addInitScript(
    ([value, m, at]) => {
      if (localStorage.getItem("forme-v2")) return;
      localStorage.setItem("forme-v2", JSON.stringify(value));
      localStorage.setItem("forme-sync", JSON.stringify(m));
      localStorage.setItem("forme-sync-at", at as string);
    },
    [
      prefs(["Auralee"], [{ key: "vinted:1", hiddenAt: AFTER }]),
      { user: "owner@example.com", rev: 3, dirty: true },
      SYNCED,
    ],
  );
  await page.route("**/api/profile", (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      puts.push(body);
      if (failing)
        return route.fulfill({
          status: 409,
          json: {
            error: "conflict",
            profile: {
              backup: backupOf(
                ["Auralee", "Hope", "Third"],
                [{ key: "vinted:99", hiddenAt: BEFORE }],
              ),
              revision: 12,
              updatedAt: "2026-10-27T22:30:00Z",
            },
          },
        });
      remote = body.backup;
      revision = body.expectedRevision + 1;
      return route.fulfill({ json: { revision } });
    }
    return route.fulfill({
      json: {
        sync: "ready",
        user: me,
        profile: { backup: remote, revision, updatedAt: "2026-10-27T22:02:00Z" },
      },
    });
  });
  await page.goto("/settings");
  await expect(page.getByText("the piece you hid here since were kept").first()).toBeVisible();
  await expect.poll(() => puts.length, { timeout: 8000 }).toBeGreaterThan(0);
  failing = false;
  await expect
    .poll(async () => (await hidden(page)).sort().join(","), { timeout: 15000 })
    .toBe("vinted:1,vinted:99"); // the other device's hide AND mine
  await expect
    .poll(() => puts.at(-1)?.backup.settings.dismissed.sort().join(","), { timeout: 15000 })
    .toBe("vinted:1,vinted:99");
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("forme-sync")!).dirty), {
      timeout: 15000,
    })
    .toBe(false);
});
test("a normal edit on an up-to-date browser still just saves: no merge, no notice", async ({
  page,
}) => {
  const puts: any[] = [];
  await page.addInitScript(
    ([value, m]) => {
      if (localStorage.getItem("forme-v2")) return;
      localStorage.setItem("forme-v2", JSON.stringify(value));
      localStorage.setItem("forme-sync", JSON.stringify(m));
    },
    [prefs(["Auralee"], []), { user: "owner@example.com", rev: 3, dirty: false }],
  );
  await page.route("**/api/profile", (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      puts.push(body);
      return route.fulfill({ json: { revision: 4 } });
    }
    return route.fulfill({
      json: {
        sync: "ready",
        user: me,
        profile: { backup: backupOf(["Auralee"]), revision: 3, updatedAt: "2026-10-27T22:02:00Z" },
      },
    });
  });
  await page.goto("/brands");
  await page.getByLabel("Find a brand").fill("Lemaire");
  await page
    .getByRole("group", { name: "Lemaire preference" })
    .getByRole("button", { name: "Follow", exact: true })
    .click();
  await expect.poll(() => puts.length, { timeout: 8000 }).toBe(1);
  expect(puts[0].expectedRevision).toBe(3);
  await expect(page.getByText(/pieces? you hid here since/)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("forme-sync-at"))).toMatch(
    /^\d{4}-\d\d-\d\dT/,
  ); // the sync time is recorded
});
