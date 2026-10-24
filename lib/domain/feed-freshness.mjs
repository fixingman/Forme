export const NEW_WINDOW_MS=7*86400000;
export function isNewArrival(item,now=Date.now()){
 if(!item.source)return item.age===0;
 const first=Date.parse(item.firstSeenAt);
 return !!item.newlyCollected&&Number.isFinite(first)&&first<=now&&now-first<NEW_WINDOW_MS;
}
export function isNewToday(item,now=Date.now()){
 return isNewArrival(item,now)&&(!item.source||new Date(item.firstSeenAt).toDateString()===new Date(now).toDateString());
}
export function collectionFreshness(snapshot,now=Date.now()){
 const rows=snapshot?.items??[],times=rows.map(item=>Date.parse(item.observedAt??item.fetchedAt)).filter(at=>Number.isFinite(at)&&at<=now);
 const check=Date.parse(snapshot?.lastCollectionCheckAt);
 if(Number.isFinite(check)&&check<=now)times.push(check);
 const latest=times.length?Math.max(...times):null;
 const stale=rows.filter(item=>{const at=Date.parse(item.observedAt??item.fetchedAt);return !Number.isFinite(at)||at>now||now-at>NEW_WINDOW_MS;}).length;
 return {latest,stale,total:rows.length,due:latest===null||now-latest>=86400000};
}
