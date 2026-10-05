# LE LABEUR — Fondation PostgreSQL et Worker (P0-A / P0-B / P0-C / P0-E3)

**État au 2026-10-05 :** P0-C branche la fondation P0-A/P0-B sur une chaîne
d'exécution réelle **en local** — Worker (workerd), binding Hyperdrive, moteur
PostgreSQL 17.10 authentique — et vérifie réellement connexion, lecture,
écriture, `COMMIT`, `ROLLBACK`, migrations et `/healthz`. **Aucune ressource
Cloudflare distante (compte, Hyperdrive déployé, base managée, déploiement)
n'est disponible ni revendiquée.** La matrice d'état complète est dans
`docs/CLOUDFLARE_WORKER_POSTGRES.md`.

P0-E3 ouvre également un premier flux APPLICATION réel via PostgreSQL : soumission
par un CANDIDATE et consultation d'une offre par son EMPLOYER propriétaire. Les
autres opérations APPLICATION restent fermées.

## 1. Livrables

| Livrable | Fichier(s) | Nature |
|---|---|---|
| Contrats du noyau | `src/backend/persistence/coreRecords.ts` | Enregistrements domaine, stores offres/candidatures/contrats/permissions, domaines d'états |
| Adaptateur PostgreSQL | `src/backend/persistence/postgresDatabase.ts` | Transactions dédiées `BEGIN`/`COMMIT`/`ROLLBACK`, timeouts, sonde et expurgation des secrets |
| Ports SQL bas niveau | `src/backend/persistence/sqlClient.ts` | Frontière pilote (`pg` compatible) → `PostgresClientPort`, erreurs PostgreSQL |
| Manifeste et runner de migrations | `src/backend/persistence/migrationManifest.ts`, `migrationRunner.ts`, `migrationState.ts` | IDs attendus, checksum SHA-256, application atomique `0001 → 0004`, état lu en base |
| CLI de migration | `scripts/migrate.ts` | `--status`, `--dry-run`, application réelle ; n'affiche jamais la chaîne de connexion |
| Client PostgreSQL du Worker | `src/backend/worker/pgClient.ts` | Seul importateur de `pg` ; pool par requête (≤ 5), `allowExitOnIdle`, fermeture |
| Entrée Cloudflare Worker | `src/backend/worker/cloudflareEntry.ts` | Hyperdrive → `pg` → `composeWorker` ; fermé sans binding ; aucun secret dans les logs |
| Stores d'identité PostgreSQL | `src/backend/identity/sqlStores.ts` | Lecture/écriture de `users`, `external_identities`, `sessions`, `role_permissions`, `user_permissions` |
| Service d'identité et transactions | `src/backend/identity/sessionService.ts`, `src/backend/identity/stores.ts` | Résolution Google et session dans une même transaction, verrouillage d'identité, RBAC serveur |
| Composition Worker | `src/backend/api/entry.ts` | Décision fermée par défaut ; stores SQL utilisés en mode `postgres` avec DB/client fourni |
| Repository APPLICATIONS | `src/backend/repositories/applicationRepository.ts` | P0-E3 : soumission candidate et consultation limitée à l’offre de l’employeur propriétaire |
| Rapport `/healthz` | `src/backend/api/health.ts` | État de persistance réel, expurgé, sans secret ; 503 si la base demandée est injoignable |
| Migrations | `migrations/0001_identity_and_core.sql` → `0002_role_permissions_seed.sql` → `0003_core_nucleus_alignment.sql` → `0004_proposals.sql` | Schéma réel ; appliquées aux moteurs locaux de vérification |
| Tests moteur PostgreSQL | `src/backend/identity/postgresIdentity.test.ts` (PGlite), `scripts/verify-postgres-e2e.ts`, `scripts/verify-workerd-local.ts` | Parcours Worker/API complet : WASM pour `npm test`, moteur 17.10 réel pour les vérifications dédiées |

Tables identité/RBAC utilisées : `users`, `external_identities`, `sessions`,
`permissions`, `role_permissions`, `user_permissions`. Le schéma noyau PostgreSQL
préparé par `0003` sert désormais également à la soumission et à la consultation
ciblée des candidatures; les cycles de vie APPLICATION et CONTRAT non livrés
restent hors routes.

