// Pure matching. Coordinates, contacts and historical rows are not public outputs.
function matchPublications(own,candidates,today){
 const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const quarter=v=>{const s=norm(v).replace(/\b(?:quartier|arrondissement)\b/g,'').trim();return /^(?:non precise|ville uniquement|inconnu|je ne sais pas)$/.test(s)?'':s;};
 const sameQuarter=(a,b)=>{a=quarter(a);if(!a||!quarter(b))return null;return String(b).split(/[;|]/).some(v=>quarter(v)===a);};
 const out=[];
 for(const target of candidates){
  if(target.id===own.id||target.status!=='ACTIF'||target.date_from<today&&target.date_to<today)continue;
  if(norm(own.origin)!==norm(target.origin)||norm(own.destination)!==norm(target.destination))continue;
  const gp=own.role==='GP'?own:target,colis=own.role==='GP'?target:own;
  if(gp.role!=='GP'||colis.role!=='EXPEDITEUR'||gp.date_from<colis.date_from||gp.date_from>colis.date_to||gp.date_from<today)continue;
  if(typeof gp.capacity_kg==='number'&&typeof colis.weight_kg==='number'&&gp.capacity_kg<colis.weight_kg)continue;
  const dep=sameQuarter(own.origin_neighborhood,target.origin_neighborhood),arr=sameQuarter(own.destination_neighborhood,target.destination_neighborhood);
  const score=(dep===true?4:dep===null?1:0)+(arr===true?4:arr===null?1:0)+(typeof gp.capacity_kg==='number'?1:0);
  out.push({id:target.id,role:target.role,name:target.name,origin:target.origin,destination:target.destination,date_from:target.date_from,date_to:target.date_to,
   origin_neighborhood:target.origin_neighborhood||null,destination_neighborhood:target.destination_neighborhood||null,capacity_kg:target.capacity_kg??null,weight_kg:target.weight_kg??null,
   contents:target.contents||null,price_terms:target.price_terms||null,source_url:target.source_url||null,
   origin_neighborhood_match:dep,destination_neighborhood_match:arr,
   match_quality:dep===true&&arr===true?'quartiers_identiques':'meme_trajet_quartiers_a_confirmer',availability_confirmed:false,contents_to_confirm:true,_score:score});
 }
 return out.sort((a,b)=>b._score-a._score||a.date_from.localeCompare(b.date_from)).slice(0,10).map(r=>{delete r._score;return r;});
}

