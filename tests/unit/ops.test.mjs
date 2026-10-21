import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {healthReport} from '../../lib/server/health.mjs';
import {createBackup} from '../../lib/server/backup.mjs';
import {logLine} from '../../lib/server/log.mjs';
import {checkEnv} from '../../lib/server/env.mjs';
import {scanText} from '../../lib/server/secret-scan.mjs';
const now=Date.parse('2026-10-21T12:00:00Z');
async function root({fetchedAt='2026-10-21T08:00:00Z',runs=[]}={}){
 const dir=await mkdtemp(join(tmpdir(),'forme-ops-'));await mkdir(join(dir,'.forme-data'),{recursive:true});await mkdir(join(dir,'public/data'),{recursive:true});
 await writeFile(join(dir,'package.json'),'{"version":"2.0.0"}');await writeFile(join(dir,'public/data/vinted.json'),JSON.stringify({fetchedAt,items:[{}]}));
 const db=new DatabaseSync(join(dir,'.forme-data/forme.sqlite'));db.exec('CREATE TABLE listings(id INTEGER)');db.close();
 const refresh=new DatabaseSync(join(dir,'.forme-data/refresh.sqlite'));refresh.exec('CREATE TABLE runs(id TEXT,status TEXT,created_at TEXT,heartbeat_at TEXT)');
 for(const run of runs)refresh.prepare('INSERT INTO runs VALUES (?,?,?,?)').run(run.id,run.status,run.created_at,run.heartbeat_at??null);refresh.close();
 return dir;
}
test('health is ok when data, queue, backups and provider are all in order, and exposes no secrets or paths',async()=>{
 const dir=await root();try{
  await createBackup({root:dir,now:new Date(now-3600000)});
  const report=healthReport({root:dir,now,env:{['SCRAPEBADGER_API_'+'KEY']:'super-secret-value'}});
  assert.equal(report.status,'ok');assert.equal(report.version,'2.0.0');assert.equal(report.checks.collection.ageHours,4);assert.equal(report.checks.provider.configured,true);
  const text=JSON.stringify(report);assert.equal(text.includes('super-secret-value'),false);assert.equal(text.includes(dir),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('health degrades for a stalled worker, recent failures, an old collection or no backup',async()=>{
 const dir=await root({fetchedAt:'2026-10-18T08:00:00Z',runs:[{id:'a',status:'running',created_at:'2026-10-21T10:00:00Z',heartbeat_at:'2026-10-21T10:01:00Z'},{id:'b',status:'interrupted',created_at:'2026-10-21T09:00:00Z'}]});try{
  const report=healthReport({root:dir,now,env:{}});
  assert.equal(report.status,'degraded');assert.equal(report.checks.queue.stalledWorkers,1);assert.equal(report.checks.queue.failedOrInterruptedLast24h,1);
  assert.equal(report.checks.collection.status,'degraded');assert.equal(report.checks.backup.status,'degraded');assert.equal(report.checks.provider.status,'absent');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('health reports down for a corrupt database and tolerates an empty install',async()=>{
 const dir=await root();try{
  await writeFile(join(dir,'.forme-data/forme.sqlite'),'this is not a database');assert.equal(healthReport({root:dir,now,env:{}}).status,'down');
  const empty=await mkdtemp(join(tmpdir(),'forme-empty-'));try{const report=healthReport({root:empty,now,env:{}});assert.notEqual(report.status,'down');assert.equal(report.checks.database.status,'absent');}finally{await rm(empty,{recursive:true,force:true});}
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('log lines are JSON, redact sensitive fields at any depth and truncate large values',()=>{
 const line=JSON.parse(logLine('error','refresh.failed',{apiKey:'abc',nested:{Authorization:'Bearer x',ok:1},message:'x'.repeat(900),error:new Error('boom')}));
 assert.equal(line.level,'error');assert.equal(line.event,'refresh.failed');assert.equal(line.apiKey,'[redacted]');assert.equal(line.nested.Authorization,'[redacted]');assert.equal(line.nested.ok,1);
 assert.ok(line.message.length<=501);assert.equal(line.error,'boom');assert.ok(!Number.isNaN(Date.parse(line.at)));
});
test('environment checks flag exposed secrets and weak tokens, and report presence without values',()=>{
 const ok=checkEnv({SCRAPEBADGER_API_KEY:'k'.repeat(20)});assert.equal(ok.ok,true);assert.deepEqual(ok.present,{SCRAPEBADGER_API_KEY:true,BRIGHTDATA_API_KEY:false,GOOGLE_TRANSLATE_API_KEY:false,HEALTH_TOKEN:false});assert.equal(JSON.stringify(ok).includes('kkkk'),false);
 assert.match(checkEnv({NEXT_PUBLIC_SCRAPEBADGER_API_KEY:'x'}).errors[0],/exposed to every visitor/);
 assert.match(checkEnv({HEALTH_TOKEN:'short'}).errors[0],/shorter than 16/);
 assert.match(checkEnv({}).warnings[0],/collection and availability checks are disabled/);
 assert.match(checkEnv({VERCEL:'1',SCRAPEBADGER_API_KEY:'x'}).warnings.join(),/HEALTH_TOKEN is not set/);
});
test('the secret scanner finds provider keys by rule and line only, and ignores placeholders',()=>{
 const live='sb_live_'+'A1b2C3d4E5f6G7h8I9j0';const uuid=['aaaaaaaa','bbbb','4ccc','8ddd','eeeeeeeeeeee'].join('-');
 const hits=scanText(`ok line\nkey ${live}\nBRIGHTDATA_API_KEY=${uuid}\nthe api key is ${uuid}\n${'-----BEGIN '+'PRIVATE KEY-----'}`);
 assert.deepEqual(hits.map(hit=>[hit.line,hit.rule]),[[2,'scrapebadger-live-key'],[3,'provider-key-assignment'],[4,'uuid-near-key-word'],[5,'private-key-block']]);
 assert.equal(JSON.stringify(hits).includes(live),false);
 assert.deepEqual(scanText('SCRAPEBADGER_API_KEY=\nBRIGHTDATA_API_KEY=<your key>\nGOOGLE_TRANSLATE_API_KEY=$GOOGLE\nid: '+uuid),[]);
});
test('health and the queue migration tolerate a refresh database created before heartbeats existed',async()=>{
 const dir=await root();try{
  const legacy=new DatabaseSync(join(dir,'.forme-data/refresh.sqlite'));legacy.exec("DROP TABLE runs;CREATE TABLE config(id INTEGER PRIMARY KEY,cap INTEGER NOT NULL);INSERT INTO config VALUES(1,15);CREATE TABLE runs(id TEXT PRIMARY KEY,day TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,reserved INTEGER NOT NULL DEFAULT 0,reported REAL NOT NULL DEFAULT 0,payload TEXT NOT NULL,result TEXT);INSERT INTO runs(id,day,status,created_at,reserved,reported,payload) VALUES ('old','2026-10-20','complete','2026-10-20T10:00:00Z',5,5,'{}');");legacy.close();
  assert.notEqual(healthReport({root:dir,now,env:{}}).checks.queue.status,'down');
  const {refreshControl}=await import('../../lib/server/refresh-control.mjs');const control=refreshControl({root:dir,apiKey:'x'});
  try{assert.equal((await control.status()).runs[0].id,'old');assert.deepEqual(control.recover(),[]);}finally{control.close();}
  const migrated=new DatabaseSync(join(dir,'.forme-data/refresh.sqlite'),{readOnly:true});assert.ok(migrated.prepare('PRAGMA table_info(runs)').all().some(column=>column.name==='heartbeat_at'));migrated.close();
 }finally{await rm(dir,{recursive:true,force:true});}
});
