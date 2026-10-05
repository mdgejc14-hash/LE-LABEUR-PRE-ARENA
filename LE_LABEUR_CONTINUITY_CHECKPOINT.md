# LE LABEUR — Continuity Checkpoint

Date: 2026-10-04
Phase: Functional stabilization before Cloud infrastructure
Status: PHASE 1B VALIDATED — tests 921/921, lint PASS, build PASS; browser and live WebRTC runtime not executed; production backend remains boundary-only

## Source

ZIP audited: `LE_LABEUR_FINAL_AUDITED_2026-10-04(1).zip`

## Modifications in this audit

- `src/repositories/mockRepository.ts`
  - isolated each `MockService` instance with deep-cloned seed state;
  - strengthened/generated collision-resistant IDs for offers, applications, proposals, messages, notifications, calls, communication events and replacement artifacts;
  - blocked-account login rejection;
  - notification reads scoped to the current session actor;
  - retained blocked-account regularization flow;
  - preserved existing authorization/state-transition guards.
- `src/services/calls/CallService.ts`
  - canonical call ID can be supplied by repository;
  - signaling session stores the actual user role;
  - incoming call records use the current signaling user's role instead of a hard-coded EMPLOYER role.
- `src/context/AppContext.tsx`
  - passes the authenticated role into signaling connection;
  - incoming call rejection now sends real `CALL_REJECT` signaling instead of `CALL_END`.

## Real execution

Special campaign: 800/800 PASS at repository/business layer, executed in Node from the audited source after compilation of the relevant repository graph.

Distribution:
- AUTH / SESSION: 100/100
- DATA SCOPING: 100/100
- CONCURRENCY / DOUBLE ACTION: 100/100
- CONTRACTS / OFFERS / APPLICATIONS: 100/100
- PAYMENTS / BLOCKING: 100/100
- INCIDENTS / REPLACEMENTS: 100/100
- NOTIFICATIONS / PERSISTENCE: 100/100
- SCALE / COLLECTION BEHAVIOR: 100/100

Additional focused checks:
- duplicate retry gap confirmed for createOffer;
- duplicate retry gap confirmed for sendMessage;
- duplicate retry gap confirmed for sendProposal;
- autonomous J+3 scheduler not found.

## Static / architecture findings

### CRITICAL before production backend

1. No autonomous backend scheduler for J+3. Current J+3 evaluation is triggered by contract reads/synchronization. A future worker/cron/queue must own due-date processing.
2. Authentication is currently mock/local-storage based. A real backend must derive identity and role from a server-validated session/token and never trust `actorId`/`actorRole` from the browser.
3. `VITE_SIGNALING_TOKEN` is embedded in frontend configuration. It must not be treated as a secret in the production browser. The final Cloudflare implementation should issue/validate short-lived server-side signaling credentials.

### HIGH before production scale

4. No pagination/cursor contract exists in the repository interfaces. `getAllOffers()` is loaded during application initialization, and several collections are filtered in memory. This is not a production strategy for 100k+ objects.
5. Mock persistence serializes whole collections to `localStorage` on mutations. This is acceptable for the mock, not for multi-thousand-user production persistence.
6. Multi-object business mutations are not wrapped in database transactions or an outbox. Contract activation, payment verification/rejection, incident arbitration/replacement and block/unblock need atomic backend semantics.
7. Mock idempotency is now available for `createOffer`, `sendMessage` and `sendProposal` through an optional `idempotencyKey`; it is intentionally in-memory/test-scoped only. Production APIs must use durable idempotency records plus uniqueness/transaction semantics.
8. `getAllOffers()` and several other collection reads are broad. Production endpoints must be actor/public scoped and paginated rather than transferring complete collections to the browser.
9. `getProfile(id, actorId)` now enforces ADMIN-or-owner access in the mock. The production API must derive actor identity from the authenticated server session.
10. `getRevenueMetrics(actorId)` and `getAllAuditLogs(actorId)` now enforce ADMIN-only access in the mock. Production admin endpoints must enforce the same rule server-side.

### MEDIUM

11. Geography remains partial: 12/12 departments, 77/77 communes, 24/546 arrondissements and 94/5,295 villages/quartiers are present. Missing official data is intentionally not invented.
12. `npm install --ignore-scripts --no-audit --no-fund --prefer-offline` timed out after 300s. Therefore `npm run lint` and `npm run build` are not certified.
13. Browser smoke test was not executed because the full npm/Vite dependency graph was unavailable in the execution environment.

