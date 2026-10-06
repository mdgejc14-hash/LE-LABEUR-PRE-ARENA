# P0-AUTO-2 — Automatisation à l’activation du contrat

## Périmètre

Cette tranche implémente uniquement la chaîne :

```text
SIGNATURE bilatérale → ACTIVE
  → événement durable CONTRACT_ACTIVATED
  → Outbox PostgreSQL → Queue locale → AutomationEngine
  → payment_schedule + commission_ledger
  → ScheduledJob + Deadline + audit
  → échéance atteinte / rappel J+3 → événement interne
```

L’événement `CONTRACT_ACTIVATED` est ajouté à `automation_outbox` dans la même transaction SQL que le compare-and-set vers `ACTIVE` et l’ajout de `CONTRACT_ACTIVATED_BILATERAL` à `contracts.history`. Un échec de publication annule donc aussi l’activation et son historique. L’adaptateur existant `automation_outbox` est réutilisé; aucune deuxième queue, aucun scheduler séparé et aucun magasin d’idempotence supplémentaire ne sont créés.

Le Worker/API PostgreSQL effectue un drain local après avoir obtenu la réponse du handler. L’Outbox et les `ScheduledJob` sont durables; la Queue locale n’est qu’un transport d’exécution et peut être reconstruite à partir de l’Outbox. Les leases, claims et retries restent enregistrés dans PostgreSQL. Aucun Cron, binding Cloudflare Queue de production, ou fournisseur externe n’est ajouté.

## Sources des règles

| Donnée ou règle | Source existante | Application |
|---|---|---|
| Salaire, devise, dates, durée, parties | Ligne `contracts` créée depuis la proposition acceptée | Aucun montant ni participant n’est accepté depuis la requête d’activation. |
| Périodes et échéances | `buildPaymentSchedule` dans `src/domain/businessRules.ts` | Pour le mois `m`, l’échéance est la date de début avancée de `m` mois, avec le clamp calendrier déjà défini par `addMonthsClamped`. La durée est `contract.durationMonths`. |
| Commission | `contract.commissionPercentage`, règle existante de 25 % en M1 | Le montant M1 est calculé par `buildPaymentSchedule`; M2+ vaut 0 et n’engendre pas de job de commission. Le taux est copié dans la projection existante du contrat. |
| Rappel | `J3_SCHEDULER_CONTRACT` dans `src/backend/services/scheduler.ts` | Trois jours complets après une date d’échéance date-only interprétée à 00:00 UTC. Aucun nouveau délai n’est introduit. |
| Retry technique | Claims des tables Automation et `available_at` | Ce délai est opérationnel uniquement; il ne modifie pas `due_at`, qui reste la date métier. |

Le `payment_schedule` existant reçoit les références salaire/commission, les dates, montants, parties et clés d’idempotence. Les échéances positives obtiennent une ligne dans `automation_deadlines`, un job de due dans `automation_jobs` et un job de rappel J+3. Les champs `grace_period_ms` et `escalation` ne sont pas renseignés : aucune règle métier correspondante n’est établie.

### Règles métier non définies — volontairement non inventées

Le modèle de proposition accepte aussi `Hebdomadaire` et `Forfait mission`, mais le builder existant ne définit qu’un schedule mensuel basé sur `monthlySalary` et `durationMonths`. Cette tranche le réutilise tel quel; elle n’invente ni cadence hebdomadaire, ni conversion de montant, ni unité de forfait. Une règle de calendrier/montant validée devra précéder toute prise en charge distincte de ces périodicités.

Le dépôt ne définit pas non plus de décalage dû aux week-ends ou jours fériés, de fuseau métier distinct de la date-only UTC de J+3, de délai de grâce supplémentaire, de politique d’escalade, ni de report de l’échéance finale. Cette tranche ne les ajoute pas. Si le produit les décide, la configuration devra être ajoutée explicitement à la règle de calendrier (et couverte par migration/tests si elle est contractuelle); il ne faut pas détourner `available_at`, qui sert aux retries techniques.

Le taux de commission reste la donnée de contrat (25 % selon la règle existante), et le seul délai de rappel reste la constante métier J+3 existante. Aucun nouveau paramètre d’environnement, SLA ou durée arbitraire n’est introduit.

## Événements, jobs et audit

- `CONTRACT_ACTIVATED` est le seul nouvel événement de domaine émis par l’action d’activation.
- Un job salaire est créé pour chaque mois du contrat. Un job de commission n’est créé que pour un montant de commission strictement positif.
- Les jobs de rappel sont planifiés à J+3. Lors de l’exécution, ils ne font qu’inscrire `PAYMENT_OVERDUE_J3` dans l’Outbox si le schedule est toujours `DUE`.
- À la date d’échéance, un schedule toujours `SCHEDULED` passe à `DUE` et l’événement interne `PAYMENT_SCHEDULE_DUE` est ajouté dans la transaction avec cette projection.
- Les événements d’échéance/rappel créent ensuite un job `NOTIFICATION_REQUIRED` avec `channel: null` et un audit portant `channelSent: false`. Aucun canal n’est appelé.
- Les insertions utilisent des clés stables (`contract:<id>:<kind>:<mois>:...`); un rejeu conserve la même projection et ne duplique ni job, ni deadline, ni entrée d’audit.
- `contracts.history` n’est jamais réécrit par Automation; il demeure l’historique des transitions métier du contrat.

## Séparation des périmètres

Cette tranche ne crée ni paiement, ni débit, ni Mobile Money, ni rapprochement, ni déclaration/validation salariale, ni preuve/OTP, ni envoi de notification. Elle ne produit pas `PAID`, `FILLED`, `HIRED`, `CONTRACTED` ou `CLOSED_OFFER_FILLED`, ne ferme pas d’autres candidatures et ne modifie pas les statuts de l’offre/candidature. Le mode DEMO/mémoire reste sans Outbox Automation; ce câblage est réservé à la composition API PostgreSQL.

## Validation prévue

- `npm test`: contrat API, idempotence/rejeu, concurrence et rollback de publication.
- `npm run verify:postgres`: PostgreSQL réel local, chaîne Outbox → Queue → Engine → jobs/deadlines/audit et absence de doublons après rejeu.
- `npm run verify:workerd`: mêmes effets derrière l’entrée workerd locale et le binding Hyperdrive local.
- `npm run lint` et `npm run build`: cohérence TypeScript et bundle.

Ces vérifications locales ne constituent pas un déploiement Cloudflare ni une mise en production de paiements ou de notifications.
