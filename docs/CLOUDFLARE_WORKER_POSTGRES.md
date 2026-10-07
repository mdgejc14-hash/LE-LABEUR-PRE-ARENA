# LE LABEUR — Worker Cloudflare + PostgreSQL (P0-C)

**État au 2026-10-05.** P0-C branche la fondation PostgreSQL de P0-A/P0-B sur une
chaîne d'exécution Worker → Hyperdrive → PostgreSQL **réellement exécutée en
local**, et prépare la configuration Cloudflare réelle sans jamais la revendiquer.

> **Mise à jour P0-CLOUDFLARE-PRODUCTION (2026-10-07)** : les lignes « R2,
> Queues, Cron, Durable Objects, KV : hors périmètre » ci-dessous décrivent
> l'état de P0-C. Cette tranche d'infrastructure ajoute — sans modifier une
> règle métier — le Cron Trigger déclaré et prouvé localement, le binding R2 de
> production, les invariants de production (fermeture franche), le rapport
> `GET /readyz` et les contrôles de déploiement. **Aucun déploiement n'a été
> réalisé** (aucun compte Cloudflare). Référence à jour :
> [`docs/P0-CLOUDFLARE_PRODUCTION.md`](./P0-CLOUDFLARE_PRODUCTION.md).

## 1. Matrice d'état (à lire avant toute affirmation)

