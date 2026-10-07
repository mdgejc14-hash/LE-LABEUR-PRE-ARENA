# RAPPORT FINAL — P0-LOAD-TESTS

**Projet :** LE LABEUR — PRE-ARENA
**Tranche :** P0-LOAD-TESTS (charge réelle, reproductible, mesurée)
**Date d'exécution de la campagne :** 2026-10-07 (campagne complète, un seul processus)
**Rapport brut de campagne :** `reports/loadtests/LOAD_TESTS_REPORT.md` (lisible) et
`reports/loadtests/loadtests-report.json` (mesures brutes, réécrit à chaque niveau terminé)

---

## 1. Ce qui a été construit et exécuté

Aucun cadre d'abstraction : la campagne réutilise le harnais et la composition de
production du dépôt.

```
client HTTP réel (node:http, TCP)
  → serveur HTTP local (port éphémère)
    → composeWorker(...) — LA fonction de composition de production
      → pool `pg` instrumenté (latence SQL + attente de connexion)
        → PostgreSQL 17.10 RÉEL (moteur embarqué, identique à `verify:postgres`)
```

- **Commandes** : `npm run loadtest` (campagne complète), `npm run loadtest:smoke`
  (vérification rapide), options `--levels`, `--concurrency`, `--budget-seconds`,
  `--replacement-sample`, `--concurrency-sample`, `--pool`, `--out`.
- **Parcours exercé** (≈ 47 requêtes HTTP par utilisateur) : auth/session → offres →
  qualification → matching → candidatures → décisions → propositions → contrats →
  **Cron/Queue** (`runScheduledCycle`, la même passée bornée que le `scheduled()` réel) →
  **WebRTC** (session, join, credentials, signaling OFFER/ANSWER, poll, ICE, close) →
  documents (grant, dépôt, vérification SHA-256) → notifications → réputation →
  paiements (échéancier, fin de mission, constat d'échéance, déclarations salaire et
  commission) → litiges → **remplacement** (scénario dédié : incident → revue ADMIN →
  décision `REPLACE` → offre de remplacement).
- **Identités** : chaque utilisateur virtuel est un couple EMPLOYER + CANDIDATE
  réellement authentifié (credential Google signé par une clé RSA éphémère, JWKS local)
  puis par une session persistée dans PostgreSQL. Aucun acteur n'est injecté.
- **Validations** : `npm test` (1 632 tests, dont 6 nouveaux sur les primitives de
  mesure), `npm run verify:postgres` (28/28), `npm run verify:workerd` (18/18),
  `npx tsc --noEmit`, `git diff --check`.

## 2. Résultats par niveau (tous mesurés, aucun extrapolé)

Concurrence 64 voies simultanées pour tous les niveaux (comparabilité), pool `pg` 40.

| Niveau | Parcours terminés | Durée | Requêtes HTTP | rps | p50 | p95 | p99 | max | Erreurs 5xx | Taux d'erreur | Timeouts | Retries |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **100** | 99/100 | 19,8 s | 4 715 | 238,2 | 145 ms | 282 ms | 597 ms | 1 651 ms | 1 | 0,02 % | 0 | 0 |
| **1 000** | 996/1 000 | 209,2 s | 47 907 | 229,0 | 154 ms | 301 ms | 459 ms | 4 420 ms | 4 | 0,01 % | 0 | 0 |
| **2 000** | 1 995/2 000 | 437,1 s | 95 629 | 218,8 | 161 ms | 309 ms | 468 ms | 3 540 ms | 5 | 0,01 % | 0 | 0 |
| **10 000** | **9 993/10 000** | 2 321,1 s (38,7 min) | **479 407** | 206,6 | 170 ms | 330 ms | 515 ms | 3 452 ms | 7 | **0,0015 %** | 0 | 0 |

**Total campagne : 627 658 requêtes HTTP réelles, 17 erreurs 5xx (toutes des deadlocks
PostgreSQL, voir §6), 0 timeout côté client, 0 retry silencieux.**

### Détail par niveau

| Niveau | Requêtes SQL | SQL p50/p95/p99 | Attente pool p95 | Pic connexions | Verrous en attente (pic) | Deadlocks | RSS crête | CPU (1 cœur) | Boucle d'év. p95/max |
|---|---|---|---|---|---|---|---|---|---|
| 100 | 122 160 | 3/13/36 ms | 45 ms | 40 | 29 | 4 | 222 Mo | 77,6 % | 16,3 / 36,1 ms |
| 1 000 | 1 616 931 | 4/14/34 ms | 43 ms | 41 | 35 | 37 | 345 Mo | 71,2 % | 15,7 / 45,7 ms |
| 2 000 | 4 528 021 | 4/14/35 ms | 46 ms | 41 | 36 | 30 | 564 Mo | 69,1 % | 16,0 / 84,2 ms |
| 10 000 | **18 998 725** | 4/16/37 ms | 50 ms | 41 | 38 | 67 | **1 465 Mo** | 67,2 % | 16,7 / 551,0 ms |

