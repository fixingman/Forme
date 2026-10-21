import {classifyListing} from './classification.mjs';
import {listingGender} from './gender.mjs';
import {brandKey} from './brands.mjs';
import brandStyles from '../../data/brand-styles.json' with {type:'json'};

// Everything here is inference from listing text and a small editorial brand reference. It is always labelled as such,
// carries its evidence, and never overwrites a value supplied by the marketplace.
const brandStyle=new Map(Object.entries(brandStyles.styles).flatMap(([style,names])=>names.map(name=>[brandKey(name),style])));
const textOf=item=>`${item.title??''} ${item.originalTitle??''} ${item.category??''}`.normalize('NFKC').toLowerCase();
const seasonYear=text=>{const match=text.match(/\b(?:aw|fw|ss)\s?['’]?((?:19|20)?\d{2})\b/);if(!match)return null;const raw=match[1],year=raw.length===4?Number(raw):Number(raw)>=90?1900+Number(raw):2000+Number(raw);return year;};
/** Signals that a piece may be collectible. Not a measure of market scarcity and deliberately separate from the numeric `rarity` field. */
export function collectibleSignals(item,now=new Date().getFullYear()){
 const text=textOf(item),found=[];
 for(const [label,pattern] of [['archive',/\barchive\b/],['runway',/\brunway\b/],['vintage',/\bvintage\b/],['deadstock',/\bdead ?stock\b/],['sample',/\b(?:sample|prototype)\b/],['limited edition',/\blimited(?: edition)?\b|\bnumbered\b/],['one of a kind',/\bone[- ]of[- ]a[- ]kind\b/],['rare',/\brare\b/]])if(pattern.test(text))found.push(label);
 const year=seasonYear(text);if(year&&year<=now-10)found.push(`season ${year}`);
 return found;
}
const keyword=[['Archive',/\b(?:archive|runway|vintage|dead ?stock|sample|prototype)\b/],['Denim',/\b(?:denim|jeans|jean (?:jacket|shirt|shorts|skirt))\b/],['Techwear',/\b(?:gore-?tex|windstopper|softshell|hardshell|technical|cordura|waterproof shell)\b/],['Workwear',/\b(?:chore|work ?jacket|overalls?|dungarees?|coveralls?|boiler ?suit|workwear|arbetsjacka)\b/]];
const fashion=new Set(['clothing','bottoms','shoes','accessories']);
/** Suggests one of the built-in style names, with its evidence. Returns style '' when there is no basis. */
export function classifyStyle(item){
 if(!fashion.has(classifyListing(item).productGroup))return {style:'',styleSource:'unknown',styleEvidence:''};
 const text=textOf(item),year=seasonYear(text);
 if(year&&year<=new Date().getFullYear()-10)return {style:'Archive',styleSource:'title',styleEvidence:`season ${year}`};
 for(const [style,pattern] of keyword){const hit=text.match(pattern);if(hit)return {style,styleSource:'title',styleEvidence:hit[0]};}
 const byBrand=typeof item.brand==='string'?brandStyle.get(brandKey(item.brand)):undefined;
 return byBrand?{style:byBrand,styleSource:'brand-reference',styleEvidence:item.brand}:{style:'',styleSource:'unknown',styleEvidence:''};
}
/** Adds inferred fields to a listing without replacing anything the source already provided. */
export function withInferredQuality(item){
 const next={...item},signals=collectibleSignals(item);
 if(!item.style){const inferred=classifyStyle(item);if(inferred.style)Object.assign(next,inferred);}
 if(signals.length)next.collectibleSignals=signals;
 return next;
}
const pct=(count,total)=>total?Math.round(1000*count/total)/10:0;
const tally=(items,key)=>items.reduce((map,item)=>{const value=key(item);map[value]=(map[value]??0)+1;return map;},{});
/** Coverage of the fields that drive filtering and recommendations. Counts are of the supplied (already trusted) listings. */
export function coverageReport(items,now=Date.now()){
 const total=items.length,genders=items.map(listingGender),categories=items.map(classifyListing),hasSize=item=>typeof item.size==='string'&&item.size.trim()&&!/^not provided$/i.test(item.size.trim());
 const withStyle=items.filter(item=>item.style),withSignals=items.filter(item=>collectibleSignals(item).length);
 const brands=Object.entries(tally(items,item=>item.brand??'Unknown')).map(([brand,count])=>{const rows=items.filter(item=>(item.brand??'Unknown')===brand);return {brand,total:count,unknownDepartment:rows.filter(item=>listingGender(item).gender==='unknown').length,unknownCategory:rows.filter(item=>classifyListing(item).productGroup==='unknown').length,unclassifiedStyle:rows.filter(item=>!item.style).length};}).sort((a,b)=>b.total-a.total);
 const stale=items.filter(item=>{const at=Date.parse(item.observedAt??item.fetchedAt);return !Number.isFinite(at)||now-at>7*86400000;}).length;
 return {
  total,
  department:{known:genders.filter(g=>g.gender!=='unknown').length,knownPercent:pct(genders.filter(g=>g.gender!=='unknown').length,total),bySource:tally(genders,g=>g.genderSource),byValue:tally(genders,g=>g.gender)},
  category:{classified:categories.filter(c=>c.productGroup!=='unknown').length,classifiedPercent:pct(categories.filter(c=>c.productGroup!=='unknown').length,total),byGroup:tally(categories,c=>c.productGroup)},
  size:{provided:items.filter(hasSize).length,providedPercent:pct(items.filter(hasSize).length,total),bySizeGroup:tally(categories,c=>c.sizeGroup)},
  style:{classified:withStyle.length,classifiedPercent:pct(withStyle.length,total),bySource:tally(withStyle,item=>item.styleSource??'provided'),byStyle:tally(withStyle,item=>item.style)},
  collectibleSignals:{listings:withSignals.length,percent:pct(withSignals.length,total)},
  availability:{byState:tally(items,item=>item.availability&&item.availabilitySource==='provider'?item.availability:'unknown')},
  freshness:{staleOverSevenDays:stale},
  translation:{pending:items.filter(item=>item.titleTranslation==='pending').length},
  brands
 };
}
