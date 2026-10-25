import {test,expect,type Page} from '@playwright/test';
import {defaults} from '../../lib/catalog';

const DAY=86400000,now=Date.now(),iso=(ms:number)=>new Date(ms).toISOString();
const at=iso(now-DAY);
const piece=(id:number,brand:string,title:string,extra:Record<string,unknown>={})=>({id,brand,title,source:'vinted',sourceId:String(id),sourceKey:`vinted:${id}`,sourceUrl:`https://www.vinted.se/items/${id}-fixture`,imageUrl:'https://images1.vinted.net/fixture.webp',price:1200,currency:'SEK',size:'M',condition:'Very good',gender:'men',genderSource:'provider',fetchedAt:at,firstSeenAt:at,observedAt:at,newlyCollected:false,category:'',style:'',age:1,rarity:0,image:'',...extra});
const closed=(availability:string)=>({availability,availabilitySource:'provider',availabilityObservedAt:iso(now-DAY/2)});
// Titles marked "real" are entries in data/title-translations.json, so each listing lands in the translation state its name says.
const items=[
 piece(93001,'Our Legacy','Jeans fra Our Legacy',{originalTitle:'Jeans fra Our Legacy',originalCondition:'Mycket bra',size:'48 | W32',genderSource:'search-filter'}),            // real: translated to "Jeans from Our Legacy"
 piece(93003,'Acne Studios','Cotton shirt',{category:'Shirts',originalTitle:'Acne skjorta',originalCondition:'Fint skick',condition:'Condition not translated'}),   // not in the cache: pending, condition untranslated
 piece(93004,'Plain Co','Mystery object',{gender:'women',genderSource:'title',size:'Not provided'}),
 piece(93005,'Our Legacy','Our Legacy box shirt',{originalTitle:'Our Legacy box shirt',originalCondition:'Very good'}),                                              // real: English original, nothing translated
 piece(93006,'Studio Nicholson','Archive vintage wool coat',{size:'L',gender:'unknown',genderSource:'unknown'}),
 piece(93010,'Lemaire','Wide jeans',{newlyCollected:true,firstSeenAt:iso(now-3600e3),observedAt:iso(now-3600e3),fetchedAt:iso(now-3600e3),previousPrice:1500,price:1200}),
 piece(93011,'Lemaire','Raised price jeans',{previousPrice:900,price:1200}),
 piece(93012,'Lemaire','Checked jeans',closed('available')),
 piece(93013,'Lemaire','Sold jeans',closed('sold')),
 piece(93014,'Lemaire','Reserved jeans',closed('reserved')),
 piece(93015,'Lemaire','Removed jeans',closed('unavailable')),
 piece(93016,'Lemaire','Old sighting jeans',{observedAt:iso(now-12*DAY),fetchedAt:iso(now-12*DAY),firstSeenAt:iso(now-12*DAY)}),
];
const settings={...defaults,following:[],excluded:[],styles:[],searches:[],saved:[],dismissed:[],styleRules:{},tasteFeedback:[],gender:{selected:['men','women','unisex'],includeUnknown:true},sizing:{enabled:false,selected:[],includeOneSize:true,includeUnspecified:true}};
test.beforeEach(async({page})=>{
 await page.addInitScript(value=>{localStorage.setItem('forme-onboarding-complete','1');if(!localStorage.getItem('forme-v2'))localStorage.setItem('forme-v2',JSON.stringify(value));},settings);
 await page.route('**/api/listings',route=>route.fulfill({json:{fetchedAt:iso(now-3600e3),queries:['fixture'],items}}));
 for(const path of ['size-profile','local-profile','profile','refresh'])await page.route(`**/api/${path}`,route=>route.fulfill({status:503,json:{error:'Isolated test'}}));
 await page.route('https://images1.vinted.net/**',route=>route.fulfill({status:404,body:''}));
});
const about=(page:Page)=>page.locator('.about');
const row=(page:Page,label:string)=>page.locator('.about dl > div').filter({has:page.locator('dt',{hasText:new RegExp(`^${label}$`)})});
const status=(page:Page)=>page.locator('.item-status');
const actions=(page:Page)=>page.locator('.detail-actions');

