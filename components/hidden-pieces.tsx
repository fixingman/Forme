'use client';
import Link from 'next/link';
import {listingKey} from '@/lib/recommendations.mjs';
import type {Listing} from '@/lib/catalog';
export default function HiddenPieces({keys,source,restore}:{keys:string[];source:Listing[];restore:(key:string)=>void}){
 return <section className="panel" id="hidden-pieces"><h3>Hidden pieces</h3><p>Not interested hides a piece from Discover. You can bring it back here.</p>{keys.length?<ul className="hidden-feedback-list">{keys.map(key=>{const item=source.find(item=>listingKey(item)===key);return <li key={key}><span>{item?<Link href={`/items/${item.id}`}>{item.brand} · {item.title}</Link>:'A piece outside the current collection'}</span><button className="textbutton" aria-label={`Restore ${item?.title??key}`} onClick={()=>restore(key)}>Restore</button></li>;})}</ul>:<p className="small section-note">You haven’t hidden any pieces.</p>}</section>;
}
