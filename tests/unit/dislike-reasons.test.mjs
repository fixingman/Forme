import {test} from 'node:test';
import assert from 'node:assert/strict';
import {REASONS,REASON_LABELS,ATTRIBUTE_REASONS,isReason} from '../../lib/domain/dislike-reasons.mjs';
import * as learning from '../../lib/domain/learning.mjs';
import {tasteProfile,normalizeTasteFeedback,feedbackSnapshot} from '../../lib/domain/taste-profile.mjs';
import {recommendListings} from '../../lib/domain/recommendations.mjs';
import {hiddenEntries,searchHidden} from '../../lib/domain/hidden-pieces.mjs';

const now=Date.parse('2026-10-25T12:00:00Z');
const base={following:['Our Legacy'],excluded:[],styles:[],styleRules:{},saved:[],dismissed:[],tasteFeedback:[],gender:{selected:['men','unisex'],includeUnknown:false},sizing:{enabled:false}};
const piece=(id,brand,title,extra={})=>({id,source:'vinted',sourceId:String(id),sourceKey:`vinted:${id}`,sourceUrl:`https://www.vinted.se/items/${id}-x`,imageUrl:`https://images1.vinted.net/${id}.webp`,brand,title,gender:'men',size:'M',price:100,age:1,fetchedAt:'2026-10-24T10:00:00Z',observedAt:'2026-10-24T10:00:00Z',category:'',style:'',...extra});
// a hidden row as the app stores it: snapshot plus the reason given
const hidden=(item,reason)=>({...feedbackSnapshot(item),reason});
const withHidden=(items,reason)=>({...base,dismissed:items.map(i=>i.sourceKey),tasteFeedback:items.map(i=>hidden(i,reason))});

test('the reasons are one ordered list with a plain label each; taste reasons come first',()=>{
 assert.deepEqual(REASONS,['style','material','color','price','data','unspecified']);
 assert.deepEqual(Object.keys(REASON_LABELS),REASONS);
 assert.equal(REASON_LABELS.material,'Not the right material');assert.equal(REASON_LABELS.color,'Not the right colour');
 assert.ok(isReason('material')&&isReason('color')&&!isReason('colour')&&!isReason('brand')&&!isReason(undefined));
 assert.equal(learning.REASONS,REASONS,'the learning module re-exports the same list');assert.equal(learning.REASON_LABELS,REASON_LABELS);
 assert.deepEqual(ATTRIBUTE_REASONS,{material:'material:',color:'color:'});
});
test('stored rows keep the new reasons and still drop unknown ones, as before',()=>{
 const row=piece(1,'A','Wool jacket');
 for(const reason of REASONS)assert.equal(normalizeTasteFeedback([hidden(row,reason)])[0].reason,reason,reason);
 for(const bad of ['colour','brand','','Style',42,null])assert.equal('reason' in normalizeTasteFeedback([{...hidden(row,'style'),reason:bad}])[0],false,String(bad));
 assert.equal('reason' in normalizeTasteFeedback([feedbackSnapshot(row)])[0],false,'older rows without a reason stay valid');
});

// ---------------------------------------------------------------------------------- what each reason is allowed to do
const woolA=piece(11,'Lemaire','Black wool jacket'),woolB=piece(12,'Lemaire','Grey wool coat'),cotton=piece(13,'Lemaire','Cotton shirt');
test('"not the right material" counts against the material only: never the brand, the style or the category',()=>{
 const p=tasteProfile(withHidden([woolA,woolB],'material'),[woolA,woolB,cotton]);
 assert.equal(p.negativeTraits.get('material:wool'),2);
 assert.equal(p.negativeTraits.has('category:outerwear'),false,'category is untouched');assert.equal(p.negativeTraits.has('color:black'),false,'colour is untouched');assert.equal(p.negativeTraits.has('color:grey'),false);
 assert.equal(p.negativeBrands.size,0,'the brand is never blamed');assert.equal(p.hiddenCount,0,'it is not a general dislike');
});
test('"not the right colour" counts against the colour only',()=>{
 const p=tasteProfile(withHidden([woolA,woolB],'color'),[woolA,woolB]);
 assert.equal(p.negativeTraits.get('color:black'),1);assert.equal(p.negativeTraits.get('color:grey'),1);
 assert.equal(p.negativeTraits.has('material:wool'),false);assert.equal(p.negativeTraits.has('category:outerwear'),false);assert.equal(p.negativeBrands.size,0);
});
test('the existing reasons behave exactly as before: style is a general dislike; price, data and no-reason add no taste penalty',()=>{
 const style=tasteProfile(withHidden([woolA,woolB],'style'),[woolA,woolB]);
 assert.equal(style.negativeBrands.get('lemaire'),2);assert.equal(style.negativeTraits.get('material:wool'),2);assert.equal(style.negativeTraits.get('category:outerwear'),2);
 for(const reason of ['price','data','unspecified']){const p=tasteProfile(withHidden([woolA,woolB],reason),[woolA,woolB]);assert.equal(p.negativeTraits.size,0,reason);assert.equal(p.negativeBrands.size,0,reason);}
 const old=tasteProfile({...base,dismissed:[woolA.sourceKey],tasteFeedback:[feedbackSnapshot(woolA)]},[woolA]);assert.equal(old.negativeBrands.get('lemaire'),1,'a hide with no reason recorded still counts, for compatibility');
});
test('a reason only applies while the piece is still hidden; restoring removes its evidence',()=>{
 const rows=[hidden(woolA,'material'),hidden(woolB,'material')];
 assert.equal(tasteProfile({...base,dismissed:[woolA.sourceKey,woolB.sourceKey],tasteFeedback:rows},[woolA,woolB]).negativeTraits.get('material:wool'),2);
 assert.equal(tasteProfile({...base,dismissed:[woolA.sourceKey],tasteFeedback:rows},[woolA,woolB]).negativeTraits.get('material:wool'),1,'restored pieces stop counting');
 assert.equal(tasteProfile({...base,dismissed:[],tasteFeedback:rows},[woolA,woolB]).negativeTraits.size,0);
});

