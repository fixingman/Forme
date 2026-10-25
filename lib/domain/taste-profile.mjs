import {brandKey} from './brands.mjs';
import {classifyListing} from './classification.mjs';
import {classifyStyle} from './data-quality.mjs';
import {vintedImageUrl,vintedItemUrl} from './vinted-urls.mjs';
import {isReason,ATTRIBUTE_REASONS} from './dislike-reasons.mjs';
import {isHiddenAt} from './hidden-at.mjs';

// Text traits are recommendation evidence, never verified garment attributes.
/** @type {[string,RegExp][]} */
const rules=[
 ['category:outerwear',/\b(jacket|coat|parka|blazer|fleece)\b/],
 ['category:shirts',/\b(shirt|overshirt|polo|t-shirt|tee)\b/],
 ['category:knitwear',/\b(knitwear|sweater|knit|cardigan|turtleneck)\b/],
 ['category:trousers',/\b(trousers?|pants|jeans|shorts)\b/],
 ['material:wool',/\b(wool|merino|lambswool)\b/],
 ['material:cotton',/\bcotton\b/],['material:linen',/\blinen\b/],
 ['material:leather',/\b(leather|suede)\b/],['material:cashmere',/\bcashmere\b/],
 ['material:denim',/\b(denim|jeans|jean (?:jacket|shirt))\b/],
 ['color:black',/\bblack\b/],['color:blue',/\b(blue|navy|indigo)\b/],
 ['color:brown',/\b(brown|tan|camel)\b/],['color:grey',/\b(gr[ae]y|charcoal)\b/],
 ['color:neutral',/\b(beige|cream|ecru|ivory|off-white)\b/],
 ['fit:relaxed',/\b(oversized|relaxed|boxy|wide[- ]leg)\b/],
 ['fit:cropped',/\bcropped\b/],['fit:straight',/\bstraight\b/],
];
export const signalKey=item=>item.sourceKey??`${item.source??'demo'}:${item.sourceId??item.id}`;
export function listingTraits(item){
 const text=`${item.title??''} ${item.category??''}`.normalize('NFKC').toLowerCase();
 const traits=rules.filter(([,pattern])=>pattern.test(text)).map(([name])=>name);
 if(!traits.some(name=>name.startsWith('category:'))){const group=classifyListing(item).productGroup;if(group!=='unknown')traits.unshift(`category:${group}`);}
 return traits;
}
/**
 * What is kept when a piece is hidden: the taste signals, plus just enough to recognise it later in Hidden pieces even after it
 * leaves the collection (title, public photo address, public listing link). Only validated Vinted addresses are stored.
 */
export function feedbackSnapshot(item){
 const row={key:signalKey(item),brand:item.brand,traits:listingTraits(item),style:item.style||classifyStyle(item).style};
 const title=cleanTitle(item.title),imageUrl=vintedImageUrl(item.imageUrl),sourceUrl=vintedItemUrl(item.sourceUrl);
 if(title)row.title=title;if(imageUrl&&imageUrl.length<=600)row.imageUrl=imageUrl;if(sourceUrl&&sourceUrl.length<=300)row.sourceUrl=sourceUrl;
 return row;
}
const cleanTitle=value=>typeof value==='string'&&value.trim()?value.normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,200):'';
/** The optional recognition fields, re-validated on every load and import so a hand-edited file cannot smuggle in other addresses. */
const recognition=row=>{const title=cleanTitle(row.title),imageUrl=typeof row.imageUrl==='string'&&row.imageUrl.length<=600?vintedImageUrl(row.imageUrl):undefined,sourceUrl=typeof row.sourceUrl==='string'&&row.sourceUrl.length<=300?vintedItemUrl(row.sourceUrl):undefined;return {...(title?{title}:{}),...(imageUrl?{imageUrl}:{}),...(sourceUrl?{sourceUrl}:{})};};
export function normalizeTasteFeedback(raw){
 if(!Array.isArray(raw))return [];
 const allowed=new Set([...rules.map(([name])=>name),...['clothing','bottoms','shoes','accessories','homeware','toys','beauty'].map(group=>`category:${group}`)]);
 return [...new Map(raw.filter(row=>row&&typeof row.key==='string'&&row.key.length<=100&&typeof row.brand==='string'&&row.brand.length<=200).map(row=>[row.key,{key:row.key,brand:row.brand,traits:Array.isArray(row.traits)?[...new Set(row.traits.filter(t=>allowed.has(t)))]:[],style:typeof row.style==='string'?row.style.slice(0,100):'',...(isReason(row.reason)?{reason:row.reason}:{}),...(isHiddenAt(row.hiddenAt)?{hiddenAt:row.hiddenAt}:{}),...(typeof row.feedbackEventId==='string'&&/^[0-9a-f-]{36}$/.test(row.feedbackEventId)?{feedbackEventId:row.feedbackEventId}:{}),...recognition(row)}])).values()].slice(-200);
}
export function preferredStyles(settings){
 const suggestions={'Quiet Luxury':['Minimalism'],'Avant-Garde':['Japanese Designers','Archive'],'Vintage Sportswear':['Workwear','Techwear'],'Modern Tailoring':['Minimalism','Japanese Designers']};
 return [...new Set((settings.styles??[]).flatMap(style=>settings.styleRules?.[style]??suggestions[style]??[style]))];
}
export function tasteProfile(settings,source=[]){
 const savedIds=new Set(settings.saved??[]),hidden=new Set(settings.dismissed??[]);
 const unique=new Map(source.map(item=>[signalKey(item),item]));
 // A retained save stays saved, but an active explicit dislike wins for learning.
 const saved=[...unique.values()].filter(item=>savedIds.has(item.id)&&!hidden.has(signalKey(item))).map(feedbackSnapshot);
 const hiddenRows=normalizeTasteFeedback(settings.tasteFeedback).filter(row=>hidden.has(row.key));
 const negative=new Map(hiddenRows.filter(row=>!row.reason||row.reason==='style').map(row=>[row.key,row]));
 // "Wrong material" / "wrong colour" count against that attribute only: never the brand, style or category of a piece that is otherwise fine.
 const attribute=hiddenRows.filter(row=>ATTRIBUTE_REASONS[row.reason]).map(row=>({...row,traits:row.traits.filter(trait=>trait.startsWith(ATTRIBUTE_REASONS[row.reason]))}));
 for(const item of unique.values())if(hidden.has(signalKey(item))){const remembered=normalizeTasteFeedback(settings.tasteFeedback).find(row=>row.key===signalKey(item));if(!remembered&&!negative.has(signalKey(item)))negative.set(signalKey(item),feedbackSnapshot(item));}
 const count=(rows,values)=>{const map=new Map();for(const row of rows)for(const value of new Set(values(row)))if(value)map.set(value,(map.get(value)??0)+1);return map;};
 return {savedCount:saved.length,hiddenCount:negative.size,brands:count(saved,row=>[brandKey(row.brand)]),styles:count(saved,row=>[row.style]),traits:count(saved,row=>row.traits),negativeBrands:count([...negative.values()],row=>[brandKey(row.brand)]),negativeTraits:count([...negative.values(),...attribute],row=>row.traits),explicitStyles:preferredStyles(settings),saved};
}
