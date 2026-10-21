import {NextResponse,type NextRequest} from 'next/server';
import {createServerClient} from '@supabase/ssr';
import {authRequired,safeNext,supabaseConfig} from '@/lib/server/auth-policy.mjs';

// Optimistic gate only (per the Next.js auth guide): refresh the session cookie and bounce visitors with no valid token.
// Whether the account is *invited* is checked next to the data (lib/server/session.ts), never here.
const open=(path:string)=>path==='/login'||path.startsWith('/auth/')||path==='/api/health';
export async function proxy(request:NextRequest){
 const config=supabaseConfig();
 if(!config||!authRequired(request.headers.get('host')))return NextResponse.next();
 let response=NextResponse.next({request});
 const supabase=createServerClient(config.url,config.key,{cookies:{
  getAll:()=>request.cookies.getAll(),
  setAll:(list,headers)=>{
   for(const {name,value} of list)request.cookies.set(name,value);
   response=NextResponse.next({request});
   for(const {name,value,options} of list)response.cookies.set(name,value,options);
   for(const [key,value] of Object.entries(headers??{}))response.headers.set(key,value);
  }}});
 const {data}=await supabase.auth.getClaims();
 if(data?.claims||open(request.nextUrl.pathname))return response;
 if(request.nextUrl.pathname.startsWith('/api/'))return NextResponse.json({error:'Sign in required.'},{status:401,headers:{'Cache-Control':'no-store'}});
 const login=new URL('/login',request.url);
 login.searchParams.set('next',safeNext(request.nextUrl.pathname+request.nextUrl.search));
 return NextResponse.redirect(login);
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)']};
