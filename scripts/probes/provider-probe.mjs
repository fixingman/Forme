// Explicit, bounded trial: no scheduler, retries, or automatic provider fallback.
import {writeFile, mkdir, access} from 'node:fs/promises';
const provider=process.argv[2];
if(!['scrapebadger','brightdata-metadata'].includes(provider))throw new Error('Choose scrapebadger or brightdata-metadata');
process.loadEnvFile('.env.local');
const output=`docs/benchmarks/${provider}-probe.json`;
try{await access(output);throw new Error('Existing result preserved; refusing to repeat trial calls.');}catch(error){if(error.code!=='ENOENT')throw error;}
const report={provider,startedAt:new Date().toISOString(),requests:[]};
const queries=['Our Legacy','Acne Studios','leather jacket'];
const jobs=provider==='scrapebadger'?queries.map(query=>({query,url:`https://scrapebadger.com/v1/vinted/search?${new URLSearchParams({query,market:'se',per_page:'10',page:'1'})}`})):[{query:'catalog metadata only',url:'https://api.brightdata.com/datasets/list'}];
for(const job of jobs){
 const start=performance.now();
 try{
 const response=await fetch(job.url,{headers:provider==='scrapebadger'?{'X-API-Key':process.env.SCRAPEBADGER_API_KEY}:{Authorization:`Bearer ${process.env.BRIGHTDATA_API_KEY}`},signal:AbortSignal.timeout(45000),redirect:'error'});
 const raw=await response.text();let body;try{body=JSON.parse(raw);}catch{body={nonJson:true};}
 const entry={query:job.query,status:response.status,elapsedMs:Math.round(performance.now()-start),creditsUsed:response.headers.get('x-credits-used'),bodyKeys:typeof body==='object'&&body!==null?Object.keys(body).slice(0,20):[],error:response.ok?null:'Provider returned an error; response content omitted to avoid logging secrets.'};
 if(provider==='brightdata-metadata'){
  const values=Array.isArray(body)?body:body.datasets??body.data??[];
  entry.candidates=Array.isArray(values)?values.filter(x=>/vinted/i.test(JSON.stringify(x))):[];
 }else if(response.ok){
  const items=Array.isArray(body.items)?body.items:[];
  entry.count=items.length;entry.market=body.market;entry.pagination=body.pagination;
  entry.sample=items.slice(0,2).map(({id,title,display_title,brand_title,size_title,status,price,url,photo,photos,...rest})=>({id,title,display_title,brand_title,size_title,status,price,url,photoKeys:photo?Object.keys(photo):null,photosCount:photos?.length,otherFieldNames:Object.keys(rest)}));
  entry.itemKeys=items[0]?Object.keys(items[0]):[];
 }
 report.requests.push(entry);console.log(JSON.stringify(entry));
 if(!response.ok)break;
 }catch(error){report.requests.push({query:job.query,error:error.name,elapsedMs:Math.round(performance.now()-start)});console.log(JSON.stringify(report.requests.at(-1)));break;}
}
await mkdir('docs/benchmarks',{recursive:true});
await writeFile(output,JSON.stringify(report,null,2)+'\n');
