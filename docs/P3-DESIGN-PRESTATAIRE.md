# P3-DESIGN-PRESTATAIRE — espace candidat (26 unités / 52 fiches)

Tranche de design : l'espace **Candidat** (famille `PRE` du Master Design, rôle produit
`CANDIDATE`) est rendu dans l'application, avec les **routes réelles**, les **API existantes** et
**aucune donnée inventée**. Aucun concept métier du produit n'est renommé, aucun endpoint n'est
créé, aucune migration n'est ajoutée, le modèle financier n'est pas touché. PUB/SYS (P1) et EMP
(P2) ne sont pas modifiés ; ADM, FIN et RTC restent hors périmètre.

## 1. Source de vérité et catalogue généré

| Élément | Source | Généré |
| --- | --- | --- |
| Unités PRE (26) | Master Design (`design/llab/content/pre_a…pre_d.py`, `design/llab/units.py`) | `src/prestataire/catalog.ts` par `scripts/design/generate-prestataire-catalog.py` |
| Fiches PRE (52) | idem | idem |
| Zones / états / composants des fiches | idem | `src/prestataire/catalog.ts` |
| Statuts produit, libellés, formatters | code du produit | `src/prestataire/vocabulary.ts` (écrit à la main, testé) |

`src/prestataire/catalog.ts` est **généré** : il ne se modifie jamais à la main.
Parité vérifiée par `python3 scripts/design/generate-prestataire-catalog.py --check`
(scripts npm `design:prestataire` / `design:prestataire:check`) et par le test PRE
« catalogue généré identique à la source ».

