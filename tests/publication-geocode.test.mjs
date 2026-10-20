import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const files=await Promise.all(['GpPublication.gs','FacebookImport.gs','ShipmentPublication.gs'].map(n=>readFile(new URL('../apps-script/'+n,import.meta.url),'utf8')));
// Synthetic coordinates test validation and mapping; they are not real meeting points.
const paris={formatted_address:'18e Arrondissement, 75018 Paris, France',address_components:[{long_name:'18e Arrondissement',types:['sublocality_level_1']},{long_name:'Paris',types:['locality']},{long_name:'75018',types:['postal_code']},{short_name:'FR',long_name:'France',types:['country']}],geometry:{location:{lat:48.9,lng:2.3},location_type:'APPROXIMATE'}};
const scat={formatted_address:'Dakar, Sénégal',address_components:[{long_name:'S.C.A.T. Urbam',types:['neighborhood']},{long_name:'Dakar',types:['locality']},{short_name:'SN',long_name:'Sénégal',types:['country']}],geometry:{location:{lat:14.7,lng:-17.4},location_type:'APPROXIMATE'}};
function fixture(provider){const requests=[],logs=[];const c=vm.createContext({GOOGLE_MAPS_API_KEY:'synthetic-test-key',UrlFetchApp:{fetch:url=>{requests.push(url);return {getContentText:()=>JSON.stringify(typeof provider==='function'?provider(url):provider)};}},Logger:{log:v=>logs.push(v)}});for(const s of files)vm.runInContext(s,c);return {c,requests,logs};}
test('Paris 18ème uses the existing Google Maps key and accepts canonical arrondissement components',()=>{
 const f=fixture({status:'OK',results:[paris]}),g=f.c.publicationLocation_('Paris','Paris 18ème');
 assert.equal(g.reason,'OK');assert.equal(g.lat,48.9);assert.equal(g.precision,'quartier_approx');assert.equal(g.quarter,'Paris 18ème');
 const url=new URL(f.requests[0]);assert.equal(url.searchParams.get('key'),'synthetic-test-key');assert.equal(url.searchParams.get('language'),'fr');assert.equal(url.searchParams.get('components'),'country:FR');assert.equal(url.searchParams.get('address'),'18e arrondissement, Paris, France');
});
test('Scat Urbam matches a structured neighborhood, including acronym punctuation absent from display address',()=>{
 const f=fixture({status:'OK',results:[scat]}),g=f.c.publicationLocation_('Dakar','Scat Urbam');assert.equal(g.reason,'OK');assert.equal(g.lat,14.7);assert.equal(g.precision,'quartier_approx');
});
test('a street numbered 18 in the wrong Paris district cannot become Paris 18e',()=>{
 const bad=structuredClone(paris);bad.formatted_address='18 Rue Exemple, 75017 Paris, France';bad.address_components[0]={long_name:'18',types:['street_number']};bad.address_components[2].long_name='75017';
 assert.equal(fixture({status:'OK',results:[bad]}).c.publicationLocation_('Paris','Paris 18ème').lat,'');
});
test('API denial is diagnosed; wrong country, partial, ambiguous and invalid GPS remain blank',()=>{
 const denied=fixture({status:'REQUEST_DENIED',error_message:'Do not print this upstream message'});assert.equal(denied.c.publicationLocation_('Paris','Paris 18ème').reason,'REQUEST_DENIED');assert.match(denied.logs[0],/REQUEST_DENIED/);assert.doesNotMatch(denied.logs[0],/synthetic-test-key|upstream message/);
 const country=structuredClone(paris);country.address_components[3].short_name='US';
 const partial={...paris,partial_match:true};const invalid=structuredClone(paris);invalid.geometry.location.lat=999;
 for(const results of [[country],[partial],[paris,paris],[invalid]])assert.equal(fixture({status:'OK',results}).c.publicationLocation_('Paris','Paris 18ème').lat,'');
});
test('city-only precision is explicit; multiple depots do not select an invented GPS point',()=>{
 const f=fixture({status:'OK',results:[paris]});assert.equal(f.c.publicationLocation_('Paris','Ville uniquement').precision,'ville_approx');const g=f.c.publicationLocation_('Paris','Paris 18e; Fresnes');assert.equal(g.reason,'MULTIPLE_LOCATIONS');assert.equal(f.requests.length,1);
});
test('other France/Senegal communes can be resolved without a hard-coded city list',()=>{
 const v={...paris,formatted_address:'Centre, Villeurbanne, France',address_components:[{long_name:'Centre',types:['neighborhood']},{long_name:'Villeurbanne',types:['locality']},{short_name:'FR',types:['country']}]};const f=fixture({status:'OK',results:[v]});assert.equal(f.c.publicationLocation_('Villeurbanne','Centre').reason,'OK');const wrong=structuredClone(v);wrong.address_components[2].short_name='US';assert.equal(fixture({status:'OK',results:[wrong]}).c.publicationLocation_('Villeurbanne','Centre').lat,'');
});
test('owner repair fills only missing GPS on current Chat-GP publications and remains idempotent',()=>{
 const f=fixture(url=>({status:'OK',results:[url.includes('country:SN')?scat:paris]}));
 const h=['gp_id','publication_request_id','source','ville_depart','ville_arrivee','quartier_depart','quartier_arrivee','lat_depart','lng_depart','lat_arrivee','lng_arrivee','precision_gps_depart','precision_gps_arrivee','geocodage_depart','geocodage_arrivee','statut','date_depart','whatsapp'];
 const item={gp_id:'GP_new_test',publication_request_id:'owner_publication_test_001',source:'Chat-GP',ville_depart:'Paris',ville_arrivee:'Dakar',quartier_depart:'Paris 18ème',quartier_arrivee:'Scat Urbam',statut:'ACTIF',date_depart:'2026-10-30',whatsapp:'private-contact-not-to-change'};
 const row=h.map(k=>item[k]??''),privateRow=h.map(k=>({...item,gp_id:'GP_historical',publication_request_id:''})[k]??''),rows=[h,row,privateRow];let writes=0;
 const sheet={getDataRange:()=>({getValues:()=>rows.map(r=>r.slice())}),getRange:(r,c,n=1,w=1)=>({getValues:()=>rows.slice(r-1,r-1+n).map(a=>a.slice(c-1,c-1+w)),setValue:v=>{rows[r-1][c-1]=v;writes++;}})};
 f.c.SpreadsheetApp={openById:()=>({getSheetByName:n=>n==='GP_TRANSPORTEURS'?sheet:null}),flush(){}};f.c.Utilities={formatDate:()=> '2026-10-20'};f.c.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})};
 const before=JSON.stringify(privateRow);assert.equal(f.c.diagnosePublicationGps().locations.length,2);assert.equal(writes,0);
 const result=f.c.repairMissingPublicationGps();assert.equal(result.locations.filter(x=>x.updated).length,2);assert.equal(rows[1][h.indexOf('lat_depart')],48.9);assert.equal(rows[1][h.indexOf('lat_arrivee')],14.7);assert.equal(rows[1][h.indexOf('whatsapp')],item.whatsapp);assert.equal(JSON.stringify(rows[2]),before);assert.equal(writes,8);assert.equal(f.c.repairMissingPublicationGps().locations.length,0);assert.equal(writes,8);
});

