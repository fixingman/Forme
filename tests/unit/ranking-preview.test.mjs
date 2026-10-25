import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {rankingPreview} from '../../lib/server/ranking-preview.mjs';
import {preferenceKey} from '../../lib/domain/ranking-preview.mjs';

const at='2026-10-24T00:00:00Z',now=Date.parse(at);
const piece=(id,brand='Auralee',extra={})=>({id,source:'vinted',sourceKey:`vinted:${id}`,sourceId:String(id),sourceUrl:`https://www.vinted.se/items/${id}-fixture`,imageUrl:'https://images1.vinted.net/fixture.webp',brand,title:'Black cotton shirt',size:'M',gender:'men',genderSource:'provider',category:'',style:'',price:100,currency:'SEK',condition:'Good',fetchedAt:at,...extra});
const settings={following:['Our Legacy'],excluded:['Zara'],saved:[],dismissed:['vinted:10006'],styles:[],styleRules:{},gender:{selected:['men'],includeUnknown:false},sizing:{enabled:true,selected:['M'],groups:{clothing:['M'],waist:[],shoes:[],other:[]},includeOneSize:false,includeUnspecified:false}};
async function fixture(customRank){
 const root=await mkdtemp(join(tmpdir(),'forme-ranking-preview-')),source={fetchedAt:at,items:[piece(10001),piece(10002,'Lemaire'),piece(10003,'Zara'),piece(10004,'Auralee',{size:'S'}),piece(10005,'Auralee',{gender:'women'}),piece(10006),piece(10007,'Our Legacy')]},inputs=[];
 const rank=customRank??(async(_,directory)=>{const {case:input}=JSON.parse(await readFile(join(directory,'input.json'),'utf8'));inputs.push(input);return {river:{ranking:[...input.baseline].reverse(),mode:'weighted-online-logistic-replayed-10-passes'},gorse:{ranking:input.baseline,mode:'tags-and-factorization-machines'}};});
 const preview=rankingPreview({root,snapshot:()=>source,rank,now:()=>now}),profile={settings:structuredClone(settings),savedListings:[]};
 return {root,source,inputs,preview,profile,close:()=>rm(root,{recursive:true,force:true})};
}
test('all preview engines share the hard-filtered pool, keep preferences untouched and freeze their ranking',async()=>{
 const f=await fixture();try{
  const before=JSON.stringify(f.profile),session=await f.preview.create(f.profile);
  assert.deepEqual(session.items.map(item=>item.id).sort(),[10001,10002]);assert.equal(JSON.stringify(f.profile),before);
  assert.equal(session.views[0].id,'current');assert.deepEqual(session.views[1].keys,['vinted:10001','vinted:10002']);
  f.preview.get(session.id);f.preview.get(session.id);assert.equal(f.inputs.length,1);
  assert(!existsSync(join(f.root,'.forme-data')),'no live data/profile store opened');
  assert.equal(session.profileKey,preferenceKey(f.profile.settings,[]));
 }finally{await f.close();}
});
test('blind views conceal names/modes and keep a stable assignment through reveal',async()=>{
 const f=await fixture();try{
  const session=await f.preview.create(f.profile),blind=f.preview.get(session.id,{blind:true}),again=f.preview.get(session.id,{blind:true}),reveal=f.preview.get(session.id,{blind:true,reveal:true});
  assert.deepEqual(blind.views,again.views);assert.deepEqual(blind.views.map(row=>row.label),['Edit A','Edit B','Edit C']);
  assert(!/river|gorse|learned|current-production/i.test(JSON.stringify(blind.views)));
  assert.deepEqual(blind.views.map(row=>row.keys),reveal.views.map(row=>row.keys));assert(reveal.views.some(row=>row.label.includes('River')));
 }finally{await f.close();}
});
test('preview votes are reversible/revision protected, preserve frozen ranks and train only the next comparison',async()=>{
 const f=await fixture();try{
  const session=await f.preview.create(f.profile),before=JSON.stringify(session.views),key='vinted:10001';
  assert.throws(()=>f.preview.vote({id:session.id,key:'vinted:99999',choice:'save',baseRevision:0}),/Invalid/);
  assert.equal(f.preview.vote({id:session.id,key,choice:'dismiss',baseRevision:0}).revision,1);
  assert.throws(()=>f.preview.vote({id:session.id,key,choice:'save',baseRevision:0}),/another tab/);
  assert.equal(JSON.stringify(f.preview.get(session.id).views),before);
  assert.equal(f.preview.vote({id:session.id,key,choice:null,baseRevision:1}).revision,2);
  assert.deepEqual(f.preview.get(session.id).choices,{});
  f.preview.vote({id:session.id,key,choice:'save',baseRevision:2});
  f.source.items[0].price=999;
  const next=await f.preview.create(f.profile);assert(!next.items.some(item=>item.id===10001));
  const example=f.inputs.at(-1).examples.find(row=>row.key===key);assert.equal(example.label,1);assert.equal(example.features['price-band:6'],1,'learn from the rated snapshot price, not a changed listing');
  assert.deepEqual(f.profile.settings.saved,[]);assert.deepEqual(f.profile.settings.dismissed,settings.dismissed);
 }finally{await f.close();}
});
test('unavailable/invalid model output is explicit and cannot inject forbidden pieces or enable blind mode',async()=>{
 const f=await fixture(async()=>({river:{ranking:[{key:'vinted:10003'}],mode:'learned'},gorse:{error:'private error'}}));try{
  const session=await f.preview.create(f.profile);assert.equal(session.blindAvailable,false);
  for(const row of session.views.slice(1)){assert.equal(row.mode,'unavailable');assert.deepEqual(row.keys,session.views[0].keys);}
  assert.throws(()=>f.preview.get(session.id,{blind:true}),/Both learned/);
  assert.throws(()=>f.preview.get('../../secrets'),/Invalid/);
 }finally{await f.close();}
});
test('only one comparison can build at once; preview imports are idempotent and never replace newer choices',async()=>{
 let release;const gate=new Promise(done=>{release=done;}),f=await fixture(async()=>{await gate;return {};});try{
  assert.equal(f.preview.seed([{item:piece(10007,'Our Legacy'),choice:'save'}]).added,1);
  assert.equal(f.preview.seed([{item:piece(10007,'Our Legacy'),choice:'dismiss'}]).added,0);
  const first=f.preview.create(f.profile);await assert.rejects(f.preview.create(f.profile),/in progress/);
  release();const session=await first;assert.equal(session.training.positive,1);
 }finally{release();await f.close();}
});
