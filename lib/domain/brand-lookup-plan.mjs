import {brandKey} from './brands.mjs';
import {classifyListing} from './classification.mjs';
export const BRAND_LOOKUP_CREDITS=3;
export const MAX_BRAND_LOOKUPS=40;
/**
 * Plans provider brand-ID lookups (one call per brand, 3 credits each) for brands that appear in the collection but have no
 * verified ID yet. Brands with the most clothing, shoes and accessories come first; a brand whose listings are all homeware,
 * beauty or toys is left out unless the owner names it. A brand already resolved, or already looked up and found missing or
 * ambiguous, is not asked about again unless the owner names it explicitly.
 * @param {{limit?:number,brands?:string[]}} options
 * @param {{items?:{brand?:string}[]}} snapshot
 * @param {{references?:{name:string}[],checked?:{name:string}[]}} known
 */
export function makeBrandLookupPlan({limit=10,brands}={},snapshot={},{references=[],checked=[]}={}){
 if(!Number.isInteger(limit)||limit<1||limit>MAX_BRAND_LOOKUPS)throw new Error(`Choose 1–${MAX_BRAND_LOOKUPS} brands to look up.`);
 const resolved=new Set(references.map(row=>brandKey(row.name))),asked=new Set(checked.map(row=>brandKey(row.name)));
 const counts=new Map(),offFashion=new Set(['homeware','beauty','toys']);
 for(const item of snapshot.items??[]){const name=typeof item.brand==='string'?item.brand.trim():'';if(!name||name.length>100)continue;const key=brandKey(name);if(!key)continue;const row=counts.get(key)??{brand:name,count:0,fashion:0};row.count++;if(!offFashion.has(classifyListing(item).productGroup))row.fashion++;counts.set(key,row);}
 const named=Array.isArray(brands)?brands.map(name=>String(name).trim()).filter(name=>name&&name.length<=100):null;
 const pool=named?named.map(name=>({brand:name,count:counts.get(brandKey(name))?.count??0})).filter(row=>!resolved.has(brandKey(row.brand))):[...counts.values()].filter(row=>row.fashion>0&&!resolved.has(brandKey(row.brand))&&!asked.has(brandKey(row.brand)));
 const unique=[...new Map(pool.map(row=>[brandKey(row.brand),row])).values()].sort((a,b)=>(b.fashion??b.count)-(a.fashion??a.count)||b.count-a.count||a.brand.localeCompare(b.brand));
 const jobs=unique.slice(0,limit).map(row=>({brand:row.brand,query:row.brand,brandId:null,listings:row.count,maximumCredits:BRAND_LOOKUP_CREDITS}));
 return {version:1,kind:'brands',scope:'brands',jobs,maximumCredits:jobs.length*BRAND_LOOKUP_CREDITS,maximumItems:0,exactBrandJobs:0,department:'Not applicable',sizeFiltering:'No listings are fetched.',translation:'No translation is involved.',coverage:`${unique.length} brand${unique.length===1?'':'s'} in your collection ${unique.length===1?'has':'have'} no verified provider ID yet; ${jobs.length} will be looked up, busiest first.`};
}
/**
 * Decides what a lookup result means. Only a single brand whose name is the same (ignoring case, accents and punctuation) is
 * accepted. Several equally named brands are left for the owner, and a partial match such as "Nike ACG" for "Nike" never counts.
 * @param {string} name @param {unknown} found
 * @returns {{status:'matched'|'ambiguous'|'none',id?:number,title?:string,itemCount?:number,candidates:{id:number,title:string,itemCount:number}[]}}
 */
export function matchBrand(name,found){
 const rows=(Array.isArray(found)?found:[]).filter(row=>row&&typeof row==='object'&&Number.isSafeInteger(row.id)&&row.id>0&&typeof row.title==='string'&&row.title.trim()).map(row=>({id:row.id,title:row.title.trim().slice(0,100),itemCount:Number.isFinite(row.item_count)&&row.item_count>=0?Math.floor(row.item_count):0}));
 const exact=rows.filter(row=>brandKey(row.title)===brandKey(name));
 const candidates=rows.slice(0,5);
 if(exact.length===1)return {status:'matched',...exact[0],candidates};
 return {status:exact.length>1?'ambiguous':'none',candidates:exact.length>1?exact.slice(0,5):candidates};
}
