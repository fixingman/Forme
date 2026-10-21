import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openStore} from '../lib/server/store.mjs';
import {homeActivity} from '../lib/home-activity.mjs';
import {isExcludedListing} from '../lib/brands.mjs';
import {recommendListings} from '../lib/recommendations.mjs';
const preferences={following:['Our Legacy'],excluded:['Zara'],saved:[],dismissed:[],sizing:{enabled:false}};
test('seeded listings are not new arrivals, cached merges do not create observations and price changes require two real observations',()=>{
 const dir=mkdtempSync(join(tmpdir(),'forme-history-')),store=openStore(join(dir,'test.sqlite'));
 try{
  const old={id:1,sourceKey:'vinted:1',source:'vinted',brand:'Our Legacy',title:'Cotton shirt',size:'M',price:100,fetchedAt:'2026-10-20T10:00:00Z'};
  store.importSnapshot({fetchedAt:old.fetchedAt,items:[old]});assert.equal(store.snapshot().items[0].newlyCollected,false);
  const fresh={...old,id:2,sourceKey:'vinted:2',brand:'Lemaire',fetchedAt:'2026-10-21T10:00:00Z'};
  assert.equal(store.importSnapshot({fetchedAt:fresh.fetchedAt,items:[old,fresh]}).observations,2);
  let snapshot=store.snapshot();assert.equal(snapshot.items[1].newlyCollected,true);assert.equal(snapshot.items[0].previousPrice,undefined);
  assert.equal(store.importSnapshot({fetchedAt:'2026-10-22T10:00:00Z',items:[{...old,price:80,fetchedAt:'2026-10-22T10:00:00Z'},fresh]}).observations,3);
  snapshot=store.snapshot();assert.equal(snapshot.items[0].previousPrice,100);assert.equal(snapshot.items[0].priceChangedAt,'2026-10-22T10:00:00Z');
  const activity=homeActivity(snapshot.items,preferences,Date.parse('2026-10-22T11:00:00Z'));assert.deepEqual(activity.arrivals.map(item=>item.id),[2]);assert.deepEqual(activity.changes.map(item=>item.id),[1]);
  assert.equal(homeActivity(snapshot.items,{...preferences,dismissed:['vinted:2']},Date.parse('2026-10-22T11:00:00Z')).arrivals.length,0);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('explicit excluded collaborations are hidden without matching unrelated title words',()=>{
 for(const title of ['Zara X Studio Nicholson shirt','Studio Nicholson x Zara wool trousers','Zara × Studio Nicholson'])assert.equal(isExcludedListing({brand:'Studio Nicholson',title},['Zara']),true,title);
 assert.equal(isExcludedListing({brand:'Studio Nicholson',title:'Cotton shirt'},['Zara']),false);
 assert.equal(isExcludedListing({brand:'Our Legacy',title:'Original shirt'},['H&M']),false);
});
test('saved brand affinity changes ranking and dismissed items stay excluded',()=>{
 const source=[{id:1,sourceKey:'vinted:1',brand:'Auralee',title:'Cotton shirt',size:'M',age:1},{id:2,sourceKey:'vinted:2',brand:'Lemaire',title:'Wool jacket',size:'M',age:1},{id:3,sourceKey:'vinted:3',brand:'Lemaire',title:'Cotton shirt',size:'M',age:1}];
 assert.equal(recommendListings(source,preferences)[0].item.brand,'Auralee');
 const saved=recommendListings(source,{...preferences,saved:[2]});assert.equal(saved[0].item.brand,'Lemaire');assert.match(saved[0].reason,/a brand you saved/);
 assert.equal(recommendListings(source,{...preferences,dismissed:['vinted:2']}).some(entry=>entry.item.id===2),false);
});
