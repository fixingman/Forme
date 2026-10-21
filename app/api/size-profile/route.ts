import {normalizeGender} from '@/lib/gender.mjs';
import {readFile} from 'node:fs/promises';
import {normalizeSizing} from '@/lib/sizes.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Local single-user pilot only; no personal profile is served by a Vercel deployment.
export async function GET(){
 if(process.env.VERCEL)return Response.json({profile:null},{headers:{'Cache-Control':'no-store'}});
 try{
  const raw=JSON.parse(await readFile(`${process.cwd()}/.forme-data/size-profile.json`,'utf8'));
  if(typeof raw.id!=='string'||raw.id.length>100)return Response.json({profile:null});
  return Response.json({genderProfile:typeof raw.genderProfile?.id==='string'?{id:raw.genderProfile.id,preference:normalizeGender(raw.genderProfile.preference)}:null,profile:{id:raw.id,sizing:normalizeSizing(raw.sizing)}},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({profile:null},{headers:{'Cache-Control':'no-store'}});}
}
