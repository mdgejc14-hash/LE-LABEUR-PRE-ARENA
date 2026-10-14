# LE LABEUR — Pack démarches, registre et modèles (Bénin)

**Version 1.0 — 14 octobre 2026**
**Usage :** documents à déposer, courriers à envoyer, modèles à valider, classeur à tenir. Tous les modèles sont des **squelettes à faire relire par un avocat béninois** avant signature ou envoi.

---

## 1. Plan des sept premiers jours

| Jour | Action | Sortie attendue |
|---|---|---|
| J1 | Décision écrite de qualification (« porte B ») ; création du dossier APIEx ; ouverture du compte `monentreprise.bj` | Note de décision signée ; dossier déposé |
| J2 | Dépôt APIEx (RCCM) ; demande IFU ; ouverture du compte **e-MECeF** | Récépissé de dépôt ; identifiants fiscaux en cours |
| J3 | Rédaction des textes (CGU, confidentialité, anti-harcèlement, charte cliente, politique de réclamation) ; contrat-type de prestation | Textes v1 envoyés au conseil |
| J4 | Constitution du dossier APDP (formulaire unique + complémentaire site web + annexes 1 à 4 + pièces) | Dossier prêt à déposer |
| J5 | Dépôt APDP ; envoi des courriers Direction générale du Travail et DGI | Accusés de dépôt |
| J6 | Compte commercial (banque/mobile money marchand) ; assurance RC professionnelle | IBAN/identifiants ; police |
| J7 | Activation du mode « lancement fermé » : textes publiés, récépissé « en cours » affiché, 50 invitations formelles | Environnement public ouvert en mode restreint |

---

## 2. Registre des traitements (art. 409 du Code du numérique)

> Ce tableau est le cœur du dossier APDP. Il doit être tenu à jour et pouvoir être présenté à tout moment. Les mentions minimales exigées par l'article 409 sont toutes représentées par une colonne.

