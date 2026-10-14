# P0-E5 — Propositions d'embauche

Point de départ : `e8c2d602fe1b0220d6fff2e9f1e2426eb7c7c9a4` (P0-E4 validé).
Branche de travail : `arena/9f580cb5-le-labeur-pre-arena` (dérivée de
`arena/59eb15a0-le-labeur-pre-arena`).

Objectif : ouvrir la **première tranche réelle du cycle Proposition** — émission,
acceptation, déclinaison, expiration — sans ouvrir les contrats, la signature,
les paiements, les commissions, les plaintes, les remplacements ni
l'automatisation globale.

---

## 1. Modèle réellement utilisé (aucun statut inventé)

Domaine : `src/types/index.ts` → `MissionProposal` + `ProposalStatus`.
Contrainte SQL : `migrations/0004_proposals.sql` (`proposals.status`).
Dérivation des règles : `MockRepository.sendProposal` / `respondToProposal`
(`src/repositories/mockRepository.ts`) et l'inventaire `docs/statecharts.mmd`.

```text
DRAFT | SENT | REVISION_REQUESTED | ACCEPTED | DECLINED | EXPIRED
```

Correspondance avec le vocabulaire du plan — **le nom du code est conservé** :

| Vocabulaire fonctionnel | Nom conservé dans le code |
|---|---|
| PROPOSAL_SENT | `SENT` |
| ACCEPTED | `ACCEPTED` |
| REJECTED | `DECLINED` (le code n'utilise jamais `REJECTED` pour une proposition) |
| EXPIRED | `EXPIRED` |

Statuts du modèle réel **non produits** par cette tranche :

* `DRAFT` — jamais produit par le modèle réel (« MANQUE : DRAFT jamais produit ») ;
* `REVISION_REQUESTED` — atteint uniquement par l'action `REVISE`, non ouverte
  ici (voir § 3).

Source de vérité de la matrice : `src/domain/proposalTransitions.ts`
(module pur, partagé, sans dépendance serveur).

### Table `proposals` (migration `0004_proposals.sql`)

Colonnes dérivées de `MissionProposal` : `id`, `conversation_id`, `contract_id`,
`offer_id`, `application_id`, `employer_id`, `employee_id`, `mission_title`,
`amount`, `currency`, `periodicity`, `start_date`, `end_date`,
`duration_months`, `location`, `conditions` (JSONB), `status`,
`revision_notes`, `sent_at`, `created_at`, `updated_at`.

* `employerName` / `employeeName` ne sont **pas** dupliqués en base : ils sont
  résolus depuis `users` à la projection (même choix que `ApplicationRecord`).
* Contraintes : `amount > 0`, `duration_months > 0`, périodicités réelles
  (`Mensuel | Hebdomadaire | Forfait mission`), statuts réels, parties distinctes.
* **Aucun champ d'échéance n'est inventé** : `MissionProposal` n'en possède aucun
  (voir § 6).

---

## 2. Transitions implémentées

| Opération | Acteur | Transition | Gardes |
|---|---|---|---|
| Émission (`proposals.create`) | EMPLOYER propriétaire de l'offre | `∅ → SENT` | candidature existante, de cette offre, non terminale, sans contrat ; offre `ACTIVE` ; candidat `CANDIDATE` `ACTIVE` |
| Acceptation (`proposals.respond`, `ACCEPT`) | CANDIDATE **destinataire** | `SENT → ACCEPTED` | proposition sans contrat lié |
| Déclinaison (`proposals.respond`, `DECLINE`) | CANDIDATE **destinataire** | `SENT → DECLINED` | proposition sans contrat lié |
| Expiration (`proposals.expire`) | EMPLOYER **émetteur** | `SENT → EXPIRED` | proposition sans contrat lié |
| Lecture ADMIN (`admin.proposals.list`) | ADMIN + permission SQL `applications:read:any` | lecture seule | — |

Chaque transition :

* met à jour `proposals.status` et `proposals.updated_at` (compare-and-set) ;
* s'exécute dans **une transaction PostgreSQL** (Worker → Repository → stores SQL),
  avec rollback automatique en cas d'échec ;
* n'entraîne **aucun** effet hors domaine : l'offre reste `ACTIVE`, la
  candidature reste dans son statut, aucun contrat n'est créé, aucune
  notification n'est émise, aucun événement n'est publié.

Éligibilité d'une candidature (`PROPOSAL_ELIGIBLE_APPLICATION_STATUSES`) :
`PENDING | REVIEW | SHORTLISTED` — exactement le complément des statuts
terminaux de P0-E4. Une candidature `REJECTED`, `WITHDRAWN`, `HIRED`,
`CONTRACTED`, `CLOSED_OFFER_FILLED` ou déjà liée à un contrat est refusée (409).

---

## 3. Transitions refusées

| Situation | Résultat |
|---|---|
| Toute action sur `ACCEPTED`, `DECLINED`, `EXPIRED` (y compris la répétition de celle qui a clos la proposition) | `409 BUSINESS_RULE_VIOLATION` |
| `ACCEPT`/`DECLINE`/`EXPIRE` sur `DRAFT` ou `REVISION_REQUESTED` (statuts non produits par P0-E5) | `409` (transition interdite) |
| `REVISE` (demande de révision → `REVISION_REQUESTED`) | `501 NOT_IMPLEMENTED` — seconde tranche, aucune règle inventée |
| Réponse par un autre CANDIDATE que le destinataire | `403 FORBIDDEN` |
| Réponse par un EMPLOYER (routeur) ou expiration par un CANDIDATE (routeur) | `403` |
| Expiration par un EMPLOYER qui n'est pas l'émetteur | `403` |
| Émission par un EMPLOYER non propriétaire de l'offre de la candidature | `403` |
| Émission par un CANDIDATE / ADMIN (routeur) | `403` |
| Acteur absent de PostgreSQL / sans session | `401 UNAUTHENTICATED` |
| Compte non `ACTIVE` (BLOCKED/PENDING) | `403 FORBIDDEN` (repository) |
| Candidature inexistante | `404 NOT_FOUND` |
| Proposition inexistante (réponse ou expiration) | `404 NOT_FOUND` |
| Candidature non admissible (terminale ou liée à un contrat), offre non `ACTIVE`, candidat non admissible | `409` |
| `offerId` de la charge utile différent de l'offre de la candidature | `409` |
| Charge utile invalide (montant ≤ 0, durée ≤ 0, périodicité inventée, champ inconnu, identité fournie par le client) | `400 VALIDATION_ERROR` |
| `Idempotency-Key` absente | `400 IDEMPOTENCY_KEY_REQUIRED` |
| Même clé, charge utile différente | `409 IDEMPOTENCY_CONFLICT` |
| Transition concurrente perdante (compare-and-set) | `409` si l'état final diffère, `200` si l'état final est déjà la cible |

Aucune transition sortante de `ACCEPTED`, `DECLINED` ou `EXPIRED` n'est ouverte :
le modèle réel ne prévoit rien de tel, et la création/activation du contrat
appartient à P0-F.

---

## 4. Autorisation

* `actorId` vient **toujours** de la session serveur : jamais du corps de
  requête. Le corps d'émission refuse explicitement tout champ d'autorité
  (`employerId`, `employeeId`, `status`, `conversationId`… → `400`), et
  `ServerCreateProposalInput` exclut déjà ces champs.
* `employeeId` est dérivé de la **candidature** (`applications.candidate_id`) :
  le client ne choisit jamais le destinataire.
* `employerId` est celui de la session, vérifié propriétaire de l'offre de la
  candidature (`offers.employer_id = actor.id`) **dans la transaction**.
* Réponse : `proposals.employee_id = actor.id`, relu `FOR UPDATE`.
* Expiration : `proposals.employer_id = actor.id`.
* Lecture ADMIN : rôle `ADMIN` (routeur : permission `applications:read:any`
  issue du RBAC SQL) **et** revérification du rôle + du compte `ACTIVE` dans le
  repository.
* Un ADMIN ne bénéficie d'aucun contournement implicite sur les transitions.

### Conversation : conteneur de transport, pas source d'autorité

Aucune table `conversations` n'existe côté serveur (le domaine MESSAGES reste
fermé). L'identifiant de conversation reçu dans le chemin est **conservé tel
quel** comme conteneur de transport, mais l'autorité est intégralement résolue
depuis `applications` + `offers` + `users`. Le store réel exigeait en outre une
candidature (`applicationId`) pour lier la proposition à une offre : c'est donc
elle qui porte l'éligibilité et l'ownership, jamais la conversation.