File/Queue en fin de chaque niveau (aucun dead-letter produit par la charge réelle) :

| Niveau | Outbox | Jobs | Clés d'idempotence | Entrées d'audit | Ticks Cron tracés |
|---|---|---|---|---|---|
| 100 | PENDING 24 / PROCESSED 3 547 | COMPLETED 1 470 | 3 664 | 5 421 | 150 |
| 1 000 | PENDING 24 / PROCESSED 27 495 | COMPLETED 15 568 | 33 443 | 51 318 | 1 200 |
| 2 000 | PENDING 24 / PROCESSED 72 564 | COMPLETED 42 882 | 91 007 | 140 902 | 3 250 |
| 10 000 | **PENDING 24 / PROCESSED 297 206** | COMPLETED 181 496 | 379 597 | 576 058 | 13 300 |

> Les 24 messages `PENDING` sont **constants** d'un niveau à l'autre : ce sont les
> événements sans consumer de notification (`CLAIM_RESOLVED`, etc.) — **la file ne
> croît pas avec la charge** (297 206 messages traités au niveau 10 000, aucune
> accumulation, zéro dead-letter produite par le trafic nominal).

### Remplacement (échantillon borné de 100 dossiers par niveau)

| Niveau | Dossiers complets | Durée | rps | p95 | Erreurs |
|---|---|---|---|---|---|
| 100 | 100/100 | 3,8 s | 418 | 230 ms | 0 |
| 1 000 | 100/100 | 4,5 s | 353 | 295 ms | 0 |
| 2 000 | 100/100 | 4,6 s | 346 | 261 ms | 0 |
| 10 000 | 100/100 | 5,6 s | 288 | 354 ms | 0 |

## 3. Concurrence métier — doubles appels, aucun double effet

À chaque niveau, 25 utilisateurs exécutent des **appels strictement simultanés**
(même clé d'idempotence) sur les opérations sensibles, et l'invariant est vérifié
**en base**, pas dans la réponse HTTP :

| Double appel | Invariant vérifié | Résultat |
|---|---|---|
| candidature | une seule ligne `applications` | OK sur les 4 niveaux |
| décision (`examine` + `shortlist`) | une seule transition par action (historique = 3) | OK |
| confirmation (double signature) | un seul drapeau posé, statut unique | OK |
| **Cron + 2 workers concurrents** | 1 seul événement `CONTRACT_ACTIVATED`, échéancier unique, 0 double paiement | OK |
| WebRTC signaling | un seul message persisté | OK |
| paiement (double déclaration) | 1 seule tentative `payment_declarations` | OK |

**600/600 vérifications de concurrence OK** (150 par niveau × 4), y compris au niveau
10 000 où l'attente bornée de matérialisation a été nécessaire (file partagée entre
workers concurrents) : la matérialisation réelle a été constatée avant chaque contrôle.

## 4. Résilience

| Test | Résultat mesuré |
|---|---|
| Timeout client (1 ms) sur requêtes valides | 40/40 requêtes réellement interrompues, serveur toujours opérationnel ensuite (200) |
| Retry (3 tentatives, timeout 1 ms) | 3 nouvelles tentatives réellement exécutées et **comptées**, statut final obtenu |
| Crash/reprise (claims `PROCESSING` orphelins) | 24 orphelins semés → 24 récupérés, 0 perdu |
| Dead-letter (échec durable, borne de tentatives atteinte) | message isolé en `DEAD_LETTER` après 6 tentatives, erreur conservée, **jamais rejoué en boucle** |
| Dead-letter (orphelin épuisé) | isolé par la récupération bornée |
| Backlog (file réellement produite) | vidage par passes bornées, 15 messages traités en 2 passes, `PENDING` inchangé (24) |
| Idempotence durable | 379 597 clés mémorisées, 106 630 traces d'audit des commandes de charge |

## 5. PostgreSQL

- **19 M de requêtes SQL** mesurées au niveau 10 000 ; latence p50 4 ms / p95 16 ms /
  p99 37 ms — la latence SQL **ne dérive pas** avec la taille de la base (p95 : 13 ms à
  100 utilisateurs → 16 ms à 10 000).
