import { test, expect, type Page } from "@playwright/test";
import { defaults } from "../../lib/catalog";

// A queued learning operation the server permanently refuses must not freeze everything behind it. Real incident: the oldest queued
// exposure was refused for good ("Exposure is outside its frozen pool"), the outbox stopped at it, and every later operation, real
// hides and reasons included, never reached the server while a "pending" notice stayed on screen.
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
const SCOPE = "forme-learning-outbox-v1:local";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type Op = { id: string; action: "events" | "exposure"; events?: unknown[]; exposure?: unknown };
const exposure = (n: number): Op => ({
  id: uuid(100 + n),
  action: "exposure",
  exposure: { id: uuid(100 + n), runId: uuid(999), keys: ["vinted:97001"], channel: "shopping" },
});
const hide = (n: number, action = "dismiss"): Op => ({
  id: uuid(200 + n),
  action: "events",
  events: [{ id: uuid(200 + n), key: "vinted:97001", action, channel: "shopping", occurredAt: at }],
});
const seed = async (page: Page, ops: Op[]) =>
  page.addInitScript(
    ([scope, rows]) => {
      if (sessionStorage.getItem("outbox-seeded")) return;
      sessionStorage.setItem("outbox-seeded", "1");
      (rows as Op[]).forEach((op, index) =>
        localStorage.setItem(`${scope}:op:${op.id}`, JSON.stringify({ order: 1000 + index, op })),
      );
    },
    [SCOPE, ops] as const,
  );
const queued = (page: Page) =>
  page.evaluate(
    (scope) => Object.keys(localStorage).filter((k) => k.startsWith(`${scope}:op:`)).length,
    SCOPE,
  );
const setAside = (page: Page) =>
  page.evaluate(
    (scope) => Object.keys(localStorage).filter((k) => k.startsWith(`${scope}:rejected:`)).length,
    SCOPE,
  );

async function mockServer(page: Page, mode: "refuse-exposures" | "offline") {
  const delivered: string[] = [];
  await page.route("**/api/learning**", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          events: 0,
          selection: { revision: 0, selected: null, history: [] },
          canTrain: true,
          job: null,
          runs: [],
          reports: [],
        },
      });
    const body = route.request().postDataJSON();
    if (body.action === "snapshot")
      return route.fulfill({ status: 503, json: { error: "Fixture: no snapshot" } });
    if (mode === "offline")
      return route.fulfill({
        status: 503,
        json: { error: "Offline fixture. Feedback remains on this device." },
      });
    if (body.action === "exposure")
      return route.fulfill({
        status: 400,
        json: { error: "Exposure is outside its frozen pool." },
      });
    if (body.action === "events") {
      body.events.forEach((event: { id: string }) => delivered.push(event.id));
      return route.fulfill({ json: { ack: body.events.map((event: { id: string }) => event.id) } });
    }
    return route.fulfill({ json: {} });
  });
  return delivered;
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

test("refused exposures at the front no longer hold up real feedback behind them", async ({
  page,
}) => {
  const stuck = [
    exposure(1),
    exposure(2),
    hide(1),
    exposure(3),
    hide(2, "restore"),
    hide(3, "reason"),
  ];
  await seed(page, stuck);
  const delivered = await mockServer(page, "refuse-exposures");
  await page.goto("/tools/learning");
  await expect.poll(() => queued(page)).toBe(0);
  expect(delivered).toEqual([uuid(201), uuid(202), uuid(203)]); // every real event, in its original order
  expect(await setAside(page)).toBe(3); // the three refused exposures were set aside, not lost silently
  await expect(
    page.getByText("3 feedback operations were refused by the server and set aside"),
  ).toBeVisible();
  await expect(page.getByText(/feedback operations kept on this device/)).toHaveCount(0); // nothing is pending any more
  await expect(page.getByText(/Feedback kept on this device/)).toHaveCount(0);
});
test("discarding the set-aside operations removes only those, and the message goes away", async ({
  page,
}) => {
  await seed(page, [exposure(1), hide(1)]);
  await mockServer(page, "refuse-exposures");
  await page.goto("/tools/learning");
  await expect(
    page.getByText("1 feedback operation was refused by the server and set aside"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.getByText(/refused by the server/)).toHaveCount(0);
  expect(await setAside(page)).toBe(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Learning and evaluation" })).toBeVisible();
  await expect(page.getByText(/refused by the server/)).toHaveCount(0);
});
test("when the server is simply unavailable nothing is discarded: it all stays queued and the retry button remains", async ({
  page,
}) => {
  await seed(page, [exposure(1), hide(1), exposure(2)]);
  await mockServer(page, "offline");
  await page.goto("/tools/learning");
  await expect(page.getByText("3 feedback operations kept on this device.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry feedback sync" })).toBeVisible();
  expect(await queued(page)).toBe(3);
  expect(await setAside(page)).toBe(0);
  await expect(page.getByText(/refused by the server/)).toHaveCount(0);
});
test("after an outage ends, the queue delivers in order and clears", async ({ page }) => {
  await seed(page, [hide(1), hide(2, "restore")]);
  let up = false;
  const delivered: string[] = [];
  await page.route("**/api/learning**", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          events: 0,
          selection: { revision: 0, selected: null, history: [] },
          canTrain: true,
          job: null,
          runs: [],
          reports: [],
        },
      });
    const body = route.request().postDataJSON();
    if (body.action === "snapshot" || !up)
      return route.fulfill({ status: 503, json: { error: "down" } });
    body.events?.forEach((event: { id: string }) => delivered.push(event.id));
    return route.fulfill({ json: { ack: [] } });
  });
  await page.goto("/tools/learning");
  await expect(page.getByText("2 feedback operations kept on this device.")).toBeVisible();
  up = true;
  await page.getByRole("button", { name: "Retry feedback sync" }).click();
  await expect.poll(() => queued(page)).toBe(0);
  expect(delivered).toEqual([uuid(201), uuid(202)]);
  expect(await setAside(page)).toBe(0);
});
