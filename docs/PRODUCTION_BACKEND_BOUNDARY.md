# LE LABEUR — Frontière backend production (Phase 1)

**Date :** 2026-10-04
**Périmètre :** contrats, adaptateurs et frontières uniquement. Aucune base de données, aucun fournisseur externe, aucun Worker de notifications ou Cron n’est activé dans cette phase.

## 1. Architecture visée

```text
Application React/Vite (publique et Admin)
        │ requêtes same-origin /api/v1, cookie de session
        ▼
Cloudflare Worker — API, validation, identité serveur, RBAC
        │
        ├── PostgreSQL via Cloudflare Hyperdrive
        ├── R2 — binaires des documents et justificatifs
        ├── Outbox PostgreSQL → Queue → Workers consommateurs
        ├── Cron Worker → échéances J+3
        └── Worker signaling → Durable Object WebSocket

Service MCP interne, ultérieur → mêmes services et mêmes autorisations
```

Les écrans ne connaissent ni PostgreSQL, ni Hyperdrive, ni R2. L’API publique prévue est versionnée sous `/api/v1`. En production, le navigateur et l’API partagent une origine; en développement, Vite pourra proxyfier `/api` vers le Worker local. Aucune URL `localhost` ne doit être appelée depuis le navigateur.

## 2. État de cette phase

- `MockService` n’est ni supprimé ni modifié. Il continue de satisfaire les interfaces de `src/repositories/interfaces.ts`.
- `src/repositories/provider.ts` fournit une frontière remplaçable. L’application choisit actuellement le mock; une sélection API sans adapter fourni échoue au lieu de retomber silencieusement sur la démo.
- `src/context/AppContext.tsx`, `AdminDashboardScreen.tsx` et `AdminLoginGate.tsx` consomment le provider, et non l’instance concrète du mock.
- `ApiRepository`/`HttpApiClient` décrivent le client HTTP typé; `legacyApiAdapter.ts` relie ces ports aux signatures historiques de l’AppContext, supprime les identifiants acteur transmis côté client et échoue en 501 pour toute opération sans route. `apiAppAdapter.ts` permet de construire ce bundle, sans l’activer.
- Le pont historique crée une clé par invocation pour les signatures qui n’acceptent pas encore une clé. Cette clé n’est pas stable entre deux tentatives utilisateur; elle ne constitue pas une garantie de rejeu. Les nouvelles méthodes API acceptent explicitement une clé que l’appelant doit réutiliser.
- Le Worker est **fermé par défaut** : `/healthz` indique `boundary-only`; une route protégée sans authentificateur reçoit 401; une route connue sans handler persistant reçoit 501. Il n’existe aucun fallback vers le mock.
- Aucun identifiant PostgreSQL/Hyperdrive, bucket R2, binding Queue/Cron/DO, clé Google ou secret de signature n’est configuré par ce changement.

## 3. Authentification et identité serveur

`AuthenticatedActor` (`src/backend/productionContracts.ts`) est un objet interne créé après résolution d’une session côté Worker. Il contient `id`, `role`, `permissions` et `sessionId`; il ne doit pas être construit à partir du body, de query parameters ou d’un rôle React.

Frontière Google préparée :

```text
Google Identity Services → credential reçu en mémoire → POST /api/v1/auth/google/credential
→ vérification serveur → association provider + sub Google → session LE LABEUR
```

Le `sub` vérifié est l’identifiant externe stable. Le pont API transmet `credential` et l’intention login/register; il ne transmet jamais le `sub` comme preuve d’identité. Le provider mock conserve le comportement démo actuel. Le rôle demandé au self-service est limité à `CANDIDATE` ou `EMPLOYER`; `ADMIN` est attribué par une procédure serveur. Les interfaces de vérification et de session sont déclarées, mais aucun fournisseur ni magasin de sessions n’est branché.

La session de production devra être opaque, `HttpOnly`, `Secure` et `SameSite` selon le déploiement. Les credentials Google, cookies, clés HMAC, clés DB et secrets Worker ne doivent jamais être placés dans `VITE_*`.

## 4. RBAC et ownership

`src/backend/api/security.ts` expose `requireAuth()`, `requireRole()`, `requirePermission()`, `requireOwnership()` et `requireParticipant()` pour les handlers futurs. Une permission Admin explicite est nécessaire pour tout accès à une ressource qui n’appartient pas à l’acteur; le rôle `ADMIN` ne contourne pas implicitement l’ownership.

Les routes Admin déclarées dans `src/backend/api/routeContracts.ts` exigent à la fois le rôle `ADMIN` et la permission de la ressource. Les contrôles UI ne sont qu’une présentation, jamais une autorisation.

