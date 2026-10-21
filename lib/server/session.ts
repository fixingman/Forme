import {cache} from 'react';
import {createSupabase,type SupabaseServer} from '@/lib/supabase/server';
import {authRequired,supabaseConfig} from '@/lib/server/auth-policy.mjs';
import {resolveAccess} from '@/lib/server/auth-flow.mjs';
import {localAccess} from '@/lib/server/local-access';

export type Access={state:'anonymous'}|{state:'uninvited';userId:string;email:string}|{state:'allowed';userId:string;email:string;role:'owner'|'member';owner:boolean};
/** Memoised for one render so layouts and pages don't repeat the lookup. */
export const currentAccess=cache(async():Promise<{access:Access;supabase:SupabaseServer|null}>=>{
 const supabase=await createSupabase();
 return {access:(supabase?await resolveAccess(supabase):{state:'anonymous'}) as Access,supabase};
});
const json=(body:unknown,status:number)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

export type Guard={ok:true;supabase:SupabaseServer;access:Extract<Access,{state:'allowed'}>}|{ok:true;supabase:null;access:null}|{ok:false;response:Response};
/**
 * The check that sits next to the data. Proxy only does a cheap cookie check; this verifies the token and the invite.
 * - Auth not required here (plain local run): passes with no user, so existing local behaviour is unchanged.
 * - Otherwise: 401 when signed out, 403 when not invited (or not an owner when `owner` is set).
 */
export async function guard(request:Request,{owner=false}:{owner?:boolean}={}):Promise<Guard>{
 if(!authRequired(request.headers.get('host')))return {ok:true,supabase:null,access:null};
 const {access,supabase}=await currentAccess();
 if(!supabase||access.state==='anonymous')return {ok:false,response:json({error:'Sign in required.'},401)};
 if(access.state!=='allowed'||(owner&&!access.owner))return {ok:false,response:json({error:'Not available for this account.'},403)};
 return {ok:true,supabase,access};
}
/** Local collection tools: this computer, and when sign-in is enforced, the owner as well. */
export async function guardCollection(request:Request):Promise<Response|null>{
 if(!localAccess(request))return json({error:'Collection runs only on the owner’s computer.'},403);
 const result=await guard(request,{owner:true});
 return result.ok?null:result.response;
}
export const authAvailable=()=>!!supabaseConfig();
