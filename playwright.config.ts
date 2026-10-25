import { defineConfig } from '@playwright/test';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Feedback recorded by the tests goes to a throwaway folder, never the owner's real .forme-data. The runner process (not the
// workers, which re-read this file) clears it, so every run starts empty.
const testData = join(tmpdir(), 'forme-e2e-data');
if (process.env.TEST_WORKER_INDEX === undefined) rmSync(testData, { recursive: true, force: true });
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: true,
  use: {baseURL:'http://127.0.0.1:3000', browserName:'chromium', launchOptions:process.env.CI?{}:{channel:'chrome'}, trace:'retain-on-failure'},
  // Blank (not unset) so a developer's real Supabase values in .env.local can't switch on sign-in inside the tests.
  webServer:{command:'npm run dev',env:{NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'',SUPABASE_SERVICE_ROLE_KEY:'',FORME_REQUIRE_AUTH:'',FORME_LEARNING_AUTO:'0',FORME_DATA_DIR:testData,FORME_ANALYSIS_PROVIDER:'',FORME_ANALYSIS_API_KEY:''},url:'http://127.0.0.1:3000',reuseExistingServer:!process.env.CI,timeout:120000},
});
