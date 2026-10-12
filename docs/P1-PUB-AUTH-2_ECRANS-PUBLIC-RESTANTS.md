# PUB-AUTH-2 — écrans publics restants : finitions, faits serveur réels, BACKEND_GAP

Suite de `docs/P1-DESIGN-PUBLIC-AUTH.md` (PUB-AUTH-1, PR #70), non fusionnée.
Périmètre : **PUB-01, PUB-02, PUB-03, PUB-04, PUB-09, PUB-10**. Aucun fichier de
backend, de migration, de contrat serveur, de permission ou de règle métier n'est
modifié ; aucune PR n'est fusionnée ; l'historique n'est pas réécrit.

## 1. Base, périmètre et méthode

- Checkpoint vérifié : `738ca989b5b786d185cb010c6cd28c161a2b8d18`
  (« feat(public-auth): expose PUB-05 to PUB-08 backend gaps »), ancêtre du HEAD.
- Branche de session : `arena/9682849e-le-labeur-pre-arena` (nom imposé par la
  session ; la branche de référence `arena/df298795-le-labeur-pre-arena` n'est pas
  touchée, la cible de PR reste `arena/df298795-le-labeur-pre-arena`).
- `/` reste l'application legacy ; les dix routes PUB restent opt-in.
- Sources lues avant toute modification : `design/llab/units.py`,
  `design/llab/content/pub.py`, `design/llab/content/sys.py`,
  `src/public/*`, `src/routing/*`, `src/design-system/*`,
  `src/backend/api/routeContracts.ts`, `src/backend/api/entry.ts`,
  `src/backend/api/worker.ts`, `src/backend/api/security.ts`,
  `src/backend/identity/*`, `src/admin/gaps.ts` (ADM-59/60/63).
- Aucun écran n'a été refait arbitrairement : chaque modification est justifiée
  par un **écart observable** entre la fiche et le rendu de PUB-AUTH-1.

## 2. Statut réel de chaque fiche avant la mission

| Fiche | Avant PUB-AUTH-2 | Écart constaté |
|---|---|---|
| PUB-01 | PARTIEL | Zones `canvas`/`hero`/`cta` non identifiables dans le DOM ; ni C-15, ni C-14, ni l'échelle `--display-1` ; aucune mention de la route `GET /v1/health` de la fiche. |
| PUB-02 | PARTIEL | CTA principal rendu en `ghost` ; zones non identifiables ; ni C-15, ni C-14, ni `--display-2` ; état « Prefers-contrast » absent ; double groupe de liens (pied + navigation). |
| PUB-03 | PARTIEL | Cartes sans état de sélection (anneau or/émeraude de la fiche), CTA sans morph de couleur ; aucune source réelle pour connaître le rôle effectif. |
| PUB-04 | PARTIEL | La limitation de débit RÉELLE (429, `details.retryAfterSeconds`) n'était ni lue ni affichée ; aucune séparation entre « temporisation transmise » et « décompte inventé » ; 403 sans sortie vers PUB-09. |
| PUB-09 | PARTIEL | Aucun fait serveur affiché : l'écran ne distinguait pas « aucune session confirmée » de « compte actif » ; aucun `BACKEND_GAP` déclaré. |
| PUB-10 | PARTIEL | Aucune distinction entre fenêtre de maintenance et rapport `/healthz` ; aucun `BACKEND_GAP` déclaré. |
| PUB-05 → PUB-08 | PARTIEL (PUB-AUTH-1) | **Inchangés** : registre, explications, contrôles désactivés et tests conservés à l'identique. |

Toutes restent `PARTIEL` après la mission : chaque fiche porte au moins une
capacité absente déclarée.

## 3. Finitions effectivement réalisées

### PUB-01 `/ouverture` et PUB-02 `/accueil` — visuel, structure, états

- Nouveaux composants de la fondation, dérivés des fiches :
  - **C-14 KineticText** (`src/design-system/components/KineticText.tsx`) :
    révélation lettre par lettre, 40 ms/lettre (PUB-01), découpage par mot pour
    que le retour à la ligne reste celui du texte, texte intégral conservé dans
    le DOM (aucune image, aucun `aria-hidden`). Animation jouée une fois.
  - **C-15 ParticleCanvas** (`src/design-system/components/ParticleCanvas.tsx`) :
    canvas 2D décoratif déterministe, `aria-hidden`, 120 particules / α 0,10 en
    dérive (PUB-01) et 90 / α 0,10 en montée (PUB-02) ; boucle coupée au
    démontage et en arrière-plan ; **aucune** boucle sous `prefers-reduced-motion`
    (une seule image, α × 0,6) ; couleur lue dans `--gold-500` (jamais de valeur brute).
  - Échelle display : `.lbm-display-1` / `.lbm-display-2` dans `master.css`,
    strictement dérivées des variables générées (`--display-1-*`, `--display-2-*`).
- Les trois zones de PUB-01 (`canvas`, `hero`, `cta`) et les cinq zones de PUB-02
  (`hero`, `kpi`, `list`, `price`, `cta`) sont désormais identifiables par
  `data-zone` et vérifiées en Chromium ; les zones feuilles (`form`, `timeline`,
  `doc`) ne sont pas inventées.
- PUB-01 : sceau en variante « Forge » (anneau conique animé 640 ms, sans libellé
  redondant avec le titre kinetic) ; cible clavier « Continuer » conservée.
- PUB-02 : promesse en `--display-2`, CTA principal neumorphique or + entrée
  secondaire « J'ai déjà un compte », liens CGU/connexion une seule fois,
  état `prefers-contrast: more` (surfaces opaques, décor coupé).
- **Défaut corrigé, mesuré en capture réelle** : sur un hero étroit, le libellé du
  sceau C-04 se comprimait (« 4 / 0 / 3 » empilés) ; `.lbm-seal__label { flex: none }`
  et `flex-wrap` sur `.lbm-state__hero` (fondation P0, correctifs de robustesse).

### PUB-03 `/onboarding/profil` — politique de rôle

- Sélection visible conforme à la fiche : anneau or (Client) / émeraude
  (Prestataire), élévation, retrait de la carte non choisie (opacité — pas de
  désaturation du texte, la lisibilité AA reste vérifiée), CTA qui prend la
  couleur et le libellé du profil, jeu de radios natif au clavier inchangé.
- `BACKEND_GAP · PUB-03` déclare `POST /v1/onboarding/role` et
  `GET /v1/onboarding/role-policy` (vérifiés absents de `routeContracts.ts`) et
  rappelle que la promesse « modifiable une fois dans les 30 jours via le support »
  **n'est pas affichée** faute d'API.
- Aucun choix de rôle n'est présenté comme une autorisation : notice explicite
  (« ce choix prépare l'inscription et n'est jamais une autorisation ») et, si le
  serveur confirme une session, affichage du **rôle effectif** lu par
  `GET /api/v1/auth/session` (`data-session-role`). Ce qui reste réellement
  disponible : le champ `requestedRole` de `POST /api/v1/auth/google/credential`
  (création de compte, rôles self-service) — jamais un changement de rôle.

### PUB-04 `/connexion` — méthodes de connexion et limitation de débit

- Méthodes réelles : Google uniquement (`POST /api/v1/auth/google/credential`),
  comme en PUB-AUTH-1. `POST /v1/auth/login`, `POST /v1/auth/magic-link` et
  `GET /v1/auth/throttle-status` sont déclarés `BACKEND_GAP · PUB-04` ; **aucun**
  champ mot de passe, faux CAPTCHA ou faux lien magique n'est ajouté.
- Limitation de débit : la seule valeur affichée est
  `error.details.retryAfterSeconds` d'un **429 réel** du Worker (bucket `auth`,
  60 requêtes / 60 s, table `DEFAULT_RATE_LIMIT_POLICY`) ; validée en test contre
  un vrai `createIdentityApiWorker` (61ᵉ tentative → 429 `RATE_LIMITED`). Sans
  valeur transmise, le texte dit qu'aucune durée n'est fournie : **aucun décompte
  local, aucune estimation**.
