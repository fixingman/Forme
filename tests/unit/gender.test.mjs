import {test} from 'node:test';
import assert from 'node:assert/strict';
import {listingGender,matchesGender,normalizeGender} from '../../lib/domain/gender.mjs';
import {normalizeVinted} from '../../lib/domain/vinted-normalize.mjs';
import {recommendListings} from '../../lib/domain/recommendations.mjs';
const preference={selected:['men','unisex'],includeUnknown:false};
test('Men and Unisex hide women and unknown clothing without inventing labels',()=>{
 for(const gender of ['men','unisex'])assert.equal(matchesGender({title:'Cotton shirt',gender},preference),true);
 for(const gender of ['women','unknown'])assert.equal(matchesGender({title:'Cotton shirt',gender},preference),false);
 for(const title of ['Leather jacket','Dress','Skirt','Men and women shirt'])assert.equal(matchesGender({title,brand:'Our Legacy',size:'M'},preference),false);
 assert.equal(matchesGender({title:'Coffee mug'},preference),true);
 assert.equal(matchesGender({title:'Jacket'},{...preference,includeUnknown:true}),true);
 assert.equal(matchesGender({title:"Women's jacket"},{...preference,includeUnknown:true}),false);
 assert.deepEqual(normalizeGender(undefined),{selected:['men','women','unisex'],includeUnknown:true});
});
test('explicit title hints retain provenance, provider labels win, conflicts remain unknown',()=>{
 assert.deepEqual(listingGender({title:"Men’s cotton shirt"}),{gender:'men',genderSource:'title'});
 assert.equal(listingGender({title:'Unisex wool coat'}).gender,'unisex');
 assert.equal(listingGender({title:'Women’s coat',gender:'men'}).gender,'men');
 assert.equal(listingGender({title:'Unisex women’s coat'}).gender,'unknown');
 assert.equal(listingGender({title:"Men's coat",gender:'unknown'}).gender,'unknown');
});
test('provider normalization preserves department labels and does not retain seller data',()=>{
 const row={id:123456,title:'Cotton shirt',brand_title:'COS',gender_title:'Herrar',price:{amount:'100',currency_code:'SEK'},url:'https://www.vinted.se/items/123456-shirt',photo:{url:'https://images1.vinted.net/image.webp'},user:{gender:'female'}};
 const item=normalizeVinted(row,'2026-10-21T10:00:00Z');assert.equal(item.gender,'men');assert.equal(item.genderSource,'provider');assert.equal(item.user,undefined);
 assert.equal(normalizeVinted({...row,gender_title:undefined},'2026-10-21T10:00:00Z').gender,'unknown');
 assert.equal(normalizeVinted({...row,department_title:'Women'},'2026-10-21T10:00:00Z').gender,'unknown');
});
test('Discover applies the same department preference as other feeds',()=>{
 const prefs={following:['Our Legacy'],excluded:[],saved:[],dismissed:[],sizing:{enabled:false},gender:preference};
 const items=['men','women','unisex','unknown'].map((gender,index)=>({id:100+index,brand:'Auralee',title:'Cotton shirt',gender,size:'M',age:1}));
 assert.deepEqual(recommendListings(items,prefs).map(entry=>entry.item.gender),['men','unisex']);
});
