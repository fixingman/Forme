// Conservative title inference. These are hints, not verified marketplace categories.
// Text is accent-folded first, so "Tröja" and "troja" are one word. Rules run in order and the first match wins, so a specific
// garment beats a generic home word ("christmas sweater" is clothing, "christmas ornament" is homeware). A word that is also
// everyday language in another market (Swedish "bra" = good, "kappa" = a brand) is left out rather than guessed.
const fold=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
/** @type {[string,RegExp][]} */
const rules=[
 ['toys',/\b(toy|play[ -]?doh|modelling clay|modeling clay)\b/],
 ['accessories',/\b(sunglasses|glasses|eyewear|wallet|belt|scarf|bag|backpack|watch|necklace|ring|earrings|cap|hat|beanie|bracelets?|bangles?|totes?|pouch|clutch|purse|key ?chain|necktie|bow ?tie|gloves?|mittens?|headband|bandana|brooch|pendant|jewell?ery|cufflinks?|umbrella)\b/],
 ['shoes',/\b(footwear|shoes?|boots?|sneakers?|loafers?|sandals?|slippers?|trainers?|derbies|ballet flats|gats|tabi|clogs?|mules?|pumps|heels|oxfords?|brogues?|espadrilles?|flip[ -]?flops|sko|skor|schuhe|chaussures|stiefel|stovlar|stovler|buty)\b/],
 ['bottoms',/\b(trousers?|pants|jeans|shorts|skirt|denim trousers|sweatpants|joggers|chinos?|leggings|treggings|cargos?|culottes|slacks|bermudas?|byxor|byxa|bukser|pantalon|kjol|nederdel|spodnie|spodnica|farkut|housut)\b/],
 ['clothing',/\b(clothing|underwear|underpants|boxers?|briefs|trunks|socks?|pyjamas?|pajamas?|undershirt|jacket|coat|shirt|overshirt|turtleneck|knitwear|t-shirt|tee|sweater|knit|cardigan|hoodie|sweatshirt|blazer|dress|vest|top|fleece|parka|polo|t ?shirts?|bomber|long ?sleeves?|blouse|raincoat|windbreaker|anorak|jersey|gilet|poncho|kimono|cape|jumper|pullover|crew ?neck|henley|singlet|tunic|jumpsuit|coveralls?|shacket|trench|puffer|overcoat|topcoat|peacoat|waistcoat|half[ -]zip|quarter[ -]zip|zip[ -]?up|track ?suit|bodysuit|corset|lingerie|swimsuit|swimwear|bikini|bathrobe|robe|kaftan|caftan|skjorte|skjorta|troja|jacka|jakke|chemise|veste|manteau|hemd|jacke|mantel|kleid|bluse|klanning|kjole|trenchcoats?|blouson|long johns|frakke|sweter|kurtka|marynarka|koszula|bluza|sukienka|takki|paita)\b/],
 ['homeware',/\b(homeware|vase|mug|plate|bowl|chair|lamp|candle|kettle|coffee maker|coffee grinder|teapot|cutlery|cushion|tray|drippers?|brewer|syphon|siphon|v60|moka|espresso|coffee|tea (?:set|cup|pot|towel|strainer)|teacups?|decorations?|ornaments?|christmas|picture frame|candle ?holders?|serving|dish(?:es)?|carafe|decanter|jugs?|pitchers?|glassware|tableware|napkins?|tablecloths?|flask|glass|ceramic|porcelain|figurine)\b/],
 ['beauty',/\b(perfume|fragrance|eau de|eau d['’]?\w+|cosmetics|lipstick|deodorant|shower gel|body wash|shampoo|conditioner|body lotion|lotion|soap|cologne|parfum|toilette)\b/]
];
export function classifyListing(item){
 const text=fold(`${item.category??''} ${item.title??''}`);
 const category=rules.find(([,pattern])=>pattern.test(text))?.[0]??'unknown';
 return {productGroup:category,sizeGroup:category==='bottoms'?'waist':category==='shoes'?'shoes':category==='clothing'?'clothing':category==='unknown'?'unknown':'none',categorySource:category==='unknown'?'unknown':'title-inference'};
}
