# P4A-DESIGN-ADMIN-CORE — espace supervision (7 unités / 12 fiches)

Tranche de design : la **première partie de la famille ADM** (Master Design, rôle produit
`ADMIN`) est rendue dans l'application, avec les **routes réelles** du routeur P0, les
**API existantes** et **aucune donnée inventée**. Aucun concept métier du produit n'est
renommé, aucun endpoint n'est créé, aucune migration n'est ajoutée, le backend métier n'est
pas modifié, le modèle financier n'est pas touché. PUB/SYS (P1), EMP (P2) et PRE (P3) ne sont
pas modifiés ; les autres unités ADM (contrats, paiements, salaires, litiges, remplacements,
réputation, documents, notifications, ops, sécurité avancée, infra), FIN et RTC restent hors
périmètre (tranches P4B/P5 suivantes).

## 1. Source de vérité et catalogue généré

| Élément | Source | Généré |
| --- | --- | --- |
| Unités ADM de la tranche (7) | Master Design (`design/llab/content/adm_*.py`, `design/llab/units.py`) | `src/admin/catalog.ts` par `scripts/design/generate-admin-catalog.py` |
| Fiches ADM de la tranche (12) | idem | idem |
| Zones / états / composants des fiches | idem | `src/admin/catalog.ts` |
| Statuts produit, libellés, formatters | code du produit | `src/admin/vocabulary.ts` (écrit à la main, testé) |

`src/admin/catalog.ts` est **généré** : il ne se modifie jamais à la main. Parité vérifiée par
`python3 scripts/design/generate-admin-catalog.py --check` (scripts npm `design:admin` /
`design:admin:check`) et par le test ADM « catalogue généré identique à la source ».

**Regroupement par unités réelles du Master** (`design/llab/units.py`), jamais par plage
numérique : ADM-01 (tableau de bord) ; ADM-02 = {ADM-02, ADM-03} (utilisateurs liste & fiche) ;
ADM-04 = {ADM-04, ADM-05} (blocage geste + journal) ; ADM-06 = {ADM-06, ADM-07} (qualification
file & revue) ; ADM-08 = {ADM-08, ADM-09} (qualification décision + historique) ;
ADM-10 = {ADM-10, ADM-12} (matching runs & règles) ; ADM-11 (matching audit). Les fiches
ADM-13 à ADM-63 sont hors tranche et absentes du catalogue.

## 2. Règles non négociables de la tranche

1. **Vocabulaire du produit, jamais celui du design.** Correspondance documentée, jamais
   affichée :

   | Fiche (Master Design) | Concept produit affiché |
   | --- | --- |
   | « Mission » | **Offre** (`OFFER`) |
   | « Client » | **Employeur** (`EMPLOYER`) |
   | « Prestataire » | **Candidat** (`CANDIDATE`) |
   | « Candidature » | **Candidature** (`APPLICATION`) |
   | « Proposition » | **Proposition** (`PROPOSAL`) |
   | « Contrat » | **Contrat** (`CONTRACT`) |
   | « Litige » | **Claim** (`CLAIM`) |
   | « Paiement / Salaire » | **Paiement** (`PAYMENT`) / **Salaire** (`SALARY`) |
   | « Remplacement » | **Remplacement** (`REPLACEMENT`) |
   | « Matching » | **Matching** (`MATCHING`) |
   | « Document » | **Document** (`DOCUMENT`) |
   | « Qualification » | **Qualification** (`QUALIFICATION` — moteur réel `matching.qualification.*`) |
   | « Utilisateur » | compte produit (rôles `EMPLOYER` / `CANDIDATE` / `ADMIN`, statuts `ACTIVE` / `BLOCKED` / `PENDING`) |

   Le tableau de référence est `DESIGN_ONLY_TERMS_NOT_RENDERED` (`src/admin/vocabulary.ts`) :
   « Mission », « Client », « Prestataire », « Prestation », « Litige » et leurs pluriels. Le
   test ADM refuse tout fichier livré qui **affiche** un de ces termes (texte JSX, libellés
   d'affichage, lignes BACKEND_GAP affichées telles quelles et HTML réellement rendu). Les
   chemins réels (`/admin/utilisateurs/:id`) et les identifiants serveur (`USER_BLOCKED`,
   `MISSION_QUALIFICATION_REVIEWED`) restent strictement inchangés — ce sont des valeurs du
   produit, pas des libellés. Le préfixe CSS de l'espace est `lbm-admin`.

2. **Aucune donnée inventée.** Sans source configurée (`VITE_DEMO_MODE` /
   `VITE_API_BASE_PATH`), l'écran affiche « Source de données non configurée » + la
   **structure déclarée de la fiche** (une zone par genre déclaré, `data-sheet-frame`) :
   jamais de valeur de démonstration. Une capacité absente du backend est déclarée en clair
   (`data-backend-gap`, `src/admin/gaps.ts` — au moins une ligne par fiche, 12 fiches
   couvertes). Une valeur absente s'affiche « — » : **jamais un zéro présenté comme réel**.

3. **Aucune nouvelle API.** Chaque chemin appelé est vérifié par test contre
   `src/backend/api/routeContracts.ts` (`ADMIN_API_PATHS`, 8 chemins). Les routes déclarées
   **sans handler installé** ne sont jamais présentées comme disponibles : le déblocage
   (`admin.users.unblock`, 501 réelle) est affiché **indisponible** ; les lectures ADMIN de
   runs, d'événements de matching, de règles, d'historique de qualification et de journal
   des blocages sont des états BACKEND_GAP.

4. **Permissions serveur seules.** La garde d'écran n'ouvre l'espace qu'à un compte `ADMIN`
   actif ; le serveur reste l'autorité sur chaque appel (`users:read:any`, `users:block`,
   `offers:moderate`, `stats:read`, `audit:read`, `incidents:read:any`). Les permissions
   affichées sont celles dérivées par le serveur pour la session. Aucun blocage, aucune
   décision de qualification, aucune règle de matching n'est décidée côté client.

