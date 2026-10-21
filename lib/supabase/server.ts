import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
import {supabaseConfig} from '@/lib/server/auth-policy.mjs';

/** Per-request Supabase client bound to the caller's cookies. Returns null when Supabase isn't configured. */
export async function createSupabase(){
 const config=supabaseConfig();if(!config)return null;
 const store=await cookies();
 return createServerClient(config.url,config.key,{cookies:{
  getAll:()=>store.getAll(),
  // Server Components cannot set cookies; the proxy refreshes the session, so that failure is expected and safe to ignore.
  setAll:list=>{try{for(const {name,value,options} of list)store.set(name,value,options);}catch{}}
 }});
}
export type SupabaseServer=NonNullable<Awaited<ReturnType<typeof createSupabase>>>;
