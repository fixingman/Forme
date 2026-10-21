import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const collector=resolve('scripts/refresh-listings.mjs');
async function setup(){
 const dir=await mkdtemp(join(tmpdir(),'forme-collector-'));await mkdir(join(dir,'public/data'),{recursive:true});
 await writeFile(join(dir,'settings.json'),JSON.stringify({app:'forme',version:1,settings:{following:['One','Two','Three'],excluded:[],searches:[]}}));
 await writeFile(join(dir,'mock.mjs'),`import {appendFileSync} from 'node:fs';let id=10000;globalThis.fetch=async(url)=>{appendFileSync('calls.txt','request\\n');const query=new URL(url).searchParams.get('query');id=10000+[...query].reduce((sum,c,index)=>sum+c.charCodeAt(0)*(index+1),0);if(query===process.env.FAIL_QUERY)return Response.json({error:'rate limit'},{status:429,headers:{'x-credits-used':'0','retry-after':'60'}});return Response.json({items:[{id:id,title:query+' shirt',brand_title:query,price:{amount:'100',currency_code:'SEK'},url:'https://www.vinted.se/items/'+id+'-shirt',photo:{url:'https://images1.vinted.net/test.webp'}}]},{headers:process.env.MISSING_CREDITS?{}:{'x-credits-used':'5'}});};`);
 return dir;
}
function run(dir,extra={},flags=[]){return spawnSync(process.execPath,['--import',join(dir,'mock.mjs'),collector,'--settings','settings.json',...flags],{cwd:dir,env:{...process.env,SCRAPEBADGER_API_KEY:'test-only',NODE_ENV:'test',...extra},encoding:'utf8'});}
test('collector caches results and enforces the daily cap before making further requests',async()=>{
 const dir=await setup();try{
 const first=run(dir);assert.equal(first.status,0,first.stderr);
 const path=join(dir,'public/data/vinted.json'),snapshot=JSON.parse(await readFile(path,'utf8'));
 assert.equal(snapshot.items.length,3);assert.equal(snapshot.collection.collectedQueries,3);
 assert.equal(run(dir).status,0);assert.equal((await readFile(join(dir,'calls.txt'),'utf8')).trim().split('\n').length,3);
 snapshot.fetchedAt='2020-01-01T00:00:00Z';const previous=JSON.stringify(snapshot);await writeFile(path,previous);
 const capped=run(dir);assert.notEqual(capped.status,0);assert.match(capped.stderr,/daily cap reached/);
 assert.equal(await readFile(path,'utf8'),previous);assert.equal((await readFile(join(dir,'calls.txt'),'utf8')).trim().split('\n').length,3);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('unknown billing stops the batch and preserves last-known data',async()=>{
 const dir=await setup();try{
 const path=join(dir,'public/data/vinted.json'),previous=JSON.stringify({items:[],fetchedAt:'2020-01-01T00:00:00Z'});await writeFile(path,previous);
 const failed=run(dir,{MISSING_CREDITS:'1'});assert.notEqual(failed.status,0);assert.match(failed.stderr,/missing credit charge/);
 assert.equal(await readFile(path,'utf8'),previous);assert.equal((await readFile(join(dir,'calls.txt'),'utf8')).trim().split('\n').length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('one-time completion collects only uncovered queries without raising the regular cap',async()=>{
 const dir=await setup();try{
 const settings=JSON.parse(await readFile(join(dir,'settings.json'),'utf8'));settings.settings.following.push('Four');await writeFile(join(dir,'settings.json'),JSON.stringify(settings));
 assert.equal(run(dir).status,0);const completed=run(dir,{},['--complete']);assert.equal(completed.status,0,completed.stderr);
 const snapshot=JSON.parse(await readFile(join(dir,'public/data/vinted.json'),'utf8'));assert.equal(snapshot.collection.collectedQueries,4);
 assert.equal((await readFile(join(dir,'calls.txt'),'utf8')).trim().split('\n').length,4);
 const usage=JSON.parse(await readFile(join(dir,'.forme-data/usage.json'),'utf8'))[new Date().toISOString().slice(0,10)];assert.equal(usage.reservedCredits,15);assert.equal(usage.oneTimeReservedCredits,5);
 assert.equal(run(dir,{},['--complete']).status,0);assert.equal((await readFile(join(dir,'calls.txt'),'utf8')).trim().split('\n').length,4);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('rate-limited completion resumes its existing reservation without repeating completed queries',async()=>{
 const dir=await setup();try{
 const settings=JSON.parse(await readFile(join(dir,'settings.json'),'utf8'));settings.settings.following.push('Four');await writeFile(join(dir,'settings.json'),JSON.stringify(settings));
 assert.equal(run(dir).status,0);const limited=run(dir,{FAIL_QUERY:'Four'},['--complete']);assert.notEqual(limited.status,0);assert.match(limited.stderr,/HTTP 429/);
 const before=JSON.parse(await readFile(join(dir,'public/data/vinted.json'),'utf8'));assert.equal(before.collection.collectedQueries,3);
 const resumed=run(dir,{},['--complete']);assert.equal(resumed.status,0,resumed.stderr);
 const allowances=Object.values(JSON.parse(await readFile(join(dir,'.forme-data/completion-allowances.json'),'utf8')));assert.equal(allowances[0].reservedCredits,5);assert.equal(allowances[0].usedCredits,5);
 const usage=JSON.parse(await readFile(join(dir,'.forme-data/usage.json'),'utf8'))[new Date().toISOString().slice(0,10)];assert.equal(usage.oneTimeReservedCredits,5);
 assert.equal(JSON.parse(await readFile(join(dir,'public/data/vinted.json'),'utf8')).collection.collectedQueries,4);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('successful checkpoints survive a later failure and resume skips their queries',async()=>{
 const dir=await setup();try{
 const first=run(dir,{FAIL_QUERY:'Three'},['--complete']);assert.notEqual(first.status,0);
 const path=join(dir,'public/data/vinted.json');assert.equal(JSON.parse(await readFile(path,'utf8')).collection.collectedQueries,2);
 const second=run(dir,{},['--complete']);assert.equal(second.status,0,second.stderr);
 const snapshot=JSON.parse(await readFile(path,'utf8'));assert.equal(snapshot.collection.collectedQueries,3);assert.equal(snapshot.items.length,3);
 assert.equal((await readFile(join(dir,'calls.txt'),'utf8')).trim().split('\n').length,4);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('unknown completion billing consumes its allowance and blocks another attempt',async()=>{
 const dir=await setup();try{
 const settings=JSON.parse(await readFile(join(dir,'settings.json'),'utf8'));settings.settings.following.push('Four');await writeFile(join(dir,'settings.json'),JSON.stringify(settings));assert.equal(run(dir).status,0);
 assert.notEqual(run(dir,{MISSING_CREDITS:'1'},['--complete']).status,0);
 const before=await readFile(join(dir,'calls.txt'),'utf8');const repeated=run(dir,{},['--complete']);assert.notEqual(repeated.status,0);assert.match(repeated.stderr,/allowance exhausted/);assert.equal(await readFile(join(dir,'calls.txt'),'utf8'),before);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('a single explicit recovery reserve can finish an uncertain request without removing regular limits',async()=>{
 const dir=await setup();try{
 const settings=JSON.parse(await readFile(join(dir,'settings.json'),'utf8'));settings.settings.following.push('Four');await writeFile(join(dir,'settings.json'),JSON.stringify(settings));assert.equal(run(dir).status,0);
 assert.notEqual(run(dir,{MISSING_CREDITS:'1'},['--complete']).status,0);
 const recovered=run(dir,{},['--complete','--retry-once']);assert.equal(recovered.status,0,recovered.stderr);
 const allowance=Object.values(JSON.parse(await readFile(join(dir,'.forme-data/completion-allowances.json'),'utf8')))[0];assert.equal(allowance.recoveryReservedCredits,5);assert.equal(allowance.reservedCredits,10);assert.equal(allowance.usedCredits,10);
 const usage=JSON.parse(await readFile(join(dir,'.forme-data/usage.json'),'utf8'))[new Date().toISOString().slice(0,10)];assert.equal(usage.reservedCredits,15);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('recovery reserves stop after ten extra credits even if failures continue',async()=>{
 const dir=await setup();try{
 const settings=JSON.parse(await readFile(join(dir,'settings.json'),'utf8'));settings.settings.following.push('Four');await writeFile(join(dir,'settings.json'),JSON.stringify(settings));assert.equal(run(dir).status,0);
 assert.notEqual(run(dir,{MISSING_CREDITS:'1'},['--complete']).status,0);
 for(let i=0;i<2;i++)assert.notEqual(run(dir,{MISSING_CREDITS:'1'},['--complete','--retry-once']).status,0);
 const before=await readFile(join(dir,'calls.txt'),'utf8');const blocked=run(dir,{},['--complete','--retry-once']);assert.notEqual(blocked.status,0);assert.match(blocked.stderr,/allowance exhausted/);assert.equal(await readFile(join(dir,'calls.txt'),'utf8'),before);
 const allowance=Object.values(JSON.parse(await readFile(join(dir,'.forme-data/completion-allowances.json'),'utf8')))[0];assert.equal(allowance.recoveryReservedCredits,10);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('ordinary followed-brand collection preserves the separately collected Discover batch',async()=>{
 const dir=await setup();try{
  await writeFile(join(dir,'public/data/vinted.json'),JSON.stringify({fetchedAt:'2020-01-01T00:00:00Z',discovery:{brands:['Auralee'],reportedCredits:5},items:[{id:900001,sourceKey:'vinted:900001',source:'vinted',title:'Auralee cotton shirt',brand:'Auralee',price:100,fetchedAt:'2020-01-01T00:00:00Z',matchedJobs:['discover:Auralee']}]}));
  const result=run(dir);assert.equal(result.status,0,result.stderr);const snapshot=JSON.parse(await readFile(join(dir,'public/data/vinted.json'),'utf8'));
  assert.equal(snapshot.items.length,4);assert.equal(snapshot.items.some(item=>item.sourceKey==='vinted:900001'),true);assert.deepEqual(snapshot.discovery.brands,['Auralee']);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('CLI collection respects the daily cap configured in refresh controls',async()=>{
 const dir=await setup();try{
  const {refreshControl}=await import('../lib/server/refresh-control.mjs');const control=refreshControl({root:dir});control.setBudget(5);control.close();
  const result=run(dir);assert.notEqual(result.status,0);assert.match(result.stderr,/Configured daily credit cap/);
  await assert.rejects(readFile(join(dir,'calls.txt'),'utf8'),{code:'ENOENT'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
