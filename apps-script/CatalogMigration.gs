// Owner-only one-time migration. Do not expose this function in doPost.
// The source workbook is retained as an archive, never deleted or modified.
function gpCatalogMigrationPlan(destinationHeaders, destinationRows, sourceHeaders, sourceRows) {
  var required = ['gp_id','nom','ville_depart','ville_arrivee','date_depart','statut','source'];
  [destinationHeaders, sourceHeaders].forEach(function(headers) {
    if (required.some(function(key) { return headers.indexOf(key) < 0; }) ||
        headers.some(function(key, n) { return key && headers.indexOf(key) !== n; }))
      throw new Error('MIGRATION_HEADERS_INVALID');
  });
  var headers = destinationHeaders.slice();
  ['date_source','devise','capacite_kg','objets_acceptes','tarif_texte',
    'publication_request_id','publication_fingerprint'].forEach(function(key) {
      if (headers.indexOf(key) < 0) headers.push(key);
    });
  var ids = {};
  destinationRows.forEach(function(row) { ids[String(row[destinationHeaders.indexOf('gp_id')])] = true; });
  var rows = [];
  sourceRows.forEach(function(row) {
    var id = String(row[sourceHeaders.indexOf('gp_id')] || '');
    var source = String(row[sourceHeaders.indexOf('source')] || '');
    if (!/^FB_/.test(id) || !/^https:\/\/www\.facebook\.com\/groups\/[^/]+\/(?:permalink|posts)\/\d+\/$/.test(source) || ids[id]) return;
    ids[id] = true;
    rows.push(headers.map(function(key) { var n = sourceHeaders.indexOf(key); return n < 0 || row[n] == null ? '' : row[n]; }));
  });
  return { headers: headers, rows: rows };
}

function migrateBringMyPackCatalog() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('MIGRATION_BUSY');
  try {
    var book = SpreadsheetApp.openById(GP_PUBLICATION_SPREADSHEET);
    var target = book.getSheetByName(GP_PUBLICATION_SHEET);
    var source = SpreadsheetApp.openById('1Op5k1Leaxjwi0Oa3Ic2t572zaNzdXEyRzFaV3lRmIis').getSheetByName('GP_TRANSPORTEURS');
    if (!target || !source) throw new Error('MIGRATION_SHEET_MISSING');
    var old = target.getDataRange().getValues();
    var original = source.getDataRange().getValues();
    var headers = old[0].map(function(v) { return String(v).trim(); });
    var plan = gpCatalogMigrationPlan(headers, old.slice(1), original[0].map(function(v) { return String(v).trim(); }), original.slice(1));
    if (target.getMaxColumns() < plan.headers.length) target.insertColumnsAfter(target.getMaxColumns(), plan.headers.length - target.getMaxColumns());
    if (plan.headers.length > headers.length) {
      target.getRange(1, headers.length, 1, 1).copyTo(target.getRange(1, headers.length + 1, 1, plan.headers.length - headers.length), {formatOnly:true});
      target.getRange(1, headers.length + 1, 1, plan.headers.length - headers.length).setValues([plan.headers.slice(headers.length)]);
    }
    plan.rows.forEach(function(row) {
      target.appendRow(row.map(gpPublicationText));
      var n = target.getLastRow();
      ['date_depart','date_expiration','date_creation'].forEach(function(key) {
        var column = plan.headers.indexOf(key);
        if (column >= 0 && row[column] && typeof row[column].getTime === 'function') target.getRange(n, column + 1).setNumberFormat('yyyy-mm-dd');
      });
    });
    book.setName('BringMyPack — Catalogo principale');
    writeBringMyPackManagementGuide(book);
    SpreadsheetApp.flush();
    var savedIds = target.getRange(2, plan.headers.indexOf('gp_id') + 1, target.getLastRow() - 1, 1).getValues().map(function(row) { return String(row[0]); });
    if (plan.rows.some(function(row) { return savedIds.indexOf(String(row[plan.headers.indexOf('gp_id')])) < 0; })) throw new Error('MIGRATION_UNCONFIRMED');
    var report = {success:true, added:plan.rows.length, spreadsheet_id:book.getId(), sheet:target.getName(), old_workbook:'archive unchanged'};
    Logger.log(JSON.stringify(report));
    return report;
  } finally { lock.releaseLock(); }
}

