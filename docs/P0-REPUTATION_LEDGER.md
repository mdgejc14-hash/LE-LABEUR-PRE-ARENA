# P0-REPUTATION — ledger d'événements documentés

> Principe canonique : **ÉVÉNEMENT → ENTRÉE → RÈGLE/VERSION → EXPLICATION → VUE**.
> Le ledger est la source de vérité ; la « réputation » n'est qu'une vue DÉRIVÉE,
> recalculée à chaque lecture. Aucun score n'est stocké, aucun modèle prédictif,
> aucun classement social, aucune décision juridique.

## 1. Ce qui existait déjà et qui est RÉUTILISÉ (aucun doublon)

| Existant | Usage par la réputation |
| --- | --- |
| `automation_outbox` (0006) | Source des faits événementiels observés (`SALARY_CONFIRMED`, `CLAIM_RESOLVED`). Aucun producteur ajouté, aucun événement modifié. |
| `automation_audit_ledger` (0006) | **Seul** ledger d'audit : création d'entrée, réconciliation, correction ADMIN. Aucun second ledger. |
| `automation_idempotency` (0006) | Idempotence durable des commandes (`reconcile`, `correct`). |
| `contracts.status` / `contracts.history` (0001/0003/0005) | Faits persistés `CONTRACT_COMPLETED` et `EXECUTION_CONFIRMED` (aucun événement Outbox pour ces transitions : ils sont donc RELUS, jamais réinventés). |
| `salary_confirmations` (0010) | Niveau de preuve retenu pour un paiement salarial reçu (OTP/nonce persistés). |
| `claims` (0011) | Décision ADMIN (`status = RESOLVED`, `resolved_by` réel). |
| `replacements` (0013) | Jamais une pénalité en soi ; seule la décision ADMIN du litige produit une entrée. |
| `users`, `role_permissions` | Aucun nouveau code de permission : `audit:read` (lecture ADMIN) et `incidents:arbitrate` (correction ADMIN) sont réutilisés. |
| Worker d'automatisation (P0-AUTO-2) | Le processeur de réputation est un `SupplementalAutomationProcessor` : claim verrouillé, tentatives, RETRY/DEAD_LETTER, idempotence et audit hérités sans une ligne de plus. |

## 2. Faits admis et règles (P0-REPUTATION-1)

| Fait source | Règle | Sujet | Catégorie | Impact |
| --- | --- | --- | --- | --- |
| `CONTRACT_COMPLETED` (statut contrat + historique) | `CONTRACT_COMPLETED_PARTY` | salarié et employeur | `MISSION_EXECUTION` | +3 |
| `EXECUTION_CONFIRMED` (historique contrat) | `EXECUTION_CONFIRMED_PARTY` | salarié et employeur | `MISSION_EXECUTION` | +2 |
| `SALARY_CONFIRMED` (Outbox, confirmation du salarié) | `SALARY_RECEIPT_CONFIRMED_EMPLOYER` | employeur | `PAYMENT_RELIABILITY` | +3 |
| `CLAIM_RESOLVED` par décision ADMIN (`actorType: ADMIN`) | `ADMIN_DECISION_FAVORABLE_CLAIMANT` | demandeur | `DISPUTE_OUTCOME` | +1 |
| `CLAIM_RESOLVED` par décision ADMIN (`actorType: ADMIN`) | `ADMIN_DECISION_UNFAVORABLE_RESPONDENT` | défendeur | `DISPUTE_OUTCOME` | −4 |

`SEULE` une décision ADMIN produit l'entrée négative : l'auto-résolution
déterministe (`actorType: SYSTEM`, audit `faultAttributed: false`) ne produit
**aucune** entrée.

### Neutralité (aucune pénalité automatique)

- Claim ouvert, preuve demandée, preuve fournie, échéance de preuve, escalade :
  **aucune** entrée.
- Claim **rejeté** : aucune entrée — exercer un recours n'est pas un manquement.
- Restriction provisoire et sa levée : **aucune** entrée.
- Remplacement : `REPLACEMENT_CREATED` ne produit **rien** ; la faute éventuelle
  est établie par la décision ADMIN du litige.
