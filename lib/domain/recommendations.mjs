import {canBrowse} from './data-trust.mjs';
import {matchesGender} from './gender.mjs';
import {sameBrand,brandKey,isExcludedListing} from './brands.mjs';
import {classifyListing} from './classification.mjs';
import {matchesMySizes} from './sizes.mjs';
import {passesListingReview} from './listing-review.mjs';
import {classifyStyle} from './data-quality.mjs';
import {tasteProfile,listingTraits,signalKey} from './taste-profile.mjs';
import brandStyles from '../../data/brand-styles.json' with {type:'json'};
// Editorial starting points. Saved pieces and explicit styles extend this seed.
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
export const listingKey=signalKey;
export function candidateBrands(preferences,source=[]){
 const candidates=new Map(),profile=tasteProfile(preferences,source);
 const blocked=brand=>[...(preferences.following??[]),...(preferences.excluded??[])].some(value=>sameBrand(value,brand));
 function add(brand,because,reason,priority,kind){
  if(!brand||blocked(brand))return;
  const key=brandKey(brand),previous=candidates.get(key);
  if(!previous||previous.priority<priority)candidates.set(key,{brand,because,reason,priority,kind});
 }
 for(const row of relatedBrands)if((preferences.following??[]).some(brand=>sameBrand(brand,row.brand)))for(const brand of row.related)add(brand,row.brand,`Because you follow ${row.brand}`,10,'related-brand');
 for(const item of profile.saved)add(item.brand,item.brand,'A brand you saved',20+Math.min(profile.brands.get(brandKey(item.brand))??0,3),'saved-brand');
 for(const [style,brands] of Object.entries(brandStyles.styles)){
  const explicit=profile.explicitStyles.includes(style),saved=profile.styles.has(style);
  if(explicit||saved)for(const brand of brands)add(brand,style,explicit?`From your ${style} style reference`:`Related to the ${style} pieces you saved`,explicit?7:6,'style');
 }
 return [...candidates.values()].sort((a,b)=>b.priority-a.priority);
}
export function recommendListings(source,preferences,{signals=source,now=Date.now()}={}){
 const profile=tasteProfile(preferences,signals),candidates=new Map(candidateBrands(preferences,signals).map(row=>[brandKey(row.brand),row]));
 const ranked=source.flatMap(item=>{
  if(!canBrowse(item)||!matchesGender(item,preferences.gender)||!passesListingReview(item)||!matchesMySizes(item,preferences.sizing)||(preferences.following??[]).some(brand=>sameBrand(brand,item.brand))||isExcludedListing(item,preferences.excluded??[])||(preferences.dismissed??[]).includes(listingKey(item)))return [];
  const classification=classifyListing(item);
  if(['unknown','toys','beauty'].includes(classification.productGroup))return [];
  const style=item.style||classifyStyle(item).style,candidate=candidates.get(brandKey(item.brand));
  const explicit=!!style&&profile.explicitStyles.includes(style),savedStyle=!!style&&profile.styles.has(style);
  if(!candidate&&!explicit&&!savedStyle)return [];
  const evidence=[],brandAffinity=profile.brands.get(brandKey(item.brand))??0;
  let score=10;
  if(brandAffinity){score+=Math.min(brandAffinity,3)*4;evidence.push('a brand you saved');}
  if(explicit){score+=5;evidence.push(`matches your ${style} style`);}
  if(savedStyle){score+=Math.min(profile.styles.get(style),3)*2;if(!explicit)evidence.push('similar style to saved pieces');}
  const traits=listingTraits(item),matching=traits.filter(trait=>profile.traits.has(trait));
  for(const trait of matching){const kind=trait.split(':')[0];score+=Math.min(profile.traits.get(trait),3)*(kind==='category'?2:kind==='material'?1:0.5);}
  const best=matching.find(t=>t.startsWith('category:'))??matching.find(t=>t.startsWith('material:'));
  if(best)evidence.push(`${best.split(':')[1]} like pieces you saved`);
  score-=Math.min(profile.negativeBrands.get(brandKey(item.brand))??0,3);
  // A single dismissal never suppresses a whole material/category preference.
  score-=Math.min(3,traits.filter(t=>(profile.negativeTraits.get(t)??0)>=2).length);
  const observed=Date.parse(item.observedAt??item.fetchedAt),age=Number.isFinite(observed)&&observed<=now?now-observed:null;
  if(item.source&&age!==null)score+=age<86400000?2:age<7*86400000?1:-2;
  // One clear reason, then any genuinely different ones as optional details. Reasons that say the same kind of thing (two about style,
  // two about a saved brand) collapse to the first, so a card never repeats itself.
  const cap=text=>text.charAt(0).toUpperCase()+text.slice(1),stated=[];
  if(candidate)stated.push({kind:candidate.kind,text:candidate.reason});
  if(brandAffinity)stated.push({kind:'saved-brand',text:'A brand you saved'});
  if(explicit)stated.push({kind:'style',text:`Matches your ${style} style`});else if(savedStyle)stated.push({kind:'style',text:'Similar style to pieces you saved'});
  if(best)stated.push({kind:'trait',text:cap(`${best.split(':')[1]} like pieces you saved`)});
  const seen=new Set(),distinct=stated.filter(row=>!seen.has(row.kind)&&seen.add(row.kind));
  return [{item,score,reason:distinct[0].text,details:distinct.slice(1,3).map(row=>row.text),evidence}];
 }).sort((a,b)=>b.score-a.score||((Date.parse(b.item.fetchedAt)||0)-(Date.parse(a.item.fetchedAt)||0))||(a.item.age??0)-(b.item.age??0)||a.item.id-b.item.id);
 // Keep the strongest item first, then interleave brands for variety.
 const buckets=new Map();for(const entry of ranked){const key=brandKey(entry.item.brand);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(entry);}
 const result=[];while([...buckets.values()].some(bucket=>bucket.length))for(const bucket of buckets.values())if(bucket.length)result.push(bucket.shift());return result;
}
