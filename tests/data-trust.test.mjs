import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {trustedSnapshot,listingProblems,availability,freshness,canBrowse} from '../lib/data-trust.mjs';
import {normalizeVinted} from '../scripts/vinted-normalize.mjs';
import {openStore} from '../lib/server/store.mjs';
import {recommendListings} from '../lib/recommendations.mjs';
const at='2026-10-20T10:00:00.000Z',now=Date.parse('2026-10-21T12:00:00Z');
const item={id:123456,source:'vinted',sourceId:'123456',sourceKey:'vinted:123456',sourceUrl:'https://www.vinted.se/items/123456-shirt',imageUrl:'https://images1.vinted.net/photo.webp',title:'Cotton shirt',brand:'Auralee',condition:'Good',size:'M',price:100,currency:'SEK',fetchedAt:at,firstSeenAt:at,age:1};
test('invalid records are excluded, duplicate identity uses the newest observation, reports survive API validation',()=>{
 const snapshot=trustedSnapshot({fetchedAt:at,items:[{...item,user:{private:'discard'}},{...item,title:'Older',fetchedAt:'2026-10-19T10:00:00Z',firstSeenAt:'2026-10-19T10:00:00Z'},{...item,id:123457,sourceKey:'vinted:123457',sourceId:'123457',price:null},null]},now);
 assert.equal(snapshot.items[0].user,undefined);assert.equal(snapshot.items.length,1);assert.equal(snapshot.items[0].title,'Cotton shirt');assert.equal(snapshot.quality.rejected,3);
 const again=trustedSnapshot(snapshot,now);assert.equal(again.quality.input,4);assert.equal(again.quality.rejected,3);
 for(const patch of [{sourceUrl:'https://evil.example/items/123456-shirt'},{sourceUrl:'https://user:pass@www.vinted.se/items/123456-shirt'},{sourceId:'99999'},{price:-1},{currency:'EUR'},{imageUrl:'https://vinted.net.evil.test/photo'},{fetchedAt:'2027-01-01T00:00:00Z'},{firstSeenAt:'2026-10-22T00:00:00Z'}])assert.ok(listingProblems({...item,...patch},now).length);
});
test('freshness uses individual observations and missing availability never becomes available',()=>{
 const snapshot=trustedSnapshot({fetchedAt:'2026-10-21T10:00:00Z',items:[{...item,fetchedAt:'2026-10-01T10:00:00Z',firstSeenAt:'2026-10-01T10:00:00Z'}]},now);
 assert.equal(snapshot.quality.stale,1);assert.equal(snapshot.quality.unknownAvailability,1);
 assert.equal(availability(item).state,'unknown');assert.equal(availability({...item,availability:'sold'}).state,'unknown');
 const sold={...item,availability:'sold',availabilitySource:'provider',availabilityObservedAt:at};
 assert.equal(canBrowse(sold),false);assert.equal(canBrowse(item),true);
 assert.equal(recommendListings([sold],{following:['Our Legacy'],excluded:[],saved:[],dismissed:[],sizing:{enabled:false}}).length,0);
 assert.equal(freshness({...item,observedAt:'not a date'},now).state,'unknown');
});
test('provider normalization rejects null/blank prices, wrong timestamps, credentials and non-string titles',()=>{
 const row={id:123456,title:'Shirt',brand_title:'COS',price:{amount:'100',currency_code:'SEK'},url:item.sourceUrl,photo:{url:item.imageUrl}};
 for(const amount of [null,undefined,'',' ',false,{},[]])assert.equal(normalizeVinted({...row,price:{amount,currency_code:'SEK'}},at),null);
 assert.equal(normalizeVinted(row,'now'),null);assert.equal(normalizeVinted({...row,title:{}},at),null);
 assert.equal(normalizeVinted({...row,url:'https://user:pass@www.vinted.se/items/123456-shirt'},at),null);
 assert.equal(availability(normalizeVinted(row,at)).state,'unknown');
 assert.equal(availability(normalizeVinted({...row,is_sold:true},at)).state,'sold');
 assert.equal(availability(normalizeVinted({...row,is_reserved:true},at)).state,'reserved');
 assert.equal(availability(normalizeVinted({...row,is_sold:false,is_closed:false,is_reserved:false},at)).state,'unknown');
});
test('late imports cannot roll back prices or invent changes; conflicting observations roll back atomically',()=>{
 const dir=mkdtempSync(join(tmpdir(),'forme-trust-')),store=openStore(join(dir,'test.sqlite'));
 try{
  store.importSnapshot({fetchedAt:at,items:[{...item,previousPrice:999,priceChangedAt:at}]});assert.equal(store.snapshot().items[0].previousPrice,undefined);
  const later='2026-10-21T10:00:00Z';store.importSnapshot({fetchedAt:later,items:[{...item,price:80,fetchedAt:later}]});
  store.importSnapshot({fetchedAt:'2026-10-19T10:00:00Z',items:[{...item,price:120,fetchedAt:'2026-10-19T10:00:00Z',firstSeenAt:'2026-10-19T10:00:00Z'}]});
  const current=store.snapshot();assert.equal(current.fetchedAt,later);assert.equal(current.items[0].price,80);assert.equal(current.items[0].previousPrice,100);assert.equal(current.items[0].observedAt,later);
  assert.throws(()=>store.importSnapshot({fetchedAt:later,items:[{...item,price:77,fetchedAt:'2026-10-21T12:00:00+02:00'}]}),/Conflicting prices/);
  assert.throws(()=>store.importSnapshot({fetchedAt:later,items:[{...item,price:NaN}]}));assert.equal(store.snapshot().items[0].price,80);
  assert.throws(()=>store.importSnapshot({fetchedAt:later,items:[{...item,currency:'EUR',fetchedAt:'2026-10-21T11:00:00Z'}]}),/currency/);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('invalid or wrong-target translation cache entries fall back to the original without invented English',async()=>{
 const {englishListing,pendingTitles}=await import('../lib/listing-language.mjs');
 for(const entry of [{text:'French text',provider:'reviewed',target:'fr'},{text:{bad:true},provider:'reviewed',target:'en'},{text:'',provider:'google',target:'en'}]){const cache={'Cotton shirt':entry};assert.equal(englishListing(item,cache).title,'Cotton shirt');assert.equal(englishListing(item,cache).titleTranslation,'pending');assert.deepEqual(pendingTitles([item],cache),['Cotton shirt']);}
});
test('legacy import-only timestamps never make the source observation or price history fresher',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const dir=mkdtempSync(join(tmpdir(),'forme-legacy-trust-')),path=join(dir,'test.sqlite');let store=openStore(path);
 try{
  store.importSnapshot({fetchedAt:at,items:[item]});store.close();
  const db=new DatabaseSync(path);db.prepare('UPDATE observations SET observed_at=?').run('2026-10-21T10:00:00Z');db.close();
  store=openStore(path);const current=store.snapshot().items[0];assert.equal(current.observedAt,at);assert.equal(current.previousPrice,undefined);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
