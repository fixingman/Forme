// Pure auth decisions, kept free of Next and Supabase so they can be tested exhaustively.
const loopback=/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i;
export const supabaseConfig=(env=process.env)=>{
 const url=env.NEXT_PUBLIC_SUPABASE_URL,key=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)return null;
 try{if(new URL(url).protocol!=='https:'&&!loopback.test(new URL(url).host))return null;}catch{return null;}
 return {url,key};
};
/**
 * Sign-in is required whenever Supabase is configured, except for a plain local run on this computer
 * (loopback host, not a hosted platform, and FORME_REQUIRE_AUTH not set). Hosted platforms and any
 * non-loopback host always require it, so forgetting a setting cannot expose a deployment.
 */
export function authRequired(host,env=process.env){
 if(!supabaseConfig(env))return false;
 if(env.FORME_REQUIRE_AUTH==='1'||env.VERCEL||env.NETLIFY||env.RAILWAY_ENVIRONMENT||env.RENDER||env.FLY_APP_NAME)return true;
 return !loopback.test(host??'');
}
/** Where to send the user after sign-in. Only same-site paths are accepted; everything else falls back to Home. */
export function safeNext(value){
 if(typeof value!=='string'||value.length>300||!value.startsWith('/')||value.startsWith('//')||value.includes('\\'))return '/';
 if(/[\u0000-\u001f]/.test(value))return '/';
 if(/^\/(?:login|auth)(?:[/?#]|$)/.test(value))return '/';
 return value;
}
/** Form posts must come from this site. A missing Origin is accepted only for same-site navigations (Sec-Fetch-Site). */
export function sameOrigin(headers){
 const host=headers.get('host'),origin=headers.get('origin');
 if(origin){try{return new URL(origin).host===host;}catch{return false;}}
 const site=headers.get('sec-fetch-site');
 return site==='same-origin'||site==='none';
}
export const normalizeEmail=value=>typeof value==='string'?value.normalize('NFKC').trim().toLowerCase():'';
export const validEmail=value=>value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
/**
 * Turns verified token claims plus the caller's invite row into an access decision.
 * `invite` is read with the user's own session (RLS), never trusted from the browser.
 */
export function accessFor(claims,invite){
 const email=normalizeEmail(claims?.email);
 if(!claims||typeof claims.sub!=='string'||!claims.sub||!email)return {state:'anonymous'};
 if(!invite||normalizeEmail(invite.email)!==email||!['owner','member'].includes(invite.role))return {state:'uninvited',userId:claims.sub,email};
 return {state:'allowed',userId:claims.sub,email,role:invite.role,owner:invite.role==='owner'};
}
export const loginError=code=>({'not-invited':'That account isn’t on the invite list.','link':'That sign-in link is invalid or has expired. Request a new one.','unavailable':'Sign-in isn’t available right now. Try again shortly.','origin':'That request didn’t come from this site.','provider':'Google sign-in didn’t complete. Try again.'})[code]??null;
/**
 * The site's own origin as the visitor sees it. Taken from Host (not request.url, which can name a different
 * loopback alias in dev) so the session cookie's host always matches where sign-in sends the browser.
 */
export function originOf(headers,fallbackUrl){
 const host=headers.get('host'),proto=headers.get('x-forwarded-proto')?.split(',')[0].trim();
 const fallback=new URL(fallbackUrl);
 if(!host||!/^[A-Za-z0-9.\-]+(?::\d{1,5})?$|^\[[0-9a-f:]+\](?::\d{1,5})?$/i.test(host))return fallback.origin;
 return `${proto==='http'||proto==='https'?proto:fallback.protocol.replace(':','')}://${host}`;
}
