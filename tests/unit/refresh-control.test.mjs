import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {refreshControl} from '../../lib/server/refresh-control.mjs';
import {makeRefreshPlan} from '../../lib/domain/refresh-plan.mjs';
import {feedbackReview} from '../../lib/domain/feedback-review.mjs';
const settings={following:['Our Legacy'],excluded:['Zara'],saved:[],dismissed:[],gender:{selected:['men','unisex'],includeUnknown:false},sizing:{enabled:true,selected:['M'],groups:{clothing:['M'],waist:[],shoes:[],other:[]},includeOneSize:true,includeUnspecified:true}};
async function setup(request){const root=await mkdtemp(join(tmpdir(),'forme-refresh-'));await mkdir(join(root,'public/data'),{recursive:true});await writeFile(join(root,'public/data/vinted.json'),JSON.stringify({fetchedAt:'2026-10-20T10:00:00Z',items:[]}));return {root,control:refreshControl({root,request,apiKey:'fake',pause:async()=>{}})};}
test('planning is free, exact IDs are verified, and unknown size IDs are never invented',async()=>{
 let calls=0;const {root,control}=await setup(async()=>{calls++;throw new Error('Must not request');});try{
 const plan=await control.plan(settings,{scope:'discover',limit:3});assert.equal(plan.maximumCredits,15);assert.equal(plan.exactBrandJobs,3);assert.deepEqual(plan.jobs.map(job=>job.brandId),['2053426','295938','663899']);assert.equal(calls,0);assert.equal((await control.status()).reservedCredits,0);
 assert.match(plan.sizeFiltering,/after fetching/);assert.equal(plan.jobs[0].catalogIds,'5');
 const following=makeRefreshPlan({...settings,following:['Unmapped Brand']},{scope:'following',limit:1});assert.equal(following.exactBrandJobs,0);
 }finally{control.close();await rm(root,{recursive:true,force:true});}
});
test('past pilot credits count toward the cap, blocked runs send nothing and cap changes are explicit',async()=>{
 let calls=0;const {root,control}=await setup(async()=>{calls++;throw new Error('Should not call');});try{
 await writeFile(join(root,'.forme-data/discovery-pilot-v1.json'),JSON.stringify({records:[{fetchedAt:new Date().toISOString(),reservedCredits:15,reportedCredits:15}]}));
 const plan=await control.plan(settings,{scope:'discover',limit:1});assert.equal((await control.status()).remainingCredits,0);
 await assert.rejects(control.run(plan.id,settings),/Daily credit cap/);assert.equal(calls,0);
 control.setBudget(25);assert.equal((await control.status()).remainingCredits,10);assert.throws(()=>control.setBudget(1000));
 }finally{control.close();await rm(root,{recursive:true,force:true});}
});
test('turning the daily cap off preserves spending and reservations, survives reopen and can be reversed',async()=>{
 let calls=0;const {root,control}=await setup(async()=>{calls++;throw Error('No collection authorized');});let reopened;
 try{
  const day=new Date().toISOString().slice(0,10);
  await writeFile(join(root,'.forme-data/usage.json'),JSON.stringify({[day]:{reservedCredits:40,reportedCredits:35}}));
  control.setBudget(0);assert.equal((await control.status()).remainingCredits,null);
  const plan=await control.plan(settings,{scope:'discover',limit:3});await control.enqueue(plan.id,settings);await control.enqueue(plan.id,settings);
  assert.equal(calls,0);assert.equal((await control.status()).reservedCredits,55);
  reopened=refreshControl({root,request:async()=>{throw Error('No request');}});
  assert.equal((await reopened.status()).dailyCap,0);assert.equal((await reopened.status()).remainingCredits,null);
  reopened.setBudget(15);assert.equal((await reopened.status()).remainingCredits,0);
  reopened.setBudget(600);assert.equal((await reopened.status()).remainingCredits,545);
  for(const cap of [-1,1,4,601,null,NaN])assert.throws(()=>reopened.setBudget(cap));
  assert.equal((await reopened.status()).reservedCredits,55);assert.equal(calls,0);
 }finally{reopened?.close();control.close();await rm(root,{recursive:true,force:true});}
});
test('large brand quotes are bounded to 600 credits and never send a request or reserve on preview',async()=>{
 let calls=0;const {root,control}=await setup(async()=>{calls++;throw Error('No collection authorized');});try{
  const many={...settings,following:Array.from({length:121},(_,index)=>`Brand ${index}`)};
  const plan=await control.plan(many,{scope:'following',limit:120});
  assert.equal(plan.jobs.length,120);assert.equal(plan.maximumCredits,600);assert.equal(plan.maximumItems,2400);
  assert.equal(new Set(plan.jobs.map(job=>job.brand)).size,120);
  await assert.rejects(control.plan(many,{scope:'following',limit:121}),/1–120/);
  assert.equal((await control.status()).reservedCredits,0);assert.equal(calls,0);
 }finally{control.close();await rm(root,{recursive:true,force:true});}
});
test('a paid run uses exact brand/category filters, checkpoints results and never repeats a completed plan',async()=>{
 let calls=0;const {root,control}=await setup(async input=>{calls++;const url=new URL(input);assert.equal(url.searchParams.get('brand_ids'),'2053426');assert.equal(url.searchParams.get('catalog_ids'),'5');assert.equal(url.searchParams.has('size_ids'),false);return Response.json({items:[{id:90001,title:'Auralee cotton shirt',brand_title:'Auralee',size_title:'M',price:{amount:'100',currency_code:'SEK'},url:'https://www.vinted.se/items/90001-shirt',photo:{url:'https://images1.vinted.net/test.webp'}}]},{headers:{'x-credits-used':'5'}});});try{
 const plan=await control.plan(settings,{scope:'discover',limit:1});const result=await control.run(plan.id,settings);assert.equal(result.status,'complete');assert.equal(result.accepted,1);assert.equal(result.eligible,1);
 await control.run(plan.id,settings);assert.equal(calls,1);const status=await control.status();assert.equal(status.reportedCredits,5);assert.equal(status.reservedCredits,5);
 const snapshot=JSON.parse(await readFile(join(root,'public/data/vinted.json'),'utf8'));assert.equal(snapshot.items[0].genderSource,'search-filter');
 }finally{control.close();await rm(root,{recursive:true,force:true});}
});
test('missing billing stops once, retains reservations and blocks resubmission; changed preferences invalidate quotes',async()=>{
 let calls=0;const {root,control}=await setup(async()=>{calls++;return Response.json({items:[]});});try{
 const stale=await control.plan(settings,{scope:'discover',limit:1});await assert.rejects(control.run(stale.id,{...settings,excluded:[]}),/preferences changed/);assert.equal(calls,0);
 const plan=await control.plan(settings,{scope:'discover',limit:3});await assert.rejects(control.run(plan.id,settings),/Unexpected provider billing/);assert.equal(calls,1);
 const repeat=await control.run(plan.id,settings);assert.equal(repeat.status,'failed');assert.equal(calls,1);assert.equal((await control.status()).remainingCredits,0);
 }finally{control.close();await rm(root,{recursive:true,force:true});}
});
test('the shared collection lock blocks concurrent refreshes without reserving or sending',async()=>{
 let calls=0;const {root,control}=await setup(async()=>{calls++;throw new Error('No');});try{
 const plan=await control.plan(settings,{scope:'discover',limit:1});await writeFile(join(root,'.forme-data/refresh.lock'),'existing');await assert.rejects(control.run(plan.id,settings),/already running/);assert.equal(calls,0);assert.equal((await control.status()).reservedCredits,0);
 }finally{control.close();await rm(root,{recursive:true,force:true});}
});
test('feedback review separates signals from measured performance and preserves missing hidden items for restoration',()=>{
 const source=[{id:1,sourceKey:'vinted:1',brand:'Auralee',title:'Cotton shirt',gender:'men',size:'M',age:1},{id:2,sourceKey:'vinted:2',brand:'Lemaire',title:'Wool jacket',gender:'men',size:'M',age:1}];
 const review=feedbackReview(source,{...settings,saved:[1],dismissed:['vinted:2','vinted:missing']});assert.equal(review.savedCount,1);assert.equal(review.hiddenCount,2);assert.equal(review.hidden[1].item,null);assert.equal(review.brands.find(row=>row.brand==='Lemaire').hidden,1);assert.equal(review.eligibleCount,1);
});

