/**
 * ADM —— BACKEND_GAP déclarés, fiche par fiche.
 *
 * Chaque entrée nomme la fiche de design et la capacité ABSENTE du backend.
 * Elle est affichée telle quelle par l'écran concerné : c'est la seule réponse
 * autorisée à une donnée manquante (« ne pas inventer une valeur »).
 *
 * Aucune de ces lignes ne décrit une API que cette tranche aurait créée : le
 * backend métier n'est pas modifié. Les routes citées existent (ou non) dans
 * `src/backend/api/routeContracts.ts` ; l'état réel est vérifié par test.
 *
 * P4C-DESIGN-ADMIN-SALARY-PROOFS (ADM-23 → ADM-24) : la confirmation OTP du
 * Salaire reste strictement réservée au Candidat et sa demande à l'Employeur ;
 * aucune route ADMIN ne lit la confirmation ni le dossier de preuve, et aucun
 * secret OTP n'est exposé.
 */

export const ADMIN_UNIT_GAPS: Record<string, readonly string[]> = {
  'ADM-01': [
    'ADM-01 · fiche : GET /admin/overview, GET /admin/queues/summary, GET /admin/activity?since= et GET /admin/health/series — absents du produit. Le tableau de bord compose uniquement admin.users.list, admin.qualifications/review, admin.stats.read, admin.audit.list et admin.incidents.list.',
    'ADM-01 · admin.stats.read répond toujours un objet de métriques vide : les tuiles concernées affichent « — » (valeur absente), jamais un zéro présenté comme réel.',
    'ADM-01 · admin.audit.list et admin.incidents.list répondent une frontière de contrôle sans données métier : le journal d’activité et les incidents ne sont pas lisibles.',
    'ADM-01 · « mode incident » et bascule d’astreinte : aucune API produit.',
  ],
  'ADM-02': [
    'ADM-02 · fiche : GET /admin/users?q=&role=&state=&cursor= — la recherche et les filtres serveur sont absents : la recherche et les filtres sont appliqués localement sur la page réelle chargée (100 comptes maximum).',
    'ADM-02 · POST /admin/exports — absent : aucun export CSV journalisé.',
    'ADM-02 · pagination : le handler réel renvoie toujours hasMore à false (aucun curseur) ; la page chargée est la seule source.',
    'ADM-02 · compteurs d’activité, drapeaux de récidive et blocages antérieurs : aucun endpoint produit.',
  ],
  'ADM-03': [
    'ADM-03 · fiche : GET /admin/users/:id, GET /admin/users/:id/timeline et POST /admin/users/:id/notes — absents. La fiche est composée depuis admin.users.list (page réelle) ; historique, signalements et notes internes ne sont pas lisibles.',
    'ADM-03 · indicateurs d’activité (contrats, candidatures, claims) et taux de complétion : aucun endpoint ADMIN produit.',
    'ADM-03 · « envoyer en revue » (POST /admin/users/:id/review) — absent.',
    'ADM-03 · journal des consultations de fiches (qui, quand, quoi) — absent : aucune trace d’accès n’est exposée.',
  ],
  'ADM-04': [
    'ADM-04 · POST /admin/users/:id/block existe (permission users:block, motif obligatoire, idempotent, audit USER_BLOCKED, sessions actives révoquées) mais ne porte AUCUNE portée ni durée : le blocage réel est total (statut BLOCKED), sans suspension simple ni gel ciblé.',
    'ADM-04 · POST /admin/users/:id/unblock est déclarée dans le catalogue de routes SANS handler opérationnel (réponse 501 réelle) : le déblocage n’est pas disponible dans cette tranche.',
    'ADM-04 · POST /admin/users/:id/block/countersign (double validation) — absent : aucune contre-signature serveur.',
    'ADM-04 · le handler de blocage n’est installé qu’avec une persistance PostgreSQL durable : sans base configurée, la route répond 501 (état réel affiché).',
    'ADM-04 · simulateur d’effets (contrats, paiements, documents) — absent : la fiche liste les effets réels connus (statut BLOCKED, sessions révoquées, audit).',
  ],
  'ADM-05': [
    'ADM-05 · fiche : GET /admin/blocks?cursor=&filters=, GET /admin/blocks/stats et POST /admin/blocks/export — absents du produit : aucun registre des blocages n’est lisible.',
    'ADM-05 · les événements USER_BLOCKED existent dans le ledger d’audit serveur, mais aucune route ADMIN ne les expose en lecture.',
    'ADM-05 · statistiques (blocages 30 jours, taux de levée, motif dominant, délai de recours) — absentes.',
  ],
  'ADM-06': [
    'ADM-06 · fiche : POST /admin/qualification/:id/claim (verrou de prise en charge) — absent : aucun verrou serveur, deux agents peuvent examiner la même revue.',
    'ADM-06 · GET /admin/qualification/sla — absent : aucun compteur SLA ni délai médian exposé ; l’ancienneté affichée est la date réelle d’évaluation.',
    'ADM-06 · filtres serveur (règle, catégorie, montant, pays) — absents ; le filtre local porte sur les motifs réels de la page chargée.',
    'ADM-06 · la file n’est alimentée qu’avec une persistance PostgreSQL durable : sans base configurée, la route répond 501 (état réel affiché).',
  ],
  'ADM-07': [
    'ADM-07 · fiche : GET /admin/qualification/:id — absent : la revue est composée depuis la file réelle (admin.qualifications/review) ; un lien profond vers une qualification déjà traitée affiche un état honnête.',
    'ADM-07 · POST /admin/qualification/:id/request-info (demande de complément) — absent : aucune messagerie de revue.',
    'ADM-07 · POST /admin/qualification/:id/recuse (récusation) — absent.',
    'ADM-07 · checklist d’examen persistée — absente : aucune trace d’examen côté serveur.',
  ],
  'ADM-08': [
    'ADM-08 · la revue réelle n’accepte que deux décisions : ELIGIBLE_FOR_INDEPENDENT et BLOCKED (motif de 10 à 1000 caractères). La troisième carte de la fiche (« complément requis ») n’existe pas côté serveur.',
    'ADM-08 · GET /admin/qualification/:id/effects-preview — absent : les effets affichés sont ceux, réels, du moteur (parcours indépendant débloqué ou blocage des résultats de matching).',
    'ADM-08 · « enregistrer un brouillon » — absent : la décision est appliquée immédiatement, de façon idempotente et auditée (MISSION_QUALIFICATION_REVIEWED).',
    'ADM-08 · la décision est à usage unique : une qualification déjà revue renvoie un conflit 409 réel.',
  ],
  'ADM-09': [
    'ADM-09 · fiche : GET /admin/qualification/history?cursor=&filters=, GET /admin/qualification/analytics et POST /admin/qualification/export — absents du produit : aucun historique de verdicts n’est lisible.',
    'ADM-09 · les revues sont auditées côté serveur (MISSION_QUALIFICATION_REVIEWED dans le ledger d’audit), mais aucune route ADMIN ne les expose en lecture.',
    'ADM-09 · distribution des verdicts, taux de recours et détecteur de dérive — absents.',
  ],
  'ADM-10': [
    'ADM-10 · fiche : GET /admin/matching/runs?cursor=, POST /admin/matching/runs/:id/retry et GET /admin/matching/health — absents du produit : aucun run n’est listable côté administration.',
    'ADM-10 · GET /api/v1/admin/match-events est déclarée (permission match:read:any) SANS handler opérationnel (réponse 501 réelle).',
    'ADM-10 · GET /api/v1/matching-runs/:runId existe mais est strictement réservée à l’employeur propriétaire (vérification serveur) : un admin ne peut pas lire un run.',
    'ADM-10 · aucune métrique de santé du service de matching n’est exposée (durée médiane, taux d’échec, files en attente).',
  ],
  'ADM-11': [
    'ADM-11 · fiche : GET /admin/matching/runs/:id et GET /admin/matching/runs/:id/bias-tests — absents : aucun détail de run ni test de biais n’est lisible côté administration.',
    'ADM-11 · POST /admin/matching/factors/:id/disable (kill switch) — absent : aucune désactivation de facteur n’est possible.',
    'ADM-11 · les résultats et explications de matching sont lisibles uniquement par l’employeur propriétaire du run (route réelle, contrôle serveur).',
  ],
  'ADM-12': [
    'ADM-12 · fiche : GET /admin/matching/rulesets, POST /admin/matching/rulesets/:v/simulate et POST /admin/matching/rulesets/:v/activate — absents : aucune lecture, simulation, activation ni archivage de règles.',
    'ADM-12 · les versions de règles affichées sont celles réellement observées dans les données lues (ruleVersion des qualifications en file) ; aucune version n’est inventée.',
    'ADM-12 · édition des poids de facteurs, tests de biais préalables et double validation — absents : aucune modification de règle n’est possible depuis l’interface.',
  ],
  /* ── P4B-1 · supervision des contrats ── */
  'ADM-13': [
    'ADM-13 · fiche : GET /admin/contracts?segment=&cursor= — la route admin.contracts.list existe et répond le registre réel (permission contrats:read:any), mais sans segment serveur : les filtres de la fiche sont appliqués localement sur la page réellement chargée ; le curseur réellement renvoyé (id de contrat) sert au chargement de la page suivante.',
    'ADM-13 · GET /admin/contracts/summary — absent : aucune synthèse serveur. Les repères affichés sont des comptes sur la page réellement chargée, jamais sur la base entière.',
    'ADM-13 · POST /admin/contracts/export — absent : aucun export du registre (et donc aucune journalisation d’export). Aucun bouton d’export n’est proposé.',
    'ADM-13 · détecteur d’inactivité « sans activité depuis 7 jours » — absent : le DTO Contrat n’expose aucune date de dernière activité ; aucune estimation n’est affichée à la place.',
    'ADM-13 · montants : seule la valeur contractuelle réellement lisible est affichée (salaire mensuel et devise du contrat). Les écrans de paiement et de rapprochement, ainsi que tout agrégat financier, sont hors de cette tranche (P4B-2).',
    'ADM-13 · sans persistance PostgreSQL durable, la route répond sa frontière de contrôle (collection vide, persistence: « not-configured ») : le registre affiche l’absence réelle de données, jamais un registre simulé.',
  ],
  'ADM-14': [
    'ADM-14 · fiche : GET /admin/contracts/:id — absent : aucune lecture individuelle ADMIN n’existe (la route contracts.read est strictement réservée aux parties du contrat, contrôle serveur). La fiche est composée depuis la page réelle de admin.contracts.list (100 contrats par page) ; un contrat hors de la page chargée affiche un état honnête.',
    'ADM-14 · GET /admin/contracts/:id/versions — absent : aucune table de versions ni de diff n’est exposée à l’ADMIN. La frise rendue est l’historique réellement émis par les services (champ Contrat.history) ; aucune version n’est inventée.',
    'ADM-14 · POST /admin/contracts/:id/notes (notes internes) et geste « escalader » — absents : aucune écriture n’est possible depuis cette fiche ; elle est en lecture seule.',
    'ADM-14 · signature et activation : les routes réelles (contracts.sign, contracts.activate) sont réservées aux parties ; l’ADMIN consulte l’état et les horodatages réels des signatures, il ne signe ni n’active rien depuis l’interface.',
    'ADM-14 · bandeau de niveau d’accès (lecture / action / financier) par écran : aucune donnée serveur ne le décrit ; seule la liste des permissions dérivées par le serveur pour la session est affichée.',
    'ADM-14 · pièces liées au contrat (vue ADMIN par contrat) : la route admin.documents.list existe (permission documents:read:any) mais ne filtre pas par contrat ; aucun rattachement fiable n’étant exposé, aucune liste de pièces n’est présentée.',
  ],
  'ADM-15': [
    'ADM-15 · fiche : GET /admin/contracts/:id/incidents — absent : les incidents d’un contrat sont lus via la route ADMIN existante des Claims (admin.claims.list, permission incidents:read:any), filtrée localement sur le champ réel Contrat du Claim, page réellement chargée (100 Claims). Aucun endpoint par contrat n’existe.',
    'ADM-15 · POST /admin/contracts/:id/incidents (création manuelle motivée) et POST /admin/contracts/:id/preventions (actions préventives) — absents : cette tranche ne crée ni n’appelle aucune écriture ; la décision de Claim est gouvernée par le serveur et relève d’une autre tranche (hors P4B-1).',
    'ADM-15 · score de risque de Claim — absent : aucun modèle serveur n’est exposé ; aucun score n’est calculé ni affiché dans l’interface.',
    'ADM-15 · sans persistance PostgreSQL durable, les routes Claim répondent 501 (route fermée) : l’écran affiche l’erreur réelle du serveur, jamais un registre vide présenté comme sain.',
  ],
  'ADM-16': [
    'ADM-16 · fiche entière en BACKEND_GAP : POST /admin/contracts/:id/forced-revision et POST /admin/contracts/:id/forced-revision/countersign — absents du produit. Aucune écriture ADMIN sur un contrat n’existe ni n’est simulée : l’ADMIN ne modifie pas un contrat directement (règle du produit : les modifications passent par les flux métier tracés).',
    'ADM-16 · génération de version R2 signée par la plateforme, double contre-signature superviseur, notification aux parties et voie de recours — aucune de ces capacités n’a de route serveur dans le référentiel.',
    'ADM-16 · le contexte affiché (référence, statut, parties) provient uniquement de la page réelle de admin.contracts.list ; aucun formulaire n’est rendu, car aucune commande ne pourrait être exécutée.',
  ],
  'ADM-17': [
    'ADM-17 · fiche : GET /admin/contracts/:id/journal?cursor= — absent : aucun journal d’audit paginé par contrat n’existe. L’historique rendu est le champ réel Contrat.history produit par les services (id, horodatage, événement, description, acteur), lu depuis la page réelle de admin.contracts.list.',
    'ADM-17 · POST /admin/contracts/:id/journal/verify — absent : aucune vérification de chaîne d’empreintes n’est exposée ; le journal affiché n’est pas un event store chaîné et l’écran le dit. Aucun recalcul n’est simulé dans l’interface (règle de la fiche : la vérification est un fait serveur, jamais une déduction d’affichage).',
    'ADM-17 · GET /admin/contracts/:id/journal/export — absent : aucun export JSON signé, aucun manifeste d’empreintes.',
    'ADM-17 · valeurs avant/après (deltas) et horodatages milliseconde : non exposés par le DTO ; seuls les champs réellement produits sont affichés.',
    'ADM-17 · aucun agent ne peut écrire dans l’historique : le produit écrit ces lignes lors des transitions réelles ; cette tranche n’ajoute aucune route d’écriture.',
  ],
  /* ── P4B-2 · paiements, déclarations et rapprochement ── */
  'ADM-18': [
    'ADM-18 · fiche : GET /admin/payments/overview, GET /admin/payments/events et GET /admin/psp/health — absents. Le registre réel admin.payments.list ne fournit ni agrégats financiers, ni flux temporel, ni état opérateur ; aucun montant n’est additionné dans le navigateur.',
    'ADM-18 · le DTO Payment expose les échéances et montants unitaires réellement stockés. Il ne fournit pas de synthèse globale ni de détails d’événements financiers à 24 h.',
    'ADM-18 · la consultation unitaire ADMIN utilise le handler existant GET /api/v1/payments/:paymentId, dont la permission payments:read:any est vérifiée par le handler ; aucune route frontend de détail supplémentaire n’est créée.',
  ],
  'ADM-19': [
    'ADM-19 · GET /admin/reconciliation?period=&operator=, GET /admin/reconciliation/summary et GET /admin/payment-reconciliation/batches — absents. Le produit permet uniquement GET /admin/payment-reconciliation/batches/:batchId si l’identifiant du lot est déjà connu ; aucun registre global ni historique des lots n’est exposé.',
    'ADM-19 · les items du batch exposent les verdicts réels MATCH, MISMATCH, NOT_FOUND, DUPLICATE et REVIEW_REQUIRED, leurs comparaisons, raisons et horodatages. Un MATCH n’est ni une vérification du Paiement ni un état PAID.',
    'ADM-19 · POST /admin/reconciliation/gaps/:id/impute — absent. L’API existante de tentative de correction consigne une proposition append-only non appliquée ; aucune écriture compensatoire ou modification du Paiement n’est produite par l’interface.',
    'ADM-19 · aucun import de relevé propre à un opérateur ni fournisseur réel n’est configuré par cette tranche ; le batch existant n’accepte que des éléments normalisés et reste soumis aux fournisseurs effectivement configurés par le serveur.',
  ],
  'ADM-20': [
    'ADM-20 · GET /admin/payments/anomalies, POST /admin/payments/anomalies/:id/treat et POST /admin/payments/anomalies/:id/false-positive — absents du catalogue et sans handler. Aucun détecteur, seuil, score, file d’anomalies ni faux positif n’est simulé.',
    'ADM-20 · les verdicts MISMATCH, NOT_FOUND, DUPLICATE et REVIEW_REQUIRED ne sont affichés que lorsqu’ils sont réellement lus dans un lot de rapprochement identifié ; ils ne créent pas une file globale d’anomalies.',
  ],
  'ADM-21': [
    'ADM-21 · aucune route ADMIN dédiée aux déclarations externes n’existe. Les déclarations réellement persistées sont incluses dans le DTO Payment de admin.payments.list et de payments.read ; l’écran ne contourne pas les routes réservées à l’Employeur ou au Candidat.',
    'ADM-21 · seuls les états PENDING, VERIFIED et REJECTED de chaque tentative, ainsi que les champs réellement exposés, sont affichés. Aucun délai de 72 h, contestation, antécédent de compte ou dossier de pièces dédié n’est fourni par le DTO.',
    'ADM-21 · les actions ADMIN réelles sont bornées au Paiement courant PENDING_VERIFICATION : approve (payments:approve) ou reject avec motif (payments:reject). Le statut VERIFIED reste distinct de PAID ; la confirmation OTP du Candidat n’est pas accessible à l’ADMIN par cette tranche.',
  ],
  'ADM-22': [
    'ADM-22 · GET /admin/payments/incidents/:id, POST /admin/payments/incidents/:id/resolve et POST /admin/payments/incidents/:id/escalate — absents du catalogue et sans handler. Aucun remboursement, réémission, écriture compensatoire ou incident financier n’est inventé.',
  ],
  /* ── P4C · confirmations de Salaire et preuves de réception ── */
  'ADM-23': [
    'ADM-23 · fiche : GET /admin/salary/confirmations?cursor=, GET /admin/salary/confirmations/stats et POST /admin/salary/confirmations/:id/remind — absentes du catalogue de routes et sans handler : aucune file de confirmations, aucun agrégat serveur et aucune relance ADMIN n’existent.',
    'ADM-23 · l’état de confirmation du Salaire (demandée, confirmée, expirée, contestée) n’est exposé par aucune route ADMIN : les repères « en attente d’OTP », « OTP expirés » et « confirmés par le Candidat » affichent « — », jamais un zéro présenté comme réel.',
    'ADM-23 · la file est composée depuis admin.payments.list (permission serveur payments:read:any) : seuls les Paiements de nature SALARY de la page réellement chargée sont affichés, avec leurs états du cycle servis par le serveur ; aucun montant n’est additionné dans le navigateur.',
    'ADM-23 · la demande de confirmation reste réservée à l’Employeur (payments.salary.confirmation.request) et la confirmation OTP au Candidat (payments.salary.confirmation.confirm) : l’ADMIN consulte les états du cycle, il ne demande ni ne confirme un Salaire à la place d’une partie.',
    'ADM-23 · aucune voie d’envoi (SMS, e-mail ou autre) n’est installée par le produit : cette interface n’annonce aucun envoi, aucune relance et aucun code délivré.',
    'ADM-23 · le journal des envois et des relances horodatées de la fiche — absent : aucun événement de délivrance ni de cadence de relance n’est lisible côté ADMIN.',
    'ADM-23 · sans persistance durable configurée, admin.payments.list répond sa frontière de contrôle (collection vide, persistence not-configured) : cet état réel est affiché tel quel, jamais une file présentée comme saine.',
  ],
  'ADM-24': [
    'ADM-24 · fiche entière en BACKEND_GAP : GET /admin/salary/proofs/:id, POST /admin/salary/proofs/:id/validate et POST /admin/salary/proofs/:id/invalidate {motive} — absentes du catalogue et sans handler : aucun dossier de preuve n’est lisible et aucune décision (validation, invalidation motivée, contre-preuve) n’est possible côté ADMIN.',
    'ADM-24 · l’empreinte de preuve, son horodatage, la voie d’acheminement du code, les tentatives de saisie et les signaux de fraude sont produits côté serveur de confirmation et jamais exposés à l’ADMIN : les repères de la fiche affichent « — ».',
    'ADM-24 · AUCUN secret n’est affiché — ni code, ni empreinte de code, ni graine, ni nonce — et aucun écran ne contourne la confirmation réservée au Candidat.',
    'ADM-24 · la référence affichée vient du chemin ; aucune trace, aucun versement et aucune décision ne sont chargés faute de handler : la fiche ne rend aucun formulaire, aucune commande ne pouvant être exécutée.',
  ],
  /* ── P4D · workflow Claim réellement disponible ── */
  'ADM-26': [
    'ADM-26 · la file appelle admin.claims.list (GET /api/v1/admin/claims, permission incidents:read:any) : la route rend toutes les Claims par curseur, sans filtre serveur ni résumé de file. Les segments, la recherche et les comptes indiquent uniquement la page effectivement chargée.',
    'ADM-26 · filtres queue/type, indicateurs SLA, ancienneté opposable, montants en jeu et verrou de prise en charge — absents du DTO et des handlers ; aucun score, montant, priorité ou verrou n’est calculé dans le navigateur.',
    'ADM-26 · POST /api/v1/admin/claims/:claimId/claim et GET /api/v1/admin/claims/sla — absents. La prise en charge dédiée et les échéances globales restent BACKEND_GAP.',
  ],
  'ADM-27': [
    'ADM-27 · fiche lue exclusivement par admin.claims.read (GET /api/v1/admin/claims/:claimId, permission incidents:read:any) : ClaimView expose les champs Claim et demandes de justificatif réellement renvoyés. Les échanges des parties, une chronologie d’événements, les notes d’agent et une extraction factuelle ne sont pas dans ce DTO.',
    'ADM-27 · les comptes auteur et répondant sont des identifiants réellement présents ; aucun nom de personne, rôle de partie ou contexte complémentaire n’est déduit depuis une route réservée aux participants.',
    'ADM-27 · pour SALARY_NOT_RECEIVED, ClaimView n’expose pas le statut du Paiement ni la confirmation du Salaire par le Candidat. La référence de Paiement seule ne prouve ni déclaration, ni vérification, ni PAID, ni confirmation ; aucun accès OTP n’est ajouté.',
  ],
  'ADM-28': [
    'ADM-28 · les demandes de justificatif lisibles dans ClaimView exposent type, destinataire, statut et horodatages réels ; dueAt n’est affiché que s’il est renvoyé par le serveur. Aucune durée, échéance ou relance n’est inventée.',
    'ADM-28 · l’API Claim conserve une evidenceReference opaque, sans association Claim→Document ni route ADMIN de contenu. Visionneuse, téléchargement, métadonnées de fichier, EXIF, recevabilité et contradictions — absents ; aucune référence brute, clé d’objet ou pièce simulée n’est rendue.',
    'ADM-28 · POST /api/v1/admin/claims/:claimId/evidence-requests (incidents:arbitrate) est disponible uniquement en UNDER_REVIEW ou ADMIN_REVIEW et sans autre demande PENDING ; le serveur configure ou omet dueAt. Les contrôles d’état restent autoritaires côté serveur.',
  ],
  'ADM-29': [
    'ADM-29 · revue/escalade réelle : POST /api/v1/admin/claims/:claimId/review (incidents:arbitrate), idempotent et audité ; décision réelle : POST /api/v1/admin/claims/:claimId/decision, même permission, uniquement depuis ADMIN_REVIEW. Aucune transition locale n’est simulée.',
    'ADM-29 · le DTO de décision n’accepte que decision et resolution. Le backend aboutit à RESOLVED (RESOLVE) ou REJECTED (REJECT), états terminaux existants ; aucun choix de catégorie, effet financier, double validation, appel ou prévisualisation n’est exposé par une route Claim.',
    'ADM-29 · l’interface propose seulement RESOLVE et REJECT. REPLACE existe dans le handler, mais son effet déclenche le workflow Remplacement et reste exclu de cette tranche. Aucune option ou action de remplacement n’est rendue.',
    'ADM-29 · aucune commande ADMIN de clôture vers CLOSED n’est déclarée. CLOSED reste affichable lorsqu’il est renvoyé par le serveur, mais l’interface n’invente pas une fermeture.',
  ],
  'ADM-30': [
    'ADM-30 · la page réutilise admin.claims.list et filtre localement les Claims terminés de la page réelle ; resolvedAt, resolvedBy, resolution et status ne sont affichés que lorsqu’ils sont présents dans ClaimView.',
    'ADM-30 · historique d’événements par Claim, motifs structurés, recours, analyses, comparaison et statistiques — aucune route/DTO consultable ne les fournit. GET /api/v1/admin/audit est une frontière de contrôle non filtrée par Claim ; aucun audit vide ou générique n’est présenté comme historique.',
    'ADM-30 · aucun filtrage serveur par statut ne permet d’affirmer que la page chargée contient l’historique complet ; charger davantage utilise seulement le curseur officiel admin.claims.list.',
  ],
};
