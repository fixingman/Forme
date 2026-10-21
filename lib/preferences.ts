import {defaultGender,normalizeGender,matchesGender} from './gender.mjs';
import {defaultSizing,normalizeSizing,matchesMySizes,matchesSizeLabels} from './sizes.mjs';
import {passesListingReview} from './listing-review.mjs';
import {sameBrand,isExcludedListing} from './brands.mjs';
import { defaults, items, type Listing } from './catalog';
export type GenderPreference={selected:('men'|'women'|'unisex')[];includeUnknown:boolean};
export type SizeGroups=Record<'clothing'|'waist'|'shoes'|'other',string[]>;
export type Sizing={groups?:SizeGroups;enabled:boolean;selected:string[];includeOneSize:boolean;includeUnspecified:boolean};
export type Search = { id: number; name: string; keyword: string; max: number | string; size: string; brand: string; alerts: boolean };
export type Preferences = Omit<typeof defaults, 'saved' | 'searches'> & { saved: number[]; searches: Search[]; styleRules: Record<string,string[]>; sizing:Sizing;dismissed:string[];gender:GenderPreference };
export const initialPreferences: Preferences = {...defaults, saved: [], styleRules: {}, sizing:defaultSizing,dismissed:[],gender:defaultGender as GenderPreference};
export const suggestionRules: Record<string,string[]> = {'Quiet Luxury': ['Minimalism'], 'Avant-Garde': ['Japanese Designers', 'Archive'], 'Vintage Sportswear': ['Workwear', 'Techwear'], 'Modern Tailoring': ['Minimalism', 'Japanese Designers']};
export const baseStyles = [...new Set(items.map(item => item.style))];
const strings = (x: unknown, fallback: string[]) => Array.isArray(x) && x.every(v => typeof v === 'string') ? [...new Set(x)] : fallback;
export function normalizePreferences(raw: unknown): Preferences {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<Preferences>;
  const excluded = strings(d.excluded, defaults.excluded);
  return {...initialPreferences,
    sizing:normalizeSizing(d.sizing) as Sizing,
    gender:normalizeGender(d.gender) as GenderPreference,
    dismissed:strings(d.dismissed,[]).slice(0,1000),
    following: strings(d.following, defaults.following).filter(b => !excluded.some(value=>sameBrand(value,b))), excluded,
    styles: strings(d.styles, defaults.styles),
    saved: Array.isArray(d.saved) ? d.saved.filter(id => typeof id === 'number' && Number.isSafeInteger(id) && id > 0) : [],
    searches: Array.isArray(d.searches) ? d.searches.filter(s => s && typeof s.id === 'number' && typeof s.name === 'string').map(s => ({id:s.id,name:s.name,keyword:typeof s.keyword==='string'?s.keyword:'',brand:typeof s.brand==='string'?s.brand:'',size:typeof s.size==='string'?s.size:'',max:Number.isFinite(Number(s.max)) && Number(s.max)>=0?s.max:'',alerts:!!s.alerts})) : defaults.searches,
    digest: Object.fromEntries(Object.entries(defaults.digest).map(([key,value])=>[key,typeof d.digest?.[key as keyof typeof defaults.digest]==='boolean'? d.digest[key as keyof typeof defaults.digest]:value])) as typeof defaults.digest,
    digestTime: typeof d.digestTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(d.digestTime) ? d.digestTime : defaults.digestTime,
    styleRules: d.styleRules && typeof d.styleRules === 'object' ? Object.fromEntries(Object.entries(d.styleRules).filter(([,v])=>Array.isArray(v)&&v.every(s=>baseStyles.includes(s)))) : {},
  };
}
export function visibleListings(data: Preferences, source: Listing[] = items) { return source.filter(item => passesListingReview(item) && matchesGender(item,data.gender) && matchesMySizes(item,data.sizing) && !isExcludedListing(item,data.excluded)); }
export function matchesStyle(item: Listing, style: string, data: Preferences) { return (data.styleRules[style] ?? suggestionRules[style] ?? [style]).includes(item.style); }
export function searchListings(list: Listing[], search: Search) {
  const terms = search.keyword.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return list.filter(item => terms.every(term=>`${item.brand} ${item.title} ${item.category} ${item.style}`.toLowerCase().includes(term)) && (search.max === '' || item.price <= Number(search.max)) && (!search.size || matchesSizeLabels(item.size,[search.size])) && (!search.brand || sameBrand(item.brand,search.brand.trim())));
}
export const isNew = (item: Listing) => item.source?!!item.newlyCollected&&!!item.firstSeenAt&&new Date(item.firstSeenAt).toDateString()===new Date().toDateString():item.age===0;
export function digestListings(data: Preferences, source: Listing[] = items) { return visibleListings(data, source).filter(item=>isNew(item) && ((data.digest.following && data.following.some(brand=>sameBrand(brand,item.brand))) || (data.digest.rare && item.rarity>=8) || (data.digest.styles && data.styles.some(style=>matchesStyle(item,style,data))) || (data.digest.searches && data.searches.filter(search=>search.alerts).some(search=>searchListings([item],search).length>0)))); }
