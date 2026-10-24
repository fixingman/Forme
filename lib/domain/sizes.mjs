import {classifyListing} from './classification.mjs';
export const defaultSizing={enabled:false,selected:[],includeOneSize:true,includeUnspecified:true};
const oneSize=new Set(['ONESIZE','OS','OSFA','JUSTERBART','ADJUSTABLE']);
const unknown=new Set(['','NOT PROVIDED','UNSPECIFIED','UNKNOWN','ANNAT','OTHER','—','-']);
export function sizeKey(value){
 const label=value.normalize('NFKC').trim().toUpperCase().replace(/(\d),(\d)/g,'$1.$2').replace(/\s+/g,' ');
 if(/^EU\s*\d+(?:\.\d+)?$/.test(label))return label.replace(/^EU\s*/,'');
 if(/^W\s*\d+(?:\.\d+)?$/.test(label))return label.replace(/\s/g,'');
 if(label==='2XL')return 'XXL';if(label==='3XL')return 'XXXL';if(label==='4XL')return 'XXXXL';
 if(/^ONE[ -]?SIZE$/.test(label))return 'ONESIZE';
 return label;
}
export function normalizeSizing(raw){
 const value=raw&&typeof raw==='object'?raw:{};
 const selected=Array.isArray(value.selected)?[...new Map(value.selected.filter(x=>typeof x==='string'&&x.trim()&&x.length<=40).slice(0,50).map(x=>[sizeKey(x),x.trim()])).values()]:[];
 const groups=value.groups&&typeof value.groups==='object'?Object.fromEntries(['clothing','waist','shoes','other'].map(group=>[group,Array.isArray(value.groups[group])?[...new Map(value.groups[group].filter(x=>typeof x==='string'&&selected.some(label=>sizeKey(label)===sizeKey(x))).map(x=>[sizeKey(x),x])).values()]:[]])):undefined;
 return {...(groups?{groups}:{}),enabled:value.enabled===true&&selected.length>0,selected,includeOneSize:typeof value.includeOneSize==='boolean'?value.includeOneSize:true,includeUnspecified:typeof value.includeUnspecified==='boolean'?value.includeUnspecified:true};
}
const letterSize=/^(?:XXS|XS|S|M|L|XL|XXL|XXXL|XXXXL|[56]XL)$/;
/** True for labels like M, XL or S/M. A numeric, waist or shoe size is never a letter size, so those stay ambiguous. */
export const isLetterSize=label=>{const tokens=label.split(/[|/]/).map(sizeKey).filter(Boolean);return tokens.length>0&&tokens.every(token=>letterSize.test(token));};
export function matchesMySizes(item,sizing){
 if(!sizing?.enabled||!sizing.selected.length)return true;
 if(sizing.groups&&['homeware','beauty','toys'].includes(classifyListing(item).productGroup))return true;
 const label=sizeKey(item.size??'');
 if(unknown.has(label))return sizing.includeUnspecified;
 if(oneSize.has(label))return sizing.includeOneSize;
 // A waist/length pair is kept intact: 32/30 is not silently converted to W32 or size 30.
 if(!sizing.groups)return matchesSizeLabels(label,sizing.selected);
 const group=classifyListing(item).sizeGroup;
 if(group==='none')return true;
 if(group==='unknown'){
  // The category is unknown, but a letter size (XL, S/M…) is a clothing size whatever the item is, so a wrong one can be ruled out.
  // This only ever hides: a matching size still follows the include-unspecified setting, as it always has.
  // With no clothing sizes selected there is nothing to compare against, so the setting decides alone.
  if(isLetterSize(label)&&sizing.groups.clothing.length&&!matchesSizeLabels(label,sizing.groups.clothing))return false;
  return sizing.includeUnspecified;
 }
 const selected=group==='waist'?[...sizing.groups.waist,...sizing.groups.clothing]:sizing.groups[group];
 return matchesSizeLabels(label,selected??[]);
}
export function matchesSizeLabels(raw,selected){
 const label=sizeKey(raw);
 const tokens=/^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/.test(label)?[label]:[label,...label.split(/[|/]/).map(sizeKey)];
 const keys=new Set(tokens);
 return selected.some(value=>keys.has(sizeKey(value)));
}

export function groupedSizing(raw,confirmedClothing=[]){
 const sizing=normalizeSizing(raw);
 if(sizing.groups)return sizing;
 const groups={clothing:[],waist:[],shoes:[],other:[]};
 for(const label of sizing.selected){const key=sizeKey(label);groups[/^W\d/.test(key)?'waist':confirmedClothing.some(value=>sizeKey(value)===key)?'clothing':/^(XXS|XS|S|M|L|XL|XXL|XXXL|XXXXL|[56]XL)$/.test(key)?'clothing':'other'].push(label);}
 return {...sizing,groups};
}
