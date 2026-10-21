import {validTimestamp} from './data-trust.mjs';
import {normalizePreferences,type Preferences} from './preferences';
import type {Listing} from './catalog';
export type Backup={app:'forme';version:1;exportedAt:string;settings:Preferences;display:{mode:'live'|'demo';collapsed:boolean};savedListings:Listing[]};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const names=(v:unknown):v is string[]=>Array.isArray(v)&&v.length<=1000&&v.every(x=>typeof x==='string'&&x.trim().length>0&&x.length<=100);
function validateSettings(v:unknown):Preferences {
 if(!object(v)||!names(v.following)||!names(v.excluded)||!names(v.styles)||!Array.isArray(v.saved)||v.saved.length>1000||!v.saved.every(x=>Number.isSafeInteger(x)&&x>0)||!Array.isArray(v.searches)||v.searches.length>1000||!v.searches.every(s=>object(s)&&Number.isSafeInteger(s.id)&&typeof s.name==='string'&&s.name.length<=100&&['keyword','brand','size'].every(k=>typeof s[k]==='string'&&(s[k] as string).length<=300)&&(s.max===''||((typeof s.max==='number'||typeof s.max==='string')&&Number.isFinite(Number(s.max))&&Number(s.max)>=0))&&typeof s.alerts==='boolean')||!object(v.digest)||!['following','searches','rare','styles'].every(k=>typeof (v.digest as Record<string,unknown>)[k]==='boolean')||typeof v.digestTime!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.digestTime)||!object(v.styleRules)||!Object.values(v.styleRules).every(names))throw new Error('This file contains invalid FORME settings. Nothing was changed.');
 if(v.sizing!==undefined&&(!object(v.sizing)||typeof v.sizing.enabled!=='boolean'||!names(v.sizing.selected)||v.sizing.selected.length>50||!v.sizing.selected.every(label=>label.length<=40)||typeof v.sizing.includeOneSize!=='boolean'||typeof v.sizing.includeUnspecified!=='boolean'))throw new Error('Invalid size preferences in backup. Nothing was changed.');
 if(object(v.sizing)&&v.sizing.groups!==undefined){const groups=v.sizing.groups;if(!object(groups)||!['clothing','waist','shoes','other'].every(key=>names(groups[key])&&(groups[key] as string[]).length<=50&&(groups[key] as string[]).every(label=>label.length<=40&&(v.sizing as {selected:string[]}).selected.includes(label)))||Object.values(groups).flat().length>50)throw new Error('Invalid size groups in backup. Nothing was changed.');}
 if(v.dismissed!==undefined&&(!names(v.dismissed)||v.dismissed.length>1000))throw new Error('Invalid recommendation feedback.');
 if(v.gender!==undefined&&(!object(v.gender)||!Array.isArray(v.gender.selected)||v.gender.selected.length>3||!v.gender.selected.every(value=>['men','women','unisex'].includes(String(value)))||typeof v.gender.includeUnknown!=='boolean'))throw new Error('Invalid clothing department preferences. Nothing was changed.');
 return normalizePreferences(v);
}
function safeUrl(value:unknown){if(typeof value!=='string')return false;try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}
function listing(value:unknown):Listing {
 if(!object(value)||!Number.isSafeInteger(value.id)||Number(value.id)<=0||!['brand','title','size','category','style','image'].every(k=>typeof value[k]==='string'&&(value[k] as string).length<=1000)||!['price','age','rarity'].every(k=>typeof value[k]==='number'&&Number.isFinite(value[k])&&Number(value[k])>=0))throw new Error('Invalid saved listing in backup. Nothing was changed.');
 const result=Object.fromEntries(['id','brand','title','size','category','style','image','price','age','rarity'].map(k=>[k,value[k]])) as Listing;
 if(value.source!==undefined){if(!['vinted','tradera','blocket'].includes(String(value.source)))throw new Error('Unknown saved listing source.');result.source=value.source as Listing['source'];}
 for(const key of ['sourceId','sourceKey','currency','condition','fetchedAt','firstSeenAt','originalTitle','originalCondition','titleTranslation','collectionCatalogIds','observedAt','availabilityObservedAt','brandId','brandSource'] as const){if(value[key]!==undefined){if(typeof value[key]!=='string'||value[key].length>1000)throw new Error('Invalid saved listing metadata.');result[key]=value[key];}}
 if(value.availability!==undefined){if(!['unknown','sold','reserved','unavailable'].includes(String(value.availability)))throw new Error('Invalid availability label.');result.availability=value.availability as Listing['availability'];}
 if(value.availabilitySource!==undefined){if(!['provider','unknown'].includes(String(value.availabilitySource)))throw new Error('Invalid availability provenance.');result.availabilitySource=value.availabilitySource as Listing['availabilitySource'];}
 for(const key of ['observedAt','availabilityObservedAt'] as const)if(result[key]!==undefined&&!validTimestamp(result[key]))throw new Error('Invalid saved observation timestamp.');
 if(value.gender!==undefined){if(!['men','women','unisex','unknown'].includes(String(value.gender)))throw new Error('Invalid listing department.');result.gender=value.gender as Listing['gender'];}
 if(value.genderSource!==undefined){if(!['provider','title','search-filter','unknown'].includes(String(value.genderSource)))throw new Error('Invalid department provenance.');result.genderSource=value.genderSource as Listing['genderSource'];}
 for(const key of ['sourceUrl','imageUrl'] as const)if(value[key]!==undefined){if(!safeUrl(value[key]))throw new Error('Invalid saved listing URL.');result[key]=value[key] as string;}
 if(result.source==='vinted'&&result.sourceUrl){const url=new URL(result.sourceUrl);if(url.hostname!=='www.vinted.se'||!new RegExp(`^/items/${result.id}(?:-|$)`).test(url.pathname))throw new Error('Saved source URL does not match the listing.');}
 return result;
}
export function createBackup(settings:Preferences,display:Backup['display'],savedListings:Listing[]):Backup {
 return {app:'forme',version:1,exportedAt:new Date().toISOString(),settings:validateSettings(settings),display,savedListings:savedListings.filter(item=>settings.saved.includes(item.id)).map(listing)};
}
export function parseBackup(raw:unknown):Backup {
 if(!object(raw)||raw.app!=='forme'||raw.version!==1||typeof raw.exportedAt!=='string'||!Number.isFinite(Date.parse(raw.exportedAt))||!object(raw.display)||!['live','demo'].includes(String(raw.display.mode))||typeof raw.display.collapsed!=='boolean'||!Array.isArray(raw.savedListings)||raw.savedListings.length>1000)throw new Error('Unsupported or invalid FORME backup. Nothing was changed.');
 return {app:'forme',version:1,exportedAt:raw.exportedAt,settings:validateSettings(raw.settings),display:raw.display as Backup['display'],savedListings:raw.savedListings.map(listing)};
}
export function parseVintedBrands(raw:unknown):string[]{
 if(!object(raw)||raw.app!=='forme-vinted-brands'||raw.version!==1||!names(raw.brands)||!raw.brands.length)throw new Error('Choose a FORME Vinted brands export. Nothing was changed.');
 return [...new Map(raw.brands.map(name=>[name.trim().toLowerCase(),name.trim()])).values()];
}
export function mergeBrands(settings:Preferences,brands:string[]):Preferences {
 const excluded=new Set(settings.excluded.map(name=>name.toLowerCase()));
 return {...settings,following:[...new Map([...settings.following,...brands].filter(name=>!excluded.has(name.toLowerCase())).map(name=>[name.toLowerCase(),name])).values()]};
}
