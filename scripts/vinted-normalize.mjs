import {validTimestamp} from '../lib/data-trust.mjs';
import {genderLabel,listingGender} from '../lib/gender.mjs';
import {passesListingReview} from '../lib/listing-review.mjs';
import {englishListing} from '../lib/listing-language.mjs';
// Only public listing fields cross into the app. Seller/profile payloads are discarded.
export function normalizeVinted(row, fetchedAt, previous, context={}) {
  if(!row||typeof row!=='object'||!validTimestamp(fetchedAt))return null;
  const id=Number(row.id), amount=row.price?.amount, price=(typeof amount==='number'||typeof amount==='string'&&amount.trim())?Number(amount):NaN, currency=row.price?.currency_code;
  if(!passesListingReview({source:'vinted',id})||!Number.isSafeInteger(id)||id<=1000||typeof row.title!=='string'||!row.title.trim()||!Number.isFinite(price)||price<0||currency!=='SEK') return null;
  let url; try {url=new URL(row.url);} catch {return null;}
  if(url.protocol!=='https:'||url.hostname!=='www.vinted.se'||url.username||url.password||url.port||!url.pathname.startsWith(`/items/${id}-`)) return null;
  const image=row.photo?.url??row.photos?.[0]?.url;
  let imageUrl;try {const u=new URL(image);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='vinted.net'||u.hostname.endsWith('.vinted.net')))imageUrl=u.href;}catch{}
  if(!imageUrl)return null;
  const provided=[row.gender_title,row.gender,row.department_title,typeof row.department==='string'?row.department:row.department?.title].map(genderLabel).filter(value=>value!=='unknown');
  const unique=[...new Set(provided)];
  let gender=unique.length===1?{gender:unique[0],genderSource:'provider'}:unique.length>1?{gender:'unknown',genderSource:'unknown'}:listingGender({title:row.title});
  if(gender.gender==='unknown'&&!unique.length&&context.department==='men'&&context.catalogIds==='5')gender={gender:'men',genderSource:'search-filter'};
  const availability=row.is_sold===true?'sold':row.is_closed===true?'unavailable':row.is_reserved===true?'reserved':'unknown';
  return englishListing({...gender,availability,availabilitySource:availability==='unknown'?'unknown':'provider',...(availability!=='unknown'?{availabilityObservedAt:fetchedAt}:{}),...(Number.isSafeInteger(row.brand_id)?{brandId:String(row.brand_id)}:{}),brandSource:'provider-label',...(context.catalogIds?{collectionCatalogIds:context.catalogIds}:{}),id,source:'vinted',sourceId:String(id),sourceKey:`vinted:${id}`,sourceUrl:url.href,
    title:String(row.title).slice(0,300),brand:typeof row.brand_title==='string'&&row.brand_title.trim()?row.brand_title.trim().slice(0,200):'Unspecified brand',
    price,currency,size:typeof row.size_title==='string'&&row.size_title.trim()?row.size_title.trim().slice(0,100):'Not provided',
    condition:typeof row.status==='string'&&row.status.trim()?row.status.trim().slice(0,200):'Condition not provided',
    image:'',imageUrl,category:'',style:'',rarity:0,age:1,
    fetchedAt,firstSeenAt:validTimestamp(previous?.firstSeenAt)&&Date.parse(previous.firstSeenAt)<=Date.parse(fetchedAt)?previous.firstSeenAt:fetchedAt});
}
