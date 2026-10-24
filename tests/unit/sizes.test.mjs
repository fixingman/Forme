import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchesMySizes,normalizeSizing,sizeKey} from '../../lib/domain/sizes.mjs';
const sizes={enabled:true,selected:['M','W32','EU 42.5'],includeOneSize:false,includeUnspecified:false};
test('matches explicit letter, waist and numbered labels without invented conversions',()=>{
 for(const size of ['M',' M / 38 / 10 ','48 | W32','42,5','EU 42.5'])assert.equal(matchesMySizes({size},sizes),true,size);
 for(const size of ['S','L','W30','42','US 42.5','42.5 cm','32/30'])assert.equal(matchesMySizes({size},sizes),false,size);
 assert.equal(sizeKey('3XL'),sizeKey('XXXL'));assert.equal(sizeKey('EU 42'),sizeKey('42'));
});
test('unknown and one-size listing rules are independent',()=>{
 assert.equal(matchesMySizes({size:'Onesize'},sizes),false);assert.equal(matchesMySizes({size:'Justerbart'},{...sizes,includeOneSize:true}),true);
 assert.equal(matchesMySizes({size:'Not provided'},sizes),false);assert.equal(matchesMySizes({size:'Not provided'},{...sizes,includeUnspecified:true}),true);
 assert.equal(matchesMySizes({size:'M'},{...sizes,enabled:false}),true);assert.equal(matchesMySizes({size:'L'},{...sizes,selected:[]}),true);
});
test('normalization preserves legacy behavior, deduplicates aliases and bounds imported selections',()=>{
 assert.deepEqual(normalizeSizing(undefined),{enabled:false,selected:[],includeOneSize:true,includeUnspecified:true});
 const value=normalizeSizing({enabled:true,selected:['m','M','EU 42','42',null],includeOneSize:false});
 assert.equal(value.selected.length,2);assert.equal(value.enabled,true);assert.equal(value.includeOneSize,false);
 assert.equal(normalizeSizing({enabled:true,selected:[]}).enabled,false);
});

// --- 24 Oct: unclassified items with a letter size, and underwear words ---------------------------------------------
import {isLetterSize,isSock,sockEuRange} from '../../lib/domain/sizes.mjs';
import {classifyListing as classify} from '../../lib/domain/classification.mjs';
const mine={enabled:true,selected:['M','L','W31','W32','EU 48','EU 50'],groups:{clothing:['M','L','EU 48','EU 50'],waist:['W31','W32'],shoes:[],other:[]},includeOneSize:true,includeUnspecified:true};
const strict={...mine,includeUnspecified:false};
const mystery=size=>({title:'Studio Nicholson',category:'',size});
test('letter sizes are recognised only when every part is a letter size',()=>{
 for(const yes of ['M','XL','xs','XXL','2XL','3XL','5XL','S/M','S | M'])assert.equal(isLetterSize(yes),true,yes);
 for(const no of ['','50 cm','EU 48','W32','32/30','42','One size','Not provided','M/42','XL-ish'])assert.equal(isLetterSize(no),false,no);
});
test('an unclassified item with a letter size that is not yours is hidden, whatever the include-unspecified setting',()=>{
 for(const setting of [mine,strict]){
  for(const size of ['XL','S','XS','XXL'])assert.equal(matchesMySizes(mystery(size),setting),false,`${size} is not yours`);
  assert.equal(matchesMySizes(mystery('S/XL'),setting),false,'a range with no size of yours is hidden');
 }
 assert.equal(matchesMySizes(mystery('S/M'),mine),true,'a range containing your size is not ruled out');
});
test('a matching letter size on an unclassified item still follows the include-unspecified setting, exactly as before',()=>{
 for(const size of ['M','L','S/M'])assert.equal(matchesMySizes(mystery(size),mine),true,size),assert.equal(matchesMySizes(mystery(size),strict),false,`${size} stays hidden when unspecified items are excluded`);
});
test('ambiguous sizes on unclassified items still follow the include-unspecified setting',()=>{
 for(const size of ['50 cm','42','32/30','W34'])assert.equal(matchesMySizes(mystery(size),mine),true,`${size} can't be judged without a category, so the setting includes it`);
 for(const size of ['50 cm','42'])assert.equal(matchesMySizes(mystery(size),strict),false,size);
 assert.equal(matchesMySizes(mystery('Not provided'),mine),true);assert.equal(matchesMySizes(mystery('Not provided'),strict),false);
});
test('with no clothing sizes selected, a letter size on an unclassified item falls back to the setting instead of hiding everything',()=>{
 const waistOnly={...mine,selected:['W31'],groups:{clothing:[],waist:['W31'],shoes:[],other:[]}};
 assert.equal(matchesMySizes(mystery('XL'),waistOnly),true);assert.equal(matchesMySizes(mystery('XL'),{...waistOnly,includeUnspecified:false}),false);
});
test('classified items and legacy un-grouped sizing behave exactly as before',()=>{
 assert.equal(matchesMySizes({title:'Wool jacket',category:'',size:'XL'},mine),false);assert.equal(matchesMySizes({title:'Wool jacket',category:'',size:'M'},mine),true);
 assert.equal(matchesMySizes({title:'Candle holder',category:'',size:'XL'},mine),true,'homeware is unaffected');
 assert.equal(matchesMySizes(mystery('XL'),{enabled:true,selected:['M'],includeOneSize:true,includeUnspecified:true}),false,'legacy sizing still compares labels directly');
 assert.equal(matchesMySizes(mystery('XL'),{...mine,enabled:false}),true,'filter off shows everything');
});
test('underwear words are clothing, so their size is checked; unrelated words and singular trunk are untouched',()=>{
 for(const title of ['CDLP men’s underwear','Calvin Klein boxer briefs','Swim trunks','Silk pyjamas set','Cotton undershirt','Jockey underpants'])assert.deepEqual(classify({title,category:''}).sizeGroup,'clothing',title);
 assert.equal(classify({title:'Boxer shorts in cotton',category:''}).productGroup,'bottoms','shorts still win for boxer shorts');
 assert.equal(classify({title:'Wool socks',category:''}).productGroup,'clothing');assert.equal(classify({title:'Sock sneakers',category:''}).productGroup,'shoes','shoes win over sock');
 assert.equal(classify({title:'Trunk show poster',category:''}).productGroup,'unknown','trunk (singular) is not underwear');
 const xlUnderwear={title:'CDLP men’s underwear',category:'',size:'XL'};
 assert.equal(matchesMySizes(xlUnderwear,mine),false);assert.equal(matchesMySizes({...xlUnderwear,size:'M'},mine),true);
});

