import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../../lib/server/store.mjs';
import {classifyListing} from '../../lib/domain/classification.mjs';
import {groupedSizing,matchesMySizes} from '../../lib/domain/sizes.mjs';
import {candidateBrands,recommendListings} from '../../lib/domain/recommendations.mjs';

test('category-aware clothing numbers cannot match shoes and homeware ignores clothing sizes',()=>{
 const sizing={enabled:true,selected:['EU 48','M','W32'],groups:{clothing:['EU 48','M'],waist:['W32'],shoes:[],other:[]},includeOneSize:true,includeUnspecified:false};
 assert.equal(matchesMySizes({title:'Wool jacket',size:'48'},sizing),true);
 assert.equal(matchesMySizes({title:'Leather boots',size:'48'},sizing),false);
 assert.equal(matchesMySizes({title:'Cotton trousers',size:'W32'},sizing),true);
 assert.equal(matchesMySizes({title:'Coffee mug',size:'Not provided'},sizing),true);
 assert.equal(matchesMySizes({title:'An unclear object',size:'M'},sizing),false);
 assert.equal(classifyListing({title:'Leather sunglasses case'}).sizeGroup,'none');
 assert.equal(matchesMySizes({title:'Cotton cap',size:'One size'},{...sizing,includeOneSize:false}),false);
 assert.deepEqual(groupedSizing({selected:['M','EU 48','W32']}).groups,{clothing:['M'],waist:['W32'],shoes:[],other:['EU 48']});
});
test('SQLite import survives reopen, is idempotent and retains first observation and prices',()=>{
 const dir=mkdtempSync(join(tmpdir(),'forme-store-'));let store=openStore(join(dir,'test.sqlite'));
 try{
  const item={sourceKey:'vinted:101',id:101,source:'vinted',price:100,title:'Wool jacket'};
  const snapshot={fetchedAt:'2026-10-20T10:00:00Z',items:[item]};
  assert.deepEqual(store.importSnapshot(snapshot),{listings:1,observations:1});assert.equal(store.importSnapshot(snapshot).observations,1);
  store.close();store=openStore(join(dir,'test.sqlite'));
  assert.equal(store.snapshot().items[0].price,100);
  assert.equal(store.importSnapshot({...snapshot,fetchedAt:'2026-10-21T10:00:00Z',items:[{...item,price:80}]}).observations,2);
  assert.equal(store.snapshot().items[0].firstSeenAt,snapshot.fetchedAt);assert.equal(store.snapshot().items[0].price,80);
  assert.throws(()=>store.importSnapshot({...snapshot,items:[{...item,price:undefined}]}));assert.equal(store.snapshot().items[0].price,80);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('settings revision conflict preserves existing settings and feedback changes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'forme-profile-')),store=openStore(join(dir,'test.sqlite'));
 try{
  const profile={settings:{saved:[101],dismissed:['vinted:102']}};
  assert.deepEqual(store.saveProfile(profile,0),{revision:1});
  assert.equal(store.saveProfile({settings:{saved:[]}},0).conflict,true);assert.deepEqual(store.profile().profile,profile);
  store.saveProfile({settings:{saved:[],dismissed:[]}},1);
  assert.deepEqual(store.feedback().map(row=>row.action),['save','dismiss','unsave','restore']);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('Discover uses related, unfollowed, non-excluded brands with reasons, feedback and diversity',()=>{
 const prefs={following:['Our Legacy'],excluded:['Lemaire'],saved:[],dismissed:[],sizing:{enabled:false}};
 assert.equal(candidateBrands(prefs).some(row=>row.brand==='Lemaire'),false);
 const source=[{id:1,brand:'Our Legacy',title:'Cotton shirt',size:'M',age:0},{id:2,brand:'Auralee',title:'Cotton shirt',size:'M',age:0},{id:3,brand:'Auralee',title:'Wool jacket',size:'M',age:0},{id:4,brand:'Studio Nicholson',title:'Cotton trousers',size:'M',age:0},{id:5,brand:'Unknown',title:'Jacket',size:'M',age:0}];
 const ranked=recommendListings(source,prefs);assert.deepEqual(ranked.map(entry=>entry.item.id),[2,4,3]);assert.match(ranked[0].reason,/Because you follow Our Legacy/);
 assert.deepEqual(recommendListings(source,{...prefs,dismissed:['demo:2']}).map(entry=>entry.item.id),[4,3]);
 assert.equal(recommendListings(source.filter(item=>item.id===1),prefs).length,0);
});
