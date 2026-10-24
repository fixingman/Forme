import {test,expect} from '@playwright/test';
// Default local run: no Supabase configured, so sign-in is simply unavailable and nothing is gated.
test('the login page says sign-in is not set up, offers no form, and is not wrapped in the app shell',async({page})=>{
 await page.goto('/login');
 await expect(page.getByText('Sign-in isn’t set up on this server.',{exact:false})).toBeVisible();
 await expect(page.getByLabel('Email')).toHaveCount(0);await expect(page.getByRole('navigation',{name:'Main navigation'})).toHaveCount(0);
});
test('the app itself is not gated when running locally without sign-in',async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('forme-onboarding-complete','1');localStorage.setItem('forme-data-mode','demo');});
 await page.goto('/discover');await expect(page).toHaveURL(/\/discover/);await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();
});
test('auth endpoints degrade cleanly when Supabase is not configured',async({request,baseURL})=>{
 const response=await request.post('/auth/login',{maxRedirects:0,headers:{origin:new URL(baseURL!).origin},form:{email:'a@b.co'}});
 expect(response.status()).toBe(303);expect(response.headers().location).toContain('error=unavailable');
 expect(await (await request.get('/api/profile')).json()).toEqual({sync:'disabled'});
});