- 403 de la connexion (compte non `ACTIVE` côté service de session) : message
  factuel « le compte n'est pas actif côté serveur », **aucun motif** (l'API ne
  transmet ni `details` ni motif), sortie vers PUB-09.
- Trois micro-lignes de confiance réécrites en faits vérifiables (session HttpOnly
  serveur, révocation via `POST /api/v1/auth/logout`, aucun jeton conservé côté
  navigateur) — plus aucune promesse non tenue.

### PUB-09 `/compte-bloque` — statut, recours, export

- Nouveau bloc « État vérifié côté serveur » alimenté par la **seule** source
  réelle : `GET /api/v1/auth/session` (200 + `status: ACTIVE` → compte actif ;
  401/403 → aucune session active confirmée). Le texte rappelle explicitement
  qu'une URL ou une absence de session **ne prouve pas** un blocage.
- `BACKEND_GAP · PUB-09` : `GET /v1/account/block-status`,
  `POST /v1/account/appeal`, `GET /v1/account/export` absents → boutons
  « Déposer une contestation » et « Télécharger mes données » désactivés et
  reliés par `aria-describedby` à l'explication. « Se déconnecter » reste la seule
  action réellement câblée (`POST /api/v1/auth/logout`).

### PUB-10 `/maintenance` — fenêtre et état des services

