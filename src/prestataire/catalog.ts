// GÉNÉRÉ PAR scripts/design/generate-prestataire-catalog.py — NE PAS ÉDITER À LA MAIN.
// Source : design/llab/content/pre_*.py, design/llab/units.py.
// Régénérer : npm run design:prestataire
//
// Référence de design UNIQUEMENT : aucun libellé de ce fichier n'est affiché par
// l'interface. Les textes visibles viennent de src/prestataire/vocabulary.ts (vocabulaire
// LE LABEUR : EMPLOYER, OFFRE, CANDIDAT, CANDIDATURE, PROPOSITION, CONTRAT, CLAIM,
// PAIEMENT, SALAIRE, REMPLACEMENT, MATCHING, DOCUMENT, RÉPUTATION).
// Les routes sont celles du routeur P0 : elles ne sont ni renommées ni réécrites.

export interface PrestataireDesignScreen {
  readonly code: string;
  readonly unitId: string;
  readonly route: string;
  readonly canonicalRoute: string;
  readonly role: string;
  readonly criticality: string;
  readonly zoneKinds: readonly string[];
  readonly variantOf: string | null;
  readonly designApi: readonly string[];
  readonly tokens: readonly string[];
}

export interface PrestataireDesignUnit {
  readonly id: string;
  readonly canon: string;
  readonly criticality: string;
  readonly archetype: string;
  readonly screenCodes: readonly string[];
  readonly routes: readonly string[];
  readonly zoneKinds: readonly string[];
  readonly componentRefs: readonly string[];
  readonly stateNames: readonly string[];
  readonly tokens: readonly string[];
  readonly designApi: readonly string[];
}

