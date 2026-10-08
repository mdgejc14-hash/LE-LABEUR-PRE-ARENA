# P0-DESIGN-FOUNDATION — Fondation technique Web du Design Final

| | |
|---|---|
| Projet | LE LABEUR PRE-ARENA |
| Branche de travail | `arena/ca5d5604-le-labeur-pre-arena` (imposée par la session, voir §1.2) |
| Base | `arena/design-master-v1` @ `cf54c7d3bcf9ade2e8190912b5ed18da5bf0929f` |
| Cible de la PR | `arena/design-master-v1` — **non mergée** |
| Périmètre | Fondation technique Web uniquement |
| Écrans de production intégrés | **0 / 120** |

## 1. Cadre

### 1.1 Règles respectées
- Stack conservée : SPA Vite 8 / React 19 / TypeScript. Pas de React Native, Expo, Skia, Reanimated, R3F, ni Next.js.
- Backend, migrations, règles métier, modèle financier, commission, paiements et contrats : **aucun fichier modifié** (vérifié par `git diff --stat`).
- Aucune route API ajoutée, aucun service métier ajouté, **aucune dépendance npm ajoutée**.
- `design/` : aucun fichier modifié. `design/code/*` : non importé (lecture seule).
- Legacy (`AppContext`, `AppScreen`, `App.tsx`, écrans, composants) : conservé, rendu identique à la référence (§15.3).

### 1.2 Nom de branche
La mission demande la branche `arena/design-foundation-v1`. La session de travail est liée à `arena/ca5d5604-le-labeur-pre-arena` : le commit, le push et la PR partent de cette branche, sans création d'autre branche. La PR cible `arena/design-master-v1` et n'est pas mergée.

### 1.3 Sources de vérité

| Source | Usage |
|---|---|
| `design/llab/tokens.py` | Tokens, composants C-01→C-20, invariants, accessibilité, performance |
| `design/llab/content/*.py` | Fiches : catalogue StateGuard (SYS-01→15), chromes, unités |
| `design/llab/model.py` | Chromes par famille (`CHROME_APP`, `CHROME_ADM`, `CHROME_PUB`, `CHROME_RTC`) |
| `design/llab/units.py` | Arbitrage 211 états → 177 canons → 120 unités |
| `design/code/*` | Référence illustrative uniquement (lecture) |

## 2. Audit du frontend (avant modification)

### 2.1 Stack réelle

| Élément | État constaté |
|---|---|
| Framework | React 19 (react-dom 19.3) en SPA ; point d'entrée `src/main.tsx` |
| Build | Vite 8.3 (rolldown) ; `vite.config.ts` ; aucun rendu serveur |
| Langage | TypeScript 7.0 ; `tsconfig.json` sans `include` (compile aussi `design/code/`) |
| Styles | Tailwind CSS 4.3 via `@tailwindcss/vite` ; `@theme` dans `src/index.css` |
| Mouvement | `motion` 12 **déclaré mais jamais importé** avant cette mission |
| Icônes | `lucide-react` 0.546 (43 fichiers) |
| Routage | **Aucun routeur** (ni react-router, ni Next). Navigation par `AppContext` : `screen: AppScreen` (11 valeurs), `activeTab: MainTab` (7 valeurs), pile `historyStackRef`. Seul usage de l'URL : `window.history.pushState('/')` dans `AdminLoginGate` et `AdminAccessDenied`. |
| Thème | Ivoire `#F3F3EC`, bleu nuit `#17233B`, bordeaux `#340C24`, or `#C5A059` ; polices Bodoni Moda, Cormorant Garamond et DM Sans chargées depuis Google Fonts (`index.html`). **Non conforme au Master** (noir basalte ; Space Grotesk, Inter, JetBrains Mono). |
| Navigation mobile legacy | `AndroidBottomNav` : 5 onglets (Découvrir, Candidatures, Favoris, Messages, Profil), différents du dock du Master. |
| Tests | `npm test` = `tsx scripts/run-tests.ts` : runner maison, convention `runXTests()` → `{name, success, detail}`. Ni Vitest ni Jest. |
| Scripts | `dev`, `build`, `test`, `lint` (= `tsc --noEmit`), `migrate`, `verify:postgres`, `verify:workerd`, `verify:cloudflare`, `preflight:cloudflare`, `deploy:worker`, `dev:worker`, `test:load` |
| Installation | `npm install` **échoue** (ERESOLVE : `esbuild@^0.25` en devDependency contre le peer `esbuild@^0.27 \|\| ^0.28` de `vite@8`). Installation réalisée avec `npm install --legacy-peer-deps`. Préexistant, non corrigé. |
| Lockfile | `package-lock.json` figure dans `.gitignore` : non versionné (choix du dépôt, conservé). |

### 2.2 Ligne de base des validations (avant modification)

| Commande | Résultat initial |
|---|---|
| `npm test` | 1626/1626 PASS |
| `npm run verify:postgres` | 28/28 PASS |
| `npm run verify:workerd` | 18/18 PASS |
| `npm run build` | OK (avertissement de taille de chunk > 500 ko, préexistant) |
| `npx tsc --noEmit` | **ÉCHEC préexistant** : 29 erreurs, toutes dans `design/code/particles.ts` (référence hors application) |

