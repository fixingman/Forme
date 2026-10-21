// Finds likely committed secrets. Returns line numbers and rule names only, never the matched text.
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const rules=[
 ['scrapebadger-live-key',/\bsb_live_[A-Za-z0-9_-]{16,}/],
 ['provider-key-assignment',/\b(?:SCRAPEBADGER|BRIGHTDATA|GOOGLE_TRANSLATE)_API_KEY\s*[=:]\s*["']?(?!\s|["']|#|\$|<|your|xxx|changeme)[A-Za-z0-9_-]{12,}/i],
 ['uuid-near-key-word',new RegExp(`(?:api[ _-]?key|token|secret).{0,12}?${uuid}`,'i')],
 ['private-key-block',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/]
];
export function scanText(text){
 const found=[];text.split('\n').forEach((line,index)=>{{const rule=rules.find(([,pattern])=>pattern.test(line))?.[0];if(rule)found.push({line:index+1,rule});}});
 return found;
}
