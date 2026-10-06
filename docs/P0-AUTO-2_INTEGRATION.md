# P0-AUTO-2 — branchement réel du runtime Automation

## État avant cette étape

`0006_automation_foundation.sql` avait créé `automation_outbox`, `automation_jobs`,
`automation_idempotency` et `automation_audit_ledger`. `foundation.ts` exposait
`DomainEvent`, `Queue`, `ScheduledJob`, `AutomationEngine` et
`InMemoryQueue`, mais les repositories PostgreSQL et le chemin d'exécution
n'étaient pas branchés. `OutboxRepository` était un port, les mutations
Application ne produisaient pas d'événements, et l'idempotence du moteur était
uniquement un `Set` mémoire. `NotificationEvent` et le contrat de scheduler J+3
restent des modèles/contrats, pas des services de notification ou de Cron.

## Mutation choisie et transaction

La mutation est la soumission déterministe d'une candidature :
`POST /api/v1/offers/:offerId/applications` → `applyToOffer`.

En composition PostgreSQL uniquement, après l'insertion d'une nouvelle
candidature, `ApplicationRepository` écrit `APPLICATION_SUBMITTED` via
`OutboxRepository.append` avec le même handle `SqlTransaction`. Le commit
valide les deux écritures; une exception avant commit les annule toutes les
deux. Une candidature déjà présente n'émet pas un nouvel événement. L'identité,
le statut initial `PENDING`, la note, la réponse API et les règles d'admissibilité
ne changent pas. Le mode DEMO/mémoire garde son comportement sans Outbox.

Clé stable : `application:<applicationId>:APPLICATION_SUBMITTED`.
Payload minimal : `applicationId`, `offerId`, `candidateId`, `employerId`.
Aucune règle `HIRED`/`CONTRACTED` ni aucune conséquence d'embauche n'est
ajoutée.

## Chaîne exécutable

```text
POST candidature (Worker/API)
  → PostgreSQL transaction: applications + automation_outbox
  → dispatchOutboxBatch: claim avec FOR UPDATE SKIP LOCKED
  → automation_queue durable (message_id = event_id)
  → AutomationWorker: claim → AutomationEngine
  → handler APPLICATION_SUBMITTED
  → automation_audit_ledger (effet unique event_id + action)
  → automation_idempotency COMPLETED
  → automation_queue ACKNOWLEDGED
```

Un crash entre `enqueue` et le marquage Outbox ne crée pas une deuxième ligne de
Queue : l'ID de message est l'ID Outbox et son payload est vérifié. Les claims
Outbox/Queue/Jobs possèdent un bail récupérable après expiration. Les erreurs
sont réessayées avec backoff; au-delà du nombre maximal d'essais, le message ou
le job est placé en dead-letter/FAILED.

Le handler actuellement branché est volontairement borné : il valide
l'agrégat `Application` puis écrit une trace d'audit. Il n'envoie pas de
notification, ne met à jour aucun autre agrégat et n'applique aucune nouvelle
règle métier.

## Repositories PostgreSQL

`src/backend/automation/postgresRepositories.ts` implémente les abstractions
existantes, sans recréer de port concurrent :

- `OutboxRepository` : append transactionnel, claim, livraison, retry/dead-letter;
- `Queue<T>` : enqueue dédupliqué, claim concurrent, acknowledge, retry;
- `ScheduledJobRepository` : create, claim dû, completion, retry/FAILED;
- `IdempotencyStore` du contrat existant de `productionContracts.ts` :
  réservation, replay, conflit, in-progress, release après erreur;
- `AuditLedgerRepository` : insert idempotent et lecture par `eventId`.

`foundation.ts` réutilise désormais le contrat `IdempotencyStore` déjà présent
dans `productionContracts.ts`; la définition parallèle qui figurait dans la
foundation a été supprimée.

`0006_automation_foundation.sql` n'a pas été réécrite. La migration additive
`0007_automation_runtime.sql` ajoute le bail de claim, la clé Outbox, la Queue
locale, `available_at` des jobs, le lease d'idempotence et les unicités de
déduplication.

## ScheduledJob local

`ScheduledJobWorker` réclame uniquement les jobs dont `dueAt` et `availableAt`
sont atteints. Le chemin testé est : création → job futur non claimé → claim à
l'échéance → échec `RETRYABLE` → retry → `COMPLETED`. La clé du job passe par le
même IdempotencyStore durable. `AUTOMATION_AUDIT` est le handler local neutre
utilisé pour cette vérification. Aucun Cron production n'est configuré.

## Lancement local

Après avoir appliqué les migrations, définir `AUTOMATION_DATABASE_URL` (ou
`DATABASE_URL` / `POSTGRES_CONNECTION_STRING`) dans l'environnement puis :

```sh
npm run automation:worker -- --once
npm run automation:worker -- --poll-ms=1000 --batch-size=20
```

Le mode continu s'arrête sur SIGINT/SIGTERM. Le processus utilise PostgreSQL
local; il ne dépend pas d'un binding Cloudflare Queue.

## Diagnostic `libpq.so.5` (environnement local)

Le binaire natif dépendant est `initdb` fourni par l'optionnelle
`@embedded-postgres/linux-x64` (PostgreSQL 17.10); `readelf -d` indique
`NEEDED libpq.so.5` et `RUNPATH $ORIGIN/../lib`. Cette distribution contient
`native/lib/libpq.so.5` (lien vers `libpq.so.5.17`), chargé depuis son propre
répertoire — le serveur `postgres` n'a pas besoin d'un `libpq` système.

Le blocage initial venait de l'installation incomplète des dépendances :
`npm install` s'arrêtait sur ERESOLVE, car `esbuild@^0.25.0` du projet ne
satisfaisait pas le peer optionnel exigé par Vite 8 (`^0.27.0 || ^0.28.0`).
Sans `node_modules`, le paquet natif optionnel et son `libpq.so.5` étaient
absents. `esbuild` est maintenant aligné sur `^0.27.0`; un `npm install`
standard installe les dépendances et le paquet natif sans ignorer les scripts
ou désactiver une vérification. Aucun `LD_LIBRARY_PATH` ad hoc, symlink système
ou contournement des scripts de vérification n'est utilisé. `apt-get update`
n'était pas joignable dans le sandbox; il n'est pas nécessaire puisque la
bibliothèque compatible est fournie par le binaire de test et son RUNPATH.

## Vérifications

- `npm test` exécute les tests de contrats mémoire et l'intégration SQL PGlite.
- `npm run verify:postgres` exécute aussi cette intégration sur PostgreSQL local
  17 réel, avec tests commit/rollback, claims concurrents, Queue, retries,
  ScheduledJob, idempotence et Audit Ledger.
- `npm run verify:workerd` soumet réellement une candidature via
  `wrangler dev --local`/workerd + Hyperdrive local, puis exécute le worker local
  contre le même PostgreSQL et vérifie Queue, audit et acknowledge.

Ces tests ne remplacent pas les vérifications Cloudflare distantes : aucune
Queue Cloudflare, aucun Cron production, aucune notification complète n'est
activé.

## Reste pour l'automatisation des contrats

Brancher les transitions `CONTRACT_*` dans l'Outbox de leur transaction métier,
choisir les événements et handlers contractuels idempotents, puis décider
séparément des effets autorisés (ex. vues/notifications). Les transitions
actuelles de contrat, l'offre `FILLED`, les candidatures `HIRED`/`CONTRACTED`,
les salaires, paiements, commissions et notifications restent inchangés et
hors de cette étape.
