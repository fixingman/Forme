import {openStore} from '@/lib/server/store.mjs';
import {localAccess} from '@/lib/server/local-access';
import {parseBackup} from '@/lib/settings-backup';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function GET(request:Request){
 if(!localAccess(request))return Response.json({error:'Local storage is available only on this computer.'},{status:403,headers});
 const store=openStore();try{return Response.json(store.profile(),{headers});}finally{store.close();}
}
export async function PUT(request:Request){
 if(!localAccess(request)||request.headers.get('content-type')!=='application/json')return Response.json({error:'Local JSON requests only.'},{status:403,headers});
 try{
  // Bound streamed input as well as declared Content-Length.
  const reader=request.body?.getReader();if(!reader)throw new Error('Missing profile');
  let length=0;const chunks:Uint8Array[]=[];while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>2*1024*1024){await reader.cancel();throw new Error('Profile exceeds 2 MB');}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const raw=JSON.parse(new TextDecoder().decode(bytes));
  if(!Number.isSafeInteger(raw.baseRevision)||raw.baseRevision<0)throw new Error('Invalid profile revision');
  const profile=parseBackup(raw.profile),store=openStore();try{const result=store.saveProfile(profile,raw.baseRevision);return Response.json(result,{status:result.conflict?409:200,headers});}finally{store.close();}
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Invalid profile'},{status:400,headers});}
}
