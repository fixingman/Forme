// Planning only: never calls a provider or spends credits.
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {openStore} from '../../lib/server/store.mjs';
import {candidateBrands} from '../../lib/domain/recommendations.mjs';
let backup,snapshot;if(existsSync('.forme-data/forme.sqlite')){const store=openStore();try{backup=store.profile().profile;snapshot=store.snapshot();}finally{store.close();}}
backup??=JSON.parse(await readFile('.forme-data/settings.json','utf8'));
const candidates=candidateBrands(backup.settings,[...(backup.savedListings??[]),...(snapshot?.items??[])]).slice(0,3);
console.log(JSON.stringify({planningOnly:true,requestsSent:0,queries:candidates.map(row=>({query:row.brand,reason:row.reason})),maximumResults:candidates.length*20,estimatedProviderCredits:candidates.length*5,note:'Estimate uses the existing search collector allowance. No collection executed.'},null,2));
