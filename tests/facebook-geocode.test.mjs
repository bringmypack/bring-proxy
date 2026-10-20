import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const script=await readFile(new URL('../apps-script/FacebookImport.gs',import.meta.url),'utf8');
const result=(country='FR',address='Vitry-sur-Seine, France',partial=false)=>({partial_match:partial,formatted_address:address,address_components:[{types:['country'],short_name:country}],geometry:{location:{lat:48.78,lng:2.39}}});
const place={query:'Vitry-sur-Seine, France',match_tokens:['vitry'],precision:'commune_approx'};
function geo(results,status='OK'){
 const c=vm.createContext({GOOGLE_MAPS_API_KEY:'test-not-a-real-key',UrlFetchApp:{fetch:()=>({getContentText:()=>JSON.stringify({status,results})})}});
 vm.runInContext(script,c);return c.fbImportGeocode_(place,'FR');
}
test('Geocoder accepts one country-matched result and retains approximate precision',()=>{
 const g=geo([result()]);assert.equal(g.verified,true);assert.equal(g.precision,'commune_approx');assert.equal(g.lat,48.78);
});
test('Wrong country, partial, ambiguous, missing neighborhood and service errors leave GPS empty',()=>{
 for(const [rows,status]of [[[result('SN')],'OK'],[[result('FR','Paris, France')],'OK'],[[result('FR',undefined,true)],'OK'],[[result(),result()],'OK'],[[],'REQUEST_DENIED']])assert.equal(geo(rows,status).verified,false);
});
test('Owner importer embeds the same tested planner, without an HTTP import action',async()=>{
 const planner=await readFile(new URL('../lib/facebook-import.js',import.meta.url),'utf8');
 assert.ok(script.startsWith(planner.replace('export function','function')));
 assert.doesNotMatch(script,/function doPost|function doGet/);
});

test('Street GPS requires the exact house number, postcode and address-level result',()=>{
 const address={query:'6 rue Affre 75018 Paris France',match_tokens:['6','rue','affre'],precision:'adresse',street_number:'6',postal_code:'75018'};
 const candidate={formatted_address:'6 Rue Affre, 75018 Paris, France',address_components:[{types:['country'],short_name:'FR'},{types:['street_number'],long_name:'6'},{types:['postal_code'],long_name:'75018'}],geometry:{location_type:'ROOFTOP',location:{lat:48.8,lng:2.3}}};
 const run=r=>{const c=vm.createContext({GOOGLE_MAPS_API_KEY:'test-not-a-real-key',UrlFetchApp:{fetch:()=>({getContentText:()=>JSON.stringify({status:'OK',results:[r]})})}});vm.runInContext(script,c);return c.fbImportGeocode_(address,'FR');};
 assert.equal(run(candidate).verified,true);
 const wrongNumber=structuredClone(candidate);wrongNumber.address_components[1].long_name='16';assert.equal(run(wrongNumber).verified,false);
 const wrongPostal=structuredClone(candidate);wrongPostal.address_components[2].long_name='75019';assert.equal(run(wrongPostal).verified,false);
 const approximate=structuredClone(candidate);approximate.geometry.location_type='APPROXIMATE';assert.equal(run(approximate).verified,false);
});
