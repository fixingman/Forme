import {test} from 'node:test';
import assert from 'node:assert/strict';
import {featuresFor,feedbackState,activeExamples,hardEligible,syntheticCases,rankedMetrics,catalogHashFor,makeCase} from '../../scripts/lab/recommendation-data.mjs';
import {combineReviews,reviewItem} from '../../scripts/lab/recommendation-reviews.mjs';
const settings={following:['Our Legacy'],excluded:['Zara'],styles:[],gender:{selected:['men'],includeUnknown:false},sizing:{enabled:true,selected:['M'],groups:{clothing:['M'],waist:[],shoes:[],other:[]},includeOneSize:false,includeUnspecified:false}};
const item={id:91001,source:'vinted',sourceId:'91001',sourceKey:'vinted:91001',brand:'Auralee',title:'Black wool jacket',category:'',price:100,size:'M',gender:'men'};

test('feedback replay keeps item hides separate from saves, with reversible restore and unsave',()=>{
 const events=[{key:item.sourceKey,action:'save'},{key:item.sourceKey,action:'dismiss'},{key:item.sourceKey,action:'dismiss'}];
 assert.equal(activeExamples([item],events).length,1);assert.equal(activeExamples([item],events)[0].label,0);
 events.push({key:item.sourceKey,action:'restore'});assert.equal(activeExamples([item],events)[0].label,1);
 events.push({key:item.sourceKey,action:'unsave'});assert.deepEqual(activeExamples([item],events),[]);
 assert.equal(feedbackState(events).get(item.sourceKey).hidden,false);
 assert.throws(()=>feedbackState([{key:item.sourceKey,action:'view'}]),/Invalid/);
});

test('feature extraction never includes identity or evaluation labels',()=>{
 const first=featuresFor(item),second=featuresFor({...item,id:99999,sourceKey:'vinted:99999',label:1,expectedScore:1000});
 assert.deepEqual(first,second);assert.equal(first['material:wool'],1);
 assert(!Object.keys(first).some(key=>/target|expected|label|vinted:/.test(key)));
});

test('all engines share hard size, department, brand and sold-state constraints',()=>{
 assert.equal(hardEligible(item,settings),true);
 for(const extra of [{gender:'women'},{size:'S'},{brand:'Zara'},{brand:'Our Legacy'},{availability:'sold',availabilitySource:'provider',availabilityObservedAt:'2026-10-23T00:00:00Z'}])assert.equal(hardEligible({...item,...extra},settings),false);
});

test('synthetic tests keep training IDs out of held-out candidates and exclude injected hard-filter probes',()=>{
 for(const row of syntheticCases()){
  assert.equal(row.kind,'synthetic-not-owner-feedback');assert.equal(row.examples.length,24);assert.equal(row.candidateKeys.length,72);
  assert(row.examples.every(example=>!row.candidateKeys.includes(example.key)));
  assert.equal(new Set(Object.values(row.labels)).size,2);
  assert.equal(row.items.length-row.examples.length-row.candidateKeys.length,4);
 }
 const hidden={...item,id:91002,sourceId:'91002',sourceKey:'vinted:91002'};
 const sample=makeCase({name:'gate',kind:'test',items:[item,hidden],settings,events:[{key:hidden.sourceKey,action:'dismiss'}],testKeys:new Set([item.sourceKey,hidden.sourceKey])});
 assert.deepEqual(sample.candidateKeys,[item.sourceKey]);
});

test('unknown owner labels never produce an accuracy score, and short rankings do not inflate precision',()=>{
 assert.equal(rankedMetrics([{key:'a'}],{}).precisionAt10,null);
 const labels=Object.fromEntries(Array.from({length:20},(_,index)=>[String(index),index<10?1:0]));
 const metrics=rankedMetrics([{key:'0'}],labels);assert.equal(metrics.precisionAt10,0.1);assert.equal(metrics.recallAt10,0.1);
 const good=Array.from({length:10},(_,index)=>({key:String(index)}));assert.equal(rankedMetrics(good,labels).ndcgAt10,1);
});

test('review hashes bind judgments to observed item content, not item order alone',()=>{
 const rows=[{key:'vinted:1',brand:'Brand',title:'Shirt',price:100,observedAt:'2026-10-21T00:00:00Z'},{key:'vinted:2',brand:'Other',title:'Coat',price:200}];
 assert.equal(catalogHashFor(rows),catalogHashFor([...rows].reverse()));
 assert.notEqual(catalogHashFor(rows),catalogHashFor([{...rows[0],price:300},rows[1]]));
 assert.notEqual(catalogHashFor(rows),catalogHashFor([{...rows[0],observedAt:'2026-10-22T00:00:00Z'},rows[1]]));
});

function pairedReviews(){
 const primaryItems=[item,{...item,id:91002,sourceId:'91002',sourceKey:'vinted:91002'}];
 const followed={...item,id:92001,sourceId:'92001',sourceKey:'vinted:92001',brand:'Our Legacy'};
 const batch=(items,actions)=>{
  const rows=items.map(reviewItem),catalogHash=catalogHashFor(rows);
  return {review:{items:rows,catalogHash},judgments:{app:'forme-recommendation-review',version:1,catalogHash,events:items.map((item,index)=>({key:item.sourceKey,action:actions[index]}))}};
 };
 return {items:[...primaryItems,followed],settings,primary:batch(primaryItems,['save','dismiss']),context:batch([followed],['save'])};
}

test('follow-up labels train models without entering Discover test candidates or leaking held-out ratings',()=>{
 const sample=pairedReviews(),combined=combineReviews(sample),diagnostic=combined.cases[0];
 assert.equal(diagnostic.kind,'owner-cross-batch-diagnostic');
 assert.deepEqual(diagnostic.candidateKeys,['vinted:91001','vinted:91002']);
 assert.deepEqual(diagnostic.examples.map(row=>row.key),['vinted:92001']);
 assert.equal(combined.study.context.positive,1);
 for(const row of combined.cases){
  assert(row.examples.some(example=>example.key==='vinted:92001'));
  assert(row.examples.every(example=>!row.candidateKeys.includes(example.key)));
  assert(!row.candidateKeys.includes('vinted:92001'));
 }
});

test('combining reviews refuses mismatched content, foreign votes, overlapping batches and ineligible context',()=>{
 const changed=pairedReviews();changed.items[0]={...changed.items[0],price:999};assert.throws(()=>combineReviews(changed),/fingerprint/);
 const foreign=pairedReviews();foreign.context.judgments.events.push({key:'vinted:99999',action:'save'});assert.throws(()=>combineReviews(foreign),/judgments/);
 const overlap=pairedReviews();overlap.context=overlap.primary;assert.throws(()=>combineReviews(overlap),/disjoint/);
 const excluded=pairedReviews();excluded.settings={...settings,excluded:['Our Legacy']};assert.throws(()=>combineReviews(excluded),/eligible followed/);
});
