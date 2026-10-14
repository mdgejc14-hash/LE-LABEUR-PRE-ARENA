# I — Registre des décisions réservées au propriétaire

> Ces points ne peuvent pas être tranchés par le code ni par cet audit : ce sont des incohérences entre design et backend, des parcours
> non définis, ou des choix métier, juridiques ou d'exploitation. **Aucune option n'est retenue ici.** Chaque entrée cite ses preuves
> et les écarts (G) qui en dépendent.

## 1. FIN — domaine bloqué (priorité absolue)

**Statut imposé : `BLOQUÉ_EN_ATTENTE_DÉCISION`.** Les unités FIN-01…03 restent sans route (`integration.ts` : 3 `NON_INTEGRE`).
Aucun taux, frais, commission, écriture comptable ou mécanisme de paiement n'est modifié ni recommandé.

| ID | Question | Constat (sans décision) | Preuves |
|---|---|---|---|
| I-FIN-01 | Quel modèle de rémunération de la plateforme fait foi ? | Trois modèles incompatibles coexistent (E §6) : commission backend de **25 % du premier mois** ; frais SaaS **ajoutés** au prix (Master `PriceBreakdown`, exemple 10 %) ; exemple public 250 000 + 25 000 F | `0003` l.112 ; `contractRepository.ts:734` ; `businessRules.ts:22,53,61` ; `contractActivation.ts:171` ; `paymentRepository.ts:1895` ; `design/code/PriceBreakdown.tsx` ; `PublicPage.tsx:149-153` |
| I-FIN-02 | L'exemple de prix affiché publiquement (PUB-02) peut-il rester en ligne ? | Codé en dur ; contredit la règle backend des 25 % | `src/public/PublicPage.tsx:149-153` |
| I-FIN-03 | Règle « 25 % sur le premier salaire » : base, assiette, exigibilité, débiteur | **Réservée à l'audit du propriétaire** ; aucune interprétation produite | idem I-FIN-01 |
| I-FIN-04 | Acompte / solde (30 % / 70 % du Master) : applicable ? | Aucune trace backend | `design/code/PriceBreakdown.tsx` |
| I-FIN-05 | Fournisseur(s) de paiement, rapprochement, webhooks | Ports présents, aucun fournisseur enregistré | `paymentRepository.ts:2871-2908`, migrations 0008–0010 |
| I-FIN-06 | Contenu des écrans FIN-01…03 et rattachement aux écrans EMP-41…47 / PRE-34…39 / ADM-18…25 | Aucun écran FIN routé | `productionUnits.ts` (FIN sans routes) |

## 2. Parcours et règles métier