---

## 5. Persistance, idempotence et concurrence

Chaîne : **Worker → Repository `Proposal` → stores SQL → PostgreSQL**.

* Transaction : `PostgreSqlDatabase.run` (BEGIN / COMMIT / ROLLBACK sur une
  connexion dédiée) ; toutes les lectures et l'unique écriture de la commande y
  sont exécutées.
* Verrous : `SELECT … FOR UPDATE` sur la ligne proposition **et** sur la
  candidature à l'émission ; `SELECT … FOR SHARE` sur l'offre et les comptes.
* Écriture : `compareAndSetStatus` — `UPDATE … WHERE id = $1 AND status = $2`.
  Aucune réécriture depuis une valeur lue : une transition concurrente qui a
  gagné n'est jamais écrasée.
* En cas de compare-and-set perdu, le repository **relit** dans la transaction :
  état déjà cible ⇒ rejeu (200), état différent ⇒ `409`, ligne disparue ⇒ `404`.
* Idempotence : cache de rejeu process-local `(commande, acteur, clé)` avec
  empreinte de charge utile — même mécanisme qu'en P0-E1/P0-E3/P0-E4, sans
  nouveau framework global. Même clé ⇒ même résultat rejoué ; même clé avec une
  charge utile différente ⇒ `409 IDEMPOTENCY_CONFLICT`.