Chiffres : **120 unités** au total (PUB 10, EMP 32, PRE 26, ADM 34, RTC 5, SYS 10, FIN 3) ;
**52 fiches PRE** → 38 canons → **26 unités**, toutes de rôle `CANDIDATE`. L'unité porte l'id de
sa première fiche (`PRE-01`, `PRE-05`, `PRE-08`, `PRE-10`, `PRE-11`, `PRE-14`, `PRE-16`, `PRE-17`,
`PRE-21`, `PRE-24`, `PRE-28`, `PRE-29`, `PRE-32`, `PRE-34`, `PRE-38`, `PRE-40`, `PRE-41`, `PRE-42`,
`PRE-45`, `PRE-47`, `PRE-48`).

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
   | « Paiement / Salaire » | **Paiement** (`PAYMENT`) / **Salaire** (`SALARY`) + **Confirmation de salaire** (`SALARY_CONFIRMATION`) |
   | « Remplacement » | **Remplacement** (`REPLACEMENT`) |
   | « Matching » | **Matching** (`MATCHING`) |
   | « Document » | **Document** (`DOCUMENT`) |
   | « Réputation » | **Réputation** (`REPUTATION`) |

   Le tableau de référence est `DESIGN_ONLY_TERMS_NOT_RENDERED` (`src/prestataire/vocabulary.ts`) :
   « Mission », « Client », « Prestataire », « Prestation », « Litige » et leurs pluriels. Le test
   PRE refuse tout fichier livré qui **affiche** un de ces termes (texte JSX ou libellé
   d'affichage : `title`, `lede`, `label`, `placeholder`…), y compris dans le HTML réellement
   rendu. Les chemins réels (`/prestataire/missions/:id`, `/prestataire/candidatures/:id`) restent
   strictement inchangés — c'est aussi ce que les tests garantissent. Le préfixe CSS de l'espace
   est `lbm-candidat` (terme produit), jamais un terme du design.

2. **Aucune donnée inventée.** Sans source configurée (`VITE_DEMO_MODE` / `VITE_API_BASE_PATH`),
   l'écran affiche « Source de données non configurée » + la **structure déclarée de la fiche**
   (une zone par genre déclaré, `data-sheet-frame`) : jamais de valeur de démonstration, jamais de
   coquille vide. Une capacité absente du backend est déclarée en clair (`data-backend-gap`,
   `src/prestataire/gaps.ts` — au moins une ligne par fiche, 52 fiches couvertes).

3. **Aucune nouvelle API.** Chaque chemin appelé est vérifié par test contre
   `src/backend/api/routeContracts.ts` (`PRESTATAIRE_API_PATHS`, 33 chemins). Les routes déclarées
   **sans handler installé** (réponse 501 réelle : `/my/applications`, `/applications/:id`,
   `/my/schedules`, `/offers/:id/favorite`, `/conversations…`, `users.me.update`, `incidents.*`)
   sont appelées telles quelles : l'écran affiche l'état d'erreur réel du serveur, en plus du
   BACKEND_GAP déclaré. Rien n'est contourné, rien n'est simulé.

4. **Workflows réels uniquement.** Statuts `APPLICATION` réels (PENDING/REVIEW/SHORTLISTED/REJECTED/
   WITHDRAWN/HIRED/CONTRACTED/CLOSED_OFFER_FILLED), modèle `PROPOSAL` réel (seules ACCEPT et DECLINE
   sont ouvertes ; REVISE renvoie 501), états `CONTRACT` réels, cycle de paiement réel
   (déclaré ≠ vérifié ≠ payé ≠ confirmé). Réputation = ledger existant uniquement. Documents =
   système R2 existant (versions, empreinte SHA-256, `objectKey` jamais exposé). Remplacement =
   workflow existant. Pas de nouvel OTP (P0-SALARY réutilisé), pas d'escrow/wallet/paiement simulé.

## 3. Écrans livrés (unités → routes)

| Unités (fiches) | Routes réelles consommées | État |
| --- | --- | --- |
| PRE-01 → PRE-04 (tableau de bord, notifications, profil, paramètres) | `contracts.mine.list`, `payments.mine.list`, `claims.mine.list`, `my/applications` (501 réel), `notifications.*`, `matching.profile.*`, `documents.mine.list` | partiel |
| PRE-05 → PRE-07 (marché, filtres, fiche offre) | `offers.public.list`, `offers.public.read` | partiel |
| PRE-08 → PRE-15 (dépôt, confirmation, suivi, registre, retrait, archive) | `offers/:id/applications` (POST `{note?}`), `applications/:id/withdraw`, `my/applications` + `applications.read` (501 réels) | partiel |
| PRE-16 → PRE-20 (propositions reçues, détail, acceptation, contre, historique) | `contracts.mine.list` (propositions abouties via `contract.proposalId`) ; `proposals.respond` documentée, non déclenchée sans lecture | partiel |
| PRE-21 → PRE-27 (contrat : folio, lecture, révision, signature, actif, avenant, résiliation) | `contracts.mine.list`, `contracts.read`, `contracts.sign`, `contracts.confirm-execution` | partiel |
| PRE-28 → PRE-31 (exécution, jalons, preuves, validations) | `contracts.*` (échéancier persisté, points de contrôle mensuels) | partiel |
| PRE-32 → PRE-39 (salaire : attendu, échéances, déclaration, vérification, retard, relance, OTP, reçu) | `payments.mine.list`, `payments.read`, `contracts.*`, `my/schedules` (501 réel), `payments/:id/salary-confirmation` (OTP P0-SALARY), `claims.create` | partiel |
| PRE-40 → PRE-44 (remplacement : notification, conditions, décision, transition, reprise) | `replacements.mine.list`, `replacements.read`, `offers.public.read` (offre de reprise) | partiel |
| PRE-45 → PRE-47 (réputation : synthèse, ledger, contestation) | `reputation.mine.read`, `reputation.mine.entries.list`, `claims.create` (mécanisme existant pour la contestation) | partiel |
| PRE-48 → PRE-52 (documents : bibliothèque, nouvelle version, vérification, rejet, historique) | `documents.mine.list`, `documents.upload-grant`, `documents.read`, `documents.versions.*`, `documents.versions.content.upload`, `documents.signed-download-url` | partiel |

Chaque écran mentionne le **BACKEND_GAP** de sa fiche, déclaré dans `src/prestataire/gaps.ts`.
Capacités absentes du backend (donc **jamais simulées**) : lecture candidat des candidatures
(`/my/applications`, `/applications/:id` — déclarées sans handler, 501), lecture candidat des
propositions (aucune route), négociation (REVISE → 501), messagerie encadrée (`/conversations` sans
handler), favoris d'offres, versionisation/avenants/résiliation candidat des contrats, exécution
mission (jalons, preuves, obstacles, acquis), échéancier serveur (`/my/schedules` 501), confirmation
de déclaration employeur, réconciliation, relances tracées, remise du `nonce` OTP et canal de
livraison de l'OTP (aucune route), reçu/relevé PDF, décision/contestation/passation/sortie de
remplacement, contestation de réputation (la correction est un acte ADMIN), score 0-100 pondéré
(le produit expose la vue dérivée du ledger), vérification/rejet de documents (le modèle a
ACTIVE/REVOKED et PENDING_UPLOAD/ACTIVE/REVOKED), suppression de document, log d'usage et export.

## 4. Décision FINANCE (P3)

- **Modèle financier : NON MODIFIÉ.** Aucun escrow, aucun wallet, aucun transfert interne, aucun
  paiement simulé : LE LABEUR ne détient pas l'argent du travailleur. FIN-01/02/03 non implémentés.
- Le candidat ne voit **que ses salaires** : `payments.mine.list` filtre `paymentType = SALARY`
  côté serveur ; la commission employeur n'est jamais demandée ni affichée.
- Les quatre vérités d'un paiement sont affichées séparément, jamais confondues :
  **déclaré ≠ vérifié ≠ payé ≠ confirmé** (la confirmation est l'OTP P0-SALARY, sur un paiement
  payé, avec `otp` + `nonce`).
- Seules les valeurs **déjà stockées** sont affichées (montants, statuts, échéances matérialisées,
  déclarations append-only). Aucun montant, total, intérêt, pénalité ou « acquis » n'est calculé
  côté client.
- Le test PRE interdit les libellés `Prix Prestataire`, `Frais SaaS`, `Total Client`, `barème`,
  `séquestre`, `escrow`, `wallet`, `portefeuille` dans les fichiers livrés.

## 5. Routeur, dock, chemins sans fiche

- `resolveRoute` résout chaque route de fiche PRE vers son unité dans l'espace candidat ; l'index
  `/prestataire` est la fiche **PRE-01** livrée (le test de routage P0 est mis à jour en
  conséquence, de même que le test d'intégration : les 26 unités PRE passent `PARTIEL`, soit
  PUB 10 + SYS 10 + EMP 32 + PRE 26 = 78 unités PARTIEL, 0 / 120 intégrées).
- `src/routing/integration.ts` importe le catalogue PRE et les écarts PRE : une unité PRE est
  PARTIEL dès qu'une de ses fiches déclare une capacité absente (c'est le cas des 26).
