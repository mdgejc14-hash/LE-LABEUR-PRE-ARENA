# Rapport final — audit métier LE LABEUR

## Chiffrage

- Scénarios générés : **1 000** (10 lots de 100, SC-0001 à SC-1000).
- Scénarios réellement exécutés individuellement : **0**. Les lots indiquent explicitement `EXECUTÉ = NON — analyse statique`.
- OK : **1** (contrôle d’acteur obligatoire observé dans le mock; cela ne prouve pas le backend persistant).
- KO : **environ 100** scénarios de chemins explicitement contradictoires ou risque J+3, selon le détail de chaque lot.
- Fonctionnalité manquante : scénarios J+3 / automatisation correspondants.
- Non vérifiable : reste des chemins dont la preuve n'est pas end-to-end dans le checkout.
- Gravité : les scénarios portent la gravité individuellement; les abus, concurrences, persistance et J+3 sont critiques lorsque l'autorité ou l'effet financier est en jeu.

Le détail par scénario est la source de vérité; ce rapport ne remplace pas les lots.

## A — Fonctionnalités manquantes / préparées

### P0
1. **Worker/Cron J+3 opérationnel** : `src/backend/services/scheduler.ts` décrit un contrat futur, explicitement type-only; aucun timer, query exécutée, outbox event ou blocage automatique n'est trouvé.
2. **Handlers persistants métier** : `routeContracts.ts` est un catalogue et `worker.ts` retourne `NOT_IMPLEMENTED` tant qu'un handler n'est pas installé. Les routes ne prouvent donc pas des mutations serveur.
3. **Transactions atomiques et verrous** pour activation de contrat, remplissage d'offre, clôture des candidatures, paiements et remplacement concurrents : non démontrés dans le chemin inspecté.

### P1
- couverture end-to-end des notifications et audit par transition;
- autorisation document/justificatif et contrôle de doublon transactionId;
- tests dédiés incidents/remplacements, géographie et propositions;
- état et motif de rejet/resoumission de déclaration documentés par handlers persistants.

### P2
- tests de reconnexion WebRTC et expiration d'appel;
- métriques/statistiques avec preuve de source;
- nettoyage des états déclarés mais sans transition opérationnelle.

## B — Bugs / risques critiques

- J+3 non automatisé malgré `PAYMENT_OVERDUE_J3` déclaré.
- Un catalogue API peut donner une impression de fonctionnalité alors que les handlers retournent `NOT_IMPLEMENTED`.
- Les races (deux approbations, double activation, remplacement pendant résiliation) ne disposent pas d'une preuve de verrou/transaction dans ce checkout.
- Une union TypeScript autorise conceptuellement plusieurs états sans établir les gardes de transition.

## C — Transitions attendues absentes

Expiration d'offre, expiration de proposition, escalade incident automatique, déblocage automatique après régularisation, scheduler J+3 fiable, resoumission persistante complète et cycle server-side de notifications ne sont pas trouvés comme chemins opérationnels complets.

## D — Transitions potentiellement acceptées à tort

Non conclues statiquement sans exécution backend. Toute conclusion affirmative serait inventée. Les scénarios concernés sont marqués `NON VÉRIFIABLE`.

## E — Concurrence dangereuse

Activation simultanée de contrats sur une offre; approbations ADMIN concurrentes; déclaration/rejet simultanés; remplacement pendant résiliation; retry après réponse perdue. Ajouter transaction, verrouillage ou idempotency persistée puis tests.

## F — Autorisation

Le mock contient `requireActor`, `assertOwner`, `assertOperationalActor`; le catalogue API déclare self/owner/participant/admin et permissions. Mais le worker de Phase 1 n'est pas un backend métier complet. L'autorité serveur persistante reste à vérifier/implémenter avant de conclure OK.

## G — Données / persistance

Les champs de paiement (montant, méthode/téléphone, transactionId, référence, date/heure, preuve, notes) sont représentés dans les interfaces/types. La persistance PostgreSQL complète et atomique de leur cycle n'est pas prouvée par le worker actuel. Les migrations 0003 sont annotées `PRÉPARÉE`.

## H — Notifications

Types et contrats outbox existent (`PAYMENT_OVERDUE_J3`, remplacement, transfert), mais la couverture réelle événement→destinataire→persistance→lecture n'est pas démontrée pour chaque mutation.

## I — Automatisations

J+3 : **FONCTIONNALITÉ MANQUANTE / NON AUTOMATISÉE** dans l'état du checkout. `isPaymentDue` et `getOverdueDueEntries` sont des calculs/guards, pas un scheduler fiable.

## Plan de correction

| Priorité | Correction | Fichiers / tests |
|---|---|---|
| P0 | Installer handlers authentifiés, scopes serveur, transactions et audit atomique | `src/backend/api/worker.ts`, repositories SQL, tests API d'autorisation |
| P0 | Implémenter Cron J+3 avec déduplication, outbox et blocage conforme | `scheduler.ts`, migration payment_schedules, tests temps/concurrence |
| P0 | Garantir activation contrat → offre FILLED → candidatures fermées dans une transaction | `mockRepository` comme référence de tests, SQL store, test race |
| P1 | Finaliser déclaration paiement DRAFT→SUBMITTED→UNDER_REVIEW→APPROVED/REJECTED→RESUBMITTED | repositories, admin tests, idempotency/replay tests |
| P1 | Ajouter matrice de permissions et tests acteur modifié pour chaque domaine | API tests, repository tests |
| P1 | Ajouter tests notifications/audit/incidents/remplacements/géographie | suites dédiées |
| P2 | Ajouter tests WebRTC timeout/reconnexion et observabilité | `CallService`, signaling tests |

## Vérifications de fin

Les commandes de validation ont été lancées après création des seuls documents `docs/audit/`. Le résultat exact est consigné dans le message de livraison; aucun fichier applicatif n'a été modifié par la mission.