test('unexpected reported charges also consume the cap and stop further calls',async()=>{
 const {root,control}=await setup(async()=>Response.json({items:[]},{headers:{'x-credits-used':'25'}}));try{
 const plan=await control.plan(settings,{scope:'discover',limit:1});await assert.rejects(control.run(plan.id,settings),/Unexpected provider billing/);
 const status=await control.status();assert.equal(status.reportedCredits,25);assert.equal(status.reservedCredits,5);assert.equal(status.remainingCredits,0);
 }finally{control.close();await rm(root,{recursive:true,force:true});}
});
const providerReply=id=>Response.json({items:[{id,title:'Auralee cotton shirt',brand_title:'Auralee',size_title:'M',price:{amount:'100',currency_code:'SEK'},url:`https://www.vinted.se/items/${id}-shirt`,photo:{url:'https://images1.vinted.net/test.webp'}}]},{headers:{'x-credits-used':'5'}});
test('enqueue reserves the budget, sends nothing, is idempotent and the worker runs it exactly once',async()=>{
 let calls=0;const {root,control}=await setup(async()=>{calls++;return providerReply(91001);});try{
 const plan=await control.plan(settings,{scope:'discover',limit:1});
 const queued=await control.enqueue(plan.id,settings);assert.equal(queued.status,'queued');assert.equal(calls,0);
 let status=await control.status();assert.equal(status.reservedCredits,5);assert.equal(status.running,true);assert.equal(status.remainingCredits,10);
 assert.equal((await control.enqueue(plan.id,settings)).status,'queued');assert.equal(status.reservedCredits,5);
 const done=await control.work();assert.equal(done.status,'complete');assert.equal(done.accepted,1);assert.equal(calls,1);
 assert.equal((await control.work()).status,'idle');assert.equal(calls,1);
 status=await control.status();assert.equal(status.running,false);assert.equal(status.reportedCredits,5);
 assert.equal((await control.enqueue(plan.id,settings)).status,'complete');assert.equal(calls,1);
 }finally{control.close();await rm(root,{recursive:true,force:true});}
});
test('only one worker runs at a time and a second plan cannot be queued over an active one',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});let calls=0;
 const {root,control}=await setup(async()=>{calls++;await gate;return providerReply(91002);});try{
 const plan=await control.plan(settings,{scope:'discover',limit:1});await control.enqueue(plan.id,settings);
 const first=control.work({workerId:'a'});await new Promise(resolve=>setTimeout(resolve,50));
 assert.equal((await control.work({workerId:'b'})).status,'busy');
 const second=await control.plan(settings,{scope:'discover',limit:1});await assert.rejects(control.enqueue(second.id,settings),/Another refresh is running/);
 release();assert.equal((await first).status,'complete');assert.equal(calls,1);
 }finally{control.close();await rm(root,{recursive:true,force:true});}
});
test('a worker that stops heartbeating is marked interrupted, keeps its reservation and is never retried',async()=>{
 let calls=0;const {root,control}=await setup(async()=>{calls++;return providerReply(91003);});try{
 const plan=await control.plan(settings,{scope:'discover',limit:1});await control.enqueue(plan.id,settings);
 const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(join(root,'.forme-data/refresh.sqlite'));
 db.prepare("UPDATE runs SET status='running',worker_id='dead',heartbeat_at=? WHERE id=?").run(new Date(Date.now()-10*60000).toISOString(),plan.id);db.close();
 await writeFile(join(root,'.forme-data/refresh.lock'),JSON.stringify({pid:2147483646,workerId:'dead'}));
 assert.equal(control.recover({staleMs:5*60000}).length,1);
 const status=await control.status();assert.equal(status.running,false);assert.equal(status.reservedCredits,5);assert.equal(status.remainingCredits,10);
 assert.equal(status.runs[0].status,'interrupted');assert.match(status.runs[0].result.error,/worker stopped/);
 assert.equal((await control.work()).status,'idle');assert.equal(calls,0);
 assert.equal(control.recover().length,0);
 }finally{control.close();await rm(root,{recursive:true,force:true});}
});
test('recovery leaves a live worker alone',async()=>{
 const {root,control}=await setup(async()=>providerReply(91004));try{
 const plan=await control.plan(settings,{scope:'discover',limit:1});await control.enqueue(plan.id,settings);
 const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(join(root,'.forme-data/refresh.sqlite'));
 db.prepare("UPDATE runs SET status='running',worker_id='live',heartbeat_at=? WHERE id=?").run(new Date().toISOString(),plan.id);db.close();
 assert.equal(control.recover().length,0);assert.equal((await control.status()).running,true);
 }finally{control.close();await rm(root,{recursive:true,force:true});}
});