* Les états clos sont refusés **avant** toute écriture (409), mais le rejeu
  d'une commande déjà exécutée avec la même clé reste un `200` sans double effet.

Mode DEMO inchangé : `MockRepository` + `localStorage`, sans PostgreSQL.

---

## 6. Expiration et deadline (ce qui reste à automatiser)

Constat du modèle réel : `MissionProposal` **ne porte aucun champ d'échéance**
(ni `expiresAt`, ni `deadline`, ni `expirationDate`), et aucune migration
antérieure n'en crée. P0-E5 ne peut donc pas « faire respecter » une deadline
qui n'existe pas, et **n'en invente aucune** : il modélise l'état `EXPIRED` et sa
transition explicite `SENT → EXPIRED`, autorisée au seul émetteur.

Ce qui est réellement appliqué dans cette tranche :

* `EXPIRED` est un état du domaine, persisté et projeté comme les autres ;
* une proposition expirée est close : `ACCEPT`, `DECLINE`, `EXPIRE` y sont
  refusés (409), y compris la répétition de l'expiration ;
* l'expiration et l'acceptation concurrentes ne peuvent pas produire d'état
  impossible (verrou de ligne + compare-and-set) ;
* l'expiration ne produit aucun effet hors domaine.

Ce qui devra être fait plus tard (documenté dans
`PROPOSAL_EXPIRATION_AUTOMATION_REQUIREMENTS`, `src/domain/proposalTransitions.ts`) :

1. ajouter au modèle réel un **champ d'échéance** (colonne + type) — aucune règle
   de temps ne peut précéder cette décision de modélisation ;
2. décider la **durée d'expiration par défaut** (règle métier à valider) et la
   stocker à l'émission ;
3. créer le **moteur Cron/Queue global** (hors P0-E5) et y produire la transition
   `SENT → EXPIRED` **à l'identique** de `PROPOSAL_EXPIRATION_RULE` ;
4. rendre ce traitement idempotent (clé de déduplication `proposalId + EXPIRED`)
   et sûr vis-à-vis d'une acceptation/déclinaison concurrente.

Aucun scheduler, aucun Cron, aucun worker de queue n'est créé par P0-E5.

