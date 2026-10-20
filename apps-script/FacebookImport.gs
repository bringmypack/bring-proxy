// Pure preparation only. No external reads/writes. A source must be opened and verified.
function planFacebookImport(records, existingIds, headers, sources, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw Error('INVALID_TODAY');
  const required=['gp_id','role','nom','ville_depart','ville_arrivee','date_depart','statut','source','date_source'];
  if(required.some(k=>!headers.includes(k)) || new Set(headers).size!==headers.length) throw Error('INVALID_HEADERS');
  const priority=new Map(sources.filter(s=>s.enabled&&s.visibility!=='private'&&s.public_import!==false).map(s=>[s.id,s.priority]));
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const trip=r=>[r.operator,r.origin,r.destination,r.departure_date,r.departure_time||''].map(norm).join('|');
  const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0).toString(16).padStart(8,'0');};
  const seen=new Set(), seenPostIds=new Set(), seenPostTrips=new Set(), seenTrips=new Set(), rows=[], review=[], duplicates=[];
  existingIds.forEach(r=>{
    if(typeof r==='string') {seen.add(r);const m=r.match(/^FB_[^_]+_(\d+)$/);if(m)seenPostIds.add(m[1]);}
    else {seen.add(r.id);seenTrips.add(trip(r));const m=String(r.source_url||'').match(/\/(?:posts|permalink)\/(\d+)\/$/);if(m)seenPostTrips.add(m[1]+'|'+trip(r));}
  });
  for(const r of [...records].sort((a,b)=>(priority.get(a.group_id)??999)-(priority.get(b.group_id)??999))) {
    const m=String(r.source_url||'').match(/^https:\/\/www\.facebook\.com\/groups\/([^/]+)\/(?:posts|permalink)\/(\d+)\/$/);
    const date=String(r.departure_date||'');
    const validDate=/^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10)===date;
    let reason=null;
    if(!m||!priority.has(m[1])||m[1]!==r.group_id||m[2]!==r.post_id) reason='SOURCE_NOT_ALLOWED';
    else if(r.source_verified!==true) reason='SOURCE_REQUIRED';
    else if(!validDate||r.year_verified!==true||r.date_conflict===true) reason='DATE_REQUIRED';
    else if(date<today) reason='EXPIRED';
    else if(![r.operator,r.origin,r.destination].every(v=>typeof v==='string'&&v.trim())||r.kind!=='traveller_offer') reason='OFFER_REQUIRED';
    else if(![['FR','SN'],['SN','FR']].some(pair=>pair[0]===r.origin_country&&pair[1]===r.destination_country)) reason='ROUTE_OUTSIDE_SCOPE';
    if(reason){review.push({...r,reason});continue;}
    const key=trip(r), id='FB_'+r.group_id+'_'+r.post_id+'_'+date.replace(/-/g,'')+'_'+hash(key);
    if(seen.has(id)||seenPostIds.has(r.post_id)||seenPostTrips.has(r.post_id+'|'+key)){duplicates.push({id,reason:'EXISTING_POST'});continue;}
    if(seenTrips.has(key)){duplicates.push({id,reason:'POSSIBLE_CROSS_POST_REVIEW'});continue;}
    seen.add(id);seenPostTrips.add(r.post_id+'|'+key);seenTrips.add(key);
    const record={gp_id:id,role:'GP',nom:r.operator,ville_depart:r.origin,ville_arrivee:r.destination,
      date_depart:date,date_expiration:date+'T23:59:59Z',statut:'A_VERIFIER',source:r.source_url,
      date_source:typeof r.date_as_posted==='string'?r.date_as_posted:date,
      prix_kg:typeof r.price_per_kg==='number'&&Number.isFinite(r.price_per_kg)&&r.price_per_kg>=0?r.price_per_kg:'',
      devise:/^[A-Z]{3}$/.test(r.currency||'')?r.currency:'',
      capacite_kg:typeof r.capacity_kg==='number'&&Number.isFinite(r.capacity_kg)&&r.capacity_kg>0?r.capacity_kg:'',
      objets_acceptes:typeof r.accepted_items==='string'?r.accepted_items:'',tarif_texte:typeof r.price_terms==='string'?r.price_terms:''};
    if(record.prix_kg!==''&&!record.devise) {record.prix_kg='';}
    for(const [side,suffix] of [['origin','depart'],['destination','arrivee']]) {
      const place=r[side+'_place'];
      if(!place||place.source_verified!==true) continue;
      record['quartier_'+suffix]=place.neighborhood||'';
      record['lieu_'+suffix+'_texte']=place.text||'';
      const geo=place.geocode;
      const valid=geo?.verified===true&&typeof geo.lat==='number'&&typeof geo.lng==='number'&&Number.isFinite(geo.lat)&&Number.isFinite(geo.lng)&&Math.abs(geo.lat)<=90&&Math.abs(geo.lng)<=180&&geo.country===r[side+'_country']&&['ville_approx','commune_approx','quartier_approx','adresse'].includes(geo.precision);
      record['precision_gps_'+suffix]=valid?geo.precision:'A_VERIFIER';
      if(valid){record['lat_'+suffix]=geo.lat;record['lng_'+suffix]=geo.lng;record['geocodage_'+suffix]=geo.formatted_address||place.text;}
    }
    rows.push(headers.map(k=>{const v=record[k]??'';return typeof v==='string'&&/^[=+\-@\t\r]/.test(v)?"'"+v:v;}));
  }
  return {rows,review,duplicates};
}

