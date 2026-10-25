import references from '../../data/vinted-brands.json' with {type:'json'};
import {sameBrand,brandKey} from './brands.mjs';
import {candidateBrands} from './recommendations.mjs';
import {MAX_BRAND_SEARCHES} from './collection-limits.mjs';
export const brandReference=brand=>references.find(row=>sameBrand(row.name,brand));
export function makeRefreshPlan(settings,{scope='discover',limit=3,savedListings=[]}={},snapshot={},now=Date.now()){
 if(!['discover','following','personal'].includes(scope)||!Number.isInteger(limit)||limit<1||limit>MAX_BRAND_SEARCHES)throw new Error(`Choose your edit, Discover or Following and 1–${MAX_BRAND_SEARCHES} brand searches.`);
 const menScope=settings.gender?.selected?.includes('men')&&!settings.gender.selected.includes('women');
 const catalogIds=menScope?'5':null,signals=[...savedListings,...(snapshot.items??[])];
 const followed=[...new Set(settings.following)].map(brand=>({brand,scope:'following',priority:12}));
 const discoveries=candidateBrands(settings,signals).map(row=>({...row,scope:'discover'}));
 const choices=scope==='following'?followed:scope==='discover'?discoveries:[...followed,...discoveries];
 const lastSeen=new Map();
 for(const row of snapshot.coverage??[]){if(typeof row.query==='string'){const at=Date.parse(row.fetchedAt);if(Number.isFinite(at)&&at<=now)lastSeen.set(brandKey(row.query),Math.max(lastSeen.get(brandKey(row.query))??0,at));}}
 for(const row of snapshot.refreshHistory??[]){if(row.catalogIds===catalogIds&&typeof row.brand==='string'){const at=Date.parse(row.at);if(Number.isFinite(at)&&at<=now)lastSeen.set(brandKey(row.brand),Math.max(lastSeen.get(brandKey(row.brand))??0,at));}}
 const unique=[...new Map(choices.filter(row=>!settings.excluded.some(excluded=>sameBrand(row.brand,excluded))).map((row,index)=>[brandKey(row.brand),{...row,index,lastChecked:lastSeen.get(brandKey(row.brand))??0}])).values()];
 unique.sort((a,b)=>a.lastChecked-b.lastChecked||b.priority-a.priority||a.index-b.index);
 const jobs=unique.slice(0,limit).map(row=>{
  const brand=row.brand;
  const reference=brandReference(brand);
  return {brand,scope:row.scope,query:brand,brandId:reference?.id??null,reference:reference?.source??null,catalogIds,maximumCredits:5,perPage:20,lastCheckedAt:row.lastChecked?new Date(row.lastChecked).toISOString():null};
 });
 return {version:1,scope,jobs,maximumCredits:jobs.length*5,maximumItems:jobs.length*20,exactBrandJobs:jobs.filter(job=>job.brandId).length,department:menScope?'Men’s catalog, including unisex items filed there':'Department labels checked after fetching',sizeFiltering:settings.sizing?.enabled?'Your size labels are checked after fetching, so some fetched results may be hidden.':'My sizes is switched off.',translation:'Existing English translations are reused. New titles may need review; no translation charges are added.',coverage:`Least-recently-checked brands go first; refreshes rotate across ${unique.length} eligible brands. ${menScope?'These clothing searches do not refresh homeware or all unisex categories.':'Search results still pass your department preferences.'}`};
}
export function recordRefresh(snapshot,job,at,metrics){
 const previous=(snapshot.refreshHistory??[]).filter(row=>typeof row?.brand==='string'&&!(sameBrand(row.brand,job.brand)&&row.catalogIds===job.catalogIds));
 return [...previous,{brand:job.brand,catalogIds:job.catalogIds,scope:job.scope,at,...metrics}].slice(-1000);
}
