import {test,expect} from '@playwright/test';
import {defaults} from '../../lib/catalog';
import {preferenceKey} from '../../lib/domain/ranking-preview.mjs';

const at=new Date(Date.now()-3600000).toISOString();
const piece=(id:number,brand:string,title:string)=>({id,brand,title,source:'vinted',sourceId:String(id),sourceKey:`vinted:${id}`,sourceUrl:`https://www.vinted.se/items/${id}-fixture`,imageUrl:'https://images1.vinted.net/fixture.webp',currency:'SEK',condition:'Good',fetchedAt:at,size:'M',gender:'men',genderSource:'provider',price:100,category:'',style:'',image:'',age:1,rarity:0});
const pieces=[piece(93001,'Auralee','Cotton shirt'),piece(93002,'Lemaire','Linen trousers'),piece(93003,'Studio Nicholson','Wool jacket')];
const settings={...defaults,following:['Our Legacy'],excluded:[],styles:[],saved:[],dismissed:[],styleRules:{},searches:[],gender:{selected:['men','women','unisex'],includeUnknown:true},sizing:{enabled:false,selected:[],includeOneSize:true,includeUnspecified:true}};
test.beforeEach(async({page})=>{
 await page.addInitScript(settings=>{localStorage.setItem('forme-onboarding-complete','1');if(!localStorage.getItem('forme-v2'))localStorage.setItem('forme-v2',JSON.stringify(settings));},settings);
 await page.route('**/api/listings',route=>route.fulfill({json:{fetchedAt:at,items:pieces}}));
 for(const name of ['size-profile','profile','local-profile','refresh'])await page.route(`**/api/${name}`,route=>route.fulfill({status:503,json:{error:'Isolated fixture'}}));
 await page.route('https://images1.vinted.net/**',route=>route.fulfill({status:404,body:''}));
});
async function comparisonMock(page:any,{fallback=false,conflictOnce=false}={}){
 let builds=0,votes=0,revision=0,session:any=null;let choices:Record<string,string>={};
 const keys=pieces.map(item=>item.sourceKey);
 const named=()=>[{id:'current',label:'Current',keys,mode:'current',note:'Normal Discover rules.'},{id:'river',label:'River',keys:[...keys].reverse(),mode:fallback?'fallback':'learned',note:fallback?'More positive and negative examples are needed. Showing Current order.':'Trained on frozen feedback.'},{id:'gorse',label:'Gorse',keys:[keys[1],keys[0],keys[2]],mode:fallback?'unavailable':'learned',note:fallback?'This model is unavailable. Showing Current order.':'Trained on frozen feedback.'}];
 await page.route('**/api/ranking-preview**',async(route:any)=>{
  const request=route.request(),query=new URL(request.url()).searchParams;
  if(request.method()==='GET'){
   if(!query.has('id'))return route.fulfill({json:{latest:session?.id??null,reviewChoices:0}});
   const reveal=query.get('reveal')==='1',blind=query.get('blind')==='1',engines=named();
   const views=blind?[engines[1],engines[2],engines[0]].map((row,index)=>({id:`edit-${index+1}`,label:`Edit ${String.fromCharCode(65+index)}${reveal?' · '+row.label:''}`,keys:row.keys,...(reveal?{mode:row.mode,note:row.note}:{})})):engines;
   return route.fulfill({json:{...session,choices,revision,views}});
  }
  const body=request.postDataJSON();
  if(body.action==='create'){
   builds++;session={id:'11111111-1111-4111-8111-111111111111',createdAt:at,profileKey:preferenceKey(body.profile.settings,body.profile.savedListings),items:pieces,views:named(),blindAvailable:!fallback,training:{positive:4,negative:25,revision:0},revision,choices};return route.fulfill({json:session});
  }
  expect(body.action).toBe('vote');votes++;
  if(conflictOnce&&votes===1)return route.fulfill({status:409,json:{error:'Preview choices changed in another tab. Reload this comparison before rating again.'}});
  expect(body.baseRevision).toBe(revision);revision++;if(body.choice===null)delete choices[body.key];else choices={...choices,[body.key]:body.choice};return route.fulfill({json:{revision}});
 });
 return {builds:()=>builds,votes:()=>votes};
}
test('Tools entry opens default Current view; switching and rating never change real saves or collect',async({page})=>{
 const mock=await comparisonMock(page),requests:{url:string;method:string}[]=[];
 page.on('request',request=>requests.push({url:request.url(),method:request.method()}));
 await page.goto('/tools');await page.getByRole('link',{name:'Open private ranking preview →',exact:true}).click();
 await page.getByRole('button',{name:'Create comparison',exact:true}).click();
 await expect(page.getByRole('button',{name:'Current',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.preview-product').first()).toHaveAttribute('data-testid','preview-93001');
 await page.getByRole('button',{name:'River',exact:true}).click();await expect(page.locator('.preview-product').first()).toHaveAttribute('data-testid','preview-93003');
 await page.getByRole('button',{name:'Would save: Wool jacket',exact:true}).click();
 await expect(page.getByRole('button',{name:'Would save: Wool jacket',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.preview-product').first()).toHaveAttribute('data-testid','preview-93003');
 await page.getByRole('button',{name:'Undo last preview choice',exact:true}).click();await expect(page.getByRole('button',{name:'Would save: Wool jacket',exact:true})).toHaveAttribute('aria-pressed','false');
 expect(mock.builds()).toBe(1);expect(mock.votes()).toBe(2);
 expect(await page.evaluate(()=>{const prefs=JSON.parse(localStorage.getItem('forme-v2')!);return {saved:prefs.saved,dismissed:prefs.dismissed};})).toEqual({saved:[],dismissed:[]});
 expect(requests.filter(row=>row.method==='POST'&&row.url.includes('/api/refresh'))).toEqual([]);
 expect(requests.filter(row=>row.method==='PUT'&&row.url.includes('/api/profile'))).toEqual([]);
 await page.reload();await expect(page.getByRole('button',{name:'Current',exact:true})).toHaveAttribute('aria-pressed','true');expect(mock.builds()).toBe(1);
});
test('blind edits hide identities until revealed and keep their order and assignment',async({page})=>{
 const mock=await comparisonMock(page);await page.setViewportSize({width:390,height:844});await page.goto('/tools/ranking-preview');await page.getByRole('button',{name:'Create comparison',exact:true}).click();
 await page.getByRole('button',{name:'Blind comparison',exact:true}).click();
 await expect(page.getByRole('button',{name:'Edit A',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'River',exact:true})).toHaveCount(0);
 await expect(page.locator('.preview-product').first()).toHaveAttribute('data-testid','preview-93003');
 await page.getByRole('button',{name:'Edit B',exact:true}).click();await expect(page.locator('.preview-product').first()).toHaveAttribute('data-testid','preview-93002');
 await page.getByRole('button',{name:'Reveal engines',exact:true}).click();await expect(page.getByRole('button',{name:'Edit B · Gorse',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.preview-product').first()).toHaveAttribute('data-testid','preview-93002');expect(mock.builds()).toBe(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('a real preference change hides an old comparison until a fresh snapshot is requested',async({page})=>{
 await comparisonMock(page);await page.goto('/tools/ranking-preview');await page.getByRole('button',{name:'Create comparison',exact:true}).click();await expect(page.locator('.preview-product')).toHaveCount(3);
 await page.getByRole('button',{name:'My sizes and departments',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('checkbox',{name:'Women',exact:true}).uncheck();await dialog.getByRole('button',{name:'Apply filters',exact:true}).click();
 await expect(page.getByText('Your preferences changed.',{exact:false})).toBeVisible();await expect(page.locator('.preview-product')).toHaveCount(0);
 await page.getByRole('button',{name:'New comparison',exact:true}).click();await expect(page.locator('.preview-product')).toHaveCount(3);
});
test('fallbacks are labelled and blind mode stays unavailable until learned models are ready',async({page})=>{
 await comparisonMock(page,{fallback:true});await page.goto('/tools/ranking-preview');await page.getByRole('button',{name:'Create comparison',exact:true}).click();
 await expect(page.getByRole('button',{name:'Blind comparison',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'River',exact:true}).click();await expect(page.getByText('More positive and negative examples are needed. Showing Current order.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Gorse',exact:true}).click();await expect(page.getByText('This model is unavailable. Showing Current order.',{exact:true})).toBeVisible();
});
test('a conflicting vote stops writes and can reload choices without rebuilding',async({page})=>{
 const mock=await comparisonMock(page,{conflictOnce:true});await page.goto('/tools/ranking-preview');await page.getByRole('button',{name:'Create comparison',exact:true}).click();await page.getByRole('button',{name:'Not for me: Cotton shirt',exact:true}).click();
 await expect(page.getByRole('button',{name:'Reload preview choices',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Not for me: Cotton shirt',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Reload preview choices',exact:true}).click();await expect(page.getByRole('button',{name:'Not for me: Cotton shirt',exact:true})).toBeEnabled();expect(mock.builds()).toBe(1);expect(mock.votes()).toBe(1);
});
test('preview API rejects foreign origins, invalid IDs and malformed bodies before any models run',async({request,baseURL})=>{
 const origin=new URL(baseURL!).origin;
 const foreign=await request.post('/api/ranking-preview',{headers:{origin:'https://elsewhere.example'},data:{action:'create'}});expect(foreign.status()).toBe(403);
 const invalid=await request.get('/api/ranking-preview?id=not-a-session');expect(invalid.status()).toBe(400);
 const malformed=await request.post('/api/ranking-preview',{headers:{origin,'Content-Type':'application/json'},data:'null'});expect(malformed.status()).toBe(400);
});
