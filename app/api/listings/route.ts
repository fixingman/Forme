import {trustedSnapshot} from '@/lib/domain/data-trust.mjs';
import {openStore} from '@/lib/server/store.mjs';
import {localAccess} from '@/lib/server/local-access';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 if(!localAccess(request))return Response.json({error:'Local database unavailable'},{status:403});
 const store=openStore();try{const snapshot=store.snapshot();return Response.json(snapshot?trustedSnapshot(snapshot):{error:'Import a snapshot first'},{status:snapshot?200:404,headers:{'Cache-Control':'no-store'}});}finally{store.close();}
}
