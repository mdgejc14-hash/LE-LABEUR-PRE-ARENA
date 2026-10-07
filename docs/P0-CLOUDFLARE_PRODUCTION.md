# LE LABEUR — P0-CLOUDFLARE-PRODUCTION

**Tranche d'INFRASTRUCTURE / DÉPLOIEMENT.** Elle branche les briques déjà
construites sur l'architecture Cloudflare de production, sans modifier une seule
règle métier validée.

Chaîne visée :

```text
Requête → Worker (workerd)
              ├─ /healthz  (santé de persistance, contrat P0-C inchangé)
              └─ /readyz   (préparation de production, NOUVEAU — 10 vérifications observées)

Cron Trigger → scheduled() → runScheduledCycle()
              → recoverStaleClaims → drain (Outbox → paiements échus → jobs échus)
              → audit `CRON_TICK_EXECUTED`

automation_outbox / automation_jobs (PostgreSQL, file durable EXISTANTE)
              → Automation Worker → AutomationEngine → handlers
              → notifications In-App / Claims / Paiements / Réputation (inchangés)

PostgreSQL ← Hyperdrive (binding HYPERDRIVE) ← pilote `pg` (pool par requête)
R2 (binding DOCUMENTS_BUCKET, bucket privé) ← port `ObjectStorage` existant
```

> **Ce document ne prétend à aucune conformité et n'autorise aucun lancement
> public.** Il décrit un état technique vérifié, ses blocages réels et ce qui
> reste impossible à prouver sans ressources externes.

---

## 1. Matrice d'état — à lire avant toute affirmation

| Élément | État | Preuve / limite |
|---|---|---|
| Entrée Worker (`src/backend/worker/cloudflareEntry.ts`) | **RÉEL, non réécrit** | Composition existante réutilisée ; seule la frontière de production a été ajoutée |
| Garde-fou de production (`productionGuard.ts`) | **RÉEL** | 6 tests dédiés + exécution réelle sous workerd (profil `production`) |
| `GET /readyz` (10 vérifications) | **RÉEL** | 7 tests dédiés + exécution réelle sous workerd + PostgreSQL réel |
| Cron Trigger déclaré (`[triggers]`, `[env.production.triggers]`) | **DÉCLARÉ** | Cadence technique `*/5 * * * *`, identique dans les deux profils, publiée par `CRON_CADENCE` |
| `scheduled()` → `runScheduledCycle()` exécuté par workerd | **RÉEL (local)** | `npm run verify:workerd` : `/__scheduled` → ligne `CRON_TICK_EXECUTED` dans PostgreSQL réel |
| File durable | **RÉELLE** | `automation_outbox` + `automation_jobs` (claim `FOR UPDATE SKIP LOCKED`, tentatives, dead-letter, récupération des claims orphelins) |
| Cloudflare Queue | **DÉCISION : AUCUNE** | Aucun binding `queues` déclaré, test dédié : une seconde file serait un second système de vérité |
| PostgreSQL / Hyperdrive (production) | **BLOQUÉ_EXTERNE** | Aucun Hyperdrive créé, aucun compte Cloudflare, aucune base managée : le profil production démarre FERMÉ |
| Migrations 0001 → 0017 | **RÉELLES (local)** | `npm run verify:postgres` 28/28 PASS, dont deux exécutions **concurrentes** du runner |
| Bucket R2 de production | **BLOQUÉ_EXTERNE** | Binding `DOCUMENTS_BUCKET` déclaré pour `lelabeur-documents-production` ; bucket NON créé (aucun accès Cloudflare) |
| Présignature R2 (PUT/GET S3) | **VOLONTAIREMENT FERMÉE** | L'adaptateur refuse (`NOT_IMPLEMENTED`) : aucun credential S3, aucune implémentation de signature V4 dans le dépôt |
| Téléchargement signé applicatif (HMAC applicatif) | **PRÊT, NON PROVISIONNÉ** | Sans `DOCUMENT_URL_SIGNING_SECRET`, l'émission d'URL signée répond 501 ; le téléchargement authentifié fonctionne |
| Notifications In-App | **RÉELLES (PostgreSQL)** | Inchangées ; `/readyz` vérifie une lecture bornée |
| Push / Email | **ABSTRACTION** | Aucun provider, aucun secret : état `NOT_AVAILABLE` publié par `/healthz`/`/readyz` |
| Déploiement Cloudflare (`wrangler deploy`) | **NON EXÉCUTÉ** | Aucun credential ; `npm run deploy:preflight` le Prouve : 3 blocages externes |
| Smoke tests de production HTTP | **NON EXÉCUTÉS** | `npm run smoke:production` sans URL déployée → `BLOCKED_EXTERNAL_ACCESS` |

