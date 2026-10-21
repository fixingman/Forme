import translations from '../../data/title-translations.json' with {type:'json'};
const conditions={
 'ny med prislapp':'New with tags','ny utan prislapp':'New without tags',
 'mycket bra':'Very good','bra':'Good','tillfredsställande':'Satisfactory',
 'new with tags':'New with tags','new without tags':'New without tags',
 'very good':'Very good','good':'Good','satisfactory':'Satisfactory',
};
const cachedTitle=(title,cache)=>{const entry=Object.hasOwn(cache,title)?cache[title]:undefined;return entry&&entry.target==='en'&&['reviewed','google'].includes(entry.provider)&&typeof entry.text==='string'&&entry.text.trim()&&entry.text.length<=300?entry:undefined;};
export function englishListing(item,cache=translations){
 if(!item.source)return item;
 const originalTitle=typeof item.originalTitle==='string'?item.originalTitle:typeof item.title==='string'?item.title:'';
 const originalCondition=typeof item.originalCondition==='string'?item.originalCondition:typeof item.condition==='string'?item.condition:'';
 const translation=cachedTitle(originalTitle,cache);
 return {...item,originalTitle,originalCondition,
   title:translation?.text??originalTitle,
   titleTranslation:translation?translation.provider:'pending',
   condition:conditions[originalCondition.trim().toLowerCase()]??'Condition not translated'};
}
export function pendingTitles(items,cache=translations){
 return [...new Set(items.map(item=>item.originalTitle??item.title))].filter(title=>!cachedTitle(title,cache));
}
