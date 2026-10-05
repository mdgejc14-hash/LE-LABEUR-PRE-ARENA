# P0-E4 — Cycle de décision des candidatures

Point de départ : `685562fbc63941e178e85a95bc51617d05f06623` (P0-E3 validé).
Branche de travail : `arena/59eb15a0-le-labeur-pre-arena`.

Objectif : compléter le **premier cycle de décision** d'une candidature, sans
ouvrir les propositions ni les contrats.

---

## 1. Statuts réellement présents (aucun statut inventé)

Domaine : `src/types/index.ts` → `ApplicationStatus`.
Contrainte SQL : `migrations/0003_core_nucleus_alignment.sql`
(`applications_status_domain`).

```
PENDING | REVIEW | SHORTLISTED | REJECTED | WITHDRAWN | HIRED | CONTRACTED | CLOSED_OFFER_FILLED
```

Correspondance avec le vocabulaire fonctionnel de l'étape :

| Vocabulaire fonctionnel | Nom conservé dans le code |
|---|---|
| SUBMITTED | `PENDING` |
| EXAMINED | `REVIEW` |
| SHORTLISTED | `SHORTLISTED` |
| REJECTED | `REJECTED` |
| WITHDRAWN | `WITHDRAWN` |

`HIRED`, `CONTRACTED` et `CLOSED_OFFER_FILLED` existent dans le modèle mais
appartiennent aux étapes suivantes (propositions, contrats) : P0-E4 ne les
produit jamais et **refuse** d'y toucher.

Source de vérité de la matrice : `src/domain/applicationTransitions.ts`
(module pur, partagé, dérivé du modèle réel `MockRepository`).

---

## 2. Transitions implémentées

| Décision | Acteur | Transition | Garde additionnelle |
|---|---|---|---|
| `EXAMINE` | EMPLOYER propriétaire de l'offre | `PENDING → REVIEW` | aucun contrat lié |
| `SHORTLIST` | EMPLOYER propriétaire de l'offre | `PENDING → SHORTLISTED` · `REVIEW → SHORTLISTED` | offre `ACTIVE`, aucun contrat lié |
| `REJECT` | EMPLOYER propriétaire de l'offre | `PENDING → REJECTED` · `REVIEW → REJECTED` · `SHORTLISTED → REJECTED` | aucun contrat lié |
| `WITHDRAW` | CANDIDATE propriétaire de la candidature | `PENDING → WITHDRAWN` · `REVIEW → WITHDRAWN` · `SHORTLISTED → WITHDRAWN` | aucun contrat lié |

Chaque transition :

* ajoute **une** entrée d'historique (`applications.history`, JSONB) ;
* met à jour `applications.status` et `applications.updated_at` ;
* pour `REJECT`, renseigne le motif dans `applications.note` ;
* s'exécute **dans une transaction PostgreSQL** (Worker → Repository → stores
  SQL → PostgreSQL), avec rollback automatique en cas d'échec.

### Rejeu d'une décision déjà appliquée

