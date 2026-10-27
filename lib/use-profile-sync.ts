'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createBackup,parseBackup,type Backup} from '@/lib/settings-backup';
import type {Preferences} from '@/lib/preferences';
import type {Listing} from '@/lib/catalog';
import {decideSync,syncMessage} from '@/lib/profile-sync-decision.mjs';
import {mergeHides,mergedMessage} from '@/lib/domain/profile-merge.mjs';

export type SyncState='off'|'signed-out'|'loading'|'saved'|'saving'|'offline';
export type Account={email:string;role:'owner'|'member'}|null;
type Marker={user:string;rev:number;dirty:boolean};
type Remote={backup:unknown;revision:number;updatedAt:string}|null;
const MARKER='forme-sync',SYNC_AT='forme-sync-at',ASIDE='forme-v2-before-sync',DEBOUNCE=1000,FOLLOW_UP=250;
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const readMarker=():Marker|null=>{try{const value=JSON.parse(localStorage.getItem(MARKER)??'null');return value&&typeof value.user==='string'&&Number.isInteger(value.rev)?{user:value.user,rev:value.rev,dirty:!!value.dirty}:null;}catch{return null;}};
const writeMarker=(marker:Marker)=>{try{localStorage.setItem(MARKER,JSON.stringify(marker));}catch{}};
// When this browser last agreed with the account. A hide made after it has not reached the account yet.
const readSyncAt=():string|null=>{try{return localStorage.getItem(SYNC_AT);}catch{return null;}};
const writeSyncAt=(at:string)=>{try{localStorage.setItem(SYNC_AT,at);}catch{}};
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

 // `merge` is only for the same account's own earlier sync: the account copy still wins, but a hide made here since the last sync is
 // carried across and sent up, so a conflict can never drop a "Not for me". Returns false, 'applied' or 'merged' (a push follows).
 const adopt=useCallback((remote:NonNullable<Remote>,message?:string,merge=false):false|'applied'|'merged'=>{
  const now=latest.current;
  try{
   const backup=parseBackup(remote.backup);
   if(message){try{localStorage.setItem(ASIDE,JSON.stringify({savedAt:new Date().toISOString(),settings:now.data,savedListings:now.savedListings}));}catch{}}
   const kept=merge?mergeHides(now.data,backup.settings,{since:readSyncAt()}):null;
   synced.current=fingerprint(backup.settings,backup.savedListings);
   if(kept&&kept.carried>0){
    // The merged copy differs from the account's, so the normal edit path sees it as unsent and pushes it. The last-sync time is
    // not advanced until that succeeds: if it fails and another conflict comes, the same hides are carried again.
    now.apply({...backup,settings:kept.settings});
    writeMarker({user:user.current!,rev:remote.revision,dirty:true});
    now.notify(mergedMessage(kept.carried));
    return 'merged';
   }
   now.apply(backup);
   writeMarker({user:user.current!,rev:remote.revision,dirty:false});
   writeSyncAt(new Date().toISOString());
   if(message)now.notify(message);
   return 'applied';
  }catch{return false;}
 },[]);

 const fetchRemote=useCallback(async():Promise<{sync:string;user?:{email:string;role:'owner'|'member'};profile?:Remote}>=>{
  const response=await fetch('/api/profile',{cache:'no-store'});
  if(!response.ok)throw new Error(`profile ${response.status}`);
  return response.json();
 },[]);

 // One save runs at a time. Edits made while it is in flight are not dropped: when it finishes, anything newer than what it
 // sent is sent next (revision chained from the server's answer), and "saved" is only reported once nothing is waiting.
 const push=useCallback(async()=>{
  if(busy.current||!user.current)return;
  busy.current=true;
  try{
   for(;;){
    const marker=readMarker(),now=latest.current;
    if(!marker||marker.user!==user.current)return;
    const sent=fingerprint(now.data,now.savedListings);
    // A stale debounce timer can fire after a follow-up already sent everything: nothing is unsent then, so send nothing.
    // (A reloaded browser with unsent edits still has dirty set, so it does send.)
    if(!marker.dirty&&sent===synced.current){setState('saved');return;}
    setState('saving');
    const backup=createBackup(now.data,{mode:now.mode,collapsed:now.collapsed},now.savedListings),startedAt=new Date().toISOString();
    const response=await fetch('/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({backup,expectedRevision:marker.rev})});
    if(response.ok){
     const {revision}=await response.json();
     synced.current=sent;writeSyncAt(startedAt);
     const pending=fingerprint(latest.current.data,latest.current.savedListings)!==sent;
     writeMarker({user:user.current,rev:revision,dirty:pending});
     if(!pending){setState('saved');return;}
     await wait(FOLLOW_UP);   // let a burst of edits settle, then send the newest state in one request
     continue;
    }
    if(response.status===409){const {profile}=await response.json();{const result=profile?adopt(profile,syncMessage.conflict,true):false;setState(result==='merged'?'saving':result?'saved':'offline');}return;}
    setState(response.status===401||response.status===403?'signed-out':'offline');
    return;
   }
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
    const adopted=adopt(result.profile!,message,action==='pull-conflict');
    setState(adopted==='merged'?'saving':adopted?'saved':'offline');
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
  setState(previous=>previous==='saved'?'saving':previous);   // an unsent edit is never shown as saved
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