var SENDER_PUBLICATION_SHEET='EXPEDITEURS_COLIS';
var PUBLICATION_LOCATION_HEADERS=['quartier_depart','quartier_arrivee','lieu_depart_texte','lieu_arrivee_texte','precision_gps_depart','precision_gps_arrivee','geocodage_depart','geocodage_arrivee'];
function publicationAddHeaders_(sheet,headers,extra){
 extra.forEach(function(key){if(headers.indexOf(key)<0){if(sheet.getMaxColumns()<headers.length+1)sheet.insertColumnsAfter(sheet.getMaxColumns(),1);headers.push(key);sheet.getRange(1,headers.length).setValue(key);}});
}
function publicationLocation_(city,quarter){
 var norm=function(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();};
 var unknown=/^(?:ville uniquement|non precise|inconnu|je ne sais pas)$/.test(norm(quarter)),area=unknown?'':String(quarter||'').trim();
 var countries={paris:'FR',lyon:'FR',marseille:'FR',lille:'FR',nice:'FR',toulouse:'FR',bordeaux:'FR',nantes:'FR',montpellier:'FR',dakar:'SN','saint louis':'SN',thies:'SN',mbour:'SN',touba:'SN',ziguinchor:'SN',kolda:'SN'};
 var country=countries[norm(city)],district=norm(city)==='paris'&&norm(area).match(/^(?:paris )?(20|1[0-9]|[1-9])(?: ?(?:ieme|eme|er|e))?(?: arrondissement)?$/),number=district?Number(district[1]):null;
 var areaQuery=number?number+'e arrondissement':area;
 var text=[area,city,country==='FR'?'France':country==='SN'?'Sénégal':''].filter(Boolean).join(', ');
 var query=[areaQuery,city,country==='FR'?'France':country==='SN'?'Sénégal':''].filter(Boolean).join(', ');
 var p={source_verified:true,text:text,neighborhood:area,query:query,allowed_countries:['FR','SN'],paris_arrondissement:number,city:city,allow_parent_fallback:!!area&&!number,
  match_phrase:area&&!number?area:null,match_tokens:number?['Paris']:area?[area]:[String(city).trim()],precision:area?'quartier_approx':'ville_approx'};
 // A named quarter is validated against Google's address components, not only its display label.
 var geo=/[;|]/.test(area)?{verified:false,reason:'MULTIPLE_LOCATIONS'}:typeof fbImportGeocode_==='function'?fbImportGeocode_(p,country):{verified:false,reason:'GEOCODER_UNAVAILABLE'};
 if(!geo.verified&&typeof Logger!=='undefined')Logger.log(JSON.stringify({event:'PUBLICATION_GEOCODE_UNRESOLVED',city:city,quarter:area,reason:geo.reason||'UNRESOLVED'}));
 return {text:text,quarter:area,lat:geo.verified?geo.lat:'',lng:geo.verified?geo.lng:'',precision:geo.verified?geo.precision:'A_VERIFIER',geocode:geo.verified?geo.formatted_address:'',reason:geo.verified?'OK':geo.reason||'UNRESOLVED'};
}

