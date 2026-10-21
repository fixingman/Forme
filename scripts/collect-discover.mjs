import {brandReference} from '../lib/refresh-plan.mjs';
import {refreshControl} from '../lib/server/refresh-control.mjs';
import {existsSync} from 'node:fs';
// Explicit one-time pilot: three search calls, at most 15 reserved credits; no retries.
import {mkdir,readFile,writeFile,rename,open,unlink} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {englishListing} from '../lib/listing-language.mjs';
import {normalizeVinted} from './vinted-normalize.mjs';
import {sameBrand} from '../lib/brands.mjs';
import {openStore} from '../lib/server/store.mjs';
try{process.loadEnvFile('.env.local');}catch(error){if(error.code!=='ENOENT')throw error;}
const brands=['Auralee','Lemaire','Studio Nicholson'];
const args=process.argv.slice(2);if(args.some(arg=>!['--collect','--plan'].includes(arg)))throw new Error('Use --plan or --collect.');
if(!args.includes('--collect')){console.log(JSON.stringify({brands,catalogIds:'5',market:'se',maximumRequests:3,maximumItems:60,reservedCredits:15,requestsSent:0}));process.exit(0);}
await mkdir('.forme-data',{recursive:true});await mkdir('public/data',{recursive:true});
const joinRefreshBudget=()=>'.forme-data/refresh.sqlite';
const statePath='.forme-data/discovery-pilot-v1.json',output='public/data/vinted.json';
const atomic=async(path,value)=>{await writeFile(`${path}.tmp`,JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(`${path}.tmp`,path);};
const read=async(path,fallback)=>{try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}};
const lock=await open('.forme-data/refresh.lock','wx');
try{
 const state=await read(statePath,{id:'discover-pilot-v1',maximumCredits:15,records:[]});
 if(state.id!=='discover-pilot-v1'||state.maximumCredits!==15||!Array.isArray(state.records)||state.records.length>3||state.records.some(record=>!brands.includes(record.brand)))throw new Error('Invalid pilot ledger');
 const current=await read(output,{items:[]}),old=new Map(current.items.map(item=>[item.sourceKey,item]));
 async function publish(){
  const snapshot=await read(output,{items:[]});const rows=new Map(snapshot.items.map(item=>[item.sourceKey,item]));
  for(const record of state.records.filter(record=>record.status==='complete'))for(const item of record.items)rows.set(item.sourceKey,{...englishListing(item),matchedJobs:[...new Set([...(rows.get(item.sourceKey)?.matchedJobs??[]),`discover:${record.brand}`])]});
  const dates=state.records.filter(record=>record.status==='complete').map(record=>record.fetchedAt).sort();
  if(!dates.length)return;
  const updated={...snapshot,fetchedAt:dates.at(-1),discovery:{id:state.id,brands:state.records.filter(record=>record.status==='complete').map(record=>record.brand),catalogIds:'5',reservedCredits:state.records.reduce((sum,record)=>sum+record.reservedCredits,0),reportedCredits:state.records.reduce((sum,record)=>sum+(record.reportedCredits??0),0)},items:[...rows.values()]};
  await atomic(output,updated);const store=openStore();try{store.importSnapshot(updated);}finally{store.close();}
 }
 let called=false;
 for(const brand of brands){
  const existing=state.records.find(record=>record.brand===brand);if(existing){if(existing.status!=='complete')throw new Error(`Prior ${brand} request has uncertain/failed status. No retry or additional spending.`);continue;}
  if(!process.env.SCRAPEBADGER_API_KEY)throw new Error('Missing provider key; no request sent');
  if(state.records.reduce((sum,record)=>sum+record.reservedCredits,0)+5>15)throw new Error('Pilot credit cap reached');
  if(existsSync(joinRefreshBudget())){const control=refreshControl();try{if((await control.status()).remainingCredits<5)throw new Error('Configured daily credit cap reached. No requests sent.');}finally{control.close();}}
  if(called&&process.env.NODE_ENV!=='test')await delay(13000);
  const record={brand,status:'started',reservedCredits:5,fetchedAt:new Date().toISOString()};state.records.push(record);await atomic(statePath,state);
  const url=new URL('https://scrapebadger.com/v1/vinted/search');for(const [key,value] of Object.entries({query:brand,market:'se',catalog_ids:'5',brand_ids:brandReference(brand).id,per_page:'20',page:'1',order:'newest_first'}))url.searchParams.set(key,value);
  let response;try{called=true;response=await fetch(url,{headers:{'X-API-Key':process.env.SCRAPEBADGER_API_KEY},redirect:'error',signal:AbortSignal.timeout(90000)});}catch(error){record.status='uncertain';record.error=error.name;await atomic(statePath,state);throw new Error('Provider request failed. Reservation retained; no automatic retry.');}
  const charge=response.headers.get('x-credits-used');record.reportedCredits=charge!==null&&Number.isFinite(Number(charge))?Number(charge):null;record.httpStatus=response.status;
  if(!response.ok||record.reportedCredits===null||record.reportedCredits<0||record.reportedCredits>5){record.status='failed';await atomic(statePath,state);throw new Error(`Provider status ${response.status}, unexpected billing or failed response. No retry.`);}
  const body=await response.json();if(!Array.isArray(body.items)||body.items.length>20){record.status='failed';await atomic(statePath,state);throw new Error('Invalid response. No retry.');}
  record.returned=body.items.length;record.returnedFields=Object.keys(body.items[0]??{});
  record.items=body.items.map(row=>normalizeVinted(row,record.fetchedAt,old.get(`vinted:${row.id}`),{department:'men',catalogIds:'5'})).filter(item=>item&&sameBrand(item.brand,brand));
  record.status='complete';await atomic(statePath,state);await publish();
  console.log(JSON.stringify({brand,returned:record.returned,accepted:record.items.length,reportedCredits:record.reportedCredits}));
 }
 await publish();console.log(JSON.stringify({complete:true,reservedCredits:state.records.reduce((sum,record)=>sum+record.reservedCredits,0),reportedCredits:state.records.reduce((sum,record)=>sum+(record.reportedCredits??0),0),accepted:state.records.reduce((sum,record)=>sum+record.items.length,0)}));
}finally{await lock.close();await unlink('.forme-data/refresh.lock');}