---

## 2. Ce qui n'a PAS été touché

Aucune ligne des périmètres suivants n'a été modifiée : paiements, salaire,
litiges/Claims, matching, réputation, remplacement, notifications, R2 métier,
Cron/Queue métier, transitions de statuts, permissions, audit des domaines.

Le modèle financier reste **strictement** :

```text
Prix Prestataire + Frais SaaS LE LABEUR = Coût Client
```

LE LABEUR ne détient pas les fonds, ne conserve pas le salaire, ne le reverse
pas et n'initie pas le paiement du Prestataire. **Aucune intégration de paiement
réel n'a été activée** par cette tranche.

Le seul ajustement touchant un fichier « métier-adjacent » est
`applyMigrations` (transaction + **verrou consultatif** de session) : c'est un
composant d'infrastructure de déploiement, pas une règle métier, et son
comportement observable reste identique (idempotence, checksum, trace atomique).

---

## 3. Cron — cadence et preuve d'exécution

**Décision d'exploitation, pas une règle métier.** Aucune cadence officielle
n'ayant été décidée, la valeur retenue est la cadence **technique** minimale
permettant l'exploitation et la vérification :

```toml
[triggers]                 crons = ["*/5 * * * *"]   # profil par défaut (wrangler dev --test-scheduled)
[env.production.triggers]  crons = ["*/5 * * * *"]   # profil de production
CRON_CADENCE = "*/5 * * * *"                          # publié et vérifié par /readyz
```

Elle est signalée explicitement comme **à confirmer par l'exploitant** avant
toute mise en service publique. La changer = modifier **deux** valeurs
(trigger + `CRON_CADENCE`) : les tests de configuration échouent si elles
divergent, et `/readyz` compare la cadence déclarée à la **dernière trace réelle**
(`CRON_TICK_EXECUTED`).

Le déclencheur n'appelle **que** `scheduled()` → `runScheduledCycle()` :
récupération des claims orphelins, puis le drain existant (Outbox → paiements
échus → jobs échus), puis la trace du tick. Aucune route HTTP de drain,
aucun `setInterval`, aucun second ordonnanceur, aucune action métier arbitraire.

Preuve exécutée : `npm run verify:workerd` → `POST /__scheduled?cron=…` exécuté
par workerd avec le binding Hyperdrive local, puis **une et une seule** ligne
`CRON_TICK_EXECUTED` (source `automation:P0-CRON-QUEUE`, acteur `SYSTEM`) dans
PostgreSQL réel.

---

## 4. PostgreSQL / Hyperdrive

- **Aucune seconde couche de persistance, aucune base secondaire** n'est créée :
  le contrat `PostgreSqlDatabase` et les stores existants sont réutilisés.
- Le pool `pg` reste **créé par requête** (≤ 5 connexions, fermé via
  `ctx.waitUntil`) : Hyperdrive est le pool réel.
- Timeouts : `DB_STATEMENT_TIMEOUT_MS = 15000` posé par `SET LOCAL` dans chaque
  transaction ; transactions réelles sur connexion dédiée (BEGIN/COMMIT/ROLLBACK).
- La chaîne de connexion n'est **jamais** journalisée, sérialisée ou exposée :
  seule un descripteur sûr (hôte, port, base, source, `secretRedacted: true`).
- Le fallback `POSTGRES_CONNECTION_STRING` reste possible (dépannage) mais n'est
  jamais activé par défaut ; une valeur documentaire est refusée
  (`placeholder-connection-string`).

