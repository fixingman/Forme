import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync,readdirSync,statSync,existsSync,copyFileSync,renameSync,rmSync} from 'node:fs';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';

// Backs up local FORME state: SQLite databases (consistent snapshots), JSON state and the listing snapshot.
// Provider keys (.env*) are never included; they belong in a secrets manager, not in a backup.
const sha=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const skip=name=>name.endsWith('.lock')||name.endsWith('.tmp')||/-(wal|shm)$/.test(name);
const quote=path=>`'${path.replace(/'/g,"''")}'`;
function sources(root){
 const found=[],dir=join(root,'.forme-data');
 if(existsSync(dir))for(const name of readdirSync(dir).sort()){const abs=join(dir,name);if(statSync(abs).isFile()&&!skip(name))found.push({rel:`.forme-data/${name}`,abs});}
 const snapshot=join(root,'public/data/vinted.json');if(existsSync(snapshot))found.push({rel:'public/data/vinted.json',abs:snapshot});
 return found;
}
function tableCounts(path){
 const db=new DatabaseSync(path,{readOnly:true});
 try{return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>[name,db.prepare(`SELECT COUNT(*) AS count FROM "${name.replace(/"/g,'""')}"`).get().count]));}
 finally{db.close();}
}
const integrity=path=>{const db=new DatabaseSync(path,{readOnly:true});try{return db.prepare('PRAGMA integrity_check').all().map(row=>Object.values(row)[0]).join(',')==='ok';}finally{db.close();}};
export async function createBackup({root=process.cwd(),dest,now=new Date()}={}){
 const dir=dest??join(root,'.forme-backups',now.toISOString().replace(/[:.]/g,'-'));
 mkdirSync(dir,{recursive:true,mode:0o700});const files=[];
 for(const source of sources(root)){
  const out=join(dir,source.rel);mkdirSync(dirname(out),{recursive:true,mode:0o700});
  if(source.rel.endsWith('.sqlite')){const db=new DatabaseSync(source.abs);try{db.exec(`VACUUM INTO ${quote(out)}`);}finally{db.close();}}else copyFileSync(source.abs,out);
  chmodSync(out,0o600);
  files.push({path:source.rel,bytes:statSync(out).size,sha256:await sha(out),...(source.rel.endsWith('.sqlite')?{tables:tableCounts(out)}:{})});
 }
 const manifest={version:1,createdAt:now.toISOString(),files};
 await writeFile(join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
 return {dir,manifest};
}
/** Checks every file against the manifest: presence, checksum, SQLite integrity and row counts. */
export async function verifyBackup(dir){
 const problems=[];let manifest;
 try{manifest=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'));}catch{return {ok:false,problems:['manifest.json is missing or unreadable'],manifest:null};}
 if(manifest.version!==1||!Array.isArray(manifest.files))return {ok:false,problems:['unsupported manifest'],manifest};
 for(const file of manifest.files){
  if(typeof file.path!=='string'||file.path.includes('..')||file.path.startsWith('/')){problems.push(`unsafe path in manifest: ${file.path}`);continue;}
  const abs=join(dir,file.path);
  if(!existsSync(abs)){problems.push(`missing: ${file.path}`);continue;}
  if(await sha(abs)!==file.sha256){problems.push(`checksum mismatch: ${file.path}`);continue;}
  if(file.path.endsWith('.sqlite')){
   try{if(!integrity(abs))problems.push(`integrity check failed: ${file.path}`);else if(JSON.stringify(tableCounts(abs))!==JSON.stringify(file.tables))problems.push(`row counts differ: ${file.path}`);}
   catch{problems.push(`not a readable database: ${file.path}`);}
  }
 }
 return {ok:!problems.length,problems,manifest};
}
function busy(root){
 if(existsSync(join(root,'.forme-data/refresh.lock')))return 'A collection or translation holds the lock.';
 const path=join(root,'.forme-data/refresh.sqlite');if(!existsSync(path))return null;
 const db=new DatabaseSync(path,{readOnly:true});
 try{return db.prepare("SELECT COUNT(*) AS count FROM runs WHERE status IN ('queued','running')").get().count?'A refresh is queued or running.':null;}catch{return null;}finally{db.close();}
}
/** Replaces local state with a verified backup. Takes a safety copy of the current state first and refuses while jobs are active. */
export async function restoreBackup({root=process.cwd(),from,now=new Date()}={}){
 const check=await verifyBackup(from);if(!check.ok)throw new Error(`Backup failed verification: ${check.problems.join('; ')}`);
 const reason=busy(root);if(reason)throw new Error(`${reason} Stop the worker and try again.`);
 const safety=sources(root).length?(await createBackup({root,dest:join(root,'.forme-backups',`pre-restore-${now.toISOString().replace(/[:.]/g,'-')}`),now})).dir:null;
 for(const file of check.manifest.files){
  const target=join(root,file.path),temporary=`${target}.restore.tmp`;mkdirSync(dirname(target),{recursive:true,mode:0o700});
  copyFileSync(join(from,file.path),temporary);chmodSync(temporary,0o600);
  if(file.path.endsWith('.sqlite'))for(const suffix of ['-wal','-shm'])rmSync(`${target}${suffix}`,{force:true});
  renameSync(temporary,target);
 }
 for(const file of check.manifest.files)if(await sha(join(root,file.path))!==file.sha256)throw new Error(`Restored file does not match the backup: ${file.path}`);
 return {restored:check.manifest.files.length,safetyCopy:safety};
}
/** Proves a backup can be restored: backs up, restores into an empty scratch directory and compares everything. */
export async function restoreDrill({root=process.cwd(),now=new Date()}={}){
 const scratch=await mkdtemp(join(tmpdir(),'forme-drill-'));
 try{
  const {dir,manifest}=await createBackup({root,dest:join(scratch,'backup'),now});
  const target=join(scratch,'restored');mkdirSync(target);
  const restored=await restoreBackup({root:target,from:dir,now});
  const problems=[];
  for(const file of manifest.files){
   if(await sha(join(target,file.path))!==file.sha256)problems.push(`mismatch: ${file.path}`);
   if(file.path.endsWith('.sqlite')&&JSON.stringify(tableCounts(join(target,file.path)))!==JSON.stringify(file.tables))problems.push(`row counts differ: ${file.path}`);
  }
  return {ok:!problems.length,files:manifest.files.length,restored:restored.restored,problems};
 }finally{rmSync(scratch,{recursive:true,force:true});}
}
/** Deletes the oldest timestamped backups beyond `keep`. Pre-restore safety copies are never pruned. */
export function pruneBackups({root=process.cwd(),keep}){
 if(!Number.isInteger(keep)||keep<1)throw new Error('Keep at least one backup.');
 const base=join(root,'.forme-backups');if(!existsSync(base))return [];
 const old=readdirSync(base).filter(name=>/^\d{4}-\d{2}-\d{2}T/.test(name)).sort().slice(0,-keep);
 for(const name of old)rmSync(join(base,name),{recursive:true,force:true});
 return old;
}
