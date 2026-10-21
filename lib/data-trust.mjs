import {englishListing} from './listing-language.mjs';
import {listingGender} from './gender.mjs';
import {classifyListing} from './classification.mjs';
import {passesListingReview} from './listing-review.mjs';
export const STALE_AFTER_MS=7*86400000;
export const validTimestamp=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value));
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const url=(value,check)=>{try{const parsed=new URL(value);return parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&!parsed.port&&check(parsed);}catch{return false;}};
export function listingProblems(item,now=Date.now()){
 if(!item||typeof item!=='object')return ['invalid-record'];
 const problems=[];
 if(item.source!=='vinted'||!Number.isSafeInteger(item.id)||item.id<=1000||item.sourceKey!==`vinted:${item.id}`||item.sourceId!==String(item.id))problems.push('invalid-identity');
 if((item.originalTitle!==undefined&&!text(item.originalTitle,300))||(item.originalCondition!==undefined&&typeof item.originalCondition!=='string')||!text(item.title,300)||!text(item.brand,200)||!text(item.size,100)||!text(item.condition,200))problems.push('invalid-metadata');
 if(typeof item.price!=='number'||!Number.isFinite(item.price)||item.price<0||item.currency!=='SEK')problems.push('invalid-price');
 if(!url(item.sourceUrl,u=>u.hostname==='www.vinted.se'&&new RegExp(`^/items/${item.id}(?:-|$)`).test(u.pathname)))problems.push('invalid-source-url');
 if(!url(item.imageUrl,u=>u.hostname==='vinted.net'||u.hostname.endsWith('.vinted.net')))problems.push('invalid-image-url');
 if(!validTimestamp(item.fetchedAt)||Date.parse(item.fetchedAt)>now+300000)problems.push('invalid-observation-time');
 if(item.observedAt!==undefined&&(!validTimestamp(item.observedAt)||Date.parse(item.observedAt)>now+300000))problems.push('invalid-history-time');
 if(item.availabilityObservedAt!==undefined&&(!validTimestamp(item.availabilityObservedAt)||Date.parse(item.availabilityObservedAt)>Date.parse(item.fetchedAt)))problems.push('invalid-availability-time');
 if(item.firstSeenAt!==undefined&&(!validTimestamp(item.firstSeenAt)||Date.parse(item.firstSeenAt)>Date.parse(item.fetchedAt)))problems.push('invalid-first-seen-time');
 return problems;
}
export function availability(item){
 const state=['sold','reserved','unavailable'].includes(item.availability)&&item.availabilitySource==='provider'&&validTimestamp(item.availabilityObservedAt)?item.availability:'unknown';
 return {state,label:state==='sold'?'Sold':state==='reserved'?'Reserved':state==='unavailable'?'Unavailable':'Availability unknown'};
}
export const canBrowse=item=>!item.source||availability(item).state==='unknown';
export function freshness(item,now=Date.now()){
 const at=item.observedAt??item.fetchedAt;
 if(!validTimestamp(at)||Date.parse(at)>now+300000)return {state:'unknown',at:null,label:'Observation time unknown'};
 const age=Math.max(0,now-Date.parse(at));
 return {state:age>STALE_AFTER_MS?'stale':'recent',at,label:age>STALE_AFTER_MS?'Not observed in over 7 days':'Recently observed'};
}
// Validate both database and fallback snapshots. Invalid rows are excluded from browsing,
// but the source file is retained; this is not a claim of marketplace verification.
export function trustedSnapshot(snapshot,now=Date.now()){
 if(!snapshot||!Array.isArray(snapshot.items)||!validTimestamp(snapshot.fetchedAt)||Date.parse(snapshot.fetchedAt)>now+300000)throw new Error('Invalid listing snapshot');
 const accepted=new Map(),issues=[];
 for(const row of snapshot.items){
  const problems=listingProblems(row,now);
  if(!passesListingReview(row??{}))problems.push('review-excluded');
  if(problems.length){issues.push({key:typeof row?.sourceKey==='string'?row.sourceKey:null,reasons:problems});continue;}
  const fields=['id','source','sourceId','sourceKey','sourceUrl','title','brand','brandId','brandSource','price','currency','size','condition','imageUrl','fetchedAt','firstSeenAt','observedAt','originalTitle','originalCondition','gender','genderSource','collectionCatalogIds','availability','availabilitySource','availabilityObservedAt','previousPrice','priceChangedAt','newlyCollected','matchedJobs'];
  const item=englishListing({...Object.fromEntries(fields.filter(key=>row[key]!==undefined).map(key=>[key,row[key]])),category:typeof row.category==='string'?row.category:'',style:typeof row.style==='string'?row.style:'',rarity:0,age:1,image:''}),previous=accepted.get(item.sourceKey);
  if(previous){issues.push({key:item.sourceKey,reasons:['duplicate-identity']});if(Date.parse(previous.fetchedAt)>=Date.parse(item.fetchedAt))continue;}
  accepted.set(item.sourceKey,item);
 }
 const items=[...accepted.values()];
 const prior=snapshot.quality;const carried=prior&&Number.isSafeInteger(prior.rejected)&&prior.rejected>=0&&prior.rejected<=1000000&&prior.accepted===snapshot.items.length&&prior.input===prior.accepted+prior.rejected?prior.rejected:0;
 if(carried&&Array.isArray(prior.issues))for(const issue of prior.issues.slice(0,1000))if(issue&&Array.isArray(issue.reasons)&&issue.reasons.every(reason=>typeof reason==='string'))issues.push({key:typeof issue.key==='string'?issue.key:null,reasons:issue.reasons});
 const count=predicate=>items.filter(predicate).length;
 const observations=items.map(item=>item.observedAt??item.fetchedAt).sort((a,b)=>Date.parse(a)-Date.parse(b));
 return {...snapshot,items,quality:{evaluatedAt:new Date(now).toISOString(),input:snapshot.items.length+carried,accepted:items.length,rejected:snapshot.items.length-items.length+carried,issues,
  stale:count(item=>freshness(item,now).state==='stale'),oldestObservation:observations[0]??null,newestObservation:observations.at(-1)??null,
  unknownDepartment:count(item=>listingGender(item).gender==='unknown'),departmentFromSearch:count(item=>listingGender(item).genderSource==='search-filter'),departmentFromTitle:count(item=>listingGender(item).genderSource==='title'),departmentFromProvider:count(item=>listingGender(item).genderSource==='provider'),
  unknownCategory:count(item=>classifyListing(item).productGroup==='unknown'),pendingTranslations:count(item=>item.titleTranslation==='pending'),unknownAvailability:count(item=>availability(item).state==='unknown'),unavailable:count(item=>!canBrowse(item))}};
}
