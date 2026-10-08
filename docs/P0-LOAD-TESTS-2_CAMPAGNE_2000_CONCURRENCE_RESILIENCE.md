# LE LABEUR — P0-LOAD-TESTS-2 — Campagne 2 000, concurrence métier et résilience (PARTIE 2)

Date : 2026-10-08
Branche de départ : `arena/9c003413-le-labeur-pre-arena` (commit `43f9cee8a1ca032361fd5dc2dadd354c2e33036b`)
Périmètre : PARTIE 2 UNIQUEMENT — campagne **2 000 utilisateurs**, concurrence métier
sous charge, résilience (retry, timeout, crash, backlog, orphan recovery, dead-letter,
double Cron/Worker, idempotence sous charge).
Hors périmètre : campagne 10 000 (P0-LOAD-TESTS-3, REFUSÉE par le CLI), design.
Aucune métrique inventée : chaque chiffre ci-dessous provient des exécutions réelles du
2026-10-08 et est recalculable depuis les échantillons bruts des rapports JSON.

---

## RÉUTILISATION DU FRAMEWORK P0-LOAD-TESTS-1 (rien de recréé)

Le framework de la PARTIE 1 est réutilisé tel quel ; seules des additions
strictement additives ont été faites :

| Fichier PARTIE 1 | Statut | Additions PARTIE 2 |
|---|---|---|
| `scripts/load/harness.ts` | Réutilisé | exposition `database` + `automationWorker` (composés par le MÊME `composeWorker`), `composePeerAutomationWorker()` (second worker sur la même base, même discipline que `freshAutomationWorker` de cronQueue.test.ts), horloge métier **mutable** (`clock` — les campagnes ne l'avancent jamais, déterminisme PARTIE 1 inchangé), sonde de latence SQL (`dbProbe`) |
| `scripts/load/scenarios.ts` | Réutilisé | exports additionnels (`executeStep`, `jsonPost`, `jsonPatch`, `asId`, `sessionTokenFrom`, types `StepResult`/`StepMeta`) — aucune logique modifiée |
| `scripts/load/runner.ts` | Réutilisé | option `pairs` (sous-ensemble de parcours pour la charge de fond de la suite concurrence) — défaut : tous les parcours, comportement PARTIE 1 inchangé |
| `scripts/load/metrics.ts` | Réutilisé | types/agrégats additionnels : `DbLatencyStats` (nearest-rank + union d'intervalles), `QueueDrainReport`, `SuiteReport` ; champs OPTIONNELS `dbLatency`/`queue` dans `CampaignReport` (conventions PARTIE 1 préservées) |
| `scripts/run-load-tests.ts` | Réutilisé | borne du CLI étendue de 1 000 → **2 000** (uniquement) ; `--suite campaign|concurrency|resilience|part2` ; `--drain-budget-ms`. `--users 10000` reste REFUSÉ ; 1001..1999 refusés (seule 2 000 est dans la tranche) |

Nouveaux modules (composent le framework existant, aucun moteur recréé) :

```
scripts/load/chains.ts        Chaînes métier réelles via la VRAIE API (étapes mesurées
                              par executeStep) + lectures SQL ciblées + provisioning ADMIN
scripts/load/queue.ts         Photographie de la file (SQL) + drain borné MESURÉ par
                              passes du worker P0-CRON-QUEUE EXISTANT (runScheduledCycle)
scripts/load/concurrency.ts   Suite concurrence métier sous charge (C1..C8 + invariants)
scripts/load/resilience.ts    Suite résilience (R1..R8) — fault-injection reprise de
                              cronQueue.test.ts, AUCUN nouveau moteur de résilience
```

Rapports produits (mêmes conventions JSON que la PARTIE 1, échantillons bruts inclus) :

```
load-reports/P0-LOAD-TESTS-2_users-2000.json      (7,5 Mo — 24 200 échantillons)
load-reports/P0-LOAD-TESTS-2_concurrency.json     (10/10 contrôles PASS)
load-reports/P0-LOAD-TESTS-2_resilience.json      (8/8 contrôles PASS)
```

---

## CAMPAGNE 2 000 UTILISATEURS (EXÉCUTÉE)

Commande : `npm run test:load -- --users 2000`
Rapport : `load-reports/P0-LOAD-TESTS-2_users-2000.json` (24 200 échantillons bruts)

| Métrique | Valeur mesurée |
|---|---|
| Statut | ✅ RÉUSSIE — 0 erreur, 0 timeout, 0 rollback |
| Utilisateurs simulés | 2 000 (1 000 EMPLOYER + 1 000 CANDIDATE) — 100 % synthétiques |
| Parcours | 1 000/1 000 complets, 0 en échec, 0 étape sautée |
| Concurrence | 1 000 voies parallèles |
| Requêtes | 24 200 exécutées — 24 200 OK |
| Durée de charge | 163,79 s (bootstrap base : 3,27 s) |
| Throughput | 147,75 req/s — 366,32 parcours/min |
| p50 / p95 / p99 | 6 544,5 / 11 851,0 / 16 345,5 ms (max 20 366,9 ms, moyenne 6 716,7 ms) |
| Timeouts (> 30 s) | 0 |
| Retries (file) | 0 |
| Dead-letter (file) | 0 |
| File post-charge | 4 000 événements PENDING / 0 jobs avant drain → 66 passes en 127 770 ms, **convergence** (passe vide) : 13 000 événements traités, 0 doublon, 6 000 jobs échus COMPLETED, 3 000 paiements basculés SCHEDULED→DUE ; restent 8 000 jobs FUTURS PENDING (M3..M6 + J3 futurs, jamais échus) |
| DB (moteur embarqué) | 376 400 requêtes SQL mesurées : p50 0,33 ms, p95 3,27 ms, p99 7,60 ms, max 58,67 ms ; 40 400 transactions BEGIN/COMMIT, 0 ROLLBACK |
| Saturation | **Oui, mesurée** : le moteur SQL est occupé 144 796 ms sur la fenêtre de charge de 163 791 ms = **88,4 %** ; le débit reste plafonné (~148 req/s) quel que soit le niveau de concurrence (50 → 500 → 1 000 voies : 145,77 → 145,34 → 147,75 req/s, PARTIE 1 + PARTIE 2) — goulot : moteur PostgreSQL WASM mono-session (PGlite), pas l'applicatif |

Étape dominante (constat PARTIE 1 confirmé à 2 000) : `matching.run.create`
(p95 = 19 883 ms) — chaque run classe le bassin complet de 200 profils.

Volume de données réel produit : 2 000 utilisateurs + sessions SQL, 1 000 offres,
1 000 qualifications, 200 profils de matching, 1 000 runs, 1 000 candidatures,
1 000 propositions ACCEPTÉES, 1 000 contrats ACTIFS, puis au drain :
13 000 événements d'Outbox traités et 14 000 jobs (6 000 COMPLETED + 8 000
futurs PENDING, jamais échus) — chiffres directs du rapport. Structure par
contrat vérifiée en SQL dans la suite résilience (R5) : échéancier de 6 mois,
7 échéances (6 salaires + 1 commission), 14 jobs, 7 paiements — soit à
l'échelle 1 000 contrats : 7 000 échéances et 7 000 paiements projetés,
dont 3 000 basculés SCHEDULED→DUE au drain. Aucune erreur d'intégrité.

---

## CONCURRENCE MÉTIER SOUS CHARGE (EXÉCUTÉE)

Commande : `npm run test:load -- --suite concurrency`
Échelle : 218 utilisateurs synthétiques — 40 paires en **charge de fond** (parcours
représentatifs P0-LOAD-TESTS-1 via `runCampaign` : 1 000 requêtes, 1 000 OK,
0 erreur, p50 292,6 ms / p95 477,7 ms / p99 541,6 ms) pendant que 69 paires exécutent
les courses à travers la VRAIE API. 10/10 contrôles PASS.

| Course | Résultat mesuré |
|---|---|
| C1a double EXAMEN simultané (10 paires) | 20/20 requêtes 200, état final REVIEW, UNE seule transition, historique 2 entrées — idempotence conservée |
| C1b SHORTLIST vs REJET simultanés (10 paires) | aucun 5xx ; le domaine AUTORISE la séquence SHORTLISTED→REJECTED (matrice P0-E4) : les 2 actions se sont légalement appliquées dans l'ordre ; CHAQUE action appliquée AU PLUS une fois (0 double écriture), 1 événement par action réellement appliquée |
| C1c REJET vs REJET simultanés (10 paires, clés distinctes) | **exactement 1 gagnant (200) + 1 perdant (409)** sur les 10 courses ; REJECTED persisté une fois, une seule entrée d'historique, un seul événement APPLICATION_REJECTED |
| C2 ACCEPT/DECLINE simultanés (10 propositions) | exactement 1 réponse gagnante par proposition (10× 200 + 10× 409) ; état terminal légal ; UN SEUL événement terminal dans l'Outbox par proposition |
| C3 confirmations simultanées d'exécution (7 contrats, avancement M2 réel au préalable) | même clé CONCURRENT → UNE seule entrée EXECUTION_CONFIRMED (idempotence sous concurrence, cache d'idempotence in-process) ; deux parties simultanées (clés distinctes) → exactement 2 nouvelles entrées, une par commande, aucun doublon par acteur |
| C4 paiements simultanés (7 paiements M1 DUE) | 7× 201 + 7× 409 ; UNE seule tentative en base (`payment_declarations` = 1, `declaration_count` = 1) ; état PENDING_VERIFICATION cohérent |
| C5 remplacements simultanés (2 dossiers) | 1× 200 + 1× 409 par dossier ; UN seul dossier `replacements` par contrat source ; contrat REPLACED une fois ; un seul événement CLAIM_RESOLVED ; réputation documentée 1× par règle (1–2 entrées), AUCUNE double réputation |
| C6 WebRTC simultané (2 contrats + 1 expiration) | créations concurrentes → 1× 201 + 1× 422, UNE seule session persistée ; rejeu OFFER concurrent même clé → MÊME messageId, UNE seule OFFER en base ; fermetures concurrentes → 200/200, CLOSED une fois, credentials révoqués ; expiration à l'échéance exacte → EXPIRED échoue fermé, purge par la maintenance bornée (3 purgées) ; 3 invitations = 3 notifications (aucune double) |
| C7 deux Crons simultanés SOUS CHARGE | événement CONTRACT_ACTIVATED traité UNE fois (attempts = 1), échéancier unique de 6, UNE réserve d'idempotence ; les DEUX ticks tracés (CRON_TICK_EXECUTED ×2) ; 82 événements dus traités une seule fois au total, 0 doublon |
| C8 deux workers simultanés SOUS CHARGE | job réarmé claimé UNE seule fois entre les deux workers ; aucun second effet (NOTIFICATION_REQUIRED inchangé) |
| Invariants transverses | 30 événements de décision = 30 notifications ; 10 événements de proposition = 10 notifications (clé `(recipientId, dedupeKey)` unique) — AUCUNE double notification |

