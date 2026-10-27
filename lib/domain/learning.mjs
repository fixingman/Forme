// Versioned semantics shared by ingestion, training and evaluation. No provider calls.
export const LABEL_POLICY = "reason-aware-v1";
export { REASONS, REASON_LABELS } from "./dislike-reasons.mjs";
export const ENGINE_IDS = ["current", "river", "river-regularized", "gorse"];
export const validId = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export const validKey = (value) => typeof value === "string" && /^vinted:\d{1,18}$/.test(value);
export class LearningError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function activeFeedback(records, channel = "shopping") {
  const states = new Map();
  for (const row of records) {
    const e = row.data ?? row;
    if (e.channel !== channel) continue;
    const previous = states.get(e.key) ?? {
      saved: false,
      hidden: false,
      reason: "unspecified",
      saveTouched: false,
      hideTouched: false,
    };
    if (e.action === "save")
      states.set(e.key, {
        ...previous,
        saved: true,
        saveTouched: true,
        saveEvent: { ...e, ordinal: row.ordinal },
      });
    if (e.action === "unsave") states.set(e.key, { ...previous, saved: false, saveTouched: true });
    if (e.action === "dismiss")
      states.set(e.key, {
        ...previous,
        hidden: true,
        hideTouched: true,
        reason: e.reason ?? "unspecified",
        hideEvent: { ...e, ordinal: row.ordinal },
      });
    if (e.action === "restore")
      states.set(e.key, { ...previous, hidden: false, reason: "unspecified" });
    if (e.action === "reason" && previous.hidden && previous.hideEvent?.id === e.targetId)
      states.set(e.key, { ...previous, reason: e.reason });
  }
  return new Map(
    [...states].map(([key, state]) => {
      const event = state.hidden ? state.hideEvent : state.saveEvent;
      return [
        key,
        {
          ...state,
          item: event?.item,
          exposureId: event?.exposureId,
          ordinal: event?.ordinal,
          eventId: event?.id,
        },
      ];
    }),
  );
}
export function trainingExamples(records, channel) {
  return [...activeFeedback(records, channel)].flatMap(([key, row]) =>
    row.item && (row.hidden ? row.reason === "style" : row.saved)
      ? [{ key, item: row.item, label: row.hidden ? 0 : 1, eventId: row.eventId }]
      : [],
  );
}
export function tasteFeatures(features) {
  return Object.fromEntries(
    Object.entries(features).filter(
      ([name]) => !name.startsWith("price:") && !name.startsWith("price-"),
    ),
  );
}
// Only apply a verified ordering to the application's existing eligible IDs. Unknown/missing
// predictions remain in Current order and are disclosed as partial, never bypassing filters.
export function orderEligible(entries, keys = []) {
  const byKey = new Map(entries.map((entry) => [entry.item.sourceKey, entry]));
  return [
    ...[...new Set(keys)].flatMap((key) => (byKey.has(key) ? [byKey.get(key)] : [])),
    ...entries.filter((entry) => !keys.includes(entry.item.sourceKey)),
  ];
}
/**
 * The dislike-ranking route. Pairs need a save and a "Not my style" hide in the same frozen ranking, and saves are rare. Hides are
 * plentiful, so this route asks a different question of them: where did each candidate place a piece you went on to hide, among
 * the pieces it had not trained on? Position is the fraction of that pool ranked above the piece (0 = top, 1 = bottom), so a
 * higher number means the candidate pushed it further down. Two guards keep it honest. First, the pieces you hid were seen near
 * the top of Current's order (that is how you came to judge them), so "lower than Current" alone would reward a mere reshuffle;
 * a candidate must also place them below the middle of the pool. Second, it needs the same breadth as the pair route: enough
 * distinct pieces, spread over enough days, with the conservative day-level bound above zero.
 */
