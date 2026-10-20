import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import handler, { dispatch, SPREADSHEET_ID } from '../api/mcp.js';
import { widgetHtml } from '../lib/travel-card.js';
import { dispatch as searchDispatch } from '../api/catalogue.js';

const script = await readFile(new URL('../apps-script/GpPublication.gs', import.meta.url),'utf8');
const baseHeaders = ['gp_id','role','nom','whatsapp','ville_depart','lat_depart','lng_depart',
  'ville_arrivee','lat_arrivee','lng_arrivee','date_depart','date_expiration','prix_kg',
  'statut','date_creation','source','fiabilite_score','rating_total','rating_count','signalements',
  'badge','date_match','feedback_pending'];
const input = {request_id:'test_publication_0001',nom:'Test Voyageur',telephone:'+33612345678',
  ville_depart:'Paris',ville_arrivee:'Dakar',date_depart:'2026-10-31',capacite_kg:13,
  objets_acceptes:'Vêtements, documents et effets personnels',tarif_texte:'À convenir'};

function fixture(headers = baseHeaders) {
  const state = {rows:[Array.from(headers)],locked:false,writes:0,maxColumns:headers.length};
  const literal = v => typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v;
  const range = (r,c,h=1,w=1) => ({
    getValues:()=>Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>state.rows[r+i-1]?.[c+j-1] ?? '')),
    setValue:v=>{state.rows[r-1]??=[];state.rows[r-1][c-1]=literal(v);state.writes++;},
    getA1Notation:()=>`A${r}:Z${r}`
  });
  const sheet = {getName:()=> 'GP_TRANSPORTEURS',getLastColumn:()=>state.rows[0].length,
    getLastRow:()=>state.rows.length,getMaxColumns:()=>state.maxColumns,
    insertColumnsAfter:(_,count)=>{state.maxColumns+=count;},
    getRange:range,getDataRange:()=>range(1,1,state.rows.length,state.rows[0].length),
    appendRow:row=>{state.rows.push(row.map(literal));state.writes++;}};
  const book = {getId:()=>SPREADSHEET_ID,getSheetByName:n=>n==='GP_TRANSPORTEURS'?sheet:null};
  const context = vm.createContext({
    Date:class extends Date {constructor(...args){super(...(args.length?args:['2026-10-20T08:00:00Z']));}},
    SpreadsheetApp:{openById:id=>{assert.equal(id,SPREADSHEET_ID);return book;},flush:()=>{}},
    Utilities:{formatDate:()=> '2026-10-20',getUuid:randomUUID,DigestAlgorithm:{SHA_256:'sha256'},
      computeDigest:(_,text)=>Array.from(createHash('sha256').update(text).digest())},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(state.locked)return false;state.locked=true;return true;},
      releaseLock:()=>{state.locked=false;}})},
    getCoordinates:()=>({lat:null,lng:null})
  });
  vm.runInContext(script,context);
  return {state,context};
}

test('maps complete traveller fields to headers and preserves existing records',()=>{
  const {state,context}=fixture();
  state.rows.push(baseHeaders.map((_,i)=>i===0?'existing-gp':i===2?'Existing person':''));
  const before=JSON.stringify(state.rows[1]);
  const result=context.publishGP({...input});
  assert.equal(result.success,true); assert.equal(result.row,3);
  assert.equal(JSON.stringify(state.rows[1]),before);
  const value=key=>state.rows[2][state.rows[0].indexOf(key)];
  assert.equal(value('capacite_kg'),13);assert.equal(value('objets_acceptes'),input.objets_acceptes);
  assert.equal(value('tarif_texte'),'À convenir');assert.equal(value('prix_kg'),'');
  assert.equal(value('whatsapp'),input.telephone);assert.equal(value('statut'),'ACTIF');
  assert.equal(value('date_match'),'');assert.equal(result.spreadsheet_id,SPREADSHEET_ID);
  assert.equal(state.locked,false);
});

test('retries produce one row and changed payload cannot reuse its request ID',()=>{
  const {state,context}=fixture();const a=context.publishGP({...input});
  const b=context.publishGP({...input});assert.equal(a.id,b.id);assert.equal(b.duplicate,true);
  assert.equal(state.rows.length,2);
  const conflict=context.publishGP({...input,capacite_kg:20});
  assert.equal(conflict.error,'REQUEST_ID_CONFLICT');assert.equal(state.rows.length,2);
  const found=context.getPublicationStatus({request_id:input.request_id});assert.equal(found.id,a.id);
  assert.equal(context.getPublicationStatus({request_id:'not_saved_request_0001'}).found,false);
});

