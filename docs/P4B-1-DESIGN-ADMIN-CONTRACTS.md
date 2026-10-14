# P4B-1-DESIGN-ADMIN-CONTRACTS — supervision des contrats (3 unités / 5 fiches)

Tranche de design frontend : les **écrans ADMIN du Master Design qui concernent la
supervision des contrats** sont rendus dans l'espace `/admin` livré par P0/P4A, avec les
**routes réelles** du routeur P0 et les **seules API existantes**. Aucun contrat n'est
inventé, aucune signature n'est simulée, aucune capacité ADMIN absente n'est maquillée.
Le backend métier n'est **pas modifié** : aucune migration, aucun endpoint nouveau, aucune
transition de statut, aucune permission touchée. Les écrans de **paiement et de
rapprochement (P4B-2)** ne sont **pas** intégrés, comme convenu. P5 et les autres écrans
ADMIN restent hors périmètre.

## 1. Unités exactement concernées (source canonique, jamais une plage numérique)

Lecture de `design/llab/units.py` et des fiches `design/llab/content/adm_a.py` / `adm_b.py` :
la supervision des contrats correspond aux regroupements réels suivants.

| Unité de production (`units.py`) | Fiches | Codes et titres exacts | Routes (routeur P0, jamais renommées) |
| --- | --- | --- | --- |
| ADM-13 — « ADM — contrats (registre) » | ADM-13 | ADM-13 « Contrats — registre » | `/admin/contrats` |
| ADM-14 — « ADM — contrat (fiche, incidents & journal) » | ADM-14, ADM-15, ADM-17 | ADM-14 « Contrat — fiche admin » ; ADM-15 « Contrat — incidents » ; ADM-17 « Contrat — journal d'audit » | `/admin/contrats/:id` ; `/admin/contrats/:id/incidents` ; `/admin/contrats/:id/journal` |
| ADM-16 — « ADM — contrat (révision forcée) » | ADM-16 | ADM-16 « Contrat — révision forcée (décision de modération) » | `/admin/contrats/:id/revision-forcee` |

Correspondance mission → fiches : registre/consultation → ADM-13 ; détail, parties et
conditions, états, signature/activation (consultation), fin/terminaison/confirmation
d'exécution (états réels) → ADM-14 ; incidents du contrat → ADM-15 ; historique →
ADM-14 (frise) + ADM-17 (journal) ; versions/avenants/justificatifs → prévus par les
fiches ADM-14 (table de versions, pièces) et ADM-16 (nouvelle version R2) — rendus en
**BACKEND_GAP** faute de route serveur, sans rien inventer.

Catalogue structurel : `src/admin/catalog.ts`, régénéré par
`scripts/design/generate-admin-catalog.py` (tranches P4A + P4B-1), parité vérifiée par
`npm run design:admin:check` et par le test ADM « catalogue généré identique à la source ».

## 2. Matrice de traçabilité par unité

Légende : **PARTIEL** = écran réel + API réelles mais capacités absentes déclarées ;
**BACKEND_GAP** = écran livré, capacité serveur absente (état explicite, aucune donnée
inventée) ; **NON INTÉGRÉ** = hors tranche.

