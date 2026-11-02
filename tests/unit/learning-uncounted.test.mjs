import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { evaluateEvidence, LABEL_POLICY, UNCOUNTED_REASONS } from "../../lib/domain/learning.mjs";

// A save or "Not my style" hide that is not counted must say why, in the same terms the scoring uses, so the page can explain a low
// count instead of leaving the owner to dig through the journal. Real case: 190 such votes, 47 counted.
const pool = (n) => Array.from({ length: n }, (_, i) => `vinted:${100 + i}`);
const run = ({
  id = randomUUID(),
  ordinal = 1,
  cutoff = 0,
  trainingKeys = [],
  policy = LABEL_POLICY,
  keys = pool(12),
} = {}) => ({
  id,
  ordinal,
  data: {
    id,
    cutoff,
    trainingKeys,
    policy,
    engines: {
      current: { mode: "current", keys },
      river: { mode: "learned", keys },
      "river-regularized": { mode: "learned", keys },
      gorse: { mode: "learned", keys },
    },
  },
});
const exposure = (runId, keys, id = randomUUID()) => ({
  id,
  recorded_at: "2026-10-26T12:00:00Z",
  data: { runId, keys },
});
let next = 1000;
const vote = (
  key,
  { action = "dismiss", reason = "style", exposureId, brand = "Lemaire" } = {},
) => ({
  ordinal: ++next,
  data: {
    id: randomUUID(),
    key,
    action,
    channel: "shopping",
    ...(action === "dismiss" ? { reason } : {}),
    ...(exposureId ? { exposureId } : {}),
    ...(brand === null ? {} : { item: { brand } }),
  },
});
const evaluate = (events, exposures = [], runs = [], options = {}) =>
  evaluateEvidence({ events, exposures, runs, channel: "shopping", ...options });
const only = (report) =>
  Object.fromEntries(Object.entries(report.uncounted.reasons).filter(([, n]) => n));

