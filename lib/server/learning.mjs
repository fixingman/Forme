import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  LearningError,
  LABEL_POLICY,
  ENGINE_IDS,
  REASONS,
  validId,
  validKey,
  activeFeedback,
  trainingExamples,
  tasteFeatures,
  evaluateEvidence,
} from "../domain/learning.mjs";
import { trustedSnapshot } from "../domain/data-trust.mjs";
import { recommendListings, listingKey } from "../domain/recommendations.mjs";
import { feedbackSnapshot } from "../domain/taste-profile.mjs";
import { normalizePreviewRanking } from "../domain/ranking-preview.mjs";
import { featuresFor } from "../../scripts/lab/recommendation-data.mjs";
import { localLearningStore } from "./learning-store.mjs";
import { runLearningModels } from "./learning-models.mjs";
import { analysisStore } from "./learning-analysis-store.mjs";
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const scheduled = (globalThis.__formeLearningJobs ??= new Map());
/**
 * Automatic training is heavy: River plus Gorse take about 30 s of CPU and leave roughly 300 MB behind per run, and while one runs the
 * whole app (this server, the browser's learning calls, other programs) slows down. So it is rationed. A feed whose candidates have
 * never been prepared is trained soon, because votes need predictions that were frozen before them. A feed that already has a
 * model only retrains when feedback has arrived since, and then no more often than RETRAIN_AFTER_MS. Neither the Train button
 * nor a comparison is delayed.
 */
export const FIRST_RUN_DELAY_MS = 5000;
export const RETRAIN_AFTER_MS = 20 * 60 * 1000;
/** Run folders are scratch space (the journal keeps every ranking), so only the newest few are kept. */
export const KEEP_RUN_FOLDERS = 2;
/**
 * Removes scratch folders of old runs: everything except the newest KEEP_RUN_FOLDERS runs and the pinned selection. Folders the
 * journal does not know (left by a cleared history or an interrupted run) go too, once they are a few minutes old so a run in
 * progress is never touched. Returns how many were removed. Rankings live in the journal, so nothing here is evidence.
 */
export function pruneRunFolders(root, runs, selectedRunId, nowMs = Date.now()) {
  const base = join(root, ".context/recommendation-learning");
  let names;
  try {
    names = readdirSync(base);
  } catch {
    return 0;
  }
  const keep = new Set(
    runs
      .filter((row) => !row.data.predictionOnly && validId(row.id))
      .slice(-KEEP_RUN_FOLDERS)
      .map((row) => row.id),
  );
  if (selectedRunId) keep.add(selectedRunId);
  let removed = 0;
  for (const name of names) {
    if (!validId(name) || keep.has(name)) continue;
    try {
      const folder = join(base, name),
        known = runs.some((row) => row.id === name);
      if (!known && nowMs - statSync(folder).mtimeMs < 10 * 60 * 1000) continue;
      rmSync(folder, { recursive: true, force: true });
      removed++;
    } catch {
      /* A folder that cannot be removed now is retried after the next run. */
    }
  }
  return removed;
}
const modelRunFor = (runs, context) =>
  [...runs]
    .reverse()
    .find(
      (row) =>
        !row.data.predictionOnly &&
        row.data.channel === context.channel &&
        row.data.sourceHash === hash(context.items) &&
        row.data.filterKey === filterKey(context.profile),
    );
/**
 * The newest feed context that needs a model run, or null. A context needs one when no model exists for its pool and filters, or
 * when feedback has arrived since the model that does exist.
 */