// ------------------------------------------------------------------ title block
test('the title block is source, brand, then title; the time moved to the status line',async({page})=>{
 await page.goto('/items/93001');
 await expect(page.locator('.detail .eyebrow')).toHaveText('Vinted');await expect(page.locator('.detail .eyebrow')).not.toContainText('Observed');
 await expect(page.getByRole('heading',{level:1,name:'Our Legacy',exact:true})).toBeVisible();await expect(page.getByRole('heading',{level:2,name:'Jeans from Our Legacy',exact:true})).toBeVisible();
 await expect(page.locator('.detail time')).toHaveCount(0);
});
test('"New to FORME" appears beside the source, as on cards, only for newly collected pieces',async({page})=>{
 await page.goto('/items/93010');await expect(page.locator('.detail .eyebrow .eyebrow-new')).toHaveText('New to FORME');
 await page.goto('/items/93001');await expect(page.locator('.eyebrow-new')).toHaveCount(0);
});

// ------------------------------------------------------------------ facts and price
test('size and condition are labelled facts; a missing size is omitted instead of filled; untranslated condition shows the seller’s words',async({page})=>{
 await page.goto('/items/93001');
 const facts=page.locator('.detail .facts');await expect(facts.locator('dt')).toHaveText(['Size','Condition']);await expect(facts.locator('dd')).toHaveText(['48 | W32','Very good']);
 await expect(page.locator('.detail')).not.toContainText('· ·');
 await page.goto('/items/93004');await expect(page.locator('.detail .facts dt')).toHaveText(['Condition']);await expect(page.locator('.detail')).not.toContainText('Not provided');
 await page.goto('/items/93003');await expect(page.locator('.detail .facts dt')).toHaveText(['Size','Condition','Category']);await expect(page.locator('.detail .facts dd').nth(1)).toHaveText('Fint skick');await expect(page.locator('.detail')).not.toContainText('Condition not translated');await expect(page.locator('.detail .facts dd').nth(2)).toHaveText('Shirts');
});
test('the price stands alone, and a price change shows exactly as on cards',async({page})=>{
 await page.goto('/items/93001');await expect(page.locator('.detail-price')).toHaveText(/^1\s?200\skr$/);await expect(page.locator('.price-note')).toHaveCount(0);await expect(page.getByText('excl. delivery')).toHaveCount(0);await expect(page.locator('.previous-price')).toHaveCount(0);
 await page.goto('/items/93010');await expect(page.locator('.detail-price .previous-price')).toHaveText(/Previously 1\s?500\skr · down 300\skr/);
 await page.goto('/items/93011');await expect(page.locator('.detail-price .previous-price')).toHaveText(/Previously 900\skr · up 300\skr/);
 await page.goto('/following').catch(()=>0);
});
test('the old boilerplate paragraphs are gone: one footnote, nothing repeated',async({page})=>{
 await page.goto('/items/93001');
 await expect(page.getByText('Price is the last observed item price')).toHaveCount(0);await expect(page.getByText('A search result or missing result does not confirm')).toHaveCount(0);await expect(page.locator('.detail .notice')).toHaveCount(0);
 await expect(page.locator('.about-note')).toHaveText('Brand and condition are marketplace labels, not independently authenticated. Category and style are FORME’s inference.');
});