function publicationLocationRecord_(value){
 var out={};['depart','arrivee'].forEach(function(side){var p=publicationLocation_(value['ville_'+side],value['quartier_'+side]);out['quartier_'+side]=p.quarter;out['lieu_'+side+'_texte']=p.text;out['lat_'+side]=p.lat;out['lng_'+side]=p.lng;out['precision_gps_'+side]=p.precision;out['geocodage_'+side]=p.geocode;});return out;
}
function shipmentPublicationInput(data){
 var input=data||{},value={};var fields=['request_id','nom','telephone','ville_depart','ville_arrivee','quartier_depart','quartier_arrivee','date_souhaitee','contenu'];
 fields.forEach(function(k){value[k]=typeof input[k]==='string'?input[k].trim():'';});
 if(fields.some(function(k){return !value[k];}))throw Error('MISSING_FIELDS: '+fields.filter(function(k){return !value[k];}).join(', '));
 if(!/^[a-zA-Z0-9_-]{16,100}$/.test(value.request_id))throw Error('INVALID_REQUEST_ID');
 if(!/^\+?[1-9][0-9]{7,14}$/.test(value.telephone))throw Error('INVALID_PHONE');
 if(value.nom.length>100||value.contenu.length>1000||['ville_depart','ville_arrivee','quartier_depart','quartier_arrivee'].some(function(k){return value[k].length>250;}))throw Error('FIELD_TOO_LONG');
 value.date_fin_souhaitee=input.date_fin_souhaitee||value.date_souhaitee;
 if(!gpCatalogDate(value.date_souhaitee)||!gpCatalogDate(value.date_fin_souhaitee)||value.date_fin_souhaitee<value.date_souhaitee)throw Error('INVALID_DATE_RANGE');
 if(value.date_souhaitee<Utilities.formatDate(new Date(),'Europe/Paris','yyyy-MM-dd'))throw Error('PAST_DATE');
 if(typeof input.poids!=='number'||!isFinite(input.poids)||input.poids<=0||input.poids>10000)throw Error('INVALID_WEIGHT');value.poids=input.poids;value.contact_match_consent=input.contact_match_consent===true;
 return value;
}
function shipmentPublicationReceipt_(book,sheet,headers,row,number,duplicate){
 return {success:true,status:'Demande enregistrée',id:row[headers.indexOf('colis_id')],request_id:row[headers.indexOf('publication_request_id')],spreadsheet_id:book.getId(),sheet:sheet.getName(),row:number,updated_range:sheet.getRange(number,1,1,headers.length).getA1Notation(),duplicate:duplicate,contact_enabled:row[headers.indexOf('contact_match_consent')]===true,payments:false};
}
function publishShipment(data){
 if(!data||data.confirmed!==true)return {success:false,error:'CONFIRMATION_REQUIRED'};
 var value;try{value=shipmentPublicationInput(data);}catch(error){return {success:false,error:String(error.message)};}
 var book=SpreadsheetApp.openById(GP_PUBLICATION_SPREADSHEET),sheet=book.getSheetByName(SENDER_PUBLICATION_SHEET);if(!sheet)return {success:false,error:'PUBLICATION_SHEET_MISSING'};
 var lock=LockService.getScriptLock();if(!lock.tryLock(10000))return {success:false,error:'BUSY_RETRY_SAME_REQUEST'};
 try{
  var headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(function(v){return String(v).trim();}),required=['colis_id','role','nom','whatsapp','ville_depart','lat_depart','lng_depart','ville_arrivee','lat_arrivee','lng_arrivee','date_souhaitee','date_expiration','poids','statut','date_creation','source'];
  if(required.some(function(k){return headers.indexOf(k)<0;})||headers.some(function(k,i){return k&&headers.indexOf(k)!==i;}))return {success:false,error:'PUBLICATION_HEADERS_INVALID'};
  var fp=gpPublicationFingerprint(value),rows=sheet.getDataRange().getValues(),keyCol=headers.indexOf('publication_request_id');
  for(var n=1;keyCol>=0&&n<rows.length;n++)if(rows[n][keyCol]===value.request_id){if(rows[n][headers.indexOf('publication_fingerprint')]!==fp)return {success:false,error:'REQUEST_ID_CONFLICT'};return shipmentPublicationReceipt_(book,sheet,headers,rows[n],n+1,true);}
  if(data.dry_run===true)return {success:true,dry_run:true,spreadsheet_id:book.getId(),sheet:sheet.getName(),request_id:value.request_id};
  publicationAddHeaders_(sheet,headers,['contenu','date_fin_souhaitee','publication_request_id','publication_fingerprint','contact_match_consent'].concat(PUBLICATION_LOCATION_HEADERS));
  var record=Object.assign({},value,publicationLocationRecord_(value),{colis_id:'COL_'+Utilities.getUuid(),role:'EXPEDITEUR',whatsapp:value.telephone,statut:'ACTIF',date_creation:new Date(),date_expiration:value.date_fin_souhaitee+'T23:59:59Z',source:'Chat-GP',publication_request_id:value.request_id,publication_fingerprint:fp});
  sheet.appendRow(headers.map(function(k){return gpPublicationText(Object.prototype.hasOwnProperty.call(record,k)?record[k]:'');}));SpreadsheetApp.flush();
  rows=sheet.getDataRange().getValues();for(var i=rows.length-1;i>=1;i--)if(rows[i][headers.indexOf('colis_id')]===record.colis_id&&rows[i][headers.indexOf('publication_request_id')]===value.request_id)return shipmentPublicationReceipt_(book,sheet,headers,rows[i],i+1,false);
  return {success:false,error:'SAVE_UNCONFIRMED_RETRY_SAME_REQUEST'};
 }finally{lock.releaseLock();}
}
function getShipmentPublicationStatus(data){
 if(!data||!/^[a-zA-Z0-9_-]{16,100}$/.test(data.request_id||''))return {success:false,error:'INVALID_REQUEST_ID'};
 var book=SpreadsheetApp.openById(GP_PUBLICATION_SPREADSHEET),sheet=book.getSheetByName(SENDER_PUBLICATION_SHEET);if(!sheet)return {success:false,error:'PUBLICATION_SHEET_MISSING'};
 var rows=sheet.getDataRange().getValues(),h=rows[0].map(String),col=h.indexOf('publication_request_id');
 for(var n=1;col>=0&&n<rows.length;n++)if(rows[n][col]===data.request_id)return shipmentPublicationReceipt_(book,sheet,h,rows[n],n+1,true);
 return {success:true,found:false,request_id:data.request_id};
}
function publicationOwnRecord_(kind,requestId){
 var name=kind==='GP'?GP_PUBLICATION_SHEET:SENDER_PUBLICATION_SHEET,book=SpreadsheetApp.openById(GP_PUBLICATION_SPREADSHEET),sheet=book.getSheetByName(name);if(!sheet)return null;
 var rows=sheet.getDataRange().getValues(),h=rows[0].map(String),col=h.indexOf('publication_request_id');
 for(var n=1;col>=0&&n<rows.length;n++)if(rows[n][col]===requestId&&rows[n][h.indexOf('source')]==='Chat-GP')return publicationPublicRow_(h,rows[n],kind);
 return null;
}
function publicationPublicRow_(h,row,kind){
 var get=function(k){var i=h.indexOf(k);return i<0?'':row[i];},date=gpCatalogDate(get(kind==='GP'?'date_depart':'date_souhaitee'));
 return {id:get(kind==='GP'?'gp_id':'colis_id'),role:kind,name:get('nom'),origin:get('ville_depart'),destination:get('ville_arrivee'),date_from:date,date_to:kind==='GP'?date:gpCatalogDate(get('date_fin_souhaitee'))||date,
  origin_neighborhood:get('quartier_depart'),destination_neighborhood:get('quartier_arrivee'),status:get('statut'),capacity_kg:kind==='GP'&&typeof get('capacite_kg')==='number'?get('capacite_kg'):null,weight_kg:kind!=='GP'&&typeof get('poids')==='number'?get('poids'):null,contents:get(kind==='GP'?'objets_acceptes':'contenu'),price_terms:kind==='GP'?get('tarif_texte'):null,source_url:null};
}
function findMatchesForPublication(data){
 if(!data||['GP','EXPEDITEUR'].indexOf(data.kind)<0||!/^[a-zA-Z0-9_-]{16,100}$/.test(data.request_id||''))return {success:false,error:'INVALID_MATCH_REQUEST'};
 var own=publicationOwnRecord_(data.kind,data.request_id);if(!own)return {success:false,error:'PUBLICATION_NOT_FOUND'};
 if(own.status!=='ACTIF')return {success:false,error:'PUBLICATION_INACTIVE'};
 var candidates=[];
 if(data.kind==='EXPEDITEUR'){
  var catalog=readPublicCatalog();if(!catalog.success)return catalog;
  candidates=catalog.records.map(function(r){return {id:r.id,role:'GP',name:r.operator,origin:r.origin,destination:r.destination,date_from:r.departure_date_estimated,date_to:r.departure_date_estimated,origin_neighborhood:r.origin_neighborhood,destination_neighborhood:r.destination_neighborhood,status:r.status,capacity_kg:r.capacity_kg,weight_kg:null,contents:r.accepted_items,price_terms:r.price_terms,source_url:r.source_url};});
 }else{
  var sheet=SpreadsheetApp.openById(GP_PUBLICATION_SPREADSHEET).getSheetByName(SENDER_PUBLICATION_SHEET);if(!sheet)return {success:false,error:'SENDER_SHEET_MISSING'};
  var rows=sheet.getDataRange().getValues(),h=rows[0].map(String);
  for(var n=1;n<rows.length;n++)if(rows[n][h.indexOf('source')]==='Chat-GP'&&/^COL_/.test(String(rows[n][h.indexOf('colis_id')]))&&/^[a-zA-Z0-9_-]{16,100}$/.test(String(rows[n][h.indexOf('publication_request_id')]))){var r=publicationPublicRow_(h,rows[n],'EXPEDITEUR');if(r.date_from&&r.date_to)candidates.push(r);}
 }
 var results=matchPublications(own,candidates,Utilities.formatDate(new Date(),'Europe/Paris','yyyy-MM-dd'));
 return {success:true,kind:data.kind,total:results.length,results:results,availability_confirmed:false,contact_sent:false,notice:'Correspondances à confirmer : capacité, contenu, lieux et conditions. Aucun contact transmis automatiquement.'};
}
function activateCurrentCatalogAnnouncements(){
 var lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('IMPORT_BUSY');
 try{var book=SpreadsheetApp.openById(GP_PUBLICATION_SPREADSHEET),sheet=book.getSheetByName(GP_PUBLICATION_SHEET),rows=sheet.getDataRange().getValues(),h=rows[0].map(String),changed=0,today=Utilities.formatDate(new Date(),'Europe/Paris','yyyy-MM-dd');
  for(var n=1;n<rows.length;n++){var get=function(k){return rows[n][h.indexOf(k)];},source=String(get('source')),id=String(get('gp_id')),date=gpCatalogDate(get('date_depart'));
   var allowed=/^FB_/.test(id)&&/^https:\/\/www\.facebook\.com\/groups\/[^/]+\/(?:posts|permalink)\/\d+\/$/.test(source)&&!/\/groups\/226193057954981\//.test(source)||/^GP_/.test(id)&&source==='Chat-GP'&&/^[a-zA-Z0-9_-]{16,100}$/.test(String(get('publication_request_id')));
   if(allowed&&date&&date>=today&&get('statut')==='A_VERIFIER'){sheet.getRange(n+1,h.indexOf('statut')+1).setValue('ACTIF');changed++;}
  }SpreadsheetApp.flush();Logger.log(JSON.stringify({activated:changed,availability_confirmed:false}));return {activated:changed};
 }finally{lock.releaseLock();}
}

