import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {normalizeFacebookPost,extractFacebookOffers,isFacebookImageUrl,redactFacebookContacts} from '../lib/facebook-extract.js';
import {planFacebookImport} from '../lib/facebook-import.js';
const sources=[{id:'gpfrancesenegal',enabled:true,visibility:'public',priority:1},{id:'226193057954981',enabled:true,visibility:'private'}];
const item={url:'https://www.facebook.com/groups/gpfrancesenegal/permalink/123/?sale_post_id=123',time:'2026-10-20T11:00:00Z',user:{name:'Test Publisher'},text:'GP Paris-Dakar mercredi 21 octobre 2026'};
const today='2026-10-20',parse=(raw=item,ocr=[])=>extractFacebookOffers(normalizeFacebookPost(raw,sources),ocr,today);
test('Normalizes public post URLs and rejects private groups and injected source URLs',()=>{
 assert.equal(normalizeFacebookPost(item,sources).source_url,'https://www.facebook.com/groups/gpfrancesenegal/permalink/123/');
 for(const url of ['https://evil.test/groups/gpfrancesenegal/posts/123/','https://www.facebook.com/groups/226193057954981/posts/123/'])assert.throws(()=>normalizeFacebookPost({...item,url},sources));
 assert.equal(normalizeFacebookPost({...item,url:'https://www.facebook.com/groups/1393509021402141/posts/123/'},sources).group_id,'gpfrancesenegal');
});
test('Images accept only Facebook image CDN URLs; redirects and arbitrary destinations are disallowed',()=>{
 assert.equal(isFacebookImageUrl('https://scontent-den2-1.xx.fbcdn.net/a.jpg'),true);
 for(const url of ['http://scontent.xx.fbcdn.net/a.jpg','https://scontent.xx.fbcdn.net.evil.test/a.jpg','https://127.0.0.1/a.jpg','https://user@scontent.xx.fbcdn.net/a.jpg','https://scontent.xx.fbcdn.net:8080/a.jpg'])assert.equal(isFacebookImageUrl(url),false);
});
test('Shared post text is used; image placeholders are never treated as OCR',()=>{
 const p=normalizeFacebookPost({...item,text:'',sharedPost:{text:item.text,user:{name:'Original publisher'},time:item.time,media:[{id:'image',image:{uri:'https://scontent.xx.fbcdn.net/a.jpg'},ocrText:'May be an image of text'}]}},sources);
 assert.equal(p.author,'Original publisher');assert.equal(p.ocr_text,'');assert.equal(p.images.length,1);
 assert.equal(extractFacebookOffers(p,[],today).review.reason,'IMAGE_TEXT_REQUIRED');
 assert.equal(extractFacebookOffers(p,[item.text],today).records[0].departure_date,'2026-10-21');
});
test('Explicit offers and two routes from one post stay distinct; uncertain years and requests go to review',()=>{
 assert.equal(parse().records.length,1);
 assert.equal(parse({...item,text:'GP Dakar-Paris 22 octobre 2026. GP Paris-Dakar 27 octobre 2026'}).records.length,2);
 assert.equal(parse({...item,text:'GP Paris-Dakar le 21 octobre'}).records.length,0);
 assert.equal(parse({...item,text:'Je cherche un GP Paris-Dakar 21 octobre 2026'}).review.reason,'SENDER_REQUEST');
 assert.equal(parse({...item,text:'GP Paris-Dakar 21 octobre 2026 ou 23 octobre 2026'}).review.reason,'DATE_ROUTE_AMBIGUOUS');
 assert.equal(parse({...item,text:'GP Paris-Bamako 21 octobre 2026'}).review.reason,'ROUTE_REQUIRED');
});
test('Image/caption date conflicts are rejected, not silently corrected',()=>{
 assert.equal(parse({...item,text:'Après demain'},['GP Dakar-Paris 21 octobre 2026']).review.reason,'DATE_CONFLICT');
 assert.equal(parse({...item,text:'Demain GP Paris-Dakar 21 octobre 2026'}).records.length,1);
});

