# LE LABEUR — Fondation PostgreSQL et Worker (P0-A / P0-B)

**État au 2026-10-05 :** la fondation PostgreSQL P0-A est étendue en P0-B pour l’identité et les sessions serveur. Les stores SQL sont branchés à la composition quand un `PostgreSqlDatabase` ou un client SQL est injecté. Les tests d’intégration s’exécutent sur PGlite (PostgreSQL en WASM). **Aucune base de production, ressource Cloudflare ou déploiement n’est disponible ni revendiqué.**

## 1. Livrables

| Livrable | Fichier(s) | Nature |
|---|---|---|
| Contrats du noyau | `src/backend/persistence/coreRecords.ts` | Enregistrements domaine, stores offres/candidatures/contrats/permissions, domaines d’états |
| Adaptateur PostgreSQL | `src/backend/persistence/postgresDatabase.ts` | Transactions dédiées `BEGIN`/`COMMIT`/`ROLLBACK`, timeouts, sonde et expurgation des secrets |
| Ports SQL bas niveau | `src/backend/persistence/sqlClient.ts` | Frontière pilote (`pg` compatible) → `PostgresClientPort`, erreurs PostgreSQL |
| Stores SQL du noyau | `src/backend/persistence/sqlCoreStores.ts`, `src/backend/identity/permissionStore.ts` | Requêtes paramétrées sur les migrations préparées |
| Stores d’identité PostgreSQL | `src/backend/identity/sqlStores.ts` | Lecture/écriture de `users`, `external_identities`, `sessions`, `role_permissions`, `user_permissions` |
| Service d’identité et transactions | `src/backend/identity/sessionService.ts`, `src/backend/identity/stores.ts` | Résolution Google et session dans une même transaction, verrouillage d’identité, RBAC serveur |
| Composition Worker | `src/backend/api/entry.ts` | Décision fermée par défaut; stores SQL utilisés en mode `postgres` avec DB/client fourni |
| Migrations | `migrations/0001_identity_and_core.sql` → `0002_role_permissions_seed.sql` → `0003_core_nucleus_alignment.sql` | Schéma déjà préparé; elles ne sont pas appliquées à une ressource distante par le dépôt |
| Tests moteur PostgreSQL | `src/backend/identity/postgresIdentity.test.ts` | Parcours Worker/API complet exécuté contre PGlite WASM |

Tables identité/RBAC utilisées : `users`, `external_identities`, `sessions`, `permissions`, `role_permissions`, `user_permissions`. Les adaptateurs offres/candidatures/contrats restent hors des routes et non migrés par P0-B.

## 2. Limites et garanties d’environnement

- Pas de compte Cloudflare, de binding Hyperdrive, de base externe, de chaîne de connexion réelle ni de migration distante dans cette session.
- PGlite est le moteur PostgreSQL-compatible local des tests; il ne simule pas une ressource Cloudflare et ne valide pas un déploiement.
- Le Worker reste fermé sans audience Google et persistance explicitement configurée; `PERSISTENCE=postgres` sans client/base injecté ne retombe jamais sur la mémoire.
- Le MODE DEMO du navigateur reste inchangé et utilise toujours `MockRepository`. Le MODE API reste explicite (`VITE_DEMO_MODE=false` + `VITE_API_BASE_PATH=/api/v1`, same-origin).
- Les routes métier non livrées répondent toujours `501`. Aucun handler offres, candidatures, contrats, paiements ou autre métier n’est ouvert.
- Aucun paiement, incident, remplacement, message, notification ou document n’est persisté par P0-B; aucun R2, Queue, Cron ou Durable Object n’est construit.
- Aucun écran, parcours UI ni design n’est modifié.

## 3. Configuration Worker / PostgreSQL

| Variable | Valeurs | Défaut | Rôle |
|---|---|---|---|
| `PERSISTENCE` | `closed` \| `memory` \| `postgres` | `closed` | Mode demandé |
| `IDENTITY_STORE` | `memory` \| `postgres` | — | Alias historique |
| `HYPERDRIVE` | binding Cloudflare | — | `env.HYPERDRIVE.connectionString` |
| `POSTGRES_CONNECTION_STRING` | `postgresql://…` | — | Secret de repli si aucun binding |
| `DB_POOL_MAX` | `1..20` | `5` | Limite du pool au niveau du pilote |
| `DB_STATEMENT_TIMEOUT_MS` | `100..120000` | `15000` | `SET LOCAL statement_timeout` |
| `DB_APPLICATION_NAME` | `^[a-z][a-z0-9_-]{0,31}$` | `lelabeur-worker` | Nom d’application PostgreSQL |