var FB_IMPORT_SOURCES = [
  {
    "priority": 1,
    "id": "gpfrancesenegal",
    "url": "https://www.facebook.com/groups/gpfrancesenegal/",
    "label": "Transport de colis France-Sénégal",
    "label_verified": true,
    "enabled": true,
    "visibility": "public",
    "public_import": true
  },
  {
    "priority": 2,
    "id": "1430214083851753",
    "url": "https://www.facebook.com/groups/1430214083851753/",
    "label": "GP:Dakar paris/paris dakar.achat&vente",
    "label_verified": true,
    "enabled": true,
    "visibility": "public",
    "public_import": true
  },
  {
    "priority": 3,
    "id": "707572670955137",
    "url": "https://www.facebook.com/groups/707572670955137/",
    "label": "Gp Dakar Paris / Paris Dakar",
    "label_verified": true,
    "enabled": true,
    "visibility": "public",
    "public_import": true
  },
  {
    "priority": 4,
    "id": "2109180682722375",
    "url": "https://www.facebook.com/groups/2109180682722375/",
    "label": "GP ET ECHANGE DU MONDE",
    "label_verified": true,
    "enabled": true,
    "visibility": "public",
    "public_import": true
  },
  {
    "priority": 5,
    "id": "320004609170313",
    "url": "https://www.facebook.com/groups/320004609170313/",
    "label": "ANNONCES DES GP",
    "label_verified": true,
    "enabled": true,
    "visibility": "public",
    "public_import": true
  },
  {
    "priority": 6,
    "id": "226193057954981",
    "url": "https://www.facebook.com/groups/226193057954981/",
    "label": "Gp France Dakar",
    "label_verified": true,
    "enabled": true,
    "visibility": "private",
    "public_import": false
  }
];
var FB_IMPORT_BATCH = [
  {
    "group_id": "gpfrancesenegal",
    "post_id": "2338325456920488",
    "source_url": "https://www.facebook.com/groups/gpfrancesenegal/permalink/2338325456920488/",
    "source_verified": true,
    "year_verified": true,
    "kind": "traveller_offer",
    "operator": "Alioune Sylla",
    "origin": "Paris",
    "destination": "Dakar",
    "origin_country": "FR",
    "destination_country": "SN",
    "departure_date": "2026-10-21",
    "date_as_posted": "Demain mercredi 21 octobre 2026. Original public consulté le 20 octobre 2026.",
    "origin_place": {
      "source_verified": true,
      "text": "Paris, France",
      "neighborhood": "",
      "query": "Paris, France",
      "country": "FR",
      "precision": "ville_approx",
      "match_tokens": [
        "paris"
      ]
    },
    "destination_place": {
      "source_verified": true,
      "text": "Dakar, Sénégal",
      "neighborhood": "",
      "query": "Dakar, Sénégal",
      "country": "SN",
      "precision": "ville_approx",
      "match_tokens": [
        "dakar"
      ]
    }
  },
  {
    "group_id": "320004609170313",
    "post_id": "1879258479911577",
    "source_url": "https://www.facebook.com/groups/320004609170313/posts/1879258479911577/",
    "source_verified": true,
    "year_verified": true,
    "kind": "traveller_offer",
    "operator": "Mme Diaw — GP la Confiance",
    "origin": "Paris",
    "destination": "Dakar",
    "origin_country": "FR",
    "destination_country": "SN",
    "departure_date": "2026-10-21",
    "date_as_posted": "Mercredi 21 octobre 2026, année explicite sur la locandine.",
    "price_per_kg": 10,
    "currency": "EUR",
    "origin_place": {
      "source_verified": true,
      "text": "Vitry-sur-Seine, France",
      "neighborhood": "",
      "query": "Vitry-sur-Seine, France",
      "country": "FR",
      "precision": "commune_approx",
      "match_tokens": [
        "vitry"
      ]
    },
    "destination_place": {
      "source_verified": true,
      "text": "Parcelles Assainies unité 25, Dakar, Sénégal",
      "neighborhood": "Parcelles Assainies — unité 25",
      "query": "Parcelles Assainies unité 25, Dakar, Sénégal",
      "country": "SN",
      "precision": "quartier_approx",
      "match_tokens": [
        "parcelles",
        "25"
      ]
    }
  },
  {
    "group_id": "320004609170313",
    "post_id": "1867448747759217",
    "source_url": "https://www.facebook.com/groups/320004609170313/posts/1867448747759217/",
    "source_verified": true,
    "year_verified": true,
    "kind": "traveller_offer",
    "operator": "Niany GP Travel International",
    "origin": "Lyon",
    "destination": "Dakar",
    "origin_country": "FR",
    "destination_country": "SN",
    "departure_date": "2026-10-23",
    "date_as_posted": "23 octobre 2026, année explicite sur la locandine.",
    "price_terms": "Dernier dépôt le 22 octobre 2026.",
    "origin_place": {
      "source_verified": true,
      "text": "Lyon, France",
      "neighborhood": "",
      "query": "Lyon, France",
      "country": "FR",
      "precision": "ville_approx",
      "match_tokens": [
        "lyon"
      ]
    },
    "destination_place": {
      "source_verified": true,
      "text": "Dakar, Sénégal",
      "neighborhood": "",
      "query": "Dakar, Sénégal",
      "country": "SN",
      "precision": "ville_approx",
      "match_tokens": [
        "dakar"
      ]
    }
  },
  {
    "group_id": "gpfrancesenegal",
    "post_id": "2338289653590735",
    "source_url": "https://www.facebook.com/groups/gpfrancesenegal/permalink/2338289653590735/",
    "source_verified": true,
    "year_verified": false,
    "kind": "traveller_offer",
    "operator": "Adji GP",
    "origin": "Dakar",
    "destination": "Paris",
    "origin_country": "SN",
    "destination_country": "FR",
    "departure_date": "2026-10-21",
    "date_as_posted": "Affiche: mercredi 21 octobre, sans année. Légende: après-demain, publiée le 20 octobre 2026. Contradiction à clarifier.",
    "date_conflict": true,
    "origin_place": {
      "source_verified": true,
      "text": "Ouakam; Parcelles Case Bi, Dakar, Sénégal",
      "neighborhood": "Ouakam; Parcelles Case Bi",
      "query": "Ouakam; Parcelles Case Bi, Dakar, Sénégal",
      "country": "SN",
      "precision": "quartier_approx",
      "match_tokens": []
    },
    "destination_place": {
      "source_verified": true,
      "text": "6 rue Affre, 75018 Paris, France",
      "neighborhood": "Paris 18e",
      "query": "6 rue Affre, 75018 Paris, France",
      "country": "FR",
      "precision": "adresse",
      "match_tokens": [
        "affre",
        "6"
      ]
    }
  },
  {
    "group_id": "gpfrancesenegal",
    "post_id": "2338297733589927",
    "source_url": "https://www.facebook.com/groups/gpfrancesenegal/permalink/2338297733589927/",
    "source_verified": true,
    "year_verified": false,
    "kind": "traveller_offer",
    "operator": "Sen GP Agency",
    "origin": "Dakar",
    "destination": "Paris",
    "origin_country": "SN",
    "destination_country": "FR",
    "departure_date": "2026-10-20",
    "date_as_posted": "20/10 sans année sur la locandine. Départ imminent; publication consultée le 20 octobre 2026.",
    "price_per_kg": 10,
    "currency": "EUR",
    "origin_place": {
      "source_verified": true,
      "text": "Soprim près de la banque BOA, Dakar, Sénégal",
      "neighborhood": "Soprim",
      "query": "Soprim près de la banque BOA, Dakar, Sénégal",
      "country": "SN",
      "precision": "quartier_approx",
      "match_tokens": [
        "soprim"
      ]
    },
    "destination_place": {
      "source_verified": true,
      "text": "Paris 18e, France",
      "neighborhood": "Paris 18e",
      "query": "Paris 18e, France",
      "country": "FR",
      "precision": "quartier_approx",
      "match_tokens": [
        "18"
      ]
    }
  },
  {
    "group_id": "1430214083851753",
    "post_id": "3160016474204830",
    "source_url": "https://www.facebook.com/groups/1430214083851753/posts/3160016474204830/",
    "source_verified": true,
    "year_verified": false,
    "kind": "traveller_offer",
    "operator": "Symantec GP Transports",
    "origin": "Dakar",
    "destination": "Paris",
    "origin_country": "SN",
    "destination_country": "FR",
    "departure_date": "2026-10-22",
    "date_as_posted": "22 octobre Dakar–Paris / 27 octobre Paris–Dakar. Année absente du texte original; à confirmer."
  },
  {
    "group_id": "1430214083851753",
    "post_id": "3160016474204830",
    "source_url": "https://www.facebook.com/groups/1430214083851753/posts/3160016474204830/",
    "source_verified": true,
    "year_verified": false,
    "kind": "traveller_offer",
    "operator": "Symantec GP Transports",
    "origin": "Paris",
    "destination": "Dakar",
    "origin_country": "FR",
    "destination_country": "SN",
    "departure_date": "2026-10-27",
    "date_as_posted": "22 octobre Dakar–Paris / 27 octobre Paris–Dakar. Année absente du texte original; à confirmer."
  }
];

