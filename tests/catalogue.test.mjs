import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import handler, {dispatch} from '../api/catalogue.js';
import {decode, isoDate, searchCatalog, sourceUrl} from '../lib/catalog.js';

const now = new Date('2026-10-20T08:00:00Z');
const source = 'https://www.facebook.com/groups/gpfrancesenegal/permalink/2337267237026310/';
const makeRow = (id, origin, destination, date, url = source) => ({id,operator:'Public operator',origin,destination,departure_date_estimated:date.replace(/Date\((\d+),(\d+),(\d+)\)/,(_,y,m,d)=>y+'-'+String(Number(m)+1).padStart(2,'0')+'-'+d.padStart(2,'0')),price_per_kg:null,status:'ACTIF',source_url:url,source_type:'facebook',date_as_posted:'26 octobre; année à confirmer',currency:null,capacity_kg:null});
const rows = [makeRow('FB_paris', 'Paris', 'Dakar', 'Date(2026,9,26)'),
  makeRow('FB_inverse', 'Dakar', 'Paris', 'Date(2026,9,28)'),
  makeRow('FB_expired', 'Paris', 'Dakar', 'Date(2026,9,19)')];
const wrap = records => JSON.stringify({success:true,spreadsheet_id:'1KJL7mAtWvrndgrHX_5NjfUciqVX0uMxL63T6XJnRFmE',sheet:'GP_TRANSPORTEURS',records});
const fetcher = async url => {assert.equal(url, sourceUrl); return {ok:true,text:async () => wrap(rows)};};
const call = (name, args = {}) => ({jsonrpc:'2.0', id:1, method:'tools/call', params:{name, arguments:args}});

test('Public neighborhoods are searchable; city centers never imply an exact meeting point',()=>{
 const row={...makeRow('FB_local','Paris','Dakar','2026-10-21'),origin_place:'Vitry-sur-Seine, France',destination_place:'Parcelles Assainies unité 25, Dakar, Sénégal',destination_neighborhood:'Parcelles Assainies — unité 25',origin_gps_precision:'commune_approx',destination_gps_precision:'quartier_approx',destination_geocode:'Centre du quartier uniquement; unité 25 non localisée précisément.'};
 const decoded=decode(wrap([row]));
 assert.equal(searchCatalog(decoded,{origin:'Vitry sur Seine',destination:'Parcelles Assainies'},now).total,1);
 assert.equal(searchCatalog(decoded,{origin:'Paris 16',destination:'Dakar'},now).total,0);
 assert.equal(searchCatalog(decoded,{origin:'Paris',destination:'Dakar'},now).results[0].destination_gps_precision,'quartier_approx');
 assert.match(decoded[0].destination_geocode,/non localisée/);
});

test('restored route keeps both catalogue and publication endpoints', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url)));
  assert.deepEqual(config.rewrites.find(row => row.source === '/mcp'), {source:'/mcp',destination:'/api/catalogue'});
  assert.ok(config.functions['api/mcp.js']);
  assert.ok(config.functions['api/catalogue.js']);
  const {SCRIPT_URL, SPREADSHEET_ID} = await import('../lib/config.js');
  const publisher = await import('../api/mcp.js');
  assert.equal(sourceUrl,SCRIPT_URL);
  assert.equal(publisher.SPREADSHEET_ID,SPREADSHEET_ID);
  assert.equal(SPREADSHEET_ID,'1KJL7mAtWvrndgrHX_5NjfUciqVX0uMxL63T6XJnRFmE');
});

test('Paris–Dakar flexible dates return the public post, with unknown capacity and price', async () => {
  const result = await dispatch(call('search_departures',{origin:'Paris',destination:'Dakar',date_from:'2026-10-20'}), fetcher, now);
  const data = result.result.structuredContent;
  assert.equal(data.total,1);
  assert.equal(data.results[0].source_url,source);
  assert.equal(data.results[0].departure_date_estimated,'2026-10-26');
  assert.equal(data.results[0].availability_confirmed,false);
  assert.equal(data.results[0].capacity_kg,null);
  assert.equal(data.results[0].price_per_kg,null);
  assert.match(data.results[0].date_as_posted,/confirmer/);
});

test('direction, exact cities and date window remain effective', () => {
  const data = decode(wrap(rows));
  assert.equal(searchCatalog(data,{origin:'Dakar',destination:'Paris'},now).results[0].id,'FB_inverse');
  assert.equal(searchCatalog(data,{origin:'Marseille',destination:'Dakar'},now).total,0);
  assert.equal(searchCatalog(data,{origin:'Paris',destination:'Dakar',date_to:'2026-10-25'},now).total,0);
  assert.equal(searchCatalog(data,{origin:'Paris',destination:'Dakar',date_from:'2026-10-26',date_to:'2026-10-26'},now).total,1);
});

test('private rows, unsafe links and inactive announcements cannot leave the reader', () => {
  const privateRow = makeRow('GP_private','Paris','Dakar','Date(2026,9,26)');
  const unsafe = makeRow('FB_unsafe','Paris','Dakar','Date(2026,9,26)','https://example.com');
  const inactive = makeRow('FB_inactive','Paris','Dakar','Date(2026,9,26)');
  inactive.status = 'EXPIRE';
  assert.deepEqual(decode(wrap([privateRow,unsafe,inactive])),[]);
  assert.equal(isoDate('2026-02-30'),null);
  assert.equal(isoDate('Date(2026,12,26)'),null);
});

test('unavailable source is a tool error, never a successful empty search', async () => {
  for (const fetchImpl of [async () => ({ok:false}), async () => ({ok:true,text:async () => '<html>Login</html>'}), async () => {throw Error('timeout');}]) {
    const result = await dispatch(call('search_departures',{origin:'Paris',destination:'Dakar'}),fetchImpl,now);
    assert.equal(result.result.isError,true);
    assert.equal(result.result.structuredContent.error,'CATALOG_UNAVAILABLE');
    assert.equal('results' in result.result.structuredContent,false);
  }
});

test('status reads the source, dates are validated and arbitrary tools cannot execute', async () => {
  const status = await dispatch(call('service_status'),fetcher,now);
  assert.equal(status.result.structuredContent.connected,true);
  assert.equal(status.result.structuredContent.catalog_records,3);
  assert.equal(status.result.structuredContent.features.payments,false);
  const invalid = await dispatch(call('search_departures',{origin:'Paris',destination:'Dakar',date_from:'2026-10-19'}),fetcher,now);
  assert.equal(invalid.result.structuredContent.error,'INVALID_DATE_RANGE');
  assert.equal((await dispatch(call('publish_departure'),fetcher,now)).error.code,-32602);
});

function response() {return {headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;},end(){return this;}};}
test('stateless HTTP discovery survives repeated requests and stale session headers', async () => {
  for (let i = 0; i < 3; i++) {
    const res = response();
    await handler({method:'POST',headers:{'mcp-session-id':'expired-client-session'},body:{jsonrpc:'2.0',id:i,method:'tools/list'}},res);
    assert.equal(res.statusCode,200);
    assert.deepEqual(res.body.result.tools.map(x=>x.name),['service_status','search_departures']);
    assert.equal(res.headers['Mcp-Session-Id'],undefined);
  }
  const notification=response();
  await handler({method:'POST',headers:{},body:{jsonrpc:'2.0',method:'notifications/initialized'}},notification);
  assert.equal(notification.statusCode,202);
  const forbidden=response();
  await handler({method:'POST',headers:{origin:'https://bad.example'},body:{}},forbidden);
  assert.equal(forbidden.statusCode,403);
});