- `BACKEND_GAP · PUB-10` : `GET /v1/status/window`, `GET /v1/status/services`,
  `POST /v1/notify/maintenance-resume` absents → « Me prévenir à la reprise » et
  « Voir l'état des services » désactivés.
- Le rapport `/healthz` est nommé et **écarté** : il décrit la frontière
  API/persistance du Worker, ce n'est pas une page de statut métier et il n'est
  jamais appelé par l'écran (vérifié en Chromium : 0 requête `/healthz`). Aucune
  heure de reprise, progression, fenêtre de 24 h ni report d'échéance n'est affichée.

### Déclarations `BACKEND_GAP` (nouveau registre)

`src/public/gaps.ts` gagne `PUBLIC_SCREEN_GAPS` / `PUBLIC_SCREEN_GAP_ROUTES`
(6 fiches, 14 opérations) et les unions `PUBLIC_GAPS` / `PUBLIC_GAP_ROUTES`
(10 fiches, 26 opérations). Chaque opération est vérifiée absente de
`API_ROUTE_CONTRACTS` par les tests ; l'écran l'affiche telle quelle via
`BackendGap` et relie le contrôle désactivé à l'explication.

## 4. Routes, API et permissions réellement utilisées

| Écran | Contrat appelé | Nature |
|---|---|---|
| PUB-01 | `GET /api/v1/auth/session` (préchauffage silencieux) | `required` / `self` |
| PUB-03, PUB-09 | `GET /api/v1/auth/session` (rôle effectif, état de session) | `required` / `self` |
| PUB-04 | `POST /api/v1/auth/google/credential` | `public` / `public` |
| PUB-09 | `POST /api/v1/auth/logout` | `required` / `self` |

Aucune autre route n'est appelée par les écrans PUB (vérifié en Chromium :
l'ensemble des chemins atteints appartient à `API_ROUTE_CONTRACTS`). Aucune
permission RBAC n'est requise ni contournée : le rôle et les droits restent
calculés par le serveur, le navigateur n'en reçoit qu'une lecture.
La limitation de débit est celle du Worker (`bucket auth`), pas une protection
créée côté client.

## 5. BACKEND_GAP restants après cette mission

| Fiche | Capacités absentes (déclarées, contrôles désactivés) |
|---|---|
| PUB-01 | `GET /v1/health` (le seul rapport réel est `/healthz`, hors `/api/v1`) |
| PUB-02 | `GET /v1/public/story`, `GET /v1/public/stats` |
| PUB-03 | `POST /v1/onboarding/role`, `GET /v1/onboarding/role-policy` |
| PUB-04 | `POST /v1/auth/login`, `POST /v1/auth/magic-link`, `GET /v1/auth/throttle-status` |
| PUB-05…08 | 12 opérations inchangées (PUB-AUTH-1) |
| PUB-09 | `GET /v1/account/block-status`, `POST /v1/account/appeal`, `GET /v1/account/export` |
| PUB-10 | `GET /v1/status/window`, `GET /v1/status/services`, `POST /v1/notify/maintenance-resume` |

Restent également hors périmètre (déjà documentés) : forge Skia/GLSL hors thread
JS, miniatures produit de PUB-02, statistiques vérifiées, politique de rôle
administrée (30 jours), page de statut publique et supervisions ADM-59/60/63.

## 6. Vérifications

