# P2-DESIGN-EMPLOYER — espace employeur (32 unités / 60 fiches)

Tranche de design : l'espace **Employeur** (famille `EMP` du Master Design, rôle produit
`EMPLOYER`) est rendu dans l'application, avec les **routes réelles**, les **API existantes** et
**aucune donnée inventée**. Aucun concept métier du produit n'est renommé, aucun endpoint n'est
créé, aucune migration n'est ajoutée, le modèle financier n'est pas touché.

## 1. Source de vérité et catalogue généré

| Élément | Source | Généré |
| --- | --- | --- |
| Unités EMP (32) | Master Design (`design/llab`, famille EMP) | `src/employer/catalog.ts` par `scripts/design/generate-employer-catalog.py` |
| Fiches EMP (60) | idem | idem |
| Zones / états / composants des fiches | idem | `src/employer/catalog.ts` |
| Statuts produit, libellés, formatters | code du produit | `src/employer/vocabulary.ts` (écrit à la main, testé) |

`src/employer/catalog.ts` est **généré** : il ne se modifie jamais à la main.
Parité vérifiée par `python3 scripts/design/generate-employer-catalog.py --check`
(script npm `design:employer:check`) et par le test EMP « catalogue généré identique à la source ».

Chiffres : **120 unités** au total (PUB 10, EMP 32, PRE 26, ADM 34, RTC 5, SYS 10, FIN 3) ;
**60 fiches EMP** → 44 canons → **32 unités**, toutes de rôle `EMPLOYER`.

## 2. Règles non négociables de la tranche