// ------------------------------------------------------------------ status line
const cases:[string,number,string,string,string,RegExp][]=[
 ['checked and available',93012,'available','ok','Available when last checked',/^Checked \d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}$/],
 ['sold',93013,'sold','closed','Sold',/^Marked sold on Vinted · checked /],
 ['reserved',93014,'reserved','warn','Reserved',/^Reserved on Vinted · checked /],
 ['removed or hidden',93015,'removed','closed','Removed or hidden',/^No longer shown on Vinted · checked /],
 ['not seen for over a week',93016,'stale','warn','Availability not confirmed',/over 7 days ago$/],
];
for(const [name,id,state,tone,label,detail] of cases)
test(`status line: ${name}`,async({page})=>{
 await page.goto(`/items/${id}`);
 await expect(status(page)).toHaveCount(1);await expect(status(page)).toHaveAttribute('data-state',state);await expect(status(page)).toHaveAttribute('data-tone',tone);
 await expect(status(page).locator('strong')).toHaveText(label);await expect(status(page).locator('span')).toHaveText(detail);
 // state is carried by words, never by colour alone
 expect((await status(page).innerText()).length).toBeGreaterThan(10);
});
test('the everyday default says nothing: no availability line, no "last seen", for a listing we simply have not checked',async({page})=>{
 await page.goto('/items/93001');
 await expect(status(page)).toHaveCount(0);await expect(page.getByText('Availability not confirmed')).toHaveCount(0);await expect(page.getByText('Last seen')).toHaveCount(0);
 await expect(page.locator('.detail-price')).toBeVisible();await expect(actions(page)).toBeVisible();   // price goes straight to the actions
 const [price,row]=await Promise.all([page.locator('.detail-price').boundingBox(),actions(page).boundingBox()]);expect(row!.y-(price!.y+price!.height)).toBeLessThan(40);
});
test('a listing with no sighting time at all also says nothing',async({page})=>{
 await page.route('**/api/listings',route=>route.fulfill({json:{fetchedAt:iso(now-3600e3),queries:['fixture'],items:items.map(i=>i.id===93001?{...i,observedAt:undefined}:i)}}));
 await page.goto('/items/93001');await expect(page.locator('.detail h1')).toBeVisible();await expect(status(page)).toHaveCount(0);
});
test('the status line sits between the price and the actions, and a closed state is visually distinct',async({page})=>{
 await page.goto('/items/93013');
 const [price,line,row]=await Promise.all([page.locator('.detail-price').boundingBox(),status(page).boundingBox(),actions(page).boundingBox()]);
 expect(price!.y+price!.height).toBeLessThanOrEqual(line!.y+1);expect(line!.y+line!.height).toBeLessThanOrEqual(row!.y+1);
 const closedColour=await status(page).locator('strong').evaluate(e=>getComputedStyle(e).color);
 await page.goto('/items/93012');expect(await status(page).locator('strong').evaluate(e=>getComputedStyle(e).color)).not.toBe(closedColour);   // available is not styled like sold
});
test('a sold or removed piece can still be saved, restored and opened on Vinted to confirm',async({page})=>{
 await page.goto('/items/93013');
 await expect(actions(page).getByRole('button',{name:'Save item',exact:true})).toBeEnabled();await expect(actions(page).getByRole('link',{name:/View on Vinted/})).toBeVisible();
});

// ------------------------------------------------------------------ translation
test('translation is said once: a note while pending, a quiet disclosure when translated, nothing when it was English already',async({page})=>{
 await page.goto('/items/93003');
 await expect(page.locator('.detail .translation-note')).toHaveText('English title not available yet. Showing the original.');await expect(page.locator('.original-listing')).toHaveCount(0);
 await page.goto('/items/93001');await expect(page.locator('.translation-note')).toHaveCount(0);
 const details=page.locator('.original-listing');await expect(details.locator('summary')).toHaveText('Translated · show original');await expect(details).not.toHaveAttribute('open','');
 await details.locator('summary').click();await expect(details.getByText('Jeans fra Our Legacy',{exact:true})).toBeVisible();await expect(details).toContainText('Condition: Mycket bra');await expect(details).toContainText('English wording may differ from the original.');
 await details.locator('summary').press('Enter');await expect(details).not.toHaveAttribute('open','');
 await page.goto('/items/93005');await expect(page.locator('.original-listing')).toHaveCount(0);await expect(page.locator('.translation-note')).toHaveCount(0);await expect(page.getByText('cached translation')).toHaveCount(0);
});

