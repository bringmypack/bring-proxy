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

## Préparation Apify Free (20 octobre 2026)

Compte Free vérifié dans Console, limite mensuelle 5 USD de crédit. Deux essais terminés: 10 posts du groupe prioritaire (0,051 USD de crédit), puis 25 posts des cinq groupes publics (0,126 USD). Aucun abonnement payant activé.

Une tâche unique est enregistrée: cinq posts par groupe, ordre utilisateur, timeout 180 secondes et plafond 0,15 USD par exécution. La collecte est un échantillon récent, pas un historique exhaustif. Le groupe privé est exclu.

FacebookCloud.gs prépare un worker propriétaire désactivé par défaut. Il lit Apify avec une clé limitée à la lecture, traite une file sous lock, lit les images via OCR Google Drive, valide les dates et conserve les cas ambigus en révision. Aucune API de modèle de langage. Les placeholders « May be an image of text » ne sont pas de vrais textes OCR.

Activation en attente: autorisation explicite pour créer/transmettre une clé Apify de lecture dans les propriétés privées du projet Apps Script et pour le scope Google drive.file (documents OCR créés par le worker). La clé ne doit jamais entrer dans GitHub, la feuille ou les logs. Conserver les scopes historiques; ajouter seulement les scopes nécessaires au worker et à son déclencheur. Activer Drive API dans le projet Google associé avant le test OCR.

Après accord: configurer BMP_APIFY_READ_TOKEN et BMP_APIFY_TASK_ID dans Script Properties; tester OCR/import, puis définir BMP_FACEBOOK_OCR_AUTHORIZED=true et installer le déclencheur horaire via installFacebookCloudTrigger. Activer ensuite la planification Apify. L’ancien report ChatGPT doit être suspendu seulement après validation de ce parcours.

Les nouvelles feuilles FB_QUEUE et FB_OCR_CACHE seront créées au premier traitement autorisé. Le worker ne démarre aucun run Apify et ne peut donc pas augmenter la fréquence ou activer un plan payant. Le blocage du crédit Free reste le plafond final.
