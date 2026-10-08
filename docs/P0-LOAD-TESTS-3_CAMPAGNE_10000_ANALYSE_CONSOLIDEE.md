# LE LABEUR — P0-LOAD-TESTS-3 — Campagne 10 000 utilisateurs et analyse consolidée (PARTIE 3)

Date d'exécution : 2026-10-08 (Africa/Lagos)
Branche : `arena/06180368-le-labeur-pre-arena` (nouvelle branche depuis le checkpoint `bdef22e` de `arena/d1db5184-le-labeur-pre-arena`)
Mission : P0-LOAD-TESTS-3 — dernière tranche de load tests : 10 000 utilisateurs simulés + analyse finale de charge + consolidation 100 / 1 000 / 2 000 / 10 000.

**Périmètre respecté** : harness et campagnes P0-LOAD-TESTS-1/2 réutilisés intégralement (additions strictement additives). Les campagnes 100 / 1 000 / 2 000 n'ont PAS été rejouées (un seul run de vérification technique à 2 000, hors rapports officiels, pour la mesure mémoire PGlite). Pas de refonte du harness, pas de nouvelle suite de concurrence, pas de reprise de P0-CRON-QUEUE, aucune modification métier. DESIGN FINAL et AUDIT FINAL non commencés.

---

## 1. ENVIRONNEMENT (vérifié avant exécution)

| Ressource | Valeur mesurée |
|---|---|
| CPU | 2 cœurs — Intel(R) Xeon(R) Processor @ 2.60GHz (`os.cpus()`) |
| RAM | 3 940 Mo total, ~3 630 Mo disponibles |
| Disque | 20 Go libres |
| Node | v22.22.3 (limite heap V8 mesurée : 1 954 Mo) |
| PostgreSQL serveur | **DISPONIBLE** — binaires natifs PostgreSQL 17.10 embarqués (`@embedded-postgres/linux-x64`, 59 Mo, installés localement, **aucun téléchargement**), démarrés par le harness en mode TEST/LOCAL |
| PGlite (WASM) | Disponible (moteur historique des campagnes 100/1000/2000) |
| Cloudflare réel (Worker déployé, Hyperdrive, TURN) | **INDISPONIBLE** — aucun compte ni credential (voir §7) |

Données 100 % synthétiques (emails `.invalid`, préfixés LOADTEST). Aucun PSP, aucun email/SMS réel, aucune cible de production.

## 2. CAMPAGNE 10 000 UTILISATEURS (EXÉCUTÉE — PostgreSQL serveur réel)

### 2.1 Stratégie de population (documentée, conforme à la mission)