## 2. Limites et garanties d'environnement

- **RÉEL (local)** : moteur PostgreSQL 17.10 authentique, migrations appliquées, transactions vérifiées, Worker exécuté sous workerd avec binding Hyperdrive local.
- **TEST/LOCAL** : PGlite (WASM) pour `npm test`, `embedded-postgres` (binaires PostgreSQL natifs) pour les vérifications dédiées, JWKS Google de test en boucle locale.
- **PRÉPARÉ** : `wrangler.toml` (bindings, vars, profils dev/production), procédure d'activation Hyperdrive.
- **INDISPONIBLE** : compte Cloudflare, Hyperdrive déployé, base distante/managée, audience Google réelle, `wrangler dev --remote`, déploiement. Voir `docs/CLOUDFLARE_WORKER_POSTGRES.md`.
- Le Worker reste fermé sans audience Google et persistance explicitement configurée ; `PERSISTENCE=postgres` sans client/base injecté ne retombe jamais sur la mémoire.
- Le MODE DEMO du navigateur reste inchangé et utilise toujours `MockRepository`. Le MODE API reste explicite (`VITE_DEMO_MODE=false` + `VITE_API_BASE_PATH=/api/v1`, same-origin).
- Les routes métier non livrées répondent toujours `501`. OFFRES est ouvert selon P0-E1/E2; CANDIDATURES uniquement pour `POST /offers/:offerId/applications` et `GET /offers/:offerId/applications`. Les autres handlers APPLICATION, CONTRAT, paiement et domaines restent fermés.
- Aucun paiement, incident, remplacement, message, notification ou document n'est persisté ; aucun R2, Queue, Cron ou Durable Object n'est construit.
- Aucun écran, parcours UI ni design n'est modifié.

## 3. Configuration Worker / PostgreSQL

| Variable | Valeurs | Défaut | Rôle |
|---|---|---|---|
| `PERSISTENCE` | `closed` \| `memory` \| `postgres` | `closed` | Mode demandé |
| `IDENTITY_STORE` | `memory` \| `postgres` | — | Alias historique |
| `HYPERDRIVE` | binding Cloudflare | — | `env.HYPERDRIVE.connectionString` |
| `POSTGRES_CONNECTION_STRING` | `postgresql://…` | — | Secret de repli si aucun binding |
| `DB_POOL_MAX` | `1..20` | `5` | Limite du pool au niveau du pilote |
| `DB_STATEMENT_TIMEOUT_MS` | `100..120000` | `15000` | `SET LOCAL statement_timeout` |
| `DB_APPLICATION_NAME` | `^[a-z][a-z0-9_-]{0,31}$` | `lelabeur-worker` | Nom d'application PostgreSQL |
| `WORKER_ENV` | `development` \| `production` \| libre | — | Informationnel dans `/healthz` |
| `COOKIE_SECURE` | `true` \| `false` | — | Cookies de session |
| `SESSION_TTL_SECONDS` | entier | `43200` | Durée de vie des sessions |
| `TEST_ONLY_GOOGLE_JWKS_URL` | URL `http://` boucle locale | — | Vérification locale du parcours Google ; ignorée partout ailleurs |

Le placeholder `postgresql://user:password@host:5432/database` est refusé. Les
secrets de connexion ne sont ni renvoyés par les routes ni journalisés.

## 4. Matrice de décision

| Configuration | Décision | Effet |
|---|---|---|
| aucune | `closed` / `not-configured` | Worker fermé (auth 401 ; routes non implémentées 501) |
| `PERSISTENCE=memory` | `memory` | Stores mémoire serveur explicitement sélectionnés, tests seulement |
| `PERSISTENCE=postgres` sans client/base | `misconfigured` | Worker fermé, aucune retombée mémoire |
| `PERSISTENCE=postgres` + client SQL + cible valide | `postgres` | Base PostgreSQL créée via l'adaptateur fourni, stores identité et noyau SQL |
| base injectée (tests ou hôte) | `postgres` / `injected-database` | Stores SQL sur la base explicitement fournie |
| mode ou cible invalide | `misconfigured` | Worker fermé avec motif précis |

