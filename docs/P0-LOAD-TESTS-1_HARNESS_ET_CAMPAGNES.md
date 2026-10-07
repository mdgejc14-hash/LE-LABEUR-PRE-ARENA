# LE LABEUR — P0-LOAD-TESTS-1 — Harness de charge & campagnes 100 / 1 000 (PARTIE 1)

Date : 2026-10-07
Branche de départ : `arena/2de0bced-le-labeur-pre-arena` (commit `5b9a719be7b3022762eee366a1e6e2fc167a19a2`)
Périmètre : PARTIE 1 UNIQUEMENT — harness réutilisable + campagnes **100** et **1 000** utilisateurs.
Hors périmètre (tranches suivantes) : 2 000, 10 000, paiements, WebRTC, remplacement avancé.
Aucune métrique inventée : tous les chiffres ci-dessous proviennent des exécutions réelles
et sont recalculables depuis les échantillons bruts des rapports JSON.

---

## ÉTAPE A — Audit des outils existants et harness créé

### Audit (ce qui existait déjà, réutilisé sans duplication)

| Outil audité | État | Réutilisation par le harness |
|---|---|---|
| `createOffersTestHarness` (`src/backend/api/offers.test.ts`) | Patron de référence complet | Même approche : PGlite + migrations réelles + `composeWorker` + fausses credentials Google RS256 vérifiées par le vrai `createGoogleCredentialVerifier` |
| Helpers PostgreSQL/PGlite (`src/backend/persistence/`) | Opérationnels | `createPostgresDatabase`, `toPostgresClientPort`, pilote `DriverPoolLike` — PGlite = PostgreSQL WASM réel, pas un mock |
| Composition worker (`src/backend/api/entry.ts`) | Racine unique de câblage | `composeWorker` instancie le VRAI graphe : routeur, sécurité, sessions SQL, repositories, transactions, outbox, audit |
| workerd | Couvert par `verify:workerd` (18/18 PASS) | Hors boucle de charge in-process (voir Limitations) |
| Fixtures / formes de charge utile | Validées par les tests d'intégration | Parcours repris des tests réels (`cronQueue.test.ts`, `securityAntiFraud.test.ts`) : chaîne complète offre → contrat activé |
| Authentification | Google credential + session SQL | Aucun contournement : chaque utilisateur synthétique se connecte via `POST /api/v1/auth/google/credential` (JWT RS256 réel signé par une clé éphémère de campagne) |
| API clients | `worker.fetch(Request)` | Client in-process minimal ajouté au harness |
| Génération de données synthétiques | Absente (identités fixes dans les tests) | Créée : N utilisateurs (pairs EMPLOYER/CANDIDATE), emails `.invalid`, noms préfixés `LOADTEST` |

### Créé (le minimum pour une campagne reproductible)

```
scripts/load/harness.ts     PGlite + migrations + composition réelle + N utilisateurs
                            synthétiques + émetteur JWT RS256 (clé éphémère)
scripts/load/scenarios.ts   Parcours représentatif appairé (25 étapes, 8 familles)
scripts/load/runner.ts      Pool de concurrence (file commune, voies parallèles)
scripts/load/metrics.ts     Échantillons réels, percentiles nearest-rank, agrégats,
                            rapport JSON (échantillons bruts inclus = auditabilité totale)
scripts/run-load-tests.ts   CLI : npm run test:load -- --users 100|1000
```

Paramètres fixés explicitement (et rapportés dans chaque JSON) :

- **Horloge métier fixe** `2026-10-05T14:00:00.000Z` (déterminisme). Les latences sont
  mesurées avec `performance.now()` hors horloge métier.
- **Rate-limit anti-fraude neutralisé** (politique très permissive injectée via
  `rateLimitPolicy`). But : mesurer la capacité brute de la chaîne ; le comportement
  anti-fraude reste vérifié par `P0-SECURITY-ANTI-FRAUD` (40/40). Déclaré
  `rateLimitNeutralized: true` dans chaque rapport.
- **Timeout** : seuil déclaratif 30 000 ms — dépassement compté en `timeouts`,
  requête jamais interrompue (les promesses in-process ne se coupent pas sainement).
- **Percentiles** : nearest-rank sur échantillons triés.
- Base **neuve à chaque campagne** (PGlite + les 18 migrations réelles) ; aucun état
  partagé entre campagnes.

