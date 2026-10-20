# BringMyPack - dove intervenire

**Riordino attivo dal 20 ottobre 2026.** Ricerca e pubblicazione usano lo stesso
catalogo Google. Chat-GP è aggiornato alla versione 0.72.0; lo script originale
usa il deployment SuperSayan3, versione 59. Il codice del servizio è su main.

## La struttura

| Cosa vuoi fare | Punto di intervento | Regola |
| --- | --- | --- |
| Usare il servizio | [Chat-GP](https://chatgpt.com/plugins/plugin_afd8702427448191a47aee7911aab8ea) | Ingresso per clienti e GP. |
| Sapere dove intervenire | [Scheda GESTIONE](https://docs.google.com/spreadsheets/d/1KJL7mAtWvrndgrHX_5NjfUciqVX0uMxL63T6XJnRFmE/edit#gid=26110328) | Guida centrale con i collegamenti diretti. |
| Dati dei viaggi | [Catalogo principale](https://docs.google.com/spreadsheets/d/1KJL7mAtWvrndgrHX_5NjfUciqVX0uMxL63T6XJnRFmE/edit), GP_TRANSPORTEURS | Destinazione unica della pubblicazione e fonte della ricerca. |
| Comportamento della chat | [Istruzioni](plugin/skills/instructions/SKILL.md) | Pubblicare anche l'aggiornamento del plugin esistente; Git da solo non aggiorna il plugin. |
| Collegamento di lettura | [BringMyPack — connessione tecnica](https://chatgpt.com/settings/plugins-settings/plugin_asdk_app_6ad5eb52ae9c8191ae77eee2c69edae5) | Dipendenza di Chat-GP, mantenuta con lo stesso ID. |
| Configurazione del servizio | [lib/config.js](lib/config.js) | Un solo file per destinazione e URL Apps Script lato servizio. |
| Regole di ricerca | [lib/catalog.js](lib/catalog.js), [api/catalogue.js](api/catalogue.js) | Solo dati pubblici; contatti esclusi. |
| Salvataggio e lettura Google | [GpPublication.gs](apps-script/GpPublication.gs) nello [script originale](https://script.google.com/home/projects/1Wvw2p1Y0PMSEQ2sY5x2dRYzWJ7vSmho6Q1qBR9z28_nRQvxEfv-gxzlE/edit) | Aggiornare lo stesso deployment SuperSayan3 e conservarne l'URL. |
| Card del viaggio | [lib/travel-card.js](lib/travel-card.js) | Pulsanti collegati a salvataggi reali. |
| Rilascio tecnico | [Vercel](https://vercel.com/bringmypack-s-projects/bring-proxy), branch main | Una push su main aggiorna il servizio. |
| Vecchio foglio | [Archivio originale](https://docs.google.com/spreadsheets/d/1Op5k1Leaxjwi0Oa3Ic2t572zaNzdXEyRzFaV3lRmIis/edit) | Conservato, fuori dal percorso attivo. Non aggiungervi nuovi annunci. |

Chat-GP contiene le istruzioni e usa la connessione tecnica per cercare.
I due elementi hanno ruoli diversi: il punto di ingresso è Chat-GP.
La connessione tecnica resta necessaria finché è dichiarata in .app.json.

Il servizio [bring-proxy-eta.vercel.app](https://bring-proxy-eta.vercel.app)
espone /mcp per la ricerca e /api/mcp per la pubblicazione.
Entrambi usano il catalogo principale attraverso lo script originale.
Un 404 sulla sola pagina iniziale non indica un guasto degli strumenti.

## Dati e verifiche

- Migrati i due annunci Facebook pubblici mancanti, conservando ID e post fonte.
- Le righe storiche private sono conservate e non pubblicate automaticamente.
- I viaggi salvati dalla nuova procedura Chat-GP diventano ricercabili.
- Telefoni, coordinate GPS, identificatori delle richieste e dati di matching
  sono esclusi dai risultati della ricerca.
- Gli annunci hanno disponibilità da confermare. Un annuncio BringMyPack può
  avere un ID senza URL pubblico: non inventare link o invii del contatto.
- I pagamenti non sono attivi.

Verifica live del 20 ottobre: connessione riuscita e ricerca Paris–Dakar dal
20 al 31 ottobre riuscita dal connettore della chat, con un annuncio restituito.
I 21 test automatici comprendono salvataggio, lettura pubblica e ricerca dello
stesso ID, duplicati, filtri e isolamento dei contatti. Nessun viaggio fittizio
è stato inserito nel catalogo live.

## Aggiornamenti successivi

1. Modificare il codice nel repository e avviare npm test.
2. Se cambia il backend Google, aggiornare i file distinti già presenti
   nello script originale: Code.gs, GpPublication.gs e CatalogMigration.gs.
   Conservare le funzioni storiche e non copiare chiavi nel repository.
3. Aggiornare lo stesso deployment SuperSayan3. Verificare capacità, ID del
   catalogo e lettura pubblica prima di distribuire modifiche dipendenti.
4. Promuovere le modifiche del servizio su main e controllare il rilascio Vercel.
5. Se cambiano le istruzioni, pubblicare plugin/ come aggiornamento dello stesso
   Chat-GP. È un overlay: gli asset e i collegamenti omessi vanno conservati.
6. Verificare dagli strumenti della chat connessione, ricerca e validazione
   della pubblicazione. Non inserire annunci fittizi nel catalogo live.

CatalogMigration.gs serve alla migrazione e alla guida GESTIONE: non è esposto
via HTTP e non va eseguito per ogni pubblicazione. La migrazione iniziale è
già completata; l'archivio originale è rimasto invariato.

## Raccolta Facebook e pagamento dopo consegna

- [Stato della raccolta cloud](docs/FACEBOOK_CLOUD.md): sei gruppi, il gruppo di Fabio sempre per primo; ricerca pubblica quotidiana riattivata. Importazione manuale verificata tramite Apps Script; import automatico cloud ancora da collegare.
- [Elenco unico delle fonti](config/facebook-sources.json).
- [Candidati da verificare](data/facebook-review-2026-10-20.json): estratti iniziali, separati dal batch originale verificato.
- [Pagamento dopo consegna](docs/PAYMENTS.md): prototipo solo test; nessun incasso o trasferimento reale.

Aggiornamento 20 ottobre: tre annunci originali salvati nelle righe 22–24; schede FB_SOURCES, FB_REVIEW e FB_RUNS create. Quartieri e GPS con precisione esplicita; Chat-GP 0.73.0 propone date flessibili. La ricerca per località non calcola ancora distanze.
