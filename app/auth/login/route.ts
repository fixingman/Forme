import {sendLink} from '@/lib/server/auth-flow.mjs';
import {safeNext} from '@/lib/server/auth-policy.mjs';
import {callbackUrl,sameSite,supabaseOrLogin,toLogin} from '@/lib/server/auth-routes';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Always answers the same way, so the form never reveals which addresses are invited.
export async function POST(request:Request){
 if(!sameSite(request))return toLogin(request,{error:'origin'});
 const form=await request.formData().catch(()=>null);
 const email=form?.get('email'),next=safeNext(form?.get('next'));
 const {supabase,response}=await supabaseOrLogin(request);if(!supabase)return response;
 await sendLink(supabase,typeof email==='string'?email:'',callbackUrl(request,next));
 return toLogin(request,{sent:'1',next});
}