## ÉTAPE B — Scénarios (parcours représentatif)

Modèle : N utilisateurs = N/2 EMPLOYER + N/2 CANDIDATE appariés en N/2 **parcours
complets** (25 étapes ordonnées par parcours). La concurrence rapportée = nombre de
parcours exécutés en parallèle (par défaut : tous).

Les 8 familles demandées sont couvertes :

1. **session/auth** — login Google signé (×2 par parcours), `GET /api/v1/auth/session` ;
2. **création d'offre** — `POST /api/v1/offers` (EMPLOYER) ;
3. **qualification** — `POST /api/v1/offers/:id/qualification` (réponses ELIGIBLE_FOR_INDEPENDENT) ;
4. **matching** — `PATCH /api/v1/my/matching-profile` (opt-in borné, voir note),
   `POST /api/v1/offers/:id/matching-runs`, `GET /api/v1/matching-runs/:runId` ;
5. **candidature** — `POST /api/v1/offers/:id/applications` + examen employeur
   (`POST /api/v1/applications/:id/examine`, cycle P0-E4 ouvert) ;
6. **proposition** — `POST /api/v1/conversations/:id/proposals` + `respond ACCEPT` ;
7. **contrat** — création → envoi → signature → **activation** (outbox contractuelle
   réelle écrite en transaction) ;
8. **lecture de données** — listes publiques (`/offers`, détail offre, summary
   qualification), liste propriétaire des candidatures, `/my/offers`, `/my/contracts`
   (×2), `/me` (×2).

Note de périmètre mesurée : `/api/v1/my/applications` et `/api/v1/employer/applications`
sont **volontairement fermés (501 par conception « closed-by-default », assertions
existantes dans `applications.test.ts`)** — exclus du parcours représentatif.

Garde-fou métier : `MAX_MATCHING_CANDIDATES = 200` borne le bassin de matching
(au-delà, `matching-runs` répond 409 par conception). Seuls ≤ 200 candidats publient
donc un profil de matching (opt-in) : 50 profils pour la campagne 100, 200 pour la
campagne 1 000. Chaque run de la campagne 1 000 classe un bassin réel de 200 profils.

## ÉTAPE C — Campagne 100 utilisateurs (EXÉCUTÉE)

Commande : `npm run test:load -- --users 100`
Rapport : `load-reports/P0-LOAD-TESTS-1_users-100.json` (1 250 échantillons bruts)

| Métrique | Valeur mesurée |
|---|---|
| Statut | ✅ RÉUSSIE — 0 erreur, 0 timeout |
| Utilisateurs simulés | 100 (50 EMPLOYER + 50 CANDIDATE) |
| Parcours | 50/50 complets, 0 en échec, 0 étape sautée |
| Concurrence | 50 voies parallèles |
| Durée de charge | 8,58 s (bootstrap base : 2,61 s) |
| Requêtes | 1 250 exécutées — 1 250 OK |
| Throughput | 145,77 req/s — 349,85 parcours/min |
| p50 / p95 / p99 | 343,0 / 562,5 / 652,5 ms (max 714,2 ms, moyenne 340,5 ms) |
| Erreurs | 0 |
| Timeouts (> 30 s) | 0 |

Étapes les plus lentes (p95) : `offers.list.read` 691,2 ms · `offer.read` 675,4 ms ·
`matching.run.create` 587,7 ms · `contract.create` 512,6 ms.

## ÉTAPE D — Campagne 1 000 utilisateurs (EXÉCUTÉE)

Commande : `npm run test:load -- --users 1000`
Rapport : `load-reports/P0-LOAD-TESTS-1_users-1000.json` (12 200 échantillons bruts)

| Métrique | Valeur mesurée |
|---|---|
| Statut | ✅ RÉUSSIE — 0 erreur, 0 timeout |
| Utilisateurs simulés | 1 000 (500 EMPLOYER + 500 CANDIDATE) |
| Parcours | 500/500 complets, 0 en échec, 0 étape sautée |
| Concurrence | 500 voies parallèles |
| Durée de charge | 83,94 s (bootstrap base : 2,94 s) |
| Requêtes | 12 200 exécutées — 12 200 OK |
| Throughput | 145,34 req/s — 357,40 parcours/min |
| p50 / p95 / p99 | 3 324,8 / 6 213,6 / 9 822,4 ms (max 10 997,4 ms, moyenne 3 409,3 ms) |
| Erreurs | 0 |
| Timeouts (> 30 s) | 0 |

