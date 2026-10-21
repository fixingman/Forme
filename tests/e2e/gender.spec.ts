import {test,expect} from '@playwright/test';
import {defaults} from '../../lib/catalog';
const preference={selected:['men','unisex'],includeUnknown:false};
const base={source:'vinted',currency:'SEK',condition:'Good',fetchedAt:'2026-10-21T10:00:00Z',imageUrl:'https://images1.vinted.net/test.webp',size:'M',category:'',style:'',age:1,rarity:0,image:'',price:100,brand:'Our Legacy'};
const snapshot={fetchedAt:base.fetchedAt,queries:['test'],items:['men','women','unisex','unknown'].map((gender,index)=>({...base,id:20000+index,sourceKey:`vinted:${20000+index}`,title:`Cotton shirt ${index}`,gender,genderSource:'provider'}))};
snapshot.items=snapshot.items.map(item=>({...item,sourceId:String(item.id),sourceUrl:`https://www.vinted.se/items/${item.id}-fixture`}));
test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('forme-onboarding-complete','1'));});
test.beforeEach(async({page})=>{
 // Defaults are passed explicitly because browser init scripts have no module scope.
 await page.addInitScript(value=>{if(!localStorage.getItem('forme-v2'))localStorage.setItem('forme-v2',JSON.stringify({...value,styleRules:{},saved:[]}));},defaults);
 await page.route('**/api/listings',route=>route.fulfill({json:snapshot}));
 await page.route('**/api/refresh',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));await page.route('**/api/size-profile',route=>route.fulfill({json:{profile:null,genderProfile:{id:'confirmed-departments',preference}}}));
 await page.route('**/api/local-profile',route=>route.fulfill({status:503,json:{error:'Isolated test'}}));
});
test('confirmed preference hides women and unknown, persists edits and travels in backups',async({page})=>{
 await page.goto('/following');await expect(page.getByTestId('listing-20000')).toBeVisible();await expect(page.getByTestId('listing-20002')).toBeVisible();
 await expect(page.getByTestId('listing-20001')).toHaveCount(0);await expect(page.getByTestId('listing-20003')).toHaveCount(0);
 await page.goto('/settings');await page.getByRole('button',{name:'My sizes and departments',exact:true}).click();await expect(page.getByRole('checkbox',{name:'Men',exact:true})).toBeChecked();await expect(page.getByRole('checkbox',{name:'Women',exact:true})).not.toBeChecked();
 await page.getByRole('checkbox',{name:'Include items with an unknown department'}).check();await page.getByRole('button',{name:'Apply filters',exact:true}).click();await page.reload();await page.getByRole('button',{name:'My sizes and departments',exact:true}).click();await expect(page.getByRole('checkbox',{name:'Include items with an unknown department'})).toBeChecked();
 await page.keyboard.press('Escape');await page.goto('/following');await expect(page.getByTestId('listing-20003')).toBeVisible();await expect(page.getByTestId('listing-20001')).toHaveCount(0);
 await page.goto('/settings');const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Download settings backup'}).click();const download=await downloading;const {readFile}=await import('node:fs/promises');const backup=JSON.parse(await readFile((await download.path())!,'utf8'));expect(backup.settings.gender).toEqual({...preference,includeUnknown:true});
});
test('gender labels on saved listings survive backup restore',async({page})=>{
 await page.goto('/following');await page.getByTestId('listing-20000').getByRole('button',{name:'Save Our Legacy Cotton shirt 0',exact:true}).click();await page.goto('/settings');
 const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Download settings backup'}).click();const {readFile}=await import('node:fs/promises');const download=await downloading,buffer=await readFile((await download.path())!);expect(JSON.parse(buffer.toString()).savedListings[0].gender).toBe('men');
 await page.getByLabel('Restore settings from file',{exact:true}).setInputFiles({name:'gender-backup.json',mimeType:'application/json',buffer});await page.getByRole('button',{name:'Restore this backup'}).click();await page.goto('/saved');await expect(page.getByTestId('listing-20000')).toBeVisible();
});