| Code design | Unité | Route | Composant UI (`src/admin/screens/contracts.tsx`) | API réelle (routeContracts) | Permission serveur | États gérés | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ADM-13 | ADM-13 | `/admin/contrats` | `Admin13ContractsRegistry` | `admin.contracts.list` (`GET /api/v1/admin/contracts`, page réelle + curseur réel ; frontière `persistence: not-configured` sans PostgreSQL durable) | `contracts:read:any` (dérivée serveur) | chargement, prêt, erreur (StateGuard + corrélation sûre), vide (« aucun contrat sur les filtres »), segments locaux, recherche locale, page suivante par curseur réel | **PARTIEL** |
| ADM-14 | ADM-14 | `/admin/contrats/:id` | `Admin14ContractSheet` | `admin.contracts.list` (fiche composée depuis la page réelle — `contracts.read` est strictement réservé aux parties : 403 serveur réel pour un ADMIN) | `contracts:read:any` | chargement, prêt, erreur, **hors page chargée** (état honnête, rien de rechargé à part), signatures réelles horodatées, frise d'historique réelle, jalons d'exécution réels, permissions de session affichées | **PARTIEL** |
| ADM-15 | ADM-14 | `/admin/contrats/:id/incidents` | `Admin15ContractIncidents` | `admin.contracts.list` + `admin.claims.list` (Claims réels rattachés par `contractId`, filtre local sur la page chargée) | `contracts:read:any`, `incidents:read:any` | chargement, prêt, erreur serveur (501 réel sans persistance → état d'erreur affiché, jamais un vide présenté comme sain), vide (aucun Claim rattaché), score/actions préventives = capacité absente déclarée | **PARTIEL** |
| ADM-16 | ADM-16 | `/admin/contrats/:id/revision-forcee` | `Admin16ContractForcedRevision` | aucune (contexte en lecture via `admin.contracts.list` ; `forced-revision`/`countersign` absents du produit) | — | capacité indisponible déclarée, **aucun formulaire rendu** (rien à commander), contexte réel si le contrat est dans la page | **BACKEND_GAP** (fiche entière) |
| ADM-17 | ADM-14 | `/admin/contrats/:id/journal` | `Admin17ContractJournal` | `admin.contracts.list` (historique réellement émis `Contrat.history` ; `journal`/`verify`/`export` absents) | `contracts:read:any` | chargement, prêt, erreur, vide (aucun événement), filtre local par acteur réel, vérification/export déclarés indisponibles | **PARTIEL** |

Routes ajoutées à l'espace : aucune — `/admin/contrats*` étaient déjà revendiquées par les
unités ADM-13/ADM-14/ADM-16 du routeur P0 (`productionUnits.ts`). Le routeur global n'est
pas réécrit (voir § 5 pour le branchement de rendu rétabli dans `ShellRoute`).

## 3. Vocabulaire — règle absolue

Aucun concept métier LE LABEUR n'est renommé : **Employeur** (`EMPLOYER`), **Candidat**
(`CANDIDATE`), **Offre** (`OFFER`), **Candidature** (`APPLICATION`), **Proposition**
(`PROPOSAL`), **Contrat** (`CONTRACT`), **Claim** (`CLAIM`), **Paiement** (`PAYMENT`),
**Salaire** (`SALARY`), **Remplacement** (`REPLACEMENT`), **Matching** (`MATCHING`),
**Document** (`DOCUMENT`), **Qualification** (`QUALIFICATION`).

Divergences terminologique**s documentées** (vocabulaire du Master Design compris, jamais
substitué) :

1. Fiches ADM-13/14 « montant total client / prix prestataire » → produits : valeurs
   réelles du DTO `Contract` (`monthlySalary` + `currency`, libellé « Salaire mensuel »).
   Les agrégats financiers et le triplet FIN relèvent des écrans de paiement (**P4B-2**,
   hors tranche). Les termes « Client »/« Prestataire » ne sont jamais rendus (garde-fou
   testé, comme en P4A).
2. Fiche ADM-15 « incidents » → l'objet réel du produit est le **Claim**
   (`admin.claims.list`, enums `CLAIM_TYPE_VALUES`/`CLAIM_STATUS_VALUES` du serveur,
   parité exacte testée). Le mot « Litige » n'apparaît jamais dans l'interface.
3. Fiche ADM-14 « deux parties » → `employerId/employerName` et `employeeId/employeeName`
   du DTO, affichés **Employeur** / **Candidat**.
4. Fiche ADM-17 « journal d'audit chaîné à empreintes » → capacité réellement absente :
   l'écran rend l'**historique émis** `Contrat.history` (id, horodatage, événement,
   description, acteur) et le dit ; il ne se fait pas passer pour un event store vérifié.
5. Statuts de contrat affichés : les **codes serveurs intacts** (`DRAFT`, `SIGNATURE`,
   `ACTIVE`, `INCIDENT`, `TERMINATED`, `COMPLETED`, `REPLACED`, `PENDING_EMPLOYER`,
   `PENDING_EMPLOYEE`, `SUSPENDED`) avec les **libellés officiels déjà en usage** côté
   EMP/PRE (test de parité vers `src/employer/vocabulary.ts` et
   `src/prestataire/vocabulary.ts` : aucune divergence).

## 4. Backend — strictement protégé

- Modifications métier : **aucune**. Migrations SQL : **aucune**. API ajoutées :
  **aucune** (chemins `ADMIN_API_PATHS` tous présents dans `routeContracts.ts`, vérifiés
  par test, y compris `/api/v1/admin/contracts` et `/api/v1/admin/claims`).
- Transitions de contrat, signatures, permissions, paiements/commissions, Claims,
  remplacements : **inchangés**. Aucune écriture n'est appelée depuis les écrans
  contrats : l'espace contrats ADMIN est **en lecture seule** (conformément aux fiches :
  « l'admin ne modifie jamais un contrat directement »).
- Capacité de révision forcée (ADM-16) : **BACKEND_GAP** déclaré — aucune route
  `forced-revision`/`countersign` dans le produit ; l'écran n'ouvre aucune saisie.
- Capacités absentes déclarées à l'écran (`src/admin/gaps.ts`, ADM-13 → ADM-17) : lecture
  individuelle ADMIN, versions/diffs, notes internes, export journalisé, synthèse
  serveur, détecteur d'inactivité, incidents par contrat, score de risque, actions
  préventives, journal d'audit dédié, vérification d'intégrité, export signé.

## 5. Branchement de rendu rétabli dans `ShellRoute` (frontend, hors backend)

La description P4A annonçait « `ShellRoute` (écrans ADM + repli honnête) », mais aucune
branche ADMIN n'existait dans `Content` : les écrans `/admin/*` n'étaient atteignables
que statiquement (tests P4A rendant `AdminScreen` directement). La vérification
navigateur de cette tranche (`scripts/verify-admin-ui.ts`) l'a révélé ; le branchement a
été **rétabli strictement sur le modèle des branches EMP/PRE** : fiche ADM livrée →
écran ; chemin rattaché à une unité ADM **livrée** sans fiche → repli honnête
`AdminRouteFallback` ; unité ADM **non livrée** → réponse de la fondation (« écran non
intégré »), inchangée. Aucun écran P0/PUB/SYS/EMP/PRE modifié ; routeur global
(`routes.ts`, `resolveRoute.ts`, `navigation.tsx`) inchangé.

## 6. Design system

Aucune deuxième bibliothèque : mêmes primitives que P4A (`GlassSurface`, `SquircleCard`,
`NeoPressButton`, `StatusSeal`, `StateGuard` via `SystemFeedback`), mêmes tokens générés,
même `admin.css` (aucune classe nouvelle nécessaire), namespace ADMIN `/admin/*` conservé.

## 7. Validations réellement exécutées (final tree)

- `npm test` : **1784/1784 PASS** (baseline P4A 1776 + 8 cas P4B-1 : résolution des
  routes contrats, égalité stricte des routes du catalogue avec le routeur P0, chemins
  et permissions ADMIN réels, preuve des handlers/fonctionnement, parité des statuts de
  contrat et des enums de Claim avec le serveur, garde-fou « aucune donnée simulée »,
  `formatContractAmount` sans valeur inventée ; intégration : 10 unités ADM PARTIEL,
  ADM-18/ADM-26 et FIN/RTC NON_INTÉGRÉES).
- `npm run verify:postgres` : **28/28 PASS**.
- `npm run verify:workerd` : **18/18 PASS**.
- `npm run build` : OK (chunk `admin/registry` chargé à la demande ; avertissement de
  taille de bundle préexistant, hors périmètre).
- `npx tsc --noEmit` : propre.
- `git diff --check` : propre.
- `npm run design:tokens:check` / `design:public:check` / `design:employer:check` /
  `design:prestataire:check` / `design:admin:check` : parité OK (5 fichiers générés à jour).
- `npm run verify:employer-ui` : 7/7 PASS (non-régression P2 dans le navigateur après le
  branchement `ShellRoute`).
- `npm run verify:public-ui` : 18/18 PASS (non-régression P1).
- `npm run verify:admin-ui` (nouveau, cette tranche) : **14/14 PASS** — Chromium réel,
  17 fiches à **360 px et 1440 px** sans débordement horizontal, données réelles issues
  des fixtures HTTP du test (jamais de données simulées dans l'application), registre
  filtré au **clavier** (segment `aria-pressed`), **focus rendu au contenu** après
  navigation, tables sémantiques (`caption`, `scope="col"`), transitions neutralisées en
  `prefers-reduced-motion`, 401/403/500 projetés en StateGuard avec seule la corrélation
  du serveur, ADM-16 sans aucun formulaire, état « hors page chargée » honnête.

## 8. Backends gaps et éléments ouverts

- ADM-13 : segments/recherche serveur, synthèse, export, détecteur d'inactivité,
  agrégats financiers → BACKEND_GAP / P4B-2.
- ADM-14 : lecture individuelle ADMIN, versions/diffs, notes internes, pièces par
  contrat, bandeau de niveau d'accès par écran → BACKEND_GAP.
- ADM-15 : incidents par contrat, score de risque, actions préventives, création manuelle
  → BACKEND_GAP (lecture réelle via `admin.claims.list`, filtre local).
- ADM-16 : **fiche entière** BACKEND_GAP (aucune route d'écriture ; double validation,
  notification, recours : aucune de ces capacités n'existe).
- ADM-17 : journal dédié, vérification d'intégrité, export signé, deltas avant/après,
  horodatages milliseconde → BACKEND_GAP ; l'historique réellement émis est rendu.
- Décisions ouvertes : aucune prise de décision financière (P4B-2) ; aucune décision de
  litige (tranche ultérieure) ; P5 et autres écrans ADMIN non entamés.

Paiements/rapprochement : **NON INTÉGRÉS DANS CETTE TRANCHE**. P5 / autres écrans ADMIN :
**NON INTÉGRÉS**.