const withShoes=(...shoes)=>({...mine,selected:[...mine.selected,...shoes],groups:{...mine.groups,shoes}});
const sock=size=>({title:'Merino socks',category:'',size});
test('sock sizes are European shoe-size ranges: parsed strictly, never converted',()=>{
 for(const [label,range] of [['40-43',{lo:40,hi:43}],['40 - 43',{lo:40,hi:43}],['40–43',{lo:40,hi:43}],['EU 40-43',{lo:40,hi:43}],['40-43 EU',{lo:40,hi:43}],['42',{lo:42,hi:42}],['EU 42',{lo:42,hi:42}],['42.5',{lo:42.5,hi:42.5}],['39-42.5',{lo:39,hi:42.5}]])assert.deepEqual(sockEuRange(label.toUpperCase()),range,label);
 for(const no of ['UK 6-8','US 7-9','M','S/M','6-8','43-40','35-50','10-60','','One size'])assert.equal(sockEuRange(no.toUpperCase()),null,no);
 assert.equal(isSock({title:'Merino socks',category:''}),true);assert.equal(isSock({title:'Sock sneakers',category:''}),false);assert.equal(isSock({title:'Wool jacket',category:''}),false);
});
test('socks are matched against your shoe sizes: inside the range is a match, outside is hidden',()=>{
 const sizing=withShoes('EU 42');
 for(const size of ['40-43','EU 41-44','42','39-42'])assert.equal(matchesMySizes(sock(size),sizing),true,size);
 for(const size of ['36-40','43-46','44','35-38'])assert.equal(matchesMySizes(sock(size),sizing),false,size);
 assert.equal(matchesMySizes(sock('43-46'),withShoes('EU 42','EU 44')),true,'any of several shoe sizes can match');
 assert.equal(matchesMySizes(sock('41-46'),withShoes('EU 42.5')),true);
 assert.equal(matchesMySizes(sock('43-46'),{...strict,groups:{...strict.groups,shoes:['EU 42']}}),false,'a wrong range is hidden in strict mode too');
});
test('socks the shoe-size rule cannot judge follow the include-unspecified setting, as before',()=>{
 const sizing=withShoes('EU 42');
 for(const size of ['UK 6-8','US 7-9','M','S/M'])assert.equal(matchesMySizes(sock(size),sizing),true,size),assert.equal(matchesMySizes(sock(size),{...sizing,includeUnspecified:false}),false,`${size} stays hidden when unspecified items are excluded`);
 assert.equal(matchesMySizes(sock('40-43'),mine),true,'no shoe sizes saved: the setting decides');assert.equal(matchesMySizes(sock('40-43'),strict),false);
 assert.equal(matchesMySizes(sock('One size'),withShoes('EU 42')),true);assert.equal(matchesMySizes(sock('One size'),{...withShoes('EU 42'),includeOneSize:false}),false);
 assert.equal(matchesMySizes(sock('40-43'),{enabled:true,selected:['EU 42'],includeOneSize:true,includeUnspecified:true}),false,'legacy un-grouped sizing still compares labels directly');
});
test('shoes and sock-named shoes are not affected by the sock rule',()=>{
 assert.equal(matchesMySizes({title:'Sock sneakers',category:'',size:'42'},withShoes('EU 42')),true);assert.equal(matchesMySizes({title:'Sock sneakers',category:'',size:'44'},withShoes('EU 42')),false);
 assert.equal(matchesMySizes({title:'Leather boots',category:'',size:'42'},mine),false,'no shoe sizes saved: shoes stay as before');
});
