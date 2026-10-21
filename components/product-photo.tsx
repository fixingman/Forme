'use client';
import {useEffect,useState} from 'react';
import {ImageOff} from 'lucide-react';
export default function ProductPhoto({src,alt}:{src?:string;alt:string}){
 const [failed,setFailed]=useState(!src);
 useEffect(()=>setFailed(!src),[src]);
 return failed?<div className="photo-fallback" role="img" aria-label={`Photo unavailable: ${alt}`}><ImageOff aria-hidden="true"/><span>Photo unavailable</span></div>:<img src={src} alt={alt} loading="lazy" onError={()=>setFailed(true)}/>;
}
