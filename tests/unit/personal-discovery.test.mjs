import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {recommendListings,candidateBrands} from '../../lib/domain/recommendations.mjs';
import {tasteProfile,feedbackSnapshot,normalizeTasteFeedback} from '../../lib/domain/taste-profile.mjs';
import {makeRefreshPlan,recordRefresh} from '../../lib/domain/refresh-plan.mjs';
import {isNewArrival,isNewToday,collectionFreshness} from '../../lib/domain/feed-freshness.mjs';
import {refreshControl} from '../../lib/server/refresh-control.mjs';
import {openStore} from '../../lib/server/store.mjs';

const now=Date.parse('2026-10-23T12:00:00Z');
const settings={following:['Our Legacy'],excluded:[],styles:[],styleRules:{},saved:[],dismissed:[],gender:{selected:['men','unisex'],includeUnknown:false},sizing:{enabled:false}};
const piece=(id,brand,title,extra={})=>({id,source:'vinted',sourceId:String(id),sourceKey:`vinted:${id}`,brand,title,gender:'men',size:'M',price:100,age:1,fetchedAt:'2026-10-21T10:00:00Z',...extra});

test('explicit custom styles discover matching pieces beyond the editorial related-brand map',()=>{
 const source=[piece(80001,'Independent Maker','Vintage denim jacket'),piece(80002,'Another Maker','Cotton shirt')];
 const ranked=recommendListings(source,{...settings,following:[],styles:['Weekend'],styleRules:{Weekend:['Archive']}},{now});
 assert.deepEqual(ranked.map(row=>row.item.id),[80001]);assert.match(ranked[0].reason,/Archive/);
});

test('retained saves outside the current feed teach brands and finer text traits',()=>{
 const saved=piece(81000,'Independent Maker','Black linen trousers');
 const source=[piece(81001,'Auralee','Cotton shirt'),piece(81002,'Independent Maker','Black linen trousers'),piece(81003,'Lemaire','Black linen trousers')];
 const preferences={...settings,saved:[81000]};
 const ranked=recommendListings(source,preferences,{signals:[saved,...source],now});
 assert.equal(ranked[0].item.id,81002);assert.match(ranked[0].reason,/brand you saved/);
 assert(ranked.find(row=>row.item.id===81003).score>ranked.find(row=>row.item.id===81001).score);
 assert.match(ranked.find(row=>row.item.id===81003).reason,/trousers like pieces you saved/);
 assert(candidateBrands(preferences,[saved]).some(row=>row.brand==='Independent Maker'));
});

test('hidden feedback survives a vanished listing, is deduplicated, and restoration removes its effect',()=>{
 const hidden=piece(82000,'Auralee','Wool jacket'),feedback=feedbackSnapshot(hidden);
 const source=[piece(82001,'Auralee','Cotton shirt'),piece(82002,'Studio Nicholson','Cotton shirt')];
 const preferences={...settings,dismissed:[hidden.sourceKey],tasteFeedback:[feedback,feedback]};
 assert.equal(tasteProfile(preferences,source).hiddenCount,1);
 assert.equal(recommendListings(source,preferences,{now})[0].item.id,82002);
 assert.equal(recommendListings(source,{...preferences,dismissed:[]},{now})[0].item.id,82001);
 const normalized=normalizeTasteFeedback([{...feedback,traits:['category:outerwear','invented:force-score']}]);
 assert.deepEqual(normalized[0].traits,['category:outerwear']);
});

test('Not for me overrides a saved positive signal until restored, without deleting the save',()=>{
 const saved=piece(82500,'Independent Maker','Black linen trousers');
 const preferences={...settings,saved:[saved.id],dismissed:[saved.sourceKey]};
 const hidden=tasteProfile(preferences,[saved]);
 assert.equal(hidden.savedCount,0);assert.equal(hidden.hiddenCount,1);
 assert(!hidden.brands.has('independentmaker'));
 assert.deepEqual(preferences.saved,[saved.id]);
 const restored=tasteProfile({...preferences,dismissed:[]},[saved]);
 assert.equal(restored.savedCount,1);assert.equal(restored.hiddenCount,0);
 assert.equal(restored.brands.get('independentmaker'),1);
});

test('taste boosts never bypass brand, department, size, availability or dismissal rules',()=>{
 const saved=piece(83000,'Independent Maker','Wool jacket'),preferences={...settings,saved:[saved.id],excluded:['Independent Maker'],dismissed:['vinted:83005'],sizing:{enabled:true,selected:['M'],groups:{clothing:['M'],waist:[],shoes:[],other:[]},includeOneSize:false,includeUnspecified:false}};
 const source=[piece(83001,'Independent Maker','Wool jacket'),piece(83002,'Auralee','Wool jacket',{gender:'women'}),piece(83003,'Auralee','Wool jacket',{size:'S'}),piece(83004,'Auralee','Wool jacket',{availability:'sold',availabilitySource:'provider',availabilityObservedAt:'2026-10-22T10:00:00Z'}),piece(83005,'Auralee','Wool jacket')];
 assert.deepEqual(recommendListings(source,preferences,{signals:[saved,...source],now}),[]);
});