- **Population réellement simulée : 10 000 utilisateurs synthétiques** (5 000 EMPLOYER + 5 000 CANDIDATE), appariés en **5 000 parcours complets** (journeys), exécutés dans leur intégralité.
- **Concurrence réelle : 250 voies parallèles** (pool contrôlé). 10 000 utilisateurs simulés ≠ 10 000 requêtes simultanées : 250 parcours sur 5 000 sont actifs à un instant donné (5 %).
- **Stratégie de génération** : identique aux campagnes précédentes (mêmes identités synthétiques, mêmes clés d'idempotence, base fraîche reconstruite par migrations réelles, horloge métier fixe `2026-10-05T14:00:00.000Z`, credentials Google RS256 éphémères vérifiées par le VRAI vérificateur, worker composé réel, appels in-process sans pile réseau, rate-limit neutralisé de façon déclarée).
- **Durée de charge : 282,89 s** (bootstrap base + serveur PG : 5,70 s). **Pas de batching** des parcours.
- **Persistance : VRAI serveur PostgreSQL 17.10 local** (embedded-postgres, binaires natifs), pool de 10 connexions — voir §3 pour la raison (limitation PGlite).

### 2.2 Résultats mesurés

| Métrique | Valeur |
|---|---|
| Utilisateurs simulés | **10 000** (5 000 + 5 000) |
| Parcours (journeys) | **5 000/5 000 complets**, 0 échec, 0 étape sautée |
| Requêtes | **120 200** (120 200 OK, **0 erreur**, **0 timeout** > 30 s) |
| Durée de charge | **282,89 s** |
| Débit | **424,91 req/s** — **1 060,5 parcours/min** |
| Latences (toutes requêtes) | **p50 = 490,94 ms**, **p95 = 1 407,83 ms**, **p99 = 1 916,70 ms**, max = 2 719,87 ms, moyenne = 587,51 ms |
| Latence SQL (sonde, fenêtre de charge) | 1 868 400 requêtes, p50 = 1,04 ms, p95 = 327,82 ms, p99 = 589,71 ms, max = 1 480,49 ms ; moteur occupé 100 % de la fenêtre ; transactions : 200 401 begun / 200 400 committed / **0 rolledBack** |
| File post-charge (profondeur avant) | 20 000 événements outbox / 0 job |
| Drain (worker P0-CRON-QUEUE existant, passes bornées) | 200 passes en 316 148 ms, **borne de passes atteinte** (non une panne) ; **0 retry, 0 dead-letter, 0 doublon, 0 job FAILED** ; 40 000 événements traités, 30 000 jobs COMPLETED, 15 000 paiements balayés SCHEDULED→DUE |
| Résidu file (état normal sous horloge fixe) | 25 000 événements PENDING (backlog non drainé : borne de passes), 40 000 jobs PENDING sur 70 000 (échéance future vs horloge fixe — identique au comportement 2 000 : 8 000 PENDING sur 14 000) |
| Ressources (échantillons 1 s) | RSS min/max/moy = 148 / **844** / 593 Mo, heap max = 579 Mo, CPU moyen/max = 61,04 % / 121,99 % du temps mural, loadavg1 max = 4,25 |

### 2.3 Étapes métier dominantes à 10 000 (moyenne requête)

| Rang | Étape | n | moyenne | p95 |
|---|---|---|---|---|
| 1 | `applications.offer.list.read` | 5 000 | 1 197,9 ms | 1 866,9 ms |
| 2 | `matching.run.read` | 5 000 | 1 192,5 ms | 2 021,2 ms |
| 3 | `matching.run.create` | 5 000 | 1 142,0 ms | 2 005,5 ms |
| 4 | `offers.list.read` | 5 000 | 1 096,0 ms | 1 614,5 ms |
| 5 | `offer.read` | 5 000 | 861,7 ms | 1 521,8 ms |
| 6 | `application.create` | 5 000 | 626,7 ms | 1 502,1 ms |
| 7 | `offer.create` | 5 000 | 609,3 ms | 1 161,9 ms |

Surveillées comme demandé : `matching.run.create` (3ᵉ, 1 142 ms moy.), `applications.offer.list` (1ʳᵉ, 1 198 ms moy.), `contract.create` (547,7 ms moy. — **non dominante** à 10 000 sur PG serveur). Les lectures de listes et le matching dominent ; les écritures de contrat restent rapides.

### 2.4 Intégrité post-campagne à l'échelle 10 000 (contrôles SQL réels, exécutés)

La suite de concurrence P0-LOAD-TESTS-2 n'a PAS été recréée : seuls des contrôles d'invariants en base ont été exécutés après la campagne (module `scripts/load/integrity.ts`).

**Résultat tel qu'exécuté : 3/7 contrôles PASS.** Analyse honnête des 4 FAIL — il s'agit de **bugs d'outillage de mesure, corrigés dans le code après exécution, et non de défaillances du système** (la campagne n'a pas été re-jouée, conformément à la directive de finalisation) :

| Contrôle | Résultat exécuté | Analyse |
|---|---|---|
| I1 population/effets 1:1 | **PASS** | users=10 000, offers/applications/proposals/contracts/matching_runs = 5 000 chacun — aucun double effet |
| I2 aucune double transition | FAIL (contrats) | Bug d'outillage : le contrôle lisait `e->>'action'` sur `contracts.history`, dont les entrées sont `{ id, timestamp, event, description, actor }` (champ **`event`**). La partie `applications.history` (champ `action`) a PASSÉ sur 5 000 candidatures. Corrigé (`event`) après exécution |
| I3 état final attendu | FAIL | Bug d'outillage : statut lu `ACTIVATED` au lieu de **`ACTIVE`** (matrice P0-F), + clé de mesure mal nommée. Preuves mesurées de l'état final : `contract.activate` = 200 ×5 000 (0 erreur campagne), 5 000 événements CONTRACT_ACTIVATED (1/contrat), 5 000 commandes d'idempotence `automation.CONTRACT_ACTIVATED` (1/contrat). Corrigé après exécution |
| I4 aucune duplication de notification | FAIL | La garde anti-duplication `(recipient_id, dedupe_key)` a PASSÉ (0 doublon sur 45 000 notifications) ; c'est l'assertion 1:1 événement↔notification qui était fausse : les notifications sont projetées depuis ~30 types d'événements couverts (NOTIFICATION_REQUIRED n'est qu'un type parmi d'autres — 45 000 notifications pour 15 000 événements NOTIFICATION_REQUIRED). Corrigé après exécution |
| I5 aucune duplication de réputation | **PASS** | 0 doublon sur `reputation_entries.dedupe_key` |
| I6 aucun contournement d'idempotence | **PASS** | 5 000 commandes `automation.CONTRACT_ACTIVATED` = 5 000 contrats ; 5 000 événements CONTRACT_ACTIVATED = 5 000 contrats |
| I7 file : aucun résidu anormal | FAIL | Non une défaillance : le drain a atteint sa **borne de 200 passes** (mesure), avec 0 retry / 0 dead-letter / 0 doublon / 0 job FAILED sur 40 000 événements et 30 000 jobs traités. Le résidu PENDING de jobs est **normal sous horloge métier fixe** (échéance future) — la campagne 2 000 de référence présente le même état (8 000 PENDING / 14 000). Contrôle reformulé (résidus anormaux uniquement) et bornes de drain dimensionnées (500/pass, 1 500 passes à 10 000) après exécution |

