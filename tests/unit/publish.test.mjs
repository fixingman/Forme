import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publishSnapshot,publishPreview} from '../../lib/server/publish.mjs';
import {readPublishedSnapshot} from '../../lib/server/hosted-listings.mjs';
import {trustedSnapshot} from '../../lib/domain/data-trust.mjs';
const fixture=JSON.parse(readFileSync(new URL('../fixtures/vinted.json',import.meta.url),'utf8'));
// In-memory stand-in for the three table operations the publisher and reader use.
function fakeDb({existing=0,failOn=null}={}){
 const state={meta:null,rows:new Map(),calls:[]};
 for(let i=0;i<existing;i++)state.rows.set(`old:${i}`,{source_key:`old:${i}`,data:{},published_at:'2000-01-01T00:00:00.000Z'});
 const table=name=>({
  select:(cols,opts)=>{
   if(opts?.head)return Promise.resolve({count:state.rows.size,error:null});
   const q={eq:()=>q,maybeSingle:async()=>({data:name==='snapshot_meta'?state.meta:null,error:null}),order:()=>q,range:async(from,to)=>({data:[...state.rows.values()].sort((a,b)=>a.source_key<b.source_key?-1:1).slice(from,to+1).map(r=>({data:r.data})),error:null})};
   return q;
  },
  upsert:async(payload)=>{state.calls.push(['upsert',name,Array.isArray(payload)?payload.length:1]);if(failOn===name+':'+state.calls.filter(c=>c[1]===name).length)return {error:{message:'boom'}};if(name==='snapshot_meta')state.meta={...payload};else for(const r of payload)state.rows.set(r.source_key,r);return {error:null};},
  delete:()=>({lt:async(col,val)=>{state.calls.push(['prune',val]);for(const [k,r] of state.rows)if(r[col]<val)state.rows.delete(k);return {error:null};}})
 });
 return {state,from:table};
}
test('publishing writes metadata, upserts in chunks and prunes only older rows',async()=>{
 const db=fakeDb({existing:3});const now=new Date('2026-10-22T10:00:00Z');
 const result=await publishSnapshot({supabase:db,snapshot:fixture,now,chunk:10});
 const trusted=trustedSnapshot(fixture);
 assert.equal(result.published,trusted.items.length);assert.equal(result.previous,3);
 assert.deepEqual(db.state.calls.filter(c=>c[1]==='listings').map(c=>c[2]),[10,10,10].slice(0,Math.ceil(trusted.items.length/10)).map((n,i,arr)=>i===arr.length-1?trusted.items.length-10*i:n));
 assert.equal(db.state.rows.size,trusted.items.length,'old rows were pruned');assert.ok(![...db.state.rows.keys()].some(k=>k.startsWith('old:')));
 assert.equal(db.state.meta.fetched_at,trusted.fetchedAt);assert.equal(db.state.meta.published_at,now.toISOString());
});
test('a published snapshot reads back through the hosted reader and passes the same trust checks',async()=>{
 const lastCollectionCheckAt='2026-10-23T10:00:00Z';
 const db=fakeDb();await publishSnapshot({supabase:db,snapshot:{...fixture,lastCollectionCheckAt},chunk:7});
 const back=await readPublishedSnapshot(db);const trusted=trustedSnapshot(fixture);
 assert.equal(back.lastCollectionCheckAt,lastCollectionCheckAt);
 assert.equal(back.items.length,trusted.items.length);assert.equal(back.fetchedAt,new Date(trusted.fetchedAt).toISOString());
 assert.deepEqual(trustedSnapshot(back).items.map(i=>i.sourceKey).sort(),trusted.items.map(i=>i.sourceKey).sort());
 assert.equal(await readPublishedSnapshot(fakeDb()),null);
});
test('a mid-publish failure never prunes, so the previous snapshot stays complete',async()=>{
 const db=fakeDb({existing:5,failOn:'listings:2'});
 await assert.rejects(publishSnapshot({supabase:db,snapshot:fixture,chunk:10}),/Could not write listings/);
 assert.ok(!db.state.calls.some(c=>c[0]==='prune'));assert.ok([...db.state.rows.keys()].filter(k=>k.startsWith('old:')).length===5);
});
test('it refuses an empty snapshot and an accidental large shrink unless forced',async()=>{
 await assert.rejects(publishSnapshot({supabase:fakeDb(),snapshot:{...fixture,items:[]}}),/no valid listings/);
 const big=fakeDb({existing:100});await assert.rejects(publishSnapshot({supabase:big,snapshot:fixture}),/Refusing to replace 100/);
 assert.equal(big.state.calls.length,0,'nothing was written');
 assert.ok((await publishSnapshot({supabase:fakeDb({existing:100}),snapshot:fixture,force:true})).published>0);
});

test('the preview compares this computer with the hosted site and writes nothing',async()=>{
 const db=fakeDb({existing:3});db.state.meta={fetched_at:'2026-10-20T00:00:00.000Z',published_at:'2026-10-21T00:00:00.000Z'};
 const trusted=trustedSnapshot(fixture);
 const preview=await publishPreview({supabase:db,snapshot:fixture});
 assert.equal(preview.local.listings,trusted.items.length);assert.equal(preview.local.fetchedAt,trusted.fetchedAt);
 assert.deepEqual(preview.hosted,{listings:3,fetchedAt:'2026-10-20T00:00:00.000Z',publishedAt:'2026-10-21T00:00:00.000Z'});
 assert.equal(preview.blocked,null);
 assert.deepEqual(db.state.calls,[],'no upsert or prune happened');assert.equal(db.state.rows.size,3);
});
test('a first publish has nothing hosted yet, and the preview says so',async()=>{
 const preview=await publishPreview({supabase:fakeDb(),snapshot:fixture});
 assert.deepEqual(preview.hosted,{listings:0,fetchedAt:null,publishedAt:null});assert.equal(preview.blocked,null);
});
test('the preview says up front when a publish would be refused, using the same rule as publishing',async()=>{
 const db=fakeDb({existing:2000});
 const preview=await publishPreview({supabase:db,snapshot:fixture});
 assert.match(preview.blocked,/Publishing would replace 2000 hosted listings with \d+/);assert.match(preview.blocked,/--force/);
 await assert.rejects(publishSnapshot({supabase:db,snapshot:fixture}),/Refusing to replace 2000/,'publishing agrees with the preview');
 assert.equal((await publishPreview({supabase:fakeDb({existing:2000}),snapshot:{...fixture,items:[]}})).blocked,'This computer has no valid listings to publish.');
});
test('a failing read is reported instead of guessed',async()=>{
 const broken={from:()=>({select:()=>Promise.resolve({count:null,error:{message:'offline'}})})};
 await assert.rejects(publishPreview({supabase:broken,snapshot:fixture}),/Could not read the published listing count: offline/);
});
