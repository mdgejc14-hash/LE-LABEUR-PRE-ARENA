# P0-A — Fondation PostgreSQL + Worker

État : **préparé, non connecté**. Aucune base n'est provisionnée, aucun compte Cloudflare n'est utilisé, aucun parcours métier existant n'est modifié.

## 1. Ce que cette phase livre

| Livrable | Fichier(s) | Nature |
|---|---|---|
| Contrats de persistance du noyau | `src/backend/persistence/coreRecords.ts` | Enregistrements dérivés des types du domaine (`Pick`), domaines d'états, ports `OfferStore` / `ApplicationStore` / `ContractStore` / `PermissionStore`, erreurs stables |
| Adaptateur PostgreSQL | `src/backend/persistence/postgresDatabase.ts` | Implémente les ports EXISTANTS `PostgreSqlDatabase` + `DatabaseHealthProbe` (transactions réelles, timeout, sonde) |
| Ports SQL bas niveau | `src/backend/persistence/sqlClient.ts` | Frontière pilote (`pg`) → `PostgresClientPort`, normalisation, expurgation de secrets, codes d'erreur PostgreSQL |
| Stores SQL du noyau | `src/backend/persistence/sqlCoreStores.ts` | Requêtes paramétrées correspondant aux migrations |
| Stores mémoire (parité/tests) | `src/backend/persistence/coreStores.ts` | Même contrat, sans base |
| Configuration Worker ↔ Hyperdrive | `src/backend/persistence/config.ts` | `PERSISTENCE`, binding `HYPERDRIVE`, repli secret, bornes, descripteur sûr |
| Migrations | `migrations/0003_core_nucleus_alignment.sql` | Alignement du noyau (domaines d'états + colonnes des adaptateurs) |
| Composition | `src/backend/api/entry.ts` | Décision de persistance explicite + stores SQL disponibles, routes métier toujours 501 |

Noyau couvert : `users`, `external_identities`, `sessions`, `permissions`, `role_permissions`, `user_permissions`, `offers`, `applications`, `contracts`.

## 2. Ce que cette phase ne fait pas

- aucune connexion réelle (pas de compte Cloudflare, pas de base, pas de migration appliquée) ;
- aucune bascule de l'application vers PostgreSQL : le navigateur reste en MODE DEMO (`MockRepository`) par défaut ;
- aucun handler métier branché : les routes connues répondent toujours `501` ;
- aucun paiement, incident, remplacement, message, notification ni document persisté en base ;
- aucun R2, Queue, Cron, Durable Object ;
- aucune modification des parcours, des écrans ni du design.

## 3. Variables d'environnement (Worker uniquement)

| Variable | Valeurs | Défaut | Rôle |
|---|---|---|---|
| `PERSISTENCE` | `closed` \| `memory` \| `postgres` | `closed` | Mode de persistance demandé |
| `IDENTITY_STORE` | `memory` \| `postgres` | — | Alias historique, conservé |
| `HYPERDRIVE` | binding Cloudflare | — | Source privilégiée : `env.HYPERDRIVE.connectionString` |
| `POSTGRES_CONNECTION_STRING` | chaîne `postgresql://…` | — | Repli direct si aucun binding (secret) |
| `DB_POOL_MAX` | `1..20` | `5` | Taille de pool appliquée par le pilote |
| `DB_STATEMENT_TIMEOUT_MS` | `100..120000` | `15000` | Timeout posé par `SET LOCAL statement_timeout` |
| `DB_APPLICATION_NAME` | `^[a-z][a-z0-9_-]{0,31}$` | `lelabeur-worker` | Visible dans `pg_stat_activity` |

Le placeholder documentaire `postgresql://user:password@host:5432/database` est **refusé** : il ne peut pas être utilisé par erreur comme configuration réelle.

## 4. Matrice de décision (aucune retombée silencieuse)

| Configuration | Décision | Effet |
|---|---|---|
| rien | `closed` / `not-configured` | Worker fermé (401/501) |
| `PERSISTENCE=memory` | `memory` | Identité + noyau en mémoire (tests/démo serveur) |
| `PERSISTENCE=postgres` sans binding ni client | `misconfigured` / `missing-*` | Worker fermé, **jamais** de mémoire implicite |
| `PERSISTENCE=postgres` + binding + client SQL | `postgres` | Identité SQL + noyau SQL résolus |
| base injectée (tests) | `postgres` / `injected-database` | Adaptateurs SQL sur la base fournie |
| `PERSISTENCE=mysql` (valeur libre) | `misconfigured` / `invalid-persistence-mode` | Worker fermé |
| chaîne non `postgres://`, placeholder, bornes invalides | `misconfigured` / motif précis | Worker fermé |

## 5. Schéma — alignements de `0003`

| Table | Alignement |
|---|---|
| `offers` | `status` par défaut `ACTIVE` + CHECK `ACTIVE/FILLED/CANCELLED/PAUSED` ; colonnes géo, domaine/métier, `posted_date`, `is_urgent`, `is_le_labeur_job`, `le_labeur_tag`, JSONB (`skills`, `responsibilities`, `conditions`, `selection_process`), `start_date`, `duration_months` |
| `applications` | `status` par défaut `PENDING` + CHECK 8 états ; `applied_date`, `note`, `remuneration`, `contract_id`, `history` JSONB |
| `contracts` | `salary` → `monthly_salary` ; `status` par défaut `SIGNATURE` + CHECK 10 états ; `current_month`, `duration_months`, `periodicity`, signatures, commission (`percentage`, `amount_due`, `status` + CHECK), `payment_schedule` / `commission_ledger` / `monthly_checkpoints` / `history` JSONB, références incident/remplacement (volontairement sans clé étrangère : hors noyau) |

Les JSONB correspondent aux tableaux du domaine (`skills`, `history`, `paymentSchedule`…). Les champs dénormalisés d'affichage (`employerName`, `offerTitle`) ne sont pas stockés : ils seront reconstruits par jointure quand les handlers seront branchés (P0-B).

## 6. Connexion ultérieure (P0-B)

1. Provisionner PostgreSQL et appliquer `0001` → `0002` → `0003`.
2. Créer le binding Hyperdrive dans `wrangler.toml` (non créé à ce stade).
3. Fournir un client SQL (`pg` + `toPostgresClientPort`) à `composeWorker`.
4. Brancher les handlers du noyau sur `core` (offres, candidatures, contrats, permissions) avec `TransactionBoundary` (`database.run`).
5. Étendre `/healthz` avec `probe.check()` (aujourd'hui `persistence: 'not-configured'`, inchangé).

## 7. Vérifications de cette phase

`npm test`, `npm run lint`, `npm run build` — voir le compte rendu de la phase. Les tests ajoutés (`src/backend/persistence/persistence.test.ts`, suite « P0-A — fondation PostgreSQL ») couvrent : cohérence migrations ↔ types ↔ adaptateurs, comportement de l'adaptateur (transactions, erreurs traduites, paramétrage), configuration (matrice, placeholders, absence de secret), et séparation DEMO/API (le bundle navigateur n'importe jamais la couche PostgreSQL).

### Vérification ponctuelle sur un moteur PostgreSQL réel (jetable, non commitée)

Les migrations et les adaptateurs ont été exécutés une fois contre un moteur PostgreSQL réel en WASM (`@electric-sql/pglite`, installé hors dépendances du projet, harnais supprimé après usage). Résultat : **28/28 vérifications OK**, notamment :

- `0001` + `0002` + `0003` s'appliquent sans erreur, et `0003` est rejouable (colonnes, contraintes, bloc conditionnel de renommage) ;
- `contracts.salary` a bien disparu au profit de `contracts.monthly_salary` ;
- la contrainte `CHECK (status IN ('ACTIVE','FILLED','CANCELLED','PAUSED'))` rejette réellement `DRAFT` ;
- l'index unique `(offer_id, candidate_id)` produit une violation `23505` traduite en `CoreStoreError('DUPLICATE')` ;
- un statut hors domaine est rejeté par la base et traduit en `CoreStoreError('INVALID_STATUS')` ;
- offres, candidatures et contrats sont écrits puis relus à l'identique (JSONB et DATE inclus) ;
- `BEGIN`/`COMMIT` valide la transaction, l'exception déclenche un `ROLLBACK` complet ;
- les stores d'identité SQL fonctionnent réellement (email normalisé, jeton jamais stocké en clair, session retrouvée puis révoquée, union rôle + `user_permissions`).

Reproduction éventuelle en P0-B : `npm install --no-save --legacy-peer-deps @electric-sql/pglite` puis appliquer `migrations/0001` → `0002` → `0003` et exercer `createSqlCoreStores(createPostgresDatabase(...))`. Cette vérification n'est **pas** dans la suite `npm test`, qui reste sans dépendance externe.
