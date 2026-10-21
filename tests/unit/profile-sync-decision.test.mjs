import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decideSync} from '../../lib/profile-sync-decision.mjs';
const me='owner@example.com';
test('the first device uploads; a new device adopts the account profile and keeps its own copy aside',()=>{
 assert.equal(decideSync({marker:null,remote:null,user:me}),'push-initial');
 assert.equal(decideSync({marker:{user:me,rev:3,dirty:true},remote:null,user:me}),'push-initial','server reset: re-upload');
 assert.equal(decideSync({marker:null,remote:{revision:4},user:me}),'adopt-first');
 assert.equal(decideSync({marker:{user:'other@example.com',rev:4,dirty:false},remote:{revision:4},user:me}),'adopt-first','a different account never inherits this browser\'s state');
 assert.equal(decideSync({marker:{user:me,rev:'4',dirty:false},remote:{revision:4},user:me}),'adopt-first','a malformed marker is not trusted');
});
test('an up-to-date browser does nothing or pushes its own edits',()=>{
 assert.equal(decideSync({marker:{user:me,rev:4,dirty:false},remote:{revision:4},user:me}),'noop');
 assert.equal(decideSync({marker:{user:me,rev:4,dirty:true},remote:{revision:4},user:me}),'push');
});
test('a newer server profile is pulled; unsynced local edits are kept aside, never silently merged or lost',()=>{
 assert.equal(decideSync({marker:{user:me,rev:2,dirty:false},remote:{revision:4},user:me}),'pull');
 assert.equal(decideSync({marker:{user:me,rev:2,dirty:true},remote:{revision:4},user:me}),'pull-conflict');
});
test('a browser ahead of the server (server restored from backup) trusts the server',()=>{
 assert.equal(decideSync({marker:{user:me,rev:9,dirty:false},remote:{revision:4},user:me}),'adopt-first');
});
