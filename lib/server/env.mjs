// Validates configuration without ever returning a secret's value. Secrets belong in a secrets manager (or .env.local on a dev machine).
export const secretNames=['SCRAPEBADGER_API_KEY','BRIGHTDATA_API_KEY','GOOGLE_TRANSLATE_API_KEY','HEALTH_TOKEN'];
export function checkEnv(env=process.env){
 const errors=[],warnings=[];
 for(const name of Object.keys(env))if(name.startsWith('NEXT_PUBLIC_')&&/key|token|secret|password/i.test(name))errors.push(`${name} would be exposed to every visitor's browser. Remove the NEXT_PUBLIC_ prefix.`);
 if(env.HEALTH_TOKEN&&env.HEALTH_TOKEN.length<16)errors.push('HEALTH_TOKEN is shorter than 16 characters.');
 if(!env.SCRAPEBADGER_API_KEY)warnings.push('SCRAPEBADGER_API_KEY is not set: collection and availability checks are disabled.');
 if(env.VERCEL&&!env.HEALTH_TOKEN)warnings.push('HEALTH_TOKEN is not set: external monitors cannot read /api/health.');
 return {ok:!errors.length,errors,warnings,present:Object.fromEntries(secretNames.map(name=>[name,!!env[name]]))};
}
