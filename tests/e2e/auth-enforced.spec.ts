import {test,expect,request as pwRequest,type APIRequestContext} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {existsSync} from 'node:fs';

// Starts a production server with sign-in enforced (placeholder Supabase URL: no network is needed for signed-out requests)
// and checks the gates. Needs `npm run build` first (CI does that); skipped otherwise.
const PORT=3101,base=`http://127.0.0.1:${PORT}`;
let server:ChildProcess,api:APIRequestContext;
test.skip(!existsSync('.next/BUILD_ID'),'run npm run build first');
test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(PORT)],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:'https://placeholder-project.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_placeholder',FORME_REQUIRE_AUTH:'1'},stdio:'ignore'});
 for(let i=0;i<60;i++){try{if((await fetch(`${base}/login`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
 api=await pwRequest.newContext({baseURL:base,maxRedirects:0});
});
test.afterAll(async()=>{await api?.dispose();server?.kill();});

test('signed-out page requests are sent to /login, keeping the destination',async()=>{
 for(const [path,next] of [['/saved','/saved'],['/discover?style=Denim','/discover?style=Denim'],['/','/']]){
  const response=await api.get(path);expect(response.status(),path).toBe(307);
  const location=new URL(response.headers().location,base);expect(location.pathname).toBe('/login');expect(location.searchParams.get('next')).toBe(next);
 }
});
test('signed-out API requests get 401 and no data, including collection and profile endpoints',async()=>{
 for(const path of ['/api/profile','/api/listings','/api/refresh','/api/local-profile','/api/size-profile']){
  const response=await api.get(path);expect(response.status(),path).toBe(401);expect(await response.json()).toEqual({error:'Sign in required.'});
 }
 expect((await api.put('/api/profile',{data:{backup:{},expectedRevision:0}})).status()).toBe(401);
 expect((await api.post('/api/refresh',{data:{action:'budget',dailyCap:100}})).status()).toBe(401);
});
test('the login page is reachable, minimal, and reflects nothing from the query string',async()=>{
 const page=await api.get('/login?error=%3Cscript%3Ealert(1)%3C/script%3E');expect(page.status()).toBe(200);
 const html=await page.text();expect(html).toContain('action="/auth/login"');expect(html).toContain('/auth/google');expect(html).not.toContain('Main navigation');expect(html).not.toContain('<script>alert');
 expect(await (await api.get('/login?error=not-invited')).text()).toContain('invite list');
});
test('sign-in posts must come from this site, and answer identically whatever the address',async()=>{
 const cross=await api.post('/auth/login',{headers:{origin:'https://evil.example'},form:{email:'a@b.co'}});
 expect(cross.status()).toBe(303);expect(cross.headers().location).toContain('error=origin');
 const same=await api.post('/auth/login',{headers:{origin:base},form:{email:'someone@example.com',next:'https://evil.example/steal'}});
 expect(same.status()).toBe(303);const location=new URL(same.headers().location,base);
 expect(location.origin).toBe(base);expect(location.searchParams.get('sent')).toBe('1');expect(location.searchParams.get('next')).toBe('/');
 const other=await api.post('/auth/login',{headers:{origin:base},form:{email:'not-an-email'}});expect(other.headers().location).toBe(same.headers().location);
});
test('callbacks and sign-out fail closed and stay on this host',async()=>{
 for(const path of ['/auth/callback?code=bogus','/auth/confirm?token_hash=bogus&type=email','/auth/callback?error=access_denied']){
  const response=await api.get(path);expect(response.status(),path).toBe(303);expect(new URL(response.headers().location,base).origin).toBe(base);expect(response.headers().location).toMatch(/\/login\?error=(link|provider)/);
 }
 const out=await api.post('/auth/signout',{headers:{origin:'https://evil.example'}});expect(out.headers().location).toContain('error=origin');
});
test('health stays reachable for local monitors, and static assets are not gated',async()=>{
 expect((await api.get('/api/health')).status()).toBeLessThan(600);expect([200,503]).toContain((await api.get('/api/health')).status());
});
