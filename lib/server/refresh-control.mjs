import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {readFile,writeFile,rename,open,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {makeRefreshPlan} from '../refresh-plan.mjs';
import {normalizeVinted} from '../../scripts/vinted-normalize.mjs';
import {sameBrand,isExcludedListing,brandKey} from '../brands.mjs';
import {matchesGender} from '../gender.mjs';
import {matchesMySizes} from '../sizes.mjs';
import {recommendListings} from '../recommendations.mjs';
import {openStore} from './store.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const day=()=>new Date().toISOString().slice(0,10);
async function read(path,fallback){try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}}
async function atomic(path,value){await writeFile(`${path}.tmp`,JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(`${path}.tmp`,path);}
export function refreshControl({root=process.cwd(),request=fetch,pause=delay,apiKey=process.env.SCRAPEBADGER_API_KEY}={}){
 const dir=join(root,'.forme-data');mkdirSync(dir,{recursive:true,mode:0o700});
 const path=join(dir,'refresh.sqlite'),db=new DatabaseSync(path);chmodSync(path,0o600);
 db.exec(`PRAGMA busy_timeout=5000;PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS config(id INTEGER PRIMARY KEY,cap INTEGER NOT NULL);
 INSERT OR IGNORE INTO config VALUES(1,15);
 CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,day TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,reserved INTEGER NOT NULL DEFAULT 0,reported REAL NOT NULL DEFAULT 0,payload TEXT NOT NULL,result TEXT);
 `);
 const current=async()=>read(join(root,'public/data/vinted.json'),{items:[]});
 async function priorUsage(){const today=day(),usage=(await read(join(dir,'usage.json'),{}))[today]??{},pilot=await read(join(dir,'discovery-pilot-v1.json'),{records:[]});
  const legacyReserved=(usage.reservedCredits??0)+(usage.oneTimeReservedCredits??0)+pilot.records.filter(row=>row.fetchedAt?.slice(0,10)===today).reduce((sum,row)=>sum+(row.reservedCredits??0),0);
  const legacyReported=(usage.reportedCredits??0)+pilot.records.filter(row=>row.fetchedAt?.slice(0,10)===today).reduce((sum,row)=>sum+(row.reportedCredits??0),0);
  const ordinaryReserved=(usage.reservedCredits??0)+(usage.oneTimeReservedCredits??0);
  const legacyCommitted=Math.max(ordinaryReserved,usage.reportedCredits??0)+pilot.records.filter(row=>row.fetchedAt?.slice(0,10)===today).reduce((sum,row)=>sum+Math.max(row.reservedCredits??0,row.reportedCredits??0),0);
  return {legacyReserved,legacyReported,legacyCommitted};
 }
 const getRun=id=>db.prepare('SELECT * FROM runs WHERE id=?').get(id);
 function transaction(work){db.exec('BEGIN IMMEDIATE');try{const value=work();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}
 return {
  close:()=>db.close(),
  async status(){const usage=await priorUsage(),cap=db.prepare('SELECT cap FROM config WHERE id=1').get().cap;
   const totals=db.prepare('SELECT COALESCE(SUM(reserved),0) AS reserved,COALESCE(SUM(reported),0) AS reported,COALESCE(SUM(MAX(reserved,reported)),0) AS committed FROM runs WHERE day=?').get(day());
   const runs=db.prepare("SELECT id,status,created_at,reserved,reported,result FROM runs WHERE status!='planned' ORDER BY created_at DESC LIMIT 5").all().map(row=>({...row,result:row.result?JSON.parse(row.result):null}));
   return {day:day(),dailyCap:cap,reservedCredits:totals.reserved+usage.legacyReserved,reportedCredits:totals.reported+usage.legacyReported,remainingCredits:Math.max(0,cap-totals.committed-usage.legacyCommitted),providerAvailable:!!apiKey,running:db.prepare("SELECT COUNT(*) AS count FROM runs WHERE status='running'").get().count>0,runs};
  },
  setBudget(cap){if(!Number.isInteger(cap)||cap<5||cap>100)throw new Error('Choose a daily cap from 5 to 100 credits.');db.prepare('UPDATE config SET cap=? WHERE id=1').run(cap);},
  async plan(settings,options){const plan=makeRefreshPlan(settings,options,await current()),id=randomUUID(),createdAt=new Date().toISOString(),expiresAt=new Date(Date.now()+10*60000).toISOString();
   const payload={plan,settings,fingerprint:digest(settings),expiresAt};db.prepare('INSERT INTO runs(id,day,status,created_at,payload) VALUES(?,?,?,?,?)').run(id,day(),'planned',createdAt,JSON.stringify(payload));
   db.prepare("DELETE FROM runs WHERE status='planned' AND created_at<?").run(new Date(Date.now()-86400000).toISOString());
   return {id,...plan,expiresAt,status:await this.status()};
  },
  async run(id,settings){
   let row=getRun(id);if(!row)throw new Error('Refresh plan not found. Preview a new plan.');
   if(row.status!=='planned'){if(row.status==='running')throw new Error('This refresh is already running.');return {id,status:row.status,...(row.result?JSON.parse(row.result):{})};}
   const payload=JSON.parse(row.payload);
   if(payload.fingerprint!==digest(settings))throw new Error('Your preferences changed. Preview the refresh again.');
   if(Date.parse(payload.expiresAt)<Date.now()||row.day!==day())throw new Error('This plan expired. Preview a new refresh.');
   if(!payload.plan.jobs.length)throw new Error('There are no eligible brands to refresh.');
   if(!apiKey)throw new Error('Provider key unavailable. No credits reserved or requests sent.');
   const lockPath=join(dir,'refresh.lock');let lock;try{lock=await open(lockPath,'wx');}catch{throw new Error('A collection or translation is already running. No requests sent.');}
   let reserved=false;const result={queries:[],accepted:0,matchingPreferences:0,eligible:0,pendingTranslations:0};
   try{
    const legacy=await priorUsage();transaction(()=>{
     row=getRun(id);if(row.status!=='planned')throw new Error('This plan was already used.');
     const cap=db.prepare('SELECT cap FROM config WHERE id=1').get().cap,used=db.prepare('SELECT COALESCE(SUM(MAX(reserved,reported)),0) AS total FROM runs WHERE day=?').get(day()).total;
     if(used+legacy.legacyCommitted+payload.plan.maximumCredits>cap)throw new Error('Daily credit cap reached. No requests sent.');
     if(db.prepare("SELECT COUNT(*) AS count FROM runs WHERE status='running'").get().count)throw new Error('Another refresh is running.');
     db.prepare("UPDATE runs SET status='running',reserved=? WHERE id=?").run(payload.plan.maximumCredits,id);reserved=true;
    });
    let first=true;
    for(const job of payload.plan.jobs){
     if(!first)await pause(13000);first=false;
     if(row.day!==day())throw new Error('The UTC budget day changed. Preview a new plan; no further requests sent.');
     const snapshot=await current(),old=new Map(snapshot.items.map(item=>[item.sourceKey,item])),fetchedAt=new Date().toISOString();
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
     const eligible=recommendListings(visible,settings).length;
     result.queries.push({brand:job.brand,returned:body.items.length,accepted:accepted.length,matchingPreferences:visible.length,eligible,reportedCredits:charge,exactBrand:!!job.brandId});result.accepted+=accepted.length;result.matchingPreferences+=visible.length;result.eligible+=eligible;result.pendingTranslations+=accepted.filter(item=>item.titleTranslation==='pending').length;
     const rows=new Map(snapshot.items.map(item=>[item.sourceKey,item]));
     for(const item of accepted)rows.set(item.sourceKey,{...item,matchedJobs:[...new Set([...(rows.get(item.sourceKey)?.matchedJobs??[]),`${payload.plan.scope==='discover'?'discover':'brand'}:${payload.plan.scope==='discover'?job.brand:brandKey(job.brand)}`])]});
     const updated={...snapshot,fetchedAt,items:[...rows.values()],...(payload.plan.scope==='discover'?{discovery:{...snapshot.discovery,brands:[...new Set([...(snapshot.discovery?.brands??[]),job.brand])],lastRefreshId:id}}:{})};
     await atomic(join(root,'public/data/vinted.json'),updated);const store=openStore(join(dir,'forme.sqlite'));try{store.importSnapshot(updated);}finally{store.close();}
     db.prepare('UPDATE runs SET result=? WHERE id=?').run(JSON.stringify(result),id);
    }
    db.prepare("UPDATE runs SET status='complete',result=? WHERE id=?").run(JSON.stringify(result),id);
    return {id,status:'complete',...result};
   }catch(error){if(reserved){const message=error instanceof Error?error.message:'Refresh failed';db.prepare("UPDATE runs SET status='failed',result=? WHERE id=?").run(JSON.stringify({...result,error:message}),id);}throw error;}
   finally{await lock.close();await unlink(lockPath);}
  }
 };
}