**Activation réelle (bloquée aujourd'hui, faute de ressource) :**

```bash
npx wrangler hyperdrive create lelabeur-prod \
  --connection-string="postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require" \
  --caching-disabled=true
# puis décommenter [[env.production.hyperdrive]] avec l'ID réel
```

`--caching-disabled=true` est **requis** : les lectures d'identité, de session
et de permissions exigent un état frais, et les écritures n'invalident pas les
lectures mises en cache.

Tant que le binding n'existe pas, le profil production est **fermé** :
`/healthz` → 503 `degraded` (motif `production-missing-hyperdrive`),
`/readyz` → 503 `blocked`, aucune route métier, aucun travail planifié,
aucune connexion tentée.

---

## 5. Migrations — 0001 → 0017

- Manifeste unique `EXPECTED_MIGRATION_IDS` (lu par `/healthz` et `/readyz`)
  aligné **exactement** sur les fichiers de `migrations/` (vérifié à chaque
  `npm test` et par le préflight).
- Le **Worker n'exécute jamais de migration** : le déploiement ne peut donc pas
  rejouer une migration. L'application est un acte d'exploitation explicite :
  `MIGRATION_DATABASE_URL="…" npm run migrate -- --status` puis `npm run migrate`.
- Chaque migration est appliquée dans **une transaction atomique** avec sa trace
  `schema_migrations` (empreinte SHA-256, `applied_at`, `duration_ms`) ; toute
  divergence d'empreinte est refusée (jamais de relecture silencieuse).
- **Nouveau** : un **verrou consultatif de session** PostgreSQL
  (`pg_advisory_lock`, clé constante `741852963`) sérialise deux exécutions
  concurrentes (CI + poste opérateur). Le second exécutant constate le travail
  déjà tracé et ne rejoue rien ; le verrou est libéré dans tous les cas.
  Vérifié en réel : `npm run verify:postgres` (migration sonde appliquée
  **exactement une fois** par deux runners concurrents, puis nettoyée).
- Aucune migration destructive, aucune suppression de données, aucune donnée
  existante touchée.

---

## 6. R2 — documents et preuves

- Binding de production : `[[env.production.r2_buckets]] binding =
  "DOCUMENTS_BUCKET"`, bucket **privé** `lelabeur-documents-production`
  (aucun domaine public, aucun `r2.dev`, aucun `custom_domain` — vérifié par
  test).
- Le bucket doit être créé par l'exploitant :
  `npx wrangler r2 bucket create lelabeur-documents-production`. S'il n'existe
  pas, `wrangler deploy` échoue : c'est voulu (aucun domaine documentaire ne
  doit être déployé vers un bucket inexistant).
- `object_key` n'est **jamais** exposé : le contenu ne sort que par une route
  authentifiée et contrôlée (ownership / parties / permissions / ADMIN avec
  permission), la clé physique est générée côté serveur.
- Intégrité : empreinte SHA-256 par version, contenu immuable, historique
  append-only, révocations auditées.
- **Présignature R2 : reste explicitement bloquée.** L'adaptateur
  `createR2BucketObjectStorage` refuse `createSignedUploadUrl` /
  `createSignedDownloadUrl` (`NOT_IMPLEMENTED`) : elle exigerait des
  identifiants S3 (access key/secret) et une signature V4 qui n'existent ni dans
  le dépôt, ni dans cette session. **Aucune présignature simulée.**
- Le téléchargement signé **applicatif** (HMAC applicatif, TTL court) reste le
  mécanisme réel : sans `DOCUMENT_URL_SIGNING_SECRET`, l'émission d'URL signée
  répond 501 explicite et le téléchargement authentifié continue de fonctionner.

---

## 7. Secrets, bindings et variables

Inventaire exécutable : `src/backend/worker/productionResources.ts`
(`PRODUCTION_REQUIREMENTS`), audité par `/readyz` (présence uniquement, jamais la
valeur) et par `npm run deploy:preflight`.