test('a quarter resolved only as a POI falls back to its validated parent commune with an explicit precision note',()=>{
 const poi={formatted_address:'18 Rue GY 221, Dakar, Sénégal',address_components:[{long_name:'Grand Yoff',types:['sublocality_level_1','political']},{long_name:'Dakar',types:['locality']},{short_name:'SN',long_name:'Sénégal',types:['country']}],geometry:{location:{lat:14.79,lng:-17.41},location_type:'ROOFTOP'},types:['establishment','point_of_interest']};
 const parent={...poi,formatted_address:'Grand Yoff, Dakar, Sénégal',geometry:{location:{lat:14.72,lng:-17.45},location_type:'APPROXIMATE'},types:['sublocality_level_1','political']};
 const run=(p=poi,q=parent)=>fixture(url=>({status:'OK',results:[decodeURIComponent(url).includes('address=Grand Yoff,')?q:p]}));
 const f=run(),g=f.c.publicationLocation_('Dakar','Scat Urbam');assert.equal(g.lat,14.72);assert.notEqual(g.lat,poi.geometry.location.lat);assert.equal(g.precision,'commune_approx');assert.match(g.geocode,/quartier Scat Urbam non localisé précisément/);assert.equal(g.quarter,'Scat Urbam');assert.equal(f.requests.length,2);
 const wrongCity=structuredClone(poi);wrongCity.address_components[1].long_name='Thiès';const wc=run(wrongCity);assert.equal(wc.c.publicationLocation_('Dakar','Scat Urbam').lat,'');assert.equal(wc.requests.length,1);
 const partial={...parent,partial_match:true};assert.equal(run(poi,partial).c.publicationLocation_('Dakar','Scat Urbam').lat,'');
});