## Validation state

- Full TS/TSX syntax parse: 54/54 PASS
- 800 repository/business scenarios: 800/800 PASS
- Browser E2E: NOT EXECUTED — dependency environment unavailable
- npm install: NOT COMPLETED — timeout
- lint: NOT CERTIFIED
- build: NOT CERTIFIED
- full national geography: REMAINING

## Next action

Implement the production infrastructure boundary without redesigning the existing UI: server-authenticated sessions, paginated/scoped repository API, DB transactions/outbox, idempotency keys, and an autonomous J+3 worker. Then rerun build/lint/browser E2E against the real backend.


## Stabilization checkpoint — 2026-10-04

### Rollback
- Pre-phase rollback ZIP created outside the project workspace before modifications.

### Work executed
- Added `src/backend/productionContracts.ts` with non-invasive contracts for server actor identity, cursor pagination, idempotency, transactions, outbox events and J+3 worker integration.
- Added `docs/PRODUCTION_BACKEND_BOUNDARY.md` documenting exact production handoff points.
- No UI redesign.
- No changes to validated business flows.
- No fake frontend scheduler or fake transaction introduced.
- No geographic data invented.

### Real validations
- `npm install --ignore-scripts --no-audit --no-fund --prefer-offline`: EXECUTED, timeout after 300 seconds.
- `npm run lint`: EXECUTED, NOT CERTIFIED because `vite/client` dependency types are unavailable without the npm dependency graph.
- `npm run build`: EXECUTED, NOT CERTIFIED because the `vite` binary is unavailable without installed dependencies.
- Deterministic business suite: **82/82 PASS** after adapting stale actor-session test calls and aligning the geography assertion with the actual ZIP.
- Massive repository/business suite: **800/800 PASS**.
- Targeted stabilization suite: **14/14 PASS**, covering idempotency, blocked sessions, ADMIN conflicts, candidate competition, calendar boundaries, contract durations and ADMIN/global reads.
- Geography check: 12/12 departments, 77/77 communes, 24/546 arrondissements, 94/5295 localities.
- WebRTC static verification: canonical call ID, `CALL_REJECT`, real RTCPeerConnection connection state, and `WebSocket.OPEN` guards confirmed.

### External official geography verification
- INStaD confirms the national target of 12 departments, 77 communes, 546 arrondissements and 5,295 villages/quartiers.
- IGN-Bénin's spatial database also states the same national hierarchy and identifies the database as an IGN 2024 realization.
- Full locality integration was not fabricated because the detailed official source files were not retrievable in the execution environment.

### PASS
- Rollback checkpoint created.
- 82/82 deterministic tests PASS.
- 800/800 repository/business scenarios PASS.
- 14/14 targeted stabilization tests PASS.
- Mock idempotency protection added without presenting it as distributed production idempotency.
- ADMIN/global read authorization hardened.
- Backend boundary contracts preserved without altering current runtime architecture.
- Existing validated WebRTC corrections preserved.
- No design changes.

### FAIL / BLOCKED
- npm dependency installation.
- Official project lint.
- Official project build.
- Browser smoke test.
- Full national geography.

### Next exact action
Run the project in an environment with npm dependencies/network access, execute official lint/build and browser smoke flows, then integrate the complete official INStaD/IGN locality dataset and re-run targeted hierarchy tests.

## Final targeted stabilization pass — 2026-10-04

### Scope
Passe ciblée uniquement. Aucun redesign, aucune suppression de correction validée, aucun refactor global.

### Files modified
- `src/domain/businessRules.test.ts` — correction des contextes de session/actorId dans les 82 tests déterministes et alignement de l’attendu géographique réel.
- `src/domain/qaMassive.test.ts` — correction des contextes de session nécessaires aux lectures protégées G1/G2/I2.
- `src/domain/finalStabilization.test.ts` — nouvelle suite ciblée de 14 scénarios de stabilisation.
- `src/repositories/interfaces.ts` — idempotencyKey optionnelle sur createOffer/sendMessage/sendProposal et actorId requis pour les lectures sensibles ciblées.
- `src/repositories/mockRepository.ts` — idempotence locale de retry, scoping de profil, ADMIN-only sur métriques/audit.
- `docs/PRODUCTION_BACKEND_BOUNDARY.md` — précision de la portée mock de l’idempotence et des contrats de lectures ADMIN.
- `FINAL_VALIDATION_REPORT_2026-10-04.md` — résultats finaux de cette passe.
- `LE_LABEUR_CONTINUITY_CHECKPOINT.md` — présent checkpoint.

