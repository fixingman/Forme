import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {refreshControl} from '../../lib/server/refresh-control.mjs';
import {makeBrandLookupPlan,matchBrand,BRAND_LOOKUP_CREDITS} from '../../lib/domain/brand-lookup-plan.mjs';
import {makeRefreshPlan,brandReference} from '../../lib/domain/refresh-plan.mjs';
import {readBrandIds} from '../../lib/server/brand-ids.mjs';
const fetchedAt='2026-10-20T10:00:00.000Z';
const listing=(id,brand)=>({id,source:'vinted',sourceId:String(id),sourceKey:`vinted:${id}`,brand,title:`${brand} shirt`,size:'M',price:100,currency:'SEK',fetchedAt,firstSeenAt:fetchedAt});
const many=(brand,count,start)=>Array.from({length:count},(_,i)=>listing(start+i,brand));
const snapshot={items:[...many('Marni',5,1000),...many('Hario',3,2000),...many('Auralee',9,3000),...many('Eytys',2,4000),listing(5000,'')]};
const found=(...rows)=>rows.map(([id,title,count=100])=>({id,title,slug:String(title).toLowerCase(),favourite_count:1,item_count:count}));

test('the plan lists unresolved brands busiest first, skips verified and already-checked ones, and quotes 3 credits each',()=>{
 const plan=makeBrandLookupPlan({limit:10},snapshot,{references:[{name:'Auralee'}],checked:[{name:'Eytys'}]});
 assert.deepEqual(plan.jobs.map(job=>job.brand),['Marni','Hario']);assert.deepEqual(plan.jobs.map(job=>job.listings),[5,3]);
 assert.equal(plan.maximumCredits,2*BRAND_LOOKUP_CREDITS);assert.equal(plan.kind,'brands');assert.match(plan.coverage,/2 brands/);
 assert.deepEqual(makeBrandLookupPlan({limit:1},snapshot,{references:[{name:'Auralee'}]}).jobs.map(job=>job.brand),['Marni']);
 assert.equal(makeBrandLookupPlan({},{items:[]}).jobs.length,0);
});
test('accents, case and punctuation do not create duplicate brands, and an owner-named brand is looked up even if checked before',()=>{
 const items=[listing(1,'Séfr'),listing(2,'SEFR'),listing(3,'Sefr'),listing(4,'A.P.C.'),listing(5,'APC')];
 assert.equal(makeBrandLookupPlan({},{items}).jobs.length,2);
 const again=makeBrandLookupPlan({brands:['Eytys']},snapshot,{checked:[{name:'Eytys'}]});assert.deepEqual(again.jobs.map(job=>job.brand),['Eytys']);
 assert.equal(makeBrandLookupPlan({brands:['Auralee']},snapshot,{references:[{name:'Auralee'}]}).jobs.length,0,'a verified brand is never paid for again');
});
test('homeware, beauty and toy brands are left out by default but can be named; fashion volume decides the order',()=>{
 const items=[...Array.from({length:6},(_,i)=>({...listing(100+i,'Hario'),title:'Hario V60 dripper'})),...Array.from({length:4},(_,i)=>({...listing(200+i,'Hay'),title:'Hay glass vase'})),listing(300,'Hay'),...many('Marni',3,400),...many('Eytys',2,500)];
 assert.deepEqual(makeBrandLookupPlan({},{items}).jobs.map(job=>job.brand),['Marni','Eytys','Hay'],'Hay has one garment so it stays, last; Hario has none so it is left out');
 assert.deepEqual(makeBrandLookupPlan({brands:['Hario']},{items}).jobs.map(job=>[job.brand,job.listings]),[['Hario',6]]);
 assert.equal(makeBrandLookupPlan({},{items:items.filter(item=>item.brand==='Hario')}).jobs.length,0);
});
test('the number of brands is bounded',()=>{
 for(const limit of [0,41,1.5,'3'])assert.throws(()=>makeBrandLookupPlan({limit},snapshot),/1–40/);
});
test('only one clearly same-named brand is accepted; partial matches and duplicates are left for the owner',()=>{
 assert.deepEqual(matchBrand('Marni',found([1,'Marni',500],[2,'Marni Kids',9])).id,1);
 assert.equal(matchBrand('Marni',found([1,'Marni',500])).status,'matched');
 assert.equal(matchBrand('Nike',found([2319,'Nike ACG'],[88,'Nike x Jacquemus'])).status,'none','a partial match is not the brand');
 assert.equal(matchBrand('Hay',found([1,'HAY'],[2,'Hay'])).status,'ambiguous');assert.equal(matchBrand('Hay',found([1,'HAY'],[2,'Hay'])).id,undefined);
 assert.equal(matchBrand('Séfr',found([7,'SEFR'])).status,'matched','accent and case are ignored');
 assert.equal(matchBrand('X',[]).status,'none');assert.equal(matchBrand('X',null).status,'none');
 for(const bad of [{id:'7',title:'X'},{id:-1,title:'X'},{id:1.5,title:'X'},{id:7,title:''},{id:7},null,'X'])assert.equal(matchBrand('X',[bad]).status,'none',JSON.stringify(bad));
 assert.ok(matchBrand('Nike',found(...Array.from({length:9},(_,i)=>[i+1,`Nike ${i}`]))).candidates.length<=5);
});
test('provider-resolved IDs fill gaps in search plans, but a hand-verified one always wins',()=>{
 assert.equal(brandReference('Lemaire',[{name:'Lemaire',id:'1',source:'x'}]).id,'295938');
 assert.equal(brandReference('Marni',[{name:'Marni',id:'123',source:'provider brand lookup'}]).id,'123');assert.equal(brandReference('Marni'),undefined);
 const settings={following:['Marni','Lemaire'],excluded:[],styles:[],saved:[],dismissed:[],gender:{selected:['men','unisex','women'],includeUnknown:true},sizing:{enabled:false,selected:[],includeOneSize:true,includeUnspecified:true}};
 const plan=makeRefreshPlan(settings,{scope:'following',limit:2,references:[{name:'Marni',id:'123',source:'provider brand lookup'}]},{items:[]},Date.now());
 assert.deepEqual(Object.fromEntries(plan.jobs.map(job=>[job.brand,job.brandId])),{Marni:'123',Lemaire:'295938'});assert.equal(plan.exactBrandJobs,2);
});

