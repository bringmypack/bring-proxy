import test from 'node:test';
import assert from 'node:assert/strict';
import {planFacebookImport} from '../lib/facebook-import.js';
const sources=[{id:'gpfrancesenegal',priority:1,enabled:true},{id:'320004609170313',priority:5,enabled:true}];
const h=['gp_id','role','nom','whatsapp','ville_depart','ville_arrivee','date_depart','statut','source','date_source','prix_kg','devise','capacite_kg'];
const make=(group='gpfrancesenegal',post='123')=>({group_id:group,post_id:post,source_url:'https://www.facebook.com/groups/'+group+'/posts/'+post+'/',source_verified:true,year_verified:true,kind:'traveller_offer',operator:'GP public',origin:'Paris',destination:'Dakar',origin_country:'FR',destination_country:'SN',departure_date:'2026-10-26'});
const plan=(r,ids=[])=>planFacebookImport(r,ids,h,sources,'2026-10-20');
test('Snippets and uncertain years never enter the catalogue',()=>{
 assert.equal(plan([{...make(),source_verified:false}]).rows.length,0);
 assert.equal(plan([{...make(),year_verified:false}]).rows.length,0);
 assert.equal(plan([{...make(),departure_date:'2026-02-30'}]).rows.length,0);
});
test('Only approved groups, future offers and exact route countries pass',()=>{
 for(const r of [{...make(),source_url:'https://evil.example/posts/123/'},{...make(),kind:'sender_request'},{...make(),departure_date:'2026-10-19'},{...make(),origin_country:'BE'},{...make(),operator:{}}])
 assert.equal(plan([r]).rows.length,0);
});
test('Own group wins over cross-posts, while existing post IDs are not reinserted',()=>{
 const result=plan([make('320004609170313','456'),make()]);
 assert.equal(result.rows.length,1);assert.match(result.rows[0][0],/^FB_gpfrancesenegal_123_20261026_/);
 assert.equal(result.duplicates[0].reason,'POSSIBLE_CROSS_POST_REVIEW');
 assert.equal(plan([make()],['FB_gpfrancesenegal_123']).rows.length,0);
 assert.equal(plan([make()],['FB_1393509021402141_123']).rows.length,0);
});

test('Two routes in one post get distinct stable IDs; retries and aliases stay idempotent',()=>{
 const a=make(), b={...make(),origin:'Dakar',destination:'Paris',origin_country:'SN',destination_country:'FR',departure_date:'2026-10-28'};
 const result=plan([a,b]);assert.equal(result.rows.length,2);assert.notEqual(result.rows[0][0],result.rows[1][0]);
 assert.equal(plan([a,b],result.rows.map(r=>r[0])).rows.length,0);
 const existing={id:'FB_1393509021402141_123',operator:a.operator,origin:a.origin,destination:a.destination,departure_date:a.departure_date,source_url:a.source_url};
 assert.equal(plan([a,b],[existing]).rows.length,1);
});

test('Private groups and conflicting dates cannot enter public catalogue',()=>{
 assert.equal(planFacebookImport([make()],[],h,[{...sources[0],visibility:'private'}],'2026-10-20').rows.length,0);
 assert.equal(plan([{...make(),date_conflict:true}]).rows.length,0);
});

test('Neighborhood evidence maps GPS by header only with validated country and precision',()=>{
 const headers=[...h,'quartier_depart','lieu_depart_texte','lat_depart','lng_depart','precision_gps_depart'];
 const place={source_verified:true,text:'Vitry-sur-Seine, France',neighborhood:'',geocode:{verified:true,lat:48.78,lng:2.39,country:'FR',precision:'commune_approx'}};
 const go=p=>planFacebookImport([{...make(),origin_place:p}],[],headers,sources,'2026-10-20').rows[0];
 assert.equal(go(place)[headers.indexOf('lat_depart')],48.78);
 assert.equal(go({...place,geocode:{...place.geocode,country:'SN'}})[headers.indexOf('lat_depart')],'');
 assert.equal(go({...place,geocode:{...place.geocode,lat:NaN}})[headers.indexOf('lat_depart')],'');
 assert.equal(go({...place,source_verified:false})[headers.indexOf('lieu_depart_texte')],'');
});
test('Mapping uses headers, omits contacts and escapes formula text',()=>{
 const result=plan([{...make(),operator:'=IMPORTXML("x")',telephone:'+33612345678',price_per_kg:10}]);
 assert.equal(result.rows[0][2],"'=IMPORTXML(\"x\")");
 assert.equal(result.rows[0][3],'');assert.equal(result.rows[0][10],'');
 const infinite=plan([{...make(),price_per_kg:Infinity,currency:'EUR',capacity_kg:Infinity}]);
 assert.equal(infinite.rows[0][10],'');assert.equal(infinite.rows[0][12],'');
 assert.throws(()=>planFacebookImport([make()],[],['gp_id'],sources,'2026-10-20'),/INVALID_HEADERS/);
});
