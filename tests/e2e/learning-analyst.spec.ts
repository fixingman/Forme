import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { defaults } from "../../lib/catalog";
const at = new Date().toISOString(),
  hash = "fixture-development-hash";
const response = {
  schemaVersion: 1,
  packetHash: hash,
  summary: "Compare conservative River using new feedback.",
  findings: [
    {
      id: "F1",
      finding: "Development feedback is available.",
      evidenceIds: ["D1"],
      confidence: "low",
    },
  ],
  proposals: [
    {
      id: "P1",
      kind: "compare_regularization",
      candidate: "river-regularized",
      rationale: "Review the existing conservative configuration.",
      evidenceIds: ["D1"],
      testPlan: "Use new pools and later owner judgments.",
    },
  ],
  limitations: ["Development is not release validation."],
};
test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    (settings) => {
      localStorage.setItem("forme-onboarding-complete", "1");
      localStorage.setItem("forme-v2", JSON.stringify(settings));
    },
    { ...defaults, saved: [], dismissed: [], tasteFeedback: [] },
  );
  await page.route("**/api/profile", (route) => route.fulfill({ json: { sync: "off" } }));
  for (const name of ["listings", "size-profile", "local-profile", "refresh"])
    await page.route(`**/api/${name}`, (route) =>
      route.fulfill({ status: 503, json: { error: "Fixture" } }),
    );
  await page.route(
    (url) => url.pathname === "/api/learning",
    (route) =>
      route.fulfill({
        json: {
          events: 16,
          selection: { revision: 0, selected: null, history: [] },
          canTrain: true,
          job: null,
          reports: [],
          runs: [],
        },
      }),
  );
});
async function mockAnalyst(page: Page, configured = false) {
  let packet: any = null,
    reports: any[] = [],
    experiments: any[] = [],
    stale = false;
  const posts: any[] = [];
  await page.route("**/api/learning-analysis", async (route) => {
    const configuration = {
      configured,
      provider: configured ? "openai" : null,
      model: configured ? "fixture-model" : null,
      dailyUsd: 0.1,
    };
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          configuration,
          reservedUsd: 0,
          remainingUsd: 0.1,
          packets: packet ? [{ ...packet, stale }] : [],
          reports: reports.map((row) => ({ ...row, stale })),
          experiments,
          calls: [],
        },
      });
    const body = route.request().postDataJSON();
    posts.push(body);
    if (body.action === "prepare") {
      packet = {
        id: "11111111-1111-4111-8111-111111111111",
        hash,
        channel: body.channel,
        createdAt: at,
        stale: false,
        payload: {
          scope: "Development only",
          evidence: [
            { id: "D1", type: "development_scope", decisions: 16, positive: 8, styleNegative: 8 },
          ],
          limitations: [],
        },
        quote: configured
          ? {
              provider: "openai",
              model: "fixture-model",
              maxUsd: 0.02,
              maxOutputTokens: 1800,
              withinRunLimit: true,
            }
          : null,
        export: {
          app: "forme-learning-analyst",
          packetHash: hash,
          developmentEvidence: { evidence: [{ id: "D1", decisions: 16 }] },
          responseTemplate: response,
        },
      };
      return route.fulfill({ json: packet });
    }
    if (body.action === "import" || body.action === "run") {
      if (body.action === "import" && body.report === "{}")
        return route.fulfill({
          status: 400,
          json: {
            error:
              "Invalid analysis report. Use the downloaded schema, packet hash and evidence IDs.",
          },
        });
      const value = {
        id: "22222222-2222-4222-8222-222222222222",
        packetId: packet.id,
        createdAt: at,
        origin: body.action === "import" ? "imported" : "provider",
        provider: configured ? "openai" : null,
        model: configured ? "fixture-model" : null,
        stale: false,
        evidence: packet.payload.evidence,
        data: body.action === "import" ? JSON.parse(body.report) : response,
      };
      reports = [value];
      return route.fulfill({ json: value });
    }
    if (body.action === "track") {
      const experiment = {
        id: "33333333-3333-4333-8333-333333333333",
        reportId: reports[0].id,
        proposalId: "P1",
        createdAt: at,
        candidate: "river-regularized",
        channel: "shopping",
        evidence: {
          eligible: false,
          status: "insufficient-evidence",
          pairs: 0,
          days: 0,
          meanDailyGain: 0,
          lowerGain: null,
        },
      };
      experiments = [experiment];
      return route.fulfill({ json: experiment });
    }
    return route.fulfill({ status: 400, json: { error: "Unexpected action" } });
  });
  return {
    posts,
    stale: () => {
      stale = true;
    },
  };
}
async function openAnalyst(page: Page) {
  await page.goto("/tools/learning");
  await page.locator(".analyst-panel > summary").click();
  await expect(page.getByRole("button", { name: "Prepare evidence", exact: true })).toBeEnabled();
}
test("unconfigured analysis exports its packet, imports cited advice and tracks future evidence without spending or switching", async ({
  page,
}) => {
  const mock = await mockAnalyst(page);
  await openAnalyst(page);
  await expect(page.getByText("Provider not configured.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Prepare evidence", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download evidence packet", exact: true }).click();
  const path = await (await downloading).path();
  const packet = JSON.parse(await readFile(path!, "utf8"));
  expect(packet.packetHash).toBe(hash);
  expect(packet.developmentEvidence.evidence[0].id).toBe("D1");
  await page.getByRole("button", { name: "Import analyst report", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Analyst JSON", exact: true })
    .fill(JSON.stringify(response));
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Validate and import", exact: true })
    .click();
  await expect(
    page.getByText("Imported · model origin unverified", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Track future River · conservative comparison", exact: true })
    .click();
  await expect(
    page.getByText("insufficient evidence · 0 judged pairs across 0 days.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Current remains selected.", { exact: true })).toBeVisible();
  expect(mock.posts.map((row) => row.action)).toEqual(["prepare", "import", "track"]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("forme-v2")!).saved)).toEqual(
    [],
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("invalid imports show their validation error and stale advice cannot start a comparison", async ({
  page,
}) => {
  const mock = await mockAnalyst(page);
  await openAnalyst(page);
  await page.getByRole("button", { name: "Prepare evidence", exact: true }).click();
  await page.getByRole("button", { name: "Import analyst report", exact: true }).click();
  await page.getByRole("textbox", { name: "Analyst JSON", exact: true }).fill("{}");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Validate and import", exact: true })
    .click();
  await expect(page.getByText("Invalid analysis report.", { exact: false })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Analyst JSON", exact: true })
    .fill(JSON.stringify(response));
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Validate and import", exact: true })
    .click();
  mock.stale();
  await page.getByRole("button", { name: "Refresh analysis history", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Track future River · conservative comparison", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("Historical snapshot", { exact: false })).toBeVisible();
  expect(mock.posts.some((row) => row.action === "run")).toBe(false);
});
test("a configured fixture requires exact data/cost consent and never sends on preview or reload", async ({
  page,
}) => {
  const mock = await mockAnalyst(page, true);
  await openAnalyst(page);
  await page.getByRole("button", { name: "Prepare evidence", exact: true }).click();
  expect(mock.posts.filter((row) => row.action === "run")).toHaveLength(0);
  await page.getByRole("button", { name: "Review provider request", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Run analysis · up to $0.02", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Run analysis · up to $0.02", exact: true }).click();
  await expect(page.getByText("Analysis is ready.", { exact: false })).toBeVisible();
  expect(mock.posts.filter((row) => row.action === "run")).toEqual([
    {
      action: "run",
      packetId: "11111111-1111-4111-8111-111111111111",
      packetHash: hash,
      approveDataTransfer: true,
      maxUsd: 0.02,
    },
  ]);
  await page.reload();
  expect(mock.posts.filter((row) => row.action === "run")).toHaveLength(1);
});
test("analysis API rejects cross-origin, malformed and unconfigured requests without provider calls", async ({
  request,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  expect(
    (
      await request.post("/api/learning-analysis", {
        headers: { origin: "https://elsewhere.example" },
        data: { action: "prepare", channel: "shopping" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (await request.post("/api/learning-analysis", { headers: { origin, "content-type": "application/json" }, data: "null" })).status(),
  ).toBe(400);
  const prepared = await request.post("/api/learning-analysis", {
    headers: { origin },
    data: { action: "prepare", channel: "shopping" },
  });
  expect(prepared.status()).toBe(200);
  const packet = await prepared.json();
  expect(packet.quote).toBe(null);
  const run = await request.post("/api/learning-analysis", {
    headers: { origin },
    data: {
      action: "run",
      packetId: packet.id,
      packetHash: packet.hash,
      approveDataTransfer: true,
      maxUsd: 0,
    },
  });
  expect(run.status()).toBe(409);
  expect((await run.json()).error).toContain("unconfigured");
});
