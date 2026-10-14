# LE LABEUR — P0-CLOUDFLARE-PRODUCTION

**Tranche :** connexion de l'infrastructure Cloudflare DÉJÀ préparée (P0-C → P0-CRON-QUEUE → P0-R2)
vers l'environnement de production prévu par le projet.
**Date :** 2026-10-07 · **Base :** `arena/6553cd7f-le-labeur-pre-arena` @ `824f366`

> Ce document décrit ce qui est **branché**, ce qui est **préparé**, et ce qui reste
> **bloqué faute d'accès externe**. Aucune valeur d'infrastructure n'est inventée :
> les identifiants absents apparaissent comme `<MARQUEUR>` à fournir par l'exploitant.

---

## 1. Chaîne technique visée (et son état réel)

```text
Cloudflare Worker (src/backend/worker/cloudflareEntry.ts)
  ├── fetch()      : API /api/v1 → composition → PostgreSQL, R2, domaines métier
  └── scheduled()  : Cron Trigger (P0-CRON-QUEUE) — SEUL point d'entrée périodique
        │
        ├── recoverStaleClaims()   récupération des claims orphelins (crash avant ack)
        ├── drainEvents()          queue EXISTANTE : automation_outbox
        ├── runDuePayments()       balayage SCHEDULED → DUE (échéance atteinte)
        ├── runDueJobs()           jobs échus : rappels, J+3, escalades
        └── audit durable          CRON_TICK_EXECUTED (acteur SYSTEM)
              │
              ├── PostgreSQL via Hyperdrive   (transactions, idempotence durable)
              ├── R2 via le port ObjectStorage (binaires documentaires, hash SHA-256)
              └── Outbox → notifications In-App / audit / documents
```

| Élément | État | Preuve / limite |
|---|---|---|
| Entrée Worker (`fetch` + `scheduled`) | **RÉEL, non déployé** | bundle production construit par `wrangler deploy --dry-run` (voir §7) |
| Cron Trigger de production | **BRANCHÉ dans la configuration** | `[env.production.triggers] crons = ["*/5 * * * *"]` ; installation réelle = au déploiement |
| Handler `scheduled()` → worker existant | **RÉEL, vérifié sous workerd** | `npm run verify:workerd` : `GET /__scheduled` → outbox → échéancier → audit, sans double effet |
| Queue = Outbox PostgreSQL transactionnelle | **RÉEL** | `automation_outbox` : claim verrouillé, tentatives, `available_at`, `DEAD_LETTER`, récupération des orphelins |
| Cloudflare Queues | **VOLONTAIREMENT NON ACTIVÉE** | décision d'architecture (§5) ; aucun binding, aucun handler `queue()` |
| PostgreSQL / Hyperdrive | **PRÉPARÉ, bloqué** | aucun Hyperdrive réel : le profil production n'active aucun binding → `/healthz` 503 `misconfigured` |
| Migrations (0001 → 0017) | **RÉELLES, non appliquées en production** | appliquées sur PostgreSQL local (TEST/LOCAL) ; production = `MIGRATION_DATABASE_URL=… npm run migrate` |
| R2 (bucket documentaire) | **BRANCHÉ en local, bloqué en production** | binding `DOCUMENTS_BUCKET` servi par le simulateur `wrangler dev` ; bucket réel = à créer |
| Notifications Push/Email | **NOT_CONFIGURED** | abstractions de code : aucun fournisseur, aucun secret, `NOT_AVAILABLE` observé |
| Notifications In-App | **RÉEL** | table `notifications` (migration 0012), consommée par le worker existant |
| Audit | **RÉEL** | `automation_audit_ledger` : `CRON_TICK_EXECUTED`, `CRON_TICK_FAILED`, actions métier |
| Compte Cloudflare / déploiement | **BLOCKED_EXTERNAL_ACCESS** | `npx wrangler whoami` → « You are not authenticated » |
| WebRTC / signaling, Load tests, design final, audit final | **HORS TRANCHE** | non commencés, volontairement |

---

## 2. Configuration de production (`wrangler.toml`)

