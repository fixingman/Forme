import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkSupabase,checkOwnerSetup,worst} from '../../lib/server/supabase-check.mjs';
const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
// A project fake: `state` decides how each endpoint answers; it records every request so tests can prove nothing was written.
function project(state={}){
 const log=[];
 const settings={disable_signup:true,external:{email:true,google:true},...state.settings};
 const fetchImpl=async(url,init={})=>{
  const u=new URL(url);log.push({method:init.method??'GET',path:u.pathname,key:init.headers?.apikey});
  if(state.down)throw new Error('connect ECONNREFUSED');
  if(init.headers?.apikey!=='good-key')return json(401,{message:'Invalid API key'});
  if(u.pathname==='/auth/v1/settings')return json(200,settings);
  const table=u.pathname.replace('/rest/v1/','');
  if(u.pathname.startsWith('/rest/v1/rpc/')){return state.rpc?state.rpc():json(401,{code:'42501',message:'permission denied for function save_profile'});}
  if(state.missing?.includes(table))return json(404,{code:'PGRST205',message:`Could not find the table 'public.${table}'`});
  if(state.leak===table)return json(200,[{source_key:'vinted:1'}]);
  if(state.openEmpty===table)return json(200,[]);
  return json(401,{code:'42501',message:`permission denied for table ${table}`});
 };
 return {fetchImpl,log};
}
const run=(state,extra={})=>checkSupabase({url:'https://abc.supabase.co',key:'good-key',...project(state),...extra});
const by=(results,name)=>results.find(r=>r.name===name);
test('a correctly configured project passes every required check, and only reads',async()=>{
 const p=project();const results=await checkSupabase({url:'https://abc.supabase.co',key:'good-key',fetchImpl:p.fetchImpl});
 assert.equal(worst(results),'pass',JSON.stringify(results.filter(r=>r.status!=='pass')));
 assert.equal(by(results,'Public sign-up is off').status,'pass');assert.equal(results.filter(r=>/is private/.test(r.name)).length,5);
 assert.deepEqual([...new Set(p.log.map(c=>c.method))].sort(),['GET','POST']);
 assert.ok(p.log.filter(c=>c.method==='POST').every(c=>c.path==='/rest/v1/rpc/save_profile'),'the only POST is the refused signed-out function probe');
});
test('open sign-up is a failure with the fix named',async()=>{
 const r=await run({settings:{disable_signup:false}});
 assert.equal(by(r,'Public sign-up is off').status,'fail');assert.match(by(r,'Public sign-up is off').detail,/Allow new users to sign up/);assert.equal(worst(r),'fail');
});
test('an unapplied migration is reported per table, and the function check is skipped',async()=>{
 const r=await run({missing:['allowed_users','user_profiles','snapshot_meta','listings']});
 assert.equal(r.filter(x=>x.status==='fail'&&/^Table /.test(x.name)).length,4);assert.match(by(r,'Table listings').detail,/Run supabase\/migrations/);assert.equal(by(r,'Function save_profile'),undefined);
});
test('a signed-out request that reads rows, or runs the function, is a hard failure',async()=>{
 assert.equal(by(await run({leak:'listings'}),'Table listings is private').status,'fail');
 assert.equal(by(await run({rpc:()=>json(200,1)}),'Function save_profile is private').status,'fail');
 assert.equal(by(await run({openEmpty:'listings'}),'Table listings is private').status,'warn');
 assert.equal(by(await run({rpc:()=>json(404,{code:'PGRST202'})}),'Function save_profile').status,'fail');
});
test('bad keys, bad URLs and unreachable projects stop early with a clear message',async()=>{
 const wrongKey=await checkSupabase({url:'https://abc.supabase.co',key:'nope',fetchImpl:project().fetchImpl});
 assert.equal(wrongKey.length,1);assert.match(wrongKey[0].detail,/rejected the publishable key/);
 assert.match((await checkSupabase({url:'not a url',key:'k',fetchImpl:fetch}))[0].detail,/not a valid URL/);
 const down=await run({down:true});assert.equal(down.length,1);assert.match(down[0].detail,/Could not connect/);
});
test('Google is optional, and only risky email settings warn',async()=>{
 const r=await run({settings:{external:{email:true,google:false},mailer_autoconfirm:true}});
 assert.equal(by(r,'Google sign-in').status,'pass');assert.equal(by(r,'Email confirmation').status,'warn');assert.equal(worst(r),'warn');
 assert.equal(by(await run({settings:{external:{email:false}}}),'Email sign-in enabled').status,'fail');
});
test('owner checks compare the invite list with the Supabase users, read-only and without printing emails',async()=>{
 const make=({invites,users,inviteStatus=200,userStatus=200})=>{const log=[];return {log,fetchImpl:async(url,init={})=>{const u=new URL(url);log.push(init.method??'GET');return u.pathname==='/rest/v1/allowed_users'?json(inviteStatus,invites):json(userStatus,{users});}};};
 const good=make({invites:[{email:'me@example.com',role:'owner'}],users:[{email:'Me@Example.com'}]});
 const ok=await checkOwnerSetup({url:'https://abc.supabase.co',serviceKey:'svc',fetchImpl:good.fetchImpl});
 assert.equal(worst(ok),'pass');assert.deepEqual([...new Set(good.log)],['GET']);
 const none=await checkOwnerSetup({url:'https://abc.supabase.co',serviceKey:'svc',...make({invites:[],users:[]})});
 assert.equal(by(none,'Owner invited').status,'fail');assert.match(by(none,'Owner invited').detail,/insert into public\.allowed_users/);
 const gaps=await checkOwnerSetup({url:'https://abc.supabase.co',serviceKey:'svc',...make({invites:[{email:'me@example.com',role:'owner'}],users:[{email:'stranger@example.com'}]})});
 assert.equal(by(gaps,'Invited accounts exist').status,'warn');assert.equal(by(gaps,'No uninvited accounts').status,'warn');
 assert.equal(JSON.stringify(gaps).includes('stranger@example.com'),false);assert.equal(JSON.stringify(gaps).includes('me@example.com'),false);
 assert.equal(by(await checkOwnerSetup({url:'https://abc.supabase.co',serviceKey:'svc',...make({invites:{},users:[],inviteStatus:401})}),'Invite list').status,'fail');
 assert.equal(by(await checkOwnerSetup({url:'https://abc.supabase.co',serviceKey:'svc',...make({invites:[{email:'Me@x.com',role:'owner'}],users:[]})}),'Invite emails lowercase').status,'fail');
});
