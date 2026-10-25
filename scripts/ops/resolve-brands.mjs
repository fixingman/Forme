// Looks up exact provider brand IDs for brands in your collection: npm run brands:resolve -- [--limit 10] [--brand "Name"]...
// Without --confirm this only PREVIEWS (free, nothing is sent). A paid run needs --confirm <credits> equal to the quoted maximum,
// stays inside the shared daily credit cap, and is never retried automatically. Each lookup costs 3 credits.
import {refreshControl} from '../../lib/server/refresh-control.mjs';
try{process.loadEnvFile('.env.local');}catch(error){if(error.code!=='ENOENT')throw error;}
const args=process.argv.slice(2),flag=name=>{const at=args.indexOf(name);return at<0?undefined:args[at+1];};
const limit=flag('--limit')===undefined?10:Number(flag('--limit')),confirm=flag('--confirm'),brands=args.flatMap((arg,at)=>arg==='--brand'&&args[at+1]?[args[at+1]]:[]);
const control=refreshControl();
try{
 const plan=await control.plan({},{scope:'brands',limit,...(brands.length?{brands}:{})});
 const status=await control.status();
 console.log(`Brand ID lookup — preview (nothing sent)\n${plan.coverage}`);
 for(const job of plan.jobs)console.log(`  ${job.brand.padEnd(30)} ${String(job.listings).padStart(3)} listings in your collection`);
 console.log(`\nMaximum cost: ${plan.maximumCredits} credits (${plan.jobs.length} × 3). Daily cap ${status.dailyCap===0?'off':status.dailyCap}; ${status.remainingCredits===null?'no limit':status.remainingCredits+' credits'} remaining today.`);
 if(!plan.jobs.length){console.log('Nothing to look up.');}
 else if(confirm===undefined){console.log(`To run it: npm run brands:resolve -- ${brands.length?brands.map(name=>`--brand "${name}" `).join(''):`--limit ${limit} `}--confirm ${plan.maximumCredits}`);}
 else if(Number(confirm)!==plan.maximumCredits)console.log(`Not run: --confirm ${confirm} does not match the quoted maximum of ${plan.maximumCredits} credits.`);
 else{
  console.log('\nRunning. One lookup every ~13 seconds; stop with Ctrl+C (progress is saved after each brand).');
  const outcome=await control.run(plan.id,{});
  for(const row of outcome.items??[])console.log(`  ${row.status.padEnd(9)} ${row.brand}${row.id?`  →  ${row.id} (${row.title})`:''}`);
  console.log(`\nLooked up ${outcome.looked}: ${outcome.matched} matched, ${outcome.ambiguous} ambiguous, ${outcome.none} not found.`);
 }
}catch(error){console.error(error instanceof Error?error.message:error);process.exitCode=1;}
finally{control.close();}
