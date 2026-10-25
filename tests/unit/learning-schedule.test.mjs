import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  learningService,
  trainingDelay,
  pendingContext,
  pruneRunFolders,
  FIRST_RUN_DELAY_MS,
  RETRAIN_AFTER_MS,
  KEEP_RUN_FOLDERS,
} from "../../lib/server/learning.mjs";
import { localLearningStore } from "../../lib/server/learning-store.mjs";

// Automatic training is the heaviest thing the app does (River + Gorse, ~30 s of CPU and ~300 MB per run). These tests pin down
// that it is rationed: soon for a feed with no model, rarely for new feedback, never when nothing changed, and that old run
// folders do not pile up. No test runs a model or really waits.
const at = "2026-10-25T10:00:00.000Z";
const t0 = Date.parse(at);
const minutes = (n) => n * 60 * 1000;
const piece = (n) => {
  const id = n + 30000;
  return {
    id,
    source: "vinted",
    sourceId: String(id),
    sourceKey: `vinted:${id}`,
    sourceUrl: `https://www.vinted.se/items/${id}-piece`,
    brand: "Auralee",
    title: "Black wool jacket",
    price: 451.69,
    currency: "SEK",
    size: "M",
    gender: "men",
    genderSource: "provider",
    condition: "Good",
    image: "",
    imageUrl: "https://images1.vinted.net/fixture.webp",
    category: "Jacket",
    style: "Minimalism",
    rarity: 0,
    age: 0,
    fetchedAt: at,
    observedAt: at,
  };
};
const profile = {
  settings: {
    following: ["Our Legacy"],
    excluded: [],
    styles: ["Minimalism"],
    styleRules: {},
    saved: [],
    dismissed: [],
    tasteFeedback: [],
    sizing: { enabled: false, selected: [], includeOneSize: true, includeUnspecified: true },
    gender: { selected: ["men", "unisex"], includeUnknown: false },
  },
  savedListings: [],
};
const hide = (p) => ({
  id: randomUUID(),
  key: p.sourceKey,
  action: "dismiss",
  channel: "shopping",
  occurredAt: at,
  item: p,
  reason: "style",
});
// A stand-in for River and Gorse: every candidate reports "unavailable", so a run is recorded without running any model.
const rank = async () => ({});
const lists = async (root) => {
  const store = localLearningStore(root, "local");
  try {
    return [await store.list("context"), await store.list("run"), await store.list("event")];
  } finally {
    store.close();
  }
};
const withRoot = async (fn) => {
  const root = mkdtempSync(join(tmpdir(), "forme-schedule-"));
  const timers = globalThis.__formeLearningJobs;
  try {
    return await fn(root);
  } finally {
    timers?.clear();
    mock.restoreAll();
    rmSync(root, { recursive: true, force: true });
  }
};
// Captures what would have been scheduled instead of scheduling it.
const captureTimers = () => {
  const delays = [];
  mock.method(globalThis, "setTimeout", (_fn, ms) => {
    delays.push(ms);
    return { unref() {}, ref() {} };
  });
  return delays;
};
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("the schedule is soon for a feed with no model, rationed for new feedback, and nothing when nothing changed", async () =>
  withRoot(async (root) => {
    const setup = learningService({ root, now: () => t0, auto: false, rank });
    assert.equal(trainingDelay([], [], [], t0), null, "no feed yet: nothing to train");
    const pieces = [piece(1), piece(2), piece(3)];
    await setup.snapshot(profile, pieces);
    let [contexts, runs, events] = await lists(root);
    assert.equal(trainingDelay(contexts, runs, events, t0), FIRST_RUN_DELAY_MS, "a feed with no model is trained soon");
    assert.ok(pendingContext(contexts, runs, events));

    await setup.train();
    [contexts, runs, events] = await lists(root);
    assert.equal(trainingDelay(contexts, runs, events, t0 + minutes(1)), null, "a model exists and nothing new has happened");
    assert.equal(pendingContext(contexts, runs, events), undefined);

    await setup.ingest([hide(pieces[0])]);
    [contexts, runs, events] = await lists(root);
    const modelRun = runs.find((row) => !row.data.predictionOnly);
    const ranAt = Date.parse(modelRun.data.createdAt);
    assert.equal(trainingDelay(contexts, runs, events, ranAt + minutes(1)), RETRAIN_AFTER_MS - minutes(1), "new feedback waits out the rest of the interval");
    assert.equal(trainingDelay(contexts, runs, events, ranAt), RETRAIN_AFTER_MS);
    assert.equal(trainingDelay(contexts, runs, events, ranAt + RETRAIN_AFTER_MS - 1000), FIRST_RUN_DELAY_MS, "never less than the short delay");
    assert.equal(trainingDelay(contexts, runs, events, ranAt + RETRAIN_AFTER_MS + minutes(30)), FIRST_RUN_DELAY_MS, "overdue: soon");
    assert.equal(trainingDelay(contexts, runs, events, ranAt + minutes(1), minutes(5)), minutes(4), "the interval is configurable");
  }));

