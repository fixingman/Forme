import {test} from 'node:test';
import assert from 'node:assert/strict';
import {elapsedLabel,elapsedWords,nextTickMs} from '../../lib/domain/elapsed.mjs';
const S=1000,M=60*S,H=60*M,D=24*H;
test('the label counts up through seconds, minutes, hours and days',()=>{
 for(const [ms,label] of [[0,'0s'],[999,'0s'],[S,'1s'],[42*S,'42s'],[59*S+999,'59s'],[M,'1m'],[12*M+30*S,'12m'],[59*M+59*S,'59m'],[H,'1h'],[23*H+59*M,'23h'],[D,'1d'],[2*D+5*H,'2d'],[400*D,'400d']])assert.equal(elapsedLabel(ms),label,String(ms));
});
test('it never goes negative when the clock is slightly behind the recorded time',()=>{
 assert.equal(elapsedLabel(-5*S),'0s');assert.equal(elapsedWords(-5*S),'just now');
});
test('the spoken form is plain English with correct plurals',()=>{
 assert.equal(elapsedWords(2*S),'just now');assert.equal(elapsedWords(5*S),'5 seconds ago');assert.equal(elapsedWords(M),'1 minute ago');assert.equal(elapsedWords(3*M),'3 minutes ago');assert.equal(elapsedWords(H),'1 hour ago');assert.equal(elapsedWords(2*D),'2 days ago');assert.equal(elapsedWords(D),'1 day ago');
});
test('the next tick lands exactly when the visible label changes, so it never lags or wastes wake-ups',()=>{
 assert.equal(nextTickMs(0),1000);assert.equal(nextTickMs(400),600);assert.equal(nextTickMs(59*S+250),750);
 assert.equal(nextTickMs(3599999),1);assert.equal(nextTickMs(M),M);assert.equal(nextTickMs(M+10*S),50*S);assert.equal(nextTickMs(59*M+30*S),30*S);assert.equal(nextTickMs(H),H);assert.equal(nextTickMs(5*H+10*M),50*M);
 for(const ms of [0,1,500,S,59999,M,3599999,H,D-1,D,3*D+7777]){const before=elapsedLabel(ms),after=elapsedLabel(ms+nextTickMs(ms));assert.notEqual(before,after,`label must change after the wait from ${ms}`);assert.equal(elapsedLabel(ms+nextTickMs(ms)-1),before,`and not before, from ${ms}`);}
});
