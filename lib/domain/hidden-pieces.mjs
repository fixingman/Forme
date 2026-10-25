import {signalKey} from './taste-profile.mjs';
import {vintedItemUrl} from './vinted-urls.mjs';
import {REASONS,REASON_LABELS} from './dislike-reasons.mjs';

/**
 * Turns the hidden keys into rows a person can recognise, newest first.
 * A piece still in the collection (or kept as a saved copy) shows its live details. One that has left the collection falls back to
 * what was remembered when it was hidden (brand, and for newer ones title, photo and listing link). One hidden before that was
 * remembered has only its key; it is still shown as a recognisable Vinted listing with a link, never as an anonymous row.
 */
/**
 * @param {{keys?:string[],source?:any[],remembered?:{key:string,brand:string,title?:string,imageUrl?:string,sourceUrl?:string,reason?:string}[]}} [input]
 */
export function hiddenEntries({keys=[],source=[],remembered=[]}={}){
 const live=new Map(source.map(item=>[signalKey(item),item])),memory=new Map(remembered.map(row=>[row.key,row]));
 return [...keys].reverse().map(key=>{
  const item=live.get(key),note=memory.get(key),reason=note?.reason&&note.reason!=='unspecified'&&REASON_LABELS[note.reason]?note.reason:undefined,id=/^vinted:(\d+)$/.exec(key)?.[1];
  const fallbackUrl=id?vintedItemUrl(`https://www.vinted.se/items/${id}`):undefined;
  if(item)return {key,reason,status:'collection',brand:item.brand,title:item.title,id:item.id,imageUrl:item.imageUrl,image:item.image,sourceUrl:item.sourceUrl??note?.sourceUrl??fallbackUrl};
  if(note?.title)return {key,reason,status:'remembered',brand:note.brand,title:note.title,imageUrl:note.imageUrl,sourceUrl:note.sourceUrl??fallbackUrl};
  return {key,reason,status:'bare',brand:note?.brand??'',title:'',imageUrl:note?.imageUrl,sourceUrl:note?.sourceUrl??fallbackUrl,label:id?`Vinted listing ${id}`:key.startsWith('demo:')?'Sample piece':'Hidden piece'};
 });
}
const fold=text=>String(text??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
/** Every typed word must appear in the brand, title or listing number, in any order. A blank query keeps everything. */
/** @template T @param {T[]} entries @param {string} query @returns {T[]} */
export function searchHidden(entries,query){
 const words=fold(query).split(/\s+/).filter(Boolean);
 if(!words.length)return entries;
 return entries.filter(entry=>{const text=fold(`${entry.brand} ${entry.title} ${entry.label??''} ${entry.reason?REASON_LABELS[entry.reason]:''} ${entry.key}`);return words.every(word=>text.includes(word));});
}

/** Entries with no stored reason (plain hides and "No reason") share one bucket. */
export const NO_REASON='none';
const bucket=entry=>entry.reason&&entry.reason!=='unspecified'&&REASON_LABELS[entry.reason]?entry.reason:NO_REASON;
/**
 * How many hidden pieces sit under each reason, in the order the reasons are offered, "No reason" last. Only reasons that occur
 * are listed, so the filter never offers an empty choice.
 * @param {{reason?:string}[]} entries @returns {{value:string,label:string,count:number}[]}
 */
export function reasonCounts(entries){
 const counts=new Map();
 for(const entry of entries){const value=bucket(entry);counts.set(value,(counts.get(value)??0)+1);}
 return [...REASONS.filter(reason=>reason!=='unspecified'),NO_REASON].filter(value=>counts.has(value)).map(value=>({value,label:value===NO_REASON?REASON_LABELS.unspecified:REASON_LABELS[value],count:counts.get(value)}));
}
/** @template {{reason?:string}} T @param {T[]} entries @param {string} value "all", a reason, or NO_REASON @returns {T[]} */
export function filterByReason(entries,value){
 if(!value||value==='all')return entries;
 return entries.filter(entry=>bucket(entry)===value);
}
/** Hidden pieces are revealed a page at a time so a long list stays quick to scan. */
export const PAGE_SIZE=20;
