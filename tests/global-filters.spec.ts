import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('forme-onboarding-complete','1');localStorage.setItem('forme-data-mode','demo');});
 await page.route('**/api/size-profile',route=>route.fulfill({json:{profile:null}}));
 await page.route('**/api/listings',route=>route.fulfill({json:{fetchedAt:new Date().toISOString(),items:[]}}));
});
test('one global trigger opens combined draft filters without toggling or applying changes until submit',async({page})=>{
 await page.goto('/discover');const trigger=page.getByRole('button',{name:'My sizes and departments',exact:true});
 await expect(page.locator('.topright').getByRole('button',{name:'My sizes and departments',exact:true})).toBeVisible();
 await expect(page.locator('.head').getByRole('button',{name:/sizes/i})).toHaveCount(0);
 await expect(page.locator('.department-control,.size-control')).toHaveCount(0);
 const before=await page.evaluate(()=>localStorage.getItem('forme-v2'));
 await trigger.click();const dialog=page.getByRole('dialog',{name:'My sizes & departments',exact:true});
 await dialog.getByLabel('Women',{exact:true}).uncheck();await dialog.getByLabel('Include items with an unknown department',{exact:true}).uncheck();await dialog.getByRole('button',{name:'M',exact:true}).click();
 expect(await page.evaluate(()=>localStorage.getItem('forme-v2'))).toBe(before);
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();expect(await page.evaluate(()=>localStorage.getItem('forme-v2'))).toBe(before);
 await trigger.click();await expect(dialog.getByLabel('Women',{exact:true})).toBeChecked();await expect(dialog.getByRole('button',{name:'M',exact:true})).toHaveAttribute('aria-pressed','false');
 await dialog.getByLabel('Women',{exact:true}).uncheck();await dialog.getByRole('button',{name:'M',exact:true}).click();await dialog.getByRole('button',{name:'Apply filters',exact:true}).click();
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Following',exact:true}).click();await trigger.click();await expect(dialog.getByLabel('Women',{exact:true})).not.toBeChecked();await expect(dialog.getByRole('button',{name:'M',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.keyboard.press('Escape');const applied=await page.evaluate(()=>localStorage.getItem('forme-v2'));await trigger.click();expect(await page.evaluate(()=>localStorage.getItem('forme-v2'))).toBe(applied);
});
test('mobile global filter sits beside saves and applies departments while retaining size choices in all-sizes mode',async({page})=>{
 await page.setViewportSize({width:375,height:812});await page.goto('/following');await page.getByRole('button',{name:'My sizes and departments',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Women',{exact:true}).uncheck();await dialog.getByRole('button',{name:'M',exact:true}).click();await dialog.getByRole('radio',{name:'All sizes',exact:true}).check();await dialog.getByRole('button',{name:'Apply filters',exact:true}).click();
 await page.reload();await expect(page.locator('.topright').getByRole('link',{name:'Saved items, 0',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'My sizes and departments',exact:true}).click();await expect(dialog.getByRole('radio',{name:'All sizes',exact:true})).toBeChecked();await expect(dialog.getByRole('button',{name:'M',exact:true})).toHaveAttribute('aria-pressed','true');await expect(dialog.getByLabel('Women',{exact:true})).not.toBeChecked();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('forme-v2')!).sizing.enabled)).toBe(false);
});

test('mobile filter keeps actions visible while options scroll and preserves custom labels',async({page})=>{
 await page.setViewportSize({width:375,height:812});await page.goto('/discover');await page.getByRole('button',{name:'My sizes and departments',exact:true}).click();const dialog=page.getByRole('dialog');
 const apply=dialog.getByRole('button',{name:'Apply filters',exact:true});let box=await apply.boundingBox();expect(box!.y+box!.height).toBeLessThanOrEqual(812);
 await dialog.getByText('Add another size',{exact:true}).click();await dialog.getByLabel('Size label',{exact:true}).fill('Tall M');await dialog.getByRole('button',{name:'Add size',exact:true}).click();
 box=await apply.boundingBox();expect(box!.y+box!.height).toBeLessThanOrEqual(812);expect(await dialog.locator('.size-form-body').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
 await apply.click();await page.getByRole('button',{name:'My sizes and departments',exact:true}).click();await expect(dialog.getByRole('button',{name:'Remove size Tall M (clothing)',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