## 3. Décisions d'architecture

| # | Décision | Motif |
|---|---|---|
| D1 | Tokens générés par `scripts/design/generate-frontend-tokens.py` vers TypeScript et CSS | Le livre du Master prescrit « Générateur Python → CSS vars + JSON + TS, zéro dérive » (`design/llab/render/document.py`, §3.1). |
| D2 | Fichiers générés **versionnés** ; `npm run build` n'exige pas Python | Build autonome. Le contrôle de dérive (`npm run design:tokens:check`) est exécuté par `npm test`. |
| D3 | Aucune valeur saisie à la main ; une valeur absente de la source est émise `NON_DEFINI` (« NON DÉFINIE ») | Consigne « ne pas inventer ». |
| D4 | Format de source non reconnu → arrêt du générateur (code 2) | Une évolution de `tokens.py` ne peut pas produire silencieusement une valeur fausse. |
| D5 | Thème confiné à `.lbm-theme` et chargé avec les shells (chunk paresseux) | Le legacy ne charge ni CSS du thème, ni polices Master, ni motion. |
| D6 | Routage maison : table de namespaces pure (sans données) + résolution avec données, chargée à la demande | Pas de dépendance ajoutée ; le chemin legacy reste léger. |
| D7 | `motion` 12 (déjà déclaré) pour les ressorts ; Web APIs pour `matchMedia`, `ResizeObserver`, `history` | Consigne : réutiliser motion ou les Web APIs ; pas de Reanimated. |
| D8 | Squircle tracé en SVG à partir de la taille mesurée ; repli `border-radius` avant mesure | `corner-shape` non retenu : support navigateur non vérifié dans cette mission. |
| D9 | Verre profond limité à 2 surfaces par écran (budget global), repli opaque au-delà | Règle PERF de `tokens.py` ; vérifiée dans le navigateur (§8). |
| D10 | Namespace `/fondation/*` pour la démonstration | Les pages de démonstration doivent exister quelque part ; `/` reste le legacy. Retirable. |

## 4. Tokens

### 4.1 Génération
- Entrées : `design/llab/tokens.py` ; `model.py`, `content/*.py` et `units.py` pour les référentiels.
- Commandes : `npm run design:tokens` (écrit) ; `npm run design:tokens:check` (échoue en cas de dérive).
- Sorties (`src/design-system/generated/`) : `tokens.ts`, `tokens.css`, `stateGuardCatalog.ts`, `chrome.ts`, `productionUnits.ts`.
- Contenu : palette (32 lignes hors verre), verre 1→4, matériaux, familles et échelle typographiques (12 niveaux), espacement (unité 4 px, 14 valeurs), grilles (mobile 4 colonnes, tablette 8, desktop 12 ; conteneur 1180 px), rayons (r-2→r-7, r-full) et squircles (14, 22, 28, 34 ; n = 4,2), élévations E0→E4 avec rim, ressorts (4), courbes (3), durées (5, stagger 60 ms plafonné à 8), registre C-01→C-20 (20 entrées), accessibilité, performance, invariants INV-1→INV-6.
- Parité testée contre un **dump Python indépendant** de `tokens.py` et `sys.py` (palette, ressorts, titres, actions et explications SYS).

### 4.2 Nommage CSS
- Les noms reprennent ceux de `tokens.py` : `--surface-0`, `--gold-500`, `--text-hi`, `--glass-1-…`, `--r-6`, `--squircle-22`.
- **Familles de polices : `--family-display`, `--family-text`, `--family-mono`** (et non `--font-*`). Motif : Tailwind v4 lit `--font-mono` pour la classe `font-mono`, utilisée **222 fois dans 35 fichiers legacy**. Un jeton `--font-mono` non couché aurait changé la police de l'heure et de tout le legacy après une visite d'un shell. Corrigé et vérifié (§15.3).

### 4.3 Jetons cités par les fiches mais absents de `tokens.py`

| Jeton | Fiches citant | Traitement |
|---|---:|---|
| `--mono` | 179 | Alias de la famille Mono (JetBrains Mono, `TYPO.familles`), exposé comme `--family-mono`. Aucune valeur créée. |
| `--table` | 42 | **NON DÉFINI** dans `tokens.py`. Aucune valeur créée. |

### 4.4 Écarts constatés dans `tokens.py` (non corrigés : décision de design requise)

