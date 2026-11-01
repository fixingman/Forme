import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { learningService } from "../../lib/server/learning.mjs";
import { localLearningStore, hostedLearningStore } from "../../lib/server/learning-store.mjs";
import {
  activeFeedback,
  trainingExamples,
  tasteFeatures,
  evaluateEvidence,
  orderEligible,
  LABEL_POLICY,
} from "../../lib/domain/learning.mjs";
const at = "2026-10-24T10:00:00.000Z";
const item = (value) => {
  const id = value + 20000;
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
const event = (key, action, extra = {}) => ({
  id: randomUUID(),
  key,
  action,
  channel: "shopping",
  occurredAt: at,
  ...extra,
});
test("reasons route to separate learning semantics and corrections are canonical", () => {
  const piece = item(1),
    hide = event(piece.sourceKey, "dismiss", { item: piece, reason: "price" }),
    save = event(piece.sourceKey, "save", { item: piece });
  const rows = [
    { ordinal: 1, data: hide },
    { ordinal: 2, data: save },
  ];
  assert.equal(trainingExamples(rows, "shopping").length, 0);
  rows.push({
    ordinal: 3,
    data: event(piece.sourceKey, "reason", { targetId: hide.id, reason: "style" }),
  });
  assert.equal(trainingExamples(rows, "shopping")[0].label, 0);
  rows.push({ ordinal: 4, data: event(piece.sourceKey, "restore") });
  assert.equal(trainingExamples(rows, "shopping")[0].label, 1);
  rows.push({ ordinal: 5, data: event(piece.sourceKey, "unsave") });
  assert.equal(trainingExamples(rows, "shopping").length, 0);
  assert.deepEqual(tasteFeatures({ "price-band:8": 1, "brand:auralee": 1 }), {
    "brand:auralee": 1,
  });
});
test("journal is idempotent, owner scoped, rejects ID reuse and binds reasons to their decision", async () => {
  const root = mkdtempSync(join(tmpdir(), "forme-learning-"));
  try {
    const service = learningService({ root, now: () => Date.parse(at), auto: false }),
      piece = item(2),
      hide = event(piece.sourceKey, "dismiss", { item: piece });
    await service.ingest([hide]);
    await service.ingest([hide]);
    assert.equal((await service.exportHistory()).events.length, 1);
    await assert.rejects(service.ingest([{ ...hide, reason: "style" }]), /reused/);
    await assert.rejects(
      service.ingest([
        event(piece.sourceKey, "reason", { reason: "style", targetId: randomUUID() }),
      ]),
      /Original feedback/,
    );
    const foreign = localLearningStore(root, "other");
    assert.equal((await foreign.list("event")).length, 0);
    foreign.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("snapshot predicts before feedback; learning uses style negatives only and preserves saves", async () => {
  const root = mkdtempSync(join(tmpdir(), "forme-learning-"));
  let cases = [];
  try {
    const pieces = [item(3), item(4), item(5), item(6)];
    const rank = async (_root, directory) => {
      const { readFileSync } = await import("node:fs");
      const data = JSON.parse(readFileSync(join(directory, "input.json"))).case;
      cases.push(data);
      return Object.fromEntries(
        ["river", "river-regularized", "gorse"].map((name) => [
          name,
          {
            ranking: [...data.candidateKeys].reverse().map((key) => ({ key, score: 1 })),
            mode:
              name === "gorse"
                ? "tags-and-factorization-machines"
                : "weighted-online-logistic-replayed-10-passes",
          },
        ]),
      );
    };
    const service = learningService({ root, now: () => Date.parse(at), auto: false, rank }),
      snapshot = await service.snapshot(profile, pieces);
    const exposure = {
      id: randomUUID(),
      runId: snapshot.id,
      keys: pieces.map((p) => p.sourceKey),
      channel: "shopping",
    };
    await service.exposure(exposure);
    const style = event(pieces[1].sourceKey, "dismiss", {
      item: pieces[1],
      reason: "style",
      exposureId: exposure.id,
    });
    await service.ingest([
      event(pieces[0].sourceKey, "save", { item: pieces[0], exposureId: exposure.id }),
      style,
      event(pieces[2].sourceKey, "dismiss", {
        item: pieces[2],
        reason: "price",
        exposureId: exposure.id,
      }),
    ]);
    const run = await service.train();
    assert.equal(run.training.positive, 1);
    assert.equal(run.training.negative, 1);
    assert.equal(cases[0].examples.length, 2);
    assert.ok(
      cases[0].examples.every(
        (e) => !Object.keys(e.features).some((name) => name.startsWith("price")),
      ),
    );
    const report = (await service.status()).reports[0];
    assert.equal(report.counts.price, 1);
    assert.equal(report.engines.river.status, "insufficient-evidence");
    await assert.rejects(
      service.select({ runId: run.id, engine: "river", expectedRevision: 0 }),
      /enough forward/,
    );
    const rolled = await service.select({ engine: "current", expectedRevision: 0 });
    assert.equal(rolled.selected, null);
    await assert.rejects(service.select({ engine: "current", expectedRevision: 0 }), /another tab/);
    const before = await service.exportHistory();
    await service.ingest([event(pieces[1].sourceKey, "restore")]);
    const next = await service.train();
    assert.equal(next.training.negative, 0);
    assert.equal(before.runs.find((r) => r.id === run.id).data.training.negative, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("forward evidence requires prior predictions and multiple days; no unjudged negatives", () => {
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
        data: event(key, i < 2 ? "save" : "dismiss", {
          channel: "preview",
          item: item(Number(key.split(":")[1])),
          reason: "style",
          exposureId,
        }),
      }),
    );
  }
  const report = evaluateEvidence({ events, exposures, runs });
  assert.equal(report.engines.river.eligible, true);
  assert.equal(report.engines.gorse.eligible, false);
  assert.equal(report.engines.river.pairs, 20);
  const leaked = structuredClone(runs);
  leaked.forEach((run) => (run.data.trainingKeys = run.data.engines.current.keys));
  assert.equal(evaluateEvidence({ events, exposures, runs: leaked }).engines.river.eligible, false);
});
test("qualified preview promotion needs consent, preserves hard eligibility, rolls back and clears privately", async () => {
  const root = mkdtempSync(join(tmpdir(), "forme-learning-"));
  try {
    const pieces = Array.from({ length: 30 }, (_, i) => item(100 + i));
    const rank = async (_root, directory) => {
      const { readFileSync } = await import("node:fs");
      const data = JSON.parse(readFileSync(join(directory, "input.json"))).case;
      return {
        river: {
          ranking: [...data.candidateKeys].reverse().map((key) => ({ key, score: 1 })),
          mode: "weighted-online-logistic-replayed-10-passes",
        },
      };
    };
    const service = learningService({ root, auto: false, rank, now: () => Date.parse(at) });
    await service.snapshot(profile, pieces, { channel: "preview", comparison: true });
    const candidate = (await service.status()).runs.at(-1),
      store = localLearningStore(root);
    // Five separate historical frozen pools, each with held-out judgments delivered after prediction.
    for (let day = 1; day <= 5; day++) {
      const keys = pieces.slice((day - 1) * 4, day * 4).map((listingKey) => listingKey.sourceKey),
        id = randomUUID(),
        exposureId = randomUUID();
      await store.append([
        {
          kind: "run",
          id,
          data: {
            ...candidate,
            id,
            predictionOnly: true,
            cutoff: 0,
            trainingKeys: [],
            engines: {
              current: { mode: "current", keys: [...keys].reverse() },
              river: { mode: "learned", keys },
            },
          },
        },
        {
          kind: "exposure",
          id: exposureId,
          data: { id: exposureId, runId: id, channel: "preview", keys },
        },
      ]);
      for (let i = 0; i < 4; i++)
        await service.ingest([
          event(keys[i], i < 2 ? "save" : "dismiss", {
            channel: "preview",
            reason: "style",
            item: pieces[(day - 1) * 4 + i],
            exposureId,
          }),
        ]);
      // The real store supplies server timestamps; dates are only varied here to exercise the gate.
    }
    store.close();
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(join(root, ".forme-data/learning.sqlite"));
    const rows = db
      .prepare("SELECT ordinal FROM learning_records WHERE kind='exposure' ORDER BY ordinal")
      .all();
    rows.forEach((row, i) =>
      db
        .prepare("UPDATE learning_records SET recorded_at=? WHERE ordinal=?")
        .run(`2026-10-0${i + 1}T12:00:00Z`, row.ordinal),
    );
    db.close();
    await assert.rejects(
      service.select({ runId: candidate.id, engine: "river", expectedRevision: 0 }),
      /consent/,
    );
    const selected = await service.select({
      runId: candidate.id,
      engine: "river",
      expectedRevision: 0,
      allowPreviewTraining: true,
    });
    assert.equal(selected.selected.engine, "river");
    const view = await service.snapshot(profile, pieces);
    assert.equal(view.selectedName, "river");
    assert.ok(view.selectedKeys.length);
    const restricted = { ...profile, settings: { ...profile.settings, excluded: ["Auralee"] } };
    const safe = await service.snapshot(restricted, pieces);
    assert.equal(safe.selectedName, "current");
    assert.equal(safe.items.length, 0);
    const entries = pieces.slice(20).map((item) => ({ item }));
    assert.equal(
      orderEligible(entries, [
        pieces[0].sourceKey,
        entries[2].item.sourceKey,
        entries[2].item.sourceKey,
      ]).length,
      entries.length,
    );
    const reverted = await service.select({ engine: "current", expectedRevision: 1 });
    assert.equal(reverted.selected, null);
    assert.equal(reverted.history.length, 2);
    await service.clear("DELETE LEARNING HISTORY");
    const cleared = await service.exportHistory();
    assert.equal(cleared.events.length, 0);
    assert.equal(cleared.contexts.length, 0);
    assert.equal(cleared.selection.selected, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("withdrawing training feedback invalidates a pinned version without mutating its audit record", async () => {
  const root = mkdtempSync(join(tmpdir(), "forme-learning-"));
  try {
    const pieces = [item(501), item(502), item(503)];
    const rank = async (_root, directory) => {
      const { readFileSync } = await import("node:fs");
      const input = JSON.parse(readFileSync(join(directory, "input.json"))).case;
      return {
        river: {
          mode: "weighted-online-logistic-replayed-10-passes",
          ranking: input.candidateKeys.map((key) => ({ key, score: 1 })),
        },
      };
    };
    const service = learningService({ root, auto: false, rank, now: () => Date.parse(at) });
    await service.snapshot(profile, pieces);
    await service.ingest([event(pieces[0].sourceKey, "save", { item: pieces[0] })]);
    const run = await service.train();
    const store = localLearningStore(root);
    // Seed a selected version to isolate runtime invalidation from the separate promotion-gate test.
    await store.select(0, {
      selected: { runId: run.id, engine: "river", channel: "shopping" },
      history: [],
    });
    store.close();
    assert.equal((await service.snapshot(profile, pieces)).selectedName, "river");
    await service.ingest([event(pieces[0].sourceKey, "unsave")]);
    assert.equal((await service.snapshot(profile, pieces)).selectedName, "current");
    assert.equal((await service.status()).selection.selected.runId, run.id);
    await assert.rejects(
      service.select({ runId: run.id, engine: "river", expectedRevision: 1 }),
      /feedback changed/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("shopping and preview each train their own latest feedback even when contexts interleave", async () => {
  const root = mkdtempSync(join(tmpdir(), "forme-learning-"));
  try {
    const service = learningService({
        root,
        auto: false,
        rank: async () => ({}),
        now: () => Date.parse(at),
      }),
      pieces = [item(701), item(702)];
    await service.snapshot(profile, pieces, { channel: "shopping" });
    await service.snapshot(profile, pieces, { channel: "preview" });
    await service.ingest([event(pieces[0].sourceKey, "save", { item: pieces[0] })]);
    await service.ingest([
      event(pieces[1].sourceKey, "dismiss", {
        item: pieces[1],
        reason: "style",
        channel: "preview",
      }),
    ]);
    const shopping = await service.train(),
      preview = await service.train();
    assert.equal(shopping.channel, "shopping");
    assert.deepEqual(shopping.training, { positive: 1, negative: 0 });
    assert.equal(preview.channel, "preview");
    assert.deepEqual(preview.training, { positive: 0, negative: 1 });
    assert.equal(preview.engines.gorse.mode, "unavailable");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a stale local training lease becomes recoverable after interruption", async () => {
  const root = mkdtempSync(join(tmpdir(), "forme-learning-"));
  try {
    const store = localLearningStore(root);
    store.job({ state: "running", at: "2026-10-24T09:00:00.000Z" });
    store.close();
    const service = learningService({
      root,
      auto: false,
      rank: async () => ({}),
      now: () => Date.parse(at),
    });
    assert.equal((await service.status()).job.state, "interrupted");
    await service.snapshot(profile, [item(801)]);
    await service.train();
    assert.equal((await service.status()).job.state, "complete");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("hosted status with pending feedback never opens a local training store", async () => {
  const root = mkdtempSync(join(tmpdir(), "forme-hosted-status-"));
  const previous = process.env.FORME_DATA_DIR;
  const blocked = join(root, "no-local-storage");
  writeFileSync(blocked, "fixture: local storage must not be opened");
  process.env.FORME_DATA_DIR = blocked;
  const records = [];
  const repository = () => ({
    async list(kind) {
      return records.filter((row) => row.kind === kind);
    },
    async append(batch) {
      for (const row of batch)
        records.push({ ...row, ordinal: records.length + 1, recorded_at: at });
      return batch.map((row) => row.id);
    },
    async selection() {
      return { revision: 0, selected: null, history: [] };
    },
    close() {},
  });
  try {
    const service = learningService({
      root,
      repository,
      canTrain: false,
      now: () => Date.parse(at),
    });
    await service.snapshot(profile, [item(1), item(2)]);
    const status = await service.status();
    assert.equal(status.canTrain, false);
    assert.equal(status.job, null);
    assert.equal(status.selection.selected, null);
    assert.equal(records.filter((row) => row.kind === "context").length, 1);
    await assert.rejects(service.train(), /owner’s computer/);
  } finally {
    if (previous === undefined) delete process.env.FORME_DATA_DIR;
    else process.env.FORME_DATA_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test('status counts feedback without reading catalogue contexts', async () => {
 const root=mkdtempSync(join(tmpdir(),'forme-light-status-'));
 const real=localLearningStore(root);
 try {
  await real.append([{kind:'event',id:randomUUID(),data:event('vinted:1','save',{item:item(1)})}]);
  const repository=()=>({
   list:kind=>{assert.notEqual(kind,'context','status must not download catalogue snapshots');return real.list(kind);},
   selection:()=>real.selection(),close(){},
  });
  const status=await learningService({root,repository,auto:false}).status();
  assert.equal(status.events,1);assert.equal(status.canTrain,true);
 } finally {real.close();rmSync(root,{recursive:true,force:true});}
});

test('training and scheduling use only latest contexts while exports keep the full history', async()=>{
 const root=mkdtempSync(join(tmpdir(),'forme-training-context-heads-'));
 const real=localLearningStore(root);let latestReads=0,fullReads=0;
 const repository=()=>({
  list:kind=>{if(kind==='context'){fullReads++;throw Error('unbounded catalogue read');}return real.list(kind);},
  latestContexts:()=>{latestReads++;return real.latestContexts();},
  append:rows=>real.append(rows),selection:()=>real.selection(),close(){},
 });
 try{
  const old={id:randomUUID(),profile,items:[item(1)],channel:'shopping'};
  await real.append([{kind:'context',id:old.id,data:old}]);
  const latest={id:randomUUID(),profile,items:[item(2),item(3)],channel:'shopping'};
  await real.append([{kind:'context',id:latest.id,data:latest}]);
  const preview={id:randomUUID(),profile,items:[item(4)],channel:'preview'};
  await real.append([{kind:'context',id:preview.id,data:preview}]);
  const service=learningService({root,repository,auto:false,rank:async()=>({}),now:()=>Date.parse(at)});
  const shopping=await service.train({channel:'shopping'}),other=await service.train({channel:'preview'});
  assert.deepEqual(shopping.engines.current.keys,[item(2).sourceKey,item(3).sourceKey]);assert.deepEqual(other.engines.current.keys,[item(4).sourceKey]);
  assert.ok(latestReads>=4);assert.equal(fullReads,0);
  assert.equal((await real.list('context')).length,3);
 }finally{real.close();rmSync(root,{recursive:true,force:true});}
});

test('latest local contexts are owner-scoped and independent across channels',async()=>{
 const root=mkdtempSync(join(tmpdir(),'forme-context-isolation-'));const a=localLearningStore(root,'a'),b=localLearningStore(root,'b');
 try{const rows=['shopping','preview','shopping','preview'].map(channel=>{const id=randomUUID();return {id,kind:'context',data:{id,channel}};});await a.append(rows);await b.append([{id:randomUUID(),kind:'context',data:{channel:'shopping'}}]);
 assert.deepEqual((await a.latestContexts()).map(r=>r.id),rows.slice(-2).map(r=>r.id));assert.equal((await b.latestContexts()).length,1);assert.equal((await a.list('context')).length,4);
 }finally{a.close();b.close();rmSync(root,{recursive:true,force:true});}
});

test('hosted context heads are bounded and full context export is paginated without loss',async()=>{
 const rows=Array.from({length:18},(_,i)=>({id:String(i),ordinal:i+1,kind:'context',data:{channel:i===0?'preview':'shopping',items:['x'.repeat(5000)]}}));
 const delivered=[];
 const client={from(table){assert.equal(table,'learning_records');let filters=[],descending=false,cap=Infinity,offset=0;
  const query={select(){return query;},eq(k,v){filters.push([k,v]);return query;},order(k,options){assert.equal(k,'ordinal');descending=options?.ascending===false;return query;},limit(n){cap=n;return query;},range(a,b){offset=a;cap=b-a+1;return query;},then(resolve){
   const filtered=rows.filter(r=>filters.every(([k,v])=>(k==='data->>channel'?r.data.channel:r[k])===v)).sort((a,b)=>descending?b.ordinal-a.ordinal:a.ordinal-b.ordinal);
   const data=filtered.slice(offset,offset+cap);delivered.push(data.length);return Promise.resolve({data,error:null}).then(resolve);
  }};return query;}};
 const store=hostedLearningStore(client),latest=await store.latestContexts();
 assert.deepEqual(latest.map(r=>r.id),['0','17']);assert.deepEqual(delivered,[1,1],'latest queries never transfer older catalogues');
 delivered.length=0;assert.deepEqual((await store.list('context')).map(r=>r.id),rows.map(r=>r.id));assert.ok(delivered.every(n=>n<=1),'explicit export never uses a bulk catalogue page');
});


test('JSON key order after a database round trip does not detach learned predictions',async()=>{
 const root=mkdtempSync(join(tmpdir(),'forme-canonical-context-')),real=localLearningStore(root);
 const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,row])=>[key,reorder(row)])):value;
 const repository=()=>({list:kind=>real.list(kind),latestContexts:()=>real.latestContexts(),append:rows=>real.append(reorder(rows)),selection:()=>real.selection(),close(){}});
 const rank=async(_root,directory)=>{const keys=JSON.parse(readFileSync(join(directory,'input.json'),'utf8')).case.candidateKeys;return Object.fromEntries(['river','river-regularized','gorse'].map(engine=>[engine,{mode:engine==='gorse'?'tags-and-factorization-machines':'weighted-online-logistic-replayed-10-passes',ranking:keys.map((key,i)=>({key,score:keys.length-i}))}]));};
 try{
  const service=learningService({root,repository,auto:false,rank,now:()=>Date.parse(at)});
  const pieces=[item(1),item(2),item(3)];await service.snapshot(profile,pieces);const trained=await service.train();
  const next=await service.snapshot(reorder(profile),pieces);
  for(const engine of ['river','river-regularized','gorse'])assert.equal(next.engines[engine].mode,'learned',engine);
  const predicted=(await real.list('run')).at(-1).data;assert.equal(predicted.modelRunId,trained.id);
  const changed=await service.snapshot(profile,pieces.map((row,i)=>i===0?{...row,price:row.price+1}:row));assert.equal(changed.engines.river.mode,'unavailable','actual listing changes still invalidate the frozen model');
  const filtered=await service.snapshot({...profile,settings:{...profile.settings,excluded:['Auralee']}},pieces);assert.equal(filtered.items.length,0,'real preference changes still invalidate matching');
 }finally{real.close();rmSync(root,{recursive:true,force:true});}
});
