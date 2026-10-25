import {listingKey} from '../../lib/domain/recommendations.mjs';
import {sameBrand} from '../../lib/domain/brands.mjs';
import {catalogHashFor,feedbackState,hardEligible,makeCase} from './recommendation-data.mjs';

export function reviewItem(item){
 return {key:listingKey(item),brand:item.brand,title:item.title,price:item.price,size:item.size,condition:item.condition,imageUrl:item.imageUrl,sourceUrl:item.sourceUrl,observedAt:item.observedAt??item.fetchedAt};
}

function validateReview(review,judgments,items){
 if(!review?.items?.length||new Set(review.items.map(item=>item.key)).size!==review.items.length)throw Error('Review requires distinct known items');
 const keys=new Set(review.items.map(item=>item.key)),byKey=new Map(items.map(item=>[listingKey(item),item]));
 if(review.items.some(item=>!byKey.has(item.key)))throw Error('Review item is missing from frozen snapshot');
 const hash=catalogHashFor(review.items);
 if(hash!==review.catalogHash||hash!==catalogHashFor(review.items.map(item=>reviewItem(byKey.get(item.key)))))throw Error('Review content or observation fingerprint changed');
 if(judgments?.app!=='forme-recommendation-review'||judgments.version!==1||judgments.catalogHash!==hash||!Array.isArray(judgments.events)||judgments.events.some(event=>!event||!keys.has(event.key)))throw Error('Invalid or foreign review judgments');
 const labels=[...feedbackState(judgments.events)].filter(([,state])=>state.saved||state.hidden);
 return {keys,labels,events:judgments.events};
}

export function combineReviews({items,settings,primary,context,now=Date.now()}){
 const first=validateReview(primary.review,primary.judgments,items),second=validateReview(context.review,context.judgments,items);
 if([...second.keys].some(key=>first.keys.has(key)))throw Error('Review batches must be disjoint');
 const byKey=new Map(items.map(item=>[listingKey(item),item]));
 if([...first.keys].some(key=>!hardEligible(byKey.get(key),settings)))throw Error('Primary review must contain eligible Discover items');
 if([...second.keys].some(key=>!hardEligible(byKey.get(key),{...settings,following:[]})||!(settings.following??[]).some(brand=>sameBrand(brand,byKey.get(key).brand))))throw Error('Context review must contain eligible followed-brand items');
 const labelMap=rows=>Object.fromEntries(rows.map(([key,state])=>[key,state.hidden?0:1]));
 const firstKeys=new Set(first.labels.map(([key])=>key)),events=[...first.events,...second.events];
 const cases=[makeCase({name:'owner-cross-batch-diagnostic',kind:'owner-cross-batch-diagnostic',items,settings,events:second.events,testKeys:firstKeys,labels:labelMap(first.labels),now})];
 for(let fold=0;fold<3;fold++){
  const held=first.labels.filter(([key])=>Number(key.split(':').at(-1))%3===fold),keys=new Set(held.map(([key])=>key));
  cases.push(makeCase({name:`owner-fold-${fold+1}`,kind:'owner-labelled-held-out',items,settings,events:events.filter(event=>!keys.has(event.key)),testKeys:keys,labels:labelMap(held),now}));
 }
 for(const row of cases)if(row.examples.some(example=>row.candidateKeys.includes(example.key)))throw Error('Held-out feedback leaked into training');
 const counts=rows=>({positive:rows.filter(([,state])=>!state.hidden&&state.saved).length,negative:rows.filter(([,state])=>state.hidden).length});
 return {cases,study:{method:'followed-brand-training-context-with-Discover-holdout',primary:counts(first.labels),context:counts(second.labels),fingerprints:[primary.review.catalogHash,context.review.catalogHash],limitations:['Cross-batch diagnostic tests only explicitly rated first-round items; neutral skips are not negatives.','Context labels train models but never become Discover test candidates.','Small, imbalanced holdouts do not establish a production-quality winner.']}};
}