| Clé | Valeur | Rôle |
|---|---|---|
| `main` | `src/backend/worker/cloudflareEntry.ts` | entrée réelle (inchangée) |
| `compatibility_flags` | `["nodejs_compat"]` | requis par `pg` (`node:net`, `node:tls`) |
| `compatibility_date` | `2026-10-05` | ≥ 2024-09-23 (contrainte node-postgres) |
| `[env.production] name` | `lelabeur-api` | même Worker que le profil de développement |
| `[env.production.vars]` | `PERSISTENCE`, `DB_POOL_MAX`, `DB_STATEMENT_TIMEOUT_MS`, `DB_APPLICATION_NAME`, `SESSION_TTL_SECONDS`, `COOKIE_SECURE`, `WORKER_ENV=production`, `GOOGLE_CLIENT_ID` | **redéclarées** : Wrangler n'hérite ni les `vars` ni les bindings |
| `[env.production.triggers]` | `crons = ["*/5 * * * *"]` | **actif** — voir §4 |
| `[[env.production.hyperdrive]]` | *(absent — à activer)* | binding `HYPERDRIVE`, id `<ID_HYPERDRIVE_PRODUCTION>` |
| `[[env.production.r2_buckets]]` | *(absent — à activer)* | binding `DOCUMENTS_BUCKET`, bucket `<R2_BUCKET_NAME_PRODUCTION>` |
| `[[env.production.queues.*]]` | *(absent — décision §5)* | aucune Cloudflare Queue |
| Durable Objects / KV | *(absent)* | signaling WebRTC : tranche ultérieure séparée |

**Profil de développement** (non déployé en production) : binding Hyperdrive de développement
(id = placeholder explicite `00000000-…`) + binding R2 `DOCUMENTS_BUCKET` →
`lelabeur-documents-local-simulator`, servi par le **simulateur local** de `wrangler dev`.
`wrangler deploy` (sans `--env`) échouerait faute de bucket réel : c'est **voulu**,
la seule porte de déploiement est `--env production`.

### Secrets et variables — inventaire nominatif (AUCUNE valeur dans Git)

