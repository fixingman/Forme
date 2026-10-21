// Conservative title inference. These are hints, not verified marketplace categories.
export function classifyListing(item){
 const text=`${item.category??''} ${item.title??''}`.toLowerCase();
 /** @type {[string,RegExp][]} */
 const rules=[
  ['toys',/\b(toy|play[ -]?doh|modelling clay|modeling clay)\b/],
  ['accessories',/\b(sunglasses|glasses|eyewear|wallet|belt|scarf|bag|backpack|watch|necklace|ring|earrings|cap|hat|beanie)\b/],
  ['shoes',/\b(footwear|shoes?|boots?|sneakers?|loafers?|sandals?|slippers?|trainers?|derbies)\b/],
  ['bottoms',/\b(trousers?|pants|jeans|shorts|skirt|denim trousers)\b/],
  ['clothing',/\b(clothing|jacket|coat|shirt|overshirt|turtleneck|knitwear|t-shirt|tee|sweater|knit|cardigan|hoodie|sweatshirt|blazer|dress|vest|top|fleece|parka|polo)\b/],
  ['homeware',/\b(homeware|vase|mug|plate|bowl|chair|lamp|candle|kettle|coffee maker|coffee grinder|teapot|cutlery|cushion|tray)\b/],
  ['beauty',/\b(perfume|fragrance|eau de|cosmetics|lipstick)\b/]
 ];
 const category=rules.find(([,pattern])=>pattern.test(text))?.[0]??'unknown';
 return {productGroup:category,sizeGroup:category==='bottoms'?'waist':category==='shoes'?'shoes':category==='clothing'?'clothing':category==='unknown'?'unknown':'none',categorySource:category==='unknown'?'unknown':'title-inference'};
}
