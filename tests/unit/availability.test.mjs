import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {refreshControl} from '../../lib/server/refresh-control.mjs';
import {makeAvailabilityPlan,availabilityFromItem} from '../../lib/domain/availability-plan.mjs';
import {availability,canBrowse,trustedSnapshot} from '../../lib/domain/data-trust.mjs';
import {normalizeVinted} from '../../lib/domain/vinted-normalize.mjs';
const fetchedAt='2026-10-20T10:00:00.000Z';
const raw=id=>({id,title:`Auralee cotton shirt ${id}`,brand_title:'Auralee',size_title:'M',price:{amount:'100',currency_code:'SEK'},url:`https://www.vinted.se/items/${id}-shirt`,photo:{url:'https://images1.vinted.net/test.webp'}});
const settings=saved=>({following:['Auralee'],excluded:[],saved,dismissed:[],gender:{selected:['men','unisex','women'],includeUnknown:true},sizing:{enabled:false,selected:[],groups:{clothing:[],waist:[],shoes:[],other:[]},includeOneSize:true,includeUnspecified:true}});
async function setup(request,ids=[90010,90011,90012]){const root=await mkdtemp(join(tmpdir(),'forme-avail-'));await mkdir(join(root,'public/data'),{recursive:true});const items=ids.map(id=>normalizeVinted(raw(id),fetchedAt));await writeFile(join(root,'public/data/vinted.json'),JSON.stringify({fetchedAt,items}));const control=refreshControl({root,request,apiKey:'fake',pause:async()=>{}});control.setBudget(50);return {root,items,control};}
const detail=flags=>Response.json({item:{is_closed:false,can_buy:true,is_hidden:false,is_reserved:false,...flags}},{headers:{'x-credits-used':'10'}});
test('item flags map to states exactly as the provider documents them',()=>{
 assert.equal(availabilityFromItem({is_closed:false,can_buy:true,is_hidden:false,is_reserved:false}),'available');
 assert.equal(availabilityFromItem({is_closed:true,can_buy:false,is_hidden:false,is_reserved:false}),'sold');
 assert.equal(availabilityFromItem({is_closed:true,can_buy:false,is_hidden:true,is_reserved:false}),'unavailable');
 assert.equal(availabilityFromItem({is_closed:false,can_buy:false,is_hidden:false,is_reserved:true}),'reserved');
 assert.equal(availabilityFromItem({is_closed:'yes'}),null);assert.equal(availabilityFromItem(null),null);
});
test('the plan covers saved Vinted items only, skips closed and recently checked ones, and costs 10 credits each',()=>{
 const items=[90010,90011,90012,90013].map(id=>normalizeVinted(raw(id),fetchedAt));
 items[1]={...items[1],availability:'sold',availabilitySource:'provider',availabilityObservedAt:'2026-10-20T12:00:00.000Z'};
 items[2]={...items[2],availability:'available',availabilitySource:'provider',availabilityObservedAt:'2026-10-21T09:00:00.000Z'};
 const now=Date.parse('2026-10-21T10:00:00Z');
 const plan=makeAvailabilityPlan(settings([90010,90011,90012]),{limit:3},{items},now);
 assert.deepEqual(plan.jobs.map(job=>job.itemId),['90010']);assert.equal(plan.maximumCredits,10);assert.equal(plan.kind,'availability');assert.match(plan.coverage,/1 of 3 saved/);
 assert.equal(makeAvailabilityPlan(settings([]),{},{items},now).jobs.length,0);
 assert.throws(()=>makeAvailabilityPlan(settings([90010]),{limit:9},{items},now),/1–3/);
});
test('planning and enqueueing send nothing; the worker checks each item once, records provenance and survives a search refresh',async()=>{
 const urls=[];const {root,items,control}=await setup(async input=>{urls.push(String(input));return String(input).includes('90010')?detail({is_closed:true,can_buy:false}):detail({});});
 try{
 const plan=await control.plan(settings([90010,90011]),{scope:'availability',limit:2});assert.equal(plan.maximumCredits,20);assert.equal(urls.length,0);
 await control.enqueue(plan.id,settings([90010,90011]));assert.equal(urls.length,0);assert.equal((await control.status()).reservedCredits,0+20);
 const done=await control.work();assert.equal(done.status,'complete');assert.equal(done.checked,2);assert.equal(done.sold,1);assert.equal(done.available,1);
 assert.equal(urls.length,2);assert.ok(urls.every(url=>/\/v1\/vinted\/items\/\d+\?market=se$/.test(url)));
 const snapshot=JSON.parse(await readFile(join(root,'public/data/vinted.json'),'utf8')),byId=Object.fromEntries(snapshot.items.map(item=>[item.id,item]));
 assert.equal(byId[90010].availability,'sold');assert.equal(byId[90010].availabilitySource,'provider');assert.ok(Date.parse(byId[90010].availabilityObservedAt)>Date.parse(fetchedAt));
 assert.equal(availability(byId[90010]).state,'sold');assert.equal(canBrowse(byId[90010]),false);assert.equal(canBrowse(byId[90011]),true);assert.equal(availability(byId[90011]).label,'Available when last checked');
 const trusted=trustedSnapshot(snapshot,Date.now());assert.equal(trusted.items.length,3);assert.equal(trusted.quality.rejected,0);
 const refreshed=normalizeVinted(raw(90010),'2026-10-22T10:00:00.000Z',byId[90010]);assert.equal(refreshed.availability,'sold');assert.equal(refreshed.availabilityObservedAt,byId[90010].availabilityObservedAt);
 const forgotten=normalizeVinted(raw(90011),'2026-10-22T10:00:00.000Z',byId[90011]);assert.equal(forgotten.availability,'unknown');
 const status=await control.status();assert.equal(status.reportedCredits,20);
 }finally{control.close();await rm(root,{recursive:true,force:true});}
});
test('a removed listing (404) is recorded as unavailable without being charged; hidden is not reported as sold',async()=>{
 const {root,control}=await setup(async input=>String(input).includes('90010')?new Response('{}',{status:404}):detail({is_closed:true,can_buy:false,is_hidden:true}),[90010,90011]);
 try{
 const plan=await control.plan(settings([90010,90011]),{scope:'availability',limit:2});const done=await control.run(plan.id,settings([90010,90011]));
 assert.equal(done.status,'complete');assert.equal(done.unavailable,2);assert.equal(done.sold,0);assert.equal((await control.status()).reportedCredits,10);
 }finally{control.close();await rm(root,{recursive:true,force:true});}
});
test('unexpected billing or a malformed response stops the run, keeps the reservation and never retries',async()=>{
 let calls=0;const {root,control}=await setup(async()=>{calls++;return Response.json({item:{is_closed:false,can_buy:true}},{headers:{'x-credits-used':'25'}});});
 try{
 const plan=await control.plan(settings([90010,90011]),{scope:'availability',limit:2});await assert.rejects(control.run(plan.id,settings([90010,90011])),/Unexpected provider billing/);
 assert.equal(calls,1);const status=await control.status();assert.equal(status.runs[0].status,'failed');assert.ok(status.reservedCredits>=20);assert.equal(status.reportedCredits,25);
 assert.equal((await control.run(plan.id,settings([90010,90011]))).status,'failed');assert.equal(calls,1);
 }finally{control.close();await rm(root,{recursive:true,force:true});}
});

