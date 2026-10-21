import {listingKey,recommendListings} from './recommendations.mjs';
import {sameBrand} from './brands.mjs';
export function homeActivity(source,preferences,now=Date.now()){
 const recent=value=>Number.isFinite(Date.parse(value))&&Date.parse(value)<=now&&now-Date.parse(value)<7*86400000;
 const recommended=new Set(recommendListings(source,preferences).map(entry=>listingKey(entry.item)));
 const relevant=source.filter(item=>!(preferences.dismissed??[]).includes(listingKey(item))&&(recommended.has(listingKey(item))||preferences.saved.includes(item.id)||preferences.following.some(brand=>sameBrand(brand,item.brand))));
 return {
  arrivals:relevant.filter(item=>item.newlyCollected&&recent(item.firstSeenAt)).sort((a,b)=>Date.parse(b.firstSeenAt)-Date.parse(a.firstSeenAt)||a.id-b.id),
  changes:relevant.filter(item=>Number.isFinite(item.previousPrice)&&item.previousPrice!==item.price&&recent(item.priceChangedAt)).sort((a,b)=>Number(preferences.saved.includes(b.id))-Number(preferences.saved.includes(a.id))||Date.parse(b.priceChangedAt)-Date.parse(a.priceChangedAt))
 };
}