// Capability-keyed contact access, only for a current match and explicit publisher consent.
function getMatchContact(data){
 if(!data||data.confirmed!==true)return {success:false,error:'CONTACT_REQUEST_CONFIRMATION_REQUIRED'};
 var matched=findMatchesForPublication(data);if(!matched.success)return matched;
 var target=matched.results.find(function(r){return r.id===data.match_id;});if(!target)return {success:false,error:'MATCH_NOT_FOUND'};
 if(target.source_url)return {success:true,source_url:target.source_url,contact_shared:false};
 var name=data.kind==='GP'?SENDER_PUBLICATION_SHEET:GP_PUBLICATION_SHEET,idKey=data.kind==='GP'?'colis_id':'gp_id';
 var sheet=SpreadsheetApp.openById(GP_PUBLICATION_SPREADSHEET).getSheetByName(name),rows=sheet.getDataRange().getValues(),h=rows[0].map(String);
 for(var n=1;n<rows.length;n++)if(rows[n][h.indexOf(idKey)]===data.match_id&&rows[n][h.indexOf('source')]==='Chat-GP'&&rows[n][h.indexOf('contact_match_consent')]===true&&/^[a-zA-Z0-9_-]{16,100}$/.test(String(rows[n][h.indexOf('publication_request_id')]))){
  return {success:true,contact_shared:true,contact:{nom:rows[n][h.indexOf('nom')],telephone:rows[n][h.indexOf('whatsapp')]},message_sent:false};
 }
 return {success:false,error:'CONTACT_SHARING_NOT_AUTHORIZED',contact_shared:false};
}

