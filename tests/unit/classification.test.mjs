import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyListing} from '../../lib/domain/classification.mjs';
const group=title=>classifyListing({title,category:''}).productGroup;

test('garments the first version missed are now recognised, so their sizes are checked',()=>{
 for(const title of ['Our Legacy Glyptodon Bomber','Workshop box longsleeve','Misbhv tshirt','Boii blouse, size M','Welter Shelter Raincoat M','Crewneck Etudes','Hope jumpsuit','Norse projects trenchcoat','Lemaire Parachute blouson','Football Jersey','CDLP long johns - S'])assert.equal(group(title),'clothing',title);
 for(const title of ['Helmut Lang leggings / treggings','Axel Arigato Joggers','CDLP Heavyweight Sweatpants','Maharishi organic-cotton joggers, L'])assert.equal(group(title),'bottoms',title);
 for(const title of ['Black Maison Margiela GATs','Maison Margiela Tabi','Tabi ballet flats, size 38'])assert.equal(group(title),'shoes',title);
 for(const title of ['Balenciaga bracelet','Balenciaga Papier A4 Tote','And Wander Ecopak shoulder pouch','SLP brooch'])assert.equal(group(title),'accessories',title);
});
test('words from the other languages seen on Vinted are understood, accents or not',()=>{
 for(const title of ['Kortærmet skjorte fra Lemaire','APC tröja','Y-3 vit skjorta med logga – M','Dry silk jakke i espresso brun','Lemaire uld frakke','Granatowy sweter A.P.C.','kurtka jeansowa A.P.C','Marynarka męska Auralee','Y3 bluse'])assert.equal(group(title),'clothing',title);
 for(const title of ['Lemaire bukser','Homme plissé issey miyake røde bukser','A.P.C selvedge farkut'])assert.equal(group(title),'bottoms',title);
 assert.equal(group('TRÖJA'),'clothing');assert.equal(group('Tröja'),group('troja'));
});
test('home and beauty goods are recognised so they are never size-checked as clothes',()=>{
 for(const title of ['Hario V60 dripper','Hario coffee brewer','Georg Jensen Christmas ornament, 2015','Georg Jensen picture frame','Serving dish','Alessi glass storage jar','Alessi espresso cups with saucers','Fellow milk jug','HAY glass figurine','Alessi napkin rings'])assert.equal(group(title),'homeware',title);
 for(const title of ['Deodorant spray','Pour Homme body wash, 50 ml','YSL Y le parfum','L’eau D’Issey Pour Homme 50 ml shower gel'])assert.equal(group(title),'beauty',title);
});
test('a specific garment or accessory beats a generic home word, whichever comes first in the title',()=>{
 assert.equal(group('Christmas sweater'),'clothing');assert.equal(group('Jul tröja'),'clothing');assert.equal(group('Glass bead necklace'),'accessories');
 assert.equal(group('Coffee brown leather boots'),'shoes');assert.equal(group('Ceramic ring'),'accessories');assert.equal(group('Tie-dye shirt'),'clothing');assert.equal(group('Short sleeve shirt'),'clothing');
 assert.equal(group('Butter Goods hoodie'),'clothing');
});
test('words that are everyday language elsewhere are not guessed from',()=>{
 assert.equal(group('Bra skick, Nike'),'unknown','Swedish for "good condition"');
 assert.equal(group('Kappa'),'unknown','a brand name, not a garment');
 assert.equal(group('Butter Goods'),'unknown');assert.equal(group('Garden hose'),'unknown');assert.equal(group('Oversized short'),'unknown','singular short could be a sleeve length');
});
test('titles that only name the brand or a fabric stay unknown rather than being guessed',()=>{
 for(const title of ['Eytys','Auralee','Studio Nicholson','100% wool','70% cashmere, 30% merino wool','Issen miyake pure nectar','Pink ukulele'])assert.equal(group(title),'unknown',title);
});
test('the size group follows the category, and the source says it was inferred from the title',()=>{
 assert.deepEqual(classifyListing({title:'Our Legacy Bomber',category:''}),{productGroup:'clothing',sizeGroup:'clothing',categorySource:'title-inference'});
 assert.deepEqual(classifyListing({title:'Joggers',category:''}),{productGroup:'bottoms',sizeGroup:'waist',categorySource:'title-inference'});
 assert.deepEqual(classifyListing({title:'Margiela Tabi',category:''}),{productGroup:'shoes',sizeGroup:'shoes',categorySource:'title-inference'});
 assert.deepEqual(classifyListing({title:'Hario V60',category:''}),{productGroup:'homeware',sizeGroup:'none',categorySource:'title-inference'});
 assert.deepEqual(classifyListing({title:'Eytys',category:''}),{productGroup:'unknown',sizeGroup:'unknown',categorySource:'unknown'});
});
test('a provider category is read as well as the title, and missing fields are fine',()=>{
 assert.equal(classifyListing({title:'Margiela',category:'Sneakers'}).productGroup,'shoes');
 assert.equal(classifyListing({}).productGroup,'unknown');
});
