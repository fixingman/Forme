import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchesMySizes,normalizeSizing,sizeKey} from '../lib/sizes.mjs';
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