// Owner-only bounded verification: dry-run does not add rows, headers or GPS queries.
function publicationFlowSelfTest(){
 var date=Utilities.formatDate(new Date(Date.now()+86400000*10),'Europe/Paris','yyyy-MM-dd'),base={request_id:'owner_dryrun_'+Utilities.getUuid(),nom:'Dry run uniquement',telephone:'+99912345678',ville_depart:'Paris',ville_arrivee:'Dakar',quartier_depart:'Ville uniquement',quartier_arrivee:'Ville uniquement',confirmed:true,dry_run:true};
 var gp=publishGP(Object.assign({},base,{date_depart:date,capacite_kg:1,objets_acceptes:'Documents',tarif_texte:'À convenir'})),colis=publishShipment(Object.assign({},base,{date_souhaitee:date,poids:1,contenu:'Documents'})),cap=publicationCapabilities();
 if(!gp.success||!gp.dry_run||!colis.success||!colis.dry_run||!cap.write_shipments)throw Error('PUBLICATION_SELF_TEST_FAILED');
 Logger.log(JSON.stringify({gp_dry_run:gp.dry_run,shipment_dry_run:colis.dry_run,version:cap.version,matching:cap.matching,rows_created:0}));
}

// Owner-only maintenance. Never add these functions to doPost or the public MCP tools.
function diagnosePublicationGps(){return publicationRepairGps_(false);}
function repairMissingPublicationGps(){return publicationRepairGps_(true);}
function publicationRepairGps_(write){
 var book=SpreadsheetApp.openById(GP_PUBLICATION_SPREADSHEET),today=Utilities.formatDate(new Date(),'Europe/Paris','yyyy-MM-dd'),report=[],budget=5;
 var lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('GPS_REPAIR_BUSY');
 try{
  [GP_PUBLICATION_SHEET,SENDER_PUBLICATION_SHEET].forEach(function(name){
   var sheet=book.getSheetByName(name);if(!sheet)return;var rows=sheet.getDataRange().getValues(),h=rows[0].map(String),idKey=name===GP_PUBLICATION_SHEET?'gp_id':'colis_id',dateKey=name===GP_PUBLICATION_SHEET?'date_depart':'date_souhaitee';
   var required=[idKey,'publication_request_id','source','ville_depart','ville_arrivee','quartier_depart','quartier_arrivee','lat_depart','lng_depart','lat_arrivee','lng_arrivee','precision_gps_depart','precision_gps_arrivee','geocodage_depart','geocodage_arrivee'];
   if(required.some(function(k){return h.indexOf(k)<0;}))return;
   for(var n=1;n<rows.length&&budget>0;n++){
    var get=function(k){return rows[n][h.indexOf(k)];},date=gpCatalogDate(get(dateKey));
    if(get('source')!=='Chat-GP'||! /^(?:GP_|COL_)/.test(String(get(idKey)))||! /^[a-zA-Z0-9_-]{16,100}$/.test(String(get('publication_request_id')))||get('statut')!=='ACTIF'||!date||date<today)continue;
    var missing=['depart','arrivee'].filter(function(side){return get('lat_'+side)===''&&get('lng_'+side)===''&&String(get('quartier_'+side)).trim();});
    if(!missing.length)continue;budget--;
    missing.forEach(function(side){
     var city=get('ville_'+side),quarter=get('quartier_'+side),geo=publicationLocation_(city,quarter),entry={sheet:name,row:n+1,side:side,reason:geo.reason,precision:geo.precision,updated:false};
     if(write&&typeof geo.lat==='number'&&typeof geo.lng==='number'){
      var fresh=sheet.getRange(n+1,1,1,h.length).getValues()[0],same=function(k){return String(fresh[h.indexOf(k)])===String(get(k));};
      if(![idKey,'publication_request_id','source','ville_'+side,'quartier_'+side].every(same)||fresh[h.indexOf('lat_'+side)]!==''||fresh[h.indexOf('lng_'+side)]!==''){entry.reason='ROW_CHANGED';report.push(entry);return;}
      var values={};values['lat_'+side]=geo.lat;values['lng_'+side]=geo.lng;values['precision_gps_'+side]=geo.precision;values['geocodage_'+side]=geo.geocode;
      Object.keys(values).forEach(function(k){sheet.getRange(n+1,h.indexOf(k)+1).setValue(gpPublicationText(values[k]));});entry.updated=true;
     }report.push(entry);
    });
   }
  });
  SpreadsheetApp.flush();Logger.log(JSON.stringify({write:write,locations:report}));return {write:write,locations:report};
 }finally{lock.releaseLock();}
}
