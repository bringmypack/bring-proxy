# Raccolta Facebook BringMyPack

Stato verificato il 20 ottobre 2026: raccolta Apify attiva ogni giorno alle 09:00 Europe/Paris e importatore Google proprietario attivo ogni ora. Funziona con i PC spenti. Il vecchio report ChatGPT è sospeso. Non sono necessarie chiamate a modelli AI per raccogliere, leggere le locandine o importare.

## Dove intervenire

| Cosa | Fonte unica |
| --- | --- |
| Guida operativa e collegamenti | Scheda GESTIONE del catalogo principale |
| Gruppi, ordine e visibilità | [facebook-sources.json](../config/facebook-sources.json), scheda FB_SOURCES |
| Orario della raccolta | [Pianificazione Apify](https://console.apify.com/schedules/DnRh5NZt669Yc1h4P#/settings) |
| Numero di post e limite di credito | [Task Apify](https://console.apify.com/actors/tasks/fFNcqXiDObbQxFkd5/input) |
| Worker, OCR, salvataggio e pausa | [FacebookCloud.gs](../apps-script/FacebookCloud.gs), progetto Apps Script originale |
| Diagnosi, audit e trattamento manuale della coda | [FacebookCloudAuth.gs](../apps-script/FacebookCloudAuth.gs) |
| Parser deterministico | [facebook-extract.js](../lib/facebook-extract.js), incorporato nel worker |
| Annunci incerti e motivi | FB_REVIEW |
| Coda / testi delle immagini | FB_QUEUE / FB_OCR_CACHE |
| Esecuzioni e contatori | FB_RUNS |
| Annunci ricercabili, quartieri e GPS | GP_TRANSPORTEURS |
| Comportamento della chat | [Istruzioni Chat-GP](../plugin/skills/instructions/SKILL.md), versione 0.73.0 |

Progetto originale: [Apps Script](https://script.google.com/u/6/home/projects/1Wvw2p1Y0PMSEQ2sY5x2dRYzWJ7vSmho6Q1qBR9z28_nRQvxEfv-gxzlE/edit). Catalogo unico: [Google Sheets](https://docs.google.com/spreadsheets/d/1KJL7mAtWvrndgrHX_5NjfUciqVX0uMxL63T6XJnRFmE/edit). Codice: questo repository. Il worker è proprietario: non cambia l'URL del deployment HTTP esistente e non espone un importatore anonimo.

## Raccolta e costi

Il gruppo gpfrancesenegal ha sempre priorità. Seguono gli altri gruppi nell'ordine dell'utente. Sono raccolti fino a cinque post recenti per ciascuno dei cinque gruppi pubblici. Il sesto gruppo, 226193057954981, è privato ed escluso. La raccolta non è una lettura integrale della cronologia e può non rilevare annunci pubblicati tra due campioni.

Una sola task fFNcqXiDObbQxFkd5, una sola pianificazione DnRh5NZt669Yc1h4P: cron 0 9 * * *, Europe/Paris, prossima partenza verificata 21 ottobre 2026 alle 09:00. Timeout 180 secondi, tetto 0,15 USD di credito per esecuzione, nessuna sovrapposizione. Account Free, nessun abbonamento a pagamento attivato. Credito 5 USD al mese; ciclo verificato 20 ottobre–19 novembre UTC, prossimo rinnovo 20 novembre. Credito inutilizzato non cumulabile. Due prove precedenti: 0,051 USD per 10 post; 0,126 USD per 25 post. Non aumentare frequenza o volume senza riesaminare il budget.

Google legge l'ultima esecuzione riuscita della task con una chiave limitata a Read / List runs per questa sola task e accesso ai suoi default run storages. Nessun permesso Run, Write o accesso completo all'account. BMP_APIFY_READ_TOKEN resta esclusivamente nelle proprietà private Apps Script; mai in foglio, repository, URL o log. La task è selezionata da BMP_APIFY_TASK_ID.

## Importatore e controlli

Consenso del proprietario Google completato: Sheets, richieste esterne, gestione del proprio trigger e drive.file per i documenti OCR creati dal worker. Drive v3 è abilitato. BMP_FACEBOOK_OCR_AUTHORIZED e BMP_FACEBOOK_CLOUD_ENABLED sono true. Un solo trigger orario syncFacebookCloud è installato. installFacebookCloudTrigger lo riutilizza; pauseFacebookCloud sospende il worker senza cancellare dati.

Ogni esecuzione tratta fino a tre post e otto immagini. La coda viene smaltita progressivamente dopo la raccolta delle 09:00; il catalogo completo non è pronto istantaneamente alle 09:00. OCR Google Drive in cache; documenti temporanei spostati nel cestino dopo la lettura. Numeri di telefono redatti nei testi conservati. Solo immagini pubbliche di Facebook sui domini CDN ammessi; nessun cookie del browser esportato.

Le celle post_id e image_id hanno prefissi testuali per impedire l'arrotondamento dei lunghi numeri Facebook. Le righe legacy della coda recuperano gli ID esatti dal JSON del post o dal link originale. Dedupe per post + tratta + data; i viaggi distinti dello stesso post restano separati. La deduplica tra gruppi dipende anche dal nome operatore e non riconosce ogni possibile variante di un annuncio.

Sotto lock condiviso, l'importatore mappa le colonne per intestazione e verifica ogni ricevuta di salvataggio. Il parser richiede direzione e data con anno espliciti e coerenti. Date contraddittorie, indirizzi non assegnabili e tratte non riconosciute restano in FB_REVIEW. Non inventa capacità, disponibilità o anno. Un salvataggio non verifica l'identità del GP. Le offerte importate restano A_VERIFIER.

## Verifica iniziale del 20 ottobre (prima del miglioramento)

- Corretto il blocco Apify: prima task HTTP 200 e dataset HTTP 403; ora entrambi HTTP 200.
- 25 pubblicazioni lette e trattate, 25 ID unici esatti, nessun PENDING, un solo trigger orario.
- Tutte e 25 in FB_REVIEW: 9 ADDRESS_REVIEW_REQUIRED, 6 DATE_ROUTE_AMBIGUOUS, 10 ROUTE_REQUIRED. Nessuna nuova riga GP prodotta da questo campione. La connessione risolta non significa che ogni locandina sia automaticamente interpretabile.
- Test reale del salvataggio sui tre annunci già verificati: added=0, duplicates=3, nessuna nuova riga.
- Ripetizione reale di syncFacebookCloud a coda vuota: added=0, queued=0, review=0, ocr=0.
- Audit del replay: nessun post della raccolta manca nella coda; ID testuali verificati.
- Prova OCR reale precedente: 197 caratteri redatti, seconda lettura cached=true. Nessuna promessa di accuratezza per tutte le immagini.
- 52 test superati, inclusi collisioni da arrotondamento Sheets e riuso cache OCR senza rete.

Tre annunci già verificati restano ricercabili: Alioune Sylla Paris–Dakar 21 ottobre; Mme Diaw — GP la Confiance Paris–Dakar 21 ottobre, 10 EUR/kg; Niany GP Travel International Lyon–Dakar 23 ottobre (anno 2026). Fonti e prove in [facebook-verified-2026-10-20.json](../data/facebook-verified-2026-10-20.json). Quattro offerte del batch manuale restano anch'esse in revisione.

## Quartieri e GPS

Le città restano in ville_depart / ville_arrivee. Quartieri e luoghi sono nelle colonne dedicate da AE; latitudine/longitudine nelle colonne esistenti, mappate per intestazione. precision_gps_depart / precision_gps_arrivee e geocodage_depart / geocodage_arrivee dichiarano il luogo effettivamente riconosciuto e la precisione. Il centro di un quartiere non è il punto di consegna. Unité 25 non localizzata univocamente conserva il testo e l'eventuale area più ampia dichiarata.

La ricerca riconosce località pubbliche e restituisce la precisione disponibile. Non calcola ancora distanze né ordina dal GP più vicino. Date flessibili aumentano le possibilità senza garantire disponibilità. Pagamenti ancora di prova: nessuna promessa commerciale di fondi protetti finché il servizio non è attivato.

## Amélioration du lecteur, 20 octobre 2026

Version 2026-10-20.2 : trajets sans tiret, dates JJ-MM-AAAA, en-têtes répétés, adresses explicites et points de dépôt multiples. Une adresse ne bloque plus tout le voyage lorsque son rattachement est clair. Les lieux et indications de transport sont conservés; plusieurs dépôts restent sans point GPS unique. Pour une adresse géocodée, le numéro et le code postal doivent correspondre aux composants renvoyés par Google, avec précision adresse. Une année manquante, une direction indéterminée ou un départ récurrent ne deviennent pas un voyage daté inventé.

Chaque version du lecteur remet une seule fois les erreurs de lecture admissibles dans la file. Les échecs techniques et les lignes déjà traitées ne sont pas rouverts. Les lignes FB_REVIEW résolues sont conservées et marquées IMPORTED_TO_CATALOGUE ou DUPLICATE_IN_CATALOGUE. Le préfixe descriptif « Annonce de » est ignoré pour comparer les noms lors de la déduplication entre groupes.

Corpus de régression : 25 publications publiques, contacts masqués et URL CDN remplacées. 11 publications lisibles, 14 encore à vérifier. Après déduplication avec les trois voyages déjà importés : 2 nouveaux voyages et 9 doublons attendus. 58 tests passent. Retraitement cloud réel terminé : 2 voyages enregistrés aux lignes 25 et 26, 9 doublons écartés, 14 publications encore en révision (8 sans date/année complète, 4 départs récurrents, 2 trajets non reconnus). Aucun nouvel OCR; le cache existant a suffi. Les deux nouvelles annonces sont retrouvées par les outils Chat-GP dans les deux sens pour le 21 octobre 2026. Un seul déclencheur horaire reste actif. Les quatre dossiers du batch manuel initial sont distincts de ce bilan.

Deuxième exécution réelle de la maintenance : added=0, duplicates=0, review=0, queued=0, ocr=0, requeued=0; aucun retraitement répété. Audit : DONE=11, REVIEW=14, 25 ID uniques, un seul déclencheur horaire actif.