| Nom | Type | Portée | Fourni par | Où le poser |
|---|---|---|---|---|
| `POSTGRES_CONNECTION_STRING` | **secret** | repli si aucun binding Hyperdrive | exploitant (hébergeur PostgreSQL) | `npx wrangler secret put POSTGRES_CONNECTION_STRING --env production` |
| `GOOGLE_CLIENT_ID` | var **publique** | audience OAuth attendue par le Worker | Google Cloud Console | `[env.production.vars]` (ou secret, au choix de l'équipe) |
| `DOCUMENT_URL_SIGNING_SECRET` | **secret** | signature HMAC des URL de téléchargement contrôlées | exploitant (≥ 32 caractères aléatoires) | `npx wrangler secret put DOCUMENT_URL_SIGNING_SECRET --env production` |
| `PAYMENT_PRE_DUE_LEAD_TIME_MS` | var | avance du rappel pré-échéance | décision d'exploitation (aucune valeur par défaut) | `[env.production.vars]` (absent = aucun job armé) |
| `CLAIM_EVIDENCE_DEADLINE_MS` | var | délai de preuve Claim | décision d'exploitation | `[env.production.vars]` (absent = aucune échéance implicite) |
| `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` | **secret local** | `wrangler dev` uniquement | développeur | `.dev.vars` (gitignoré) |
| `TEST_ONLY_GOOGLE_JWKS_URL` | var de test | **boucle locale uniquement** | développeur | jamais en production (vérifié par le préflight) |
| `MIGRATION_DATABASE_URL` | **secret d'exploitation** | exécution des migrations | exploitant | variable d'environnement du poste d'exploitation, jamais committée |

> Aucun secret n'est présent dans le dépôt : `wrangler.toml` ne contient que des valeurs
> publiques, `.dev.vars*` est gitignoré (`!.dev.vars.example` reste versionné), et
> `npm test` + `npm run verify:cloudflare` échouent si une valeur ressemblant à un secret
> apparaît dans une ligne active.

---

## 3. Procédure d'activation (à exécuter quand les ressources existent)

```bash
# 0. Porte de déploiement : refuse tant qu'une ressource de production manque
npm run preflight:cloudflare          # attendu : PORTE DE DÉPLOIEMENT FERMÉE (aujourd'hui)

# 1. Hyperdrive réel (cache DÉSACTIVÉ : les lectures d'identité/session exigent un état frais)
npx wrangler hyperdrive create lelabeur-prod \
  --connection-string="postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require" \
  --caching-disabled=true
#    → reporter l'ID retourné dans [[env.production.hyperdrive]] (bloc documenté dans wrangler.toml)

# 2. Migrations sur la base réelle (jamais depuis une valeur committée)
MIGRATION_DATABASE_URL="postgresql://…" npm run migrate -- --status   # attendu : 0017 pending/applied
MIGRATION_DATABASE_URL="postgresql://…" npm run migrate

# 3. Bucket documentaire + binding R2 (le nom réel remplace <R2_BUCKET_NAME_PRODUCTION>)
npx wrangler r2 bucket create <R2_BUCKET_NAME_PRODUCTION>

# 4. Secrets (jamais dans Git, jamais dans un message)
npx wrangler secret put POSTGRES_CONNECTION_STRING --env production     # repli optionnel
npx wrangler secret put DOCUMENT_URL_SIGNING_SECRET --env production    # si URL signées voulues

# 5. Audience Google publique de production
#    → renseigner GOOGLE_CLIENT_ID dans [env.production.vars]

# 6. Re-vérification PUIS déploiement (deploy:worker appelle le préflight en mode porte)
npm run verify:cloudflare
npm run deploy:worker          # = préflight --require-production && wrangler deploy --env production

# 7. Contrôles post-déploiement (aucun paiement, aucun transfert)
curl -sS https://<worker>/healthz | head -c 400      # status ok, migrations applied
npx wrangler deployments list --name lelabeur-api
npx wrangler tail --env production                    # attendu toutes les 5 min : cron_tick_executed
```

---

## 4. Cron Trigger — ce qui est branché, et ce que ça fait

* **Un seul ordonnanceur** : `[env.production.triggers] crons = ["*/5 * * * *"]` appelle le handler
  `scheduled()` déjà existant. Aucun `setInterval`, aucun `setTimeout`, aucune seconde file,
  aucune logique métier dans le trigger : il appelle `runScheduledCycle` du worker existant.
* **Cadence** : un tick toutes les **5 minutes** — valeur d'**exploitation** (aucune règle métier
  n'en dépend), bornant la latence d'une échéance atteinte à 5 minutes. La modifier dans
  `wrangler.toml` ne change aucun comportement métier. Granularité minimale Cloudflare : 1 minute.
* **Bornes** : chaque tick traite au plus **25 messages par étape** (`SCHEDULED_DRAIN_LIMIT`, code) :
  ~300 messages/heure au maximum.
* **Inerte sans base** : sans binding Hyperdrive, `scheduled()` se termine sur un no-op **tracé**
  (`cron_tick_skipped`) — aucune erreur, aucune écriture partielle, aucun succès simulé.
* **Idempotence** : un double déclenchement n'a jamais de double effet (vérifié sous workerd :
  échéancier, échéances, rappels et outbox restent stables après un second tick).
* **Observabilité** : une ligne structurée **par tick** (compteurs uniquement, jamais un identifiant
  métier, un payload ni un secret) :

```json
{"source":"automation:P0-CRON-QUEUE","event":"cron_tick_executed","cron":"*/5 * * * *","handler":"scheduled",
 "durationMs":101,"eventsClaimed":4,"eventsCompleted":4,"eventsRetried":0,"eventsDeadLettered":0,
 "paymentsApplied":6,"jobsClaimed":6,"jobsCompleted":6,"jobsRetried":0,"jobsFailed":0,"staleRecovered":0}
```

  Autres événements : `cron_tick_skipped` (aucune cible de persistance), `cron_tick_unavailable`
  (client non constructible), `cron_tick_failed` (échec — le détail reste dans l'audit durable
  `CRON_TICK_FAILED`, jamais dans le log).
* **Test local** : `npm run dev:worker:scheduled` puis `GET /__scheduled?cron=*+*+*+*+*`
  (`--test-scheduled`). Ce drapeau est **local** : le préflight échoue s'il apparaît dans la
  porte de déploiement, et `/__scheduled` n'existe pas en production.

