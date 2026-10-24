import {test,expect,type Page} from '@playwright/test';
import {defaults} from '../../lib/catalog';

const at=new Date(Date.now()-86400000).toISOString();
const piece=(id:number,brand:string,title:string,extra:Record<string,unknown>={})=>({id,brand,title,source:'vinted',sourceId:String(id),sourceKey:`vinted:${id}`,sourceUrl:`https://www.vinted.se/items/${id}-fixture`,imageUrl:'https://images1.vinted.net/fixture.webp',price:1200,currency:'SEK',size:'M',condition:'Very good',gender:'men',genderSource:'provider',fetchedAt:at,firstSeenAt:at,observedAt:at,newlyCollected:true,category:'',style:'',age:1,rarity:0,image:'',...extra});
// Titles below are real entries in data/title-translations.json, so each listing lands in the translation state its name says.
const items=[
 piece(93001,'Our Legacy','Jeans fra Our Legacy',{originalTitle:'Jeans fra Our Legacy',originalCondition:'Mycket bra',size:'48 | W32',genderSource:'search-filter'}),   // translated: shown as "Jeans from Our Legacy"
 piece(93002,'Our Legacy','Our Legacy box shirt',{originalTitle:'Our Legacy box shirt',originalCondition:'Very good',condition:'Very good',size:'L',gender:'unknown',genderSource:'unknown'}),
 piece(93003,'Acne Studios','Cotton shirt',{category:'Shirts',size:'M',originalTitle:'Acne skjorta',originalCondition:'Bra'}),                                                  // not in the cache: pending
 piece(93004,'Plain Co','Mystery object',{gender:'women',genderSource:'title',size:'Not provided'}),
 piece(93005,'Our Legacy','Our Legacy box shirt',{originalTitle:'Our Legacy box shirt',originalCondition:'Very good',condition:'Very good'}),                          // English original, reviewed: nothing was translated
 piece(93006,'Studio Nicholson','Archive vintage wool coat',{size:'L',gender:'unknown',genderSource:'unknown'}),
];
const settings={...defaults,following:[],excluded:[],styles:[],searches:[],saved:[],dismissed:[],styleRules:{},gender:{selected:['men','women','unisex'],includeUnknown:true},sizing:{enabled:false,selected:[],includeOneSize:true,includeUnspecified:true}};
test.beforeEach(async({page})=>{
 await page.addInitScript(value=>{localStorage.setItem('forme-onboarding-complete','1');if(!localStorage.getItem('forme-v2'))localStorage.setItem('forme-v2',JSON.stringify(value));},settings);
 await page.route('**/api/listings',route=>route.fulfill({json:{fetchedAt:at,queries:['fixture'],items}}));
 for(const path of ['size-profile','local-profile','profile','refresh'])await page.route(`**/api/${path}`,route=>route.fulfill({status:503,json:{error:'Isolated test'}}));
 await page.route('https://images1.vinted.net/**',route=>route.fulfill({status:404,body:''}));
});
const about=(page:Page)=>page.locator('.about');
const row=(page:Page,label:string)=>page.locator('.about dl > div').filter({has:page.locator('dt',{hasText:new RegExp(`^${label}$`)})});

