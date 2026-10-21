// Usage: node scripts/ops/restore.mjs <backup-dir> --yes   Replaces local FORME state with a verified backup (after taking a safety copy).
import {restoreBackup} from '../../lib/server/backup.mjs';
const from=process.argv[2];
if(!from||from.startsWith('--')||!process.argv.includes('--yes')){console.error('Usage: npm run restore -- <backup-dir> --yes\nThis overwrites .forme-data and the listing snapshot; a safety copy is made first.');process.exit(2);}
const result=await restoreBackup({from});
console.log(`Restored ${result.restored} files. Previous state saved to ${result.safetyCopy??'(nothing to save)'}`);