// ------------------------------------------------------------------ actions
test('one action row: Save is the primary, View on Vinted is secondary, Not for me is quiet, all in one place',async({page})=>{
 await page.setViewportSize({width:1280,height:800});await page.goto('/items/93001');
 const save=actions(page).getByRole('button',{name:'Save item',exact:true}),view=actions(page).getByRole('link',{name:/View on Vinted/}),notForMe=actions(page).getByRole('button',{name:/^Not for me:/});
 await expect(save).toBeVisible();await expect(view).toBeVisible();await expect(notForMe).toBeVisible();
 await expect(save).toHaveClass(/btn/);await expect(save).not.toHaveClass(/light/);await expect(view).toHaveClass(/light/);await expect(notForMe).toHaveClass(/textbutton/);
 const [a,b,c]=await Promise.all([save.boundingBox(),view.boundingBox(),notForMe.boundingBox()]);
 expect(Math.abs((a!.y+a!.height/2)-(b!.y+b!.height/2))).toBeLessThan(6);expect(b!.x).toBeGreaterThan(a!.x+a!.width);expect(c!.x).toBeGreaterThan(b!.x+b!.width);
 // only one dark primary button on the whole page
 expect(await page.locator('.detail .btn:not(.light)').count()).toBe(1);
});
test('View on Vinted opens the listing safely in a new tab and says so to screen readers',async({page})=>{
 await page.goto('/items/93001');const view=actions(page).getByRole('link',{name:/View on Vinted/});
 await expect(view).toHaveAttribute('href','https://www.vinted.se/items/93001-fixture');await expect(view).toHaveAttribute('target','_blank');await expect(view).toHaveAttribute('rel',/noopener/);await expect(view).toHaveAttribute('rel',/noreferrer/);
 await expect(view).toHaveAccessibleName('View on Vinted (opens in a new tab)');await expect(view.locator('svg')).toHaveAttribute('aria-hidden','true');
});
test('Save toggles with a filled heart, an accurate pressed state, and persists',async({page})=>{
 await page.goto('/items/93001');const save=()=>actions(page).getByRole('button',{name:/^Save item$|^Saved$/});
 await expect(save()).toHaveText('Save item');await expect(save()).toHaveAttribute('aria-pressed','false');await expect(save().locator('svg')).toHaveAttribute('fill','none');expect(await save().getAttribute('title')).toBeNull();
 await save().click();await expect(save()).toHaveText('Saved');await expect(save()).toHaveAttribute('aria-pressed','true');await expect(save().locator('svg')).toHaveAttribute('fill','currentColor');await expect(save()).toHaveAttribute('title','Remove from saved');
 await page.reload();await expect(save()).toHaveText('Saved');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).saved)).toEqual([93001]);
 await save().click();await expect(save()).toHaveText('Save item');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).saved)).toEqual([]);
 await expect(page.locator('.topbar a[href="/saved"]')).toContainText('0');
});
test('hiding the piece keeps the same row and says so beside Restore',async({page})=>{
 await page.goto('/items/93001');await actions(page).getByRole('button',{name:/^Not for me:/}).click();
 await expect(actions(page).getByRole('status')).toHaveText('Hidden from your feeds');await expect(actions(page).getByRole('button',{name:/^Restore /})).toBeVisible();await expect(actions(page).getByRole('button',{name:'Save item',exact:true})).toBeVisible();
});
test('an excluded brand explains itself once, with a way back',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('forme-v2',JSON.stringify({...JSON.parse(localStorage.getItem('forme-v2')!),excluded:['Our Legacy']})));
 await page.goto('/items/93001');await expect(page.locator('.brand-pref-note')).toContainText('Hidden from every feed.');await expect(page.locator('.brand-pref-note').getByRole('link',{name:'Your brands'})).toHaveAttribute('href','/brands');
});

// ------------------------------------------------------------------ About
test('About this listing is one line per fact, with its evidence beside the value',async({page})=>{
 await page.goto('/items/93001');
 await expect(about(page).getByRole('heading',{level:3,name:'About this listing'})).toBeVisible();
 await expect(row(page,'Department').locator('.v')).toHaveText('Men');await expect(row(page,'Department').locator('.s')).toHaveText('from the Men’s catalog search');
 await expect(row(page,'Category').locator('.v')).toHaveText('Bottoms');await expect(row(page,'Category').locator('.s')).toHaveText('inferred from the title');
 const [v,s]=await Promise.all([row(page,'Department').locator('.v').boundingBox(),row(page,'Department').locator('.s').boundingBox()]);
 expect(Math.abs(v!.y-s!.y)).toBeLessThan(6);expect(s!.x).toBeGreaterThan(v!.x+v!.width);
 // rows are compact: one line each (the row wrapper itself has no box, so measure the value cells)
 const [r1,r2]=await Promise.all([row(page,'Department').locator('dd').boundingBox(),row(page,'Category').locator('dd').boundingBox()]);expect(r2!.y-r1!.y).toBeLessThan(34);
});
test('style evidence: from the brand, or from the exact word in the title',async({page})=>{
 await page.goto('/items/93005');await expect(row(page,'Style').locator('.v')).toHaveText('Minimalism');await expect(row(page,'Style').locator('.s')).toHaveText('inferred from the brand');
 await page.goto('/items/93001');await expect(row(page,'Style').locator('.v')).toHaveText('Denim');await expect(row(page,'Style').locator('.s')).toHaveText('inferred from “jeans”');
 await page.goto('/items/93006');await expect(row(page,'Style').locator('.v')).toHaveText('Archive');await expect(row(page,'Style').locator('.s')).toHaveText('inferred from “archive”');
});
test('unknown and unclassified values are stated honestly and absent rows are omitted',async({page})=>{
 await page.goto('/items/93004');
 await expect(row(page,'Department').locator('.v')).toHaveText('Women');await expect(row(page,'Department').locator('.s')).toHaveText('stated in the title');
 await expect(row(page,'Category').locator('.v')).toHaveText('Not classified');await expect(row(page,'Category').locator('.s')).toHaveCount(0);await expect(row(page,'Style')).toHaveCount(0);await expect(row(page,'Mentions')).toHaveCount(0);
 await page.goto('/items/93006');await expect(row(page,'Department').locator('.v')).toHaveText('Not specified');await expect(row(page,'Department').locator('.s')).toHaveText('not provided');
 await expect(row(page,'Mentions').locator('.v')).toContainText('archive');await expect(row(page,'Mentions').locator('.s')).toHaveText('in the title, not a rarity rating');
});

