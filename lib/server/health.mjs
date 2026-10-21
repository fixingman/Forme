import {DatabaseSync} from 'node:sqlite';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const hours=ms=>Math.round(ms/360000)/10;
const open=path=>new DatabaseSync(path,{readOnly:true});
/** Non-sensitive operational status: no paths, keys or listing content. 'down' means something is broken; 'degraded' means attention is needed. */
export function healthReport({root=process.cwd(),now=Date.now(),env=process.env}={}){
 const checks={},data=join(root,'.forme-data');let version='unknown';
 try{version=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;}catch{}
 try{
  if(!existsSync(join(data,'forme.sqlite')))checks.database={status:'absent'};
  else{const db=open(join(data,'forme.sqlite'));try{checks.database={status:db.prepare('PRAGMA quick_check').all().map(row=>Object.values(row)[0]).join()==='ok'?'ok':'down'};}finally{db.close();}}
 }catch{checks.database={status:'down'};}
 try{
  if(!existsSync(join(data,'refresh.sqlite')))checks.queue={status:'ok',queued:0,running:0};
  else{
   const db=open(join(data,'refresh.sqlite'));
   try{
    const count=status=>db.prepare('SELECT COUNT(*) AS count FROM runs WHERE status=?').get(status).count;
    const beat=db.prepare('PRAGMA table_info(runs)').all().some(column=>column.name==='heartbeat_at')?'COALESCE(heartbeat_at,created_at)':'created_at';
    const stale=db.prepare(`SELECT COUNT(*) AS count FROM runs WHERE status='running' AND ${beat}<?`).get(new Date(now-5*60000).toISOString()).count;
    const recent=db.prepare("SELECT COUNT(*) AS count FROM runs WHERE status IN ('failed','interrupted') AND created_at>?").get(new Date(now-86400000).toISOString()).count;
    checks.queue={status:stale||recent?'degraded':'ok',queued:count('queued'),running:count('running'),stalledWorkers:stale,failedOrInterruptedLast24h:recent};
   }finally{db.close();}
  }
 }catch{checks.queue={status:'down'};}
 try{
  const snapshot=JSON.parse(readFileSync(join(root,'public/data/vinted.json'),'utf8')),age=now-Date.parse(snapshot.fetchedAt);
  checks.collection=Number.isFinite(age)?{status:age>48*3600000?'degraded':'ok',ageHours:hours(age),listings:Array.isArray(snapshot.items)?snapshot.items.length:0}:{status:'degraded',ageHours:null};
 }catch{checks.collection={status:'absent'};}
 try{
  const base=join(root,'.forme-backups'),latest=existsSync(base)?readdirSync(base).filter(name=>/^\d{4}-\d{2}-\d{2}T/.test(name)).sort().at(-1):null;
  const age=latest?now-Date.parse(JSON.parse(readFileSync(join(base,latest,'manifest.json'),'utf8')).createdAt):null;
  checks.backup=age===null?{status:'degraded',ageHours:null}:{status:age>7*86400000?'degraded':'ok',ageHours:hours(age)};
 }catch{checks.backup={status:'degraded',ageHours:null};}
 checks.provider={status:env.SCRAPEBADGER_API_KEY?'ok':'absent',configured:!!env.SCRAPEBADGER_API_KEY};
 const states=Object.values(checks).map(check=>check.status),status=states.includes('down')?'down':states.includes('degraded')?'degraded':'ok';
 return {status,version,time:new Date(now).toISOString(),checks};
}
