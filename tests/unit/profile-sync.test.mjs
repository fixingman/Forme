import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readProfile,saveProfile,readBody} from '../../lib/server/profile-sync.mjs';
const validate=value=>{if(!value||value.app!=='forme')throw new Error('This file is not a FORME backup.');return value;};
const backup={app:'forme',version:1,settings:{following:['Auralee']}};
const rpc=result=>({calls:[],rpc(name,args){this.calls.push([name,args]);return Promise.resolve(result);}});
test('a valid save calls the atomic function with the revision the device last saw',async()=>{
 const db=rpc({data:4,error:null});
 assert.deepEqual(await saveProfile(db,{backup,expectedRevision:3},validate),{status:200,revision:4});
 assert.deepEqual(db.calls[0],['save_profile',{expected_revision:3,new_backup:backup}]);
});
test('invalid backups and revisions are rejected before the database is touched',async()=>{
 const db=rpc({data:1,error:null});
 for(const input of [{backup:{app:'other'},expectedRevision:1},{backup:null,expectedRevision:1},{backup,expectedRevision:-1},{backup,expectedRevision:1.5},{backup,expectedRevision:'1'},{backup,expectedRevision:undefined},{backup,expectedRevision:2e9}])
  assert.equal((await saveProfile(db,input,validate)).status,400,JSON.stringify(input).slice(0,60));
 assert.equal(db.calls.length,0);
});
test('a stale device gets the current profile back instead of overwriting it',async()=>{
 const current={backup:{app:'forme',version:1,n:'phone'},revision:7,updated_at:'2026-10-22T10:00:00Z'};
 const db={rpc:async()=>({data:null,error:null}),from:()=>({select:()=>({maybeSingle:async()=>({data:current,error:null})})})};
 assert.deepEqual(await saveProfile(db,{backup,expectedRevision:3},validate),{status:409,profile:{backup:current.backup,revision:7,updatedAt:current.updated_at}});
});
test('database refusals map to 403 for uninvited accounts and a generic 502 otherwise, never leaking details',async()=>{
 const refuse=error=>({rpc:async()=>({data:null,error})});
 assert.deepEqual(await saveProfile(refuse({code:'42501',message:'not invited'}),{backup,expectedRevision:0},validate),{status:403,error:'Not available for this account.'});
 const other=await saveProfile(refuse({code:'XX000',message:'connection string postgres://secret'}),{backup,expectedRevision:0},validate);
 assert.equal(other.status,502);assert.equal(JSON.stringify(other).includes('secret'),false);
});
test('reading a profile returns null when none exists and hides database errors',async()=>{
 const make=result=>({from:()=>({select:()=>({maybeSingle:async()=>result})})});
 assert.equal(await readProfile(make({data:null,error:null})),null);
 await assert.rejects(readProfile(make({data:null,error:{message:'secret detail'}})),/^Error: Profile could not be read\.$/);
});
test('request bodies over the limit are refused, by header or by streamed size',async()=>{
 const body=JSON.stringify({a:'x'.repeat(500)});
 assert.deepEqual(await readBody(new Request('http://x',{method:'PUT',body}),2000),{a:'x'.repeat(500)});
 await assert.rejects(readBody(new Request('http://x',{method:'PUT',body}),100),/too large/);
 await assert.rejects(readBody(new Request('http://x',{method:'PUT',body,headers:{'content-length':'999999'}}),100),/too large/);
 await assert.rejects(readBody(new Request('http://x',{method:'PUT'}),100),/Missing request body/);
});