// ------------------------------------------------------------------ order, size and fit
test('reading order is price, actions, brand, then About; Save is above the fold on a laptop',async({page})=>{
 await page.setViewportSize({width:1280,height:720});await page.goto('/items/93001');
 const y=async(sel:string)=>(await page.locator(sel).first().boundingBox())!.y;
 const order=[await y('.detail-price'),await y('.detail-actions'),await y('.brand-pref'),await y('.about')];
 expect(order).toEqual([...order].sort((a,b)=>a-b));
 const save=(await actions(page).getByRole('button',{name:'Save item',exact:true}).boundingBox())!;expect(save.y+save.height).toBeLessThanOrEqual(720);
});
test('the details column is shorter than before: well under 700px for a typical listing',async({page})=>{
 await page.setViewportSize({width:1280,height:900});await page.goto('/items/93001');
 expect((await page.locator('.detail > div').nth(1).boundingBox())!.height).toBeLessThan(700);
});
for(const [name,size] of [['phone',{width:375,height:760}],['small phone',{width:340,height:700}],['narrowest phone',{width:320,height:640}],['desktop',{width:1280,height:800}]] as const)
test(`every state fits without overflow on ${name}, with comfortable touch targets`,async({page})=>{
 await page.setViewportSize(size);
 for(const id of [93001,93013,93016,93010]){   // typical, sold, long-unseen and price-drop listings
  await page.goto(`/items/${id}`);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`id ${id}`).toBe(true);
  for(const loc of [page.locator('.facts'),...(await status(page).count()?[status(page)]:[]),actions(page),page.locator('.brand-pref'),about(page)]){const box=(await loc.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(size.width+0.5);}
  for(const control of [actions(page).getByRole('button',{name:'Save item',exact:true}),actions(page).getByRole('link',{name:/View on Vinted/}),actions(page).getByRole('button',{name:/^Not for me:/})])expect((await control.boundingBox())!.height,`id ${id}`).toBeGreaterThanOrEqual(36);
  for(const control of [actions(page).getByRole('button',{name:'Save item',exact:true}),actions(page).getByRole('link',{name:/View on Vinted/})])expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 }
});

// ------------------------------------------------------------------ sample listings
test('demo listings: no marketplace status, no View on Vinted, one honest sample note, and the sample style line remains',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('forme-data-mode','demo'));await page.goto('/items/1');
 await expect(page.locator('.item-status')).toHaveCount(0);await expect(page.locator('.about')).toHaveCount(0);await expect(page.locator('.translation-note')).toHaveCount(0);await expect(page.locator('.detail-price .price-note')).toHaveCount(0);
 await expect(actions(page).getByRole('link',{name:/View on Vinted/})).toHaveCount(0);await expect(actions(page).getByRole('button',{name:'Save item',exact:true})).toBeVisible();
 await expect(page.locator('.detail-sample-note')).toContainText('Illustrative product photo and fictional listing.');await expect(page.locator('.detail-style')).toContainText('Illustrative rarity');
 await expect(page.locator('.detail .facts dt').first()).toHaveText('Size');
});