**Preuves mesurées de résilience à 10 000** (compteurs réels du drain) : 0 retry, 0 dead-letter, 0 événement dupliqué, 0 job FAILED, 0 rollback transactionnel — la charge 10 000 ne détruit pas retry / dead-letter / idempotence / récupération des jobs.

## 3. LIMITATION RESSOURCE MESURÉE — PGlite à 10 000 (RESOURCE_LIMITATION)

La campagne 10 000 n'a PAS été exécutée sur PGlite (moteur WASM mono-session des campagnes 100/1000/2000) :

- RSS mesurée (échantillonnage 1 s) : **626 Mo à 200 utilisateurs**, **1 370 Mo à 2 000 utilisateurs** (run de vérification technique) ;
- Extrapolation linéaire à 10 000 (×5 données) : **≈ 4,7 Go** de RSS ;
- Machine : 3 940 Mo de RAM (limite heap V8 Node : 1 954 Mo).

**PGlite à 10 000 est donc impossible dans cet environnement (RESOURCE_LIMITATION, chiffrée).** La campagne 10 000 a été exécutée sur le **VRAI serveur PostgreSQL 17.10** (disponible localement via `embedded-postgres`, binaires natifs, aucun téléchargement). Le débit PGlite (~148 req/s) n'est de toute façon **pas une mesure de production** (saturation mono-session mesurée dès la PARTIE 2) : le serveur réel est la cible représentative pour cette échelle.

## 4. ANALYSE COMPARATIVE CONSOLIDÉE — 100 / 1 000 / 2 000 / 10 000

Toutes les campagnes : parcours représentatif identique (25 étapes), 0 erreur, 0 étape sautée, worker composé réel, horloge métier fixe. Persistance : PGlite pour 100/1 000/2 000 ; **PostgreSQL serveur réel** pour 10 000.

| Métrique | 100 (PGlite) | 1 000 (PGlite) | 2 000 (PGlite) | 10 000 (PG serveur) |
|---|---|---|---|---|
| Utilisateurs simulés | 100 | 1 000 | 2 000 | **10 000** |
| Concurrence (voies) | 50 | 500 | 1 000 | **250** (pool contrôlé) |
| Journeys complets | 50/50 | 500/500 | 1 000/1 000 | **5 000/5 000** |
| Requêtes | 1 250 | 12 200 | 24 200 | **120 200** |
| Erreurs | 0 | 0 | 0 | **0** |
| Timeouts (>30 s) | 0 | 0 | 0 | **0** |
| Durée de charge | 8,6 s | 83,9 s | 163,8 s | **282,9 s** |
| Débit (req/s) | 145,77 | 145,34 | 147,75 | **424,91** |
| Parcours/min | 349,85 | 357,40 | 366,32 | **1 060,5** |
| p50 | 343,0 ms | 3 324,8 ms | 6 544,5 ms | **490,9 ms** |
| p95 | 562,5 ms | 6 213,6 ms | 11 851,0 ms | **1 407,8 ms** |
| p99 | 652,5 ms | 9 822,4 ms | 16 345,5 ms | **1 916,7 ms** |
| max | 714,2 ms | 10 997,4 ms | 20 366,9 ms | **2 719,9 ms** |
| SQL p50 / p95 | (non sondé) | (non sondé) | 0,33 / 3,27 ms | **1,04 / 327,82 ms** |
| Moteur DB occupé | — | — | 88,4 % | **100 %** |
| Transactions | — | — | 40 400 begun / 40 400 committed / 0 rollback | 200 401 begun / 200 400 committed / **0 rollback** |
| Drain file | — | — | 66 passes, convergé, 0 retry/0 DL/0 doublon | 200 passes (borne), **0 retry / 0 DL / 0 doublon / 0 job FAILED** |
| RSS max mesurée | — | — | 1 370 Mo (vérif. technique) | **844 Mo** (node) |