### Real execution
- Deterministic business suite: **82/82 PASS**.
- Massive repository/business suite: **800/800 PASS**.
- Final targeted stabilization suite: **14/14 PASS**.

### Targeted coverage
- `createOffer` retry with same idempotency key: PASS.
- `sendMessage` retry with same idempotency key: PASS.
- `sendProposal` retry with same idempotency key: PASS.
- idempotency key reuse with different payload: PASS / rejected.
- already-open blocked employer session: sensitive mutation rejected; salary regularization allowed: PASS.
- ADMIN payment conflict: first decision wins; contradictory second decision rejected; schedule/ledger coherent: PASS.
- ADMIN incident conflict: first arbitration wins; contradictory second decision rejected; contract/history coherent: PASS.
- block/unblock conflict: unblock cannot bypass outstanding due; blocking notification preserved: PASS.
- two-candidate last-place competition: one ACTIVE contract, offer FILLED, selected application HIRED, other application CLOSED_OFFER_FILLED: PASS.
- calendar boundaries: 28 Feb, 29 Feb leap year, 30 Apr, 31 May, 31 Jul, 31 Aug: PASS.
- durations: 1, 2 and 12 months: PASS.
- ADMIN revenue metrics: non-ADMIN rejected, ADMIN allowed: PASS.
- ADMIN audit logs: non-ADMIN rejected, ADMIN allowed: PASS.
- profile scoping: owner/ADMIN allowed, cross-user read rejected: PASS.

### Idempotence truth
The mock now supports an optional in-memory idempotency key for the three explicitly tested commands. This prevents duplicate retries within one MockService instance only. It is **not** a distributed, crash-safe or production guarantee. The future backend still requires durable idempotency records, uniqueness and transaction semantics.

### Multi-entity transaction truth
Runtime checks confirm coherent final states for contract activation, payment verification, incident arbitration and block/unblock. These remain non-atomic mock mutations. Production must execute the corresponding multi-entity transitions inside database transactions and publish notifications through an outbox.

### Build / lint / browser
- `npm install --ignore-scripts --no-audit --no-fund --prefer-offline`: EXECUTED; timeout after 300 seconds.
- `npm run lint`: EXECUTED; NOT CERTIFIED because `vite/client` dependency types are unavailable without installed dependencies.
- `npm run build`: EXECUTED; NOT CERTIFIED because `vite` is unavailable without installed dependencies.
- Browser smoke test: NOT EXECUTED because the dependency/runtime environment is unavailable.

### Geography
12/12 departments, 77/77 communes, 24/546 arrondissements, 94/5,295 villages/quartiers. Missing official localities remain intentionally unfilled.

### Remaining blockers before backend/production
1. Server-authenticated actor identity.
2. Autonomous J+3 scheduler.
3. Secure short-lived signaling credentials.
4. Production pagination/cursors and server-side scoping.
5. Database transactions + outbox/events.
6. Durable API idempotency keys.
7. Complete official national geography.
8. Dependency-capable environment for official build/lint/browser validation.

### Next exact action
Move to the real backend Cloudflare implementation only after preserving this checkpoint as the source state. Do not redesign the UI or rebuild validated business logic.

## Phase 1B — validation and stabilization — 2026-10-04

### Scope and starting point
- Branch: `arena/01a108ca-le-labeur-pre-arena`.
- Starting commit: `9ee5029032e0a4d86e2f477b44ce86150e3a08b6`.
- Master continuity file `LE_LABEUR_MASTER_CONTINUITY_2026-10-04.md` was not present during this pass.
- No Phase 2 infrastructure or UI work started.

