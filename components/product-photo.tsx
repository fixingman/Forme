'use client';
import {useEffect,useState} from 'react';
import {ImageOff} from 'lucide-react';
// `sourceUrl` is passed only where the photo has room for a link (the item page). On cards the whole card is already a link,
// so they show the plain placeholder. The listing may simply have a newer photo on Vinted than the one we stored.
export default function ProductPhoto({src,alt,sourceUrl}:{src?:string;alt:string;sourceUrl?:string}){
 const [failed,setFailed]=useState(!src);
 useEffect(()=>setFailed(!src),[src]);
 return failed
  ?<div className="photo-fallback" role="img" aria-label={`Photo unavailable: ${alt}`}><ImageOff aria-hidden="true"/><span>Photo unavailable</span>{sourceUrl&&<><span className="photo-fallback-note">It may have changed on Vinted.</span><a className="photo-fallback-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">Open on Vinted ↗</a></>}</div>
  :<img src={src} alt={alt} loading="lazy" onError={()=>setFailed(true)}/>;
}
