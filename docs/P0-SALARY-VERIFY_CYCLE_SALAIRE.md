# P0-SALARY-VERIFY — finalisation du cycle salaire

## Résultat de l'audit préalable

Le point de jonction demandé existe déjà au checkpoint `88bb325` : le changement
minimal n'était pas de recréer une confirmation, mais de prouver le parcours
complet du nouveau cycle paiement externe jusqu'au mécanisme P0-SALARY-1. La
couverture P0-SALARY-1 existante partait d'un `PAYMENT_PAID` du cycle paiement
interne de test; elle ne parcourait pas explicitement le webhook externe,
`VERIFIED`, le rapprochement, `PAID`, puis la confirmation du travailleur.

| Maillon | Implémentation existante réutilisée |
|---|---|
| Mission / échéance | `PaymentRepository.closeMissionPayments()` et les statuts de contrat réels `COMPLETED` / `TERMINATED`; aucun changement à l'exécution du contrat. |
| Paiement externe | `PaymentRepository` + `PaymentProviderAdapter`; le webhook contrôlé aboutit à `VERIFIED`, jamais directement à `PAID`. |
| `VERIFIED → PAID` | `PaymentRepository.confirmPaymentPaid()` vérifie le rapprochement, écrit le statut et `PAYMENT_PAID` dans la transaction Outbox; aucun mouvement de fonds. |
| Déclenchement | `createContractAutomation()` consomme `PAYMENT_PAID` uniquement pour `SALARY`, puis déclenche via `AutomationEngine` le flux de demande P0-SALARY-1 existant. |
| Demande de preuve | `createSalaryConfirmationHandlers()` vérifie le paiement `PAID`, le type `SALARY`, les parties, le contrat et l'échéance; la table existante `salary_confirmations` est unique par `payment_id`. |
| Confirmation finale | Le travailleur authentifié fournit l'OTP et le nonce; la transaction verrouille paiement et preuve, puis écrit `SALARY_CONFIRMED` et l'audit durable. |

## Invariants du parcours

```text
DÉCLARÉ
  ≠ VÉRIFIÉ
  ≠ PAID
  ≠ SALAIRE CONFIRMÉ PAR LE TRAVAILLEUR
```

- Une déclaration ou un paiement `VERIFIED` ne crée pas de confirmation salariale.
- `PAYMENT_PAID` crée/active seulement la demande de preuve P0-SALARY-1 : le
  salaire reste non confirmé tant que le travailleur n'a pas validé l'OTP.
- L'OTP reste hashé, à durée limitée (10 minutes); le nonce aléatoire unique est
  lié au paiement, au contrat, au candidat et à la période.
- L'unicité de la période de paiement dans `payments`, la clé primaire
  `salary_confirmations.payment_id`, les verrous SQL et les clés d'événement
  empêchent les confirmations concurrentes/doublées.
- Un OTP invalide, un nonce incorrect, une expiration et un rejeu refusé sont
  inscrits dans le ledger d'audit existant. Une confirmation réussie produit un
  audit durable et un seul événement `SALARY_CONFIRMED`; un rejeu est audité
  séparément sans créer de second événement final.
- Le silence n'a aucun effet de confirmation.

## Portée et non-objectifs

Aucune table, migration ou machine à états concurrente n'est ajoutée. Le flux
réutilise `migrations/0010_salary_confirmation.sql`, les repositories/services,
l'AutomationEngine, l'Outbox et l'audit déjà en place. `confirmMonthlyAction` et
la route mensuelle qui reste volontairement en `501` ne sont pas modifiés.

Aucun canal OTP/notification final, fournisseur de paiement réel, fonds détenus,
escrow, Cron/Queue de production, règle mensuelle, prorata ou modification UI
n'est ajouté. Le worker d'automatisation demeure déclenché selon les conventions
existantes; cette tranche n'installe pas de planification de production.

## Validation ciblée

Le test d'intégration P0-SALARY-VERIFY parcourt maintenant le webhook du
fournisseur de test, l'arrêt à `VERIFIED`, le rapprochement explicite vers
`PAID`, le traitement par le worker existant, la création unique de la preuve,
puis la confirmation par le candidat et son audit. Les tests P0-SALARY-1
existants continuent de couvrir les OTP invalides/expirés, les refus, la
concurrence, le rejeu et l'idempotence.