- Paiement déclaré / en attente / approuvé / rejeté / `PAID` (rapprochement local
  `movedFunds: false`) : **aucune** entrée. Seule la confirmation du salarié
  (niveau de preuve réel) compte.
- `CONTRACT_TERMINATED`, `PAYMENT_OVERDUE_J3`, incidents, comptes bloqués :
  aucune règle, pour des raisons documentées dans `REPUTATION_FACT_COVERAGE`.

### Critères interdits

Aucune donnée sensible ou discriminatoire (origine, ethnie, religion, opinion,
appartenance syndicale, santé, vie sexuelle, données génétiques, biométrie,
photo, casier, etc.) n'existe dans le schéma, et
`assertNoProtectedAttributeFields` refuse tout champ de ce type. La provenance
d'une entrée est stockée dans la colonne **`provenance`** (`EVENT`,
`RECONCILIATION`, `ADMIN_DECISION`) — jamais une « origine » de personne.

## 3. Ledger (migration 0015)

`reputation_entries` : `reputation_id`, `subject_user_id`, `source_event`,
`source_event_id`, `source_entity_type`, `source_entity_id`, `rule_code`,
`rule_version`, `category`, `direction`, `impact`, `explanation`, `actor_id`,
`provenance`, `occurred_at` (date du FAIT), `created_at`, `status`, `reversed_*`,
`history` (append-only), `dedupe_key`.

Garanties portées par PostgreSQL :

1. `reputation_entries_dedupe_unique_idx` — un même fait logique ne peut pas
   produire deux entrées, même sous deux workers concurrents.
2. `reputation_entries_direction_impact_check` — une entrée `POSITIVE` a un
   impact `> 0`, `NEGATIVE` `< 0`, `NEUTRAL` `= 0`.
3. `reputation_entries_reversal_complete_check` — une entrée révoquée porte
   toujours son auteur, sa date et son motif (jamais d'annulation silencieuse).
4. Aucune colonne de score, aucune colonne sensible.

## 4. Vue dérivée (aucun score stocké)

`computeReputationView` agrège les seules entrées `ACTIVE` : impact net, impacts
positifs/négatifs, compteurs, répartition par catégorie, versions de règles
observées, explication textuelle. Les entrées révoquées restent consultables
mais sortent du score : **la correction change la vue, jamais l'histoire**.
La vue déclare elle-même `sourceOfTruth: 'LEDGER'` et `automaticSanction: false`.

## 5. API

| Route | Portée | Permission |
| --- | --- | --- |
| `GET /api/v1/my/reputation` | soi | — |
| `GET /api/v1/my/reputation/entries` | soi | — |
| `POST /api/v1/my/reputation/reconcile` | soi | — (idempotence + audit) |
| `GET /api/v1/admin/reputation/entries` | ADMIN | `audit:read` |
| `GET /api/v1/admin/reputation/entries/:reputationId` | ADMIN | `audit:read` |
| `POST /api/v1/admin/reputation/entries/:reputationId/correct` | ADMIN | `incidents:arbitrate` |
| `POST /api/v1/admin/reputation/reconcile` | ADMIN | `incidents:arbitrate` |

La **réconciliation** relit les faits DÉJÀ persistés d'un sujet et n'ajoute que
les entrées manquantes (`onlySubjectUserId` : la réconciliation d'un utilisateur
n'écrit jamais dans le ledger d'un autre). Elle rend le ledger recalculable sans
créer le moindre producteur d'événement.

## 6. Hors périmètre (points ouverts)

- Aucun branchement sur P0-MATCHING : le score n'alimente **pas** le ranking
  (poids 60/30/10 inchangés, aucune lecture de la réputation par le matching).
- Aucune notification déclenchée par un calcul de réputation (aucun événement
  Outbox ajouté) : seule la couche P0-NOTIFICATIONS existante reste en place.
- Aucun « abandon confirmé » : il n'existe aucun fait d'abandon dans le dépôt ;
  un abandon établi passerait par la décision ADMIN d'un Claim, déjà couverte.
- Réconciliation déclenchée explicitement : un balayage planifié (Cron) est une
  tranche ultérieure ; l'opération est idempotente, donc sûre à planifier.
