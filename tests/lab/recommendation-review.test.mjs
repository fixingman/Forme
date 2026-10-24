import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {request as httpRequest} from 'node:http';
import {chromium} from '@playwright/test';
import {startReviewServer} from '../../scripts/lab/serve-review.mjs';

async function fixture(){
 await mkdir('.context',{recursive:true});const directory=await mkdtemp(resolve('.context/review-test-'));
 const items=[1,2,3].map(id=>({key:`vinted:${id}`,brand:'Fixture brand',title:id===1?'</script><script>window.injected=true</script>':'Cotton shirt',price:100,size:'M',condition:'Good',imageUrl:'https://images1.vinted.net/test.webp',sourceUrl:`https://www.vinted.se/items/${id}-fixture`,observedAt:'2026-10-21T00:00:00Z'}));
 await writeFile(join(directory,'dataset.json'),JSON.stringify({review:{items}}));
 execFileSync(process.execPath,['scripts/lab/review-recommendations.mjs',join(directory,'dataset.json')]);
 const manifest=JSON.parse(await readFile(join(directory,'review-manifest.json'),'utf8'));
 const server=await startReviewServer({directory,port:0}),url=`http://127.0.0.1:${server.address().port}`;
 return {directory,manifest,server,url,close:async()=>{server.closeAllConnections();await new Promise(done=>server.close(done));await rm(directory,{recursive:true,force:true});}};
}

test('private review API enforces origin, catalog binding and optimistic revisions',async()=>{
 const f=await fixture();try{
  const body={app:'forme-recommendation-review',version:1,catalogHash:f.manifest.catalogHash,baseRevision:0,events:[{key:'vinted:1',action:'save'}]};
  const post=(value,origin=f.url)=>fetch(f.url+'/api/judgments',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(value)});
  assert.equal((await post(body,'https://elsewhere.example')).status,403);
  assert.equal((await post({...body,catalogHash:'old-catalog'})).status,400);
  assert.equal((await post({...body,events:[{key:'vinted:99',action:'save'}]})).status,400);
  assert.equal((await post(body)).status,200);assert.equal((await post(body)).status,409);
  const saved=JSON.parse(await readFile(join(f.directory,'judgments.json'),'utf8'));assert.equal(saved.revision,1);assert.deepEqual(saved.events,body.events);
  assert.equal((await fetch(f.url+'/preferences.json')).status,404);
  const spoofed=await new Promise((accept,reject)=>{const req=httpRequest(f.url+'/api/judgments',{headers:{host:'elsewhere.example'}},res=>{res.resume();accept(res.statusCode);});req.on('error',reject);req.end();});assert.equal(spoofed,403);
 }finally{await f.close();}
});

test('blind review saves choices locally, supports undo/download and never calls app collection',async()=>{
 const f=await fixture(),browser=await chromium.launch(process.env.CI?{}:{channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),requests=[];
  page.on('request',request=>requests.push(request.url()));
  await page.route('https://images1.vinted.net/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"/>'}));
  await page.goto(f.url);await page.getByRole('button',{name:'Would save',exact:true}).click();
  await page.getByRole('button',{name:'Not for me',exact:true}).click();
  await page.getByRole('button',{name:'Undo last choice',exact:true}).click();
  await page.getByText('Choices saved to this local comparison.',{exact:true}).waitFor();
  // Drain queued autosaves before inspecting the canonical file.
  await page.waitForFunction(()=>document.getElementById('counter').textContent.startsWith('1 choices recorded'));
  for(let attempt=0;attempt<50;attempt++){
   const saved=await(await fetch(f.url+'/api/judgments')).json();if(saved.revision===3)break;
   await new Promise(done=>setTimeout(done,20));
  }
  const saved=JSON.parse(await readFile(join(f.directory,'judgments.json'),'utf8'));assert.equal(saved.revision,3);assert.equal(saved.events.filter(e=>e.action==='dismiss').length,0);
  const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Download choices',exact:true}).click();const download=await downloadEvent;
  const exported=JSON.parse(await readFile(await download.path(),'utf8'));assert.deepEqual(exported.events,saved.events);
  assert.equal(await page.evaluate(()=>window.injected),undefined);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert(!requests.some(url=>/\/api\/(refresh|profile|local-profile)/.test(url)));
  await page.reload();assert.match(await page.locator('#counter').textContent(),/1 choices recorded/);
 }finally{await browser.close();await f.close();}
});
