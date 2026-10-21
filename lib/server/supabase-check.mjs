// Read-only checks of a Supabase project against what FORME expects. Uses only the public (publishable) key by
// default, so it proves what an outsider can and cannot do. Nothing is created, changed or sent to anyone.
const tables=['allowed_users','user_profiles','snapshot_meta','listings'];
const result=(name,status,detail)=>({name,status,detail});
async function call(fetchImpl,url,key,path,init={}){
 try{
  const response=await fetchImpl(new URL(path,url),{...init,headers:{apikey:key,Accept:'application/json',...(init.headers??{})},signal:AbortSignal.timeout(15000)});
  let body=null;try{body=await response.json();}catch{}
  return {status:response.status,body};
 }catch(error){return {status:0,body:null,error:error instanceof Error?error.message:String(error)};}
}
export async function checkSupabase({url,key,fetchImpl=fetch}){
 const out=[];
 let origin;try{origin=new URL(url);}catch{return [result('Project URL','fail','NEXT_PUBLIC_SUPABASE_URL is not a valid URL.')];}
 const settings=await call(fetchImpl,origin,key,'/auth/v1/settings');
 if(settings.status===0)return [result('Reach the project','fail',`Could not connect (${settings.error}). Check the URL.`)];
 if(settings.status===401||settings.status===403)return [result('Reach the project','fail','The project rejected the publishable key. Check NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.')];
 if(settings.status!==200||!settings.body)return [result('Reach the project','fail',`Unexpected answer from /auth/v1/settings (HTTP ${settings.status}).`)];
 out.push(result('Reach the project','pass','Project and publishable key accepted.'));
 const s=settings.body;
 out.push(s.disable_signup===true?result('Public sign-up is off','pass','Unknown emails cannot create accounts.'):result('Public sign-up is off','fail','Sign-ups are ENABLED. Turn off "Allow new users to sign up" (Authentication → Sign In / Providers), or anyone can create an account.'));
 out.push(s.external?.email===true?result('Email sign-in enabled','pass','Magic links are available.'):result('Email sign-in enabled','fail','The email provider is off, so emailed links cannot work.'));
 out.push(s.external?.google===true?result('Google sign-in','pass','Enabled.'):result('Google sign-in','warn','Not enabled. Optional; email links work without it.'));
 if(s.mailer_autoconfirm===true)out.push(result('Email confirmation','warn','Auto-confirm is on. With sign-up off this is harmless, but unconfirmed addresses would be accepted if sign-up were re-enabled.'));
 let missing=0;
 for(const table of tables){
  const response=await call(fetchImpl,origin,key,`/rest/v1/${table}?select=*&limit=1`);
  const code=response.body?.code;
  if(response.status===404||code==='PGRST205'){missing++;out.push(result(`Table ${table}`,'fail','Not found. Run supabase/migrations/20261022000000_private_beta.sql in the SQL editor.'));}
  else if(response.status===200&&Array.isArray(response.body)&&response.body.length>0)out.push(result(`Table ${table} is private`,'fail','A signed-out request READ rows. Row-level security or privileges are wrong. Do not use this project until fixed.'));
  else if(response.status===200)out.push(result(`Table ${table} is private`,'warn','Signed-out reads succeed but return nothing. Safe now, but the migration revokes anon access entirely; re-run it to match.'));
  else if(response.status===401||response.status===403||code==='42501')out.push(result(`Table ${table} is private`,'pass','Signed-out access is refused.'));
  else out.push(result(`Table ${table}`,'warn',`Unexpected answer (HTTP ${response.status}).`));
 }
 if(!missing){
  const rpc=await call(fetchImpl,origin,key,'/rest/v1/rpc/save_profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expected_revision:0,new_backup:{}})});
  if(rpc.status===404||rpc.body?.code==='PGRST202')out.push(result('Function save_profile','fail','Not found. Run the migration.'));
  else if(rpc.status===401||rpc.status===403||rpc.body?.code==='42501')out.push(result('Function save_profile is private','pass','Signed-out calls are refused.'));
  else if(rpc.status===200)out.push(result('Function save_profile is private','fail','A signed-out call succeeded. Do not use this project until fixed.'));
  else out.push(result('Function save_profile','warn',`Unexpected answer (HTTP ${rpc.status}).`));
 }
 return out;
}
/** Optional, read-only, owner-side: confirms the invite row and the auth user exist and match. Needs the service-role key. */
export async function checkOwnerSetup({url,serviceKey,fetchImpl=fetch}){
 const origin=new URL(url),out=[];
 const invites=await call(fetchImpl,origin,serviceKey,'/rest/v1/allowed_users?select=email,role',{headers:{Authorization:`Bearer ${serviceKey}`}});
 if(invites.status!==200||!Array.isArray(invites.body))return [result('Invite list','fail',`Could not read allowed_users (HTTP ${invites.status}). Is the service-role key correct and the migration applied?`)];
 const owners=invites.body.filter(row=>row.role==='owner');
 out.push(owners.length?result('Owner invited','pass',`${owners.length} owner row${owners.length===1?'':'s'}, ${invites.body.length} invite${invites.body.length===1?'':'s'} in total.`):result('Owner invited','fail',"No owner on the invite list. Run: insert into public.allowed_users (email, role) values ('you@example.com','owner');"));
 const bad=invites.body.filter(row=>row.email!==String(row.email).toLowerCase());
 if(bad.length)out.push(result('Invite emails lowercase','fail','Some invite emails are not lowercase.'));
 const users=await call(fetchImpl,origin,serviceKey,'/auth/v1/admin/users?per_page=50',{headers:{Authorization:`Bearer ${serviceKey}`}});
 if(users.status!==200||!Array.isArray(users.body?.users))out.push(result('Auth users','warn',`Could not list users (HTTP ${users.status}).`));
 else{
  const emails=new Set(users.body.users.map(user=>String(user.email??'').toLowerCase()));
  const invited=new Set(invites.body.map(row=>row.email));
  const missingUser=[...invited].filter(email=>!emails.has(email)),uninvitedUsers=[...emails].filter(email=>email&&!invited.has(email));
  out.push(missingUser.length?result('Invited accounts exist','warn',`${missingUser.length} invited address${missingUser.length===1?' has':'es have'} no Supabase user yet (create it under Authentication → Users; sign-up is off).`):result('Invited accounts exist','pass','Every invited address has a Supabase user.'));
  out.push(uninvitedUsers.length?result('No uninvited accounts','warn',`${uninvitedUsers.length} Supabase user${uninvitedUsers.length===1?' is':'s are'} not on the invite list. They can sign in but see nothing; delete them if unexpected.`):result('No uninvited accounts','pass','All Supabase users are invited.'));
 }
 return out;
}
export const worst=results=>results.some(r=>r.status==='fail')?'fail':results.some(r=>r.status==='warn')?'warn':'pass';