### Corrections made
- Removed the duplicate `getAdminIncidents` member from `ServerIncidentRepository`.
- Fixed TypeScript errors in the Worker handler key lookup, boundary test state capture, auth/document type imports, AppContext conversation target type, API adapter options import, and optional ICE test indexing.
- Kept mock repository as the provider default; API mode remains opt-in and absent handlers remain explicit 501s.
- Restored the mock/demo signaling branch without reading API credentials: it accepts only a server-signed WSS token bound to the current mock user and expiring within five minutes. API mode continues to request its credential through the authenticated API and does not send a client actor ID.
- Restored optional mock TURN configuration only when its credential has an explicit expiry no more than five minutes away; otherwise public STUN remains the fallback. Call ID, `CALL_REJECT`, `RTCPeerConnection`, and WebSocket state checks were preserved.
- Added six mock/API WebRTC boundary tests and included them in `npm test`.

### Commands and exact results
- Initial `npm test`: **not run**, exit 127 — `sh: 1: tsx: not found`.
- Normal `npm install --ignore-scripts --no-audit --no-fund --prefer-offline --no-package-lock`: **FAIL**, ERESOLVE because Vite 8.3.2's optional esbuild peer requires `^0.27.0 || ^0.28.0`, while the project pins `esbuild ^0.25.0`.
- `npm install --ignore-scripts --no-audit --no-fund --prefer-offline --no-package-lock --legacy-peer-deps`: **PASS**, 182 packages installed; no lockfile was generated.
- Final `npm test`: **921/921 PASS, 0 FAIL** — deterministic 82/82, final stabilization 14/14, repository QA 800/800, backend boundary 19/19, mock/API WebRTC boundary 6/6.
- First `npm run lint` found seven TypeScript errors; all were corrected. Final `npm run lint`: **PASS** (`tsc --noEmit`).
- Final `npm run build`: **PASS**, Vite 8.3.2 transformed 1,718 modules. Warnings remain for `__dirname` with future native config loading and the 736.48 kB minified JS chunk.
- `git diff --check`: **PASS**.
- Browser smoke test and live WebSocket/peer-to-peer WebRTC session: **NOT EXECUTED**. WebRTC verification is unit-level only; no backend issuer or signaling service is configured.

### Phase 1B files directly corrected/added
- `src/backend/repositories/contracts.ts`
- `src/backend/api/worker.ts`
- `src/backend/api/foundation.test.ts`
- `src/repositories/interfaces.ts`
- `src/repositories/apiAppAdapter.ts`
- `src/services/calls/signalingCredentialClient.ts`
- `src/services/calls/iceCredentialClient.ts`
- `src/services/calls/signalingCredentialClient.test.ts`
- `scripts/run-tests.ts`
- `.env.example`
- `docs/PRODUCTION_BACKEND_BOUNDARY.md`
- `LE_LABEUR_CONTINUITY_CHECKPOINT.md`

### PASS / FAIL / remaining limitations
- PASS: actor/session and ownership/business suites run at 82/82; QA at 800/800; targeted stabilization at 14/14; boundary security and mock/API credential tests pass.
- PASS: ADMIN role/permission, client role spoofing denial, auth fail-closed, paging bounds, idempotency header validation, explicit 501 behavior covered by executed boundary tests.
- PASS: mock provider remains default; existing mock domain files remain unchanged.
- PASS: no long-lived signaling/TURN credential is accepted from VITE configuration. Mock WebRTC may use only a pre-issued short-lived token; live connectivity was not exercised.
- FAIL (install path only): standard npm dependency resolution remains incompatible unless `--legacy-peer-deps` is used. Package versions were not changed in this stabilization pass.
- NOT IMPLEMENTED: persistent auth/Google verifier, API domain handlers, PostgreSQL/Hyperdrive, R2, real transactions, persistent idempotency, Outbox, Queue/Cron and production signaling issuer.
- Final validation commit subject requested: `feat: stabilize production backend boundary`; its full hash is recorded in the final report/Git history after commit.

### Next action
Stop after recording and committing the validated Phase 1/1B changes. Do not start PostgreSQL, Hyperdrive, R2, Cron, Queue, real Outbox, full Admin, redesign, data migration or WhatsApp without a separate Phase 2 authorization.

## Phase 2 — identité serveur, session et fondation de persistance — 2026-10-05

