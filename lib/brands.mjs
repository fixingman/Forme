export const brandKey=value=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export const sameBrand=(left,right)=>brandKey(left)===brandKey(right);

// Explicit collaboration wording respects exclusions even when the marketplace lists one partner.
export function isExcludedListing(item,excluded){
 const title=`${item.title??''} ${item.originalTitle??''}`;
 return excluded.some(brand=>{
  if(sameBrand(brand,item.brand))return true;
  const escaped=brand.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}\\s+[x×]\\s+|(?:^|\\s)[x×]\\s+${escaped}(?:$|[^\\p{L}\\p{N}])`,'iu').test(title);
 });
}
