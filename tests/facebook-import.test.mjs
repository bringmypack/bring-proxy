import test from 'node:test';
import assert from 'node:assert/strict';
import {planFacebookImport} from '../lib/facebook-import.js';
const sources=[{id:'gpfrancesenegal',priority:1,enabled:true},{id:'320004609170313',priority:5,enabled:true}];
const h=['gp_id','role','nom','whatsapp','ville_depart','ville_arrivee','date_depart','statut','source','date_source','prix_kg','devise'];
const make=(group='gpfrancesenegal',post='123')=>({group_id:group,post_id:post,source_url:'https://www.facebook.com/groups/'+group+'/posts/'+post+'/',source_verified:true,year_verified:true,kind:'traveller_offer',operator:'GP public',origin:'Paris',destination:'Dakar',origin_country:'FR',destination_country:'SN',departure_date:'2026-10-26'});
const plan=(r,ids=[])=>planFacebookImport(r,ids,h,sources,'2026-10-20');
test('Snippets and uncertain years never enter the catalogue',()=>{
 assert.equal(plan([{...make(),source_verified:false}]).rows.length,0);
 assert.equal(plan([{...make(),year_verified:false}]).rows.length,0);
 assert.equal(plan([{...make(),departure_date:'2026-02-30'}]).rows.length,0);
});
test('Only approved groups, future offers and exact route countries pass',()=>{
 for(const r of [{...make(),source_url:'https://evil.example/posts/123/'},{...make(),kind:'sender_request'},{...make(),departure_date:'2026-10-19'},{...make(),origin_country:'BE'}])
 assert.equal(plan([r]).rows.length,0);
});
test('Own group wins over cross-posts, while existing post IDs are not reinserted',()=>{
 const result=plan([make('320004609170313','456'),make()]);
 assert.equal(result.rows.length,1);assert.equal(result.rows[0][0],'FB_gpfrancesenegal_123');
 assert.equal(result.duplicates[0].reason,'POSSIBLE_CROSS_POST_REVIEW');
 assert.equal(plan([make()],['FB_gpfrancesenegal_123']).rows.length,0);
});
test('Mapping uses headers, omits contacts and escapes formula text',()=>{
 const result=plan([{...make(),operator:'=IMPORTXML("x")',telephone:'+33612345678',price_per_kg:10}]);
 assert.equal(result.rows[0][2],"'=IMPORTXML(\"x\")");
 assert.equal(result.rows[0][3],'');assert.equal(result.rows[0][10],'');
 assert.throws(()=>planFacebookImport([make()],[],['gp_id'],sources,'2026-10-20'),/INVALID_HEADERS/);
});
