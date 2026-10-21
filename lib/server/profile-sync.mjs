export const MAX_BODY=1024*1024;
const row=data=>data?{backup:data.backup,revision:data.revision,updatedAt:data.updated_at}:null;
export async function readProfile(supabase){
 const {data,error}=await supabase.from('user_profiles').select('backup, revision, updated_at').maybeSingle();
 if(error)throw new Error('Profile could not be read.');
 return row(data);
}
/**
 * Validates and saves a profile. Returns {status:200,revision} on success or {status:409,profile} when another
 * device saved first; the caller then adopts `profile` instead of overwriting it.
 */
export async function saveProfile(supabase,{backup,expectedRevision},parseBackup){
 if(!Number.isInteger(expectedRevision)||expectedRevision<0||expectedRevision>1e9)return {status:400,error:'Invalid revision.'};
 let valid;try{valid=parseBackup(backup);}catch(error){return {status:400,error:error instanceof Error?error.message:'Invalid profile.'};}
 const {data,error}=await supabase.rpc('save_profile',{expected_revision:expectedRevision,new_backup:valid});
 if(error)return {status:error.code==='42501'?403:502,error:error.code==='42501'?'Not available for this account.':'Profile could not be saved.'};
 if(data===null||data===undefined)return {status:409,profile:await readProfile(supabase)};
 return {status:200,revision:data};
}
export async function readBody(request,limit=MAX_BODY){
 const length=Number(request.headers.get('content-length')??0);
 if(length>limit)throw new Error('Request too large.');
 const reader=request.body?.getReader();if(!reader)throw new Error('Missing request body.');
 const chunks=[];let size=0;
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new Error('Request too large.');}chunks.push(value);}
 return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
}