test('dry run creates no columns, rows or geocoding calls',()=>{
  const {state,context}=fixture();context.getCoordinates=()=>{throw new Error('must not geocode');};
  const result=context.publishGP({...input,dry_run:true});
  assert.equal(result.dry_run,true);assert.equal(state.writes,0);assert.equal(state.rows.length,1);
  assert.deepEqual(state.rows[0],baseHeaders);
});

test('date, phone, weight, currency and schema errors cannot write',()=>{
  for(const patch of [{date_depart:'2026-02-30'},{date_depart:'2026-10-19'},
    {telephone:'bad'},{capacite_kg:0},{capacite_kg:'13'},{prix_kg:10}, {nom:''}]) {
    const {state,context}=fixture();assert.equal(context.publishGP({...input,...patch}).success,false);
    assert.equal(state.writes,0);
  }
  const {state,context}=fixture(baseHeaders.filter(h=>h!=='gp_id'));
  assert.equal(context.publishGP({...input}).error,'PUBLICATION_HEADERS_INVALID');assert.equal(state.writes,0);
});

test('reordered headers still receive correct values and formula input remains literal',()=>{
  const {state,context}=fixture([...baseHeaders].reverse());
  const result=context.publishGP({...input,nom:'=IMPORTXML("bad")',prix_kg:10,devise:'EUR'});
  assert.equal(result.success,true);
  assert.equal(state.rows[1][state.rows[0].indexOf('prix_kg')],10);
  assert.equal(state.rows[1][state.rows[0].indexOf('nom')],'=IMPORTXML("bad")');
  assert.equal(context.gpPublicationText('=IMPORTXML("bad")'),"'=IMPORTXML(\"bad\")");
});

test('MCP refuses inactive upstream before posting; timeouts remain uncertain',async()=>{
  const message={jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'publish_departure',arguments:input}};
  let calls=0;
  const inactive=await dispatch(message,async()=>{calls++;return {error:'Action inconnue'};});
  assert.equal(calls,1);assert.equal(inactive.result.isError,true);
  assert.equal(inactive.result.structuredContent.error,'PUBLICATION_NOT_READY');
  const timeout=await dispatch(message,async()=>{throw new Error('timeout');});
  assert.equal(timeout.result.structuredContent.outcome,'unknown');
  assert.equal(timeout.result.structuredContent.request_id,input.request_id);
});

test('MCP saves through the real script function and omits private details from receipt',async()=>{
  const {state,context}=fixture();
  const upstream=async data=>context[data.action](data);
  const message={jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'publish_departure',arguments:input}};
  const result=await dispatch(message,upstream);
  assert.equal(result.result.structuredContent.saved,true);assert.equal(state.rows.length,2);
  const text=JSON.stringify(result);assert.equal(text.includes(input.telephone),false);
  assert.equal(text.includes(SPREADSHEET_ID),false);assert.equal(text.includes('GP_TRANSPORTEURS'),false);
  const retry=await dispatch(message,upstream);assert.equal(retry.result.structuredContent.duplicate,true);
  assert.equal(state.rows.length,2);
  const status=await dispatch({...message,params:{name:'publication_status',arguments:{request_id:input.request_id}}},upstream);
  assert.equal(status.result.structuredContent.saved,true);
});

test('MCP rejects a wrong destination, dry runs are not saved, and arbitrary actions cannot pass',async()=>{
  const message={jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'publish_departure',arguments:input}};
  const bad=await dispatch(message,async()=>({success:true,write_requests:true,spreadsheet_id:'other'}));
  assert.equal(bad.result.isError,true);
  const {state,context}=fixture();const result=await dispatch({...message,params:{...message.params,arguments:{...input,dry_run:true}}},async d=>context[d.action](d));
  assert.equal(result.result.structuredContent.saved,false);assert.equal(result.result.structuredContent.valid,true);
  assert.equal(state.writes,0);
  const extra=await dispatch({...message,params:{...message.params,arguments:{...input,action:'addColis'}}});
  assert.equal(extra.result.structuredContent.error,'INVALID_ARGUMENTS');
});

