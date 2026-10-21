import {test,expect} from '@playwright/test';
test('health is readable from this computer, reports component status and exposes no secrets',async({request})=>{
 const response=await request.get('/api/health');expect([200,503]).toContain(response.status());
 expect(response.headers()['cache-control']).toBe('no-store');
 const body=await response.json();expect(['ok','degraded','down']).toContain(body.status);
 expect(Object.keys(body.checks).sort()).toEqual(['backup','collection','database','provider','queue']);
 expect(typeof body.version).toBe('string');expect(JSON.stringify(body)).not.toMatch(/sb_live_|api[_-]?key["']?\s*:\s*"[A-Za-z0-9-]{12,}/i);
});
test('health refuses callers that are not on this computer and have no monitor token',async({request})=>{
 const response=await request.get('/api/health',{headers:{host:'forme.example.test',authorization:'Bearer wrong-token-wrong-token'}});
 expect(response.status()).toBe(403);expect(await response.json()).toEqual({error:'Not available.'});
});
