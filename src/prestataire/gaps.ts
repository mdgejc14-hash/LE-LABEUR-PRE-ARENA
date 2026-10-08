/**
 * PRE —— BACKEND_GAP déclarés, fiche par fiche.
 *
 * Chaque entrée nomme la fiche de design et la capacité ABSENTE du backend.
 * Elle est affichée telle quelle par l'écran concerné : c'est la seule réponse
 * autorisée à une donnée manquante (« ne pas inventer une valeur »).
 *
 * Aucune de ces lignes ne décrit une API que cette tranche aurait créée : le
 * backend métier n'est pas modifié. Les routes déclarées dans
 * `routeContracts.ts` SANS handler installés (501 NOT_IMPLEMENTED) sont
 * indiquées comme telles : l'écran les appelle réellement et affiche l'état
 * d'erreur réel, en plus de cette déclaration.
 */

export const PRESTATAIRE_UNIT_GAPS: Record<string, readonly string[]> = {
  'PRE-01': [
    'PRE-01 · fiche : GET /v1/provider/dashboard — absent du produit. Le tableau de bord compose uniquement /my/contracts, /my/payments (salaires uniquement), /my/claims et /my/applications.',
    'PRE-01 · fiche : PATCH /v1/provider/availability — absent. Le seul levier réel est le champ `availability` du profil de matching (PATCH /my/matching-profile) ; aucun interrupteur « disponible / occupé / absent » dédié.',
    'PRE-01 · « à recevoir » calculé côté serveur : aucun agrégat produit. L’écran affiche des compteurs et les prochains paiements réels, jamais un total dérivé localement.',
  ],
  'PRE-02': [
    'PRE-02 · fiche : GET /v1/notifications/stream (SSE) — absent ; seules la liste paginée et le marquage lu existent.',
    'PRE-02 · filtres par grand domaine côté serveur — absents ; le filtre par domaine est appliqué localement sur la destination réelle des notifications.',
  ],
  'PRE-03': [
    'PRE-03 · fiche : GET/PATCH /v1/provider/profile et GET /v1/provider/profile/export.pdf — absents. La route users.me.update est déclarée sans handler : modifier l’identité n’est pas câblé.',
    'PRE-03 · score de complétude, fiabilité prouvée, habilitations avec dates d’expiration : aucun endpoint produit. Les seules données réelles sont le profil de matching (compétences, zone, disponibilité) et les documents R2.',
  ],
  'PRE-04': [
    'PRE-04 · fiche : GET/PATCH /v1/provider/settings, POST /v1/provider/pause, GET /v1/provider/export — absents du produit.',
    'PRE-04 · rubriques notifications/paiement/sécurité/confidentialité/accessibilité : aucun réglage serveur disponible. Seule la disponibilité du matching est modifiable (PATCH /my/matching-profile).',
  ],
  'PRE-05': [
    'PRE-05 · fiche : GET /v1/missions/available?segment=&sort=&cursor= — la route réelle de marché est GET /offers (publique) ; les filtres, tris et compteurs déclarés par la fiche sont appliqués localement sur les offres réellement chargées.',
    'PRE-05 · fiche : GET /v1/missions/available/counters — absent ; les compteurs affichés sont l’agrégation des offres réellement chargées.',
  ],
  'PRE-06': [
    'PRE-06 · fiche : POST /v1/missions/available/search et GET /v1/filters/provider-presets — absents ; aucun filtre serveur ni preset enregistré.',
  ],
  'PRE-07': [
    'PRE-07 · fiche : POST /v1/missions/:id/report et POST /v1/missions/:id/save — la route de signalement n’existe pas ; la route de favori (POST /offers/:offerId/favorite) est déclarée dans routeContracts.ts SANS handler installé (501).',
  ],
  'PRE-08': [
    'PRE-08 · fiche : la charge utile {message, evidenceIds, availability} n’est pas celle du produit : POST /offers/:offerId/applications n’accepte que `{ note? }` (type serveur). Les pièces jointes et la disponibilité déclarée à la candidature ne sont pas persistées.',
    'PRE-08 · fiche : GET /v1/applications/draft?missionId= — absent : aucun brouillon de candidature persisté.',
  ],
  'PRE-09': [
    'PRE-09 · fiche : GET /v1/applications/:id — la route applications.read est déclarée dans routeContracts.ts SANS handler installé (501 NOT_IMPLEMENTED) : l’écran de confirmation ne peut relire la candidature créée que depuis la réponse de création.',
    'PRE-09 · fiche : GET /v1/missions/available/similar?to=:mid — absent : aucune offre similaire proposée.',
  ],
  'PRE-10': [
    'PRE-10 · fiche : GET /v1/applications/:id/full — la route applications.read est déclarée SANS handler (501) ; le suivi affiche la candidature lue dans le registre, et l’état d’erreur réel quand la lecture directe est tentée.',
    'PRE-10 · fiche : POST /v1/applications/:id/answers — absent : aucune réponse du candidat dans le produit.',
  ],
  'PRE-11': [
    'PRE-11 · fiche : GET /v1/applications?provider=me&segment= — la route réelle /my/applications est déclarée SANS handler installé (501 NOT_IMPLEMENTED) : le registre des candidatures n’est pas lisible par le candidat à ce stade. L’écran tente la lecture réelle et affiche l’état d’erreur.',
    'PRE-11 · fiche : GET /v1/applications/stats — absent : aucun taux de vue/présélection exposé.',
  ],
  'PRE-12': [
    'PRE-12 · fiche : GET /v1/applications/:id/submission et POST /v1/applications/messages/templates — absents : aucune vue du dépôt ni bibliothèque de messages.',
  ],
  'PRE-13': [
    'PRE-13 · fiche : GET /v1/applications/:id/questions, POST /v1/applications/:id/answers, POST /v1/questions/:id/report — absents : aucune messagerie encadrée n’est installée (les routes /conversations sont déclarées sans handler, 501).',
  ],
  'PRE-14': [
    'PRE-14 · fiche : le motif de retrait n’est pas persisté : POST /applications/:applicationId/withdraw ne prend AUCUN corps.',
    'PRE-14 · fiche : GET /v1/applications/:id/withdraw-policy — absent : la conséquence affichée est la règle produit documentée (aucune pénalité avant sélection), sans promesse de réputation côté serveur.',
  ],
  'PRE-15': [
    'PRE-15 · fiche : GET /v1/applications/archive et GET /v1/applications/export.csv — absents : aucune archive ni export de candidatures. Le registre réel étant indisponible (501), l’archive l’est aussi.',
  ],
  'PRE-16': [
    'PRE-16 · fiche : GET /v1/propositions?provider=me&segment= — le produit n’expose AUCUNE lecture candidat des propositions reçues (aucune route déclarée). Aucune liste n’est reconstituée.',
    'PRE-16 · fiche : GET /v1/propositions/counters — absent.',
  ],
  'PRE-17': [
    'PRE-17 · fiche : GET /v1/propositions/:id/provider-view — absent : aucune lecture candidat d’une proposition. L’écran ne peut pas afficher une proposition sans cette route.',
    'PRE-17 · fiche : POST /v1/propositions/:id/counter — la route réelle POST /proposals/:proposalId/respond n’ouvre que ACCEPT et DECLINE ; l’action REVISE renvoie 501 « demande de révision non ouverte ».',
  ],
  'PRE-18': [
    'PRE-18 · fiche : la case de lecture et le consentement ne sont pas persistés : POST /proposals/:proposalId/respond accepte {action, notes?} uniquement.',
    'PRE-18 · fiche : GET /v1/provider/calendar/conflicts — absent : aucun contrôle de conflit de dates.',
  ],
  'PRE-19': [
    'PRE-19 · fiche : POST /v1/propositions/:id/counter {type, amount?, durationDays?, motive, message} et GET /v1/propositions/:id/provider-preview — absents : la négociation (contre-proposition) n’est pas ouverte dans le modèle réel (REVISE → 501).',
  ],
  'PRE-20': [
    'PRE-20 · fiche : GET /v1/propositions/history?provider=me et GET /v1/propositions/stats — absents : aucune lecture candidat des propositions, y compris historisées.',
  ],
  'PRE-21': [
    'PRE-21 · fiche : POST /v1/contracts/:id/clarification — absent : aucune demande de clarification contractuelle.',
    'PRE-21 · fiche : GET /v1/contracts/:id/versions/:v/provider-view et POST .../versions/:v/accept|reject — absents : aucune révision de contrat n’est stockée côté produit.',
  ],
  'PRE-22': [
    'PRE-22 · fiche : GET /v1/contracts/:id/guided-reading?lang=fr — absent : aucune lecture guidée du contrat.',
  ],
  'PRE-23': [
    'PRE-23 · fiche : GET /v1/contracts/:id/versions/:v/provider-view, POST .../accept, POST .../reject — absents : le produit ne versionne pas les contrats (aucun avenant persisté).',
  ],
  'PRE-24': [
    'PRE-24 · fiche : la signature réelle POST /contracts/:contractId/sign ne prend AUCUN corps — aucun consentement structuré, aucun artefact, aucune empreinte SHA-256 affichée.',
    'PRE-24 · fiche : POST /v1/contracts/:id/refuse — absent : le candidat ne peut pas refuser un contrat depuis l’API (seule la proposition peut être déclinée, en amont).',
  ],
  'PRE-25': [
    'PRE-25 · fiche : POST /v1/contracts/:id/impediment — absent : aucun signalement d’empêchement en cours de contrat.',
  ],
  'PRE-26': [
    'PRE-26 · fiche : GET /v1/contracts/:id/amendments/:aid/provider-view, POST .../accept, POST .../refuse — absents : aucun avenant de contrat n’existe dans le produit.',
  ],
  'PRE-27': [
    'PRE-27 · fiche : GET /v1/contracts/:id/termination/provider-view et POST /v1/contracts/:id/termination/contest — absents.',
    'PRE-27 · la résiliation POST /contracts/:contractId/terminate est réservée au rôle EMPLOYER : le candidat ne peut pas résilier un contrat depuis l’API.',
  ],
  'PRE-28': [
    'PRE-28 · fiche : GET /v1/missions/:id/provider-execution, POST /v1/missions/:id/obstacles, GET /v1/missions/:id/earned — absents : aucun suivi d’exécution, signalement d’obstacle ni montant acquis côté produit. Seuls l’état réel du contrat et son échéancier persisté sont affichés.',
  ],
  'PRE-29': [
    'PRE-29 · fiche : GET /v1/missions/:id/evidence-requirements et POST /v1/evidence {requirementId, files} — absents : aucune exigence de preuve ni dépôt de preuve d’exécution. Le système de documents R2 couvre les pièces professionnelles, pas les preuves de terrain.',
  ],
  'PRE-30': [
    'PRE-30 · fiche : POST /v1/evidence, POST /v1/uploads/r2/presign, GET /v1/evidence/:id/validation-preview — absents : aucun dépôt de preuve d’exécution (caméra intégrée, conformité, file locale).',
  ],
  'PRE-31': [
    'PRE-31 · fiche : GET /v1/missions/:id/validations et POST /v1/evidence/:id/reupload — absents : aucune validation de preuve reçue ni re-dépôt.',
  ],
  'PRE-32': [
    'PRE-32 · fiche : GET /v1/payments/expected — absent. Les échéances affichées sont l’échéancier RÉEL persisté dans le contrat (paymentSchedule, statut de salaire par mois).',
    'PRE-32 · fiche : POST /v1/payments/:id/dispute-not-received — la route dédiée est absente ; le canal réel est un claim de type SALARY_NOT_RECEIVED (POST /claims).',
  ],
  'PRE-33': [
    'PRE-33 · fiche : GET /v1/payments/schedules?role=provider — la route /my/schedules est déclarée SANS handler installé (501 NOT_IMPLEMENTED).',
    'PRE-33 · fiche : GET /v1/payments/projection?days=30 — absent : aucune projection calculée serveur.',
  ],
  'PRE-34': [
    'PRE-34 · fiche : GET /v1/payments/:id/external-claim, POST .../external-claim/confirm, POST .../external-claim/contest — absents : le candidat ne confirme ni ne conteste une déclaration employeur depuis l’API.',
    'PRE-34 · la confirmation de salaire réelle (P0-SALARY) est une confirmation OTP du candidat sur un paiement PAYÉ, demandée par l’employeur ; elle ne couvre pas la bascule « déclaré → confirmé » de la fiche.',
  ],
  'PRE-35': [
    'PRE-35 · fiche : GET /v1/reconciliations/:id/provider-view et POST /v1/reconciliations/:id/evidence — absents : aucune réconciliation exposée au candidat (les rapprochements sont un acte ADMIN).',
  ],
  'PRE-36': [
    'PRE-36 · fiche : GET /v1/payments/overdue?provider=me — absent : les retards affichés sont dérivés de l’échéance réelle (dueAt) et du statut réel du paiement.',
    'PRE-36 · fiche : POST /v1/disputes {type: non-payment} — absent ; le canal réel est un claim SALARY_NOT_RECEIVED (POST /claims). POST /contracts/:id/suspend est réservé au rôle EMPLOYER.',
  ],
  'PRE-37': [
    'PRE-37 · fiche : POST /v1/payments/:id/contests et GET /v1/payments/:id/contests — absents : aucune relance tracée côté produit (les rappels sont un mécanisme interne du cycle de paiement).',
  ],
  'PRE-38': [
    'PRE-38 · la route de confirmation existe (POST /payments/:paymentId/salary-confirmation {otp, nonce}, rôle CANDIDATE) mais AUCUNE route ne remet le `nonce` au candidat : la réponse de la demande (employeur) n’est pas une lecture candidat.',
    'PRE-38 · le canal de livraison de l’OTP (SMS/WhatsApp) n’est pas installé : « Delivery only after commit is the caller’s responsibility; no external channel is installed » (salaryConfirmation.ts).',
    'PRE-38 · fiche : GET /v1/payments/:id/proof — absent : aucune preuve de confirmation lisible.',
  ],
  'PRE-39': [
    'PRE-39 · fiche : GET /v1/payments/:id/receipt.pdf et GET /v1/provider/income-statement.pdf — absents : aucun reçu ni relevé téléchargeable n’est produit.',
  ],
  'PRE-40': [
    'PRE-40 · fiche : POST /v1/replacements/:id/contest et POST /v1/replacements/:id/accept — absents : le candidat ne conteste ni n’accepte un remplacement depuis l’API.',
    'PRE-40 · fiche : GET /v1/replacements/:id/provider-view — la route réelle /replacements/:replacementId existe (owner) ; la vue affichée est le dossier réel.',
  ],
  'PRE-41': [
    'PRE-41 · fiche : GET /v1/replacements/:id/handover/provider, POST .../handover/ack, GET /v1/replacements/:id/exit/provider, POST .../exit/ack, POST .../asset-report — absents : aucune passation ni sortie de remplacement côté candidat.',
  ],
  'PRE-42': [
    'PRE-42 · fiche : POST /v1/replacements/:id/decision {choice, evidenceIds, statement} et GET /v1/replacements/:id/deadline — absents : aucune décision candidat sur un remplacement.',
  ],
  'PRE-43': [
    'PRE-43 · fiche : GET /v1/replacements/:id/exit/provider, POST .../exit/ack, POST .../asset-report — absents : aucune checklist de sortie.',
  ],
  'PRE-44': [
    'PRE-44 · fiche : GET /v1/replacements/:id/reprise/provider-view, POST .../reprise/accept, POST .../reprise/negotiate — absents.',
    'PRE-44 · le chemin RÉEL pour un candidat entrant est la chaîne normale : l’offre de reprise publiée par l’employeur (POST /replacements/:id/offer, rôle EMPLOYER) est une offre publique, lisible (GET /offers/:id) et candidatable (POST /offers/:id/applications). Aucune acceptation directe de dossier n’existe.',
  ],
  'PRE-45': [
    'PRE-45 · fiche : GET /v1/reputation/methodology (public) — absent : aucune route de méthodologie publique.',
    'PRE-45 · anneau 0-100 avec décomposition (fiabilité 35 %, preuves 20 %, satisfaction 25 %, claims 20 %) : le produit expose une vue DÉRIVÉE du ledger (impact net, répartition par catégorie, compteurs), pas un score 0-100 pondéré. Aucun score n’est recalculé localement.',
  ],
  'PRE-46': [
    'PRE-46 · fiche : POST /v1/reputation/entries/:id/contest — absent : aucune contestation d’écriture côté candidat (la correction est un acte ADMIN : admin.reputation.entries.correct).',
    'PRE-46 · fiche : GET /v1/reputation/me/ledger/export — absent : aucun export CSV/JSON signé du ledger.',
  ],
  'PRE-47': [
    'PRE-47 · fiche : POST /v1/reputation/entries/:id/contest {grounds, facts, evidenceIds} et GET /v1/reputation/contests/me — absents : aucun dossier de contestation de réputation côté candidat.',
    'PRE-47 · mécanisme existant proposé à la place : un claim de type OTHER_REVIEW_REQUIRED (POST /claims), examiné par la modération — aucune écriture de ledger n’est modifiée par cette tranche.',
  ],
  'PRE-48': [
    'PRE-48 · fiche : POST /v1/documents et DELETE /v1/documents/:id — la création réelle passe par POST /documents/upload-grants (métadonnées + grant R2) ; la suppression n’existe pas (révocation réservée à l’ADMIN).',
    'PRE-48 · statuts « vérifié / rejeté / en vérification » avec délais : le modèle documentaire réel a PENDING_UPLOAD / ACTIVE / REVOKED ; aucune vérification humaine ni rejet de pièce n’est exposé.',
  ],
  'PRE-49': [
    'PRE-49 · fiche : GET /v1/documents/:id/versions/compare — absent : aucune comparaison de versions.',
    'PRE-49 · activation « après vérification » : la version créée est enregistrée via le flux réel (grant + upload + enregistrement) ; aucun contrôle humain intermédiaire n’est exposé.',
  ],
  'PRE-50': [
    'PRE-50 · fiche : GET /v1/documents/:id/verification et GET /v1/documents/verification-policy (public) — absents : aucun pipeline de vérification (OCR/humain) ni politique publique exposé.',
  ],
  'PRE-51': [
    'PRE-51 · fiche : GET /v1/documents/:id/rejection, POST .../rejection/correct, POST .../rejection/contest — absents : le modèle documentaire n’a pas d’état « rejeté » (ACTIVE / REVOKED uniquement).',
  ],
  'PRE-52': [
    'PRE-52 · fiche : GET /v1/documents/:id/usages et GET /v1/documents/:id/history.pdf — absents : aucun log d’usage (quelle version vue par quel employeur) ni export PDF. Les liens version↔entité existent (documents.links.*) mais ne sont pas un log d’exposition.',
  ],
};

export function prestataireUnitGaps(unitId: string): readonly string[] {
  return PRESTATAIRE_UNIT_GAPS[unitId] ?? [];
}
