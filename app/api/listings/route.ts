import {trustedSnapshot} from '@/lib/domain/data-trust.mjs';
import {openStore} from '@/lib/server/store.mjs';
import {localAccess} from '@/lib/server/local-access';
import {guard} from '@/lib/server/session';
import {readPublishedSnapshot} from '@/lib/server/hosted-listings.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const headers={'Cache-Control':'no-store'};
 // Local computer: the SQLite store. Hosted: the snapshot the owner published to Postgres, readable only by invited accounts.
 if(!localAccess(request)){
  const access=await guard(request);if(!access.ok)return access.response;
  if(!access.supabase)return Response.json({error:'Local database unavailable'},{status:403});
  try{const snapshot=await readPublishedSnapshot(access.supabase);return snapshot?Response.json(trustedSnapshot(snapshot),{headers}):Response.json({error:'Nothing has been published yet.'},{status:404,headers});}
  catch{return Response.json({error:'Listings could not be read.'},{status:502,headers});}
 }
 const store=openStore();try{const snapshot=store.snapshot();return Response.json(snapshot?trustedSnapshot(snapshot):{error:'Import a snapshot first'},{status:snapshot?200:404,headers:{'Cache-Control':'no-store'}});}finally{store.close();}
}