---

## 5. QUEUE — décision d'architecture (explicite, réversible, testée)

**La file canonique du projet est l'Outbox PostgreSQL transactionnelle**
(`automation_outbox` + `automation_jobs`), déjà dotée de tout ce qu'une file doit garantir :

| Garantie | Où elle vit |
|---|---|
| Écriture **atomique** avec la mutation métier | même transaction PostgreSQL que le domaine |
| Réservation exclusive | `FOR UPDATE SKIP LOCKED` (deux workers → messages différents) |
| Tentatives bornées | `attempts`, `DEFAULT_MAX_ATTEMPTS = 5` |
| Rejeu différé | `RETRYABLE` + `available_at`, `DEFAULT_RETRY_DELAY_MS = 30 s` |
| Lettre morte | `DEAD_LETTER` (+ `FAILED` pour les jobs) |
| Récupération après crash | `recoverStaleClaims()` (claims `PROCESSING`/`RUNNING` orphelins, borne 10 min) |
| Idempotence durable | `automation_idempotency` + index d'unicité |

**Aucune Cloudflare Queue n'est activée** et l'entrée Worker n'exporte **aucun handler `queue()`** :
ajouter une seconde file sans producteur transactionnel créerait un double écrit (base + Queue)
donc un risque de divergence, sans gain de latence réel. Un test encode cette décision
(`src/backend/worker/cloudflareConfig.test.ts`) et la configuration documente les conditions
minimales d'une activation future (clés d'idempotence conservées, consumer qui appelle uniquement
le worker existant, `max_retries` + `dead_letter_queue` déclarés, test d'idempotence mis à jour).

**Statut :** `NOT_CONFIGURED` — aucune ressource à créer, élément **volontairement non implémenté**
(il ne bloque pas la porte de déploiement).

---

## 6. R2 — documents et preuves

* **Binding** : `DOCUMENTS_BUCKET`, lu par la composition
  (`env.DOCUMENTS_BUCKET` → `createR2BucketObjectStorage`) — le port `ObjectStorage` est **inchangé**.
* **Abstraction préservée** : hash SHA-256, versionnement append-only, liens version ↔ entité,
  rétention et contrôle d'accès restent dans le service documentaire (`documents/documentRepository.ts`).
* **Aucune clé exposée** : `object_key` n'apparaît jamais dans une réponse d'API ; l'adaptateur R2
  refuse explicitement la présignature directe (`501 NOT_IMPLEMENTED`) — le téléchargement passe par
  l'API authentifiée. Vérifié sous workerd : l'objet est réellement stocké, l'empreinte est
  recalculée, le contenu revient identique, et une recherche de la clé dans les réponses ne trouve rien.
* **Fail-closed** : sans bucket, le domaine DOCUMENTS reste fermé (`501`) — aucun stockage implicite.
* **Activation production** : `npx wrangler r2 bucket create <R2_BUCKET_NAME_PRODUCTION>` puis
  décommenter `[[env.production.r2_buckets]]` avec le nom réel.

**Statut :** `PREPARED` (binding local vérifié sous workerd) + `BLOCKED_EXTERNAL_ACCESS` (bucket réel).

---

## 7. Vérifications et smoke checks

### 7.1 Contrôles locaux (aucun paiement, aucun transfert, aucune écriture métier)

| Commande | Objet | Résultat attendu |
|---|---|---|
| `npm test` | suites déterministes (dont configuration Cloudflare, entrée Worker, R2, cron) | 100 % PASS |
| `npm run verify:postgres` | Worker/API → PostgreSQL réel local | 100 % PASS |
| `npm run verify:workerd` | workerd + Hyperdrive local + **Cron `/__scheduled`** + **binding R2** | 100 % PASS |
| `npx tsc --noEmit` | typage complet | aucune erreur |
| `git diff --check` | espaces/erreurs de patch | aucune sortie |
| `npm run verify:cloudflare` | préflight : décisions d'architecture, secrets, fail-closed | `PASS` + `BLOCKED` explicites, exit 0 |
| `npm run preflight:cloudflare` | **porte de déploiement** | exit ≠ 0 tant qu'une ressource manque |
| `wrangler deploy --dry-run --env production` | le bundle de production se construit | `Total Upload` affiché (exécuté par le préflight) |

