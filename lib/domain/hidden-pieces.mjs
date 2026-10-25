import {signalKey} from './taste-profile.mjs';
import {vintedItemUrl} from './vinted-urls.mjs';

/**
 * Turns the hidden keys into rows a person can recognise, newest first.
 * A piece still in the collection (or kept as a saved copy) shows its live details. One that has left the collection falls back to
 * what was remembered when it was hidden (brand, and for newer ones title, photo and listing link). One hidden before that was
 * remembered has only its key; it is still shown as a recognisable Vinted listing with a link, never as an anonymous row.
 */
/**
 * @param {{keys?:string[],source?:any[],remembered?:{key:string,brand:string,title?:string,imageUrl?:string,sourceUrl?:string}[]}} [input]
 */
export function hiddenEntries({keys=[],source=[],remembered=[]}={}){
 const live=new Map(source.map(item=>[signalKey(item),item])),memory=new Map(remembered.map(row=>[row.key,row]));
 return [...keys].reverse().map(key=>{
  const item=live.get(key),note=memory.get(key),id=/^vinted:(\d+)$/.exec(key)?.[1];
  const fallbackUrl=id?vintedItemUrl(`https://www.vinted.se/items/${id}`):undefined;
  if(item)return {key,status:'collection',brand:item.brand,title:item.title,id:item.id,imageUrl:item.imageUrl,image:item.image,sourceUrl:item.sourceUrl??note?.sourceUrl??fallbackUrl};
  if(note?.title)return {key,status:'remembered',brand:note.brand,title:note.title,imageUrl:note.imageUrl,sourceUrl:note.sourceUrl??fallbackUrl};
  return {key,status:'bare',brand:note?.brand??'',title:'',imageUrl:note?.imageUrl,sourceUrl:note?.sourceUrl??fallbackUrl,label:id?`Vinted listing ${id}`:key.startsWith('demo:')?'Sample piece':'Hidden piece'};
 });
}
const fold=text=>String(text??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
/** Every typed word must appear in the brand, title or listing number, in any order. A blank query keeps everything. */
/** @template T @param {T[]} entries @param {string} query @returns {T[]} */
export function searchHidden(entries,query){
 const words=fold(query).split(/\s+/).filter(Boolean);
 if(!words.length)return entries;
 return entries.filter(entry=>{const text=fold(`${entry.brand} ${entry.title} ${entry.label??''} ${entry.key}`);return words.every(word=>text.includes(word));});
}