test('HTTP discovery, initialization, notification, malformed input and origin validation',async()=>{
  const invoke=async(req)=>{const result={headers:{},status:200};const res={setHeader:(k,v)=>result.headers[k]=v,
    status:c=>{result.status=c;return res;},json:b=>{result.body=b;return res;},end:()=>res};
    await handler({headers:{},method:'POST',...req},res);return result;};
  assert.equal((await invoke({body:{jsonrpc:'2.0',id:1,method:'initialize'}})).body.result.protocolVersion,'2025-03-26');
  assert.equal((await invoke({body:{jsonrpc:'2.0',id:2,method:'tools/list'}})).body.result.tools.length,3);
  assert.equal((await invoke({body:{jsonrpc:'2.0',method:'notifications/initialized'}})).status,202);
  assert.equal((await invoke({body:'broken'})).status,400);
  assert.equal((await invoke({headers:{origin:'https://untrusted.invalid'},body:{}})).status,403);
  assert.equal((await invoke({method:'GET'})).status,405);
});

test('preview renders a real MCP app and never writes, including incomplete drafts',async()=>{
  const {state,context}=fixture();
  const preview=await dispatch({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'prepare_departure',arguments:{ville_depart:'Lille',ville_arrivee:'Saint-Louis'}}},async d=>context[d.action](d));
  assert.equal(preview.result.structuredContent.saved,false);assert.equal(preview.result.structuredContent.ready,true);
  assert.equal(preview.result.structuredContent.preview.ville_depart,'Lille');assert.equal(state.writes,0);
  const resource=await dispatch({jsonrpc:'2.0',id:5,method:'resources/read',params:{uri:'ui://bringmypack/travel-card-v1.html'}});
  assert.equal(resource.result.contents[0].mimeType,'text/html;profile=mcp-app');
  assert.match(resource.result.contents[0].text,/Publier mon voyage/);
  assert.match(resource.result.contents[0].text,/ui\/initialize/);
  assert.match(resource.result.contents[0].text,/event.source!==window.parent/);
  assert.equal((await dispatch({jsonrpc:'2.0',id:6,method:'resources/read',params:{uri:'file:///private'}})).error.code,-32602);
});

async function widgetFixture(preview, callTool) {
  const elements=new Map();const listeners={};const sent=[];
  function element(id){if(!elements.has(id))elements.set(id,{textContent:'',className:'',hidden:false,
    disabled:false,classList:{toggle(){}},focus(){},style:{setProperty(){}}});return elements.get(id);}
  const form=element('edit-form');form.elements=[];form.elements.namedItem=()=>({focus(){}});form.reportValidity=()=>true;
  const parent={postMessage(message){sent.push(message);queueMicrotask(async()=>{
    let result;
    if(message.method==='ui/initialize')result={hostCapabilities:{serverTools:{}},hostContext:{theme:'light'}};
    else if(message.method==='ui/notifications/initialized'){
      listeners.message({source:parent,data:{jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:preview}}});return;
    } else if(message.method==='tools/call') result=await callTool(message.params);
    else if(message.id!==undefined)result={};
    else return;
    listeners.message({source:parent,data:{jsonrpc:'2.0',id:message.id,result}});
  });}};
  const window={parent,addEventListener:(name,fn)=>listeners[name]=fn};
  const context=vm.createContext({window,document:{getElementById:element,body:{},documentElement:{style:{setProperty(){}},scrollWidth:400,scrollHeight:600}},
    ResizeObserver:class{constructor(fn){this.fn=fn;}observe(){this.fn();}},
    setTimeout,clearTimeout,Intl,Date,Map,Promise,queueMicrotask});
  const js=widgetHtml.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(js,context);
  await new Promise(resolve=>setImmediate(resolve));
  return {elements,sent,listeners,parent};
}

test('widget publishes only on user action, shows receipt and disables duplicate submission',async()=>{
  const {state,context}=fixture();
  const widget=await widgetFixture({ready:true,preview:input,request_id:input.request_id},async params=>(await dispatch({jsonrpc:'2.0',id:10,method:'tools/call',params},async d=>context[d.action](d))).result);
  assert.equal(state.writes,0);assert.equal(widget.sent[0].method,'ui/initialize');
  assert.equal(widget.elements.get('publish').textContent,'Publier mon voyage');
  await widget.elements.get('publish').onclick();assert.equal(state.rows.length,2);
  assert.match(widget.elements.get('message').textContent,/Votre voyage est enregistré/);
  assert.equal(widget.elements.get('publish').hidden,true);
  await widget.elements.get('publish').onclick();assert.equal(state.rows.length,2);
});

