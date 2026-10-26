import {test,expect,type Page} from '@playwright/test';
import {defaults} from '../../lib/catalog';

// A piece you save leaves Discover (it is already yours), instead of piling up at the top. It stays in Saved items, and
// unsaving it from there makes it a recommendation again. Everything else on Discover is unaffected.
const at=new Date(Date.now()-86400000).toISOString();
const piece=(id:number,brand:string,title:string,extra:Record<string,unknown>={})=>({id,brand,title,source:'vinted',sourceId:String(id),sourceKey:`vinted:${id}`,sourceUrl:`https://www.vinted.se/items/${id}-x`,imageUrl:'https://images1.vinted.net/fixture.webp',price:200,currency:'SEK',size:'M',condition:'Good',gender:'men',genderSource:'provider',fetchedAt:at,observedAt:at,category:'',style:'Minimalism',rarity:0,age:1,image:'',...extra});
const items=[piece(97001,'Lemaire','Cotton trousers'),piece(97002,'Auralee','Silk shirt'),piece(97003,'Studio Nicholson','Wool coat'),piece(97004,'Margaret Howell','Linen shirt'),piece(97005,'Our Legacy','Followed brand shirt')];
const settings={...defaults,following:['Our Legacy'],excluded:[],styles:['Minimalism'],styleRules:{},saved:[],dismissed:[],searches:[],sizing:{enabled:false,selected:[],includeOneSize:true,includeUnspecified:true},gender:{selected:['men','unisex'],includeUnknown:false}};
test.beforeEach(async({page})=>{
 await page.addInitScript(value=>{localStorage.setItem('forme-onboarding-complete','1');if(!localStorage.getItem('forme-v2'))localStorage.setItem('forme-v2',JSON.stringify(value));},settings);
 await page.route('**/api/listings',route=>route.fulfill({json:{fetchedAt:at,queries:['fixture'],items}}));
 for(const path of ['size-profile','local-profile','profile','refresh','learning'])await page.route(`**/api/${path}`,route=>route.fulfill({status:503,json:{error:'Isolated test'}}));
 await page.route('https://images1.vinted.net/**',route=>route.fulfill({status:404,body:''}));
});
const card=(page:Page,id:number)=>page.getByTestId(`listing-${id}`);
const saveButton=(page:Page,brand:string,title:string)=>page.getByRole('button',{name:`Save ${brand} ${title}`,exact:true});
const stored=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).saved as number[]);
const order=(page:Page)=>page.locator('[data-testid^="listing-"]').evaluateAll(els=>els.map(el=>el.getAttribute('data-testid')!.replace('listing-','')));

test('saving a piece on Discover removes it from Discover and keeps it in Saved items',async({page})=>{
 await page.goto('/discover');
 await expect(card(page,97001)).toBeVisible();expect(await order(page)).toEqual(expect.arrayContaining(['97001','97002','97003','97004']));
 await saveButton(page,'Auralee','Silk shirt').click();
 await expect(card(page,97002)).toHaveCount(0);
 expect(await stored(page)).toEqual([97002]);
 for(const id of [97001,97003,97004])await expect(card(page,id)).toBeVisible();   // the rest of Discover is untouched
 await page.goto('/saved');await expect(card(page,97002)).toBeVisible();
 await expect(page.getByRole('button',{name:'Unsave Auralee Silk shirt',exact:true})).toBeVisible();
});
test('a saved piece stays out of Discover after a reload, and does not come back at the top',async({page})=>{
 await page.goto('/discover');await saveButton(page,'Auralee','Silk shirt').click();await expect(card(page,97002)).toHaveCount(0);
 await page.reload();await expect(card(page,97001)).toBeVisible();
 await expect(card(page,97002)).toHaveCount(0);expect(await order(page)).not.toContain('97002');
 await page.goto('/following');await expect(card(page,97005)).toBeVisible();
 await page.goto('/discover');await expect(card(page,97002)).toHaveCount(0);
});
test('unsaving from Saved items makes the piece a recommendation again',async({page})=>{
 await page.goto('/discover');await saveButton(page,'Lemaire','Cotton trousers').click();await expect(card(page,97001)).toHaveCount(0);
 await page.goto('/saved');await page.getByRole('button',{name:'Unsave Lemaire Cotton trousers',exact:true}).click();
 expect(await stored(page)).toEqual([]);
 await page.goto('/discover');await expect(card(page,97001)).toBeVisible();
});
test('saving several pieces removes each one, one at a time',async({page})=>{
 await page.goto('/discover');
 await saveButton(page,'Lemaire','Cotton trousers').click();await expect(card(page,97001)).toHaveCount(0);
 await saveButton(page,'Studio Nicholson','Wool coat').click();await expect(card(page,97003)).toHaveCount(0);
 expect((await stored(page)).sort()).toEqual([97001,97003]);
 await expect(card(page,97002)).toBeVisible();await expect(card(page,97004)).toBeVisible();
});
test('a saved piece is still shown everywhere else: Following, search results and its own page',async({page})=>{
 await page.goto('/following');await saveButton(page,'Our Legacy','Followed brand shirt').click();
 await expect(page.getByRole('button',{name:'Unsave Our Legacy Followed brand shirt',exact:true})).toBeVisible();   // still there, now marked saved
 await expect(card(page,97005)).toBeVisible();
 await page.goto('/items/97002');await page.getByRole('button',{name:/^Save/}).first().click();
 await expect(page.getByRole('heading',{name:'Silk shirt'})).toBeVisible();   // its page is unaffected
 await page.goto('/discover');await expect(card(page,97002)).toHaveCount(0);
});
test('when everything on Discover has been saved, the empty page explains where the pieces went',async({page})=>{
 await page.goto('/discover');
 for(const [brand,title,id] of [['Lemaire','Cotton trousers',97001],['Auralee','Silk shirt',97002],['Studio Nicholson','Wool coat',97003],['Margaret Howell','Linen shirt',97004]] as const){await saveButton(page,brand,title).click();await expect(card(page,id)).toHaveCount(0);}
 await expect(page.locator('[data-testid^="listing-"]')).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Discover',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'No discoveries that match yet'})).toBeVisible();
 await expect(page.getByText('Pieces you save leave Discover and stay in')).toBeVisible();
 await page.getByRole('link',{name:'Saved items',exact:true}).last().click();await expect(page).toHaveURL(/\/saved$/);await expect(card(page,97001)).toBeVisible();
 expect(await stored(page)).toHaveLength(4);
});
test('the explanation only appears once something is saved: a plain empty Discover is unchanged',async({page})=>{
 await page.route('**/api/listings',route=>route.fulfill({json:{fetchedAt:at,queries:['fixture'],items:[items[4]]}}));   // only a followed-brand piece: nothing to discover
 await page.goto('/discover');
 await expect(page.getByRole('heading',{name:'No discoveries that match yet'})).toBeVisible();
 await expect(page.getByText('Pieces you save leave Discover')).toHaveCount(0);
});
