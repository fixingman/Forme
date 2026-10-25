import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {learningService} from '../../lib/server/learning.mjs';
import {localLearningStore} from '../../lib/server/learning-store.mjs';
import {activeFeedback,trainingExamples,tasteFeatures,evaluateEvidence,orderEligible,LABEL_POLICY} from '../../lib/domain/learning.mjs';
const at='2026-10-24T10:00:00.000Z';
const item=value=>{const id=value+20000;return ({id,source:'vinted',sourceId:String(id),sourceKey:`vinted:${id}`,sourceUrl:`https://www.vinted.se/items/${id}-piece`,brand:'Auralee',title:'Black wool jacket',price:451.69,currency:'SEK',size:'M',gender:'men',genderSource:'provider',condition:'Good',image:'',imageUrl:'https://images1.vinted.net/fixture.webp',category:'Jacket',style:'Minimalism',rarity:0,age:0,fetchedAt:at,observedAt:at});};
const profile={settings:{following:['Our Legacy'],excluded:[],styles:['Minimalism'],styleRules:{},saved:[],dismissed:[],tasteFeedback:[],sizing:{enabled:false,selected:[],includeOneSize:true,includeUnspecified:true},gender:{selected:['men','unisex'],includeUnknown:false}},savedListings:[]};
const event=(key,action,extra={})=>({id:randomUUID(),key,action,channel:'shopping',occurredAt:at,...extra});
test('reasons route to separate learning semantics and corrections are canonical',()=>{
 const piece=item(1),hide=event(piece.sourceKey,'dismiss',{item:piece,reason:'price'}),save=event(piece.sourceKey,'save',{item:piece});
 const rows=[{ordinal:1,data:hide},{ordinal:2,data:save}];assert.equal(trainingExamples(rows,'shopping').length,0);
 rows.push({ordinal:3,data:event(piece.sourceKey,'reason',{targetId:hide.id,reason:'style'})});assert.equal(trainingExamples(rows,'shopping')[0].label,0);
 rows.push({ordinal:4,data:event(piece.sourceKey,'restore')});assert.equal(trainingExamples(rows,'shopping')[0].label,1);
 rows.push({ordinal:5,data:event(piece.sourceKey,'unsave')});assert.equal(trainingExamples(rows,'shopping').length,0);
 assert.deepEqual(tasteFeatures({'price-band:8':1,'brand:auralee':1}),{'brand:auralee':1});
});
test('journal is idempotent, owner scoped, rejects ID reuse and binds reasons to their decision',async()=>{
 const root=mkdtempSync(join(tmpdir(),'forme-learning-'));try{
  const service=learningService({root,now:()=>Date.parse(at),auto:false}),piece=item(2),hide=event(piece.sourceKey,'dismiss',{item:piece});
  await service.ingest([hide]);await service.ingest([hide]);assert.equal((await service.exportHistory()).events.length,1);
  await assert.rejects(service.ingest([{...hide,reason:'style'}]),/reused/);
  await assert.rejects(service.ingest([event(piece.sourceKey,'reason',{reason:'style',targetId:randomUUID()})]),/Original feedback/);
  const foreign=localLearningStore(root,'other');assert.equal((await foreign.list('event')).length,0);foreign.close();
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('snapshot predicts before feedback; learning uses style negatives only and preserves saves',async()=>{
 const root=mkdtempSync(join(tmpdir(),'forme-learning-'));let cases=[];try{
  const pieces=[item(3),item(4),item(5),item(6)];
  const rank=async(_root,directory)=>{const {readFileSync}=await import('node:fs');const data=JSON.parse(readFileSync(join(directory,'input.json'))).case;cases.push(data);return Object.fromEntries(['river','river-regularized','gorse'].map(name=>[name,{ranking:[...data.candidateKeys].reverse().map(key=>({key,score:1})),mode:name==='gorse'?'tags-and-factorization-machines':'weighted-online-logistic-replayed-10-passes'}]));};
  const service=learningService({root,now:()=>Date.parse(at),auto:false,rank}),snapshot=await service.snapshot(profile,pieces);
  const exposure={id:randomUUID(),runId:snapshot.id,keys:pieces.map(p=>p.sourceKey),channel:'shopping'};await service.exposure(exposure);
  const style=event(pieces[1].sourceKey,'dismiss',{item:pieces[1],reason:'style',exposureId:exposure.id});
  await service.ingest([event(pieces[0].sourceKey,'save',{item:pieces[0],exposureId:exposure.id}),style,event(pieces[2].sourceKey,'dismiss',{item:pieces[2],reason:'price',exposureId:exposure.id})]);
  const run=await service.train();assert.equal(run.training.positive,1);assert.equal(run.training.negative,1);assert.equal(cases[0].examples.length,2);assert.ok(cases[0].examples.every(e=>!Object.keys(e.features).some(name=>name.startsWith('price'))));
  const report=(await service.status()).reports[0];assert.equal(report.counts.price,1);assert.equal(report.engines.river.status,'insufficient-evidence');
  await assert.rejects(service.select({runId:run.id,engine:'river',expectedRevision:0}),/enough forward/);
  const rolled=await service.select({engine:'current',expectedRevision:0});assert.equal(rolled.selected,null);
  await assert.rejects(service.select({engine:'current',expectedRevision:0}),/another tab/);
  const before=await service.exportHistory();await service.ingest([event(pieces[1].sourceKey,'restore')]);const next=await service.train();assert.equal(next.training.negative,0);assert.equal(before.runs.find(r=>r.id===run.id).data.training.negative,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('forward evidence requires prior predictions and multiple days; no unjudged negatives',()=>{
 const events=[],exposures=[],runs=[];let ordinal=0;
 for(let day=1;day<=5;day++){
  const keys=Array.from({length:4},(_,i)=>`vinted:${day*10+i}`),id=randomUUID(),exposureId=randomUUID();
  runs.push({id,data:{id,cutoff:ordinal,trainingKeys:[],policy:LABEL_POLICY,engines:{current:{mode:'current',keys:[...keys].reverse()},river:{mode:'learned',keys},'river-regularized':{mode:'fallback',keys},gorse:{mode:'unavailable',keys}}}});
  exposures.push({id:exposureId,recorded_at:`2026-10-0${day}T12:00:00Z`,data:{runId:id,keys}});
  keys.forEach((key,i)=>events.push({ordinal:++ordinal,data:event(key,i<2?'save':'dismiss',{channel:'preview',item:item(Number(key.split(':')[1])),reason:'style',exposureId})}));
 }
 const report=evaluateEvidence({events,exposures,runs});assert.equal(report.engines.river.eligible,true);assert.equal(report.engines.gorse.eligible,false);assert.equal(report.engines.river.pairs,20);
 const leaked=structuredClone(runs);leaked.forEach(run=>run.data.trainingKeys=run.data.engines.current.keys);assert.equal(evaluateEvidence({events,exposures,runs:leaked}).engines.river.eligible,false);
});
test('qualified preview promotion needs consent, preserves hard eligibility, rolls back and clears privately',async()=>{
 const root=mkdtempSync(join(tmpdir(),'forme-learning-'));
 try {
  const pieces=Array.from({length:30},(_,i)=>item(100+i));
  const rank=async(_root,directory)=>{const {readFileSync}=await import('node:fs');const data=JSON.parse(readFileSync(join(directory,'input.json'))).case;return {river:{ranking:[...data.candidateKeys].reverse().map(key=>({key,score:1})),mode:'weighted-online-logistic-replayed-10-passes'}};};
  const service=learningService({root,auto:false,rank,now:()=>Date.parse(at)});
  await service.snapshot(profile,pieces,{channel:'preview',comparison:true});
  const candidate=(await service.status()).runs.at(-1),store=localLearningStore(root);
  // Five separate historical frozen pools, each with held-out judgments delivered after prediction.
  for(let day=1;day<=5;day++){
   const keys=pieces.slice((day-1)*4,day*4).map(listingKey=>listingKey.sourceKey),id=randomUUID(),exposureId=randomUUID();
   await store.append([{kind:'run',id,data:{...candidate,id,predictionOnly:true,cutoff:0,trainingKeys:[],engines:{current:{mode:'current',keys:[...keys].reverse()},river:{mode:'learned',keys}}}},{kind:'exposure',id:exposureId,data:{id:exposureId,runId:id,channel:'preview',keys}}]);
   for(let i=0;i<4;i++)await service.ingest([event(keys[i],i<2?'save':'dismiss',{channel:'preview',reason:'style',item:pieces[(day-1)*4+i],exposureId})]);
   // The real store supplies server timestamps; dates are only varied here to exercise the gate.
  }
  store.close();
  const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(join(root,'.forme-data/learning.sqlite'));
  const rows=db.prepare("SELECT ordinal FROM learning_records WHERE kind='exposure' ORDER BY ordinal").all();rows.forEach((row,i)=>db.prepare('UPDATE learning_records SET recorded_at=? WHERE ordinal=?').run(`2026-10-0${i+1}T12:00:00Z`,row.ordinal));db.close();
  await assert.rejects(service.select({runId:candidate.id,engine:'river',expectedRevision:0}),/consent/);
  const selected=await service.select({runId:candidate.id,engine:'river',expectedRevision:0,allowPreviewTraining:true});assert.equal(selected.selected.engine,'river');
  const view=await service.snapshot(profile,pieces);assert.equal(view.selectedName,'river');assert.ok(view.selectedKeys.length);
  const restricted={...profile,settings:{...profile.settings,excluded:['Auralee']}};
  const safe=await service.snapshot(restricted,pieces);assert.equal(safe.selectedName,'current');assert.equal(safe.items.length,0);
  const entries=pieces.slice(20).map(item=>({item}));assert.equal(orderEligible(entries,[pieces[0].sourceKey,entries[2].item.sourceKey,entries[2].item.sourceKey]).length,entries.length);
  const reverted=await service.select({engine:'current',expectedRevision:1});assert.equal(reverted.selected,null);assert.equal(reverted.history.length,2);
  await service.clear('DELETE LEARNING HISTORY');const cleared=await service.exportHistory();assert.equal(cleared.events.length,0);assert.equal(cleared.contexts.length,0);assert.equal(cleared.selection.selected,null);
 }finally{rmSync(root,{recursive:true,force:true});}
});
