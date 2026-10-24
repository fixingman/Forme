import {createHash} from 'node:crypto';
import {recommendListings,listingKey} from '../../lib/domain/recommendations.mjs';
import {listingTraits,feedbackSnapshot} from '../../lib/domain/taste-profile.mjs';
import {classifyStyle} from '../../lib/domain/data-quality.mjs';
import {brandKey,isExcludedListing,sameBrand} from '../../lib/domain/brands.mjs';
import {canBrowse} from '../../lib/domain/data-trust.mjs';
import {matchesGender} from '../../lib/domain/gender.mjs';
import {matchesMySizes} from '../../lib/domain/sizes.mjs';
import {passesListingReview} from '../../lib/domain/listing-review.mjs';
import {classifyListing} from '../../lib/domain/classification.mjs';

export function featuresFor(item){
 const style=item.style||classifyStyle(item).style;
 const tags=[`brand:${brandKey(item.brand)}`,...listingTraits(item),...(style?[`style:${style}`]:[]),`price-band:${Math.floor(Math.log2(Math.max(1,item.price)))}`];
 return Object.fromEntries([...new Set(tags)].sort().map(tag=>[tag,1]));
}
// Dismissal and unsave/restore are separate, reversible state changes. A saved-and-hidden item is negative until restored.
export function feedbackState(events){
 const state=new Map();
 for(const event of events){
  if(!['save','unsave','dismiss','restore'].includes(event.action)||typeof event.key!=='string')throw new Error('Invalid feedback event');
  const row=state.get(event.key)??{saved:false,hidden:false};
  if(event.action==='save')row.saved=true;if(event.action==='unsave')row.saved=false;
  if(event.action==='dismiss')row.hidden=true;if(event.action==='restore')row.hidden=false;
  state.set(event.key,row);
 }
 return state;
}
export function activeExamples(items,events){
 const rows=new Map(items.map(item=>[listingKey(item),item]));
 return [...feedbackState(events)].flatMap(([key,state])=>{
  const item=rows.get(key);return item&&(state.hidden||state.saved)?[{key,label:state.hidden?0:1,weight:1,features:featuresFor(item)}]:[];
 });
}
export function hardEligible(item,settings){
 return canBrowse(item)&&matchesGender(item,settings.gender)&&matchesMySizes(item,settings.sizing)&&passesListingReview(item)&&!isExcludedListing(item,settings.excluded??[])&&!(settings.following??[]).some(name=>sameBrand(name,item.brand))&&!['unknown','toys','beauty'].includes(classifyListing(item).productGroup);
}
export function rankBaseline(items,settings,events,keys,now){
 const state=feedbackState(events),saved=items.filter(item=>state.get(listingKey(item))?.saved).map(item=>item.id),dismissed=[...state].filter(([,row])=>row.hidden).map(([key])=>key);
 const preferences={...settings,saved,dismissed,tasteFeedback:items.filter(item=>dismissed.includes(listingKey(item))).map(feedbackSnapshot)};
 return recommendListings(items,preferences,{signals:items,now}).filter(row=>keys.has(listingKey(row.item))).map(row=>({key:listingKey(row.item),score:row.score}));
}
export function catalogHashFor(items){
 const fields=['key','brand','title','price','size','condition','imageUrl','sourceUrl','observedAt'];
 return createHash('sha256').update(JSON.stringify([...items].sort((a,b)=>a.key.localeCompare(b.key)).map(item=>fields.map(field=>item[field]??null)))).digest('hex');
}
export function rankedMetrics(ranking,labels,k=10){
 if(!Object.keys(labels).length)return {returned:ranking.length,precisionAt10:null,recallAt10:null,ndcgAt10:null};
 const top=ranking.slice(0,k),positives=Object.values(labels).filter(value=>value===1).length;
 const hits=top.filter(row=>labels[row.key]===1).length;
 const dcg=top.reduce((sum,row,index)=>sum+(labels[row.key]===1?1/Math.log2(index+2):0),0);
 const ideal=Array.from({length:Math.min(positives,k)},(_,index)=>1/Math.log2(index+2)).reduce((a,b)=>a+b,0);
 return {returned:ranking.length,precisionAt10:hits/Math.min(k,Object.keys(labels).length),recallAt10:positives?hits/positives:null,ndcgAt10:ideal?dcg/ideal:null};
}
export function makeCase({name,kind,items,settings,events=[],testKeys,labels={},now=Date.now()}){
 const state=feedbackState(events),known=new Set([...state].filter(([,row])=>row.saved||row.hidden).map(([key])=>key));
 const candidates=items.filter(item=>testKeys.has(listingKey(item))&&!known.has(listingKey(item))&&hardEligible(item,settings));
 const keys=new Set(candidates.map(listingKey));
 return {name,kind,now,items:items.map(item=>({key:listingKey(item),features:featuresFor(item),at:item.observedAt??item.fetchedAt??new Date(now).toISOString()})),examples:activeExamples(items,events),candidateKeys:[...keys],baseline:rankBaseline(items,settings,events,keys,now),labels:Object.fromEntries(Object.entries(labels).filter(([key])=>keys.has(key)))};
}
export function syntheticCases(){
 const now=Date.parse('2026-10-24T00:00:00Z');
 const settings={following:['Our Legacy'],excluded:['Zara'],styles:['Minimalism'],saved:[],dismissed:[],styleRules:{},gender:{selected:['men','unisex'],includeUnknown:false},sizing:{enabled:true,selected:['M'],groups:{clothing:['M'],waist:[],shoes:[],other:[]},includeOneSize:false,includeUnspecified:false}};
 const brands=['Auralee','Lemaire','Studio Nicholson'];
 const recipes=[['relaxed linen trousers',1],['black cotton shirt',1],['blue wool cardigan',1],['straight cotton trousers',1],['cropped leather jacket',0],['oversized denim jacket',0],['black leather trousers',0],['cropped cotton shirt',0]];
 const cases=[];
 for(let seed=0;seed<3;seed++){
  const items=[],events=[],labels={},testKeys=new Set();let id=100000+seed*1000;
  for(let round=0;round<4;round++)for(const [index,[title,target]] of recipes.entries())for(let brandIndex=0;brandIndex<brands.length;brandIndex++){
   const item={id:++id,source:'vinted',sourceId:String(id),sourceKey:`vinted:${id}`,brand:brands[brandIndex],title,category:'',style:'Minimalism',price:200+(index%3)*100,size:'M',gender:'men',fetchedAt:new Date(now-(round+1)*3600000).toISOString()};items.push(item);
   if((round+brandIndex+seed)%4===0)events.push({key:listingKey(item),action:target?'save':'dismiss'});
   else{testKeys.add(listingKey(item));labels[listingKey(item)]=target;}
  }
  const probe=items.find(item=>labels[listingKey(item)]===1);
  for(const [index,extra] of [{brand:'Zara'},{gender:'women'},{size:'S'},{availability:'sold',availabilitySource:'provider',availabilityObservedAt:new Date(now).toISOString()}].entries()){
   const item={...probe,...extra,id:++id,sourceId:String(id),sourceKey:`vinted:${id}`};items.push(item);testKeys.add(listingKey(item));labels[listingKey(item)]=1;
  }
  cases.push(makeCase({name:`synthetic-pattern-${seed+1}`,kind:'synthetic-not-owner-feedback',items,settings,events,testKeys,labels,now}));
 }
 return cases;
}
