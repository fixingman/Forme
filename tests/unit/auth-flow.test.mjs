import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveAccess,finishSignIn,exchangeCode,confirmToken,sendLink,googleUrl} from '../../lib/server/auth-flow.mjs';
// A fake that records calls and returns what the test configures, in Supabase's response shape.
function fake({claims=null,claimsError=null,invite=null,exchangeError=null,otpError=null,oauth={url:'https://accounts.google.com/x'}}={}){
 const calls=[];
 return {calls,auth:{
  getClaims:async()=>({data:claims?{claims}:null,error:claimsError}),
  signOut:async()=>{calls.push('signOut');return {error:null};},
  exchangeCodeForSession:async code=>{calls.push(['exchange',code]);return {error:exchangeError};},
  verifyOtp:async args=>{calls.push(['verifyOtp',args]);return {error:otpError};},
  signInWithOtp:async args=>{calls.push(['otp',args]);return {error:otpError};},
  signInWithOAuth:async args=>{calls.push(['oauth',args]);return {data:oauth,error:oauth?null:new Error('x')};}},
  from:table=>({select:()=>({eq:(col,val)=>({maybeSingle:async()=>{calls.push(['invite',table,col,val]);return {data:invite};}})})})};
}
const claims={sub:'u1',email:'Me@Example.com'};
test('an invited session is allowed; the role comes from the invite row',async()=>{
 const s=fake({claims,invite:{email:'me@example.com',role:'owner'}});
 assert.deepEqual(await resolveAccess(s),{state:'allowed',userId:'u1',email:'me@example.com',role:'owner',owner:true});
 assert.deepEqual(s.calls[0],['invite','allowed_users','email','me@example.com'],'looked up by the verified, normalised email');
});
test('no verified claims means anonymous, without touching the database',async()=>{
 const s=fake({claims:null,claimsError:new Error('bad jwt'),invite:{email:'me@example.com',role:'owner'}});
 assert.deepEqual(await resolveAccess(s),{state:'anonymous'});assert.equal(s.calls.length,0);
 assert.equal((await resolveAccess(fake({claims:{sub:'u1'},invite:{email:'x',role:'owner'}}))).state,'anonymous','a token with no email is never accepted');
});
test('an uninvited account is signed out immediately after sign-in',async()=>{
 const s=fake({claims,invite:null});
 assert.deepEqual(await finishSignIn(s),{ok:false,error:'not-invited'});assert.ok(s.calls.includes('signOut'));
 const t=fake({claims,invite:{email:'me@example.com',role:'member'}});assert.equal((await finishSignIn(t)).ok,true);assert.ok(!t.calls.includes('signOut'));
});
test('code and token-hash exchanges validate input and fail closed',async()=>{
 const ok=fake({claims,invite:{email:'me@example.com',role:'owner'}});
 assert.equal((await exchangeCode(ok,'abc')).ok,true);assert.deepEqual(ok.calls[0],['exchange','abc']);
 for(const bad of [undefined,'',null,'x'.repeat(2001)])assert.deepEqual(await exchangeCode(fake({claims,invite:{email:'me@example.com',role:'owner'}}),bad),{ok:false,error:'link'});
 assert.deepEqual(await exchangeCode(fake({exchangeError:new Error('expired')}),'abc'),{ok:false,error:'link'});
 assert.equal((await confirmToken(ok,'hash','email')).ok,true);assert.deepEqual(ok.calls.find(c=>c[0]==='verifyOtp')[1],{token_hash:'hash',type:'email'});
 for(const [hash,type] of [['hash','signup'],['hash','recovery'],['','email'],[undefined,'email']])assert.equal((await confirmToken(fake({claims,invite:{email:'me@example.com',role:'owner'}}),hash,type)).ok,false,`${hash}/${type}`);
 assert.deepEqual(await confirmToken(fake({otpError:new Error('used')}),'hash','email'),{ok:false,error:'link'});
});
test('magic links never create accounts and reject malformed addresses before calling Supabase',async()=>{
 const s=fake();const r=await sendLink(s,'  Me@Example.com ','https://forme.app/auth/callback?next=%2F');
 assert.equal(r.ok,true);assert.deepEqual(s.calls[0],['otp',{email:'me@example.com',options:{shouldCreateUser:false,emailRedirectTo:'https://forme.app/auth/callback?next=%2F'}}]);
 const t=fake();assert.deepEqual(await sendLink(t,'not-an-email','x'),{ok:false,reason:'invalid'});assert.equal(t.calls.length,0);
 assert.deepEqual(await sendLink(fake({otpError:Object.assign(new Error('Signups not allowed'),{status:422,code:'otp_disabled'})}),'a@b.co','x'),{ok:false,reason:'provider',status:422,code:'otp_disabled'});
 assert.deepEqual(await sendLink(fake({otpError:new Error('x')}),'a@b.co','x'),{ok:false,reason:'provider',status:null,code:null});
});
test('Google sign-in returns the provider URL without auto-redirecting server-side',async()=>{
 const s=fake();assert.equal(await googleUrl(s,'https://forme.app/auth/callback'),'https://accounts.google.com/x');
 assert.deepEqual(s.calls[0],['oauth',{provider:'google',options:{redirectTo:'https://forme.app/auth/callback',skipBrowserRedirect:true}}]);
 assert.equal(await googleUrl(fake({oauth:null}),'x'),null);
});
