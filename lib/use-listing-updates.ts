'use client';
import {useEffect,useRef} from 'react';
import {loadListings,type ListingSnapshot} from './load-listings';

// Reads FORME's existing dataset only. Never calls collection or translation APIs.
export function useListingUpdates(enabled:boolean,apply:(value:ListingSnapshot)=>void){
 const latest=useRef(apply);latest.current=apply;
 useEffect(()=>{
  if(!enabled)return;
  let lastCheck=Date.now(),pending:AbortController|null=null,stopped=false;
  const check=async()=>{
   if(stopped||pending||document.visibilityState!=='visible'||!navigator.onLine||Date.now()-lastCheck<60000)return;
   lastCheck=Date.now();const controller=new AbortController();pending=controller;
   try{const value=await loadListings(controller.signal);if(!stopped)latest.current(value);}catch{/* Keep the last usable collection on background read errors. */}
   finally{if(pending===controller)pending=null;}
  };
  const wake=()=>{void check();};
  const timer=setInterval(wake,5*60000);
  document.addEventListener('visibilitychange',wake);window.addEventListener('focus',wake);window.addEventListener('online',wake);
  return()=>{stopped=true;pending?.abort();clearInterval(timer);document.removeEventListener('visibilitychange',wake);window.removeEventListener('focus',wake);window.removeEventListener('online',wake);};
 },[enabled]);
}