Vérifications en base (SQL réel, jamais déduit des seuls statuts HTTP) : une seule
transition gagnante sur les courses exclusives ; aucune double écriture métier ;
aucune double notification ; aucune double réputation ; aucun double remplacement ;
idempotence conservée (rejeu stable, mêmes identifiants).

---

## RÉSILIENCE (EXÉCUTÉE — moteur P0-CRON-QUEUE réutilisé, aucun nouveau moteur)

Commande : `npm run test:load -- --suite resilience`
Échelle contrôlée : 30 utilisateurs synthétiques par contrôle, 12 chaînes de backlog.
8/8 contrôles PASS.

| Vérification | Résultat mesuré |
|---|---|
| R1 retry | échec réel (contrat supprimé) → événement `RETRYABLE`, attempts=1, `last_error` consignée, disponible à +30 s ; contrat restauré + horloge avancée de 31 s → `PROCESSED` en 2 tentatives, échéancier complet projeté (convergence) |
| R2 timeout | borne d'orphanisation de 10 min vérifiée : un claim FRAIS n'est JAMAIS confondu avec un orphelin (recoverStaleClaims = 0) ; la borne reste > au statement_timeout déclaré (15 s). **Constat mesuré et documenté : PGlite (WASM) n'applique PAS `statement_timeout`** (SET statement_timeout=200 puis pg_sleep(1) s'exécute jusqu'au bout ~3,3 s) — en production le timeout est appliqué par le serveur PostgreSQL (BLOCKED_EXTERNAL_ACCESS). Le timeout de requête de campagne reste déclaratif (30 s) : 0 dépassement mesuré à 2 000 utilisateurs |
| R3 dead-letter | à la borne de 5 tentatives → `DEAD_LETTER` avec raison conservée ; jamais re-claimée après avance d'horloge (terminal stable) |
| R4 crash worker | événement PROCESSING orphelin (crash après réservation) → récupéré 1×, re-joué jusqu'à PROCESSED, effet métier UNIQUE (7 échéances, 14 jobs, 1 réserve d'idempotence) ; job RUNNING orphelin (ack perdu) → récupéré, re-COMPLETED, AUCUN second effet (Outbox inchangée) ; job orphelin à la borne → FAILED terminal tracé |
| R5 backlog | 12 chaînes non drainées = 48 événements en file → convergence en 5 passes / 1 486,58 ms (156 événements, 72 jobs, 104,94 événements/s, 48,43 jobs/s) ; effets métier EXACTEMENT une fois par contrat (échéancier 6, échéances 7, jobs 14, paiements 7) ; aucun job échu non traité ; seuls les jobs FUTURS restent PENDING |
| R6 rejeu idempotent | 2 jobs J3 réarmés et rejoués → 0 second effet métier (événements, échéances ESCALATED et paiements strictement inchangés) |
| R7 deux workers simultanés | le même job est claimé UNE seule fois entre les deux workers (claim verrouillé FOR UPDATE SKIP LOCKED), rejeu idempotent |
| R8 deux Crons simultanés | 4 événements de la chaîne traités UNE seule fois au total, échéancier unique, UNE réserve d'idempotence, les DEUX ticks tracés (observabilité) |