- Les cinq onglets du dock candidat (`/prestataire`, `/prestataire/missions`,
  `/prestataire/candidatures`, `/prestataire/salaire`, `/prestataire/profil`) sont vérifiés par
  test : chacun mène à une fiche livrée. Le vocabulaire du dock (« Missions », « Candidatures »…)
  est P0 et provient du chrome généré : il n'est pas modifié par P3 (les tests P0 le vérifient).
- Un chemin rattaché à une unité PRE mais **absent du design** (ex. `/prestataire/contrats`,
  `/prestataire/remplacements` : le design n'a que des fiches par identifiant) affiche une page de
  repli (`PrestataireRouteFallback`) qui liste les routes réellement livrées et le BACKEND_GAP de
  l'unité — jamais le libellé du design, jamais un écran inventé.

## 6. Vérifications

| Commande | Résultat |
| --- | --- |
| `npm test` | **1756/1756 PASS** (dont 36 tests PRE dans `src/prestataire/prestataire.test.tsx`, 18 tests EMP, 14 routage P0, 42 fondation) |
| `npm run design:prestataire:check` | parité du catalogue généré avec la source de design |
| `npm run verify:postgres` | **28/28 PASS** (chaîne PostgreSQL de production, non touchée) |
| `npm run verify:workerd` | **18/18 PASS** (entrée Worker locale, non touchée) |
| `npm run build` | build de production OK (écrans PRE en chunk lazy) |
| `npx tsc --noEmit` | typage strict, 0 erreur |
| `git diff --check` | 0 erreur |

Couverture de tests PRE (fichier `src/prestataire/prestataire.test.tsx`, suite « P3 — Espace
candidat ») : parité catalogue (python --check), 26 unités / 52 fiches rattachées, résolution de
toutes les routes de fiche par le routeur P0 + index PRE-01, registre complet (52 fiches → 26
composants), BACKEND_GAP par fiche et par unité, API ⊆ routes existantes (33 chemins), garde-fou
vocabulaire (fichiers livrés, chaînes affichées), décision FINANCE, rendu réel des 52 fiches en
mode sans source (conteneur `data-unit`/`data-screen`, état « Source de données non configurée »,
`data-backend-gap`, `data-sheet-frame`, aucun terme interdit rendu), unités d'inspection
(`data-zone`/`data-zone-kind` pour chaque genre déclaré), dock candidat, page de repli honnête,
intégration (26 unités PRE PARTIEL, PUB/SYS/EMP inchangés, ADM/FIN/RTC NON_INTEGRE), projection des
erreurs en états StateGuard avec corrélation serveur seule, domaine des notifications déduit de la
destination réelle, libellés produit et formatters, résolution d'écran (motif exact prioritaire :
`/candidatures/envoyee` → PRE-09, `/candidatures/archive` → PRE-15, `/salaire/echeances` → PRE-33,
`/missions/filtres` → PRE-06 ; paramètres `:id`/`:v` extraits).

## 7. Points restants / limites déclarées

- Les capacités listées en §3 restent **BACKEND_GAP** : elles ne sont pas des défauts de la
  tranche, elles sont déclarées pour chaque fiche (une unité PRE reste donc `PARTIEL`, jamais
  `INTEGRE`). Priorités de livraison backend suggérées : lecture candidat des candidatures
  (`applications.mine.list` / `applications.read` — routes déclarées, handlers à installer),
  lecture candidat des propositions, remise du `nonce` OTP au candidat + canal de livraison de
  l'OTP, `/my/schedules`.
- Le vocabulaire du **chrome** (dock « Missions / Candidatures / Salaire / Profil », appbar) est P0
  et provient du chrome généré : il n'est pas modifié par P3 (les tests P0 le vérifient).
- ADM, FIN et RTC ne sont **pas** touchés par cette tranche. EMP (P2) n'est pas modifié, à
  l'exception de son test d'intégration qui reconnaît désormais PRE comme livrée (P3).
- Aucun écran ne déclenche de paiement, ne calcule de solde, ne simule de transaction : la tranche
  est une couche de lecture et de commandes réelles (candidature, retrait, signature, constat
  d'exécution, réponse à une proposition, confirmation OTP, claim, dépôt de document R2).
