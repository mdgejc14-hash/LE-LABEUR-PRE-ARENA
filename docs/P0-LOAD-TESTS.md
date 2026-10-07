# P0-LOAD-TESTS — tranche de charge réelle et reproductible

Cette tranche ajoute **une campagne de charge exécutable**, pas un cadre
d'abstraction : le même Worker de production, la même base PostgreSQL, le même
Cron/Queue, mesurés par des requêtes HTTP réelles.

```bash
npm run loadtest                                   # 100 → 1000 → 2000 → 10000
npm run loadtest:smoke                             # 5 utilisateurs, vérification rapide
npm run loadtest -- --levels 100,1000 --concurrency 64 --budget-seconds 900
```

Le rapport est écrit **à chaque niveau terminé** (résilience aux campagnes
longues) :

- `reports/loadtests/loadtests-report.json` — toutes les mesures brutes ;
- `reports/loadtests/LOAD_TESTS_REPORT.md` — rapport lisible.

## 1. Ce qui est réellement mesuré

```
client HTTP (TCP réel, node:http)
  → serveur HTTP local (127.0.0.1, port éphémère)
    → composition.worker.fetch  (LA fonction de production, composeWorker)
      → pool `pg` instrumenté (latence SQL + attente de connexion)
        → PostgreSQL 17.10 RÉEL (binaire embarqué, moteur identique à verify:postgres)
```

Chaque utilisateur virtuel est un couple **EMPLOYER + CANDIDATE** réellement
authentifié par un credential Google signé (clé RSA éphémère, JWKS servi en
boucle locale) puis par une session PostgreSQL. Aucun acteur n'est injecté dans
les handlers : l'identité est dérivée côté serveur, comme en production.

### Parcours exercé (≈ 47 requêtes HTTP par utilisateur)

| Étape | Routes réellement appelées |
|---|---|
| auth / session | `POST /auth/google/credential` (×2), `GET /auth/session`, `GET /me` |
| offres | `POST /offers`, `GET /offers`, `GET /offers/:id` |
| qualification | `PATCH /my/matching-profile`, `POST /offers/:id/qualification`, `GET /offers/:id/qualification-summary` |
| matching | `POST /offers/:id/matching-runs` |
| candidatures | `POST /offers/:id/applications`, `GET /offers/:id/applications` |
| décisions | `POST /applications/:id/examine`, `POST /applications/:id/shortlist` |
| propositions | `POST /conversations/:id/proposals`, `POST /proposals/:id/respond` |
| contrats | `POST /contracts`, `send`, `sign`, `activate`, `GET /contracts/:id` |
| Cron / Queue | `automationWorker.runScheduledCycle()` (passée bornée du `scheduled()`) |
| WebRTC | `POST /webrtc-sessions`, `join`, `credentials` (×2), `signaling` (OFFER/ANSWER), `GET signaling`, `ice-configuration`, `close` |
| documents | `POST /documents/upload-grants`, dépôt du binaire, `verify` (SHA-256), `GET /my/documents` |
| notifications | `GET /my/notifications`, `POST /notifications/:id/read` |
| réputation | `GET /my/reputation`, `POST /my/reputation/reconcile` |
| paiements | `GET /contracts/:id/payments`, `GET /my/payments`, `POST /contracts/:id/end`, `POST .../payments/close-mission`, `POST /payments/salary-declarations`, `POST /payments/commission-declarations` |
| litiges | `POST /claims`, `GET /my/claims`, `GET /admin/claims` |

Le **remplacement** ne peut pas cohabiter avec le cycle de paiement sur le même
contrat (la décision `REPLACE` exige un contrat encore `ACTIVE`, alors que le
cycle de paiement exige une mission terminée). Il dispose donc de son propre
scénario, exécuté sur un échantillon borné (`--replacement-sample`) :
incident contractuel → revue ADMIN → décision `REPLACE` → offre de remplacement.

## 2. Mesures produites

Pour chaque niveau réellement exécuté :

- **concurrence** (voies simultanées) et **durée** murale ;
- **requests/sec** réels (`requêtes / durée`) ;
- **p50 / p95 / p99** en *nearest-rank* sur les latences réellement observées —
  aucune interpolation, aucun histogramme approché ;
- **taux d'erreur**, **timeouts**, **retries** (comptés, jamais estimés) ;
- **DB** : nombre de requêtes, latence SQL p50/p95/p99, attente de connexion du
  pool, erreurs SQL ;
- **file** : `automation_outbox` par statut, `automation_jobs`, dead-letter,
  clés d'idempotence, ticks Cron tracés ;
- **saturation** : CPU (user/sys), retard de la boucle d'événements
  (`monitorEventLoopDelay`), RSS/heap crêtes, `loadavg`, RAM libre, connexions
  PostgreSQL / `max_connections`, **deadlocks du moteur**
  (`pg_stat_database.deadlocks`) et verrous non accordés au relevé.

## 3. Concurrence métier : doubles appels, aucun double effet

À chaque niveau, un échantillon d'utilisateurs exécute **deux appels simultanés
avec la même clé d'idempotence** sur les opérations sensibles :

| Double appel | Invariant vérifié en base |
|---|---|
| candidature | une seule ligne `applications` |
| décision (`examine`, `shortlist`) | une seule transition par action (historique borné) |
| signature (confirmation) | un seul drapeau posé, statut unique |
| Cron + workers | un seul événement `CONTRACT_ACTIVATED`, un seul échéancier, zéro double paiement |
| WebRTC signaling | un seul message persisté |
| paiement (déclaration) | une seule tentative `payment_declarations` |

## 4. Résilience

- **timeout** : salve de requêtes avec timeout client de 1 ms → interruptions
  réellement observées, puis vérification que le serveur répond encore ;
- **retry** : tentatives réellement exécutées et comptées ;
- **crash/reprise** : claims `PROCESSING` orphelins (crash après réservation,
  avant ack) → récupération bornée par `recoverStaleClaims` ;
- **dead-letter** : message dont le traitement échoue durablement → isolé après
  la borne de tentatives, jamais rejoué en boucle ;
- **backlog** : vidage de la file réellement produite par la charge, par passes
  bornées, avec débit mesuré (messages/s) ;
- **idempotence** : clés durables réellement mémorisées.

## 5. Limites de cette session (jamais comblées par une estimation)

- `RESOURCE_LIMITATION` — hôte de test unique (2 vCPU, mémoire limitée) :
  PostgreSQL local + serveur HTTP local, aucune mise à l'échelle horizontale.
- `BLOCKED_EXTERNAL_ACCESS` — Hyperdrive, workerd déployé, R2 réel et TURN réel
  sont indisponibles. **Aucun chiffre Cloudflare n'est produit ni extrapolé.**
- Le stockage objet du domaine DOCUMENTS est un adaptateur mémoire injecté (le
  domaine est fail-closed sans stockage) : la mesure porte sur le chemin
  applicatif + PostgreSQL, pas sur R2.
- WebRTC : session, signaling, concurrence et expiration sont mesurés ; la
  configuration ICE/TURN reste `NOT_CONFIGURED` (aucun TURN réel disponible).
- Les IP clientes (`x-forwarded-for`) sont simulées : c'est l'en-tête que le
  bord transmet en production, et il conditionne les seaux du limiteur de débit
  non authentifiés. Sans lui, tous les utilisateurs virtuels partageraient un
  seul seau `auth` (60 req/min) et la mesure porterait sur le limiteur, pas sur
  la plateforme.