test('Unparsed addresses, inconsistent weekdays and distant OCR years require review',()=>{
 assert.equal(parse({...item,text:'GP Paris-Dakar 21 octobre 2026. Dépôt 6 rue Affre.'}).review.reason,'ADDRESS_REVIEW_REQUIRED');
 assert.equal(parse({...item,text:'GP Paris-Dakar 21 octobre 2026. Quartier inconnu.'}).review.reason,'LOCATION_REVIEW_REQUIRED');
 assert.equal(parse({...item,text:'GP Paris-Dakar mardi 21 octobre 2026'}).review.reason,'WEEKDAY_CONFLICT');
 assert.equal(parse({...item,text:'GP Paris-Dakar 21 octobre 2036'}).review.reason,'DATE_TOO_FAR');
});
test('Neighborhoods, numeric currency and unknown capacity are retained honestly',()=>{
 const r=parse({...item,text:'GP Paris-Dakar 21 octobre 2026. 10€/kg. Vitry-sur-Seine. Parcelles Assainies unité 25.'}).records[0];
 assert.equal(r.price_per_kg,10);assert.equal(r.currency,'EUR');assert.equal(r.capacity_kg,undefined);
 assert.match(r.origin_place.text,/Vitry/);assert.match(r.destination_place.text,/unité 25/);
 assert.equal(r.origin_place.precision,'commune_approx');
 const multi=parse({...item,text:'GP Dakar-Paris 21 octobre 2026. Dépôt Ouakam et Parcelles Assainies unité 25.'}).records[0];
 assert.equal(multi.origin_place.query,'');assert.equal(multi.origin_place.precision,'A_VERIFIER');
});
test('Public contacts are redacted while dates remain intact',()=>{
 const s=redactFacebookContacts('Départ 21 octobre 2026, tél +33 6 12 34 56 78 / 00221771234567.');
 assert.match(s,/21 octobre 2026/);assert.doesNotMatch(s,/1234567|12 34 56/);
});
test('Existing manual row does not duplicate when automatic extraction uses the publisher name',()=>{
 const r=parse().records[0],h=['gp_id','role','nom','ville_depart','ville_arrivee','date_depart','statut','source','date_source'];
 const existing={id:'FB_old_123',operator:'Other public label',origin:r.origin,destination:r.destination,departure_date:r.departure_date,source_url:r.source_url};
 assert.equal(planFacebookImport([r],[existing],h,sources,today).rows.length,0);
});
test('Cloud worker is disabled by default and never logs or sends a token to the public endpoint',async()=>{
 const code=await readFile(new URL('../apps-script/FacebookCloud.gs',import.meta.url),'utf8');
 const c=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})}});vm.runInContext(code,c);
 assert.equal(c.syncFacebookCloud().enabled,false);
 assert.doesNotMatch(code,/function doPost|function doGet|[?&]token=|Logger\.log\(token|api\.openai\.com/);
 const extractor=await readFile(new URL('../lib/facebook-extract.js',import.meta.url),'utf8');
 assert.ok(code.startsWith(extractor.replace(/export function /g,'function ')));
});

test('Rounded legacy queue IDs recover exactly; distinct 16-digit posts remain distinct',async()=>{
 const code=await readFile(new URL('../apps-script/FacebookCloud.gs',import.meta.url),'utf8');
 const c=vm.createContext({});vm.runInContext(code,c);
 const ids=['3978597969113123','3978597969113124'];
 const rounded=ids.map(id=>Number(Number(id).toPrecision(15)));assert.equal(rounded[0],rounded[1]);
 const recovered=ids.map((id,i)=>c.fbCloudQueuePostId_([rounded[i],'https://www.facebook.com/groups/gpfrancesenegal/posts/'+id+'/','','',JSON.stringify({post_id:id})]));
 assert.deepEqual(recovered,ids);assert.equal(new Set(recovered).size,2);
 assert.equal(c.fbCloudQueuePostId_([0,'https://www.facebook.com/groups/gpfrancesenegal/posts/'+ids[0]+'/','','','broken']),ids[0]);
 assert.throws(()=>c.fbCloudQueuePostId_([0,'invalid','','','broken']),/QUEUE_POST_ID_INVALID/);
});
test('Text-prefixed image IDs reuse OCR across separate reads without network calls',async()=>{
 const code=await readFile(new URL('../apps-script/FacebookCloud.gs',import.meta.url),'utf8');
 const c=vm.createContext({});vm.runInContext(code,c);
 const id='29110771101867860',budget={remaining:8};
 assert.equal(c.fbCloudOcr_({id},{rows:[['IMAGE_'+id,'OK','cached poster']]},budget),'cached poster');
 assert.equal(budget.remaining,8);
});

