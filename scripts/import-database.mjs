import {readFile} from 'node:fs/promises';
import {openStore} from '../lib/server/store.mjs';
const snapshot=JSON.parse(await readFile('public/data/vinted.json','utf8'));
const store=openStore();try{console.log(JSON.stringify(store.importSnapshot(snapshot)));}finally{store.close();}