## 5. Schéma préparé — alignement `0003`

| Table | Alignement |
|---|---|
| `offers` | États `ACTIVE/FILLED/CANCELLED/PAUSED`, colonnes géo/métier, `posted_date`, indicateurs, tableaux JSONB, début et durée |
| `applications` | États domaine, `applied_date`, note, rémunération, `contract_id`, historique JSONB |
| `contracts` | `salary` → `monthly_salary`, états domaine, durée/périodicité/signatures/commission, tableaux JSONB et références incident/remplacement sans FK |

Les champs dénormalisés d'affichage (`employerName`, `offerTitle`) ne sont pas
stockés : le repository les projette depuis `users.display_name` et `offers.title`.
Le schéma identity actuel ne contient pas le profil candidat étendu; `candidateName`
et `candidateAvatar` utilisent les champs disponibles, tandis que `candidateHeadline`
reste vide jusqu'à une étape profil distincte.

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

- La création/résolution d'utilisateur, le lien externe, la session et la lecture RBAC sont dans une transaction PostgreSQL unique. Toute erreur en cours de création provoque `ROLLBACK` de toutes les écritures.
- Des verrous consultatifs transactionnels sérialisent les résolutions concurrentes d'un même `sub` ou email vérifié.
- La lecture d'une session vérifie le hash du cookie, `revoked_at`, `expires_at` et le statut serveur de l'utilisateur. Logout persiste `revoked_at`.
- Le rôle est relu depuis `users` ; les permissions effectives sont l'union SQL de `role_permissions` et `user_permissions` à chaque authentification. Aucun cache RBAC mémoire n'autorise les routes SQL.
- ADMIN reste non auto-attribuable. Les claims `sub`, rôle, `userId` ou `actorId` du navigateur ne deviennent pas l'identité serveur.
- L'adaptateur mémoire conserve les tests et le mode serveur explicite ; il n'est jamais un fallback de la persistance PostgreSQL. Le MODE DEMO frontend n'a pas été touché.

## 7. P0-C — exécution réelle (locale) et `/healthz`

```text
Requête → workerd → env.HYPERDRIVE → pool pg par requête → PostgreSQL 17.10
```

- `scripts/verify-postgres-e2e.ts` (`npm run verify:postgres`) exécute le même parcours que P0-B contre un moteur **réel** : connexion, migrations `0001 → 0004` et idempotence, schéma identité/RBAC/noyau, `COMMIT`, `ROLLBACK`, lecture/écriture `users`, lecture/écriture `sessions`, lecture des permissions, `/healthz`, login Google signé, session relue, logout, provisionnement ADMIN et séparation DEMO/API.
- `scripts/verify-workerd-local.ts` (`npm run verify:workerd`) répète le parcours **à travers workerd** via HTTP, avec binding Hyperdrive local et JWKS de test en boucle locale ; `/healthz` y prouve la source `HYPERDRIVE`, l'état `workerd` et les migrations appliquées.
- `/healthz` ne renvoie jamais de chaîne de connexion : `target` est un descripteur public (`host`, `port`, `database`, `source`, limites, `secretRedacted: true`) et toute erreur de sonde est expurgée. Trois formes : `boundary-only` (aucune persistance), `ok`/`degraded` avec rapport de persistance, et `503 degraded` si la base demandée est injoignable.
- Un pool `pg` conservé entre requêtes a produit des connexions invalides sous workerd ; le Worker construit donc un pool **par requête** et le ferme via `ctx.waitUntil` (Hyperdrive reste le pool réel).

## 8. P0-E3 — soumission et consultation ciblée des candidatures

```text
CANDIDATE authentifié
→ POST /api/v1/offers/:offerId/applications
→ repository APPLICATIONS
→ transaction PostgreSQL (candidat + offre relus/verrouillés)
→ applications (UNIQUE offer_id + candidate_id)

EMPLOYER authentifié et propriétaire
→ GET /api/v1/offers/:offerId/applications
→ repository APPLICATIONS
→ liste PostgreSQL limitée à cet offerId
```

