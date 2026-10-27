import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  evaluateEvidence,
  LABEL_POLICY,
  DISLIKE_MIN_POOL,
  DISLIKE_MIN_HIDES,
  DISLIKE_MIN_DAYS,
} from "../../lib/domain/learning.mjs";

// The dislike-ranking route: where a candidate placed the pieces you went on to hide, among the pieces it had not trained on.
// Position is the fraction of the pool ranked above the piece (0 = top, 1 = bottom). Everything here is a synthetic frozen ranking, so
// every expected number is known in advance. Nothing runs a model.
const POOL = 30;
const keysFor = (day) => Array.from({ length: POOL }, (_, i) => `vinted:${day * 100 + i}`);
/**
 * One frozen ranking per day. Current lists the pool in order, so the pieces hidden that day (its first `hidden` keys, i.e. the
 * ones you saw at the top and judged) sit at positions 0..hidden-1. `order(keys, hiddenKeys)` is the candidate's order.
 */
function build({
  days = 5,
  hidden = 5,
  order,
  mode = "learned",
  reason = "style",
  trainingKeys = () => [],
  voteBeforeRun = false,
  pool = POOL,
  partial = false,
  perDayOrder,
}) {
  const events = [],
    exposures = [],
    runs = [];
  let ordinal = 0;
  for (let day = 1; day <= days; day++) {
    const keys = keysFor(day).slice(0, pool),
      hiddenKeys = keys.slice(0, hidden),
      id = randomUUID(),
      exposureId = randomUUID(),
      pick = perDayOrder ? perDayOrder(day) : order;
    let candidate = pick(keys, hiddenKeys);
    if (partial) candidate = candidate.slice(0, Math.floor(candidate.length / 2));
    runs.push({
      id,
      ordinal: ++ordinal,
      data: {
        id,
        cutoff: voteBeforeRun ? 1_000_000 : ordinal,
        trainingKeys: trainingKeys(keys),
        policy: LABEL_POLICY,
        engines: {
          current: { mode: "current", keys },
          river: { mode, keys: candidate },
          "river-regularized": { mode: "fallback", keys: candidate },
          gorse: { mode: "unavailable", keys: candidate },
        },
      },
    });
    exposures.push({
      id: exposureId,
      recorded_at: `2026-10-${String(day).padStart(2, "0")}T12:00:00Z`,
      data: { runId: id, keys },
    });
    for (const key of hiddenKeys)
      events.push({
        ordinal: 10_001 + ++ordinal,
        data: {
          id: randomUUID(),
          key,
          action: "dismiss",
          channel: "shopping",
          reason,
          exposureId,
        },
      });
  }
  return { events, exposures, runs };
}
const evaluate = (fixture, channel = "shopping") => evaluateEvidence({ ...fixture, channel });
const river = (fixture) => evaluate(fixture).engines.river;
// Orders for the candidate.
const hiddenLast = (keys, hiddenKeys) => [
  ...keys.filter((k) => !hiddenKeys.includes(k)),
  ...hiddenKeys,
];
const sameAsCurrent = (keys) => [...keys];
const hiddenMiddle = (keys, hiddenKeys) => {
  // hidden pieces occupy positions 12..16 of 30: mean position 14/29 = 0.483, a little below the middle
  const rest = keys.filter((k) => !hiddenKeys.includes(k));
  return [...rest.slice(0, 12), ...hiddenKeys, ...rest.slice(12)];
};

