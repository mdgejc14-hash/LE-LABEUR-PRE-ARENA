/**
 * EMP —— BACKEND_GAP déclarés, unité par unité.
 *
 * Chaque entrée nomme la fiche de design et la capacité ABSENTE du backend.
 * Elle est affichée telle quelle par l'écran concerné : c'est la seule réponse
 * autorisée à une donnée manquante (« ne pas inventer une valeur »).
 *
 * Aucune de ces lignes ne décrit une API que cette tranche aurait créée : le
 * backend métier n'est pas modifié.
 */

export const EMPLOYER_UNIT_GAPS: Record<string, readonly string[]> = {
  'EMP-01': [
    'EMP-01 · fiche : GET /v1/client/dashboard et GET /v1/payments/upcoming — absents du produit. Le tableau de bord compose uniquement /my/offers, /my/contracts, /my/payments et /my/claims.',
    'EMP-01 · « état fiscal » du compte employeur : aucun endpoint produit.',
  ],
  'EMP-02': [
    'EMP-02 · fiche : GET /v1/notifications/stream (SSE) — absent ; seules la liste paginée et le marquage lu existent.',
    'EMP-02 · filtres par grand domaine côté serveur — absents ; le filtre par domaine est appliqué localement sur la destination réelle des notifications.',
  ],
  'EMP-03': [
    'EMP-03 · fiche : GET/PATCH /v1/client/profile et GET /v1/client/profile/public-preview — absents. La route users.me.update est déclarée sans handler : modifier l\u2019identité n\u2019est pas câblé.',
    'EMP-03 · statuts de vérification (e-mail, téléphone, structure) et taux de paiement à l\u2019heure : aucun endpoint produit.',
  ],
  'EMP-04': [
    'EMP-04 · fiche : GET/PATCH /v1/client/settings, GET /v1/sessions, POST /v1/account/suspend, DELETE /v1/account — absents du produit.',
    'EMP-04 · rubriques notifications/paiements/juridique/apparence : aucun réglage serveur disponible.',
  ],
  'EMP-05': [
    'EMP-05 · fiche : GET /v1/missions/counters — absent ; les compteurs affichés sont l\u2019agrégation des offres réellement chargées.',
    'EMP-05 · recherche indexée < 120 ms : aucun index de recherche produit.',
  ],
  'EMP-06': [
    'EMP-06 · fiche : POST /v1/missions/draft, PATCH /v1/missions/draft/:id/step1, GET /v1/catalog/categories — absents. POST /offers crée directement une offre ACTIVE : le brouillon d\u2019étape reste en mémoire de session et n\u2019est PAS persisté.',
    'EMP-06 · catégorie normalisée et versionnée : aucun catalogue de catégories produit.',
  ],
  'EMP-07': [
    'EMP-07 · fiche : PATCH /v1/missions/draft/:id/step2, GET /v1/geo/autocomplete, GET /v1/geo/coverage — absents. Le lieu est saisi en texte, tel que le stocke l\u2019offre.',
  ],
  'EMP-08': [
    'EMP-08 · fiche : PATCH /v1/missions/draft/:id/step3, GET /v1/catalog/skills, GET /v1/catalog/evidence-types — absents. Les compétences sont saisies en liste, telles que les stocke l\u2019offre.',
  ],
  'EMP-09': [
    'EMP-09 · fiche : PATCH /v1/missions/draft/:id/step4, POST /v1/pricing/quote, GET /v1/pricing/benchmark — absents.',
    'EMP-09 · comparateur de marché : aucune source de comparaison produit. Seule la rémunération saisie est affichée.',
  ],
  'EMP-10': [
    'EMP-10 · fiche : POST /v1/missions/:id/review-request — absent : la revue humaine est pilotée côté modération, l\u2019employeur ne peut pas la demander depuis cet espace.',
    'EMP-10 · position en file et délai indicatif : aucune donnée de file exposée à l\u2019employeur.',
  ],
  'EMP-11': [
    'EMP-11 · fiche : GET /v1/missions/:id/pricing, POST /v1/missions/:id/pricing/simulate, POST /v1/missions/:id/pricing/validate — absents. Aucun simulateur, aucun validate.',
    'EMP-11 · le modèle financier n\u2019est pas modifié par cette tranche : seules les valeurs réellement stockées (rémunération de l\u2019offre, commission du contrat) sont affichées.',
  ],
  'EMP-12': [
    'EMP-12 · fiche : GET /v1/missions/:id/preview, GET /v1/missions/:id/public-render — absents ; l\u2019aperçu est la relecture des champs réellement saisis.',
    'EMP-12 · publication programmée et heures calmes : aucune planification produit.',
  ],
  'EMP-13': [
    'EMP-13 · fiche : GET /v1/missions/:id/matches?limit=2, POST /v1/missions/:id/share-link — absents ; aucun lien de partage et aucune fenêtre d\u2019annulation de publication.',
    'EMP-13 · « candidatures attendues sous 2 h » : aucune promesse de délai n\u2019est disponible côté produit.',
  ],
  'EMP-14': [
    'EMP-14 · fiche : GET /v1/missions/:id/timeline et GET /v1/missions/:id/report.pdf — absents ; la frise affiche les états réels des contrats et paiements liés.',
  ],
  'EMP-15': [
    'EMP-15 · fiche : PATCH /v1/missions/:id, POST /v1/missions/:id/amendments, GET /v1/missions/:id/diff — absents : seul le changement de statut (pause, reprise, annulation) est câblé. Aucun avenant, aucune version d\u2019offre.',
  ],
  'EMP-16': [
    'EMP-16 · fiche : GET /v1/missions/:id/applications?sort=&segment= — le tri et les segments serveur sont absents ; la file réelle (GET /offers/:offerId/applications) est triée et segmentée localement sur des valeurs réelles.',
    'EMP-16 · « écartées récupérables » : la transition de sortie d\u2019un statut écarté n\u2019existe pas dans le modèle.',
  ],
  'EMP-17': [
    'EMP-17 · fiche : GET /v1/providers/:id/public-profile et GET /v1/providers/:id/match-breakdown — absents. Le dossier candidat affiche les données réellement portées par la candidature.',
    'EMP-17 · questions rattachées à une candidature : POST /v1/applications/:id/questions est absent (aucune messagerie installée).',
  ],
  'EMP-18': [
    'EMP-18 · fiche : GET /v1/missions/:id/matches (liste de compatibilité) — absent ; le classement provient du run de matching réellement persisté.',
    'EMP-18 · relance limitée à 1×/heure : aucune règle de quota produit.',
  ],
  'EMP-19': [
    'EMP-19 · fiche : GET /v1/matching/runs/:runId/explain et GET /v1/matching/rulesets/v7 — absents. L\u2019explication affiche les facteurs réellement enregistrés dans le run (compétences, zone administrative, disponibilité déclarée).',
    'EMP-19 · contestation d\u2019un critère (POST /v1/matching/feedback) : absente.',
  ],
  'EMP-20': [
    'EMP-20 · fiche : POST /v1/missions/:id/applications/search et GET/POST /v1/filters/presets — absents ; les filtres sont appliqués localement sur la file réelle.',
  ],
  'EMP-21': [
    'EMP-21 · fiche : POST /v1/missions/:id/select et GET /v1/missions/:id/engagement-summary — absents.',
    'EMP-21 · l\u2019émission d\u2019une proposition exige une conversation (POST /conversations/:conversationId/proposals) : aucune route de messagerie n\u2019est installée, donc l\u2019identifiant de conversation n\u2019est pas découvrable depuis l\u2019interface. La sélection réelle reste la présélection de candidature (POST /applications/:applicationId/shortlist).',
  ],
  'EMP-22': [
    'EMP-22 · fiche : GET /v1/propositions/:id, GET /v1/propositions/:id/status — absents : aucune vue employeur d\u2019une proposition émise.',
  ],
  'EMP-23': [
    'EMP-23 · fiche : GET /v1/propositions?segment= et POST /v1/propositions/:id/relaunch — absents : le produit n\u2019expose aucune lecture des propositions côté employeur.',
  ],
  'EMP-24': [
    'EMP-24 · fiche : GET /v1/propositions/:id/thread, POST /v1/propositions/:id/messages, POST /v1/propositions/:id/counter, POST /v1/propositions/:id/accept — absents : seule l\u2019expiration (POST /proposals/:proposalId/expire) est installée côté employeur, et aucun endpoint ne permet de découvrir l\u2019identifiant d\u2019une proposition.',
  ],
  'EMP-25': [
    'EMP-25 · fiche : GET /v1/propositions/:id et GET /v1/propositions/:id/status — absents ; aucun état d\u2019attente lisible côté employeur.',
  ],
  'EMP-26': [
    'EMP-26 · fiche : GET /v1/propositions?state=expired — absente ; aucune liste d\u2019expirations employeur.',
  ],
  'EMP-27': [
    'EMP-27 · fiche : GET /v1/propositions?state=accepted et POST /v1/contracts {propositionId} — la création de contrat existe (POST /contracts) mais exige un identifiant de proposition qu\u2019aucune lecture employeur ne fournit.',
  ],
  'EMP-28': [
    'EMP-28 · fiche : POST /v1/propositions/:id/withdraw {reason} et GET /v1/client/reputation/client-stats — absents.',
  ],
  'EMP-29': [
    'EMP-29 · fiche : GET /v1/contracts/:id/versions et GET /v1/contracts/:id/report.pdf — absents ; le folio affiche le contrat réel et son historique persisté.',
  ],
  'EMP-30': [
    'EMP-30 · fiche : GET /v1/contracts/:id/versions/:v/diff, POST /v1/contracts/:id/versions/:v/accept|reject — absents : aucune révision de contrat n\u2019est stockée côté produit.',
  ],
  'EMP-31': [
    'EMP-31 · fiche : GET /v1/contracts/:id/required-consents et signature par OTP/consentement : la route réelle POST /contracts/:contractId/sign ne prend AUCUN corps — l\u2019identité et l\u2019horodatage sont dérivés côté serveur. Aucun pad de signature, aucune empreinte SHA-256 affichée.',
  ],
  'EMP-32': [
    'EMP-32 · fiche : GET /v1/contracts/:id/state et GET /v1/contracts/:id/obligations — absents ; l\u2019échéancier affiché est celui réellement persisté dans le contrat.',
  ],
  'EMP-33': [
    'EMP-33 · fiche : GET /v1/contracts/:id/closure et POST /v1/reviews {contractId} — absents : aucune évaluation de fin de contrat n\u2019est câblée.',
  ],
  'EMP-34': [
    'EMP-34 · fiche : GET /v1/contracts/:id/termination et POST /v1/contracts/:id/termination/oppose — absents ; la rupture réelle (POST /contracts/:contractId/terminate) prend un motif et reste immédiate.',
  ],
  'EMP-35': [
    'EMP-35 · fiche : GET /v1/contracts/:id/succession et GET /v1/contracts/:id/successor — absents ; la filiation affichée vient des références réellement stockées (replacedContractId, replacementId).',
  ],
  'EMP-36': [
    'EMP-36 · fiche : GET /v1/contracts/:id/versions?include=rejected et export — absents ; l\u2019historique réel du contrat est affiché à la place, sans empreinte ni export signé.',
  ],
  'EMP-37': [
    'EMP-37 · fiche : GET /v1/missions/:id/execution et GET /v1/missions/:id/thread — absents ; le suivi affiche l\u2019état réel du contrat et ses échéances persistées.',
  ],
  'EMP-38': [
    'EMP-38 · fiche : POST /v1/evidence/:id/approve|reject, GET /v1/evidence/:id/versions — absents : le produit n\u2019expose aucune validation de preuve côté employeur. Aucun verdict de preuve n\u2019est simulé.',
  ],
  'EMP-39': [
    'EMP-39 · fiche : GET /v1/disputes/templates?category= — absent ; les types de claim réels du modèle sont proposés (SALARY_NOT_RECEIVED, PAYMENT_DISPUTE, CONTRACT_INCIDENT, OTHER_REVIEW_REQUIRED).',
    'EMP-39 · confirmation par saisie et médiation assistée : aucune capacité produit.',
  ],
  'EMP-40': [
    'EMP-40 · fiche : POST /v1/disputes/:id/messages et POST /v1/disputes/:id/resolution/accept — absents : le fil contradictoire n\u2019est pas câblé (aucune messagerie installée).',
    'EMP-40 · délais « 48 h / J+3 / J+5 » de la fiche : non exposés par le produit ; seule l\u2019échéance réellement stockée (dueAt) est affichée.',
  ],
  'EMP-41': [
    'EMP-41 · fiche : GET /v1/payments/schedules?role=client — absent (route schedules.mine.list déclarée sans handler). L\u2019échéancier affiché est celui réellement persisté dans le contrat (paymentSchedule).',
  ],
  'EMP-42': [
    'EMP-42 · fiche : GET /v1/payments/:id/invoice.pdf — absent ; la fiche paiement affiche la vue réelle (statut, échéance, déclarations).',
  ],
  'EMP-43': [
    'EMP-43 · fiche : POST /v1/payments/external-declarations et GET /v1/payments/external-declarations/:id — absents. Les routes réelles de déclaration employeur sont POST /payments/commission-declarations et POST /payments/salary-declarations.',
  ],
  'EMP-44': [
    'EMP-44 · fiche : GET /v1/payments/external-declarations/:id/verification et POST .../relaunch — absents : la vérification est un acte de modération, l\u2019employeur ne voit que le statut réel du paiement.',
  ],
  'EMP-45': [
    'EMP-45 · fiche : GET /v1/payments/export.csv et GET /v1/payments/summary — absents ; l\u2019historique est la liste paginée réelle des paiements.',
  ],
  'EMP-46': [
    'EMP-46 · fiche : GET /v1/payments/:id/receipt.pdf et GET /v1/verify/:token — absents : aucun reçu téléchargeable n\u2019est produit.',
  ],
  'EMP-47': [
    'EMP-47 · fiche : PUT /v1/contracts/:id/payment-plan, POST /v1/contracts/:id/payment-plan/amendment, GET /v1/payment-plans/templates — absents : l\u2019échéancier du contrat n\u2019est pas modifiable depuis cette interface.',
  ],
  'EMP-48': [
    'EMP-48 · fiche : GET /v1/payments/:id/recalculation — absent ; la contestation réelle est un claim de type PAYMENT_DISPUTE (POST /claims).',
  ],
  'EMP-49': [
    'EMP-49 · fiche : GET /v1/disputes/:id/full, GET /v1/disputes/:id/deadlines — absents ; la fiche claim affiche l\u2019enregistrement réel (demandes de pièces, restrictions).',
  ],
  'EMP-50': [
    'EMP-50 · fiche : GET /v1/disputes/:id/evidence, GET .../export.zip — absents : les pièces sont déposées par référence réelle (POST /claims/:claimId/evidence-requests/:requestId/submit).',
  ],
  'EMP-51': [
    'EMP-51 · fiche : GET /v1/disputes/:id/resolutions et accept/refuse — absents : la résolution est décidée côté modération.',
  ],
  'EMP-52': [
    'EMP-52 · fiche : POST /v1/disputes/:id/escalate et GET /v1/disputes/:id/moderation-queue — absents : l\u2019escalade est un acte de modération.',
  ],
  'EMP-53': [
    'EMP-53 · fiche : GET /v1/disputes/:id/instruction et GET /v1/disputes/:id/sla — absents : aucune position de file ni SLA n\u2019est exposé à l\u2019employeur.',
  ],
  'EMP-54': [
    'EMP-54 · fiche : GET /v1/disputes/:id/decision et GET /v1/disputes/:id/decision.pdf — absents ; la décision réelle est portée par le statut et la résolution du claim.',
  ],
  'EMP-55': [
    'EMP-55 · fiche : GET /v1/disputes/:id/closure et GET /v1/disputes/:id/archive.zip — absents : aucune archive de dossier n\u2019est produite.',
  ],
  'EMP-56': [
    'EMP-56 · fiche : POST /v1/missions/:id/replacement et GET /v1/missions/:id/handover — absents : un dossier de remplacement est créé par une décision de modération sur un claim, jamais directement par l\u2019employeur.',
  ],
  'EMP-57': [
    'EMP-57 · fiche : GET /v1/missions/:id/replacement/terms et POST .../acknowledge — absents : aucune condition de reprise n\u2019est opposable dans le produit.',
  ],
  'EMP-58': [
    'EMP-58 · fiche : POST /v1/missions/:id/replacement/matching et GET .../candidates — absents ; la route réelle employeur est POST /replacements/:replacementId/offer (publier une offre de reprise).',
    'EMP-58 · score de reprise : aucun scoring de reprise n\u2019existe dans le moteur de matching.',
  ],
  'EMP-59': [
    'EMP-59 · fiche : POST /v1/contracts/replacement et GET /v1/missions/:id/handover-dossier — absents ; la bascule réelle s\u2019appuie sur la chaîne offre → candidature → proposition → contrat déjà installée.',
  ],
  'EMP-60': [
    'EMP-60 · fiche : GET /v1/contracts/:id/succession-chain — absent ; la chaîne affichée vient des références réellement stockées sur les contrats.',
  ],
};

export function employerUnitGaps(unitId: string): readonly string[] {
  return EMPLOYER_UNIT_GAPS[unitId] ?? [];
}
