import {refreshControl} from '../lib/server/refresh-control.mjs';
// Explicit local collection. The local ledger is not a distributed/account-wide quota.
import {mkdir,readFile,writeFile,rename,open,unlink,stat} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {openStore} from '../lib/server/store.mjs';
import {normalizeVinted} from './vinted-normalize.mjs';
import {makePlan,matchesJob,selectJobs} from './collection-plan.mjs';
try{process.loadEnvFile('.env.local');}catch(error){if(error.code!=='ENOENT')throw error;}
const args=process.argv.slice(2),index=args.indexOf('--settings');
for(let i=0;i<args.length;i++){if(args[i]==='--settings'){if(!args[++i]||args[i].startsWith('--'))throw new Error('Missing settings path.');}else if(!['--plan','--complete','--retry-once'].includes(args[i]))throw new Error('Use --settings PATH, --plan, or --complete.');}
const dir='public/data',output=`${dir}/vinted.json`,stateDir='.forme-data',settingsPath=index>=0?args[index+1]:`${stateDir}/settings.json`;
let localProfile=null;if(index<0&&existsSync(`${stateDir}/forme.sqlite`)){const store=openStore();try{localProfile=store.profile().profile;}finally{store.close();}}
if(!localProfile&&(await stat(settingsPath)).size>2*1024*1024)throw new Error('Settings backup exceeds 2 MB.');
const backup=localProfile??JSON.parse(await readFile(settingsPath,'utf8')),plan=makePlan(backup);
const fingerprint=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
async function readJson(path,fallback){try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}}
async function atomic(path,value){await writeFile(`${path}.tmp`,JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(`${path}.tmp`,path);}
async function enforceControlBudget(credits){if(credits>0&&existsSync(`${stateDir}/refresh.sqlite`)){const control=refreshControl();try{if((await control.status()).remainingCredits<credits)throw new Error('Configured daily credit cap reached. No requests sent.');}finally{control.close();}}}
const prior=await readJson(output,{items:[]}),coverage=prior.planFingerprint===fingerprint?prior.coverage??[]:[];
const complete=args.includes('--complete');
const choose=covered=>complete?plan.jobs.filter(job=>!covered.some(row=>row.id===job.id)):selectJobs(plan,covered);
const selected=choose(coverage);
if(complete&&selected.length*5>240)throw new Error('Remaining collection exceeds the one-time 240-credit allowance.');
const summary={followedBrandQueries:plan.jobs.filter(job=>job.kind==='brand').length,savedSearchQueries:plan.jobs.filter(job=>job.kind==='search').length,totalQueries:plan.jobs.length,skipped:plan.skipped,nextQueries:selected.map(job=>job.query),maximumRequests:selected.length,reservedCredits:selected.length*5,perPage:20};
if(args.includes('--plan')){console.log(JSON.stringify(summary,null,2));process.exit(0);}
if(!selected.length){console.log('All planned queries are already collected. No credits spent.');process.exit(0);}
await mkdir(dir,{recursive:true});await mkdir(stateDir,{recursive:true});
const lock=await open(`${stateDir}/refresh.lock`,'wx').catch(()=>{throw new Error('Collection/translation already locked.');});
try {
 // Re-read under lock so a job cannot spend from a stale ledger or overwrite newer results.
 const current=await readJson(output,{items:[]});
 if(!complete&&current.planFingerprint===fingerprint&&current.fetchedAt&&Date.now()-Date.parse(current.fetchedAt)<6*3600000){console.log('Snapshot is under six hours old. No credits spent.');}
 else {
 if(!process.env.SCRAPEBADGER_API_KEY)throw new Error('SCRAPEBADGER_API_KEY is required');
 const activeCoverage=current.planFingerprint===fingerprint?current.coverage??[]:[],jobs=choose(activeCoverage);
 if(!jobs.length){console.log('All queries already collected. No credits spent.');process.exitCode=0;}
 if(jobs.length*5>240)throw new Error('Batch exceeds 240 credits.');
 const today=new Date().toISOString().slice(0,10),ledger=await readJson(`${stateDir}/usage.json`,{});
 const usage=ledger[today]??{reservedCredits:0,reportedCredits:0},reservation=jobs.length*5;
 if(!complete&&usage.reservedCredits+reservation>15)throw new Error('Local daily cap reached (15 reserved credits). No requests sent.');
 let allowances,allowance,newReservation=0;
 if(complete){
  allowances=await readJson(`${stateDir}/completion-allowances.json`,{});
  allowance=allowances[fingerprint];
  if(!allowance){allowance={reservedCredits:reservation,usedCredits:0,reservedAt:new Date().toISOString()};newReservation=reservation;}
  // Migrate the initial reservation after the observed 429: completed checkpoint charges are known.
  if(allowance.usedCredits===undefined)allowance.usedCredits=activeCoverage.filter(row=>Date.parse(row.fetchedAt)>=Date.parse(allowance.reservedAt)).reduce((sum,row)=>sum+(row.reportedCredits??5),0);
  if(args.includes('--retry-once')&&(allowance.recoveryReservedCredits??0)<10&&allowance.usedCredits+reservation>allowance.reservedCredits&&allowance.usedCredits+reservation-allowance.reservedCredits<=5){allowance.reservedCredits+=5;allowance.recoveryReservedCredits=(allowance.recoveryReservedCredits??0)+5;newReservation+=5;}
  if(allowance.reservedCredits>240+(allowance.recoveryReservedCredits??0)||allowance.reservedCredits>250||allowance.usedCredits+reservation>allowance.reservedCredits)throw new Error('One-time completion allowance exhausted. No requests sent.');
  await enforceControlBudget(newReservation);allowances[fingerprint]=allowance;await atomic(`${stateDir}/completion-allowances.json`,allowances);
 }
 if(!complete)await enforceControlBudget(reservation);
 ledger[today]=complete?{...usage,oneTimeReservedCredits:(usage.oneTimeReservedCredits??0)+newReservation}:{...usage,reservedCredits:usage.reservedCredits+reservation};await atomic(`${stateDir}/usage.json`,ledger);
 // Private preferences are never placed in public assets.
 await atomic(`${stateDir}/settings.json`,backup);await atomic(`${stateDir}/collection-plan.json`,plan);
 const fetchedAt=new Date().toISOString(),rows=new Map(),old=new Map(current.items.map(item=>[item.sourceKey,item])),requests=[];
 const activeJobs=new Map(plan.jobs.map(job=>[job.id,job]));
 let covered=[...activeCoverage];
 for(const item of current.items){const matchedJobs=(item.matchedJobs??[]).filter(id=>id.startsWith('discover:')||(activeJobs.has(id)&&matchesJob(item,activeJobs.get(id),plan)));if(matchedJobs.length)rows.set(item.sourceKey,{...item,matchedJobs});}
 let firstRequest=true;
 for(const job of jobs){
  // Trial rate limiting was observed after five rapid requests. Stay below five/minute.
  if(!firstRequest&&process.env.NODE_ENV!=='test')await delay(13000);
  firstRequest=false;
  if(complete){if(allowance.usedCredits+5>allowance.reservedCredits)throw new Error('Completion allowance exhausted.');allowance.usedCredits+=5;await atomic(`${stateDir}/completion-allowances.json`,allowances);}
  const response=await fetch(`https://scrapebadger.com/v1/vinted/search?${new URLSearchParams({query:job.query,market:'se',per_page:'20',page:'1',...(job.brandId?{brand_ids:job.brandId}:{})})}`,{headers:{'X-API-Key':process.env.SCRAPEBADGER_API_KEY},signal:AbortSignal.timeout(90000),redirect:'error'}).catch(async error=>{await atomic(`${stateDir}/last-provider-error.json`,{status:error.name,causeCode:error.cause?.code??null,query:job.query,reportedCredits:null,at:new Date().toISOString()});throw new Error(`Provider request ${error.name}. Checkpoint retained; request credits remain reserved.`);});
  const header=response.headers.get('x-credits-used'),number=header===null?NaN:Number(header),reported=Number.isFinite(number)&&number>=0?number:null;
  if(complete&&reported!==null&&reported<=5){allowance.usedCredits-=5-reported;await atomic(`${stateDir}/completion-allowances.json`,allowances);}
  if(reported!==null){ledger[today].reportedCredits+=reported;await atomic(`${stateDir}/usage.json`,ledger);}
  if(!response.ok){await atomic(`${stateDir}/last-provider-error.json`,{status:response.status,query:job.query,retryAfter:response.headers.get('retry-after'),reportedCredits:reported,at:new Date().toISOString()});throw new Error(`Provider HTTP ${response.status}. Checkpoint retained; no automatic retry.`);}
  const body=await response.json();if(!Array.isArray(body.items)||body.items.length>20)throw new Error('Unexpected provider response. Snapshot retained.');
  if(reported===null||reported>5)throw new Error('Unexpected or missing credit charge. Stopping; last successful checkpoint retained.');
  for(const [key,item] of rows){const matchedJobs=item.matchedJobs.filter(id=>id!==job.id);if(matchedJobs.length)rows.set(key,{...item,matchedJobs});else rows.delete(key);}
  let accepted=0;for(const row of body.items){const item=normalizeVinted(row,fetchedAt,old.get(`vinted:${row.id}`));if(item&&matchesJob(item,job,plan)){const existing=rows.get(item.sourceKey);rows.set(item.sourceKey,{...item,matchedJobs:[...new Set([...(existing?.matchedJobs??[]),job.id])]});accepted++;}}
  requests.push({id:job.id,query:job.query,fetchedAt,returned:body.items.length,accepted,reportedCredits:reported});
  covered=[...covered.filter(row=>row.id!==job.id),requests.at(-1)];
  await atomic(output,{version:1,market:'se',provider:'scrapebadger',...(current.discovery?{discovery:current.discovery}:{}),fetchedAt,planFingerprint:fingerprint,queries:covered.map(row=>row.query),requests:[...requests],coverage:covered,collection:{plannedQueries:plan.jobs.length,collectedQueries:covered.length,skippedSearches:plan.skipped.length},items:[...rows.values()]});
  const store=openStore();try{store.importSnapshot(JSON.parse(await readFile(output,'utf8')));}finally{store.close();}
  console.log(JSON.stringify({query:job.query,accepted,coverage:`${covered.length}/${plan.jobs.length}`,credits:reported}));
 }
 console.log(JSON.stringify({listings:rows.size,coverage:`${covered.length}/${plan.jobs.length}`,requests,usage:ledger[today]}));
 }
} finally {await lock.close();await unlink(`${stateDir}/refresh.lock`);}
