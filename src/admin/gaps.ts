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
};
