import {classifyListing} from './classification.mjs';
export const defaultGender={selected:['men','women','unisex'],includeUnknown:true};
const values=['men','women','unisex'];
export function normalizeGender(raw){
 const value=raw&&typeof raw==='object'?raw:{};
 return {selected:Array.isArray(value.selected)?values.filter(gender=>value.selected.includes(gender)):[...defaultGender.selected],includeUnknown:typeof value.includeUnknown==='boolean'?value.includeUnknown:true};
}
export function genderLabel(raw){
 if(typeof raw!=='string')return 'unknown';
 const label=raw.normalize('NFKC').trim().toLowerCase();
 if(['men','mens','menswear',"men's",'male','homme','hommes','herr','herrar','herren','uomo','hombre'].includes(label))return 'men';
 if(['women','womens','womenswear',"women's",'female','femme','femmes','dam','damer','damen','donna','mujer'].includes(label))return 'women';
 if(['unisex','gender neutral','gender-neutral'].includes(label))return 'unisex';
 return 'unknown';
}
export function listingGender(item){
 if(item.gender==='unknown')return {gender:'unknown',genderSource:'unknown'};
 const explicit=genderLabel(item.gender);
 if(explicit!=='unknown')return {gender:explicit,genderSource:item.genderSource==='title'?'title':item.genderSource==='search-filter'?'search-filter':'provider'};
 // Explicit wording only. Never infer department from a brand, size, silhouette or photo.
 const text=`${item.title??''} ${item.originalTitle??''}`.toLowerCase();
 const men=/\b(men['’]?s|menswear|for men|pour hommes?|herr(?:ar)?|herren)\b/.test(text);
 const women=/\b(women['’]?s|womenswear|for women|pour femmes?|dam(?:er)?|damen)\b/.test(text);
 const unisex=/\b(unisex|gender[- ]neutral)\b/.test(text);
 const count=Number(men)+Number(women)+Number(unisex);
 if(count!==1)return {gender:'unknown',genderSource:'unknown'};
 return {gender:unisex?'unisex':men?'men':'women',genderSource:'title'};
}
export function matchesGender(item,preference){
 const settings=normalizeGender(preference);
 // Household objects do not belong to a clothing department.
 if(classifyListing(item).productGroup==='homeware')return true;
 const {gender}=listingGender(item);
 return gender==='unknown'?settings.includeUnknown:settings.selected.includes(gender);
}
