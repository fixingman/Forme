import {validTimestamp} from './data-trust.mjs';
export const AVAILABILITY_CHECK_CREDITS=10;
const RECHECK_AFTER_MS=24*3600*1000;
/** Plans provider checks for the user's saved Vinted listings only (one item-detail call each, up to 10 credits). Sold or removed items are not re-checked. */
export function makeAvailabilityPlan(settings,{limit=3}={},snapshot={},now=Date.now()){
 if(!Number.isInteger(limit)||limit<1||limit>3)throw new Error('Choose 1–3 saved items to check.');
 const saved=new Set(settings.saved??[]);
 const candidates=(snapshot.items??[]).filter(item=>item.source==='vinted'&&saved.has(item.id)&&/^\d+$/.test(String(item.sourceId)));
 const checkedAt=item=>item.availabilitySource==='provider'&&validTimestamp(item.availabilityObservedAt)?Date.parse(item.availabilityObservedAt):0;
 const closed=item=>item.availabilitySource==='provider'&&['sold','unavailable'].includes(item.availability);
 const due=candidates.filter(item=>!closed(item)&&now-checkedAt(item)>=RECHECK_AFTER_MS).sort((a,b)=>checkedAt(a)-checkedAt(b));
 const jobs=due.slice(0,limit).map(item=>({brand:`${item.brand} · ${String(item.title).slice(0,48)}`,query:item.title,brandId:null,itemId:String(item.sourceId),sourceKey:item.sourceKey,maximumCredits:AVAILABILITY_CHECK_CREDITS}));
 const skipped=candidates.length-due.length;
 return {version:1,kind:'availability',scope:'availability',jobs,maximumCredits:jobs.length*AVAILABILITY_CHECK_CREDITS,maximumItems:jobs.length,exactBrandJobs:0,department:'Saved items only',sizeFiltering:'Each saved listing is checked individually; no search is run.',translation:'No translation is involved.',coverage:`${due.length} of ${candidates.length} saved Vinted listings are due for a check${skipped?` (${skipped} already sold, removed or checked in the last 24 hours)`:''}. Saved items missing from the current collection are not checked. Each check costs up to ${AVAILABILITY_CHECK_CREDITS} credits.`};
}
/** Interprets Vinted's item-detail flags. Only the documented combination counts as sold; hidden listings are not reported as sold. */
export function availabilityFromItem(item){
 if(!item||typeof item!=='object'||typeof item.is_closed!=='boolean')return null;
 if(item.is_reserved===true)return 'reserved';
 if(item.is_closed&&item.can_buy===false&&item.is_hidden!==true)return 'sold';
 if(item.is_hidden===true||item.is_closed)return 'unavailable';
 return item.can_buy===true?'available':'unknown';
}
