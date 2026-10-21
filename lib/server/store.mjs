import {validTimestamp} from '../data-trust.mjs';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {classifyListing} from '../classification.mjs';

// Single-user local pilot. Use a hosted database and authentication before deployment.
export function openStore(path=`${process.cwd()}/.forme-data/forme.sqlite`){
 mkdirSync(dirname(path),{recursive:true,mode:0o700});
 const db=new DatabaseSync(path);chmodSync(path,0o600);
 db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS listings(source_key TEXT PRIMARY KEY,payload TEXT NOT NULL,first_seen TEXT NOT NULL,last_seen TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS observations(source_key TEXT NOT NULL,observed_at TEXT NOT NULL,price REAL NOT NULL,PRIMARY KEY(source_key,observed_at));
 CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS profiles(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS feedback(id INTEGER PRIMARY KEY,action TEXT NOT NULL,listing_key TEXT NOT NULL,created_at TEXT NOT NULL);
 PRAGMA user_version=1;`);
 const previousSnapshot=db.prepare("SELECT payload FROM metadata WHERE key='snapshot'").get();
 if(previousSnapshot&&!db.prepare("SELECT key FROM metadata WHERE key='baseline'").get()){
  const snapshot=JSON.parse(previousSnapshot.payload);
  const keys=snapshot.keys.filter(key=>{const row=db.prepare('SELECT payload FROM listings WHERE source_key=?').get(key);const jobs=JSON.parse(row.payload).matchedJobs??[];return !jobs.some(job=>job.startsWith('discover:'))||jobs.some(job=>!job.startsWith('discover:'));});
  const at=keys.map(key=>db.prepare('SELECT last_seen FROM listings WHERE source_key=?').get(key).last_seen).sort().at(-1)??snapshot.fetchedAt;
  db.prepare("INSERT INTO metadata VALUES('baseline',?)").run(JSON.stringify({keys,at}));
 }
 function transaction(work){db.exec('BEGIN IMMEDIATE');try{const value=work();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}
 return {
  close:()=>db.close(),
  importSnapshot(snapshot){return transaction(()=>{
   if(!Array.isArray(snapshot.items)||!validTimestamp(snapshot.fetchedAt))throw new Error('Invalid listing snapshot');
   const previousMetadata=db.prepare("SELECT payload FROM metadata WHERE key='snapshot'").get();
   const previousSnapshot=previousMetadata?JSON.parse(previousMetadata.payload):null;
   const keys=[];
   for(const item of snapshot.items){
    if(!item||!Number.isSafeInteger(item.id)||item.id<=0||typeof item.price!=='number'||!Number.isFinite(item.price)||item.price<0||typeof item.title!=='string'||!item.title.trim())throw new Error('Invalid listing identity, price or title');
    const key=item.sourceKey??`${item.source??'demo'}:${item.sourceId??item.id}`;
    if(key!==`${item.source??'demo'}:${item.sourceId??item.id}`||item.sourceId!==undefined&&item.sourceId!==String(item.id))throw new Error('Conflicting listing identity');
    if(keys.includes(key))throw new Error('Duplicate listing identity');keys.push(key);
    const observedAt=item.fetchedAt??snapshot.fetchedAt;
    if(!validTimestamp(observedAt)||item.firstSeenAt!==undefined&&(!validTimestamp(item.firstSeenAt)||Date.parse(item.firstSeenAt)>Date.parse(observedAt)))throw new Error('Invalid observation timestamp');
    const existing=db.prepare('SELECT payload,first_seen,last_seen FROM listings WHERE source_key=?').get(key);
    if(existing){const stored=JSON.parse(existing.payload);if(stored.currency&&item.currency&&stored.currency!==item.currency)throw new Error('Observation currency changed');}
    const observation=db.prepare('SELECT price FROM observations WHERE source_key=? AND julianday(observed_at)=julianday(?)').get(key,observedAt);
    if(observation&&observation.price!==item.price)throw new Error('Conflicting prices for the same observation');
    // Historical imports add observations but cannot replace a more recent payload.
    const firstSeen=[existing?.first_seen,item.firstSeenAt??observedAt].filter(Boolean).sort((a,b)=>Date.parse(a)-Date.parse(b))[0];
    const {previousPrice,priceChangedAt,observedAt:ignoredObservation,newlyCollected,...clean}=item;
    const payload={...clean,...classifyListing(item),fetchedAt:observedAt,firstSeenAt:firstSeen};
    if(!existing||Date.parse(observedAt)>=Date.parse(existing.last_seen))db.prepare('INSERT INTO listings VALUES(?,?,?,?) ON CONFLICT(source_key) DO UPDATE SET payload=excluded.payload,first_seen=excluded.first_seen,last_seen=excluded.last_seen').run(key,JSON.stringify(payload),firstSeen,observedAt);
    else db.prepare('UPDATE listings SET first_seen=? WHERE source_key=?').run(firstSeen,key);
    if(!observation)db.prepare('INSERT OR IGNORE INTO observations VALUES(?,?,?)').run(key,observedAt,item.price);
   }
   if(!db.prepare("SELECT key FROM metadata WHERE key='baseline'").get())db.prepare("INSERT INTO metadata VALUES('baseline',?)").run(JSON.stringify({keys,at:snapshot.fetchedAt}));
   const {items,quality,...metadata}=snapshot;
   if(previousSnapshot&&Date.parse(previousSnapshot.fetchedAt)>Date.parse(snapshot.fetchedAt)){metadata.fetchedAt=previousSnapshot.fetchedAt;for(const key of previousSnapshot.keys)if(!keys.includes(key))keys.push(key);}
   db.prepare("INSERT INTO metadata VALUES('snapshot',?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload").run(JSON.stringify({...metadata,keys}));
   return {listings:keys.length,observations:db.prepare('SELECT COUNT(*) AS count FROM observations').get().count};
  });},
  snapshot(){
   const row=db.prepare("SELECT payload FROM metadata WHERE key='snapshot'").get();if(!row)return null;
   const {keys,...metadata}=JSON.parse(row.payload);
   const baseline=JSON.parse(db.prepare("SELECT payload FROM metadata WHERE key='baseline'").get().payload);
   const baselineKeys=new Set(baseline.keys);
   return {...metadata,history:{baselineAt:baseline.at},items:keys.map(key=>{
    const listing=db.prepare('SELECT payload,first_seen,last_seen FROM listings WHERE source_key=?').get(key),item=JSON.parse(listing.payload);
    const observedAt=validTimestamp(item.fetchedAt)?item.fetchedAt:listing.last_seen;
    const observations=db.prepare('SELECT observed_at,price FROM observations WHERE source_key=? ORDER BY julianday(observed_at)').all(key).filter(row=>Date.parse(row.observed_at)<=Date.parse(observedAt));
    let change=null;for(let index=1;index<observations.length;index++)if(observations[index].price!==observations[index-1].price)change={previousPrice:observations[index-1].price,priceChangedAt:observations[index].observed_at};
    const {previousPrice,priceChangedAt,...current}=item;
    if(!observations.length||observations.at(-1).price!==item.price||Date.parse(observations.at(-1).observed_at)!==Date.parse(observedAt))change=null;
    return {...current,firstSeenAt:listing.first_seen,observedAt,newlyCollected:!baselineKeys.has(key),...(change??{})};
   })};
  },
  profile(){const row=db.prepare('SELECT revision,payload FROM profiles WHERE id=1').get();return row?{revision:row.revision,profile:JSON.parse(row.payload)}:{revision:0,profile:null};},
  saveProfile(profile,baseRevision){return transaction(()=>{
   const previous=this.profile();if(previous.revision!==baseRevision)return {conflict:true,...previous};
   const revision=previous.revision+1;
   const before=previous.profile?.settings??{},after=profile.settings;
   for(const [field,add,remove] of [['saved','save','unsave'],['dismissed','dismiss','restore']]){
    for(const key of after[field]??[])if(!(before[field]??[]).includes(key))db.prepare('INSERT INTO feedback(action,listing_key,created_at) VALUES(?,?,?)').run(add,String(key),new Date().toISOString());
    for(const key of before[field]??[])if(!(after[field]??[]).includes(key))db.prepare('INSERT INTO feedback(action,listing_key,created_at) VALUES(?,?,?)').run(remove,String(key),new Date().toISOString());
   }
   db.prepare('INSERT INTO profiles VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload').run(revision,JSON.stringify(profile));
   return {revision};
  });},
  feedback(){return db.prepare('SELECT action,listing_key,created_at FROM feedback ORDER BY id').all();}
 };
}
