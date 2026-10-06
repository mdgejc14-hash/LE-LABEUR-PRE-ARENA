# P0-F — Domaine Contrat

Point de départ : `eddc3683ca026a45d7ccb1da56de397f7738424b` (P0-E5 validé, PR #16).
Branche de travail : `arena/9f3d3630-le-labeur-pre-arena`, empilée sur
`arena/9f580cb5-le-labeur-pre-arena` (la PR P0-F cible cette branche pour
n'exposer que la tranche P0-F).

Objectif historique P0-F : ouvrir la **première tranche réelle du cycle Contrat** — création
depuis une proposition `ACCEPTED`, envoi, signature des deux parties, activation,
fin normale et rupture motivée — sans paiements réels, incidents, remplacements,
notifications générales ni `FILLED` / `HIRED` / `CLOSED_OFFER_FILLED`.

**Mise à jour P0-AUTO-2 :** l’activation PostgreSQL publie maintenant
`CONTRACT_ACTIVATED` transactionnellement et déclenche uniquement les schedules,
deadlines et jobs décrits dans [`P0-AUTO-2_ACTIVATION.md`](P0-AUTO-2_ACTIVATION.md).
Cela n’ouvre ni paiement réel, ni preuve salariale, ni canal de notification.

---

## 1. Modèle réellement utilisé (aucun statut inventé)

Domaine : `src/types/index.ts` → `Contract` + `ContractStatus`.
Contrainte SQL : `migrations/0003_core_nucleus_alignment.sql`
(`contracts_status_domain`).
Dérivation des règles : `MockRepository.generateContract` / `signContract` /
`dissociateMonth2` (`src/repositories/mockRepository.ts`),
`docs/statecharts.mmd` et `docs/audit/02-matrice-transitions.md`.

```text
DRAFT | PENDING_EMPLOYER | PENDING_EMPLOYEE | SIGNATURE | ACTIVE
      | SUSPENDED | INCIDENT | TERMINATED | COMPLETED | REPLACED
```

Correspondance avec le vocabulaire du plan — **le nom du code est conservé** :

| Vocabulaire fonctionnel | Nom conservé dans le code |
|---|---|
| DRAFT | `DRAFT` |
| SENT | `SIGNATURE` + `employerSigned === true` (le code signe l'employeur à l'envoi) |
| SIGNED | `SIGNATURE` + `employerSigned && employeeSigned` (aucun statut `SIGNED` distinct) |
| ACTIVE | `ACTIVE` |
| ENDED | `COMPLETED` |
| TERMINATED | `TERMINATED` |

Statuts du modèle réel **non produits** par P0-F :

* `PENDING_EMPLOYER`, `PENDING_EMPLOYEE` — jamais produits par le code réel,
  conservés tels quels dans le type et la contrainte ;
* `SUSPENDED`, `INCIDENT`, `REPLACED` — appartiennent au chemin
  incident/remplacement/suspension, non ouvert ici (voir § 8) ;
* `COMPLETED` et `TERMINATED` sont, eux, produits par P0-F.

Source de vérité de la matrice : `src/domain/contractTransitions.ts`
(module pur, sans dépendance serveur ni base).

### Table `contracts` (migrations `0001` + `0003` + `0005`)

Colonnes dérivées de `Contract` : `id`, `offer_id`, `application_id`,
`employer_id`, `candidate_id` (le nom SQL de `employeeId`), `status`,
`monthly_salary`, `currency`, `start_date`, `end_date`, `current_month`,
`duration_months`, `periodicity`, `mission_description`, `location`,
`conditions` (JSONB), `additional_notes`, `employer_signed`, `employee_signed`,
`employer_signed_at`, `employee_signed_at`, `commission_percentage`,
`commission_amount_due`, `commission_status`, `monthly_checkpoints`,
`commission_ledger`, `payment_schedule`, `history`, `replacement_id`,
`replaced_contract_id`, `incident_id`, `created_at`, `updated_at`.

* `employerName` / `employeeName` / `offerTitle` ne sont **pas** dupliqués en
  base : ils sont résolus depuis `users` / `offers` à la projection.
* Contraintes réelles conservées : `start_date` NOT NULL, statut par défaut
  `SIGNATURE` (les créations P0-F forcent `DRAFT`), `commission_percentage = 25`,
  `employeeId ↔ candidate_id`.
* Les champs de **rémunération et de commissionnement sont préservés tels
  quels** : P0-F ne calcule ni 25 % / 75 %, ni échéancier, ni rapprochement, ni
  OTP (voir § 14).

---

## 2. Transitions implémentées

| Opération | Acteur | Transition | Gardes |
|---|---|---|---|
| Création (`contracts.create`) | EMPLOYER propriétaire de la proposition | `∅ → DRAFT` | proposition existante, `ACCEPTED`, sans contrat, avec candidature de la même offre et du même candidat, candidature admissible et sans contrat, offre `ACTIVE`, candidat `CANDIDATE` `ACTIVE` |
| Envoi (`contracts.send`) | EMPLOYER propriétaire du contrat | `DRAFT → SIGNATURE` | c'est l'envoi qui **pose la signature employeur** (`employer_signed = true`, `employer_signed_at`) — c'est le modèle réel |
| Signature (`contracts.sign`) | chaque partie sur son propre drapeau | `SIGNATURE → SIGNATURE` | statut `SIGNATURE` ; partie = employeur propriétaire **ou** salarié du contrat ; drapeau non déjà posé. Quand les deux drapeaux sont posés, l'état `SIGNED` du plan est atteint **sans** changer de statut |
| Activation (`contracts.activate`) | EMPLOYER propriétaire | `SIGNATURE → ACTIVE` | `employerSigned && employeeSigned` obligatoires |
| Fin normale (`contracts.end`) | EMPLOYER propriétaire | `ACTIVE → COMPLETED` | état de départ `ACTIVE` uniquement |
| Rupture (`contracts.terminate`) | EMPLOYER propriétaire | `ACTIVE → TERMINATED` | motif non vide obligatoire **et** `current_month >= 2` (protection M1 conservée) |
| Lecture partie (`contracts.mine.list`, `contracts.read`) | EMPLOYER ou CANDIDATE partie | lecture seule | bornée par `employer_id` / `candidate_id` |
| Lecture ADMIN (`admin.contracts.list`) | ADMIN + permission SQL `contracts:read:any` | lecture seule | permission **déjà seedée** en `0002`, aucun élargissement |

Chaque transition de cycle :

* s'exécute dans **une transaction PostgreSQL** (Worker → Repository → stores SQL)
  avec rollback automatique : la création écrit le contrat **et** les liens
  `proposals.contract_id` / `applications.contract_id` dans la même transaction ;
* relit la ligne `SELECT … FOR UPDATE` (verrou) puis écrit en
  **compare-and-set** (`UPDATE … WHERE id = $1 AND status = $2`) ;
* ajoute une entrée à `contracts.history` (`CONTRACT_CREATED`,
  `EMPLOYER_SIGNED`, `EMPLOYEE_SIGNED`, `CONTRACT_ACTIVATED_BILATERAL`,
  `CONTRACT_COMPLETED`, `CONTRACT_TERMINATED`) ;
* ne produit **aucun** effet hors domaine : ni offre `FILLED`, ni candidature
  `HIRED`/`CONTRACTED`, ni fermeture d'autres candidatures, ni paiement, ni
  notification, ni événement publié.

Éligibilité d'une candidature (`CONTRACT_ELIGIBLE_APPLICATION_STATUSES`) :
`PENDING | REVIEW | SHORTLISTED` — **exactement** la liste déjà utilisée par
P0-E5 (`PROPOSAL_ELIGIBLE_APPLICATION_STATUSES`), importée du même module
`applicationTransitions` pour ne pas créer deux vérités.

---

## 3. Transitions refusées

Table documentaire : `CONTRACT_REFUSED_TRANSITIONS`.

| Situation | Résultat |
|---|---|
| `DRAFT → ACTIVE` (activation d'un brouillon non envoyé) | `409 BUSINESS_RULE_VIOLATION` |
| `DRAFT → SIGNED` (signature avant envoi) | `409` |
| `DRAFT → COMPLETED`, `DRAFT → TERMINATED` | `409` |
| `SIGNATURE → ACTIVE` sans la double signature | `409` |
| `SIGNATURE → COMPLETED`, `SIGNATURE → TERMINATED` (plan : `SENT → ENDED`) | `409` |
| `ACTIVE → SIGNATURE` (signature après activation) | `409` |
| `COMPLETED → ACTIVE`, `COMPLETED → TERMINATED` | `409` |
| `TERMINATED → ACTIVE`, `TERMINATED → COMPLETED` (plan : `TERMINATED → ACTIVE` interdit) | `409` |
| Signature d'une partie déjà signataire (ex. l'employeur après l'envoi) | `409` |
| Rupture en M1 sans incident | `409` (protection M1, voir § 8) |
| Rupture sans motif ou motif vide | `400 VALIDATION_ERROR` |
| Création depuis une proposition `SENT`, `DECLINED`, `EXPIRED`, `DRAFT` ou `REVISION_REQUESTED` | `409` (le refus nomme le statut réel) |
| Création depuis une proposition inexistante | `404 NOT_FOUND` |
| Création depuis une proposition sans candidature | `409` |
| Création par un EMPLOYER qui n'est pas celui de la proposition | `403` |
| Création par un CANDIDATE / ADMIN (routeur) | `403` |
| Création depuis une candidature d'une autre offre, d'un autre candidat, non admissible ou déjà liée à un contrat | `409` |
| Création depuis une offre non `ACTIVE` | `409` |
| Création depuis un candidat non `CANDIDATE` ou non `ACTIVE` | `409` |
| Action de cycle par un tiers (autre employeur, autre candidat) ou par le mauvais rôle (routeur) | `403 FORBIDDEN` |
| Action sur un contrat inexistant | `404 NOT_FOUND` |
| Acteur absent / sans session | `401 UNAUTHENTICATED` |
| Compte non `ACTIVE` (BLOCKED/PENDING) | `403 FORBIDDEN` (repository) |
| Charge utile contenant `employerId`, `employeeId`, `monthlySalary`, `status`… | `400 VALIDATION_ERROR` (champ inconnu) |
| `Idempotency-Key` absente | `400 IDEMPOTENCY_KEY_REQUIRED` |
| Même clé, charge utile différente | `409 IDEMPOTENCY_CONFLICT` |
| Transition concurrente perdante (compare-and-set) | `409` si l'état final diffère, `200`/rejeu si l'état final est déjà la cible |

Aucune autre transition n'est ouverte : `SUSPENDED`, `INCIDENT`, `REPLACED`,
`PENDING_EMPLOYER` et `PENDING_EMPLOYEE` ne sont jamais produits par P0-F.

---

## 4. Autorisation

* `actorId` vient **toujours** de la session serveur : jamais du corps de
  requête. Le corps de création n'accepte que `proposalId` et
  `additionalNotes` ; tout autre champ (`employerId`, `employeeId`,
  `monthlySalary`, `status`…) est refusé en `400`.
* L'identité contractuelle est **dérivée** de la proposition acceptée et de sa
  candidature : `employerId` = `proposals.employer_id`, `employeeId` =
  `applications.candidate_id`, `offerId` = `proposals.offer_id`, montant et
  modalités = ceux acceptés dans la proposition.
* Création, envoi, activation, fin et rupture : EMPLOYER **propriétaire**
  (`contracts.employer_id = actor.id`, vérifié dans la transaction).
* Signature : chaque partie ne signe que **son propre** drapeau
  (`employer_id = actor.id` ou `candidate_id = actor.id`). Un EMPLOYER salarié
  d'un autre contrat, un CANDIDATE tiers sont refusés en `403`.
* Un ADMIN ne bénéficie d'**aucun contournement** : `contracts.read` (lecture
  « partie ») lui répond `403` ; sa lecture passe uniquement par
  `admin.contracts.list`, gardée par la permission SQL `contracts:read:any`
  **déjà attribuée** à ADMIN par `migrations/0002_role_permissions_seed.sql`
  (aucune permission élargie par P0-F).
* Repository : revérification du rôle et du statut `ACTIVE` du compte relu en
  base, même quand le routeur a déjà autorisé.

---

## 5. Persistance, idempotence et concurrence

* **Worker → Repository → PostgreSQL** : `createContractRepository` reçoit
  `runInTransaction` ; `src/backend/api/entry.ts` câble les stores SQL liés à la
  même transaction. Aucun accès direct à la base depuis les handlers.
* **DEMO inchangé** : le mode DEMO reste `MockRepository` + localStorage
  (`resolveRepositoryMode` → `mock` par défaut) ; aucune dépendance PostgreSQL
  n'est introduite côté démo, aucune bascule D1, aucune nouvelle base.
* **Idempotence** : réutilisation du mécanisme P0-E4/P0-E5 — clé
  `(commande, acteur, Idempotency-Key)` + empreinte de charge utile, réservation
  synchrone (deux requêtes concurrentes portant la même clé ne lancent jamais
  deux transactions), rejeu `201`/`200`, conflit `409 IDEMPOTENCY_CONFLICT`.
  Aucun framework global n'est créé.
* **Concurrence** : `contracts.findByIdForUpdate` (`SELECT … FOR UPDATE`)
  sérialise deux transitions ; l'écriture est un compare-and-set ; la
  réservation `attachContract` renvoie `null` si la ligne est déjà liée.
* **Anti-doublon SQL** (`migrations/0005_contract_lifecycle.sql`) :
  `contracts_proposal_unique_idx` (une proposition ⇒ un seul contrat) et
  `contracts_offer_candidate_open_unique_idx` (un seul contrat **non terminal**
  par couple offre/candidat — index partiel, exactement l'anti-doublon de
  `MockRepository.generateContract`).
* **Rollback** : toute écriture (contrat, liens, historique) appartient à la
  transaction de la commande ; un échec ne laisse ni contrat orphelin, ni lien
  de proposition ou de candidature.

---

## 6. Signature : modèle réel et renforcement restant

* Le modèle réel ne possède **pas** de statut `SIGNED` distinct : il possède les
  drapeaux `employer_signed` / `employee_signed` (+ horodatages) sur le statut
  `SIGNATURE`.
* L'**envoi** par l'employeur est la signature employeur du modèle réel :
  `DRAFT → SIGNATURE` pose `employer_signed = true`.
* Le salarié signe ensuite via `contracts.sign` (`employee_signed = true`) ;
  l'état `SIGNED` du plan est alors atteint, sans inventer de statut.
* Chaque partie signe une seule fois, uniquement sur un contrat envoyé
  (`SIGNATURE`), jamais après activation ni sur un état terminal.
* **Aucune cryptographie avancée n'est inventée** : pas de PDF signé, pas de
  certificat, pas d'horodatage qualifié, pas d'OTP, pas de preuve technique
  d'acceptation. Les exigences de renforcement sont documentées dans
  `CONTRACT_SIGNATURE_STRENGTHENING_REQUIREMENTS` (empreinte du document,
  version, référence du fichier signé, preuves d'acceptation, génération et
  archivage du PDF, valeur juridique de la double signature électronique).

---

## 7. Activation

`SIGNATURE (double signature) → ACTIVE`, par l'EMPLOYER propriétaire
uniquement :

* refusée tant que `employerSigned` et `employeeSigned` ne sont pas tous deux
  vrais (`409`) ;
* refusée pour un tiers (`403`) et pour un contrat inexistant (`404`) ;
* refusée depuis `DRAFT` (`409`) et depuis tout état terminal (`409`),
  y compris `COMPLETED → ACTIVE` et `TERMINATED → ACTIVE` ;
* refusée une seconde fois (`409`) ;
* état `ACTIVE` **réellement persisté** (`contracts.status`), avec
  l'historique `CONTRACT_ACTIVATED_BILATERAL` ; deux activations concurrentes
  produisent une seule transition gagnante.

La transition d’activation ne modifie pas l’offre ni les candidatures : l’offre
reste `ACTIVE`, la candidature garde son statut d'admissibilité et aucune autre
candidature n'est fermée (voir § 12). Depuis P0-AUTO-2, seule la fondation
Automation contractuelle est déclenchée en plus; voir le document dédié pour
l’échéancier, les deadlines et les rappels sans effet monétaire.

---

## 8. Fin et terminaison (sémantique réelle conservée)

* **Fin normale** : `ACTIVE → COMPLETED` (vocabulaire du plan : `ENDED`), par
  l'employeur propriétaire, sans motif et sans logique de faute. L'historique
  persiste `CONTRACT_COMPLETED`.
* **Rupture** : `ACTIVE → TERMINATED`, par l'employeur propriétaire, **motif
  non vide obligatoire**, et **protection M1** : tant que
  `current_month < 2`, la rupture directe est refusée (`409`) car le modèle réel
  exige un **incident arbitré par LE LABEUR**.
* P0-F n'invente **aucune** logique de faute, de pénalité, d'abandon ni de
  remplacement. Le domaine INCIDENT et son arbitrage ADMIN restent fermés
  (`501`), et les champs `incident_id`, `replacement_id`,
  `replaced_contract_id` restent intacts et inutilisés : la **séparation des
  incidents existants est conservée** (`CONTRACT_FIRST_MONTH_PROTECTION_REQUIREMENTS`).
* Depuis un état terminal (`COMPLETED`, `TERMINATED`), toute action est refusée
  (`409`) : aucune transition de sortie n'existe dans le modèle réel.

---

## 9. Handlers ouverts

Uniquement ceux du domaine CONTRAT (`api/routeContracts.ts` +
`createContractApiHandlers`) :

```text
POST /api/v1/contracts                                  → contracts.create       (201, DRAFT)
GET  /api/v1/my/contracts                               → contracts.mine.list    (partie)
GET  /api/v1/contracts/:contractId                      → contracts.read         (partie)
POST /api/v1/contracts/:contractId/send                 → contracts.send         (200)
POST /api/v1/contracts/:contractId/sign                 → contracts.sign         (200, chaque partie)
POST /api/v1/contracts/:contractId/activate             → contracts.activate     (200)
POST /api/v1/contracts/:contractId/end                  → contracts.end          (200)
POST /api/v1/contracts/:contractId/terminate            → contracts.terminate    (200, motif requis)
GET  /api/v1/admin/contracts                            → admin.contracts.list   (permission SQL)
```

Restent **fermés (501)** : `contracts.monthly-action` (cycle mensuel), les
paiements et commissions, les incidents, les remplacements, les notifications
et les messages. Les routes P0-E3 / P0-E4 / P0-E5 sont intactes.

---

## 10. Événements documentés (aucun moteur créé)

`OutboxEventType` (`src/backend/productionContracts.ts`) déclare
`CONTRACT_CREATED`, `CONTRACT_SENT`, `CONTRACT_SIGNED`, `CONTRACT_ACTIVATED`,
`CONTRACT_ENDED`, `CONTRACT_TERMINATED` ; `src/backend/services/outbox.ts` en
documente le catalogue (agrégat `contract`, payload minimal, clé de
déduplication `contractId + <événement>`, effets attendus).

P0-F, pris isolément, ne créait pas de table Outbox, de Queue, de Cron ni de
consumer. P0-AUTO-2 réutilise depuis une tranche séparée la fondation Outbox /
Queue / Automation déjà présente et ne consomme ici que `CONTRACT_ACTIVATED`.
Il ne déploie pas de Cron et n’envoie aucune notification; le détail est dans
[`P0-AUTO-2_ACTIVATION.md`](P0-AUTO-2_ACTIVATION.md).

---

## 11. Migration `0005_contract_lifecycle.sql`

* **Additive uniquement** : `contracts.proposal_id` (+ FK `ON DELETE SET NULL`),
  deux index d'unicité, un index de lecture, et l'alignement des deux colonnes de
  date sur le modèle du domaine. Aucune donnée supprimée.
* **Dates du contrat** : `contracts.start_date` / `end_date` étaient `DATE`
  (0001/0003) alors que `Contract.startDate` / `endDate` sont des libellés
  affichés tels quels (`« 01 Novembre 2026 »`), comme `proposals.start_date` /
  `end_date` (0004, `TEXT`). La migration les convertit en `TEXT` avec
  `USING …::text` : aucune valeur perdue, `NOT NULL` conservé, et c'est la
  **valeur acceptée dans la proposition** qui est conservée dans le contrat.
* **Aucune modification rétroactive** des migrations `0001` → `0004`. Le rôle de
  0005 est explicite : tout ce qui touche au cycle CONTRAT s'ajoute ici.
* Ordre et manifeste respectés : `migrations/0005_contract_lifecycle.sql` est
  appliquée après `0004` ; `migrationManifest.ts`, `health.test.ts`,
  `cloudflareEntry.test.ts` et `migrationRunner.test.ts` ont été alignés sur le
  nouveau nombre de migrations.
* `proposal_id` est **optionnel** : les contrats historiques / DEMO n'en
  possèdent pas, et l'index d'unicité est partiel (`WHERE proposal_id IS NOT NULL`).
* `SEND` pose la signature employeur dans la **même écriture** que le passage
  `DRAFT → SIGNATURE` (`ContractTransitionPatch.signatureParty`, colonne
  `employer_signed` + `employer_signed_at`) : le statut et le drapeau ne peuvent
  jamais diverger, y compris sous concurrence.

---

## 12. Ce qui reste explicitement hors P0-F (automatisation post-contrat)

P0-F **ne ferme pas** les autres candidatures et **ne fait pas passer** l'offre à
`FILLED` : c'est une décision d'automatisation post-contrat, documentée dans
`POST_CONTRACT_AUTOMATION_REQUIREMENTS` :

* passage de l'offre à `FILLED` ;
* candidature retenue `HIRED` / `CONTRACTED` (P0-F ne modifie aucun statut de
  candidature) ;
* fermeture des autres candidatures (`CLOSED_OFFER_FILLED`) — **jamais
  silencieuse** ;
* notifications générales (`CONTRACT_*` → destinataires) ;
* avancement mensuel (`advanceContractMonth`), échéancier, commissions
  (25 % / 75 %), rapprochement des paiements, OTP.

---

## 13. Vérifications

```bash
npm test                 # 1232/1232 PASS (13 tests de matrice P0-F + 28 tests de cycle CONTRAT)
npm run lint             # tsc --noEmit : aucune erreur
npm run build            # bundle navigateur inchangé (pg absent)
npm run verify:postgres  # 19/19 PASS — Worker/API → PostgreSQL réel, cycle CONTRAT inclus
npm run verify:workerd   # 9/9 PASS — workerd + binding Hyperdrive, COMPLETED et TERMINATED (M2) inclus
```

Couverture de tests P0-F :

* **matrice pure** (`src/domain/contractTransitions.test.ts`) : statuts réels
  conservés, projection du vocabulaire du plan, transitions ouvertes et
  refusées, états terminaux, signature (une fois par partie, jamais après
  activation), double signature exigée pour l'activation, motif et protection
  M1, éligibilité identique à P0-E5, automatisation post-contrat documentée,
  renforcement de signature, événements ;
* **cycle réel** (`src/backend/api/contracts.test.ts`, PGlite/PostgreSQL) :
  création depuis `ACCEPTED`, refus par statut (`SENT`, `DECLINED`, `EXPIRED`,
  `DRAFT`, `REVISION_REQUESTED`), proposition inexistante, incohérences
  offre/candidat, mauvaise identité imposée par le corps, autres employeurs et
  tiers, proposition déjà utilisée, double création, idempotence (même clé /
  charge différente / rejeu d'action), concurrence (création, signature,
  activation, fin), signature avant envoi et après activation, activation
  refusée avant signature, `DRAFT → ACTIVE` et `SENT → ACTIVE` refusés,
  `ENDED → ACTIVE` et `TERMINATED → ACTIVE` refusés, fin et rupture, protection
  M1, lecture bornée aux parties, lecture ADMIN par permission, rollback
  PostgreSQL, compte non `ACTIVE`, séparation DEMO/API et frontière `501`.

---

## 14. Hors périmètre — reste après P0-F

Paiements, commissions (25 % / 75 %), salaires, échéancier, rapprochement, OTP,
plaintes/incidents et arbitrage, remplacement, matching, réputation,
notifications générales, Cron, Queue, moteur d'automatisation global, WebRTC,
R2 complet et design final restent **hors P0-F**.