| # | Traitement | Finalité | Base légale | Personnes concernées (et volume estimé) | Données traitées | Origine | Destinataires / accès | Interconnexions | Transfert hors Bénin | Durée de conservation | Mesures de sécurité |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Comptes et authentification | Créer et sécuriser l'accès | Contrat | Clients + Prestataires (10 000) | nom, e-mail, téléphone, identifiant Google, rôle, journal de connexion | Personne concernée, Google Identity | Équipe technique habilitée | Aucune | Oui (hébergement) → annexe 4 | Compte actif + 12 mois après clôture | MFA admin, hachage, sessions chiffrées, journal d'accès |
| 2 | Profils professionnels | Présenter les compétences, permettre la mise en relation | Contrat | Prestataires (≈ 8 000) | compétences, expérience, zone, disponibilités, statut (Entreprenant/EI/société), IFU/RCCM | Personne concernée | Client destinataire d'une proposition, équipe modération | Aucune | Oui → annexe 4 | Vie du compte + 24 mois | Champs déclarés/vérifiés distincts, accès par objet |
| 3 | Rapprochement de compétences | Proposer des missions pertinentes | Contrat + consentement explicite (révocable) | Prestataires consentants | critères de score (compétences, zone, disponibilité), résultat explicable | Plateforme | Prestataire, Client de la mission | Aucune | Oui → annexe 4 | 24 mois | Score explicable, aucune décision automatisée, retrait du consentement effectif sous 24 h |
| 4 | Missions et propositions | Publier, proposer, négocier | Contrat | Clients + Prestataires | intitulé, description, budget, prix, dates, livrables, versions | Parties | Parties concernées, modération en cas de signalement | Aucune | Oui → annexe 4 | 5 ans après fin de mission | Versions immuables, empreintes |
| 5 | Messagerie interne | Permettre l'échange dans le contexte de la mission | Contrat | Clients + Prestataires | contenu des messages, participants, horodatages, états de lecture | Parties | Parties de la conversation uniquement | Aucune | Oui → annexe 4 | 24 mois | Accès par participant vérifié, journal d'accès, chiffrement |
| 6 | Accord, signatures et preuves | Prouver l'engagement des parties | Contrat | Clients + Prestataires | document, version, empreinte SHA-256, identité signataire, horodatage, IP | Parties | Parties, conseil en cas de litige, autorités sur réquisition | Aucune | Oui → annexe 4 | 10 ans | Signature liée à la version, R2 privé, URL signée temporaire |
| 7 | Jalons, déclarations de règlement, attestations | Tracer l'exécution et la réception | Contrat | Clients + Prestataires | jalons, dates, montants déclarés, mode, référence, code OTP (haché), résultat de confirmation | Parties, fournisseur OTP | Parties concernées, contrôle habilité | Fournisseur OTP (statut d'envoi) | Oui → annexe 4 | 5 ans | OTP à usage unique, jamais en clair dans les journaux, essais limités |
| 8 | Facturation et fiscalité | Émettre les factures normalisées et satisfaire les obligations fiscales | Obligation légale | Clients (payeurs), Prestataires facturés | dénomination, RCCM, IFU, montants, NIM, code, QR | Parties, DGI | DGI (e-MECeF), comptable | **Oui — e-MECeF (DGI)** | Selon hébergement → annexe 4 | 10 ans (obligation comptable) | Flux DGI authentifié, journaux d'émission |
| 9 | Réclamations et médiation | Traiter les désaccords et conserver les preuves | Contrat + intérêt légitime | Parties d'un dossier (≤ 5 % des utilisateurs) | motif, pièces, échanges, décisions, acteurs | Parties | Parties du dossier + agent habilité | Aucune | Oui → annexe 4 | 5 ans après clôture | Circuit restreint, journal d'accès, décisions motivées |
| 10 | Signalements sensibles (harcèlement, sécurité) | Protéger les personnes, traiter les faits graves | Intérêt légitime + obligation légale | Signalants et mis en cause (volume confidentiel) | récit, pièces, mesures | Signalant | Équipe conformité restreinte uniquement | Aucune | Oui → annexe 4 | 5 ans | Accès ultra-restreint, journalisation, interdiction de représailles |
| 11 | Journalisation et sécurité | Détecter les incidents, prouver les accès | Intérêt légitime | Utilisateurs et administrateurs | identifiants, IP, actions, résultats, corrélation | Plateforme | Équipe sécurité | Aucune | Oui → annexe 4 | 12 mois | Append-only, séparation des rôles |
| 12 | Notifications | Informer les utilisateurs des événements | Contrat | Utilisateurs | e-mail, téléphone, type d'événement, statut d'envoi | Personne concernée | Fournisseurs e-mail/SMS | Fournisseurs | Oui → annexe 4 | 12 mois | Minimisation du contenu, pas de donnée sensible dans le texte |
| 13 | Retours d'expérience sur mission | Alimenter la réputation vérifiable (V1) | Contrat | Parties, comptes publiés (opt-in) | événement, mission, décision source | Plateforme | Parties, public si consentement | Aucune | Oui → annexe 4 | 5 ans | Contestation possible, correction par événement (jamais suppression), pas de notation publique par défaut |