export const PRESTATAIRE_DESIGN_UNITS = [
  {
    "id": "PRE-01",
    "canon": "Dashboard prestataire",
    "criticality": "P0",
    "archetype": "Tableau de bord du travailleur",
    "screenCodes": [
      "PRE-01"
    ],
    "routes": [
      "/prestataire"
    ],
    "zoneKinds": [
      "cta",
      "hero",
      "kpi",
      "list",
      "timeline"
    ],
    "componentRefs": [
      "C-04",
      "C-06",
      "Carte",
      "Interrupteur"
    ],
    "stateNames": [
      "Nouveau prestataire",
      "Disponible",
      "Indisponible",
      "Retard de salaire"
    ],
    "tokens": [
      "--amber-500",
      "--display-1",
      "--emerald-500",
      "--gold-500",
      "--surface-0"
    ],
    "designApi": [
      "GET /v1/provider/dashboard",
      "PATCH /v1/provider/availability",
      "GET /v1/payments?role=provider&state=pending"
    ]
  },
  {
    "id": "PRE-02",
    "canon": "Notifications — flux prestataire",
    "criticality": "P1",
    "archetype": "Flux du travailleur",
    "screenCodes": [
      "PRE-02"
    ],
    "routes": [
      "/prestataire/notifications"
    ],
    "zoneKinds": [
      "chips",
      "cta",
      "list"
    ],
    "componentRefs": [
      "Badge",
      "Ligne",
      "Swipe"
    ],
    "stateNames": [
      "Non lues",
      "Vides",
      "Alerte salaire",
      "Rappel de preuve"
    ],
    "tokens": [
      "--clay-500",
      "--emerald-500",
      "--gold-500",
      "--surface-1"
    ],
    "designApi": [
      "GET /v1/notifications?role=provider",
      "GET /v1/notifications/stream (SSE)"
    ]
  },
  {
    "id": "PRE-03",
    "canon": "Profil prestataire",
    "criticality": "P0",
    "archetype": "Vitrine de compétence",
    "screenCodes": [
      "PRE-03"
    ],
    "routes": [
      "/prestataire/profil"
    ],
    "zoneKinds": [
      "cta",
      "hero",
      "kpi",
      "list"
    ],
    "componentRefs": [
      "Barre",
      "C-11",
      "Carte",
      "Export"
    ],
    "stateNames": [
      "Incomplet",
      "Pièce expirée",
      "Vérification en cours",
      "Profil fort"
    ],
    "tokens": [
      "--amber-500",
      "--emerald-500",
      "--gold-500",
      "--mono",
      "--surface-2"
    ],
    "designApi": [
      "GET /v1/provider/profile",
      "PATCH /v1/provider/profile",
      "GET /v1/provider/profile/export.pdf"
    ]
  },
  {
    "id": "PRE-04",
    "canon": "Paramètres (prestataire)",
    "criticality": "P1",
    "archetype": "Réglages du travailleur",
    "screenCodes": [
      "PRE-04"
    ],
    "routes": [
      "/prestataire/parametres"
    ],
    "zoneKinds": [
      "cta",
      "form",
      "list"
    ],
    "componentRefs": [
      "Heures",
      "Ligne",
      "Pause"
    ],
    "stateNames": [
      "Par défaut",
      "Pause active",
      "Support mobile money",
      "Suppression"
    ],
    "tokens": [
      "--emerald-500",
      "--mono",
      "--slate-500",
      "--surface-2"
    ],
    "designApi": [
      "GET/PATCH /v1/provider/settings",
      "POST /v1/provider/pause",
      "GET /v1/provider/export"
    ]
  },
  {
    "id": "PRE-05",
    "canon": "Missions disponibles — marché",
    "criticality": "P0",
    "archetype": "Marché du travail",
    "screenCodes": [
      "PRE-05"
    ],
    "routes": [
      "/prestataire/missions"
    ],
    "zoneKinds": [
      "chips",
      "cta",
      "kpi",
      "list"
    ],
    "componentRefs": [
      "Badge",
      "Carte",
      "Chips",
      "Compteur"
    ],
    "stateNames": [
      "Recommandées",
      "Vide",
      "Mission urgente",
      "Mission pourvue"
    ],
    "tokens": [
      "--display-1",
      "--emerald-500",
      "--gold-500",
      "--squircle-22",
      "--surface-1"
    ],
    "designApi": [
      "GET /v1/missions/available?segment=&sort=&cursor=",
      "GET /v1/missions/available/counters"
    ]
  },
  {
    "id": "PRE-06",
    "canon": "Missions disponibles — filtres",
    "criticality": "P1",
    "archetype": "Chasse au travail utile",
    "screenCodes": [
      "PRE-06"
    ],
    "routes": [
      "/prestataire/missions/filtres"
    ],
    "zoneKinds": [
      "cta",
      "form",
      "kpi",
      "list"
    ],
    "componentRefs": [
      "Cercle",
      "Chips",
      "Curseur",
      "Filtre"
    ],
    "stateNames": [
      "Vide",
      "Filtres conflit",
      "Modèle chargé",
      "Prix minimum élevé"
    ],
    "tokens": [
      "--emerald-500",
      "--gold-500",
      "--mono",
      "--surface-3"
    ],
    "designApi": [
      "POST /v1/missions/available/search",
      "GET /v1/filters/provider-presets"
    ]
  },
  {
    "id": "PRE-07",
    "canon": "Mission — fiche prestataire",
    "criticality": "P0",
    "archetype": "La promesse en clair",
    "screenCodes": [
      "PRE-07"
    ],
    "routes": [
      "/prestataire/missions/:id"
    ],
    "zoneKinds": [
      "cta",
      "hero",
      "list",
      "price",
      "timeline"
    ],
    "componentRefs": [
      "C-05",
      "Carte",
      "Comparateur",
      "Signalement"
    ],
    "stateNames": [
      "Éligible",
      "Exigence manquante",
      "Mission pourvue",
      "Mission signalée",
      "Client à risque"
    ],
    "tokens": [
      "--display-1",
      "--emerald-500",
      "--glass-2",
      "--gold-500",
      "--surface-2"
    ],
    "designApi": [
      "GET /v1/missions/:id/provider-view",
      "POST /v1/missions/:id/report",
      "POST /v1/missions/:id/save"
    ]
  },
  {
    "id": "PRE-08",
    "canon": "Candidature — dépôt",
    "criticality": "P0",
    "archetype": "Acte de candidature",
    "screenCodes": [
      "PRE-08",
      "PRE-09"
    ],
    "routes": [
      "/prestataire/missions/:id/postuler",
      "/prestataire/candidatures/envoyee"
    ],
    "zoneKinds": [
      "cta",
      "form",
      "hero",
      "kpi",
      "timeline",
      "verdict"
    ],
    "componentRefs": [
      "Bandeau",
      "C-04",
      "C-06",
      "Confirmation",
      "Encart",
      "Sélecteur",
      "Éditeur"
    ],
    "stateNames": [
      "Vide",
      "Message contenant des coordonnées",
      "Déjà postulé",
      "Mission pourvue entre-temps",
      "Envoyée",
      "Vue par le client",
      "Présélectionné",
      "Refusée"
    ],
    "tokens": [
      "--emerald-500",
      "--glass-1",
      "--glass-2",
      "--gold-500",
      "--mono",
      "--surface-2"
    ],
    "designApi": [
      "POST /v1/missions/:id/applications {message, evidenceIds, availability}",
      "GET /v1/applications/draft?missionId=",
      "GET /v1/applications/:id",
      "GET /v1/missions/available/similar?to=:mid"
    ]
  },
  {
    "id": "PRE-10",
    "canon": "Candidature — suivi & questions",
    "criticality": "P1",
    "archetype": "Fil de sa candidature",
    "screenCodes": [
      "PRE-10",
      "PRE-12",
      "PRE-13"
    ],
    "routes": [
      "/prestataire/candidatures/:id",
      "/prestataire/candidatures/:id/depot",
      "/prestataire/candidatures/:id/questions"
    ],
    "zoneKinds": [
      "chat",
      "cta",
      "doc",
      "hero",
      "kpi",
      "timeline"
    ],
    "componentRefs": [
      "Badge",
      "Bibliothèque",
      "C-06",
      "Fil",
      "Garde-fou",
      "Signalement",
      "Vue"
    ],
    "stateNames": [
      "En attente",
      "Question reçue",
      "Retenue",
      "Refusée",
      "Candidature retirée",
      "Visible avant lecture",
      "Lue par le client",
      "Retirée",
      "Question ouverte",
      "Répondu",
      "Question signalée",
      "Non répondu (expiré)"
    ],
    "tokens": [
      "--clay-500",
      "--emerald-500",
      "--glass-2",
      "--gold-500",
      "--mono",
      "--slate-500",
      "--surface-2"
    ],
    "designApi": [
      "GET /v1/applications/:id/full",
      "POST /v1/applications/:id/withdraw",
      "POST /v1/applications/:id/answers",
      "GET /v1/applications/:id/submission",
      "POST /v1/applications/messages/templates",
      "GET /v1/applications/:id/questions",
      "POST /v1/applications/:id/answers",
      "POST /v1/questions/:id/report"
    ]
  },
  {
    "id": "PRE-11",
    "canon": "Candidatures — registre & archive",
    "criticality": "P0",
    "archetype": "Registre des candidatures",
    "screenCodes": [
      "PRE-11",
      "PRE-15"
    ],
    "routes": [
      "/prestataire/candidatures",
      "/prestataire/candidatures/archive"
    ],
    "zoneKinds": [
      "chips",
      "cta",
      "kpi",
      "list"
    ],
    "componentRefs": [
      "Carte",
      "Export",
      "Insights",
      "Retrait",
      "Statistiques"
    ],
    "stateNames": [
      "Vide",
      "Présélection",
      "Refusées",
      "Taux faible",
      "Vide",
      "Long",
      "Export"
    ],
    "tokens": [
      "--emerald-500",
      "--gold-500",
      "--mono",
      "--slate-500",
      "--surface-1"
    ],
    "designApi": [
      "GET /v1/applications?provider=me&segment=",
      "GET /v1/applications/stats",
      "GET /v1/applications/archive",
      "GET /v1/applications/export.csv"
    ]
  },
  {
    "id": "PRE-14",
    "canon": "Candidature — retrait",
    "criticality": "P2",
    "archetype": "Désengagement propre",
    "screenCodes": [
      "PRE-14"
    ],
    "routes": [
      "/prestataire/candidatures/:id/retrait"
    ],
    "zoneKinds": [
      "cta",
      "form",
      "kpi"
    ],
    "componentRefs": [
      "Radios",
      "Règle"
    ],
    "stateNames": [
      "Avant sélection",
      "Après sélection",
      "Retirée"
    ],
    "tokens": [
      "--clay-500",
      "--slate-500",
      "--surface-3"
    ],
    "designApi": [
      "POST /v1/applications/:id/withdraw {reason?}",
      "GET /v1/applications/:id/withdraw-policy"
    ]
  },
  {
    "id": "PRE-16",
    "canon": "Propositions reçues — registre & historique",
    "criticality": "P0",
    "archetype": "Offres reçues",
    "screenCodes": [
      "PRE-16",
      "PRE-20"
    ],
    "routes": [
      "/prestataire/propositions",
      "/prestataire/propositions/historique"
    ],
    "zoneKinds": [
      "chips",
      "cta",
      "kpi",
      "list"
    ],
    "componentRefs": [
      "Badge",
      "Carte",
      "Compte",
      "Ligne",
      "Statistiques"
    ],
    "stateNames": [
      "Vide",
      "Urgent",
      "Expirée",
      "Acceptée",
      "Vide",
      "Riche",
      "Export"
    ],
    "tokens": [
      "--display-2",
      "--emerald-500",
      "--gold-500",
      "--mono",
      "--slate-500"
    ],
    "designApi": [
      "GET /v1/propositions?provider=me&segment=",
      "GET /v1/propositions/counters",
      "GET /v1/propositions/history?provider=me",
      "GET /v1/propositions/stats"
    ]
  },
  {
    "id": "PRE-17",
    "canon": "Proposition reçue — détail & réponse",
    "criticality": "P0",
    "archetype": "Offre sous la loupe",
    "screenCodes": [
      "PRE-17",
      "PRE-18",
      "PRE-19"
    ],
    "routes": [
      "/prestataire/propositions/:id",
      "/prestataire/propositions/:id/acceptation",
      "/prestataire/propositions/:id/contre"
    ],
    "zoneKinds": [
      "chat",
      "cta",
      "form",
      "hero",
      "kpi",
      "list",
      "price"
    ],
    "componentRefs": [
      "Aperçu",
      "C-05",
      "Carte",
      "Case",
      "Checklist",
      "Explication",
      "Formulaire",
      "Limiteur",
      "Récapitulatif"
    ],
    "stateNames": [
      "À examiner",
      "Client à risque",
      "Contre-proposition en cours",
      "Expirée",
      "Prêt",
      "Conflit de dates",
      "Capacité dépassée",
      "Accepté",
      "Première contre-proposition",
      "Tours avancés",
      "Refusée",
      "Acceptée"
    ],
    "tokens": [
      "--clay-500",
      "--display-1",
      "--emerald-500",
      "--glass-2",
      "--gold-500",
      "--grad-gold",
      "--mono",
      "--surface-2"
    ],
    "designApi": [
      "GET /v1/propositions/:id/provider-view",
      "POST /v1/propositions/:id/accept",
      "POST /v1/propositions/:id/counter",
      "POST /v1/propositions/:id/accept {consent, availabilityConfirmed}",
      "GET /v1/provider/calendar/conflicts?mission=:mid",
      "POST /v1/propositions/:id/counter {type, amount?, durationDays?, motive, message}",
      "GET /v1/propositions/:id/provider-preview"
    ]
  },
  {
    "id": "PRE-21",
    "canon": "Contrat prestataire — folio, états & révision",
    "criticality": "P0",
    "archetype": "Folio du travailleur",
    "screenCodes": [
      "PRE-21",
      "PRE-22",
      "PRE-23",
      "PRE-25",
      "PRE-26",
      "PRE-27"
    ],
    "routes": [
      "/prestataire/contrats/:id",
      "/prestataire/contrats/:id/lecture",
      "/prestataire/contrats/:id/versions/:v",
      "/prestataire/contrats/:id/actif",
      "/prestataire/contrats/:id/avenants/:aid",
      "/prestataire/contrats/:id/resiliation"
    ],
    "zoneKinds": [
      "cta",
      "doc",
      "hero",
      "kpi",
      "list",
      "price",
      "sign",
      "timeline"
    ],
    "componentRefs": [
      "Alternative",
      "Avertissement",
      "Bandeau",
      "Bouton",
      "C-06",
      "C-08",
      "C-11",
      "Carte",
      "Cartes",
      "Colonnes",
      "Compteur",
      "Delta",
      "Diff",
      "Explication",
      "Lien",
      "Sceau",
      "Surlignage",
      "Table",
      "Vue"
    ],
    "stateNames": [
      "En signature",
      "Actif",
      "Terminé",
      "Résilié",
      "Remplacé",
      "Lecture",
      "Clause manquante",
      "Terminé",
      "Lecture",
      "Acceptée",
      "Refusée",
      "Expirée",
      "À jour",
      "Jalon proche",
      "Empêchement signalé",
      "Salaire en retard",
      "À examiner",
      "Accepté",
      "Refusé",
      "Expiré",
      "Amiable",
      "Pour motif",
      "Contestée",
      "Clôturée"
    ],
    "tokens": [
      "--clay-500",
      "--emerald-500",
      "--glass-1",
      "--gold-500",
      "--mono",
      "--text-mid"
    ],
    "designApi": [
      "GET /v1/contracts/:id/provider-view",
      "POST /v1/contracts/:id/sign",
      "POST /v1/contracts/:id/clarification",
      "GET /v1/contracts/:id/guided-reading?lang=fr",
      "GET /v1/contracts/:id/versions/:v/provider-view",
      "POST /v1/contracts/:id/versions/:v/accept",
      "POST /v1/contracts/:id/versions/:v/reject",
      "GET /v1/contracts/:id/provider-state",
      "POST /v1/contracts/:id/impediment",
      "GET /v1/contracts/:id/amendments/:aid/provider-view",
      "POST /v1/contracts/:id/amendments/:aid/accept",
      "POST /v1/contracts/:id/amendments/:aid/refuse",
      "GET /v1/contracts/:id/termination/provider-view",
      "POST /v1/contracts/:id/termination/contest"
    ]
  },
  {
    "id": "PRE-24",
    "canon": "Contrat — signature prestataire",
    "criticality": "P0",
    "archetype": "Le geste qui engage",
    "screenCodes": [
      "PRE-24"
    ],
    "routes": [
      "/prestataire/contrats/:id/signer"
    ],
    "zoneKinds": [
      "cta",
      "list",
      "price",
      "sign"
    ],
    "componentRefs": [
      "Bandeau",
      "Pad",
      "Phrase",
      "Sceau"
    ],
    "stateNames": [
      "Prêt",
      "Signé par vous",
      "Double signature",
      "Refus avant signature"
    ],
    "tokens": [
      "--emerald-500",
      "--glass-4",
      "--gold-500",
      "--grad-gold",
      "--mono"
    ],
    "designApi": [
      "POST /v1/contracts/:id/sign {method, consent, artifact}",
      "POST /v1/contracts/:id/refuse"
    ]
  },
  {
    "id": "PRE-28",
    "canon": "Exécution — suivi & validation reçue",
    "criticality": "P0",
    "archetype": "Poste de travail actif",
    "screenCodes": [
      "PRE-28",
      "PRE-31"
    ],
    "routes": [
      "/prestataire/missions/:id/execution",
      "/prestataire/missions/:id/validations"
    ],
    "zoneKinds": [
      "cta",
      "kpi",
      "list",
      "timeline",
      "verdict"
    ],
    "componentRefs": [
      "C-04",
      "C-06",
      "Carte",
      "Compteur",
      "Encart",
      "Ligne",
      "Signalement"
    ],
    "stateNames": [
      "À jour",
      "Action imminente",
      "Preuve refusée",
      "Obstacle signalé",
      "Validée",
      "Validée avec réserve",
      "Refusée",
      "Validation automatique"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--emerald-500",
      "--gold-500",
      "--mono"
    ],
    "designApi": [
      "GET /v1/missions/:id/provider-execution",
      "POST /v1/missions/:id/obstacles",
      "GET /v1/missions/:id/earned",
      "GET /v1/missions/:id/validations",
      "POST /v1/evidence/:id/reupload"
    ]
  },
  {
    "id": "PRE-29",
    "canon": "Preuve — dépôt & exigences",
    "criticality": "P1",
    "archetype": "Cahier des preuves",
    "screenCodes": [
      "PRE-29",
      "PRE-30"
    ],
    "routes": [
      "/prestataire/missions/:id/jalons",
      "/prestataire/evidence/nouvelle"
    ],
    "zoneKinds": [
      "cta",
      "form",
      "kpi",
      "list"
    ],
    "componentRefs": [
      "Aide",
      "Appareil",
      "Carte",
      "Checklist",
      "File",
      "Indicateur",
      "Upload"
    ],
    "stateNames": [
      "Toutes dues",
      "Partiellement déposées",
      "Preuve refusée",
      "Toutes validées",
      "Hors-ligne",
      "Non conforme",
      "Envoi en cours",
      "Déposée",
      "Refusée par le client",
      "Obstacle technique"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--emerald-500",
      "--glass-1",
      "--glass-3",
      "--gold-500",
      "--mono"
    ],
    "designApi": [
      "GET /v1/missions/:id/evidence-requirements",
      "POST /v1/evidence {requirementId, files}",
      "POST /v1/evidence",
      "POST /v1/uploads/r2/presign",
      "GET /v1/evidence/:id/validation-preview"
    ]
  },
  {
    "id": "PRE-32",
    "canon": "Salaire — attendu, échéances & relances",
    "criticality": "P0",
    "archetype": "Mon argent",
    "screenCodes": [
      "PRE-32",
      "PRE-33",
      "PRE-36",
      "PRE-37"
    ],
    "routes": [
      "/prestataire/salaire",
      "/prestataire/salaire/echeances",
      "/prestataire/salaire/retard",
      "/prestataire/salaire/:id/relance"
    ],
    "zoneKinds": [
      "chat",
      "cta",
      "form",
      "hero",
      "kpi",
      "list",
      "price",
      "timeline"
    ],
    "componentRefs": [
      "Badge",
      "Bandeau",
      "C-05",
      "C-06",
      "Carte",
      "Compteur",
      "Droit",
      "Formulaire",
      "Frise",
      "Gabarat",
      "Impact",
      "Ligne",
      "Sélecteur",
      "Totaux"
    ],
    "stateNames": [
      "À venir",
      "Déclaré par le client",
      "En vérification",
      "OTP attendu",
      "Reçu",
      "En retard",
      "Normal",
      "Retard",
      "Gros mois",
      "Aucun contrat",
      "J+1 à J+3",
      "J+4 à J+7",
      "J+8 et plus",
      "Résolu",
      "Prête",
      "Soumise",
      "Irrecevable",
      "Résolue"
    ],
    "tokens": [
      "--clay-500",
      "--display-1",
      "--display-2",
      "--emerald-500",
      "--glass-2",
      "--gold-500",
      "--mono"
    ],
    "designApi": [
      "GET /v1/payments?role=provider&state=pending",
      "GET /v1/payments/expected",
      "POST /v1/payments/:id/dispute-not-received",
      "GET /v1/payments/schedules?role=provider",
      "GET /v1/payments/projection?days=30",
      "GET /v1/payments/overdue?provider=me",
      "POST /v1/disputes {type: non-payment}",
      "POST /v1/contracts/:id/suspend",
      "POST /v1/payments/:id/contests",
      "GET /v1/payments/:id/contests"
    ]
  },
  {
    "id": "PRE-34",
    "canon": "Salaire — déclaré par le client & réconciliation",
    "criticality": "P0",
    "archetype": "Confirmer ou contester",
    "screenCodes": [
      "PRE-34",
      "PRE-35"
    ],
    "routes": [
      "/prestataire/salaire/:id/declare",
      "/prestataire/salaire/:id/verification"
    ],
    "zoneKinds": [
      "cta",
      "hero",
      "kpi",
      "list",
      "timeline"
    ],
    "componentRefs": [
      "Bandeau",
      "C-06",
      "C-11",
      "Carte",
      "Double",
      "Zone"
    ],
    "stateNames": [
      "À confirmer",
      "Confirmée",
      "Contestée",
      "Expirée (72 h)",
      "Instruction",
      "Pièce demandée",
      "Décision : fondée",
      "Décision : non fondée",
      "Fraude établie"
    ],
    "tokens": [
      "--clay-500",
      "--emerald-500",
      "--glass-3",
      "--gold-500",
      "--mono",
      "--violet-500"
    ],
    "designApi": [
      "GET /v1/payments/:id/external-claim",
      "POST /v1/payments/:id/external-claim/confirm",
      "POST /v1/payments/:id/external-claim/contest",
      "GET /v1/reconciliations/:id/provider-view",
      "POST /v1/reconciliations/:id/evidence"
    ]
  },
  {
    "id": "PRE-38",
    "canon": "Salaire — OTP de réception & reçu",
    "criticality": "P0",
    "archetype": "Le sceau de réception",
    "screenCodes": [
      "PRE-38",
      "PRE-39"
    ],
    "routes": [
      "/prestataire/salaire/:id/otp",
      "/prestataire/salaire/:id/recu"
    ],
    "zoneKinds": [
      "cta",
      "doc",
      "form",
      "hero",
      "sign"
    ],
    "componentRefs": [
      "Attestation",
      "C-04",
      "C-07",
      "Compte",
      "Document",
      "Encart",
      "QR"
    ],
    "stateNames": [
      "Saisie",
      "Code incorrect",
      "Code expiré",
      "Confirmé",
      "Contestation",
      "Émis",
      "Régularisé",
      "Annulé"
    ],
    "tokens": [
      "--emerald-500",
      "--glass-1",
      "--glass-4",
      "--gold-500",
      "--grad-emerald",
      "--mono"
    ],
    "designApi": [
      "POST /v1/payments/:id/salary-otp/request",
      "POST /v1/payments/:id/salary-otp/verify",
      "GET /v1/payments/:id/proof",
      "GET /v1/payments/:id/receipt.pdf",
      "GET /v1/provider/income-statement.pdf?year="
    ]
  },
  {
    "id": "PRE-40",
    "canon": "Remplacement — notification & droits",
    "criticality": "P0",
    "archetype": "Être remplacé",
    "screenCodes": [
      "PRE-40"
    ],
    "routes": [
      "/prestataire/missions/:id/remplacement"
    ],
    "zoneKinds": [
      "cta",
      "hero",
      "kpi",
      "price"
    ],
    "componentRefs": [
      "Bandeau",
      "C-11",
      "Carte",
      "Sceau"
    ],
    "stateNames": [
      "À votre initiative",
      "À l'initiative du client — faute alléguée",
      "À l'initiative du client — accord mutuel",
      "Force majeure",
      "Contestée"
    ],
    "tokens": [
      "--clay-500",
      "--emerald-500",
      "--gold-500",
      "--mono"
    ],
    "designApi": [
      "GET /v1/replacements/:id/provider-view",
      "POST /v1/replacements/:id/contest",
      "POST /v1/replacements/:id/accept"
    ]
  },
  {
    "id": "PRE-41",
    "canon": "Remplacement — transition, reprise & sortie",
    "criticality": "P1",
    "archetype": "Passer la main",
    "screenCodes": [
      "PRE-41",
      "PRE-43",
      "PRE-44"
    ],
    "routes": [
      "/prestataire/missions/:id/remplacement/conditions",
      "/prestataire/remplacements/:id/transition",
      "/prestataire/remplacements/:id/reprise"
    ],
    "zoneKinds": [
      "cta",
      "hero",
      "kpi",
      "list",
      "price",
      "timeline"
    ],
    "componentRefs": [
      "Bandeau",
      "C-06",
      "Carte",
      "Checklist",
      "Distinction",
      "Inventaire",
      "Table",
      "Tableau"
    ],
    "stateNames": [
      "À préparer",
      "En cours",
      "Validée",
      "Litige sur matériel/documents",
      "En cours",
      "Paiement en attente",
      "Clôturée",
      "Litige de sortie",
      "Prête",
      "Dossier incomplet",
      "Refusée",
      "Acceptée"
    ],
    "tokens": [
      "--clay-500",
      "--emerald-500",
      "--gold-500",
      "--mono",
      "--slate-500"
    ],
    "designApi": [
      "GET /v1/replacements/:id/handover/provider",
      "POST /v1/replacements/:id/handover/ack",
      "GET /v1/replacements/:id/exit/provider",
      "POST /v1/replacements/:id/exit/ack",
      "POST /v1/replacements/:id/asset-report",
      "GET /v1/replacements/:id/reprise/provider-view",
      "POST /v1/replacements/:id/reprise/accept",
      "POST /v1/replacements/:id/reprise/negotiate"
    ]
  },
  {
    "id": "PRE-42",
    "canon": "Remplacement — décision prestataire",
    "criticality": "P0",
    "archetype": "Se défendre ou accepter",
    "screenCodes": [
      "PRE-42"
    ],
    "routes": [
      "/prestataire/remplacements/:id/decision"
    ],
    "zoneKinds": [
      "cta",
      "doc",
      "form",
      "kpi"
    ],
    "componentRefs": [
      "Compte",
      "Radios",
      "Sélecteur"
    ],
    "stateNames": [
      "À décider",
      "Accepté",
      "Contesté",
      "Médiation",
      "Expiré"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--emerald-500",
      "--mono"
    ],
    "designApi": [
      "POST /v1/replacements/:id/decision {choice, evidenceIds, statement}",
      "GET /v1/replacements/:id/deadline"
    ]
  },
  {
    "id": "PRE-45",
    "canon": "Réputation — synthèse & ledger",
    "criticality": "P0",
    "archetype": "Ce que le travail a construit",
    "screenCodes": [
      "PRE-45",
      "PRE-46"
    ],
    "routes": [
      "/prestataire/reputation",
      "/prestataire/reputation/ledger"
    ],
    "zoneKinds": [
      "cta",
      "kpi",
      "list",
      "ring",
      "table",
      "timeline"
    ],
    "componentRefs": [
      "Badge",
      "C-10",
      "C-12",
      "Carte",
      "Courbe",
      "Export"
    ],
    "stateNames": [
      "Nouveau profil",
      "Établi",
      "En baisse",
      "Exemplaire",
      "Vide",
      "Écriture contestée",
      "Correction appliquée",
      "Période longue"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--emerald-500",
      "--glass-2",
      "--gold-500",
      "--mono",
      "--surface-1"
    ],
    "designApi": [
      "GET /v1/reputation/me",
      "GET /v1/reputation/me/breakdown",
      "GET /v1/reputation/methodology (public)",
      "GET /v1/reputation/me/ledger?cursor=",
      "POST /v1/reputation/entries/:id/contest",
      "GET /v1/reputation/me/ledger/export"
    ]
  },
  {
    "id": "PRE-47",
    "canon": "Réputation — contestation",
    "criticality": "P1",
    "archetype": "Voix sur son honneur",
    "screenCodes": [
      "PRE-47"
    ],
    "routes": [
      "/prestataire/reputation/contestation"
    ],
    "zoneKinds": [
      "cta",
      "form",
      "hero",
      "kpi"
    ],
    "componentRefs": [
      "Bandeau",
      "Formulaire",
      "Historique",
      "Rappel"
    ],
    "stateNames": [
      "Aucune contestation possible",
      "Reçue",
      "Acceptée",
      "Rejetée"
    ],
    "tokens": [
      "--amber-500",
      "--glass-2",
      "--mono",
      "--text-mid"
    ],
    "designApi": [
      "POST /v1/reputation/entries/:id/contest {grounds, facts, evidenceIds}",
      "GET /v1/reputation/contests/me"
    ]
  },
  {
    "id": "PRE-48",
    "canon": "Documents — bibliothèque, dépôt, vérification & historique",
    "criticality": "P0",
    "archetype": "Armoire professionnelle",
    "screenCodes": [
      "PRE-48",
      "PRE-49",
      "PRE-50",
      "PRE-51",
      "PRE-52"
    ],
    "routes": [
      "/prestataire/documents",
      "/prestataire/documents/:id/versions/nouvelle",
      "/prestataire/documents/:id/verification",
      "/prestataire/documents/:id/rejet",
      "/prestataire/documents/:id/historique"
    ],
    "zoneKinds": [
      "cta",
      "form",
      "hero",
      "kpi",
      "list",
      "table",
      "timeline"
    ],
    "componentRefs": [
      "Alerte",
      "Badge",
      "C-06",
      "C-11",
      "Carte",
      "Checklist",
      "Comparateur",
      "Contrôle",
      "Exemple",
      "Export",
      "Guide",
      "Ligne",
      "Log",
      "Recours",
      "Téléverseur"
    ],
    "stateNames": [
      "Vide",
      "Vérification en cours",
      "Pièce rejetée",
      "Expirée",
      "Dossier complet",
      "Prêt",
      "Téléversement",
      "En vérification",
      "Vérifiée",
      "Rejetée",
      "Contrôle automatique",
      "Contrôle humain",
      "Validée",
      "Correction souhaitée",
      "Rejetée",
      "Rejetée",
      "Correction en cours",
      "Corrigée",
      "Recours accepté",
      "Une version",
      "Multi-versions",
      "Version expirée"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--emerald-500",
      "--glass-2",
      "--mono",
      "--slate-500",
      "--surface-1",
      "--surface-2",
      "--violet-500"
    ],
    "designApi": [
      "GET /v1/documents?owner=me",
      "POST /v1/documents",
      "DELETE /v1/documents/:id",
      "POST /v1/documents/:id/versions",
      "GET /v1/documents/:id/versions/compare",
      "GET /v1/uploads/r2/presign",
      "GET /v1/documents/:id/verification",
      "GET /v1/documents/verification-policy (public)",
      "GET /v1/documents/:id/rejection",
      "POST /v1/documents/:id/rejection/correct",
      "POST /v1/documents/:id/rejection/contest",
      "GET /v1/documents/:id/versions",
      "GET /v1/documents/:id/usages",
      "GET /v1/documents/:id/history.pdf"
    ]
  }
] as const;

