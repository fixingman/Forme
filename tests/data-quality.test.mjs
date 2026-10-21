import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyStyle,collectibleSignals,withInferredQuality,coverageReport} from '../lib/data-quality.mjs';
import {trustedSnapshot} from '../lib/data-trust.mjs';
const item=(title,brand='Unknown Brand',extra={})=>({title,brand,category:'',...extra});
test('title evidence wins over brand reference and is always labelled with its evidence',()=>{
 assert.deepEqual(classifyStyle(item('Vintage wool shirt','Our Legacy')),{style:'Archive',styleSource:'title',styleEvidence:'vintage'});
 assert.equal(classifyStyle(item('Raw denim jeans','Yohji Yamamoto')).style,'Denim');
 assert.deepEqual(classifyStyle(item('Wool shirt','Our Legacy')),{style:'Minimalism',styleSource:'brand-reference',styleEvidence:'Our Legacy'});
 assert.equal(classifyStyle(item('Gore-Tex shell jacket')).style,'Techwear');
 assert.equal(classifyStyle(item('Chore coat','Some Label')).style,'Workwear');
 assert.equal(classifyStyle(item('Brown wool jacket AW03','Plain Co')).style,'Archive');
});
test('no style is invented without evidence, and non-fashion or ambiguous names are left alone',()=>{
 assert.equal(classifyStyle(item('Black wool jacket','Plain Co')).style,'');
 assert.equal(classifyStyle(item('Burgundy Études Studio Jean-Michel Basquiat sweatshirt','Etudes')).style,'');
 assert.equal(classifyStyle(item('Vintage ceramic vase','Georg Jensen')).style,'');
 assert.equal(classifyStyle(item('Vintage modelling clay toy','Comme des Garçons')).style,'');
 assert.equal(classifyStyle(item('Wool jacket SS24','Plain Co')).style,'');
});
test('a style supplied by the source is never replaced, and inferred fields carry provenance',()=>{
 const supplied=withInferredQuality(item('Vintage wool shirt','Our Legacy',{style:'Workwear'}));
 assert.equal(supplied.style,'Workwear');assert.equal(supplied.styleSource,undefined);
 const inferred=withInferredQuality(item('Archive runway jacket','Plain Co'));
 assert.equal(inferred.style,'Archive');assert.equal(inferred.styleSource,'title');assert.deepEqual(inferred.collectibleSignals,['archive','runway']);
});
test('collectible signals are evidence strings, kept apart from the numeric rarity score',()=>{
 assert.deepEqual(collectibleSignals(item('Plain wool shirt')),[]);
 assert.deepEqual(collectibleSignals(item('80s vintage very rare jacket')),['vintage','rare']);
 assert.deepEqual(collectibleSignals(item('Wool coat FW 2004'),2026),['season 2004']);
 assert.deepEqual(collectibleSignals(item('Wool coat FW 2024'),2026),[]);
 assert.equal(withInferredQuality(item('Vintage rare jacket')).rarity,undefined);
});
test('coverage is computed from the trusted snapshot and reports gaps instead of hiding them',()=>{
 const trusted=trustedSnapshot(JSON.parse(readFileSync(new URL('./fixtures/vinted.json',import.meta.url),'utf8')),Date.parse('2026-10-20T00:00:00Z'));
 const report=coverageReport(trusted.items,Date.parse('2026-10-20T00:00:00Z'));
 assert.equal(report.total,trusted.items.length);assert.ok(report.total>0);
 assert.equal(report.department.known+(report.department.byValue.unknown??0),report.total);
 assert.equal(report.style.classified,trusted.items.filter(row=>row.style).length);
 assert.ok(report.brands.every(row=>row.total>0));
 assert.equal(Object.values(report.availability.byState).reduce((a,b)=>a+b,0),report.total);
 assert.equal(coverageReport([]).total,0);
});
