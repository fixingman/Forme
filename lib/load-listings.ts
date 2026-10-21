import {trustedSnapshot} from './data-trust.mjs';
import type {Listing} from './catalog';
export type ListingSnapshot={quality?:ReturnType<typeof trustedSnapshot>['quality'];items:Listing[];fetchedAt:string;queries:string[];discovery?:{brands:string[];reportedCredits:number};collection?:{plannedQueries:number;collectedQueries:number;skippedSearches:number}};
export async function loadListings(signal?:AbortSignal):Promise<ListingSnapshot>{
 let response:Response;
 try{response=await fetch('/api/listings',{signal,cache:'no-store'});if(!response.ok)response=await fetch('/data/vinted.json',{signal,cache:'no-store'});}catch(error){if(signal?.aborted)throw error;response=await fetch('/data/vinted.json',{signal,cache:'no-store'});}
 if(!response.ok)throw new Error('Live listings could not be loaded. Please try again.');
 const value=await response.json();if(!Array.isArray(value.items)||typeof value.fetchedAt!=='string'||!Number.isFinite(Date.parse(value.fetchedAt)))throw new Error('Live listings could not be loaded. Please try again.');
 return trustedSnapshot({...value,queries:Array.isArray(value.queries)?value.queries.filter((query:unknown)=>typeof query==='string'):[]}) as ListingSnapshot;
}