### Périmètre et point de départ
- Branche de travail : `arena/01a10b78-le-labeur-pre-arena` (branche imposée par la session Arena ; la branche demandée `arena/phase2-server-identity` n'a pas pu être créée, voir « Risques/écarts »).
- Commit de départ : `f773df3f9b1a34a3f9678db3838d2df7ba5a2834` (Phase 1B validée).
- `main` n'est ni modifié ni mergé. Aucun force push.

### RÉELLEMENT IMPLÉMENTÉ
- Vérification serveur du credential Google (RS256 + JWKS Google, `iss`/`aud`/`exp`/`iat`/`email_verified`), `sub` comme identité externe stable : `src/backend/identity/googleVerifier.ts`.
- Session serveur opaque : jeton 256 bits, SHA-256 seul persisté, expiration, révocation, cookie `__Host-lelabeur_session` HttpOnly/Secure/SameSite=Lax/Path=/ (`sessionService.ts`, `cookies.ts`, `ids.ts`).
- `getAuthenticatedActor()` : actorId, rôle, statut, permissions dérivés de la ligne `users`, jamais du body/headers/localStorage.
- RBAC : matrice `permissionsForRole` + réutilisation de `requireAuth/requireRole/requireOwnership/requireParticipant/requireAdmin`. ADMIN non attribuable en self-service.
- Worker identité (`src/backend/api/identityWorker.ts`) : `/api/v1/auth/google`, `/api/v1/auth/google/credential`, `/api/v1/auth/session`, `/api/v1/auth/logout`, `/api/v1/me`, `/api/v1/users/me` + 9 frontières ADMIN de contrôle protégées (session réelle + rôle + permission).
- DTO de sortie sans `sub`, sans jeton, sans hash, sans champ interne (`dto.ts`).
- Composition root `src/backend/api/entry.ts` : `closed` par défaut, `memory` (tests), `postgres` (si DB injectée).
- Sélection MODE DEMO / MODE API explicite : `src/repositories/mode.ts`. MockRepository conservé et par défaut.

### PRÉPARÉ MAIS NON BRANCHÉ
- Migrations PostgreSQL `migrations/0001_identity_and_core.sql` et `0002_role_permissions_seed.sql` (users, external_identities, sessions, permissions, role_permissions, user_permissions, offers, applications, contracts ; contraintes + indexes). Aucune base n'est provisionnée : la DB de production n'est PAS opérationnelle.
- Adaptateur SQL `src/backend/identity/sqlStores.ts` (aucune connexion Hyperdrive/Postgres fournie).
- Handlers ADMIN : contrôle d'accès uniquement, collections vides `persistence: 'not-configured'` (sauf `admin.users.list` servi par le store d'identité actif).

### NON IMPLÉMENTÉ (hors périmètre)
R2, Outbox, Queue, Cron J+3, WebRTC production, WhatsApp, dashboard ADMIN complet, migration métier PostgreSQL, statistiques avancées, redesign.

### Commandes et résultats exacts
- `npm install --ignore-scripts --legacy-peer-deps` : PASS (182 paquets ; la résolution npm standard reste incompatible).
- `npm test` (référence avant modification) : **921/921 PASS** — 82/82, 14/14, 800/800, 19/19, 6/6.
- `npm test` (après) : **935/935 PASS, 0 FAIL** — domaine 82/82, stabilisation 14/14, QA 800/800, backend boundary 19/19, WebRTC boundary 6/6, identité/session Phase 2 14/14.
- `npm run lint` (`tsc --noEmit`) : PASS (2 erreurs introduites puis corrigées : typage `Uint8Array<ArrayBuffer>`, collision `create` du store mémoire).
- `npm run build` : PASS (avertissement de taille de chunk préexistant).
- Aucun test supprimé.

### Risques / écarts restants
- Branche : la session Arena est verrouillée sur `arena/01a10b78-le-labeur-pre-arena` ; `arena/phase2-server-identity` n'a pas été créée.
- Aucune base PostgreSQL, aucun `GOOGLE_CLIENT_ID` réel, aucune rotation de session ni limitation de débit sur `/api/v1/auth/google`.
- Vérification Google testée contre un vérificateur injecté + rejet d'un credential malformé ; aucun jeton Google réel n'a été vérifié de bout en bout.
- AppContext/écrans continuent d'utiliser le MockRepository : le flux UI → session serveur n'est pas encore câblé.

### Prochaine phase suggérée
Brancher PostgreSQL/Hyperdrive réel + migration identité, puis câbler le frontend sur `/api/v1/auth/google` et `/api/v1/me`, avant d'ouvrir le dashboard ADMIN.

## Phase 3 — pont frontend ↔ session serveur — 2026-10-05