test('freshness ranking uses real per-item observations, not a combined snapshot timestamp',()=>{
 const source=[piece(84001,'Auralee','Cotton shirt',{fetchedAt:'2026-10-01T10:00:00Z'}),piece(84002,'Lemaire','Cotton shirt',{fetchedAt:'2026-10-23T10:00:00Z'})];
 assert.equal(recommendListings(source,settings,{now})[0].item.id,84002);
 const summary=collectionFreshness({fetchedAt:new Date(now).toISOString(),items:source},now);
 assert.equal(summary.stale,1);assert.equal(summary.due,false);
 assert.equal(collectionFreshness({fetchedAt:new Date(now).toISOString(),items:[source[0]]},now).due,true);
 const checked={items:[source[0]],lastCollectionCheckAt:new Date(now).toISOString()};
 assert.equal(collectionFreshness(checked,now).due,false,'a successful empty search still counts as a collection check');
 assert.equal(collectionFreshness(checked,now).stale,1,'checking a query does not re-observe old listings');
});

test('New to FORME uses the same rolling seven days on cards and Home, never baseline or future items',()=>{
 const item=piece(85001,'Auralee','Cotton shirt',{firstSeenAt:'2026-10-21T10:00:00Z',newlyCollected:true});
 assert.equal(isNewArrival(item,now),true);
 assert.equal(isNewToday(item,now),false,'the experimental daily digest still means today');
 assert.equal(isNewToday({...item,firstSeenAt:new Date(now).toISOString()},now),true);
 assert.equal(isNewArrival({...item,newlyCollected:false},now),false);
 assert.equal(isNewArrival({...item,firstSeenAt:new Date(now+1).toISOString()},now),false);
 assert.equal(isNewArrival({...item,firstSeenAt:new Date(now-7*86400000).toISOString()},now),false);
});

test('refreshes rotate after successful checks including empty results and retain scoped history',()=>{
 const first=makeRefreshPlan(settings,{scope:'discover',limit:1},{items:[]},now);
 assert.equal(first.jobs[0].brand,'Auralee');
 const snapshot={items:[],refreshHistory:recordRefresh({},first.jobs[0],new Date(now).toISOString(),{returned:0,accepted:0})};
 assert.equal(makeRefreshPlan(settings,{scope:'discover',limit:1},snapshot,now).jobs[0].brand,'Lemaire');
 const otherScope={...snapshot,refreshHistory:snapshot.refreshHistory.map(row=>({...row,catalogIds:null}))};
 assert.equal(makeRefreshPlan(settings,{scope:'discover',limit:1},otherScope,now).jobs[0].brand,'Auralee');
 const future={...snapshot,refreshHistory:snapshot.refreshHistory.map(row=>({...row,at:new Date(now+1000).toISOString()}))};
 assert.equal(makeRefreshPlan(settings,{scope:'discover',limit:1},future,now).jobs[0].brand,'Auralee');
});

test('Your edit combines followed and discovered brands without duplicates or excluded queries',()=>{
 const plan=makeRefreshPlan({...settings,following:['Our Legacy','Our Legacy'],excluded:['Lemaire']},{scope:'personal',limit:3},{items:[]},now);
 assert.equal(plan.jobs[0].brand,'Our Legacy');assert.equal(new Set(plan.jobs.map(row=>row.brand)).size,3);
 assert(!plan.jobs.some(row=>row.brand==='Lemaire'));assert.equal(plan.maximumCredits,15);
});

test('manual collection checkpoints query history and exports truthful first-seen flags without refreshing retained rows',async()=>{
 const root=await mkdtemp(join(tmpdir(),'forme-personal-'));await mkdir(join(root,'public/data'),{recursive:true});
 const old=piece(86000,'Our Legacy','Cotton shirt');
 const initial={fetchedAt:old.fetchedAt,items:[old]};
 await writeFile(join(root,'public/data/vinted.json'),JSON.stringify(initial));
 const store=openStore(join(root,'.forme-data/forme.sqlite'));store.importSnapshot(initial);store.close();
 let calls=0,clock=now;
 const control=refreshControl({root,now:()=>clock,apiKey:'fixture-only',pause:async()=>{},request:async()=>{calls++;return Response.json({items:calls>1?[]:[{id:86001,title:'Auralee cotton shirt',brand_title:'Auralee',size_title:'M',price:{amount:'100',currency_code:'SEK'},url:'https://www.vinted.se/items/86001-shirt',photo:{url:'https://images1.vinted.net/fixture.webp'}}]},{headers:{'x-credits-used':'5'}});}});
 try{
  const plan=await control.plan(settings,{scope:'discover',limit:1});assert.equal(calls,0);
  await control.run(plan.id,settings);await control.run(plan.id,settings);assert.equal(calls,1);
  const snapshot=JSON.parse(await readFile(join(root,'public/data/vinted.json'),'utf8'));
  assert.equal(snapshot.items.find(row=>row.id===86000).fetchedAt,old.fetchedAt);
  assert.equal(snapshot.items.find(row=>row.id===86000).newlyCollected,false);
  assert.equal(snapshot.items.find(row=>row.id===86001).newlyCollected,true);
  assert.equal(snapshot.refreshHistory[0].brand,'Auralee');
  assert.equal(snapshot.lastCollectionCheckAt,new Date(now).toISOString());
  assert.equal((await control.plan(settings,{scope:'discover',limit:1})).jobs[0].brand,'Lemaire');
  assert.equal((await control.status()).reservedCredits,5);
  clock+=86400000;
  const empty=await control.plan(settings,{scope:'discover',limit:1});await control.run(empty.id,settings);
  const after=JSON.parse(await readFile(join(root,'public/data/vinted.json'),'utf8'));
  assert.equal(after.refreshHistory.find(row=>row.brand==='Lemaire').returned,0);
  assert.equal(collectionFreshness(after,clock).due,false);
  assert.equal(after.items.find(row=>row.id===86001).fetchedAt,new Date(now).toISOString());
  assert.equal(calls,2);
 }finally{control.close();await rm(root,{recursive:true,force:true});}
});
