import {trustedSnapshot} from './domain/data-trust.mjs';
import type {Listing} from './catalog';
export type ListingSnapshot={lastCollectionCheckAt?:string;quality?:ReturnType<typeof trustedSnapshot>['quality'];items:Listing[];fetchedAt:string;queries:string[];discovery?:{brands:string[];reportedCredits:number};collection?:{plannedQueries:number;collectedQueries:number;skippedSearches:number}};
const FAILED='Live listings could not be loaded. Please try again.';
const EMPTY='No live listings are available yet. Collect and publish some, or choose demo data under Settings → Collection tools.';
// Only a successful answer that really is JSON counts. A missing static file can come back as the app's own HTML page.
const isJson=(response:Response)=>response.ok&&/json/i.test(response.headers.get('content-type')??'');
export async function loadListings(signal?:AbortSignal):Promise<ListingSnapshot>{
 let response:Response|null=null,nothingYet=false;
 try{
  const api=await fetch('/api/listings',{signal,cache:'no-store'});
  if(isJson(api))response=api;else nothingYet=api.status===404;
 }catch(error){if(signal?.aborted)throw error;}
 if(!response){
  try{const fallback=await fetch('/data/vinted.json',{signal,cache:'no-store'});if(isJson(fallback))response=fallback;else nothingYet=nothingYet||fallback.status===404||fallback.ok;}
  catch(error){if(signal?.aborted)throw error;}
 }
 if(!response)throw new Error(nothingYet?EMPTY:FAILED);
 let value:any;try{value=await response.json();}catch{throw new Error(FAILED);}
 if(!Array.isArray(value?.items)||typeof value.fetchedAt!=='string'||!Number.isFinite(Date.parse(value.fetchedAt)))throw new Error(FAILED);
 return trustedSnapshot({...value,queries:Array.isArray(value.queries)?value.queries.filter((query:unknown)=>typeof query==='string'):[]}) as ListingSnapshot;
}