**À vérifier à chaque revue :** les volumes, les destinataires réels (liste nominative des sous-traitants avec pays d'hébergement), les durées réellement appliquées par les jobs de purge.

---

## 3. Note d'information des personnes (art. 415) — squelette

1. **Qui est responsable du traitement** : dénomination, RCCM, IFU, adresse, contact, point de contact conformité.
2. **Pourquoi** (finalités) : reprendre les lignes 1 à 13 du registre, en langage clair.
3. **Sur quelle base** : exécution du contrat, consentement (rapprochement, communications), obligation légale (facturation, coopération avec les autorités), intérêt légitime (sécurité, prévention de la fraude).
4. **Quelles données** : liste par catégorie, avec la mention « nous ne collectons aucune donnée sensible ».
5. **Qui y accède** : équipes habilitées, prestataires (avec pays), autorités sur réquisition.
6. **Combien de temps** : durées du registre.
7. **Vos droits** : accès, rectification, opposition, effacement, retrait du consentement, contestation d'une entrée de réputation ; modalité (espace personnel + contact) et délai de réponse annoncé.
8. **Transfert hors du Bénin** : décrire l'hébergement et l'autorisation/déclaration applicable.
9. **Sécurité** : mesures principales (chiffrement, MFA, journalisation, accès nominatifs).
10. **Réclamation** : coordonnées de l'APDP + voie interne préalable.
11. **Version et date d'entrée en vigueur** : conserver toutes les versions.

---

## 4. Checklist du dossier APDP

**Formulaires**
- [ ] Formulaire unique de formalités préalables (identification du responsable et de son représentant légal, description des traitements, catégories et nombre de personnes concernées, opérations effectuées).
- [ ] Formulaire complémentaire **« site web »** (art. 406) : données collectées, origine, finalités (identification, mesure d'audience, contrôle des publications, suivi d'activité), cookies et traceurs.
- [ ] Annexe 1 — sous-traitance (hébergeur, courriel, SMS, e-MECeF, OTP).
- [ ] Annexe 2 — communication à des tiers (le cas échéant : conseil, comptable, assurance).
- [ ] Annexe 3 — interconnexions (le cas échéant : DGI/e-MECeF, fournisseur d'identité).
- [ ] Annexe 4 — **transfert à l'étranger** (hébergement et sous-traitants hors du Bénin).

**Pièces**
- [ ] Preuve du recueil de consentement (écrans + enregistrements).
- [ ] Engagement de confidentialité signé par les agents ayant accès aux données.
- [ ] Contrat de confidentialité avec chaque sous-traitant.
- [ ] Clauses de confidentialité de l'hébergeur / du fournisseur cloud.
- [ ] Politique de sécurité appliquée au traitement.
- [ ] Copie du NPI ou de la pièce d'identité du responsable de traitement.
- [ ] Copie du RCCM et/ou de l'IFU.
- [ ] Projet d'annonce d'information (note d'information) et projet de politique de confidentialité.
- [ ] Registre des traitements (section 2).
- [ ] Coordonnées du point de contact conformité.

---

## 5. Politique de sécurité (squelette en 12 points)

1. Inventaire des actifs et des données ; cartographie des flux.
2. Gestion des identités : MFA obligatoire pour l'administration, comptes nominatifs, revue trimestrielle.
3. Cloisonnement des environnements (dev / préproduction / production) et des secrets.
4. Chiffrement en transit (HTTPS) et au repos ; sauvegardes chiffrées ; test de restauration semestriel.
5. Journalisation append-only des accès et actions sensibles, conservation 12 mois.
6. Gestion des vulnérabilités : dépendances, correctifs, revue de code, tests IDOR.
7. Réponse aux incidents : classification, containment, **notification APDP sans délai** (viser ≤ 72 h), information des personnes si risque élevé.
8. Réponse aux réquisitions : procédure, canal officiel, journal, minimisation, refus des demandes irrégulières.
9. Sensibilisation des agents : confidentialité, hameçonnage, données personnelles.
10. Sous-traitants : due diligence, clauses, localisation, droit d'audit.
11. Purge et archivage : job quotidien aligné sur le registre, journal des suppressions.
12. Continuité : plan de reprise, RTO/RPO documentés, tests.

### 5.1 Fiche de violation de données (modèle)

| Champ | Contenu |
|---|---|
| Référence | INC-____ |
| Date/heure de détection | |
| Nature | confidentialité / intégrité / disponibilité |
| Catégories de données et volumes | |
| Cause probable | |
| Mesures immédiates | |
| Risque pour les personnes | faible / élevé (critères) |
| Notification APDP | date, canal, référence, contenu |
| Information des personnes | oui/non + justification |
| Mesures correctives et échéance | |
| Décision et signataire | |

---

## 6. Courriers types

### 6.1 À l'Autorité de protection des données personnelles (APDP)

> **Objet : déclaration préalable de traitements de données à caractère personnel — [DÉNOMINATION]**
>
> Madame/Monsieur le Président,
>
> [DÉNOMINATION], [forme juridique], immatriculée au RCCM sous le n° [__], IFU [__], dont le siège est à [__], représentée par [nom, qualité], a l'honneur de solliciter l'accomplissement des formalités préalables prévues aux articles 405 et suivants de la loi n° 2017-20 portant code du numérique en République du Bénin, pour la mise en œuvre des traitements liés à l'exploitation de la plateforme [nom du service].
>
> Sont joints : le formulaire unique dûment rempli, le formulaire complémentaire relatif aux traitements mis en œuvre sur site web, les annexes [1 à 4] applicables, le registre des traitements, la politique de sécurité, la note d'information destinée aux personnes concernées, les contrats et clauses de confidentialité conclus avec nos sous-traitants, ainsi que la copie de notre RCCM et de notre IFU.
>
> Nous attirons votre attention sur le fait que notre activité consiste en une mise en relation entre organisations clientes et professionnels indépendants, sans détention de fonds ni traitement de données sensibles. Aucun traitement mentionné ne porte sur des données biométriques, de santé, ou sur un numéro national d'identification.
>
> Nous nous tenons à votre disposition pour tout complément et vous prions d'agréer, Madame/Monsieur le Président, l'expression de notre haute considération.
>
> [Signature, nom, qualité, date]

### 6.2 À la Direction générale du Travail (demande d'orientation préalable)

> **Objet : demande d'orientation préalable sur la qualification d'une activité de mise en relation professionnelle**
>
> Madame/Monsieur le Directeur général,
>
> [DÉNOMINATION] développe une plateforme numérique permettant à des organisations clientes de publier des missions et à des professionnels **indépendants** — justifiant d'un statut d'Entreprenant, d'entreprise individuelle ou de société, et d'un Identifiant fiscal unique — de proposer leurs services. La plateforme formalise des propositions de mission, un accord d'engagement de prestation de services signé électroniquement par les deux parties, le suivi des livrables et la traçabilité des règlements, effectués directement entre les parties. Elle ne détient aucun fonds, n'emploie aucun travailleur et ne perçoit aucun frais des professionnels.
>
> Soucieuse de se conformer strictement aux dispositions de la loi n° 2017-05 du 29 août 2017 fixant les conditions et la procédure d'embauche, de placement de la main-d'œuvre et de résiliation du contrat de travail — notamment ses articles 4 et 21 —, notre entreprise sollicite votre orientation sur les points suivants : (1) cette activité de mise en relation d'affaires entre professionnels indépendants relève-t-elle du régime du placement de main-d'œuvre ou du travail intérimaire ? (2) le cas échéant, quelles formalités d'enregistrement et garanties devrions-nous accomplir ? (3) quelles précautions recommandez-vous pour prévenir toute requalification en contrat de travail ?
>
> Nous joignons à cette demande : nos conditions générales, notre contrat-type de prestation de services, le cahier des charges du contrôle d'indépendance mis en œuvre par la plateforme, ainsi que notre RCCM et notre IFU. Nous nous engageons à nous conformer à vos recommandations et à vous transmettre toute évolution substantielle de notre dispositif.
>
> [Signature, nom, qualité, date]

### 6.3 À la Direction générale des Impôts

> **Objet : demande de précisions — régime fiscal, facturation normalisée et acompte AIB pour une plateforme de mise en relation**
>
> Madame/Monsieur le Directeur général,
>
> [DÉNOMINATION] (RCCM [__], IFU [__]), [forme juridique], exerce une activité de services de mise en relation professionnelle facturée à des organisations clientes. Nous sollicitons vos précisions sur : (1) le régime d'imposition applicable au démarrage et les exonérations ouvertes aux entreprises nouvellement créées ; (2) les modalités d'enrôlement et d'utilisation du système e-MECeF pour nos factures de services, y compris la connexion d'un système de facturation d'entreprise que nous développerions ; (3) le taux et les modalités d'application de l'acompte sur impôt assis sur les bénéfices (AIB) retenu par nos clients sur nos factures, ainsi que les conséquences d'un IFU non actif ; (4) les obligations déclaratives périodiques qui nous incombent.
>
> Nous joignons notre RCCM, notre attestation IFU et une présentation de notre modèle de facturation. Nous vous remercions de vos instructions et vous prions d'agréer l'expression de notre considération distinguée.
>
> [Signature, nom, qualité, date]

---

## 7. Bibliothèque de clauses

### 7.1 Contrat de prestation de services (Client ↔ Prestataire) — trame en 26 articles

> Modèle à valider par un avocat. Durée de référence : à adapter par mission.

1. **Parties** : identification complète (dénomination, RCCM, IFU, représentant pour le Client ; nom, statut d'indépendant, IFU pour le Prestataire).
2. **Objet** : description précise de la mission, des livrables et des critères d'exécution.
3. **Nature de la relation** — clause d'indépendance :
   *« Le Prestataire agit en qualité de professionnel indépendant. Le présent accord ne constitue ni un contrat de travail, ni un placement, ni une mise à disposition de main-d'œuvre. Le Prestataire n'est pas placé sous l'autorité, la direction ou le contrôle du Client. Il n'existe entre les parties aucun lien de subordination juridique permanente. »*
4. **Absence de pouvoir de direction et de sanction** : le Client ne donne pas d'instructions hiérarchiques, ne sanctionne pas disciplinairement, n'impose pas de pointage ; il exprime ses besoins en termes de livrables et de qualité.
5. **Liberté d'organisation** : le Prestataire choisit ses méthodes, ses horaires d'exécution dans le respect des délais, ses moyens.
6. **Moyens** : le Prestataire utilise son matériel, ses outils et sa connexion, sauf disposition écrite et rémunérée.
7. **Non-exclusivité** : le Prestataire peut exécuter des missions pour d'autres clients, y compris concurrents ; aucune clause de non-concurrence n'est imposée.
8. **Prix et paliers** : prix du cycle 1 : [22 500] FCFA ; prix des cycles suivants : [30 000] FCFA par cycle ; monnaie : franc CFA ; toute évolution du prix suppose une nouvelle version acceptée par les deux parties.
9. **Frais de service de la plateforme** : *« Les frais de service de mise en relation de LE LABEUR sont facturés exclusivement au Client, pour un montant de [7 500] FCFA au titre du premier cycle, et sont sans lien avec la rémunération du Prestataire. Le Prestataire ne supporte ni ne règle aucun frais de plateforme. »*
10. **Facturation et fiscalité** : le Prestataire délivre une facture conforme à son statut ; le Client applique les retenues fiscales obligatoires, notamment l'acompte AIB, dont le taux dépend de l'immatriculation du Prestataire à l'IFU ; toute facture normalisée est émise via le dispositif DGI applicable.
11. **Modalités de règlement** : règlement direct entre les parties, hors plateforme, aux échéances convenues ; le Client déclare le règlement dans la plateforme ; le Prestataire confirme la réception.
12. **Preuve de règlement** : référence de transaction, date, montant, canal ; la déclaration n'est pas une écriture bancaire.
13. **Délais et livrables** : jalons, critères d'acceptation, procédure de validation, conséquences du retard imputable.
14. **Obligations du Prestataire** : diligence professionnelle, conformité légale et fiscale, assurance, respect des règles de sécurité sur site.
15. **Obligations du Client** : fournir les informations et accès nécessaires, régler le prix direct, respecter l'indépendance du Prestataire, ne pas solliciter de contournement de la plateforme.
16. **Confidentialité** : réciproque, durée [3] ans après la fin de la mission, exclusions usuelles.
17. **Protection des données personnelles** : chaque partie respecte le code du numérique ; les données échangées dans le cadre de la mission ne sont utilisées que pour la mission ; les demandes de droits sont dirigées vers la plateforme pour ses traitements et vers chaque partie pour ses propres traitements.
18. **Propriété intellectuelle** : cession des livrables au Client après complet paiement du prix ; le Prestataire conserve ses méthodes, savoir-faire et composants préexistants.
19. **Assurance** : le Prestataire justifie d'une assurance couvrant son activité ; le Client déclare son assurance responsabilité.
20. **Violence, harcèlement et discrimination** : les parties s'interdisent tout comportement constitutif de harcèlement ou de discrimination, et s'engagent à signaler les faits à la plateforme, sans représailles.
21. **Suspension** : en cas de manquement grave ou de risque pour une personne, suspension immédiate des jalons en cours, avec information écrite.
22. **Résiliation** : préavis de [__] jours pour l'accord à durée indéterminée ; résiliation immédiate pour manquement grave ; conséquences financières des travaux déjà exécutés et acceptés.
23. **Remplacement** : si le Prestataire ne peut pas exécuter, les parties peuvent convenir d'un remplacement via la plateforme, sans transfert d'obligations personnelles.
24. **Médiation** : *« En cas de différend, les parties saisissent d'abord la procédure de réclamation de LE LABEUR aux fins de médiation, dans un délai de [15] jours. La médiation est sans préjudice de la saisine des juridictions compétentes. »*
25. **Droit applicable et juridiction** : droit béninois ; juridictions compétentes ; élection de domicile.
26. **Versions, signature et preuve** : la version signée est figée et empreintée (SHA-256) ; toute modification requiert une nouvelle version signée par les deux parties.

### 7.2 Convention Client ↔ LE LABEUR (extraits)

- Objet : accès au service de mise en relation, facturation des frais de service, obligations de conformité du Client (RCCM/IFU à jour, déclaration des règlements, retenues fiscales, pas de sollicitation de travail dissimulé).
- Frais de service : 25 % du budget du premier cycle, facturés au Client ; **0 %** sur les cycles suivants du même accord ; facture normalisée émise via le dispositif DGI.
- Retard de paiement des frais de service : relances, intérêts de retard conformes à la réglementation, suspension de nouvelles publications après mise en demeure — **sans jamais** suspendre la protection du Prestataire ni bloquer un dossier de réclamation.
- Non-contournement : interdiction de poursuivre hors plateforme une relation issue d'une mise en relation, pendant [12] mois, sauf accord écrit.
- Conformité : le Client garantit la véracité de ses informations, l'absence de travail dissimulé et le respect des règles d'hygiène et de sécurité applicables à son activité.
- Résiliation, responsabilité, médiation, droit applicable.

### 7.3 Conditions générales d'utilisation — plan de rédaction

1. Objet et qualification de la plateforme (reprise de la formule A.1).
2. Définitions (Client, Prestataire, Mission, Proposition de mission, Accord d'engagement, Frais de service, Réclamation, Médiation).
3. Conditions d'accès (statut requis, vérifications, âge, capacité).
4. Comptes, sécurité, exactitude des informations.
5. Fonctionnement : publication, propositions, négociation, accord, suivi, déclaration de règlement, confirmation.
6. Prix, frais et facturation (trois lignes + retenues).
7. Règles de conduite : interdiction du travail dissimulé, du harcèlement, des contenus illicites, du contournement, des fausses déclarations.
8. Indépendance des parties et exclusion du salariat.
9. Données personnelles (renvoi à la politique + registre + récépissé APDP).
10. Réclamations, médiation, suspension de compte, voies de recours.
11. Limitation de responsabilité et garanties (reprise des mentions honnêtes : LE LABEUR ne garantit ni le paiement ni le volume de missions).
12. Durée, résiliation, effets ; droit applicable ; juridictions ; version des CGU et historique.

---

## 8. Calendrier fiscal et social (à confirmer avec le comptable)

| Obligation | Échéance | Référence |
|---|---|---|
| TPS — acompte provisionnel | dans les 10 premiers jours de **février** et de **juin** | CGI (régime du forfait) `[V]` |
| TPS — solde et déclaration annuelle | au plus tard le **30 avril** | CGI `[V]` |
| TVA — déclaration et paiement (si assujetti) | au plus tard le **10 du mois suivant** | CGI art. 223 et s. `[V]` |
| Facture normalisée (e-MECeF) | à chaque opération, en temps réel | CGI art. 481 et s. `[V]` |
| AIB retenu par les clients | à chaque règlement, imputable | CGI art. 132 d), 135 `[V]` |
| ITS + versement patronal sur salaire (si un jour salariat) | mensuel | CGI art. 125 ; taux VPS 4 % `[V]` |
| Déclaration d'embauche (si salariat) | **48 heures** (CNSS + inspection du travail) | Code du travail / CNSS `[V]` |
| Exonérations nouvelles entreprises | 12 premiers mois (patente, TPS) | DGI `[V]` |

---

## 9. Classeur de contrôle (index à tenir à jour)

| N° | Pièce | Emplacement | Dernière mise à jour | Responsable |
|---|---|---|---|---|
| 1 | RCCM, journal de publication, attestation IFU | Classeur A | | Direction |
| 2 | Récépissé APDP + dossier déposé (formulaires, annexes, pièces) | Classeur B | | Conformité |
| 3 | Registre des traitements + note d'information + politique de confidentialité | Classeur B | | Conformité |
| 4 | Politique de sécurité, procédures violation et réquisition, fiches d'incident | Classeur C | | Sécurité |
| 5 | CGU, charte client, politique anti-harcèlement, historique des versions | Classeur B | | Conformité |
| 6 | Contrat-type de prestation + exemplaires signés (anonymisés) + contrôle d'indépendance | Classeur D | | Direction |
| 7 | Matrice rôles/permissions, liste des agents habilités, engagements de confidentialité | Classeur C | | Sécurité |
| 8 | Liste des sous-traitants, pays d'hébergement, contrats et clauses de confidentialité | Classeur C | | Sécurité |
| 9 | Factures normalisées émises + justificatifs de règlement des frais de service | Classeur E | | Comptabilité |
| 10 | Déclarations fiscales, échéancier, attestations | Classeur E | | Comptabilité |
| 11 | Dossiers de réclamation (avec décisions) | Classeur F | | Modération |
| 12 | Signalements sensibles (accès restreint) | Coffre numérique | | Conformité |
| 13 | Rapport des tests juridiques (lexique, zéro fonds, facture, purge, harcèlement) | Classeur C | | Technique |
| 14 | Journal des courriers aux administrations et des visites de contrôle | Classeur A | | Direction |

---

## 10. Points de vigilance permanents

1. **Loi de finances annuelle** : vérifier chaque année les taux, seuils et exonérations (TPS, IS, AIB, TVA) et mettre à jour les écrans de calcul.
2. **APDP** : surveiller les nouvelles lignes directrices (cookies, transferts, durées) et mettre à jour le registre.
3. **Loi 2017-05** : surveiller les modifications et la doctrine de la Direction générale du Travail ; conserver la trace de la demande d'orientation (§6.2) et des réponses.
4. **e-MECeF** : surveiller les évolutions techniques (authentification, formats) et maintenir le flux DGI opérationnel ; ne jamais laisser une facture « en attente » silencieuse.
5. **Requalification** : réexaminer le contrôle d'indépendance tous les trimestres au regard des missions réellement publiées.
6. **Sécurité** : exercice de restauration semestriel et test d'incident annuel.