// ---------------------------------------------------------------------------------- ranking
const scoreOf=(rows,id)=>rows.find(r=>r.item.id===id)?.score;
test('after two material complaints, wool ranks lower than other materials from the very same brand; the brand itself is not penalised',()=>{
 const pool=[piece(21,'Lemaire','Wool cardigan'),piece(22,'Lemaire','Cotton cardigan'),piece(23,'Auralee','Wool cardigan')];
 const calm=recommendListings(pool,{...base,following:['Our Legacy']},{now,signals:[...pool,woolA,woolB]});
 const told=recommendListings(pool,{...withHidden([woolA,woolB],'material'),following:['Our Legacy']},{now,signals:[...pool,woolA,woolB]});
 assert.ok(calm.length===3&&told.length===3);
 assert.equal(scoreOf(told,22),scoreOf(calm,22),'cotton from the same brand is unchanged');
 assert.ok(scoreOf(told,21)<scoreOf(calm,21),'wool from the same brand drops');assert.ok(scoreOf(told,23)<scoreOf(calm,23),'and wool from another brand drops too');
 assert.ok(scoreOf(told,22)>scoreOf(told,21),'so the cotton now outranks the wool');
});
test('a single complaint is not enough to demote a whole material or colour',()=>{
 const pool=[piece(31,'Lemaire','Wool cardigan'),piece(32,'Lemaire','Black coat')];
 for(const reason of ['material','color']){
  const calm=recommendListings(pool,{...base},{now,signals:[...pool,woolA]}),told=recommendListings(pool,{...withHidden([woolA],reason),following:['Our Legacy']},{now,signals:[...pool,woolA]});
  assert.ok(calm.length===2&&told.length===2,'both runs see the same candidates');
  for(const id of [31,32])assert.equal(scoreOf(told,id),scoreOf(calm,id),`${reason} #${id}`);
 }
});
test('colour complaints demote that colour only',()=>{
 const pool=[piece(41,'Lemaire','Black trousers'),piece(42,'Lemaire','Brown trousers')],blackA=piece(43,'Lemaire','Black coat'),blackB=piece(44,'Lemaire','Black shirt');
 const calm=recommendListings(pool,{...base},{now,signals:[...pool,blackA,blackB]}),told=recommendListings(pool,{...withHidden([blackA,blackB],'color'),following:['Our Legacy']},{now,signals:[...pool,blackA,blackB]});
 assert.ok(scoreOf(told,41)<scoreOf(calm,41));assert.equal(scoreOf(told,42),scoreOf(calm,42));
});

// ---------------------------------------------------------------------------------- learning pipeline
test('the new reasons are retained evidence, never training labels, and the evidence counters know them',()=>{
 const key='vinted:51',event=(action,extra={})=>({id:crypto.randomUUID(),key,action,channel:'preview',...extra});
 for(const reason of ['material','color']){
  const dismiss=event('dismiss',{reason});
  const report=learning.evaluateEvidence({events:[{data:dismiss,ordinal:1}],exposures:[],runs:[],channel:'preview'});
  assert.equal(report.counts[reason],1,reason);assert.equal(report.counts.style,0);assert.equal(Number.isNaN(report.counts.material+report.counts.color),false,'no NaN counters');
  assert.equal(report.counts.unscored,0,'excluded from scoring, like price and data');
 }
});
test('a later reason change moves the evidence from one reason to another',()=>{
 const key='vinted:52',dismiss={id:crypto.randomUUID(),key,action:'dismiss',reason:'unspecified',channel:'shopping'};
 const change={id:crypto.randomUUID(),key,action:'reason',reason:'material',targetId:dismiss.id,channel:'shopping'};
 const states=learning.activeFeedback([{data:dismiss,ordinal:1},{data:change,ordinal:2}],'shopping');
 assert.equal(states.get(key).reason,'material');assert.equal(states.get(key).hidden,true);
});

// ---------------------------------------------------------------------------------- hidden pieces list
test('hidden pieces carry their reason; "no reason" and unknown reasons are not shown',()=>{
 const remembered=[hidden(woolA,'material'),{...hidden(woolB,'unspecified')},{...hidden(cotton,'style'),reason:'bogus'}];
 const rows=hiddenEntries({keys:[woolA,woolB,cotton].map(i=>i.sourceKey),source:[woolA,woolB,cotton],remembered});
 const byKey=Object.fromEntries(rows.map(r=>[r.key,r.reason]));
 assert.equal(byKey['vinted:11'],'material');assert.equal(byKey['vinted:12'],undefined);assert.equal(byKey['vinted:13'],undefined);
});
test('hidden pieces can be found by the reason given, in words',()=>{
 const rows=hiddenEntries({keys:[woolA,woolB,cotton].map(i=>i.sourceKey),source:[woolA,woolB,cotton],remembered:[hidden(woolA,'material'),hidden(woolB,'color'),hidden(cotton,'price')]});
 const find=q=>searchHidden(rows,q).map(r=>r.key).sort();
 assert.deepEqual(find('right material'),['vinted:11']);assert.deepEqual(find('colour'),['vinted:12']);assert.deepEqual(find('expensive'),['vinted:13']);assert.deepEqual(find('not the right'),['vinted:11','vinted:12']);
});
