# LE LABEUR — Audit architectural global (rétro-ingénierie)

**Type d'étape :** audit documentaire en lecture seule. Aucun changement de comportement, aucun refactor, aucune correction de bug.
**Commit audité :** `cd0dd633050e2e9d547674c3032e65abb71ed3cc` (unique commit de l'historique local, branche de travail `arena/01a10c4f-le-labeur-pre-arena`).
**Date de l'audit :** 2026-10-05.
**Méthode :** lecture exhaustive du code réellement présent dans le dépôt (114 fichiers `.ts`/`.tsx`, 29 874 lignes dont 3 854 lignes de tests), exécution des vérifications existantes. Aucune hypothèse de complétude : quand le code n'établit pas un fait, il est classé `NON VÉRIFIABLE DANS LE REPOSITORY`.

## 0. Preuves d'audit (état constaté, non modifié)

| Vérification | Commande | Résultat |
|---|---|---|
| Tests existants | `npm test` (`tsx scripts/run-tests.ts`) | **996/996 PASS, 0 FAIL** |
| Lint / typecheck projet | `npx tsc --noEmit` | **exit 0** |
| Build navigateur | `npm run build` | **non exécuté pendant cet audit** (hors strict nécessaire ; aucun code modifié) |
| État Git | `git status --short` | propre avant audit, propre après commit documentaire |
| Dépendances | `npm install --legacy-peer-deps` | conflit de peer-deps avec `npm install` standard (`vite@8` vs plugins), contourné uniquement pour exécuter les tests |

Détail des suites exécutées :

```
Domain deterministic:                82/82 PASS
Final stabilization:                 14/14 PASS
Repository QA 800:                  800/800 PASS
Backend boundary:                    19/19 PASS
Mock/API WebRTC boundary:              6/6 PASS
Server identity & session:            14/14 PASS
Frontend ↔ server session bridge:     14/14 PASS
Phases 4A/4B déclarations employeur:  23/23 PASS
Phase 4C consultation ADMIN:          12/12 PASS
Phase 4D décision ADMIN:              12/12 PASS
Total: 996/996 PASS; 0 FAIL
```

## Légende de classification

| Code | Signification |
|---|---|
| **RE** | **Réellement implémenté** : code exécutable présent, chaîne complète vérifiable. |
| **PA** | **Partiellement implémenté** : une partie de la chaîne existe, l'autre manque (UI sans logique, logique sans persistance, autorisation incomplète…). |
| **CO** | **Préparé / contrat seulement** : types, ports, catalogues, migrations ou constantes déclarés sans implémentation branchée. |
| **AB** | **Absent** : rien dans le dépôt. |
| **NV** | **Non vérifiable dans le repository** : dépend d'un environnement (Cloudflare, PostgreSQL, Google, opérateur) non fourni. |

---

## 1. Synthèse exécutive

1. **L'application réellement livrable aujourd'hui est le MODE DEMO** : React 19 + Vite 8 + Tailwind 4, un contexte global unique (`AppContext`), un « repository » monolithique de 3 492 lignes (`MockService`) persisté dans `localStorage` (19 clés `lelabeur_v5_*`). Tous les parcours métier (offres, candidatures, contrats, salaires, commissions, incidents, remplacements, blocage employeur, déclarations de paiement externes avec décision ADMIN) y sont **jouables de bout en bout**.
2. **Le backend de production n'existe qu'à l'état de frontière** : catalogues de ports, contrats de commandes, plan de transactions, contrat J+3, migration SQL, vérificateur Google serveur, service de session, matrice RBAC et Worker fermé par défaut. Aucune route métier n'est servie : le Worker répond `501 NOT_IMPLEMENTED` pour toute opération au-delà de l'identité et de stubs ADMIN de contrôle.
3. **Aucune infrastructure n'est branchée ni configurable depuis le dépôt** : pas de `wrangler.toml`, pas de Dockerfile, pas de CI (`.github` absent), pas de proxy Vite `/api`, pas de `package-lock.json` versionné. La base PostgreSQL n'est ni provisionnée ni migrée ; R2, Queue, Cron et Durable Object ne sont que des contrats ou un template de fichier.
4. **Il existe des îlots de code non atteignables** : 11 des 12 fichiers `src/screens/admin/*` ne sont importés nulle part ; `advanceContractMonth` et `resolveStartDivergence` n'ont aucun appelant UI ; `sendProposal` n'est jamais appelé par l'UI (les propositions ne naissent que de la génération de contrat) ; `getNotifications`, `markAsRead`, `markAllAsRead`, `getCallHistory`, `getCommunicationEvents`, `searchOffers`, `searchCandidates`, `createLeLabeurUrgentJob` ne sont consommés que par les tests.
5. **Des dizaines d'états sont déclarés dans les types sans transition correspondante** (contrats `DRAFT`/`PENDING_EMPLOYER`/`PENDING_EMPLOYEE`/`COMPLETED`, candidatures `CONTRACTED`, propositions `DRAFT`/`EXPIRED`, incidents `WAITING_EMPLOYEE`/`WAITING_EMPLOYER`/`TERMINATED`/`REPLACEMENT_IN_PROGRESS`, remplacements `PENDING_OFFER`, déclarations de paiement `UNDER_REVIEW`/`RESUBMITTED`, appels `IDLE`/`CONNECTING`/`CONNECTED` persistés).
6. **Le canal de notifications est un cul-de-sac** : le dépôt produit des notifications dédupliquées pour presque tous les faits métier, mais **aucun écran, aucune cloche, aucun badge** ne les lit (`getNotifications` n'est appelé que par les tests). Les liens `linkRef.screen = 'ADMIN'` et `'APPLICATIONS'` pointent vers des écrans qui n'existent pas dans l'énumération `AppScreen`.
7. **La géographie est volontairement incomplète et déclarée comme telle** : 12/12 départements, 77/77 communes, **24/546 arrondissements**, **94/5 295 localités**, avec `isComplete === false` (le test 48 vérifie cet état, il ne le masque pas).

---

## 2. Architecture globale

### 2.1 Vue d'ensemble (dérivée du code)

```
┌────────────────────────────── NAVIGATEUR (bundle Vite, same-origin) ──────────────────────────────┐
│ index.html → main.tsx                                                                             │
│   bootstrapRepositoryMode()  ──► resolveRepositoryMode(VITE_DEMO_MODE, VITE_API_BASE_PATH)        │
│                                    ├── 'mock' (défaut) → configureRepositoryAdapter(mock)         │
│                                    └── 'api'  (explicite) → legacyApiAdapter(ApiRepository)       │
│ App.tsx → AppProvider (AppContext 1 197 l.)                                                       │
│   ├── écrans (20 fichiers src/screens, 19 écrans)                                                 │
│   ├── composants (calls, contracts, resources, navigation, common, permissions, profiles)         │
│   └── services/calls (CallService singleton + WebRTCCallService + SignalingTransport)             │
└───────────────┬───────────────────────────────────────────────┬───────────────────────────────────┘
                │ appRepositories (Proxy)                       │ WebSocket wss (signaling)
                ▼                                               ▼
   ┌────────────────────────────┐                  ┌──────────────────────────────────┐
   │ MODE DEMO : MockService    │                  │ Worker signaling + Durable Object│
   │  (14 ports, 3 492 l.)      │                  │  = TEMPLATE de fichier .ts       │
   │  localStorage (19 clés)    │                  │  (non déployé, aucun wrangler.toml)│
   └────────────────────────────┘                  └──────────────────────────────────┘
                │ MODE API (opt-in, jamais activé dans le dépôt)
                ▼
   HttpApiClient (same-origin, credentials:'include', Idempotency-Key)
                │ /api/v1/...
                ▼
   ┌────────────────────────── Cloudflare Worker (code présent, non déployé) ──────────────────────┐
   │ composeWorker(env, database?) → mode 'closed' | 'memory' | 'postgres'                         │
   │ createApiWorker : RBAC, erreurs typées, pagination, clé d'idempotence, 401/403/405/501        │
   │ createIdentityApiWorker : auth.google(.credential), auth.session, auth.logout, me.read,        │
   │                            users.me.read, admin.users.list (réel), 8 stubs ADMIN de contrôle  │
   │ 89 contrats de routes déclarés, handlers métier ABSENTS → 501                                  │
   └───────────┬───────────────────────────────────────────────────────────────────────────────────┘
               │ IdentityStores                                                 ...ports non branchés
               ├── InMemoryIdentityStore (tests/démo serveur) RE                ├── PostgreSqlDatabase  CO
               └── SQL stores via Hyperdrive (préparé)       CO                  ├── ObjectStorage (R2)  CO
                                                                                 ├── Outbox/Queue        CO
                                                                                 ├── Cron J+3            CO
                                                                                 └── DO signaling        CO
```

Diagramme détaillé : `docs/architecture-global.mmd`.

### 2.2 Inventaire des modules (statut)

| Couche / module | Fichiers | Rôle observé | Statut |
|---|---|---|---|
| Entrée navigateur | `index.html`, `src/main.tsx`, `src/App.tsx` | montage React, choix de l'écran par `screen` | RE |
| Contexte applicatif | `src/context/AppContext.tsx` (1 197 l.), `sessionRouting.ts` | état global, navigation maison, orchestration de tous les cas d'usage | RE |
| Écrans | `src/screens/*.tsx` (19 écrans + 1 feuille) | UI complète candidate/employeur/admin | RE (dont 1 écran admin partiel, voir §4) |
| Écrans admin orphelins | `src/screens/admin/*.tsx` (11/12) | tableaux de bord alternatifs, gate admin, tabs offres/paiements/incidents… | **AB (code mort)** — aucun import |
| Composants | `src/components/**` (17 fichiers) | design system, appels, contrats, ressources, permissions | RE |
| Repositories front | `interfaces.ts` (14 ports), `mockRepository.ts` (3 492 l.), `mockData.ts` (1 240 l.) | persistance locale + règles métier | RE |
| Frontière de mode | `provider.ts`, `mode.ts`, `apiAppAdapter.ts`, `legacyApiAdapter.ts`, `sessionMapping.ts` | sélection mock/api, pont 501, mapping session | RE (frontière) / PA (couverture) |
| Client HTTP typé | `apiClient.ts`, `apiRepository.ts` | 1 client + ~80 méthodes typées `/api/v1` | RE (client) / CO (serveur) |
| Domaine | `domain/businessRules.ts` (182 l.), `domain/adminPaymentReview.ts` (327 l.) | 25 %/0 %, échéancier, dates, vues ADMIN paiements | RE |
| Contrats production | `backend/productionContracts.ts` (259 l.) | permissions, acteur, pagination, outbox, documents, signaling | CO |
| Worker API | `backend/api/worker.ts`, `entry.ts`, `identityWorker.ts`, `routeContracts.ts` (89 routes), `security.ts`, `commands.ts`, `pagination.ts`, `errors.ts` | frontière HTTP, RBAC, erreurs, 501 | RE (frontière) |
| Identité serveur | `backend/identity/*` (googleVerifier, sessionService, stores, sqlStores, permissions, cookies, dto, ids) | Google RS256/JWKS, session opaque, cookie `__Host-`, RBAC | RE (mémoire) / CO (SQL) |
| Ports serveur domaine | `backend/repositories/contracts.ts` (243 l.) | 17 familles de repositories serveur | CO |
| Services transverses | `backend/services/*` (authentication, database, documents, observability, outbox, scheduler, signaling, transactions) | ports uniquement | CO |
| Ressources documentaires | `src/resources/pdfLoader.ts` | découverte `import.meta.glob` de PDF | PA (aucun PDF présent) |
| Appels WebRTC | `src/services/calls/*` | RTCPeerConnection réel, signaling wss, TURN temporaire | RE (client) / CO (serveur signaling) |
| Données | `src/data/beninLocations.ts` (679 l.), `activityCatalog.ts` (219 l.) | référentiels géo/métiers | RE (géo incomplète, cf. §1.7) |
| Types | `src/types/index.ts` (706 l.) | modèle métier complet | RE |
| Migrations | `migrations/0001`, `0002` | 9 tables + seed permissions | CO (non appliquées) |
| Tests | 10 fichiers, `scripts/run-tests.ts` | 996 cas déterministes | RE |

---

## 3. Points d'entrée

| Point d'entrée | Fichier | Ce qu'il fait réellement |
|---|---|---|
| Navigateur | `index.html` → `src/main.tsx` | Charge Google GSI + polices, appelle `bootstrapRepositoryMode()` **avant** le premier rendu, monte `App`. |
| Composition de mode | `src/bootstrap/appBootstrap.ts` | Lit `VITE_DEMO_MODE` / `VITE_API_BASE_PATH`, décide une fois pour toute la session (`decision ??=`). Défaut = mock. |
| Affichage | `src/App.tsx` | Aiguillage par `screen` (`SPLASH`, `ONBOARDING`, `ROLE_SELECT(ION)`, `AUTH`, `MAIN`, `CONTRACTS`, `PAYMENTS`, `OFFER_DETAIL`, `CANDIDATE_DETAIL`, `CHAT_DETAIL`). Pas de routeur URL : état en mémoire. |
| Ports de données | `src/repositories/provider.ts` | `appRepositories` = `Proxy` vers l'adaptateur actif ; `selectRepositoryAdapter` refuse de retomber sur le mock si l'API est demandée sans adaptateur. |
| Worker (API) | `src/backend/api/entry.ts` (export par défaut) | `composeWorker(env, database?)` : `closed` sans `GOOGLE_CLIENT_ID`, `memory` si `IDENTITY_STORE=memory`, `postgres` seulement si un `PostgreSqlDatabase` est injecté. |
| Worker (frontière nue) | `src/backend/api/worker.ts` (export par défaut) | Worker fermé par défaut : `/healthz` renvoie `boundary-only`, routes protégées 401, opérations connues 501. |
| Signaling (client) | `src/services/calls/SignalingTransport.ts` | Ouvre `wss://…?token=…` après obtention d'un credential court (≤ 300 s). |
| Signaling (serveur) | `src/services/calls/cloudflare-worker-template.ts` | **Template** : vérification HMAC du jeton + classe `SignalingDurableObject` + `createSignedSessionToken`. Fichier non relié à un déploiement. |
| Scripts | `package.json` (`dev`, `build`, `test`, `preview`, `lint`, `clean`), `scripts/run-tests.ts`, `core-tsconfig.json` | `lint` = `tsc --noEmit` ; `clean` supprime `dist` et `server.js` (fichier inexistant dans le dépôt). |
| Configuration | `.env.example` | Documente `VITE_DEMO_MODE`, `VITE_GOOGLE_CLIENT_ID`, `VITE_API_BASE_PATH` et, en commentaire, les secrets Worker (`GOOGLE_CLIENT_ID`, `SESSION_TTL_SECONDS`, `IDENTITY_STORE`, `COOKIE_SECURE`). |

**Aucun point d'entrée de déploiement** : ni `wrangler.toml`, ni Dockerfile, ni pipeline CI/CD, ni proxy de développement `/api`.

---

## 4. Frontend — écrans et contexte

### 4.1 Écrans réellement atteignables

| Écran | Rôle | Atteint depuis | Statut |
|---|---|---|---|
| `SplashScreen` | lancement (auto → onboarding, saut possible) | `main` | RE |
| `OnboardingScreen` | 3 étapes → choix de profil | splash | RE |
| `RoleSelectionScreen` | CANDIDATE / EMPLOYER, + bouton **ADMIN de démonstration** si `VITE_DEMO_MODE=true` | onboarding | RE |
| `AuthScreen` | login/register email (mot de passe **factice**, voir §20 I-06) + Google | role select | RE |
| `DiscoverScreen` | offres, filtres (`FilterBottomSheet`), vedette, urgent | MAIN (candidat) | RE |
| `OfferDetailScreen` | détail, postuler, appel direct | discover/favoris | RE |
| `CandidateApplicationsScreen` | suivi candidat, retrait, accès contrat | MAIN | RE |
| `FavoritesScreen` | favoris candidat | MAIN | RE |
| `EmployerDashboardScreen` | KPI, échéancier, modales de paiement salaire/commission, création d'offre, candidatures récentes | MAIN (employeur/admin) | RE |
| `EmployerOffersScreen` | offres de l'employeur + statuts | MAIN | RE |
| `EmployerApplicationsScreen` | examen / shortlist / rejet / contact / appel | MAIN | RE |
| `TalentsScreen` / `TalentDetailScreen` | annuaire candidats (profils projetés sans email/téléphone), contact, appel | MAIN (employeur/admin) | RE |
| `MessagesScreen` / `ChatDetailScreen` | conversations par contexte, texte, vocal, propositions, génération de contrat, signature | MAIN | RE |
| `ContractsScreen` | contrats par statut (SIGNATURE/ACTIVE/INCIDENT/TERMINATED), signature, incident, confirmation/contestation salaire, fin de mission M2+ | MAIN, chat, profil | RE |
| `EmployerPaymentsScreen` | déclarations de paiement externe : brouillon, édition, soumission, filtres | MAIN (profil) | RE |
| `ProfileScreen` | profil, géographie, ressources, contrats, paiements, logout | MAIN | RE |
| `AdminDashboardScreen` | supervision ADMIN (voir §19) | MAIN (ADMIN) | RE |
| `AdminPaymentsVerification` | liste + **détail et décision** des déclarations soumises | AdminDashboard | RE |
| `FilterBottomSheet` | feuille de filtres | Discover | RE |

### 4.2 Écrans ADMIN non atteignables (code mort vérifié par absence d'import)

`AdminAccessDenied.tsx`, `AdminApplicationsTab.tsx`, `AdminContractsTab.tsx`, `AdminDashboardTab.tsx`, `AdminIncidentsTab.tsx`, `AdminLoginGate.tsx`, `AdminOffersTab.tsx`, `AdminPaymentsTab.tsx`, `AdminReplacementsTab.tsx`, `AdminScheduleTab.tsx`, `AdminUsersTab.tsx` — soit **11 fichiers sur 12** de `src/screens/admin/`. Le seul fichier réellement utilisé est `AdminPaymentsVerification.tsx` (rendu par `AdminDashboardScreen` et couvert par les tests 4C/4D).

> Conséquence : plusieurs affirmations des documents internes (« AdminLoginGate consomme le provider », « pages Admin ») décrivent du code présent mais **non monté**. Un écran présent ne prouve pas une fonctionnalité accessible.

### 4.3 `AppContext` — hub unique

- 1 197 lignes, un seul `createContext`, ~70 entrées exposées (navigation, auth, offres, candidatures, contrats, paiements, messages, appels, ressources, QA).
- Navigation maison basée sur `screen` + pile d'historique (`historyStackRef`, profondeur max 25) ; pas d'URL, pas de deep-link, donc tout `linkRef` de notification est inexploitable en l'état.
- Mode API : `initialRoleForMode` neutralise un rôle ADMIN mémorisé sans session serveur ; `shouldRestoreAuthenticatedScreen` ne restaure l'espace qu'avec session serveur valide.
- `loadInitialData()` charge en série/parallèle des collections complètes (pas de pagination à l'écran).

---

## 5. Repositories, API boundary et flux de données

### 5.1 Ports et adaptateurs

| Élément | Constat | Statut |
|---|---|---|
| `interfaces.ts` | 14 ports (`Auth`, `User`, `Offer`, `Application`, `Contract`, `Incident`, `Message`, `Call`, `CommunicationTracking`, `Resource`, `Payment`, `Notification`, `Replacement`, `AuditLog`) | RE |
| `MockService` | Classe unique implémentant les 14 ports, un seul magasin `localStorage` | RE |
| `provider.ts` | `AppRepositoryBundle` = agrégat ; sélection explicite ; pas de repli silencieux | RE |
| `apiClient.ts` | Refuse toute URL absolue, `credentials:'include'`, `cache:'no-store'`, en-tête `Idempotency-Key`, erreurs normalisées | RE |
| `apiRepository.ts` | ~80 méthodes typées, pages curseur, toutes les routes déclarées | RE (client) |
| `legacyApiAdapter.ts` | Pont historique : ignore `actorId`/`role` du client, mappe sur l'API, lève **501** pour les opérations sans route (`login`, `register`, `sendAudioMessage`, déclarations de paiement, etc.) | PA |
| `apiAppAdapter.ts` | Construit le bundle API sans l'activer | CO |
| Clé d'idempotence | `legacyApiAdapter` génère un UUID **par appel** (non stable entre deux tentatives) | PA (documenté dans le code) |

### 5.2 Chaîne de données observée (MODE DEMO)

```
Acteur → Écran → useApp() (AppContext) → appRepositories (Proxy)
      → MockService (règles, autorisations, notifications, audit)
      → persistAll() → localStorage (19 clés lelabeur_v5_*)
      → relecture par les écrans via AppContext en mémoire
```

### 5.3 Chaîne de données préparée (MODE API, non opérationnelle)

```
Acteur → Écran → AppContext → legacyApiAdapter → HttpApiClient (same-origin /api/v1)
      → Worker (session cookie → AuthenticatedActor → RBAC)
      → [handlers métier ABSENTS] → 501
      → [PostgreSQL via Hyperdrive : non branché] / [R2 : non branché] / [Outbox : non branché]
```

Détail complet : `docs/data-flow.mmd` ; vue multi-acteurs : `docs/swimlane-bpmn.mmd`.

---

## 6. Domaines et règles métier réellement codées

| Règle | Implémentation | Preuve |
|---|---|---|
| Commission M1 = 25 % du salaire, payée par l'employeur ; part salarié 75 % | `calculateFirstMonthCommission`, `getSalaryBreakdown`, `buildPaymentSchedule` | `businessRules.ts`, tests 1-12 |
| M2+ : 0 % LE LABEUR, 100 % salarié | `calculateLaterMonth*`, `advanceContractMonth`, `ensurePaymentSchedule` | idem, tests M2 |
| Aucun seuil de salaire, salarié ne paie jamais la commission | commentaire d'en-tête + tests | `businessRules.test.ts` |
| Échéancier mensuel généré par contrat (échéance = date de début + N mois, UTC, clamp fin de mois) | `buildPaymentSchedule`, `addMonthsClamped`, `parseContractStartDate` | tests dates (29/02, 31/05, 31/08…) |
| Statuts d'échéance salaire/commission : `SCHEDULED → DUE → PENDING_VERIFICATION → PAID / REJECTED`, `NOT_APPLICABLE` après terminaison future | `ensurePaymentSchedule`, `freezeFuturePaymentEntries` | `mockRepository.ts` |
| Blocage employeur après **J+3** sur échéance `DUE` **ou** `REJECTED` (salaire et commission si montant > 0) | `getOverdueDueEntries(userId, 3)`, `blockUser` | tests J+3 |
| Déblocage interdit s'il reste une échéance due/rejetée ou un paiement en vérification | `hasOutstandingDue`, `unblockUser` | tests blocage/déblocage |
| Compte bloqué : seules les actions de régularisation restent possibles | `assertRegularizationActor`, `assertOperationalActor` | tests compte bloqué |
| Contrat actif = double signature obligatoire ; activation ⇒ offre `FILLED`, candidature `HIRED`, autres candidatures `CLOSED_OFFER_FILLED` | `signContract` | tests 20/21 |
| M1 : rupture directe interdite, incident obligatoire ; M2+ : dissociation avec motif + notification | `dissociateMonth2` | tests RÈGLE 8/9/10 |
| Incident : signalement par l'une des parties, fiche `OPEN`, contrat `INCIDENT`, notifications aux deux parties et à tous les ADMIN | `reportIncident` | tests incidents |
| Arbitrage ADMIN : `CONTINUER→ACTIVE`, `SUSPENDRE→SUSPENDED`, `CLÔTURER/ANNULER→TERMINATED`, `REMPLACER→REPLACED` + dossier de remplacement | `arbitrateIncident` | tests arbitrage |
| Commission : déclaration employeur `PENDING_VERIFICATION` → ADMIN `PAID` ou `REJECTED` (l'échéance repasse à `DUE`) | `declareCommissionPayment`, `verifyCommissionPayment`, `rejectCommissionPayment` | tests commissions |
| Déclaration de paiement externe : `DRAFT → SUBMITTED → APPROVED / REJECTED`, montant entier > 0, justificatif obligatoire (document **ou** référence), date non future, verrouillage hors `DRAFT`, motif de rejet obligatoire | `createPaymentDeclaration`, `updatePaymentDeclaration`, `submitPaymentDeclaration`, `approve/rejectPaymentDeclaration`, `normalizePaymentDeclarationInput` | suites 4A/4B/4C/4D (47 cas) |
| Idempotence locale (mock) : `(scope, actorId, clé)` + empreinte de payload, conflit si payload différent | `resolveMockIdempotency`, `rememberMockIdempotency` | QA 800 |
| Notifications dédupliquées par `(recipientId, type, dedupeKey)` | `createNotification` | tests I2 |

---

## 7. Authentification, sessions, RBAC

| Sujet | Constat | Statut |
|---|---|---|
| Auth démo | `login(email, role)` : crée le compte si l'email est inconnu ; **aucune vérification de mot de passe** (le champ est collecté par l'UI puis ignoré) ; refuse un rôle `ADMIN` non existant | RE (démo) |
| Auth Google client | SDK GSI réel si `VITE_GOOGLE_CLIENT_ID`, sinon **simulation** en démo (sub/email factices) | RE / PA |
| Décodage JWT client | `decodeGoogleJwt` décode sans vérifier la signature (commentaire explicite) | PA (par conception) |
| Vérification serveur Google | RS256, JWKS Google, `iss`/`aud`/`exp`/`iat`, `email_verified`, cache 1 h, `sub` = identifiant externe | RE |
| Session serveur | Jeton opaque 256 bits, **SHA-256 seul persisté**, expiration (12 h par défaut), révocation, compte actif obligatoire | RE |
| Cookie | `__Host-lelabeur_session`, `HttpOnly`, `Secure` (sauf `COOKIE_SECURE=false`), `SameSite=Lax`, `Path=/`, `Max-Age` | RE |
| DTO de sortie | Ni `sub`, ni jeton, ni hash ; projection ADMIN distincte | RE |
| RBAC serveur | `requireAuth`, `requireRole`, `requirePermission`, `requireOwnership` (ADMIN sans bypass implicite), `requireParticipant` ; 24 permissions ; ADMIN uniquement en seed | RE |
| RBAC front/démo | Chaque mutation du `MockService` revalide rôle + propriété + statut de compte ; `requireActor` obligatoire | RE |
| Attribution ADMIN | Self-service interdit (client : `isSelfAssignableRole` ; serveur : `permissionsForRole`) ; en démo, l'entrée ADMIN passe par le bouton démo ou le compte seed | RE |
| Sessions persistées | `sessions` table déclarée, stores SQL écrits | CO |
| Révocation multi-appareils | `revokeAllForUser` présent dans les stores ; aucun appelant | CO |

---

## 8. Stockage

| Support | Constat | Statut |
|---|---|---|
| `localStorage` | 19 clés `lelabeur_v5_*` écrites par `persistAll()` ; `resetAllData()` vide `localStorage` (⚠ voir §20 I-14) | RE |
| Clonage d'état | `structuredClone` des seeds dans le constructeur pour isoler les instances de test | RE |
| PostgreSQL | 9 tables + seed (`users`, `external_identities`, `sessions`, `permissions`, `role_permissions`, `user_permissions`, `offers`, `applications`, `contracts`) ; **ni provisionné ni migré** | CO |
| Tables métier manquantes | `payment_declarations`, `payment_schedules`, `incidents`, `replacements`, `messages`, `notifications`, `audit`, `documents`, `calls`, `outbox`, `idempotency` : **aucune migration** | AB |
| R2 | Port `ObjectStorage` + `DocumentMetadata`/`SignedDocumentUrl` + routes de grants | CO |
| Justificatifs réels | En démo : `proofUri = "blob:<nomFichier>"` (dashboard employeur) et champs texte `proofDocumentId`/`proofReference` ; **aucun binaire n'est stocké** | PA |

---

## 9. Intégrations externes

| Intégration | Constat dans le code | Statut |
|---|---|---|
| Google Identity Services | Script chargé dans `index.html`, flux popup/One Tap, callback credential | RE |
| Google JWKS | `fetch` vers `https://www.googleapis.com/oauth2/v3/certs` (Worker) | RE |
| Cloudflare Worker | Code présent, aucun binding, aucun `wrangler.toml` | CO |
| Hyperdrive | Mentionné comme cible du port `PostgreSqlDatabase` | CO |
| R2 | Ports + plan de documents | CO |
| Queue / Workers consommateurs | Types `OutboxEvent`/`OutboxRepository` + catalogue d'effets | CO |
| Cron | `J3_SCHEDULER_CONTRACT` documenté, aucun déclencheur | CO |
| Durable Object / signaling | Template de fichier avec classe DO + vérification HMAC | CO |
| WhatsApp | Uniquement une permission `communications:read:any` et une route catalogue `/admin/whatsapp-events` | AB |
| Email / SMS / notifications push | Aucun fournisseur, aucune intégration | AB |
| Gemini (`@google/genai`) | Dépendance déclarée dans `package.json`, `metadata.json` annonce `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`, **aucun import dans `src/` ni `scripts/`** | AB (dépendance morte) |
| Express / dotenv | Dépendances déclarées, aucun import applicatif | AB (dépendances mortes) |

---

## 10. Traitements asynchrones

| Élément | Constat | Statut |
|---|---|---|
| J+3 (alerte) | Calcul **paresseux** au moment de la lecture/synchronisation d'un contrat : `syncPaymentSchedule` crée `PAYMENT_OVERDUE_J3` pour employeur + chaque ADMIN, clé `contrat:mois:type:J3:cible` | RE (démo, non autonome) |
| J+3 (autonome) | Aucun timer, aucun Cron : sans nouvelle lecture, aucune alerte n'est émise | NV |
| Outbox | Ports + catalogue d'effets (`PAYMENT_DECLARED`, `CONTRACT_SIGNED`, `INCIDENT_OPENED`, `ACCOUNT_BLOCKED`…) ; aucun producteur, aucun consumer | CO |
| Queue | Aucun binding | AB |
| Rejeu / déduplication consumer | Contrat `dedupeKey`/`event.id` documenté | CO |
| Notifications asynchrones | Toutes synchrones, dans le même appel que la mutation | RE (démo) |

---

## 11. WebRTC et appels audio

| Élément | Constat | Statut |
|---|---|---|
| `WebRTCCallService` | `RTCPeerConnection` réel, `getUserMedia` audio, ICE, `createOffer/answer`, mute, cleanup | RE |
| `CallService` | Singleton, états live, refus d'appeler si signaling non connecté (« jamais d'UI d'appel factice »), verrouillage par `receiverId` local | RE |
| Transport signaling | WebSocket `wss` obligatoire, jeton court (≤ 300 s) | RE (client) |
| Credential signaling | Démo : `VITE_SIGNALING_TOKEN` pré-signé (≤ 5 min) requis, sinon **échec explicite** ; API : `POST /calls/signaling-credential` → 501 aujourd'hui | PA |
| ICE/TURN | Démo : STUN public + TURN optionnel à credential court ; API : `POST /calls/:id/ice-configuration` → 501 aujourd'hui | PA |
| Serveur signaling | Template HMAC + DO (rooms `global-signaling-hub` par défaut) non déployé | CO |
| Persistance des appels | `CallRecord` écrit par le repository au début/acceptation/rejet/fin ; le statut **`CONNECTED` n'est jamais persisté** (il reste dans l'objet live de `CallService`) | PA |
| Historique d'appels | `getCallHistory` existe, aucun écran ne l'affiche | PA |
| Notifications d'appel | `INCOMING_CALL` créé à l'initiation ; `MISSED_CALL` déclaré mais jamais produit | PA |

---

## 12. Notifications

| Aspect | Constat | Statut |
|---|---|---|
| Modèle | `AppNotification` + 34 `NotificationType` + `dedupeKey` + `linkRef` | RE |
| Production | ~30 sites d'appel : candidature, shortlist, rejet, proposition, contrat, salaire, commission, J+3, incident, remplacement, blocage/déblocage, appel entrant, mission urgente | RE |
| Déduplication | `(recipientId, type, dedupeKey)` — vérifiée par test | RE |
| Lecture UI | **Aucun** écran, cloche, badge ou compteur. `getNotifications`/`markAsRead`/`markAllAsRead` ne sont appelés que par les tests | AB |
| Types jamais produits | `NEW_MESSAGE`, `MISSED_CALL`, `APPLICATION_WITHDRAWN`, `MISSION_START_REQUIRED`, `MISSION_CONFIRMED`, `MISSION_DIVERGENCE`, `MONTHLY_CHECKPOINT` (partiel), `REPLACEMENT_INITIATED`, `CANDIDATE_TRANSFERRED` | PA |
| Notifications manquantes sur faits métier | `sendMessage` n'émet **aucune** notification ; `submitPaymentDeclaration`, `approve/rejectPaymentDeclaration`, `finalizeReplacementContract` n'émettent **aucune** notification | AB |
| Liens | `linkRef.screen` peut valoir `'ADMIN'` ou `'APPLICATIONS'`, absents de `AppScreen` → liens morts | PA |
| Production | Outbox contractuelle, non branchée | CO |

---

## 13. Documents et ressources

| Élément | Constat | Statut |
|---|---|---|
| Métadonnées + ownership | Types `DocumentMetadata`, ports `DocumentRepository`/`DocumentService` | CO |
| Upload/download signé | Contrats d'URL signée, routes `/documents/upload-grants` et `/documents/:id/signed-download-url` | CO |
| PDF statiques | `loadDiscoveredResources()` via `import.meta.glob` ; **aucun fichier PDF ni dossier `employees/`/`employers/` dans `src/resources/`** → catalogue vide | PA |
| Affichage | `ResourceCatalogSheet` n'ouvre que `pdfDataUri` ; sans document, aucune ouverture | PA |
| Justificatifs de paiement | Texte libre / `blob:` en démo | PA |

---

## 14. Paiements — état réel de la chaîne `DRAFT → SUBMITTED → APPROVED/REJECTED`

### 14.1 Ce qui est réellement implémenté (MODE DEMO)

| Maillon | Détail | Statut |
|---|---|---|
| Persistance | `PaymentDeclaration[]` dans `MockService`, clé `lelabeur_v5_payment_declarations`, `persistAll()` | RE |
| Création (EMPLOYEUR) | `createPaymentDeclaration` : rôle EMPLOYER, contrat existant **et lui appartenant**, montant entier > 0, moyen de paiement parmi 5, `transactionId` et `reference` obligatoires, `paidAt` non future, justificatif obligatoire (document **ou** référence), statut `DRAFT`, journal d'audit `PAYMENT_DECLARATION_CREATED` | RE |
| Édition | `updatePaymentDeclaration` : réservée au propriétaire, **uniquement si `DRAFT`** | RE |
| Soumission | `submitPaymentDeclaration` : `DRAFT → SUBMITTED`, horodatage `submittedAt`, audit `PAYMENT_DECLARATION_SUBMITTED` | RE |
| Consultation ADMIN | `listSubmittedPaymentDeclarations`, `getSubmittedPaymentDeclaration` : ADMIN uniquement, seulement les `SUBMITTED`, tri par date de soumission décroissante | RE |
| Décision ADMIN | `approvePaymentDeclaration` / `rejectPaymentDeclaration` : `SUBMITTED → APPROVED | REJECTED`, `reviewedBy`, `reviewedAt`, motif obligatoire au rejet, audit `PAYMENT_DECLARATION_APPROVED/REJECTED`, le dossier quitte la file | RE |
| UI employeur | Route `PAYMENTS`, écran `EmployerPaymentsScreen` : création, édition, soumission, filtres (brouillons/soumis/décidés), badge de statut | RE |
| UI ADMIN | Liste « Paiements à vérifier » + détail + décision (approbation/rejet motivé) dans `AdminPaymentsVerification` | RE |
| Historique affiché | Faits de la déclaration complétés par le journal d'audit (`buildAdminPaymentDeclarationHistory`) | RE |
| Idempotence création | Clé réutilisable par l'appelant côté mock | RE (local) |

### 14.2 Ce qui manque (constaté dans le code)

| Manque | Preuve |
|---|---|
| États `UNDER_REVIEW` et `RESUBMITTED` | Déclarés dans `PaymentDeclarationStatus`, libellés et styles présents, **jamais écrits** : aucune transition ne les produit. Un rejet est terminal dans le code actuel (pas de resoumission possible). |
| Groupes de filtres UI | `EmployerPaymentsScreen` affiche les filtres `ALL/UNDER_REVIEW/RESUBMITTED` qui resteront vides ; `SUBMITTED` regroupe `SUBMITTED`+`RESUBMITTED`. |
| Justificatif réel | Aucun upload R2 : `proofDocumentId` est une chaîne saisie ; le justificatif du règlement employeur (`proofUri`) vaut `blob:<nom>` ; aucun binaire n'est persisté. |
| Notifications | Aucune notification sur soumission, approbation ou rejet (ni employeur ni ADMIN). Types de notification dédiés **inexistants** dans `NotificationType`. |
| J+3 / blocage liés à ces déclarations | La déclaration de paiement externe **n'alimente pas** l'échéancier (`paymentSchedule`), ni la commission, ni la régularisation J+3, ni le déblocage : les deux chaînes (commissions 25 % et déclarations externes) sont **parallèles et non connectées**. |
| API | Aucune route `/payments/declarations` : le Worker n'expose rien pour ces opérations (le contrat de routes ne les mentionne pas). En MODE API, les six opérations lèvent 501 (`legacyApiAdapter`). |
| Persistance serveur | Table `payment_declarations` inexistante dans les migrations. |
| Audit serveur | L'audit n'existe que dans le `SystemAuditLog` local (mock), non transactionnel. |

### 14.3 Commission LE LABEUR (chaîne distincte, réellement implémentée)

`declareCommissionPayment` (EMPLOYEUR, à partir de l'échéance, montant exact attendu, preuve et téléphone obligatoires) → `PENDING_VERIFICATION` → `verifyCommissionPayment` (ADMIN → `PAID`) ou `rejectCommissionPayment` (ADMIN + motif → échéance repasse `DUE`) ; notifications `COMMISSION_DECLARED/VERIFIED/REJECTED` vers ADMIN/employeur ; audit ; mise à jour contrat + ledger + échéancier.

---

## 15. Machines à états identifiées

Le diagramme complet est dans `docs/statecharts.mmd`. Synthèse par entité :

### 15.1 Utilisateur / compte
- États : `ACTIVE`, `BLOCKED` (type `AccountStatus`), `PENDING` (stores serveur seulement).
- Transitions réelles : `ACTIVE → BLOCKED` (ADMIN, si échéance ≥ J+3), `BLOCKED → ACTIVE` (ADMIN, si plus rien de dû ni en vérification).
- Garde-fous : ADMIN non bloquable par cette procédure ; connexion refusée si `BLOCKED` ; seules les actions de régularisation restent permises quand bloqué.
- **Absent** : aucune transition `PENDING → ACTIVE` (le statut existe côté serveur mais aucun flux d'invitation/validation ne le produit).

### 15.2 Offre
- États : `ACTIVE`, `PAUSED`, `CANCELLED`, `FILLED`.
- Transitions réelles : `ACTIVE → PAUSED/CANCELLED/FILLED` (EMPLOYEUR propriétaire, `updateOfferStatus`) ; `→ FILLED` automatique à l'activation d'un contrat ; offre `FILLED` non réactivable.
- **Non implémenté** : réouverture, republication, modération ADMIN d'offre (permission `offers:moderate` déclarée, aucun handler).

### 15.3 Candidature
- États : `PENDING`, `REVIEW`, `SHORTLISTED`, `REJECTED`, `WITHDRAWN`, `HIRED`, `CONTRACTED`, `CLOSED_OFFER_FILLED`.
- Transitions réelles : `PENDING → REVIEW` (examen), `REVIEW → SHORTLISTED`, `→ REJECTED` (motif), `→ WITHDRAWN` (candidat, avant contrat, sauf statuts terminaux), `→ HIRED` (activation contrat), `→ CLOSED_OFFER_FILLED` (offre pourvue), `WITHDRAWN → PENDING` (re-candidature).
- **Absent** : `CONTRACTED` jamais atteint (le contrat référence la candidature sans transition dédiée).

### 15.4 Proposition de mission
- États : `DRAFT`, `SENT`, `REVISION_REQUESTED`, `ACCEPTED`, `DECLINED`, `EXPIRED`.
- Transitions réelles : création `SENT` (via génération de contrat **ou** `sendProposal`, appelé uniquement par les tests) ; `SENT → ACCEPTED/REVISION_REQUESTED/DECLINED` (candidat) ; `SENT/REVISION_REQUESTED → ACCEPTED` automatique à l'activation du contrat.
- **Absent** : `DRAFT` (aucun brouillon), `EXPIRED` (aucune expiration) ; aucune notification n'est émise par la génération de contrat via la proposition (seule la notification `CONTRACT_PENDING_SIGNATURE` est émise).

### 15.5 Contrat
- États : `DRAFT`, `PENDING_EMPLOYER`, `PENDING_EMPLOYEE`, `SIGNATURE`, `ACTIVE`, `SUSPENDED`, `INCIDENT`, `TERMINATED`, `COMPLETED`, `REPLACED`.
- Transitions réelles : création `SIGNATURE` ; `SIGNATURE → ACTIVE` (double signature) ; `ACTIVE → SUSPENDED` (arbitrage SUSPENDRE) ; `ACTIVE → INCIDENT` (signalement) ; `ACTIVE|SUSPENDED → ACTIVE` (arbitrage CONTINUER) ; `→ TERMINATED` (arbitrage CLÔTURER/ANNULER, dissociation M2+, divergence annulée) ; `→ REPLACED` (arbitrage REMPLACER) ; `INCIDENT → ACTIVE` (résolution).
- **Absent** : `DRAFT`, `PENDING_EMPLOYER`, `PENDING_EMPLOYEE` jamais écrits ; `COMPLETED` jamais atteint (aucune clôture de fin de contrat) ; `advanceContractMonth` (EMPLOYEUR) n'a **aucun appelant UI** → `currentMonth` ne progresse pas dans l'application.

### 15.6 Incident
- États : `OPEN`, `UNDER_REVIEW`, `WAITING_EMPLOYEE`, `WAITING_EMPLOYER`, `RESOLVED`, `TERMINATED`, `REPLACEMENT_REQUESTED`, `REPLACEMENT_IN_PROGRESS`, `CLOSED`.
- Transitions réelles : `OPEN → RESOLVED | UNDER_REVIEW | CLOSED | REPLACEMENT_REQUESTED` selon la décision ADMIN ; refus si le dossier est déjà traité.
- **Absent** : `WAITING_EMPLOYEE`, `WAITING_EMPLOYER`, `TERMINATED`, `REPLACEMENT_IN_PROGRESS` jamais écrits ; le retour d'état de l'incident après création du remplacement n'existe pas.

### 15.7 Remplacement
- États : `PENDING_OFFER`, `SOURCING_CANDIDATES`, `CANDIDATE_SELECTED`, `TRANSFERRED_TO_EMPLOYER`, `CONTRACT_FINALIZED`.
- Transitions réelles : création `SOURCING_CANDIDATES` (post-arbitrage REMPLACER) ; `→ CANDIDATE_SELECTED` (ADMIN ou employeur propriétaire) ; `→ TRANSFERRED_TO_EMPLOYER` ; `→ CONTRACT_FINALIZED` (nouveau contrat en `SIGNATURE`).
- **Absent** : `PENDING_OFFER` (uniquement présent dans les données de démo).
- Transfert candidat (`CandidateTransfer`) : seul `TRANSFERRED` est écrit ; `SELECTED`, `TRANSFER_PENDING`, `DECLINED`, `COMPLETED` ne sont jamais produits.

### 15.8 Paiements (salaire et commission)
- Salaire : `SCHEDULED → DUE → PENDING_VERIFICATION → PAID | REJECTED` (+ `NOT_APPLICABLE`).
- Commission : identique, avec `REJECTED → DUE` (régularisation) et `NOT_APPLICABLE` dès M2.
- Déclaration externe : `DRAFT → SUBMITTED → APPROVED | REJECTED` (§14).

### 15.9 Notification
- Cycle : `créée (isRead=false) → lue (isRead=true)` via `markAsRead`/`markAllAsRead` (non branchés à l'UI) ; déduplication à la création.
- **Absent** : aucune purge, aucun archivage, aucune limite, aucun écran.

### 15.10 Appels / WebRTC
- États déclarés : `IDLE`, `CALLING`, `RINGING`, `ACCEPTING`, `CONNECTING`, `CONNECTED`, `REJECTED`, `MISSED`, `ENDED`, `FAILED`.
- Écrits dans le repository : `CALLING` (initiation), `ACCEPTING` (acceptation), `REJECTED`, `MISSED`/`ENDED` (fin selon durée).
- États live (non persistés) : `CALLING`, `RINGING`, `ACCEPTING`, `CONNECTING`, `CONNECTED`, `ENDED`, `FAILED`.
- **Absent** : `IDLE` jamais persisté ; `CONNECTED` jamais persisté → l'historique ne reflète pas les appels réellement aboutis.

---

## 16. Diagrammes livrés

| Fichier | Contenu |
|---|---|
| `docs/architecture-global.mmd` | Vue couches complète, adaptateurs, frontière Worker, ports non branchés, intégrations externes. |
| `docs/swimlane-bpmn.mmd` | Couloirs CANDIDATE / EMPLOYER / ADMIN / APPLICATION / API / SERVICES BACKGROUND / SERVICES EXTERNES + décisions. |
| `docs/data-flow.mmd` | DFD : acteurs, processus, magasins de données, systèmes externes, flux entrants/sortants. |
| `docs/statecharts.mmd` | 11 machines à états, avec transitions manquantes annotées. |

---

## 17. Infrastructure de production — état exact

| Sujet | Constat | Statut |
|---|---|---|
| Cloudflare Worker | Code + composition `closed/memory/postgres` ; **aucun `wrangler.toml`, aucun binding, aucun script de déploiement** | CO / NV |
| PostgreSQL | Migrations écrites, non appliquées ; aucun client DB, aucune chaîne de connexion | CO / NV |
| Hyperdrive | Mentionné comme cible du port ; aucun identifiant, aucun binding | CO / NV |
| R2 | Ports + routes + politique d'URL signée ; aucun bucket | CO / NV |
| Queue / Workers consommateurs | Types Outbox + catalogue d'effets ; aucun binding, aucun consumer | CO / NV |
| Cron | Contrat J+3 détaillé ; aucun `[triggers]`, aucun handler planifié | CO / NV |
| Durable Objects / WebRTC | Classe DO dans un template `.ts` ; aucun binding, aucune migration DO | CO / NV |
| Rate limiting | **Aucune occurrence** de rate limit/throttle/quota dans le code | AB |
| Transactions | `TransactionBoundary` + 7 plans documentés ; **aucune implémentation**, y compris mémoire | CO |
| Idempotence | Validation d'en-tête + carte locale non persistante côté mock ; aucune table, aucun rejeu durable ; pont API générant une clé par appel | PA |
| Outbox | Contrats + catalogue d'effets ; aucun producteur/consumer | CO |
| Logs | `observability.ts` (contrat + règles de rédaction) ; en pratique `console.*` épars | CO |
| Monitoring | Aucun outil, aucune métrique, aucun tableau de bord | AB |
| Pagination | `parsePageRequest` (25 par défaut, 100 max, curseur ≤ 512, paramètres dupliqués refusés) + `CursorPage` ; **aucun handler ne l'exerce** ; le mock renvoie des collections complètes | PA |
| Sécurité HTTP | Erreurs normalisées sans fuite 5xx, `cache-control: no-store`, `x-request-id`, same-origin imposé côté client, cookie `__Host-` | RE |
| Secrets | Aucun secret dans le dépôt ; `.env.example` ne contient que des variables publiques et des commentaires ; dépendances `VITE_*` de signaling acceptées uniquement si pré-signées et < 5 min | RE |
| Déploiement | Aucun fichier de déploiement (ni Cloudflare, ni conteneur, ni CI) | AB |

---

## 18. ADMIN — ce que l'ADMIN peut réellement faire aujourd'hui

| Domaine | Lecture | Écriture / décision | Preuve |
|---|---|---|---|
| Utilisateurs | Liste complète (mock) | Blocage (motif + échéance ≥ J+3) / déblocage (contrôles de régularisation) | `AdminDashboardScreen` + `MockService` |
| Offres | Lecture via `getAllOffers` (pas d'écran dédié) | **Aucune** modération ni publication urgente exposée (permission `offers:moderate` non implémentée) | aucun handler |
| Candidatures | `getAllApplications` (écran ADMIN partagé avec l'employeur) | **Aucune** décision ADMIN | `App.tsx` |
| Contrats | Tous les contrats (supervision) | **Aucun** arbitrage contractuel direct hors incidents | `AdminDashboardScreen` |
| Incidents | Liste + détail (motif, description) | Arbitrage 5 décisions avec note ; effets contrat ; création du remplacement | `arbitrateIncident` |
| Remplacements | Liste + statuts | Sélection candidat, transfert, finalisation du contrat | `AdminDashboardScreen` |
| Paiements commission | Liste « à vérifier » | Vérifier / rejeter (motif) | `AdminDashboardScreen` |
| Déclarations de paiement externes | Liste des `SUBMITTED` + détail + historique | Approuver / rejeter (motif obligatoire) | `AdminPaymentsVerification` |
| Statistiques | Compteurs écran (employeurs, J+3, incidents…) ; `getRevenueMetrics` implémenté mais non rendu dans l'écran actif | — | `AdminDashboardScreen`, `mockRepository` |
| Notifications | Joue le rôle de destinataire ADMIN | **Aucune** console de notifications | §12 |
| Audit | `getAllAuditLogs` chargé par l'écran | **Aucun affichage** (variable non rendue) ; pas de filtre, pas d'export | `AdminDashboardScreen` (l. 46/167) |
| Ressources documentaires | — | **Aucun** écran d'administration des PDF | AB |
| Gate d'accès ADMIN | En démo : bouton dédié + rôle ADMIN du compte seed. `AdminLoginGate.tsx` existe mais **n'est monté nulle part** | — | imports |

---

## 19. Incohérences et trous (vérifiés dans le code)

| # | Catégorie | Constat | Preuve |
|---|---|---|---|
| I-01 | UI présente → logique absente | 11 fichiers `src/screens/admin/*` jamais importés (dont un gate ADMIN et une console d'audit) | recherche d'imports |
| I-02 | UI présente → logique absente | `AdminDashboardScreen` charge `auditLogs` mais ne les affiche jamais | `grep auditLogs` |
| I-03 | UI présente → logique absente | Champ « mot de passe » collecté (min. 6 caractères) puis **jamais utilisé** pour authentifier | `AuthScreen.handleSubmit` |
| I-04 | State sans transition | `UNDER_REVIEW`/`RESUBMITTED` (déclarations) déclarés + stylés, jamais produits | `mockRepository` |
| I-05 | State sans transition | `CONTRACTED` (candidature), `DRAFT/PENDING_*`/`COMPLETED` (contrat), `WAITING_*`/`TERMINATED`/`REPLACEMENT_IN_PROGRESS` (incident), `PENDING_OFFER` (remplacement), `PENDING` (compte), `EXPIRED/DRAFT` (proposition), `IDLE/CONNECTED` (appel persisté) | `mockRepository` |
| I-06 | Fonctionnalité sans appelant UI | `advanceContractMonth`, `resolveStartDivergence`, `sendProposal`, `createLeLabeurUrgentJob`, `searchOffers`, `searchCandidates`, `getCallHistory`, `getCommunicationEvents`, `logCommunicationEvent` | recherches d'appels |
| I-07 | Fonctionnalité métier → notification absente | `sendMessage`, `submitPaymentDeclaration`, `approve/rejectPaymentDeclaration`, `finalizeReplacementContract` n'émettent aucune notification | `mockRepository` |
| I-08 | Donnée persistée → jamais exposée | Notifications (aucun écran), audit (aucun rendu), historique d'appels (aucun écran), événements de communication (aucun écran) | §12, §18 |
| I-09 | Notifications → liens morts | `linkRef.screen = 'ADMIN'` et `'APPLICATIONS'` absents de `AppScreen` ; navigation sans URL | `types`, `AppContext` |
| I-10 | Repository présent → API absente | Les 6 opérations de déclaration de paiement lèvent 501 en MODE API ; aucune route correspondante | `legacyApiAdapter` |
| I-11 | Repository présent → API absente | `login`/`register` email, `sendAudioMessage`, `resolveStartDivergence`, `advanceContractMonth`, `dissociateMonth2`, `createReplacementFromIncident`, `createNotification`, `logEvent`, `getRevenueMetrics`… : 501 en MODE API | `legacyApiAdapter` |
| I-12 | API préparée → persistance absente | 89 routes déclarées, une seule famille a un handler réel (`auth/users`) ; aucune table pour payments/incidents/remplacements/messages/notifications/audit/schedules | `routeContracts`, `migrations` |
| I-13 | Autorisation absente / partielle | `getNotifications(userId)` utilise la session mock si présente, sinon **retombe sur `userId` fourni** (en démo, un appelant local peut lire n'importe quelle boîte) | `mockRepository` l. 3256 |
| I-14 | Effet de bord non borné | `resetAllData()` appelle `localStorage.clear()`, donc efface aussi les clés hors LE LABEUR de l'origine | `mockRepository` l. 451 |
| I-15 | Donnée collectée, non persistée | Justificatif de paiement : `proofUri = "blob:<nom>"` (dashboard) ; `proofDocumentId` est une simple chaîne ; aucun binaire | `EmployerDashboardScreen`, `EmployerPaymentsScreen` |
| I-16 | Deux chaînes de paiement parallèles | Les déclarations de paiement externes n'alimentent ni l'échéancier, ni la commission, ni J+3, ni le déblocage | `ensurePaymentSchedule` vs §14 |
| I-17 | Traitement asynchrone annoncé → absent | J+3 « paresseux » : aucune alerte sans nouvelle lecture ; aucun Cron | `syncPaymentSchedule` |
| I-18 | Dépendances mortes | `@google/genai`, `express`, `dotenv` déclarés, jamais importés ; `metadata.json` annonce une capacité Gemini serveur | `package.json`, `metadata.json`, greps |
| I-19 | Préparation non branchée | `PostgreSqlDatabase`, `ObjectStorage`, `OutboxRepository`, `ScheduleWorkerBoundary`, `SignalingCredentialIssuer` : ports sans fournisseur | `backend/services/*` |
| I-20 | Contrôle d'autorisation incomplet | Un compte connecté puis bloqué conserve son `currentUserId` ; les mutations sensibles sont refusées par `assertOperationalActor`, mais l'UI ne se déconnecte pas | tests de blocage |
| I-21 | Comptage de rôle par dénomination | `assertOperationalActor` limite le blocage aux employeurs de fait via `getOverdueDueEntries` (par `contract.employerId`) : un candidat ne peut jamais être bloqué (pas de dette) | `blockUser` |
| I-22 | Idempotence non garantie | Pont API : clé générée par appel ; mock : carte en mémoire perdue au rechargement (sauf rechargement de la clé via `localStorage`, absente) | `legacyApiAdapter`, `mockRepository` |
| I-23 | Documentation interne divergente | `CONTINUITY_CHECKPOINT_2026-10-04.md` annonce « 1 FAIL géographie » et une prochaine action de complétion ; le code actuel déclare explicitement `isComplete === false` et le test 48 l'assume. `FINAL_VALIDATION_REPORT` annonce « build/lint non certifiés » ; `tsc --noEmit` et 996/996 passent aujourd'hui. | docs racine vs exécution |
| I-24 | Fonctionnalité annoncée par un type | `Permission` expose `offers:moderate`, `applications:moderate`, `contracts:moderate`, `match:read:any`, `documents:read:any`, `communications:read:any` : aucune route ni handler ne les exerce | `productionContracts`, `routeContracts` |

---

## 20. Risques

| Risque | Nature | Impact si mise en production en l'état |
|---|---|---|
| Confusion démo/production | Aucun handler métier persisté derrière un catalogue de 89 routes qui « a l'air complet » | Une mise en production donnerait une application vide en 501 |
| Perte de données | Tout l'état métier est dans `localStorage` d'un navigateur | Un changement d'appareil, un vidage de cache ou `resetAllData()` détruit l'intégralité des dossiers |
| Autorité d'identité en démo | `actorId` fourni par l'appelant côté mock ; mot de passe non vérifié | Aucune valeur probante en production ; à ne pas exposer tel quel |
| Notifications invisibles | Les faits métier notifient dans le vide | Les utilisateurs ne sont jamais alertés (impayés, décisions, messages) |
| J+3 non autonome | Alerte uniquement lors d'une lecture | Le blocage J+3 dépend de l'ouverture d'un écran |
| Double chaîne de paiement | Déclarations externes non reliées à l'échéancier | Les commissions 25 % et les règlements externes divergent |
| Preuves non stockées | Justificatif = nom de fichier / texte | Aucune preuve opposable en cas de litige |
| Code mort volumineux | 11 écrans admin + méthodes non appelées | Fausse impression de couverture, coût de maintenance, dette d'audit |
| Secrets et CORS | Frontière correctement fermée, mais aucun déploiement ni rate limiting | À traiter avant ouverture publique |

---

## 21. Comptage des fonctionnalités réellement terminées

**Critère de comptage** : une fonctionnalité est comptée *terminée* quand l'utilisateur final peut l'exécuter de bout en bout (écran → `AppContext` → repository → persistance → relecture), avec autorisations et règles métier actives, **en MODE DEMO**. Les notifications/audit manquants et l'absence de persistance serveur sont comptés comme trous, pas comme fonctionnalités inachevées.

**Résultat : 27 parcours terminés sur 28 identifiés en MODE DEMO ; 1 partiel ; 0 parcours réellement servi par le Worker.**

| # | Parcours | Statut |
|---|---|---|
| 1 | Lancement, onboarding, choix de profil | RE |
| 2 | Connexion/inscription email (pseudo-auth) | RE (démo) |
| 3 | Connexion Google (GSI réel si client ID, sinon simulation) | RE (démo) / PA (prod) |
| 4 | Session locale + déconnexion | RE |
| 5 | Édition de profil + géographie (incomplète) | RE |
| 6 | Création d'offre (employeur) | RE |
| 7 | Suivi de ses offres et statuts | RE |
| 8 | Découverte, recherche et filtres des offres | RE |
| 9 | Favoris | RE |
| 10 | Candidature / retrait | RE |
| 11 | Examen, shortlist, rejet de candidature | RE |
| 12 | Messagerie contextuelle (texte + vocal + lecture) | RE |
| 13 | Réponse à une proposition (accepter/réviser/refuser) | RE |
| 14 | Génération de contrat depuis la conversation | RE |
| 15 | Signature bilatérale et activation (+ offre pourvue) | RE |
| 16 | Déclaration de salaire + confirmation/contestation | RE |
| 17 | Commission M1 : déclaration, vérification/rejet ADMIN | RE |
| 18 | Fin de mission M2+ avec motif | RE |
| 19 | Consultation des contrats et fiche détaillée | RE |
| 20 | Échéancier employeur + déclaration de paiement externe | RE |
| 21 | Contrôle ADMIN des déclarations + décision | RE |
| 22 | Signalement d'incident | RE |
| 23 | Arbitrage ADMIN d'incident | RE |
| 24 | Remplacement : sourcing → transfert → contrat | RE |
| 25 | Blocage / déblocage employeur (J+3) | RE |
| 26 | Supervision ADMIN (compteurs, files d'attente) | RE |
| 27 | Console QA de démonstration (scénarios + tests) | RE |
| 28 | Catalogue de ressources PDF consultable | **PA** (aucun PDF dans le dépôt → catalogue vide) |
| 29 | Appels audio WebRTC de bout en bout | **PA** (client complet, signaling serveur non déployé ; en démo, exige un token pré-signé) |

> Comptage strict : **27 « RE »**, **2 « PA »** (#28, #29), **0 « RE » côté serveur de production**.

---

## 22. Feuille de route (fondée uniquement sur les constats du code)

### P0 — indispensable avant toute production

| # | Élément | Ce qui existe | Ce qui manque | Dépendances | Ordre | Critère de TERMINÉ |
|---|---|---|---|---|---|---|
| P0-1 | Identité serveur réelle | Vérificateur Google RS256/JWKS, service de session, cookie, RBAC, stores SQL | Connexion PostgreSQL (Hyperdrive) + application des migrations 0001/0002 | P0-2 | 1 | Un login Google réel crée une ligne `users` + `external_identities` + `sessions`, et le cookie permet d'appeler `/api/v1/me` après redémarrage du Worker |
| P0-2 | PostgreSQL / Hyperdrive | 9 tables + seed, stores SQL écrits | Provisionnement, `wrangler.toml`, binding, exécution des migrations, table `idempotency` | — | 1 | `SELECT count(*)` sur `users`/`sessions` répond via le Worker en environnement réel |
| P0-3 | Handlers métier serveur | 89 contrats de routes, ports `backend/repositories/contracts.ts` | Implémentations (offres, candidatures, contrats, paiements, incidents, remplacements, messages) | P0-2 | 2 | Plus aucune route métier ne renvoie 501 ; les tests de frontière sont étendus aux mutations persistées |
| P0-4 | Persistance des déclarations de paiement | Modèle, règles, UI employeur+ADMIN | Table, routes, audit transactionnel, R2 pour le justificatif | P0-2, P0-3, P0-7 | 3 | Une déclaration survit à un redémarrage et son justificatif est un objet R2 signé |
| P0-5 | Transactions | 7 plans documentés | Implémentation `TransactionBoundary` en SQL | P0-2 | 2 | Activation de contrat, décision de paiement, blocage : mutation + audit + outbox dans une seule transaction |
| P0-6 | Idempotence durable | Validation d'en-tête, carte locale | Table unique `(actor, command, key)` + empreinte + rejeu | P0-2 | 3 | Rejouer la même commande renvoie le même résultat ; payload différent ⇒ 409 |
| P0-7 | R2 / documents | Ports, types, routes, politique d'URL signée | Bucket, handlers, upload direct, contrôle type/taille | P0-2 | 3 | Upload et download signés vérifiés par tests d'intégration |
| P0-8 | Notifications visibles | ~30 producteurs dédupliqués | Écran/cloche, lecture, `linkRef` aligné sur la navigation, Outbox | P0-3 | 4 | Un utilisateur voit et marque comme lues ses notifications depuis l'application |
| P0-9 | J+3 autonome | Politique exacte + déduplication | Cron + sélection serveur des échéances + audit système | P0-2, P0-5, P0-10 | 5 | Un Cron quotidien produit exactement une alerte par échéance et par destinataire |
| P0-10 | Outbox/Queue | Types, catalogue d'effets | Table, producteurs transactionnels, consumer rejouable | P0-2, P0-5 | 4 | `PAYMENT_DECLARED` consommé au moins une fois, rejeu sans doublon |
| P0-11 | Déploiement & secrets | Aucun fichier de déploiement | `wrangler.toml`, bindings, secrets, CI, environnement | P0-1, P0-2 | 6 | Un déploiement reproductible sert le front et l'API sur la même origine |

### P1 — nécessaire pour une production sérieuse

| # | Élément | Existant | Manquant | Critère de TERMINÉ |
|---|---|---|---|---|
| P1-1 | Signaling WebRTC serveur | Template HMAC + DO, client complet | Déploiement, binding DO, émission de credentials authentifiés | Un appel aboutit entre deux navigateurs réels sans token `VITE_*` |
| P1-2 | TURN temporaire | Client + politique | Fournisseur TURN, émission liée à l'appel | Aucun identifiant TURN permanent, appels fonctionnels derrière NAT |
| P1-3 | Rate limiting | Aucun | Limites par route/acteur | Les endpoints sensibles répondent 429 au-delà du seuil |
| P1-4 | Observabilité | Contrat + règles de rédaction | Logs structurés, métriques, alerting | Taux d'erreur, latence DB et profondeur de file visibles |
| P1-5 | Pagination réelle | Parseur borné + client | Pagination curseur dans tous les handlers et l'UI | Aucune collection globale chargée silencieusement |
| P1-6 | E-mails transactionnels | Aucun | Fournisseur + modèles | Un utilisateur reçoit un e-mail sur les faits critiques |
| P1-7 | Géographie nationale | 12/77/24/94, indicateur `isComplete=false` | 546 arrondissements, 5 295 localités | `getBeninLocationCoverage().isComplete === true` |
| P1-8 | Cycle de vie du contrat | `advanceContractMonth`/`resolveStartDivergence` codés | Écrans + routes + notifications | Passage M1→M2 et arbitrage de divergence exécutables depuis l'UI |
| P1-9 | Nettoyage du code mort | 11 écrans admin, dépendances inutilisées | Décision : brancher ou supprimer | Aucun fichier non importé ; aucune dépendance non utilisée |
| P1-10 | Ressources PDF | Chargeur + lecteur | Dépôt de PDF réels | Le catalogue affiche au moins un document ouvrable |

### P2 — amélioration / optimisation

| # | Élément | Manquant | Critère |
|---|---|---|---|
| P2-1 | Navigation URL/deep-link | Tout est en mémoire | `linkRef` ouvre le bon écran par URL |
| P2-2 | Console d'audit ADMIN | Écran orphelin + variable non rendue | Filtres, pagination, export |
| P2-3 | Statistiques visibles | `getRevenueMetrics` non affiché | Tableau de bord financier réel |
| P2-4 | Messagerie temps réel | Aucune souscription | Messages reçus sans rechargement |
| P2-5 | WhatsApp / communication | Stubs | Intégration réelle ou suppression du code préparatoire |
| P2-6 | Assistant Gemini | Dépendance déclarée non utilisée | Intégration réelle ou retrait de `metadata.json`/`package.json` |
| P2-7 | Qualité | 0 test UI/parcours navigateur | Smoke test navigateur automatisé |

---

## 23. Cloudflare / PostgreSQL / R2 — quand et pourquoi brancher

Principe : **aucune de ces briques n'est nécessaire au MODE DEMO actuel**, et toutes deviennent nécessaires au même moment — celui où l'on veut que les données survivent à l'appareil et que plusieurs utilisateurs interagissent. Il n'y a donc **pas six chantiers indépendants mais un seul seuil** : la première fonctionnalité multi-utilisateur persistée.

| Brique | Quand la brancher | Pourquoi à ce moment précis | Ne pas la brancher avant parce que |
|---|---|---|---|
| **Cloudflare Worker (API)** | Dès que l'on veut plus d'un utilisateur par compte et des données partagées (candidatures reçues par un employeur, décisions ADMIN) | C'est la seule frontière qui peut porter l'identité serveur, les autorisations et l'écriture des règles hors du navigateur | Tant que la démo mono-navigateur suffit, `MockService` couvre le besoin sans coût d'exploitation |
| **PostgreSQL (via Hyperdrive)** | En même temps que le Worker, quand la première table métier doit être écrite (la chaîne identité est déjà écrite et testée) | Sans base, le Worker ne peut servir que `/healthz` et l'identité mémoire, perdue à chaque instance ; les 89 routes restent en 501 | Aucune donnée de valeur n'existe encore côté serveur ; les migrations 0001/0002 suffisent à préparer le terrain |
| **R2** | Dès qu'un document doit être opposable : justificatif de paiement, preuve d'incident, contrat signé, PDF de ressources | Les preuves sont aujourd'hui des noms de fichiers dans `localStorage` ; c'est le premier manque fonctionnel bloquant (P0-4, P1-10) | Un `localStorage` ne transmet pas de binaire, mais il reste suffisant pour une démo |
| **Queue + Outbox** | Dès que plusieurs effets doivent découler d'une même décision sans bloquer l'utilisateur : notification + audit + rafraîchissement d'échéancier | Aujourd'hui ces effets sont synchrones dans le même appel ; en production, ils doivent être rejouables et atomiques avec la mutation | Sans production, les effets synchrones sont plus simples et testables |
| **Cron** | Dès qu'une règle dépend du temps : le J+3 | Le J+3 est aujourd'hui « paresseux » (déclenché par une lecture), donc faillible ; c'est la première règle temporelle du produit | Un Cron sur des données locales n'aurait aucun sens |
| **Durable Objects (signaling)** | Dès que les appels audio doivent fonctionner sans token pré-signé, c'est-à-dire à la première démo réelle avec un tiers | Le client WebRTC est complet ; seul le serveur de signalisation manque (template déjà écrit) | Le mode démo actuel accepte un token pré-signé < 5 min ; au-delà, le signaling échoue volontairement |

**Ordre recommandé** : Hyperdrive/PostgreSQL + Worker (identité) → handlers métier + transactions/idempotence → R2 (preuves) → notifications visibles → Outbox/Queue → Cron J+3 → Durable Objects signaling → rate limiting/observabilité.

---

## 24. Limites de cet audit / non vérifiable dans le repository

| Sujet | Raison |
|---|---|
| Comportement réel Cloudflare (Worker, DO, Queue, Cron, Hyperdrive) | Aucun déploiement, aucun identifiant, aucun binding |
| Comportement réel PostgreSQL | Aucune instance, migrations non appliquées |
| Comportement réel R2 | Aucun bucket |
| Vérification Google en production | Nécessite un `GOOGLE_CLIENT_ID` et un credential signé réel |
| Signaling WebRTC entre deux navigateurs | Nécessite un Worker signaling déployé et des tokens valides |
| Build navigateur | Non exécuté lors de cet audit (aucune source modifiée) ; `tsc --noEmit` et les 996 tests passent |
| Qualité visuelle / responsive | Non évaluée (audit de code, pas de test navigateur) |
| Exactitude du référentiel géographique au-delà des compteurs | Les libellés embarqués n'ont pas été confrontés aux nomenclatures officielles |
| Comportement multi-instances du Worker | `cachedComposition` conserve la composition en mémoire d'instance ; non testable ici |

---

## 25. Annexes

### 25.1 Dépendances déclarées

`react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `tailwindcss`, `motion`, `lucide-react`, `esbuild`, `tsx`, `typescript`, `@types/*` → utilisées.
`@google/genai`, `express`, `dotenv` → **déclarées, jamais importées** (aucune occurrence dans `src/` et `scripts/`).

### 25.2 Matrice synthétique ports ↔ routes ↔ implémentation

| Domaine | Port front | Routes déclarées | Handler Worker | Persistance |
|---|---|---|---|---|
| Auth/Session | `authenticateGoogleCredential`, `logout` | 5 | **RE** (`auth.*`, `me.read`) | mémoire RE / SQL CO |
| Users | `getAllUsers`, `blockUser`, `unblockUser`, `getProfile`, `updateProfile` | 5 + `admin.users.list` | `users.me.read` RE, `admin.users.list` RE (liste), mutations **AB** | mémoire RE / SQL CO |
| Offers | CRUD partiel + favoris | 8 | **AB** (501) | mock RE |
| Applications | 8 opérations | 8 | **AB** | mock RE |
| Proposals | create/respond | 2 | **AB** | mock RE |
| Contracts | 7 opérations | 5 | **AB** | mock RE |
| Payments | 13 opérations | 4 | **AB** | mock RE |
| Schedules | lecture | 2 | **AB** | mock RE |
| Incidents | 4 | 3 | **AB** | mock RE |
| Replacements | 6 | 5 | **AB** | mock RE |
| Messages | 8 | 4 | **AB** | mock RE |
| Notifications | 4 | 3 | **AB** | mock RE |
| Calls | 5 | 7 | **AB** | mock RE |
| Documents | 2 | 3 | **AB** | AB |
| Admin stats/audit | 2 | 2 | stubs `{persistence:'not-configured'}` | AB |

### 25.3 Fichiers de référence les plus significatifs

`src/repositories/mockRepository.ts` (3 492 l.), `src/context/AppContext.tsx` (1 197 l.), `src/types/index.ts` (706 l.), `src/domain/businessRules.ts`, `src/domain/adminPaymentReview.ts`, `src/backend/api/routeContracts.ts` (89 routes), `src/backend/api/worker.ts`, `src/backend/identity/sessionService.ts`, `src/backend/identity/googleVerifier.ts`, `src/backend/services/scheduler.ts`, `src/backend/services/transactions.ts`, `docs/PRODUCTION_BACKEND_BOUNDARY.md` (documentation projet, recoupée avec le code).

---

*Fin de l'audit. Aucun fichier source n'a été modifié ; seuls les documents d'audit listés en tête de ce rapport ont été ajoutés.*