### 7.2 Sondes distantes (read-only)

| Commande | Objet | Résultat dans cette session |
|---|---|---|
| `npx wrangler whoami` | authentification | **BLOCKED_EXTERNAL_ACCESS** — « You are not authenticated » |
| `npx wrangler hyperdrive list` | Hyperdrive réel | non exécutable (non authentifié) |
| `npx wrangler r2 bucket list` | bucket documentaire | non exécutable (non authentifié) |
| `curl https://<worker>/healthz` | Worker déployé | **NOT_DEPLOYED** — aucune URL de production n'est inventée |

### 7.3 Observabilité — points de contrôle par domaine

| Domaine | Contrôle | Où |
|---|---|---|
| Worker | `fetch` + `scheduled` exportés, bundle production construit | préflight : « Worker » |
| DB | `/healthz` sonde `SELECT 1`, cible sûre, migrations `applied`/`pending` | préflight + `verify:postgres` |
| R2 | domaine fermé sans bucket / ouvert avec bucket, `object_key` jamais exposé | préflight + `verify:workerd` |
| Queue | colonnes de file, claim verrouillé, retry, `DEAD_LETTER`, orphelins | préflight + `cronQueue.test.ts` |
| Cron | trigger déclaré, cadence valide, no-op sans base, tick audité | préflight + `verify:workerd` (`/__scheduled`) |
| Automation | `runScheduledCycle` appelé par le Cron, actions idempotentes | `verify:workerd` + `cronQueue.test.ts` |
| Notifications | In-App persistée ; Push/Email `NOT_AVAILABLE` (aucun faux envoi) | préflight + `verify:workerd` |
| Documents | routes authentifiées (owner/ADMIN), aucune route publique | préflight |
| Audit | `CRON_TICK_EXECUTED` / `CRON_TICK_FAILED` dans le ledger existant | préflight + `verify:workerd` |

---

## 8. Sécurité

* **Secrets hors Git** : aucune chaîne de connexion, aucun jeton, aucune clé dans le dépôt ;
  `wrangler.toml` ne contient que des valeurs publiques ; `.dev.vars*` gitignoré.
* **Aucune route de debug/test/drain** : le catalogue de routes ne contient ni `debug`, ni `drain`,
  ni `internal`, ni `__scheduled` ; `/__scheduled` est un endpoint **local** de `wrangler dev`.
* **Same-origin** : aucun en-tête CORS n'est émis (aucun `Access-Control-Allow-*`) ; le navigateur
  reste sur l'origine de l'API. Aucun `VITE_*` ne porte de valeur serveur.
* **RBAC / IDOR** : inchangés et toujours vérifiés (ownership, permissions ADMIN, anti-IDOR des
  documents, refus d'un tiers) ; le Cron n'ouvre aucune route.
* **Accès R2** : jamais direct, jamais par clé d'objet ; présignature directe explicitement `501`.
* **Accès DB** : uniquement via le binding Hyperdrive ou le secret de repli ; aucune connexion
  tentée au démarrage ; erreurs expurgées (`redactSqlSecrets`), `/healthz` sans secret.
* **Logs** : le tick ne journalise que des compteurs ; aucun payload métier, aucune preuve.
* **Marché/Modèle de paiement** : inchangé (prix prestataire + frais SaaS = coût client ;
  25 % en M1) ; **aucun escrow, wallet, transfert interne ni paiement réel** — le préflight échoue
  si l'un de ces motifs apparaît dans le cycle paiements.

---

## 9. Cadre juridique — rappel explicite

Le déploiement technique **ne vaut pas** validation juridique. Ce document ne déclare ni conformité
juridique ni agrément. Les bloqueurs documentés **restent ouverts** : qualification du placement,
moteur de qualification, APDP, transferts, PSP, fiscalité, validation par avocat.

---

## 10. Hors tranche (volontairement non commencé)

WebRTC / signaling (Durable Object), Load tests, Design final, Audit final. Aucun de ces chantiers
n'est ouvert ici.
