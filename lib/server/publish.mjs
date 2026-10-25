import {trustedSnapshot,validTimestamp} from '../domain/data-trust.mjs';

/**
 * Publishes the local, already-validated snapshot to Postgres. Runs only on the owner's computer with the
 * service-role key, which bypasses row-level security; nothing in the hosted app ever holds that key.
 * Order matters: metadata and rows are written first, and rows from older publishes are pruned last, so a
 * failure part-way leaves the previous complete snapshot readable.
 */
export async function publishSnapshot({supabase,snapshot,now=new Date(),chunk=200,force=false}){
 const trusted=trustedSnapshot(snapshot);
 if(!trusted.items.length)throw new Error('The snapshot has no valid listings; nothing was published.');
 const {count,error:countError}=await supabase.from('listings').select('source_key',{count:'exact',head:true});
 if(countError)throw new Error(`Could not read the published listing count: ${countError.message}`);
 if(!force&&count>20&&trusted.items.length<count*0.5)throw new Error(`Refusing to replace ${count} published listings with ${trusted.items.length}. Re-run with --force if that is intended.`);
 const stamp=now.toISOString();
 const {error:metaError}=await supabase.from('snapshot_meta').upsert({id:1,fetched_at:trusted.fetchedAt,published_at:stamp,queries:trusted.queries??[],extra:{...(validTimestamp(trusted.lastCollectionCheckAt)?{lastCollectionCheckAt:trusted.lastCollectionCheckAt}:{}),...(trusted.discovery?{discovery:trusted.discovery}:{}),...(trusted.collection?{collection:trusted.collection}:{})}});
 if(metaError)throw new Error(`Could not write snapshot metadata: ${metaError.message}`);
 for(let i=0;i<trusted.items.length;i+=chunk){
  const rows=trusted.items.slice(i,i+chunk).map(item=>({source_key:item.sourceKey,data:item,published_at:stamp}));
  const {error}=await supabase.from('listings').upsert(rows,{onConflict:'source_key'});
  if(error)throw new Error(`Could not write listings ${i + 1}–${i + rows.length}: ${error.message}`);
 }
 const {error:pruneError}=await supabase.from('listings').delete().lt('published_at',stamp);
 if(pruneError)throw new Error(`Published, but could not remove stale listings: ${pruneError.message}`);
 return {published:trusted.items.length,previous:count,rejected:trusted.quality?.rejected??0,fetchedAt:trusted.fetchedAt};
}

/**
 * What a publish would do, without writing anything: the local snapshot against what the hosted site holds now. Used by the
 * Collection tools preview. `blocked` carries the reason a publish would be refused, so the preview can say so before the click.
 */
export async function publishPreview({supabase,snapshot}){
 const trusted=trustedSnapshot(snapshot);
 const {count,error}=await supabase.from('listings').select('source_key',{count:'exact',head:true});
 if(error)throw new Error(`Could not read the published listing count: ${error.message}`);
 const {data:meta,error:metaError}=await supabase.from('snapshot_meta').select('fetched_at,published_at').eq('id',1).maybeSingle();
 if(metaError)throw new Error(`Could not read the published snapshot details: ${metaError.message}`);
 const local=trusted.items.length;
 const blocked=!local?'This computer has no valid listings to publish.':count>20&&local<count*0.5?`Publishing would replace ${count} hosted listings with ${local}. Publishing is refused unless that is confirmed on the command line (npm run publish -- --force).`:null;
 return {local:{listings:local,rejected:trusted.quality?.rejected??0,fetchedAt:validTimestamp(trusted.fetchedAt)?trusted.fetchedAt:null},hosted:{listings:count??0,fetchedAt:meta?.fetched_at??null,publishedAt:meta?.published_at??null},blocked};
}