function writeBringMyPackManagementGuide(book) {
  var guide = book.getSheetByName('GESTIONE');
  if (!guide) guide = book.insertSheet('GESTIONE', 0);
  else if (guide.getRange('A1').getValue() !== 'BringMyPack | Gestione') throw new Error('GESTIONE_ALREADY_EXISTS');
  var data = [
    ['BringMyPack | Gestione','',''],
    ['Una sola fonte per ricerca e pubblicazione. Controlla qui dove intervenire.','',''],
    ['Cosa modificare','Dove intervenire','Regola'],
    ['Usare il servizio','Chat-GP','È il punto di ingresso per utenti e GP.'],
    ['Annunci e viaggi','GP_TRANSPORTEURS, in questo file','Ricerca e pubblicazione usano questa scheda. Non rinominare le intestazioni.'],
    ['Contatti e richieste','Colonne contatti / EXPEDITEURS_COLIS','Non vengono restituiti nella ricerca pubblica.'],
    ['Comportamento della chat','Plugin Chat-GP → skills/instructions/SKILL.md','Modificare il plugin esistente; mantenere voce, pulsanti e conferma reale.'],
    ['Collegamento tecnico','BringMyPack — connessione tecnica','Serve Chat-GP. Non è un secondo assistente.'],
    ['Codice del servizio','Repository bringmypack/bring-proxy','Tutte le modifiche tecniche passano da GitHub.'],
    ['Destinazione del catalogo','lib/config.js + costanti Apps Script','I test devono confermare che ricerca e scrittura puntino allo stesso file.'],
    ['Salvataggio / lettura Google','Apps Script originale, deployment SuperSayan3','Aggiornare lo stesso deployment; conservare il suo URL.'],
    ['Rilascio del servizio','Vercel, progetto bring-proxy, branch main','Una push su main aggiorna il servizio. I plugin richiedono il proprio rilascio.'],
    ['Vecchio foglio','Archivio storico, fuori dal percorso live','Non aggiungere nuovi annunci nel vecchio file.'],
    ['Pagamenti','Non attivi','Nessuna promessa di pagamento protetto finché non viene attivato.'],
    ['Prima di ogni rilascio','Test + controllo dal connettore della chat','Verificare ricerca, pubblicazione, duplicati e dati privati.']
  ];
  guide.getRange(1,1,data.length,3).setValues(data).setWrap(true).setVerticalAlignment('top');
  guide.getRange('A1:C1').merge().setFontWeight('bold').setFontSize(16);
  guide.getRange('A2:C2').merge();
  guide.getRange('A3:C3').setFontWeight('bold').setBackground('#eeeeee');
  guide.setFrozenRows(3);
  guide.setColumnWidth(1,240); guide.setColumnWidth(2,430); guide.setColumnWidth(3,480);
  guide.autoResizeRows(1,data.length);
  var links = [[4,2,'Apri Chat-GP','https://chatgpt.com/plugins/plugin_afd8702427448191a47aee7911aab8ea'],
    [5,2,'Apri GP_TRANSPORTEURS','https://docs.google.com/spreadsheets/d/'+book.getId()+'/edit#gid='+book.getSheetByName(GP_PUBLICATION_SHEET).getSheetId()],
    [7,2,'Apri istruzioni Chat-GP','https://github.com/bringmypack/bring-proxy/blob/main/plugin/skills/instructions/SKILL.md'],
    [9,2,'Apri repository del servizio','https://github.com/bringmypack/bring-proxy'],
    [10,2,'Apri configurazione del servizio','https://github.com/bringmypack/bring-proxy/blob/main/lib/config.js'],
    [11,2,'Apri Apps Script originale','https://script.google.com/home/projects/1Wvw2p1Y0PMSEQ2sY5x2dRYzWJ7vSmho6Q1qBR9z28_nRQvxEfv-gxzlE/edit'],
    [12,2,'Apri progetto Vercel','https://vercel.com/bringmypack-s-projects/bring-proxy'],
    [13,2,'Apri archivio storico','https://docs.google.com/spreadsheets/d/1Op5k1Leaxjwi0Oa3Ic2t572zaNzdXEyRzFaV3lRmIis/edit']];
  links.forEach(function(link) { guide.getRange(link[0],link[1]).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(link[2]).setLinkUrl(link[3]).build()); });
}
