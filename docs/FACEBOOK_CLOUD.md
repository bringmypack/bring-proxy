# Raccolta Facebook BringMyPack

Stato al 20 ottobre 2026: ricerca pubblica cloud attiva; verifica tramite Chrome del proprietario riuscita. Importati tre annunci pubblici originali nel catalogo principale, righe 22–24. La verifica riguarda i post recenti visibili, non l'intera cronologia dei gruppi.

## Dove intervenire

| Cosa | Fonte unica |
| --- | --- |
| Gruppi, ordine e visibilità | [facebook-sources.json](../config/facebook-sources.json), scheda FB_SOURCES |
| Annunci con data/anno incerti | FB_REVIEW |
| Importazioni e ricevute | FB_RUNS |
| Annunci ricercabili, quartieri e GPS | GP_TRANSPORTEURS |
| Procedura proprietario | [FacebookImport.gs](../apps-script/FacebookImport.gs) nello script originale |
| Comportamento della chat | [Istruzioni Chat-GP](../plugin/skills/instructions/SKILL.md), versione 0.73.0 |

Il gruppo gpfrancesenegal ha sempre priorità. Seguono i cinque gruppi nell'ordine dell'utente. Il sesto, 226193057954981, è privato: i suoi contenuti non entrano nel catalogo pubblico.

## Risultati verificati

- Alioune Sylla, Paris–Dakar, 21 ottobre 2026.
- Mme Diaw — GP la Confiance, Paris–Dakar, 21 ottobre 2026, 10 EUR/kg. Località: Vitry-sur-Seine e Parcelles Assainies unité 25.
- Niany GP Travel International, Lyon–Dakar, 23 ottobre 2026; ultimo deposito 22 ottobre.

Le fonti e l'evidenza delle date sono in [facebook-verified-2026-10-20.json](../data/facebook-verified-2026-10-20.json). Quattro offerte restano in revisione per anno assente o data contraddittoria. Il post Symantec contiene due tratte: la procedura assegna un ID a ciascun viaggio, senza duplicarli ai tentativi successivi.

Le righe importate restano A_VERIFIER: è stato verificato il contenuto della fonte, non identità, capacità residua o disponibilità del GP. Nessun telefono copiato nel repository o restituito dalla ricerca.

## Quartieri e GPS

Le città restano in ville_depart / ville_arrivee. Il testo della località e il quartiere hanno colonne dedicate da AE. Le coordinate restano nelle colonne esistenti lat_depart/lng_depart e lat_arrivee/lng_arrivee, mappate per intestazione.

precision_gps_depart / precision_gps_arrivee distinguono città, comune, quartiere approssimativo e indirizzo. geocodage_depart / geocodage_arrivee conservano il luogo effettivamente riconosciuto. Un centro di quartiere non è il punto preciso di consegna. Per unité 25, se la mappa non identifica il luogo in modo univoco, l'eventuale centro di Parcelles Assainies è dichiarato come area più ampia. I dati ambigui restano da verificare.

La ricerca riconosce anche i nomi delle località pubbliche e restituisce la precisione disponibile. Non calcola ancora distanze né un ordinamento dal GP più vicino. Chat-GP propone le date flessibili senza allargare una data ferma senza accordo.

## Cosa gira nel cloud

L'attività esistente “BringMyPack — ricerca nei 6 gruppi” produce una ricerca/report dei post pubblici indicizzati, ogni mattina intorno alle 09:00 Europe/Paris, anche con i PC spenti. Non legge integralmente i feed e non importa automaticamente nel foglio.

Il connettore Google continua ad avere scritture rifiutate con 403. L'accesso proprietario in Chrome permette l'importazione manuale verificata tramite Apps Script; non trasferisce l'autenticazione al collector cloud.

Per completare la raccolta automatica servono un lettore cloud autorizzato, copertura delle fonti verificata e una connessione cloud di scrittura funzionante. Non esportare cookie del browser, non esporre un importatore anonimo e non promettere copertura completa.

## Procedura operativa

1. Aprire il post originale pubblico; verificare direzione, data, anno e luoghi.
2. Aggiornare il batch verificato nello stesso FacebookImport.gs, conservandolo in GitHub.
3. Eseguire importVerifiedFacebookBatch dall'editor proprietario. Lock, intestazioni, deduplica e ricevute sono controllati.
4. Per completare solo località mancanti dello stesso batch, eseguire completeVerifiedFacebookLocations.
5. Controllare FB_RUNS e la ricerca dal connettore. Il planner puro non sostituisce il lock.
6. Se cambia la proiezione pubblica Google, aggiornare lo stesso deployment SuperSayan3, conservando l'URL.
