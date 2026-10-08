# P1-DESIGN-PUBLIC-AUTH — livraison partielle et contrôlée

## Base, périmètre et migration

- Checkpoint exact : `b5514454bd44deec8aca5981c67de3b8e781bdb2`.
- Branche de session imposée : `arena/6adc3a12-le-labeur-pre-arena` (pas la branche recommandée).
- La branche cible `arena/ca5d5604-le-labeur-pre-arena` n'est pas modifiée. PR #47 non mergée.
- `/` reste l'application legacy ; le splash est volontairement opt-in sur `/ouverture`.
- Seules les dix routes exactes PUB rejoignent la fondation existante. Aucun nouveau namespace métier, aucune redirection vers EMP/PRE/ADM.
- Après connexion, retour à `/` : le pont legacy relit la session serveur et choisit son parcours. Pas de rôle autoritaire dans l'URL ni de copie de cookie.
- Retour arrière/avant et liens modifiés conservent le comportement de navigation P0.

## Source de vérité

`design/llab/content/pub.py`, `sys.py`, `tokens.py`, `model.py`, `units.py` sont inchangés.
`src/public/catalog.ts` est généré depuis PUB ; il conserve routes canoniques, zones, tokens et API **décrites** (pas un catalogue de capacités serveur).
`npm run design:public:check` détecte toute désynchronisation. Le catalogue SYS et les tokens P0 restent inchangés.

Les messages d'indisponibilité constituent des notices techniques de migration, pas du nouveau contenu produit présenté comme canonique.
L'exemple de prix PUB-02 est une transcription statique des trois lignes de la fiche : aucun calcul, aucun appel de paiement, aucune modification de commission. FIN-01/02/03 non intégrés.

## État honnête des dix unités PUB

Toutes sont marquées `PARTIEL` dans le registre, pas `INTEGRE`. Une route disponible ne vaut pas une fiche entièrement livrée.

| État / route | Livré | Limites / zones non raccordées |
|---|---|---|
| PUB-01 `/ouverture` | PublicShell, sceau C-04, progression accessible, tap/Continuer clavier, délai max 1600 ms, fondu réduit 120 ms, session existante, offline | Forge/GLSL/C-14/C-15 non livrés. Une session non résolue dans le budget ne bloque pas l'accueil. Session confirmée : retour legacy, pas de nouveaux espaces métier. |
| PUB-02 `/accueil` | Hero canonique, trio GlassSurface, trois actes SquircleCard, exemple de prix statique, double entrée, liens légaux | Pas de miniatures produit inventées ni de statistiques ; pas de particules ni parallaxe. |
| PUB-03 `/onboarding/profil` | Deux profils radio clavier, sceaux or/émeraude, CTA différé, verrou 400 ms, préférence temporaire | Pas d'API onboarding/role-policy. La préférence prépare la demande seulement ; aucune modification de rôle ni promesse de modification sous 30 jours. |
| PUB-04 `/connexion` | Google existant, choix du profil demandé, chargement annulable, verrou de soumission, délai maximum 30 s, erreurs SYS, sortie legacy | **Écart à la fiche** : pas de backend password/magic-link/throttle-status. Pas de faux formulaire mot de passe, faux CAPTCHA ou compteur inventé. Google exige la configuration API et client ID réels. |
| PUB-05 `/inscription` | Route, titre, profil, notice, sorties connexion/profil | Inscription canonique bloquée : téléphone/OTP et consentement légal versionné absents. Le backend Google permet aussi `register`, mais ce CTA n'est pas activé sans le consentement exigé par la fiche. Pas de collecte inutile de secrets ni faux consentement local. |
| PUB-06 `/verifier-otp` | Route, titre, notice sécurité, sortie inscription | OTP d'authentification absent ; ne pas détourner l'OTP salaire. Aucun code envoyé, champ, compte à rebours ou succès simulé. |
| PUB-07 `/recuperation` | Route, titre, notice neutre, retour connexion | API recovery absentes : aucun identifiant collecté, canal vérifié inventé ou faux envoi. |
| PUB-08 `/legal` | Route, titre, notice de document indisponible | Aucun texte légal réel fourni, API/version/hash/consent absents : pas de document fictif v3.2, faux PDF ou consentement. |
| PUB-09 `/compte-bloque` | StateGuard 403 C-19, sortie publique, logout existant si API configurée | Une URL n'est pas preuve de suspension. Pas de motif/durée inventé, de fausse contestation ni d'export factice. |
| PUB-10 `/maintenance` | StateGuard maintenance, heure non communiquée, sortie | Pas d'API status/window/services ; pas de compte à rebours, frise de progression, abonnement notification ou garantie non vérifiée. Pas de changement du Worker de service statique. |

## SYS — quinze états / dix unités

Les quinze routes de la fondation restent celles de `sys.py` : chargement, hors-ligne, 401, 403, 404, 409, 422, 425, 429, 500, 502, 503, 504, maintenance et limites.

- Réutilisation de C-19 : glyphe P0, titre et message issus du catalogue, corrélation filtrée avec les formats serveur existants.
- Nouvelle prop optionnelle `actions` pour ne proposer que des sorties réalisables ; les démos P0 conservent leur catalogue quand cette prop est omise.
- En production PUB/SYS : « Revenir » effectif ; 401 propose `/connexion`. Les messages API bruts, détails sensibles et corrélations invalides ne sont jamais rendus.
- Les échecs HTTP du flux Google utilisent ces états sans déduire un blocage permanent d'un simple 403.
- Pas d'action « Me notifier », « Gérer la file », « Demander une dérogation » ou « Passer en audio » si aucun service correspondant n'est raccordé.
- Pas de file d'attente, brouillon chiffré hors-ligne, progression asynchrone, quotas, RTC profond ou formulaire métier ajouté. Ces fiches restent donc `PARTIEL`.

