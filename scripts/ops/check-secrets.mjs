// Usage: node scripts/ops/check-secrets.mjs   Scans git-tracked files for likely secrets. Prints file:line and rule only.
import {execFileSync} from 'node:child_process';
import {readFileSync,statSync} from 'node:fs';
import {scanText} from '../../lib/server/secret-scan.mjs';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean).filter(file=>!/\.(png|jpe?g|webp|ico|woff2?)$/.test(file)&&file!=='package-lock.json');
let hits=0;
for(const file of files){let size;try{size=statSync(file).size;}catch{continue;}if(size>3*1024*1024)continue;for(const hit of scanText(readFileSync(file,'utf8'))){console.error(`${file}:${hit.line} ${hit.rule}`);hits++;}}
console.log(hits?`${hits} possible secret${hits===1?'':'s'} found.`:`No likely secrets in ${files.length} tracked files.`);process.exit(hits?1:0);