async function setup(request){const root=await mkdtemp(join(tmpdir(),'forme-brands-'));await mkdir(join(root,'public/data'),{recursive:true});await writeFile(join(root,'public/data/vinted.json'),JSON.stringify({fetchedAt,items:snapshot.items}));const control=refreshControl({root,request,apiKey:'fake',pause:async()=>{}});control.setBudget(50);return {root,control};}
const reply=(brands,credits='3')=>Response.json({brands},{headers:{'x-credits-used':credits}});

test('planning and enqueueing send nothing; the run looks each brand up once, saves outcomes and records the exact charge',async()=>{
 const urls=[];const {root,control}=await setup(async input=>{urls.push(new URL(String(input)));const query=new URL(String(input)).searchParams.get('keyword');return reply(query==='Marni'?found([123,'Marni',900]):found([9,'Hario Kids']));});
 try{
  const plan=await control.plan({},{scope:'brands',limit:2});assert.equal(plan.maximumCredits,6);assert.equal(urls.length,0);
  await control.enqueue(plan.id,{});assert.equal(urls.length,0);assert.equal((await control.status()).reservedCredits,6);
  const done=await control.work();assert.equal(done.status,'complete');assert.deepEqual([done.looked,done.matched,done.none,done.ambiguous],[2,1,1,0]);
  assert.equal(urls.length,2);assert.ok(urls.every(url=>url.origin+url.pathname==='https://scrapebadger.com/v1/vinted/brands'&&url.searchParams.get('market')==='se'));
  assert.deepEqual(urls.map(url=>url.searchParams.get('keyword')),['Marni','Hario']);assert.ok(urls.every(url=>!url.searchParams.has('query')),'the brands endpoint takes `keyword`');
  const status=await control.status();assert.equal(status.reportedCredits,6);assert.equal(status.runs[0].status,'complete');
  const saved=await readBrandIds(root);assert.deepEqual(saved.matched.map(row=>[row.name,row.id,row.title]),[['Marni','123','Marni']]);assert.deepEqual(saved.checked.map(row=>[row.name,row.status]),[['Hario','none']]);
  assert.match(saved.matched[0].source,/provider brand lookup/);
  // the next plan leaves both alone, and the next search plan uses the saved ID
  assert.deepEqual((await control.plan({},{scope:'brands',limit:5})).jobs.map(job=>job.brand),['Eytys']);
  const search=await control.plan({following:['Marni'],excluded:[],styles:[],saved:[],dismissed:[],gender:{selected:['men','women','unisex'],includeUnknown:true},sizing:{enabled:false,selected:[],includeOneSize:true,includeUnspecified:true}},{scope:'following',limit:1});
  assert.equal(search.jobs[0].brandId,'123');
 }finally{control.close();await rm(root,{recursive:true,force:true});}
});
test('a daily cap that cannot cover the run stops it before any request',async()=>{
 let calls=0;const {root,control}=await setup(async()=>{calls++;return reply([]);});
 try{control.setBudget(5);const plan=await control.plan({},{scope:'brands',limit:2});await assert.rejects(control.enqueue(plan.id,{}),/Daily credit cap/);assert.equal(calls,0);}
 finally{control.close();await rm(root,{recursive:true,force:true});}
});
test('unexpected billing, an HTTP error or a malformed answer stops the run without retrying, keeping credits reserved and earlier brands saved',async()=>{
 for(const [label,second,error] of [['billing',()=>reply(found([5,'Hario']),'9'),/Unexpected provider billing/],['http',()=>new Response('{"detail":"boom"}',{status:500,headers:{'x-credits-used':'0'}}),/HTTP 500: \{"detail":"boom"\}/],['shape',()=>Response.json({brands:'x'},{headers:{'x-credits-used':'3'}}),/Unexpected brand response/]]){
  let calls=0;const {root,control}=await setup(async()=>{calls++;return calls===1?reply(found([123,'Marni'])):second();});
  try{
   const plan=await control.plan({},{scope:'brands',limit:3});await control.enqueue(plan.id,{});
   await assert.rejects(control.work(),error,label);assert.equal(calls,2,`${label}: no retry and no third brand`);
   const status=await control.status();assert.equal(status.runs[0].status,'failed');assert.equal(status.reservedCredits,9,'the whole reservation stays counted');
   assert.deepEqual((await readBrandIds(root)).matched.map(row=>row.id),['123'],`${label}: the brand that succeeded is kept`);
  }finally{control.close();await rm(root,{recursive:true,force:true});}
 }
});
test('a network failure stops the run without a retry',async()=>{
 let calls=0;const {root,control}=await setup(async()=>{calls++;throw new Error('offline');});
 try{const plan=await control.plan({},{scope:'brands',limit:2});await control.enqueue(plan.id,{});await assert.rejects(control.work(),/no automatic retry/);assert.equal(calls,1);}
 finally{control.close();await rm(root,{recursive:true,force:true});}
});
test('a damaged local brand file is ignored for the bad rows, not trusted',async()=>{
 const {root,control}=await setup(async()=>reply([]));
 try{
  await mkdir(join(root,'.forme-data'),{recursive:true});
  await writeFile(join(root,'.forme-data/brand-ids.json'),JSON.stringify({matched:[{name:'Marni',id:123},{name:'Str',id:'456'},{name:'Bad',id:'abc'},{name:'Neg',id:-5},{name:'Dec',id:'1.5'},{name:'Huge',id:'99999999999999999999'},{id:9},null],checked:[{name:'Eytys',status:'weird'},{}]}));
  const data=await readBrandIds(root);assert.deepEqual(data.matched.map(row=>[row.name,row.id]),[['Marni','123'],['Str','456']]);assert.deepEqual(data.checked.map(row=>[row.name,row.status]),[['Eytys','none']]);
  assert.deepEqual((await readBrandIds(await mkdtemp(join(tmpdir(),'forme-none-')))).matched,[]);
 }finally{control.close();await rm(root,{recursive:true,force:true});}
});
