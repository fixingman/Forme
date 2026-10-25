// Explicitly imports prior study choices into the PRIVATE PREVIEW ONLY. Never saves an account/profile.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {trustedSnapshot} from '../../lib/domain/data-trust.mjs';
import {listingKey} from '../../lib/domain/recommendations.mjs';
import {catalogHashFor,feedbackState} from './recommendation-data.mjs';
import {reviewItem} from './recommendation-reviews.mjs';
import {rankingPreview} from '../../lib/server/ranking-preview.mjs';
const args=process.argv.slice(2);let snapshotPath;const batches=[];
for(let index=0;index<args.length;index+=2){if(!args[index+1])throw Error('Use --snapshot PATH --review DIR [--review DIR]');if(args[index]==='--snapshot')snapshotPath=args[index+1];else if(args[index]==='--review')batches.push(args[index+1]);else throw Error('Unknown argument');}
if(!snapshotPath||!batches.length)throw Error('A frozen snapshot and at least one review are required');
const load=async path=>JSON.parse(await readFile(path,'utf8')),source=trustedSnapshot(await load(snapshotPath)).items,byKey=new Map(source.map(item=>[listingKey(item),item])),rows=[];
for(const directory of batches){
 const {review}=await load(join(directory,'dataset.json')),judgments=await load(join(directory,'judgments.json'));
 const keys=new Set(review.items.map(item=>item.key));
 if(keys.size!==review.items.length||review.items.some(item=>!byKey.has(item.key))||catalogHashFor(review.items)!==review.catalogHash||catalogHashFor(review.items.map(item=>reviewItem(byKey.get(item.key))))!==review.catalogHash||judgments.app!=='forme-recommendation-review'||judgments.version!==1||judgments.catalogHash!==review.catalogHash||judgments.events.some(row=>!keys.has(row.key)))throw Error('Review content or judgments do not match the frozen snapshot');
 for(const [key,state] of feedbackState(judgments.events))if(state.saved||state.hidden)rows.push({item:byKey.get(key),choice:state.hidden?'dismiss':'save'});
}
console.log(JSON.stringify(rankingPreview().seed(rows)));
