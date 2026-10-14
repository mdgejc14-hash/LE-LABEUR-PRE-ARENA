# G — Registre consolidé des écarts

> Registre **dédupliqué** : un écart = une cause, même s'il touche plusieurs écrans. Aucune correction n'est proposée ici.
> Criticité : **BLOQUANT** = empêche le lancement d'un parcours principal (B) ; **SECONDAIRE** = limite, dette ou incohérence
> sans arrêt de parcours. Catégories : `frontend`, `backend`, `infra`, `contenu légal`, `décision métier`, `design`, `outillage`.
> Les `BACKEND_GAP` déclarés par écran (fichiers `src/*/gaps.ts`) sont listés fiche par fiche dans D ; ils sont ici regroupés par cause.

## 1. Écarts bloquants

| ID | Écart | Écrans concernés | Flux bloqué | Preuve | Catégorie |
|---|---|---|---|---|---|
| G-FE-03 | `contracts.activate` (handler présent) **n'est appelé par aucun frontend** | EMP-29…31, PRE-21…24, puis tout l'aval | contrat jamais `ACTIVE` → pas d'échéancier/salaire (5.1), pas de `terminate`/`end`, pas de litige `CONTRACT_INCIDENT`, pas de session RTC | `donnees/contrats-api.json` (`usedByScreens` vide, absent du legacy) ; `contractTransitions.ts:153-175` ; `webrtcRepository.ts:548` ; `claimRepository.ts:584` | frontend + décision métier (déclencheur d'activation, I-DEC-06) |
| G-FE-04 | Chaîne d'embauche absente des espaces Master : `proposals.create`, `proposals.respond`, `contracts.create`, `contracts.finalize-hiring` jamais appelés par les écrans de famille | EMP-21…28, PRE-16…20, EMP-56…58 (remplacement) | présélection → proposition → contrat | `donnees/contrats-api.json` ; gaps EMP-21/23/24, PRE-16/17 ; legacy seul appelant (non vérifié en MODE API) | frontend |
| G-BE-01 | Lecture des candidatures côté candidat : `applications.read`, `applications.mine.list` sans handler | PRE-01, PRE-09…15 | suivi de candidature | sonde : 501 dans les 4 compositions ([C2](C2-contrats-api.md)) | backend |
| G-BE-02 | Messagerie, appels hors WebRTC, incidents, ressources, plannings, favoris : 501 **et aucune table** | EMP-21 (conversation), PRE-32/33 (planning), legacy | messagerie encadrée, planning | 39 contrats sans handler (C §3) ; liste des `CREATE TABLE` (E §1) | backend + décision métier |
| G-BE-03 | Auth publique absente : inscription, OTP, récupération, consentement, rôle d'onboarding, politique téléphone | PUB-03, PUB-05…08 | création de compte et consentement | `src/public/gaps.ts:20-103` ; boutons désactivés `PublicPage.tsx:274,282,288,295` | backend + contenu légal |
| G-SEC-04 | La route Google `intent=register` peut créer un compte actif **sans vérification téléphone ni preuve de consentement** | PUB-04/05 | conformité de l'inscription | `PUBLIC_AUTH_GAPS['PUB-05']` (`src/public/gaps.ts`) ; `identityWorker.ts` | backend + contenu légal |
| G-FE-05 | RTC : `signaling.send/poll`, `credentials.create`, `transport-connected` jamais appelés | RTC-03, RTC-04 | aucun média ; `ACTIVE` exige deux `transport-connected` | `donnees/contrats-api.json` ; `webrtcRepository.ts:824` | frontend |
| G-FE-01 | Aucun lien de l'application legacy (destination post-connexion `/`, `PublicPage.tsx:227`) vers `/client`, `/prestataire`, `/admin` | toutes les familles | accès aux espaces Master Design hors saisie d'URL | recherche des littéraux dans `src/App.tsx`, `src/screens`, `src/context`, `src/components` : 0 occurrence | frontend + décision métier (I-DEC-04) |
| G-INF-01 | `GOOGLE_CLIENT_ID = ""` dans `wrangler.toml` → composition **fermée** : 149 routes → 401, 11 → 501 | tous | toute l'application connectée | sonde « closed » : 0 handler ; `entry.ts:6,448,469` | infra |
| G-INF-02 | Production sans Hyperdrive (commenté `wrangler.toml:161`) ni R2 (`:176`) ; ID Hyperdrive local placeholder (`:67`) | tous / documents | persistance, documents | `wrangler.toml` | infra |
| G-INF-03 | Aucun hébergement du frontend ni proxy same-origin `/api/v1` déclaré (`wrangler.toml` sans `assets`) alors que le MODE API exige un chemin same-origin | tous | MODE API en production | `wrangler.toml` ; `src/repositories/mode.ts:25-35` | infra (À VÉRIFIER : hébergement externe éventuel non versionné) |
| G-FE-08 | MODE DEMO par défaut : aucune famille n'appelle l'API sans `VITE_DEMO_MODE=false` + `VITE_API_BASE_PATH` | toutes | tout appel serveur | `mode.ts:25-35`, `src/*/hooks.ts` | infra + décision métier (I-DEC-08) |
| G-FIN-01 | Domaine FIN : trois modèles de prix/commission incompatibles ; FIN-01…03 sans route | FIN-01…03, PUB-02, EMP-41…47, PRE-34…39 | toute décision financière | E §6 | **décision métier — BLOQUÉ_EN_ATTENTE_DÉCISION** |
| G-INF-04 | Aucun fournisseur de paiement enregistré | EMP-41…47, ADM-18…22 | règlement externe, webhooks (401 au handler) | `paymentRepository.ts:2871-2908` | infra + décision métier |

