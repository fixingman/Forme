import {NextResponse} from 'next/server';
import {createSupabase} from '@/lib/supabase/server';
import {originOf,safeNext,sameOrigin} from '@/lib/server/auth-policy.mjs';

const noStore={'Cache-Control':'no-store'};
export const origin=(request:Request)=>originOf(request.headers,request.url);
/** 303 so a POST becomes a GET on the destination. */
export const go=(request:Request,path:string)=>NextResponse.redirect(new URL(path,origin(request)),{status:303,headers:noStore});
export const toLogin=(request:Request,params:Record<string,string>)=>go(request,`/login?${new URLSearchParams(params)}`);
export const callbackUrl=(request:Request,next:string)=>`${origin(request)}/auth/callback?next=${encodeURIComponent(safeNext(next))}`;
export async function supabaseOrLogin(request:Request){
 const supabase=await createSupabase();
 return supabase?{supabase}:{response:toLogin(request,{error:'unavailable'})};
}
export const sameSite=(request:Request)=>sameOrigin(request.headers);
