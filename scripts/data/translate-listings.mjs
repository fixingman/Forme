import {passesListingReview} from '../../lib/domain/listing-review.mjs';
// Explicit offline command: Google is contacted only with --google and a server-side key.
import {readFile,writeFile,rename,mkdir,open,unlink} from 'node:fs/promises';
import {englishListing,pendingTitles} from '../../lib/domain/listing-language.mjs';
try{process.loadEnvFile('.env.local');}catch(error){if(error.code!=='ENOENT')throw error;}
await mkdir('.forme-data',{recursive:true});
const lock=await open('.forme-data/refresh.lock','wx').catch(()=>{throw new Error('A collection/translation job is already locked.');});
const atomic=async(path,value)=>{await writeFile(`${path}.tmp`,JSON.stringify(value,null,2)+'\n');await rename(`${path}.tmp`,path);};
try {
 const snapshot=JSON.parse(await readFile('public/data/vinted.json','utf8'));
 const cache=JSON.parse(await readFile('data/title-translations.json','utf8'));
 const pending=pendingTitles(snapshot.items,cache);
 if(process.argv.includes('--google')&&pending.length){
  if(!process.env.GOOGLE_TRANSLATE_API_KEY)throw new Error('Set GOOGLE_TRANSLATE_API_KEY in .env.local to translate new titles. No request sent.');
  // One explicit batch, bounded input, no retries or background billing.
  if(pending.length>100||pending.reduce((sum,text)=>sum+[...text].length,0)>5000)throw new Error('Translation exceeds the 100-title / 5,000-character per-run limit.');
  const endpoint=new URL('https://translation.googleapis.com/language/translate/v2');endpoint.searchParams.set('key',process.env.GOOGLE_TRANSLATE_API_KEY);
  let response;try{response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q:pending,target:'en',format:'text',model:'nmt'}),signal:AbortSignal.timeout(45000),redirect:'error'});}catch{throw new Error('Translation request failed. No retry; existing snapshot retained.');}
  if(!response.ok)throw new Error(`Translation HTTP ${response.status}. Existing snapshot retained.`);
  const body=await response.json(),results=body.data?.translations;
  if(!Array.isArray(results)||results.length!==pending.length||results.some(row=>typeof row.translatedText!=='string'||!row.translatedText.trim()))throw new Error('Invalid translation response. Existing snapshot retained.');
  pending.forEach((title,index)=>{cache[title]={text:results[index].translatedText,provider:'google',target:'en'};});
  await atomic('data/title-translations.json',cache);
 }
 snapshot.items=snapshot.items.filter(passesListingReview).map(item=>englishListing(item,cache));
 await atomic('public/data/vinted.json',snapshot);
 console.log(JSON.stringify({listings:snapshot.items.length,pendingTitles:pendingTitles(snapshot.items,cache).length,googleRequested:process.argv.includes('--google')}));
}finally{await lock.close();await unlink('.forme-data/refresh.lock');}
