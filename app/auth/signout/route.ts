import {createSupabase} from '@/lib/supabase/server';
import {go,sameSite} from '@/lib/server/auth-routes';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 if(!sameSite(request))return go(request,'/login?error=origin');
 const supabase=await createSupabase();if(supabase)await supabase.auth.signOut();
 return go(request,'/login');
}
