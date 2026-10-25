import {test} from 'node:test';
import assert from 'node:assert/strict';
import {itemStatus} from '../../lib/domain/item-status.mjs';
import {listingCondition} from '../../lib/domain/presentation.mjs';

const now=Date.parse('2026-10-25T12:00:00Z'),DAY=86400000,iso=ms=>new Date(ms).toISOString();
const live=(extra={})=>({source:'vinted',id:1,fetchedAt:iso(now-2*DAY),observedAt:iso(now-2*DAY),...extra});
const checked=(availability,at=now-DAY)=>({availability,availabilitySource:'provider',availabilityObservedAt:iso(at)});

test('every provider-confirmed state has its own label, tone and a dated detail',()=>{
 const sold=itemStatus(live(checked('sold')),now);assert.deepEqual({s:sold.state,t:sold.tone,l:sold.label},{s:'sold',t:'closed',l:'Sold'});assert.match(sold.detail,/^Marked sold on Vinted · checked 24 Oct 2026, \d{2}:\d{2}$/);
 const reserved=itemStatus(live(checked('reserved')),now);assert.deepEqual({s:reserved.state,t:reserved.tone,l:reserved.label},{s:'reserved',t:'warn',l:'Reserved'});assert.match(reserved.detail,/^Reserved on Vinted · checked /);
 const removed=itemStatus(live(checked('unavailable')),now);assert.deepEqual({s:removed.state,t:removed.tone,l:removed.label},{s:'removed',t:'closed',l:'Removed or hidden'});assert.match(removed.detail,/^No longer shown on Vinted · checked /);
 const ok=itemStatus(live(checked('available')),now);assert.deepEqual({s:ok.state,t:ok.tone,l:ok.label},{s:'available',t:'ok',l:'Available when last checked'});assert.match(ok.detail,/^Checked /);
});
test('with no provider check, availability is never claimed: not confirmed, with the last sighting',()=>{
 const recent=itemStatus(live(),now);assert.deepEqual({s:recent.state,t:recent.tone,l:recent.label},{s:'unknown',t:'neutral',l:'Availability not confirmed'});assert.match(recent.detail,/^Last seen 23 Oct 2026, \d{2}:\d{2}$/);assert.ok(!/over 7 days/.test(recent.detail));
 const old=itemStatus(live({observedAt:iso(now-12*DAY),fetchedAt:iso(now-12*DAY)}),now);assert.deepEqual({s:old.state,t:old.tone,l:old.label},{s:'stale',t:'warn',l:'Availability not confirmed'});assert.match(old.detail,/^Last seen 13 Oct 2026, \d{2}:\d{2} · over 7 days ago$/);
 assert.equal(itemStatus(live({observedAt:iso(now-7*DAY),fetchedAt:iso(now-7*DAY)}),now).state,'unknown','exactly seven days is not yet stale');
 const noTime=itemStatus({source:'vinted',id:2},now);assert.deepEqual({s:noTime.state,l:noTime.label,d:noTime.detail},{s:'unknown',l:'Availability not confirmed',d:'Time of last sighting unknown'});
 const future=itemStatus(live({observedAt:iso(now+DAY),fetchedAt:iso(now+DAY)}),now);assert.equal(future.detail,'Time of last sighting unknown','a timestamp from the future is not trusted');
});
test('a status that did not come from the provider is ignored, so nothing can be marked sold by accident',()=>{
 for(const bad of [{availability:'sold'},{availability:'sold',availabilitySource:'unknown',availabilityObservedAt:iso(now)},{availability:'sold',availabilitySource:'provider'},{availability:'sold',availabilitySource:'provider',availabilityObservedAt:'not a date'},{availability:'gone',availabilitySource:'provider',availabilityObservedAt:iso(now)}])
  assert.equal(itemStatus(live(bad),now).state,'unknown',JSON.stringify(bad));
});
test('a closed state wins over an old sighting and keeps its own check time',()=>{
 const row=itemStatus(live({observedAt:iso(now-30*DAY),fetchedAt:iso(now-30*DAY),...checked('sold',now-3600e3)}),now);assert.equal(row.state,'sold');assert.ok(!/over 7 days/.test(row.detail));
});
test('sample listings have no marketplace status at all',()=>{
 assert.equal(itemStatus({id:3,brand:'Our Legacy',title:'Evening Shirt'},now),null);assert.equal(itemStatus(null,now),null);assert.equal(itemStatus(undefined,now),null);
});
test('condition shows the original wording when it could not be translated, instead of a placeholder',()=>{
 assert.equal(listingCondition({source:'vinted',condition:'Very good',originalCondition:'Mycket bra'}),'Very good');
 assert.equal(listingCondition({source:'vinted',condition:'Condition not translated',originalCondition:'Fint skick'}),'Fint skick');
 assert.equal(listingCondition({source:'vinted',condition:'Condition not translated',originalCondition:'   '}),'Condition not translated');
 assert.equal(listingCondition({source:'vinted',condition:'Condition not translated'}),'Condition not translated');
 assert.equal(listingCondition({source:'vinted'}),'Condition not provided');assert.equal(listingCondition({id:1}),'Very good');
});
