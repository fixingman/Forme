import { test, expect, type Page } from "@playwright/test";
import { defaults } from "../../lib/catalog";

// Saved pieces a provider check has confirmed are gone (sold, or removed from Vinted) are listed apart, at the bottom of Saved, and
// are removed only when the owner chooses. The learning API is stubbed so these tests record what would be sent and write nothing.
const at = new Date(Date.now() - 86400000).toISOString();
const checkedAt = new Date(Date.now() - 3600000).toISOString();
const piece = (id: number, brand: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  brand,
  title,
  source: "vinted",
  sourceId: String(id),
  sourceKey: `vinted:${id}`,
  sourceUrl: `https://www.vinted.se/items/${id}-x`,
  imageUrl: "https://images1.vinted.net/fixture.webp",
  price: 200,
  currency: "SEK",
  size: "M",
  condition: "Good",
  gender: "men",
  genderSource: "provider",
  fetchedAt: at,
  observedAt: at,
  category: "",
  style: "",
  rarity: 0,
  age: 1,
  image: "",
  ...extra,
});
const gone = (state: "sold" | "unavailable" | "reserved" | "available") => ({
  availability: state,
  availabilitySource: "provider",
  availabilityObservedAt: checkedAt,
});
const items = [
  piece(96001, "Lemaire", "Cotton trousers"),
  piece(96002, "Auralee", "Silk shirt", gone("sold")),
  piece(96003, "Studio Nicholson", "Wool coat", gone("unavailable")),
  piece(96004, "Margaret Howell", "Linen shirt", gone("reserved")),
  piece(96005, "Hope", "Denim jacket", gone("available")),
  piece(96006, "Jil Sander", "Knit", gone("sold")),
];
const settings = (saved: number[]) => ({
  ...defaults,
  following: [],
  excluded: [],
  styles: [],
  styleRules: {},
  saved,
  dismissed: [],
  searches: [],
  sizing: { enabled: false, selected: [], includeOneSize: true, includeUnspecified: true },
  gender: { selected: ["men", "unisex", "women"], includeUnknown: true },
});
const card = (page: Page, id: number) => page.getByTestId(`listing-${id}`);
const savedIds = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("forme-v2")!).saved as number[]);
const group = (page: Page) => page.locator(".saved-unavailable");

