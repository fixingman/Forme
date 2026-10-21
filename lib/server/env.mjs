// Validates configuration without ever returning a secret's value. Secrets belong in a secrets manager (or .env.local on a dev machine).
export const secretNames=['SCRAPEBADGER_API_KEY','BRIGHTDATA_API_KEY','GOOGLE_TRANSLATE_API_KEY','HEALTH_TOKEN','SUPABASE_SERVICE_ROLE_KEY'];
// Keys that let a holder collect data or bypass row-level security. They belong on the owner's computer only.
const ownerOnly=['SCRAPEBADGER_API_KEY','BRIGHTDATA_API_KEY','GOOGLE_TRANSLATE_API_KEY','SUPABASE_SERVICE_ROLE_KEY'];
const hosted=env=>!!(env.VERCEL||env.NETLIFY||env.RAILWAY_ENVIRONMENT||env.RENDER||env.FLY_APP_NAME||env.FORME_REQUIRE_AUTH==='1');
export function checkEnv(env=process.env){
 const errors=[],warnings=[];
 // The Supabase publishable key is public by design; its value is checked separately below.
 for(const name of Object.keys(env))if(name.startsWith('NEXT_PUBLIC_')&&name!=='NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'&&/key|token|secret|password/i.test(name))errors.push(`${name} would be exposed to every visitor's browser. Remove the NEXT_PUBLIC_ prefix.`);
 if(hosted(env))for(const name of ownerOnly)if(env[name])errors.push(`${name} must not be set on a hosted deployment. Collection and publishing are owner-only and run on your own computer.`);
 if(env.NEXT_PUBLIC_SUPABASE_URL&&!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||!env.NEXT_PUBLIC_SUPABASE_URL&&env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)errors.push('Set both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, or neither.');
 if(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY&&/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)&&/service_role/.test(Buffer.from(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.split('.')[1],'base64url').toString()))errors.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY contains a service-role key. Use the publishable (anon) key there.');
 if(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY&&env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_secret_'))errors.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY holds a secret key. Use the publishable key there.');
 if(env.HEALTH_TOKEN&&env.HEALTH_TOKEN.length<16)errors.push('HEALTH_TOKEN is shorter than 16 characters.');
 if(!env.SCRAPEBADGER_API_KEY)warnings.push('SCRAPEBADGER_API_KEY is not set: collection and availability checks are disabled.');
 if(env.NEXT_PUBLIC_SUPABASE_URL&&env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY&&!hosted(env))warnings.push('Sign-in is configured but only enforced for hosted requests. Set FORME_REQUIRE_AUTH=1 to enforce it on this computer too.');
 if(env.VERCEL&&!env.HEALTH_TOKEN)warnings.push('HEALTH_TOKEN is not set: external monitors cannot read /api/health.');
 return {ok:!errors.length,errors,warnings,present:Object.fromEntries(secretNames.map(name=>[name,!!env[name]]))};
}
