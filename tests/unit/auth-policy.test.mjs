import {test} from 'node:test';
import assert from 'node:assert/strict';
import {originOf,supabaseConfig,authRequired,safeNext,sameOrigin,normalizeEmail,validEmail,accessFor,loginError} from '../../lib/server/auth-policy.mjs';
const env={NEXT_PUBLIC_SUPABASE_URL:'https://abc.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_x'};
const h=obj=>new Headers(obj);
test('auth is off without Supabase config, and on for every hosted or non-loopback request',()=>{
 assert.equal(authRequired('forme.example.com',{}),false);assert.equal(authRequired('127.0.0.1:3000',{}),false);
 assert.equal(authRequired('127.0.0.1:3000',env),false,'plain local run keeps working without a login');
 assert.equal(authRequired('localhost:3000',env),false);
 assert.equal(authRequired('forme.vercel.app',env),true);assert.equal(authRequired(null,env),true);assert.equal(authRequired('',env),true);
 for(const flag of [{VERCEL:'1'},{NETLIFY:'true'},{FORME_REQUIRE_AUTH:'1'},{RENDER:'true'},{FLY_APP_NAME:'x'}])assert.equal(authRequired('127.0.0.1:3000',{...env,...flag}),true,JSON.stringify(flag));
 assert.equal(authRequired('127.0.0.1.evil.com',env),true,'lookalike hosts are not loopback');
});
test('Supabase config needs both values and an https URL (or a local one)',()=>{
 assert.deepEqual(supabaseConfig(env),{url:'https://abc.supabase.co',key:'sb_publishable_x'});
 assert.equal(supabaseConfig({NEXT_PUBLIC_SUPABASE_URL:env.NEXT_PUBLIC_SUPABASE_URL}),null);
 assert.equal(supabaseConfig({...env,NEXT_PUBLIC_SUPABASE_URL:'http://abc.supabase.co'}),null);
 assert.ok(supabaseConfig({...env,NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321'}));
 assert.equal(supabaseConfig({...env,NEXT_PUBLIC_SUPABASE_URL:'not a url'}),null);
});
test('redirect targets are same-site paths only',()=>{
 assert.equal(safeNext('/saved?x=1#y'),'/saved?x=1#y');assert.equal(safeNext('/'),'/');
 for(const bad of ['https://evil.com','//evil.com','/\\evil.com','javascript:alert(1)','','saved','/login','/auth/callback?x=1','/%0d%0a'.replace('%0d%0a','\r\n'),undefined,null,42,'/'+'a'.repeat(400)])assert.equal(safeNext(bad),'/',String(bad).slice(0,30));
});
test('form posts must be same-origin; navigations without Origin only when same-site',()=>{
 assert.equal(sameOrigin(h({host:'forme.app',origin:'https://forme.app'})),true);
 assert.equal(sameOrigin(h({host:'forme.app',origin:'https://evil.com'})),false);
 assert.equal(sameOrigin(h({host:'forme.app',origin:'null'})),false);
 assert.equal(sameOrigin(h({host:'forme.app','sec-fetch-site':'same-origin'})),true);
 assert.equal(sameOrigin(h({host:'forme.app','sec-fetch-site':'cross-site'})),false);
 assert.equal(sameOrigin(h({host:'forme.app'})),false);
});
test('emails are normalised and validated',()=>{
 assert.equal(normalizeEmail('  Me@Example.COM '),'me@example.com');assert.equal(normalizeEmail(null),'');
 assert.equal(validEmail('me@example.com'),true);for(const bad of ['','a','a@b','a b@c.d','@c.d','a@'.padEnd(260,'x')+'.com'])assert.equal(validEmail(bad),false,bad);
});
test('access needs verified claims AND a matching invite row; role comes only from the invite',()=>{
 const claims={sub:'u1',email:'Me@Example.com'};
 assert.deepEqual(accessFor(null,null),{state:'anonymous'});assert.deepEqual(accessFor({sub:'u1'},{email:'x',role:'owner'}),{state:'anonymous'});
 assert.equal(accessFor(claims,null).state,'uninvited');
 assert.equal(accessFor(claims,{email:'someone@else.com',role:'owner'}).state,'uninvited','an invite for another address does not count');
 assert.equal(accessFor(claims,{email:'me@example.com',role:'admin'}).state,'uninvited','unknown roles are refused');
 assert.deepEqual(accessFor(claims,{email:'me@example.com',role:'owner'}),{state:'allowed',userId:'u1',email:'me@example.com',role:'owner',owner:true});
 assert.equal(accessFor({...claims,role:'owner',user_metadata:{role:'owner'}},{email:'me@example.com',role:'member'}).owner,false,'claims cannot grant owner');
});
test('login errors are fixed strings, never reflecting query input',()=>{
 assert.match(loginError('not-invited'),/invite list/);assert.equal(loginError('<script>'),null);assert.equal(loginError(undefined),null);
});
test('the site origin follows the Host the visitor used, so cookies and redirects stay on one host',()=>{
 assert.equal(originOf(h({host:'127.0.0.1:3000'}),'http://localhost:3000/x'),'http://127.0.0.1:3000');
 assert.equal(originOf(h({host:'forme.app','x-forwarded-proto':'https'}),'http://forme.app/x'),'https://forme.app');
 assert.equal(originOf(h({host:'forme.app','x-forwarded-proto':'https, http'}),'http://forme.app/x'),'https://forme.app');
 assert.equal(originOf(h({host:'forme.app','x-forwarded-proto':'javascript'}),'https://forme.app/x'),'https://forme.app');
 for(const bad of ['evil.com/path','a b','evil.com@x.com','','x.com:99999999'])assert.equal(originOf(h(bad?{host:bad}:{}),'https://fallback.app/x'),'https://fallback.app',bad);
 assert.equal(originOf(h({host:'[::1]:3000'}),'http://localhost:3000/'),'http://[::1]:3000');
});