Les ports serveur de `src/backend/repositories/contracts.ts` reçoivent `AuthenticatedActor` construit côté serveur et exposent notamment `getMyOffers(actor)`, `getMyApplications(actor)`, `getMyContracts(actor)`, `getMyConversations(actor)`, `getMyPayments(actor)`, `getAdminUsers(actor)`, `getAdminContracts(actor)` et `getAdminPayments(actor)`. Les listes privées ont toutes un paramètre de page; aucune méthode ne propose de charger silencieusement une collection globale pour l’utilisateur.

## 5. Contrats de domaines et routes

Les routes sont un catalogue de contrats, pas des handlers métier actifs. Les catégories définies couvrent : AUTH, USERS, OFFERS, APPLICATIONS, PROPOSALS, CONTRACTS, PAYMENTS, SCHEDULES, INCIDENTS, REPLACEMENTS, MESSAGES, NOTIFICATIONS, ADMIN et AUDIT. Les collections Admin comprennent aussi documents, appels et journaux d’événements MATCH/communication/WhatsApp, sans fournisseur WhatsApp branché.

Exemples Admin :

- `GET /api/v1/admin/users`
- `GET /api/v1/admin/offers`
- `GET /api/v1/admin/applications`
- `GET /api/v1/admin/contracts`
- `GET /api/v1/admin/payments`
- `GET /api/v1/admin/schedules`
- `GET /api/v1/admin/incidents`
- `GET /api/v1/admin/replacements`
- `GET /api/v1/admin/notifications`
- `GET /api/v1/admin/audit`
- `GET /api/v1/admin/stats`

Les mutations Admin déclarées (blocage/déblocage, décision de paiement, arbitrage, transfert de remplacement) portent à la fois les métadonnées d’idempotence et d’audit transactionnel. Les routes ne sont pas encore reliées à une table ou une UI nouvelle.

## 6. Erreurs et pagination

Format d’erreur : `{ error: { code, message, requestId, details? } }`. Les statuts prévus sont 400 validation, 401 non authentifié, 403 interdit, 404 absent, 409 conflit d’idempotence, 422 règle métier et 500 erreur interne. Le Worker gère aussi 405 méthode invalide et 501 opération connue non encore configurée. Les détails d’exception et stack traces ne sont jamais renvoyés pour les réponses 5xx.

Les collections suivent `CursorPage<T> = { items, cursor, limit, hasMore }`. `parsePageRequest()` fixe une limite par défaut de 25, un maximum de 100 et borne la longueur du curseur. Le curseur reste opaque; le futur repository effectuera filtrage et scoping avant pagination.

## 7. Idempotence et transactions

Les commandes marquées dans le catalogue attendent l’en-tête `Idempotency-Key`. `commands.ts` en valide la forme et le Worker passe une `ProductionCommandContext` contenant l’acteur serveur, le nom de commande et la clé. **Cette validation n’est pas une garantie d’idempotence** : il n’existe pas encore de table ni de déduplication persistante.

La future table doit imposer l’unicité de `(actor_id, command, key)`, garder une empreinte du payload, et rejouer le résultat terminé pour la même empreinte; la réutilisation de la clé avec un payload différent est un conflit. La réservation, la mutation et l’enregistrement du résultat doivent être protégés contre les courses concurrentes.

`src/backend/services/transactions.ts` consigne les mutations à rendre atomiques : activation du contrat, vérification/rejet du paiement, signalement/arbitrage d’incident, création/transfert de remplacement et blocage/déblocage. Le port `TransactionBoundary` n’a volontairement **aucune implémentation mémoire**; un `try/catch` n’est pas présenté comme une transaction DB.

## 8. Audit et Outbox/Queue

`ProductionAuditEvent` réserve les champs acteur serveur (`actorId`, `actorRole`), action, entité, raison, états avant/après, `requestId` et horodatage. Cette structure de production reste distincte du `SystemAuditLog` mock.

La mutation métier, l’entrée d’audit et les événements Outbox futurs devront être écrits dans la même transaction PostgreSQL. Les types d’événements prioritaires incluent : `PAYMENT_DECLARED`, `PAYMENT_APPROVED`, `PAYMENT_REJECTED`, `CONTRACT_SIGNED`, `INCIDENT_OPENED`, `REPLACEMENT_CREATED`, `ACCOUNT_BLOCKED` et `ACCOUNT_UNBLOCKED`.

`OutboxRepository` et `OutboxDispatcherBoundary` ne sont que des ports. Il n’y a actuellement ni file persistante, ni consumer, ni notification de production. Les consumers futurs doivent être rejouables sur `event.id` et utiliser une clé de déduplication stable.

