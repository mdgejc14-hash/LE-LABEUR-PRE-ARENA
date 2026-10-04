# LE LABEUR — Production Backend Boundary

Date: 2026-10-04

Ce document formalise la prochaine frontière d'infrastructure sans modifier le MockRepository ni le design.

## 1. Identité serveur

Le navigateur ne constitue pas la source d'autorité pour `actorId` ou `actorRole`.

Flux cible :

`session/token serveur → ServerActor → autorisation → API → DB`

Les repositories actuels peuvent continuer à recevoir `actorId` pendant la phase mock. Lors du branchement production, l'adaptateur API doit remplacer cette identité par celle de la session authentifiée.

## 2. Pagination

Les collections à ne pas transférer intégralement au navigateur :

- offers
- applications
- contracts
- messages
- notifications
- payments
- incidents
- replacements

Contrat cible : `CursorPage<T> = items + cursor + limit + hasMore`.

Le filtrage/scoping doit être effectué côté serveur avant la pagination.

## 3. Idempotence

Les commandes suivantes nécessitent une `idempotencyKey` côté API :

- createOffer
- sendMessage
- sendProposal
- déclaration de paiement
- approval/rejection
- blocking/unblocking
- signature
- création de contrat

La clé est liée à l'acteur et à la commande. Une requête déjà terminée retourne le résultat enregistré au lieu de recréer l'objet métier.

## 4. Transactions

Les transitions suivantes doivent être atomiques en production :

- activation contrat + offre FILLED + candidature + historique + notifications
- vérification paiement + échéance + ledger + audit + notifications
- arbitrage incident + contrat + remplacement
- transfert remplacement + nouveau contrat + conversation + notifications
- blocage/déblocage + compte + paiement + audit + notification

`TransactionBoundary` décrit le point d'intégration sans simuler une transaction dans le mock.

## 5. Outbox / événements

Les notifications et événements dérivés des mutations transactionnelles doivent être publiés après validation de la transaction via une outbox persistante.

## 6. J+3

Aucun scheduler frontend ne doit être introduit.

Flux cible :

`scheduler backend → due schedules → événement idempotent → outbox/notification → blocking eligibility → audit log`

`ScheduleWorkerBoundary` formalise uniquement ce point d'intégration.

## 7. WebRTC / signaling

Le code frontend actuel conserve :

- `callId` canonique ;
- `CALL_REJECT` explicite ;
- état CONNECTED issu du WebRTC réel ;
- attente de `WebSocket.OPEN`.

La production doit remplacer le secret/token exposé au frontend par un credential court terme émis par le serveur. Le secret de signature reste côté Cloudflare Worker.

## 8. Géographie

La source nationale de référence doit rester officielle. Le projet ne doit afficher le référentiel comme complet que lorsque les compteurs atteignent les cibles nationales validées.

Sources officielles vérifiées le 2026-10-04 : INStaD et IGN-Bénin. La complétude des 5 295 localités n'a pas été intégrée dans cette phase car les documents détaillés officiels n'étaient pas récupérables dans l'environnement d'exécution sans risque de fabriquer les données.

## 9. Mock idempotency scope after final stabilization

The mock now accepts an optional `idempotencyKey` on `createOffer`, `sendMessage` and `sendProposal`.

When provided, the mock deduplicates a retry within the same `MockService` instance and rejects reuse of the same key with a different command payload. This is a test/stabilization aid only: the map is in-memory and is cleared by `resetAllData()`.

It is **not** a distributed or crash-safe guarantee. Production must replace this with a durable idempotency record/command table, scoped to the authenticated actor and command, protected by a uniqueness constraint and transaction.

## 10. Global/admin reads after final stabilization

The mock now requires actor identity for:

- `getProfile(id, actorId)` — ADMIN or the profile owner;
- `getRevenueMetrics(actorId)` — ADMIN only;
- `getAllAuditLogs(actorId)` — ADMIN only.

The future API must derive the actor from the server-authenticated session rather than accepting a browser-provided identity as authority.