test("a vote counts when its piece was in the ranking shown before it, and then it is not listed as uncounted", () => {
  const r = run(),
    x = exposure(r.id, pool(12));
  const report = evaluate([vote("vinted:100", { exposureId: x.id })], [x], [r]);
  assert.equal(report.counts.style, 1);
  assert.equal(report.counts.unscored, 0);
  assert.equal(report.uncounted.total, 0);
  assert.deepEqual(only(report), {});
});
test("every reason is detected on its own, with the matching explanation", () => {
  const cases = {
    noRanking: () => ({ events: [vote("vinted:100")], exposures: [], runs: [] }),
    exposureLost: () => ({
      events: [vote("vinted:100", { exposureId: randomUUID() })],
      exposures: [],
      runs: [],
    }),
    exposureLostRunMissing: () => {
      const x = exposure(randomUUID(), pool(12));
      return { events: [vote("vinted:100", { exposureId: x.id })], exposures: [x], runs: [] };
    },
    beforeRanking: () => {
      const r = run({ cutoff: 5000 }),
        x = exposure(r.id, pool(12));
      return { events: [vote("vinted:100", { exposureId: x.id })], exposures: [x], runs: [r] };
    },
    usedToTrain: () => {
      const r = run({ trainingKeys: ["vinted:100"] }),
        x = exposure(r.id, pool(12));
      return { events: [vote("vinted:100", { exposureId: x.id })], exposures: [x], runs: [r] };
    },
    notListed: () => {
      const r = run(),
        x = exposure(r.id, ["vinted:101"]);
      return { events: [vote("vinted:100", { exposureId: x.id })], exposures: [x], runs: [r] };
    },
    olderPolicy: () => {
      const r = run({ policy: "an-older-rule" }),
        x = exposure(r.id, pool(12));
      return { events: [vote("vinted:100", { exposureId: x.id })], exposures: [x], runs: [r] };
    },
  };
  const expected = {
    noRanking: "noRanking",
    exposureLost: "exposureLost",
    exposureLostRunMissing: "exposureLost",
    beforeRanking: "beforeRanking",
    usedToTrain: "usedToTrain",
    notListed: "notListed",
    olderPolicy: "olderPolicy",
  };
  for (const [name, build] of Object.entries(cases)) {
    const { events, exposures, runs } = build();
    const report = evaluate(events, exposures, runs);
    assert.equal(report.counts.unscored, 1, name);
    assert.equal(report.uncounted.total, 1, name);
    assert.deepEqual(only(report), { [expected[name]]: 1 }, name);
  }
});
test("the evaluation window is its own reason", () => {
  const r = run({ ordinal: 10 }),
    x = exposure(r.id, pool(12)),
    v = vote("vinted:100", { exposureId: x.id });
  assert.deepEqual(
    only(evaluate([v], [x], [r], { afterEventOrdinal: v.ordinal })),
    { outsideWindow: 1 },
    "an earlier vote is outside a later window",
  );
  assert.deepEqual(
    only(evaluate([v], [x], [r], { afterPredictionOrdinal: 10 })),
    { outsideWindow: 1 },
    "a ranking made before the boundary",
  );
  assert.deepEqual(
    only(evaluate([v], [x], [r], { afterPredictionOrdinal: 9 })),
    {},
    "a ranking after the boundary counts",
  );
  const noOrdinal = { ...r, ordinal: undefined };
  assert.deepEqual(
    only(evaluate([v], [x], [noOrdinal], { afterPredictionOrdinal: 5 })),
    { outsideWindow: 1 },
    "a ranking with no ordinal cannot be placed after the boundary",
  );
});
test("the reasons are checked in the scoring's own order, so one vote is never counted twice", () => {
  // no exposure beats everything; a lost exposure beats the run checks; the window beats policy; policy beats timing; timing beats training
  const r = run({ policy: "old", cutoff: 5000, trainingKeys: ["vinted:100"] }),
    x = exposure(r.id, ["vinted:101"]);
  const stages = [
    [{ ...vote("vinted:100") }, "noRanking"],
    [{ ...vote("vinted:100", { exposureId: randomUUID() }) }, "exposureLost"],
    [vote("vinted:100", { exposureId: x.id }), "olderPolicy"],
  ];
  for (const [v, why] of stages) assert.deepEqual(only(evaluate([v], [x], [r])), { [why]: 1 }, why);
  const timing = run({ cutoff: 5000, trainingKeys: ["vinted:100"] }),
    tx = exposure(timing.id, ["vinted:101"]);
  assert.deepEqual(only(evaluate([vote("vinted:100", { exposureId: tx.id })], [tx], [timing])), {
    beforeRanking: 1,
  });
  const training = run({ trainingKeys: ["vinted:100"] }),
    gx = exposure(training.id, ["vinted:101"]);
  assert.deepEqual(only(evaluate([vote("vinted:100", { exposureId: gx.id })], [gx], [training])), {
    usedToTrain: 1,
  });
});
test("counted and uncounted always add up to every save and 'Not my style' hide, and the totals match the older counters", () => {
  const r = run(),
    x = exposure(r.id, pool(12));
  const events = [
    vote("vinted:100", { exposureId: x.id }),
    vote("vinted:101", { action: "save", exposureId: x.id }),
    vote("vinted:102"),
    vote("vinted:103", { action: "save" }),
    vote("vinted:104", { exposureId: randomUUID() }),
    vote("vinted:105", { reason: "price" }),
    vote("vinted:106", { reason: "unneeded" }),
    vote("vinted:107", { reason: "unspecified" }),
  ];
  const report = evaluate(events, [x], [r]);
  const judged = report.counts.positive + report.counts.style + report.counts.unscored;
  assert.equal(
    judged,
    5,
    "two counted, three not: the three non-style hides are never judged at all",
  );
  assert.equal(report.uncounted.total, report.counts.unscored);
  assert.equal(
    Object.values(report.uncounted.reasons).reduce((a, b) => a + b, 0),
    report.uncounted.total,
  );
  assert.deepEqual(only(report), { noRanking: 2, exposureLost: 1 });
  assert.deepEqual(Object.keys(report.uncounted.reasons), UNCOUNTED_REASONS);
});
test("hides with other reasons are not 'uncounted': they were never meant to be judged", () => {
  const events = ["price", "data", "unneeded", "similar", "material", "color", "unspecified"].map(
    (reason, i) => vote(`vinted:${200 + i}`, { reason }),
  );
  const report = evaluate(events);
  assert.equal(report.uncounted.total, 0);
  assert.equal(report.counts.unscored, 0);
});
test("a restored hide or an unsaved piece is no longer a vote, so it is not reported", () => {
  const hide = vote("vinted:100"),
    restore = {
      ordinal: ++next,
      data: { id: randomUUID(), key: "vinted:100", action: "restore", channel: "shopping" },
    };
  const save = vote("vinted:101", { action: "save" }),
    unsave = {
      ordinal: ++next,
      data: { id: randomUUID(), key: "vinted:101", action: "unsave", channel: "shopping" },
    };
  assert.equal(evaluate([hide, restore, save, unsave]).uncounted.total, 0);
});
test("brands are tallied only for votes with no ranking on screen, so the page can say how many were on followed brands", () => {
  const r = run(),
    x = exposure(r.id, pool(12));
  const events = [
    vote("vinted:100", { brand: "Our Legacy" }),
    vote("vinted:101", { brand: "Our Legacy" }),
    vote("vinted:102", { brand: "Auralee", action: "save" }),
    vote("vinted:103", { brand: "Hope", exposureId: randomUUID() }),
    vote("vinted:104", { brand: "Hope", exposureId: x.id }),
  ];
  const report = evaluate(events, [x], [r]);
  assert.deepEqual(
    report.uncounted.brands,
    { "Our Legacy": 2, Auralee: 1 },
    "only the no-ranking votes; the lost exposure and the counted vote are not tallied",
  );
  assert.equal(report.uncounted.reasons.noRanking, 3);
});
test("a missing or odd brand is skipped, trimmed and bounded: the tally can never grow without limit", () => {
  const events = [
    vote("vinted:100", { brand: null }),
    vote("vinted:101", { brand: "" }),
    vote("vinted:102", { brand: "x".repeat(500) }),
  ];
  const report = evaluate(events);
  assert.equal(report.uncounted.reasons.noRanking, 3, "they are still uncounted");
  assert.deepEqual(
    Object.keys(report.uncounted.brands).map((b) => b.length),
    [100],
  );
  const many = Array.from({ length: 250 }, (_, i) =>
    vote(`vinted:${300 + i}`, { brand: `Brand ${i}` }),
  );
  const wide = evaluate([...many, vote("vinted:900", { brand: "Brand 0" })]);
  assert.equal(Object.keys(wide.uncounted.brands).length, 100, "at most 100 brands are kept");
  assert.equal(
    wide.uncounted.brands["Brand 0"],
    2,
    "a brand already kept keeps counting after the cap",
  );
  assert.equal(wide.uncounted.reasons.noRanking, 251, "while the reason total stays exact");
});
test("an empty history reports nothing uncounted, and the existing report fields are unchanged", () => {
  const report = evaluate([]);
  assert.equal(report.uncounted.total, 0);
  assert.deepEqual(only(report), {});
  assert.deepEqual(report.uncounted.brands, {});
  for (const field of ["policy", "channel", "counts", "engines", "metric", "limitations"])
    assert.ok(field in report, field);
});
