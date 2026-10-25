'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createBackup} from './settings-backup';
import type {Preferences} from './preferences';
import type {Listing} from './catalog';
import {listingKey} from './domain/recommendations.mjs';
import {pendingOperations,queueOperation,acknowledgeOperation} from './domain/learning-outbox.mjs';
export type DislikeReason='style'|'price'|'data'|'unspecified';
type Operation={id:string;action:'events'|'exposure';events?:unknown[];exposure?:unknown};
const locks=new Set<string>();
function readQueue(key:string):Operation[]{return pendingOperations(localStorage,key);}
export async function learningRequest(body?:unknown){const response=await fetch('/api/learning',{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const value=await response.json();if(!response.ok)throw Error(value.error??'Learning history is unavailable.');return value;}
export function useLearningOutbox(identity:string|null){
 const storageKey=identity?'forme-learning-outbox-v1:'+identity:null;
 const [pending,setPending]=useState(0),[error,setError]=useState('');const currentKey=useRef(storageKey);currentKey.current=storageKey;
 const refresh=useCallback(()=>{if(storageKey)try{setPending(readQueue(storageKey).length);}catch(e){setError((e as Error).message);}},[storageKey]);
 const flush=useCallback(async()=>{
  if(!storageKey||locks.has(storageKey))return;locks.add(storageKey);
  try{let queue=readQueue(storageKey);while(queue.length){const op=queue[0];await learningRequest({action:op.action,...(op.action==='events'?{events:op.events}:{exposure:op.exposure})});if(currentKey.current!==storageKey)return;acknowledgeOperation(localStorage,storageKey,op.id);queue=readQueue(storageKey);setPending(queue.length);}setError('');}
  catch(e){setError((e as Error).message);}finally{locks.delete(storageKey);window.dispatchEvent(new Event('forme-learning-queue'));}
 },[storageKey]);
 const enqueue=useCallback((operation:Operation)=>{if(!storageKey)return false;try{queueOperation(localStorage,storageKey,operation);setPending(readQueue(storageKey).length);window.dispatchEvent(new Event('forme-learning-queue'));void flush();return true;}catch(e){setError((e as Error).message);return false;}},[storageKey,flush]);
 useEffect(()=>{if(!storageKey){setPending(0);return;}refresh();void flush();const wake=()=>void flush(),timer=setInterval(wake,15000);window.addEventListener('online',wake);window.addEventListener('forme-learning-queue',refresh);window.addEventListener('storage',refresh);return()=>{clearInterval(timer);window.removeEventListener('online',wake);window.removeEventListener('forme-learning-queue',refresh);window.removeEventListener('storage',refresh);};},[storageKey,flush,refresh]);
 return {pending,error,setError,enqueue,flush};
}
export function useLearning({settings,savedListings,items,identity,discover}:{settings:Preferences;savedListings:Listing[];items:Listing[];identity:string|null;discover:boolean}){
 const {enqueue,flush,pending,error,setError}=useLearningOutbox(identity);
 const [view,setView]=useState<{id:string;items:Listing[];selectedKeys:string[]|null;selectedName:string}|null>(null);
 const generation=useRef(0),seen=useRef(new Map<string,string>());
 const profile=useMemo(()=>createBackup(settings,{mode:'live',collapsed:false},savedListings),[settings,savedListings]);
 const fingerprint=JSON.stringify([settings,savedListings,items]);
 const latest=useRef({view});latest.current={view};
 useEffect(()=>{const clear=()=>{setView(null);seen.current.clear();};clear();window.addEventListener('forme-learning-selection',clear);return()=>window.removeEventListener('forme-learning-selection',clear);},[identity]);
 useEffect(()=>{
  if(!identity||!discover||!items.length)return;const version=++generation.current;
  const timer=setTimeout(()=>{void learningRequest({action:'snapshot',profile,items,channel:'shopping'}).then(result=>{if(version===generation.current){setView(result);seen.current.clear();}}).catch(e=>{if(version===generation.current)setError(e.message);});},350);
  return()=>{clearTimeout(timer);generation.current++;};
 },[identity,discover,fingerprint]);
 const visible=useCallback((item:Listing)=>{
  const current=latest.current.view,key=listingKey(item);if(!current?.items.some(row=>listingKey(row)===key))return undefined;
  const token=current.id+'|'+key,previous=seen.current.get(token);if(previous)return previous;
  const id=crypto.randomUUID();if(enqueue({id,action:'exposure',exposure:{id,runId:current.id,keys:[key],channel:'shopping'}})){seen.current.set(token,id);return id;}return undefined;
 },[enqueue,view?.id]);
 const record=useCallback((key:string,action:string,item?:Listing,reason?:DislikeReason,targetId?:string)=>{
  if(!identity||item&&item.source!=='vinted')return undefined;
  const id=crypto.randomUUID(),exposureId=item?visible(item):undefined;
  const event={id,key,action,channel:'shopping',occurredAt:new Date().toISOString(),...(item?{item}:{}),...(reason?{reason}:{}),...(targetId?{targetId}:{}),...(exposureId?{exposureId}:{})};
  return enqueue({id,action:'events',events:[event]})?id:undefined;
 },[identity,visible,enqueue]);
 return {record,visible,flush,pending,error,selectedKeys:view?.selectedKeys??null,selectedName:view?.selectedName??'current'};
}
