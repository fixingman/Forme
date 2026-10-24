import {candidateBrands,recommendListings,listingKey} from './recommendations.mjs';
import {sameBrand} from './brands.mjs';
export function feedbackReview(source,settings){
 const recommendations=recommendListings(source,settings),saved=source.filter(item=>settings.saved.includes(item.id));
 const hidden=(settings.dismissed??[]).map(key=>({key,item:source.find(item=>listingKey(item)===key)??null}));
 const brands=candidateBrands(settings,source).map(({brand,because})=>({brand,because,collected:source.filter(item=>sameBrand(item.brand,brand)).length,eligible:recommendations.filter(entry=>sameBrand(entry.item.brand,brand)).length,saved:saved.filter(item=>sameBrand(item.brand,brand)).length,hidden:hidden.filter(row=>row.item&&sameBrand(row.item.brand,brand)).length}));
 return {savedCount:settings.saved.length,hiddenCount:hidden.length,eligibleCount:recommendations.length,brands,hidden};
}
