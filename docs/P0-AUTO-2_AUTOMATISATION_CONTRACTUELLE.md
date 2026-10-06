# P0-AUTO-2 — Automatisation contractuelle

Point de départ : `705748c` (P0-AUTO-1 validé : fondation Automation réellement
intégrée, PR #18 intacte).
Branche de travail : `arena/958e0b27-le-labeur-pre-arena`, empilée sur
`arena/16556fd9-le-labeur-pre-arena` (la PR P0-AUTO-2 cible cette branche pour
n'exposer que la tranche P0-AUTO-2).

> Une tentative antérieure (`arena/5c567af3-le-labeur-pre-arena`, commit
> `5f2d6c4…`) est **hors chemin canonique** : aucun de ses fichiers n'a été
> récupéré, aucun cherry-pick, aucune fusion, aucune comparaison d'implémentation.
> Cette tranche a été refaite intégralement depuis `705748c`.

Objectif unique : rendre **réellement exécutable** le cycle

```text
CONTRACT_ACTIVE
  ↓ échéancier salarial
  ↓ échéancier de commission
  ↓ échéances de paiement
  ↓ rappels
```

au-dessus de la fondation P0-AUTO-1 déjà connectée
(`Domain Event → Outbox PostgreSQL → Queue → Worker → AutomationEngine → Job`).

Aucune donnée extérieure n'est utilisée : tout est construit depuis le dépôt,
les modèles existants, PostgreSQL local et les repositories existants.

---

## 1. Inspection préalable — ce qui existait, ce qui manquait

| Élément | État à `705748c` | Décision P0-AUTO-2 |
|---|---|---|
| `Contract`, `ContractStatus` (`src/types/index.ts`) | EXISTANT | réutilisé tel quel, aucun statut ajouté |
| `contractRepository` (P0-F) | EXISTANT, transitions réelles + compare-and-set | **inchangé** sauf l'émission transactionnelle de `CONTRACT_ACTIVATED` |
| `contractTransitions` (P0-F) | EXISTANT ; `CONTRACT_TRANSITION_RULES.ACTIVATE.event = 'CONTRACT_ACTIVATED'` déjà déclaré | réutilisé : l'événement émis est `rule.event`, aucun type inventé |
| `DOCUMENTED_CONTRACT_EVENTS` | EXISTANT (documentaire) ; `CONTRACT_ACTIVATED` : payload `contractId, proposalId, offerId, applicationId, occurredAt`, dedupeKey `contractId + ACTIVATED` | **devenu réel** : payload et clé déterministe conformes au contrat documenté |
| Outbox (`automation_outbox`, 0006) | EXISTANT avec les colonnes d'une file réelle (`status`, `attempts`, `available_at`, `last_error`) et l'index d'échéance | réutilisé **comme Outbox ET comme Queue** — aucune seconde table de file |
| Queue (`Queue`, `InMemoryQueue`, fondation) | interface EXISTANTE, aucune implémentation PostgreSQL | implémentée au-dessus de `automation_outbox` (claim `FOR UPDATE SKIP LOCKED`) |
| `AutomationEngine`, `AutomationRegistry` (fondation) | EXISTANTS | **inchangés** ; un handler `CONTRACT_ACTIVATED` y est enregistré |
| `ScheduledJob` (`automation_jobs`, 0006) | EXISTANT, mais `idempotency_key` **non unique** | index d'unicité ajouté (0007) + colonne `reference` (0007) |
| `Deadline` / SLA (fondation) | type EXISTANT, **aucune table** | `automation_deadlines` créée (0007) — seule table nouvelle |
| `IdempotencyStore` (`automation_idempotency`, 0006) | table EXISTANTE, **aucune implémentation SQL** | implémentée (`createSqlIdempotencyStore`) et réutilisée — aucun second mécanisme |
| `AuditLedgerEntry` (`automation_audit_ledger`, 0006) | table EXISTANTE, aucune implémentation, aucun index de lecture | implémentée + index par entité (0007) |
| `monthly_salary`, `commission_percentage` (défaut **25**), `commission_status`, `commission_amount_due`, `payment_schedule`, `monthly_checkpoints`, `commission_ledger`, `start_date`, `end_date`, `history`, `periodicity` | EXISTANTS (0001/0003/0005), réellement persistés | **colonnes cibles de l'automatisation** — aucune table parallèle créée |
| `buildPaymentSchedule` (`src/domain/businessRules.ts`) | EXISTANT, seule règle de cadence du modèle (mensuelle) | réutilisé à l'identique |
| `J3_SCHEDULER_CONTRACT` (`src/backend/services/scheduler.ts`) | EXISTANT, purement déclaratif (`thresholdDays: 3`, `alertStatuses`, `blockEligibilityStatuses`, `ignoreCommissionWhenAtOrBelow`, `currentDateModel`, `domainEvent`, `futureAuditAction`, `futureAuditFields`) | **transposé en exécutable** ; chaque valeur est vérifiée par un test de cohérence |
| `OUTBOX_EFFECT_CONTRACTS` (`PAYMENT_OVERDUE_J3`) | EXISTANT, clé documentée `schedule-entry + payment-kind + due-date + J3` | clé d'idempotence des rappels J+3 **exactement** conforme |
| `Offer`, `Application`, `Proposal`, règles `FILLED` / `HIRED` / `CONTRACTED` / `CLOSED_OFFER_FILLED` | voir § 9 | **explicitement reportés** |
| KYC / R2 | inexistant | **non ajouté** (§ 12) |

Rien n'a été recréé : les seules nouveautés structurelles sont
`automation_deadlines`, l'unicité de `automation_jobs.idempotency_key`, la
colonne `automation_jobs.reference` et trois index de lecture.

---

## 2. Chaîne réellement exécutée

```text
POST /api/v1/contracts/:id/activate        (workerd / Worker API)
  ↓ contractRepository.transition(CONTRACT_TRANSITION_RULES.ACTIVATE)
  ↓ SELECT … FOR UPDATE  →  evaluateContractTransition  →  double signature
  ↓ UPDATE … WHERE id = $1 AND status = 'SIGNATURE'      (compare-and-set)
  ↓   + contracts.history || CONTRACT_ACTIVATED_BILATERAL
  ↓   + INSERT automation_outbox (CONTRACT_ACTIVATED)     ← MÊME transaction
COMMIT
  ↓ automationWorker.drainEvents()
  ↓ UPDATE automation_outbox SET status='PROCESSING' … FOR UPDATE SKIP LOCKED   (Queue)
  ↓ AutomationEngine.execute(event, « contractId:CONTRACT_ACTIVATED »)
  ↓ handler CONTRACT_ACTIVATED                            ← une transaction
  ↓   automation_idempotency.reserve(SYSTEM, automation.CONTRACT_ACTIVATED, contractId)
  ↓   SELECT contracts … FOR UPDATE  + garde status = 'ACTIVE'
  ↓   buildContractActivationPlan (règle existante buildPaymentSchedule)
  ↓   UPDATE contracts SET payment_schedule/monthly_checkpoints/commission_ledger
  ↓       WHERE status='ACTIVE' AND jsonb_array_length(payment_schedule)=0
  ↓   automation_deadlines  (7 lignes pour 6 mois : 6 salaires + 1 commission M1)
  ↓   automation_jobs       (14 rappels : échéance et J+3 par échéance)
  ↓   automation_audit_ledger
COMMIT
  ↓ automationWorker.runDueJobs()  (à l'échéance puis à J+3)
  ↓   évaluation d'éligibilité contre les statuts RÉELS du modèle
  ↓   événement préparé pour le futur module Notifications (AUCUN canal)
  ↓   échéance OPEN → OVERDUE → ESCALATED
  ↓   audit SCHEDULE_J3_ELIGIBILITY_RECORDED / SCHEDULE_DUE_REMINDER_RECORDED
```

Le worker est **explicitement déclenché** (`drainEvents`, `runDueJobs`, `drain`) :
aucun `setInterval`, aucun Cron Trigger Cloudflare, aucune Cloudflare Queue de
production. Le déclencheur appartient à une tranche ultérieure.

---

## 3. `CONTRACT_ACTIVATED` (ÉTAPE 2)

* Émis par `contractRepository.transition` **uniquement** pour
  `rule.action === 'ACTIVATE'`, dans la **même transaction** que la mutation et
  l'entrée d'historique.
* `eventId` déterministe : `evt_contract_ACTIVATED_<contractId>` → la clé
  primaire de `automation_outbox` rend le rejeu impossible (dedupeKey documenté
  `contractId + ACTIVATED`).
* Payload exactement celui de `DOCUMENTED_CONTRACT_EVENTS`, complété des
  modalités réellement nécessaires à l'échéancier (`employerId`, `employeeId`,
  `monthlySalary`, `currency`, `startDate`, `durationMonths`, `periodicity`,
  `commissionPercentage`).
* `actorId` = acteur de session ; `source` = `api:contracts.activate` ;
  `correlationId` = `requestId` ; `causationId` = clé d'idempotence.
* Les autres événements du cycle (`CONTRACT_CREATED`, `CONTRACT_SENT`,
  `CONTRACT_SIGNED`, `CONTRACT_ENDED`, `CONTRACT_TERMINATED`) **ne sont toujours
  pas émis** : ils restent documentés et appartiennent à leurs tranches.

**Garanties**

| Exigence | Mécanisme réel | Vérifié par |
|---|---|---|
| commit → mutation + event | une seule transaction PostgreSQL (`database.run`) | test « Atomicité », `verify:postgres`, `verify:workerd` |
| rollback → ni mutation ni event | `ROLLBACK` de `createPostgresDatabase` | test « Rollback » |
| replay → aucun double effet | PK `automation_outbox.id` + `automation_idempotency` + garde `jsonb_array_length(payment_schedule) = 0` + unicité `automation_jobs.idempotency_key` / `automation_deadlines.idempotency_key` | tests « Idempotence » ×4, « Concurrence » ×3 |

**Règles d'autorisation et de signature de P0-F : inchangées.** La seule
modification du comportement P0-F est une garde *fail-closed* : si aucun Outbox
durable n'est lié à la transaction, l'activation est refusée (`501`) **avant**
toute écriture. Sans cette garde, une mutation pourrait être commise sans
événement, ce qui violerait la garantie ci-dessus. Le mode `memory` (non durable,
jamais utilisé pour les contrats) et le mode DEMO ne sont pas concernés.

---

## 4. Échéancier salarial (ÉTAPE 3)

Produit par le handler, à partir des **données du contrat** et de la seule règle
existante `buildPaymentSchedule` :

* `contractId`, `employer` (`contracts.employer_id`), `employee`
  (`contracts.candidate_id`), période (`monthNumber`, `periodKey` « Mois NN »,
  `periodStartDate`), montant attendu (`salaryAmount`, `employeeShareAmount`),
  échéance (`salaryDueDate`), statut (`salaryStatus`), horodatage (`createdAt`) ;
* `jobId` / `idempotencyKey` portés par `automation_jobs` et
  `automation_deadlines` (colonnes `reference` et `idempotency_key`) ;
* persistance dans `contracts.payment_schedule` (JSONB **existant**) : aucune
  table parallèle, aucune duplication ;
* point de contrôle M1 dans `contracts.monthly_checkpoints`, forme exacte de
  `MockRepository.generateContract` ;
* entrée d'historique métier `PAYMENT_SCHEDULE_CREATED` **ajoutée** à
  `contracts.history` (l'historique P0-F est conservé, jamais réécrit).

**Aucun paiement effectué** : tous les statuts restent `SCHEDULED` /
`NOT_APPLICABLE`, aucune déclaration, aucune transaction, aucune preuve, aucun
OTP. Le basculement `SCHEDULED → DUE` appartient au cycle paiements
(`syncPaymentSchedule` / `advanceContractMonth`), non ouvert.

### Périodicités non mensuelles — aucune conversion inventée

`PROPOSAL_PERIODICITY_VALUES = ['Mensuel', 'Hebdomadaire', 'Forfait mission']`
(contrainte SQL `proposals_periodicity_domain`) ; `contracts.periodicity` est un
`TEXT` libre.

| Périodicité | Règle | Comportement |
|---|---|---|
| `Mensuel` | **DÉFINIE** — `buildPaymentSchedule` (`addMonthsClamped`, `durationMonths`, `periodKey` « Mois NN ») | échéancier, échéances et rappels créés |
| `Hebdomadaire` | **ABSENTE** | aucun échéancier, aucune échéance, aucun rappel ; historique `PAYMENT_SCHEDULE_RULE_MISSING` ; audit `CONTRACT_SCHEDULE_RULE_MISSING` |
| `Forfait mission` | **ABSENTE** | idem |
| toute autre valeur | **ABSENTE** | idem (jamais devinée) |

Représentation : `SCHEDULE_PERIODICITY_RULES` +
`resolveSchedulePeriodicityRule()` (`src/domain/contractScheduleAutomation.ts`).
Règles manquantes documentées par `MISSING_CONTRACT_AUTOMATION_RULES`.
Aucune conversion hebdomadaire → mensuelle, aucune conversion forfait → mensuel.

---

## 5. Échéancier de commission (ÉTAPE 4)

* `commission_percentage = 25` : valeur **lue** du contrat et reportée telle
  quelle dans `contracts.commission_ledger[].percentage`. Jamais réécrite.
* Montants produits par la règle existante : 25 % en M1
  (`calculateFirstMonthCommission`), 0 % en M2+ ; 75 % / 100 % au salarié.
  Preuve SQL vérifiée par un test : `migrations/0003` impose toujours
  `commission_percentage NUMERIC(5,2) NOT NULL DEFAULT 25`.
* `contracts.commission_amount_due` et `commission_status` alimentés comme dans
  `MockRepository.generateContract` (M1 uniquement).
* Structure permettant la suite : période (`monthNumber`, `periodKey`), montant
  (`commissionAmount`, `amountDue`), pourcentage (`percentage`), échéance
  (`commissionDueDate`), statut (`commissionStatus`), `contractId`, idempotence
  (`automation_deadlines` / `automation_jobs`), historique
  (`contracts.history` + `automation_audit_ledger`).
* **Aucun débit, aucun paiement réel.**

---

## 6. Échéances de paiement (ÉTAPE 5)

Table `automation_deadlines` (type `Deadline` de la fondation, jusqu'ici sans
persistance) :

| Champ | Valeur | Preuve |
|---|---|---|
| `due_at` | `salaryDueDate` / `commissionDueDate` à **minuit UTC** | `J3_SCHEDULER_CONTRACT.currentDateModel`, `businessRules.isPaymentDue` |
| `kind` | `SALARY_PAYMENT` / `COMMISSION_PAYMENT` | `getOverdueDueEntries` (`paymentKind: 'SALARY' \| 'COMMISSION'`) |
| `sla` | `SALARY_PAYMENT_DUE` / `COMMISSION_PAYMENT_DUE` | nommé d'après l'échéance réelle, aucune durée ajoutée |
| `grace_period_ms` | `3 × 86 400 000` | `J3_SCHEDULER_CONTRACT.thresholdDays = 3`, `fullDaysLate` |
| `escalation` | `PAYMENT_OVERDUE_J3` | `J3_SCHEDULER_CONTRACT.domainEvent` |
| `status` | `OPEN → OVERDUE → ESCALATED`, ou `MET` | `DeadlineStatus` de la fondation |
| commission ignorée | si `commissionAmount <= 0` | `ignoreCommissionWhenAtOrBelow = 0` |

Pour un contrat mensuel de 6 mois : **7 échéances** (6 salaires + 1 commission
M1). Aucune durée métier inventée.

**Règle temporelle absente** — rappel **avant** échéance : aucune règle du modèle
ne le définit (le modèle ne rappelle qu'**à** l'échéance, puis à J+3).
Représentation créée : `PRE_DUE_REMINDER_CONFIGURATION`
(`ruleDefined: false`, `leadTimeMs: null`, preuves, décision attendue). Aucun job
n'est créé tant que la règle n'est pas décidée.

---

## 7. Jobs de rappel (ÉTAPE 6)

`automation_jobs` (abstraction `ScheduledJob` existante), **14 rappels** pour
7 échéances :

| Type de job | `due_at` | `NotificationType` réel porté | Événement produit |
|---|---|---|---|
| `SALARY_DUE_REMINDER` | échéance | `MONTHLY_CHECKPOINT` | `NOTIFICATION_REQUIRED` |
| `COMMISSION_DUE_REMINDER` | échéance | `COMMISSION_DUE` | `NOTIFICATION_REQUIRED` |
| `SALARY_OVERDUE_J3_REMINDER` | échéance + 3 j | `PAYMENT_OVERDUE_J3` | `PAYMENT_OVERDUE_J3` |
| `COMMISSION_OVERDUE_J3_REMINDER` | échéance + 3 j | `PAYMENT_OVERDUE_J3` | `PAYMENT_OVERDUE_J3` |

Les quatre `NotificationType` existent déjà dans `src/types/index.ts` ; les deux
types d'événements existent déjà (`DomainEventType` de la fondation,
`OutboxEventType` de `productionContracts`). **Aucun type inventé.**

Clé d'idempotence : `<scheduleEntryId>:<paymentKind>:<dueDate>:DUE|J3`, conforme
à `OUTBOX_EFFECT_CONTRACTS` (`PAYMENT_OVERDUE_J3` → « schedule-entry +
payment-kind + due-date + J3 »).

Éligibilité évaluée contre les statuts **réels** (`evaluateReminderEligibility`) :
`ELIGIBLE`, `NOT_DUE_YET` (J+3 < 3 jours), `SETTLED` (`PAID`, `NOT_APPLICABLE`),
`NOT_ELIGIBLE` (statut hors `alertStatuses` / `blockEligibilityStatuses`, ou
commission nulle). Une échéance encore `SCHEDULED` n'est **pas** basculée en
`DUE` : le rappel est enregistré non éligible et la raison documente la règle
absente.

### Aucun canal de notification

* Les événements produits restent `PENDING` dans l'outbox : **aucun consumer**
  n'est enregistré pour `NOTIFICATION_REQUIRED` / `PAYMENT_OVERDUE_J3`
  (`DEFERRED_NOTIFICATION_EVENT_TYPES`) et le worker ne réclame que les types
  ayant un handler réel.
* Aucun e-mail, Push, WhatsApp, SMS ni notification externe. Aucune table de
  notification, de canal, de destinataire ou d'envoi (vérifié par
  `information_schema` dans les tests et les deux scripts de vérification).
