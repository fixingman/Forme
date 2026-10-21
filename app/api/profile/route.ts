import {authRequired,supabaseConfig} from '@/lib/server/auth-policy.mjs';
import {currentAccess} from '@/lib/server/session';
import {readBody,readProfile,saveProfile} from '@/lib/server/profile-sync.mjs';
import {sameSite} from '@/lib/server/auth-routes';
import {parseBackup} from '@/lib/settings-backup';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
// Preferences and saved items for the signed-in, invited user. `sync` tells the browser whether to use it at all.
async function context(request:Request){
 if(!supabaseConfig())return {early:json({sync:'disabled'})};
 const {access,supabase}=await currentAccess();
 if(!supabase||access.state==='anonymous')return {early:authRequired(request.headers.get('host'))?json({error:'Sign in required.'},401):json({sync:'signed-out'})};
 if(access.state!=='allowed')return {early:json({error:'Not available for this account.'},403)};
 return {supabase,access};
}
export async function GET(request:Request){
 const ctx=await context(request);if('early' in ctx)return ctx.early;
 try{return json({sync:'ready',user:{email:ctx.access.email,role:ctx.access.role},profile:await readProfile(ctx.supabase)});}
 catch(error){return json({error:(error as Error).message},502);}
}
export async function PUT(request:Request){
 if(!sameSite(request)||!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Same-site JSON requests only.'},403);
 const ctx=await context(request);if('early' in ctx)return ctx.early;
 let body;try{body=await readBody(request);}catch(error){return json({error:(error as Error).message},400);}
 const result=await saveProfile(ctx.supabase,{backup:body?.backup,expectedRevision:body?.expectedRevision},parseBackup);
 if(result.status===200)return json({revision:result.revision});
 if(result.status===409)return json({error:'conflict',profile:result.profile},409);
 return json({error:result.error},result.status);
}