| ID | Décision attendue | Constat | Preuves | Écarts liés |
|---|---|---|---|---|
| I-DEC-01 | Terminologie : « Client » / « Employeur », « Prestataire » / « Candidat », « Claim » / « Litige » / « Réclamation » | Rôles serveur `EMPLOYER`/`CANDIDATE` ; espaces `/client`, `/prestataire` ; vocabulaire produit par famille | `src/employer/vocabulary.ts`, `PRODUCT_LABELS`, `0001:9` | — |
| I-DEC-02 | Parcours d'inscription : canal (Google seul ? téléphone ? OTP ?), choix du rôle, statut `PENDING` | Inscription publique désactivée ; `intent=register` crée un compte actif sans vérification | `src/public/gaps.ts`, `PublicPage.tsx:274` | G-BE-03, G-SEC-04 |
| I-DEC-03 | Consentements : contenu, versionnement, moment (inscription, matching, signature, appel) | Aucune table ni contrat ; matching sans consentement ; signature sans corps | E §1 ; `sqlMatchingStores.ts:254-262` | G-LEG-02, G-BE-06 |
| I-DEC-04 | Navigation legacy → espaces Master Design : quelle application est la cible post-connexion ? | Connexion → `/` legacy ; aucun lien vers `/client`, `/prestataire`, `/admin` | `PublicPage.tsx:227`, `AppRouter.tsx:28` | G-FE-01 |
| I-DEC-05 | Messagerie encadrée : existe-t-elle ? Une proposition doit-elle être rattachée à une conversation ? | `conversation_id` obligatoire mais non vérifié ; aucune table de messagerie | `0004:23`, `proposalRepository.ts:530-531` | G-BE-02, G-BE-05 |
| I-DEC-06 | Déclencheur de l'activation du contrat (manuel employeur, automatique après double signature, ADMIN ?) | `ACTIVATE` réservé à `EMPLOYER` depuis `SIGNATURE` ; aucun écran ne l'appelle | `contractTransitions.ts:167-172` | G-FE-03 |
| I-DEC-07 | Responsabilités ADMIN : profils (modération, finance, sécurité), séparation des permissions | 24 permissions toutes attribuées à ADMIN ; regroupements grossiers | `0002`, E §3 | G-SEC-01 |
| I-DEC-08 | Mode par défaut : DEMO ou API ; politique de données de démonstration en production | DEMO par défaut | `mode.ts:25-35` | G-FE-08 |
| I-DEC-09 | Arbitrage des litiges : délais, pièces, issues (`REPLACE`), restrictions, statut `CLOSED` | Machine à états présente ; `CLOSED` sans transition ; restrictions sans écran | `claimRepository.ts`, `0011` | G-BE-04, G-FE-12 |
| I-DEC-10 | Remplacement : qui affecte / transfère / finalise ? | Contrats ADMIN 501 ; chemin employeur via proposition (non câblé) | diagramme 12 | G-BE-07, G-FE-04 |
| I-DEC-11 | Réputation : sources, contestation (via claim `OTHER_REVIEW_REQUIRED`), visibilité | Ledger append-only alimenté par `SALARY_CONFIRMED` / `CLAIM_RESOLVED` | `reputationAutomation.ts` | — |
| I-DEC-12 | Matching : critères (60/30/10), plafond 200, consentement, prise en compte de la réputation | Implémenté tel quel ; aucun choix validé documenté | C §6 | G-BE-06 |
| I-DEC-13 | Statuts de schéma sans transition (contrat `PENDING_*`, `INCIDENT`, `SUSPENDED` ; proposition `DRAFT`, `REVISION_REQUESTED` ; utilisateur `PENDING`) | À conserver, implémenter ou retirer | E §2 | G-BE-04 |
| I-DEC-14 | RTC : périmètre (appel lié au contrat actif uniquement ?), TURN, enregistrement, consentement d'appel | Signalisation non câblée ; aucun TURN | `webrtcRepository.ts:548,824` | G-FE-05, G-INF-06 |
| I-DEC-15 | Écrans ADMIN Ops / Sécurité / Infra (ADM-44…63) : quelles données réelles exposer ? | 20 écrans diagnostiques sans contrat | D | G-BE-07, G-OPS-01 |

## 3. Juridique, infrastructure, Git

| ID | Décision attendue | Constat | Preuves |
|---|---|---|---|
| I-LEG-01 | Durées de rétention documentaire | `PENDING_LEGAL_VALIDATION` | `0016_documents.sql:90` |
| I-LEG-02 | Textes légaux (CGU, confidentialité) et preuve d'acceptation | `/legal/documents`, `/legal/consent` absents | `src/public/gaps.ts:44-46` |
| I-INF-01 | Ressources de production : Google client ID, Hyperdrive, R2, hébergement frontend + proxy same-origin, fournisseurs push/email/SMS/paiement, TURN | Aucune ressource déclarée en production | `wrangler.toml`, E §5 |
| I-INF-02 | Rate limiting global (au-delà de l'isolat) | En mémoire par isolat | `security.ts:189-198` |
| I-GIT-01 | Stratégie d'intégration de la pile #47–#71 et de `main` (2 commits `code/*` hors lignée) ; sort de #47 (`43aa2a4`) vs `b551445` | Aucune PR fusionnée | H |
| I-DES-01 | Route canonique de PUB-01 (`/` Master vs `/ouverture`) et coexistence avec le legacy | `/` occupé par le legacy | `src/public/catalog.ts` |