test('the title block reads brand, then title, with a formatted observation time kept as a real <time>',async({page})=>{
 await page.goto('/items/93001');
 await expect(page.getByRole('heading',{level:1,name:'Our Legacy',exact:true})).toBeVisible();await expect(page.getByRole('heading',{level:2,name:'Jeans from Our Legacy',exact:true})).toBeVisible();
 const time=page.locator('.detail .eyebrow time');await expect(time).toHaveCount(1);await expect(time).toHaveText(/^\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}$/);
 expect(Date.parse((await time.getAttribute('datetime'))!)).toBe(Date.parse(at));
 await expect(page.locator('.detail .eyebrow')).toContainText('Vinted · Observed');await expect(page.locator('.detail .eyebrow')).not.toContainText('T0');
});
test('size and condition are labelled facts above the price; an empty category never prints a stray separator',async({page})=>{
 await page.goto('/items/93001');
 const facts=page.locator('.detail .facts');await expect(facts.locator('dt')).toHaveText(['Size','Condition']);await expect(facts.locator('dd')).toHaveText(['48 | W32','Very good']);
 await expect(page.locator('.detail')).not.toContainText('· ·');await expect(page.locator('.detail')).not.toContainText(/Size 48/);
 const [f,p]=await Promise.all([facts.boundingBox(),page.locator('.detail-price').boundingBox()]);expect(f!.y+f!.height).toBeLessThanOrEqual(p!.y);
 await page.goto('/items/93003');await expect(page.locator('.detail .facts dt')).toHaveText(['Size','Condition','Category']);await expect(page.locator('.detail .facts dd').nth(2)).toHaveText('Shirts');
});
test('the translation status is one honest note: translated, pending, or none when nothing was translated',async({page})=>{
 await page.goto('/items/93001');
 await expect(page.locator('.detail .translation-note')).toHaveCount(1);await expect(page.locator('.detail .translation-note')).toHaveText('English title from a cached translation. Wording may differ from the original.');
 await page.goto('/items/93003');
 await expect(page.locator('.detail .translation-note')).toHaveCount(1);await expect(page.locator('.detail .translation-note')).toHaveText('English title not available yet. Showing the original.');
 await expect(page.getByText('translation pending')).toHaveCount(0);await expect(page.getByText('English translation unavailable')).toHaveCount(0);
 // an English original that is already reviewed was never translated, so it must not claim to be
 await page.goto('/items/93005');await expect(page.getByRole('heading',{level:2,name:'Our Legacy box shirt',exact:true})).toBeVisible();
 await expect(page.locator('.detail .translation-note')).toHaveCount(0);await expect(page.getByText('cached translation')).toHaveCount(0);
});
test('the original listing text is offered only when it differs, and opens and closes from a tidy disclosure',async({page})=>{
 await page.goto('/items/93005');await expect(page.locator('.original-listing')).toHaveCount(0);
 await page.goto('/items/93001');const details=page.locator('.original-listing');
 await expect(details).not.toHaveAttribute('open','');await page.getByText('Show original listing text',{exact:true}).click();
 await expect(details.getByText('Jeans fra Our Legacy',{exact:true})).toBeVisible();await expect(details).toContainText('Condition: Mycket bra');
 await page.getByText('Show original listing text',{exact:true}).press('Enter');await expect(details).not.toHaveAttribute('open','');
 // a pending title with an untranslated condition still lets you read the original wording
 await page.goto('/items/93003');await page.getByText('Show original listing text',{exact:true}).click();await expect(page.locator('.original-listing')).toContainText('Condition: Bra');
});
test('About this listing groups department, category and style with their evidence',async({page})=>{
 await page.goto('/items/93001');
 await expect(about(page).getByRole('heading',{level:3,name:'About this listing'})).toBeVisible();
 await expect(row(page,'Department').locator('.v')).toHaveText('Men');await expect(row(page,'Department').locator('.s')).toHaveText('Collected from the Men’s catalog (search scope)');
 await expect(row(page,'Category').locator('.v')).toHaveText('Bottoms');await expect(row(page,'Category').locator('.s')).toHaveText('Inferred from listing text');
 await expect(row(page,'Style').locator('.v')).toHaveText('Denim');await expect(row(page,'Style').locator('.s')).toContainText('not a marketplace label');
 // each row keeps its facts together and the label sits left of the value
 const [dt,dd]=await Promise.all([row(page,'Department').locator('dt').boundingBox(),row(page,'Department').locator('dd').boundingBox()]);expect(dd!.x).toBeGreaterThan(dt!.x+dt!.width-1);
});
test('unknown and unclassified values are stated honestly, not guessed, and absent rows are omitted',async({page})=>{
 await page.goto('/items/93004');
 await expect(row(page,'Department').locator('.v')).toHaveText('Women');await expect(row(page,'Department').locator('.s')).toHaveText('Stated in the listing title');
 await expect(row(page,'Category').locator('.v')).toHaveText('Not classified');await expect(row(page,'Category').locator('.s')).toHaveCount(0);
 await expect(row(page,'Style')).toHaveCount(0);await expect(row(page,'Mentions')).toHaveCount(0);
 await page.goto('/items/93006');await expect(row(page,'Department').locator('.v')).toHaveText('Not specified');await expect(row(page,'Department').locator('.s')).toHaveText('Not provided by the listing');
});
test('collectible title words appear as Mentions with the not-a-rating caveat',async({page})=>{
 await page.goto('/items/93006');const mentions=row(page,'Mentions');
 await expect(mentions.locator('.v')).toContainText('archive');await expect(mentions.locator('.v')).toContainText('vintage');await expect(mentions.locator('.s')).toContainText('Not a verified scarcity rating');
});
test('price and actions come before the provenance, and Save is visible without scrolling on a laptop screen',async({page})=>{
 await page.setViewportSize({width:1280,height:720});await page.goto('/items/93001');
 const save=await page.locator('.detail-actions').getByRole('button',{name:/Save item/}).boundingBox();expect(save!.y+save!.height).toBeLessThanOrEqual(720);
 const [price,notice,aboutBox]=await Promise.all([page.locator('.detail-price').boundingBox(),page.locator('.detail .notice').first().boundingBox(),about(page).boundingBox()]);
 expect(price!.y).toBeLessThan(notice!.y);expect(notice!.y).toBeLessThan(aboutBox!.y);
});
for(const [name,size] of [['phone',{width:375,height:760}],['small phone',{width:340,height:700}],['narrowest phone',{width:320,height:640}],['desktop',{width:1280,height:800}]] as const)
test(`the details fit without overflow on ${name}`,async({page})=>{
 await page.setViewportSize(size);await page.goto('/items/93001');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 for(const loc of [page.locator('.facts'),about(page),page.locator('.original-listing')]){const box=(await loc.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(size.width+0.5);}
 for(const dt of await page.locator('.about dt').all()){const d=(await dt.boundingBox())!;expect(d.width).toBeGreaterThan(0);}
});
test('demo listings are untouched: no provenance block, and the sample style line remains',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('forme-data-mode','demo'));await page.goto('/items/1');
 await expect(page.locator('.about')).toHaveCount(0);await expect(page.locator('.translation-note')).toHaveCount(0);await expect(page.locator('.detail .facts dt').first()).toHaveText('Size');
 await expect(page.locator('.detail-style')).toContainText('Illustrative rarity');
});