export const DISLIKE_MIN_POOL = 10;
export const DISLIKE_MIN_HIDES = 20;
export const DISLIKE_MIN_DAYS = 5;
const T_BOUND = 2.776;
const meanOf = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const lowerBound = (values) => {
  if (values.length < DISLIKE_MIN_DAYS) return null;
  const mean = meanOf(values),
    variance = values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (values.length - 1);
  return mean - T_BOUND * Math.sqrt(variance / values.length);
};
function dislikeRoute(engine, blocks) {
  const daily = new Map(),
    hides = new Set();
  for (const bucket of blocks.values()) {
    const model = bucket.run.engines[engine],
      baseline = bucket.run.engines.current;
    if (!model || !baseline || !["learned", "current"].includes(model.mode)) continue;
    const trained = new Set(bucket.run.trainingKeys ?? []),
      pool = new Set(baseline.keys.filter((key) => !trained.has(key)));
    if (pool.size < DISLIKE_MIN_POOL) continue;
    const place = (keys) => new Map(keys.filter((key) => pool.has(key)).map((key, i) => [key, i])),
      byModel = place(model.keys),
      byCurrent = place(baseline.keys);
    // A candidate that did not rank the whole pool cannot be placed fairly: skip it rather than guess.
    if (byModel.size < pool.size) continue;
    for (const [key, label] of bucket.labels) {
      if (label !== 0 || !byModel.has(key) || !byCurrent.has(key)) continue;
      const day = daily.get(bucket.block) ?? { model: 0, current: 0, n: 0 };
      day.model += byModel.get(key) / (pool.size - 1);
      day.current += byCurrent.get(key) / (pool.size - 1);
      day.n++;
      daily.set(bucket.block, day);
      hides.add(key);
    }
  }
  const days = [...daily.values()],
    position = days.map((day) => day.model / day.n),
    gain = days.map((day) => (day.model - day.current) / day.n),
    meanPosition = meanOf(position),
    meanGain = meanOf(gain),
    lowerPosition = lowerBound(position),
    lowerGain = lowerBound(gain),
    sufficient = hides.size >= DISLIKE_MIN_HIDES && days.length >= DISLIKE_MIN_DAYS,
    eligible =
      engine !== "current" &&
      sufficient &&
      lowerPosition !== null &&
      lowerPosition > 0.5 &&
      meanGain >= 0.05 &&
      lowerGain !== null &&
      lowerGain > 0;
  return {
    hides: hides.size,
    days: days.length,
    meanPosition: days.length ? meanPosition : null,
    currentPosition: days.length ? meanOf(days.map((day) => day.current / day.n)) : null,
    meanGain,
    lowerPosition,
    lowerGain,
    sufficient,
    eligible,
  };
}
export function evaluateEvidence({
  events,
  exposures,
  runs,
  channel = "preview",
  afterEventOrdinal = 0,
  afterPredictionOrdinal = 0,
}) {
  const states = activeFeedback(events, channel),
    byExposure = new Map(exposures.map((r) => [r.id, r])),
    byRun = new Map(runs.map((r) => [r.id, r]));
  const blocks = new Map(),
    counts = {
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
    };
  for (const [key, state] of states) {
    if (!state.hidden && !state.saved) continue;
    if (state.hidden && state.reason !== "style") {
      counts[state.reason === "unspecified" ? "unknown" : state.reason]++;
      continue;
    }
    const exposure = byExposure.get(state.exposureId),
      run = exposure && byRun.get(exposure.data.runId);
    if (
      !run ||
      state.ordinal <= afterEventOrdinal ||
      (afterPredictionOrdinal > 0 &&
        (!Number.isSafeInteger(run.ordinal) || run.ordinal <= afterPredictionOrdinal)) ||
      run.data.policy !== LABEL_POLICY ||
      run.data.cutoff >= state.ordinal ||
      run.data.trainingKeys.includes(key) ||
      !exposure.data.keys.includes(key)
    ) {
      counts.unscored++;
      continue;
    }
    const label = state.hidden ? 0 : 1;
    counts[label ? "positive" : "style"]++;
    const block = String(exposure.recorded_at).slice(0, 10),
      bucketKey = block + "|" + run.id;
    if (!blocks.has(bucketKey)) blocks.set(bucketKey, { block, run: run.data, labels: new Map() });
    blocks.get(bucketKey).labels.set(key, label);
  }
  const results = {};
  for (const engine of ENGINE_IDS) {
    const daily = new Map(),
      judgedPositive = new Set(),
      judgedNegative = new Set();
    let pairs = 0,
      wins = 0,
      baselineWins = 0;
    for (const bucket of blocks.values()) {
      const model = bucket.run.engines[engine],
        baseline = bucket.run.engines.current;
      if (!model || !["learned", "current"].includes(model.mode)) continue;
      const rank = new Map(model.keys.map((key, i) => [key, i])),
        current = new Map(baseline.keys.map((key, i) => [key, i]));
      const positive = [...bucket.labels].filter(([, label]) => label === 1),
        negative = [...bucket.labels].filter(([, label]) => label === 0);
      for (const [p] of positive)
        for (const [n] of negative) {
          if (!rank.has(p) || !rank.has(n) || !current.has(p) || !current.has(n)) continue;
          judgedPositive.add(p);
          judgedNegative.add(n);
          const hit = Number(rank.get(p) < rank.get(n)),
            base = Number(current.get(p) < current.get(n));
          pairs++;
          wins += hit;
          baselineWins += base;
          const day = daily.get(bucket.block) ?? { delta: 0, pairs: 0 };
          day.delta += hit - base;
          day.pairs++;
          daily.set(bucket.block, day);
        }
    }
    const deltas = [...daily.values()].map((day) => day.delta / day.pairs),
      mean = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
    // Conservative, transparent initial screen: clustered day-level normal interval. Small samples
    // remain inconclusive; this is not a population estimate or a calibrated taste percentage.
    const variance =
      deltas.length > 1
        ? deltas.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (deltas.length - 1)
        : 0;
    const lower = deltas.length >= 5 ? mean - 2.776 * Math.sqrt(variance / deltas.length) : null;
    const sufficient =
      pairs >= 20 &&
      judgedPositive.size >= 5 &&
      judgedNegative.size >= 5 &&
      judgedPositive.size + judgedNegative.size >= 20 &&
      deltas.length >= 5;
    const pairEligible =
      engine !== "current" && sufficient && mean >= 0.05 && lower !== null && lower > 0;
    const dislikes = dislikeRoute(engine, blocks),
      eligible = pairEligible || dislikes.eligible;
    results[engine] = {
      pairs,
      positive: judgedPositive.size,
      negative: judgedNegative.size,
      correct: wins,
      currentCorrect: baselineWins,
      judgedPairAccuracy: pairs ? wins / pairs : null,
      meanDailyGain: mean,
      lowerGain: lower,
      days: deltas.length,
      eligible,
      route: eligible ? (pairEligible ? "pairs" : "dislikes") : null,
      dislikes,
      status: eligible
        ? "ready-for-review"
        : sufficient || dislikes.sufficient
          ? "no-demonstrated-improvement"
          : "insufficient-evidence",
    };
  }
  return {
    policy: LABEL_POLICY,
    channel,
    counts,
    engines: results,
    metric:
      "Ordering of judged positive / explicit style-negative pairs within frozen pools; unjudged items are not negatives.",
    limitations: [
      "Exposure-selected evidence is not an unbiased estimate of all inventory.",
      "Hidden pieces were seen near the top of Current's order, so a candidate must place them below the middle of the pool, not merely lower than Current.",
      "Day-level comparisons are correlated personal evidence, not independent users.",
      "Price/data rejections and unknown motives are excluded from taste metrics.",
    ],
  };
}
