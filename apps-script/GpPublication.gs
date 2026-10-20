// Add this file to the existing Apps Script project. Keep the legacy actions.
var GP_PUBLICATION_SPREADSHEET = '1KJL7mAtWvrndgrHX_5NjfUciqVX0uMxL63T6XJnRFmE';
var GP_PUBLICATION_SHEET = 'GP_TRANSPORTEURS';

function publicationCapabilities() {
  var book = SpreadsheetApp.openById(GP_PUBLICATION_SPREADSHEET);
  return { success: true, version: '2.0.0', spreadsheet_id: book.getId(),
    sheet: GP_PUBLICATION_SHEET, search: true,
    write_requests: !!book.getSheetByName(GP_PUBLICATION_SHEET),
    write_shipments: typeof publishShipment==='function'&&!!book.getSheetByName('EXPEDITEURS_COLIS'),matching:typeof findMatchesForPublication==='function',payments:false };
}

function gpPublicationInput(data) {
  var input = data || {};
  var fields = ['request_id', 'nom', 'telephone', 'ville_depart', 'ville_arrivee',
    'date_depart', 'objets_acceptes', 'tarif_texte', 'quartier_depart', 'quartier_arrivee'];
  var value = {};
  fields.forEach(function(key) {
    value[key] = typeof input[key] === 'string' ? input[key].trim() : '';
  });
  var missing = fields.filter(function(key) { return !value[key]; });
  if (missing.length) throw new Error('MISSING_FIELDS: ' + missing.join(', '));
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(value.request_id)) throw new Error('INVALID_REQUEST_ID');
  if (value.nom.length > 100 || value.objets_acceptes.length > 1000 ||
      value.tarif_texte.length > 200 || value.ville_depart.length > 250 ||
      value.ville_arrivee.length > 250 || value.quartier_depart.length > 250 || value.quartier_arrivee.length > 250) throw new Error('FIELD_TOO_LONG');
  if (!/^\+?[1-9][0-9]{7,14}$/.test(value.telephone)) throw new Error('INVALID_PHONE');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date_depart)) throw new Error('INVALID_DATE');
  var date = new Date(value.date_depart + 'T12:00:00Z');
  if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value.date_depart)
    throw new Error('INVALID_DATE');
  var today = Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd');
  if (value.date_depart < today) throw new Error('PAST_DATE');
  if (typeof input.capacite_kg !== 'number' || !isFinite(input.capacite_kg) ||
      input.capacite_kg <= 0 || input.capacite_kg > 10000) throw new Error('INVALID_CAPACITY');
  value.capacite_kg = input.capacite_kg;
  if (input.prix_kg !== undefined && input.prix_kg !== null) {
    if (typeof input.prix_kg !== 'number' || !isFinite(input.prix_kg) || input.prix_kg < 0)
      throw new Error('INVALID_PRICE');
    value.prix_kg = input.prix_kg;
    if (!/^[A-Z]{3}$/.test(input.devise || '')) throw new Error('CURRENCY_REQUIRED');
    value.devise = input.devise;
  } else {
    value.prix_kg = '';
    value.devise = '';
  }
  value.contact_match_consent=input.contact_match_consent===true;
  return value;
}

function gpPublicationFingerprint(value) {
  var payload = Object.keys(value).sort().filter(function(key) { return key !== 'request_id'; })
    .map(function(key) { return [key, value[key]]; });
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(payload))
    .map(function(byte) { return ('0' + (byte & 255).toString(16)).slice(-2); }).join('');
}

function gpPublicationReceipt(book, sheet, headers, row, number, duplicate) {
  return { success: true, status: 'GP ajouté', id: row[headers.indexOf('gp_id')],
    request_id: row[headers.indexOf('publication_request_id')],
    spreadsheet_id: book.getId(), sheet: sheet.getName(), row: number,
    updated_range: sheet.getRange(number, 1, 1, headers.length).getA1Notation(),
    duplicate: duplicate, contact_enabled: row[headers.indexOf('contact_match_consent')]===true, payments: false };
}

function gpPublicationText(value) {
  // Sheets must treat user text as text, never as a formula.
  return typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
}

