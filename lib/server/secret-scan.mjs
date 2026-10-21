// Finds likely committed secrets. Returns line numbers and rule names only, never the matched text.
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const rules=[
 ['scrapebadger-live-key',/\bsb_live_[A-Za-z0-9_-]{16,}/],
 ['provider-key-assignment',/\b(?:SCRAPEBADGER|BRIGHTDATA|GOOGLE_TRANSLATE)_API_KEY\s*[=:]\s*["']?(?!\s|["']|#|\$|<|your|xxx|changeme)[A-Za-z0-9_-]{12,}/i],
 ['uuid-near-key-word',new RegExp(`(?:api[ _-]?key|token|secret).{0,12}?${uuid}`,'i')],
 ['supabase-secret-key',/\bsb_secret_[A-Za-z0-9_-]{16,}/],
 ['supabase-service-role-assignment',/\bSUPABASE_SERVICE_ROLE_KEY\s*[=:]\s*["']?(?!\s|["']|#|\$|<|your|xxx|changeme)[A-Za-z0-9_.-]{20,}/i],
 ['jwt-like-token',/\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/],
 ['private-key-block',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/]
];
export function scanText(text){
 const found=[];text.split('\n').forEach((line,index)=>{{const rule=rules.find(([,pattern])=>pattern.test(line))?.[0];if(rule)found.push({line:index+1,rule});}});
 return found;
}
