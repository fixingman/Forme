import test from 'node:test';
import assert from 'node:assert/strict';
import {formatPrice,formatDateTime,listingCondition,listingSize} from '../../lib/domain/presentation.mjs';

test('recorded prices keep meaningful cents and one currency label in every view',()=>{
 assert.equal(formatPrice(451.69,'SEK').replace(/\s/g,' '),'451,69 kr');
 assert.equal(formatPrice(452,'SEK').replace(/\s/g,' '),'452 kr');
 assert.equal(formatPrice(12.5,'EUR').replace(/\s/g,' '),'12,5 €');
});
test('display metadata preserves unknown fields and dates omit seconds',()=>{
 assert.equal(listingCondition({source:'vinted'}),'Condition not provided');
 assert.equal(listingCondition({source:'vinted',condition:'Good'}),'Good');
 assert.equal(listingSize({size:' Not provided '}),'');
 assert.equal(listingSize({size:' EU 48 '}),'EU 48');
 assert.equal(formatDateTime('invalid'),'Unknown time');
 assert.match(formatDateTime('2026-10-24T12:34:56Z'),/^24 Oct 2026, \d{2}:\d{2}$/);
});
