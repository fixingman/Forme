import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: true,
  use: {baseURL:'http://127.0.0.1:3000', browserName:'chromium', launchOptions:process.env.CI?{}:{channel:'chrome'}, trace:'retain-on-failure'},
  // Blank (not unset) so a developer's real Supabase values in .env.local can't switch on sign-in inside the tests.
  webServer:{command:'npm run dev',env:{NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'',SUPABASE_SERVICE_ROLE_KEY:'',FORME_REQUIRE_AUTH:''},url:'http://127.0.0.1:3000',reuseExistingServer:!process.env.CI,timeout:120000},
});
