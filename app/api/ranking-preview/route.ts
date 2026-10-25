import {guardCollection} from '@/lib/server/session';
import {parseBackup} from '@/lib/settings-backup';
import {rankingPreview,PreviewError} from '@/lib/server/ranking-preview.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
const failed=(error:unknown)=>Response.json({error:error instanceof PreviewError?error.message:'The comparison could not be prepared. Please try a new comparison.'},{status:error instanceof PreviewError?error.status:500,headers});
export async function GET(request:Request){
 const denied=await guardCollection(request);if(denied)return denied;
 try{const query=new URL(request.url).searchParams,preview=rankingPreview(),id=query.get('id');return Response.json(id?preview.get(id,{blind:query.get('blind')==='1',reveal:query.get('reveal')==='1'}):preview.status(),{headers});}catch(error){return failed(error);}
}
export async function POST(request:Request){
 const denied=await guardCollection(request);if(denied)return denied;
 // Next's internal request URL may use a different hostname; localAccess has verified the actual Host.
 const origin=`${new URL(request.url).protocol}//${request.headers.get('host')}`;
 if(request.headers.get('origin')!==origin||!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')??''))return Response.json({error:'Same-origin JSON required.'},{status:403,headers});
 try{
  const reader=request.body?.getReader();if(!reader)throw new PreviewError('Missing comparison request');const chunks:Uint8Array[]=[];let length=0;
  while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>2*1024*1024){await reader.cancel();throw new PreviewError('Comparison request is too large',413);}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const value of chunks){bytes.set(value,offset);offset+=value.length;}
  let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new PreviewError('Invalid comparison request');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw new PreviewError('Invalid comparison request');
  const preview=rankingPreview();
  if(body.action==='create'){let profile;try{profile=parseBackup(body.profile);}catch{throw new PreviewError('Invalid preferences. Reload the page before trying again.');}return Response.json(await preview.create(profile),{headers});}
  if(body.action==='vote')return Response.json(preview.vote({id:body.id,key:body.key,choice:body.choice,baseRevision:body.baseRevision}),{headers});
  throw new PreviewError('Unknown comparison action');
 }catch(error){return failed(error);}
}
