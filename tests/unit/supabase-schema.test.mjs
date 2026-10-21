import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Runs the real migration in an in-process Postgres with a minimal stand-in for Supabase's auth schema
// (auth.jwt() reads request.jwt.claims exactly as Supabase does), then checks what each caller can and cannot do.
const migration=readFileSync(new URL('../../supabase/migrations/20261022000000_private_beta.sql',import.meta.url),'utf8');
const owner={id:'11111111-1111-1111-1111-111111111111',email:'owner@example.com'};
const friend={id:'22222222-2222-2222-2222-222222222222',email:'friend@example.com'};
const stranger={id:'33333333-3333-3333-3333-333333333333',email:'stranger@example.com'};
let db;
async function as(user,run){
 await db.exec('RESET ROLE');
 if(!user){await db.exec('SET ROLE anon');await db.query("select set_config('request.jwt.claims','',false)");}
 else{await db.exec('SET ROLE authenticated');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user.id,email:user.email,role:'authenticated'})]);}
 try{return await run();}finally{await db.exec('RESET ROLE');}
}
const sample=(n)=>({app:'forme',version:1,n});
before(async()=>{
 db=new PGlite();
 await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt() ->> 'sub')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  grant execute on function auth.jwt(), auth.uid() to anon, authenticated;`);
 for(const user of [owner,friend,stranger])await db.query('insert into auth.users values ($1,$2)',[user.id,user.email]);
 await db.exec(migration);
 await db.query("insert into public.allowed_users (email, role) values ('owner@example.com','owner'),('friend@example.com','member')");
 await db.query("insert into public.snapshot_meta (id, fetched_at) values (1, now())");
 await db.query("insert into public.listings (source_key, data) values ('vinted:1', '{\"title\":\"Auralee shirt\"}')");
});
after(async()=>{await db.close();});

test('uninvited and signed-out callers read nothing',async()=>{
 assert.equal((await as(stranger,()=>db.query('select * from public.listings'))).rows.length,0);
 assert.equal((await as(stranger,()=>db.query('select * from public.snapshot_meta'))).rows.length,0);
 assert.equal((await as(stranger,()=>db.query('select * from public.allowed_users'))).rows.length,0);
 await assert.rejects(as(null,()=>db.query('select * from public.listings')),/permission denied/);
 await assert.rejects(as(null,()=>db.query('select * from public.allowed_users')),/permission denied/);
});
test('invited users read listings, and see only their own invite row',async()=>{
 assert.equal((await as(owner,()=>db.query('select * from public.listings'))).rows.length,1);
 assert.equal((await as(friend,()=>db.query('select * from public.snapshot_meta'))).rows.length,1);
 const mine=await as(owner,()=>db.query('select email, role from public.allowed_users'));
 assert.deepEqual(mine.rows,[{email:'owner@example.com',role:'owner'}]);
 assert.equal((await as(friend,()=>db.query('select public.is_owner() as owner'))).rows[0].owner,false);
 assert.equal((await as(owner,()=>db.query('select public.is_owner() as owner'))).rows[0].owner,true);
 assert.equal((await as(stranger,()=>db.query('select public.is_allowed() as ok'))).rows[0].ok,false);
});
test('no browser session can write listings, metadata or the invite list',async()=>{
 for(const sql of ["insert into public.listings (source_key, data) values ('x','{}')","update public.listings set data='{}'","delete from public.listings","insert into public.snapshot_meta (id, fetched_at) values (2, now())","insert into public.allowed_users (email) values ('me@example.com')","update public.allowed_users set role='owner'","delete from public.allowed_users"])
  await assert.rejects(as(owner,()=>db.query(sql)),/permission denied|row-level security|violates/,sql);
 assert.equal((await as(owner,()=>db.query('select * from public.listings'))).rows.length,1);
});
test('profiles save with optimistic concurrency and stay private to their owner',async()=>{
 const save=(user,expected,n)=>as(user,async()=>(await db.query('select public.save_profile($1,$2::jsonb) as revision',[expected,JSON.stringify(sample(n))])).rows[0].revision);
 assert.equal(await save(owner,0,1),1);
 assert.equal(await save(owner,0,2),null,'creating twice is a conflict, not an overwrite');
 assert.equal(await save(owner,1,3),2);
 assert.equal(await save(owner,1,4),null,'a stale device cannot overwrite a newer save');
 assert.equal(await save(owner,2,5),3);
 const read=await as(owner,()=>db.query('select revision, backup from public.user_profiles'));
 assert.equal(read.rows.length,1);assert.equal(read.rows[0].revision,3);assert.equal(read.rows[0].backup.n,5);
 assert.equal(await save(friend,0,9),1);
 assert.equal((await as(friend,()=>db.query('select backup from public.user_profiles'))).rows[0].backup.n,9);
 assert.equal((await as(owner,()=>db.query('select backup from public.user_profiles'))).rows[0].backup.n,5);
});
test('an uninvited user cannot save or read a profile even with a valid session',async()=>{
 await assert.rejects(as(stranger,()=>db.query("select public.save_profile(0,'{}'::jsonb)")),/not invited/);
 await assert.rejects(as(stranger,()=>db.query("insert into public.user_profiles (user_id, backup) values ($1,'{}')",[stranger.id])),/row-level security/);
 assert.equal((await as(stranger,()=>db.query('select * from public.user_profiles'))).rows.length,0);
 await assert.rejects(as(null,()=>db.query("select public.save_profile(0,'{}'::jsonb)")),/permission denied/);
});
test('removing someone from the invite list cuts off access immediately',async()=>{
 await db.query("delete from public.allowed_users where email='friend@example.com'");
 assert.equal((await as(friend,()=>db.query('select * from public.listings'))).rows.length,0);
 assert.equal((await as(friend,()=>db.query('select * from public.user_profiles'))).rows.length,0);
 await assert.rejects(as(friend,()=>db.query("select public.save_profile(1,'{}'::jsonb)")),/not invited/);
 await db.query("insert into public.allowed_users (email, role) values ('friend@example.com','member')");
 assert.equal((await as(friend,()=>db.query('select * from public.listings'))).rows.length,1);
});
test('invite emails must be lowercase so matching cannot be bypassed by casing',async()=>{
 await assert.rejects(db.query("insert into public.allowed_users (email) values ('Mixed@Example.com')"),/check constraint/);
 const upper={id:'44444444-4444-4444-4444-444444444444',email:'OWNER@EXAMPLE.COM'};
 assert.equal((await as(upper,()=>db.query('select public.is_allowed() as ok'))).rows[0].ok,true);
});
