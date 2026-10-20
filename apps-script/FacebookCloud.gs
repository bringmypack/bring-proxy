// Deterministic extraction; no language-model calls. Ambiguity goes to review.
function normalizeFacebookPost(item, sources) {
  const u=String(item?.url||'').split(/[?#]/)[0].replace(/\/?$/,'/');
  const m=u.match(/^https:\/\/www\.facebook\.com\/groups\/([^/]+)\/(?:posts|permalink)\/(\d+)\/$/);
  if(!m) throw Error('INVALID_SOURCE');
  const group=m[1]==='1393509021402141'?'gpfrancesenegal':m[1];
  if(!sources.some(s=>s.id===group && s.enabled && s.visibility==='public' && s.public_import!==false))throw Error('SOURCE_NOT_PUBLIC');
  const parts=[], images=new Map(), ocr=[];
  const push=(v)=>{if(typeof v==='string'&&v.trim()&&!parts.includes(v.trim()))parts.push(v.trim());};
  push(item.text);push(item.sharedPost?.text);
  const walk=(v,depth=0)=>{
    if(!v||typeof v!=='object'||depth>9)return;
    if(typeof v.ocrText==='string'&&!/^(?:May be|Peut être|No text)/i.test(v.ocrText))ocr.push(v.ocrText);
    const image=v.photo_image||v.image||v.thumbnail;
    const url=image?.uri||image?.url||(typeof v.uri==='string'?v.uri:null);
    if(url&&isFacebookImageUrl(url))images.set(String(v.id||url.split('?')[0]),{id:String(v.id||url.split('?')[0]),url});
    for(const key of ['attachments','media','sharedPost']) {
      const a=v[key];if(Array.isArray(a))a.forEach(x=>walk(x,depth+1));else walk(a,depth+1);
    }
  };walk(item);
  return {group_id:group,post_id:m[2],source_url:'https://www.facebook.com/groups/'+group+'/permalink/'+m[2]+'/',
    posted_at:item.sharedPost?.time||item.time,author:item.sharedPost?.user?.name||item.sharedPost?.pageName||item.user?.name||'',
    text:parts.join('\n').slice(0,30000),ocr_text:ocr.join('\n').slice(0,30000),images:[...images.values()].slice(0,6)};
}

function isFacebookImageUrl(url) {
  return typeof url==='string'&&/^https:\/\/scontent[-.][a-z0-9.-]+\.fbcdn\.net(?::443)?\/[^\s]*$/i.test(url);
}

function redactFacebookContacts(text) {
  return String(text||'').replace(/(?:\+|00)(?:33|221)(?:[ .-]*\d){8,10}/g,'[CONTACT]')
    .replace(/\b(?:0[1-9]|7[05678])(?:[ .-]*\d){7,8}\b/g,'[CONTACT]');
}

function extractFacebookOffers(post, imageTexts, today) {
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const raw=[post.text,post.ocr_text,...imageTexts].filter(Boolean).join('\n').slice(0,60000);
  const text=norm(raw).replace(/[^\x20-\x7E\n€→]/g,' ');
  const fail=reason=>({records:[],review:{source_url:post.source_url,post_id:post.post_id,operator:post.author,reason,
    evidence:redactFacebookContacts(raw).slice(0,14000)}});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(today))throw Error('INVALID_TODAY');
  if(!raw.trim())return fail('IMAGE_TEXT_REQUIRED');
  if(/(?:je\s+(?:cherche|recherche)|cherche\s+(?:un|une)\s+(?:gp|voyageur)|besoin\s+d[' ]un\s+gp)/.test(text))return fail('SENDER_REQUEST');
  const cities=[
    ['saint louis','Saint-Louis','SN'],['dakar','Dakar','SN'],['thies','Thiès','SN'],['mbour','Mbour','SN'],['touba','Touba','SN'],['ziguinchor','Ziguinchor','SN'],['kolda','Kolda','SN'],
    ['paris','Paris','FR'],['lyon','Lyon','FR'],['marseille','Marseille','FR'],['toulouse','Toulouse','FR'],['lille','Lille','FR'],['nice','Nice','FR'],['bordeaux','Bordeaux','FR'],['nantes','Nantes','FR'],['montpellier','Montpellier','FR']
  ];
  const byName=new Map(cities.map(c=>[c[0],c]));
  const cityPattern=cities.map(c=>c[0].replace(/ /g,'[- ]')).join('|');
  const routes=[...text.matchAll(new RegExp('\\b('+cityPattern+')\\s*(?:[-/>→]+|vers|pour)\\s*('+cityPattern+')\\b','g'))]
    .map(m=>({start:m.index,end:m.index+m[0].length,origin:byName.get(m[1].replace(/-/g,' ')),destination:byName.get(m[2].replace(/-/g,' '))}))
    .filter(r=>r.origin[2]!==r.destination[2]);
  if(!routes.length)return fail('ROUTE_REQUIRED');
  if(!post.author||post.author.trim().length<2)return fail('AUTHOR_REQUIRED');
  const monthNames=['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];
  const dateRegex=new RegExp('\\b(\\d{1,2})\\s+('+monthNames.join('|')+')\\s+(20\\d{2})\\b|\\b(20\\d{2})-(\\d{2})-(\\d{2})\\b|\\b(\\d{1,2})[/.](\\d{1,2})[/.](20\\d{2})\\b','g');
  const valid=d=>!isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
  const dates=s=>[...s.matchAll(dateRegex)].map(m=>m[1]?[m[3],monthNames.indexOf(m[2])+1,m[1]]:m[4]?[m[4],m[5],m[6]]:[m[9],m[8],m[7]])
    .map(a=>a.map((v,i)=>i?String(v).padStart(2,'0'):String(v)).join('-')).filter(valid);
  const allDates=[...new Set(dates(text))];
  // Relative expressions must agree with explicit image dates. No implicit year.
  const relative=/\bapres[- ]demain\b/.test(text)?2:/\bdemain\b/.test(text)?1:/\baujourd hui\b/.test(text)?0:null;
  if(relative!==null&&post.posted_at&&allDates.length===1){
    const d=new Date(post.posted_at);if(!isNaN(d)){
      const local=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
      const expected=new Date(local+'T12:00:00Z');expected.setUTCDate(expected.getUTCDate()+relative);
      if(allDates[0]!==expected.toISOString().slice(0,10))return fail('DATE_CONFLICT');
    }
  }
  const priceMatches=[...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(€|eur|fcfa|f\s*cfa|cfa|xof)\s*(?:\/|par|le)?\s*(?:kg|kilo)/g)];
  const prices=[...new Set(priceMatches.map(m=>Number(m[1].replace(',','.'))+'|'+(/eur|€/.test(m[2])?'EUR':'XOF')))];
  const locations=[
    {re:/parcelles\s+assainies(?:\s*(?:unite|u)\s*[- ]?\s*(\d{1,2}))?/g,country:'SN',city:'Dakar',label:m=>'Parcelles Assainies'+(m[1]?' unité '+m[1]:''),precision:'quartier_approx'},
    {re:/\bouakam\b/g,country:'SN',city:'Dakar',label:()=> 'Ouakam',precision:'quartier_approx'},
    {re:/\bscat[- ]?urbam\b/g,country:'SN',city:'Dakar',label:()=> 'Scat Urbam',precision:'quartier_approx'},
    {re:/\bsoprim\b/g,country:'SN',city:'Dakar',label:()=> 'Soprim',precision:'quartier_approx'},
    {re:/\b(?:yoff|medina|mermoz|sacre[- ]coeur|hlm(?:\s+\d+)?)\b/g,country:'SN',city:'Dakar',label:m=>m[0],precision:'quartier_approx'},
    {re:/\bngor(?:\s+almadies)?\b/g,country:'SN',city:'Dakar',label:m=>m[0],precision:'quartier_approx'},
    {re:/\bvitry[- ]sur[- ]seine\b/g,country:'FR',city:'Paris',label:()=> 'Vitry-sur-Seine',precision:'commune_approx'},
    {re:/\bcergy\b/g,country:'FR',city:'Paris',label:()=> 'Cergy',precision:'commune_approx'},
    {re:/\bparis\s+(1[0-9]|20|[1-9])(?:eme|ieme|e)\b/g,country:'FR',city:'Paris',label:m=>'Paris '+m[1]+'e',precision:'quartier_approx'}
  ];
  const foundPlaces=[];
  locations.forEach(rule=>{for(const m of text.matchAll(rule.re))foundPlaces.push({...rule,name:rule.label(m)});});
  if(/\b(?:rue|avenue|boulevard|impasse)\b/.test(text))return fail('ADDRESS_REVIEW_REQUIRED');
  if(/\b(?:quartier|adresse|depot|retrait)\b/.test(text)&&!foundPlaces.length)return fail('LOCATION_REVIEW_REQUIRED');
  const out=[];
  for(let i=0;i<routes.length;i++){
    const route=routes[i],next=routes[i+1]?.start??text.length;
    let ownDates=[...new Set(dates(text.slice(route.end,next)))];
    if(!ownDates.length&&routes.length===1)ownDates=allDates;
    if(ownDates.length!==1)return fail('DATE_ROUTE_AMBIGUOUS');
    const date=ownDates[0];if(date<today)continue;
    const ahead=(new Date(date+'T12:00:00Z')-new Date(today+'T12:00:00Z'))/86400000;
    if(ahead>366)return fail('DATE_TOO_FAR');
    const weekday=text.slice(route.end,next).match(/\b(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)\s*(?=\d)/);
    if(weekday&&['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'].indexOf(weekday[1])!==new Date(date+'T12:00:00Z').getUTCDay())return fail('WEEKDAY_CONFLICT');
    const r={group_id:post.group_id,post_id:post.post_id,source_url:post.source_url,source_verified:true,year_verified:true,
      kind:'traveller_offer',operator:'Annonce de '+post.author.trim(),origin:route.origin[1],destination:route.destination[1],
      origin_country:route.origin[2],destination_country:route.destination[2],departure_date:date,
      date_as_posted:'Date explicite '+date+'; texte original/OCR. Disponibilité à confirmer.'};
    if(prices.length===1){const [p,c]=prices[0].split('|');r.price_per_kg=Number(p);r.currency=c;}
    for(const side of ['origin','destination']){
      const matches=foundPlaces.filter(p=>p.country===r[side+'_country']&&p.city===r[side]);
      const unique=[...new Map(matches.map(p=>[p.name,p])).values()];
      if(unique.length){
        const names=unique.map(p=>p.name),country=r[side+'_country'];
        r[side+'_place']={source_verified:true,text:names.join('; ')+', '+r[side]+', '+(country==='FR'?'France':'Sénégal'),
          neighborhood:names.join('; '),query:unique.length===1?names[0]+', '+r[side]+', '+(country==='FR'?'France':'Sénégal'):'',
          match_tokens:unique.length===1?norm(names[0]).split(/[- ]+/).filter(v=>!['sur','seine','unite','e'].includes(v)).slice(0,4):[],
          precision:unique.length===1?unique[0].precision:'A_VERIFIER'};
      } else r[side+'_place']={source_verified:true,text:r[side]+', '+(r[side+'_country']==='FR'?'France':'Sénégal'),neighborhood:'',
        query:r[side]+', '+(r[side+'_country']==='FR'?'France':'Sénégal'),match_tokens:[norm(r[side])],precision:'ville_approx'};
    }
    out.push(r);
  }
  if(!out.length)return fail('EXPIRED');
  if(post.images?.length&&!imageTexts.length&&!post.ocr_text)return fail('IMAGE_TEXT_REQUIRED');
  return {records:out,review:null};
}

// Owner-only cloud worker. Never add an anonymous import action to doPost.
// Existing public catalogue and traveller publication keep their deployment.
// Configure Script Properties after explicit credential/OCR authorization:
// BMP_APIFY_READ_TOKEN (scoped read only), BMP_APIFY_TASK_ID, BMP_FACEBOOK_CLOUD_ENABLED.
// OCR additionally needs Drive API enabled and the drive.file OAuth scope.
var FB_CLOUD_ACTOR_ID='2chN8UQcH1CfxLRNE';
var FB_CLOUD_QUEUE_HEADERS=['post_id','fonte','stato','tentativi','dati_pubblici','motivo','aggiornato'];
var FB_CLOUD_OCR_HEADERS=['image_id','stato','testo','aggiornato'];
function fbCloudApi_(path,token){
  if(!/^\/(?:actor-tasks|datasets)\/[A-Za-z0-9]+(?:\/runs\/last|\/items)\?/.test(path))throw Error('APIFY_PATH_INVALID');
  var r=UrlFetchApp.fetch('https://api.apify.com/v2'+path,{headers:{Authorization:'Bearer '+token},muteHttpExceptions:true});
  if(r.getResponseCode()!==200)throw Error('APIFY_READ_'+r.getResponseCode());
  var text=r.getContentText();if(text.length>2000000)throw Error('APIFY_RESPONSE_TOO_LARGE');
  return JSON.parse(text);
}
function fbCloudImage_(url){
  if(!isFacebookImageUrl(url))throw Error('IMAGE_HOST_NOT_ALLOWED');
  // Never follow a redirect to another host.
  var response=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:false});
  if(response.getResponseCode()!==200)throw Error('IMAGE_UNAVAILABLE');
  var blob=response.getBlob(),type=blob.getContentType();
  if(!/^image\/(?:jpeg|png|gif)$/.test(type)||blob.getBytes().length>5000000)throw Error('IMAGE_FORMAT_OR_SIZE');
  return blob;
}
function fbCloudOcr_(image,cache,budget){
  var cached=cache.rows.find(function(row){return String(row[0])===image.id&&row[1]==='OK';});
  if(cached)return cached[2];
  if(budget.remaining<=0)throw Error('OCR_DEFERRED');budget.remaining--;
  var blob=fbCloudImage_(image.url);
  var boundary='bmp_'+Utilities.getUuid().replace(/-/g,'');
  var metadata={name:'BringMyPack OCR temporaire '+image.id.replace(/[^A-Za-z0-9_-]/g,'').slice(0,40),mimeType:'application/vnd.google-apps.document'};
  var start=Utilities.newBlob('--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: '+blob.getContentType()+'\r\n\r\n').getBytes();
  var payload=start.concat(blob.getBytes(),Utilities.newBlob('\r\n--'+boundary+'--\r\n').getBytes());
  var auth={Authorization:'Bearer '+ScriptApp.getOAuthToken()};
  var created=UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&ocrLanguage=fr&fields=id',
    {method:'post',contentType:'multipart/related; boundary='+boundary,headers:auth,payload:payload,muteHttpExceptions:true});
  if(created.getResponseCode()!==200&&created.getResponseCode()!==201)throw Error('OCR_PERMISSION_OR_SERVICE');
  var id=JSON.parse(created.getContentText()).id;
  if(!/^[A-Za-z0-9_-]+$/.test(id||''))throw Error('OCR_FILE_INVALID');
  try{
    var result=UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/'+id+'/export?mimeType=text%2Fplain',{headers:auth,muteHttpExceptions:true});
    if(result.getResponseCode()!==200)throw Error('OCR_EXPORT_FAILED');
    var text=redactFacebookContacts(result.getContentText()).slice(0,20000);
    cache.sheet.appendRow([gpPublicationText(image.id),'OK',gpPublicationText(text),new Date()]);
    cache.rows.push([image.id,'OK',text]);return text;
  }finally{
    // Reversible cleanup of this worker's temporary document only.
    UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/'+id,{method:'patch',contentType:'application/json',headers:auth,payload:JSON.stringify({trashed:true}),muteHttpExceptions:true});
  }
}
function facebookCloudReadiness(){
  var p=PropertiesService.getScriptProperties();
  var ready={enabled:p.getProperty('BMP_FACEBOOK_CLOUD_ENABLED')==='true',token_present:!!p.getProperty('BMP_APIFY_READ_TOKEN'),
    task_present:/^[A-Za-z0-9]+$/.test(p.getProperty('BMP_APIFY_TASK_ID')||''),payments:false};
  Logger.log(JSON.stringify(ready));return ready;
}
function installFacebookCloudTrigger(){
  var p=PropertiesService.getScriptProperties();
  if(!p.getProperty('BMP_APIFY_READ_TOKEN')||!/^[A-Za-z0-9]+$/.test(p.getProperty('BMP_APIFY_TASK_ID')||''))throw Error('CLOUD_SETUP_REQUIRED');
  if(p.getProperty('BMP_FACEBOOK_OCR_AUTHORIZED')!=='true')throw Error('OCR_AUTHORIZATION_REQUIRED');
  var found=ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='syncFacebookCloud';});
  if(!found.length)ScriptApp.newTrigger('syncFacebookCloud').timeBased().everyHours(1).create();
  p.setProperty('BMP_FACEBOOK_CLOUD_ENABLED','true');
  Logger.log('Cloud worker enabled: hourly read/import only; does not start paid Apify runs.');
}
function pauseFacebookCloud(){
  PropertiesService.getScriptProperties().setProperty('BMP_FACEBOOK_CLOUD_ENABLED','false');
  Logger.log('Cloud worker paused. Existing data unchanged.');
}
function syncFacebookCloud(){
  var props=PropertiesService.getScriptProperties();
  if(props.getProperty('BMP_FACEBOOK_CLOUD_ENABLED')!=='true')return {enabled:false};
  var lock=LockService.getScriptLock();if(!lock.tryLock(10000))return {busy:true};
  var report={added:0,duplicates:0,review:0,queued:0,ocr:0};
  try{
    var token=props.getProperty('BMP_APIFY_READ_TOKEN'),task=props.getProperty('BMP_APIFY_TASK_ID');
    if(!token||!/^[A-Za-z0-9]+$/.test(task||''))throw Error('CLOUD_SETUP_REQUIRED');
    if(props.getProperty('BMP_FACEBOOK_OCR_AUTHORIZED')!=='true')throw Error('OCR_AUTHORIZATION_REQUIRED');
    var book=SpreadsheetApp.openById(GP_PUBLICATION_SPREADSHEET);
    var queue=fbImportTable_(book,'FB_QUEUE',FB_CLOUD_QUEUE_HEADERS);
    var ocrSheet=fbImportTable_(book,'FB_OCR_CACHE',FB_CLOUD_OCR_HEADERS);
    var runResponse=fbCloudApi_('/actor-tasks/'+task+'/runs/last?status=SUCCEEDED',token),run=runResponse.data;
    if(!run||run.status!=='SUCCEEDED'||run.actId!==FB_CLOUD_ACTOR_ID||run.actorTaskId!==task||!/^[A-Za-z0-9]+$/.test(run.defaultDatasetId||''))throw Error('APIFY_RUN_INVALID');
    var queueData=queue.getDataRange().getValues(),known=new Set(queueData.slice(1).map(function(r){return String(r[0]);}));
    if(props.getProperty('BMP_APIFY_LAST_ENQUEUED_RUN')!==run.id){
      var items=fbCloudApi_('/datasets/'+run.defaultDatasetId+'/items?format=json&clean=true&limit=50',token);
      if(!Array.isArray(items)||items.length>50)throw Error('APIFY_ITEMS_INVALID');
      var normalized=[];
      items.forEach(function(item){try{normalized.push(normalizeFacebookPost(item,FB_IMPORT_SOURCES));}catch(error){report.review++;}});
      normalized.sort(function(a,b){return FB_IMPORT_SOURCES.find(function(s){return s.id===a.group_id;}).priority-FB_IMPORT_SOURCES.find(function(s){return s.id===b.group_id;}).priority;});
      normalized.forEach(function(post){
        if(known.has(post.post_id))return;
        post.text=redactFacebookContacts(post.text);post.ocr_text=redactFacebookContacts(post.ocr_text);
        queue.appendRow([post.post_id,post.source_url,'PENDING',0,gpPublicationText(JSON.stringify(post)),'',new Date()]);
        known.add(post.post_id);report.queued++;
      });
      props.setProperty('BMP_APIFY_LAST_ENQUEUED_RUN',run.id);
    }
    queueData=queue.getDataRange().getValues();
    var cache={sheet:ocrSheet,rows:ocrSheet.getDataRange().getValues().slice(1)},budget={remaining:8},processed=0;
    for(var n=1;n<queueData.length&&processed<3;n++){
      var q=queueData[n];if(q[2]!=='PENDING')continue;processed++;
      var attempt=Number(q[3]||0)+1;queue.getRange(n+1,4).setValue(attempt);
      try{
        var post=JSON.parse(String(q[4])),imageTexts=post.images.map(function(image){return fbCloudOcr_(image,cache,budget);});
        var today=Utilities.formatDate(new Date(),'Europe/Paris','yyyy-MM-dd');
        var extracted=extractFacebookOffers(post,imageTexts,today);
        if(extracted.review){fbCloudReview_(book,extracted.review);report.review++;queue.getRange(n+1,3).setValue('REVIEW');queue.getRange(n+1,6).setValue(extracted.review.reason);}
        else {
          var importReport=fbCloudSave_(book,extracted.records,today);
          report.added+=importReport.added;report.duplicates+=importReport.duplicates;
          queue.getRange(n+1,3).setValue('DONE');queue.getRange(n+1,6).setValue(JSON.stringify(importReport));
        }
        queue.getRange(n+1,7).setValue(new Date());
      }catch(error){
        var code=String(error.message);
        if(!/^[A-Z_0-9]+$/.test(code))code='PROCESSING_ERROR';
        queue.getRange(n+1,6).setValue(code);
        if(code!=='OCR_DEFERRED'&&attempt>=3){queue.getRange(n+1,3).setValue('REVIEW');report.review++;}
        if(code==='OCR_PERMISSION_OR_SERVICE')throw Error(code);
      }
    }
    report.ocr=8-budget.remaining;
    fbImportTable_(book,'FB_RUNS',['data_ora','modalita','inseriti','duplicati','da_verificare','ricevute','gps'])
      .appendRow([new Date(),'Apify cloud — codice, senza chiamate AI',report.added,report.duplicates,report.review,JSON.stringify({queued:report.queued,ocr:report.ocr}),'']);
    props.setProperty('BMP_FACEBOOK_LAST_SUCCESS',new Date().toISOString());
    SpreadsheetApp.flush();Logger.log(JSON.stringify(report));return report;
  }catch(error){
    var code=/^[A-Z_0-9]+$/.test(String(error.message))?String(error.message):'CLOUD_ERROR';
    props.setProperty('BMP_FACEBOOK_LAST_ERROR',code);
    Logger.log(JSON.stringify({success:false,error:code}));throw Error(code);
  }finally{lock.releaseLock();}
}
function fbCloudReview_(book,r){
  var sheet=fbImportTable_(book,'FB_REVIEW',['chiave','operatore','partenza','arrivo','data','fonte','motivo','luogo_partenza','luogo_arrivo','evidenza_data']);
  var key='CLOUD|'+r.post_id;
  if(sheet.getDataRange().getValues().some(function(row){return row[0]===key;}))return;
  sheet.appendRow([key,r.operator||'','','','',r.source_url,r.reason,'','',r.evidence].map(gpPublicationText));
}
function fbCloudSave_(book,records,today){
  var sheet=book.getSheetByName(GP_PUBLICATION_SHEET),data=sheet.getDataRange().getValues(),headers=data[0].map(String);
  // The owner migration creates the optional location columns; never rename existing columns.
  if(FB_IMPORT_EXTRA_HEADERS.some(function(h){return headers.indexOf(h)<0;}))throw Error('LOCATION_HEADERS_MISSING');
  var existing=data.slice(1).filter(function(row){return /^FB_/.test(String(row[headers.indexOf('gp_id')]));}).map(function(row){
    var get=function(k){return row[headers.indexOf(k)];};
    return {id:get('gp_id'),operator:get('nom'),origin:get('ville_depart'),destination:get('ville_arrivee'),departure_date:gpCatalogDate(get('date_depart')),source_url:get('source')};
  });
  var preflight=planFacebookImport(records,existing,headers,FB_IMPORT_SOURCES,today);
  // Do not geocode duplicate or rejected announcements.
  var eligible=new Set(preflight.rows.map(function(row){return row[headers.indexOf('source')];})),geocodes=0;
  records.forEach(function(r){if(!eligible.has(r.source_url))return;
    ['origin','destination'].forEach(function(side){var p=r[side+'_place'];if(p&&p.query&&geocodes<6){p.geocode=fbImportGeocode_(p,r[side+'_country']);geocodes++;}});
  });
  var plan=planFacebookImport(records,existing,headers,FB_IMPORT_SOURCES,today),receipts=[];
  plan.rows.forEach(function(row){
    row[headers.indexOf('date_creation')]=new Date();sheet.appendRow(row);
    var n=sheet.getLastRow(),id=sheet.getRange(n,headers.indexOf('gp_id')+1).getValue();
    if(id!==row[headers.indexOf('gp_id')])throw Error('SAVE_UNCONFIRMED');
    receipts.push({id:id,row:n});
  });
  plan.review.forEach(function(r){fbCloudReview_(book,{post_id:r.post_id,source_url:r.source_url,operator:r.operator,reason:r.reason,evidence:r.date_as_posted});});
  return {added:receipts.length,duplicates:plan.duplicates.length,review:plan.review.length,receipts:receipts};
}