| Commande | Résultat |
|---|---|
| `npm test` | voir section 7 |
| `npm run verify:postgres` | voir section 7 |
| `npm run verify:workerd` | voir section 7 |
| `npm run verify:admin-ui` | voir section 7 (régression corrigée, 56/56) |
| `npm run verify:public-ui` | **28/28 PASS** (18 groupes PUB-AUTH-1 conservés + 10 nouveaux), captures 12 écrans × 360/1440 px sous `.tmp/` |
| `npm run build` | voir section 7 |
| `npx tsc --noEmit` | **PASS** |
| `npm run design:admin:check` | **PASS** |
| `npm run design:tokens:check` | voir section 7 |
| `npm run design:public:check` | voir section 7 |
| `git diff --check` | **PASS** (aucune erreur d'espacement) |

Nouveaux contrôles ajoutés (aucun test supprimé, aucune assertion affaiblie) :

- `src/public/public.test.tsx` : 9 contrôles (+1 existant étendu) — registres
  PUB-01…04/09/10 et fusion, absence réelle des 26 opérations dans les contrats,
  politique `auth` 60/60 s relue dans le code, **serveur réel** (compte actif,
  403 sans `details`, 401 après blocage), **429 réel** avec temporisation,
  validation stricte de `retryAfterSeconds` (0, négatif, `abc`, 99999, vide),
  sonde de session (actif / aucune / hors-ligne / erreur), C-14, C-15.
- `scripts/verify-public-ui.ts` : 10 groupes — zones + décor + texte des fiches
  PUB-01/02, captures 360/1440, sélection de profil et CTA émeraude, rôle effectif
  et état de session lus depuis l'API, aucune requête vers une route absente
  (0 appel `/healthz`), temporisation 429 affichée / aucune valeur inventée,
  403 → PUB-09 sans motif, contrats appelés tous déclarés, captures 03/04/09/10.
- Correctif de fixture (sans effet produit) : la fixture HTTP de
  `verify:public-ui` renvoyait une collection nue alors que l'API réelle répond
  `{ items, cursor, limit, hasMore }` ; l'adaptateur de compatibilité
  (`firstPage`) montait alors les offres `undefined` et l'écran legacy Découvrir
  levait une erreur de page. La fixture renvoie désormais une collection vide
  enveloppée (`auth` excepté). L'application, les contrats et l'API sont inchangés.

## 7. Résultats constatés le 2026-10-12

| Commande | Résultat |
|---|---|
| `npm test` | **1863/1863 PASS, 0 FAIL** (1854 avant la mission, +9 contrôles PUB-AUTH-2) |
| `npm run verify:postgres` | **28/28 PASS**, PostgreSQL serveur local (+ « Cloudflare réel : NON testé (aucun credential) ») |
| `npm run verify:workerd` | **18/18 PASS**, workerd local + PostgreSQL local |
| `npm run verify:admin-ui` | **56/56 PASS**. Une première exécution a échoué sur `ADM-21 — débordement horizontal à 360 px` : le correctif du libellé de sceau (`.lbm-seal__label { flex: none }`) rognait une longue étiquette dans une rangée à largeur contrainte. Correctif remplacé par un repliement au mot (`min-width: 0; overflow-wrap: break-word`) : `verify:admin-ui` **56/56 PASS** et `verify:public-ui` **28/28 PASS**. Aucun fichier ADMIN modifié. |
| `npm run verify:public-ui` | **28/28 PASS** |
| `npm run build` | **PASS** (avertissement de chunk > 500 kB, préexistant) |
| `npx tsc --noEmit` | **PASS** |
| `npm run design:admin:check` | **PASS** |
| `npm run design:tokens:check` | **PASS** |
| `npm run design:public:check` | **PASS** |
| `git diff --check` | **PASS** |

Les captures Chromium (`.tmp/`, ignoré par Git) ont servi à vérifier réellement
les écrans à 360 et 1440 px, en mouvement complet et réduit. Deux constats de
capture ont conduit à des correctifs de fondation P0 :

1. le libellé d'un sceau C-04 se comprimait lettre par lettre (« 4 / 0 / 3 ») dans
   un conteneur qui autorise `overflow-wrap: anywhere` (`.lbm-public`) ;
2. le corrigé initial (`flex: none`) provoquait un débordement horizontal à 360 px
   sur ADM-21 — détecté par `verify:admin-ui`, puis remplacé par
   `min-width: 0; overflow-wrap: break-word` + `flex-wrap` sur `.lbm-state__hero`.

Les deux correctifs sont des règles CSS de la fondation ; aucun composant, contrat
ni test ADMIN n'a été modifié.

## 8. Ce qui n'est pas fait et reste ouvert

1. Arbitrer les contrats absents (login/mot de passe, lien magique, rôle
   d'inscription, statut de blocage, recours, export, statut de service) dans une
   mission autorisant ces dépendances — aucune n'a été créée ici.
2. Forge « Skia hors thread JS » et 120 fps : impossible en Web sans WebGL/Skia ;
   le canvas 2D décoratif livré ne prétend à aucune mesure de performance.
3. Miniatures produit de PUB-02 et statistiques vérifiées : nécessitent des écrans
   métier réels, interdits par le périmètre.
4. Page de statut publique et supervision des composants : ADM-61/62/63 documentent
   déjà l'absence de télémétrie publiée ; `/healthz` ne la remplace pas.
5. Revue design et accessibilité manuelle (lecteur d'écran réel) : non réalisée ;
   les contrôles sont techniques (Chromium, contraste, navigation clavier).
6. La validation Google réelle en environnement configuré reste à faire (fixtures
   locales uniquement).
