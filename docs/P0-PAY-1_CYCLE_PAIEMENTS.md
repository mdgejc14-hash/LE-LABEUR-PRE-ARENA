# P0-PAY-1 — Cycle MÉTIER des paiements (aucun paiement réel)

Point de départ : `e3c27ca8ff2ec9622e26d654643cf56f9477e3d9` (checkpoint
`arena/958e0b27-le-labeur-pre-arena` : P0-E3, P0-E4, P0-E5, P0-F, P0-AUTO-1,
intégration Automation réelle et P0-AUTO-2 — PR #21 non modifiée).
Branche de travail : `arena/0500df5a-le-labeur-pre-arena`, PR empilée ciblant
`arena/958e0b27-le-labeur-pre-arena`.

> La tentative `arena/5c567af3-le-labeur-pre-arena` (`5f2d6c4…`) reste **hors
> chemin canonique** : rien n'en a été récupéré, aucun cherry-pick, aucune
> comparaison d'implémentation.

## 1. Objectif

Construire **le cycle métier** qui manquait entre « une échéance est due » et
« l'ADMIN décide », avant toute intégration d'un moyen de paiement réel :

```text
SCHEDULED
  ↓ (échéance atteinte, balayage borné du worker)
DUE
  ↓ DÉCLARATION employeur (montant exact du contrat, référence obligatoire)
PENDING_VERIFICATION
  ↓ VÉRIFICATION locale déterministe (ADMIN)
   ├─ → VERIFIED → (rapprochement local) → PAID
   └─ → REJECTED → (NOUVELLE déclaration) → PENDING_VERIFICATION
```

Aucun de ces états n'affirme qu'un transfert a été exécuté par la plateforme :
`PAID` est un **état métier** (vérifié et rapproché localement), `movedFunds`
vaut `false` partout, et `docs` + tests le verrouillent.

## 2. Ce qui a été créé

| Fichier | Rôle |
| --- | --- |
| `migrations/0008_payment_cycle.sql` | tables `payments` et `payment_declarations`, index bornés, contraintes de cohérence |
| `src/domain/paymentLifecycle.ts` | règles pures : statuts, matrice de transitions et interdits, matérialisation, garde de déclaration, vérification locale,-events, avance de rappel, frontière fournisseur |
| `src/backend/persistence/paymentRecords.ts` | ports (enregistrements + stores) du cycle, sans dépendance à un pilote |
| `src/backend/persistence/sqlPaymentStores.ts` | implémentation PostgreSQL paramétrée : `FOR UPDATE`, compare-and-set, fusion JSONB, limites bornées |
| `src/backend/repositories/paymentRepository.ts` | repository + handlers API (9 routes), idempotence durable + cache de rejeu, projection contrat, audit |
| `src/backend/payments/paymentVerification.ts` | `PaymentProviderAdapter`, `verifyTransaction()`, `handleWebhook()`, `reconcile()` — **abstractions non branchées**, refus explicite `NOT_IMPLEMENTED` |
| `src/backend/payments/paymentErrors.ts` | `PaymentLifecycleError` (code → HTTP) |
| `src/backend/automation/paymentCycle.ts` | matérielisation depuis `CONTRACT_ACTIVATED`, jobs pré-échéance conditionnels, balayage `SCHEDULED → DUE` |
| `src/backend/api/payments.test.ts`, `src/domain/paymentLifecycle.test.ts` | 27 tests d'intégration réels (PGlite) + 20 tests de domaine pur |

## 3. Décisions structurantes

1. **Aucun second moteur.** Pas de scheduler, pas de file, pas de machine à états
   parallèle : le cycle réutilise `automation_outbox`, `automation_jobs`,
   `automation_deadlines`, `automation_audit_ledger`, `automation_idempotency`,
   l'`AutomationEngine`, le `Queue` et le `ScheduledJob` déjà câblés en
   P0-AUTO-1/P0-AUTO-2. Le balayage `SCHEDULED → DUE` est une **étape du `drain`
   du worker existant**, pas un cron nouveau.
2. **Performance à l'échelle.** La bascule d'échéance s'appuie sur un index
   partiel `(due_at, id) WHERE status IN ('SCHEDULED')` et une limite bornée :
   ni job par utilisateur, ni polling global, ni scan complet. 100 ou 10 000
   utilisateurs lisent la même requête bornée.
3. **Propriétaire résolu depuis le contrat.** `employerId`, `candidateId`,
   `paymentType`, `amount`, `currency`, `verifiedBy`, `status`, `idempotencyKey`
   sont des champs **serveur** : envoyés par un client, ils sont refusés (400).
   Un tiers (autre employeur, salarié sur la commission, employeur non
   propriétaire) est refusé (403), un paiement inconnu (404).
4. **Séparation stricte des natures.** `payments.salary.declare` et
   `payments.commission.declare` sont deux routes ; la nature est lue sur la
   **ligne visée**. Une route salaire qui ciblerait une commission → 409. Un
   salarié ne voit que ses `SALARY` (filtre porté jusqu'au SQL, pas un filtre
   d'affichage).
5. **Transitions protégées.** `PAID` est terminal (409 motivé par le domaine),
   `DUE → PAID`, `SCHEDULED → PAID`, `PENDING_VERIFICATION → PAID` et
   `REJECTED → PAID` sont impossibles ; la régularisation passe uniquement par
   une **nouvelle tentative** (`payment_declarations`, `attempt_number`
   croissant, unique par paiement + tentative, preuve précédente conservée).
6. **Rien n'est inventé.** Le seul pourcentage appliqué reste
   `contracts.commission_percentage = 25` (jamais réécrit, même pas par la
   projection) ; la commission M2+ à 0 % ne produit **aucune** ligne ;
   `Hebdomadaire` et `Forfait mission` restent sans paiement ni rappel, avec la
   règle manquante documentée ; l'avance du rappel pré-échéance n'a **aucune
   valeur par défaut** (see §5).
7. **Le contrat de données reste la projection.** Les vues
   `contracts.payment_schedule`, `commission_ledger`, `monthly_checkpoints`,
   `history` sont complétées (dates de déclaration/vérification,
   `isSalaryPaidToEmployee`, statut projeté) et jamais dupliquées dans une table
   de confort. `VERIFIED` n'élargit pas le domaine du contrat : il est projeté
   en `PENDING_VERIFICATION`.
8. **Événements sans canal de notification.** `PAYMENT_DUE`, `PAYMENT_DECLARED`,
   `PAYMENT_PENDING_VERIFICATION`, `PAYMENT_APPROVED`, `PAYMENT_PAID` et
   `PAYMENT_REJECTED` sont écrits dans l'outbox durable (agrégat `payment`).
   Complément ultérieur P0-SALARY-1 : `PAYMENT_PAID` est consommé par
   `AutomationEngine` pour un paiement `SALARY` et déclenche la demande de
   confirmation salariale existante; ce consumer ne confirme pas le salaire et
   ne déplace aucun fonds. Les autres événements restent sans consumer métier
   dans ce cycle; aucun canal de notification n'est branché. `PAYMENT_OVERDUE_J3`
   de P0-AUTO-2 est inchangé.
9. **Frontière fournisseur préparée, jamais branchée.**
   `PaymentProviderAdapter` + `verifyTransaction()` / `handleWebhook()` /
   `reconcile()` existent comme abstraction avec refus explicite
   `NOT_IMPLEMENTED` ; MTN, Orange Money, Moov Money, Wave et tout agrégateur sont listés
   `implemented: false`. Aucune table de fournisseur, de webhook, d'OTP, de KYC
   n'a été créée (vérifié par SQL dans les trois suites).

## 4. Surface API (Worker → PostgreSQL, jamais DEMO)

```text
GET  /api/v1/my/payments                         paiement de l'acteur, page bornée
GET  /api/v1/payments/:paymentId                 lecture unitaire + tentatives
GET  /api/v1/contracts/:contractId/payments      paiements du contrat (partie ou ADMIN)
POST /api/v1/payments/salary-declarations        déclaration SALAIRE     (EMPLOYER)
POST /api/v1/payments/commission-declarations    déclaration COMMISSION  (EMPLOYER)
POST /api/v1/contracts/:contractId/payments/advance-month   M1 → M2 (EMPLOYER, règles du modèle)
GET  /api/v1/admin/payments                      file complète            (ADMIN, payments:read:any)
POST /api/v1/admin/payments/:paymentId/approve   vérification locale      (ADMIN, payments:approve)
POST /api/v1/admin/payments/:paymentId/confirm   rapprochement local → PAID (ADMIN, payments:approve)
POST /api/v1/admin/payments/:paymentId/reject    rejet motivé             (ADMIN, payments:reject)
```

`contracts.monthly-actions` reste **volontairement 501** : les points de contrôle
et les confirmations bilatérales (`START`, `CONFIRM_EMPLOYER`,
`CONFIRM_WORKER`, `PAID`, `FILLED`…) appartiennent à la tranche post-contrat.
L'avancement de mois, lui, est une commande du cycle paiements et n'ouvre aucune
confirmation.

Chaque commande mutante exige `Idempotency-Key` : même clé + même empreinte =
rejeu sans second effet (`replayed: true`, vue rendue, aucune écriture) ; même
clé + empreinte différente = 409 `IDEMPOTENCY_CONFLICT`, sans écriture. La
réserve et la complétude vivent dans `automation_idempotency`, **dans la même
transaction** que la mutation, la projection, l'événement et l'audit.

## 5. Rappel pré-échéance : configuration, pas déduction

`PAYMENT_PRE_DUE_LEAD_TIME_MS` (vars du Worker, documentées dans
`wrangler.toml` et `.env.example`) est la **seule** source de l'avance.

* absente / vide → `preDueLeadTimeMs: null`, **aucun job** armé, motif exposé
  par `composition.paymentCycle.preDueDetail` ;
* valeur non entière, ≤ 0 ou > 30 jours → refusée, motif tracé, aucun job ;
* valeur décidée par l'exploitant → jobs `PAYMENT_PRE_DUE_REMINDER` armés via
  `jobs.createIfAbsent`, clé `<paymentId>:PAYMENT_PRE_DUE_REMINDER:<leadTimeMs>`,
  déclenchement à `dueAt − leadTimeMs`, et le handler refuse toute écriture si
  le paiement a déjà basculé (`DUE`, `REJECTED`) ou est réglé.

Aucun `[triggers] crons` n'a été ajouté : le déclenchement reste le `drain`
déjà câblé (et `scheduled()` n'appelle jamais le cycle si l'automatisation est
absente — il ne lève aucune erreur en mode mémoire).

## 6. Ce que les tests prouvent (et ce qui a été adapté)

* `npm test` : **1348/1348 PASS** dont 20 tests de domaine (`paymentLifecycle`)
  et 27 tests d'intégration réels (`backend/api/payments.test.ts`, PGlite +
  migrations 0001→0008, `composeWorker` comme seule composition) : matérialisation
  idempotente, balayage borné, garde de déclaration, RBAC et séparation des
  flux, rejeu/conflit d'idempotence, transitions refusées, vérification tracée,
  rapprochement, rejet + régularisation en tentative 2, concurrence (une seule
  tentative, `declaration_count` exact), rollback (aucune ligne résiduelle),
  contraintes SQL, lectures scopées, frontière fournisseur, mode mémoire.
* `npm run lint` (`tsc --noEmit`) et `npm run build` : propres.
* `npm run verify:postgres` : **23/23 PASS** — cycle matériellement vérifié sur
  le moteur réel (7 lignes de paiement pour un contrat de 6 mois, aucune
  doublure après rejeu, sources d'audit distinctes, deux tables de paiement
  exactement, zéro table de fournisseur, zéro job pré-échéance sans config).
  Les compteurs verrouillés de P0-AUTO-2 (7 échéances, 14 rappels, 21 lignes
  d'automatisation) sont **inchangés**.
* `npm run verify:workerd` : **10/10 PASS** — runtime workerd réel + Hyperdrive
  local ; la trace `PAYMENTS_MATERIALIZED` est vérifiée sous sa source propre.
* Trois gardes de périmètre ont été **réécrites, pas affaiblies** : les blocs
  P0-E4/P0-E5/P0-F affirment désormais que la route d'entrée du cycle répond
  (400/409) et qu'aucune ligne n'est payée, au lieu d'affirmer qu'aucune table
  de paiement existe ; `persistence.test.ts` autorise explicitement
  `payments` + `payment_declarations` et interdit toute table de fournisseur,
  d'OTP, de KYC, d'agrégateur, de SMS ; `contractActivation.test.ts` scinde
  l'audit par action et **dérive** l'attendu de matérialisation de l'échéancier
  du contrat (au lieu d'un nombre de lignes supposé).
* Deux corrections de code découvertes par les tests, conservées :
  `payment_declarations.compareAndSetOutcome` calculait son index de garde CAS
  en dur (`$4`, écrasement d'un paramètre déjà lié) et la déclaration écrivait
  sa tentative **avant** d'avoir gagné la transition — l'ordre est maintenant
  CAS d'abord, tentative ensuite, donc un perdant ne laisse aucune ligne.
  Le module d'entrée Worker ne doit exporter **que** des handlers : la constante
  de limite de drain est restée privée (wrangler puis workerd le vérifient).

## 7. Hors périmètre (volontairement non fait)

argent réel ; MTN / Orange Money / Moov Money / Wave ; agrégateur de paiement ;
webhook fournisseur entrant ; passerelle SMS/e-mail/Push/WhatsApp ; KYC et
pièces d’identité ; cron de production ; `FILLED`, `HIRED`, `CONTRACTED`,
`CLOSED_OFFER_FILLED` et les confirmations bilatérales du point de contrôle
mensuel ; stockage de fichier de preuve (seuls un `proofDocumentId`, un
`fileName` et une note sont conservés) ; toute règle de cadence pour
`Hebdomadaire` / `Forfait mission`.

## 8. Restant pour l'étape suivante

1. Module Notifications : consumers réels des six événements du cycle
   (e-mail, Push, WhatsApp, SMS) — les types et charges utiles sont déjà
   documentés, rien n'est branché.
2. Adaptateur de paiement : implémenter `PaymentProviderAdapter` pour un
   fournisseur réellement choisi, signature et rejouabilité du `handleWebhook()`,
   `reconcile()` contre un relevé externe (table de règlement à concevoir
   à ce moment-là, pas avant).
3. Rapprochement multi-paiements et incidents de paiement (remboursement, avoir,
   litige) : hors chaîne actuelle, aucun état inventé ici.
4. Point de contrôle mensuel complet (`contracts.monthly-actions`) et passages
   post-contrat (`FILLED`, `HIRED`, `CONTRACTED`, `CLOSED_OFFER_FILLED`).
5. Décision exploitante sur l'avance du rappel pré-échéance (valeur, canal,
   destinataires) avant d'armer le moindre job en production.