Le placeholder `postgresql://user:password@host:5432/database` est refusé. Les secrets de connexion ne sont ni renvoyés par les routes ni journalisés.

## 4. Matrice de décision

| Configuration | Décision | Effet |
|---|---|---|
| aucune | `closed` / `not-configured` | Worker fermé (auth 401; routes non implémentées 501) |
| `PERSISTENCE=memory` | `memory` | Stores mémoire serveur explicitement sélectionnés, tests seulement |
| `PERSISTENCE=postgres` sans client/base | `misconfigured` | Worker fermé, aucune retombée mémoire |
| `PERSISTENCE=postgres` + client SQL + cible valide | `postgres` | Base PostgreSQL créée via l’adaptateur fourni, stores identité et noyau SQL |
| base injectée (tests ou hôte) | `postgres` / `injected-database` | Stores SQL sur la base explicitement fournie |
| mode ou cible invalide | `misconfigured` | Worker fermé avec motif précis |

## 5. Schéma préparé — alignement `0003`

| Table | Alignement |
|---|---|
| `offers` | États `ACTIVE/FILLED/CANCELLED/PAUSED`, colonnes géo/métier, `posted_date`, indicateurs, tableaux JSONB, début et durée |
| `applications` | États domaine, `applied_date`, note, rémunération, `contract_id`, historique JSONB |
| `contracts` | `salary` → `monthly_salary`, états domaine, durée/périodicité/signatures/commission, tableaux JSONB et références incident/remplacement sans FK |

Les champs dénormalisés d’affichage (`employerName`, `offerTitle`) ne sont pas stockés. Ils ne seront nécessaires que lorsque les handlers métier concernés seront implémentés.

## 6. P0-B — flux identité/session PostgreSQL

```text
credential Google
→ vérification serveur (vérificateur Google existant)
→ résolution par (provider, subject), puis email Google vérifié
→ création éventuelle users + external_identities
→ création de sessions (SHA-256 du jeton opaque seulement)
→ cookie HttpOnly / Secure / SameSite=Lax
→ GET /api/v1/auth/session et GET /api/v1/me
```

- La création/résolution d’utilisateur, le lien externe, la session et la lecture RBAC sont dans une transaction PostgreSQL unique. Toute erreur en cours de création provoque `ROLLBACK` de toutes les écritures.
- Des verrous consultatifs transactionnels sérialisent les résolutions concurrentes d’un même `sub` ou email vérifié.
- La lecture d’une session vérifie le hash du cookie, `revoked_at`, `expires_at` et le statut serveur de l’utilisateur. Logout persiste `revoked_at`.
- Le rôle est relu depuis `users`; les permissions effectives sont l’union SQL de `role_permissions` et `user_permissions` à chaque authentification. Aucun cache RBAC mémoire n’autorise les routes SQL.
- ADMIN reste non auto-attribuable. Les claims `sub`, rôle, `userId` ou `actorId` du navigateur ne deviennent pas l’identité serveur.
- L’adaptateur mémoire conserve les tests et le mode serveur explicite; il n’est jamais un fallback de la persistance PostgreSQL. Le MODE DEMO frontend n’a pas été touché.

## 7. Tests et validation

`npm test`, `npm run lint` et `npm run build` sont exécutés en P0-B. La suite `npm test` contient les vérifications d’identité/session PostgreSQL via PGlite : création et résolution d’utilisateur, lien Google persisté, session hashée, `/auth/session` et `/me`, expiration, révocation, RBAC SQL, refus d’ADMIN en self-service et rollback après échec d’insertion de session. Le test d’intégration injecte un vérificateur Google déterministe; il n’appelle pas Google ni Cloudflare.

Les tests P0-A continuent de vérifier migrations/types/adaptateurs/configuration et la séparation DEMO/API. Le test du Worker utilise une base PGlite locale avec les migrations existantes; aucune ressource de production n’est revendiquée.

## 8. Ce qui reste pour P0-C

- Provisionner PostgreSQL et Cloudflare/Hyperdrive, appliquer `0001` → `0002` → `0003`, configurer l’audience Google et le pilote SQL côté Worker, puis valider cette vraie connexion et le déploiement.
- Garder `/healthz` fidèle à l’état de la ressource réelle; P0-B ne l’a pas modifié pour annoncer une base inaccessible ou simulée.
- Définir et réaliser dans une phase ultérieure les migrations/handlers métier explicitement exclus de P0-B (offres, candidatures, contrats, paiements et autres domaines), ainsi que les services Cloudflare éventuels (R2, Queue, Cron, Durable Objects).
