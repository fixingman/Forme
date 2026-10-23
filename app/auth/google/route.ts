import {NextResponse} from 'next/server';
import {googleUrl} from '@/lib/server/auth-flow.mjs';
import {googleEnabled,safeNext} from '@/lib/server/auth-policy.mjs';
import {callbackUrl,supabaseOrLogin,toLogin} from '@/lib/server/auth-routes';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 if(!googleEnabled())return toLogin(request,{error:'unavailable'});
 const {supabase,response}=await supabaseOrLogin(request);if(!supabase)return response;
 const next=safeNext(new URL(request.url).searchParams.get('next'));
 const url=await googleUrl(supabase,callbackUrl(request,next));
 return url?NextResponse.redirect(url,{status:303,headers:{'Cache-Control':'no-store'}}):toLogin(request,{error:'provider'});
}