- **Saturation du pool visible** : 1 988 509 acquisitions de connexion, attente p50 24 ms /
  p95 50 ms / p99 67 ms, max 1 006 ms ; pic mesuré à 41 connexions (pool 40 +
  échantillonneur) sur un `max_connections` de 100.
- **Contention de verrous réelle** : jusqu'à **38 verrous non accordés simultanément**
  (relevés toutes les 500 ms), `loadavg(1)` jusqu'à 5,3 sur 2 vCPU.
- **138 deadlocks** sur l'ensemble de la campagne (détaillé §6).
- Transactions : aucune écriture partielle observée (`ROLLBACK` sur les 17 erreurs 5xx).

## 6. Problèmes détectés (aucun masqué)

1. **Deadlocks PostgreSQL sous forte concurrence (138 sur la campagne, tous mesurés
   par `pg_stat_database.deadlocks`).** Deux chemins sont concernés :
   - **le tick Cron** (`runScheduledCycle`) : 120 échecs de passée sur 13 320 passées
     (0,90 %), chaque échec correspondant à un deadlock ;
   - **`payments.close-mission`** : 17 réponses `500` sur 10 000 (0,17 %) — la même
     cause, l'erreur interne étant correctement **masquée** côté API
     (`INTERNAL_ERROR`, aucune fuite de détail moteur).
   Le comportement est *fail-closed* : transaction annulée, aucun état partiel, la
   récupération bornée / le prochain tick reprennent le travail. **Aucune perte de
   message** : `PENDING` reste à 24, `DEAD_LETTER` à 0 pour le trafic nominal.
2. **Latence des ticks Cron sous charge** : p50 4,0 s (100 u) → **6,0 s** (10 000 u),
   p99 9,3 s. Chaque passée traite jusqu'à 25 événements et 25 jobs ; la file étant
   partagée avec 64 voies de trafic nominal, les workers se sérialisent sur les mêmes
   lignes. C'est de la contention, pas une fuite : le débit global du parcours reste
   stable (~207–238 rps) et l'échéancier finit matérialisé (constaté par attente bornée).
3. **Plafond produit P0-MATCHING atteint : `MAX_MATCHING_CANDIDATES = 200`.**
   Au-delà de 200 profils candidats actifs dans le bassin, `POST /offers/:id/matching-runs`
   répond **409** et refuse tout classement partiel. Constaté et mesuré :
   0 refus à 100 utilisateurs, 904 à 1 000, 2 000 à 2 000, **10 000 à 10 000**
   (13 100 profils actifs). Comportement voulu (fail-closed, aucune donnée partielle,
   aucune affectation automatique), mais **c'est une limite de montée en charge du
   matching à connaître** : le classement privé n'est pas opérationnel à l'échelle du
   pays sans évolution du domaine.
4. **Routes non implémentées rencontrées puis contournées** (constat, pas régression
   de cette tranche) : `GET /employer/applications`, `GET /my/applications`,
   `GET /applications/:id` répondent `501 NOT_IMPLEMENTED` ; le parcours utilise donc
   les lectures réellement ouvertes (`GET /offers/:id/applications`, `GET /offers/:id`).
5. **Rappel de saturation** : à 10 000 utilisateurs, la boucle d'événements a culminé
   à **551 ms** et le RSS à 1,47 Go — l'hôte de test (2 vCPU, 3,9 Go) est la limite
   observée, pas la plateforme applicative.

## 7. Optimisations réalisées dans cette tranche

- **Mesure séparée des unités de travail** : le tick Cron a son propre collecteur ; il
  ne pollue plus les percentiles HTTP (défaut détecté et corrigé pendant la campagne).
- **IP cliente simulée par utilisateur (`x-forwarded-for`)** : sans elle, les 10 000
  utilisateurs virtuels partageaient le seau `auth` (60 req/min) depuis la boucle locale
  et la campagne mesurait le **limiteur de débit** (429 systématiques), pas la
  plateforme. L'en-tête est celui que le bord transmet en production.
- **Attente bornée de matérialisation** avant les invariants de concurrence : la file
  est partagée, un autre worker peut légitimement traiter l'événement du contrat testé ;
  le contrôle vérifie désormais l'état réellement atteint au lieu de supposer un ordre.
- **Retry borné et compté des ticks Cron** : un échec de tick est mesuré (et non plus
  propagé comme échec de parcours utilisateur), ce qui a permis de quantifier les
  deadlocks au lieu de les confondre avec des erreurs HTTP.
