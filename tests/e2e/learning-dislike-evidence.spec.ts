import { test, expect, type Page } from "@playwright/test";
import { defaults } from "../../lib/catalog";

// The evidence table says what the dislike-ranking route sees, instead of a bare "0 paired comparisons". The API is stubbed: this
// checks only what the page shows for each situation.
const at = new Date(Date.now() - 3600000).toISOString();
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
const counts = {
  positive: 1,
  style: 27,
  material: 0,
  color: 0,
  fit: 0,
  price: 0,
  data: 0,
  unneeded: 0,
  similar: 0,
  unknown: 0,
  unscored: 0,
};
const dislikes = (over = {}) => ({
  hides: 0,
  days: 0,
  meanPosition: null,
  currentPosition: null,
  lowerPosition: null,
  meanGain: 0,
  lowerGain: null,
  sufficient: false,
  eligible: false,
  ...over,
});
const engine = (over = {}) => ({
  eligible: false,
  status: "insufficient-evidence",
  pairs: 0,
  days: 0,
  meanDailyGain: 0,
  lowerGain: null,
  route: null,
  dislikes: dislikes(),
  ...over,
});
async function stub(page: Page, engines: Record<string, unknown>) {
  await page.route("**/api/learning**", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          events: 299,
          selection: { revision: 0, selected: null, history: [] },
          canTrain: true,
          job: null,
          runs: [],
          reports: ["shopping", "preview"].map((channel) => ({
            channel,
            counts,
            metric: "Only judged pairs count.",
            engines:
              channel === "shopping"
                ? engines
                : { river: engine(), "river-regularized": engine(), gorse: engine() },
          })),
        },
      });
    return route.fulfill({ json: {} });
  });
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript((value) => {
    localStorage.setItem("forme-onboarding-complete", "1");
    if (!localStorage.getItem("forme-v2")) localStorage.setItem("forme-v2", JSON.stringify(value));
  }, settings);
  await page.route("**/api/listings", (route) =>
    route.fulfill({ json: { fetchedAt: at, items: [] } }),
  );
  await page.route("**/api/profile", (route) => route.fulfill({ json: { sync: "off" } }));
  for (const name of ["size-profile", "local-profile", "refresh"])
    await page.route(`**/api/${name}`, (route) =>
      route.fulfill({ status: 503, json: { error: "Isolated fixture" } }),
    );
});
const row = (page: Page, name: string) =>
  page
    .locator("tr")
    .filter({ has: page.getByRole("rowheader", { name, exact: true }) })
    .first();

test("hidden pieces are reported with where the candidate placed them, against Current, and what is still needed", async ({
  page,
}) => {
  await stub(page, {
    river: engine({
      dislikes: dislikes({ hides: 14, days: 2, meanPosition: 0.752, currentPosition: 0.388 }),
    }),
    "river-regularized": engine({
      dislikes: dislikes({ hides: 14, days: 2, meanPosition: 0.738, currentPosition: 0.388 }),
    }),
    gorse: engine({
      dislikes: dislikes({ hides: 1, days: 1, meanPosition: 0.5, currentPosition: 0.3 }),
    }),
  });
  await page.goto("/tools/learning");
  const river = row(page, "River");
  await expect(river).toContainText(
    "Pieces you hid: 14 over 2 days, placed 75% of the way down (Current: 39%). Needs 20 pieces over 5 days.",
  );
  await expect(river).toContainText("insufficient evidence · 0 days");
  await expect(river.getByRole("button", { name: "Review activation" })).toBeDisabled();
  await expect(row(page, "Gorse")).toContainText("Pieces you hid: 1 over 1 day, placed 50%"); // singular day
  expect(await page.getByText("Ready on this evidence.").count()).toBe(0);
});
test("with no judged hides there is no dislike line, so the table is as quiet as before", async ({
  page,
}) => {
  await stub(page, { river: engine(), "river-regularized": engine(), gorse: engine() });
  await page.goto("/tools/learning");
  await expect(row(page, "River")).toContainText("insufficient evidence · 0 days");
  await expect(page.getByText(/Pieces you hid:/)).toHaveCount(0);
});
test("a candidate that qualifies on dislikes alone says so and unlocks the review button", async ({
  page,
}) => {
  await stub(page, {
    river: engine({
      eligible: true,
      route: "dislikes",
      status: "ready-for-review",
      dislikes: dislikes({
        hides: 25,
        days: 5,
        meanPosition: 0.93,
        currentPosition: 0.07,
        eligible: true,
        sufficient: true,
      }),
    }),
    "river-regularized": engine(),
    gorse: engine(),
  });
  await page.goto("/tools/learning");
  await expect(row(page, "River")).toContainText("ready for review");
  await expect(row(page, "River")).toContainText(
    "Pieces you hid: 25 over 5 days, placed 93% of the way down (Current: 7%).",
  );
  await expect(row(page, "River")).toContainText("Ready on this evidence.");
  await expect(
    row(page, "River").getByRole("button", { name: "Review activation" }),
  ).toBeDisabled(); // no trained version in this stub, so still guarded
});
test("an older server that sends no dislike data does not break the table", async ({ page }) => {
  await stub(page, {
    river: {
      eligible: false,
      status: "insufficient-evidence",
      pairs: 0,
      days: 0,
      meanDailyGain: 0,
      lowerGain: null,
    },
    "river-regularized": engine(),
    gorse: engine(),
  });
  await page.goto("/tools/learning");
  await expect(row(page, "River")).toContainText("insufficient evidence · 0 days");
  await expect(page.getByText(/Pieces you hid:/)).toHaveCount(0);
});
test("the table fits a phone screen without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 700 });
  await stub(page, {
    river: engine({
      dislikes: dislikes({ hides: 14, days: 2, meanPosition: 0.752, currentPosition: 0.388 }),
    }),
    "river-regularized": engine(),
    gorse: engine(),
  });
  await page.goto("/tools/learning");
  await expect(row(page, "River")).toContainText("Pieces you hid: 14 over 2 days");
  await row(page, "River").scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
