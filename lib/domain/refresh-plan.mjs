import references from '../../data/vinted-brands.json' with {type:'json'};
import {sameBrand,brandKey} from './brands.mjs';
import {candidateBrands} from './recommendations.mjs';
export const brandReference=brand=>references.find(row=>sameBrand(row.name,brand));
export function makeRefreshPlan(settings,{scope='discover',limit=3}={},snapshot={}){
 if(!['discover','following'].includes(scope)||!Number.isInteger(limit)||limit<1||limit>3)throw new Error('Choose Discover or Following and 1–3 brand searches.');
 const menScope=settings.gender?.selected?.includes('men')&&!settings.gender.selected.includes('women');
 const brands=scope==='discover'?candidateBrands(settings).map(row=>row.brand):[...new Set(settings.following)];
 const lastSeen=new Map((snapshot.coverage??[]).map(row=>[brandKey(row.query),Date.parse(row.fetchedAt)||0]));
 if(scope==='following')brands.sort((a,b)=>(lastSeen.get(brandKey(a))??0)-(lastSeen.get(brandKey(b))??0));
 const jobs=brands.filter(brand=>!settings.excluded.some(excluded=>sameBrand(brand,excluded))).slice(0,limit).map(brand=>{
  const reference=brandReference(brand);
  return {brand,query:brand,brandId:reference?.id??null,reference:reference?.source??null,catalogIds:menScope?'5':null,maximumCredits:5,perPage:20};
 });
 return {version:1,scope,jobs,maximumCredits:jobs.length*5,maximumItems:jobs.length*20,exactBrandJobs:jobs.filter(job=>job.brandId).length,department:menScope?'Men’s catalog, including unisex items filed there':'Department labels checked after fetching',sizeFiltering:settings.sizing?.enabled?'Your size labels are checked after fetching, so some fetched results may be hidden.':'My sizes is switched off.',translation:'Existing English translations are reused. New titles may need review; no translation charges are added.',coverage:menScope?'These clothing searches do not refresh homeware or all unisex categories.':'Search results still pass your department preferences.'};
}
