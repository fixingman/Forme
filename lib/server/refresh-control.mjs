import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync,existsSync,readFileSync,unlinkSync} from 'node:fs';
import {readFile,writeFile,rename,open,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {makeRefreshPlan,recordRefresh} from '../domain/refresh-plan.mjs';
import {makeAvailabilityPlan,availabilityFromItem} from '../domain/availability-plan.mjs';
import {makeBrandLookupPlan,matchBrand} from '../domain/brand-lookup-plan.mjs';
import {readBrandIds,recordBrandLookup} from './brand-ids.mjs';
import verifiedBrands from '../../data/vinted-brands.json' with {type:'json'};
import {normalizeVinted,vintedImageUrl} from '../domain/vinted-normalize.mjs';
import {sameBrand,isExcludedListing,brandKey} from '../domain/brands.mjs';
import {matchesGender} from '../domain/gender.mjs';
import {matchesMySizes} from '../domain/sizes.mjs';
import {recommendListings} from '../domain/recommendations.mjs';
import {openStore} from './store.mjs';
import {DAILY_CAP_OFF,MAX_DAILY_CAP} from '../domain/collection-limits.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function read(path,fallback){try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}}
async function atomic(path,value){await writeFile(`${path}.tmp`,JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(`${path}.tmp`,path);}
export function refreshControl({root=process.cwd(),request=fetch,pause=delay,apiKey=process.env.SCRAPEBADGER_API_KEY,now=Date.now}={}){
 const iso=()=>new Date(now()).toISOString(),utcDay=()=>iso().slice(0,10);
 const dir=join(root,'.forme-data');mkdirSync(dir,{recursive:true,mode:0o700});
 const path=join(dir,'refresh.sqlite'),db=new DatabaseSync(path);chmodSync(path,0o600);
 db.exec(`PRAGMA busy_timeout=5000;PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY,cap INTEGER NOT NULL);
 INSERT OR IGNORE INTO config VALUES(1,15);
 CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,day TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,reserved INTEGER NOT NULL DEFAULT 0,reported REAL NOT NULL DEFAULT 0,payload TEXT NOT NULL,result TEXT,worker_id TEXT,heartbeat_at TEXT);
 `);
 for(const [name,type] of [['worker_id','TEXT'],['heartbeat_at','TEXT']])if(!db.prepare('PRAGMA table_info(runs)').all().some(column=>column.name===name))db.exec(`ALTER TABLE runs ADD COLUMN ${name} ${type}`);
 const lockPath=join(dir,'refresh.lock'),lockHeld=()=>existsSync(lockPath),beat=(id,workerId)=>db.prepare('UPDATE runs SET heartbeat_at=? WHERE id=? AND worker_id=?').run(iso(),id,workerId);
 const current=async()=>read(join(root,'public/data/vinted.json'),{items:[]});
 async function priorUsage(){const today=utcDay(),usage=(await read(join(dir,'usage.json'),{}))[today]??{},pilot=await read(join(dir,'discovery-pilot-v1.json'),{records:[]});
  const legacyReserved=(usage.reservedCredits??0)+(usage.oneTimeReservedCredits??0)+pilot.records.filter(row=>row.fetchedAt?.slice(0,10)===today).reduce((sum,row)=>sum+(row.reservedCredits??0),0);
  const legacyReported=(usage.reportedCredits??0)+pilot.records.filter(row=>row.fetchedAt?.slice(0,10)===today).reduce((sum,row)=>sum+(row.reportedCredits??0),0);
  const ordinaryReserved=(usage.reservedCredits??0)+(usage.oneTimeReservedCredits??0);
  const legacyCommitted=Math.max(ordinaryReserved,usage.reportedCredits??0)+pilot.records.filter(row=>row.fetchedAt?.slice(0,10)===today).reduce((sum,row)=>sum+Math.max(row.reservedCredits??0,row.reportedCredits??0),0);
  return {legacyReserved,legacyReported,legacyCommitted};
 }
 const getRun=id=>db.prepare('SELECT * FROM runs WHERE id=?').get(id);
 // One item-detail call per saved listing (up to 10 credits each). Stops without retrying on anything unexpected; a 404 is free and means removed.
 async function checkAvailability(id,payload,workerId,result){
  Object.assign(result,{checked:0,available:0,sold:0,reserved:0,unavailable:0,unknown:0,photosUpdated:0,items:[]});let first=true;
  for(const job of payload.plan.jobs){
   if(!first){beat(id,workerId);await pause(13000);beat(id,workerId);}first=false;
   const checkedAt=iso(),url=new URL(`https://scrapebadger.com/v1/vinted/items/${job.itemId}`);url.searchParams.set('market','se');
   let response;try{response=await request(url,{headers:{'X-API-Key':apiKey},redirect:'error',signal:AbortSignal.timeout(90000)});}catch{throw new Error('Provider request failed. Credits remain reserved; no automatic retry.');}
   const header=response.headers.get('x-credits-used'),charge=header===null?null:Number(header);
   if(charge!==null&&Number.isFinite(charge)&&charge>=0)db.prepare('UPDATE runs SET reported=reported+? WHERE id=?').run(charge,id);
   let state,photo;
   if(response.status===404)state='unavailable';
   else{
    if(!response.ok)throw new Error(`Provider returned HTTP ${response.status}. Stopped without retry.`);
    if(charge===null||!Number.isFinite(charge)||charge<0||charge>10)throw new Error('Unexpected provider billing. Stopped; credits remain reserved.');
    const body=await response.json();state=availabilityFromItem(body?.item);if(!state)throw new Error('Unexpected item response. Stopped without retry.');
    // The same response carries the listing's current photos. Sellers re-upload, which retires the old address, so keep the fresh one.
    photo=vintedImageUrl(body.item.photo?.url??body.item.photos?.find(entry=>entry?.is_main)?.url??body.item.photos?.[0]?.url);
   }
   const snapshot=await current(),row=snapshot.items.find(item=>item.sourceKey===job.sourceKey);
   const photoChanged=!!(row&&photo&&photo!==row.imageUrl);
   if(row&&(state!=='unknown'||photoChanged)){if(state!=='unknown'){row.availability=state;row.availabilitySource='provider';row.availabilityObservedAt=checkedAt;}if(photoChanged)row.imageUrl=photo;await atomic(join(root,'public/data/vinted.json'),snapshot);const store=openStore(join(dir,'forme.sqlite'));try{store.importSnapshot(snapshot);}finally{store.close();}}
   result.checked++;result[state]++;if(photoChanged)result.photosUpdated++;result.items.push({sourceKey:job.sourceKey,state,reportedCredits:charge,photoUpdated:photoChanged});
   db.prepare('UPDATE runs SET result=? WHERE id=?').run(JSON.stringify(result),id);
  }
 }
 // One brand lookup per brand (3 credits each). Stops without retrying on anything unexpected; the outcome of every brand is saved as soon as it arrives.
 async function lookupBrands(id,payload,workerId,result){
  Object.assign(result,{looked:0,matched:0,ambiguous:0,none:0,items:[]});let first=true;
  for(const job of payload.plan.jobs){
   if(!first){beat(id,workerId);await pause(13000);beat(id,workerId);}first=false;
   const url=new URL('https://scrapebadger.com/v1/vinted/brands');url.searchParams.set('keyword',job.query);url.searchParams.set('market','se');   // the provider's validator requires `keyword` here, although its docs say `query`
   let response;try{response=await request(url,{headers:{'X-API-Key':apiKey},redirect:'error',signal:AbortSignal.timeout(90000)});}catch{throw new Error('Provider request failed. Credits remain reserved; no automatic retry.');}
   const header=response.headers.get('x-credits-used'),charge=header===null?null:Number(header);
   if(charge!==null&&Number.isFinite(charge)&&charge>=0)db.prepare('UPDATE runs SET reported=reported+? WHERE id=?').run(charge,id);
   if(!response.ok){let detail='';try{detail=(await response.text()).replace(/\s+/g,' ').slice(0,200);}catch{}throw new Error(`Provider returned HTTP ${response.status}${detail?`: ${detail}`:''}. Stopped without retry.`);}
   if(charge===null||!Number.isFinite(charge)||charge<0||charge>3)throw new Error('Unexpected provider billing. Stopped; credits remain reserved.');
   const body=await response.json();if(!Array.isArray(body?.brands)||body.brands.length>200)throw new Error('Unexpected brand response. Stopped without retry.');
   const outcome=matchBrand(job.brand,body.brands);
   await recordBrandLookup(root,job.brand,outcome,iso());
   result.looked++;result[outcome.status]++;
   result.items.push({brand:job.brand,status:outcome.status,...(outcome.status==='matched'?{id:outcome.id,title:outcome.title}:{}),reportedCredits:charge});
   db.prepare('UPDATE runs SET result=? WHERE id=?').run(JSON.stringify(result),id);
  }
 }
 function transaction(work){db.exec('BEGIN IMMEDIATE');try{const value=work();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}
 return {
  close:()=>db.close(),
  async status(){const usage=await priorUsage(),cap=db.prepare('SELECT cap FROM config WHERE id=1').get().cap;
   const totals=db.prepare('SELECT COALESCE(SUM(reserved),0) AS reserved,COALESCE(SUM(reported),0) AS reported,COALESCE(SUM(MAX(reserved,reported)),0) AS committed FROM runs WHERE day=?').get(utcDay());
   const runs=db.prepare("SELECT id,status,created_at,reserved,reported,result FROM runs WHERE status!='planned' ORDER BY created_at DESC LIMIT 5").all().map(row=>({...row,result:row.result?JSON.parse(row.result):null}));
   return {day:utcDay(),dailyCap:cap,reservedCredits:totals.reserved+usage.legacyReserved,reportedCredits:totals.reported+usage.legacyReported,remainingCredits:cap===DAILY_CAP_OFF?null:Math.max(0,cap-totals.committed-usage.legacyCommitted),providerAvailable:!!apiKey,running:db.prepare("SELECT COUNT(*) AS count FROM runs WHERE status IN ('running','queued')").get().count>0,runs};
  },
  setBudget(cap){if(!Number.isInteger(cap)||(cap!==DAILY_CAP_OFF&&(cap<5||cap>MAX_DAILY_CAP)))throw new Error(`Choose a daily cap from 5 to ${MAX_DAILY_CAP} credits, or turn the daily limit off.`);db.prepare('UPDATE config SET cap=? WHERE id=1').run(cap);},
  async plan(settings,options){const snapshotNow=await current(),local=await readBrandIds(root),plan=options?.scope==='availability'?makeAvailabilityPlan(settings,options,snapshotNow,now()):options?.scope==='brands'?makeBrandLookupPlan(options,snapshotNow,{references:[...verifiedBrands,...local.matched],checked:local.checked}):makeRefreshPlan(settings,{...options,references:local.matched},snapshotNow,now()),id=randomUUID(),createdAt=iso(),expiresAt=new Date(now()+10*60000).toISOString();
   const payload={plan,settings,fingerprint:digest(settings),expiresAt,savedListings:options?.savedListings??[]};db.prepare('INSERT INTO runs(id,day,status,created_at,payload) VALUES(?,?,?,?,?)').run(id,utcDay(),'planned',createdAt,JSON.stringify(payload));
   db.prepare("DELETE FROM runs WHERE status='planned' AND created_at<?").run(new Date(now()-86400000).toISOString());
   return {id,...plan,expiresAt,status:await this.status()};
  },
  /** Validates a plan, reserves its maximum cost transactionally and queues it. No provider request is sent. */
  async enqueue(id,settings){
   let row=getRun(id);if(!row)throw new Error('Refresh plan not found. Preview a new plan.');
   if(row.status!=='planned')return {id,status:row.status,...(row.result?JSON.parse(row.result):{})};
   const payload=JSON.parse(row.payload);
   if(payload.fingerprint!==digest(settings))throw new Error('Your preferences changed. Preview the refresh again.');
   if(Date.parse(payload.expiresAt)<now()||row.day!==utcDay())throw new Error('This plan expired. Preview a new refresh.');
   if(!payload.plan.jobs.length)throw new Error('There are no eligible brands to refresh.');
   if(!apiKey)throw new Error('Provider key unavailable. No credits reserved or requests sent.');
   const legacy=await priorUsage();
   transaction(()=>{
    row=getRun(id);if(row.status!=='planned')throw new Error('This plan was already used.');
    const cap=db.prepare('SELECT cap FROM config WHERE id=1').get().cap,used=db.prepare('SELECT COALESCE(SUM(MAX(reserved,reported)),0) AS total FROM runs WHERE day=?').get(utcDay()).total;
    if(cap!==DAILY_CAP_OFF&&used+legacy.legacyCommitted+payload.plan.maximumCredits>cap)throw new Error('Daily credit cap reached. No requests sent.');
    if(db.prepare("SELECT COUNT(*) AS count FROM runs WHERE status IN ('running','queued')").get().count)throw new Error('Another refresh is running.');
    db.prepare("UPDATE runs SET status='queued',reserved=? WHERE id=?").run(payload.plan.maximumCredits,id);
   });
   return {id,status:'queued'};
  },
  /** Runs the oldest queued refresh under the shared collection lock. Returns {status:'idle'|'busy'} when there is nothing to do. */
  async work({workerId=randomUUID()}={}){
   let lock;try{lock=await open(lockPath,'wx');await lock.writeFile(JSON.stringify({pid:process.pid,workerId,at:iso()}));}catch{return {status:'busy'};}
   let row,id,reserved=false;const result={queries:[],accepted:0,matchingPreferences:0,eligible:0,pendingTranslations:0};
   try{
    row=transaction(()=>{const next=db.prepare("SELECT * FROM runs WHERE status='queued' ORDER BY created_at LIMIT 1").get();if(next)db.prepare("UPDATE runs SET status='running',worker_id=?,heartbeat_at=? WHERE id=? AND status='queued'").run(workerId,iso(),next.id);return next;});
    if(!row)return {status:'idle'};
    id=row.id;reserved=true;const payload=JSON.parse(row.payload),settings=payload.settings;
    if(payload.plan.kind==='availability')await checkAvailability(id,payload,workerId,result);else if(payload.plan.kind==='brands')await lookupBrands(id,payload,workerId,result);else{
    let first=true;
    for(const job of payload.plan.jobs){
     if(!first){beat(id,workerId);await pause(13000);beat(id,workerId);}first=false;
     if(row.day!==utcDay())throw new Error('The UTC budget day changed. Preview a new plan; no further requests sent.');
     const snapshot=await current(),old=new Map(snapshot.items.map(item=>[item.sourceKey,item])),fetchedAt=iso();
     const url=new URL('https://scrapebadger.com/v1/vinted/search');
     for(const [key,value] of Object.entries({query:job.query,market:'se',page:'1',per_page:'20',order:'newest_first',...(job.brandId?{brand_ids:job.brandId}:{}),...(job.catalogIds?{catalog_ids:job.catalogIds}:{})}))url.searchParams.set(key,value);
     let response;try{response=await request(url,{headers:{'X-API-Key':apiKey},redirect:'error',signal:AbortSignal.timeout(90000)});}catch{throw new Error('Provider request failed. Credits remain reserved; no automatic retry.');}
     const header=response.headers.get('x-credits-used'),charge=header===null?null:Number(header);
     if(charge!==null&&Number.isFinite(charge)&&charge>=0)db.prepare('UPDATE runs SET reported=reported+? WHERE id=?').run(charge,id);
     if(!response.ok)throw new Error(`Provider returned HTTP ${response.status}. Stopped without retry.`);
     if(charge===null||!Number.isFinite(charge)||charge<0||charge>5)throw new Error('Unexpected provider billing. Stopped; credits remain reserved.');
     const body=await response.json();if(!Array.isArray(body.items)||body.items.length>20)throw new Error('Unexpected search response. Stopped without retry.');
     const normalized=body.items.map(item=>normalizeVinted(item,fetchedAt,old.get(`vinted:${item.id}`),job.catalogIds==='5'?{department:'men',catalogIds:'5'}:{})).filter(Boolean);
     const accepted=normalized.filter(item=>sameBrand(item.brand,job.brand));
     const visible=accepted.filter(item=>!isExcludedListing(item,settings.excluded)&&matchesGender(item,settings.gender)&&matchesMySizes(item,settings.sizing));
     const eligible=recommendListings(visible,settings,{signals:[...(payload.savedListings??[]),...snapshot.items,...accepted],now:now()}).length;
     result.queries.push({brand:job.brand,returned:body.items.length,accepted:accepted.length,matchingPreferences:visible.length,eligible,reportedCredits:charge,exactBrand:!!job.brandId});result.accepted+=accepted.length;result.matchingPreferences+=visible.length;result.eligible+=eligible;result.pendingTranslations+=accepted.filter(item=>item.titleTranslation==='pending').length;
     const rows=new Map(snapshot.items.map(item=>[item.sourceKey,item]));
     const scope=job.scope??payload.plan.scope;
     for(const item of accepted)rows.set(item.sourceKey,{...item,matchedJobs:[...new Set([...(rows.get(item.sourceKey)?.matchedJobs??[]),`${scope==='discover'?'discover':'brand'}:${scope==='discover'?job.brand:brandKey(job.brand)}`])]});
     const updated={...snapshot,fetchedAt,lastCollectionCheckAt:fetchedAt,items:[...rows.values()],refreshHistory:recordRefresh(snapshot,job,fetchedAt,{returned:body.items.length,accepted:accepted.length,matching:visible.length}),...(scope==='discover'?{discovery:{...snapshot.discovery,brands:[...new Set([...(snapshot.discovery?.brands??[]),job.brand])],lastRefreshId:id}}:{})};
     const store=openStore(join(dir,'forme.sqlite'));try{store.importSnapshot(updated);await atomic(join(root,'public/data/vinted.json'),store.snapshot());}finally{store.close();}
     db.prepare('UPDATE runs SET result=? WHERE id=?').run(JSON.stringify(result),id);
    }
    }
    db.prepare("UPDATE runs SET status='complete',result=? WHERE id=?").run(JSON.stringify(result),id);
    return {id,status:'complete',...result};
   }catch(error){if(reserved){const message=error instanceof Error?error.message:'Refresh failed';db.prepare("UPDATE runs SET status='failed',result=? WHERE id=?").run(JSON.stringify({...result,error:message}),id);}throw error;}
   finally{await lock.close();await unlink(lockPath);}
  },
  /** Marks runs whose worker stopped heartbeating as interrupted. Reservations stay counted and billable calls are never retried automatically. */
  recover({staleMs=5*60000}={}){
   const cutoff=new Date(now()-staleMs).toISOString(),stale=db.prepare("SELECT id,result FROM runs WHERE status='running' AND COALESCE(heartbeat_at,created_at)<?").all(cutoff);
   for(const run of stale)db.prepare("UPDATE runs SET status='interrupted',result=? WHERE id=?").run(JSON.stringify({...(run.result?JSON.parse(run.result):{queries:[]}),error:'The collection worker stopped before finishing. Credits stay reserved; some searches may have been charged. Preview a new plan to continue.'}),run.id);
   if(stale.length&&lockHeld()){try{const holder=JSON.parse(readFileSync(lockPath,'utf8'));try{process.kill(holder.pid,0);}catch(error){if(error.code==='ESRCH')try{unlinkSync(lockPath);}catch{}}}catch{}}
   return stale.map(run=>run.id);
  },
  /** Starts and waits for a refresh (used by tests and scripts). The API enqueues and lets a worker run it in the background. */
  async run(id,settings){
   const row=getRun(id);if(row?.status==='running')throw new Error('This refresh is already running.');
   if(row?.status==='planned'&&lockHeld())throw new Error('A collection or translation is already running. No requests sent.');
   const queued=await this.enqueue(id,settings);if(queued.status!=='queued')return queued;
   const outcome=await this.work();if(outcome.status==='busy')throw new Error('A collection or translation is already running. The refresh stays queued.');
   return outcome;
  }
 };
}
