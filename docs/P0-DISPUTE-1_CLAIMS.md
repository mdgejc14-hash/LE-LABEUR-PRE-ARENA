# P0-DISPUTE-1 — premier cycle Claim / litige

## Objectif et limites

Cette tranche ajoute un dossier Claim persistant, rattaché à un **Contract existant** et, selon le type, à un **Payment existant** et à sa confirmation salariale éventuelle. Le parcours réutilise le runtime API PostgreSQL, l’Outbox, le worker d’automatisation, `automation_jobs`, `automation_deadlines`, le registre d’idempotence et le ledger d’audit déjà présents.

Aucun paiement, remboursement, transfert, blocage définitif de compte, changement des règles M1, remplacement, KYC, coffre documentaire/R2, fournisseur de notification, Cron ou Cloudflare Queue de production n’est ajouté. Les références de preuve sont des métadonnées, pas des fichiers.

## Cycle et décisions

| Étape | Action persistée | Règle de sortie |
| --- | --- | --- |
| `OPEN` | `POST /api/v1/claims` écrit le Claim, l’événement `CLAIM_CREATED`, l’audit et la réservation idempotente dans la même transaction. | Les parties et la cible sont relues depuis la session et PostgreSQL. |
| `CLAIM_CREATED` | Le worker local existant exécute le contrôle déterministe. | Seul le cas salarial décrit ci-dessous peut passer à `RESOLVED` par `SYSTEM`. Sinon, une demande est créée pour la partie répondante. |
| `EVIDENCE_REQUESTED` | La demande de preuve, l’événement et son audit sont persistés. | Si `due_at` existe, le consumer inscrit une deadline et un job dans les stores existants. La durée est celle déjà persistée sur la demande. |
| `UNDER_REVIEW` | Seule la partie désignée peut soumettre une référence de preuve. La demande passe en `SUBMITTED` par compare-and-set; la deadline et le job sont clos par compare-and-set. | L’automatisation ne lit pas/interprète le document. Si les faits persistés ne satisfont pas la règle déterministe, le Claim passe à `ADMIN_REVIEW`. |
| `DEADLINE` | Le job d’échéance expire la demande et met à jour la deadline existante. | Une preuve salariale concordante déjà persistée peut donner lieu à la même résolution mécanique; sinon le Claim passe à `ADMIN_REVIEW`. **Le silence n’est ni une faute ni une preuve.** |
| `ADMIN_REVIEW` | Un ADMIN habilité peut examiner, demander une autre référence, puis résoudre ou rejeter avec un motif. | Une décision n’exécute jamais de mouvement financier. |

Les statuts ouverts sont `OPEN`, `EVIDENCE_REQUESTED`, `UNDER_REVIEW` et `ADMIN_REVIEW`. Les états de décision sont `RESOLVED`, `REJECTED` et `CLOSED` (ce dernier n’est pas une sanction ni une voie d’automatisation).

### Résolution automatique autorisée

Elle ne s’applique qu’à `SALARY_NOT_RECEIVED`, et uniquement si PostgreSQL établit simultanément que :

- le paiement ciblé appartient au contrat du Claim et est de type `SALARY`;
- le statut persistant du paiement est `PAID`;
- une ligne `salary_confirmations` existe, est confirmée, et `confirmed_by` est le candidat enregistré sur le paiement;
- contrat, candidat, employeur, période, montant et devise concordent entre les enregistrements.

Le résultat indique qu’il s’agit d’un constat mécanique, attribue `resolved_by = SYSTEM`, journalise `faultAttributed: false` / `fundsMoved: false`, et n’envoie ni argent ni notification. Paiement absent, demande sans confirmation, preuve libre, contestation non salariale ou combinaison ambiguë sont orientés vers les preuves puis ADMIN — jamais vers une décision de faute automatique.

### Configuration explicite des délais

La seule variable est `CLAIM_EVIDENCE_DEADLINE_MS`, un entier positif exprimé en millisecondes et choisi par l’exploitant. Le code ne fournit **aucune durée par défaut** :

```dotenv
CLAIM_EVIDENCE_DEADLINE_MS=<durée-positive-en-millisecondes-validée-par-l-exploitant>
```