| Ressource | Type | Sévérité si absente | Fermeture réelle |
|---|---|---|---|
| `HYPERDRIVE` | binding | bloquante | `misconfigured` → 503, aucune connexion, aucun travail planifié |
| `DOCUMENTS_BUCKET` | binding | dégradée | domaine documents 501, aucun objet exposé |
| `PERSISTENCE=postgres` | var | bloquante | production refusée avec une autre valeur |
| `WORKER_ENV=production` | var | bloquante | invariants non appliqués sinon |
| `COOKIE_SECURE=true` | var | bloquante | `false` en production = fermeture franche |
| `CRON_CADENCE` | var | dégradée | `/readyz` `blocked` : planification non prouvable |
| `GOOGLE_CLIENT_ID` | var publique | dégradée | frontière fermée (401/501) |
| `DB_POOL_MAX`, `DB_STATEMENT_TIMEOUT_MS`, `DB_APPLICATION_NAME`, `SESSION_TTL_SECONDS` | vars | dégradée | défauts documentés, valeurs invalides refusées |
| `PAYMENT_PRE_DUE_LEAD_TIME_MS`, `CLAIM_EVIDENCE_DEADLINE_MS` | vars d'EXPLOITATION | dégradée | **absentes par défaut** : aucune règle métier inventée |
| `DOCUMENT_URL_SIGNING_SECRET` | **secret** | dégradée | émission d'URL signée 501 |
| `POSTGRES_CONNECTION_STRING` | **secret** (repli) | dégradée | jamais utilisé par défaut |

Règles de gestion :

- **Aucun secret dans Git, dans `wrangler.toml`, dans les tests ou dans une
  réponse HTTP.** Vérifié automatiquement (tests de configuration, `verify:workerd`,
  `verify:postgres`, préflight).
- Les secrets s'approvisionnent par
  `npx wrangler secret put <NOM> --env production` — jamais par une `var`.
- Les valeurs d'exemple/placeholder sont **refusées** :
  `postgresql://user:password@host:5432/database`, préfixes `REMPLACER_`,
  `PLACEHOLDER_`, `CHANGEME`, `TODO_`, `<…>`, ID Hyperdrive nul.
- **Rotation documentée** : créer un second Hyperdrive (ou une nouvelle chaîne
  de connexion) → mettre à jour le binding de production → redéployer → vérifier
  `/healthz` (`reachable: true`) puis `/readyz` → **révoquer l'ancien**. Pour
  `DOCUMENT_URL_SIGNING_SECRET`, publier la nouvelle valeur puis redéployer ;
  les URL déjà émises expirent en ≤ 300 s (TTL court), donc la rotation est sans
  coupure observable.
- Séparation des environnements : les `vars`/bindings ne sont pas hérités ;
  `[env.production.*]` redéclare explicitement. Le profil par défaut
  (`development`) n'est jamais déployé en production.

---

## 8. Environnements

Le dépôt ne contient **que deux profils** : `default` (développement, utilisé par
`wrangler dev`) et `production` (`wrangler deploy --env production`).

- **Staging : inexistant.** Aucun profil intermédiaire n'a été inventé : un
  staging supposerait un second Hyperdrive, un second bucket et une seconde
  audience OAuth, ressources qui n'existent pas. Point ouvert assumé (§16).
- La production ne peut PAS lire : `.dev.vars` (gitignoré, jamais dans
  `wrangler.toml`), les fixtures de test, les credentials locaux, les endpoints
  de boucle locale, PostgreSQL local ou un provider simulé.
  `TEST_ONLY_GOOGLE_JWKS_URL` est ignoré hors boucle locale **et** refuse un
  déploiement de production (invariant bloquant).

---

## 9. Santé et observabilité

### `GET /healthz` (contrat P0-C conservé)

Trois formes strictement dérivées de l'état observé : `boundary-only` (frontière
fermée), `ok` (persistance sondée et joignable), `degraded` (503, motif expurgé).
Nouveauté additive : en production fermée par le garde-fou, le rapport porte
`violations: [...]` (messages expurgés, aucun secret).

### `GET /readyz` (NOUVEAU — préparation de production)

Dix vérifications **observées** : `worker`, `postgres`, `migrations`, `queue`,
`cron`, `automation`, `notifications`, `documents`, `r2`, `audit`.

- Un composant absent est `blocked` — jamais un `ok` par défaut.
- Anomalie d'exploitation (dead-letter, claim orphelin, cadence déclarée sans
  tick tracé) → `degraded` (200, le service répond).
- Un blocage → **503**.
- **Aucune écriture** : lectures bornées (`LIMIT 1`, compteurs), et un simple
  `head` sur la clé de sonde `readiness/probe` (jamais de `put`).
- **Projection publique** : statuts seuls (`{id, status}`), aucun hôte, aucun
  compteur, aucun nom de binding.
- **Détail d'exploitation** : réservé à une session **ADMIN** disposant de la
  permission **existante** `audit:read` (`detailed: true`).
- `POST /readyz` → 404 : aucune mutation, aucune méthode supplémentaire.