* Payload préparé pour le futur module Notifications : `contractId`, parties,
  `scheduleEntryId`, `monthNumber`, `periodKey`, `paymentKind`, `stage`,
  `dueDate`, `daysLate`, `amount`, `currency`, `notificationType`,
  `recipientKinds` (`['EMPLOYER','ADMIN']`, rôles du modèle — la résolution des
  ADMIN autorisés et l'envoi restent à faire), `dedupeKey` (forme réelle),
  `channel: null`.

---

## 8. Idempotence et concurrence (ÉTAPE 7 et 8)

Aucun second framework : uniquement les mécanismes déjà présents.

| Mécanisme | Où | Effet |
|---|---|---|
| Clé primaire `automation_outbox.id` déterministe | 0006 | un second `CONTRACT_ACTIVATED` pour le même contrat n'est jamais une seconde ligne |
| `automation_idempotency` (PK `actor_id, command, idempotency_key`) | 0006 | rejeu → `replay` ; charge différente → `conflict` ; concurrent → `in-progress` (message rejoué) |
| Garde SQL `status='ACTIVE' AND jsonb_array_length(payment_schedule)=0` | `sqlAutomationStores` | **impossible** d'écrire un second échéancier |
| Index unique `automation_jobs.idempotency_key` | **0007** | deux workers ne créent jamais deux fois le même rappel |
| Index unique `automation_deadlines.idempotency_key` | **0007** | deux workers ne créent jamais deux fois la même échéance |
| `FOR UPDATE SKIP LOCKED` sur le claim | `sqlAutomationStores` | deux workers réels reçoivent des messages **différents** |
| `SELECT … FOR UPDATE` sur le contrat | P0-F, réutilisé | sérialise les traitements d'un même contrat |
| Compare-and-set de statut (jobs, échéances) | `sqlAutomationStores` | un job `COMPLETED` ne repasse jamais `RUNNING` ; une échéance `ESCALATED` ne recule jamais |
| `AutomationEngine.processed` (fondation) | P0-AUTO-1, inchangé | déduplication process-local, clé = `contractId:CONTRACT_ACTIVATED` |
| Identifiants de jobs / échéances / événements déterministes | `contractScheduleAutomation` | rejeu → mêmes clés → `ON CONFLICT DO NOTHING` |
| Transaction unique par traitement | `postgresDatabase.run` | un échec annule **tous** les effets du traitement |

Scénarios testés : même `CONTRACT_ACTIVATED` rejoué ; même événement reçu deux
fois ; second événement avec un `eventId` différent traité par **un autre
worker** ; deux workers concurrents (PGlite et PostgreSQL réel en parallèle) ;
deux créations simultanées de la même échéance ; deux créations simultanées du
même rappel ; retry après échec ; dead-letter après épuisement ; job déjà
terminé ; activation rejouée. **Résultat : aucun double schedule.**

---

## 9. FILLED / HIRED / CONTRACTED / CLOSED_OFFER_FILLED (ÉTAPE 9)

**Explicitement reportés — non implémentés.** Aucune candidature n'est fermée,
aucune offre ne passe à `FILLED`.

Constat d'inspection :

* une **RÈGLE 21 existe, mais uniquement dans le dépôt DEMO**
  (`MockRepository.signContract`, `src/repositories/mockRepository.ts` ≈ l. 1544-1555 :
  contrat `ACTIVE` → offre `FILLED`, candidature retenue `HIRED`, autres
  candidatures `CLOSED_OFFER_FILLED` + notification) ;
* elle **n'est pas ouverte** dans le domaine de production :
  `src/domain/applicationTransitions.ts` — « `HIRED`, `CONTRACTED` et
  `CLOSED_OFFER_FILLED` relèvent des étapes suivantes : P0-E4 ne les produit
  jamais » ;
* `POST_CONTRACT_AUTOMATION_REQUIREMENTS` (`contractTransitions.ts`) et
  `docs/P0-F_CONTRATS.md` § 12 les listaient déjà comme étape à venir ;
* la fermeture des autres candidatures ne doit être « **jamais silencieuse** » :
  elle exige donc le module Notifications, hors périmètre de cette tranche ;
* les vérifications existantes (`verify:postgres`, `verify:workerd`) assertent
  que l'offre reste `ACTIVE` et la candidature `PENDING` : elles sont
  **rejouées à l'identique** et passent toujours.

Représentation : `POST_CONTRACT_DEFERRED_AUTOMATION`
(`src/domain/contractScheduleAutomation.ts`), vérifiée par un test.

---

## 10. Audit (ÉTAPE 10)

`automation_audit_ledger` (0006) + index par entité (0007). Chaque entrée porte :
`entity_id` (= `contractId`), `event_id`, `action`, `occurred_at`,
`actor_id = 'SYSTEM'`, `source = 'automation:P0-AUTO-2'`, `reference` (clé
d'idempotence ou `jobId`), `after_state` (résultat, ou erreur).

| Action | Déclencheur |
|---|---|
| `CONTRACT_SCHEDULE_CREATED` | échéancier écrit (cadence, périodes, montants, commission, détail des échéances) |
| `CONTRACT_SCHEDULE_RULE_MISSING` | périodicité sans règle, ou contrat non actif |
| `CONTRACT_PAYMENT_DEADLINES_CREATED` | échéances créées / dupliquées |
| `CONTRACT_REMINDER_JOBS_SCHEDULED` | rappels créés / dupliqués, `notificationChannels: []` |
| `SCHEDULE_DUE_REMINDER_RECORDED` | rappel à échéance évalué |
| `SCHEDULE_J3_ELIGIBILITY_RECORDED` | **nom réel** déjà documenté par `J3_SCHEDULER_CONTRACT.futureAuditAction`, avec les champs réels `scheduleEntryId`, `paymentKind`, `dueDate`, `status`, `daysLate`, `outboxEventId` |
| `AUTOMATION_DUPLICATE_SUPPRESSED` | rejeu neutralisé (événement ou rappel) |
| `AUTOMATION_HANDLER_FAILED` | erreur — écrit **hors** de la transaction annulée, donc jamais perdu par le rollback |

L'historique métier `contracts.history` est **conservé et complété**
(`PAYMENT_SCHEDULE_CREATED`, `PAYMENT_SCHEDULE_RULE_MISSING`) : il n'est
**jamais remplacé** par le ledger.

---

## 11. PostgreSQL / workerd / DEMO (ÉTAPE 11)

* Parcours réel : Worker → PostgreSQL → Outbox → Queue → AutomationEngine →
  ScheduledJob. Aucune étape simulée, aucun stub.
* Tests d'intégration : PostgreSQL réel (PGlite 0.5.8 = PostgreSQL 18.3 compilé,
  mêmes contraintes, mêmes transactions, `FOR UPDATE SKIP LOCKED` vérifié).
* `npm run verify:postgres` : PostgreSQL 17.10 natif, **deux workers réellement
  parallèles** sur la même base.
* `npm run verify:workerd` : l'activation est produite **sous workerd** (bundle
  Cloudflare réel, binding Hyperdrive local), l'événement est lu dans PostgreSQL,
  puis consommé par le worker d'automatisation.
