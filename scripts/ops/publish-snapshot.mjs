// Usage: npm run publish [-- --force]   Sends public/data/vinted.json to Supabase so the hosted app can show it.
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local. Run on your own computer only.
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {publishSnapshot} from '../../lib/server/publish.mjs';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
if(process.env.VERCEL){console.error('Publishing runs on the owner’s computer, never on a hosting platform.');process.exit(2);}
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key){console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first (see docs/accounts-setup.md).');process.exit(2);}
const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const snapshot=JSON.parse(await readFile('public/data/vinted.json','utf8'));
const result=await publishSnapshot({supabase,snapshot,force:process.argv.includes('--force')});
console.log(`Published ${result.published} listings (was ${result.previous}); ${result.rejected} rejected by validation; collected ${result.fetchedAt}.`);