5. **Workflows réels uniquement.** Blocage = `admin.users.block` réel (motif obligatoire,
   idempotent, verrouillage de ligne, révocation des sessions, audit `USER_BLOCKED`,
   disponible uniquement avec persistance PostgreSQL durable). Qualification = file réelle
   `matching.qualification.review.list` + décision réelle `matching.qualification.review`
   (deux conclusions acceptées : `ELIGIBLE_FOR_INDEPENDENT` / `BLOCKED`, motif 10–1000
   caractères, usage unique, idempotente, auditée). Matching = aucune route ADMIN ; seules les
   versions de règles **réellement observées** dans la file sont affichées. Statuts réels
   du moteur vérifiés dans `src/backend/matching/records.ts` (`QUALIFICATION_DECISIONS`) et
   testés par parité exacte.

## 3. Écrans livrés (unités → routes)

| Unités (fiches) | Routes réelles consommées | État |
| --- | --- | --- |
| ADM-01 (tableau de bord) | `admin.users.list`, `matching.qualification.review.list`, `admin.stats.read`, `admin.audit.list`, `admin.incidents.list` | partiel |
| ADM-02 (registre utilisateurs) | `admin.users.list` (recherche/filtres locaux sur données réelles) | partiel |
| ADM-03 (fiche utilisateur) | `admin.users.list` (fiche composée depuis la page réelle ; pas de lecture individuelle) | partiel |
| ADM-04 (blocage) | `admin.users.block` (POST réel, idempotent, audité) | partiel |
| ADM-05 (journal des blocages) | aucune (état BACKEND_GAP affiché) | backend_gap |
| ADM-06 (file de qualification) | `matching.qualification.review.list` (pagination curseur réelle) | partiel |
| ADM-07 (revue humaine) | `matching.qualification.review.list` (élément réel de la file) | partiel |
| ADM-08 (décision de revue) | `matching.qualification.review` (POST réel, idempotent, audité) | partiel |
| ADM-09 (historique) | aucune (état BACKEND_GAP affiché) | backend_gap |
| ADM-10 (matching — runs) | aucune route ADMIN (état réel affiché) | backend_gap |
| ADM-11 (matching — audit) | aucune route ADMIN (`matching.runs.read` est réservée à l'employeur propriétaire) | backend_gap |
| ADM-12 (matching — règles) | `matching.qualification.review.list` (versions réellement observées) | backend_gap |

## 4. Matrice de traçabilité par unité (mission §13)

Légende : **INTÈGRÉ** = écran + API réelles couvrant la fiche ; **PARTIEL** = écran réel +
API réelles mais capacités absentes déclarées ; **BACKEND_GAP** = écran livré, capacité
serveur absente (aucune donnée inventée) ; **NON INTÉGRÉ** = hors tranche.

| Code design | Unité | Route | Composant UI | API réelle (routeContracts) | Permission serveur | États gérés | Vocabulaire affiché | BACKEND_GAP | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ADM-01 | ADM-01 | `/admin` | `Admin01Dashboard` (`screens/overview.tsx`) | `admin.users.list`, `matching.qualification.review.list`, `admin.stats.read`, `admin.audit.list`, `admin.incidents.list` | `users:read:any`, `offers:moderate`, `stats:read`, `audit:read`, `incidents:read:any` | chargement, prêt, erreur (StateGuard), source absente (« — »), non livré (tranches suivantes) | Utilisateurs, Comptes bloqués, Qualifications en revue, Offre, Employeur, Claim, Remplacement, Document | overview/queues/summary/activity/health absents ; métriques vides ; mode incident absent | **PARTIEL** |
| ADM-02 | ADM-02 | `/admin/utilisateurs` | `Admin02Users` (`screens/users.tsx`) | `admin.users.list` | `users:read:any` | chargement, prêt, erreur, vide, filtre local | Utilisateurs, Employeur, Candidat, Admin, Actif, Bloqué | recherche/filtres serveur, export CSV, pagination curseur, compteurs d'activité | **PARTIEL** |
| ADM-03 | ADM-02 | `/admin/utilisateurs/:id` | `Admin03UserSheet` (`screens/users.tsx`) | `admin.users.list` (page réelle) | `users:read:any` | chargement, prêt, erreur, introuvable (état honnête), permission affichée | Fiche utilisateur, Contrat, Candidature, Claim | lecture individuelle, timeline, notes, indicateurs d'activité, « envoyer en revue », journal des consultations | **PARTIEL** |
| ADM-04 | ADM-04 | `/admin/utilisateurs/:id/blocage` | `Admin04Block` (`screens/users.tsx`) | `admin.users.block` (POST `{reason}`, idempotent) | `users:block` | chargement, prêt, erreur de commande (état + corrélation), succès (statut réel), déjà bloqué, auto-blocage refusé, permission manquante | Blocage de compte, Bloqué, motif, sessions révoquées | portée/durée absentes (blocage total réel), déblocage 501 (handler absent), contre-signature absente, simulateur d'effets absent, handler PostgreSQL-only | **PARTIEL** |
| ADM-05 | ADM-04 | `/admin/blocages` | `Admin05BlockJournal` (`screens/users.tsx`) | aucune | — | source absente (état réel), vide | Journal des blocages, Utilisateur | `admin.blocks.list/stats/export` absents ; ledger `USER_BLOCKED` non relisable | **BACKEND_GAP** |
| ADM-06 | ADM-06 | `/admin/qualification` | `Admin06QualificationQueue` (`screens/qualification.tsx`) | `matching.qualification.review.list` | `offers:moderate` | chargement, prêt, erreur, file vide (état satisfaisant), pagination réelle | Qualifications en revue, Offre, Employeur, Revue humaine requise | claim (verrou), SLA, filtres serveur, métriques de délai | **PARTIEL** |
| ADM-07 | ADM-06 | `/admin/qualification/:id` | `Admin07QualificationReview` (`screens/qualification.tsx`) | `matching.qualification.review.list` (élément réel) | `offers:moderate` | chargement, prêt, erreur, hors file (état honnête), réponses en lecture seule | Revue humaine, Éligible, Bloqué, motifs réels (code, catégorie, sévérité) | lecture individuelle, demande de complément, récusation, checklist persistée | **PARTIEL** |
| ADM-08 | ADM-08 | `/admin/qualification/:id/decision` | `Admin08QualificationDecision` (`screens/qualification.tsx`) | `matching.qualification.review` (POST `{decision, reason}`, idempotent, audité) | `offers:moderate` | chargement, prêt, erreur de commande, succès (verdict réel + effets réels), déjà revue (409), validation motif 10–1000 | Décision de revue, Éligible, Bloqué, motif, revue par, horodatage serveur | troisième option « complément requis » absente, brouillon absent, effects-preview absent | **PARTIEL** |
| ADM-09 | ADM-08 | `/admin/qualification/historique` | `Admin09QualificationHistory` (`screens/qualification.tsx`) | aucune | — | source absente (état réel), vide | Historique des qualifications | history/analytics/export absents ; audit `MISSION_QUALIFICATION_REVIEWED` non relisable | **BACKEND_GAP** |
| ADM-10 | ADM-10 | `/admin/matching` | `Admin10MatchingRuns` (`screens/matching.tsx`) | aucune route ADMIN | — | source absente (« — »), vide, non livré | Runs de matching, Offre, Employeur | liste/retry/health runs absents, `admin.match-events` 501 (handler absent), métriques de santé absentes | **BACKEND_GAP** |
| ADM-11 | ADM-11 | `/admin/matching/runs/:id` | `Admin11MatchingAudit` (`screens/matching.tsx`) | aucune route ADMIN (`matching.runs.read` = propriétaire EMPLOYER, 403 réel pour un ADMIN) | — | source absente, vide | Audit de run, Candidat, Facteurs | lecture de run, tests de biais, kill switch facteur absents | **BACKEND_GAP** |
| ADM-12 | ADM-10 | `/admin/matching/rulesets` | `Admin12MatchingRules` (`screens/matching.tsx`) | `matching.qualification.review.list` (versions réellement observées) | `offers:moderate` (file) | chargement, prêt, erreur, « — » (aucune version observée) | Règles existantes, Éligible / Revue humaine requise / Bloqué (décisions réelles), lecture seule | rulesets read/simulate/activate absents, édition des poids absente, aucune version inventée | **BACKEND_GAP** |

Unités hors tranche (rappel) : ADM-13 → ADM-63, FIN-01 → FIN-03, RTC — **NON INTÉGRÉ**
(réponse « écran de production non intégré » de la fondation, état honnête).

## 5. Ce qui est réellement disponible (et affiché comme tel)

- **Registre des utilisateurs réel** : `GET /api/v1/admin/users` (handler réel, DTO réel :
  identifiant, rôle, statut, nom affiché, e-mail masqué à l'affichage, date d'inscription).
- **Blocage réel** : `POST /api/v1/admin/users/:userId/block` (permission `users:block`,
  motif ≥ 3 caractères, idempotent, statut `BLOCKED`, sessions révoquées, audit
  `USER_BLOCKED`). **Le déblocage n'existe pas** (route déclarée, handler absent, 501) :
  affiché indisponible, jamais comme une action fonctionnelle.
- **File de qualification réelle** : `GET /api/v1/admin/qualifications/review`
  (permission `offers:moderate`, pagination curseur réelle, qualification + offre +
  employeur réels, `HUMAN_REVIEW_REQUIRED`).
- **Décision de revue réelle** : `POST /api/v1/admin/qualifications/:qualificationId/review`
  (deux conclusions acceptées, motif 10–1000 caractères, usage unique, idempotente, auditée).
- **Frontières de contrôle réelles** : `admin.stats.read` (métriques vides), `admin.audit.list`
  et `admin.incidents.list` (réponses sans données métier) — affichées « — » / indisponible.
- **Matching** : aucune route ADMIN. Les lectures réelles sont réservées à l'employeur
  propriétaire. Les règles affichées sont les versions réellement observées ; les trois
  décisions possibles sont les statuts réels du moteur.

## 6. Non-régressions assurées par les tests

- `npm test` : 1776/1776 PASS, dont la suite P4A (20 cas) et les suites P0/P1/P2/P3 mises à
  jour (index `/admin` = ADM-01 ; intégration PARTIEL = PUB + SYS + EMP + PRE + 7 unités ADM).
- `npx tsc --noEmit` : propre.
- `npm run build` : OK (bundle `admin/registry` isolé par chargement à la demande).
- `npm run verify:postgres` : 28/28 PASS. `npm run verify:workerd` : 18/18 PASS.
- `git diff --check` : propre.
- Le backend métier, EMP, PRE et PUB ne sont pas modifiés (aucun changement sous
  `src/backend`, `src/employer` hors test d'intégration, `src/prestataire` hors test
  d'intégration, `src/public`).
