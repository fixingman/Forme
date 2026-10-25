import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { learningService } from "../../lib/server/learning.mjs";
import { learningAnalyst } from "../../lib/server/learning-analysis.mjs";
import { analysisStore } from "../../lib/server/learning-analysis-store.mjs";
import {
  analysisConfiguration,
  analysisQuote,
  requestAnalysis,
} from "../../lib/server/learning-analysis-provider.mjs";
import { validateAnalysis, developmentEvidence } from "../../lib/domain/learning-analysis.mjs";
import { evaluateEvidence, LABEL_POLICY } from "../../lib/domain/learning.mjs";
const env = {
  FORME_ANALYSIS_PROVIDER: "openai",
  FORME_ANALYSIS_MODEL: "fixture-model",
  FORME_ANALYSIS_API_KEY: "test-only",
  FORME_ANALYSIS_INPUT_USD_PER_MILLION: "1",
  FORME_ANALYSIS_OUTPUT_USD_PER_MILLION: "2",
  FORME_ANALYSIS_DAILY_USD_LIMIT: "1",
  FORME_ANALYSIS_MAX_RUN_USD: "1",
};
const profile = {
  settings: {
    following: ["Our Legacy"],
    excluded: [],
    styles: [],
    styleRules: {},
    saved: [],
    dismissed: [],
    tasteFeedback: [],
    sizing: { enabled: false, selected: [], includeOneSize: true, includeUnspecified: true },
    gender: { selected: ["men", "unisex"], includeUnknown: false },
  },
  savedListings: [],
};
function report(packet) {
  return {
    schemaVersion: 1,
    packetHash: packet.hash,
    summary: "Development judgments support a controlled comparison; quality remains uncertain.",
    findings: [
      {
        id: "finding1",
        finding: "There is development feedback to inspect.",
        evidenceIds: ["D1"],
        confidence: "low",
      },
    ],
    proposals: [
      {
        id: "proposal1",
        kind: "compare_regularization",
        candidate: "river-regularized",
        rationale: "Compare the existing conservative candidate using new feedback.",
        evidenceIds: ["D1", "M3"],
        testPlan: "Use only new frozen pools and later judgments across several days.",
      },
    ],
    limitations: ["Development evidence is not release validation."],
  };
}
async function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "forme-analyst-")),
    at = new Date(Date.now() - 3600000).toISOString();
  const items = Array.from({ length: 20 }, (_, i) => ({
    id: 66000 + i,
    source: "vinted",
    sourceId: String(66000 + i),
    sourceKey: `vinted:${66000 + i}`,
    sourceUrl: `https://www.vinted.se/items/${66000 + i}-private`,
    brand: "Auralee",
    title: `PRIVATE TITLE ${i % 2 ? "black wool jacket" : "blue cotton shirt"}`,
    price: 500,
    currency: "SEK",
    size: "M",
    gender: "men",
    genderSource: "provider",
    condition: "Good",
    image: "",
    imageUrl: "https://images1.vinted.net/private.webp",
    category: "",
    style: "",
    rarity: 0,
    age: 1,
    fetchedAt: at,
  }));
  const rank = async (_root, directory) => {
    const { readFileSync } = await import("node:fs");
    const input = JSON.parse(readFileSync(join(directory, "input.json"))).case;
    return Object.fromEntries(
      ["river", "river-regularized", "gorse"].map((name) => [
        name,
        {
          mode:
            name === "gorse"
              ? "tags-and-factorization-machines"
              : "weighted-online-logistic-replayed-10-passes",
          ranking: [...input.candidateKeys].reverse().map((key) => ({ key, score: 1 })),
        },
      ]),
    );
  };
  const learning = learningService({ root, auto: false, rank }),
    vote = (item, index) => ({
      id: randomUUID(),
      key: item.sourceKey,
      item,
      channel: "shopping",
      action: index % 2 ? "dismiss" : "save",
      reason: "style",
      occurredAt: at,
    });
  try {
    await learning.snapshot(profile, items);
    await learning.ingest(items.slice(0, 8).map(vote));
    await learning.train();
    const prediction = await learning.snapshot(profile, items),
      exposure = {
        id: randomUUID(),
        runId: prediction.id,
        channel: "shopping",
        keys: items.slice(8, 16).map((item) => item.sourceKey),
      };
    await learning.exposure(exposure);
    await learning.ingest(
      items.slice(8, 16).map((item, index) => ({ ...vote(item, index), exposureId: exposure.id })),
    );
    await learning.train();
    await run({
      root,
      items,
      learning,
      vote,
      analyst: (options) =>
        learningAnalyst({ root, history: () => learning.exportHistory(), env: {}, ...options }),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test("development packet omits private content and future validation; corrected training judgments are withdrawn", async () =>
  fixture(async ({ learning, items, vote, analyst }) => {
    await learning.ingest([vote(items[18], 0)]);
    const service = analyst(),
      packet = await service.prepare("shopping"),
      wire = JSON.stringify(packet.export);
    assert.equal(packet.payload.evidence[0].decisions, 16);
    assert.equal(packet.quote, null);
    for (const privateValue of [
      "PRIVATE TITLE",
      "Auralee",
      "vinted:",
      "https://",
      "@",
      "sourceUrl",
      "imageUrl",
      "66018",
    ])
      assert.ok(!wire.includes(privateValue), privateValue);
    assert.equal(packet.fingerprint, undefined);
    assert.equal(packet.references, undefined);
    assert.ok(packet.payload.evidence.some((row) => row.id.startsWith("C") && row.pool));
    await learning.ingest([
      {
        id: randomUUID(),
        key: items[0].sourceKey,
        channel: "shopping",
        action: "unsave",
        occurredAt: new Date().toISOString(),
      },
    ]);
    const updated = developmentEvidence(await learning.exportHistory(), "shopping");
    assert.equal(updated.payload.evidence[0].decisions, 15);
    assert.equal((await service.status()).packets[0].stale, true);
  }));
test("unconfigured analyst exports/imports without requests; validates citations and tracks only future comparisons", async () =>
  fixture(async ({ learning, analyst }) => {
    let calls = 0;
    const service = analyst({
        request: async () => {
          calls++;
          throw Error("must not call");
        },
      }),
      packet = await service.prepare("shopping");
    await assert.rejects(service.run({ packetId: packet.id }), /unconfigured/);
    assert.equal(calls, 0);
    assert.throws(
      () => validateAnalysis({ ...report(packet), packetHash: "wrong" }, packet),
      /Invalid/,
    );
    const wrong = report(packet);
    wrong.findings[0].evidenceIds = ["made-up"];
    assert.throws(() => validateAnalysis(wrong, packet), /Invalid/);
    assert.throws(
      () => validateAnalysis({ ...report(packet), selectEngine: "river" }, packet),
      /Invalid/,
    );
    const imported = await service.importReport({ packetId: packet.id, report: report(packet) });
    assert.equal(imported.origin, "imported");
    assert.equal(
      (await service.importReport({ packetId: packet.id, report: report(packet) })).id,
      imported.id,
    );
    const experiment = await service.track({ reportId: imported.id, proposalId: "proposal1" });
    const history = await learning.exportHistory();
    assert.equal(experiment.eventCutoff, history.events.at(-1).ordinal);
    assert.equal(experiment.predictionCutoff, history.runs.at(-1).ordinal);
    const status = await service.status();
    assert.equal(status.experiments[0].evidence.pairs, 0);
    assert.equal(history.selection.selected, null);
    assert.equal(calls, 0);
  }));
test("stale advice stays historical and cannot start an experiment or provider call", async () =>
  fixture(async ({ learning, items, vote, analyst }) => {
    const service = analyst({ env }),
      packet = await service.prepare("shopping"),
      saved = await service.importReport({ packetId: packet.id, report: report(packet) });
    await learning.ingest([vote(items[19], 0)]);
    await assert.rejects(
      service.track({ reportId: saved.id, proposalId: "proposal1" }),
      /historical/,
    );
    await assert.rejects(
      service.run({
        packetId: packet.id,
        packetHash: packet.hash,
        maxUsd: packet.quote.maxUsd,
        approveDataTransfer: true,
      }),
      /changed/,
    );
    assert.equal((await service.status()).calls.length, 0);
  }));
test("a provider attempt is reserved once, idempotent after success, and cannot alter selection", async () =>
  fixture(async ({ learning, analyst }) => {
    let count = 0,
      release;
    const wait = new Promise((resolve) => {
      release = resolve;
    });
    const service = analyst({
        env,
        request: async (packet) => {
          count++;
          await wait;
          return {
            text: JSON.stringify(report(packet)),
            usage: { inputTokens: 100, outputTokens: 200 },
          };
        },
      }),
      packet = await service.prepare("shopping");
    const input = {
      packetId: packet.id,
      packetHash: packet.hash,
      maxUsd: packet.quote.maxUsd,
      approveDataTransfer: true,
    };
    const pending = service.run(input);
    while (count === 0) await new Promise((resolve) => setTimeout(resolve, 1));
    await assert.rejects(service.run(input), /already/);
    assert.equal(count, 1);
    release();
    const result = await pending;
    assert.equal((await service.run(input)).id, result.id);
    assert.equal(count, 1);
    const status = await service.status();
    assert.equal(status.calls[0].status, "complete");
    assert.equal((await learning.exportHistory()).selection.selected, null);
  }));
test("unknown billing keeps reservations through deletion and blocks spending beyond the daily cap", async () =>
  fixture(async ({ root, learning, analyst }) => {
    const initial = analyst({ env }),
      quote = (await initial.prepare("shopping")).quote;
    const capped = { ...env, FORME_ANALYSIS_DAILY_USD_LIMIT: String(quote.maxUsd + 0.000001) };
    let count = 0;
    const service = analyst({
        env: capped,
        request: async () => {
          count++;
          throw Error("private credential error text");
        },
      }),
      packet = await service.prepare("shopping");
    await assert.rejects(
      service.run({
        packetId: packet.id,
        packetHash: packet.hash,
        maxUsd: packet.quote.maxUsd,
        approveDataTransfer: true,
      }),
      (error) => !error.message.includes("credential") && /may be billed/.test(error.message),
    );
    assert.equal((await service.status()).calls[0].status, "uncertain");
    const next = await service.prepare("shopping");
    await assert.rejects(
      service.run({
        packetId: next.id,
        packetHash: next.hash,
        maxUsd: next.quote.maxUsd,
        approveDataTransfer: true,
      }),
      /budget/,
    );
    assert.equal(count, 1);
    await learning.clear("DELETE LEARNING HISTORY");
    const cleared = await service.status();
    assert.equal(cleared.packets.length, 0);
    assert.equal(cleared.reports.length, 0);
    assert.equal(cleared.calls.length, 1);
    assert.ok(cleared.reservedUsd > 0);
    const foreign = analysisStore(root, "foreign");
    assert.equal(foreign.export().calls.length, 0);
    foreign.close();
  }));
test("direct API adapters use fixed official endpoints, structured output and one request; errors are not retried", async () => {
  const packet = { hash: "fixture-hash", payload: { evidence: [] } };
  assert.equal(
    analysisConfiguration({
      ANTHROPIC_BASE_URL: "http://untrusted.example",
      OPENAI_API_KEY: "test-only",
    }).configured,
    false,
  );
  for (const provider of ["openai", "anthropic"]) {
    let calls = 0;
    const config = analysisConfiguration({ ...env, FORME_ANALYSIS_PROVIDER: provider });
    const value = await requestAnalysis(packet, config, {
      env,
      fetchImpl: async (url, options) => {
        calls++;
        assert.equal(
          url,
          provider === "openai"
            ? "https://api.openai.com/v1/responses"
            : "https://api.anthropic.com/v1/messages",
        );
        const body = JSON.parse(options.body);
        assert.equal(body.tools, undefined);
        assert.equal(body.model, "fixture-model");
        if (provider === "openai") {
          assert.equal(body.store, false);
          assert.equal(body.text.format.strict, true);
        } else assert.equal(body.output_config.format.type, "json_schema");
        return Response.json(
          provider === "openai"
            ? {
                status: "completed",
                output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }],
                usage: { input_tokens: 2, output_tokens: 3 },
              }
            : {
                stop_reason: "end_turn",
                content: [{ type: "text", text: "{}" }],
                usage: { input_tokens: 2, output_tokens: 3 },
              },
        );
      },
    });
    assert.equal(value.text, "{}");
    assert.deepEqual(value.usage, { inputTokens: 2, outputTokens: 3 });
    assert.equal(calls, 1);
    await assert.rejects(
      requestAnalysis(packet, config, {
        env,
        fetchImpl: async () => {
          calls++;
          return Response.json({}, { status: 429 });
        },
      }),
      /no retry/,
    );
    assert.equal(calls, 2);
    assert.ok(analysisQuote(packet, config).maxUsd > 0);
  }
});
test("provider execution requires exact consent/configuration and reserves nothing when rejected", async () =>
  fixture(async ({ analyst }) => {
    let count = 0;
    const settings = { ...env },
      service = analyst({
        env: settings,
        request: async () => {
          count++;
          throw Error("unexpected");
        },
      }),
      packet = await service.prepare("shopping");
    const input = {
      packetId: packet.id,
      packetHash: packet.hash,
      maxUsd: packet.quote.maxUsd,
      approveDataTransfer: true,
    };
    await assert.rejects(service.run({ ...input, approveDataTransfer: false }), /Approve/);
    await assert.rejects(service.run({ ...input, maxUsd: 0 }), /Approve/);
    settings.FORME_ANALYSIS_MODEL = "different-fixture-model";
    await assert.rejects(service.run(input), /configuration changed/);
    assert.equal(count, 0);
    assert.equal((await service.status()).calls.length, 0);
  }));
test("experiment reports exclude all old predictions/judgments and count genuinely later evidence", () => {
  const events = [],
    exposures = [],
    runs = [];
  let ordinal = 0;
  function add(day) {
    const keys = Array.from({ length: 4 }, (_, i) => `vinted:${70000 + day * 10 + i}`),
      id = randomUUID(),
      exposureId = randomUUID(),
      cutoff = ordinal;
    runs.push({
      id,
      ordinal: ++ordinal,
      data: {
        id,
        cutoff,
        trainingKeys: [],
        policy: LABEL_POLICY,
        engines: {
          current: { mode: "current", keys: [...keys].reverse() },
          river: { mode: "learned", keys },
        },
      },
    });
    exposures.push({
      id: exposureId,
      ordinal: ++ordinal,
      recorded_at: `2026-10-${String(day).padStart(2, "0")}T12:00:00Z`,
      data: { runId: id, keys },
    });
    keys.forEach((key, i) =>
      events.push({
        ordinal: ++ordinal,
        data: {
          id: randomUUID(),
          channel: "shopping",
          key,
          action: i < 2 ? "save" : "dismiss",
          reason: "style",
          exposureId,
        },
      }),
    );
  }
  for (let day = 1; day <= 5; day++) add(day);
  assert.equal(
    evaluateEvidence({ events, exposures, runs, channel: "shopping" }).engines.river.eligible,
    true,
  );
  const boundary = { afterEventOrdinal: ordinal, afterPredictionOrdinal: runs.at(-1).ordinal };
  assert.equal(
    evaluateEvidence({ events, exposures, runs, channel: "shopping", ...boundary }).engines.river
      .pairs,
    0,
  );
  for (let day = 6; day <= 10; day++) add(day);
  const future = evaluateEvidence({ events, exposures, runs, channel: "shopping", ...boundary })
    .engines.river;
  assert.equal(future.eligible, true);
  assert.equal(future.pairs, 20);
  assert.equal(future.days, 5);
  assert.equal(future.positive + future.negative, 20);
});
