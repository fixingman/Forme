import {availability,freshness} from './data-trust.mjs';
import {formatDateTime} from './presentation.mjs';

/**
 * The one-line status shown under an item's price. It states what is actually known and when it was known, and never
 * claims more: availability only comes from a provider check; otherwise it is "not confirmed" and the last sighting is shown.
 *   tone  ok       a provider check says it was available
 *         neutral  nothing is known beyond the last sighting
 *         warn     reserved, or not seen for over a week
 *         closed   sold, or removed/hidden on Vinted
 * Returns null for sample (demo) listings, which have no marketplace state.
 */
export function itemStatus(item,now=Date.now()){
 if(!item?.source)return null;
 const a=availability(item),f=freshness(item,now);
 const checked=item.availabilityObservedAt?formatDateTime(item.availabilityObservedAt):null;
 if(a.state==='sold')return {state:'sold',tone:'closed',label:'Sold',detail:checked?`Marked sold on Vinted · checked ${checked}`:'Marked sold on Vinted'};
 if(a.state==='reserved')return {state:'reserved',tone:'warn',label:'Reserved',detail:checked?`Reserved on Vinted · checked ${checked}`:'Reserved on Vinted'};
 if(a.state==='unavailable')return {state:'removed',tone:'closed',label:'Removed or hidden',detail:checked?`No longer shown on Vinted · checked ${checked}`:'No longer shown on Vinted'};
 if(a.state==='available')return {state:'available',tone:'ok',label:'Available when last checked',detail:checked?`Checked ${checked}`:''};
 if(f.state==='unknown')return {state:'unknown',tone:'neutral',label:'Availability not confirmed',detail:'Time of last sighting unknown'};
 const seen=formatDateTime(f.at);
 return f.state==='stale'
  ?{state:'stale',tone:'warn',label:'Availability not confirmed',detail:`Last seen ${seen} · over 7 days ago`}
  :{state:'unknown',tone:'neutral',label:'Availability not confirmed',detail:`Last seen ${seen}`};
}