- **Rapport écrit après chaque niveau** : une campagne de 40 minutes ne peut plus
  perdre les niveaux déjà mesurés (défaut détecté lors d'une interruption d'essai).
- **Tolérance documentée du 409 P0-MATCHING** : le refus est compté comme *limite
  produit atteinte*, jamais converti en succès silencieux, et le reste du parcours est
  mesuré à pleine échelle.

## 8. Points restant ouverts

- **Retry des deadlocks** : `payments.close-mission` renvoie 500 sur deadlock ; aucun
  retry applicatif n'existe aujourd'hui (contrairement au tick Cron, qui est relancé par
  l'ordonnanceur). Un retry borné sur `40P01`/`40001` au niveau de la transaction est la
  correction naturelle — **non implémentée ici** (changement de comportement du noyau
  transactionnel, hors périmètre d'une tranche de charge).
- **Ordre de verrouillage** entre le balayage des échéances de paiement, la
  matérialisation des paiements et `close-mission` : à analyser pour supprimer la cause
  racine des deadlocks plutôt que de les retenter.
- **Latence du tick Cron** (p50 6 s sous charge) : vérifier la borne de passée
  (`limit 25`) en exploitation réelle, et si nécessaire l'index de réservation.
- **Plafond `MAX_MATCHING_CANDIDATES = 200`** : décision produit à prendre (pagination
  du bassin, pré-filtrage indexé) avant toute montée en charge au-delà de 200 candidats.
- **Débit d'écriture PostgreSQL** : 19 M de requêtes pour 479 k requêtes HTTP (~40
  requêtes SQL par requête HTTP) — la marge d'optimisation la plus forte est côté
  nombre d'allers-retours SQL, pas côté Node.

## 9. Limites de l'environnement (jamais comblées par une estimation)

**RESOURCE_LIMITATION** — hôte de test unique : 2 vCPU, 3 940 Mo de RAM,
PostgreSQL 17.10 **local** (binaire embarqué) et serveur HTTP local. Aucune mise à
l'échelle horizontale (plusieurs Workers, Hyperdrive, base managée). Le niveau 10 000 a
**réellement été exécuté** (38,7 min, 479 407 requêtes) ; la limite atteinte est celle de
l'hôte (boucle d'événements 551 ms de crête, RSS 1,47 Go), et elle est documentée comme
telle.

**BLOCKED_EXTERNAL_ACCESS** — Hyperdrive réel, workerd déployé, R2 réel, TURN réel et
toute ressource Cloudflare de production sont **indisponibles** dans cette session.
**Aucun chiffre Cloudflare n'est produit, extrapolé ni supposé.**
Conséquences explicites :

- le stockage objet du domaine DOCUMENTS est un **adaptateur mémoire injecté** (le
  domaine est fail-closed sans stockage) : la mesure couvre le chemin applicatif +
  PostgreSQL, **pas R2** ;
- WebRTC : session, participants réels du contrat, signaling REST, concurrence,
  expiration et fermeture sont mesurés ; la configuration ICE/TURN reste
  `NOT_CONFIGURED` (aucun serveur TURN réel disponible) — aucun test média réel n'est
  revendiqué ;
- la publication de fichiers (URL signée) reste `501` sans secret d'exploitation.

## 10. Sécurité sous charge

| Sonde | Résultat |
|---|---|
| Limiteur de débit (`domain-mutations`, borne 80/min) | 40/120 requêtes refusées en **429** — le limiteur agit réellement |
| Route interne/Cron joignable par HTTP | `404` — jamais exposée |
| Paramètre d'identité falsifié (`?userId=`) sur route personnelle | `400` — refus explicite, tracé |
| Route protégée sans session | `401` |
| Registre forensique | 43 événements `SECURITY_*` persistés dans le ledger existant |
| Fuite d'erreur moteur | aucune : les 17 erreurs 5xx retournent `INTERNAL_ERROR` sans détail PostgreSQL |

---

## Validations obligatoires (exécutées après la campagne)

| Commande | Résultat |
|---|---|
| `npm test` | **1 632/1 632 PASS, 0 FAIL** (dont 6 nouveaux tests P0-LOAD-TESTS) |
| `npm run verify:postgres` | **28/28 PASS, 0 FAIL** |
| `npm run verify:workerd` | **18/18 PASS, 0 FAIL** |
| `npx tsc --noEmit` | **0 erreur** |
| `git diff --check` | **0 erreur** |