export function pendingContext(contexts, runs, events) {
  const latest = [...new Map(contexts.map((row) => [row.data.channel, row.data])).values()];
  return latest.find((context) => {
    const previous = modelRunFor(runs, context);
    const last = events.filter((row) => row.data.channel === context.channel).at(-1)?.ordinal ?? 0;
    return !previous || last > previous.data.cutoff;
  });
}
/** How long to wait before automatic training: null when nothing is pending, soon for a new feed, rationed for new feedback. */
export function trainingDelay(contexts, runs, events, now, retrainAfterMs = RETRAIN_AFTER_MS) {
  const context = pendingContext(contexts, runs, events);
  if (!context) return null;
  const previous = modelRunFor(runs, context);
  if (!previous) return FIRST_RUN_DELAY_MS;
  const ran = Date.parse(previous.data.createdAt);
  return Math.max(FIRST_RUN_DELAY_MS, Number.isFinite(ran) ? ran + retrainAfterMs - now : 0);
}
const channelOk = (value) => ["shopping", "preview"].includes(value);
function itemSnapshot(item, now) {
  if (!item || item.source !== "vinted")
    throw new LearningError("Only recorded marketplace pieces can supply learning feedback.");
  const rows = trustedSnapshot(
    { fetchedAt: item.fetchedAt ?? item.observedAt, queries: [], items: [item] },
    now,
  ).items;
  if (rows.length !== 1 || listingKey(rows[0]) !== listingKey(item))
    throw new LearningError("Invalid listing snapshot.");
  return rows[0];
}
function filterKey(profile) {
  const { gender, sizing, following, excluded, styles, styleRules } = profile.settings;
  return hash({ gender, sizing, following, excluded, styles, styleRules });
}
export function learningService({
  root = process.cwd(),
  owner = "local",
  repository = () => localLearningStore(root, owner),
  rank = runLearningModels,
  now = Date.now,
  canTrain = true,
  auto = true,
  retrainAfterMs = RETRAIN_AFTER_MS,
} = {}) {
  const use = async (fn) => {
    const store = repository();
    try {
      return await fn(store);
    } finally {
      store.close();
    }
  };
  const job = (value) => {
    const store = localLearningStore(root, owner);
    try {
      const current = store.job(value);
      if (
        value === undefined &&
        current?.state === "running" &&
        now() - Date.parse(current.at) >= 150000
      ) {
        return store.job({
          state: "interrupted",
          at: new Date(now()).toISOString(),
          message:
            "The previous local run did not finish. Current is available; prepare candidates again.",
        });
      }
      return current;
    } finally {
      store.close();
    }
  };
  const record = (kind, data) => ({ kind, id: data.id, data });
  async function history(store) {
    const [events, exposures, runs] = await Promise.all(
      ["event", "exposure", "run"].map((kind) => store.list(kind)),
    );
    return { events, exposures, runs };
  }
  async function queue() {
    if (!canTrain || !auto) return;
    const key = root + "|" + owner;
    if (scheduled.has(key) || job()?.state === "running") return;
    try {
      const wait = await use(async (store) =>
        trainingDelay(
          await store.list("context"),
          await store.list("run"),
          await store.list("event"),
          now(),
          retrainAfterMs,
        ),
      );
      // Re-check: another call may have scheduled or started a run while this one was reading.
      if (wait === null || scheduled.has(key) || job()?.state === "running") return;
      const timer = setTimeout(() => {
        scheduled.delete(key);
        void train().catch(() => {});
      }, wait);
      timer.unref?.();
      scheduled.set(key, timer);
      job({
        state: "queued",
        at: new Date(now()).toISOString(),
        ...(wait > FIRST_RUN_DELAY_MS
          ? { message: `Next automatic run about ${Math.ceil(wait / 60000)} min from now.` }
          : {}),
      });
    } catch {
      /* Scheduling is best-effort: the Train button and the next feedback event still start a run. */
    }
  }
  async function train({ channel } = {}) {
    if (!canTrain) throw new LearningError("Training runs on the owner’s computer.", 403);
    const existing = job();
    if (existing?.state === "running" && now() - Date.parse(existing.at) < 150000)
      throw new LearningError("A learning run is already in progress.", 409);
    job({ state: "running", at: new Date(now()).toISOString() });
    try {
      const result = await use(async (store) => {
        const contexts = await store.list("context"),
          events = await store.list("event"),
          runs = await store.list("run"),
          context = channel
            ? [...contexts].reverse().find((row) => row.data.channel === channel)?.data
            : (pendingContext(contexts, runs, events) ?? contexts.at(-1)?.data);
        if (!context) throw new LearningError("Open Discover or create a comparison first.");
        const examples = trainingExamples(events, context.channel),
          states = activeFeedback(events, context.channel),
          settings = project(context.profile.settings, states);
        const signals = new Map(context.items.map((item) => [listingKey(item), item]));
        for (const example of examples) signals.set(example.key, example.item);
        const baseline = recommendListings(context.items, settings, {
          signals: [...signals.values()],
          now: now(),
        });
        const id = randomUUID(),
          directory = join(root, ".context/recommendation-learning", id);
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        const trainingDigests = Object.fromEntries(
          examples.map((e) => [
            e.key,
            hash({ label: e.label, features: tasteFeatures(featuresFor(e.item)) }),
          ]),
        );
        const trainingKeys = [
          ...new Set([
            ...examples.map((e) => e.key),
            ...context.items.filter((item) => settings.saved.includes(item.id)).map(listingKey),
          ]),
        ];
        const cutoff = events.at(-1)?.ordinal ?? 0;
        const modelCase = {
          now: now(),
          items: [...signals.values()].map((item) => ({
            key: listingKey(item),
            features: tasteFeatures(featuresFor(item)),
            at: item.observedAt ?? item.fetchedAt,
          })),
          candidateKeys: baseline.map((row) => listingKey(row.item)),
          examples: examples.map((e) => ({
            key: e.key,
            label: e.label,
            weight: 1,
            features: tasteFeatures(featuresFor(e.item)),
          })),
          baseline: baseline.map((row) => ({ key: listingKey(row.item), score: row.score })),
        };
        writeFileSync(join(directory, "input.json"), JSON.stringify({ case: modelCase }), {
          mode: 0o600,
        });
        let models = {};
        try {
          models = await rank(root, directory);
        } catch {
          /* Explicit unavailable states retain Current, never a fabricated learned result. */
        }
        const engines = { current: { mode: "current", keys: modelCase.candidateKeys } };
        for (const name of ENGINE_IDS.slice(1)) {
          const result = models[name];
          let normalized;
          try {
            if (result?.ranking)
              normalized = normalizePreviewRanking(result.ranking, modelCase.candidateKeys);
          } catch {}
          const predicted = new Set(result?.ranking?.map((row) => row.key) ?? []),
            fallbackKeys = modelCase.candidateKeys.filter((key) => !predicted.has(key));
          engines[name] = {
            mode: !normalized
              ? "unavailable"
              : ![
                    "weighted-online-logistic-replayed-10-passes",
                    "tags-and-factorization-machines",
                  ].includes(result.mode)
                ? "fallback"
                : fallbackKeys.some((key) => !trainingKeys.includes(key))
                  ? "partial"
                  : "learned",
            keys: normalized?.keys ?? modelCase.candidateKeys,
            fallbackKeys,
          };
        }
        const data = {
          id,
          createdAt: new Date(now()).toISOString(),
          channel: context.channel,
          cutoff,
          trainingKeys,
          trainingDigests,
          expectedVersions: { river: "0.26.1", gorse: "0.5.11" },
          training: {
            positive: examples.filter((e) => e.label === 1).length,
            negative: examples.filter((e) => e.label === 0).length,
          },
          policy: LABEL_POLICY,
          featureVersion: "text-traits-without-price-v1",
          sourceHash: hash(context.items),
          filterKey: filterKey(context.profile),
          engines,
        };
        await store.append([record("run", data)]);
        job({ state: "complete", id, at: new Date(now()).toISOString() });
        try {
          pruneRunFolders(
            root,
            await store.list("run"),
            (await store.selection())?.selected?.runId,
            now(),
          );
        } catch {
          /* Housekeeping never fails a finished run. */
        }
        return data;
      });
      const pending = await use(async (store) =>
        pendingContext(
          await store.list("context"),
          await store.list("run"),
          await store.list("event"),
        ),
      );
      if (pending) void queue();
      return result;
    } catch (error) {
      job({
        state: "failed",
        at: new Date(now()).toISOString(),
        message:
          error instanceof LearningError
            ? error.message
            : "Model preparation failed. Current remains available.",
      });
      throw error;
    }
  }
  function project(settings, states) {
    const dismissed = new Set(settings.dismissed),
      saved = new Set(settings.saved),
      feedback = new Map((settings.tasteFeedback ?? []).map((row) => [row.key, row]));
    for (const [key, state] of states) {
      if (state.hideTouched) {
        if (state.hidden) dismissed.add(key);
        else dismissed.delete(key);
      }
      if (state.item) {
        if (state.saveTouched) {
          if (state.saved) saved.add(state.item.id);
          else saved.delete(state.item.id);
        }
        if (state.hidden)
          feedback.set(key, { ...feedbackSnapshot(state.item), reason: state.reason });
      }
    }
    return {
      ...settings,
      saved: [...saved],
      dismissed: [...dismissed],
      tasteFeedback: [...feedback.values()],
    };
  }
  async function ingest(values) {
    if (!Array.isArray(values) || values.length > 50)
      throw new LearningError("Invalid feedback batch.");
    return use(async (store) => {
      const all = await store.list("event"),
        known = new Map(all.map((r) => [r.id, r.data]));
      const exposures = new Map((await store.list("exposure")).map((r) => [r.id, r.data]));
      const records = [];
      for (const value of values) {
        if (
          !value ||
          !validId(value.id) ||
          !validKey(value.key) ||
          !channelOk(value.channel) ||
          !["save", "unsave", "dismiss", "restore", "reason"].includes(value.action) ||
          !Number.isFinite(Date.parse(value.occurredAt)) ||
          Date.parse(value.occurredAt) > now() + 300000
        )
          throw new LearningError("Invalid feedback event.");
        if (value.reason !== undefined && !REASONS.includes(value.reason))
          throw new LearningError("Invalid feedback reason.");
        const data = {
          id: value.id,
          key: value.key,
          action: value.action,
          channel: value.channel,
          occurredAt: value.occurredAt,
        };
        if (value.action === "dismiss") data.reason = value.reason ?? "unspecified";
        if (value.action === "reason") {
          if (!REASONS.includes(value.reason) || !validId(value.targetId))
            throw new LearningError("A reason needs its original feedback.");
          const parent = known.get(value.targetId);
          if (
            !parent ||
            parent.action !== "dismiss" ||
            parent.key !== value.key ||
            parent.channel !== value.channel
          )
            throw new LearningError("Original feedback is unavailable. Send the hide first.");
          data.reason = value.reason;
          data.targetId = value.targetId;
        }
        if (value.item) {
          data.item = itemSnapshot(value.item, now());
          if (listingKey(data.item) !== value.key)
            throw new LearningError("Feedback identity does not match the piece.");
        }
        if (["save", "dismiss"].includes(value.action) && !data.item)
          throw new LearningError("A decision needs the displayed listing snapshot.");
        if (value.exposureId) {
          const exposure = exposures.get(value.exposureId);
          if (exposure?.channel === value.channel && exposure.keys.includes(value.key))
            data.exposureId = value.exposureId;
        }
        known.set(data.id, data);
        records.push(record("event", data));
      }
      const ack = await store.append(records);
      void queue();
      return { ack };
    });
  }
  async function snapshot(profile, items, { channel = "shopping", comparison = false } = {}) {
    if (!channelOk(channel) || !Array.isArray(items) || items.length > 3000)
      throw new LearningError("Invalid learning snapshot.");
    const source = trustedSnapshot(
      { fetchedAt: new Date(now()).toISOString(), queries: [], items },
      now(),
    ).items;
    if (source.length !== items.length)
      throw new LearningError("The learning snapshot contains invalid or duplicate pieces.");
    const context = { id: randomUUID(), profile, items: source, channel };
    await use((store) => store.append([record("context", context)]));
    if (comparison && canTrain) await train({ channel });
    else void queue();
    return use(async (store) => {
      const events = await store.list("event"),
        states = activeFeedback(events, channel),
        settings = project(profile.settings, states),
        known = new Set(
          [...states].filter(([, row]) => row.saved || row.hidden).map(([key]) => key),
        );
      const baseline = recommendListings(source, settings, {
          signals: [...source, ...profile.savedListings],
          now: now(),
        }).filter((row) => !comparison || !known.has(listingKey(row.item))),
        keys = baseline.map((row) => listingKey(row.item));
      const runs = await store.list("run"),
        selection = await store.selection(),
        latest = [...runs]
          .reverse()
          .find(
            (row) =>
              !row.data.predictionOnly &&
              row.data.channel === channel &&
              row.data.sourceHash === hash(source) &&
              row.data.filterKey === filterKey(profile),
          );
      const engines = { current: { mode: "current", keys } };
      for (const name of ENGINE_IDS.slice(1)) {
        const existing = latest?.data.engines[name];
        engines[name] = {
          mode: existing?.mode ?? "unavailable",
          fallbackKeys: existing?.fallbackKeys?.filter((key) => keys.includes(key)) ?? keys,
          keys: existing
            ? [
                ...existing.keys.filter((k) => keys.includes(k)),
                ...keys.filter((k) => !existing.keys.includes(k)),
              ]
            : keys,
        };
      }
      const run = {
        id: randomUUID(),
        createdAt: new Date(now()).toISOString(),
        channel,
        cutoff: events.at(-1)?.ordinal ?? 0,
        trainingKeys: [
          ...new Set([
            ...(latest?.data.trainingKeys ?? []),
            ...source.filter((item) => settings.saved.includes(item.id)).map(listingKey),
          ]),
        ],
        training: latest?.data.training ?? { positive: 0, negative: 0 },
        policy: LABEL_POLICY,
        sourceHash: hash(source),
        filterKey: filterKey(profile),
        engines,
        predictionOnly: true,
        modelRunId: latest?.id ?? null,
      };
      await store.append([record("run", run)]);
      let selectedKeys = null,
        selectedName = "current";
      if (selection.selected) {
        const picked = runs.find((row) => row.id === selection.selected.runId)?.data;
        const active = new Map(
          trainingExamples(events, picked?.channel).map((e) => [
            e.key,
            hash({ label: e.label, features: tasteFeatures(featuresFor(e.item)) }),
          ]),
        );
        const valid =
          picked &&
          Object.entries(picked.trainingDigests ?? {}).every(
            ([key, digest]) => active.get(key) === digest,
          );
        if (
          valid &&
          picked.sourceHash === hash(source) &&
          picked.filterKey === filterKey(profile) &&
          picked.engines[selection.selected.engine]?.mode === "learned"
        ) {
          selectedKeys = picked.engines[selection.selected.engine].keys.filter((key) =>
            keys.includes(key),
          );
          selectedName = selection.selected.engine;
        }
      }
      return {
        id: run.id,
        createdAt: run.createdAt,
        items: baseline.map((r) => r.item),
        engines,
        training: run.training,
        selectedKeys,
        selectedName,
        selectionRevision: selection.revision,
      };
    });
  }
  async function exposure({
    id,
    runId,
    keys,
    channel,
    surface = "unknown",
    trigger = "unknown",
    positions = {},
    engine,
  }) {
    if (
      !validId(id) ||
      !validId(runId) ||
      !channelOk(channel) ||
      !Array.isArray(keys) ||
      keys.length > 100 ||
      keys.some((key) => !validKey(key)) ||
      typeof surface !== "string" ||
      !/^(?:unknown|\/|\/(?:discover|following|saved|searches(?:\/\d+)?|items\/\d+|tools\/learning))$/.test(
        surface,
      ) ||
      !["unknown", "visible", "decision"].includes(trigger) ||
      !positions ||
      typeof positions !== "object" ||
      Array.isArray(positions) ||
      Object.entries(positions).some(
        ([key, position]) =>
          !keys.includes(key) || !Number.isSafeInteger(position) || position < 1 || position > 3000,
      ) ||
      (engine !== undefined && !ENGINE_IDS.includes(engine))
    )
      throw new LearningError("Invalid exposure.");
    return use(async (store) => {
      const run = (await store.list("run")).find((row) => row.id === runId);
      if (
        !run ||
        run.data.channel !== channel ||
        keys.some((key) => !run.data.engines.current.keys.includes(key))
      )
        throw new LearningError("Exposure is outside its frozen pool.");
      await store.append([
        record("exposure", {
          id,
          runId,
          keys: [...new Set(keys)],
          channel,
          surface,
          trigger,
          positions,
          ...(engine ? { engine } : {}),
        }),
      ]);
      return { id };
    });
  }
  async function status() {
    return use(async (store) => {
      const h = await history(store),
        selection = await store.selection();
      const contexts = await store.list("context");
      if (canTrain && pendingContext(contexts, h.runs, h.events) && job()?.state !== "running")
        void queue();
      return {
        events: h.events.length,
        selection,
        job: canTrain ? job() : null,
        canTrain,
        reports: ["shopping", "preview"].map((channel) => evaluateEvidence({ ...h, channel })),
        runs: h.runs
          .filter((row) => !row.data.predictionOnly)
          .slice(-10)
          .map((row) => ({ id: row.id, ...row.data })),
      };
    });
  }
  async function select({ runId, engine, expectedRevision, allowPreviewTraining = false }) {
    return use(async (store) => {
      const previous = await store.selection();
      let selected = null;
      if (engine !== "current") {
        if (!ENGINE_IDS.includes(engine) || !validId(runId))
          throw new LearningError("Invalid model selection.");
        const h = await history(store),
          run = h.runs.find((r) => r.id === runId)?.data;
        const active = new Map(
          trainingExamples(h.events, run?.channel).map((e) => [
            e.key,
            hash({ label: e.label, features: tasteFeatures(featuresFor(e.item)) }),
          ]),
        );
        if (
          run &&
          Object.entries(run.trainingDigests ?? {}).some(
            ([key, digest]) => active.get(key) !== digest,
          )
        )
          throw new LearningError("Training feedback changed. Prepare a new candidate first.", 409);
        if (!run || run.predictionOnly || run.engines[engine]?.mode !== "learned")
          throw new LearningError("This model is not a learned candidate.");
        if (run.channel === "preview" && !allowPreviewTraining)
          throw new LearningError(
            "Explicit consent is required to use preview learning in Discover.",
          );
        const report = evaluateEvidence({ ...h, channel: run.channel });
        if (!report.engines[engine].eligible)
          throw new LearningError(
            "There is not enough forward evidence to activate this candidate.",
            409,
          );
        selected = { runId, engine, channel: run.channel, at: new Date(now()).toISOString() };
      }
      return store.select(expectedRevision, {
        selected,
        history: [
          ...(previous.history ?? []),
          { from: previous.selected, to: selected, at: new Date(now()).toISOString() },
        ],
      });
    });
  }
  async function clear(confirmation) {
    if (confirmation !== "DELETE LEARNING HISTORY")
      throw new LearningError("Explicit history deletion confirmation required.");
    if (job()?.state === "running")
      throw new LearningError("Wait for the current learning run to finish.", 409);
    const key = root + "|" + owner;
    const timer = scheduled.get(key);
    if (timer) {
      clearTimeout(timer);
      scheduled.delete(key);
    }
    return use(async (store) => {
      const runs = await store.list("run");
      const analyst = analysisStore(root, owner);
      try {
        analyst.clear(now());
      } finally {
        analyst.close();
      }
      await store.clear();
      for (const run of runs)
        if (!run.data.predictionOnly && validId(run.id))
          rmSync(join(root, ".context/recommendation-learning", run.id), {
            recursive: true,
            force: true,
          });
      job({ state: "cleared", at: new Date(now()).toISOString() });
      return { cleared: true };
    });
  }
  return {
    ingest,
    snapshot,
    exposure,
    status,
    train,
    select,
    clear,
    async exportHistory() {
      return use(async (store) => ({
        app: "forme-learning",
        version: 1,
        exportedAt: new Date(now()).toISOString(),
        ...(await history(store)),
        contexts: await store.list("context"),
        selection: await store.selection(),
        ...(canTrain
          ? {
              analyst: (() => {
                const data = analysisStore(root, owner);
                try {
                  return data.export();
                } finally {
                  data.close();
                }
              })(),
            }
          : {}),
      }));
    },
  };
}
