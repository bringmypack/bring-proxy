# BringMyPack — dove intervenire

**Riordino preparato, non ancora attivato.** Serve l'accesso in modifica
dell'account proprietario `bringmypack@gmail.com` allo script e al foglio.
Il servizio live resta sulla configurazione precedente fino alla verifica
della migrazione. Questo ramo non deve essere promosso prima di quel passaggio.

## La struttura prevista

| Cosa vuoi modificare | Punto di intervento | Regola |
| --- | --- | --- |
| Usare il servizio | [Chat-GP](https://chatgpt.com/plugins/plugin_afd8702427448191a47aee7911aab8ea) | Unico ingresso per clienti e GP. |
| Dati dei viaggi | [Catalogo principale](https://docs.google.com/spreadsheets/d/1KJL7mAtWvrndgrHX_5NjfUciqVX0uMxL63T6XJnRFmE/edit), `GP_TRANSPORTEURS` | Ricerca e pubblicazione usano questo stesso foglio dopo l'attivazione. |
| Sapere dove intervenire | Scheda `GESTIONE` del catalogo principale | Creata dalla migrazione con collegamenti diretti. |
| Comportamento della chat | [Istruzioni](plugin/skills/instructions/SKILL.md) | Pubblicare anche l'aggiornamento del plugin esistente; Git da solo non aggiorna il plugin. |
| Collegamento di lettura | App esistente `BringMyPack — catalogue GP` | Componente tecnico di Chat-GP. Rinominare in `BringMyPack — connessione tecnica`. |
| Configurazione del servizio | [lib/config.js](lib/config.js) | Un solo file per destinazione e URL Apps Script lato servizio. |
| Regole di ricerca | [lib/catalog.js](lib/catalog.js), [api/catalogue.js](api/catalogue.js) | Solo proiezione pubblica; contatti esclusi. |
| Salvataggio e lettura Google | [GpPublication.gs](apps-script/GpPublication.gs) nello [script originale](https://script.google.com/home/projects/1Wvw2p1Y0PMSEQ2sY5x2dRYzWJ7vSmho6Q1qBR9z28_nRQvxEfv-gxzlE/edit) | Conservare il deployment `SuperSayan3` e il suo URL. |
| Card del viaggio | [lib/travel-card.js](lib/travel-card.js) | Pulsanti collegati a salvataggi reali. |
| Rilascio tecnico | [Vercel](https://vercel.com/bringmypack-s-projects/bring-proxy), branch `main` | Una push su `main` aggiorna il servizio. Non distribuire da cartelle locali non sincronizzate. |
| Vecchio foglio | [Archivio originale](https://docs.google.com/spreadsheets/d/1Op5k1Leaxjwi0Oa3Ic2t572zaNzdXEyRzFaV3lRmIis/edit) | Conservarlo. Dopo l'attivazione non aggiungere lì nuovi annunci. |

Due componenti collegati non sono due assistenti: **Chat-GP** contiene le
istruzioni e usa la connessione tecnica per cercare. `/mcp` serve la lettura;
`/api/mcp` serve la pubblicazione. Entrambi puntano allo stesso catalogo dopo
il rilascio. La connessione tecnica resta una dipendenza: non eliminarla
mentre è dichiarata in `.app.json` del plugin.

## Dati pubblici e dati interni

- Gli annunci Facebook importati conservano post fonte e incertezza sulla data.
- I viaggi pubblicati dalla chat sono ricercabili dopo il salvataggio confermato.
- Le righe storiche private non vengono pubblicate automaticamente.
- Telefoni, richieste, coordinate GPS, chiavi di pubblicazione e dati di matching
  non escono nella risposta di ricerca.
- Un viaggio BringMyPack può avere un ID senza un URL pubblico. Non inventare un
  link o una trasmissione del contatto. La messa in relazione va implementata
  prima di prometterla.
- I pagamenti non sono attivi.

## Attivare il riordino

1. Con l'account proprietario, aprire il progetto Apps Script originale.
2. Sostituire la sezione `GpPublication.gs` con il file del ramo; aggiungere
   `CatalogMigration.gs` come file distinto. Conservare il codice precedente
   e non copiare chiavi o credenziali nel repository.
3. Nel `doPost`, aggiungere soltanto:
   `case 'readPublicCatalog': return jsonResponse(readPublicCatalog());`.
   Le tre azioni di pubblicazione restano invariate. La migrazione non deve
   essere esposta via HTTP.
4. Nel vecchio helper `getSheet`, sostituire `getActiveSpreadsheet()` con
   `openById(GP_PUBLICATION_SPREADSHEET)` per tenere anche le azioni storiche
   sul catalogo principale.
5. Eseguire `migrateBringMyPackCatalog` dall'editor. È idempotente: aggiunge
   solo gli ID Facebook mancanti, conserva le altre righe, rinomina il file e
   crea la scheda `GESTIONE`. Verificare il report senza stampare i contatti.
6. Aggiornare **lo stesso deployment** `SuperSayan3`; verificare le capacità,
   l'ID del file e `readPublicCatalog` prima della promozione su `main`.
7. Eseguire `npm test`, promuovere il ramo e verificare ricerca e pubblicazione
   dagli strumenti della chat. Non inserire viaggi fittizi nel catalogo live.
8. Pubblicare l'overlay `plugin/` sullo stesso plugin, controllando la release
   corrente. L'overlay omette volutamente gli asset e i collegamenti invariati;
   non è un plugin completo da installare come copia.
9. Rinominare l'app tecnica dalle impostazioni ChatGPT, mantenendo il suo ID.
   Aggiornare qui lo stato solo dopo la verifica live.

I test comprendono salvataggio → lettura pubblica → ricerca dello stesso ID,
duplicati, filtri di direzione/data e isolamento dei contatti.