test('widget keeps an uncertain submission locked until status verification',async()=>{
  let calls=0;
  const widget=await widgetFixture({ready:true,preview:input,request_id:input.request_id},async params=>{
    calls++;return {structuredContent:params.name==='publish_departure'?{saved:false,outcome:'unknown',request_id:input.request_id}:{saved:false,found:false,request_id:input.request_id}};
  });
  await widget.elements.get('publish').onclick();assert.equal(widget.elements.get('check').hidden,false);
  assert.equal(widget.elements.get('publish').hidden,true);assert.equal(widget.elements.get('edit').disabled,true);
  await widget.elements.get('check').onclick();assert.equal(widget.elements.get('publish').hidden,false);
  assert.equal(widget.elements.get('publish').textContent,'Réessayer');assert.equal(calls,2);
});

test('a saved GP trip becomes searchable in the same sheet without exposing contacts or history',async()=>{
  const {state,context}=fixture();
  const privateRecord=baseHeaders.map(key=>({gp_id:'GP_private_history',nom:'Private historical name',
    ville_depart:'Paris',ville_arrivee:'Dakar',date_depart:'2026-10-31',statut:'ACTIF',source:'Chat-GP',
    whatsapp:'+33699999999'})[key]??'');
  state.rows.push(privateRecord);
  const saved=await dispatch({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'publish_departure',arguments:input}},async d=>context[d.action](d));
  assert.equal(saved.result.structuredContent.saved,true);
  const fetchImpl=async (url,options)=>{
    assert.equal(JSON.parse(options.body).action,'readPublicCatalog');
    return {ok:true,text:async()=>JSON.stringify(context.readPublicCatalog())};
  };
  const found=await searchDispatch({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'search_departures',
    arguments:{origin:'Paris',destination:'Dakar',date_from:'2026-10-20'}}},fetchImpl,new Date('2026-10-20T08:00:00Z'));
  const result=found.result.structuredContent;
  assert.equal(result.total,1);
  assert.equal(result.results[0].id,saved.result.structuredContent.id);
  assert.equal(result.results[0].capacity_kg,13);
  assert.equal(result.results[0].accepted_items,input.objets_acceptes);
  assert.equal(result.results[0].price_terms,'À convenir');
  assert.equal(result.results[0].source_url,null);
  assert.equal(result.results[0].source_type,'bringmypack');
  const text=JSON.stringify(result);
  for(const secret of [input.telephone,input.request_id,'Private historical name','GP_private_history',SPREADSHEET_ID,'publication_fingerprint']) assert.equal(text.includes(secret),false);
  const wrongHeader=fixture(baseHeaders.filter(h=>h!=='source'));
  assert.equal(wrongHeader.context.readPublicCatalog().success,false);
});

test('migration retains original IDs, maps columns and never copies private historical rows',async()=>{
  const {context}=fixture();
  vm.runInContext(await readFile(new URL('../apps-script/CatalogMigration.gs',import.meta.url),'utf8'),context);
  const headers=['gp_id','nom','ville_depart','ville_arrivee','date_depart','statut','source','whatsapp'];
  const row=['FB_imported','Public Operator','Paris','Dakar','2026-10-26','ACTIF',
    'https://www.facebook.com/groups/gpfrancesenegal/permalink/2337267237026310/','+33612345678'];
  const privateRow=[...row];privateRow[0]='GP_private_history';
  const plan=context.gpCatalogMigrationPlan([...headers].reverse(),[],headers,[row,privateRow,row]);
  assert.equal(plan.rows.length,1);
  assert.equal(plan.rows[0][plan.headers.indexOf('gp_id')],'FB_imported');
  assert.equal(plan.rows[0][plan.headers.indexOf('whatsapp')],'+33612345678');
  assert.ok(plan.headers.includes('publication_request_id'));
  const retry=context.gpCatalogMigrationPlan(plan.headers,plan.rows,headers,[row]);
  assert.equal(retry.rows.length,0);
  assert.throws(()=>context.gpCatalogMigrationPlan(['gp_id'],[],headers,[row]),/MIGRATION_HEADERS_INVALID/);
});
