import reviews from '../../data/listing-review.json' with {type:'json'};
// Unreviewed rows are not declared verified; only explicit exclusions are hidden.
export function passesListingReview(item){
 const key=item.sourceKey??(item.source?`${item.source}:${item.sourceId??item.id}`:'');
 return !Object.hasOwn(reviews,key)||!reviews[key].exclude;
}