function publishGP(data) {
  if(!data||data.confirmed!==true)return {success:false,error:'CONFIRMATION_REQUIRED'};
  var value;
  try { value = gpPublicationInput(data); }
  catch (error) { return { success: false, error: String(error.message) }; }
  var fingerprint = gpPublicationFingerprint(value);
  var book = SpreadsheetApp.openById(GP_PUBLICATION_SPREADSHEET);
  var sheet = book.getSheetByName(GP_PUBLICATION_SHEET);
  if (!sheet) return { success: false, error: 'PUBLICATION_SHEET_MISSING' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { success: false, error: 'BUSY_RETRY_SAME_REQUEST' };
  try {
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(function(cell) { return String(cell).trim(); });
    var required = ['gp_id','role','nom','whatsapp','ville_depart','lat_depart','lng_depart',
      'ville_arrivee','lat_arrivee','lng_arrivee','date_depart','date_expiration','prix_kg',
      'statut','date_creation','source','fiabilite_score','rating_total','rating_count',
      'signalements','badge'];
    if (required.some(function(key) { return headers.indexOf(key) < 0; }) ||
        headers.some(function(key, index) { return key && headers.indexOf(key) !== index; }))
      return { success: false, error: 'PUBLICATION_HEADERS_INVALID' };
    var idColumn = headers.indexOf('publication_request_id');
    var fingerprintColumn = headers.indexOf('publication_fingerprint');
    if (idColumn >= 0 && sheet.getLastRow() > 1) {
      var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
      for (var i = 0; i < rows.length; i++) {
        if (rows[i][idColumn] === value.request_id) {
          if (fingerprintColumn < 0 || rows[i][fingerprintColumn] !== fingerprint)
            return { success: false, error: 'REQUEST_ID_CONFLICT' };
          return gpPublicationReceipt(book, sheet, headers, rows[i], i + 2, true);
        }
      }
    }
    // Dry runs validate the schema without adding columns, rows or cache entries.
    if (data.dry_run === true) return { success: true, dry_run: true,
      spreadsheet_id: book.getId(), sheet: sheet.getName(), request_id: value.request_id };
    ['capacite_kg','objets_acceptes','tarif_texte','devise','publication_request_id',
      'publication_fingerprint','contact_match_consent','quartier_depart','quartier_arrivee','lieu_depart_texte','lieu_arrivee_texte','precision_gps_depart','precision_gps_arrivee','geocodage_depart','geocodage_arrivee'].forEach(function(key) {
      if (headers.indexOf(key) < 0) {
        if (sheet.getMaxColumns() < headers.length + 1)
          sheet.insertColumnsAfter(sheet.getMaxColumns(), 1);
        headers.push(key);
        sheet.getRange(1, headers.length).setValue(key);
      }
    });
    var now = new Date();
    var expiration = new Date(value.date_depart + 'T23:59:59Z');
    expiration.setUTCDate(expiration.getUTCDate() + 1);
    var places = publicationLocationRecord_(value);
    var record = Object.assign({}, value, places, { gp_id: 'GP_' + Utilities.getUuid(), role: 'GP',
      whatsapp: value.telephone, date_expiration: expiration,
      statut: 'ACTIF', date_creation: now, source: 'Chat-GP', fiabilite_score: 0,
      rating_total: 0, rating_count: 0, signalements: 0, badge: 'Nouveau',
      publication_request_id: value.request_id, publication_fingerprint: fingerprint });
    var row = headers.map(function(key) {
      return gpPublicationText(Object.prototype.hasOwnProperty.call(record, key) ? record[key] : '');
    });
    sheet.appendRow(row);
    SpreadsheetApp.flush();
    var savedRows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
    for (var n = savedRows.length - 1; n >= 0; n--) {
      if (savedRows[n][headers.indexOf('publication_request_id')] === value.request_id &&
          savedRows[n][headers.indexOf('gp_id')] === record.gp_id)
        return gpPublicationReceipt(book, sheet, headers, savedRows[n], n + 2, false);
    }
    return { success: false, error: 'SAVE_UNCONFIRMED_RETRY_SAME_REQUEST' };
  } finally { lock.releaseLock(); }
}

function getPublicationStatus(data) {
  if (!data || !/^[a-zA-Z0-9_-]{16,100}$/.test(data.request_id || ''))
    return { success: false, error: 'INVALID_REQUEST_ID' };
  var book = SpreadsheetApp.openById(GP_PUBLICATION_SPREADSHEET);
  var sheet = book.getSheetByName(GP_PUBLICATION_SHEET);
  if (!sheet) return { success: false, error: 'PUBLICATION_SHEET_MISSING' };
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0].map(function(cell) { return String(cell).trim(); });
  var column = headers.indexOf('publication_request_id');
  for (var i = 1; column >= 0 && i < rows.length; i++) {
    if (rows[i][column] === data.request_id)
      return gpPublicationReceipt(book, sheet, headers, rows[i], i + 1, true);
  }
  return { success: true, found: false, request_id: data.request_id };
}

