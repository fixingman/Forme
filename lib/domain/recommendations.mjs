import {canBrowse} from './data-trust.mjs';
import {matchesGender} from './gender.mjs';
import {sameBrand,brandKey,isExcludedListing} from './brands.mjs';
import {classifyListing} from './classification.mjs';
import {matchesMySizes} from './sizes.mjs';
import {passesListingReview} from './listing-review.mjs';
// Small editorial seed, not a learned similarity model or marketplace taxonomy.
export const relatedBrands=[
 {brand:'Our Legacy',related:['Auralee','Lemaire','Studio Nicholson']},
 {brand:'Acne Studios',related:['Lemaire','Studio Nicholson','A.P.C.']},
 {brand:'Margaret Howell',related:['Studio Nicholson','Auralee','MHL']},
 {brand:'Comme des Garçons',related:['Issey Miyake','Yohji Yamamoto','Junya Watanabe']},
 {brand:'Engineered Garments',related:['Needles','South2 West8','Beams Plus']},
 {brand:'Arket',related:['COS','Uniqlo U','Studio Nicholson']},
 {brand:'HAY',related:['Muuto','Ferm Living','Normann Copenhagen']},
 {brand:'Alessi',related:['Stelton','Georg Jensen']}
];
export const listingKey=item=>item.sourceKey??`${item.source??'demo'}:${item.sourceId??item.id}`;
export function candidateBrands(preferences){
 const candidates=new Map();
 for(const row of relatedBrands)if(preferences.following.some(brand=>sameBrand(brand,row.brand)))for(const brand of row.related){
  if([...preferences.following,...preferences.excluded].some(value=>sameBrand(value,brand)))continue;
  const key=brandKey(brand);if(!candidates.has(key))candidates.set(key,{brand,because:row.brand});
 }
 return [...candidates.values()];
}
export function recommendListings(source,preferences){
 const candidates=candidateBrands(preferences),saved=source.filter(item=>canBrowse(item)&&preferences.saved.includes(item.id)),dismissed=source.filter(item=>canBrowse(item)&&(preferences.dismissed??[]).includes(listingKey(item)));
 const ranked=source.flatMap(item=>{
  if(!canBrowse(item)||!matchesGender(item,preferences.gender)||!passesListingReview(item)||!matchesMySizes(item,preferences.sizing)||preferences.following.some(brand=>sameBrand(brand,item.brand))||isExcludedListing(item,preferences.excluded)||(preferences.dismissed??[]).includes(listingKey(item)))return [];
  const candidate=candidates.find(row=>sameBrand(row.brand,item.brand));if(!candidate)return [];
  const classification=classifyListing(item);
  if(['unknown','toys','beauty'].includes(classification.productGroup))return [];
  const affinity=saved.some(savedItem=>classifyListing(savedItem).productGroup===classification.productGroup);
  const brandAffinity=saved.some(savedItem=>sameBrand(savedItem.brand,item.brand));
  const negative=Math.min(2,dismissed.filter(hidden=>sameBrand(hidden.brand,item.brand)).length);
  return [{item,score:10+(affinity?2:0)+(brandAffinity?3:0)-negative,reason:`Because you follow ${candidate.because}${brandAffinity?' · a brand you saved':affinity?' · similar category to a saved item':''}`}];
 }).sort((a,b)=>b.score-a.score||a.item.age-b.item.age||a.item.id-b.item.id);
 // Round-robin brands prevents one source overwhelming the first screen.
 const buckets=new Map();for(const entry of ranked){const key=brandKey(entry.item.brand);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(entry);}
 const result=[];while([...buckets.values()].some(bucket=>bucket.length))for(const bucket of buckets.values())if(bucket.length)result.push(bucket.shift());return result;
}
