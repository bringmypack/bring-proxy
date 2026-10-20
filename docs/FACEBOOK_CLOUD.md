# Raccolta Facebook BringMyPack

Stato al 20 ottobre 2026: ricerca pubblica cloud attiva; importazione nel catalogo
non attiva. Le scritture del connettore Google corrente sono state rifiutate
con 403 PERMISSION_DENIED. Nessun nuovo annuncio è stato aggiunto da questa raccolta.

## Dove intervenire

- Elenco unico e priorità: [facebook-sources.json](../config/facebook-sources.json).
- Risultati iniziali da verificare: [facebook-review-2026-10-20.json](../data/facebook-review-2026-10-20.json).
- Controlli di preparazione dell'importazione: [facebook-import.js](../lib/facebook-import.js).
- Attività cloud esistente, ora chiamata “BringMyPack — ricerca nei 6 gruppi”.
- Catalogo finale: GP_TRANSPORTEURS nel file configurato in lib/config.js.

Il gruppo di Fabio, gpfrancesenegal, è sempre il primo.
Seguono 1430214083851753, 707572670955137, 2109180682722375,
320004609170313 e 226193057954981, nell'ordine fornito.
Non aggiungere altre fonti implicitamente.

## Cosa gira nel cloud

È stata riattivata l'attività quotidiana già esistente, nella finestra mattutina
intorno alle 09:00 Europe/Paris. Cerca i post pubblici indicizzati nei sei gruppi,
in entrambi i sensi Francia–Senegal, produce un report e distingue dati verificati,
estratti e possibili duplicati. I PC possono essere spenti.
Richiesta anche un'esecuzione immediata: la richiesta non prova che sia completata.
L'altra vecchia attività “Richieste GP quotidiane” resta sospesa.

Questa è una ricerca pubblica periodica, non una lettura completa dei feed.
L'accesso diretto ai primi tre gruppi nel browser disponibile richiede login.
Per il gruppo 226193057954981 l'indice consultato mostra anche contenuti storici.
Un risultato recente del motore può includere testo di altri post: la data del
risultato non prova la data del viaggio.

## Importazione da completare

1. Ricollegare Google Drive con il proprietario bringmypack@gmail.com o un account
   già autorizzato a modificare il catalogo, mantenendo il file e i permessi attuali.
2. Collegare un lettore cloud autorizzato alle fonti; verificare copertura, costi
   e accessibilità effettiva. Un login sul PC non è un collector cloud.
3. Aprire ogni post originale e verificare operatore, direzione e anno.
   Salvare gli estratti non verificati in una coda FB_REVIEW, fuori dal catalogo.
4. Usare planFacebookImport per preparare le righe con intestazioni lette dal file,
   solo offerte future con data e fonte verificate. Le righe restano A_VERIFIER:
   la pubblicazione di un annuncio non conferma la disponibilità.
5. Scrivere con un unico percorso autenticato e serializzato, ricontrollando gli ID
   sotto lock. Il pianificatore puro non garantisce da solo la concorrenza.
   Non usare publish_departure per impersonare un autore Facebook.
6. Verificare la ricevuta e la ricerca dal connettore. Solo allora abilitare
   l'importazione nella configurazione e aggiornare l'attività cloud.

Il helper non scrive. Deduplica URL/ID, segnala cross-post possibili, dà priorità
al gruppo di Fabio, blocca anni incerti e contatti, conserva i testi come valori.
Serve ancora il collegamento autenticato di scrittura, il lock e il registro
persistente delle importazioni. Non esporre un endpoint anonimo di importazione.

## Prima raccolta

Ricerca effettuata su tutti i sei gruppi. Conservati sei candidati non verificati
nel file di revisione, comprendenti possibili cross-post.
Tra le piste: Mme Diaw Paris–Dakar 21 ottobre e Niany Lyon–Dakar 23 ottobre.
Sono estratti da verificare, non nuove disponibilità confermate.
Nessun contatto privato copiato nel repository.
