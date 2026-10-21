import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const script=resolve('scripts/data/collect-discover.mjs');
test('pilot sends at most three filtered calls, preserves the existing snapshot and never repeats completed calls',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forme-discover-'));
 try{
  await mkdir(join(dir,'public/data'),{recursive:true});await writeFile(join(dir,'public/data/vinted.json'),JSON.stringify({fetchedAt:'2026-10-20T00:00:00Z',items:[{id:12345,source:'vinted',sourceKey:'vinted:12345',title:'Old shirt',brand:'Our Legacy',price:100,fetchedAt:'2026-10-20T00:00:00Z'}]}));
  await writeFile(join(dir,'mock.mjs'),`import {appendFileSync} from 'node:fs';globalThis.fetch=async input=>{const url=new URL(input);if(url.searchParams.get('catalog_ids')!=='5')throw new Error('Missing department filter');appendFileSync('calls.txt',url.searchParams.get('query')+'\\n');const brand=url.searchParams.get('query'),id=brand==='Auralee'?20001:brand==='Lemaire'?20002:20003;return Response.json({items:[{id,title:'Cotton shirt',brand_title:brand,price:{amount:'100',currency_code:'SEK'},url:'https://www.vinted.se/items/'+id+'-shirt',photo:{url:'https://images1.vinted.net/test.webp'}}]},{headers:{'x-credits-used':'5'}});};`);
  const run=()=>spawnSync(process.execPath,['--import',join(dir,'mock.mjs'),script,'--collect'],{cwd:dir,encoding:'utf8',env:{...process.env,NODE_ENV:'test',SCRAPEBADGER_API_KEY:'fake'}});
  assert.equal(run().status,0);assert.equal(run().status,0);
  assert.equal((await readFile(join(dir,'calls.txt'),'utf8')).trim().split('\n').length,3);
  const snapshot=JSON.parse(await readFile(join(dir,'public/data/vinted.json'),'utf8'));assert.equal(snapshot.items.length,4);assert.equal(snapshot.discovery.reportedCredits,15);
  assert.equal(snapshot.items.find(item=>item.id===20001).genderSource,'search-filter');assert.equal(snapshot.items.find(item=>item.id===12345).fetchedAt,'2026-10-20T00:00:00Z');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('uncertain billing stops immediately and does not retry on rerun',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forme-discover-'));
 try{
  await writeFile(join(dir,'mock.mjs'),`import {appendFileSync} from 'node:fs';globalThis.fetch=async()=>{appendFileSync('calls.txt','call\\n');return Response.json({items:[]});};`);
  const run=()=>spawnSync(process.execPath,['--import',join(dir,'mock.mjs'),script,'--collect'],{cwd:dir,encoding:'utf8',env:{...process.env,NODE_ENV:'test',SCRAPEBADGER_API_KEY:'fake'}});
  assert.notEqual(run().status,0);assert.notEqual(run().status,0);assert.equal((await readFile(join(dir,'calls.txt'),'utf8')).trim().split('\n').length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