test("a candidate that pushes disliked pieces to the bottom is eligible on dislikes alone, with no saves at all", () => {
  const result = river(build({ order: hiddenLast }));
  assert.equal(result.pairs, 0, "there are no saves, so the pair route has nothing");
  assert.equal(result.eligible, true);
  assert.equal(result.route, "dislikes");
  assert.equal(result.status, "ready-for-review");
  const d = result.dislikes;
  assert.equal(d.hides, 25);
  assert.equal(d.days, 5);
  // hidden pieces at positions 25..29 of 30 for the candidate (mean 27/29), and 0..4 for Current (mean 2/29)
  assert.ok(Math.abs(d.meanPosition - 27 / 29) < 1e-9, String(d.meanPosition));
  assert.ok(Math.abs(d.currentPosition - 2 / 29) < 1e-9, String(d.currentPosition));
  assert.ok(Math.abs(d.meanGain - 25 / 29) < 1e-9);
  assert.ok(d.lowerPosition > 0.5 && d.lowerGain > 0);
});
test("beating Current is not enough: a reshuffle that lands disliked pieces in the middle of the pool is refused", () => {
  const result = river(build({ order: hiddenMiddle }));
  const d = result.dislikes;
  assert.ok(d.meanGain > 0.3, `it does beat Current by a lot (${d.meanGain})`);
  assert.ok(Math.abs(d.meanPosition - 0.5) < 0.06, `but sits about mid-pool (${d.meanPosition})`);
  assert.equal(d.eligible, false);
  assert.equal(result.eligible, false);
  assert.equal(result.route, null);
  assert.equal(
    result.status,
    "no-demonstrated-improvement",
    "enough evidence to judge, and it is not good enough",
  );
});
test("a candidate that ranks like Current gains nothing and is refused", () => {
  const result = river(build({ order: sameAsCurrent }));
  assert.ok(Math.abs(result.dislikes.meanGain) < 1e-9);
  assert.ok(result.dislikes.meanPosition < 0.2);
  assert.equal(result.eligible, false);
});
test("a candidate only just above Current is refused even when it is above the middle", () => {
  // Current already puts them at the bottom (it is good at this); the candidate matches it, moving one piece up a place.
  const fixture = build({ order: hiddenLast });
  for (const run of fixture.runs) {
    const keys = run.data.engines.current.keys,
      bottom = hiddenLast(keys, keys.slice(0, 5));
    run.data.engines.current.keys = bottom;
    const swapped = [...bottom];
    [swapped[27], swapped[28]] = [swapped[28], swapped[27]];
    run.data.engines.river.keys = swapped;
  }
  const d = river(fixture).dislikes;
  assert.ok(d.meanPosition > 0.8, `above the middle (${d.meanPosition})`);
  assert.ok(d.lowerPosition > 0.5, "so the first condition alone would pass");
  assert.ok(
    Math.abs(d.meanGain) < 0.05,
    `but it gains almost nothing over Current (${d.meanGain})`,
  );
  assert.equal(d.eligible, false);
  assert.equal(river(fixture).eligible, false);
});
test("a tiny gain is refused even when it is perfectly steady, because a zero-variance bound would otherwise let it through", () => {
  // Current puts the hidden pieces at positions 24..28; the candidate moves exactly one of them one place lower, every day.
  const fixture = build({ order: hiddenLast });
  for (const run of fixture.runs) {
    const keys = run.data.engines.current.keys,
      hiddenKeys = keys.slice(0, 5),
      rest = keys.filter((k) => !hiddenKeys.includes(k)),
      current = [...rest.slice(0, 24), ...hiddenKeys, rest[24]];
    run.data.engines.current.keys = current;
    const candidate = [...current];
    [candidate[28], candidate[29]] = [candidate[29], candidate[28]];
    run.data.engines.river.keys = candidate;
  }
  const d = river(fixture).dislikes;
  assert.ok(d.meanGain > 0 && d.meanGain < 0.01, `a real but tiny gain (${d.meanGain})`);
  assert.ok(d.lowerGain > 0, "and with no day-to-day variation its lower bound is above zero");
  assert.ok(d.lowerPosition > 0.5);
  assert.equal(d.eligible, false, "so only the minimum-gain rule keeps it out");
});
test("the same breadth as the pair route is required: enough days and enough distinct pieces", () => {
  assert.equal(DISLIKE_MIN_DAYS, 5);
  assert.equal(DISLIKE_MIN_HIDES, 20);
  assert.equal(DISLIKE_MIN_POOL, 10);
  const fourDays = river(build({ order: hiddenLast, days: 4, hidden: 8 })).dislikes;
  assert.equal(fourDays.hides, 32);
  assert.equal(fourDays.lowerPosition, null, "no interval below five days");
  assert.equal(fourDays.eligible, false);
  assert.equal(
    river(build({ order: hiddenLast, days: 4, hidden: 8 })).status,
    "insufficient-evidence",
  );
  const fewPieces = river(build({ order: hiddenLast, days: 5, hidden: 3 }));
  assert.equal(fewPieces.dislikes.hides, 15);
  assert.equal(fewPieces.eligible, false);
  assert.equal(fewPieces.status, "insufficient-evidence");
  assert.equal(
    river(build({ order: hiddenLast, days: 5, hidden: 4 })).eligible,
    true,
    "exactly 20 pieces over 5 days is enough",
  );
});
test("many hides on one day are one day of evidence, not many", () => {
  const result = river(build({ order: hiddenLast, days: 1, hidden: 25 }));
  assert.equal(result.dislikes.hides, 25);
  assert.equal(result.dislikes.days, 1);
  assert.equal(result.eligible, false);
});
test("an erratic candidate is refused even when its average is good: the day-level bound must clear the middle", () => {
  // Good on some days, bad on others: mean above the middle, lower bound below it.
  const day = { 1: hiddenLast, 2: sameAsCurrent, 3: hiddenLast, 4: sameAsCurrent, 5: hiddenLast };
  const d = river(build({ perDayOrder: (n) => day[n] })).dislikes;
  assert.ok(d.meanPosition > 0.5, `mean ${d.meanPosition}`);
  assert.ok(d.lowerPosition <= 0.5, `lower ${d.lowerPosition}`);
  assert.equal(d.eligible, false);
});
test("pieces the candidate trained on are left out of the pool, so training cannot flatter it", () => {
  // The candidate trained on the 5 pieces at the very bottom of Current's order and pushes them to the top.
  const fixture = build({ order: hiddenLast, trainingKeys: (keys) => keys.slice(-5) });
  const clean = river(fixture).dislikes;
  assert.equal(clean.hides, 25);
  // pool is 25, not 30: hidden pieces sit at positions 20..24 of 25 for the candidate
  assert.ok(Math.abs(clean.meanPosition - 22 / 24) < 1e-9, String(clean.meanPosition));
  // a hidden piece that was itself a training example is not a test: it is unscored, never counted
  const leaked = build({ order: hiddenLast, trainingKeys: (keys) => keys.slice(0, 5) });
  const result = evaluate(leaked);
  assert.equal(result.engines.river.dislikes.hides, 0);
  assert.equal(result.counts.unscored, 25);
  assert.equal(result.engines.river.eligible, false);
});
test("only 'Not my style' hides are judged: price, colour and other reasons never count", () => {
  for (const reason of [
    "price",
    "color",
    "material",
    "unneeded",
    "similar",
    "data",
    "fit",
    "unspecified",
  ]) {
    const result = evaluate(build({ order: hiddenLast, reason }));
    assert.equal(result.engines.river.dislikes.hides, 0, reason);
    assert.equal(result.engines.river.eligible, false, reason);
  }
});
test("a vote cast before the ranking was frozen is never a test", () => {
  const result = evaluate(build({ order: hiddenLast, voteBeforeRun: true }));
  assert.equal(result.engines.river.dislikes.hides, 0);
  assert.equal(result.counts.unscored, 25);
});
test("only candidates that were actually available are judged", () => {
  for (const mode of ["unavailable", "fallback"]) {
    const result = river(build({ order: hiddenLast, mode }));
    assert.equal(result.dislikes.hides, 0, mode);
    assert.equal(result.eligible, false, mode);
  }
});
test("a pool too small to place anything fairly, or a candidate that did not rank the whole pool, is skipped, not guessed", () => {
  assert.equal(river(build({ order: hiddenLast, pool: DISLIKE_MIN_POOL - 1 })).dislikes.hides, 0);
  assert.equal(
    river(build({ order: hiddenLast, pool: DISLIKE_MIN_POOL, hidden: 4 })).dislikes.hides > 0,
    true,
  );
  const partial = river(build({ order: hiddenLast, partial: true }));
  assert.equal(partial.dislikes.hides, 0);
  assert.equal(partial.eligible, false);
});
test("Current is reported for reference but can never be eligible", () => {
  const result = evaluate(build({ order: hiddenLast })).engines.current;
  assert.equal(result.eligible, false);
  assert.equal(result.dislikes.eligible, false);
  assert.ok(Math.abs(result.dislikes.meanGain) < 1e-9, "Current against itself gains nothing");
});
test("the pair route still works exactly as before, and reports its own route", () => {
  // The existing five-day fixture shape: 2 saves + 2 style hides per day in a 4-piece pool (too small for the dislike route).
  const events = [],
    exposures = [],
    runs = [];
  let ordinal = 0;
  for (let day = 1; day <= 5; day++) {
    const keys = Array.from({ length: 4 }, (_, i) => `vinted:${day * 10 + i}`),
      id = randomUUID(),
      exposureId = randomUUID();
    runs.push({
      id,
      data: {
        id,
        cutoff: ordinal,
        trainingKeys: [],
        policy: LABEL_POLICY,
        engines: {
          current: { mode: "current", keys: [...keys].reverse() },
          river: { mode: "learned", keys },
          "river-regularized": { mode: "fallback", keys },
          gorse: { mode: "unavailable", keys },
        },
      },
    });
    exposures.push({
      id: exposureId,
      recorded_at: `2026-10-0${day}T12:00:00Z`,
      data: { runId: id, keys },
    });
    keys.forEach((key, i) =>
      events.push({
        ordinal: ++ordinal,
        data: {
          id: randomUUID(),
          key,
          action: i < 2 ? "save" : "dismiss",
          channel: "shopping",
          reason: "style",
          exposureId,
        },
      }),
    );
  }
  const result = evaluateEvidence({ events, exposures, runs, channel: "shopping" }).engines.river;
  assert.equal(result.pairs, 20);
  assert.equal(result.eligible, true);
  assert.equal(result.route, "pairs");
  assert.equal(result.dislikes.hides, 0, "a 4-piece pool is below the dislike route's minimum");
});
test("the report states the exposure-selection limit in plain words", () => {
  const report = evaluate(build({ order: hiddenLast }));
  assert.ok(report.limitations.some((text) => /seen near the top of Current's order/.test(text)));
  assert.match(report.metric, /unjudged items are not negatives/);
});
