import {accessFor,normalizeEmail,validEmail} from './auth-policy.mjs';

/** Reads verified claims and the caller's own invite row (RLS only returns their row), then decides. */
export async function resolveAccess(supabase){
 const {data,error}=await supabase.auth.getClaims();
 const claims=error?null:data?.claims??null;
 const email=normalizeEmail(claims?.email);
 if(!claims||!email)return accessFor(null,null);
 const {data:invite}=await supabase.from('allowed_users').select('email, role').eq('email',email).maybeSingle();
 return accessFor(claims,invite);
}
/** Run after any sign-in (code or token hash). An uninvited account is signed straight back out. */
export async function finishSignIn(supabase){
 const access=await resolveAccess(supabase);
 if(access.state==='allowed')return {ok:true,access};
 await supabase.auth.signOut();
 return {ok:false,error:access.state==='uninvited'?'not-invited':'link'};
}
export async function exchangeCode(supabase,code){
 if(typeof code!=='string'||!code||code.length>2000)return {ok:false,error:'link'};
 const {error}=await supabase.auth.exchangeCodeForSession(code);
 return error?{ok:false,error:'link'}:finishSignIn(supabase);
}
export async function confirmToken(supabase,tokenHash,type){
 if(typeof tokenHash!=='string'||!tokenHash||tokenHash.length>2000||type!=='email')return {ok:false,error:'link'};
 const {error}=await supabase.auth.verifyOtp({token_hash:tokenHash,type:'email'});
 return error?{ok:false,error:'link'}:finishSignIn(supabase);
}
/**
 * Asks Supabase to email a sign-in link. Unknown addresses are never created (shouldCreateUser:false).
 * The caller shows the same message whatever happens here, so the form reveals nothing about who is invited.
 */
export async function sendLink(supabase,rawEmail,redirectTo){
 const email=normalizeEmail(rawEmail);
 if(!validEmail(email))return {ok:false,reason:'invalid'};
 const {error}=await supabase.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:redirectTo}});
 return error?{ok:false,reason:'provider'}:{ok:true};
}
export async function googleUrl(supabase,redirectTo){
 const {data,error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo,skipBrowserRedirect:true}});
 return error||!data?.url?null:data.url;
}
