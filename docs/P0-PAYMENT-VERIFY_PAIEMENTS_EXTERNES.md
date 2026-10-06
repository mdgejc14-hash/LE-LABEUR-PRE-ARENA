# P0-PAYMENT-VERIFY — vérification opérationnelle des paiements externes

## 1. Objectif

Relier la chaîne réellement demandée, **sans jamais créer de système de paiement
interne** :

```
MISSION TERMINÉE           (contrat COMPLETED / TERMINATED, statuts P0-F existants)
      ↓
PAIEMENT ATTENDU           (payments.close-mission : échéances ATTEINTES → DUE)
      ↓
PAIEMENT EXTERNE FOURNI    (déclaration employeur : référence + preuve, hors plateforme)
      ↓
VÉRIFICATION LE LABEUR     (décision ADMIN, webhook fournisseur, rapprochement)
      ↓
PAIEMENT CONFIRMÉ / REJETÉ / À RÉVISER
```

Règle absolue conservée : **LE LABEUR ne garde pas le salaire**. L'employeur paie
directement le travailleur **et** paie séparément LE LABEUR (25 % du premier
mois). Le système ne fait que **constater, vérifier et enregistrer** l'état.

## 2. Constat d'audit (avant modification)

| Élément | Constat |
|---|---|
| Cycle `Payment` (P0-PAY-1) | `SCHEDULED → DUE → PENDING_VERIFICATION → VERIFIED → PAID`, `REJECTED` + régularisation ; compare-and-set, idempotence durable et de rejeu, audit, Outbox : **existant, conservé**. |
| Fournisseur externe (P0-PAY-2) | `PaymentProviderAdapter`, adaptateur de test `TEST_GATEWAY`, webhook HMAC + anti-replay, `reconcile()` : **existant, conservé**. |
| Rapprochement de masse (P0-PAY-3) | Batches, items, revues (`OPEN`/`CONFIRMED`/`REJECTED`), tentatives de correction, verdicts `MATCH`/`MISMATCH`/`NOT_FOUND`/`DUPLICATE`/`REVIEW_REQUIRED` : **existant, conservé**. |
| Fin de mission | `contracts.end` → `COMPLETED`, `contracts.terminate` (M2+) → `TERMINATED`, `contracts.confirm-execution` → `EXECUTION_CONFIRMED` : **existant, inchangé**. |
| **Blocage constaté** | `lockPaymentFor()` et `declarePayment()` exigeaient `contract.status === 'ACTIVE'`. Dès la fin de mission, **toute** progression du cycle répondait `409` : plus aucune déclaration, vérification, confirmation ou rejet n'était possible — alors que c'est exactement le moment où l'employeur paie hors plateforme. Le modèle réel (`MockRepository.confirmMonthlyAction`, `DECLARE_SALARY`) n'exige, lui, que « échéance `DUE`/`REJECTED` **et** date d'échéance atteinte ». |
| **Manque constaté** | Aucun moyen de rendre explicites les **paiements attendus** d'une mission terminée : les échéances atteintes restaient `SCHEDULED` tant qu'aucun worker n'était drainé (aucun Cron de production). |

Reproduction avant correctif (harnais PGlite réel) :

```
END contract: 200 (COMPLETED)
DECLARE après mission terminée: 409 — « Un paiement ne se déclare que sur un contrat actif (statut : COMPLETED). »
APPROVE après mission terminée: 409 — « Le cycle paiement ne progresse que sur un contrat actif (statut : COMPLETED). »
```

## 3. Ce qui a été implémenté (strict minimum)

### 3.1 Domaine pur — `src/domain/paymentLifecycle.ts`

- `PAYMENT_CONTRACT_CYCLE_STATUSES` = `ACTIVE`, `COMPLETED`, `TERMINATED` :
  le cycle progresse sur un contrat ayant **atteint l'exécution**, fin de mission
  incluse. `DRAFT`, `SIGNATURE`, `REPLACED` restent refusés (motifs documentés).
- `PAYMENT_MISSION_END_CONTRACT_STATUSES` = `COMPLETED`, `TERMINATED`.
- `evaluatePaymentContractGate(contractStatus)` : garde unique, pure, sans E/S.
- `evaluatePaymentExpectation()` : projette une échéance réelle en
  `NOT_DUE_YET` / `TO_MARK_DUE` / `AWAITING_EXTERNAL_PAYMENT` /
  `AWAITING_VERIFICATION` / `TO_REVISE` / `SETTLED` — **aucun statut stocké**,
  aucun montant recalculé, aucun prorata inventé.