| Élément | Constat (calcul WCAG 2.x) | Conséquence dans la fondation |
|---|---|---|
| `--text-lo` `#6E6E7E` sur `--surface-0` | **4,07:1**, alors que `tokens.py` annonce **4,6:1 (AA)**. La règle « ≥ 4,5:1 pour texte < 18 px » n'est pas respectée. | Interdit pour du texte essentiel. Les métadonnées utilisent `--text-mid`. Test de non-régression sur la valeur mesurée. |
| `--gold-200`, « texte sur or », sur `--gold-500` | **1,46:1** | Texte des CTA or = `--surface-0` (11,74:1). |
| Bordures `--stroke-sub` / `--stroke-mid` / `--stroke-sup` sur `--surface-0` | 1,16 / 1,38 / 1,85:1 (seuil 3:1 pour les contrôles) | Un contrôle ne doit pas être délimité par ces seules bordures. Le bouton fantôme utilise `--text-mid` (8,78:1). |
| `--text-hi` sur `--clay-600` | 4,09:1 | À éviter pour du texte < 18 px sur un bouton destructif (non implémenté ici). |
| Contrastes annoncés : `--text-hi` 18,1 ; `--text-mid` 8,4 ; `--text-gold` 12,9 ; `--text-sign` 15,2 | Calculés : 18,70 ; 8,78 ; 14,50 ; 17,90 | Écarts mineurs ; la conclusion AAA est inchangée. |
| Rayon de squircle `18` cité dans `MATERIALS.squircle` | Absent de `RADII` (14, 22, 28, 34) | Aucun jeton 18 créé. |
| Seuils de grille tablette / desktop | **Non définis** (trois grilles, sans seuil) | Seuils **provisoires** 768 px et 1024 px, alignés sur `md` et `lg` de Tailwind (déjà présent). À arbitrer. |
| Halos E3 (« contextuel ») et E4 (« doré / émeraude ») | Couleur non définie | `haloColor = NON_DEFINI`. |
| Docstring de `units.py` | « 176 écrans canoniques » ; calcul = 177 (README = 177) | Aucun effet : le compte exécuté est 177. |
| Inter 400 / 500 / 600 | `--caps` et `--price` utilisent le poids 700, absent de la liste ; `Inter-Bold.ttf` est fourni | Poids 700 chargé (fichier fourni). |

## 5. Polices

- Familles du Master : Space Grotesk (Display), Inter (Texte), JetBrains Mono (Mono).
- Les 7 fichiers de `design/assets/fonts/` sont référencés **en place** (`@font-face` dans `src/design-system/theme/fonts.css`). Aucune copie, aucun téléchargement externe, `font-display: swap`, chargement à l'usage.
- **Licence : non prouvée dans le dépôt.** Les tables `name` des 7 fichiers déclarent SIL OFL 1.1 (copyright Inter Project Authors, JetBrains Mono Project Authors, Space Grotesk Project Authors), mais **aucun texte de licence n'est versionné** dans le dépôt. Action avant publication : ajouter les textes OFL correspondants.
- Google Fonts chargées par `index.html` : conservées pour le legacy ; à retirer lors de la migration des écrans.
- Non fait : conversion WOFF2 et sous-ensemble (gain à mesurer ; les TTF pèsent de 137 à 343 ko chacun).

## 6. Thème Web

