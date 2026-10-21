// Usage: npm run auth:check [-- --owner]   Read-only checks of your Supabase project. Prints no keys.
//   default  signed-out view only (publishable key): sign-up off, tables present and private
//   --owner  also reads your invite list and user list with the service-role key from .env.local
import {existsSync} from 'node:fs';
import {checkSupabase,checkOwnerSetup,worst} from '../../lib/server/supabase-check.mjs';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if(!url||!key){console.error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local first (see docs/accounts-setup.md).');process.exit(2);}
const results=await checkSupabase({url,key});
if(process.argv.includes('--owner')){
 const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!serviceKey)results.push({name:'Owner checks',status:'warn',detail:'SUPABASE_SERVICE_ROLE_KEY is not set in .env.local; skipped.'});
 else if(results.some(r=>r.status==='fail'&&(r.name==='Reach the project'||(r.name.startsWith('Table ')&&/Not found/.test(r.detail)))))results.push({name:'Owner checks',status:'warn',detail:'Skipped: the project is unreachable or the migration has not been applied.'});
 else results.push(...await checkOwnerSetup({url,serviceKey}));
}
const mark={pass:'ok  ',warn:'warn',fail:'FAIL'};
for(const r of results)console.log(`${mark[r.status]}  ${r.name}: ${r.detail}`);
const verdict=worst(results);console.log(`\n${verdict==='pass'?'All checks passed.':verdict==='warn'?'Passed with warnings.':'Some checks failed.'}`);
process.exit(verdict==='fail'?1:0);