test('Plain poster headings, hyphen dates and repeated image headers preserve the trip',()=>{
 const r=parse({...item,text:'21-10-2026\nPARIS DAKAR\nPARIS DAKAR'}).records;
 assert.equal(r.length,1);assert.equal(r[0].departure_date,'2026-10-21');assert.equal(r[0].origin,'Paris');
 const mixed=parse({...item,text:'Paris Dakar 21 octobre 2026\nRetour Dakar-Paris 27 octobre 2026'}).records;
 assert.equal(mixed.length,2);assert.deepEqual(mixed.map(r=>r.departure_date),['2026-10-21','2026-10-27']);
});
test('A bound street address is usable; multiple depots retain all text without selecting one GPS point',()=>{
 const r=parse({...item,text:'GP Paris-Dakar 21 octobre 2026\n6 rue Affre\nParis 75018'}).records[0];
 assert.equal(r.origin_place.street_number,'6');assert.equal(r.origin_place.postal_code,'75018');assert.equal(r.origin_place.precision,'adresse');
 const multi=parse({...item,text:"GP Paris-Dakar 21 octobre 2026\n9 RUE DE LA GOUTTE D'OR 75018 2 ALLÉE DES FAISANS LIMEIL-BRÉVANNES 94450"}).records[0];
 assert.equal(multi.origin_place.query,'');assert.equal(multi.origin_place.precision,'A_VERIFIER');
 assert.match(multi.origin_place.text,/GOUTTE D'OR/);assert.match(multi.origin_place.text,/FAISANS/);
});
test('Missing years and recurring schedules never create invented dated departures',()=>{
 assert.equal(parse({...item,text:'Paris Dakar départ le 24 octobre'}).review.reason,'DATE_YEAR_REQUIRED');
 assert.equal(parse({...item,text:'Paris Dakar départ tous les jours'}).review.reason,'RECURRING_SCHEDULE_REQUIRED');
 assert.equal(parse({...item,text:'Paris Dakar 31-02-2026'}).records.length,0);
 const r=parse({...item,text:'GP Paris-Dakar 21 octobre 2026 Vitry-sur-Seine Parcelles U21'}).records[0];
 assert.doesNotMatch(r.origin_place.text,/Parcelles/);assert.doesNotMatch(r.destination_place.text,/Vitry/);
 assert.match(r.destination_place.neighborhood,/unité 21/);
});
test('Real redacted review sample: 11 interpretable posts, only 2 new trips after cross-group dedupe',async()=>{
 const fixtures=JSON.parse(await readFile(new URL('./fixtures/facebook-posts-public-redacted.json',import.meta.url),'utf8'));
 const c=vm.createContext({});vm.runInContext(await readFile(new URL('../apps-script/FacebookImport.gs',import.meta.url),'utf8'),c);
 const results=fixtures.map(x=>extractFacebookOffers(x.post,[x.evidence],today));
 assert.equal(results.filter(r=>r.records.length).length,11);assert.equal(results.filter(r=>r.review).length,14);
 const records=results.flatMap(r=>r.records);
 const headers=['gp_id','role','nom','ville_depart','ville_arrivee','date_depart','statut','source','date_source'];
 const existing=c.FB_IMPORT_BATCH.filter(r=>r.year_verified&&!r.date_conflict);
 const plan=planFacebookImport(records,existing,headers,c.FB_IMPORT_SOURCES,today);
 assert.equal(plan.rows.length,2);assert.equal(plan.duplicates.length,9);
 const aicha=records.find(r=>r.post_id==='1880209066483185');
 assert.equal(aicha.origin,'Dakar');assert.equal(aicha.destination,'Paris');assert.equal(aicha.departure_date,'2026-10-21');
 assert.match(aicha.origin_place.text,/GUEDIEWAYE-ARRET BRT/);assert.match(aicha.origin_place.text,/TERMINUS BUS 64/);
 assert.match(aicha.destination_place.text,/86 rue Joseph Maistre/);assert.match(aicha.destination_place.text,/Fresnes/);
});
test('A parser release retries extraction reviews once and never reopens completed or technical failures',async()=>{
 const code=await readFile(new URL('../apps-script/FacebookCloud.gs',import.meta.url),'utf8'),c=vm.createContext({});vm.runInContext(code,c);
 const data=[[],['POST_1','','REVIEW',1,'','ADDRESS_REVIEW_REQUIRED'],['POST_2','','DONE',1,'',''],['POST_3','','REVIEW',3,'','IMAGE_UNAVAILABLE']];
 const sheet={getDataRange:()=>({getValues:()=>data}),getRange:(row,col)=>({setValues:v=>{data[row-1][col-1]=v[0][0];data[row-1][col]=v[0][1];}})};
 const p=new Map(),props={getProperty:k=>p.get(k),setProperty:(k,v)=>p.set(k,v)};
 assert.equal(c.fbCloudRetryReview_(sheet,props),1);assert.equal(data[1][2],'PENDING');assert.equal(data[1][3],0);
 assert.equal(data[2][2],'DONE');assert.equal(data[3][2],'REVIEW');assert.equal(c.fbCloudRetryReview_(sheet,props),0);
});
