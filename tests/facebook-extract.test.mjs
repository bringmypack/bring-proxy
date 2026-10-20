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
