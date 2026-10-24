// Offline evaluation only. Never loads .env, calls a provider, or writes an app/profile database.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {trustedSnapshot} from '../../lib/domain/data-trust.mjs';
import {listingKey,recommendListings} from '../../lib/domain/recommendations.mjs';
import {syntheticCases,makeCase,feedbackState,catalogHashFor} from './recommendation-data.mjs';
const args=process.argv.slice(2),options={};
for(let index=0;index<args.length;index+=2){if(!['--snapshot','--preferences','--judgments','--output'].includes(args[index])||!args[index+1])throw new Error('Use --snapshot PATH --preferences PATH [--judgments PATH] [--output .context/PATH]');options[args[index]]=args[index+1];}
const output=resolve(options['--output']??'.context/recommendation-lab'),privateRoot=resolve('.context')+sep;
if(!output.startsWith(privateRoot))throw new Error('Evaluation outputs must stay in ignored .context/.');
await mkdir(output,{recursive:true,mode:0o700});
const cases=syntheticCases();let review=null;
if(options['--snapshot']||options['--preferences']){
 if(!options['--snapshot']||!options['--preferences'])throw new Error('Both snapshot and preferences are needed.');
 const now=Date.now(),snapshot=trustedSnapshot(JSON.parse(await readFile(options['--snapshot'],'utf8')),now),raw=JSON.parse(await readFile(options['--preferences'],'utf8')),settings={...(raw.settings??raw),saved:[],dismissed:[],tasteFeedback:[]};
 const candidates=recommendListings(snapshot.items,settings,{now}).map(row=>row.item),testKeys=new Set(candidates.map(listingKey));
 const reviewItems=candidates.map(item=>({key:listingKey(item),brand:item.brand,title:item.title,price:item.price,size:item.size,condition:item.condition,imageUrl:item.imageUrl,sourceUrl:item.sourceUrl,observedAt:item.observedAt??item.fetchedAt}));
 const catalogHash=catalogHashFor(reviewItems);
 let judgments=null;
 if(options['--judgments']){judgments=JSON.parse(await readFile(options['--judgments'],'utf8'));if(judgments.app!=='forme-recommendation-review'||judgments.version!==1||judgments.catalogHash!==catalogHash||!Array.isArray(judgments.events))throw new Error('Invalid review file');feedbackState(judgments.events);if(judgments.events.some(event=>!testKeys.has(event.key)))throw new Error('Review contains keys outside this evaluation catalog');}
 if(judgments){
  // Deterministic 3-fold split by ID; every held-out item is excluded from the training events.
  const labeled=[...feedbackState(judgments.events)].filter(([,state])=>state.hidden||state.saved);
  for(let fold=0;fold<3;fold++){
   const held=new Set(labeled.filter(([key])=>Number(key.split(':').at(-1))%3===fold).map(([key])=>key));
   const labels=Object.fromEntries(labeled.filter(([key])=>held.has(key)).map(([key,state])=>[key,state.hidden?0:1]));
   cases.push(makeCase({name:`owner-fold-${fold+1}`,kind:'owner-labelled-held-out',items:snapshot.items,settings,events:judgments.events.filter(event=>!held.has(event.key)),testKeys:held,labels,now}));
  }
 }else cases.push(makeCase({name:'owner-cold-start',kind:'unlabelled-no-accuracy-claim',items:snapshot.items,settings,testKeys,now}));
 review={items:reviewItems,catalogHash,audit:{catalog:snapshot.items.length,eligibleDiscover:candidates.length,brands:new Set(candidates.map(item=>item.brand)).size},events:judgments?.events??[]};
}
await writeFile(join(output,'dataset.json'),JSON.stringify({version:1,generatedAt:new Date().toISOString(),cases,review},null,2),{mode:0o600});
console.log(JSON.stringify({cases:cases.map(row=>({name:row.name,kind:row.kind,training:row.examples.length,candidates:row.candidateKeys.length})),audit:review?.audit??null,output:join(output,'dataset.json')}));
