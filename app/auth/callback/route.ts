import {exchangeCode} from '@/lib/server/auth-flow.mjs';
import {safeNext} from '@/lib/server/auth-policy.mjs';
import {go,supabaseOrLogin,toLogin} from '@/lib/server/auth-routes';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Landing point for Google and for magic links opened in the browser that requested them (PKCE code).
export async function GET(request:Request){
 const params=new URL(request.url).searchParams;
 if(params.get('error')||params.get('error_description'))return toLogin(request,{error:'provider'});
 const {supabase,response}=await supabaseOrLogin(request);if(!supabase)return response;
 const result=await exchangeCode(supabase,params.get('code'));
 return result.ok?go(request,safeNext(params.get('next'))):toLogin(request,{error:result.error??'link'});
}