// --- 24 Oct: the availability check also refreshes a retired photo link -------------------------------------------
import {vintedImageUrl} from '../../lib/domain/vinted-normalize.mjs';
const NEW_PHOTO='https://images1.vinted.net/t/04_00999_freshHash/f800/7a7a7a7a.webp?s=abc123';
const detailWith=(photo,flags={})=>Response.json({item:{is_closed:false,can_buy:true,is_hidden:false,is_reserved:false,...flags,...photo}},{headers:{'x-credits-used':'10'}});
const runOne=async(response,ids=[90010])=>{
 const {root,items,control}=await setup(async()=>response,ids);
 try{const plan=await control.plan(settings(ids),{scope:'availability',limit:1});const done=await control.run(plan.id,settings(ids));
  const snapshot=JSON.parse(await readFile(join(root,'public/data/vinted.json'),'utf8'));return {done,row:snapshot.items.find(i=>i.id===ids[0]),before:items[0],snapshot};}
 finally{control.close();await rm(root,{recursive:true,force:true});}
};
test('a fresh photo link from the item response replaces the stored one and is counted',async()=>{
 const {done,row,before}=await runOne(detailWith({photo:{url:NEW_PHOTO,is_main:true}}));
 assert.notEqual(before.imageUrl,NEW_PHOTO);assert.equal(row.imageUrl,NEW_PHOTO);assert.equal(done.photosUpdated,1);assert.equal(done.items[0].photoUpdated,true);
 assert.equal(row.availability,'available');assert.equal(row.title,before.title,'nothing else about the listing changes');assert.equal(row.price,before.price);
});
test('the photos list is used when there is no primary photo object, preferring the main one',async()=>{
 const {row}=await runOne(detailWith({photos:[{url:'https://images1.vinted.net/t/other/f800/1.webp?s=1'},{url:NEW_PHOTO,is_main:true}]}));assert.equal(row.imageUrl,NEW_PHOTO);
 const first=await runOne(detailWith({photos:[{url:NEW_PHOTO},{url:'https://images1.vinted.net/t/other/f800/2.webp?s=2'}]}));assert.equal(first.row.imageUrl,NEW_PHOTO,'falls back to the first photo');
});
test('a sold listing still gets its photo link refreshed, alongside its sold state',async()=>{
 const {row,done}=await runOne(detailWith({photo:{url:NEW_PHOTO}},{is_closed:true,can_buy:false}));assert.equal(row.availability,'sold');assert.equal(row.imageUrl,NEW_PHOTO);assert.equal(done.photosUpdated,1);
});
test('an unchanged, missing or unsafe photo address changes nothing',async()=>{
 const same=await runOne(detailWith({}));const existing=same.before.imageUrl;
 assert.equal(same.row.imageUrl,existing);assert.equal(same.done.photosUpdated,0,'no photo in the response');
 for(const bad of ['https://evil.example/photo.jpg','http://images1.vinted.net/t/a/f800/1.webp','https://user:pw@images1.vinted.net/a.webp','https://images1.vinted.net:8443/a.webp','https://vinted.net.evil.example/a.webp','javascript:alert(1)','','not a url',42,null]){
  const r=await runOne(detailWith({photo:{url:bad}}));assert.equal(r.row.imageUrl,existing,`kept the old link for ${String(bad)}`);assert.equal(r.done.photosUpdated,0);assert.equal(r.row.availability,'available','the availability result is still recorded');
 }
 const identical=await runOne(detailWith({photo:{url:existing}}));assert.equal(identical.done.photosUpdated,0,'the same address is not counted as an update');
});
test('a removed listing (404) keeps its stored photo link and only records unavailable',async()=>{
 const {row,done}=await runOne(new Response('{}',{status:404}));assert.equal(row.availability,'unavailable');assert.equal(done.photosUpdated,0);assert.ok(row.imageUrl.startsWith('https://images1.vinted.net/'));
});
test('the photo rule accepts only plain https addresses on Vinted’s own image domain',()=>{
 assert.equal(vintedImageUrl(NEW_PHOTO),NEW_PHOTO);assert.equal(vintedImageUrl('https://vinted.net/a.webp'),'https://vinted.net/a.webp');
 for(const bad of ['http://images1.vinted.net/a.webp','https://images1.vinted.com/a.webp','https://notvinted.net/a.webp','https://images1.vinted.net.evil.test/a.webp','',undefined,null,{},[]])assert.equal(vintedImageUrl(bad),undefined,String(bad));
});
test('the stored snapshot stays valid and trusted after a photo refresh',async()=>{
 const {snapshot}=await runOne(detailWith({photo:{url:NEW_PHOTO}}));const trusted=trustedSnapshot(snapshot,Date.now());
 assert.equal(trusted.quality.rejected,0);assert.equal(trusted.items.find(i=>i.id===90010).imageUrl,NEW_PHOTO);
});