* `REVIEW` et `SHORTLISTED` restent **ouverts** à d'autres décisions : répéter
  la même est un **rejeu sans effet** (200, aucune écriture, aucune entrée
  d'historique dupliquée).
* `REJECTED` et `WITHDRAWN` sont **terminaux** : toute décision y est refusée
  (409), **y compris** celle qui a produit l'état. Le rejeu d'une commande
  reste couvert par l'en-tête `Idempotency-Key`.

---

## 3. Transitions refusées

| Situation | Résultat |
|---|---|
| Toute décision depuis `REJECTED`, `WITHDRAWN`, `HIRED`, `CONTRACTED`, `CLOSED_OFFER_FILLED` | `409 BUSINESS_RULE_VIOLATION` |
| `EXAMINE` depuis `REVIEW` ou `SHORTLISTED` | `409` (transition interdite) |
| `SHORTLIST` depuis `SHORTLISTED` (déjà appliqué) | `200` rejeu sans effet |
| `SHORTLIST` sur une offre non `ACTIVE` | `409` |
| Décision sur une candidature déjà liée à un contrat (`contract_id`) | `409` |
| Décision par un employeur non propriétaire de l'offre | `403 FORBIDDEN` |
| `WITHDRAW` sur la candidature d'un autre candidat | `403 FORBIDDEN` |
| Décision par un rôle non attendu (CANDIDATE sur examine/shortlist/reject, EMPLOYER sur withdraw) | `403` (routeur) |
| Acteur absent de PostgreSQL / sans session | `401 UNAUTHENTICATED` |
| Compte non `ACTIVE` (BLOCKED/PENDING) | `403 FORBIDDEN` (repository) — `401` à la session |
| `Idempotency-Key` absente | `400 IDEMPOTENCY_KEY_REQUIRED` |
| Même clé, charge utile différente | `409 IDEMPOTENCY_CONFLICT` |
| Décision concurrente perdante (compare-and-set) | `409` si l'état final diffère, `200` si l'état final est déjà la cible |

`SHORTLISTED → REJECTED` est volontairement autorisé : le modèle réel
(`MockRepository.rejectApplication`) l'autorise explicitement
(`['PENDING', 'REVIEW', 'SHORTLISTED']`). Aucune autre opération ne fait sortir
une candidature de `SHORTLISTED`.

---

## 4. Autorisation

* `actorId` est **toujours** celui de la session serveur : jamais lu depuis le
  corps de requête. Le routeur valide l'authentification, le rôle, la portée et
  la clé d'idempotence ; le repository revérifie l'acteur, son rôle, l'état du
  compte et la propriété depuis les **lignes relues** dans la transaction.
* EMPLOYER : propriété vérifiée par `offers.employer_id = actor.id`.
* CANDIDATE : propriété vérifiée par `applications.candidate_id = actor.id`.
* ADMIN : aucun contournement implicite ajouté en P0-E4.

---

## 5. Motif de rejet

* Champ du modèle réel : `Application.note` (colonnes `applications.note`).
  Aucune colonne ni champ n'a été inventé.
* Le motif est **optionnel** : le modèle réel applique le défaut
  `« Dossier non retenu pour cette mission. »` (`MockRepository.rejectApplication`).
  Ce comportement diffère des déclarations de paiement, où
  `normalizeRejectionReason` rend le motif obligatoire.
* Le motif est persisté dans `applications.note` **et** repris dans l'entrée
  d'historique (`Candidature non retenue (<motif>)`).
* Conséquence assumée, documentée : sur rejet, `note` porte le motif de l'employeur
  et remplace l'éventuelle note de soumission du candidat — comportement identique
  au modèle réel (DEMO). La séparation motif/note de soumission fera l'objet
  d'une décision de modélisation ultérieure si elle s'avère nécessaire.

---

## 6. Persistance, idempotence et concurrence

Chaîne : **Worker → Repository `Application` → stores SQL → PostgreSQL**.

* Transaction : `PostgreSqlDatabase.run` (BEGIN / COMMIT / ROLLBACK sur une
  connexion dédiée) ; le repository décisionnel y exécute toutes ses lectures et
  son unique écriture.
* Verrous : `SELECT … FOR UPDATE` sur la ligne de candidature,
  `SELECT … FOR SHARE` sur l'offre et sur le compte acteur.
* Écriture : `compareAndSetStatus` — `UPDATE … WHERE id = $1 AND status = $2`
  avec `history = history || $n::jsonb`. Aucune réécriture depuis une valeur
  lue : deux décisions concurrentes ne peuvent ni se perdre une entrée
  d'historique, ni produire un état impossible.
* Idempotence : cache de rejeu process-local `(commande, acteur, clé)` avec
  empreinte de charge utile — même clé ⇒ même résultat rejoué ; même clé avec une
  charge utile différente ⇒ `409 IDEMPOTENCY_CONFLICT`.
* En cas de compare-and-set perdu, le repository **relit** dans la transaction :
  état déjà cible ⇒ rejeu (200), état différent ⇒ `409`, ligne disparue ⇒ `404`.

Mode DEMO inchangé : `MockRepository` + `localStorage`, sans PostgreSQL.

---

## 7. Handlers ouverts

| Route | Méthode | Rôle |
|---|---|---|
| `/api/v1/offers/:offerId/applications` | POST | CANDIDATE (P0-E3) |
| `/api/v1/offers/:offerId/applications` | GET | EMPLOYER propriétaire (P0-E3) |
| `/api/v1/applications/:applicationId/examine` | POST | EMPLOYER propriétaire |
| `/api/v1/applications/:applicationId/shortlist` | POST | EMPLOYER propriétaire |
| `/api/v1/applications/:applicationId/reject` | POST | EMPLOYER propriétaire |
| `/api/v1/applications/:applicationId/withdraw` | POST | CANDIDATE propriétaire |

Toutes ces routes exigent l'en-tête `Idempotency-Key`.

Restent fermés (501) : listes générales de candidatures
(`/api/v1/my/applications`, `/api/v1/employer/applications`,
`/api/v1/applications/:id`), propositions, contrats, paiements, commissions,
plaintes, remplacements, notifications générales.

---

## 8. Événements documentés (aucun moteur créé)

Types déclarés dans `OutboxEventType` et `OUTBOX_EFFECT_CONTRACTS`
(`src/backend/services/outbox.ts`), contrats décrits dans
`DOCUMENTED_APPLICATION_EVENTS` (`src/domain/applicationTransitions.ts`) :

| Événement | Émis par | Clé de déduplication |
|---|---|---|
| `APPLICATION_SUBMITTED` | soumission (P0-E3) | `applicationId + SUBMITTED` |
| `APPLICATION_EXAMINED` | `EXAMINE` | `applicationId + EXAMINED` |
| `APPLICATION_SHORTLISTED` | `SHORTLIST` | `applicationId + SHORTLISTED` |
| `APPLICATION_REJECTED` | `REJECT` | `applicationId + REJECTED` |
| `APPLICATION_WITHDRAWN` | `WITHDRAW` | `applicationId + WITHDRAWN` |

P0-E4 **ne crée** ni table Outbox, ni file, ni cron, ni consumer, ni
notification : ces constantes documentent uniquement ce que l'étape
Outbox/Queue devra produire avec la même transaction métier.

---

## 9. Vérifications

| Commande | Résultat P0-E4 |
|---|---|
| `npm test` | suites `P0-E4 — matrice de décision CANDIDATURE` et `P0-E4 — cycle de décision CANDIDATURE` |
| `npm run lint` | `tsc --noEmit` |
| `npm run build` | bundle navigateur (aucune couche serveur importée) |
| `npm run verify:postgres` | contrôle `P0-E4 Worker/API → PostgreSQL` sur PostgreSQL 17.10 réel |
| `npm run verify:workerd` | contrôle `P0-E4 workerd → PostgreSQL` sous workerd + binding Hyperdrive local |

---

## 10. Hors périmètre — reste pour P0-E5 et suivants

* propositions d'embauche (création, réponse, expiration) ;
* contrats : génération, signature, activation, résiliation ;
* passage automatique de l'offre à `FILLED` et fermeture des autres
  candidatures après contrat ;
* statuts `HIRED`, `CONTRACTED`, `CLOSED_OFFER_FILLED` (transitions à ouvrir) ;
* paiements, commissions, plaintes, remplacements ;
* matching, réputation, R2, Queue, Cron ;
* notifications générales (les cinq événements ci-dessus n'ont pas encore de
  producteur) ;
* moteur Outbox/Queue et son consumer idempotent ;
* refonte d'interface.