- Le rôle et le `candidateId` sont dérivés de l'acteur de session; la requête ne peut pas choisir le candidat. L'utilisateur doit exister, être `CANDIDATE` et avoir le statut `ACTIVE`.
- Seules les offres `ACTIVE` d'un employeur `EMPLOYER` actif sont admissibles. `PAUSED`, `CANCELLED` et `FILLED` sont refusées; des verrous de lecture sur les lignes d'identité et d'offre protègent les contrôles d'éligibilité contre les mises à jour concurrentes pendant l'écriture. La contrainte unique PostgreSQL empêche les doublons concurrents; une candidature existante est retournée sans nouvelle insertion.
- La lecture est strictement limitée à l'offre demandée et refuse tout employeur non propriétaire. CANDIDATE et ADMIN ne peuvent pas utiliser cette route; la route de liste ADMIN déjà prévue n'est pas modifiée.
- `Idempotency-Key` suit la convention OFFRES : replay en mémoire du Worker, 409 si la clé est réutilisée avec une note différente. La contrainte métier est durable en PostgreSQL; une table d'idempotence durable n'est pas ajoutée dans P0-E3.
- Les seuls handlers APPLICATION ouverts sont la soumission et la consultation par offre. Liste générale, lecture unitaire, examen, shortlist, rejet et retrait restent fermés (501).
- Événement futur documenté : `APPLICATION_SUBMITTED`. P0-E3 ne produit pas d'événement et n'ajoute aucun type/consumer Outbox, notification ou moteur d'automatisation.
- Aucune migration nouvelle n'est requise : P0-E3 réutilise `applications`, ses statuts, son historique, ses références et son unicité préparés par `0001`/`0003`.
- Le MODE DEMO reste `MockRepository`/`localStorage`; aucune route Worker ne bascule vers le mock.

## 9. Tests et validation

- `npm test` : 1113/1113 PASS, dont P0-E3 (20/20 : rôles, ownership, éligibilité, idempotence, concurrence, rollback et pagination SQL).
- `npm run lint` : `tsc --noEmit`, aucune erreur.
- `npm run build` : PASS; bundle navigateur sans `pg` ni module serveur.
- `npm run verify:postgres` : 16/16 PASS sur PostgreSQL 17.10 local, y compris Worker/API → PostgreSQL P0-E3.
- `npm run verify:workerd` : 6/6 PASS via `workerd` + PostgreSQL local, y compris soumission et lecture par le propriétaire.
- Cloudflare distant n'est pas testé; les suites P0-A/P0-B restent couvertes sans affaiblissement.

## 10. Ce qui reste pour P0-E4

- Définir et ouvrir séparément le reste du cycle APPLICATION : liste « mes candidatures » du candidat et liste employeur multi-offres si requises, consultation autorisée d'une candidature unitaire, examen/review, shortlist, rejet et retrait candidat.
- Spécifier les transitions, motifs requis, re-candidature après retrait, audit et garanties d'idempotence durables avant tout handler supplémentaire.
- Décider si `APPLICATION_SUBMITTED` doit être émis par un Outbox transactionnel; aucun événement n'est produit à P0-E3.
- Conserver fermés les propositions, contrats, paiements et les autres domaines jusqu'à leurs étapes dédiées.

## 11. Piste d'infrastructure (P0-D)

- Provisionner une vraie base et un Hyperdrive Cloudflare, appliquer `0001 → 0004` dessus, déployer le Worker et exécuter `wrangler dev --remote`.
- Confirmer en recette le comportement des verrous consultatifs transactionnels et des lectures d'identité à travers un Hyperdrive déployé (cache désactivé requis).
- Compléter le seed RBAC des rôles non ADMIN (aujourd'hui un candidat a zéro permission effective en mode PostgreSQL).
- Activer les services Cloudflare éventuels (R2, Queue, Cron, Durable Objects) uniquement lorsqu'un domaine les exige.
