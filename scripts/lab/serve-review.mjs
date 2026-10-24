// Loopback-only evaluation form. All writes are confined to ignored lab judgments, never the app profile.
import {createServer} from 'node:http';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {feedbackState} from './recommendation-data.mjs';

export async function startReviewServer({directory=resolve('.context/recommendation-lab'),port=3210}={}){
 directory=resolve(directory);if(!directory.startsWith(resolve('.context')+sep))throw new Error('Review data must stay in ignored .context/.');
 if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Invalid review port');
 const manifest=JSON.parse(await readFile(join(directory,'review-manifest.json'),'utf8')),keys=new Set(manifest.keys);
 const html=await readFile(join(directory,'review.html'));
 let revision=0,events=[];
 try{const stored=JSON.parse(await readFile(join(directory,'judgments.json'),'utf8'));if(stored.catalogHash!==manifest.catalogHash)throw new Error('Existing review belongs to another catalog; use a new lab directory.');events=stored.events;revision=stored.revision??0;feedbackState(events);}catch(error){if(error.code!=='ENOENT')throw error;}
 let writing=false;
 const server=createServer(async(request,response)=>{
  const address=server.address(),host=`127.0.0.1:${address.port}`,origin=`http://${host}`;
  response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','no-referrer');
  const send=(status,value)=>{response.writeHead(status,{'Content-Type':'application/json'});response.end(JSON.stringify(value));};
  if(request.headers.host!==host)return send(403,{error:'Loopback host required.'});
  if(request.url==='/'&&request.method==='GET'){
   response.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https://*.vinted.net; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
   response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end(html);return;
  }
  if(request.url!=='/api/judgments')return send(404,{error:'Not found.'});
  if(request.method==='GET')return send(200,{app:'forme-recommendation-review',version:1,catalogHash:manifest.catalogHash,revision,events});
  if(request.method!=='POST')return send(405,{error:'Method not allowed.'});
  if(request.headers.origin!==origin||!/^application\/json(?:;|$)/i.test(request.headers['content-type']??''))return send(403,{error:'Same-origin JSON required.'});
  try{
   let bytes=0;const chunks=[];
   for await(const chunk of request){bytes+=chunk.length;if(bytes>65536)return send(413,{error:'Review is too large.'});chunks.push(chunk);}
   const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(body.app!=='forme-recommendation-review'||body.version!==1||body.catalogHash!==manifest.catalogHash||!Array.isArray(body.events)||body.events.length>1000||body.events.some(event=>!event||!keys.has(event.key)))return send(400,{error:'Invalid evaluation choices.'});
   feedbackState(body.events);
   if(writing||body.baseRevision!==revision)return send(409,{error:'Review changed in another tab. Download your choices to preserve them.'});
   writing=true;
   try{
    const next={app:body.app,version:1,catalogHash:manifest.catalogHash,revision:revision+1,events:body.events.map(({key,action})=>({key,action}))};
    const path=join(directory,'judgments.json');await writeFile(`${path}.tmp`,JSON.stringify(next,null,2)+'\n',{mode:0o600});await rename(`${path}.tmp`,path);
    events=next.events;revision=next.revision;send(200,{revision});
   }finally{writing=false;}
  }catch{if(!response.headersSent)send(400,{error:'Invalid review. Your previous choices were preserved.'});}
 });
 server.requestTimeout=10000;
 await new Promise((accept,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',accept);});
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);if(args.length>2)throw new Error('Use: node scripts/lab/serve-review.mjs [directory] [port]');
 const server=await startReviewServer({directory:args[0]??'.context/recommendation-lab',port:args[1]===undefined?3210:Number(args[1])});
 console.log(`Private taste review: http://127.0.0.1:${server.address().port}`);
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
