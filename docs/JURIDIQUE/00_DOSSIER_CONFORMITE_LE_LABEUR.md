# LE LABEUR — Dossier de conformité Bénin (loi, vocabulaire, méthode)

**Version :** 1.0 — 14 octobre 2026
**Objet :** permettre à LE LABEUR de lancer son application au Bénin **sans amende, sans blocage administratif et sans requalification**, en réécrivant intégralement le cahier d'exécution en méthode conforme, avec le vocabulaire officiel, les actes juridiques à produire, les preuves à conserver et les garde-fous produit.
**Public :** propriétaire, direction produit, ingénieurs, référent conformité.
**Statut :** note d'orientation juridique interne (voir §15 « Ce que ce document ne peut pas garantir »).

**Documents liés :**
- `docs/JURIDIQUE/01_LEXIQUE_ET_MICROCOPY.md` — vocabulaire officiel, lexique interdit, microcopie prête à intégrer.
- `docs/JURIDIQUE/02_PACK_DEMARCHES_ET_MODELES_BENIN.md` — démarches (APIEx, DGI, e-MECeF, APDP), registre des traitements, modèles de courriers et de clauses.

**Légende des références :** `[V]` = vérifié sur source publique fiable (texte de loi, portail d'État, OIT, OHADA, BCÉAO, DGI, APDP) ; `[C]` = à confirmer par un avocat/comptable local avant usage engageant.

---

## 0. Réponse directe à la question posée

**Question posée :** « Peut-on commencer tout de suite, ne rien payer, ne pas se lier administrativement, et se faire enregistrer plus tard après avoir gagné ? »

**Réponse honnête, en cinq points :**

1. **Oui, on peut lancer presque tout de suite** — mais pas en exerçant en dehors du droit. Au Bénin, la légalisation d'une activité coûte **10 000 FCFA (entreprise individuelle) à 17 000 FCFA (société)** et prend **24 h à 72 h** via le guichet unique APIEx (`monentreprise.bj`) `[V]`. Ce n'est pas un obstacle administratif : c'est un formulaire.
2. **Non, on ne peut pas « attendre de gagner pour déclarer ».** L'obligation de déclaration de traitement de données (APDP) est **préalable à la mise en œuvre** `[V]` (Code du numérique, art. 405 et 407). Une activité non déclarée qui traite les données de 10 000 personnes, c'est précisément le profil de dossier qui déclenche les amendes de **5 à 50 millions FCFA** (art. 460, alinéa « négligence dans les formalités préalables ») `[V]`.
3. **« Zéro franc » est plus facile avec l'enregistrement qu'avec la clandestinité.** Les entreprises nouvellement créées bénéficient à la DGI de l'**exonération de la patente et de la TPS au titre des 12 premiers mois d'activité**, d'exonérations de charges liées aux premiers salaires et d'une **réduction d'impôt sur les bénéfices de 25 % / 25 % / 50 % sur les trois premières années** `[V]`. En clair : la première année est fiscalement quasi neutre **si** l'entreprise existe et déclare ; elle ne l'est jamais si l'activité est informelle.
4. **Le vrai piège n'est pas l'impôt : c'est la qualification.** Trois textes menacent directement le modèle décrit dans le cahier d'exécution : la **loi n° 2017-05** (placement de main-d'œuvre et intérim : art. 4, 17 à 21, 56), le **Code du numérique** (art. 404 : l'employeur — présent ou potentiel — ne peut fonder un traitement sur le consentement ; art. 405 et s. : formalités préalables) et le **droit OHADA du courtier** (charge de la commission : art. 181 ancienne numérotation / art. 208 et s. AUDCG révisé 2010) `[V]`. C'est là qu'il faut être chirurgical, et c'est l'objet de ce dossier.
5. **Donc la bonne stratégie est : formaliser en 72 heures, publier les textes, ouvrir en « lancement encadré », puis monter en charge.** Le plan des §5 et §12 donne la séquence exacte, jour par jour, avec les pièces et les preuves.

> **Ce que ce dossier remplace.** Le cahier d'exécution utilise le vocabulaire du recrutement (« Candidat », « Employeur », « Offre », « salaire », « embauche », « commission de placement »). Ce vocabulaire décrit — aux yeux d'un inspecteur du travail, d'un juge ou de l'APDP — une **activité de placement de main-d'œuvre**, réservée par la loi béninoise aux entreprises de travail temporaire enregistrées `[V]`. Le §4 réécrit chaque compartiment dans le vocabulaire conforme **des faits réels de LE LABEUR** : une plateforme de mise en relation entre **professionnels indépendants** et **organisations clientes**, qui ne détient jamais d'argent, ne signe jamais à la place des parties et n'emploie personne.

---

## 1. Les dix pièges béninois (base légale et parade)

| # | Piège | Ce que dit le droit béninois | Ce qu'il faut faire (parade) | Réf. |
|---|---|---|---|---|
| P1 | **Placement de main-d'œuvre déguisé** | « Toute personne physique ou morale désirant faire du placement et servir d'intermédiaire en matière de recrutement de la main-d'œuvre se fait enregistrer au bureau d'emploi et de placement » (loi 2017-05, art. 4) ; « Est interdite toute forme d'utilisation de main-d'œuvre par le moyen d'intermédiaires, sauf dans le cadre exclusif des dispositions relatives au travail intérimaire » (art. 21). L'intérim est l'unique forme licite d'intermédiation `[V]` | Ne jamais se présenter, documenter ou coder comme un intermédiaire de recrutement. Vendre une **mise en relation d'affaires entre professionnels indépendants** (courtage/marketplace de services, §2). Aucun mot « placement », « recrutement », « embauche », « offre d'emploi » dans le produit | Loi 2017-05 art. 4, 21 ; art. 56 (amende 25 000 à 250 000 FCFA, doublée en récidive, pour fourniture ou utilisation de main-d'œuvre en violation des art. 17 à 21) |
| P2 | **Requalification en contrat de travail** | Le juge requalifie selon **les faits**, pas selon le titre : lien de subordination, directives, horaires imposés, contrôle, sanctions, intégration dans un service, exclusivité, fourniture du matériel | Publier et faire signer un **contrat de prestation de services** entre Client et Prestataire ; exiger l'indépendance réelle (statut d'Entreprenant/IFU, plusieurs clients, matériel propre) ; **interdire dans le produit** : consignes hiérarchiques, pointage horaire, sanctions disciplinaires, « chef d'équipe », exclusivité | Code du travail (loi 98-004 du 27 janv. 1998, modifié notamment par la loi 2017-05) `[V]` |
| P3 | **Traitement de données sans déclaration préalable** | « Les traitements… doivent, préalablement à leur mise en œuvre, faire l'objet d'une déclaration préalable auprès de l'Autorité » (art. 405) ; l'obligation est générale et préalable (art. 407) ; les dossiers doivent contenir 12 mentions minimales (art. 409) | Déposer le **formulaire unique APDP** + le **formulaire complémentaire « site web »** + annexes (sous-traitance, communication à des tiers, interconnexion, **transfert à l'étranger**) **avant** l'ouverture publique ; afficher le récépissé APDP sur le site | Code du numérique, art. 405 à 409 ; guide de conformité APDP `[V]` |
| P4 | **Fonder sur le consentement ce qu'interdit l'article 404** | Le traitement fondé uniquement sur le consentement reste interdit « lorsque le responsable du traitement est l'employeur présent ou potentiel de la personne concernée » ou en situation de dépendance `[V]` | Ne pas faire reposer la relation Prestataire ↔ Client sur le seul consentement : base = **exécution du contrat** + intérêt légitime documenté, avec consentement explicite **en plus** pour le rapprochement de compétences (qui reste révocable) | Code du numérique, art. 394, 404 |
| P5 | **Données sensibles et identifiants** | Traitement de données biométriques/santé/origine **interdit** hors exceptions et soumis à autorisation ; les traitements portant sur « un numéro national d'identification » exigent une **autorisation préalable** `[V]` | Ne jamais collecter : NPI/CNI en clair, photos de pièce d'identité au-delà du contrôle, biométrie, données de santé, situation syndicale. Si une vérification d'identité est nécessaire, la confier à un contrôle humain minimal et **ne pas conserver** l'image (hash + date) | Code du numérique, art. 394, 407 |
| P6 | **Transfert de données hors du Bénin** | « Avant tout transfert effectif de données à caractère personnel vers un État tiers… le responsable du traitement doit préalablement obtenir l'autorisation de l'Autorité » `[V]` ; l'APDP demande les clauses de confidentialité de l'hébergeur/cloud | Déclarer et documenter l'hébergement (Worker, PostgreSQL, R2, email/SMS) : **annexe 4 « transfert à l'étranger »**, contrats et clauses, minimisation, chiffrement, liste des sous-traitants. Envisager un hébergement primaire régional et une réplication maîtrisée | Code du numérique, Livre 5 ; APDP, formulaire + annexe 4 |
| P7 | **Facturation non normalisée** | Depuis le 1er juillet 2021, la **facture normalisée** (MECeF / e-MECeF, API DGI, code NIM + QR) est obligatoire pour les contribuables soumis à l'IS/IBA/TPS/TVA sauf dérogation expresse `[V]`. « Un PDF créé hors de ce flux n'est pas, à lui seul, une facture normalisée » `[V]` | Ouvrir le compte **e-MECeF** (`e-mecef.impots.bj`) dès l'obtention de l'IFU ; émettre **chaque** encaissement de frais de service via le flux DGI ; ne jamais annoncer une facture « émise » si le flux DGI n'a pas répondu | CGI art. 481-482 ; loi 2021-15 ; portail DGI ; sanctions : 5 000 000 FCFA (1re fois) / 10 000 000 FCFA (récidive) pour usage d'un système non approuvé, amendes par facture manquante |
| P8 | **Retenues fiscales mal anticipées (AIB)** | L'**Acompte sur impôt assis sur les bénéfices** est retenu par le payeur ; pour des prestations de services, le taux est de **1 %** (fournisseur immatriculé à l'IFU payé par l'État/organisme public), **3 %** (services, payeur privé) et **5 %** si le fournisseur n'est **pas** immatriculé à l'IFU `[V]`. Depuis le 7 septembre 2026, l'AIB de 5 % s'applique aussi aux contribuables dont l'IFU est **désactivé** `[V]` | Obtenir et **maintenir** l'IFU actif (sinon le Client retient 5 %) ; afficher le taux et le net attendu dans le parcours de règlement ; rappeler au Client son obligation de facture normalisée et d'AIB ; modéliser le net réel (§7.4) | CGI art. 132 d) et 135 ; note circulaire DGI 2022 ; communiqué DGI de septembre 2026 |
| P9 | **Circulation de fonds (portefeuille, séquestre, encaissement pour autrui)** | Aucune structure ne peut exercer une activité d'émission de monnaie électronique ou d'encaissement pour le compte de tiers sans agrément/ autorisation préalable de la BCÉAO `[V]` | Garder l'invariant « **LE LABEUR ne touche jamais l'argent** » : pas de wallet, pas de séquestre, pas de « solde LE LABEUR », pas de bouton « payer maintenant » dans l'application. Les règlements restent hors plateforme, entre les parties | Instruction BCÉAO n° 008-05-2015, art. 8 ; sanctions : avertissement, suspension/interdiction d'opérations, retrait d'agrément `[V]` |
| P10 | **Contenu illicite, harcèlement, fausse déclaration** | Le harcèlement sexuel est incriminé (peine d'1 à 2 ans et amende de 500 000 à 10 000 000 FCFA) et la loi interdit de sanctionner une victime ou un témoin, y compris en matière d'embauche ou de rémunération `[V]`. La charge de la preuve de l'information préalable, du consentement et des délais **pèse sur le fournisseur de services en ligne** `[V]` | Publier une politique anti-harcèlement + canal de signalement dédié et confidentiel ; journaliser proprement (art. 341) ; procédure de retrait de contenu et de suspension de compte ; coopérer avec les autorités sur réquisition | Loi n° 2021-11 du 20 déc. 2021 modifiant la loi 2017-05 (art. 27, 30) et le code pénal (art. 550 nouveau) ; Code du numérique art. 326-341 |

---

## 2. La qualification juridique : quatre portes, une seule à ouvrir

Avant tout code et tout texte, il faut **choisir la porte** par laquelle LE LABEUR existe en droit. C'est cette décision qui neutralise ou déclenche P1, P2 et P9.

| Porte | Description | Avantages | Risques | Verdict |
|---|---|---|---|---|
| **A. Annuaire / petites annonces** | LE LABEUR publie des annonces, ne participe à rien d'autre | Risque quasi nul (hébergeur de contenu) | Aucun revenu de commission possible ; ne couvre pas le cahier d'exécution (contrats, suivi, confirmations) | Insuffisant seul |
| **B. Courtage professionnel / marketplace de services entre indépendants** | LE LABEUR met en relation, pour un **frais de service**, des organisations clientes et des **professionnels indépendants** (Entreprenant/EI/société), qui contractent **directement entre eux** (contrat de prestation de services) | Couvre le cycle complet (mission → accord → suivi → déclaration) ; rémunération par **frais de service** (AUDCG : le courtier a droit à sa commission dès que l'opération aboutit) `[V]` ; pas de détention de fonds ; pas d'emploi | Requalification si les faits ressemblent à du salariat (P2) ; charge de la commission (voir §2.3) | **✅ Porte recommandée** |
| **C. Prestataire de services intégré (sous-traitance assumée)** | LE LABEUR s'engage sur le résultat de la mission et sous-traite | Marge plus forte, contrôle qualité | LE LABEUR devient **employeur** ou donneur d'ordre principal : charges CNSS/VPS/ITS, responsabilité du travail, obligations de sécurité, assurance | Possible plus tard, jamais « par accident » |
| **D. Entreprise de travail intérimaire** | LE LABEUR emploie les travailleurs et les met à disposition | Seule voie licite **si** l'on veut fournir de la main-d'œuvre | Enregistrement au bureau d'emploi et de placement (art. 4) ; assurance du risque d'exploitation (art. 18-19) `[C]` ; LE LABEUR devient l'employeur : paie les salaires, cotise, déclare ; le modèle « l'Employeur paie directement le Candidat » devient **inapplicable** | À écarter : incompatible avec le modèle actuel |

### 2.1 Décision recommandée

> **LE LABEUR = opérateur de plateforme de courtage professionnel (porte B), réservé aux professionnels formalisés.**
> **Règle d'or :** les deux côtés de la place de marché doivent être **formels** — le **Client** justifie d'un RCCM/IFU (ou d'une qualité professionnelle vérifiée) et le **Prestataire** d'un statut d'indépendant (Entreprenant, entreprise individuelle ou société) avec IFU. Un client sans IFU ne peut ni recevoir une facture normalisée ni retenir correctement l'AIB : il n'a rien à faire sur une plateforme qui veut rester propre `[V]`.

### 2.2 Le test d'indépendance (à publier et à coder)

À afficher dans les CGU, à rappeler dans chaque contrat et à **vérifier automatiquement** à la création de mission :

1. Le Prestataire choisit librement ses missions et peut en refuser une sans conséquence.
2. Il travaille avec ses propres moyens (outils, matériel, transport, connexion) sauf accord écrit et rémunéré.
3. Il peut servir plusieurs clients, y compris concurrents ; **aucune clause d'exclusivité**.
4. Il fixe avec le Client les modalités d'exécution ; il n'exécute pas de « consignes hiérarchiques » mais un **cahier des charges de livrables**.
5. Le prix est un **prix de mission** (forfait, livrable ou palier), pas un « salaire horaire ».
6. Aucune sanction disciplinaire, aucun blâme, aucun pouvoir de direction.
7. Aucune intégration dans l'organigramme, l'annuaire interne, la messagerie interne du Client.
8. Il supporte le risque d'exploitation : il n'est pas payé en cas de non-réalisation, sauf clause contraire.
9. Il peut se faire remplacer (moyennant information du Client) sur une mission sans lien personnel obligatoire.
10. Il dispose d'une assurance/statut fiscal personnel conforme à son activité.

**Si plus de deux réponses sont négatives, la relation est un contrat de travail déguisé : la plateforme doit refuser ou basculer en porte C/D.** C'est un garde-fou produit concret : un « contrôle d'indépendance » bloquant à la création de mission (§12.5).

### 2.3 Point dur à trancher : qui supporte les 7 500 FCFA ?

Le droit OHADA du courtier protège les parties contre la commission « cachée » : lorsque l'acheteur est seul donneur d'ordre, la commission est « supportée par lui, en sus du prix qui est payé au vendeur » ; lorsque c'est le vendeur, elle ne peut être reportée sur l'acheteur `[V]` (art. 181 ancienne numérotation ; art. 208 et s. AUDCG révisé 2010 `[C]` sur les numéros).

**Conséquence pratique :** présenter les 7 500 FCFA comme une « commission déduite de la rémunération du Candidat » est **juridiquement fragile et réputationnellement dangereux**. La rédaction à retenir est :

> « Le prix de la mission est de **22 500 FCFA** pour le premier cycle et **30 000 FCFA** par cycle à compter du deuxième. **LE LABEUR facture au Client, en plus et séparément, des frais de service de mise en relation et de sécurisation de 7 500 FCFA au titre du premier cycle.** Aucun frais n'est facturé au Prestataire. »

Autrement dit : on cesse de dire « 30 000 dont 7 500 retenus » et on dit « prix du cycle 1 : 22 500 ; frais de service : 7 500 dus par le Client ». Le total payé par le Client reste bien 30 000 FCFA la première fois — la règle financière du cahier d'exécution est **préservée au franc près**, mais elle est exprimée de manière défendable, et le Candidat n'apparaît jamais comme payant quoi que ce soit `[V]`. À faire valider par le conseil (c'est la question n° 3 du §14).

---

## 3. Méthode de langage : douze règles de rédaction

1. **Dire ce qui est, pas ce qu'on aimerait que ce soit.** Un juge et l'APDP regardent les faits ; le vocabulaire protège quand il décrit la réalité, il aggrave quand il la masque.
2. **Bannir les mots du salariat** : salaire, paie, bulletin, embauche, embauché, employeur, employé, salarié, licenciement, préavis, effectif, heures supplémentaires, pointage, congé payé, sanction disciplinaire.
3. **Bannir les mots du placement** : placement, recrutement, intermédiaire de recrutement, offre d'emploi, poste, candidature, CV envoyé à l'employeur, main-d'œuvre, agence.
4. **Employer le vocabulaire du contrat d'affaires** : mission, prestation, livrable, jalon, cahier des charges, devis, proposition de mission, accord, conditions de règlement, frais de service, facture, TVA, IFU, RCCM.
5. **Toujours dire qui paie quoi.** Aucun montant affiché sans ventilation nominale (Client / Prestataire / LE LABEUR) et sans la mention « LE LABEUR ne reçoit aucun paiement du Prestataire ».
6. **Jamais de promesse de revenu, d'emploi, de volume ou de délai.** Formulations prudentes : « estimation », « non garanti », « selon les conditions convenues avec le Client ».
7. **Nommer les textes.** Les CGU citent les articles applicables (Code du numérique art. 405 et s., loi 2017-05 art. 4 et 21, CGI art. 481). Un texte qui cite la loi désarme la suspicion.
8. **Écrire les limites de la plateforme.** « LE LABEUR n'est pas un employeur », « LE LABEUR ne détient aucun fonds », « LE LABEUR ne lit pas vos conversations WhatsApp », « LE LABEUR ne garantit pas le paiement : il organise la preuve ».
9. **Écrire les devoirs des parties.** Le Client doit déclarer/immatriculer selon son statut, facturer normalement, retenir l'AIB ; le Prestataire doit être indépendant, assuré et fiscalement en règle.
10. **Écrire les voies de recours.** Réclamation interne → médiation → juridictions compétentes. Ne jamais se présenter comme un tribunal.
11. **Aucune mention d'un dispositif d'État sans référence vérifiable** (ex. ne pas écrire « agréé par le ministère » sans un document signé).
12. **Une seule autorité de la vérité : le registre de conformité.** Toute formulation publique passe par le fichier `01_LEXIQUE_ET_MICROCOPY.md` (une seule source de vérité pour le vocabulaire, revue à chaque nouvelle version).

---

## 4. Le cahier d'exécution réécrit, compartiment par compartiment

> Lecture : chaque compartiment reprend la section correspondante du cahier d'exécution v1.0 (« ce qui est gardé »), puis ajoute **l'acte de conformité**, **la preuve à conserver** et **l'interdit**.

### §0 — Instruction générale à l'équipe (réécrite)

- **Gardé :** « le serveur décide », automatisation, interdiction des succès fictifs, ne pas confondre planifié/codé/testé/raccordé/validé.
- **Acte de conformité :** ajouter une **règle d'exécution n° 0** : « Aucune fonctionnalité de mise en relation, de contrat ou de traitement de preuve ne s'active en production si les textes légaux (CGU, confidentialité, politique de réclamation, politique anti-harcèlement), le récépissé APDP, les conditions de facturation et le contrat-type de prestation ne sont pas **publiés, versionnés et enregistrés** dans le registre de conformité. »
- **Preuve :** registre de conformité versionné (`docs/JURIDIQUE/` + table `legal_documents` / `legal_acceptances`).
- **Interdit :** « on verra la partie juridique après » ; toute route ou écran lié à l'argent ou à la relation contractuelle activé avant la conformité.

### §1 — Principes non négociables (à compléter)

- **Gardé :** les 12 principes existants (vocabulaire, rôles côté serveur, autorisation par objet, transitions, erreurs explicites, pas de DEMO en production, pas de mouvement de salaire, consentement, matching consultatif, réclamations conservées, règles financières uniques, sécurité dès la V1).
- **À ajouter (13 à 20) :**
  13. **Qualification d'affaires, jamais de relation de travail.** Le service vendu est un service de mise en relation entre professionnels ; aucune partie ne devient salariée, ni LE LABEUR employeur.
  14. **Zéro détention de fonds.** Aucun encaissement, séquestre, portefeuille, solde, reversement pour le compte d'autrui.
  15. **Formalité préalable.** Aucune donnée personnelle n'est traitée publiquement avant le récépissé APDP ; aucune facture n'est émise hors du flux DGI.
  16. **Preuve avant confiance.** Chaque consentement, information et engagement est horodaté, versionné et conservé (la charge de la preuve pèse sur la plateforme `[V]`).
  17. **Indépendance vérifiée.** Le contrôle d'indépendance (§2.2) est bloquant.
  18. **Fiscalité propre.** Chaque franc encaissé par LE LABEUR a une facture normalisée ; chaque franc payé au Prestataire a une pièce traçable.
  19. **Données minimales.** Pas de biométrie, pas de santé, pas de NPI, pas de données sensibles, pas de transfert non déclaré.
  20. **Dignité des personnes.** Politique anti-harcèlement et anti-discrimination, canal de signalement protégé, suspension immédiate en cas de risque.
- **Interdit :** toute exception « provisoire » à ces principes, même pour un client important.

### §2 — Règle financière (la seule modification réellement sensible)

- **Gardé :** l'arithmétique (25 % du premier cycle, 0 % ensuite, aucun surcoût pour le Client, gratuité totale pour le Prestataire), la fonction unique `calculateFirstMonthAllocation` / `calculateLaterMonthAllocation`, les entiers FCFA, le gel des montants dans la version signée.
- **Acte de conformité :** rebaptiser et re-rédiger (§2.3) : « prix de la mission » + « frais de service LE LABEUR » + « taxes applicables ». Ajouter la mention obligatoire : « Les frais de service sont facturés au Client ; le Prestataire ne supporte ni ne règle aucun frais de plateforme. »
- **Preuve :** devis/proposition signé, facture normalisée LE LABEUR (NIM + QR), facture du Prestataire, relevé de règlement, mention AIB.
- **Interdit :** « commission retenue sur la rémunération », « 25 % du salaire », facture ou note au nom du Prestataire, aucune mention d'un « portefeuille » ou d'un « solde ».

### §3 — Espaces et rôles (renommés)

| Avant | Après (produit) | Après (technique, migration douce) |
|---|---|---|
| Visiteur public | Visiteur | — |
| Employeur | **Client / Organisation cliente** | `EMPLOYER` (conservé, aliasé) |
| Candidat | **Prestataire / Professionnel indépendant** | `CANDIDATE` (conservé, aliasé) |
| Administration | **Modération et conformité** (sous-rôles séparés) | `ADMIN` + permissions détaillées |

- **Acte de conformité :** la liste des **catégories de personnes ayant accès aux données, avec leur fonction**, doit être tenue à disposition de l'APDP `[V]`. La matrice RBAC existante (`0002_role_permissions_seed.sql`) devient donc un **livrable de conformité** : elle doit cesser d'attribuer 24 permissions au seul rôle ADMIN (écart déjà relevé dans l'audit interne : `I-DEC-07`, `G-SEC-01`).
- **Preuve :** matrice de permissions versionnée + journal d'audit (acteur, action, objet, horodatage, motif).
- **Interdit :** accès administrateur aux messages privés sans motif auditable ; pouvoir implicite de modifier une décision métier ou financière.

### §4 — Inscription, comptes et moment de création

- **Gardé :** ordre des ressources techniques (domaine, HTTPS, base, R2 privé, OAuth, OTP, courriel, compte commercial, facturation), inscription par rôle, rôle non modifiable par le navigateur, ADMIN jamais sélectionnable.
- **À ajouter :**
  - **Bloc « informations précontractuelles »** (Code du numérique, commerce électronique) : caractéristiques du service, prix et frais, modalités de règlement, voies de recours — accessibles sur support durable **avant** toute commande `[V]`.
  - **Déclaration de statut obligatoire** : Client (RCCM ou qualité professionnelle + IFU) ; Prestataire (statut d'indépendant : Entreprenant / EI / société + IFU). Sans statut, pas d'activation : parcours d'« aide à la formalisation » (§7.5).
  - **Consentements versionnés** : CGU, politique de confidentialité, notice de rapprochement de compétences, politique anti-harcèlement, médiation.
  - **Mention opposable** : « L'inscription ne crée ni contrat de travail, ni placement, ni emploi. »
  - **Textes légaux en base** : implémenter les routes aujourd'hui absentes `/legal/documents` et `/legal/consent` (écart interne `I-LEG-02`, `G-LEG-02`) **avant** toute ouverture publique.
- **Preuve :** version du texte, empreinte du texte, acteur, horodatage serveur, IP/user-agent, journal d'acceptation.
- **Interdit :** compte « actif » sans vérification ; consentement pré-coché ; rôle ADMIN dans l'inscription publique.

### §5 — Parcours du visiteur

- **Gardé :** page rapide, mobile, offres publiques uniquement, montants non ambigus, page d'indisponibilité avec identifiant de diagnostic.
- **À ajouter en pied de page (bloc légal permanent) :** mentions légales (dénomination, RCCM, IFU, siège, contact), CGU, politique de confidentialité, politique de réclamation et de médiation, **numéro de récépissé APDP**, et la phrase : « LE LABEUR est une plateforme de mise en relation entre professionnels ; elle n'est ni un employeur, ni une agence de placement, ni un établissement financier. »
- **Preuve :** capture horodatée des pages publiques à chaque version publiée.
- **Interdit :** afficher un prix sans ventilation ; promettre « travail garanti » / « revenu assuré ».

### §6 — Parcours « Client » (ex-Employeur, E1 → E14)

| Section | Réécriture conforme | Acte de conformité / garde-fou |
|---|---|---|
| E1 Profil | Profil **Organisation** : dénomination, RCCM, IFU, secteur, adresse, représentant ; charte de transparence financière acceptée | Vérification IFU/RCCM ; refus si informations fausses ; changement d'informations sensibles → nouvelle vérification |
| E2 Créer une **mission** (ex-Offre) | Champs identiques + **qualification de la mission** | À la saisie : calcul immédiat (22 500 / 7 500 / 30 000 dans l'exemple 30 000) **et** contrôle automatique des **marqueurs de subordination** (horaires imposés, pointage, « chef », exclusivité, sanction) → si déclenchés : `HUMAN_REVIEW_REQUIRED`, publication bloquée |
| E3 Gérer la mission | États identiques (`DRAFT`, `ACTIVE`, `PAUSED`, `CLOSED`, `EXPIRED`, `CANCELLED`) | Toute modification de prix après envoi d'une proposition invalide la version non acceptée ; jamais de modification silencieuse d'un accord signé |
| E4 Recevoir les **propositions de service** (ex-Candidatures) | Unicité (mission, prestataire) ; l'Employeur ne voit que ses missions | Transition auditée ; refus motivé notifié ; notification factuelle sans jugement sur la personne |
| E5 Qualification | `ELIGIBLE`, `HUMAN_REVIEW_REQUIRED`, `BLOCKED` | Ajouter le **motif de conformité** (ex. : « mission susceptible de relever du contrat de travail ») et l'exiger dans l'interface de revue |
| E6 Rapprochement (ex-Matching) | Score 60/30/10 identique ; consentement obligatoire | Aucune décision automatisée produisant un effet juridique `[V]` ; explicabilité complète ; pas de réputation dans le classement (V1) |
| E7 Contacter | Messagerie interne rattachée au contexte ; lien WhatsApp externe journalisé (`MATCH-ID`) | Interdiction de lire les conversations WhatsApp privées `[V]` (secret des correspondances) ; l'ouverture du lien ne prouve ni envoi ni lecture |
| E8 Proposition | **Proposition de mission chiffrée** = devis : prix du cycle 1, prix des cycles suivants, frais de service facturés au Client, dates, livrables, modalités de règlement, préavis de fin | Version conservée ; retrait impossible après acceptation ; aucune « proposition verbale » |
| E9 Réponse | Acceptation sur version exacte / refus / demande de modification structurée | Nouvelle version → nouvelle acceptation ; aucun accord par défaut |
| E10 Accord d'engagement (ex-Contrat) | **Contrat de prestation de services** généré d'un modèle versionné, signé séparément par les deux parties, empreinte SHA-256 | Le contrat doit contenir : objet, prix, **clause d'indépendance**, absence de lien de subordination, clause de non-exclusivité, assurance, confidentialité, propriété intellectuelle, résolution, médiation, droit applicable, protection des données (voir modèle en `02_...`) ; **bandeau explicite** : « Ce document n'est pas un contrat de travail. Si les parties souhaitent une relation salariée, elles doivent l'établir hors plateforme et accomplir les formalités légales (visa de conformité, déclaration à la CNSS dans les 48 heures, visite médicale) » `[V]` |
| E11 Activation | Transaction unique, échéancier, dossier de frais de service `SCHEDULED` | Idempotence stricte ; aucune commission exigible à la seule signature |
| E12 Exécution | Suivi des **jalons et livrables**, pas des heures ; confirmations, incidents | Renommer « heures » en « jours de prestation / jalons » ; pas de pointage obligatoire ; toute contestation rattachée au jalon |
| E13 Déclaration de règlement | Le Client déclare avoir réglé **directement** le Prestataire (date, mode, référence) ; le Prestataire confirme par OTP ; **plus** la déclaration séparée des frais de service | Rappel fiscal intégré : le Prestataire doit avoir émis sa facture (si assujetti) ; le Client doit retenir l'AIB ; LE LABEUR émet sa facture normalisée pour ses frais ; statut `PAID` uniquement après vérification |
| E14 Clôture | Fin de mission, échéances futures closes, journaux figés | Conserver réclamations ouvertes et preuves ; archivage selon les durées déclarées à l'APDP |

### §7 — Parcours « Prestataire » (ex-Candidat, C1 → C10)

| Section | Réécriture conforme | Acte de conformité / garde-fou |
|---|---|---|
| C1 Profil | Profil **professionnel** : compétences, expérience, zone d'intervention, disponibilités, préférences, qualifications | Distinguer « déclaré » et « vérifié » ; afficher « profil incomplet » au lieu de « qualifié » ; **champ statut d'activité (Entreprenant/EI/société + IFU)** |
| C2 Consentement au rapprochement | Notice des critères (compétences, zone, disponibilité) + rétractation ; base légale du traitement = **contrat**, le consentement s'ajoute | Ne pas présenter le Client comme « employeur potentiel » (art. 404 `[V]`) ; conservé version, heure, acteur ; retrait = exclusion des futurs rapprochements, **sans** effacer l'historique |
| C3 Découverte | Missions actives et publiques ; filtres ; prix ventilé | Montant toujours non ambigu ; pas d'affichage d'offres de missions non conformes |
| C4 **Proposer ses services** (ex-Postuler) | Le Prestataire manifeste son intérêt sur une mission | Idempotence (une seule marque par couple mission/prestataire) ; le succès n'est affiché qu'après réponse serveur |
| C5 Suivi | Liste, ouverture, retrait possible tant que l'état l'autorise | Aucun accès croisé ; transitions serveur |
| C6 Proposition reçue | Lecture intégrale (prix cycle 1, prix suivants, obligations, preuves) | Acceptation liée à la version ; refus possible sans justification |
| C7 Signer | Signature personnelle, document entier consultable, version signée accessible en lecture seule | Aucun administrateur ne signe pour une partie ; modification post-signature = nouvelle version |
| C8 Mission | Contrat actif, jalons, échéances, conditions de règlement | Plusieurs missions possibles ; chaque mission a son propre dossier |
| C9 Confirmer le règlement | OTP à usage unique ; **attestation de réception** d'un montant | Le refus de confirmer ouvre une réclamation ; jamais de confirmation forcée ; OTP jamais journalisé en clair ; usage unique, expiration, essais limités |
| C10 Réclamation & historique | Numéro de dossier, état, ajout de pièces sans écrasement | **Canal dédié et confidentiel pour harcèlement/violence** (loi 2021-11 `[V]`) avec escalade immédiate et protection du signalant |

### §8 — Règles de rapprochement (ex-Matching)

- **Gardé** : filtres d'éligibilité avant score, score déterministe 60/30/10, pas de réputation V1, explicabilité, pagination, versions d'algorithme.
- **À ajouter :** (a) **filtre de conformité** excluant les missions à marqueurs de subordination et les comptes non formalisés ; (b) interdiction de toute décision automatisée ayant un effet juridique `[V]` ; (c) journalisation des critères utilisés dans le dossier de conformité (preuve d'absence de discrimination) ; (d) le score ne détermine **jamais** le prix.
- **Preuve :** `match_run_id`, version d'algorithme, jeu de données, résultats ; conservation alignée sur la durée déclarée à l'APDP.
- **Interdit :** pondérer par l'âge, le sexe, l'origine, la religion, la situation familiale, la santé — données interdites ou discriminatoires `[V]`.

### §9 — Messagerie et WhatsApp

- **Gardé :** persistance des conversations, participants vérifiés, `contextType` contrôlé, anti-doublon, états de lecture, sortie WhatsApp journalisée.
- **À ajouter :** (a) aucun accès administrateur au contenu privé sans réquisition ou motif grave tracé ; (b) obligation de retrait de contenu illicite et procédure de signalement ; (c) interdiction de démarcher des utilisateurs par SMS/e-mail/WhatsApp sans consentement préalable (prospection directe interdite `[V]`) ; (d) durées de conservation déclarées, appliquées par un job de purge ; (e) messages interdits listés dans les CGU (contenu haineux, sexuel, fraude, contournement de la plateforme, travail dissimulé).
- **Preuve :** journal d'accès aux messages (qui, quand, motif), journaux de suspension de compte.
- **Interdit :** « lire les conversations WhatsApp » ; conserver des messages au-delà de la durée déclarée.

### §10 — Rémunérations, frais de service, déclarations, calendrier

- **Gardé :** échéancier par cycle, calcul unique, gel des montants, cycles 2+ sans frais de service.
- **À ajouter :**
  - **Trois flux distincts** (prix de mission Client → Prestataire ; frais de service Client → LE LABEUR ; taxes/retenues selon le droit fiscal) et **quatre documents** (proposition/devis, accord signé, facture du Prestataire si assujetti, facture normalisée LE LABEUR).
  - **Mention AIB** dans l'écran de règlement : « Le Client peut être tenu de retenir un acompte fiscal (AIB) sur le prix ; un fournisseur sans IFU actif subit un taux majoré (5 %). »
  - **Statuts honnêtes** : `DECLARED`, `PENDING_CANDIDATE_CONFIRMATION`, `SALARY_CONFIRMED`, `DISPUTED`, `REJECTED` → renommer en `REMUNERATION_*` côté produit (alias technique conservé) et ne jamais afficher « payé » sans vérification.
- **Preuve :** facture normalisée (NIM, QR, empreinte), déclaration, attestation OTP, éventuelle pièce de transfert, journal.
- **Interdit :** statut `PAID` sur simple clic ; facture « émise » sans réponse DGI ; double commission ; commission sur les cycles 2+.

### §11 — Automatisation

- **Gardé :** outbox transactionnelle, Cron 5 minutes, leases, backoff, dead-letter, supervision.
- **À ajouter (tâches de conformité) :**
  1. **Purge/archivage** à l'échéance des durées déclarées à l'APDP (preuve que la conservation annoncée est respectée).
  2. **Alertes IFU** : IFU manquant, IFU désactivé, IFU expiré → avertissement + blocage des émissions de factures côté Client/Prestataire.
  3. **Alertes consentement** : consentement de rapprochement expiré ou retiré → retrait du bassin de matching.
  4. **Alertes de subordination** : mission signalée, récurrence des mêmes parties, volume anormal pour un même couple Client/Prestataire.
  5. **Alertes harcèlement/sécurité** : escalade humaine immédiate, notification au référent conformité.
  6. **Rappels fiscaux** : échéances de déclaration LE LABEUR, dépôt e-MECeF en erreur, factures non transmises.
  7. **Alertes droits des personnes** : demandes d'accès/rectification/effacement en retard (délai de traitement à définir et à tenir).
- **Preuve :** journaux de jobs, tableau de supervision, historique des alertes.
- **Interdit :** un job qui invente un statut financier, un consentement ou une facture.

### §12 — Réclamations, litiges et médiation

- **Gardé :** machine à états, preuves, réponses contradictoires, décisions motivées, appel/réexamen, conservation.
- **À ajouter :** (a) **clause de médiation** dans le contrat de prestation (médiation/conciliation avant juridiction) et dans les CGU ; (b) **canal confidentiel « harcèlement / violences / sécurité »** avec circuit restreint et protection du signalant `[V]` ; (c) distinction claire : LE LABEUR **facilite** la résolution, il ne rend pas la justice ; (d) pour les situations de travail salarié avéré, orientation vers l'**inspection du travail** et information sur la conciliation préalable `[V]` ; (e) interdiction de toute menace, pression ou représailles sur une partie plaignante.
- **Preuve :** dossier complet, décisions signées, notifications, horodatages.
- **Interdit :** supprimer une réclamation ; utiliser le blocage de compte comme sanction déguisée pour un litige commercial.

### §13 — Remplacement de Prestataire

- **Gardé :** nouveau parcours complet, historique figé, nouveau contrat, nouveau dossier de frais.
- **À ajouter :** vérifier que la fin du premier contrat respecte ses propres conditions (préavis, livrables, soldes) ; ne jamais transférer l'identité, les réputations ni les dossiers financiers ; documenter la cause (inexécution, accord mutuel, fin de mission).
- **Interdit :** présenter le remplacement comme un « licenciement/remplacement de salarié » ; réutiliser un dossier de frais de service.

### §14 — Réputation

- **Gardé :** journal d'événements vérifiables, contestation possible, correction par opération auditée (jamais suppression).
- **Acte de conformité :** la réputation est une **donnée personnelle** : elle entre dans le registre APDP, avec finalité, durée et droits ; publication subordonnée au consentement et aux règles de confidentialité ; aucune conséquence juridique automatique `[V]`.
- **Interdit :** notation publique d'une personne physique sans base légale ni information préalable.

### §15 — Modèle de données (à compléter)

Tables à ajouter au schéma existant (`migrations/`) :

| Table | Contenu | Finalité de conformité |
|---|---|---|
| `legal_documents`, `legal_versions`, `legal_acceptances` | Textes (CGU, confidentialité, anti-harcèlement, charte) + empreintes + acceptations horodatées | Informations précontractuelles et preuve du consentement `[V]` |
| `data_processing_registry` | Registre des traitements (finalité, base légale, catégories, destinataires, durée, mesures) | Livrable APDP (art. 409) |
| `apdp_declarations` | Récépissé, versions, annexes, dates, pièces | Preuve de la formalité préalable |
| `tax_profiles` | Statut (Entreprenant/EI/société), IFU, RCCM, régime fiscal, état e-MECeF | Vérification obligatoire des deux côtés |
| `invoices`, `invoice_lines`, `invoice_dgi_events` | Factures normalisées, NIM, code, QR, réponses DGI | CGI art. 481-482 |
| `aib_withholdings` | Taux appliqué, base, motif (IFU absent/désactivé) | Sécurisation du Client, transparence |
| `breach_incidents`, `authority_requests` | Violations de données, réquisitions | Obligation de notification / coopération |
| `harassment_reports` | Signalements à circuit restreint | Loi 2021-11 |
| `retention_policies` | Durées par catégorie, alignées sur la déclaration APDP | Preuve de respect des durées |
| `consent_events` | Historique (donné, retiré, version) | Preuve |

**Contraintes d'intégrité à ajouter :** un récépissé APDP par environnement ; une facture par encaissement ; une déclaration AIB par paiement ; une acceptation par texte et par utilisateur ; des index sur les utilisateurs/états/dates pour répondre aux demandes d'accès en délai raisonnable.

### §16 — Contrats d'API (à compléter)

- **Priorité absolue :** `/legal/documents` et `/legal/consent` (aujourd'hui absents du dépôt — écarts internes `I-LEG-02`, `G-LEG-02`) : lecture des textes versionnés + enregistrement d'acceptation.
- **À ajouter :**
  - `/compliance/processing-registry` (lecture interne), `/compliance/retention/run`, `/compliance/rights-requests` (accès, rectification, opposition, effacement).
  - `/tax/profiles` (statut + IFU), `/invoices` (création, transmission DGI, statut, PDF), `/invoices/:id/verify`.
  - `/admin/compliance/*` (récépissés, registre, violations, réquisitions, alertes) séparé par permissions.
  - **Santé** : `/health/compliance` (récépissé chargé, versions de textes publiées, connectivité DGI), sans secret.
- **Interdit :** toute route `wallet`, `escrow`, `balance`, `payout` — à supprimer du code et **à verrouiller par un test** (§12.6).
- **Rappel :** `501 NOT_IMPLEMENTED` est une absence de fonction, pas une réponse acceptable pour une fonction présentée comme disponible.

### §17 — Sécurité, confidentialité, accès

- **À ajouter :** registre des traitements et **liste des catégories de personnes ayant accès** (art. 402 `[V]`) ; principe de minimisation ; chiffrement au repos et en transit ; MFA pour l'administration ; revue trimestrielle des accès ; procédure de **notification de violation** à l'APDP sans délai (viser ≤ 72 h opérationnellement) et aux personnes concernées selon le risque `[V]` ; procédure de réponse aux **réquisitions** des autorités ; test IDOR systématique étendu aux documents et à la messagerie.
- **Preuve :** rapports d'accès, journaux, procédures signées, exercices de simulation.
- **Interdit :** journaliser des OTP, mots de passe, pièces d'identité ou données bancaires.

### §18 — Erreurs et résilience

- **À ajouter :** classe d'erreurs **conformité** (`COMPLIANCE_BLOCKED`, `MISSING_TAX_ID`, `INVOICE_PROVIDER_UNAVAILABLE`, `CONSENT_REQUIRED`, `APDP_DECLARATION_MISSING`) qui bloquent l'action **et** expliquent quoi faire ; jamais de contournement silencieux ; en cas d'indisponibilité e-MECeF : file d'attente et message honnête, jamais de facture « en attente » présentée comme émise.
- **Interdit :** afficher un succès quand la DGI, l'APDP ou un fournisseur est en erreur.

### §19 — Infrastructure et règle « zéro franc »

- **À ajouter :**
  - **Localisation des données** : documenter chaque région d'hébergement (Worker, base, R2, courriel, SMS) et remplir l'**annexe 4 (transfert à l'étranger)** si des données sortent du Bénin `[V]`.
  - **Plan de coûts réels** : le « zéro franc » de la première année vient des **exonérations DGI** (patente/TPS 12 mois, réduction d'IS 25/25/50) `[V]`, pas de l'absence d'enregistrement.
  - **Sécurité non négociable** : MFA, sauvegardes chiffrées, tests de restauration, clés séparées par environnement, aucune clé dans le frontend.
- **Interdit :** désactiver une protection (MFA, contrôle d'accès, purge) pour économiser.

### §20 — Tests de recette (batterie juridique à ajouter au plan de tests)

1. **Test de lexique** : le build échoue si une chaîne visible contient `salaire`, `embauche`, `employeur`, `candidat`, `placement`, `recrutement`, `commission de placement` (hors pages historiques explicitement marquées).
2. **Test « zéro fonds »** : aucune route/table de portefeuille, séquestre, solde ; recherche automatisée dans le schéma et les routes.
3. **Test de conformité préalable** : l'ouverture publique échoue si les textes ne sont pas publiés ou si le récépissé APDP est absent (garde en configuration d'environnement).
4. **Test facture** : aucun encaissement sans facture normalisée ; si la DGI ne répond pas, la facture n'est pas marquée « émise ».
5. **Test consentement** : aucune donnée de profil n'entre dans un rapprochement sans consentement enregistré et non retiré.
6. **Test AIB/IFU** : un profil sans IFU affiche l'avertissement et empêche la génération du document de règlement.
7. **Test de purge** : un enregistrement au-delà de la durée déclarée est purgé/archivé ; journal produit.
8. **Test harcèlement** : un signalement suit le circuit restreint, sans accès pour les rôles non habilités.
9. **Test droits des personnes** : export des données d'un utilisateur complet et lisible ; rectification et opposition effectives.
10. **Test de requalification** : une mission à marqueurs de subordination ne peut pas être publiée sans revue humaine.

### §21 — Ordre d'exécution (ajouter la Phase 0)

**Phase 0 — Conformité (nouvelle, avant la Phase A) :** décision de qualification (porte B), formalisation APIEx/IFU, textes légaux (CGU, confidentialité, anti-harcèlement, charte), contrat-type de prestation, dépôt APDP, ouverture du compte e-MECeF, registre des traitements, procédure de violation et de réquisition, classeur de contrôle.
Le reste des phases A à F est inchangé, avec les ajouts du §12.

### §22 — Conditions de mise en production (bloc « conformité »)

En plus des conditions existantes :
- récépissé APDP obtenu et **affiché** ; registre des traitements à jour ;
- IFU actif et compte e-MECeF opérationnel ; première facture normalisée testée de bout en bout ;
- CGU, politique de confidentialité, mentions légales et politique anti-harcèlement publiées et versionnées ;
- contrat-type de prestation validé ; test d'indépendance actif ; aucun compte non formalisé admissible ;
- aucun flux de fonds possible dans l'application (test automatisé) ;
- procédures violation de données et réquisition rédigées et testées ;
- conservation alignée sur la déclaration APDP, purge vérifiée.

### §23 — Fonctionnalités différées

Ajouter à la liste des reports : portefeuille/paiement intégré (à ne **jamais** implémenter sans agrément BCÉAO), biométrie (autorisation APDP requise), enregistrement d'appels (consentement + déclaration), analyse d'audience avancée (déclaration préalable + consentement cookies), notation publique ouverte.

### §24 — Scénario de bout en bout (à compléter)

Insérer dans le scénario officiel : affichage des mentions légales et du récépissé APDP ; acceptation des textes enregistrée avec empreinte ; contrôle d'indépendance passé ; facture normalisée LE LABEUR émise (NIM + QR) ; mention AIB affichée ; attestation OTP du Prestataire ; purge programmée ; aucun portefeuille ; aucune donnée importée d'un pays tiers sans annexe APDP.

### §25 — Livrables exigés (ajouter le livrable n° 11)

**11. Dossier de conformité** : décision de qualification écrite ; RCCM/IFU ; récépissé APDP + formulaire + annexes ; registre des traitements ; textes légaux versionnés ; contrat-type ; matrice de permissions ; liste des sous-traitants et régions d'hébergement ; procédures violation/réquisition ; rapport des 10 tests juridiques ; classeur de contrôle (§10 du présent dossier).

---

## 5. Calendrier de lancement en trois vagues (72 heures, 30 jours, palier)

### Vague 0 — « Légalisation express » (J1 à J3) — obligatoire avant toute ouverture publique

| # | Démarche | Autorité / outil | Délai | Coût | Pièces | Preuve à classer |
|---|---|---|---|---|---|---|
| 1 | Création de l'entreprise (entreprise individuelle / établissement) | APIEx — `monentreprise.bj` / GUFE | 24-72 h `[V]` | ≈ 10 000 FCFA (EI) ; 17 000 FCFA (société) `[V]` | identité, acte de naissance, photos, casier ou déclaration sur l'honneur | RCCM + journal de publication |
| 2 | IFU + déclaration d'existence | DGI (via APIEx / centre des impôts) | inclus | gratuit `[V]` | RCCM, siège, activité | Attestation IFU |
| 3 | Choix de régime (TPS si personne physique < 50 M FCFA de CA) | DGI | — | — | — | Note interne + avis du comptable |
| 4 | Compte **e-MECeF** | `e-mecef.impots.bj` | quelques jours `[C]` | gratuit | IFU, e-mail, activation DGI | Accès e-SFE / API opérationnel |
| 5 | Contrats-types + CGU + politique de confidentialité + anti-harcèlement | Conseiller (1 modèle à valider) | 1-3 j | honoraires uniques `[C]` | — | Textes versionnés + accusé de validation |
| 6 | **Déclaration APDP** (formulaire unique + formulaire complémentaire site web + annexes) | APDP — `service.apdp.bj` | dépôt avant mise en œuvre `[V]` | gratuit ; prestations connexes facturées `[V]` | NPI/CIN du responsable, RCCM, politique de sécurité, engagement de confidentialité, contrat sous-traitant, clauses hébergeur, preuve de consentement prévue | Récépissé APDP |
| 7 | Compte commercial (banque ou mobile money marchand) | Banque / opérateur | 2-7 j | variable | RCCM, IFU | Relevé/IBAN |
| 8 | Assurance (RC professionnelle / risque d'exploitation) | Assureur local | 1-3 j | prime annuelle `[C]` | RCCM | Police d'assurance |

> **Point clé :** les étapes 1, 2, 4, 6 sont celles qui protègent. Si l'APDP met du temps, on n'ouvre pas au public : on reste en préproduction ou en **lancement fermé** (voir V1).

### Vague 1 — « Lancement fermé » (J4 à J30)

- 50 à 200 utilisateurs **invités**, formels, informés, avec textes publiés et récépissé **en cours** (mention honnête : « déclaration déposée le … , récépissé en cours » — jamais de faux numéro).
- Toutes les fonctions du noyau actif : mission, proposition, accord, signature, suivi, déclaration de règlement, attestation OTP, facture normalisée LE LABEUR.
- Tableau de bord conformité : taux de consentement, factures émises/échouées, alertes IFU, alertes de subordination, délai de traitement des droits.
- Une seule politique : **aucun compte non formalisé**, même en test.

### Vague 2 — « Montée en charge » (J30 à J90)

- Ouverture publique après récépissé APDP effectif et 30 jours de facturation normalisée sans incident.
- Communication alignée sur la politique publique : **formalisation de l'informel** (statut d'Entreprenant gratuit `[V]`), partenariats possibles (APIEx/ADPME, CNSS pour l'affiliation des indépendants, ARCH pour la protection sociale `[V]`).
- Revue trimestrielle : registre des traitements, durées de conservation, purge, matrice de permissions, incidents.

---

## 6. Le pack APDP (résumé ; détail en `02_...`)

- **Formalité préalable obligatoire** : déclaration (art. 405) — préalable à la mise en œuvre (art. 407) — dossier comportant au minimum 12 mentions (art. 409) `[V]`.
- **Formulaires APDP** : formulaire unique + **formulaire complémentaire « site web »** (art. 406) + annexes 1 (sous-traitance), 2 (communication à des tiers), 3 (interconnexion), **4 (transfert à l'étranger)** `[V]`.
- **Pièces typiquement demandées** : preuve du recueil de consentement, engagement de confidentialité des agents, contrat de confidentialité avec les sous-traitants, clauses de confidentialité de l'hébergeur/cloud, politique de sécurité, copie du NPI/CIN du responsable, RCCM `[V]`.
- **À ne pas traiter sans autorisation préalable** : données biométriques, santé, origine, opinions, **numéro national d'identification**, interconnexions, transferts hors du Bénin `[V]`.
- **Sanctions** : avertissement, mise en demeure (8 jours), amende de **5 à 50 millions FCFA**, suspension/interdiction du traitement, retrait d'autorisation, verrouillage ou suppression des données ; sanctions pénales de 6 mois à 10 ans et amendes de 10 à 50 millions FCFA `[V]`.
- **Conséquence de dimensionnement** : à 10 000 utilisateurs, LE LABEUR est un responsable de traitement significatif. Il doit avoir un **référent conformité identifiable**, un **point de contact publié**, un registre à jour et un délai de traitement documenté des demandes de droits.

---

## 7. Le pack fiscal (ce que « zéro franc » signifie vraiment)

### 7.1 Régime de démarrage

- Personne physique sous 50 M FCFA de chiffre d'affaires → **Taxe Professionnelle Synthétique** : **5 % du chiffre d'affaires annuel**, minimum 10 000 FCFA, due par commune/établissement, plus une redevance de 4 000 FCFA au profit de la radiodiffusion `[V]`.
- **Nouvelle entreprise : exonération de la patente et de la TPS au titre des 12 premiers mois** `[V]`.
- Société (SARL/SAS) → **impôt sur les sociétés** dès la création, avec réduction de 25 % / 25 % / 50 % les trois premières années `[V]`. Une société ne peut **jamais** relever de la TPS, même à faible chiffre d'affaires `[V]`.
- **Décision recommandée :** démarrer en **entreprise individuelle/établissement** (TPS, coût minimal, exonération 12 mois), avec passage en société quand le chiffre d'affaires ou les investisseurs l'exigent.

### 7.2 Facturation

- **Facture normalisée obligatoire** pour les contribuables IS/IBA/TPS/TVA (CGI art. 481 et s.), via **MECeF/e-MECeF**, avec code NIM et QR, transmission en temps réel à la DGI `[V]`.
- Un PDF produit hors de ce flux **n'est pas** une facture normalisée `[V]`.
- Utiliser un système de facturation propre exige une **approbation DGI** (SFE) : sanction de 5 000 000 FCFA (1re fois) et 10 000 000 FCFA (récidive) pour usage d'un système non approuvé `[V]`.
- **Plan pragmatique :** phase 1, émettre via le portail e-MECeF (interface DGI) et joindre le PDF ; phase 2, brancher l'API (avec test DGI) et supprimer la double saisie. Ne jamais écrire « facture émise » sans réponse DGI.

### 7.3 Retenues (AIB)

- Prestations de services : **3 %** lorsque le payeur est une entreprise privée ; **1 %** lorsque le payeur est l'État/collectivité/entreprise publique (fournisseur immatriculé à l'IFU) ; **5 %** si le fournisseur n'a **pas** d'IFU `[V]`.
- Depuis le 7 septembre 2026 : AIB de 5 % appliqué automatiquement aux contribuables dont l'**IFU est désactivé** (personnes morales, entreprises individuelles, professions libérales) jusqu'à régularisation `[V]`.
- **Conséquence produit :** afficher le taux applicable et le net attendu dans le parcours de règlement, et alerter dès qu'un IFU est absent ou inactif. C'est un service rendu au Client, et une protection pour LE LABEUR.

### 7.4 Exemple de net réel pour LE LABEUR (à intégrer aux écrans internes)

| Ligne | Montant (FCFA) |
|---|---:|
| Frais de service facturés au Client (cycle 1) | 7 500 |
| Retenue AIB par le Client (3 %, hypothèse entreprise privée immatriculée) | −225 |
| Assiette TPS annuelle (cumul des recettes) — 5 % applicable hors exonération de la 1re année | −375 |
| Encaissement net indicatif avant charges | **≈ 6 900** |

> **Conclusion de gestion :** le modèle à 25 % reste viable, mais **uniquement** si LE LABEUR est formel (IFU actif → AIB 3 % et non 5 %), s'il est exonéré de TPS la première année, et s'il facture normalement. Chaque point d'informalité augmente mécaniquement le coût réel.

### 7.5 Levier stratégique : l'« aide à la formalisation »

Le statut d'**Entreprenant** est **gratuit** et délivré en quelques heures `[V]`. LE LABEUR a donc un intérêt direct à aider ses Prestataires à obtenir un statut + IFU : (a) le Client peut facturer et retenir correctement, (b) le taux d'AIB baisse, (c) l'argument « nous ne créons pas de travail informel » devient vérifiable, (d) la conformité de la plateforme devient un argument commercial. Prévoir un parcours « formalisation assistée » (documents, checklist, orientation APIEx) **sans se substituer** aux administrations.

---

## 8. Pack travail et protection des personnes

- **Jamais d'emploi implicite.** Si un Client et un Prestataire veulent une relation salariée, la plateforme le dit explicitement et renvoie aux formalités : **visa de conformité du CDD à l'inspection du travail** avant mise en vigueur, **déclaration du nouveau travailleur à la CNSS et à l'inspection du travail dans les 48 heures**, **visite médicale d'embauche**, immatriculation CNSS de l'employeur `[V]`.
- **SMIG de référence** : 52 000 FCFA/mois depuis le 1er janvier 2023, encore en vigueur `[V]`. À rappeler aux Clients qui se posent la question du salariat — et à ne **jamais** afficher comme « salaire LE LABEUR ».
- **Protection sociale des indépendants** : le régime spécial des travailleurs indépendants et de l'informel existe (code de sécurité sociale) et le programme **ARCH** propose une couverture santé/retraite via un guichet unique `[V]`. Prévoir un bloc d'information et, si possible, un partenariat : c'est la réponse à l'objection « précarité » et un alignement politique fort.
- **Non-discrimination** : le Code du travail interdit de fonder les décisions d'embauche, de conduite et de répartition du travail sur le sexe, l'âge, la race ou le lien ethnique `[V]`. Le rapprochement de compétences ne peut donc pondérer ces critères.
- **Harcèlement** : politique écrite, canal confidentiel, sanction interne (suspension), interdiction de représailles, information sur les voies pénales (loi 2021-11) `[V]`.
- **Sécurité au travail** : rappeler aux Clients leurs obligations d'hygiène/sécurité sur site, et au Prestataire son devoir de prudence ; refuser les missions manifestement dangereuses ou illicites.

---

## 9. Pack « confiance et preuve »

- **Charge de la preuve sur la plateforme** (Code du numérique, art. 341) : la preuve de l'information préalable, de la confirmation et du consentement incombe au fournisseur de services en ligne `[V]` → chaque écran critique produit un événement daté et versionné.
- **Signature électronique** : l'écrit électronique a la même valeur que le papier sous conditions d'intégrité ; la signature « qualifiée » suppose un prestataire de services de confiance qualifié `[V]`. Le dispositif prévu (signature en application, version figée, **empreinte SHA-256**, horodatage serveur, journal d'événement) est adapté à une preuve d'engagement ; il ne se substitue pas à une signature qualifiée ni aux formalités propres à certains contrats. **À mentionner dans les CGU.**
- **Archivage** : horodatage/archivage conformes (art. 299 à 302) `[V]` ; conservation selon les durées déclarées à l'APDP ; documents signés conservés dans R2 privé avec URL signée temporaire ; jamais d'écrasement d'une version signée.
- **Transparence tarifaire** : prix, frais, retenues et modes de règlement lisibles, non équivoques, accessibles sur support durable avant engagement `[V]`.

---

## 10. Conduite en cas de contrôle (procédure à afficher au mur)

| Ordre | Action | Responsable |
|---|---|---|
| 1 | Accueillir, identifier l'agent, noter sa qualité, la base légale de sa visite, le périmètre demandé | Référent conformité |
| 2 | Ne jamais improviser : toute réponse factuelle provient du **classeur de contrôle** | Référent conformité |
| 3 | Remettre ce qui est demandé (statuts, RCCM, IFU, registre des traitements, récépissé APDP, contrats-types, factures) | Référent conformité |
| 4 | Ne pas fournir d'accès libre à la base : préparer un export ciblé, tracer qui a consulté quoi | Sécurité |
| 5 | Aucun message privé, aucune donnée sensible, aucun mot de passe remis | Sécurité |
| 6 | Consigner heure, demandes, pièces remises, observations de l'agent | Référent conformité |
| 7 | En cas de procès-verbal : ne pas signer d'engagements, réserver la réponse écrite, saisir le conseil | Direction |
| 8 | Répondre aux mises en demeure **dans le délai** (APDP : 8 jours) avec un plan d'action daté `[V]` | Direction + conseil |

**Classeur de contrôle (à tenir à jour, papier + numérique) :** RCCM, IFU, Récépissé APDP + fichiers déposés, registre des traitements, politiques (sécurité, conservation, violation, réquisition), CGU versionnées + historique, contrat-type + exemplaires signés (anonymisés), matrice de permissions, liste des sous-traitants et régions, attestations d'engagement de confidentialité, journaux d'audit, factures normalisées émises, preuves de règlement déclarées, journal des réclamations, rapport des tests juridiques.

---

## 11. Liste rouge — douze interdits absolus

1. Détenir, encaisser ou séquestrer de l'argent pour le compte d'autrui (BCÉAO).
2. Écrire ou laisser croire que LE LABEUR est un employeur, une agence de placement ou un service public.
3. Collecter la biométrie, la santé, le NPI/CNI, les opinions, la situation syndicale.
4. Mettre en production un écran qui traite des données personnelles avant le récépissé APDP.
5. Transférer des données hors du Bénin sans annexe/autorisation APDP.
6. Émettre une facture hors du flux DGI ou annoncer une facture « émise » sans réponse DGI.
7. Payer un Prestataire ou facturer un Client sans pièce traçable (facture, référence, mention AIB).
8. Promettre un revenu, un emploi, un volume de missions ou un délai de paiement.
9. Facturer quoi que ce soit au Prestataire (frais d'inscription, de dossier, de mise en relation, de formation obligatoire).
10. Sanctionner un utilisateur pour avoir signalé un harcèlement, un abus ou une fraude.
11. Faire signer un accord sans que la version exacte soit figée, horodatée et conservée.
12. Publier une offre à marqueurs de subordination (horaires imposés, pointage, exclusivité, sanction) sans revue humaine et requalification.

---

## 12. Modifications à apporter au dépôt (concret, testable)

1. **Migration 0019 « conformité »** : `legal_documents`, `legal_versions`, `legal_acceptances`, `data_processing_registry`, `apdp_declarations`, `tax_profiles`, `invoices`, `invoice_dgi_events`, `aib_withholdings`, `breach_incidents`, `authority_requests`, `harassment_reports`.
2. **Routes** : `/legal/documents`, `/legal/consent` (priorité 1 — actuellement absentes), `/compliance/*`, `/tax/*`, `/invoices/*`.
3. **Renommage produit** : `EMPLOYER` → « Client », `CANDIDATE` → « Prestataire » dans toutes les chaînes visibles ; conserver les énumérations serveur et documenter la correspondance (décision `I-DEC-01`).
4. **Alias de statuts financiers** : `SALARY_*` → libellés `REMUNERATION_*` côté produit, sans casser les événements existants.
5. **Contrôle d'indépendance bloquant** à la création de mission + marqueurs de subordination.
6. **Tests** : les 10 tests du §20 (dont « zéro fonds » et « lexique »).
7. **Front public** : bandeau légal permanent avec RCCM/IFU/récépissé APDP + phrase de qualification.
8. **Réglage d'environnement** : `COMPLIANCE_OPEN_TO_PUBLIC=false` tant que les textes et le récépissé ne sont pas en place ; `ADP_RECEIPT_ID`, `EMECEF_API_KEY`, `TAX_REGIME`.
9. **Formulaire de mission** : champs de conformité (statut du Client, statut du Prestataire, mention AIB, facture requise).
10. **Purge et archivage** : job quotidien aligné sur le registre des traitements, avec journal.

---

## 13. Gouvernance de conformité

| Rôle | Responsabilité | Rythme |
|---|---|---|
| Propriétaire | Décision de qualification, signature des textes, relation aux autorités | Trimestriel |
| Référent conformité (point de contact APDP) | Registre, récépissés, droits des personnes, incidents, classeur de contrôle | Hebdomadaire |
| Comptable/commissaire aux comptes | TPS/IS, factures e-MECeF, AIB, paie si un jour salariat | Mensuel |
| Conseiller juridique (avocat local) | Contrats, litiges, mises en demeure, veille législative | À la demande + trimestriel |
| Sécurité/exploitation | MFA, sauvegardes, tests de restauration, journalisation, incidents | Mensuel |
| Modération | Signalements, contenu, harcèlement, suspension | Quotidien |

**Indicateurs à suivre :** factures normalisées émises/échouées ; taux d'IFU actifs (Clients/Prestataires) ; demandes de droits traitées dans le délai ; consentements retirés ; alertes de subordination ; signalements harcèlement ; incidents de sécurité ; délai de résolution des réclamations ; nombre de missions publiées puis retirées pour non-conformité.

---

## 14. Les quinze questions à poser au conseil (avec les textes à citer)

1. La qualification « courtage professionnel entre indépendants » (porte B) vous paraît-elle tenable au regard des articles 4 et 21 de la loi 2017-05 ? Faut-il un enregistrement préventif ?
2. Le modèle « prix du cycle 1 = 22 500 / prix suivants = 30 000 / frais de service 7 500 facturés au Client » est-il conforme à l'article 181 AUDCG (répartition de la commission) ? Quelle rédaction retenir ?
3. Faut-il déposer une **demande d'orientation écrite** à la Direction générale du Travail pour sécuriser la qualification ? (Modèle fourni en `02_...`.)
4. Quelles clauses d'indépendance, de non-exclusivité et de responsabilité retenir dans le contrat-type ?
5. Le registre des traitements et le formulaire APDP sont-ils complets pour un transfert d'hébergement (Worker/PostgreSQL/R2) vers les États-Unis ou l'Union européenne ? Faut-il une autorisation ou une simple annexe ?
6. Faut-il prévoir un référent conformité externe (DPO mutualisé) et un mandataire au Bénin ?
7. Quelle durée de conservation par catégorie (missions, messages, preuves, factures) retenir et déclarer ?
8. Le parcours « attestation de réception par OTP » constitue-t-il une preuve utile en cas de litige sur le montant ? Quelle rédaction renforce sa force probante ?
9. La clause de médiation/conciliation proposée est-elle opposable dans les conditions générales ?
10. Le traitement des signalements de harcèlement est-il protégé (confidentialité, absence de représailles) conformément à la loi 2021-11 ?
11. La politique d'aide à la formalisation (Entreprenant/IFU) doit-elle être contractualisée pour éviter tout soupçon de « placement » ?
12. Quelles mentions exactes doivent figurer sur les factures normalisées de LE LABEUR et sur celles des Prestataires ?
13. Quelles obligations de coopération avec les autorités (réquisitions, contenu illicite) doivent être formalisées dans une procédure interne ?
14. Quel niveau d'assurance (RC professionnelle, cyber) est raisonnable pour une plateforme de cette taille ?
15. Quels sont les textes modificatifs récents à surveiller (lois de finances annuelles, actes réglementaires APDP, modifications de la loi 2017-05) et à quelle fréquence veiller ?

---

## 15. Ce que ce document ne peut pas garantir

- Il ne remplace pas une consultation juridique signée : trois décisions (qualification, répartition des frais, base légale des traitements) doivent être validées par un avocat béninois et un comptable local.
- Aucun montage ne garantit « zéro amende » en cas de manquement : la conformité se **prouve par des actes datés** (récépissés, factures, textes publiés, consentements, journaux), pas par des promesses.
- Les montants, seuils et taux cités proviennent de sources publiques à la date du 14 octobre 2026 et **évoluent chaque année avec la loi de finances** : une revue annuelle est obligatoire.
- L'enregistrement **ne bloque pas** le développement : on peut coder et tester immédiatement, en préproduction, et ouvrir au public dès la Vague 0 terminée (en pratique 3 à 10 jours).

---

## Annexe A — Textes cités

| Texte | Objet | Points utilisés |
|---|---|---|
| Loi n° 2017-05 du 29 août 2017 | Embauche, placement de la main-d'œuvre, résiliation du contrat de travail | art. 4 (enregistrement au bureau d'emploi et de placement), 17 à 21 (travail intérimaire, interdiction des intermédiaires), 27 et 30 (modifiés par la loi 2021-11), 42 (rémunération), 52 à 58 (incriminations, dont art. 56 : 25 000 à 250 000 FCFA, doublement en récidive) |
| Code du travail — loi n° 98-004 du 27 janvier 1998 (modifiée) | Relations de travail | CDD (max 2 ans renouvelable une fois ; visa de conformité), formalités d'embauche (CNSS et inspection du travail sous 48 h), visite médicale, SMIG, non-discrimination |
| Loi n° 2021-11 du 20 décembre 2021 | Infractions commises à raison du sexe | harcèlement sexuel (peine d'1 à 2 ans ; 500 000 à 10 000 000 FCFA), nullité/abus du licenciement consécutif, interdiction des représailles |
| Loi n° 2017-20 du 20 avril 2018 (modifiée par la loi 2020-35) — Code du numérique | Écrit et preuve électroniques, commerce électronique, protection des données, cybersécurité | art. 266-302 (écrit/signature/horodatage/archivage), 326-341 (information précontractuelle, charge de la preuve), 394-416 (données sensibles, consentement, formalités préalables, information), 405-409 (déclaration préalable, contenu du dossier), 454-460 (sanctions), 516-517 (détournement, traitement non autorisé) |
| Loi n° 2017-05 / APDP — formulaires et guides | Procédure de déclaration | formulaire unique, formulaire complémentaire site web (art. 406), annexes 1 à 4, pièces à joindre, gratuité du formulaire, tarifs des prestations connexes |
| CGI et documentation DGI | Fiscalité | art. 125 (barème ITS), 132 d) et 135 (AIB), 481-482 (facture normalisée), TPS 5 % (seuil 50 M FCFA), exonérations des nouvelles entreprises (12 mois), réductions d'IS 25/25/50 |
| Instruction BCÉAO n° 008-05-2015 | Monnaie électronique | art. 8 (interdiction sans agrément/autorisation), sanctions |
| AUDCG révisé (OHADA, 15 décembre 2010) | Intermédiaires de commerce | art. 3 (actes de commerce : courtage), Titre « du courtier » (définition, indépendance, rémunération, charge de la commission — numérotations 2010 et antérieure) |
| Actes réglementaires sociaux | Sécurité sociale | code de sécurité sociale (régime spécial des indépendants), ARCH (assurance maladie, retraite, formation, micro-crédit), déclaration d'embauche CNSS 48 h |

## Annexe B — Fiches de preuve à produire et conserver

| Preuve | Où | Fréquence |
|---|---|---|
| Récépissé APDP + dossier déposé | Classeur conformité + `apdp_declarations` | À l'obtention et à chaque mise à jour |
| Textes légaux versionnés + empreintes | `legal_documents` / `legal_versions` | À chaque modification |
| Acceptations horodatées | `legal_acceptances` | En continu |
| Registre des traitements | `data_processing_registry` | Revue trimestrielle |
| Statuts fiscaux (IFU/RCCM/régime) | `tax_profiles` | À l'inscription et à chaque changement |
| Factures normalisées (NIM/QR) | `invoices` + export DGI | À chaque encaissement |
| AIB retenu | `aib_withholdings` | À chaque règlement |
| Déclarations + attestations OTP | `payment_declarations`, `salary_confirmations` | À chaque cycle |
| Décisions de réclamation | `claims`, `claim_decisions` | À chaque dossier |
| Signalements sensibles | `harassment_reports` (accès restreint) | À chaque signalement |
| Incidents et réquisitions | `breach_incidents`, `authority_requests` | À chaque événement |
| Rapport des 10 tests juridiques | CI + dossier de conformité | À chaque version |
