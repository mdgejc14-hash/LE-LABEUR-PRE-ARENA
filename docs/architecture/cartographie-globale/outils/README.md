# Outils de la cartographie

Les deux scripts sont **en lecture seule** vis-à-vis du code applicatif : ils n'écrivent que dans ce dossier
(`donnees/`, `C2-contrats-api.md`, `D-matrice-ecrans-api.md`, blocs de diagrammes des `.md`). Ils sont en Python pour ne pas être
inclus dans la vérification TypeScript du dépôt (`tsconfig.json` sans `include`).

## `cartographie.py` — extraction et génération

```bash
npm install --no-audit --no-fund --legacy-peer-deps   # requis : tsx, PGlite (voir G-INF-07)
python3 docs/architecture/cartographie-globale/outils/cartographie.py               # régénère tout
python3 docs/architecture/cartographie-globale/outils/cartographie.py --diagrammes  # recopie seulement les .mmd dans les .md
```

Étapes : (1) chargement des modules TypeScript réels via `npx tsx` et un script temporaire **hors dépôt** (catalogues générés,
registres, contrats, `integration.ts`, `resolveRoute`) ; (2) **sonde** : `composeWorker` réel en quatre compositions (fermée, mémoire,
PostgreSQL PGlite + migrations 0001–0018, PostgreSQL + stockage objet en mémoire) et appel des 160 contrats avec un acteur satisfaisant
la garde — « handler atteint » = toute réponse autre que 501 `NOT_IMPLEMENTED` ; (3) analyse statique (fabriques de handlers, `src/*/api.ts`,
composants, hooks, liens, tests) ; (4) écriture de `donnees/*.json`, C2 et D ; (5) recopie des diagrammes.

Contrôles affichés : `staticVsDynamicHandlerMismatch` (attendu `[]`), `rateLimitOrphans`, chemins frontend sans contrat (attendu 0),
appels legacy sans contrat, `routeResolutionMismatch` (attendu 0).

Relevés manuels documentés dans le script : `PUB_LINKS`, `PUB_STATUS`, `PUB_EXIT` (page publique unique), `DYNAMIC_CALLS`
(`uploadDocumentContent`, URL fournie par le grant).

## `verifier_liens.py` — cohérence des références

```bash
python3 docs/architecture/cartographie-globale/outils/verifier_liens.py
```

Vérifie que chaque référence `fichier:ligne` des `.md`/`.mmd` désigne un fichier suivi par Git (chemin ou nom de base unique) et une
ligne existante, que les liens relatifs et les blocs de diagrammes sont valides, et liste les notations `domaine.action` absentes des
contrats (informatif). Il **ne vérifie pas** que la ligne citée contient le symbole : ce contrôle a été fait par échantillonnage
(00-INDEX §8).

## Export SVG des diagrammes (procédé utilisé, hors dépôt)

Mermaid 11 installé dans un répertoire temporaire (`/tmp/mmd`, `npm install mermaid@11`), rendu dans le Chromium de
`@sparticuz/chromium` déjà utilisé par `scripts/verify-*-ui.ts` (bibliothèques extraites dans `.tmp/p1-chromium`, ignoré par Git) via
`playwright-core` : `mermaid.parse()` puis `mermaid.render()` pour chaque `.mmd`, écriture dans `diagrammes/svg/`.