test("a different feed (new listings or changed filters) needs its own model and is trained soon, even right after another run", async () =>
  withRoot(async (root) => {
    const service = learningService({ root, now: () => t0, auto: false, rank });
    await service.snapshot(profile, [piece(1), piece(2)]);
    await service.train();
    await service.snapshot(profile, [piece(1), piece(2), piece(3)]);
    let [contexts, runs, events] = await lists(root);
    assert.equal(trainingDelay(contexts, runs, events, t0 + minutes(1)), FIRST_RUN_DELAY_MS, "new listings");
    await service.train();
    const narrower = { ...profile, settings: { ...profile.settings, following: ["Lemaire"] } };
    await service.snapshot(narrower, [piece(1), piece(2), piece(3)]);
    [contexts, runs, events] = await lists(root);
    assert.equal(trainingDelay(contexts, runs, events, t0 + minutes(1)), FIRST_RUN_DELAY_MS, "changed filters");
  }));

test("auto mode: viewing the feed schedules one soon run, and later views with nothing new schedule nothing", async () =>
  withRoot(async (root) => {
    const delays = captureTimers();
    const auto = learningService({ root, now: () => t0, auto: true, rank });
    const pieces = [piece(1), piece(2), piece(3)];
    await auto.snapshot(profile, pieces);
    await settle();
    assert.deepEqual(delays, [FIRST_RUN_DELAY_MS], "the first view schedules one short run");
    assert.equal((await auto.status()).job.state, "queued");
    // The run happens (here: directly), then the person keeps browsing: every view is a snapshot.
    globalThis.__formeLearningJobs.clear();
    await auto.train();
    delays.length = 0;
    for (let i = 0; i < 5; i++) await auto.snapshot(profile, pieces);
    await settle();
    assert.deepEqual(delays, [], "five more views of the same feed schedule no training at all");
  }));

test("auto mode: a run of hides schedules one rationed retrain, not one per hide", async () =>
  withRoot(async (root) => {
    const delays = captureTimers();
    let clock = t0;
    const auto = learningService({ root, now: () => clock, auto: true, rank });
    const pieces = [1, 2, 3, 4, 5, 6].map(piece);
    await auto.snapshot(profile, pieces);
    globalThis.__formeLearningJobs.clear();
    await auto.train();
    clock = t0 + minutes(1);
    delays.length = 0;
    for (const p of pieces) {
      await auto.ingest([hide(p)]);
      await settle();
    }
    assert.equal(delays.length, 1, "six hides, one scheduled retrain");
    assert.ok(delays[0] > minutes(15) && delays[0] <= RETRAIN_AFTER_MS, `waits out the interval (${delays[0]} ms)`);
    const job = (await auto.status()).job;
    assert.equal(job.state, "queued");
    assert.match(job.message, /Next automatic run about \d+ min from now/);
  }));

