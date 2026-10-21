import {readFile} from 'node:fs/promises';
import {trustedSnapshot} from '../../lib/domain/data-trust.mjs';
const path=process.argv[2]??'public/data/vinted.json';
const {quality}=trustedSnapshot(JSON.parse(await readFile(path,'utf8')));
console.log(JSON.stringify(quality,null,2));
if(quality.rejected)process.exitCode=1;