* **DEMO reste séparé et n'est jamais connecté à PostgreSQL** :
  `resolveRepositoryMode({}) → mock`, `MockRepository` inchangé, aucune
  automatisation composée sans base durable, et le bundle navigateur n'atteint
  toujours pas la couche PostgreSQL (test de graphe d'imports conservé).

### Correctif d'environnement (ÉTAPE 13)

`npm run verify:workerd` échouait à `705748c` :
`5 migrations attendues, reçues 6`. Cause réelle — un **nombre écrit en dur**
dans `scripts/verify-workerd-local.ts`, non aligné quand `0006` a été ajoutée.
Correctif : l'attendu est désormais **dérivé du manifeste**
(`EXPECTED_MIGRATION_IDS`) et le contenu du répertoire `migrations/` est comparé
au manifeste. Aucun contournement, aucune assertion affaiblie.
`libpq.so.5` n'est pas réapparu : aucune installation système ajoutée, les
binaires `embedded-postgres` suffisent.

---

## 12. Hors périmètre strict (ÉTAPE 14 et 15)

Non implémentés, et vérifiés absents :

* paiements réels, Mobile Money, rapprochement financier, OTP salarial, preuves
  salariales, litiges, incidents, remplacement, matching, réputation ;
* **KYC** : aucune collecte d'identité obligatoire à l'inscription, aucune
  table ni colonne KYC/documentaire, aucune action d'audit KYC. Règle
  fonctionnelle retenue : inscription sans KYC ; les pièces seront définies au
  niveau de l'offre et fournies au moment approprié du parcours
  contractuel/documentaire (volet R2/documents, tranche ultérieure) ;
* **R2** documentaire ;
* notifications complètes, e-mail réel, Push production, WhatsApp/SMS ;
* Cron production, Cloudflare Queue production, WebRTC, redesign, tests de
  charge.

Vérifié par `information_schema` (aucune table `%payment%`, `%notification%`,
`%email%`, `%sms%`, `%whatsapp%`, `%push%`, `%kyc%`, `%document%`, `%r2%`,
`%otp%`, `%mobile_money%`) et par la fermeture conservée des routes
`payments.commission-declare` et `contracts.monthly-action` (`501`).

---

## 13. Fichiers

**Nouveaux**

```text
migrations/0007_contract_automation.sql            échéances + unicité jobs + index
src/domain/contractScheduleAutomation.ts           règles pures (aucune dépendance serveur)
src/domain/contractScheduleAutomation.test.ts      35 tests purs
src/backend/automation/records.ts                  ports (types seuls)
src/backend/automation/contractActivation.ts       handler CONTRACT_ACTIVATED + rappels + audit
src/backend/automation/contractActivation.test.ts  34 tests d'intégration PostgreSQL
src/backend/automation/worker.ts                   worker (drain explicite, aucun timer)
src/backend/persistence/sqlAutomationStores.ts     adaptateurs PostgreSQL
docs/P0-AUTO-2_AUTOMATISATION_CONTRACTUELLE.md     ce document
```

**Modifiés (additivement)**

```text
src/backend/repositories/contractRepository.ts  émission transactionnelle de CONTRACT_ACTIVATED + garde fail-closed
src/backend/api/entry.ts                        composition outbox/automatisation/worker
src/backend/persistence/migrationManifest.ts    0007
src/backend/api/offers.test.ts                  harnais partagé : automation + automationWorker
src/backend/api/health.test.ts                  liste des migrations
src/backend/worker/cloudflareEntry.test.ts      liste des migrations
src/backend/persistence/persistence.test.ts     garde-fou de tables : automation_deadlines ajouté
scripts/run-tests.ts                            2 nouvelles suites
scripts/verify-postgres-e2e.ts                  4 vérifications P0-AUTO-2 (dont 2 workers parallèles réels)
scripts/verify-workerd-local.ts                 correctif du compte de migrations + 1 vérification P0-AUTO-2
```

**Inchangés** : `src/backend/automation/foundation.ts` et
`migrations/0006_automation_foundation.sql` (P0-AUTO-1),
`src/domain/contractTransitions.ts`, `src/domain/businessRules.ts`,
`src/repositories/mockRepository.ts` (DEMO), `src/backend/services/scheduler.ts`,
`src/backend/services/outbox.ts`, `wrangler.toml` (aucun Cron, aucune Queue).

Aucun test supprimé, aucune assertion affaiblie, aucun échec contourné.

---

## 14. Vérifications

```bash
npm test                 # 1301/1301 PASS (1232 hérités + 35 purs + 34 intégration)
npm run lint             # tsc --noEmit : aucune erreur
npm run build            # bundle navigateur inchangé (pg et automatisation absents)
npm run verify:postgres  # 23/23 PASS — PostgreSQL 17.10 réel, deux workers parallèles
npm run verify:workerd   # 10/10 PASS — workerd réel (l'échec hérité de 0006 est corrigé)
git diff --check         # aucune erreur
```

---

## 15. Ce qui reste avant l'étape Paiements

1. **Cycle paiements** : basculement `SCHEDULED → DUE`
   (`syncPaymentSchedule`), déclaration employeur, vérification ADMIN,
   rapprochement, régularisation `REJECTED` — sans cela les rappels restent
   légitimement non éligibles sur une échéance `SCHEDULED`.
2. **Avancement mensuel** (`advanceContractMonth`, `current_month`, points de
   contrôle M2+, grand livre de commission M2+).
3. **Règles de cadence manquantes** : hebdomadaire et forfait
   (`SCHEDULE_PERIODICITY_RULES`), à décider métier puis à implémenter.
4. **Rappel avant échéance** : décider l'avance (`PRE_DUE_REMINDER_CONFIGURATION`).
5. **Module Notifications** : consumer `NOTIFICATION_REQUIRED` et
   `PAYMENT_OVERDUE_J3`, résoudre les destinataires réels (employeur + ADMIN
   autorisés), appliquer les `dedupeKey` par destinataire
   (`…:J3:EMPLOYER`, `…:J3:ADMIN:<adminId>`), puis brancher les canaux.
6. **Déclencheur d'exploitation** : Cron Trigger / `scheduled()` / tâche planifiée
   pour appeler `drain()` ; aucun timer n'existe dans cette tranche.
7. **Tranche post-contractuelle** : offre `FILLED`, candidature `HIRED` /
   `CONTRACTED`, fermeture `CLOSED_OFFER_FILLED` (jamais silencieuse).
8. **Gel d'échéancier** à la rupture / fin (`freezeFuturePaymentEntries`) sur
   `CONTRACT_TERMINATED` / `CONTRACT_ENDED` — ces événements ne sont pas encore
   émis.
9. **Volet R2 / documents** et **KYC au niveau de l'offre** (aucune collecte à
   l'inscription).
10. Suivi d'exploitation du `DEAD_LETTER` (rejeu manuel, alerte).