| Élément | État | Preuve / limite |
|---|---|---|
| Entrée Worker réelle (`src/backend/worker/cloudflareEntry.ts`) | **RÉEL** | Bundle construit par `wrangler deploy --dry-run` ; exécuté sous workerd |
| Runtime workerd + binding Hyperdrive local + PostgreSQL réel | **TEST/LOCAL** | `npm run verify:workerd` → 9/9 PASS (cycle CONTRAT P0-F inclus) |
| Migrations 0001 → 0005 sur un moteur PostgreSQL réel | **RÉEL (local)** | `npm run migrate` et `npm run verify:postgres` → 19/19 PASS |
| Bibliothèque `pg` 8.23.1 + `embedded-postgres` 17.10.0-beta.17 | **RÉEL** | `pg` en `dependencies` (runtime Worker), moteur embarqué en `devDependencies` |
| Configuration `wrangler.toml` (bindings, vars, profils) | **PRÉPARÉ** | ID Hyperdrive = placeholder explicite ; profil production volontairement sans binding |
| Runner de migrations (`scripts/migrate.ts`) | **RÉEL** | Appliqué et rejoué (idempotence) sur PostgreSQL 17.10 |
| `embedded-postgres` comme moteur de test (apt étant bloqué) | **TEST/LOCAL** | Binaires natifs PostgreSQL 17.10, aucune ressource managée |
| Hyperdrive déployé (`wrangler hyperdrive create`) | **INDISPONIBLE** | `npx wrangler hyperdrive list` → authentification requise |
| Compte Cloudflare / déploiement / `wrangler dev --remote` | **INDISPONIBLE** | `npx wrangler whoami` → « You are not authenticated » |
| Base PostgreSQL distante / managée (Neon, Supabase, RDS…) | **INDISPONIBLE** | Aucune chaîne de connexion réelle, aucun credential |
| Audience Google réelle (`GOOGLE_CLIENT_ID`) | **INDISPONIBLE** | Valeur publique absente ; sans elle le Worker reste fermé (401/501) |
| R2, Queues, Cron, Durable Objects, KV | **P0-C : hors périmètre — voir P0-CLOUDFLARE-PRODUCTION** | Cron déclaré (`*/5 * * * *`, cadence d'exploitation) ; binding R2 de production déclaré (bucket privé, à créer) ; **aucune** Cloudflare Queue (décision : la file durable reste `automation_outbox`) |

> Aucun secret n'est présent dans le dépôt : vérifié automatiquement par la suite
> `P0-C — configuration Cloudflare Worker` (`npm test`) et par les assertions de
> `npm run verify:workerd`.

## 2. Chaîne exécutée

```text
Requête HTTP
  → workerd (wrangler dev --local)
  → env.HYPERDRIVE.connectionString alimenté par
    CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE
  → pool pg PAR REQUÊTE (plafonné à 5 connexions, fermé via ctx.waitUntil)
  → PostgreSQL 17.10 réel (moteur embarqué, TEST/LOCAL)
  → réponse JSON
```

En production, seule la source de la chaîne de connexion change : Hyperdrive
déployé remplace la variable locale. Le code Worker est identique.

## 3. Configuration (`wrangler.toml`)

| Élément | Valeur | Rôle |
|---|---|---|
| `main` | `src/backend/worker/cloudflareEntry.ts` | Entrée Worker réelle |
| `compatibility_flags` | `["nodejs_compat"]` | Requis par `pg` (`node:net`, `node:tls`, `node:crypto`) |
| `compatibility_date` | `2026-10-05` | Doit rester ≥ 2024-09-23 |
| `[[hyperdrive]] binding` | `HYPERDRIVE` | Binding lu par le Worker |
| `[[hyperdrive]] id` | `00000000-0000-0000-0000-000000000000` | **PLACEHOLDER** — à remplacer après `wrangler hyperdrive create` |
| `[vars]` (défaut) | `PERSISTENCE=postgres`, `WORKER_ENV=development`, limites de pool/timeout, `COOKIE_SECURE=true` | Développement (`wrangler dev`) |
| `[env.production.vars]` | mêmes clés, `WORKER_ENV=production` | **Redéclarées** : les `vars` et bindings ne sont pas hérités par les environnements Wrangler |
| `[env.production]` Hyperdrive | **absent (voulu)** | Déployé tel quel, le Worker répond 503 (`degraded`, motif `production-missing-hyperdrive`) au lieu d'utiliser une base implicite |
| `[triggers]` / `[env.production.triggers]` | `["*/5 * * * *"]` | Cadence **technique** (décision d'exploitation à confirmer) ; publiée par `CRON_CADENCE`, vérifiée par `/readyz` |
| `[[env.production.r2_buckets]]` | `DOCUMENTS_BUCKET` → `lelabeur-documents-production` | Bucket privé, à créer par l'exploitant ; aucun domaine public ; présignature R2 restée bloquée |

Secrets autorisés (jamais dans le dépôt) : `wrangler secret put POSTGRES_CONNECTION_STRING --env production`,
ou `.dev.vars` local (gitignoré) avec `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`.

## 4. Vérifications réelles exécutées

```bash
npm test                 # 1232/1232 PASS (dont 28 tests P0-F et 13 tests de matrice P0-F)
npm run lint             # tsc --noEmit : aucune erreur
npm run build            # bundle navigateur inchangé (pg absent)
npm run verify:postgres  # 28/28 PASS — Worker/API → PostgreSQL réel (dont migrations concurrentes)
npm run verify:workerd   # 16/16 PASS — workerd + binding Hyperdrive + PostgreSQL réel (dont Cron réel et /readyz)
npm run deploy:preflight # 12/12 contrôles locaux + blocages externes explicites (aucun déploiement)
npm run smoke:production # BLOCKED_EXTERNAL_ACCESS sans Worker déployé (lecture seule)
npm run migrate -- --status  # état réel des migrations (aucune valeur secrète affichée)
```

Couverture de `npm run verify:postgres` (moteur réel, TEST/LOCAL) : connexion,
migrations 0001→0005 + idempotence, schéma identité/RBAC/noyau, **COMMIT**,
**ROLLBACK**, lecture/écriture `users`, lecture/écriture `sessions` (seul le
SHA-256 du jeton est stocké), lecture des permissions, `/healthz` réel sans
secret, parcours Google signé → session → `/me` → logout, permissions ADMIN
lues en base, séparation MODE DEMO / MODE API, et cycle CONTRAT P0-F complet
(création depuis une proposition `ACCEPTED`, envoi, double signature, activation,
fin `COMPLETED`, protection M1, historique persisté, offre/candidature
inchangées).

Couverture de `npm run verify:workerd` : le même parcours, mais exécuté **par
workerd** via HTTP, avec le binding Hyperdrive local et un JWKS de test en
boucle locale ; `/healthz` y prouve la source `HYPERDRIVE` et l'état `workerd` ;
le cycle CONTRAT y couvre `COMPLETED` **et** `TERMINATED` (M1 protégé, M2 autorisé).

## 5. `/healthz` — contrat

Trois formes, strictement dérivées de l'état observé :

```jsonc
// Configuration fermée (aucune persistance) — 200
{ "status": "boundary-only", "apiVersion": "v1", "persistence": "not-configured", "runtime": { … } }

// Persistance configurée et sondée — 200
{
  "status": "ok",
  "apiVersion": "v1",
  "persistence": {
    "mode": "postgres", "reason": "hyperdrive-binding", "configured": true, "durable": true,
    "reachable": true, "checkedAt": "…", "latencyMs": 10,
    "target": { "host": "…", "port": 5432, "database": "…", "source": "HYPERDRIVE",
                "poolMax": 5, "statementTimeoutMs": 15000, "applicationName": "lelabeur-worker",
                "sslRequired": false, "secretRedacted": true },
    "migrations": { "status": "applied", "applied": ["0001…", "0002…", "0003…", "0004…", "0005…"], "pending": [] }
  },
  "runtime": { "runtime": "workerd", "declaredEnvironment": "production", "hyperdriveBinding": true }
}

// Persistance demandée mais inutilisable — 503
{ "status": "degraded", "persistence": { "mode": "misconfigured", "reachable": false|null, "error": "…expurgé…" } }
```

Garanties : aucune chaîne de connexion, aucun mot de passe, aucun jeton ;
`secretRedacted: true` sur le descripteur ; erreur de sonde expurgée par
`redactSqlSecrets` ; la mémoire est annoncée `durable: false` et jamais comme
PostgreSQL. Un rapporteur défaillant produit un 503 dégradé, jamais un 500 opaque.

## 6. Procédure d'activation réelle (à exécuter quand les ressources existent)

```bash
# 1. Hyperdrive réel (cache DÉSACTIVÉ : les lectures d'identité exigent un état frais)
npx wrangler hyperdrive create lelabeur-prod \
  --connection-string="postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require" \
  --caching-disabled=true

# 2. Reporter l'ID retourné dans wrangler.toml ([env.production.hyperdrive] à décommenter)

# 3. Migrations sur la base réelle (la chaîne de connexion ne sort jamais de l'environnement)
MIGRATION_DATABASE_URL="postgresql://…" npm run migrate -- --status
MIGRATION_DATABASE_URL="postgresql://…" npm run migrate

# 4. Audience Google publique
npx wrangler secret put GOOGLE_CLIENT_ID --env production   # ou var publique si l'équipe le préfère

# 5. Déploiement + contrôle
npx wrangler deploy --env production
curl -s https://<worker>/healthz | head -c 400   # status ok, migrations applied
```

Ce qui reste explicitement **non vérifiable** dans cette session : création
Hyperdrive, `wrangler dev --remote`, déploiement, cache Hyperdrive réel, TLS
d'origine, comportement des verrous consultatifs à travers un Hyperdrive déployé.

## 7. Constats et points d'attention

- **`pg_advisory_xact_lock`** : P0-B sérialise la résolution d'identité avec un
  verrou transactionnel. Il fonctionne via Hyperdrive local et respecte le mode
  transaction de Hyperdrive, mais son comportement à travers un Hyperdrive
  déployé n'a pas pu être vérifié ici. À confirmer en recette.
- **Cache Hyperdrive et read-after-write** : la documentation Cloudflare indique
  que les lectures mises en cache ne sont pas invalidées par les écritures. Les
  lectures d'identité/session/permissions exigent un état frais → le Hyperdrive
  de production doit être créé avec `--caching-disabled=true` (ou `max_age=0`).
- **Pool `pg` par requête** : un pool conservé entre requêtes a produit des
  connexions standby invalides sous workerd (« code hung »). Le pool est donc
  créé par requête puis fermé via `ctx.waitUntil`, conformément aux
  recommandations Hyperdrive.
- **RBAC SQL partiel** : la migration `0002` ne seed que le rôle `ADMIN`. Les
  permissions `CANDIDATE`/`EMPLOYER` restent définies côté mémoire uniquement :
  en mode PostgreSQL, un candidat a donc zéro permission effective tant que le
  seed des rôles n'est pas complété (à traiter en P0-D, sans invention).
- **`vars`/bindings non hérités** : le profil `production` redéclare
  explicitement ses vars ; il ne déclare aucun Hyperdrive tant qu'aucun n'existe.

## 7bis. Frontière de PRODUCTION (P0-CLOUDFLARE-PRODUCTION)

- **Invariants bloquants** (`src/backend/worker/productionGuard.ts`) : production
  ⇒ `PERSISTENCE=postgres`, `COOKIE_SECURE≠false`, aucun override de test, cible
  PostgreSQL réellement résolue. Toute violation ferme le Worker (503 motivé) et
  neutralise `scheduled()`.
- **`GET /readyz`** : dix vérifications observées (Worker, PostgreSQL,
  migrations, file durable, Cron tracé, automatisation, notifications,
  documents, R2, audit). Statuts seuls sans session ; détail réservé à un ADMIN
  disposant de `audit:read`. Aucune écriture, aucun secret.
- **Migrations** : verrou consultatif de session — deux exécutions concurrentes
  ne rejouent jamais une migration (vérifié sur PostgreSQL réel).

## 8. Sécurité

- Aucun secret dans le dépôt ni dans `VITE_*` : `pg` est une dépendance serveur,
  jamais atteignable depuis `src/main.tsx` (test d'isolation du bundle).
- `wrangler.toml` ne contient que des valeurs publiques ; les exemples de
  chaînes de connexion de `.dev.vars.example` sont en boucle locale, hors TLS,
  et refusés comme placeholders s'ils sont réutilisés tels quels.
- `TEST_ONLY_GOOGLE_JWKS_URL` n'est honoré que pour `http://` + boucle locale ;
  toute autre valeur est ignorée (aucun détournement possible en production).
- Le MODE DEMO (MockRepository/localStorage) reste le défaut navigateur ; le
  mode API exige `VITE_DEMO_MODE=false` + `VITE_API_BASE_PATH` same-origin.
