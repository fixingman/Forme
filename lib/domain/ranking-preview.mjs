// Shared, browser-safe comparison rules. No live preferences are written here.
export const PREVIEW_ENGINES=['current','river','gorse'];
export const PREVIEW_CHOICES=['save','dismiss','skip'];
export function preferenceKey(settings,savedListings=[]){
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 return JSON.stringify(canonical({settings,savedListings}));
}
export function normalizePreviewRanking(ranking,keys){
 const allowed=new Set(keys),seen=new Set(),result=[];
 for(const row of ranking??[]){if(!row||!allowed.has(row.key)||seen.has(row.key))throw Error('Invalid model ranking');seen.add(row.key);result.push(row.key);}
 return {keys:[...result,...keys.filter(key=>!seen.has(key))],missing:keys.length-result.length};
}
