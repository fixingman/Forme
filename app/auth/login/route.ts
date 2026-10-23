import {sendLink} from '@/lib/server/auth-flow.mjs';
import {safeNext} from '@/lib/server/auth-policy.mjs';
import {callbackUrl,sameSite,supabaseOrLogin,toLogin} from '@/lib/server/auth-routes';
import {log} from '@/lib/server/log.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Always answers the same way, so the form never reveals which addresses are invited.
export async function POST(request:Request){
 if(!sameSite(request))return toLogin(request,{error:'origin'});
 const form=await request.formData().catch(()=>null);
 const email=form?.get('email'),next=safeNext(form?.get('next'));
 const {supabase,response}=await supabaseOrLogin(request);if(!supabase)return response;
 const sent=await sendLink(supabase,typeof email==='string'?email:'',callbackUrl(request,next));
 // The visitor always sees the same message; the operator gets the real reason (never the address).
 if(!sent.ok)log('error','auth.link_not_sent',{reason:sent.reason,status:sent.status??null,code:sent.code??null});
 return toLogin(request,{sent:'1',next});
}