async function open(page: Page, saved: number[], rows: unknown[] = items) {
  const sent: { action: string; key: string }[] = [];
  await page.addInitScript(
    ([value, copies]) => {
      localStorage.setItem("forme-onboarding-complete", "1");
      if (!localStorage.getItem("forme-v2")) {
        localStorage.setItem("forme-v2", JSON.stringify(value));
        localStorage.setItem("forme-saved-listings", JSON.stringify(copies));
      }
    },
    [settings(saved), (rows as { id: number }[]).filter((row) => saved.includes(row.id))] as const,
  );
  await page.route("**/api/listings", (route) =>
    route.fulfill({ json: { fetchedAt: at, queries: ["fixture"], items: rows } }),
  );
  for (const path of ["size-profile", "local-profile", "refresh"])
    await page.route(`**/api/${path}`, (route) =>
      route.fulfill({ status: 503, json: { error: "Isolated test" } }),
    );
  // sync "off" gives the app a local identity, so it sends its learning events, which the stub below records
  await page.route("**/api/profile", (route) => route.fulfill({ json: { sync: "off" } }));
  await page.route("**/api/learning**", (route) => {
    if (route.request().method() !== "POST")
      return route.fulfill({
        json: {
          events: 0,
          selection: { revision: 0, selected: null, history: [] },
          canTrain: false,
          job: null,
          runs: [],
          reports: [],
        },
      });
    const body = route.request().postDataJSON();
    if (body.action === "snapshot")
      return route.fulfill({ status: 503, json: { error: "no snapshot in this test" } });
    for (const event of body?.events ?? []) sent.push({ action: event.action, key: event.key });
    return route.fulfill({
      json: { ack: (body?.events ?? []).map((event: { id: string }) => event.id) },
    });
  });
  await page.route("https://images1.vinted.net/**", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  return sent;
}

test("confirmed sold and removed pieces are listed apart, with their state shown; everything else stays in the main list", async ({
  page,
}) => {
  await open(page, [96001, 96002, 96003, 96004, 96005]);
  await page.goto("/saved");
  await expect(card(page, 96001)).toBeVisible();
  const g = group(page);
  await expect(g.getByRole("heading", { name: "No longer available (2)" })).toBeVisible();
  await expect(g).toContainText(
    "Marked sold, or removed from Vinted, the last time they were checked. They stay saved until you remove them.",
  );
  await expect(g.locator('[data-testid^="listing-"]')).toHaveCount(2);
  await expect(g.getByTestId("listing-96002")).toContainText("Sold");
  await expect(g.getByTestId("listing-96003")).toContainText("Unavailable");
  // the main list: unchecked, reserved and available pieces; not the gone ones
  for (const id of [96001, 96004, 96005])
    await expect(page.locator(".grid").first().getByTestId(`listing-${id}`)).toBeVisible();
  await expect(page.locator(".grid").first().getByTestId("listing-96002")).toHaveCount(0);
  await expect(page.locator(".feed-meta")).toHaveText("3 saved pieces · 2 no longer available");
  expect(await savedIds(page)).toEqual([96001, 96002, 96003, 96004, 96005]); // nothing was removed on its own
});
test("the gone group is the last thing on the page", async ({ page }) => {
  await open(page, [96001, 96002]);
  await page.goto("/saved");
  const [main, last] = await Promise.all([
    card(page, 96001).boundingBox(),
    card(page, 96002).boundingBox(),
  ]);
  expect(last!.y).toBeGreaterThan(main!.y + main!.height - 1);
});
test("removing asks first, says what it does, and Cancel changes nothing", async ({ page }) => {
  const sent = await open(page, [96001, 96002, 96003]);
  await page.goto("/saved");
  await group(page).getByRole("button", { name: "Remove from Saved (2)", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Remove 2 pieces from Saved?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("These pieces are no longer on Vinted.");
  await expect(dialog).toContainText(
    "stop counting as pieces you saved when FORME learns what you like",
  );
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await savedIds(page)).toEqual([96001, 96002, 96003]);
  await expect(group(page)).toBeVisible();
  expect(sent).toEqual([]);
});
test("confirming removes exactly the gone pieces, keeps the rest saved, records an unsave for each, and the group disappears", async ({
  page,
}) => {
  const sent = await open(page, [96001, 96002, 96003, 96004]);
  await page.goto("/saved");
  await group(page).getByRole("button", { name: "Remove from Saved (2)", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove 2 pieces", exact: true })
    .click();
  await expect(page.getByText("Removed 2 pieces from Saved.")).toBeVisible();
  await expect(group(page)).toHaveCount(0);
  expect(await savedIds(page)).toEqual([96001, 96004]);
  await expect(page.locator(".feed-meta")).toHaveText("2 saved pieces");
  await expect(card(page, 96002)).toHaveCount(0);
  await expect(card(page, 96001)).toBeVisible();
  await expect
    .poll(() => sent.map((row) => `${row.action}:${row.key}`).sort())
    .toEqual(["unsave:vinted:96002", "unsave:vinted:96003"]);
  const copies = await page.evaluate(() =>
    (JSON.parse(localStorage.getItem("forme-saved-listings")!) as { id: number }[])
      .map((row) => row.id)
      .sort(),
  );
  expect(copies).toEqual([96001, 96004]); // the kept copies of the removed pieces went too
  await page.reload();
  expect(await savedIds(page)).toEqual([96001, 96004]);
  await expect(group(page)).toHaveCount(0);
});
test("a single gone piece reads naturally", async ({ page }) => {
  const sent = await open(page, [96001, 96006]);
  await page.goto("/saved");
  await expect(group(page).getByRole("heading", { name: "No longer available (1)" })).toBeVisible();
  await group(page).getByRole("button", { name: "Remove from Saved (1)", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Remove 1 piece from Saved?" });
  await expect(dialog).toContainText(
    "This piece is no longer on Vinted. Removing it unsaves it, so it stops counting as a piece you saved",
  );
  await dialog.getByRole("button", { name: "Remove 1 piece", exact: true }).click();
  await expect(page.getByText("Removed 1 piece from Saved.")).toBeVisible();
  expect(await savedIds(page)).toEqual([96001]);
  await expect.poll(() => sent.map((row) => row.key)).toEqual(["vinted:96006"]);
});
test("when every saved piece is gone, the page says so instead of showing an empty state", async ({
  page,
}) => {
  await open(page, [96002, 96003]);
  await page.goto("/saved");
  await expect(
    page.getByText("Every saved piece you can see is no longer available. They are listed below."),
  ).toBeVisible();
  await expect(page.getByText("Your saved pieces are still saved")).toHaveCount(0);
  await expect(group(page).getByRole("heading", { name: "No longer available (2)" })).toBeVisible();
  await expect(page.locator(".feed-meta")).toHaveText("0 saved pieces · 2 no longer available");
  await group(page).getByRole("button", { name: "Remove from Saved (2)", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove 2 pieces", exact: true })
    .click();
  expect(await savedIds(page)).toEqual([]);
  await expect(page.getByText("A place for your next finds")).toBeVisible(); // now it really is empty
});
test("nothing is checked yet: no group, no change, exactly as before", async ({ page }) => {
  await open(
    page,
    [96001, 96004, 96005],
    items.map((row) => ({
      ...row,
      availability: undefined,
      availabilitySource: undefined,
      availabilityObservedAt: undefined,
    })),
  );
  await page.goto("/saved");
  await expect(card(page, 96001)).toBeVisible();
  await expect(group(page)).toHaveCount(0);
  await expect(page.locator(".feed-meta")).toHaveText("3 saved pieces");
});
test("a gone piece the filters hide is not offered for removal: only what is shown can be removed", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("forme-onboarding-complete", "1"));
  await open(page, [96001, 96002, 96006]);
  await page.addInitScript(() => {
    const s = JSON.parse(localStorage.getItem("forme-v2")!);
    s.dismissed = ["vinted:96006"]; // hidden with Not for me
    localStorage.setItem("forme-v2", JSON.stringify(s));
  });
  await page.goto("/saved");
  await expect(group(page).getByRole("heading", { name: "No longer available (1)" })).toBeVisible();
  await expect(page.locator(".feed-meta")).toContainText("1 hidden or outside this collection");
  await group(page).getByRole("button", { name: "Remove from Saved (1)", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove 1 piece", exact: true })
    .click();
  expect((await savedIds(page)).sort()).toEqual([96001, 96006]);
});
test("a piece can still be unsaved with its heart, inside the group", async ({ page }) => {
  await open(page, [96001, 96002]);
  await page.goto("/saved");
  await group(page).getByRole("button", { name: "Unsave Auralee Silk shirt", exact: true }).click();
  expect(await savedIds(page)).toEqual([96001]);
  await expect(group(page)).toHaveCount(0);
});
test("the group and its confirmation fit a phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 340, height: 700 });
  await open(page, [96001, 96002, 96003]);
  await page.goto("/saved");
  await group(page).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const button = group(page).getByRole("button", { name: "Remove from Saved (2)", exact: true });
  const box = (await button.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(40);
  expect(box.x + box.width).toBeLessThanOrEqual(340);
  await button.click();
  const dialog = page.getByRole("dialog");
  const area = (await dialog.boundingBox())!;
  expect(area.y).toBeGreaterThanOrEqual(0);
  expect(area.y + area.height).toBeLessThanOrEqual(701);
  for (const name of ["Remove 2 pieces", "Cancel"]) {
    const b = (await dialog.getByRole("button", { name, exact: true }).boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(40);
    expect(b.x + b.width).toBeLessThanOrEqual(340);
  }
});
