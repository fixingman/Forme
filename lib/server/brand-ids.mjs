import {mkdirSync} from 'node:fs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {brandKey} from '../domain/brands.mjs';
/**
 * Brand IDs the provider resolved for this computer, kept beside the other local collection data. They sit alongside the
 * hand-verified references in data/vinted-brands.json and never replace them. `checked` remembers brands that were looked up
 * without a single clear match, so they are not paid for again.
 */
const empty=()=>({version:1,matched:[],checked:[]});
const valid=row=>row&&typeof row.name==='string'&&row.name.length<=100;
/** A provider ID is a positive whole number, written either as a number or as digits. */
const validId=value=>(typeof value==='number'||(typeof value==='string'&&/^\d{1,15}$/.test(value)))&&Number.isSafeInteger(Number(value))&&Number(value)>0;
export async function readBrandIds(root=process.cwd()){
 try{
  const data=JSON.parse(await readFile(join(root,'.forme-data','brand-ids.json'),'utf8'));
  return {version:1,
   matched:(Array.isArray(data.matched)?data.matched:[]).filter(row=>valid(row)&&validId(row.id)).map(row=>({name:row.name,id:String(row.id),title:String(row.title??row.name).slice(0,100),itemCount:Number.isFinite(row.itemCount)?row.itemCount:0,source:'provider brand lookup',verifiedAt:String(row.verifiedAt??'').slice(0,40)})),
   checked:(Array.isArray(data.checked)?data.checked:[]).filter(valid).map(row=>({name:row.name,status:row.status==='ambiguous'?'ambiguous':'none',at:String(row.at??'').slice(0,40),candidates:Array.isArray(row.candidates)?row.candidates.slice(0,5):[]}))};
 }catch(error){if(error.code==='ENOENT')return empty();throw error;}
}
/** Records one lookup outcome. Re-running a brand replaces its earlier entry rather than adding a second. */
export async function recordBrandLookup(root,name,outcome,at){
 const dir=join(root,'.forme-data');mkdirSync(dir,{recursive:true,mode:0o700});
 const data=await readBrandIds(root),key=brandKey(name);
 data.matched=data.matched.filter(row=>brandKey(row.name)!==key);data.checked=data.checked.filter(row=>brandKey(row.name)!==key);
 if(outcome.status==='matched')data.matched.push({name,id:outcome.id,title:outcome.title,itemCount:outcome.itemCount,source:'provider brand lookup',verifiedAt:at.slice(0,10)});
 else data.checked.push({name,status:outcome.status,at:at.slice(0,10),candidates:outcome.candidates});
 const path=join(dir,'brand-ids.json');await writeFile(`${path}.tmp`,JSON.stringify(data,null,2)+'\n',{mode:0o600});await rename(`${path}.tmp`,path);
 return data;
}
