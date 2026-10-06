# P0-CONTRACT-POST — Tranche POST-CONTRAT / WORK EXECUTION

## 1. Objectif

Implémenter **uniquement** la tranche post-contrat de LE LABEUR : la cascade
d'embauche qui suit l'activation d'un contrat, et la représentation de
l'exécution du travail — **sans inventer aucun état**, en réutilisant les
statuts, domaines SQL, ports, conventions et tests déjà validés
(P0-E3, P0-E4, P0-E5, P0-F, P0-AUTO-1, P0-AUTO-2, P0-PAY-1/2/3, P0-SALARY-1,
P0-DISPUTE-1).

Parcours métier couvert :

```
OFFER (ACTIVE) ──finalize-hiring──▶ FILLED
APPLICATION retenue ──finalize-hiring──▶ HIRED ──▶ CONTRACTED
AUTRES APPLICATIONS ouvertes ──finalize-hiring──▶ CLOSED_OFFER_FILLED

CONTRAT ACTIVE = travail en cours (exécution)
  ACTIVE → COMPLETED   (P0-F END, conservé)
  ACTIVE → TERMINATED  (P0-F TERMINATE M2+, conservé ; équivalent réel d'un abandon)
  REPLACED             (chemin incident/remplacement, conservé, non ouvert ici)
```

## 2. Constat d'audit (avant modification)

| Sujet | Constat | Décision |
|---|---|---|
| `Offer.status = FILLED` | Existe (`src/types/index.ts`, domaine SQL 0003). Produit côté DEMO (`signContract`, RÈGLE 21), jamais côté serveur. | Cascade serveur ajoutée, statut réutilisé. |
| `ApplicationStatus = HIRED` | Existe (types + 0003). Produit côté DEMO, jamais côté serveur. | Cascade serveur ajoutée, statut réutilisé. |
| `ApplicationStatus = CONTRACTED` | Existe (types + 0003) mais **jamais produit nulle part** (« MANQUE » documenté : `docs/statecharts.mmd`, `ARCHITECTURE_REVERSE_ENGINEERING.md` § I-05). | Transition `HIRED → CONTRACTED` ajoutée (le statut existait déjà). |
| `ApplicationStatus = CLOSED_OFFER_FILLED` | Existe (types + 0003). Produit côté DEMO, jamais côté serveur. | Cascade serveur ajoutée, statut réutilisé. |
| `ContractStatus = COMPLETED / TERMINATED / REPLACED` | Existent, terminaux, conservés. | Aucune modification. |
| `WORK / EXECUTION / WORK_SUBMITTED / ABANDONED` | **N'existent nulle part** dans le code. | **Non créés** : `ACTIVE` = exécution, `TERMINATED` = équivalent d'abandon, suivi mensuel + cycle P0-PAY = suivi d'exécution (cf. `WORK_EXECUTION_STATUS_MAPPING`). |
| Horaires de travail | Texte libre de l'offre (`summary`, `conditions`, `responsibilities`), lu par le candidat avant candidature. | Aucun moteur : ni disponibilité, ni calendrier, ni refus auto, ni négociation, ni matching (cf. `WORK_SCHEDULE_SIMPLICITY_RULES`). |
| Activation P0-F / automatisation P0-AUTO-2 | Ne produisent volontairement aucune cascade (tests § « Post-contrat »). | **Conservées à l'identique** : la cascade est une commande explicite séparée. |

## 3. Matrice implémentée (`src/domain/postContractTransitions.ts`, module PUR)

- **Offre** : `ACTIVE → FILLED` ; `FILLED` rejoué converge (200, zéro
  écriture) ; `PAUSED` / `CANCELLED` → refus 409 (`evaluatePostContractOffer`).
- **Candidature retenue** (`contract.applicationId`) : ouverte
  (`PENDING`/`REVIEW`/`SHORTLISTED`) → `HIRED` → `CONTRACTED` dans la même
  commande ; `HIRED` → `CONTRACTED` ; `CONTRACTED` rejoué converge ;
  `REJECTED`/`WITHDRAWN`/`CLOSED_OFFER_FILLED` → refus 409, zéro écriture
  (`evaluatePostContractWinningApplication`).
- **Autres candidatures** : ouvertes → `CLOSED_OFFER_FILLED` ; toute autre
  est **ignorée, jamais réécrite** — exactement comme le DEMO
  (`evaluatePostContractOtherApplication`).
- **Refus documentés** : `POST_CONTRACT_REFUSED_TRANSITIONS` (7 entrées).
- **Libellés d'historique** : `Candidature retenue — contrat actif` et
  `Candidature clôturée — offre pourvue` repris **à l'identique** du DEMO ;
  `Engagement contractualisé — contrat actif` pour `HIRED → CONTRACTED`.
- **Événements** : `OFFER_FILLED`, `APPLICATION_HIRED`,
  `APPLICATION_CONTRACTED`, `APPLICATION_CLOSED_OFFER_FILLED` **documentés
  uniquement** (`DOCUMENTED_POST_CONTRACT_EVENTS`) — aucun Outbox, aucun
  consumer, aucune notification dans cette tranche.