- Variable absente : la demande reste sans `due_at`; aucun job ni deadline n’est inventé. Un audit indique que la configuration manque et un ADMIN peut prendre le relais.
- Valeur invalide : une résolution déterministe reste possible; sinon le Claim est orienté vers `ADMIN_REVIEW` sans créer une demande à délai fictif. Une demande de preuve ADMIN est refusée avec `503` tant que la configuration est invalide.
- Si une demande possède déjà un `due_at`, le worker le respecte même si la configuration courante change ensuite.

`60000` est utilisé uniquement comme durée de fixture/validation automatisée; ce n’est pas une recommandation ni une valeur de production.

## Autorisations et API

`actorId` vient exclusivement de la session serveur. Les identifiants de déclarant, répondant, contrat, candidat, employeur, paiement ou confirmation ne peuvent pas être imposés comme parties par le client : les relations sont dérivées de lignes persistées et le corps JSON est strictement validé.

- Les parties EMPLOYER/CANDIDATE du contrat peuvent créer et consulter leur Claim; seul le destinataire d’une demande peut soumettre sa référence.
- Un autre participant/tiers reçoit un refus d’autorisation, même s’il connaît l’identifiant.
- La consultation ADMIN réutilise `incidents:read:any`; examen, décision, demande de preuve et restrictions réutilisent `incidents:arbitrate`. Aucun droit global n’est ajouté.
- Les mutations exigent `Idempotency-Key`; conflit de charge utile et concurrence sont traités sans double effet.

Routes exposées par l’API persistante :

- `GET /api/v1/my/claims`
- `POST /api/v1/claims`
- `GET /api/v1/claims/:claimId`
- `POST /api/v1/claims/:claimId/evidence-requests/:evidenceRequestId/submit`
- `GET /api/v1/admin/claims` et `GET /api/v1/admin/claims/:claimId`
- `POST /api/v1/admin/claims/:claimId/review`
- `POST /api/v1/admin/claims/:claimId/evidence-requests`
- `POST /api/v1/admin/claims/:claimId/decision`
- `POST /api/v1/admin/claims/:claimId/restrictions`
- `POST /api/v1/admin/claims/:claimId/restrictions/:restrictionId/release`

## Incident Contract et restriction provisoire

Un Claim `CONTRACT_INCIDENT` peut poser son identifiant dans le champ historique `contracts.incident_id`, sans changer le statut du Contract. La clôture ADMIN retire ce lien uniquement s’il pointe toujours vers ce Claim.

La seule capacité provisoirement restreignable dans cette tranche est `CONTRACT_TERMINATE` pour l’employeur du contrat, après passage en `ADMIN_REVIEW`. La restriction est inscrite dans `claim_restrictions`, attribuée à un ADMIN et libérable séparément. Le job qui fait passer un Claim expiré de `EVIDENCE_REQUESTED` à `ADMIN_REVIEW` la relâche; une décision de clôture la relâche également. La protection contractuelle M1 existante reste prioritaire et inchangée; le Claim ne déclenche ni rupture ni remplacement.

## Stockage et séparation DEMO/API

La migration additive `0011_dispute_claims.sql` crée `claims`, `claim_evidence_requests` et `claim_restrictions`, avec contraintes de cohérence, unicités partielles et références aux entités existantes. Elle ne duplique aucun store transversal.

Le repository Claim n’est composé que lorsque la base PostgreSQL durable est disponible. Le mode DEMO conserve son `MockRepository` par défaut; aucune route Claim ne retombe sur des données mockées. Une route métier non composée reste fermée (`501`) conformément à la frontière API existante.

## Vérifications locales

```bash
npm run lint
npm test
npm run verify:postgres
npm run verify:workerd
```

Les suites couvrent la migration PostgreSQL, transactions/rollback, ownership et permissions, idempotence, concurrence, références de preuve, délais configurés ou absents/invalides, résolution déterministe, escalade neutre, audit, restrictions réversibles, protection M1 et séparation DEMO/API. `verify:workerd` exécute le Worker HTTP dans workerd local avec PostgreSQL local; cela ne constitue pas un déploiement Cloudflare réel.