1. **Vocabulaire du produit, jamais celui du design.** Correspondance documentée, jamais affichée :

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

   Le tableau de référence est `DESIGN_ONLY_TERMS_NOT_RENDERED` (`src/employer/vocabulary.ts`).
   Le test EMP refuse tout fichier livré qui **affiche** un de ces termes (texte JSX ou libellé
   d'affichage : `title`, `lede`, `label`, `placeholder`…). Les comparaisons techniques et les
   chemins réels (`/client/missions/:id`, `/client/litiges/:id`) restent, eux, strictement
   inchangés — c'est aussi ce que les tests garantissent.

2. **Aucune donnée inventée.** Sans source configurée (`VITE_DEMO_MODE` / `VITE_API_BASE_PATH`),
   l'écran affiche « Source de données non configurée » + la **structure déclarée de la fiche**
   (une zone par genre déclaré, `data-sheet-frame`) : jamais de valeur de démonstration, jamais de
   coquille vide. Une capacité absente du backend est déclarée en clair (`data-backend-gap`).

3. **Aucune nouvelle API.** Chaque chemin appelé est vérifié par test contre
   `src/backend/api/routeContracts.ts` (`EMPLOYER_API_PATHS`).

## 3. Écrans livrés (unités → routes)

| Unités | Routes réelles consommées | État |
| --- | --- | --- |
| EMP-01 (tableau de bord, `/client`) | `offers.mine.list`, `applications.offer.list`, `notifications.*` | partiel |
| EMP-02 → EMP-04 (notifications, profil, paramètres) | `notifications.*`, `auth.session`, `documents.*` | partiel |
| EMP-05 → EMP-15 (registre, assistant de publication, qualification, prix, aperçu, fiche, édition) | `offers.*`, `applications.*`, `matching.qualification.*` | partiel |
| EMP-16 → EMP-20 (candidatures, fiche candidat, filtres, matching) | `applications.*`, `matching.runs.*`, `documents.*` | partiel |
| EMP-21 → EMP-22 (sélection, confirmation) | `applications.*`, `contracts.create` | partiel |
| EMP-23 → EMP-28 (propositions) | `proposals.*`, `applications.offer.list` | partiel |
| EMP-29 → EMP-36, EMP-60 (contrat : folio, versions, signature, états, successeur) | `contracts.*` | partiel |
| EMP-37 → EMP-40 (exécution, preuve, ouverture et suivi de claim) | `contracts.*`, `claims.*`, `documents.*` | partiel |
| EMP-41 → EMP-48 (échéances, échéancier, déclarations, historique, reçu, contestation) | `payments.*`, `contracts.*`, `claims.create` | partiel |
| EMP-49 → EMP-55 (claim : fiche, pièces, résolution, escalade, clôture) | `claims.*`, `documents.*` | partiel |
| EMP-56 → EMP-59 (remplacement : dossier, conditions, sélection, confirmation) | `replacements.*`, `offers.create` | partiel |

Chaque carte mentionne le **BACKEND_GAP** de sa fiche, déclaré dans `src/employer/gaps.ts`.
Capacités absentes du backend (donc **jamais simulées**) : `applications.employer.list`,
`applications.read`, `contracts.monthly-action`, `my/schedules`, la versionisation des contrats,
le reçu téléchargeable, la vérification/la résolution d'un claim (acte de modération).

## 4. Décision FINANCE (P2)

- **Modèle financier : NON MODIFIÉ.** Aucune commission créée, aucun barème, aucun escrow, aucun
  calcul de total ou de part variable ; FIN-01/02/03 non implémentés.
- Seules les valeurs **déjà stockées** sont affichées (montants, statuts de registre, échéances
  matérialisées). Aucun montant n'est recalculé côté client.
- Le test EMP interdit les libellés `Prix Prestataire`, `Frais SaaS`, `Total Client`, `barème`,
  `séquestre`, `escrow` dans les fichiers livrés.

## 5. Routeur, dock, chemins sans fiche

- `resolveRoute` résout chaque route de fiche EMP vers son unité ; l'index `/client` est la fiche
  **EMP-01** livrée (la page « index de fondation » ne s'y applique plus).
- Les cinq onglets du dock employeur (`/client`, `/client/missions`, `/client/contrats`,
  `/client/paiements`, `/client/profil`) sont vérifiés par test et par le script navigateur.
- Un chemin rattaché à une unité EMP mais **absent du design** (ex. `/client/contrats`,
  `/client/litiges` : le design n'a que des fiches par identifiant) affiche une page de repli qui
  liste les routes réellement livrées et le BACKEND_GAP de l'unité — jamais le libellé du design.

## 6. Vérifications

| Commande | Objet |
| --- | --- |
| `npm test` | suite complète (dont 18 tests EMP dans `src/employer/employer.test.tsx`) |
| `npm run design:employer:check` | parité du catalogue généré avec la source de design |
| `npm run verify:employer-ui` | Chromium réel : 60 fiches à 360 px et 1440 px, structure déclarée, absence de source dite, BACKEND_GAP, aucun terme interdit, dock, repli, erreurs 401/500, session employeur, focus |
| `npm run verify:postgres` | chaîne PostgreSQL de production (non touchée) |
| `npm run verify:workerd` | entrée Worker locale (non touchée) |
| `npm run build` | build de production |
| `npx tsc --noEmit` | typage strict |
| `git diff --check` | espaces/whitespace |

Couverture de tests EMP (fichier `src/employer/employer.test.tsx`) : parité catalogue, 32 unités /
60 fiches rattachées, résolution de toutes les routes de fiche, registre complet, BACKEND_GAP par
fiche, API ⊆ routes existantes, garde-fou vocabulaire, décision FINANCE, rendu réel des 60 fiches
(conteneur, état honnête, structure inspectable, zones déclarées), dock, page de repli,
intégration (EMP = PARTIEL, PRE/ADM/FIN/RTC inchangés), projection des erreurs en états StateGuard
avec corrélation serveur seule, domaine des notifications, charge utile d'offre (champs serveur
uniquement), libellés produit, résolution d'écran.

## 7. Points restants / limites déclarées

- Les capacités listées en §3 restent **BACKEND_GAP** : elles ne sont pas des défauts de la
  tranche, elles sont déclarées pour chaque fiche (une unité EMP reste donc `PARTIEL`, jamais
  `INTEGRE`).
- Le vocabulaire du **chrome** (dock « Missions / Contrats / Argent / Profil », appbar) est P0 et
  provient du chrome généré : il n'est pas modifié par P2 (les tests P0 le vérifient).
- PRE, ADM, FIN et RTC ne sont **pas** touchés par cette tranche.