| Thème | Implémentation |
|---|---|
| Basalte / noir | `--surface-0` (#050507) à `--surface-4` ; liserés `--stroke-*` |
| Dorure | `--gold-200` à `--gold-600`, `--gold-aura`, `--grad-gold` ; CTA primaire = `--gold-500` |
| Émeraude | `--emerald-200` à `--emerald-600`, `--emerald-aura` ; halo du sceau émeraude |
| Signaux | `--amber-500`, `--clay-500`, `--clay-600`, `--violet-500`, `--cyan-500`, `--slate-500` |
| Texte | `--text-hi`, `--text-mid`, `--text-gold`, `--text-sign` ; `--text-lo` réservé aux éléments non essentiels (§4.4) |
| Verre | `--glass-1-tint`, `--glass-1-blur`, `--glass-1-saturate` … jusqu'au niveau 4 |
| Typographie | Familles `--family-*` ; échelle `--<style>-size`, `-weight`, `-line-height`, `-tracking` (12 niveaux) |
| Focus | `:focus-visible` : contour 2 px `--gold-500` + halo 4 px `rgba(255,184,0,0.24)` (valeurs de `tokens.py`) |
| Réduction de mouvement | CSS (`prefers-reduced-motion`) et JS (`usePrefersReducedMotion`) |

Portée : tout est scopé sous `.lbm-theme` ; le legacy n'est pas touché.

## 7. Composants de fondation (Web)

| Composant | Fichier | États et comportements | Limites connues |
|---|---|---|---|
| C-01 GlassSurface | `components/GlassSurface.tsx` | Niveaux 1→4 ; `backdrop-filter` ; rim (arête haute, selon l'élévation) ; grain SVG 3 % ; modes `native`, `opaque-budget`, `opaque-lowmem` ; rim et grain `aria-hidden` ; aucun flou animé | Pas de réfraction gyroscopique (non implémentée). |
| C-02 SquircleCard | `components/SquircleCard.tsx` | Rayons 14, 22, 28, 34 ; n = 4,2 ; tracé SVG exact après mesure ; repli `border-radius` avant mesure ; ombre E-niveau via `drop-shadow` sur le tracé ; tons repos et actif | Gyroscope non implémenté. |
| C-03 NeoPressButton | `components/NeoPressButton.tsx` | Variantes `primary` (or), `ghost` (fantôme), `text` ; états repos, survol (pointeur fin), focus, pressé (ombre interne E1 animée par le ressort `snap`), désactivé, chargement (`aria-busy`) ; cible ≥ 44 px | « Erreur » non applicable à un bouton (portée des champs). Source lumineuse (35°, −25°) non implémentée. |
| C-04 StatusSeal | `components/StatusSeal.tsx` | 7 tons (or, émeraude, ambre, clay, violet, cyan, ardoise) ; anneau conique, glyphe (12 %), **libellé toujours visible** ; halo optionnel (`pulse`, un seul par écran) | Glyphe par défaut neutre. |
| C-19 StateGuard | `components/StateGuard.tsx` | 15 états (§12) ; glyphe, titre, explication, garanties (serveur seul), corrélation (format serveur seul), actions de sortie | Actions branchées sur la destination par défaut (pas de métier). |
| C-20 BottomDock | `components/BottomDock.tsx` | Verre 3 (EMP, PRE) ou surface solide (ADM, « sans verre décoratif ») ; entrée active `aria-current="page"` et indicateur morphing (`layoutId`, 420 ms, courbe labeur-inout) ; cibles ≥ 44 px ; libellés toujours visibles | Forme du dock en `border-radius` 34 px (pas de squircle tracé). |

Checklist du Master (« repos, survol/focus, pressé, chargement, erreur, vide ») : couverte pour le bouton, sauf « erreur » et « vide », non applicables à un bouton.

## 8. Verre (GlassSurface)

- Passes dans l'ordre : flou saturé, rim, grain, contenu. Repli opaque : `--surface-2` et grain.
- **Budget** : au plus `PERF.deepSurfacesMax` = 2 surfaces de flou > 24 px simultanées (niveaux 3 et 4). Le budget n'est réservé qu'au montage dans le navigateur (jamais pendant le rendu serveur) et libéré au démontage.
- **Mémoire** : `navigator.deviceMemory < 4` → verre opaque pour tous les niveaux (`opaque-lowmem`). Si l'API est absente, le verre reste natif.
- **Navigateur sans `backdrop-filter`** : règle `@supports not (…)` → verre opaque.
- Mesure navigateur (page `/fondation`, 1440 px) : verres des niveaux 1 à 4 ; les niveaux 3 et 4 sont natifs (2 surfaces profondes) ; le dock de démonstration (niveau 3, 3e surface profonde) passe en `opaque-budget`. Conforme.

## 9. Mouvement

- Quatre ressorts de `tokens.py`, appliqués via motion 12 (`type: 'spring'`) : snap 300 / 20 / 1,0 ; soft 240 / 26 / 1,0 ; heavy 180 / 28 / 1,2 ; pop 420 / 16 / 0,9.
- Réduction de mouvement : ressort remplacé par un fondu de 120 ms (durée « micro », courbe labeur-out) ; halos figés à 40 % ; squelettes statiques ; `animation: none` sur tout le shell.
- Halo du sceau : seul élément animé en boucle, alpha ≤ 0,20 (or 0,16 ; émeraude 0,14).
- Squelette : balayage 1 600 ms, valeur de la fiche SYS-01 ; jamais de spinner nu (SYS-01).
- Non implémenté : haptique (aucune intensité définie pour le Web), son (règles seulement), gyroscope.

## 10. Routage

### 10.1 Namespaces

| Chemin | Rendu | Remarque |
|---|---|---|
| `/` et tout chemin hors namespaces (dont `/accueil`, `/connexion`…) | **Legacy** (`App`, AppContext) | Inchangé. Les routes PUB de premier niveau restent sur le legacy jusqu'à leur intégration. |
| `/client/*` | Shell CLIENT (EMP) | Index `/client` (EMP-01) |
| `/prestataire/*` | Shell PRESTATAIRE (PRE) | Index `/prestataire` (PRE-01) |
| `/admin/*` | Shell ADMIN (ADM) | Index `/admin` (ADM-01) |
| `/appel/*` et `/appels` | Shell RTC | Index `/appels` (RTC-06). `/appels` est ajouté car la fiche le déclare hors de `/appel/*`. |
| `/etat/*` | Shell SYSTEM (SYS) | Index `/etat` ; une route par état |
| `/fondation/*` | Shell PUBLIC, **démonstration** | `/fondation` (index), `/fondation/public`. Hors périmètre produit. |

Règles : une racine de namespace (ex. `/appel`) n'est pas un écran → 404 de shell. Un chemin de namespace revendiqué par une unité → écran **NON INTÉGRÉ** (aucune fausse page métier). Autre chemin de namespace → 404 de shell (SYS-05). Une route de liste sans fiche propre se rattache à l'unité dont une route commence par ce préfixe (cas « Contrats »).

### 10.2 Chargement et historique
- `AppRouter` décide avec la table pure (`namespaceFor`) ; le chemin legacy ne charge ni shells, ni motion, ni données générées.
- Les shells sont chargés à la demande (`ShellRoute`, chunk séparé).
- Historique : `history.pushState`, événement de synchronisation, `popstate`. Le focus passe sur `<main>` à chaque changement de page.

### 10.3 Entrées de dock et routes

| Famille | Libellé | Route | Rattachement à la fiche |
|---|---|---|---|
| EMP | Accueil | `/client` | EMP-01 (exacte) |
| EMP | Missions | `/client/missions` | EMP-05 (exacte) |
| EMP | Contrats | `/client/contrats` | **Préfixe seulement** : EMP-29 `/client/contrats/:id` (aucune fiche de liste) |
| EMP | Argent | `/client/paiements` | EMP-41 (exacte) |
| EMP | Profil | `/client/profil` | EMP-03 (exacte) |
| PRE | Accueil | `/prestataire` | PRE-01 (exacte) |
| PRE | Missions | `/prestataire/missions` | PRE-05 (exacte) |
| PRE | Candidatures | `/prestataire/candidatures` | PRE-11 (exacte) |
| PRE | Salaire | `/prestataire/salaire` | PRE-32 (exacte) |
| PRE | Profil | `/prestataire/profil` | PRE-03 (exacte) |
| ADM | Flux | `/admin` | ADM-01 (exacte) — **rattachement à confirmer** |
| ADM | Files | `/admin/ops/queues` | ADM-44 (exacte) |
| ADM | Litiges | `/admin/litiges` | ADM-26 (exacte) |
| ADM | Sécu | `/admin/securite` | ADM-50 (exacte) |
| ADM | Infra | `/admin/infra` | ADM-57 (exacte) |

## 11. Shells

| Shell | Chrome (généré depuis `model.py` et `content/`) | Dock | Vérifié par |
|---|---|---|---|
| PUBLIC (PUB) | Glyphe `◇` seul (chrome minimal) | Aucun | tests et navigateur |
| CLIENT (EMP) | Appbar `LE LABEUR`, glyphe `◈` | 5 entrées, verre 3 | tests et navigateur |
| PRESTATAIRE (PRE) | Appbar `LE LABEUR`, glyphe `◉` | 5 entrées, verre 3 | tests et navigateur |
| ADMIN (ADM) | Appbar `SUPERVISION`, glyphe `◆` | 5 entrées, **surface solide** | tests et navigateur |
| RTC | Appbar `SESSION`, glyphe `◉` | Aucun (surface d'appel C-16 non implémentée) | tests et navigateur |
| SYSTEM (SYS) | Glyphe `▤` seul ; contenu = StateGuard | Aucun | tests et navigateur |

Chaque shell expose un lien d'évitement « Aller au contenu » et les repères `<header>`, `<main>`, `<nav>`.

## 12. StateGuard (C-19)

Titres, explications et actions proviennent de `design/llab/content/sys.py` via le catalogue généré. Libellés de repli absents de `sys.py` : « Revenir » (chargement, écran annulable), « Heure de reprise non communiquée. » (maintenance sans heure), « Copier » et « Copié ». Glyphes provisoires (`sys.py` n'en décrit pas) : chargement, maintenance, 425, limites.

| Code | Clé | Route | Titre (sys.py) | Action(s) de sortie (sys.py) | Explication factuelle |
|---|---|---|---|---|---|
| SYS-01 | `loading` | `/etat/chargement` | Chargement | *aucune dans sys.py — repli « Revenir »* | **NON DÉFINIE** dans sys.py |
| SYS-02 | `offline` | `/etat/hors-ligne` | Hors-ligne | « Réessayer » (pleine) · « Gérer la file d'envoi » (fantôme) · « Continuer hors-ligne » (texte) | Vous êtes hors ligne. |
| SYS-03 | `401` | `/etat/401` | 401 — Session expirée | « Se reconnecter » (pleine) · « Se reconnecter ailleurs » (fantôme) | Votre session a expiré. |
| SYS-04 | `403` | `/etat/403` | 403 — Accès refusé | « Demander un accès » (pleine) · « Retour à mon espace » (fantôme) | Vous n'avez pas accès à cet écran. |
| SYS-05 | `404` | `/etat/404` | 404 — Introuvable | « Retour à mon espace » (pleine) · « Signaler le lien » (fantôme) | Cette page n'existe pas ou a été déplacée. |
| SYS-06 | `409` | `/etat/409` | 409 — Conflit | « Fusionner mes changements » (pleine) · « Conserver la version serveur » (fantôme) · « Reprendre ma saisie » (texte) | Cette information a changé pendant que vous travailliez. |
| SYS-07 | `422` | `/etat/422` | 422 — Données invalides | « Corriger maintenant » (pleine) · « Enregistrer en brouillon » (fantôme) | Certaines informations doivent être corrigées. |
| SYS-08 | `429` | `/etat/429` | 429 — Trop de requêtes | « Réessayer automatiquement à la fin du délai » (pleine) · « Utiliser un autre moyen » (fantôme) | Trop de tentatives. |
| SYS-09 | `500` | `/etat/500` | 500 — Erreur serveur | « Réessayer » (pleine) · « Copier l'identifiant d'erreur » (fantôme) · « Contacter le support » (texte) | Une erreur de notre côté. |
| SYS-10 | `maintenance` | `/etat/maintenance` | Maintenance en cours | « Me prévenir à la reprise » (pleine) · « Voir la page de statut » (fantôme) | LE LABEUR revient à {heure}. (heure fournie par le serveur) |
| SYS-11 | `502` | `/etat/502` | 502 — Passerelle défaillante | « Être notifié quand c'est rétabli » (pleine) · « Utiliser un autre moyen » (fantôme) | Un service externe ne répond pas. |
| SYS-12 | `503` | `/etat/503` | 503 — Service indisponible | « Me notifier à mon tour » (pleine) · « Annuler ma demande » (fantôme) | Service momentanément saturé. |
| SYS-13 | `504` | `/etat/504` | 504 — Délai dépassé | « Me notifier » (pleine) · « Attendre ici » (fantôme) · « Annuler la tâche » (texte) | Cette opération prend plus de temps que prévu. |
| SYS-14 | `425` | `/etat/425` | 425 — Réseau instable (WebRTC) | « Passer en audio seul » (pleine) · « Continuer en texte » (fantôme) · « Replanifier » (texte) | Votre connexion ne permet pas la vidéo actuellement |
| SYS-15 | `limites` | `/etat/limites` | Limites & quotas | « Demander une dérogation » (pleine) · « Voir les règles détaillées » (fantôme) | **NON DÉFINIE** dans sys.py |

**Corrélation** : seul un identifiant **émis par le serveur** est affiché, dans l'un des trois formats réels : UUID (`error.requestId`, en-tête `x-request-id` ; `src/backend/api/worker.ts`), repli `req-<base36>-<base36>`, ou trace-id W3C de 32 hexadécimaux (SYS-09). Les identifiants d'entités (`usr_…`), les clés, les jetons, les DSN et les URL sont refusés et jamais rendus (14 valeurs testées). Aucun identifiant n'est lu depuis l'URL.

**Garanties** : affichées uniquement si le serveur les fournit. « Aucune donnée n'a été perdue » (SYS-09) n'est affirmée que si elle est vérifiée.

## 13. Accessibilité

| Exigence | Implémentation | Vérification |
|---|---|---|
| Focus visible | `:focus-visible` global : contour 2 px or, halo 4 px α 0,24 | Navigateur : premier Tab sur le lien d'évitement, contour `rgb(255,184,0)` 2 px, halo `rgba(255,184,0,0.24)` 4 px |
| Statut non porté par la couleur | Sceau = anneau, glyphe et **libellé** ; dock = icône, libellé, `aria-current`, indicateur de forme | Tests de rendu |
| Cibles tactiles | ≥ 44 px (mobile), ≥ 40 px (desktop) | Navigateur : dock 57 × 56 px à 360 px ; boutons 44 px de haut |
| Réduction de mouvement | CSS et JS (§9) | Navigateur : squelette `animation: none` ; halo figé à 0,4 |
| Contraste | Textes essentiels sur `--surface-0` : hi 18,7 ; mid 8,8 ; gold 14,5 ; sign 17,9 ; CTA 11,7 | Calcul WCAG (écarts en §4.4) |
| Décoratif `aria-hidden` | Grain, rim, halo, tracé squircle, glyphes des sceaux et icônes accompagnées de texte | Tests de rendu |
| Structure | Lien d'évitement ; `<main id="lbm-main" tabindex="-1">` focalisé à chaque changement de page ; `lang="fr"` (existant) | Navigateur et tests |
| Messages dynamiques | Squelette : `role="status"` et `aria-busy` ; bouton en traitement : libellé « Traitement en cours » | Tests de rendu |

Écarts ouverts : §4.4 (`--text-lo`, `--gold-200`, bordures < 3:1, `--clay-600`).

## 14. Performance

- Budgets du Master (`tokens.py`, `PERF`) : LCP < 800 ms (4G) ; interaction < 100 ms ; cadre 8,33 ms (120 Hz) ; 2 surfaces de flou > 24 px ; listes > 20 éléments virtualisées (à appliquer avec les écrans) ; verre opaque sous 4 Go de RAM.
- **Mesures réalisées** (`npm run build`) :

| Artefact | Référence | Final | Remarque |
|---|---:|---:|---|
| `index-*.js` (chemin legacy) | 801,78 ko (gz 201,41) | 806,18 ko (gz 203,20) | +4,40 ko : routeur et table de namespaces |
| `index-*.css` | 52,24 ko (gz 9,67) | 52,24 ko (gz 9,67) | Aucun CSS ajouté au legacy |
| `ShellRoute-*.js` (à la demande) | — | 207,14 ko (gz 65,05) | Shells, motion, lucide, composants |
| `ShellRoute-*.css` (à la demande) | — | 20,87 ko (gz 5,06) | Thème Master |
| Polices (à l'usage) | — | 7 fichiers, ~1,95 Mo | Jamais chargées par le legacy |

- **Non mesuré** : LCP, INP, fréquence d'images et mémoire, sur appareil réel et réseau 4G. Aucune de ces performances n'est promise.

## 15. Tests et vérifications

### 15.1 Suites ajoutées (56 tests, tous PASS)
- `src/design-system/foundation.test.tsx` (42) : génération à jour ; parité avec `tokens.py` (palette, ressorts, verre, typographie, grille, rayons, élévations) ; contraste des textes et des CTA ; focus ; responsive 360 px et 1440 px ; budget et mode du verre ; géométrie du squircle (équation vérifiée) ; mouvement et réduction de mouvement ; corrélation ; catalogue SYS = `sys.py` (titres, actions, explications) ; rendu des 15 états sans secret ; composants (rôles, états, cibles) ; shells (chrome, dock, lien d'évitement) ; pages de démonstration ; 120 unités ; garde-fou d'imports.
- `src/routing/routing.test.ts` (14) : legacy sur `/` et routes PUB ; bornes de préfixe ; normalisation ; index ; **toute route de fiche des namespaces résolue** (183 routes) ; unités et routes statiques prioritaires ; 404 de shell ; 15 états SYS ; dock ancré dans les fiches ; 0 / 120 intégrées.
- Enregistrées dans `scripts/run-tests.ts`, selon la convention du dépôt.

### 15.2 Validations finales

| Commande | Ligne de base | Résultat final |
|---|---|---|
| `npm test` | 1626/1626 PASS | **1682/1682 PASS** (1626 + 56), code 0 |
| `npm run verify:postgres` | 28/28 PASS | **28/28 PASS**, code 0 |
| `npm run verify:workerd` | 18/18 PASS | **18/18 PASS**, code 0 |
| `npm run build` | OK | **OK**, code 0 (même avertissement de taille qu'avant) |
| `npx tsc --noEmit` | ÉCHEC (29 erreurs dans `design/code/`) | **OK**, code 0 |
| `npm run design:tokens:check` | — | **OK** (5 fichiers générés à jour) |
| `git diff --check` | — | **Aucune erreur** |

`tsc` : `design/code/` est exclu du projet TypeScript (`tsconfig.json`, clé `exclude`). Aucun fichier de `design/` n'est modifié.

### 15.3 Vérification navigateur (hors dépôt)
Chromium 153 récupéré depuis le registre npm (paquet `@sparticuz/chromium`), dans `/tmp`, hors dépôt et hors CI. Build de production servi en prévisualisation.
- 22 pages à 360 × 780 et 1440 × 900 (`/client`, `/prestataire`, `/admin`, `/appels`, `/etat/401`, `/etat/chargement`, `/etat/425`, `/fondation`, `/fondation/public`, `/client/inconnu`, `/`) : **aucun débordement horizontal**, polices chargées, aucune erreur hors ressources externes du legacy (Google Fonts et Google Identity, inaccessibles depuis le sandbox).
- **Legacy identique** : DOM et captures d'écran de `/` identiques octet pour octet entre la référence et la version finale, y compris après une visite de `/client` suivie d'un retour à `/`.
- Navigation SPA : `/fondation` vers `/fondation/public` sans rechargement, focus déplacé sur `<main>`.

## 16. Fichiers

### 16.1 Créés (35)
- `docs/P0-DESIGN-FOUNDATION.md` (ce document)
- `scripts/design/generate-frontend-tokens.py`
- `src/design-system/` : `tokens.ts`, `motion.ts`, `glass.ts`, `correlation.ts`, `squircle.ts`, `foundation.test.tsx` ; `generated/` (`tokens.ts`, `tokens.css`, `stateGuardCatalog.ts`, `chrome.ts`, `productionUnits.ts`) ; `components/` (`cx.ts`, `GlassSurface.tsx`, `SquircleCard.tsx`, `NeoPressButton.tsx`, `StatusSeal.tsx`, `StateGuard.tsx`, `BottomDock.tsx`, `index.ts`) ; `shells/` (`ShellFrame.tsx`, `shells.tsx`, `shellNavigation.ts`, `ShellRoute.tsx`) ; `theme/` (`fonts.css`, `master.css`, `theme.css`) ; `demo/FoundationPages.tsx`
- `src/routing/` : `routes.ts`, `resolveRoute.ts`, `navigation.tsx`, `integration.ts`, `AppRouter.tsx`, `routing.test.ts`

### 16.2 Modifiés (4)
- `src/main.tsx` : rend `AppRouter` au lieu de `App` (le routeur rend le legacy sur `/`).
- `scripts/run-tests.ts` : deux imports et deux suites.
- `package.json` : deux scripts (`design:tokens`, `design:tokens:check`). **Aucune dépendance ajoutée.**
- `tsconfig.json` : clé `exclude` (`design/code`).

### 16.3 Non modifiés (vérifié)
`src/App.tsx`, `src/context/*`, `src/screens/*`, `src/components/*` (legacy), `src/index.css`, `src/backend/*`, `migrations/*`, `src/domain/*`, `src/repositories/*`, `design/*`, `scripts/migrate.ts`, `scripts/verify-*.ts`.

## 17. Backend, migrations, API, modèle financier

- **Backend modifié : non.** Aucun fichier de `src/backend/` ni de `migrations/` n'est touché.
- **Migrations : aucune.**
- **API ajoutées : aucune.** Les routes `/v1/...` citées par les fiches ne sont pas implémentées.
- **Modèle financier : BLOQUÉ — décision non prise.** `PriceBreakdown` (C-05) **n'est pas implémenté**. La commission, les paiements, les contrats et les migrations ne sont pas modifiés. Aucune règle économique n'est décidée.

## 18. Problèmes rencontrés et adaptations

| # | Constat | Traitement |
|---|---|---|
| A1 | `npm install` en échec ERESOLVE (préexistant) | `npm install --legacy-peer-deps` pour l'environnement de travail ; **aucune dépendance modifiée** |
| A2 | `tsc --noEmit` échouait déjà (29 erreurs dans `design/code/particles.ts`, code RN/Expo non compilable) | `design/code` exclu du projet TypeScript ; fichier de référence non modifié |
| A3 | Tailwind v4 utilise `--font-mono` pour la classe `font-mono` (222 usages legacy) | Familles renommées `--family-*` ; legacy vérifié identique |
| A4 | Seuils de grille absents de `tokens.py` | Seuils provisoires 768 et 1024 px (Tailwind), signalés |
| A5 | Dock « Contrats » : aucune fiche de liste | Rattachement par préfixe à EMP-29 |
| A6 | Racine `/appel` : aucune fiche | 404 de shell (jamais une fausse unité) |
| A7 | `/appels` (RTC-06) hors de `/appel/*` | Namespace RTC étendu à `/appels` |
| A8 | PUB : routes de premier niveau (`/accueil`, `/connexion`…), sans namespace | Restent sur le legacy (pas de remplacement de `/`) |
| A9 | Glyphes absents de `sys.py` pour 4 états | Glyphes provisoires, signalés |
| A10 | Le Master recommande Next.js 15 pour le Web | Consigne de la mission : SPA Vite conservée |
| A11 | Le Master décrit des routes `/v1/...` pour les états | Non implémentées (aucune nouvelle API) |
| A12 | Premier filtre de corrélation trop large (acceptait toute chaîne alphanumérique) | Resserré aux trois formats serveur réels ; lecture d'URL retirée |
| A13 | `--text-lo` non conforme à sa propre affirmation | Non utilisé pour du texte essentiel ; écart documenté (§4.4) |

## 19. Points restant ouverts (décisions requises)

1. **Contraste** : `--text-lo` (4,07:1), texte des CTA or, bordures de contrôle (< 3:1), `--clay-600` : arbitrage design.
2. **Seuils de grille** : 768 et 1024 px provisoires ; arbitrage design.
3. **Glyphes** : chargement, maintenance, 425, limites ; et rattachement de « Flux » (dock ADM) à confirmer.
4. **Licences** : ajouter les textes OFL des trois familles dans le dépôt.
5. **Polices** : retirer Google Fonts du legacy lors de la migration ; WOFF2 et sous-ensemble à mesurer.
6. **Gyroscope** (C-01, C-02, C-03) : non implémenté (permissions et mesure réelle requises).
7. **Mesure réelle** : LCP, INP, fréquence d'images et mémoire sur les appareils cibles.
8. **Jeton `--table`** : non défini dans la source.
9. **Squircle de rayon 18** : cité dans `MATERIALS` sans jeton.
10. **Legacy** : `AndroidBottomNav` (5 onglets) à remplacer ; `AppContext` conservé jusqu'à la migration des écrans ; routes PUB de premier niveau à rattacher.
11. **Installation** : `--legacy-peer-deps` requis (conflit esbuild / vite 8) ; lockfile non versionné (choix du dépôt).
12. **Corrélation** : absente des pages de démonstration ; à brancher sur `error.requestId` lors de l'intégration des écrans.
13. **Actions de sortie** : branchées sur la destination par défaut ; câblage métier lors de l'intégration des écrans.
14. **`units.py`** : docstring « 176 » à corriger (calcul = 177).

## 20. Écrans

- **Intégrés : aucun écran de production.** Sont livrés : les six shells, le routage, le catalogue StateGuard (15 états rendus), et les pages de démonstration `/fondation`.
- **Volontairement non intégrés : les 120 unités de production** (aucune n'appartient à `INTEGRATED_UNIT_IDS`). FIN n'est pas un écran : composant transversal bloqué par le modèle financier.

| Famille | Unités | Première unité → route | Dernière unité → route |
|---|---:|---|---|
| PUB | 10 | PUB-01 `/` | PUB-10 `/maintenance` |
| EMP | 32 | EMP-01 `/client` | EMP-59 `/client/missions/:id/remplacement/confirmation` |
| PRE | 26 | PRE-01 `/prestataire` | PRE-48 `/prestataire/documents` |
| ADM | 34 | ADM-01 `/admin` | ADM-63 `/admin/infra/statut` |
| RTC | 5 | RTC-01 `/appel/:id/preparation` | RTC-08 `/appel/:id/consentement` |
| SYS | 10 | SYS-01 `/etat/chargement` | SYS-14 `/etat/425` |
| FIN | 3 | FIN-01 `—` | FIN-03 `—` |
| **Total** | **120** | | |
