# D0 — Méthode et légende de la matrice écrans ↔ API

La matrice [`D-matrice-ecrans-api.md`](D-matrice-ecrans-api.md) est **générée** par [`outils/cartographie.py`](outils/README.md) à partir du
code (aucune saisie manuelle de liaison, sauf les relevés signalés ci-dessous). Elle couvre les **211 fiches** (états) du Master Design :
PUB 10 · EMP 60 · PRE 52 · ADM 63 · RTC 8 · SYS 15 · FIN 3. Les données brutes sont dans `donnees/ecrans.json`.

## 1. Colonnes (correspondance avec la demande)

| Colonne D | Contenu demandé | Source dans le code |
|---|---|---|
| Fiche | famille et identifiant de fiche | `design/llab/content/*.py` (`load_all`) |
| Unité | unité de production | `PRODUCTION_UNITS` (`src/design-system/generated/productionUnits.ts`) |
| Titre canonique (Master) | titre canonique | contenu design (`canon`) |
| Route frontend | route de la fiche | `PRODUCTION_UNITS[].routes`, `src/public/catalog.ts` ; vérifiée par `resolveRoute` (0 écart route ≠ fiche) |
| Composant enregistré | composant + fichier:ligne | `src/*/registry.tsx` (`*_SCREEN_COMPONENTS`), déclaration de la fonction |
| Transitions sortantes | liens `href` / `navigate` du composant, cible résolue (fiche, écran de repli ou 404) | analyse du corps du composant + `resolveRoute` |
| API appelée | méthode du client → verbe + chemin | appels `api.x(` / `api!.x(` dans le composant, ses fonctions locales et hooks ; `src/*/api.ts` |
| Contrat | clé `API_ROUTE_CONTRACTS` | appariement verbe + chemin (`routeContracts.ts`) — 0 chemin frontend sans contrat |
| Handler | fichier:ligne du handler | fabriques de handlers (analyse statique) confirmées par la sonde |
| Accès | portée, rôles, permission | contrat de route |
| Service & données | fonctions de repository appelées par le handler | corps du handler |
| Tests | fichiers de test citant le code de fiche | `**/*.test.ts(x)`, `scripts/verify-*.ts` |
| Statut réel | voir §2 | règle `screen_status()` de l'outil |
| BACKEND_GAP & cause | gaps déclarés par la fiche | `src/*/gaps.ts`, `src/public/gaps.ts` |

Relevés manuels (justifiés ligne à ligne dans l'outil) : liens et appels PUB (`PUB_LINKS`, `PublicPage.tsx`), statut PUB (`PUB_STATUS`),
appel dynamique `uploadDocumentContent` (`DYNAMIC_CALLS`, URL fournie par le grant, `src/prestataire/api.ts:392`).

## 2. Légende des statuts

**Aucune fiche n'est déclarée « COMPLET »** : même raccordée, une fiche dépend d'une composition serveur non configurée dans le dépôt
(G-INF-01) et de BACKEND_GAP déclarés.

| Statut | Règle | Nombre |
|---|---|---|
| `RACCORDÉ_PARTIEL` | le composant appelle au moins un contrat dont le handler est atteint (sonde PostgreSQL + stockage objet) ; la note précise les contrats 501 et les exigences (PostgreSQL, stockage objet) | EMP 58 · PRE 50 · ADM 29 · RTC 8 · PUB 3 = **148** |
| `FRONTEND_PARTIEL` | composant présent mais aucun appel API, ou uniquement des contrats 501 | EMP 2 · PRE 2 · ADM 34 · PUB 4 = **42** |
| `NON_IMPLÉMENTÉ` | route du design sans capacité (boutons désactivés, aucun contrat) | PUB 3 (PUB-06, 07, 08) |
| `ÉTAT_FRONTEND` | écran d'état système rendu par `StateGuard` (pas d'API par nature) | SYS 15 |
| `BLOQUÉ_EN_ATTENTE_DÉCISION` | domaine FIN, aucune route ni composant ; décision propriétaire | FIN 3 |
| `NON_VÉRIFIÉ` | réservé aux liaisons non établissables ; non utilisé dans la matrice actuelle | 0 |

Total : 148 + 42 + 3 + 15 + 3 = **211**.

## 3. Limites propres à la matrice

* Une API « appelée » signifie « présente dans le code du composant » (analyse statique), pas « exécutée dans un parcours testé ».
* Les liens construits dynamiquement (ex. `notification.linkRef.screen` d'EMP-02) sont signalés tels quels.
* Le rattachement d'un test à une fiche se fait par citation du code de fiche ; il ne prouve pas que le test couvre toute la fiche.
* Le contrôle de cohérence des références (fichiers, lignes, liens) est fait par `outils/verifier_liens.py` (00-INDEX §8).