### Point de départ
- Branche : `arena/01a10b78-le-labeur-pre-arena` (session Arena verrouillée sur cette branche).
- Commit de départ : `fbc2d4e` (Phase 2 validée, 935/935 PASS).
- `main` non modifié, aucun merge, aucun force push.

### RÉELLEMENT IMPLÉMENTÉ
- Point de composition unique `src/bootstrap/appBootstrap.ts`, appelé par `src/main.tsx` avant le rendu : MODE DEMO (mock) ou MODE API (session serveur), jamais les deux.
- `src/repositories/sessionMapping.ts` : normalisation de `/auth/session` et `/me` (formes Phase 2 et historique). Rôle, id et statut viennent du serveur ; rôle inconnu, `authenticated: false` ou compte non actif ⇒ pas de session.
- `legacyApiAdapter` : `getCurrentSession()` fait `/auth/session` puis `/me` ; l'échange Google exige une session serveur ; `login`/`register` classiques échouent explicitement (501) au lieu de fabriquer une identité locale ; `switchRole` reste refusé (403).
- `apiRepository.auth` : ajout de `getMe()`, `getSession()` normalisé.
- `src/context/sessionRouting.ts` : `landingTabForRole`, `initialRoleForMode`, `shouldRestoreAuthenticatedScreen`, `canReachAdminBoundary`, gestion de la préférence de rôle navigateur.
- `AppContext` : rôle initial non restauré en ADMIN en MODE API ; au démarrage en MODE API, une session serveur valide restaure directement l'espace du rôle serveur (candidat/employeur/admin) ; logout vide applications/contrats/candidats et supprime la préférence de rôle locale.
- `identityWorker` : horloge injectable (`now`) pour aligner `Max-Age` du cookie sur l'horloge serveur.
- `vite.config.ts` : `server.allowedHosts` pour la prévisualisation sandbox.

### PRÉPARÉ MAIS NON BRANCHÉ
- Login classique email/mot de passe en MODE API : principe posé (session serveur = autorité), route serveur d'échange non exposée ⇒ 501 explicite.
- Dashboard ADMIN : seule la frontière est vérifiée (ADMIN autorisé, CANDIDATE/EMPLOYER 403).

### NON IMPLÉMENTÉ
PostgreSQL réel, R2, Outbox, Queue, Cron J+3, WhatsApp, WebRTC production, ADMIN complet, redesign.

### Commandes et résultats exacts
- `npm test` : **949/949 PASS, 0 FAIL** — 82/82, 14/14, 800/800, 19/19, 6/6, identité/session 14/14, **nouveau pont frontend ↔ session 14/14**. Aucune régression par rapport aux 935/935.
- `npm run lint` (`tsc --noEmit`) : PASS. `npm run build` : PASS.
- Runtime : `npm run dev` démarre (Vite 8.3.2, port 3000) en MODE DEMO. Parcours navigateur réel Google → session → refresh → logout : **NON EXÉCUTÉ** (aucun `GOOGLE_CLIENT_ID` ni backend déployé). Le flux complet est testé en intégration contre le vrai Worker Phase 2 avec bocal à cookies.

### Limites
- MODE API jamais exercé contre un déploiement réel (pas de DB, pas de Worker déployé, pas de client Google).
- Les écrans métier en MODE API restent majoritairement en 501 : seules AUTH/SESSION/ME/frontières ADMIN sont servies.
- Le masquage d'écrans côté React reste purement UX ; l'autorisation est serveur.

### Prochaine phase suggérée
Brancher PostgreSQL/Hyperdrive réel + déploiement du Worker, puis ouvrir progressivement les endpoints métier, avant le dashboard ADMIN.

## Phase 4 — Paiements employeur déclarés + contrôle administratif — 2026-10-05

### Point de départ
- Branche : `arena/01a10b9d-le-labeur-pre-arena` (session Arena verrouillée sur cette branche).
- Commit de départ : `50ee3d9` (Phase 3 validée, 949/949 PASS).
- `main` non modifié, aucun merge, aucun force push.