## 2. Écarts secondaires

| ID | Écart | Écrans | Preuve | Catégorie |
|---|---|---|---|---|
| G-FE-02 | Liens vers des chemins hors design qui tombent sur un écran de repli : `/client/litiges` (4 occurrences de `Link`, rendues par 9 fiches), `/prestataire/contrats` (1 occurrence, 2 fiches) | EMP-39, EMP-48…55 ; PRE-16, PRE-20 | `src/employer/screens/claims.tsx:157,353,429`, `src/employer/screens/payments.tsx:625`, `src/prestataire/screens/proposals.tsx:122` ; résolution sonde `rr.mts` → EMP-49 / PRE-21 sans fiche ; `ShellRoute.tsx:196,241` | frontend |
| G-FE-06 | RTC inatteignable depuis EMP/PRE (aucun lien vers `/appel(s)`) | RTC-01…08 | `donnees/ecrans.json` (`hrefTargets`) | frontend |
| G-FE-09 | Projection d'erreur : 400 et 501 absents de `STATE_GUARD_KEYS` → affichés comme `500` (sauf interceptions locales) | toutes familles | `src/*/errors.ts:22`, `stateGuardCatalog.ts:7` | frontend + design |
| G-FE-10 | Profil non modifiable (`users.me.update` 501) | EMP-03, EMP-04 | sonde ; gaps | backend |
| G-FE-11 | 36 écrans de famille sans aucun appel API (ADM 34 diagnostiques, EMP-04, EMP-26) ; PRE-11/15 n'appellent que des 501 | voir D | `donnees/ecrans.json` | frontend + backend |
| G-FE-12 | 17 contrats avec handler **sans aucun appelant frontend** (hors G-FE-03/04) : `proposals.expire`, `payments.advance-month`, `admin.payments.reconcile`, `admin.payment-reconciliation.batches.create`, `admin.claims.restriction.apply/release`, `reputation.mine.reconcile`, `documents.versions.content.download`, `documents.links.list/create`, `matching.qualification.summary`, `auth.google`, `contracts.end` (+ webhooks, par nature) | ADM-19, ADM-28/29, PRE-45, PRE-48/49, PRE-07 | C §5 | frontend |
| G-BE-04 | Statuts de schéma sans transition : contrat `PENDING_EMPLOYER`, `PENDING_EMPLOYEE`, `INCIDENT`, `SUSPENDED` (lu, jamais écrit) ; proposition `DRAFT`, `REVISION_REQUESTED` ; litige `CLOSED` ; utilisateur `PENDING` | — | E §2 | backend + décision métier |
| G-BE-05 | `proposals.conversation_id` obligatoire mais jamais vérifié (aucune table, aucune FK) | EMP-21 | `0004_proposals.sql:23`, `proposalRepository.ts:530-531` | backend + décision métier (I-DEC-05) |
| G-BE-06 | Matching : aucun consentement candidat, aucun filtre de réputation ni de qualification candidat ; bassin plafonné à 200 (409 au-delà) | EMP-18…20 | `sqlMatchingStores.ts:254-262`, `matchingRepository.ts:35,421-424` | décision métier |
| G-BE-07 | ADMIN : déblocage utilisateur et affectation/transfert/finalisation de remplacement 501 ; aucune action ADMIN sur contrat ; ops/sécurité/infra sans contrat (ADM-44…63) | ADM-04/05, ADM-14/16, ADM-31…33, ADM-44…63 | sonde ; gaps ADM | backend |
| G-BE-08 | Données publiques absentes (`/public/story`, `/public/stats`), santé publique `/api/v1/health` (seul `/healthz` existe), maintenance sans source | PUB-02, PUB-10 | `src/public/gaps.ts:82-89` | backend |
| G-SEC-01 | Permissions grossières : `incidents:arbitrate` couvre 10 contrats hétérogènes ; `payments:read:any` autorise 3 écritures ; `contracts:moderate`/`applications:moderate` inutilisées ; un seul profil ADMIN | ADM | E §3 | backend + décision métier (I-DEC-07) |
| G-SEC-02 | Rate limiter en mémoire par isolat (non global) | — | `security.ts:189-198` | infra |
| G-SEC-03 | 6 clés du mapping de seaux sans contrat correspondant (les contrats réels n'ont pas le seau prévu) | — | `donnees/inventaire.json` `rateLimitOrphans` | backend |
| G-OPS-01 | Aucune supervision des outbox `DEAD_LETTER` / jobs `FAILED` (aucun contrat, ADM Ops diagnostiques) | ADM-44…46 | `automation/worker.ts:53-65,383` | backend + décision métier |
| G-INF-05 | Aucun fournisseur push / email / SMS / WhatsApp | ADM-41…43, notifications | `channels.ts:44-100`, `0012:47-49` | infra |
| G-INF-06 | Aucun serveur TURN (override seulement) | RTC-07 | `webrtc.sessions.ice-configuration` | infra |
| G-INF-07 | `npm install` échoue sans `--legacy-peer-deps` (ERESOLVE : vite 8.3.4 attend esbuild ^0.27‖^0.28, racine épingle ^0.25) | — | journal d'installation | outillage |
| G-INF-08 | Bundle principal ≈ 809 kB (avertissement Vite) | — | `npm run build` | outillage |
| G-LEG-01 | Rétention documentaire `PENDING_LEGAL_VALIDATION` | PRE-48/49, ADM-37…40 | `0016_documents.sql:90` | contenu légal |
| G-LEG-02 | Consentement légal non enregistrable ; contrat signé sans consentement structuré (`contracts.sign` sans corps) | PUB-08, PRE-24 | `src/public/gaps.ts:44-46` ; `routeContracts.ts` | contenu légal + backend |
| G-DES-01 | Incohérences documentaires du design : `units.py` annonce 176 canons (calculé 177) et 33 unités ADM (calculé 34) ; `le-labeur-screens.csv` cité mais non versionné | — | `design/llab/units.py`, `design/README.md` | design |
| G-DES-02 | PUB-01 a pour route Master `/` mais est servi sur `/ouverture` (`/` = legacy) | PUB-01 | `src/public/catalog.ts` | design + décision métier |
| G-TST-01 | `verify:admin-ui` non déterministe : 1ʳᵉ exécution échec à ADM-38 (« état serveur non relu après révocation », `scripts/verify-admin-ui.ts:2528`) après 43 PASS ; 2ᵉ exécution 56/56 PASS | ADM-38 | `00-INDEX.md` §8 | outillage |
| G-DOC-01 | `docs/ARCHITECTURE_REVERSE_ENGINEERING.md` (commit `ca99324`) est antérieur aux espaces Master et partiellement obsolète ; non modifié, remplacé pour l'usage par ce dossier | — | `git log -- docs/ARCHITECTURE_REVERSE_ENGINEERING.md` | outillage |
| G-GIT-01 | PR #47 : tête `43aa2a4` non ancêtre de HEAD (remplacée par `b551445`) ; fusion #47 puis #48 → conflit probable sur `docs/P0-DESIGN-FOUNDATION.md` | — | H §2 | outillage (Git) |

## 3. Synthèse par catégorie

| Catégorie | Bloquants | Secondaires |
|---|---|---|
| frontend | G-FE-01, G-FE-03, G-FE-04, G-FE-05, G-FE-08 | G-FE-02, 06, 09, 11, 12 |
| backend | G-BE-01, G-BE-02, G-BE-03, G-SEC-04 | G-FE-10, G-BE-04…08, G-SEC-01, G-SEC-03, G-OPS-01 |
| infra | G-INF-01…04 | G-SEC-02, G-INF-05, G-INF-06 |
| contenu légal | (G-BE-03, G-SEC-04) | G-LEG-01, G-LEG-02 |
| décision métier | G-FIN-01 (+ volets de G-FE-01/03/08, G-BE-02) | G-BE-06, G-SEC-01, G-OPS-01, G-DES-02 |
| design / outillage | — | G-DES-01, G-INF-07, G-INF-08, G-TST-01, G-DOC-01, G-GIT-01 |
