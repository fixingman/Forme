const PAGE=1000;
/** Reads the published snapshot through the caller's session, so RLS decides who may see it. */
export async function readPublishedSnapshot(supabase){
 const {data:meta,error:metaError}=await supabase.from('snapshot_meta').select('fetched_at, published_at, queries, extra').eq('id',1).maybeSingle();
 if(metaError)throw new Error('Listings could not be read.');
 if(!meta)return null;
 const items=[];
 for(let from=0;;from+=PAGE){
  const {data,error}=await supabase.from('listings').select('data').order('source_key').range(from,from+PAGE-1);
  if(error)throw new Error('Listings could not be read.');
  items.push(...data.map(row=>row.data));
  if(data.length<PAGE)break;
 }
 return {...meta.extra,fetchedAt:new Date(meta.fetched_at).toISOString(),queries:Array.isArray(meta.queries)?meta.queries:[],items};
}
