import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import snapshot from '../fixtures/vinted.json';

test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('forme-onboarding-complete','1'));});
test.beforeEach(async({page})=>{await page.route('**/api/listings',route=>route.fulfill({status:503,json:{error:'Fixture uses static snapshot'}}));await page.route('**/api/local-profile',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));await page.route('**/api/refresh',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));await page.route('**/api/size-profile',route=>route.fulfill({json:{profile:null}}));});
test.beforeEach(async({page})=>{await page.route('**/data/vinted.json',route=>route.fulfill({json:snapshot}));});

test('backup downloads, previews and restores preferences across reload',async({page})=>{
 await page.goto('/items/10447404161');await page.getByRole('button',{name:'♡ Save item',exact:true}).click();
 await page.goto('/tools?preview=digest');await page.getByLabel('New pieces from followed brands',{exact:true}).uncheck();await page.getByLabel('Listing data').selectOption('demo');
 await page.goto('/settings');const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Download settings backup'}).click();const download=await downloadEvent,path=await download.path();const backup=JSON.parse(await readFile(path!,'utf8'));
 expect(backup.app).toBe('forme');expect(backup.savedListings).toHaveLength(1);expect(backup.savedListings[0].originalTitle).toBe('Acne skinnjacka');expect(backup.settings.digest.following).toBe(false);expect(backup.display.mode).toBe('demo');expect(JSON.stringify(backup)).not.toMatch(/API_KEY|Bearer|cookie/i);
 await page.goto('/tools?preview=digest');await page.getByLabel('New pieces from followed brands',{exact:true}).check();await page.getByLabel('Listing data').selectOption('live');await page.goto('/settings');
 await page.getByLabel('Restore settings from file',{exact:true}).setInputFiles(path!);await expect(page.getByRole('button',{name:'Restore this backup'})).toBeVisible();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).digest.following)).toBe(true);
 await page.getByRole('button',{name:'Restore this backup'}).click();await page.reload();const restored=await page.evaluate(()=>({settings:JSON.parse(localStorage.getItem('forme-v2')!),mode:localStorage.getItem('forme-data-mode')}));expect(restored.settings.digest.following).toBe(false);expect(restored.mode).toBe('demo');
});

test('Vinted imports merge follows, deduplicate and preserve exclusions after review',async({page})=>{
 await page.goto('/settings');await expect.poll(()=>page.evaluate(()=>localStorage.getItem('forme-v2'))).not.toBeNull();const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).following);
 const file={app:'forme-vinted-brands',version:1,brands:['Auralee','auralee','Zara','Our Legacy']};
 await page.getByLabel('Vinted brands export',{exact:true}).setInputFiles({name:'brands.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});
 await expect(page.getByRole('button',{name:'Merge these brands'})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).following)).toEqual(original);
 await page.getByRole('button',{name:'Merge these brands'}).click();
 await page.reload();const settings=await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!));
 expect(settings.following.filter((name:string)=>name.toLowerCase()==='auralee')).toHaveLength(1);expect(settings.following).not.toContain('Zara');expect(settings.excluded).toContain('Zara');
});

test('malformed and unsupported files do not mutate current settings',async({page})=>{
 await page.goto('/settings');await expect.poll(()=>page.evaluate(()=>localStorage.getItem('forme-v2'))).not.toBeNull();const original=await page.evaluate(()=>localStorage.getItem('forme-v2'));
 for(const raw of ['not json',JSON.stringify({app:'forme',version:999}),JSON.stringify({app:'forme-vinted-brands',version:1,brands:[123]})]){
 await page.getByLabel(raw.includes('forme-vinted-brands')?'Vinted brands export':'Restore settings from file',{exact:true}).setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(raw)});
 await expect(page.getByRole('button',{name:'Restore this backup'})).toHaveCount(0);
 expect(await page.evaluate(()=>localStorage.getItem('forme-v2'))).toBe(original);
 }
});

test('Vinted exporter downloads only loaded brand names on the followed page',async({page})=>{
 await page.route('https://www.vinted.se/**',route=>route.fulfill({contentType:'text/html',body:'<main><a class="follow__name" href="/brand/1-auralee">Auralee</a><a class="follow__name" href="/brand/1-auralee">Auralee</a><a class="follow__name" href="/member/12">Seller</a></main>'}));
 await page.goto('https://www.vinted.se/member/personalization/brands/followed');
 page.on('dialog',dialog=>dialog.accept());
 const downloading=page.waitForEvent('download');await page.evaluate(await readFile('public/vinted-brands-export.js','utf8'));
 const download=await downloading;const result=JSON.parse(await readFile((await download.path())!,'utf8'));
 expect(result.brands).toEqual(['Auralee']);expect(Object.keys(result).sort()).toEqual(['app','brands','exportedAt','scope','version']);
});

test('pasted brands can be previewed and merged without dragging or a file',async({page})=>{
 await page.goto('/settings');
 await page.getByLabel('Paste followed brands',{exact:true}).fill('Auralee\nOur Legacy\nZara\nAuralee');
 await page.getByRole('button',{name:'Preview pasted brands',exact:true}).click();
 await expect(page.getByRole('button',{name:'Merge these brands'})).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).following)).not.toContain('Auralee');
 await page.getByRole('button',{name:'Merge these brands'}).click();
 const settings=await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!));
 expect(settings.following.filter((name:string)=>name==='Auralee')).toHaveLength(1);expect(settings.following).not.toContain('Zara');
 await page.goto('/vinted-import.html');
 await expect(page.getByRole('button',{name:'Copy bookmark address'})).toBeVisible();
 await expect(page.getByLabel('Bookmark address (select and copy manually if needed)',{exact:true})).toHaveValue(/^javascript:/);
});
