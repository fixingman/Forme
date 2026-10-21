'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createBackup,parseBackup,type Backup} from '@/lib/settings-backup';
import type {Preferences} from '@/lib/preferences';
import type {Listing} from '@/lib/catalog';
import {decideSync,syncMessage} from '@/lib/profile-sync-decision.mjs';

export type SyncState='off'|'signed-out'|'loading'|'saved'|'saving'|'offline';
export type Account={email:string;role:'owner'|'member'}|null;
type Marker={user:string;rev:number;dirty:boolean};
type Remote={backup:unknown;revision:number;updatedAt:string}|null;
const MARKER='forme-sync',ASIDE='forme-v2-before-sync',DEBOUNCE=1000;
const readMarker=():Marker|null=>{try{const value=JSON.parse(localStorage.getItem(MARKER)??'null');return value&&typeof value.user==='string'&&Number.isInteger(value.rev)?{user:value.user,rev:value.rev,dirty:!!value.dirty}:null;}catch{return null;}};
const writeMarker=(marker:Marker)=>{try{localStorage.setItem(MARKER,JSON.stringify(marker));}catch{}};
const fingerprint=(data:Preferences,saved:Listing[])=>JSON.stringify({s:data,l:saved.filter(item=>data.saved.includes(item.id))});

/**
 * Keeps preferences and saved items in step with the signed-in account (when there is one).
 * localStorage stays the working copy; this only reconciles it with the server, using the revision rules in
 * profile-sync-decision.mjs. With no Supabase or no session it does nothing and the app behaves as before.
 */
export function useProfileSync({data,savedListings,ready,mode,collapsed,apply,notify}:{data:Preferences;savedListings:Listing[];ready:boolean;mode:'live'|'demo';collapsed:boolean;apply:(backup:Backup)=>void;notify:(message:string)=>void}){
 const [state,setState]=useState<SyncState>('loading'),[account,setAccount]=useState<Account>(null);
 const latest=useRef({data,savedListings,mode,collapsed,apply,notify});latest.current={data,savedListings,mode,collapsed,apply,notify};
 const user=useRef<string|null>(null),synced=useRef<string|null>(null),busy=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null);

 const adopt=useCallback((remote:NonNullable<Remote>,message?:string)=>{
  const now=latest.current;
  try{
   const backup=parseBackup(remote.backup);
   if(message){try{localStorage.setItem(ASIDE,JSON.stringify({savedAt:new Date().toISOString(),settings:now.data,savedListings:now.savedListings}));}catch{}}
   synced.current=fingerprint(backup.settings,backup.savedListings);
   now.apply(backup);
   writeMarker({user:user.current!,rev:remote.revision,dirty:false});
   if(message)now.notify(message);
   return true;
  }catch{return false;}
 },[]);

 const fetchRemote=useCallback(async():Promise<{sync:string;user?:{email:string;role:'owner'|'member'};profile?:Remote}>=>{
  const response=await fetch('/api/profile',{cache:'no-store'});
  if(!response.ok)throw new Error(`profile ${response.status}`);
  return response.json();
 },[]);

 const push=useCallback(async()=>{
  if(busy.current||!user.current)return;
  const marker=readMarker(),now=latest.current;
  if(!marker||marker.user!==user.current)return;
  busy.current=true;setState('saving');
  try{
   const backup=createBackup(now.data,{mode:now.mode,collapsed:now.collapsed},now.savedListings);
   const response=await fetch('/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({backup,expectedRevision:marker.rev})});
   if(response.ok){const {revision}=await response.json();synced.current=fingerprint(now.data,now.savedListings);writeMarker({user:user.current,rev:revision,dirty:false});setState('saved');return;}
   if(response.status===409){const {profile}=await response.json();if(profile&&adopt(profile,syncMessage.conflict))setState('saved');else setState('offline');return;}
   setState(response.status===401||response.status===403?'signed-out':'offline');
  }catch{setState('offline');}
  finally{busy.current=false;}
 },[adopt]);

 const reconcile=useCallback(async()=>{
  if(busy.current)return;
  try{
   const result=await fetchRemote();
   if(result.sync!=='ready'||!result.user){setAccount(null);setState(result.sync==='signed-out'?'signed-out':'off');return;}
   setAccount(result.user);user.current=result.user.email;
   const action=decideSync({marker:readMarker(),remote:result.profile??null,user:result.user.email});
   if(action==='push-initial'){
    synced.current=null;writeMarker({user:result.user.email,rev:0,dirty:true});await push();
   }else if(action==='noop'){setState('saved');}
   else if(action==='push'){await push();}
   else if(action==='pull'||action==='pull-conflict'||action==='adopt-first'){
    const message=action==='pull'?undefined:syncMessage[action];
    setState(adopt(result.profile!,message)?'saved':'offline');
   }
  }catch{setState('offline');}
 },[adopt,fetchRemote,push]);

 // Initial reconcile once local preferences are loaded.
 useEffect(()=>{if(ready)void reconcile();},[ready,reconcile]);

 // Local edits: mark unsynced immediately, push after a short pause.
 useEffect(()=>{
  if(!ready||!user.current)return;
  const print=fingerprint(data,savedListings);
  if(synced.current===null){synced.current=print;return;}
  if(print===synced.current)return;
  const marker=readMarker();if(marker)writeMarker({...marker,dirty:true});
  if(timer.current)clearTimeout(timer.current);
  timer.current=setTimeout(()=>void push(),DEBOUNCE);
  return()=>{if(timer.current)clearTimeout(timer.current);};
 },[data,savedListings,ready,push,account]);

 // Pick up changes from the other device when this tab comes back to the foreground or the network returns.
 useEffect(()=>{
  if(!ready)return;
  const wake=()=>{if(document.visibilityState==='visible'&&user.current)void reconcile();};
  document.addEventListener('visibilitychange',wake);window.addEventListener('online',wake);
  return()=>{document.removeEventListener('visibilitychange',wake);window.removeEventListener('online',wake);};
 },[ready,reconcile]);

 return {state,account,retry:reconcile};
}
