import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBackup,verifyBackup,restoreBackup,restoreDrill,pruneBackups} from '../lib/server/backup.mjs';
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'forme-backup-'));await mkdir(join(root,'.forme-data'),{recursive:true});await mkdir(join(root,'public/data'),{recursive:true});
 const db=new DatabaseSync(join(root,'.forme-data/forme.sqlite'));db.exec("PRAGMA journal_mode=WAL;CREATE TABLE listings(id INTEGER PRIMARY KEY,title TEXT);INSERT INTO listings(title) VALUES ('Auralee shirt'),('Lemaire coat');");
 const refresh=new DatabaseSync(join(root,'.forme-data/refresh.sqlite'));refresh.exec("CREATE TABLE runs(id TEXT PRIMARY KEY,status TEXT);INSERT INTO runs VALUES ('a','complete');");refresh.close();
 await writeFile(join(root,'.forme-data/settings.json'),'{"following":["Auralee"]}');await writeFile(join(root,'public/data/vinted.json'),'{"items":[1,2]}');
 await writeFile(join(root,'.env.local'),'SCRAPEBADGER_API_'+'KEY=do-not-back-up');await writeFile(join(root,'.forme-data/refresh.lock'),'x');
 return {root,db};
}
test('a backup captures state consistently, excludes secrets and locks, and verifies',async()=>{
 const {root,db}=await fixture();try{
  const {dir,manifest}=await createBackup({root});db.close();
  assert.deepEqual(manifest.files.map(file=>file.path).sort(),['.forme-data/forme.sqlite','.forme-data/refresh.sqlite','.forme-data/settings.json','public/data/vinted.json']);
  assert.deepEqual(manifest.files.find(file=>file.path.endsWith('forme.sqlite')).tables,{listings:2});
  assert.equal(existsSync(join(dir,'.env.local')),false);assert.equal((await readFile(join(dir,'manifest.json'),'utf8')).includes('do-not-back-up'),false);
  assert.deepEqual((await verifyBackup(dir)).problems,[]);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('restore returns local state to the backed-up point and keeps a safety copy of what it replaced',async()=>{
 const {root,db}=await fixture();try{
  const {dir}=await createBackup({root});
  db.exec("INSERT INTO listings(title) VALUES ('added later');DELETE FROM listings WHERE id=1;");db.close();
  await writeFile(join(root,'.forme-data/settings.json'),'{"following":[]}');await rm(join(root,'.forme-data/refresh.lock'));
  const result=await restoreBackup({root,from:dir});assert.equal(result.restored,4);assert.ok(result.safetyCopy&&existsSync(result.safetyCopy));
  const restored=new DatabaseSync(join(root,'.forme-data/forme.sqlite'),{readOnly:true});assert.deepEqual(restored.prepare('SELECT title FROM listings ORDER BY id').all().map(row=>row.title),['Auralee shirt','Lemaire coat']);restored.close();
  assert.equal(await readFile(join(root,'.forme-data/settings.json'),'utf8'),'{"following":["Auralee"]}');
  const safety=new DatabaseSync(join(result.safetyCopy,'.forme-data/forme.sqlite'),{readOnly:true});assert.equal(safety.prepare('SELECT COUNT(*) AS count FROM listings').get().count,2);safety.close();
  assert.equal((await readFile(join(result.safetyCopy,'.forme-data/settings.json'),'utf8')),'{"following":[]}');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('corrupted, tampered or incomplete backups are refused before anything is overwritten',async()=>{
 const {root,db}=await fixture();db.close();try{
  const {dir}=await createBackup({root});await rm(join(root,'.forme-data/refresh.lock'));
  await writeFile(join(dir,'.forme-data/settings.json'),'{"following":["tampered"]}');
  assert.match((await verifyBackup(dir)).problems.join(),/checksum mismatch: \.forme-data\/settings\.json/);
  await assert.rejects(restoreBackup({root,from:dir}),/failed verification/);assert.equal(await readFile(join(root,'.forme-data/settings.json'),'utf8'),'{"following":["Auralee"]}');
  const second=await createBackup({root,dest:join(root,'.forme-backups','second')});await rm(join(second.dir,'public/data/vinted.json'));
  assert.match((await verifyBackup(second.dir)).problems.join(),/missing: public\/data\/vinted\.json/);
  assert.equal((await verifyBackup(join(root,'nowhere'))).ok,false);
  await writeFile(join(second.dir,'manifest.json'),JSON.stringify({version:1,files:[{path:'../escape',sha256:'x'}]}));assert.match((await verifyBackup(second.dir)).problems.join(),/unsafe path/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('restore refuses while a collection is locked or a refresh is queued',async()=>{
 const {root,db}=await fixture();db.close();try{
  await rm(join(root,'.forme-data/refresh.lock'));const {dir}=await createBackup({root});
  await writeFile(join(root,'.forme-data/refresh.lock'),'x');await assert.rejects(restoreBackup({root,from:dir}),/holds the lock/);await rm(join(root,'.forme-data/refresh.lock'));
  const refresh=new DatabaseSync(join(root,'.forme-data/refresh.sqlite'));refresh.exec("UPDATE runs SET status='queued'");refresh.close();
  await assert.rejects(restoreBackup({root,from:dir}),/queued or running/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('the restore drill proves a backup restores byte-for-byte into an empty directory',async()=>{
 const {root,db}=await fixture();db.close();try{
  const report=await restoreDrill({root});assert.equal(report.ok,true);assert.equal(report.files,4);assert.deepEqual(report.problems,[]);
  assert.equal((await restoreDrill({root:join(root,'empty')})).files,0);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('pruning keeps the newest backups and never touches pre-restore safety copies',async()=>{
 const {root,db}=await fixture();db.close();try{
  for(const day of ['01','02','03'])await createBackup({root,now:new Date(`2026-10-${day}T10:00:00Z`)});
  await createBackup({root,dest:join(root,'.forme-backups','pre-restore-2026-09-01'),now:new Date('2026-09-01T10:00:00Z')});
  assert.equal(pruneBackups({root,keep:1}).length,2);assert.deepEqual((await readdir(join(root,'.forme-backups'))).sort(),['2026-10-03T10-00-00-000Z','pre-restore-2026-09-01']);
  assert.throws(()=>pruneBackups({root,keep:0}));
 }finally{await rm(root,{recursive:true,force:true});}
});