// Owner-only: run manually in the existing Apps Script editor.
// No web action exposes this importer, no browser credentials are stored.
var FB_IMPORT_EXTRA_HEADERS = ['quartier_depart','quartier_arrivee','lieu_depart_texte','lieu_arrivee_texte','precision_gps_depart','precision_gps_arrivee','geocodage_depart','geocodage_arrivee'];

function fbImportGeocode_(place, country) {
  var empty = {verified:false,reason:'UNRESOLVED'};
  if (!place || !place.query || !place.match_tokens || !place.match_tokens.length) return empty;
  try {
    var response = UrlFetchApp.fetch('https://maps.googleapis.com/maps/api/geocode/json?address=' +
      encodeURIComponent(place.query) + '&components=country:' + country +
      '&key=' + GOOGLE_MAPS_API_KEY, {muteHttpExceptions:true});
    var data = JSON.parse(response.getContentText());
    if(data.status!=='OK') return {verified:false,reason:String(data.status||'GEOCODER_ERROR')};
    var norm = function(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();};
    var matches=data.results.filter(function(result){
      var countries=result.address_components.filter(function(c){return c.types.indexOf('country')>=0;});
      var address=norm(result.formatted_address);
      return !result.partial_match && countries.some(function(c){return c.short_name===country;}) &&
        place.match_tokens.every(function(token){return address.indexOf(norm(token))>=0;});
    });
    if(matches.length!==1) return {verified:false,reason:'AMBIGUOUS_OR_PARTIAL'};
    var result=matches[0], point=result.geometry.location;
    return {verified:true,lat:point.lat,lng:point.lng,country:country,
      precision:place.precision,formatted_address:result.formatted_address};
  } catch(error) { return {verified:false,reason:'GEOCODER_ERROR'}; }
}

