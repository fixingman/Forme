// Usage: node scripts/backup.mjs [--keep N]   Creates and verifies a backup in .forme-backups/.
import {createBackup,verifyBackup,pruneBackups} from '../lib/server/backup.mjs';
const keepIndex=process.argv.indexOf('--keep'),keep=keepIndex>0?Number(process.argv[keepIndex+1]):null;
const {dir,manifest}=await createBackup();const check=await verifyBackup(dir);
console.log(`Backup written to ${dir}\n${manifest.files.length} files, verified: ${check.ok?'yes':'NO'}`);
if(!check.ok){console.error(check.problems.join('\n'));process.exit(1);}
if(keep!==null)console.log(`Pruned: ${pruneBackups({keep}).join(', ')||'nothing'}`);
