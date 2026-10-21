import {test,expect} from '@playwright/test';
import snapshot from '../fixtures/vinted.json';
import {defaults} from '../../lib/catalog';

test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('forme-onboarding-complete','1'));});
test.beforeEach(async({page})=>{await page.route('**/api/listings',route=>route.fulfill({status:503,json:{error:'Fixture uses static snapshot'}}));await page.route('**/api/local-profile',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));await page.route('**/api/refresh',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));await page.route('**/api/size-profile',route=>route.fulfill({json:{profile:null}}));});

test.beforeEach(async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('forme-data-mode','demo'));
 await page.route('**/data/vinted.json',route=>route.fulfill({json:snapshot}));
});
test('global filters apply sizes across feeds and preserve selections when choosing all sizes',async({page})=>{
 await page.goto('/discover');await page.getByRole('button',{name:'My sizes and departments',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'My sizes & departments',exact:true});await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'M',exact:true}).click();
 await dialog.getByLabel('Include one-size and adjustable pieces').uncheck();await dialog.getByLabel('Include listings without a size').uncheck();
 await dialog.getByRole('button',{name:'Apply filters',exact:true}).click();
 await expect(page.getByRole('button',{name:'My sizes and departments',exact:true})).toHaveClass(/active/);
 await expect(page.getByTestId('listing-6')).toBeVisible();await expect(page.getByTestId('listing-2')).toHaveCount(0);await expect(page.getByTestId('listing-7')).toHaveCount(0);
 await page.goto('/following');await expect(page.getByTestId('listing-6')).toBeVisible();await expect(page.getByTestId('listing-2')).toHaveCount(0);
 await page.reload();await expect(page.getByRole('button',{name:'My sizes and departments',exact:true})).toHaveClass(/active/);
 await page.getByRole('button',{name:'My sizes and departments',exact:true}).click();await page.getByRole('radio',{name:'All sizes',exact:true}).check();await page.getByRole('button',{name:'Apply filters',exact:true}).click();await expect(page.getByTestId('listing-2')).toBeVisible();
 await page.goto('/settings');const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Download settings backup'}).click();
 const download=await downloading;const path=await download.path();const {readFile}=await import('node:fs/promises');const backup=JSON.parse(await readFile(path!,'utf8'));
 expect(backup.settings.sizing.selected).toEqual(['M']);expect(backup.settings.sizing.enabled).toBe(false);
});
test('numbered sizes and unknown/one-size options work on mobile without losing saved items',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/discover');await page.getByRole('button',{name:'My sizes and departments',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'My sizes & departments',exact:true});await dialog.getByText('Add another size',{exact:true}).click();await dialog.getByLabel('Custom size category').selectOption('shoes');await dialog.getByLabel('Size label',{exact:true}).fill('EU 42');await dialog.getByRole('button',{name:'Add size',exact:true}).click();
 await dialog.getByRole('button',{name:'Apply filters',exact:true}).click();
 await expect(page.getByTestId('listing-7')).toBeVisible();await expect(page.getByTestId('listing-6')).toHaveCount(0);await expect(page.getByTestId('listing-14')).toBeVisible();
 await page.getByTestId('listing-7').getByRole('button',{name:'Save Guidi Leather Boots',exact:true}).click();
 await page.goto('/saved');await expect(page.getByTestId('listing-7')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'My sizes and departments',exact:true}).click();await page.getByRole('button',{name:'Clear sizes',exact:true}).click();await page.getByRole('button',{name:'Apply filters',exact:true}).click();
 await expect(page.getByRole('button',{name:'My sizes and departments',exact:true})).not.toHaveClass(/active/);
});
test('old backups remain importable and new backups retain size preferences',async({page})=>{
 await page.goto('/settings');const legacy={...defaults,saved:[],styleRules:{}};
 const file={app:'forme',version:1,exportedAt:new Date().toISOString(),settings:legacy,display:{mode:'demo',collapsed:false},savedListings:[]};
 await page.getByLabel('Restore settings from file',{exact:true}).setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});
 await page.getByRole('button',{name:'Restore this backup'}).click();await page.goto('/discover');await expect(page.getByTestId('listing-2')).toBeVisible();
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).sizing);expect(stored.enabled).toBe(false);
 const updated={...file,settings:{...legacy,sizing:{enabled:true,selected:['M'],includeOneSize:false,includeUnspecified:false}}};
 await page.goto('/settings');await page.getByLabel('Restore settings from file',{exact:true}).setInputFiles({name:'new.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(updated))});await page.getByRole('button',{name:'Restore this backup'}).click();
 await page.goto('/discover');await expect(page.getByTestId('listing-2')).toHaveCount(0);await expect(page.getByTestId('listing-6')).toBeVisible();
});

test('confirmed local size profile applies once and later edits are retained',async({page})=>{
 const sizing={enabled:true,selected:['M','L','W31','W32','EU 48','EU 50'],includeOneSize:true,includeUnspecified:true};
 await page.route('**/api/listings',route=>route.fulfill({status:503,json:{error:'Fixture uses static snapshot'}}));await page.route('**/api/local-profile',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));await page.route('**/api/refresh',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));await page.route('**/api/size-profile',route=>route.fulfill({json:{profile:{id:'confirmed-profile',sizing}}}));
 await page.goto('/discover');await expect(page.getByRole('button',{name:'My sizes and departments',exact:true})).toHaveClass(/active/);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).sizing.selected)).toEqual(sizing.selected);
 await page.getByRole('button',{name:'My sizes and departments',exact:true}).click();const dialog=page.getByRole('dialog',{name:'My sizes & departments',exact:true});
 await dialog.getByText('Waist · W labels',{exact:true}).click();await dialog.getByRole('button',{name:'W33',exact:true}).click();
 await dialog.getByText('Shoes · EU labels',{exact:true}).click();await dialog.getByRole('button',{name:'EU 42.5',exact:true}).click();
 await dialog.getByRole('button',{name:'Apply filters',exact:true}).click();await page.reload();
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).sizing.selected);expect(stored).toContain('W33');expect(stored).toContain('EU 42.5');
});
