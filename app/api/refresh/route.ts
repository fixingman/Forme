import {refreshControl} from '@/lib/server/refresh-control.mjs';
import {drainQueue} from '@/lib/server/job-worker.mjs';
import {localAccess} from '@/lib/server/local-access';
import {parseBackup} from '@/lib/settings-backup';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function GET(request:Request){
 if(!localAccess(request))return Response.json({error:'Refresh is available only on this computer.'},{status:403,headers});
 const control=refreshControl();try{return Response.json(await control.status(),{headers});}finally{control.close();}
}
export async function POST(request:Request){
 if(!localAccess(request)||request.headers.get('content-type')!=='application/json')return Response.json({error:'Local JSON requests only.'},{status:403,headers});
 const control=refreshControl();
 try{
  const reader=request.body?.getReader();if(!reader)throw new Error('Missing request');let length=0;const chunks:Uint8Array[]=[];
  while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>2*1024*1024){await reader.cancel();throw new Error('Request exceeds 2 MB.');}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const raw=JSON.parse(new TextDecoder().decode(bytes));
  if(raw.action==='budget'){control.setBudget(raw.dailyCap);return Response.json(await control.status(),{headers});}
  if(!['plan','run'].includes(raw.action))throw new Error('Unknown refresh action.');
  const {settings}=parseBackup(raw.profile);
  if(raw.action==='plan')return Response.json(await control.plan(settings,{scope:raw.scope,limit:raw.limit}),{headers});
  if(typeof raw.id!=='string'||raw.id.length>100)throw new Error('Invalid plan ID.');
  const queued=await control.enqueue(raw.id,settings);
  if(queued.status==='queued')void drainQueue();
  return Response.json(queued,{status:queued.status==='queued'?202:200,headers});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Refresh failed.'},{status:400,headers});}
 finally{control.close();}
}