- `evaluatePaymentVerificationOutcome()` : dérive `CONFIRMED` / `REJECTED` /
  `TO_REVISE` / `PENDING` des statuts réels et du verdict de rapprochement
  (`REJECTED` + `DUPLICATE` = rejet non régularisable, sinon régularisation).
- `PAYMENT_CLOSE_MISSION_COMMAND` (`payments.CLOSE_MISSION`),
  `CLOSE_MISSION_PAYMENT_RULES`, action d'audit `PAYMENT_MISSION_CLOSED`.

### 3.2 Repository — `src/backend/repositories/paymentRepository.ts`

- Les deux gardes `contract.status !== 'ACTIVE'` sont remplacées par
  `evaluatePaymentContractGate()` : un contrat **terminé** reste gérable, un
  contrat non exécuté reste refusé (`409`).
- Nouvelle commande `closeMissionPayments(actor, contractId, command)` :
  1. compte `ACTIVE`, rôle `EMPLOYER`, **propriétaire du contrat** (session, jamais le corps) ;
  2. contrat verrouillé (`FOR UPDATE`), mission **terminée** exigée (`409` sinon) ;
  3. idempotence durable (`payments.CLOSE_MISSION`) + rejeu process-local ;
  4. **matérialisation de rattrapage** depuis l'échéancier déjà validé (`createIfAbsent`) ;
  5. bascule `SCHEDULED → DUE` des **seules échéances atteintes**, via la
     transition `MARK_DUE` **existante** (événement `PAYMENT_DUE`, projection
     `payment_schedule`, audit `PAYMENT_DUE` par `SYSTEM`) ;
  6. audit `PAYMENT_MISSION_CLOSED` (`source: api:P0-PAYMENT-VERIFY`) et vue des
     paiements attendus (`expectedPayments`, `payments`, `rules`).

### 3.3 API — `src/backend/api/routeContracts.ts`

```
POST /api/v1/contracts/:contractId/payments/close-mission
```

Authentification requise, scope `owner`, rôle `EMPLOYER`, `Idempotency-Key`
obligatoire, audit de mutation. Le corps est ignoré : tout est dérivé du contrat
relu côté serveur.

## 4. Migrations

**Aucune migration ajoutée.** Les tables et contraintes nécessaires existent
depuis 0001/0003/0006/0007/0008/0009. La clôture n'écrit aucun nouvel état : elle
réutilise `payments`, `automation_outbox`, `automation_audit_ledger`,
`automation_idempotency` et la projection `contracts.payment_schedule`.

## 5. Tests

- `src/domain/paymentLifecycle.test.ts` : 4 cas purs ajoutés (garde de contrat,
  natures de paiement attendu, issues opérationnelles, garde-fous de clôture).
- `src/backend/api/paymentMissionClose.test.ts` : 10 cas Worker/API → PGlite
  (clôture nominale, idempotence de rejeu et de seconde clé, autorisations
  401/403/404, gardes `ACTIVE`/`DRAFT`, chaîne complète
  déclaration → `PENDING_VERIFICATION` → `VERIFIED` → `PAID` avec commission
  séparée, rejet motivé et régularisation « À RÉVISER », webhook signé après
  rupture, concurrence, périmètre, reprise après échec).

## 6. Non-objectifs (explicitement NON implémentés)

- Aucun escrow, aucun cantonnement, aucun portefeuille LE LABEUR, aucune
  détention ni transfert de fonds, aucun paiement interne, aucun Mobile Money
  réel (les opérateurs restent `implemented: false`).
- Aucun statut de paiement nouveau, aucun échéancier rouvert après
  `COMPLETED`/`TERMINATED`, aucun prorata, aucun versement partiel,
  `commission_percentage = 25` jamais réécrit.
- Aucune notification, aucun Cron/Queue de production, aucun R2/KYC, aucun
  remplacement, aucun matching avancé, aucune réputation, aucune UI finale.
- L'avancement mensuel (`payments.advance-month`) reste **refusé** hors contrat
  `ACTIVE` : la réouverture d'un échéancier n'est définie par aucune règle du
  modèle.
