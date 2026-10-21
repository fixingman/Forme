import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeVinted} from '../../lib/domain/vinted-normalize.mjs';
const row={id:123456,title:'Coat',brand_title:'COS',price:{amount:'120.50',currency_code:'SEK'},url:'https://www.vinted.se/items/123456-coat',photo:{url:'https://images1.vinted.net/image.webp'},user:{private:'discard'}};
test('normalization preserves provenance without inventing timestamps or exposing sellers',()=>{
 const item=normalizeVinted(row,'2026-10-19T12:00:00Z',{firstSeenAt:'2026-10-18T12:00:00Z'});
 assert.equal(item.sourceKey,'vinted:123456');assert.equal(item.price,120.5);assert.equal(item.firstSeenAt,'2026-10-18T12:00:00Z');
 assert.equal(item.rarity,0);assert.equal(item.style,'');assert.equal(item.age,1);assert.equal(item.user,undefined);
});
test('invalid currency, price, IDs and URLs are rejected',()=>{
 for(const patch of [{price:{amount:'x',currency_code:'SEK'}},{price:{amount:'12',currency_code:'EUR'}},{id:NaN},{url:'https://evil.example/items/123456-coat'},{photo:{url:'javascript:alert(1)'}}])assert.equal(normalizeVinted({...row,...patch},'now'),null);
});

test('English localization retains originals, is idempotent, and never reuses stale translations',async()=>{
 const {englishListing}=await import('../../lib/domain/listing-language.mjs');
 const source={source:'vinted',title:'Acne skinnjacka',condition:'Mycket bra'};
 const translated=englishListing(source);
 assert.equal(translated.title,'Acne leather jacket');assert.equal(translated.condition,'Very good');
 assert.equal(translated.originalTitle,source.title);assert.equal(translated.originalCondition,source.condition);
 assert.deepEqual(englishListing(translated),translated);
 const changed=englishListing({...source,title:'Changed seller title',condition:'Unknown value'});
 assert.equal(changed.title,'Changed seller title');assert.equal(changed.titleTranslation,'pending');
 assert.equal(changed.condition,'Condition not translated');assert.equal(changed.originalCondition,'Unknown value');
});

test('explicitly reviewed brand mismatches are excluded without treating other rows as verified',async()=>{
 const {passesListingReview}=await import('../../lib/domain/listing-review.mjs');
 assert.equal(passesListingReview({source:'vinted',id:7219762193}),false);
 assert.equal(passesListingReview({source:'vinted',id:123456}),true);
 assert.equal(passesListingReview({id:1}),true);
 assert.equal(normalizeVinted({...row,id:7219762193,url:'https://www.vinted.se/items/7219762193-test'},'now'),null);
});