### RÉELLEMENT IMPLÉMENTÉ
- `src/types/index.ts` : `PaymentDeclaration`, `PaymentStatus`, `PaymentDeclarationKind`, `PaymentMethod`, `PaymentHistoryEvent`, `PaymentHistoryEventType`, `PaymentProof`.
- `src/domain/paymentDeclarations.ts` : machine à états réelle (DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED/REJECTED → RESUBMITTED), validations (montant > 0, ID transaction, justificatif obligatoire, date de paiement, concordance avec l'échéance), règle de blocage J+3 partagée (`evaluatePaymentBlockingRule`), libellés FR, garde de transition.
- `src/backend/api/paymentDeclarationGuard.ts` : garde serveur (actorId + rôle + propriété + transition valide) ; aucun rôle n'est jamais accepté depuis le client.
- `src/repositories/interfaces.ts` + `mockRepository.ts` + `apiRepository.ts` + `legacyApiAdapter.ts` : `createPaymentDeclaration`, `getPaymentDeclaration`, `listEmployerPayments`, `listAdminPayments`, `submitPaymentDeclaration`, `approvePaymentDeclaration`, `rejectPaymentDeclaration` (motif obligatoire), `resubmitPaymentDeclaration`, `getPaymentHistory`, `getPaymentBlockingEvaluation`, `blockEmployerForPayment`, `unblockEmployerForPayment`. Aucun état global parallèle : tout passe par le `MockRepository` existant.
- `src/backend/api/routeContracts.ts` : routes `payments.declarations.create|read|mine.list|submit|resubmit` et `admin.payment-declarations.list|review|approve|reject|block|unblock|blocking` derrière la frontière serveur existante ; permissions `payments:read:own|read:any|approve|reject|block:employer`.
- `src/repositories/mockData.ts` : 5 déclarations de démonstration cohérentes (soumise, approuvée, rejetée, régularisée, rejetable) adossées aux contrats existants (CTR-001/002/003).
- UI employeur `src/screens/EmployerPaymentsScreen.tsx` : liste, statuts, formulaire de déclaration (contrat, mois, nature, montant, moyen, ID transaction, référence, date/heure, justificatif, remarque), soumission, brouillon, régularisation après rejet avec rappel du motif, historique.
- UI admin `src/screens/AdminPaymentDeclarationsScreen.tsx` : compteurs, filtres (statut, nature, « à traiter uniquement »), table, détail complet (preuve, employeur lié, contrat lié, historique), APPROUVER / REJETER (motif obligatoire) / BLOQUER / DÉBLOQUER tracés.
- `AdminDashboardScreen` : bloc « Centre de vérification ». `AndroidBottomNav` : onglet « Paiements » + badge (rejets côté employeur, à traiter côté admin). `RoleSelectionScreen` : carte « Administration LE LABEUR » **en MODE DÉMONSTRATION uniquement** (accès admin impossible en self-service).
- Notifications : réutilisation de `createNotification` + `logEvent` existants (employeur informé du rejet, ADMIN informés des dossiers à traiter). Aucun second système de notification.

### NON IMPLÉMENTÉ
Aucun encaissement dans l'application (paiement externe uniquement), aucun scheduler J+3 (États préparés seulement), PostgreSQL/R2/Queue/Cron, déploiement Cloudflare, dashboard ADMIN complet, redesign, remplacement du `MockRepository`.

### Commandes et résultats exacts
- `npm test` : **973/973 PASS, 0 FAIL** — 82/82, 14/14, 800/800, 19/19, 6/6, 14/14, 14/14, **nouvelle suite paiements 24/24**. Aucun test existant supprimé ou modifié pour passer.
- `npm run lint` (`tsc --noEmit`) : PASS. `npm run build` : PASS.
- Vérification d'interface : application React réellement montée dans jsdom et pilotée (clics, formulaires) — **48/48 contrôles PASS** sur les 5 parcours (déclaration employeur, rejet → régularisation, approbation admin, rejet motivé + blocage J+3, historique admin).

### Limites
- MODE API : les routes de déclaration sont contractées et gardées côté serveur, mais non exercées contre un backend déployé.
- La prévisualisation utilise un `.env` local (`VITE_DEMO_MODE=true`, non versionné) ; sans ce fichier l'application démarre en mock sans la carte d'administration de démonstration.

### Prochaine phase suggérée
Brancher la persistance réelle (PostgreSQL/Hyperdrive) des déclarations de paiement, puis le scheduler J+3 et les pièces justificatives (R2), sans modifier le modèle de commission (M1 25 %/75 %, M2+ 0 %/100 %).
