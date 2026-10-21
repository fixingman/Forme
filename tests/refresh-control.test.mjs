import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {refreshControl} from '../lib/server/refresh-control.mjs';
import {makeRefreshPlan} from '../lib/refresh-plan.mjs';
import {feedbackReview} from '../lib/feedback-review.mjs';
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