## 4. API serveur

```
POST /api/v1/contracts/:contractId/finalize-hiring
```

- Route `contracts.finalize-hiring` (`routeContracts.ts`) : auth requise,
  scope `owner`, rôle `EMPLOYER`, `Idempotency-Key` obligatoire.
- Repository `finalizeHiring` (`contractRepository.ts`, port
  `ServerContractRepository`) : le corps est ignoré, **tout est dérivé du
  contrat ACTIF relu côté serveur**.
- Réponse `200` : projection `Contract` (le contrat reste `ACTIVE`).

### 4.1 Garanties (dans l'ordre)

1. Acteur de session, `EMPLOYER` propriétaire du contrat, compte `ACTIVE`
   (401/403 sinon, zéro écriture).
2. Contrat verrouillé (`FOR UPDATE`), `ACTIVE` exigé (tout autre statut →
   409), `applicationId` présente (sinon 409).
3. Candidature retenue verrouillée, cohérence offre/salarié relue
   (incohérence → 409, zéro écriture).
4. Offre verrouillée (`FOR SHARE`, port existant), `ACTIVE` exigée
   (`FILLED` → convergence, `PAUSED`/`CANCELLED` → 409).
5. Écritures en **compare-and-set SQL** (décision concurrente jamais écrasée).
6. Autres candidatures : **balayage keyset complet** (curseur, pages de 200),
   chacune relue verrouillée puis évaluée (test à 205 concurrentes).
7. Rejeu (même clé ou autre clé) après cascade complète → **200, zéro
   écriture**, aucun doublon d'historique.
8. Ordre de verrouillage unique (anti-interblocage) : contrat → retenue →
   offre → autres (ordre keyset stable).

### 4.2 Historique / audit

- Chaque transition de candidature **ajoute** une entrée (`history || jsonb`,
  jamais réécrite) via le `compareAndSetStatus` existant.
- Offres : aucun historique dans le modèle réel — rien n'est inventé.
- Contrat : non modifié (reste `ACTIVE`) ; la cascade est traçable via les
  historiques des candidatures et le statut de l'offre.
- Aucune écriture Outbox/audit-ledger : l'architecture existante (P0-E4/P0-F)
  impose l'historique métier seul pour ces transitions.

## 5. Migrations

**Aucune migration ajoutée** (volontaire, justifié) :

- tous les statuts produits (`FILLED`, `HIRED`, `CONTRACTED`,
  `CLOSED_OFFER_FILLED`) sont déjà couverts par les CHECK de
  `migrations/0003_core_nucleus_alignment.sql` ;
- les colonnes utilisées (`offers.status`, `applications.status`,
  `applications.history`, `contracts.application_id` + FK) existent depuis
  0001/0003 ;
- `EXPECTED_MIGRATION_IDS` reste aligné sur `migrations/` (vérifié par les
  tests du runner et `verify:postgres` / `verify:workerd`).

## 6. Non-objectifs (explicitement NON implémentés)

- Aucun paiement réel, provider, escrow, détention de fonds, mobile money
  (principe : LE LABEUR ne garde pas le salaire ; vérification ultérieure).
- Aucune notification finale (événements documentés, non émis).
- Aucun R2/KYC, aucun WebRTC, aucun Cron/Queue production, aucune modification
  Cloudflare production.
- Aucun remplacement avancé (`REPLACED` conservé, chemin incident non ouvert),
  aucun matching avancé, aucun moteur d'horaires (cf. § 2).
- Aucune modification des transitions P0-F (l'activation ne cascade toujours
  pas) ni de l'automatisation P0-AUTO-2.
- Aucune refonte UI/design, sécurité, load test.

Reste à venir (cf. `POST_CONTRACT_REMAINING_REQUIREMENTS`) : notifications,
garde anti-doublon « aucun contrat ACTIVE concurrent » (présente en DEMO,
absente serveur), chemin incident M1, mensuel détaillé.

## 7. Tests

- `src/domain/postContractTransitions.test.ts` : 11 cas purs (matrice,
  refus, work execution, horaires, événements, périmètre).
- `src/backend/api/postContract.test.ts` : 15 cas Worker/API → PostgreSQL
  (PGlite) — cascade nominale + historique exact, autorisation (403/401/400/
  404), gardes contrat/offre/retenue (409, zéro écriture), idempotence +
  conflit, convergence, concurrence (200/200, écriture unique), balayage 205
  lignes, rollback, non-régression P0-F/P0-AUTO-2, périmètre 501 + 0 paiement,
  compte PENDING (401 API / 403 repository).
- Câblés dans `scripts/run-tests.ts` : **1422/1422 PASS** (1396 de référence
  + 26 nouveaux, 0 régression).
- `verify:postgres` et `verify:workerd` : voir rapport de chantier.
