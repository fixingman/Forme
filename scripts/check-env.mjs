// Usage: node scripts/check-env.mjs   Reports which secrets are configured (never their values) and flags unsafe configuration.
import {existsSync} from 'node:fs';
import {checkEnv} from '../lib/server/env.mjs';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const result=checkEnv();
for(const [name,present] of Object.entries(result.present))console.log(`${present?'set    ':'not set'}  ${name}`);
for(const warning of result.warnings)console.log(`warning: ${warning}`);
for(const error of result.errors)console.error(`error: ${error}`);
process.exit(result.ok?0:1);