---

## WEBRTC

- **Statut : testé réellement** (suite C6 + P0-WEBRTC existant 15/15 dans `npm test`) :
  sessions (création concurrente arbitrée, une seule session live par contrat),
  signaling (offre/réponse/ICE, ordre strict, rejeu idempotent, réception filtrée),
  expiration (échoue fermé à l'échéance exacte, purge par maintenance bornée),
  fermeture (idempotente, credentials révoqués, payloads SDP/ICE redacted),
  concurrence (créations/join/signaling/fermetures simultanés sous charge).
- **Limites (honnêtes)** : REST-polling uniquement ; AUCUN test TURN/média réel —
  la configuration ICE/TURN de production n'est pas configurée (l'API répond
  `NOT_CONFIGURED`, vérifié) ; pas de Durable Object, pas de socket.

## CLOUDFLARE

- **Statut : accès production réel indisponible** (identique aux tranches
  précédentes) — aucune mesure de production Cloudflare n'est prétendue.
- Couvert localement : `verify:workerd` 18/18 PASS (workerd LOCAL + PostgreSQL
  local via Hyperdrive simulé), `verify:postgres` 28/28 PASS (PostgreSQL réel
  embedded-postgres).
- Éléments bloqués (BLOCKED_EXTERNAL_ACCESS) : mesure de charge sur Worker
  Cloudflare déployé, Hyperdrive production, Cron Trigger production,
  statement_timeout côté serveur PostgreSQL managé.