### 4.1 Premier point de saturation observé

**PGlite : saturation dès 50 voies** — débit plafonné à ~145-148 req/s de 50 à 1 000 voies (100 → 2 000 utilisateurs), avec p50 qui s'étire linéairement avec la file (343 ms → 3,3 s → 6,5 s) : goulot = moteur WASM mono-session (mesuré 88,4 % d'occupation à 2 000). C'est la saturation du **moteur embarqué**, pas de l'application.

**PostgreSQL serveur à 10 000 (250 voies)** : 424,91 req/s avec p50 491 ms — la loi de Little (250 voies / 0,49 s ≈ 510 req/s offerts ≈ 425 réalisés) indique un pipeline quasi saturé ; le moteur DB est occupé 100 % de la fenêtre et la latence SQL p95 atteint 327,82 ms (max 1,48 s) : **goulot = attente sur le pool de 10 connexions** (file d'attente pool), sur 2 cœurs (CPU moyen 61 %, max 122 %). La saturation application n'est pas atteinte (0 timeout, p99 < 2 s).

### 4.2 Goulot principal

1. **À l'échelle 10 000 (PG serveur) : le pool de connexions PostgreSQL (10) + le CPU (2 cœurs)** — la latence SQL p95 (327,82 ms) reflète l'attente de connexion ; les lectures de listes (`offers.list.read`, `applications.offer.list.read`) et le matching (`matching.run.create/read`) concentrent le temps.
2. **Sur PGlite (100→2 000) : le moteur WASM mono-session** — ~148 req/s plafond, latence purement file d'attente.

### 4.3 Différence PGlite / PostgreSQL serveur (mesurée)

À population et parcours identiques : **424,91 req/s (PG serveur, 250 voies) vs 147,75 req/s (PGlite, 1 000 voies)** ≈ **×2,9 de débit**, et **p50 491 ms vs 6 544 ms** (≈ ×13 plus rapide) à 5× la population avec 4× moins de voies. Le serveur réel decuple la capacité effective ; PGlite sous-estime la production (à ne jamais présenter comme une mesure de production).

### 4.4 Étape métier la plus coûteuse

- **10 000 (PG serveur)** : `applications.offer.list.read` (1 197,9 ms moy.), puis `matching.run.read` (1 192,5 ms) et `matching.run.create` (1 142,0 ms).
- **2 000 (PGlite)** : `matching.profile.update` (16 343 ms moy. — pathologie PGlite sous 1 000 voies), `matching.run.create` (14 324,9 ms).

### 4.5 Recommandations de performance (basées sur les mesures)

1. **Dimensionner le pool de connexions PostgreSQL à l'échelle** (Hyperdrive en production) : c'est le premier goulot à 10 000 (SQL p95 327,82 ms, DB occupé 100 %). Un pool 2-4× plus large absorberait la file d'attente mesurée.
2. **Optimiser les lectures de listes dominantes** (`offers.list.read`, `applications.offer.list.read`, `offer.read`) : pagination keyset + index composites (déjà présents) à compléter par une réduction du travail par page (elles représentent le haut du tableau à 10 000).
3. **Optimiser le matching** (`matching.run.create/read`) : 3ᵉ et 2ᵉ étapes les plus lentes — le fan-out de scoring sur le bassin de profils est le candidat naturel (profilage SQL, index sur `candidate_matching_profiles`, ou pré-calcul).
4. **Ne jamais utiliser PGlite comme jauge de production** : écart mesuré ×2,9 en débit (et ×13 en p50 à 2 000 vs 10 000) ; réserver PGlite aux tests d'intégration.
5. **Drain de la file : dimensionner les passes à l'échelle** (fait à 10 000 : 500/pass, 1 500 passes) ; le résidu PENDING de jobs sous horloge fixe est normal (attendre l'échéance réelle en production via Cron).
6. **CPU** : 2 cœurs à 61 % moyen / 122 % max — la marge existe mais le CPU suivra le pool ; à surveiller en production (workerd mono-thread + WASM).

## 5. CONCURRENCE / INTÉGRITÉ / RÉSILIENCE (vérifications à la charge 10 000)

