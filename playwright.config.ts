import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', fullyParallel: true,
  use: {baseURL:'http://127.0.0.1:3000', browserName:'chromium', launchOptions:process.env.CI?{}:{channel:'chrome'}, trace:'retain-on-failure'},
  webServer:{command:'npm run dev',url:'http://127.0.0.1:3000',reuseExistingServer:!process.env.CI,timeout:120000},
});
