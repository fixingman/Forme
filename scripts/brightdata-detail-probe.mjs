import {readFile,writeFile} from 'node:fs/promises';
process.loadEnvFile('.env.local');
const prior=JSON.parse(await readFile('docs/benchmarks/scrapebadger-probe.json','utf8'));
const urls=prior.requests.map(r=>r.sample?.[0]?.url).filter(Boolean).slice(0,3);
if(urls.length!==3||!urls.every(url=>/^https:\/\/www\.vinted\.se\/items\/\d+/.test(url)))throw new Error('Expected three observed Swedish listing URLs');
const output='docs/benchmarks/brightdata-details.json';
try{await readFile(output);throw new Error('Existing result preserved; refusing to start another billed job.');}catch(error){if(error.code!=='ENOENT')throw error;}
const report={provider:'brightdata',startedAt:new Date().toISOString(),kind:'detail lookup, not search',inputs:urls,requests:[]};
const headers={Authorization:`Bearer ${process.env.BRIGHTDATA_API_KEY}`,'Content-Type':'application/json'};
async function request(url,options={}){
 const start=performance.now();const r=await fetch(url,{...options,headers,redirect:'error',signal:AbortSignal.timeout(65000)});let body;try{body=await r.json();}catch{body=null;}
 report.requests.push({status:r.status,elapsedMs:Math.round(performance.now()-start),creditsUsed:r.headers.get('x-credits-used')});await writeFile(output,JSON.stringify(report,null,2));
 if(!r.ok)throw new Error(`Provider HTTP ${r.status}; no retry performed`);return body;
}
try{
 // Persist submission intent first; a timeout must not lead to duplicate billed work.
 await writeFile(output,JSON.stringify({...report,state:'submission-started'},null,2),{flag:'wx'});
 let body=await request('https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_mk25b4rw17kwn6eb9p&format=json&include_errors=true',{method:'POST',body:JSON.stringify({input:urls.map(url=>({url}))})});
 if(body?.snapshot_id){report.snapshotId=body.snapshot_id;await writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify({state:'pending',snapshotId:body.snapshot_id}));}
 if(Array.isArray(body)){
  report.results=body.map(item=>Object.fromEntries(['url','sku','name','brand','currency','price','availability','condition','size','image_urls','error','error_code'].filter(key=>key in item).map(key=>[key,item[key]])));
  report.fieldNames=body.map(Object.keys);report.state='completed';
 }else report.state=body?.snapshot_id?'pending':'unexpected-response';
}catch(error){report.state='failed-or-uncertain';report.error=error.message;}
await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
