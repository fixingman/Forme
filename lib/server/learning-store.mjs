import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {LearningError} from '../domain/learning.mjs';
// All access is owner-scoped, including the local cache of hosted records.
export function localLearningStore(root=process.cwd(),owner='local'){
 const directory=join(root,'.forme-data');mkdirSync(directory,{recursive:true,mode:0o700});
 const db=new DatabaseSync(join(directory,'learning.sqlite'));chmodSync(join(directory,'learning.sqlite'),0o600);db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS learning_records(ordinal INTEGER PRIMARY KEY AUTOINCREMENT,owner TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,recorded_at TEXT NOT NULL,UNIQUE(owner,kind,id));
 CREATE TABLE IF NOT EXISTS learning_selection(owner TEXT PRIMARY KEY,revision INTEGER NOT NULL,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS learning_jobs(owner TEXT PRIMARY KEY,data TEXT NOT NULL);`);
 const list=kind=>db.prepare('SELECT id,ordinal,data,recorded_at FROM learning_records WHERE owner=? AND kind=? ORDER BY ordinal').all(owner,kind).map(row=>({...row,data:JSON.parse(row.data)}));
 return {async list(kind){return list(kind);},async append(records){db.exec('BEGIN IMMEDIATE');try{for(const r of records){const old=db.prepare('SELECT data FROM learning_records WHERE owner=? AND kind=? AND id=?').get(owner,r.kind,r.id);if(old){if(old.data!==JSON.stringify(r.data))throw new LearningError('An event ID was reused with different content.',409);continue;}db.prepare('INSERT INTO learning_records(owner,kind,id,data,recorded_at) VALUES(?,?,?,?,?)').run(owner,r.kind,r.id,JSON.stringify(r.data),new Date().toISOString());}db.exec('COMMIT');return records.map(r=>r.id);}catch(error){db.exec('ROLLBACK');throw error;}},
 async selection(){const row=db.prepare('SELECT revision,data FROM learning_selection WHERE owner=?').get(owner);return row?{revision:row.revision,...JSON.parse(row.data)}:{revision:0,selected:null,history:[]};},
 async select(expected,data){db.exec('BEGIN IMMEDIATE');try{const old=db.prepare('SELECT revision FROM learning_selection WHERE owner=?').get(owner);if((old?.revision??0)!==expected)throw new LearningError('Selection changed in another tab. Reload before choosing a model.',409);db.prepare('INSERT INTO learning_selection VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET revision=excluded.revision,data=excluded.data').run(owner,expected+1,JSON.stringify(data));db.exec('COMMIT');return {revision:expected+1,...data};}catch(error){db.exec('ROLLBACK');throw error;}},
 async clear(){db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM learning_records WHERE owner=?').run(owner);db.prepare('DELETE FROM learning_selection WHERE owner=?').run(owner);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}},
 job(value){if(value!==undefined)db.prepare('INSERT INTO learning_jobs VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET data=excluded.data').run(owner,JSON.stringify(value));const row=db.prepare('SELECT data FROM learning_jobs WHERE owner=?').get(owner);return row?JSON.parse(row.data):null;},close(){db.close();}};
}
export function hostedLearningStore(client){
 const check=(result)=>{if(result.error)throw new LearningError('Learning history is unavailable. Apply the learning migration or retry when connected.',503);return result.data;};
 return {async list(kind){const result=[];for(let offset=0;;offset+=500){const rows=check(await client.from('learning_records').select('id,ordinal,data,recorded_at').eq('kind',kind).order('ordinal').range(offset,offset+499));result.push(...rows);if(rows.length<500)return result;}},async append(records){return check(await client.rpc('append_learning_records',{records}));},async selection(){const rows=check(await client.from('learning_selection').select('revision,data'));return rows[0]?{revision:rows[0].revision,...rows[0].data}:{revision:0,selected:null,history:[]};},async select(expected,data){const revision=check(await client.rpc('select_learning_model',{expected_revision:expected,new_data:data}));if(revision===null)throw new LearningError('Selection changed in another tab. Reload before choosing a model.',409);return {revision,...data};},async clear(){check(await client.rpc('clear_learning_history'));},job(){return null;},close(){}};
}