Étapes les plus lentes (p95) : `matching.run.create` 10 734,0 ms (classement réel
d'un bassin de 200 profils par run, × 500 runs) · `matching.profile.update`
6 736,7 ms · `matching.run.read` 5 481,8 ms · `applications.offer.list.read`
5 178,5 ms.

## ANALYSE

1. **Correction fonctionnelle sous charge : totale aux deux échelles.** 13 450 requêtes
   cumulées, 100 % de succès : chaînes auth → offre → qualification → matching →
   candidature → proposition → contrat activé intégralement vertes, idempotence et
   transactions incluses, aucun timeout.
2. **Throughput quasi constant (~145 req/s) quel que soit le niveau de concurrence
   (50 ou 500 voies).** Signature d'une ressource sérialisée : PGlite exécute le SQL
   dans un moteur WASM unique ; les requêtes se traitent l'une après l'autre. La
   concurrence supplémentaire se convertit en file d'attente, pas en débit.
3. **Latences × ~10 entre 100 et 1 000 utilisateurs (p50 343 ms → 3 325 ms) alors que le
   débit ne bouge pas** : loi de Little (L = λW) — à débit plafonné constant, une
   concurrence ×10 produit une attente ×10. Le goulot est le moteur PostgreSQL
   embarqué (WASM), pas l'applicatif ni le routeur.
4. **`matching.run.create` devient l'étape dominante à l'échelle 1 000** (p95 10,7 s) :
   chaque run classe un bassin complet de 200 profils (scan + ranking + audit JSON en
   transaction) pendant que le moteur est saturé. C'est le premier candidat
   d'optimisation si une échelle supérieure est visée (tranche suivante).
5. **Volume de données réel produit en campagne 1 000** : 1 000 utilisateurs + sessions,
   500 offres, 500 qualifications, 200 profils de matching, 500 runs, 500 candidatures,
   500 propositions, 500 contrats ACTIFS (+ événements Outbox `APPLICATION_SUBMITTED`,
   `PROPOSAL_SENT`, `PROPOSAL_ACCEPTED`, `CONTRACT_ACTIVATED` en transaction) — aucune
   erreur d'intégrité.

## Limitations (explicites, assumées)

- **Mesure in-process** : latences = chaîne serveur complète (routeur → sécurité →
  session SQL → repositories → transactions → outbox → sérialisation) mais **sans pile
  réseau** (pas de workerd, pas de socket). PGlite WASM ≠ PostgreSQL serveur derrière
  Hyperdrive : les débits absolus ne sont pas transférables à une cible Cloudflare
  réelle ; les rapports qualifient la **correction et le comportement relatif** de la
  chaîne applicative.
- **Rate-limit anti-fraude neutralisé** volontairement (mesure de capacité brute) ;
  sa couverture fonctionnelle reste assurée par `P0-SECURITY-ANTI-FRAUD`.
- **Horloge métier fixe** : les phénomènes temps réel (TTL, jobs échus, cron) ne sont
  pas exercés en charge ici (couverts par `verify:workerd` / `verify:postgres`).
- Données **100 % synthétiques** (emails `.invalid`, entités `LOADTEST*`, clé JWT
  éphémère détruite en fin de campagne). Aucun PSP, aucun email/SMS, aucune production.

## Points restant ouverts (tranches suivantes, NON commencés)

- Campagnes 2 000 / 10 000 utilisateurs : nécessiteront vraisemblablement un
  PostgreSQL serveur (le moteur WASM plafonne à ~145 req/s indépendamment de la
  concurrence) et/ou une stratégie multi-processus ;
- Campagne de bout en bout via workerd (pile HTTP réelle) derrière Hyperdrive ;
- Charges complexes : paiements (PSP simulé), WebRTC, remplacement avancé ;
- Casse-tête identifié si échelle supérieure : saturation de `matching.run.create`.

## Reproductibilité

```bash
npm install --legacy-peer-deps   # conflit de peers préexistant (@vitejs/plugin-react vs vite 8)
npm test                         # 1626/1626 PASS
npm run verify:postgres          # 28/28 PASS
npm run verify:workerd           # 18/18 PASS
npx tsc --noEmit                 # PASS
npm run test:load -- --users 100
npm run test:load -- --users 1000
```
