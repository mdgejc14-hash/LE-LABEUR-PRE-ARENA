# P0-PAY-3 — rapprochement externe par batch

## Périmètre

P0-PAY-3 ajoute une préparation opérationnelle persistante pour rapprocher des transactions **déjà normalisées** d'un fournisseur avec les paiements existants. Elle ne crée pas un second agrégat Payment, ne modifie pas `SALARY` / `PLATFORM_FEE`, ne change pas `commission_percentage = 25` et ne déplace aucun fonds. Un résultat `MATCH` est un rapprochement de données, pas un paiement exécuté ni une preuve qui fait passer le Payment à `VERIFIED` ou `PAID`.

Aucune intégration réelle, aucun secret, endpoint, réponse fournisseur, contrat marchand, remboursement, ajustement monétaire, KYC, canal de notification ou Cron de production n'est ajouté. Le registre est multi-provider et ne configure par défaut que `TEST_GATEWAY`; tout autre identifiant échoue en `501 NOT_IMPLEMENTED` tant qu'un adaptateur n'a pas été explicitement injecté.

## Cycle et persistance

1. Une commande ADMIN soumet une liste maximale de 10 000 transactions normalisées avec `Idempotency-Key`.
2. L'API valide une liste blanche de champs et omet tout `rawPayload`. Un hash déterministe du contenu normalisé et l'unicité `(provider, batch_key)` garantissent le rejeu sûr.
3. Le batch, ses items PENDING, l'événement Outbox et l'audit sont créés ensemble. Les jobs de traitement/reprise sont inscrits dans `automation_jobs`, la file déjà utilisée par Outbox → Queue → AutomationEngine → Jobs.
4. Le traitement claim des fenêtres de 100 items maximum avec `FOR UPDATE SKIP LOCKED`; les écritures d'un item (ledger, verdict, revue, audit) partagent une transaction. Le service peut être appelé par l'ADMIN ou par le worker; un échec d'item devient RETRYABLE avec une échéance bornée et réutilise la même file.
5. Les résultats sont `MATCH`, `MISMATCH`, `NOT_FOUND`, `DUPLICATE` et `REVIEW_REQUIRED`. Le ledger externe protège `(provider, external_transaction_id)`, `(provider, reference)` et un seul règlement MATCH par Payment. Les résultats ambigus ou défavorables ouvrent une revue ADMIN; ils n'avancent jamais le statut Payment.

La migration `0009_payment_external_reconciliation.sql` crée les batches, items, le ledger externe, les revues et les tentatives de correction. Les compteurs sont recalculés à partir des items persistés. La pagination des items est bornée à 100 éléments et suit un curseur d'index.

## Revue et correction

Un ADMIN possédant `payments:approve` peut consigner `CONFIRMED` ou `REJECTED`, avec preuve et note facultatives. Cette décision ferme la revue, mais ne modifie pas le Payment ni le ledger externe.

Une tentative de correction est un enregistrement append-only idempotent. Elle accepte seulement des changements normalisés (`reference`, `amount`, `currency`, `payer`, `recipient`, `occurredAt`, `status`); les identifiants provider/transaction sont immuables dans ce chemin. **La proposition n'est pas appliquée** au règlement d'origine ou au Payment : elle conserve l'acteur, la clé idempotente, les valeurs proposées, la référence de preuve, la note et l'audit pour une procédure ultérieure explicitement autorisée.

## Routes ADMIN

- `POST /api/v1/admin/payment-reconciliation/batches` — import idempotent et traitement initial borné.
- `GET /api/v1/admin/payment-reconciliation/batches/:batchId` — consultation paginée.
- `POST /api/v1/admin/payment-reconciliation/batches/:batchId/retry` — reprise idempotente des items FAILED/RETRYABLE, avec audit.
- `POST /api/v1/admin/payment-reconciliation/reviews/:reviewId/decision` — décision de revue.
- `POST /api/v1/admin/payment-reconciliation/reviews/:reviewId/correction-attempts` — tentative de correction tracée, non appliquée.

Toutes les routes sont fermées sans PostgreSQL durable. Les commandes exigent une session serveur et les permissions ADMIN correspondantes.

## Vérifications

Les tests couvrent les cinq verdicts, la liste blanche (aucun payload brut), l'idempotence et le conflit, la concurrence, la duplication, la revue, la tentative de correction immuable, le rollback transactionnel, le retry et la reprise par le worker existant. Les suites PostgreSQL et workerd valident la migration et la frontière runtime; aucun Cron/queue Cloudflare de production n'est activé.
