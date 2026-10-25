import {guard,currentAccess} from '@/lib/server/session';
import {localAccess} from '@/lib/server/local-access';
import {supabaseConfig,originOf} from '@/lib/server/auth-policy.mjs';
import {parseBackup} from '@/lib/settings-backup';
import {learningService} from '@/lib/server/learning.mjs';
import {localLearningStore,hostedLearningStore} from '@/lib/server/learning-store.mjs';
import {LearningError} from '@/lib/domain/learning.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
async function context(request:Request){
 const accessGuard=await guard(request,{owner:true});if(!accessGuard.ok)return {denied:accessGuard.response};
 const account=supabaseConfig()?await currentAccess():null;
 if(account?.access.state==='uninvited')return {denied:json({error:'Owner access required.'},403)};
 const allowed=account?.access.state==='allowed'?account.access:null;
 if(allowed&&!allowed.owner)return {denied:json({error:'Owner access required.'},403)};
 if(!allowed&&!localAccess(request))return {denied:json({error:'Sign in required.'},401)};
 const owner=allowed?.userId??'local',canTrain=localAccess(request);
 const repository=allowed&&account?.supabase?()=>hostedLearningStore(account.supabase!):()=>localLearningStore(process.cwd(),owner);
 return {service:learningService({owner,repository,canTrain,auto:process.env.FORME_LEARNING_AUTO!=='0'}),canTrain};
}
async function bodyOf(request:Request){
 if(request.headers.get('origin')!==originOf(request.headers,request.url)||!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')??''))throw new LearningError('Same-origin JSON required.',403);
 const reader=request.body?.getReader();if(!reader)throw new LearningError('Missing request.');const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3*1024*1024){await reader.cancel();throw new LearningError('Learning request is too large.',413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
 let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new LearningError('Invalid learning request.');}if(!data||typeof data!=='object'||Array.isArray(data))throw new LearningError('Invalid learning request.');return data;
}
const failure=(error:unknown)=>json({error:error instanceof LearningError?error.message:'Learning is unavailable. Your queued feedback stays on this device.'},error instanceof LearningError?error.status:500);
export async function GET(request:Request){try{const ctx=await context(request);if('denied'in ctx)return ctx.denied;const query=new URL(request.url).searchParams;return json(query.get('export')==='1'?await ctx.service.exportHistory():await ctx.service.status());}catch(error){return failure(error);}}
export async function POST(request:Request){try{
 const body=await bodyOf(request),ctx=await context(request);if('denied'in ctx)return ctx.denied;const service=ctx.service;
 if(body.action==='events')return json(await service.ingest(body.events));
 if(body.action==='exposure')return json(await service.exposure(body.exposure));
 if(body.action==='snapshot'){let profile;try{profile=parseBackup(body.profile);}catch{throw new LearningError('Invalid learning preferences.');}return json(await service.snapshot(profile,body.items,{channel:body.channel??'shopping',comparison:body.comparison===true}));}
 if(body.action==='train'){if(!ctx.canTrain)throw new LearningError('Training runs on the owner’s computer.',403);return json(await service.train());}
 if(body.action==='clear'){if(!ctx.canTrain)throw new LearningError('History deletion is managed on the owner’s computer.',403);return json(await service.clear(body.confirmation));}
 if(body.action==='select'){if(!ctx.canTrain)throw new LearningError('Model selection is managed on the owner’s computer.',403);return json(await service.select(body));}
 throw new LearningError('Unknown learning action.');
 }catch(error){return failure(error);}}
