import {timingSafeEqual} from 'node:crypto';
import {healthReport} from '@/lib/server/health.mjs';
import {localAccess} from '@/lib/server/local-access';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
// Allowed from this computer, or from a monitor presenting HEALTH_TOKEN (set it only in a secrets manager).
function authorised(request:Request){
 if(localAccess(request))return true;
 const token=process.env.HEALTH_TOKEN,given=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
 if(!token||token.length<16||given.length!==token.length)return false;
 return timingSafeEqual(Buffer.from(given),Buffer.from(token));
}
export async function GET(request:Request){
 if(!authorised(request))return Response.json({error:'Not available.'},{status:403,headers});
 const report=healthReport();
 return Response.json(report,{status:report.status==='down'?503:200,headers});
}
