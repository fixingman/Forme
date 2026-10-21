// Usage: node scripts/data-coverage.mjs [snapshot.json] [--json]
// Free and local: reads the snapshot, applies the same trust and inference rules as the app, and reports field coverage.
import {readFile} from 'node:fs/promises';
import {trustedSnapshot} from '../lib/data-trust.mjs';
import {coverageReport} from '../lib/data-quality.mjs';
const args=process.argv.slice(2),path=args.find(arg=>!arg.startsWith('--'))??'public/data/vinted.json';
const trusted=trustedSnapshot(JSON.parse(await readFile(path,'utf8')));
const report=coverageReport(trusted.items);
if(args.includes('--json')){console.log(JSON.stringify(report,null,2));process.exit(0);}
const line=(label,count,percent)=>console.log(`${label.padEnd(34)}${String(count).padStart(6)} / ${report.total}  ${String(percent).padStart(5)}%`);
console.log(`Listings: ${report.total}`);
line('Department known',report.department.known,report.department.knownPercent);
console.log(`  by source: ${JSON.stringify(report.department.bySource)}`);
line('Category classified',report.category.classified,report.category.classifiedPercent);
line('Size provided',report.size.provided,report.size.providedPercent);
line('Style classified (inferred)',report.style.classified,report.style.classifiedPercent);
console.log(`  by style: ${JSON.stringify(report.style.byStyle)}`);
line('Collectible title signals',report.collectibleSignals.listings,report.collectibleSignals.percent);
console.log(`Availability: ${JSON.stringify(report.availability.byState)}  ·  not observed in 7+ days: ${report.freshness.staleOverSevenDays}  ·  titles pending translation: ${report.translation.pending}`);
console.log('\nLowest department coverage by brand:');
for(const row of report.brands.filter(brand=>brand.unknownDepartment).sort((a,b)=>b.unknownDepartment-a.unknownDepartment).slice(0,8))console.log(`  ${row.brand.padEnd(24)} ${row.unknownDepartment}/${row.total} unknown department · ${row.unknownCategory} unknown category · ${row.unclassifiedStyle} no style`);