export const PRESTATAIRE_DESIGN_SCREENS = [
  {
    "code": "PRE-01",
    "unitId": "Dashboard prestataire",
    "route": "/prestataire",
    "canonicalRoute": "/prestataire",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "kpi",
      "list",
      "timeline",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/provider/dashboard",
      "PATCH /v1/provider/availability",
      "GET /v1/payments?role=provider&state=pending"
    ],
    "tokens": [
      "--emerald-500",
      "--gold-500",
      "--display-1",
      "--surface-0",
      "--amber-500"
    ]
  },
  {
    "code": "PRE-02",
    "unitId": "Notifications — flux prestataire",
    "route": "/prestataire/notifications",
    "canonicalRoute": "/prestataire/notifications",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "chips",
      "list",
      "cta"
    ],
    "variantOf": "EMP-02",
    "designApi": [
      "GET /v1/notifications?role=provider",
      "GET /v1/notifications/stream (SSE)"
    ],
    "tokens": [
      "--surface-1",
      "--emerald-500",
      "--clay-500",
      "--gold-500"
    ]
  },
  {
    "code": "PRE-03",
    "unitId": "Profil prestataire",
    "route": "/prestataire/profil",
    "canonicalRoute": "/prestataire/profil",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "kpi",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/provider/profile",
      "PATCH /v1/provider/profile",
      "GET /v1/provider/profile/export.pdf"
    ],
    "tokens": [
      "--emerald-500",
      "--gold-500",
      "--mono",
      "--surface-2",
      "--amber-500"
    ]
  },
  {
    "code": "PRE-04",
    "unitId": "Paramètres (prestataire)",
    "route": "/prestataire/parametres",
    "canonicalRoute": "/prestataire/parametres",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "list",
      "form",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET/PATCH /v1/provider/settings",
      "POST /v1/provider/pause",
      "GET /v1/provider/export"
    ],
    "tokens": [
      "--surface-2",
      "--emerald-500",
      "--slate-500",
      "--mono"
    ]
  },
  {
    "code": "PRE-05",
    "unitId": "Missions disponibles — marché",
    "route": "/prestataire/missions",
    "canonicalRoute": "/prestataire/missions",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "chips",
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/missions/available?segment=&sort=&cursor=",
      "GET /v1/missions/available/counters"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--surface-1",
      "--display-1",
      "--squircle-22"
    ]
  },
  {
    "code": "PRE-06",
    "unitId": "Missions disponibles — filtres",
    "route": "/prestataire/missions/filtres",
    "canonicalRoute": "/prestataire/missions/filtres",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "form",
      "kpi",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/missions/available/search",
      "GET /v1/filters/provider-presets"
    ],
    "tokens": [
      "--gold-500",
      "--surface-3",
      "--emerald-500",
      "--mono"
    ]
  },
  {
    "code": "PRE-07",
    "unitId": "Mission — fiche prestataire",
    "route": "/prestataire/missions/:id",
    "canonicalRoute": "/prestataire/missions/:id",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "price",
      "hero",
      "list",
      "timeline",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/missions/:id/provider-view",
      "POST /v1/missions/:id/report",
      "POST /v1/missions/:id/save"
    ],
    "tokens": [
      "--display-1",
      "--gold-500",
      "--emerald-500",
      "--surface-2",
      "--glass-2"
    ]
  },
  {
    "code": "PRE-08",
    "unitId": "Candidature — dépôt",
    "route": "/prestataire/missions/:id/postuler",
    "canonicalRoute": "/prestataire/missions/:id/postuler",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "form",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/missions/:id/applications {message, evidenceIds, availability}",
      "GET /v1/applications/draft?missionId="
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--surface-2",
      "--glass-2",
      "--mono"
    ]
  },
  {
    "code": "PRE-09",
    "unitId": "Candidature — dépôt",
    "route": "/prestataire/candidatures/envoyee",
    "canonicalRoute": "/prestataire/candidatures/envoyee",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "verdict",
      "timeline",
      "kpi",
      "cta"
    ],
    "variantOf": "PRE-08",
    "designApi": [
      "GET /v1/applications/:id",
      "GET /v1/missions/available/similar?to=:mid"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--mono",
      "--glass-1"
    ]
  },
  {
    "code": "PRE-10",
    "unitId": "Candidature — suivi & questions",
    "route": "/prestataire/candidatures/:id",
    "canonicalRoute": "/prestataire/candidatures/:id",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "hero",
      "timeline",
      "chat",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/applications/:id/full",
      "POST /v1/applications/:id/withdraw",
      "POST /v1/applications/:id/answers"
    ],
    "tokens": [
      "--emerald-500",
      "--gold-500",
      "--slate-500",
      "--mono"
    ]
  },
  {
    "code": "PRE-11",
    "unitId": "Candidatures — registre & archive",
    "route": "/prestataire/candidatures",
    "canonicalRoute": "/prestataire/candidatures",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "chips",
      "list",
      "kpi"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/applications?provider=me&segment=",
      "GET /v1/applications/stats"
    ],
    "tokens": [
      "--emerald-500",
      "--gold-500",
      "--mono",
      "--surface-1"
    ]
  },
  {
    "code": "PRE-12",
    "unitId": "Candidature — suivi & questions",
    "route": "/prestataire/candidatures/:id/depot",
    "canonicalRoute": "/prestataire/candidatures/:id/depot",
    "role": "CANDIDATE",
    "criticality": "P2",
    "zoneKinds": [
      "doc",
      "kpi",
      "cta"
    ],
    "variantOf": "PRE-10",
    "designApi": [
      "GET /v1/applications/:id/submission",
      "POST /v1/applications/messages/templates"
    ],
    "tokens": [
      "--surface-2",
      "--mono",
      "--emerald-500"
    ]
  },
  {
    "code": "PRE-13",
    "unitId": "Candidature — suivi & questions",
    "route": "/prestataire/candidatures/:id/questions",
    "canonicalRoute": "/prestataire/candidatures/:id/questions",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "chat",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/applications/:id/questions",
      "POST /v1/applications/:id/answers",
      "POST /v1/questions/:id/report"
    ],
    "tokens": [
      "--emerald-500",
      "--clay-500",
      "--mono",
      "--glass-2"
    ]
  },
  {
    "code": "PRE-14",
    "unitId": "Candidature — retrait",
    "route": "/prestataire/candidatures/:id/retrait",
    "canonicalRoute": "/prestataire/candidatures/:id/retrait",
    "role": "CANDIDATE",
    "criticality": "P2",
    "zoneKinds": [
      "form",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/applications/:id/withdraw {reason?}",
      "GET /v1/applications/:id/withdraw-policy"
    ],
    "tokens": [
      "--clay-500",
      "--slate-500",
      "--surface-3"
    ]
  },
  {
    "code": "PRE-15",
    "unitId": "Candidatures — registre & archive",
    "route": "/prestataire/candidatures/archive",
    "canonicalRoute": "/prestataire/candidatures/archive",
    "role": "CANDIDATE",
    "criticality": "P2",
    "zoneKinds": [
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/applications/archive",
      "GET /v1/applications/export.csv"
    ],
    "tokens": [
      "--slate-500",
      "--emerald-500",
      "--mono"
    ]
  },
  {
    "code": "PRE-16",
    "unitId": "Propositions reçues — registre & historique",
    "route": "/prestataire/propositions",
    "canonicalRoute": "/prestataire/propositions",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "chips",
      "list",
      "kpi"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/propositions?provider=me&segment=",
      "GET /v1/propositions/counters"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--display-2",
      "--mono"
    ]
  },
  {
    "code": "PRE-17",
    "unitId": "Proposition reçue — détail & réponse",
    "route": "/prestataire/propositions/:id",
    "canonicalRoute": "/prestataire/propositions/:id",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "price",
      "hero",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/propositions/:id/provider-view",
      "POST /v1/propositions/:id/accept",
      "POST /v1/propositions/:id/counter"
    ],
    "tokens": [
      "--display-1",
      "--gold-500",
      "--emerald-500",
      "--clay-500",
      "--glass-2"
    ]
  },
  {
    "code": "PRE-18",
    "unitId": "Proposition reçue — détail & réponse",
    "route": "/prestataire/propositions/:id/acceptation",
    "canonicalRoute": "/prestataire/propositions/:id/acceptation",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "list",
      "price",
      "kpi",
      "cta"
    ],
    "variantOf": "PRE-17",
    "designApi": [
      "POST /v1/propositions/:id/accept {consent, availabilityConfirmed}",
      "GET /v1/provider/calendar/conflicts?mission=:mid"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--clay-500",
      "--grad-gold",
      "--mono"
    ]
  },
  {
    "code": "PRE-19",
    "unitId": "Proposition reçue — détail & réponse",
    "route": "/prestataire/propositions/:id/contre",
    "canonicalRoute": "/prestataire/propositions/:id/contre",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "form",
      "list",
      "chat",
      "cta"
    ],
    "variantOf": "PRE-17",
    "designApi": [
      "POST /v1/propositions/:id/counter {type, amount?, durationDays?, motive, message}",
      "GET /v1/propositions/:id/provider-preview"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--mono",
      "--surface-2"
    ]
  },
  {
    "code": "PRE-20",
    "unitId": "Propositions reçues — registre & historique",
    "route": "/prestataire/propositions/historique",
    "canonicalRoute": "/prestataire/propositions/historique",
    "role": "CANDIDATE",
    "criticality": "P2",
    "zoneKinds": [
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/propositions/history?provider=me",
      "GET /v1/propositions/stats"
    ],
    "tokens": [
      "--slate-500",
      "--gold-500",
      "--mono"
    ]
  },
  {
    "code": "PRE-21",
    "unitId": "Contrat prestataire — folio, états & révision",
    "route": "/prestataire/contrats/:id",
    "canonicalRoute": "/prestataire/contrats/:id",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "doc",
      "sign",
      "price",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/contracts/:id/provider-view",
      "POST /v1/contracts/:id/sign",
      "POST /v1/contracts/:id/clarification"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--mono",
      "--glass-1",
      "--text-mid"
    ]
  },
  {
    "code": "PRE-22",
    "unitId": "Contrat prestataire — folio, états & révision",
    "route": "/prestataire/contrats/:id/lecture",
    "canonicalRoute": "/prestataire/contrats/:id/lecture",
    "role": "CANDIDATE",
    "criticality": "P2",
    "zoneKinds": [
      "list",
      "doc",
      "cta"
    ],
    "variantOf": "PRE-21",
    "designApi": [
      "GET /v1/contracts/:id/guided-reading?lang=fr"
    ],
    "tokens": [
      "--emerald-500",
      "--gold-500",
      "--text-mid",
      "--glass-1"
    ]
  },
  {
    "code": "PRE-23",
    "unitId": "Contrat prestataire — folio, états & révision",
    "route": "/prestataire/contrats/:id/versions/:v",
    "canonicalRoute": "/prestataire/contrats/:id/versions/:v",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "doc",
      "price",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/contracts/:id/versions/:v/provider-view",
      "POST /v1/contracts/:id/versions/:v/accept",
      "POST /v1/contracts/:id/versions/:v/reject"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--clay-500",
      "--mono"
    ]
  },
  {
    "code": "PRE-24",
    "unitId": "Contrat — signature prestataire",
    "route": "/prestataire/contrats/:id/signer",
    "canonicalRoute": "/prestataire/contrats/:id/signer",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "list",
      "sign",
      "price",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/contracts/:id/sign {method, consent, artifact}",
      "POST /v1/contracts/:id/refuse"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--grad-gold",
      "--glass-4",
      "--mono"
    ]
  },
  {
    "code": "PRE-25",
    "unitId": "Contrat prestataire — folio, états & révision",
    "route": "/prestataire/contrats/:id/actif",
    "canonicalRoute": "/prestataire/contrats/:id/actif",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "hero",
      "timeline",
      "price",
      "cta"
    ],
    "variantOf": "PRE-21",
    "designApi": [
      "GET /v1/contracts/:id/provider-state",
      "POST /v1/contracts/:id/impediment"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--clay-500",
      "--mono"
    ]
  },
  {
    "code": "PRE-26",
    "unitId": "Contrat prestataire — folio, états & révision",
    "route": "/prestataire/contrats/:id/avenants/:aid",
    "canonicalRoute": "/prestataire/contrats/:id/avenants/:aid",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "doc",
      "price",
      "kpi",
      "cta"
    ],
    "variantOf": "PRE-23",
    "designApi": [
      "GET /v1/contracts/:id/amendments/:aid/provider-view",
      "POST /v1/contracts/:id/amendments/:aid/accept",
      "POST /v1/contracts/:id/amendments/:aid/refuse"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--clay-500",
      "--mono"
    ]
  },
  {
    "code": "PRE-27",
    "unitId": "Contrat prestataire — folio, états & révision",
    "route": "/prestataire/contrats/:id/resiliation",
    "canonicalRoute": "/prestataire/contrats/:id/resiliation",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "hero",
      "price",
      "timeline",
      "cta"
    ],
    "variantOf": "PRE-21",
    "designApi": [
      "GET /v1/contracts/:id/termination/provider-view",
      "POST /v1/contracts/:id/termination/contest"
    ],
    "tokens": [
      "--clay-500",
      "--gold-500",
      "--emerald-500",
      "--mono"
    ]
  },
  {
    "code": "PRE-28",
    "unitId": "Exécution — suivi & validation reçue",
    "route": "/prestataire/missions/:id/execution",
    "canonicalRoute": "/prestataire/missions/:id/execution",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "timeline",
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/missions/:id/provider-execution",
      "POST /v1/missions/:id/obstacles",
      "GET /v1/missions/:id/earned"
    ],
    "tokens": [
      "--emerald-500",
      "--gold-500",
      "--amber-500",
      "--mono"
    ]
  },
  {
    "code": "PRE-29",
    "unitId": "Preuve — dépôt & exigences",
    "route": "/prestataire/missions/:id/jalons",
    "canonicalRoute": "/prestataire/missions/:id/jalons",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/missions/:id/evidence-requirements",
      "POST /v1/evidence {requirementId, files}"
    ],
    "tokens": [
      "--emerald-500",
      "--gold-500",
      "--mono",
      "--glass-1"
    ]
  },
  {
    "code": "PRE-30",
    "unitId": "Preuve — dépôt & exigences",
    "route": "/prestataire/evidence/nouvelle",
    "canonicalRoute": "/prestataire/evidence/nouvelle",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "form",
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": "PRE-29",
    "designApi": [
      "POST /v1/evidence",
      "POST /v1/uploads/r2/presign",
      "GET /v1/evidence/:id/validation-preview"
    ],
    "tokens": [
      "--emerald-500",
      "--gold-500",
      "--amber-500",
      "--clay-500",
      "--glass-3"
    ]
  },
  {
    "code": "PRE-31",
    "unitId": "Exécution — suivi & validation reçue",
    "route": "/prestataire/missions/:id/validations",
    "canonicalRoute": "/prestataire/missions/:id/validations",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "verdict",
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/missions/:id/validations",
      "POST /v1/evidence/:id/reupload"
    ],
    "tokens": [
      "--emerald-500",
      "--gold-500",
      "--clay-500",
      "--mono"
    ]
  },
  {
    "code": "PRE-32",
    "unitId": "Salaire — attendu, échéances & relances",
    "route": "/prestataire/salaire",
    "canonicalRoute": "/prestataire/salaire",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "price",
      "timeline",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/payments?role=provider&state=pending",
      "GET /v1/payments/expected",
      "POST /v1/payments/:id/dispute-not-received"
    ],
    "tokens": [
      "--display-1",
      "--gold-500",
      "--emerald-500",
      "--clay-500",
      "--mono"
    ]
  },
  {
    "code": "PRE-33",
    "unitId": "Salaire — attendu, échéances & relances",
    "route": "/prestataire/salaire/echeances",
    "canonicalRoute": "/prestataire/salaire/echeances",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "timeline",
      "kpi",
      "cta"
    ],
    "variantOf": "PRE-32",
    "designApi": [
      "GET /v1/payments/schedules?role=provider",
      "GET /v1/payments/projection?days=30"
    ],
    "tokens": [
      "--gold-500",
      "--clay-500",
      "--emerald-500",
      "--mono"
    ]
  },
  {
    "code": "PRE-34",
    "unitId": "Salaire — déclaré par le client & réconciliation",
    "route": "/prestataire/salaire/:id/declare",
    "canonicalRoute": "/prestataire/salaire/:id/declare",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/payments/:id/external-claim",
      "POST /v1/payments/:id/external-claim/confirm",
      "POST /v1/payments/:id/external-claim/contest"
    ],
    "tokens": [
      "--emerald-500",
      "--clay-500",
      "--gold-500",
      "--mono",
      "--glass-3"
    ]
  },
  {
    "code": "PRE-35",
    "unitId": "Salaire — déclaré par le client & réconciliation",
    "route": "/prestataire/salaire/:id/verification",
    "canonicalRoute": "/prestataire/salaire/:id/verification",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "timeline",
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/reconciliations/:id/provider-view",
      "POST /v1/reconciliations/:id/evidence"
    ],
    "tokens": [
      "--violet-500",
      "--clay-500",
      "--emerald-500",
      "--mono"
    ]
  },
  {
    "code": "PRE-36",
    "unitId": "Salaire — attendu, échéances & relances",
    "route": "/prestataire/salaire/retard",
    "canonicalRoute": "/prestataire/salaire/retard",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "timeline",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/payments/overdue?provider=me",
      "POST /v1/disputes {type: non-payment}",
      "POST /v1/contracts/:id/suspend"
    ],
    "tokens": [
      "--clay-500",
      "--gold-500",
      "--emerald-500",
      "--mono",
      "--display-2"
    ]
  },
  {
    "code": "PRE-37",
    "unitId": "Salaire — attendu, échéances & relances",
    "route": "/prestataire/salaire/:id/relance",
    "canonicalRoute": "/prestataire/salaire/:id/relance",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "form",
      "list",
      "chat",
      "cta"
    ],
    "variantOf": "PRE-36",
    "designApi": [
      "POST /v1/payments/:id/contests",
      "GET /v1/payments/:id/contests"
    ],
    "tokens": [
      "--clay-500",
      "--gold-500",
      "--mono",
      "--glass-2"
    ]
  },
  {
    "code": "PRE-38",
    "unitId": "Salaire — OTP de réception & reçu",
    "route": "/prestataire/salaire/:id/otp",
    "canonicalRoute": "/prestataire/salaire/:id/otp",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "form",
      "sign",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/payments/:id/salary-otp/request",
      "POST /v1/payments/:id/salary-otp/verify",
      "GET /v1/payments/:id/proof"
    ],
    "tokens": [
      "--emerald-500",
      "--grad-emerald",
      "--gold-500",
      "--mono",
      "--glass-4"
    ]
  },
  {
    "code": "PRE-39",
    "unitId": "Salaire — OTP de réception & reçu",
    "route": "/prestataire/salaire/:id/recu",
    "canonicalRoute": "/prestataire/salaire/:id/recu",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "doc",
      "sign",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/payments/:id/receipt.pdf",
      "GET /v1/provider/income-statement.pdf?year="
    ],
    "tokens": [
      "--emerald-500",
      "--gold-500",
      "--mono",
      "--glass-1"
    ]
  },
  {
    "code": "PRE-40",
    "unitId": "Remplacement — notification & droits",
    "route": "/prestataire/missions/:id/remplacement",
    "canonicalRoute": "/prestataire/missions/:id/remplacement",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "price",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/replacements/:id/provider-view",
      "POST /v1/replacements/:id/contest",
      "POST /v1/replacements/:id/accept"
    ],
    "tokens": [
      "--clay-500",
      "--gold-500",
      "--emerald-500",
      "--mono"
    ]
  },
  {
    "code": "PRE-41",
    "unitId": "Remplacement — transition, reprise & sortie",
    "route": "/prestataire/missions/:id/remplacement/conditions",
    "canonicalRoute": "/prestataire/missions/:id/remplacement/conditions",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/replacements/:id/handover/provider",
      "POST /v1/replacements/:id/handover/ack"
    ],
    "tokens": [
      "--emerald-500",
      "--slate-500",
      "--gold-500",
      "--mono"
    ]
  },
  {
    "code": "PRE-42",
    "unitId": "Remplacement — décision prestataire",
    "route": "/prestataire/remplacements/:id/decision",
    "canonicalRoute": "/prestataire/remplacements/:id/decision",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "form",
      "doc",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/replacements/:id/decision {choice, evidenceIds, statement}",
      "GET /v1/replacements/:id/deadline"
    ],
    "tokens": [
      "--clay-500",
      "--emerald-500",
      "--amber-500",
      "--mono"
    ]
  },
  {
    "code": "PRE-43",
    "unitId": "Remplacement — transition, reprise & sortie",
    "route": "/prestataire/remplacements/:id/transition",
    "canonicalRoute": "/prestataire/remplacements/:id/transition",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "timeline",
      "list",
      "price",
      "cta"
    ],
    "variantOf": "PRE-41",
    "designApi": [
      "GET /v1/replacements/:id/exit/provider",
      "POST /v1/replacements/:id/exit/ack",
      "POST /v1/replacements/:id/asset-report"
    ],
    "tokens": [
      "--emerald-500",
      "--slate-500",
      "--gold-500",
      "--mono"
    ]
  },
  {
    "code": "PRE-44",
    "unitId": "Remplacement — transition, reprise & sortie",
    "route": "/prestataire/remplacements/:id/reprise",
    "canonicalRoute": "/prestataire/remplacements/:id/reprise",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "hero",
      "list",
      "price",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/replacements/:id/reprise/provider-view",
      "POST /v1/replacements/:id/reprise/accept",
      "POST /v1/replacements/:id/reprise/negotiate"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--clay-500",
      "--mono"
    ]
  },
  {
    "code": "PRE-45",
    "unitId": "Réputation — synthèse & ledger",
    "route": "/prestataire/reputation",
    "canonicalRoute": "/prestataire/reputation",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "ring",
      "kpi",
      "timeline",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/reputation/me",
      "GET /v1/reputation/me/breakdown",
      "GET /v1/reputation/methodology (public)"
    ],
    "tokens": [
      "--emerald-500",
      "--gold-500",
      "--mono",
      "--glass-2"
    ]
  },
  {
    "code": "PRE-46",
    "unitId": "Réputation — synthèse & ledger",
    "route": "/prestataire/reputation/ledger",
    "canonicalRoute": "/prestataire/reputation/ledger",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "table",
      "kpi",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/reputation/me/ledger?cursor=",
      "POST /v1/reputation/entries/:id/contest",
      "GET /v1/reputation/me/ledger/export"
    ],
    "tokens": [
      "--mono",
      "--emerald-500",
      "--clay-500",
      "--amber-500",
      "--surface-1"
    ]
  },
  {
    "code": "PRE-47",
    "unitId": "Réputation — contestation",
    "route": "/prestataire/reputation/contestation",
    "canonicalRoute": "/prestataire/reputation/contestation",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "hero",
      "form",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/reputation/entries/:id/contest {grounds, facts, evidenceIds}",
      "GET /v1/reputation/contests/me"
    ],
    "tokens": [
      "--amber-500",
      "--mono",
      "--glass-2",
      "--text-mid"
    ]
  },
  {
    "code": "PRE-48",
    "unitId": "Documents — bibliothèque, dépôt, vérification & historique",
    "route": "/prestataire/documents",
    "canonicalRoute": "/prestataire/documents",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "kpi",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/documents?owner=me",
      "POST /v1/documents",
      "DELETE /v1/documents/:id"
    ],
    "tokens": [
      "--emerald-500",
      "--amber-500",
      "--clay-500",
      "--mono",
      "--surface-2"
    ]
  },
  {
    "code": "PRE-49",
    "unitId": "Documents — bibliothèque, dépôt, vérification & historique",
    "route": "/prestataire/documents/:id/versions/nouvelle",
    "canonicalRoute": "/prestataire/documents/:id/versions/nouvelle",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "form",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/documents/:id/versions",
      "GET /v1/documents/:id/versions/compare",
      "GET /v1/uploads/r2/presign"
    ],
    "tokens": [
      "--emerald-500",
      "--amber-500",
      "--mono",
      "--glass-2",
      "--clay-500"
    ]
  },
  {
    "code": "PRE-50",
    "unitId": "Documents — bibliothèque, dépôt, vérification & historique",
    "route": "/prestataire/documents/:id/verification",
    "canonicalRoute": "/prestataire/documents/:id/verification",
    "role": "CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "timeline",
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": "PRE-49",
    "designApi": [
      "GET /v1/documents/:id/verification",
      "GET /v1/documents/verification-policy (public)"
    ],
    "tokens": [
      "--violet-500",
      "--emerald-500",
      "--clay-500",
      "--mono"
    ]
  },
  {
    "code": "PRE-51",
    "unitId": "Documents — bibliothèque, dépôt, vérification & historique",
    "route": "/prestataire/documents/:id/rejet",
    "canonicalRoute": "/prestataire/documents/:id/rejet",
    "role": "CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "kpi",
      "list",
      "cta"
    ],
    "variantOf": "PRE-49",
    "designApi": [
      "GET /v1/documents/:id/rejection",
      "POST /v1/documents/:id/rejection/correct",
      "POST /v1/documents/:id/rejection/contest"
    ],
    "tokens": [
      "--clay-500",
      "--emerald-500",
      "--amber-500",
      "--mono"
    ]
  },
  {
    "code": "PRE-52",
    "unitId": "Documents — bibliothèque, dépôt, vérification & historique",
    "route": "/prestataire/documents/:id/historique",
    "canonicalRoute": "/prestataire/documents/:id/historique",
    "role": "CANDIDATE",
    "criticality": "P2",
    "zoneKinds": [
      "list",
      "table",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/documents/:id/versions",
      "GET /v1/documents/:id/usages",
      "GET /v1/documents/:id/history.pdf"
    ],
    "tokens": [
      "--mono",
      "--slate-500",
      "--emerald-500",
      "--surface-1"
    ]
  }
] as const;

export const PRESTATAIRE_UNIT_IDS: readonly string[] = PRESTATAIRE_DESIGN_UNITS.map((unit) => unit.id);
