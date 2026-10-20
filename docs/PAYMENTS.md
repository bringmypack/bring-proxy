# Pagamento dopo consegna — prototipo di test

Stato: prototipo di dominio e Checkout di test, NON servizio di pagamento attivo.
Nessun denaro reale incassato o trasferito. payments resta false negli strumenti.
Non è stato aggiunto un endpoint di pagamento al servizio pubblico.

## Messaggio di riferimento

Mantra da usare dopo l'attivazione verificata:
**Vous payez. Le destinataire confirme la livraison. Le GP est payé.**

Dopo la messa in relazione, una sola azione principale:
“Choisir le paiement protégé BringMyPack”.

Testo previsto:
“Vous payez en ligne. Les fonds restent auprès de notre prestataire de paiement
et sont versés au voyageur après confirmation de la livraison par le destinataire,
selon les conditions du service.”

Prima dell'attivazione: “Paiement avec versement au voyageur après confirmation
de livraison : fonctionnalité en préparation.”
Ne pas parler d'assurance, de garantie absolue ou de compte séquestre juridique.
Le message final dépend du contrat et du flux de fonds validés avec le prestataire.

## Architecture retenue pour le prototype

Contrat de transport accepté → Checkout → paiement confirmé par webhook signé →
attente de livraison → confirmation du destinataire authentifié avec preuve
à usage unique → contrôle des contestations et de l'éligibilité du GP →
transfert distinct et idempotent.

Le transfert n'est jamais automatique au paiement. Le prototype prépare une
requête de transfert mais ne l'exécute pas.
Pas de transfert sur la seule déclaration du voyageur ni à expiration d'un délai.
Les frais doivent être convenus explicitement; les montants des tests ne sont
pas un tarif commercial.

## Code et vérifications

- [payments-prototype.js](../lib/payments-prototype.js): accord test, préparation
  Checkout sans destination automatique, validation du webhook via client SDK
  fourni par un futur adaptateur serveur, preuve du destinataire, blocage des
  litiges/remboursements et préparation idempotente d'un transfert test.
- [payments.test.mjs](../tests/payments.test.mjs): tests locaux avec faux client SDK.
  Ils ne prouvent pas un paiement ou transfert réel.
- Compte TEST sélectionné par le propriétaire.
- Stripe a créé une session Checkout de test; identifiants internes omis.
  Montant fictif 1 EUR, livemode=false, payment_status=unpaid.
  Aucun formulaire complété. Expiration automatique le 21 octobre 2026.
  Les URL de retour pointent vers le service existant pour ce diagnostic;
  les pages de retour client restent à construire.
- Guide Stripe préparé, non finalisé.
  Les décisions commerciales et de responsabilité ne sont pas validées.

## Ce qui manque avant un pilote de bout en bout

1. Société exploitante/pays et pays de résidence bancaire des GP, avec validation
   du prestataire. Ne pas déduire le pays bancaire de la route du colis.
   La documentation actuelle ne permet pas de présumer un versement Connect
   standard vers un compte sénégalais depuis une plateforme européenne.
2. Commission, conditions de transport, litiges, annulations et remboursements.
   La responsabilité financière de la plateforme doit être acceptée par Fabio,
   pas automatiquement par un assistant.
3. Onboarding Connect hébergé/embarqué et vérification effective de la capacité
   à recevoir des transferts. Ne pas demander de pièces ou coordonnées bancaires
   dans la chat.
4. Authentification expéditeur/destinataire/GP et stockage transactionnel privé
   pour contrats, états, événements uniques, preuves et journal des opérations.
   Le classeur public de recherche ne doit pas stocker les secrets de paiement.
5. Client SDK Stripe serveur, clé restreinte et secret webhook dans la configuration
   sécurisée du serveur; vérification des signatures sur le corps brut.
   Pas de clé dans Git, dans un lien ou dans la conversation.
6. Adaptateur webhook durable: checkout.session.completed et
   checkout.session.async_payment_succeeded seulement si payment_status=paid.
   Résoudre le PaymentIntent/Charge auprès de Stripe; vérifier montant, devise,
   session et contrat. Traiter aussi échecs, remboursements et litiges.
7. Adaptateur de transfert: verrou transactionnel, reprise après timeout avec
   même clé et rapprochement du registre durable. Relire charge, remboursements,
   contestations, disponibilité et compte destinataire avant de transférer.
   Ne pas appeler le générateur de requêtes comme une autorisation suffisante.
8. Tester cartes réussies/refusées, paiement asynchrone, webhook rejoué/désordonné,
   mauvaise preuve, GP non éligible, remboursement et litige avant/après transfert.
   Ne jamais activer les vrais paiements avant ces validations.

## Sources officielles consultées le 20 octobre 2026

- https://docs.stripe.com/connect/separate-charges-and-transfers
- https://docs.stripe.com/connect/cross-border-payouts
- https://docs.stripe.com/connect/manual-payouts

Stripe ne fournit pas de compte séquestre juridique. Les possibilités de versement
et délais applicables doivent être vérifiés pour la configuration retenue.