---

## 7. Handlers ouverts

| Route | Méthode | Rôle | Idempotence |
|---|---|---|---|
| `/api/v1/conversations/:conversationId/proposals` | POST | EMPLOYER propriétaire | requise |
| `/api/v1/proposals/:proposalId/respond` | POST | CANDIDATE destinataire (`ACCEPT`/`DECLINE`) | requise |
| `/api/v1/proposals/:proposalId/expire` | POST | EMPLOYER émetteur | requise |
| `/api/v1/admin/proposals` | GET | ADMIN + `applications:read:any` | — |

Restent fermés (501) : contrats, signature, activation de contrat, paiements,
commissions, plaintes, remplacements, matching, réputation, notifications
générales, messages, documents, R2, queue et cron. `REVISE` reste fermé sur la
route de réponse.

---

## 8. Événements documentés (aucun moteur créé)

Types déclarés dans `OutboxEventType` et `OUTBOX_EFFECT_CONTRACTS`
(`src/backend/services/outbox.ts`), contrats décrits dans
`DOCUMENTED_PROPOSAL_EVENTS` (`src/domain/proposalTransitions.ts`), en
conservant la convention préparée en P0-E4 (aucun consumer, aucune queue,
aucun cron, aucune notification automatique) :

| Événement | Émis par | Clé de déduplication |
|---|---|---|
| `PROPOSAL_SENT` | émission | `proposalId + SENT` |
| `PROPOSAL_ACCEPTED` | `ACCEPT` | `proposalId + ACCEPTED` |
| `PROPOSAL_DECLINED` | `DECLINE` | `proposalId + DECLINED` |
| `PROPOSAL_EXPIRED` | `EXPIRE` (et, plus tard, l'échéance) | `proposalId + EXPIRED` |

---

## 9. Contrat de domaine préparé pour P0-F

Le domaine est prêt pour la suite **sans la produire** :

```text
PROPOSAL ACCEPTED
   └── (P0-F) création / activation du contrat — hors de cette tranche
```

P0-E5 ne crée **jamais** : contrat, contrat `ACTIVE`, salaire, commission, offre
`FILLED`, fermeture automatique des autres candidatures, échéancier, ni
notification. Le lien futur est déjà possible côté données (`proposals.contract_id`
existe dans le modèle réel et reste non producteur ici).

---

## 10. Vérifications

| Commande | Résultat P0-E5 |
|---|---|
| `npm test` | suites `P0-E5 — cycle PROPOSITION` (matrice pure) et `P0-E5 — émission et cycle PROPOSITION` (PostgreSQL) : 39 cas, plus toutes les suites antérieures inchangées |
| `npm run lint` | `tsc --noEmit` |
| `npm run build` | bundle navigateur (aucune couche serveur importée) |
| `npm run verify:postgres` | `P0-E5 Worker/API → PostgreSQL` sur PostgreSQL 17.10 réel : émission, acceptation, expiration, rejeu idempotent, tiers refusé, `REVISE` fermé, aucun contrat, offre toujours `ACTIVE` |
| `npm run verify:workerd` | même parcours sous workerd + binding Hyperdrive local, persistance vérifiée dans PostgreSQL |

Migrations : `0001 → 0004` (`0004_proposals.sql`), manifeste et `/healthz`
alignés (`EXPECTED_MIGRATION_IDS`).

---

## 11. Hors périmètre — reste pour P0-F et suivants

* contrats : génération depuis une proposition acceptée, signature, activation
  bilatérale, résiliation ;
* passage automatique de l'offre à `FILLED`, candidature `HIRED` /
  `CONTRACTED`, fermeture des autres candidatures ;
* boucle de révision (`REVISE` → `REVISION_REQUESTED` → nouvelle proposition) ;
* échéance réelle + Cron/Queue d'expiration automatique (voir § 6) ;
* paiements, commissions, plaintes, remplacements, réputation, matching, R2 ;
* moteur Outbox/Queue, consumer idempotent, notifications générales ;
* refonte d'interface.