---

## VALIDATIONS (toutes exécutées après la campagne)

```
npm test                 1626/1626 PASS; 0 FAIL
npm run verify:postgres  28/28 PASS
npm run verify:workerd   18/18 PASS
npx tsc --noEmit         PASS
git diff --check         PASS
```

## Problèmes détectés et corrections effectuées pendant la tranche

1. **Assertion initiale R5 erronée** (paiements/contrat) : la mesure réelle a
   révélé 7 paiements par contrat de 6 mois (6 SALARY + 1 PLATFORM_FEE) —
   assertion corrigée d'après la mesure, pas l'inverse.
2. **Hypothèse initiale C1b erronée** : le domaine AUTORISE explicitement
   SHORTLISTED→REJECTED (matrice P0-E4, `rejectApplication: ['PENDING','REVIEW','SHORTLISTED']`) ;
   les assertions ont été réalignées sur la vérité du domaine et une course
   EXCLUSIVE (rejet vs rejet) a été ajoutée pour prouver « une seule transition
   gagnante » (10/10 gagnant/perdant).
3. **C3 — protection M1** : la confirmation d'exécution exige un incident en M1 ;
   le parcours réel (drain + `advance-month` M1→M2) a été ajouté. L'idempotence de
   la confirmation est PAR COMMANDE (clé d'idempotence) : prouvé sous concurrence
   (même clé → 1 écriture ; commandes distinctes → 1 écriture chacune).
4. **Bug de mesure de la charge de fond** (C-suite) : les statistiques de la charge
   de fond restaient à 0 (échantillons de `runCampaign` non capturés) — corrigé,
   mesures réelles publiées (1 000 requêtes, 0 erreur).
5. **statement_timeout non appliqué par PGlite WASM** : constat mesuré, documenté
   dans le rapport de résilience (aucun contournement fictif).

## Points restant ouverts (tranches suivantes, NON commencés)

- P0-LOAD-TESTS-3 (10 000 utilisateurs) : REFUSÉ par le CLI dans cette tranche ;
  nécessitera PostgreSQL serveur (le moteur WASM plafonne à ~148 req/s et 88,4 %
  d'occupation mesurée à 2 000 utilisateurs) et/ou multi-processus.
- `matching.run.create` reste l'étape dominante à l'échelle (p95 19,9 s à 2 000).
- Sémantique de concurrence du moteur embarqué : PGlite = session PostgreSQL
  unique (transactions concurrentes fusionnées dans la même session) — la
  production (pool de connexions derrière Hyperdrive) a une sémantique
  d'isolation plus stricte ; les invariants exclusifs sont tous vérifiés, mais
  les latences/débits absolus ne sont pas transférables (déjà documenté PARTIE 1).
- Mesures sur Worker Cloudflare déployé (BLOCKED_EXTERNAL_ACCESS).

## Reproductibilité

```bash
npm install --legacy-peer-deps   # conflit de peers préexistant (@vitejs/plugin-react vs vite 8)
npm test                         # 1626/1626 PASS
npm run verify:postgres          # 28/28 PASS
npm run verify:workerd           # 18/18 PASS
npx tsc --noEmit                 # PASS
npm run test:load -- --users 2000          # campagne 2 000 (mission P0-LOAD-TESTS-2)
npm run test:load -- --suite concurrency   # suite concurrence métier sous charge
npm run test:load -- --suite resilience    # suite résilience (P0-CRON-QUEUE réutilisé)
```