test("auto off, or a server that may not train, never schedules anything", async () =>
  withRoot(async (root) => {
    const delays = captureTimers();
    for (const options of [{ auto: false }, { auto: true, canTrain: false }]) {
      const service = learningService({ root, now: () => t0, rank, ...options });
      const p = piece(1);
      await service.snapshot(profile, [p, piece(2)]);
      await service.ingest([hide(p)]).catch(() => {});
      await settle();
    }
    assert.deepEqual(delays, []);
  }));

test("the Train button is never rationed: it runs at once even right after another run with new feedback waiting", async () =>
  withRoot(async (root) => {
    const service = learningService({ root, now: () => t0, auto: false, rank });
    const pieces = [piece(1), piece(2)];
    await service.snapshot(profile, pieces);
    await service.train();
    await service.ingest([hide(pieces[0])]);
    const again = await service.train();
    assert.equal(again.training.negative, 1, "the new hide is in the training set straight away");
  }));

// ---------------------------------------------------------------------------------------------------------------- run folders
const folder = (root, name, age = 0) => {
  const dir = join(root, ".context/recommendation-learning", name);
  mkdirSync(dir, { recursive: true });
  if (age) {
    const when = new Date(Date.now() - age);
    utimesSync(dir, when, when);
  }
  return dir;
};
const run = (id) => ({ id, data: { predictionOnly: false } });

test("pruning keeps the newest runs and the pinned one, and clears old unknown folders but not fresh ones", () =>
  withRoot(async (root) => {
    const ids = Array.from({ length: 5 }, () => randomUUID());
    const runs = ids.map(run);
    const folders = ids.map((id) => folder(root, id));
    const predictionOnly = randomUUID();
    const orphanOld = folder(root, randomUUID(), minutes(30)),
      orphanFresh = folder(root, randomUUID(), minutes(1)),
      notOurs = folder(root, "keep-me-notes");
    const removed = pruneRunFolders(root, [...runs, { id: predictionOnly, data: { predictionOnly: true } }], ids[0], Date.now());
    assert.equal(removed, 3 /* two unpinned old runs + the old orphan */ + 0);
    assert.deepEqual(
      folders.map((dir) => existsSync(dir)),
      [true /* pinned */, false, false, true, true],
    );
    assert.equal(KEEP_RUN_FOLDERS, 2);
    assert.equal(existsSync(orphanOld), false, "an old folder the journal does not know is cleared");
    assert.equal(existsSync(orphanFresh), true, "a fresh unknown folder might be a run in progress");
    assert.equal(existsSync(notOurs), true, "anything that is not a run id is left alone");
  }));

test("pruning with no folder, no runs or a bad selection is harmless", () =>
  withRoot(async (root) => {
    assert.equal(pruneRunFolders(root, [], undefined, Date.now()), 0);
    folder(root, randomUUID());
    assert.equal(pruneRunFolders(root, [], null, Date.now()), 0, "a fresh unknown folder stays");
    assert.equal(pruneRunFolders(root, [run("not-an-id")], "also-not", Date.now()), 0);
  }));

test("after several runs only the newest folders remain, while every run and its rankings stay in the journal", async () =>
  withRoot(async (root) => {
    const service = learningService({ root, now: () => t0, auto: false, rank });
    await service.snapshot(profile, [piece(1), piece(2), piece(3)]);
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push((await service.train()).id);
    const base = join(root, ".context/recommendation-learning");
    assert.deepEqual(readdirSync(base).sort(), ids.slice(-KEEP_RUN_FOLDERS).sort(), "only the newest folders are kept");
    const [, runs] = await lists(root);
    const model = runs.filter((row) => !row.data.predictionOnly);
    assert.deepEqual(model.map((row) => row.id), ids, "the journal still holds all five runs");
    for (const row of model) assert.ok(row.data.engines.current.keys.length > 0, "and their rankings");
  }));