## Auth et frontière backend

Appels effectifs : `GET /api/v1/auth/session`, `POST /api/v1/auth/google/credential`, `POST /api/v1/auth/logout`, préfixés par la configuration same-origin existante.
Cookie HttpOnly géré par le navigateur (`credentials: include`), réponse serveur autoritaire, aucune persistance de credential. Seul le profil demandé est mémorisé en sessionStorage et validé contre deux valeurs ; ce n'est pas une permission.

Correction **frontend** de `HttpApiClient` : liaison de `fetch` à `globalThis`. Chromium a révélé une `Illegal invocation` lors de son appel comme membre de classe ; les tests injectés seuls ne détectaient pas cette panne réelle. Aucun changement de contrat HTTP, de sécurité serveur, de session backend ou RBAC.

Aucun fichier backend, migration, paiement, contrat, candidature, proposition, matching, claim, remplacement, réputation, document, notification, Cron/Queue modifié.
Aucune API ajoutée.

## Design, accessibilité et mouvement

- C-01, C-02, C-03, C-04 et C-19, PublicShell/SystemShell et thème P0 réutilisés ; CSS limité à la composition des pages.
- C-20 demeure celui de P0, **sans dock sur PUB/SYS**, conformément à CHROME_PUB/CHROME_SYS. Aucun second dock ou deuxième bibliothèque.
- Titres, landmarks, lien d'évitement, focus sur `lbm-main`, radio natif au clavier, CTA désactivés explicites, alertes génériques, cibles de 44 px.
- Grilles à une colonne sur mobile, trois actes sur desktop, chiffres tabulaires. Tests Chromium sans débordement à 360 et 1440 px.
- Motion P0 (`soft`, `heavy`, boutons `snap`) ; reduced-motion supprime le déplacement et remplace les ressorts par un fondu de 120 ms. Pas d'animation infinie.
- Tests techniques, pas de certification WCAG ni audit manuel lecteur d'écran complet.

## Vérification reproductible

Installation : `npm install --legacy-peer-deps` (conflit peer **préexistant** entre esbuild ^0.25 et Vite 8 ; versions métier inchangées).

- `npm test` : suites existantes + `runPublicTests` (catalogue Python, routes opt-in, 15 rendus SYS, masquage, auth/API, rôle serveur, erreurs).
- `npm run verify:public-ui` : vrai Chromium, fixtures Google/HTTP locales, 18 groupes de contrôles dont 4 matrices PUB/SYS × largeur × reduced-motion, navigation clavier/back, boot/offline, 10 erreurs API, double soumission, pont legacy.
- Ce test est autonome : serveur Vite temporaire fermé en `finally`, Chromium Linux et bibliothèques issus du paquet npm, fichiers sous `.tmp/` ignoré. `CHROMIUM_PATH` permet un navigateur installé. Aucun téléchargement de navigateur hors npm.
- `UI_CHECK` filtre les groupes pour diagnostic seulement ; la validation finale utilise la suite complète sans filtre.
- Les fixtures ne prouvent **pas** une connexion Google réelle. Aucun compte réel ni credential Cloudflare utilisé.
- `npm run verify:postgres`, `npm run verify:workerd`, `npm run build`, `npx tsc --noEmit`, `git diff --check` exécutés ; résultats dans le rapport final.

## Points ouverts avant validation complète P1

1. Arbitrer les contrats auth/password/OTP/recovery/legal/onboarding/block-status/status absents, dans une mission autorisant ces dépendances. Ne pas les créer dans cette PR.
2. Fournir les documents légaux approuvés et le consentement versionné avant d'activer l'inscription canonique.
3. Livrer les motions/miniatures de PUB-01/02 manquantes sans inventer les écrans métier.
4. Vérifier Google réel dans un environnement configuré, puis tests de parcours avec données serveur réelles.
5. Revue design et accessibilité manuelle. Cette PR ne prétend pas clore toute la mission P1.

EMP/PRE/ADM : NON INTÉGRÉS. FIN : NON INTÉGRÉ. PR à laisser NON MERGÉE.

## Résultats constatés le 2026-10-08

| Commande | Résultat |
|---|---|
| `npm test` | **1702/1702 PASS**, dont 20 nouveaux contrôles P1 |
| `npm run verify:postgres` | **28/28 PASS**, PostgreSQL serveur local |
| `npm run verify:workerd` | **18/18 PASS**, workerd local + PostgreSQL local |
| `npm run build` | **PASS** ; avertissement de chunk > 500 kB |
| `npx tsc --noEmit` | **PASS** |
| `git diff --check` | **PASS** |
| `npm run verify:public-ui` | **18/18 PASS** ; matrice visuelle **4/4** rejouée après ajustement final des espacements et boutons primaires |
| `npm run design:tokens:check` | **PASS**, 5 fichiers P0 à jour |
| `npm run design:public:check` | **PASS** |

La suite `npm test` a dépassé la fenêtre d'attente de l'outil lors d'une exécution parallèle : le même processus a terminé ensuite avec 1702/1702 PASS ; aucune seconde exécution concurrente n'a été lancée.
Les premiers essais ont échoué sur un identifiant de corrélation de test invalide, les bibliothèques Chromium absentes et le `fetch` non lié. Ils ont été corrigés et les suites ci-dessus réellement réexécutées.