function fbImportTable_(book, name, headers) {
  var sheet=book.getSheetByName(name);
  if(!sheet) sheet=book.insertSheet(name);
  if(sheet.getLastRow()===0) {
    sheet.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold').setBackground('#d9ead3');
    sheet.setFrozenRows(1);
  } else {
    var actual=sheet.getRange(1,1,1,headers.length).getValues()[0];
    if(actual.join('|')!==headers.join('|')) throw Error(name+'_HEADERS_INVALID');
  }
  return sheet;
}

function importVerifiedFacebookBatch() {
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(10000)) throw Error('IMPORT_BUSY');
  try {
    var book=SpreadsheetApp.openById(GP_PUBLICATION_SPREADSHEET);
    var sheet=book.getSheetByName(GP_PUBLICATION_SHEET);
    if(!sheet) throw Error('CATALOG_MISSING');
    var data=sheet.getDataRange().getValues(), headers=data[0].map(function(v){return String(v).trim();});
    // Validate original headers before any mutation.
    planFacebookImport([],[],headers,FB_IMPORT_SOURCES,'2026-10-20');
    FB_IMPORT_EXTRA_HEADERS.forEach(function(key){
      if(headers.indexOf(key)<0){
        if(sheet.getMaxColumns()<=headers.length)sheet.insertColumnsAfter(sheet.getMaxColumns(),1);
        headers.push(key);sheet.getRange(1,headers.length).setValue(key);
      }
    });
    var existing=data.slice(1).filter(function(row){return /^FB_/.test(String(row[headers.indexOf('gp_id')]));}).map(function(row){
      var cell=function(k){return row[headers.indexOf(k)];};
      return {id:String(cell('gp_id')),operator:cell('nom'),origin:cell('ville_depart'),destination:cell('ville_arrivee'),
        departure_date:gpCatalogDate(cell('date_depart')),source_url:cell('source')};
    });
    var records=JSON.parse(JSON.stringify(FB_IMPORT_BATCH));
    var today=Utilities.formatDate(new Date(),'Europe/Paris','yyyy-MM-dd');
    var initial=planFacebookImport(records,existing,headers,FB_IMPORT_SOURCES,today);
    var eligibleIds=new Set(initial.rows.map(function(row){return row[headers.indexOf('source')];}));
    var geoCache={};
    records.forEach(function(r){
      if(!eligibleIds.has(r.source_url))return;
      ['origin','destination'].forEach(function(side){
        var place=r[side+'_place'];if(!place)return;
        var key=place.query+'|'+r[side+'_country'];
        if(!geoCache[key])geoCache[key]=fbImportGeocode_(place,r[side+'_country']);
        place.geocode=geoCache[key];
      });
    });
    var plan=planFacebookImport(records,existing,headers,FB_IMPORT_SOURCES,today);
    var receipts=[];
    plan.rows.forEach(function(row){
      row[headers.indexOf('date_creation')]=new Date();
      sheet.appendRow(row);
      var n=sheet.getLastRow();
      var id=sheet.getRange(n,headers.indexOf('gp_id')+1).getValue();
      if(id!==row[headers.indexOf('gp_id')]) throw Error('IMPORT_UNCONFIRMED');
      receipts.push({id:id,row:n});
    });
    var sources=fbImportTable_(book,'FB_SOURCES',['priorita','gruppo','url','visibilita','import_pubblico','stato_cloud']);
    if(sources.getLastRow()===1)FB_IMPORT_SOURCES.forEach(function(s){sources.appendRow([s.priority,s.label,s.url,s.visibility,s.public_import?'SI':'NO','Ricerca pubblica indicizzata; nessuna sessione Facebook cloud']);});
    var review=fbImportTable_(book,'FB_REVIEW',['chiave','operatore','partenza','arrivo','data','fonte','motivo','luogo_partenza','luogo_arrivo','evidenza_data']);
    var reviewKeys=new Set(review.getDataRange().getValues().slice(1).map(function(row){return String(row[0]);}));
    plan.review.forEach(function(r){
      var key=r.post_id+'|'+r.origin+'|'+r.destination+'|'+r.departure_date;
      if(reviewKeys.has(key))return;
      review.appendRow([key,r.operator,r.origin,r.destination,r.departure_date,r.source_url,
        r.date_conflict?'DATE_CONFLICT':r.reason,r.origin_place?.text||'',r.destination_place?.text||'',r.date_as_posted].map(gpPublicationText));
      reviewKeys.add(key);
    });
    var runs=fbImportTable_(book,'FB_RUNS',['data_ora','modalita','inseriti','duplicati','da_verificare','ricevute','gps']);
    var report={success:true,added:receipts.length,duplicates:plan.duplicates.length,review:plan.review.length,receipts:receipts,geocoding:geoCache};
    runs.appendRow([new Date(),'Verifica umana originali Facebook + import proprietario',receipts.length,plan.duplicates.length,plan.review.length,JSON.stringify(receipts),JSON.stringify(geoCache)]);
    var guide=book.getSheetByName('GESTIONE');
    if(guide && guide.getRange('A1').getValue()==='BringMyPack | Gestione') {
      var help=[
        ['Fonti Facebook','FB_SOURCES','6 gruppi, il tuo per primo. Gruppo privato escluso dal catalogo pubblico.'],
        ['Annunci incerti','FB_REVIEW','Date contraddittorie o anno mancante: verificare prima di importare. Quartieri conservati.'],
        ['Import e controlli','FB_RUNS','Ricevute delle righe salvate, duplicati e risultati geocodifica.'],
        ['Quartieri e GPS','GP_TRANSPORTEURS: lat/lng + nuove colonne da AE','Le città restano intatte. GPS di quartiere/comune = approssimativo; nessuna posizione precisa inventata.'],
        ['Raccolta cloud','Ricerca pubblica giornaliera attiva','Report indicizzati. Lettura completa Facebook e import automatico nel foglio NON attivi. Chrome serve alla verifica manuale.'],
        ['Date flessibili','Chat-GP','Più giorni accettati aumentano le possibilità di trovare un GP vicino, senza garantire disponibilità.']
      ];
      guide.getRange(16,1,help.length,3).setValues(help).setWrap(true).setVerticalAlignment('top');
      ['FB_SOURCES','FB_REVIEW','FB_RUNS'].forEach(function(name,i){
        var tab=book.getSheetByName(name);
        guide.getRange(16+i,2).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(name).setLinkUrl('https://docs.google.com/spreadsheets/d/'+book.getId()+'/edit#gid='+tab.getSheetId()).build());
      });
      guide.autoResizeRows(16,help.length);
    }
    SpreadsheetApp.flush();
    Logger.log(JSON.stringify(report));return report;
  } finally {lock.releaseLock();}
}
