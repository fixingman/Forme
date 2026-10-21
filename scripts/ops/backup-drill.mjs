// Usage: node scripts/ops/backup-drill.mjs   Backs up, restores into a scratch directory and compares. Read-only for real data.
import {restoreDrill} from '../../lib/server/backup.mjs';
const report=await restoreDrill();
console.log(JSON.stringify(report,null,2));process.exit(report.ok&&report.files>0?0:1);
