/**
 * RTC —— BACKEND_GAP déclarés, unité par unité.
 *
 * Chaque entrée nomme la fiche de design et la capacité ABSENTE du backend.
 * Elle est affichée telle quelle par l'écran concerné : c'est la seule réponse
 * autorisée à une donnée manquante (« ne pas inventer une valeur »).
 *
 * Aucune de ces lignes ne décrit une API que cette tranche aurait créée : le
 * backend métier n'est pas modifié.
 *
 * Rappel vérifié (inspection de `routeContracts.ts` et de la composition
 * `entry.ts`) : les références de design `/v1/calls/:id/*` ne figurent dans
 * AUCUN contrat serveur (qui n'expose que `/api/v1/…`) ; les huit contrats
 * `calls.*` et `admin.calls.list` sont déclarés SANS handler (501 réel,
 * jamais appelés) ; seules les routes `webrtc.sessions.*` ont des handlers
 * réels, réservés aux parties Employeur / Candidat d'un Contrat actif
 * (403 pour tout autre rôle, dont ADMIN — vérifié par P4G-7).
 */

export const RTC_UNIT_GAPS: Record<string, readonly string[]> = {
  'RTC-01': [
    'RTC-01 · fiche : GET /v1/calls/:id/precheck — absent des contrats serveur (404 : aucun chemin /v1/calls/* déclaré, aucune pré-vérification serveur). Le seul contexte réel affiché est la Session lue par GET /api/v1/webrtc-sessions/:sessionId (statut, Contrat, participants, horodatages).',
    'RTC-01 · fiche : POST /v1/calls/:id/consent {recording} — absent : aucun consentement d’enregistrement n’existe côté serveur (voir RTC-08). L’entrée en Session n’active aucun enregistrement.',
    'RTC-01 · fiche : POST /v1/calls/:id/join — absent ; équivalent réel utilisé : POST /api/v1/webrtc-sessions/:sessionId/join (participant réel, Contrat actif). L’initiateur, déjà entré à la création, reçoit un conflit honnête du serveur, jamais une entrée simulée.',
    'RTC-01 · état réseau (latence estimée, perte, type de relais direct/TURN) et états matériau (caméra, micro, haut-parleur) : aucune mesure serveur ; « — » affiché (indisponible), jamais une jauge animée présentée comme réelle. Aucun flux n’est transmis avant l’entrée en Session.',
    'RTC-01 · présence de l’autre partie et consentement croisé : la Session expose uniquement invitedAt / joinedAt par participant (rôles Employeur / Candidat, jamais de nom ni de photo). Aucun état de consentement n’existe.',
  ],
  'RTC-02': [
    'RTC-02 · fiche : GET /v1/calls/:id/invitation — absent des contrats serveur (404). Le seul contexte réel affiché est la Session lue par GET /api/v1/webrtc-sessions/:sessionId (initiateur, Contrat, statuts d’entrée des deux parties).',
    'RTC-02 · fiche : POST /v1/calls/:id/accept {audioOnly} — absent ; équivalent réel utilisé : POST /api/v1/webrtc-sessions/:sessionId/join. La variante « audio seul » n’a aucun paramètre serveur et reste désactivée.',
    'RTC-02 · fiche : POST /v1/calls/:id/decline {reason?} — absent : aucun refus, aucun motif de refus et aucune sonnerie n’existent côté serveur (POST /api/v1/calls/:callId/reject est déclaré sans handler : 501, jamais appelé). Le refus reste désactivé et n’entraîne aucune pénalité affichée.',
    'RTC-02 · identité de l’appelant (nom, photo, fiabilité), objet résumé, créneau et durée prévue : aucun objet serveur ne les porte ; la Session expose uniquement les rôles Employeur / Candidat et le Contrat. Les repères absents affichent « — ».',
  ],
  'RTC-03': [
    'RTC-03 · fiche : GET /v1/calls/:id/connection-state — absent des contrats serveur (404). Les étapes réelles affichées sont dérivées du seul statut de la Session (CREATED / CONNECTING / ACTIVE…) lu par GET /api/v1/webrtc-sessions/:sessionId, sans compte à rebours factice.',
    'RTC-03 · fiche : POST /v1/calls/:id/downgrade {audioOnly: true} — absent : aucun repli audio serveur. Le repli « audio seul » reste désactivé.',
    'RTC-03 · fiche : POST /v1/calls/:id/cancel — absent : aucune annulation d’établissement. L’annulation reste désactivée ; POST /api/v1/webrtc-sessions/:sessionId/close termine la Session entière et n’est câblé qu’au « Raccrocher » de RTC-04.',
    'RTC-03 · transparence technique (type de connexion tentée, latence mesurée, durée d’établissement) : aucune mesure serveur ; « — » affiché. Les messages de signalisation SDP/ICE existent côté serveur mais sont réservés à l’autre participant pendant la Session et ne sont jamais lus ni affichés ici.',
  ],
  'RTC-04': [
    'RTC-04 · fiche : POST /v1/calls/:id/tracks {audio, video} — absent : aucun contrôle serveur de micro, de caméra ni de partage d’écran. Les contrôles restent désactivés ; aucun flux média n’est rendu ni simulé (surface C-16 non implémentée).',
    'RTC-04 · fiche : POST /v1/calls/:id/notes et POST /v1/calls/:id/share {documentId} — absents : aucune note horodatée ni partage de pièce pendant la Session. Ces actions restent désactivées.',
    'RTC-04 · fiche : POST /v1/calls/:id/hangup — absent ; équivalent réel utilisé : POST /api/v1/webrtc-sessions/:sessionId/close (clé d’idempotence explicite).',
    'RTC-04 · état d’enregistrement et consentements : aucun enregistrement n’existe côté serveur (voir RTC-08) ; l’indicateur affiche « aucun enregistrement », jamais un état actif inventé.',
    'RTC-04 · qualité réseau (barres, reconnexion, compte à rebours) : aucune mesure serveur ; « — » affiché. Le bandeau de Session affiche le seul réel : Contrat, statut, durées et rôles des participants.',
  ],
  'RTC-05': [
    'RTC-05 · fiche : GET /v1/calls/:id/summary — absent des contrats serveur (404). Le seul bilan réel affiché est dérivé de la Session lue par GET /api/v1/webrtc-sessions/:sessionId (statut, participants, création → clôture, durée calculée entre horodatages réels).',
    'RTC-05 · fiche : POST /v1/calls/:id/actions, GET /v1/calls/:id/recording et POST /v1/calls/:id/report — absents : aucune décision, aucune suite, aucun enregistrement et aucun signalement n’existent côté serveur. Toutes ces actions restent désactivées.',
    'RTC-05 · qualité moyenne, enregistrement avec empreinte et durée de conservation : aucune donnée serveur ; « — » affiché, jamais un résumé unilatéral ni un enregistrement présenté comme accessible.',
  ],
  'RTC-06': [
    'RTC-06 · fiche : GET /v1/calls/history?cursor= et GET /v1/calls/:id/summary — absents ; équivalent réel utilisé : GET /api/v1/my/webrtc-sessions (liste paginée curseur du participant, Contrat, statut, horodatages).',
    'RTC-06 · synthèse 30 jours (durée totale, qualité moyenne, enregistrements conservés) et filtres serveur (Contrat, type, période) : aucun agrégat ni filtre serveur ; seules la pagination curseur réelle et la liste des Sessions reçues sont affichées.',
    'RTC-06 · qualité, enregistrement et suites par Session : aucune donnée serveur ; les cartes affichent le seul réel (Contrat, statut, participants, durées), jamais un badge de qualité ou d’enregistrement inventé.',
  ],
  'RTC-07': [
    'RTC-07 · fiche : GET /v1/calls/:id/diagnostics — absent des contrats serveur (404). La seule donnée réelle affichée est l’état de la configuration ICE lu par POST /api/v1/webrtc-sessions/:sessionId/ice-configuration : AVAILABLE / NOT_CONFIGURED / BLOCKED_EXTERNAL_ACCESS et son motif.',
    'RTC-07 · latence, perte de paquets, gigue, bande passante et courbe de qualité : aucune mesure serveur ; « — » affiché, jamais une courbe tracée ni un conseil fondé sur des mesures inventées.',
    'RTC-07 · fiche : POST /v1/calls/:id/quality/profile {preset} et POST /v1/calls/:id/diagnostics/send — absents : aucun changement de profil qualité ni envoi de diagnostic au support. Ces actions restent désactivées.',
    'RTC-07 · aucune adresse de serveur STUN/TURN, aucun identifiant et aucun secret de signalisation n’est affiché (§3.6) : seul l’état de configuration ICE est rendu, jamais le contenu de iceServers.',
  ],
  'RTC-08': [
    'RTC-08 · fiche entière en BACKEND_GAP : GET /v1/calls/:id/consent, POST /v1/calls/:id/consent {recording: true|false} et POST /v1/calls/:id/consent/revoke sont absents des contrats serveur (404) et aucun objet serveur ne porte un consentement d’enregistrement. Le seul contexte réel affiché est la Session lue par GET /api/v1/webrtc-sessions/:sessionId.',
    'RTC-08 · états des deux consentements, enregistrement actif/inactif, durée de conservation et sort du fichier partiel : aucune donnée serveur ; « — » affiché et mention « aucun enregistrement » (le produit ne stocke aucun média : les charges de signalisation sont expurgées à la clôture).',
    'RTC-08 · « J’accepte », « Je refuse » et « Révoquer » restent désactivés : aucun enregistrement ne peut être activé, et le refus n’a aucune conséquence affichée (ni dans la Session, ni dans le dossier, ni dans la réputation).',
  ],
};