### Journalisation

`[observability] enabled = true` (profil par défaut **et** production).
Les erreurs de sonde/requête sont expurgées par `redactSqlSecrets` :
identifiants remplacés par `[redacted]`, jamais supprimés en silence.

---

## 10. Sécurité — ce qui est vérifié

| Contrôle | État |
|---|---|
| TLS / cookie de session | `COOKIE_SECURE=true` en production ; `false` **refusé** (invariant bloquant) |
| Secrets | jamais dans Git/`wrangler.toml`/tests/réponses ; préflight + 6 tests dédiés |
| Persistance | jamais de retombée mémoire en production (invariant bloquant) |
| Override de test | `TEST_ONLY_GOOGLE_JWKS_URL` ignoré hors boucle locale **et** refusé en production |
| RBAC / IDOR | inchangés : ownership/parties/permissions, ADMIN sans bypass implicite ; `/readyz` détaillé exige `audit:read` |
| Accès R2 | bucket privé, clé d'objet jamais exposée, pas de présignature simulée |
| Accès DB | pool par requête, timeout d'énoncé, erreurs expurgées |
| Routes debug/drain | **aucune** (test de configuration + smoke test distant les cherche en 404/405) |
| Accès ADMIN | frontières existantes ; aucune permission nouvelle n'a été créée |
| CORS / en-têtes | aucune ouverture CORS permissive, `cache-control: no-store`, `x-request-id` ; frontière same-origin (le client refuse un chemin non same-origin) |
| Rate limits | **AUCUN** : point ouvert (§16), aucune valeur n'a été inventée |
| `/__scheduled` | disponible uniquement en `wrangler dev --test-scheduled` ; un Worker déployé ne l'expose pas (vérifié par le smoke test) |

---

## 11. Limites et bornes (audit, aucune optimisation métier)

| Borne | Valeur | Origine |
|---|---|---|
| Connexions PostgreSQL par isolate | ≤ 5 | `DB_POOL_MAX`, plafonné par `MAX_WORKER_DB_CONNECTIONS` |
| Timeout d'énoncé | 15 s | `DB_STATEMENT_TIMEOUT_MS` + `SET LOCAL` |
| Batch de drain planifié | 25 | `SCHEDULED_DRAIN_LIMIT` (par tick de cron) |
| Batch de drain explicite | 25 | `DEFAULT_CLAIM_LIMIT` |
| Tentatives avant dead-letter | 5 | `DEFAULT_MAX_ATTEMPTS` |
| Délai de rejeu | 30 s | `DEFAULT_RETRY_DELAY_MS` |
| Borne d'orphanisation d'un claim | 10 min (> timeout 15 s) | `DEFAULT_STALE_CLAIM_MS` |
| Taille maximale d'un document | 25 Mio | `MAX_DOCUMENT_CONTENT_BYTES` (contenu monté en mémoire dans l'isolate : ≤ 128 Mio) |
| Formats admis | PDF / JPEG / PNG / WebP | `DOCUMENT_CONTENT_TYPES` |
| Pagination | bornée, curseur | `parsePageRequest` |
| TTL des URL signées applicatives | 300 s | `DOCUMENT_SIGNED_URL_TTL_SECONDS` |

Aucune règle métier n'a été modifiée pour des raisons de performance. **Les load
tests sont hors périmètre** de cette tranche.

---

## 12. Données et transferts (APDP) — audit, pas de conformité affirmée

Ce déploiement introduit des sous-traitants dont l'analyse doit être reprise par
le conseil juridique. **Aucune conformité APDP n'est acquise du fait que le
service fonctionne.**