function gpCatalogDate(value) {
  if (value && typeof value.getTime === 'function') {
    return isNaN(value.getTime()) ? null : Utilities.formatDate(value, 'Europe/Paris', 'yyyy-MM-dd');
  }
  var text = String(value == null ? '' : value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  var date = new Date(text + 'T12:00:00Z');
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : null;
}

// One read-only public projection of the same sheet used by publishGP.
// Historical private rows are not published by this migration. New Chat-GP
// announcements are eligible only after the publication pipeline saved them.
function readPublicCatalog() {
  var book = SpreadsheetApp.openById(GP_PUBLICATION_SPREADSHEET);
  var sheet = book.getSheetByName(GP_PUBLICATION_SHEET);
  if (!sheet) return { success: false, error: 'CATALOG_SHEET_MISSING' };
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0].map(function(cell) { return String(cell).trim(); });
  var required = ['gp_id','nom','ville_depart','ville_arrivee','date_depart','statut','source'];
  if (required.some(function(key) { return headers.indexOf(key) < 0; }) ||
      headers.some(function(key, i) { return key && headers.indexOf(key) !== i; }))
    return { success: false, error: 'CATALOG_HEADERS_INVALID' };
  var records = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var cell = function(key) { var n = headers.indexOf(key); return n < 0 ? '' : row[n]; };
    var id = String(cell('gp_id'));
    var source = String(cell('source'));
    var facebook = /^FB_/.test(id) && /^https:\/\/www\.facebook\.com\/groups\/[^/]+\/(?:permalink|posts)\/\d+\/$/.test(source);
    if(facebook && /^https:\/\/www\.facebook\.com\/groups\/226193057954981\//.test(source)) continue;
    var direct = /^GP_/.test(id) && source === 'Chat-GP' && /^[a-zA-Z0-9_-]{16,100}$/.test(String(cell('publication_request_id')));
    var status = String(cell('statut'));
    if ((!facebook && !direct) || ['ACTIF','A_VERIFIER'].indexOf(status) < 0) continue;
    var date = gpCatalogDate(cell('date_depart'));
    if (!date) continue;
    var numeric = function(key) { var value = cell(key); return typeof value === 'number' && isFinite(value) ? value : null; };
    records.push({ id: id, operator: String(cell('nom')), origin: String(cell('ville_depart')),
      destination: String(cell('ville_arrivee')), departure_date_estimated: date,
      price_per_kg: numeric('prix_kg'), status: status, source_url: facebook ? source : null,
      source_type: facebook ? 'facebook' : 'bringmypack',
      date_as_posted: facebook ? String(cell('date_source')) : date,
      currency: /^[A-Z]{3}$/.test(String(cell('devise'))) ? String(cell('devise')) : null,
      capacity_kg: numeric('capacite_kg'), accepted_items: String(cell('objets_acceptes')) || null,
      price_terms: String(cell('tarif_texte')) || null,
      origin_place: String(cell('lieu_depart_texte')) || null,
      destination_place: String(cell('lieu_arrivee_texte')) || null,
      origin_neighborhood: String(cell('quartier_depart')) || null,
      destination_neighborhood: String(cell('quartier_arrivee')) || null,
      origin_gps_precision: String(cell('precision_gps_depart')) || null,
      destination_gps_precision: String(cell('precision_gps_arrivee')) || null,
      origin_geocode: String(cell('geocodage_depart')) || null,
      destination_geocode: String(cell('geocodage_arrivee')) || null,
      availability_confirmed: false });
  }
  return { success: true, spreadsheet_id: book.getId(), sheet: sheet.getName(), records: records };
}