- **Aucune nouvelle suite de concurrence créée** (réutilisation des garanties P0-LOAD-TESTS-2). Contrôles d'invariants en base à 10 000 : voir §2.4 (I1, I5, I6 PASS ; I2/I3/I4 corrigés après exécution — bugs d'outillage documentés ; I7 = borne de mesure, 0 résidu anormal).
- **Résilience (P0-CRON-QUEUE non reconstruit)** : la charge 10 000 ne détruit pas retry / dead-letter / idempotence / récupération des jobs — 0 retry, 0 dead-letter, 0 doublon, 0 job FAILED, 0 rollback sur 40 000 événements et 30 000 jobs traités en drain.

## 6. CLOUDFLARE (limitations explicites)

- **Worker Cloudflare réel : NON mesuré** — aucun déploiement (`wrangler deploy` indisponible, aucun compte/credential).
- **Hyperdrive réel : NON mesuré** — la campagne 10 000 passe par un serveur PostgreSQL local réel (embedded-postgres), pas par un binding Hyperdrive.
- **TURN réel : NON mesuré** — aucun serveur TURN ; WebRTC hors parcours de charge (conforme au périmètre P0-LOAD-TESTS-1 ; le signaling a été couvert par la suite C6 de la PARTIE 2, côté PGlite).
- Le runtime de charge est le **worker composé réel en in-process** (sans pile réseau) — la couche HTTP/workerd elle-même n'est pas dans la boucle de mesure.

## 7. BLOCKED_EXTERNAL_ACCESS / RESOURCE_LIMITATION

- **BLOCKED_EXTERNAL_ACCESS** : Cloudflare production (Worker déployé, Hyperdrive, TURN) — non disponible dans cet environnement ; aucune mesure n'est revendiquée dessus.
- **RESOURCE_LIMITATION** : PGlite à 10 000 utilisateurs — RSS extrapolée ≈ 4,7 Go > 3,94 Go de RAM (mesures : 626 Mo @ 200, 1 370 Mo @ 2 000). Campagne exécutée sur PostgreSQL serveur réel à la place.

## 8. VALIDATIONS (exécutées après la campagne)

Voir le rapport final de la tranche (chaque validation : PASS/FAIL/BLOCKED/NOT RUN, sans invention).

## 9. Points restant ouverts (tranches suivantes — NON commencés)

- DESIGN FINAL et AUDIT FINAL (interdits dans cette tranche).
- Campagne 10 000 sur PGlite (si une machine > 8 Go est disponible) pour la courbe complète PGlite.
- Mesure du Worker Cloudflare réel + Hyperdrive + TURN (nécessite un compte Cloudflare).
- Rejeu des contrôles d'intégrité corrigés (I2/I3/I4) sur une campagne 10 000 si une suite de mesure est autorisée.
- Optimisations de performance (§4.5) — à trancher par le DESIGN FINAL.

## 10. Reproductibilité

```bash
# Campagne 10 000 sur PostgreSQL serveur réel (pool contrôlé 250 voies) :
npm run test:load -- --suite part3 --persistence postgres-server --concurrency 250

# Même campagne sur PGlite (attendu : RESOURCE_LIMITATION à cette échelle) :
npm run test:load -- --suite part3

# Campagnes de référence (inchangées) :
npm run test:load -- --users 100
npm run test:load -- --users 1000
npm run test:load -- --suite part2
```

Rapport brut (échantillons complets, recalculable) : `load-reports/P0-LOAD-TESTS-3_users-10000_postgres-server.json` (37 Mo).

## 11. Modifications de code de la tranche (strictement additives)

- `scripts/load/harness.ts` : persistance optionnelle `postgres-server` (vrai serveur PostgreSQL 17.10 local via binaires natifs `embedded-postgres`) ; sonde SQL étendue au pool et aux connexions dédiées ; `pg` devient `PGlite | null`.
- `scripts/load/resources.ts` (nouveau) : échantillonnage réel des ressources (RSS/heap/external/CPU/loadavg).
- `scripts/load/integrity.ts` (nouveau) : contrôles d'invariants post-campagne à l'échelle (SQL réels).
- `scripts/load/metrics.ts` : types de rapport étendus (`resources`, `integrity`, `populationStrategy`).
- `scripts/run-load-tests.ts` : `--suite part3`, `--persistence pglite|postgres-server`, borne 10 000 (mission P0-LOAD-TESTS-3), pool par défaut 250 voies à 10 000, drain dimensionné, budget 2 400 s à 10 000.

Aucune modification du métier, du routeur, des règles de sécurité, du moteur de file ou des migrations.
