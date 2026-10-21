import {brandReference} from '../../lib/domain/refresh-plan.mjs';
import {matchesSizeLabels} from '../../lib/domain/sizes.mjs';
// Settings files are data only. Never interpret their strings as code or URLs.
import {brandKey} from '../../lib/domain/brands.mjs';
export {brandKey};
const text=value=>typeof value==='string'&&value.length<=300;
export function makePlan(backup){
 const settings=backup?.settings;
 if(backup?.app!=='forme'||backup.version!==1||!settings||!Array.isArray(settings.following)||settings.following.length>1000||!settings.following.every(text)||!Array.isArray(settings.excluded)||!settings.excluded.every(text)||!Array.isArray(settings.searches)||settings.searches.length>1000)throw new Error('Invalid FORME settings backup.');
 const excluded=[...new Set(settings.excluded.map(brandKey))],jobs=[],skipped=[];
 for(const name of settings.following){const key=brandKey(name);if(!key||excluded.includes(key)||jobs.some(job=>job.id===`brand:${key}`))continue;const reference=brandReference(name);jobs.push({id:`brand:${key}`,kind:'brand',query:name.trim(),brand:name.trim(),...(reference?{brandId:reference.id}:{})});}
 for(const search of settings.searches){
  if(!Number.isSafeInteger(search?.id)||!['name','keyword','brand','size'].every(key=>text(search[key]))||!(search.max===''||((typeof search.max==='number'||typeof search.max==='string')&&Number.isFinite(Number(search.max))&&Number(search.max)>=0)))throw new Error('Invalid saved search in backup.');
  const query=[search.brand.trim(),search.keyword.trim()].filter(Boolean).join(' ');
  if(!query){skipped.push({name:search.name,reason:'Needs a keyword or brand; price alone is too broad.'});continue;}
  if(search.brand&&excluded.includes(brandKey(search.brand))){skipped.push({name:search.name,reason:'Search brand is excluded.'});continue;}
  const job={id:`search:${search.id}`,kind:'search',query,brand:search.brand.trim(),keyword:search.keyword.trim(),size:search.size.trim(),max:search.max};
  const duplicate=jobs.find(row=>row.query.toLowerCase()===query.toLowerCase()&&brandKey(row.brand)===brandKey(job.brand)&&!job.size&&job.max==='');
  if(duplicate)continue;
  if(jobs.some(row=>row.id===job.id))throw new Error('Duplicate saved search IDs.');
  jobs.push(job);
 }
 return {version:1,market:'se',excluded,jobs,skipped};
}
export function matchesJob(item,job,plan){
 if(plan.excluded.includes(brandKey(item.brand)))return false;
 if(job.brand&&brandKey(item.brand)!==brandKey(job.brand))return false;
 if(job.kind==='brand')return true;
 const words=job.keyword.toLocaleLowerCase().split(/\s+/).filter(Boolean);
 const haystack=`${item.brand} ${item.title} ${item.originalTitle??''} ${item.category}`.toLocaleLowerCase();
 return words.every(word=>haystack.includes(word))&&(!job.size||matchesSizeLabels(item.size,[job.size]))&&(job.max===''||item.price<=Number(job.max));
}
export function selectJobs(plan,coverage=[],limit=3){
 const times=new Map(coverage.map(row=>[row.id,Date.parse(row.fetchedAt)||0]));
 return [...plan.jobs].sort((a,b)=>(times.get(a.id)??0)-(times.get(b.id)??0)).slice(0,limit);
}