## 9. Scheduler J+3

Le contrat est décrit dans `src/backend/services/scheduler.ts`; aucun timer frontend ni Cron actif n’est ajouté.

- **Source actuelle :** `Contract.paymentSchedule[]` dans `MockService`.
- **Table cible :** `payment_schedules`, à normaliser lors de la création du schéma PostgreSQL.
- **Date métier actuelle :** valeur `YYYY-MM-DD` lue à minuit UTC; nombre de jours complets calculé avec `floor((now - dueAt) / 86_400_000)`; seuil `>= 3`.
- **Alertes J+3 existantes :** le mock émet `PAYMENT_OVERDUE_J3` pour une échéance `DUE` de montant positif, vers l’employeur et les Admins, sous une clé de déduplication fondée sur contrat/mois/type de paiement/destinataire.
- **Éligibilité au blocage existante :** le repository et l’écran Admin considèrent `DUE` **ou** `REJECTED`, pour le salaire et, si le montant est positif, la commission. Le blocage reste une action Admin, pas un effet automatique du Cron.
- **Contrat futur :** Cron sélectionne les échéances persistées côté serveur, transmet un snapshot `scheduleEntry` au worker, et celui-ci produit au plus une clé événement `scheduleEntryId:paymentKind:dueDate:J3`. L’événement `PAYMENT_OVERDUE_J3` passe dans l’Outbox; le consumer crée la notification existante pour l’employeur et les Admins. Une entrée d’audit système `SCHEDULE_J3_ELIGIBILITY_RECORDED` devra référencer l’échéance, le statut, les jours de retard et l’événement.

Le comportement actuel distingue donc **alerte J+3 (`DUE`)** et **éligibilité au blocage (`DUE` ou `REJECTED`)**. Cette distinction doit rester explicite lors de l’implémentation, sans changer les règles approuvées.

## 10. PostgreSQL / Hyperdrive et R2

`PostgreSqlDatabase` est le port serveur prévu pour PostgreSQL via Hyperdrive. La connexion, migrations, schéma, index, transactions et binding Hyperdrive restent à faire; aucun secret ou client DB n’est livré au navigateur.

Les contrats documents séparent :

1. métadonnées / ownership / statut en base;
2. binaire PDF/image dans R2;
3. upload et download par URL signée à durée limitée, après vérification d’ownership et de type/taille.

Les PDF statiques existants ne sont ni déplacés ni migrés dans cette phase.

## 11. Signaling WebRTC

Le contrat `SignalingCredentialIssuer` prévoit un credential court terme lié à l’acteur authentifié et, lorsqu’un appel est connu, à ses participants. L’endpoint conceptuel est `POST /api/v1/calls/signaling-credential`; le client n’envoie pas son `userId` comme preuve d’identité.

Le signaling reste en WebSocket vers le Durable Object. Le secret de signature demeure côté Worker; aucun token signaling ou credential TURN permanent `VITE_*` n’est accepté. En mode API, le credential signaling est demandé via la session same-origin et les credentials ICE/TURN sont obtenus pour l’appel actif. En mode mock/demo, le transport WebSocket historique reste utilisable uniquement avec un credential pré-signé qui expire dans les cinq minutes; les paramètres TURN du mock sont soumis à la même limite. Sans ces credentials temporaires, le mock garde le fallback STUN public et le signaling échoue explicitement, sans empêcher l’application de démarrer. Les messages WebRTC et le `callId` canonique restent inchangés. L’issuer authentifié et la vérification serveur du participant/`callId` restent à réaliser.

## 12. Observabilité et secrets

Le Worker génère un `requestId`; `src/backend/services/observability.ts` réserve le contrat de logs structurés. Les événements de production ne doivent jamais journaliser credential Google, cookie/session, token signaling, corps des messages, contenu document ni URL de preuve. Les métriques d’infrastructure (latence, erreurs, DB, queue, Cron) restent séparées des événements d’audit métier.

Les bindings/valeurs de production seront configurés dans l’environnement Cloudflare, pas dans `.env` public ni dans des variables `VITE_*`. Les identifiants Hyperdrive, R2, Queue, Cron, Durable Object et secrets Google/signing sont volontairement absents à ce stade.

## 13. Hors périmètre Phase 1

- implémenter un schéma ou une connexion PostgreSQL;
- créer les tables/migrations, Hyperdrive ou migrations de données mock;
- connecter Google, un fournisseur email, WhatsApp ou un fournisseur de notifications réel;
- construire les pages Admin manquantes ou refaire les écrans publics;
- activer le scheduler J+3, l’Outbox, la Queue ou le signaling Worker de production;
- annoncer une garantie distribuée d’idempotence ou de transaction.
