// Private offline study only: no .env loading, account writes or collection.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {trustedSnapshot} from '../../lib/domain/data-trust.mjs';
import {combineReviews} from './recommendation-reviews.mjs';

const options={},args=process.argv.slice(2);
for(let index=0;index<args.length;index+=2){
 if(!['--primary','--context','--snapshot','--preferences','--output'].includes(args[index])||!args[index+1])throw Error('Use --primary DIR --context DIR --snapshot PATH --preferences PATH --output .context/DIR');
 options[args[index]]=args[index+1];
}
if(['--primary','--context','--snapshot','--preferences','--output'].some(key=>!options[key]))throw Error('All input/output arguments are required');
const output=resolve(options['--output']);
if(!output.startsWith(resolve('.context')+sep)||[options['--primary'],options['--context']].some(path=>resolve(path)===output))throw Error('Use a separate private output directory');
const load=async path=>JSON.parse(await readFile(path,'utf8'));
const readBatch=async directory=>({review:(await load(join(directory,'dataset.json'))).review,judgments:await load(join(directory,'judgments.json'))});
const [primary,context,snapshot,raw]=await Promise.all([readBatch(options['--primary']),readBatch(options['--context']),load(options['--snapshot']),load(options['--preferences'])]);
const now=Date.now(),settings={...(raw.settings??raw),saved:[],dismissed:[],tasteFeedback:[]};
const combined=combineReviews({items:trustedSnapshot(snapshot,now).items,settings,primary,context,now});
await mkdir(output,{recursive:true,mode:0o700});
await writeFile(join(output,'dataset.json'),JSON.stringify({version:1,generatedAt:new Date(now).toISOString(),...combined},null,2),{mode:0o600});
console.log(JSON.stringify({study:combined.study,cases:combined.cases.map(row=>({name:row.name,training:row.examples.length,candidates:row.candidateKeys.length})),output}));
