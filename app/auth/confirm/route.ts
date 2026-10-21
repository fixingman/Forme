import {confirmToken} from '@/lib/server/auth-flow.mjs';
import {safeNext} from '@/lib/server/auth-policy.mjs';
import {go,supabaseOrLogin,toLogin} from '@/lib/server/auth-routes';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Magic links that work from any device (token hash, no browser-bound code). Needs the email template in docs/accounts-setup.md.
export async function GET(request:Request){
 const params=new URL(request.url).searchParams;
 const {supabase,response}=await supabaseOrLogin(request);if(!supabase)return response;
 const result=await confirmToken(supabase,params.get('token_hash'),params.get('type'));
 return result.ok?go(request,safeNext(params.get('next'))):toLogin(request,{error:result.error??'link'});
}