| Fournisseur | Rôle technique | Données concernées | Localisation déclarable aujourd'hui |
|---|---|---|---|
| Cloudflare (Workers) | exécution du code, TLS, routage, logs d'observabilité | requêtes HTTP, journaux techniques, en-têtes de session (cookie opaque) | réseau Cloudflare mondial ; **région de traitement non figée** (aucune `jurisdiction` déclarée) |
| Cloudflare Hyperdrive | pool/proxy de connexion PostgreSQL | requêtes SQL et paramètres en transit (données d'identité, métadonnées métier) | idem ; le **stockage** reste la base PostgreSQL choisie par l'exploitant |
| Cloudflare R2 | stockage objet des documents et preuves | contenus documentaires (PDF/images), clés d'objet | idem ; **region/jurisdiction non configurée** (point ouvert) |
| PostgreSQL managé (à choisir) | stockage primaire | totalité des données applicatives | **inconnu** : aucune instance n'existe |
| Google Identity Services | vérification de l'audience OAuth | jeton d'identité (email vérifié, `sub`) | traitement Google ; audience publique côté client |

Points explicitement **ouverts** : région/jurisdiction Cloudflare (aucune
`jurisdiction` n'est posée), localisation du PostgreSQL managé, transferts hors
CEDEAO, base légale, durées de conservation documentaires encore
`PENDING_LEGAL_VALIDATION` (aucune durée inventée), encadrement PSP inexistant,
qualification « placement » (DGT) non tranchée, preuve électronique non
qualifiée, fiscalité non traitée. **Rien de tout cela n'est résolu par cette
tranche.**

Bonne pratique déjà en place : minimisation (pas de biométrie, pas de pièces
médicales, pas de casier), hash SHA-256 plutôt que contenu dans les métadonnées,
sessions stockées sous forme de hash, aucune diffusion globale de notifications.

---

## 13. Smoke tests

### Exécutables localement (tous PASS aujourd'hui)

```bash
npm test                # suites unitaires + intégration PGlite, dont les 17 nouveaux tests P0-CPROD
npm run verify:postgres # Worker/API → PostgreSQL 17.10 réel (28/28), dont migrations concurrentes
npm run verify:workerd  # workerd + binding Hyperdrive local (16/16), dont /readyz et Cron RÉEL
npx tsc --noEmit        # aucune erreur de typage
git diff --check        # aucune anomalie d'espaces
```

### Pré-déploiement (aucun réseau)

```bash
npm run deploy:preflight              # 12/12 contrôles locaux, 3 blocages externes (état réel actuel)
npm run deploy:preflight -- --external # + whoami / hyperdrive list / r2 bucket list
```

### Production (nécessite un déploiement réel — non exécuté ici)

```bash
LELABEUR_SMOKE_BASE_URL="https://lelabeur-api.<compte>.workers.dev" npm run smoke:production
# Vérifications détaillées (PostgreSQL, migrations, tick de cron, R2, documents,
# notifications, audit) : fournir une session ADMIN avec `audit:read`
LELABEUR_SMOKE_SESSION_COOKIE="lelabeur_session=…" npm run smoke:production
```

Contrat de sûreté du smoke test : **lecture seule**, aucune écriture, aucun
paiement, aucun transfert, aucune migration, aucun dossier métier modifié.
Ce qui ne peut pas être prouvé (URL absente, session absente) est rendu
`BLOCKED_EXTERNAL_ACCESS`, jamais `OK`.

---

## 14. Procédure de mise en production (à exécuter quand les ressources existent)

```bash
# 1. Base PostgreSQL managée + Hyperdrive (cache désactivé)
npx wrangler hyperdrive create lelabeur-prod \
  --connection-string="postgresql://…" --caching-disabled=true

# 2. Report de l'ID réel dans wrangler.toml ([[env.production.hyperdrive]]) — jamais un placeholder

# 3. Migrations sur la base réelle (jamais depuis le Worker)
MIGRATION_DATABASE_URL="postgresql://…" npm run migrate -- --status
MIGRATION_DATABASE_URL="postgresql://…" npm run migrate

# 4. Ressources et secrets
npx wrangler r2 bucket create lelabeur-documents-production
npx wrangler secret put GOOGLE_CLIENT_ID --env production
npx wrangler secret put DOCUMENT_URL_SIGNING_SECRET --env production
#    (optionnel, décision d'exploitation) :
# npx wrangler secret put POSTGRES_CONNECTION_STRING --env production

# 5. Contrôle puis déploiement
npm run deploy:preflight -- --external     # doit sortir en 0
npx wrangler deploy --env production

# 6. Vérifications de production
curl -s https://<worker>/healthz   # status ok, migrations applied
curl -s https://<worker>/readyz    # status ready (statuts seuls sans session)
LELABEUR_SMOKE_BASE_URL="https://<worker>" npm run smoke:production
```

**Retour arrière** : `wrangler rollback` (version précédente) et suppression du
binding Hyperdrive si la cible est invalide. Une migration appliquée **n'est
jamais annulée automatiquement** : l'action est manuelle, écrite et revue.

---

## 15. Ce qui a été réellement déployé

**Rien.** Aucun compte Cloudflare, aucun credential, aucune ressource :
aucun `wrangler deploy`, aucun Hyperdrive, aucun bucket R2, aucune base
managée, aucun secret provisionné. Les seules exécutions réelles sont
**locales** (workerd + PostgreSQL 17.10 embarqué) et sont reproductibles par les
commandes ci-dessus.

---

## 16. Blocages externes et points ouverts

**Blocages externes (BLOCKED_EXTERNAL_ACCESS)**

1. **Compte Cloudflare / authentification** — aucune session `wrangler` : ni
   déploiement, ni création de ressource, ni vérification `--remote`.
2. **Hyperdrive de production** — ressource inexistante ; l'ID doit être créé
   puis reporté (aucune valeur inventée).
3. **Bucket R2 de production** — ressource inexistante
   (`lelabeur-documents-production`).
4. **Base PostgreSQL managée** — aucune instance, aucune chaîne de connexion.
5. **`GOOGLE_CLIENT_ID` de production** — audience réelle non fournie : la
   frontière d'authentification resterait fermée (401/501).
6. **Secrets d'exploitation** — `DOCUMENT_URL_SIGNING_SECRET` (et l'éventuel
   repli `POSTGRES_CONNECTION_STRING`) non provisionnés.
7. **Présignature R2** — impossible sans identifiants S3 + implémentation V4 :
   reste fermée.
8. **Smoke tests HTTP de production** — aucune URL déployée.

**Points ouverts (décisions d'exploitation ou de conception)**

1. Cadence de cron définitive (la valeur actuelle est une cadence technique).
2. `PAYMENT_PRE_DUE_LEAD_TIME_MS` et `CLAIM_EVIDENCE_DEADLINE_MS` : durées à
   valider par l'exploitant (aucun défaut installé).
3. Absence de profil **staging**.
4. **Aucun rate limiting** : à traiter avant une exposition publique large.
5. Aucune `jurisdiction`/région Cloudflare déclarée (APDP, §12).
6. Durées de conservation documentaires encore `PENDING_LEGAL_VALIDATION`.
7. `pg_advisory_xact_lock` (identité) et verrous consultatifs : comportement à
   travers un Hyperdrive **déployé** non vérifiable ici (confirmé en local).
8. RBAC SQL partiel : la migration 0002 ne seed que le rôle `ADMIN` (déjà
   documenté en P0-C, non traité ici).
9. Push/Email : abstraction sans provider — l'infrastructure réelle reste à
   décider.

---

## 17. Règles juridiques de déploiement (rappel)

Cette tranche déploie de l'**infrastructure technique**. Elle ne constitue
**pas** une autorisation de lancement public et ne lève aucun blocage documenté :
qualification placement / DGT, modèle financier, moteur de qualification, APDP,
transferts hors CEDEAO, PSP, preuve électronique, fiscalité, validation par
avocat. **Le produit n'est pas juridiquement validé du fait que le Worker est
déployé.**

---

## 18. Fichiers de cette tranche

| Fichier | Nature |
|---|---|
| `src/backend/worker/productionGuard.ts` (+ tests) | invariants de production (fermeture franche) |
| `src/backend/worker/productionResources.ts` | inventaire des ressources + lecture de `wrangler.toml` |
| `src/backend/api/readiness.ts` (+ tests) | contrat `/readyz` et rapporteur (observations réelles) |
| `src/backend/api/worker.ts`, `identityWorker.ts`, `entry.ts` | service de `/readyz`, composition du rapporteur |
| `src/backend/persistence/migrationRunner.ts` | verrou consultatif de migration |
| `wrangler.toml` | profils dev/production : Cron, R2, cadence, décisions documentées |
| `scripts/deploy-production-preflight.ts` | contrôle avant déploiement (aucun réseau par défaut) |
| `scripts/smoke-cloudflare-production.ts` | smoke tests de production (lecture seule) |
| `scripts/verify-workerd-local.ts`, `verify-postgres-e2e.ts` | preuves locales (Cron réel, `/readyz`, migrations concurrentes) |

Ce qui reste **délibérément non fait** : WEBRTC, load tests, design final, audit
final, lancement public.
