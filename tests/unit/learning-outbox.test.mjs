import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingOperations,queueOperation,acknowledgeOperation} from '../../lib/domain/learning-outbox.mjs';
const storage = () => {const data=new Map();return {get length(){return data.size;},key:index=>[...data.keys()][index],getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};};
test('independent tab appends and acknowledgements preserve other operations in causal order',()=>{
 const device=storage(),scope='forme:owner';
 queueOperation(device,scope,{id:'exposure'},100);
 queueOperation(device,scope,{id:'vote'},100);
 const tabA=pendingOperations(device,scope);
 queueOperation(device,scope,{id:'reason'},99);
 acknowledgeOperation(device,scope,tabA[0].id);
 assert.deepEqual(pendingOperations(device,scope).map(row=>row.id),['vote','reason']);
 acknowledgeOperation(device,scope,'exposure');
 assert.equal(pendingOperations(device,'forme:other-owner').length,0);
});
test('legacy queues migrate without losing pending operations and quota failures leave earlier records',()=>{
 const device=storage(),scope='forme:owner';device.setItem(scope,JSON.stringify([{id:'one'},{id:'two'}]));
 assert.deepEqual(pendingOperations(device,scope).map(row=>row.id),['one','two']);assert.equal(device.getItem(scope),null);
 const failing={...device,setItem(){throw Error('Quota');}};
 assert.throws(()=>queueOperation(failing,scope,{id:'three'}),/Quota/);
 assert.deepEqual(pendingOperations(device,scope).map(row=>row.id),['one','two']);
});
