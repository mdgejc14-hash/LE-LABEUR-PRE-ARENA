// GÉNÉRÉ PAR scripts/design/generate-employer-catalog.py — NE PAS ÉDITER À LA MAIN.
// Source : design/llab/content/emp_*.py, design/llab/units.py.
// Régénérer : npm run design:employer
//
// Référence de design UNIQUEMENT : aucun libellé de ce fichier n'est affiché par
// l'interface. Les textes visibles viennent de src/employer/vocabulary.ts (vocabulaire
// LE LABEUR : EMPLOYER, OFFRE, CANDIDAT, CANDIDATURE, PROPOSITION, CONTRAT, CLAIM,
// PAIEMENT, REMPLACEMENT, MATCHING, DOCUMENT).
// Les routes sont celles du routeur P0 : elles ne sont ni renommées ni réécrites.

export interface EmployerDesignScreen {
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

export interface EmployerDesignUnit {
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

export const EMPLOYER_DESIGN_UNITS = [
  {
    "id": "EMP-01",
    "canon": "Dashboard client",
    "criticality": "P0",
    "archetype": "Control room personnelle",
    "screenCodes": [
      "EMP-01"
    ],
    "routes": [
      "/client"
    ],
    "zoneKinds": [
      "cta",
      "hero",
      "kpi",
      "list",
      "timeline"
    ],
    "componentRefs": [
      "C-02",
      "C-04",
      "C-05",
      "C-06"
    ],
    "stateNames": [
      "Nouveau client",
      "Actif",
      "Urgence",
      "Chargement",
      "Erreur réseau"
    ],
    "tokens": [
      "--amber-500",
      "--display-1",
      "--glass-2",
      "--gold-500",
      "--price",
      "--surface-0"
    ],
    "designApi": [
      "GET /v1/client/dashboard",
      "GET /v1/missions?status=active&limit=8",
      "GET /v1/payments/upcoming"
    ]
  },
  {
    "id": "EMP-02",
    "canon": "Notifications (flux)",
    "criticality": "P1",
    "archetype": "Flux d'événements actionnables",
    "screenCodes": [
      "EMP-02"
    ],
    "routes": [
      "/client/notifications"
    ],
    "zoneKinds": [
      "chips",
      "cta",
      "list"
    ],
    "componentRefs": [
      "Badge",
      "Groupement",
      "Ligne",
      "Swipe"
    ],
    "stateNames": [
      "Non lues",
      "Vides",
      "Non lues > 50",
      "Archivées"
    ],
    "tokens": [
      "--clay-500",
      "--emerald-500",
      "--gold-500",
      "--stroke-sub",
      "--surface-1"
    ],
    "designApi": [
      "GET /v1/notifications?filter=all",
      "POST /v1/notifications/read",
      "GET /v1/notifications/stream (SSE)"
    ]
  },
  {
    "id": "EMP-03",
    "canon": "Profil client",
    "criticality": "P1",
    "archetype": "Identité vérifiable",
    "screenCodes": [
      "EMP-03"
    ],
    "routes": [
      "/client/profil"
    ],
    "zoneKinds": [
      "cta",
      "hero",
      "kpi",
      "list"
    ],
    "componentRefs": [
      "Barre",
      "Bloc",
      "Carte"
    ],
    "stateNames": [
      "Complet",
      "Incomplet",
      "Vérification en cours",
      "Modification sensible"
    ],
    "tokens": [
      "--emerald-500",
      "--gold-500",
      "--squircle-28",
      "--surface-2",
      "--text-mid"
    ],
    "designApi": [
      "GET /v1/client/profile",
      "PATCH /v1/client/profile",
      "GET /v1/client/profile/public-preview"
    ]
  },
  {
    "id": "EMP-04",
    "canon": "Paramètres (client)",
    "criticality": "P1",
    "archetype": "Salle des réglages",
    "screenCodes": [
      "EMP-04"
    ],
    "routes": [
      "/client/parametres"
    ],
    "zoneKinds": [
      "cta",
      "form",
      "list"
    ],
    "componentRefs": [
      "Bloc",
      "Ligne",
      "Toggle",
      "Zone"
    ],
    "stateNames": [
      "Par défaut",
      "Modifié non enregistré",
      "Suspension",
      "Suppression"
    ],
    "tokens": [
      "--clay-500",
      "--emerald-500",
      "--stroke-mid",
      "--surface-2",
      "--text-lo"
    ],
    "designApi": [
      "GET/PATCH /v1/client/settings",
      "POST /v1/account/suspend",
      "DELETE /v1/account (soft)",
      "GET /v1/sessions"
    ]
  },
  {
    "id": "EMP-05",
    "canon": "Missions — registre client",
    "criticality": "P0",
    "archetype": "Registre des missions",
    "screenCodes": [
      "EMP-05"
    ],
    "routes": [
      "/client/missions"
    ],
    "zoneKinds": [
      "chips",
      "list",
      "table"
    ],
    "componentRefs": [
      "Barre",
      "C-02",
      "C-04",
      "C-06"
    ],
    "stateNames": [
      "Aucune mission",
      "Action requise > 0",
      "Litige actif",
      "Recherche"
    ],
    "tokens": [
      "--clay-500",
      "--gold-500",
      "--squircle-22",
      "--surface-1",
      "--text-lo"
    ],
    "designApi": [
      "GET /v1/missions?segment=&q=&cursor=",
      "GET /v1/missions/counters"
    ]
  },
  {
    "id": "EMP-06",
    "canon": "Création de mission — wizard (4 étapes)",
    "criticality": "P0",
    "archetype": "Wizard — cadrage",
    "screenCodes": [
      "EMP-06",
      "EMP-07",
      "EMP-08",
      "EMP-09"
    ],
    "routes": [
      "/client/missions/nouvelle/1",
      "/client/missions/nouvelle/2",
      "/client/missions/nouvelle/3",
      "/client/missions/nouvelle/4"
    ],
    "zoneKinds": [
      "chips",
      "cta",
      "form",
      "kpi",
      "list",
      "price"
    ],
    "componentRefs": [
      "Autocomplete",
      "Autosave",
      "Barre",
      "C-05",
      "Carte",
      "Champ",
      "Chips",
      "Lien",
      "Mini-carte",
      "Sélecteur",
      "Éditeur"
    ],
    "stateNames": [
      "Vide",
      "Brouillon repris",
      "Catégorie sensible",
      "Erreur",
      "Zone non desservie",
      "Conflit de dates",
      "À distance",
      "Champs incomplets",
      "Sans livrable",
      "Preuve incompatible",
      "Exigence réglementée",
      "Réordonnancement",
      "Saisie en cours",
      "Prix anormalement bas",
      "Prix modifié après éligibilité",
      "Non éditable"
    ],
    "tokens": [
      "--amber-500",
      "--caps",
      "--display-1",
      "--emerald-500",
      "--gold-500",
      "--grad-gold",
      "--mono",
      "--price",
      "--squircle-14",
      "--surface-2"
    ],
    "designApi": [
      "POST /v1/missions/draft",
      "PATCH /v1/missions/draft/:id/step1",
      "GET /v1/catalog/categories",
      "PATCH /v1/missions/draft/:id/step2",
      "GET /v1/geo/autocomplete",
      "GET /v1/geo/coverage",
      "PATCH /v1/missions/draft/:id/step3",
      "GET /v1/catalog/skills?q=",
      "GET /v1/catalog/evidence-types",
      "PATCH /v1/missions/draft/:id/step4",
      "POST /v1/pricing/quote",
      "GET /v1/pricing/benchmark?category="
    ]
  },
  {
    "id": "EMP-10",
    "canon": "Qualification juridique (verdict)",
    "criticality": "P0",
    "archetype": "Verdict à trois sceaux",
    "screenCodes": [
      "EMP-10"
    ],
    "routes": [
      "/client/missions/:id/qualification"
    ],
    "zoneKinds": [
      "cta",
      "kpi",
      "list",
      "verdict"
    ],
    "componentRefs": [
      "Bandeau",
      "C-04",
      "Ligne",
      "Particules"
    ],
    "stateNames": [
      "Éligible",
      "Revue",
      "Bloquée",
      "Réexamen"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--display-2",
      "--emerald-500",
      "--grad-emerald"
    ],
    "designApi": [
      "POST /v1/missions/:id/qualify",
      "GET /v1/missions/:id/qualification",
      "POST /v1/missions/:id/review-request"
    ]
  },
  {
    "id": "EMP-11",
    "canon": "Tarification FIN (client)",
    "criticality": "P0",
    "archetype": "Table de valeur",
    "screenCodes": [
      "EMP-11"
    ],
    "routes": [
      "/client/missions/:id/tarification"
    ],
    "zoneKinds": [
      "cta",
      "list",
      "price",
      "timeline"
    ],
    "componentRefs": [
      "Badge",
      "C-05",
      "Curseur",
      "Lien"
    ],
    "stateNames": [
      "Lecture",
      "Simulation",
      "Échéancier invalide",
      "Devise étrangère"
    ],
    "tokens": [
      "--display-1",
      "--gold-300",
      "--gold-500",
      "--mono",
      "--price",
      "--text-hi"
    ],
    "designApi": [
      "GET /v1/missions/:id/pricing",
      "POST /v1/missions/:id/pricing/simulate",
      "POST /v1/missions/:id/pricing/validate"
    ]
  },
  {
    "id": "EMP-12",
    "canon": "Aperçu & confirmation de publication",
    "criticality": "P0",
    "archetype": "Répétition générale",
    "screenCodes": [
      "EMP-12",
      "EMP-13"
    ],
    "routes": [
      "/client/missions/:id/apercu",
      "/client/missions/:id/publiee"
    ],
    "zoneKinds": [
      "cta",
      "hero",
      "kpi",
      "list",
      "price",
      "verdict"
    ],
    "componentRefs": [
      "Aperçu",
      "Bandeau",
      "Bouton",
      "C-04",
      "Carte",
      "Checklist"
    ],
    "stateNames": [
      "Prêt",
      "Incomplet",
      "Aperçu prestataire",
      "Programmée",
      "Publiée",
      "Publiée sans candidature",
      "Partage",
      "Annulation"
    ],
    "tokens": [
      "--caps",
      "--emerald-500",
      "--glass-2",
      "--gold-500",
      "--grad-emerald",
      "--mono",
      "--surface-2",
      "--surface-3"
    ],
    "designApi": [
      "GET /v1/missions/:id/preview",
      "GET /v1/missions/:id/public-render",
      "POST /v1/missions/:id/publish",
      "POST /v1/missions/:id/publish (idempotent)",
      "GET /v1/missions/:id/matches?limit=2",
      "POST /v1/missions/:id/share-link"
    ]
  },
  {
    "id": "EMP-14",
    "canon": "Mission — fiche dossier (client)",
    "criticality": "P0",
    "archetype": "Dossier maître",
    "screenCodes": [
      "EMP-14"
    ],
    "routes": [
      "/client/missions/:id"
    ],
    "zoneKinds": [
      "cta",
      "hero",
      "list",
      "table",
      "timeline"
    ],
    "componentRefs": [
      "C-05",
      "C-06",
      "C-11",
      "Export"
    ],
    "stateNames": [
      "Publique",
      "En cours d'exécution",
      "Litige",
      "Clôturée"
    ],
    "tokens": [
      "--clay-500",
      "--emerald-500",
      "--gold-500",
      "--mono",
      "--surface-1"
    ],
    "designApi": [
      "GET /v1/missions/:id",
      "GET /v1/missions/:id/timeline",
      "GET /v1/missions/:id/report.pdf",
      "POST /v1/missions/:id/dispute"
    ]
  },
  {
    "id": "EMP-15",
    "canon": "Mission — édition & avenants",
    "criticality": "P1",
    "archetype": "Édition sous contrainte",
    "screenCodes": [
      "EMP-15"
    ],
    "routes": [
      "/client/missions/:id/modifier"
    ],
    "zoneKinds": [
      "cta",
      "form",
      "kpi",
      "list"
    ],
    "componentRefs": [
      "Bandeau",
      "Champ",
      "Vue"
    ],
    "stateNames": [
      "Libre",
      "Avenant requis",
      "Re-qualification",
      "Conflit"
    ],
    "tokens": [
      "--amber-500",
      "--gold-500",
      "--mono",
      "--slate-500",
      "--surface-2"
    ],
    "designApi": [
      "PATCH /v1/missions/:id",
      "POST /v1/missions/:id/amendments",
      "GET /v1/missions/:id/diff"
    ]
  },
  {
    "id": "EMP-16",
    "canon": "Candidatures — file client & filtres",
    "criticality": "P0",
    "archetype": "File de profils",
    "screenCodes": [
      "EMP-16",
      "EMP-20"
    ],
    "routes": [
      "/client/missions/:id/candidatures",
      "/client/missions/:id/filtres"
    ],
    "zoneKinds": [
      "chips",
      "cta",
      "form",
      "kpi",
      "list"
    ],
    "componentRefs": [
      "C-09",
      "C-10",
      "Cartographie",
      "Chips",
      "Compteur",
      "Curseur",
      "Swipe",
      "Sélection"
    ],
    "stateNames": [
      "File vide",
      "Écartées",
      "Candidat incomplet",
      "Présélection",
      "Vivier vide",
      "Filtre impossible",
      "Modèles",
      "Conflit avec tri"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--emerald-500",
      "--gold-500",
      "--squircle-14",
      "--squircle-22",
      "--surface-1",
      "--surface-3",
      "--text-mid"
    ],
    "designApi": [
      "GET /v1/missions/:id/applications?sort=&segment=",
      "POST /v1/applications/:id/shortlist",
      "POST /v1/applications/:id/dismiss",
      "POST /v1/missions/:id/applications/search",
      "GET /v1/filters/presets",
      "POST /v1/filters/presets"
    ]
  },
  {
    "id": "EMP-17",
    "canon": "Profil candidat (vue client)",
    "criticality": "P0",
    "archetype": "Dossier humain",
    "screenCodes": [
      "EMP-17"
    ],
    "routes": [
      "/client/candidats/:id"
    ],
    "zoneKinds": [
      "cta",
      "hero",
      "kpi",
      "list",
      "ring"
    ],
    "componentRefs": [
      "Badge",
      "C-10",
      "Carte"
    ],
    "stateNames": [
      "Score élevé",
      "Score faible",
      "Pièces expirées",
      "Demande de question"
    ],
    "tokens": [
      "--emerald-500",
      "--glass-2",
      "--gold-500",
      "--mono",
      "--surface-2"
    ],
    "designApi": [
      "GET /v1/providers/:id/public-profile",
      "GET /v1/providers/:id/match-breakdown?mission=:mid",
      "POST /v1/applications/:id/questions"
    ]
  },
  {
    "id": "EMP-18",
    "canon": "Matching — classement, run & explication",
    "criticality": "P1",
    "archetype": "Classement explicable",
    "screenCodes": [
      "EMP-18",
      "EMP-19"
    ],
    "routes": [
      "/client/missions/:id/matching",
      "/client/missions/:id/matching/explication"
    ],
    "zoneKinds": [
      "cta",
      "kpi",
      "list",
      "ring",
      "table"
    ],
    "componentRefs": [
      "Badge",
      "Barres",
      "C-10",
      "Histogramme",
      "Matrice",
      "Raison",
      "Traçabilité"
    ],
    "stateNames": [
      "Run terminé",
      "Run en cours",
      "Run échoué",
      "Vivier pauvre",
      "Comparaison 1 candidat",
      "Comparaison 3 candidats",
      "Règles modifiées",
      "Données manquantes"
    ],
    "tokens": [
      "--glass-1",
      "--glass-2",
      "--gold-500",
      "--mono",
      "--slate-500",
      "--surface-1",
      "--table",
      "--violet-500"
    ],
    "designApi": [
      "GET /v1/missions/:id/matches",
      "POST /v1/missions/:id/matching/runs",
      "GET /v1/matching/runs/:runId",
      "GET /v1/matching/runs/:runId/explain?providers=:a,:b,:c",
      "GET /v1/matching/rulesets/v7",
      "POST /v1/matching/feedback"
    ]
  },
  {
    "id": "EMP-21",
    "canon": "Sélection & proposition (émission et suivi)",
    "criticality": "P0",
    "archetype": "Engagement imminent",
    "screenCodes": [
      "EMP-21",
      "EMP-22"
    ],
    "routes": [
      "/client/missions/:id/selection",
      "/client/missions/:id/selection/confirmee"
    ],
    "zoneKinds": [
      "cta",
      "hero",
      "kpi",
      "list",
      "price",
      "timeline",
      "verdict"
    ],
    "componentRefs": [
      "Alerte",
      "Bandeau",
      "C-04",
      "C-05",
      "C-06",
      "Case",
      "Récapitulatif"
    ],
    "stateNames": [
      "Prêt",
      "Pièce expirée",
      "Prix négocié",
      "Conflit de disponibilité",
      "Envoyée",
      "Vue par le candidat",
      "Refusée",
      "Expirée"
    ],
    "tokens": [
      "--amber-500",
      "--display-2",
      "--emerald-500",
      "--glass-1",
      "--glass-2",
      "--gold-500",
      "--grad-gold",
      "--mono"
    ],
    "designApi": [
      "POST /v1/missions/:id/select {applicationId}",
      "GET /v1/missions/:id/engagement-summary",
      "POST /v1/applications/:id/decline",
      "GET /v1/propositions/:id",
      "POST /v1/propositions/:id/withdraw",
      "GET /v1/propositions/:id/status"
    ]
  },
  {
    "id": "EMP-23",
    "canon": "Propositions — registre & expirations",
    "criticality": "P1",
    "archetype": "Registre des propositions",
    "screenCodes": [
      "EMP-23",
      "EMP-26"
    ],
    "routes": [
      "/client/propositions",
      "/client/propositions/expirees"
    ],
    "zoneKinds": [
      "chips",
      "cta",
      "kpi",
      "list"
    ],
    "componentRefs": [
      "Badge",
      "Bouton",
      "Carte",
      "Compte"
    ],
    "stateNames": [
      "Vide",
      "Contre-proposition",
      "Expirée",
      "Acceptée",
      "Aucune",
      "Relançable",
      "Définitif"
    ],
    "tokens": [
      "--amber-500",
      "--gold-500",
      "--mono",
      "--slate-500",
      "--surface-1",
      "--text-lo"
    ],
    "designApi": [
      "GET /v1/propositions?segment=",
      "POST /v1/propositions/:id/relaunch",
      "GET /v1/propositions?state=expired",
      "POST /v1/propositions/:id/relaunch"
    ]
  },
  {
    "id": "EMP-24",
    "canon": "Proposition — négociation, acceptation, retrait",
    "criticality": "P0",
    "archetype": "Table de négociation",
    "screenCodes": [
      "EMP-24",
      "EMP-25",
      "EMP-27",
      "EMP-28"
    ],
    "routes": [
      "/client/propositions/:id",
      "/client/propositions/:id/contre",
      "/client/propositions/acceptees",
      "/client/propositions/:id/retrait"
    ],
    "zoneKinds": [
      "chat",
      "cta",
      "form",
      "hero",
      "kpi",
      "list",
      "price",
      "timeline",
      "verdict"
    ],
    "componentRefs": [
      "Avertissement",
      "Bandeau",
      "Carte",
      "Compte",
      "Diff",
      "Fil",
      "Formulaire",
      "Hiérarchie",
      "Radios",
      "Sceau",
      "Texte",
      "Triplet"
    ],
    "stateNames": [
      "Lecture",
      "Négociation en cours",
      "Limite de tours",
      "Acceptée",
      "Non lue",
      "Lue",
      "Expirée",
      "Refusée",
      "Prête",
      "Génération en cours",
      "Erreur de génération",
      "Déjà générée",
      "Ouverture",
      "Traitée",
      "Déjà acceptée"
    ],
    "tokens": [
      "--clay-500",
      "--emerald-500",
      "--glass-1",
      "--glass-2",
      "--glass-3",
      "--gold-500",
      "--mono",
      "--slate-500",
      "--surface-1",
      "--surface-3"
    ],
    "designApi": [
      "GET /v1/propositions/:id/thread",
      "POST /v1/propositions/:id/messages",
      "POST /v1/propositions/:id/counter",
      "POST /v1/propositions/:id/accept",
      "GET /v1/propositions/:id",
      "POST /v1/propositions/:id/withdraw",
      "GET /v1/propositions?state=accepted",
      "POST /v1/contracts {propositionId}",
      "POST /v1/propositions/:id/withdraw {reason}",
      "GET /v1/client/reputation/client-stats"
    ]
  },
  {
    "id": "EMP-29",
    "canon": "Contrat — folio & états",
    "criticality": "P0",
    "archetype": "Folio du contrat",
    "screenCodes": [
      "EMP-29",
      "EMP-32",
      "EMP-33",
      "EMP-34",
      "EMP-35"
    ],
    "routes": [
      "/client/contrats/:id",
      "/client/contrats/:id/actif",
      "/client/contrats/:id/termine",
      "/client/contrats/:id/resilie",
      "/client/contrats/:id/remplace"
    ],
    "zoneKinds": [
      "cta",
      "doc",
      "hero",
      "kpi",
      "list",
      "price",
      "sign",
      "timeline",
      "verdict"
    ],
    "componentRefs": [
      "Badge",
      "Bloc",
      "C-04",
      "C-05",
      "C-06",
      "C-08",
      "C-11",
      "Carte",
      "Historique",
      "Reprise",
      "Sceau",
      "Table",
      "Tableau"
    ],
    "stateNames": [
      "Brouillon",
      "En signature",
      "Actif",
      "Terminé",
      "Résilié",
      "Remplacé",
      "Actif sain",
      "Échéance à 48 h",
      "Retard client",
      "Suspendu (litige)",
      "Terminé propre",
      "Terminé avec réserve",
      "Terminé après litige",
      "Évaluation en attente",
      "Résiliation amiable",
      "Résiliation avec litige",
      "Résiliation pour faute",
      "Annulée",
      "Succession en cours",
      "Succession achevée",
      "Succession contestée"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--emerald-500",
      "--glass-1",
      "--gold-500",
      "--mono",
      "--slate-500",
      "--surface-2"
    ],
    "designApi": [
      "GET /v1/contracts/:id",
      "GET /v1/contracts/:id/versions",
      "GET /v1/contracts/:id/report.pdf",
      "POST /v1/contracts/:id/sign",
      "GET /v1/contracts/:id/state",
      "GET /v1/contracts/:id/obligations",
      "GET /v1/contracts/:id/closure",
      "POST /v1/reviews {contractId}",
      "GET /v1/contracts/:id/termination",
      "POST /v1/contracts/:id/termination/oppose",
      "POST /v1/payments/:id/pay",
      "GET /v1/contracts/:id/succession",
      "GET /v1/contracts/:id/successor"
    ]
  },
  {
    "id": "EMP-30",
    "canon": "Contrat — versions & révisions",
    "criticality": "P1",
    "archetype": "Révision tracée",
    "screenCodes": [
      "EMP-30",
      "EMP-36"
    ],
    "routes": [
      "/client/contrats/:id/versions/:v",
      "/client/contrats/:id/historique"
    ],
    "zoneKinds": [
      "cta",
      "doc",
      "hero",
      "list",
      "table"
    ],
    "componentRefs": [
      "Badge",
      "C-11",
      "Export",
      "Horodatage",
      "Ligne",
      "Vue"
    ],
    "stateNames": [
      "Lecture",
      "Révision acceptée",
      "Révision refusée",
      "Révision unilatérale interdite",
      "Une seule version",
      "Versions multiples",
      "Version rejetée"
    ],
    "tokens": [
      "--clay-500",
      "--emerald-500",
      "--gold-500",
      "--mono",
      "--slate-500",
      "--text-mid"
    ],
    "designApi": [
      "GET /v1/contracts/:id/versions/:v/diff?from=:v0",
      "POST /v1/contracts/:id/versions/:v/accept",
      "POST /v1/contracts/:id/versions/:v/reject",
      "GET /v1/contracts/:id/versions?include=rejected",
      "GET /v1/contracts/:id/versions/export"
    ]
  },
  {
    "id": "EMP-31",
    "canon": "Contrat — signature",
    "criticality": "P0",
    "archetype": "Cérémonie de signature",
    "screenCodes": [
      "EMP-31"
    ],
    "routes": [
      "/client/contrats/:id/signer"
    ],
    "zoneKinds": [
      "cta",
      "doc",
      "kpi",
      "sign"
    ],
    "componentRefs": [
      "C-07",
      "Horodatage",
      "Pad",
      "Phrase"
    ],
    "stateNames": [
      "Lecture",
      "Signature en cours",
      "OTP",
      "Signé",
      "Échec"
    ],
    "tokens": [
      "--emerald-500",
      "--glass-4",
      "--gold-500",
      "--grad-gold",
      "--mono"
    ],
    "designApi": [
      "POST /v1/contracts/:id/sign {method, consent, signatureArtifact}",
      "GET /v1/contracts/:id/required-consents"
    ]
  },
  {
    "id": "EMP-37",
    "canon": "Exécution — suivi & validation client",
    "criticality": "P0",
    "archetype": "Poste de contrôle",
    "screenCodes": [
      "EMP-37",
      "EMP-38"
    ],
    "routes": [
      "/client/missions/:id/execution",
      "/client/evidence/:id"
    ],
    "zoneKinds": [
      "cta",
      "doc",
      "kpi",
      "list",
      "timeline"
    ],
    "componentRefs": [
      "Bandeau",
      "C-06",
      "Carte",
      "Checklist",
      "Fil",
      "Historique",
      "Indicateur",
      "Visionneuse"
    ],
    "stateNames": [
      "À l'heure",
      "Retard mineur (< 2 j)",
      "Retard significatif",
      "Preuve refusée",
      "Conforme",
      "Non conforme",
      "Pièce illisible",
      "Déjà validée"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--emerald-500",
      "--glass-4",
      "--gold-500",
      "--mono",
      "--surface-1"
    ],
    "designApi": [
      "GET /v1/missions/:id/execution",
      "POST /v1/evidence/:id/approve",
      "POST /v1/evidence/:id/reject {reason}",
      "GET /v1/missions/:id/thread",
      "GET /v1/evidence/:id",
      "POST /v1/evidence/:id/approve",
      "POST /v1/evidence/:id/reject",
      "GET /v1/evidence/:id/versions"
    ]
  },
  {
    "id": "EMP-39",
    "canon": "Litige client — ouverture",
    "criticality": "P0",
    "archetype": "Acte de conflit",
    "screenCodes": [
      "EMP-39"
    ],
    "routes": [
      "/client/missions/:id/litige/nouveau"
    ],
    "zoneKinds": [
      "cta",
      "form",
      "kpi",
      "list"
    ],
    "componentRefs": [
      "Bandeau",
      "Radios",
      "Sélecteur",
      "Éditeur"
    ],
    "stateNames": [
      "Ouverture",
      "Résolution amiable proposée",
      "Litige mineur",
      "Ouvert"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--clay-600",
      "--glass-4",
      "--mono"
    ],
    "designApi": [
      "POST /v1/missions/:id/disputes {category, facts, evidenceIds}",
      "GET /v1/disputes/templates?category="
    ]
  },
  {
    "id": "EMP-40",
    "canon": "Litige client — suivi",
    "criticality": "P0",
    "archetype": "Fil de médiation",
    "screenCodes": [
      "EMP-40"
    ],
    "routes": [
      "/client/missions/:id/litige"
    ],
    "zoneKinds": [
      "chat",
      "cta",
      "price",
      "timeline"
    ],
    "componentRefs": [
      "Bandeau",
      "C-06",
      "C-13",
      "Carte"
    ],
    "stateNames": [
      "Attente réponse",
      "Réponse reçue",
      "Médiation",
      "Décision rendue",
      "Clôturé"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--emerald-500",
      "--glass-2",
      "--mono"
    ],
    "designApi": [
      "GET /v1/disputes/:id",
      "POST /v1/disputes/:id/messages",
      "POST /v1/disputes/:id/resolution/accept",
      "POST /v1/disputes/:id/revision"
    ]
  },
  {
    "id": "EMP-41",
    "canon": "Paiements client — échéances & échéancier",
    "criticality": "P0",
    "archetype": "Calendrier de l'argent",
    "screenCodes": [
      "EMP-41",
      "EMP-42",
      "EMP-47"
    ],
    "routes": [
      "/client/paiements",
      "/client/paiements/:id",
      "/client/paiements/plan"
    ],
    "zoneKinds": [
      "cta",
      "doc",
      "form",
      "kpi",
      "list",
      "price",
      "timeline"
    ],
    "componentRefs": [
      "Badge",
      "C-05",
      "Carte",
      "Contrôle",
      "Facture",
      "Ligne",
      "Lignes",
      "Modèles",
      "Rappels"
    ],
    "stateNames": [
      "À jour",
      "Due aujourd'hui",
      "En retard",
      "Gelée",
      "Payée",
      "À venir",
      "Due",
      "Payée",
      "Contestée",
      "Équilibré",
      "Déséquilibré",
      "Échéance passée",
      "Après signature"
    ],
    "tokens": [
      "--clay-500",
      "--display-1",
      "--emerald-500",
      "--glass-2",
      "--gold-500",
      "--mono",
      "--price"
    ],
    "designApi": [
      "GET /v1/payments/schedules?role=client",
      "POST /v1/payments/:id/pay",
      "GET /v1/payments/:id/breakdown",
      "GET /v1/payments/:id",
      "POST /v1/payments/:id/pay",
      "GET /v1/payments/:id/invoice.pdf",
      "PUT /v1/contracts/:id/payment-plan",
      "POST /v1/contracts/:id/payment-plan/amendment",
      "GET /v1/payment-plans/templates"
    ]
  },
  {
    "id": "EMP-43",
    "canon": "Paiement externe — déclaration & vérification",
    "criticality": "P0",
    "archetype": "Déclaration sous serment",
    "screenCodes": [
      "EMP-43",
      "EMP-44"
    ],
    "routes": [
      "/client/paiements/declaration",
      "/client/paiements/declarations/:id/verification"
    ],
    "zoneKinds": [
      "cta",
      "form",
      "kpi",
      "list",
      "table",
      "timeline"
    ],
    "componentRefs": [
      "Avertissement",
      "Bloc",
      "Bouton",
      "C-06",
      "Champ",
      "Tableau",
      "Téléverseur"
    ],
    "stateNames": [
      "Brouillon",
      "Soumise",
      "Confirmée",
      "Contestée",
      "Non confirmée à 72 h",
      "En attente",
      "Confirmée",
      "Contestée",
      "Rapprochée"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--emerald-500",
      "--glass-3",
      "--gold-500",
      "--mono"
    ],
    "designApi": [
      "POST /v1/payments/external-declarations",
      "GET /v1/payments/external-declarations/:id",
      "POST /v1/payments/external-declarations/:id/confirm",
      "GET /v1/payments/external-declarations/:id/verification",
      "POST /v1/payments/external-declarations/:id/relaunch"
    ]
  },
  {
    "id": "EMP-45",
    "canon": "Paiements — historique & export",
    "criticality": "P1",
    "archetype": "Comptabilité lisible",
    "screenCodes": [
      "EMP-45",
      "EMP-46"
    ],
    "routes": [
      "/client/paiements/historique",
      "/client/paiements/:id/recu"
    ],
    "zoneKinds": [
      "chips",
      "cta",
      "doc",
      "kpi",
      "sign",
      "table"
    ],
    "componentRefs": [
      "Badge",
      "C-12",
      "Document",
      "Empreinte",
      "Export",
      "QR",
      "Table"
    ],
    "stateNames": [
      "Vide",
      "Chargé",
      "Retard",
      "Export en cours",
      "Émis",
      "Remboursé",
      "Annulé"
    ],
    "tokens": [
      "--clay-500",
      "--emerald-500",
      "--glass-1",
      "--gold-500",
      "--mono",
      "--surface-1",
      "--table"
    ],
    "designApi": [
      "GET /v1/payments?role=client&cursor=&from=&to=",
      "GET /v1/payments/export.csv",
      "GET /v1/payments/summary",
      "GET /v1/payments/:id/receipt.pdf",
      "GET /v1/verify/:token (public)"
    ]
  },
  {
    "id": "EMP-48",
    "canon": "Paiement — contestation",
    "criticality": "P0",
    "archetype": "Contestation financière",
    "screenCodes": [
      "EMP-48"
    ],
    "routes": [
      "/client/paiements/:id/litige"
    ],
    "zoneKinds": [
      "cta",
      "form",
      "kpi",
      "price"
    ],
    "componentRefs": [
      "Bloc",
      "Encart",
      "Radios"
    ],
    "stateNames": [
      "Erreur réelle",
      "Désaccord",
      "Contestation abusive",
      "Résolue"
    ],
    "tokens": [
      "--clay-500",
      "--emerald-500",
      "--gold-500",
      "--mono"
    ],
    "designApi": [
      "POST /v1/payments/:id/disputes {nature, facts}",
      "GET /v1/payments/:id/recalculation"
    ]
  },
  {
    "id": "EMP-49",
    "canon": "Litige — fiche, pièces & résolution",
    "criticality": "P0",
    "archetype": "Dossier contradictoire",
    "screenCodes": [
      "EMP-49",
      "EMP-50",
      "EMP-51"
    ],
    "routes": [
      "/client/litiges/:id",
      "/client/litiges/:id/preuves",
      "/client/litiges/:id/resolution"
    ],
    "zoneKinds": [
      "chat",
      "cta",
      "hero",
      "kpi",
      "list",
      "price",
      "table"
    ],
    "componentRefs": [
      "Bandeau",
      "C-11",
      "C-13",
      "Carte",
      "Checklist",
      "Détecteur",
      "Export",
      "Galerie",
      "Table",
      "Verdict",
      "Échéancier"
    ],
    "stateNames": [
      "Instruction",
      "Médiation proposée",
      "Décision imminente",
      "Recours",
      "Clos",
      "Équilibré",
      "Déséquilibré",
      "Contradiction",
      "Lot exporté",
      "Proposée",
      "Acceptée par vous",
      "Acceptée par les deux",
      "Refusée",
      "Expirée"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--emerald-500",
      "--glass-1",
      "--glass-2",
      "--glass-3",
      "--gold-500",
      "--mono",
      "--text-mid"
    ],
    "designApi": [
      "GET /v1/disputes/:id/full",
      "POST /v1/disputes/:id/evidence",
      "POST /v1/disputes/:id/messages",
      "GET /v1/disputes/:id/deadlines",
      "GET /v1/disputes/:id/evidence",
      "GET /v1/disputes/:id/evidence/export.zip",
      "POST /v1/disputes/:id/evidence",
      "GET /v1/disputes/:id/resolutions",
      "POST /v1/disputes/:id/resolutions/:rid/accept",
      "POST /v1/disputes/:id/resolutions/:rid/refuse"
    ]
  },
  {
    "id": "EMP-52",
    "canon": "Litige — décision, escalade & clôture",
    "criticality": "P1",
    "archetype": "Appel à l'humain",
    "screenCodes": [
      "EMP-52",
      "EMP-53",
      "EMP-54",
      "EMP-55"
    ],
    "routes": [
      "/client/litiges/:id/escalade",
      "/client/litiges/:id/attente",
      "/client/litiges/:id/decision",
      "/client/litiges/:id/cloture"
    ],
    "zoneKinds": [
      "cta",
      "doc",
      "form",
      "kpi",
      "list",
      "price",
      "table",
      "timeline",
      "verdict"
    ],
    "componentRefs": [
      "Archive",
      "Argumentaire",
      "Bandeau",
      "C-06",
      "Cartes",
      "Checklist",
      "Compteur",
      "Liens",
      "Table",
      "Texte"
    ],
    "stateNames": [
      "En instruction",
      "Pièce demandée",
      "Décision rendue",
      "Retirée par le client",
      "Dans les délais",
      "Retard de la modération",
      "Pièce supplémentaire demandée",
      "Décision imminente",
      "Favorable",
      "Partage",
      "Rejet",
      "Révision demandée",
      "Clos normalement",
      "Clos avec révision",
      "Clos, réputation impactée",
      "Réouverture impossible"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--emerald-500",
      "--glass-1",
      "--gold-500",
      "--mono",
      "--slate-500",
      "--surface-1",
      "--surface-2",
      "--violet-500"
    ],
    "designApi": [
      "POST /v1/disputes/:id/escalate",
      "GET /v1/disputes/:id/moderation-queue",
      "GET /v1/moderation/criteria (public)",
      "GET /v1/disputes/:id/instruction",
      "GET /v1/disputes/:id/sla",
      "GET /v1/disputes/:id/decision",
      "GET /v1/disputes/:id/decision.pdf",
      "POST /v1/disputes/:id/revision",
      "GET /v1/disputes/:id/closure",
      "GET /v1/disputes/:id/archive.zip"
    ]
  },
  {
    "id": "EMP-56",
    "canon": "Remplacement — déclenchement",
    "criticality": "P0",
    "archetype": "Reconstruire vite",
    "screenCodes": [
      "EMP-56",
      "EMP-57"
    ],
    "routes": [
      "/client/missions/:id/remplacement",
      "/client/missions/:id/remplacement/conditions"
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
      "Bilan",
      "Bloc",
      "C-11",
      "Carte",
      "Liens",
      "Tableau"
    ],
    "stateNames": [
      "Déclenché par le prestataire",
      "Déclenché par accord mutuel",
      "Déclenché par défaillance",
      "Force majeure",
      "Informative",
      "Contestée",
      "Validée",
      "Amiable"
    ],
    "tokens": [
      "--clay-500",
      "--emerald-500",
      "--glass-1",
      "--gold-500",
      "--mono"
    ],
    "designApi": [
      "POST /v1/missions/:id/replacement {reason}",
      "GET /v1/missions/:id/handover",
      "GET /v1/missions/:id/replacement/terms",
      "POST /v1/missions/:id/replacement/acknowledge"
    ]
  },
  {
    "id": "EMP-58",
    "canon": "Remplacement — sélection",
    "criticality": "P0",
    "archetype": "Vivier d'urgence",
    "screenCodes": [
      "EMP-58"
    ],
    "routes": [
      "/client/missions/:id/remplacement/selection"
    ],
    "zoneKinds": [
      "cta",
      "kpi",
      "list",
      "ring"
    ],
    "componentRefs": [
      "Badge",
      "Bandeau",
      "C-10"
    ],
    "stateNames": [
      "Vivier disponible",
      "Vivier pauvre",
      "Aucun candidat",
      "Reprise proposée"
    ],
    "tokens": [
      "--clay-500",
      "--gold-500",
      "--mono",
      "--violet-500"
    ],
    "designApi": [
      "POST /v1/missions/:id/replacement/matching",
      "GET /v1/missions/:id/replacement/candidates",
      "POST /v1/missions/:id/replacement/propose"
    ]
  },
  {
    "id": "EMP-59",
    "canon": "Remplacement — bascule",
    "criticality": "P1",
    "archetype": "Bascule scellée",
    "screenCodes": [
      "EMP-59",
      "EMP-60"
    ],
    "routes": [
      "/client/missions/:id/remplacement/confirmation",
      "/client/contrats/:id/successeur"
    ],
    "zoneKinds": [
      "cta",
      "doc",
      "hero",
      "price",
      "table",
      "timeline",
      "verdict"
    ],
    "componentRefs": [
      "Bloc",
      "C-05",
      "Carte",
      "Dossier",
      "Table"
    ],
    "stateNames": [
      "Prête",
      "Signature en attente",
      "Signée",
      "Échec de reprise",
      "En signature",
      "Actif",
      "Terminé",
      "Résilié"
    ],
    "tokens": [
      "--emerald-500",
      "--gold-500",
      "--mono",
      "--slate-500"
    ],
    "designApi": [
      "POST /v1/contracts/replacement {missionId, providerId}",
      "GET /v1/missions/:id/handover-dossier",
      "GET /v1/contracts/:id (successor)",
      "POST /v1/contracts/:id/sign",
      "GET /v1/contracts/:id/succession-chain"
    ]
  }
] as const;

export const EMPLOYER_DESIGN_SCREENS = [
  {
    "code": "EMP-01",
    "unitId": "Dashboard client",
    "route": "/client",
    "canonicalRoute": "/client",
    "role": "EMPLOYER",
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
      "GET /v1/client/dashboard",
      "GET /v1/missions?status=active&limit=8",
      "GET /v1/payments/upcoming"
    ],
    "tokens": [
      "--surface-0",
      "--gold-500",
      "--display-1",
      "--price",
      "--glass-2",
      "--amber-500"
    ]
  },
  {
    "code": "EMP-02",
    "unitId": "Notifications (flux)",
    "route": "/client/notifications",
    "canonicalRoute": "/client/notifications",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "chips",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/notifications?filter=all",
      "POST /v1/notifications/read",
      "GET /v1/notifications/stream (SSE)"
    ],
    "tokens": [
      "--surface-1",
      "--stroke-sub",
      "--gold-500",
      "--emerald-500",
      "--clay-500"
    ]
  },
  {
    "code": "EMP-03",
    "unitId": "Profil client",
    "route": "/client/profil",
    "canonicalRoute": "/client/profil",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "hero",
      "kpi",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/client/profile",
      "PATCH /v1/client/profile",
      "GET /v1/client/profile/public-preview"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--surface-2",
      "--text-mid",
      "--squircle-28"
    ]
  },
  {
    "code": "EMP-04",
    "unitId": "Paramètres (client)",
    "route": "/client/parametres",
    "canonicalRoute": "/client/parametres",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "list",
      "form",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET/PATCH /v1/client/settings",
      "POST /v1/account/suspend",
      "DELETE /v1/account (soft)",
      "GET /v1/sessions"
    ],
    "tokens": [
      "--surface-2",
      "--emerald-500",
      "--clay-500",
      "--stroke-mid",
      "--text-lo"
    ]
  },
  {
    "code": "EMP-05",
    "unitId": "Missions — registre client",
    "route": "/client/missions",
    "canonicalRoute": "/client/missions",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "chips",
      "list",
      "table"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/missions?segment=&q=&cursor=",
      "GET /v1/missions/counters"
    ],
    "tokens": [
      "--surface-1",
      "--gold-500",
      "--clay-500",
      "--text-lo",
      "--squircle-22"
    ]
  },
  {
    "code": "EMP-06",
    "unitId": "Création de mission — wizard (4 étapes)",
    "route": "/client/missions/nouvelle/1",
    "canonicalRoute": "/client/missions/nouvelle/1",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "chips",
      "form",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/missions/draft",
      "PATCH /v1/missions/draft/:id/step1",
      "GET /v1/catalog/categories"
    ],
    "tokens": [
      "--gold-500",
      "--amber-500",
      "--surface-2",
      "--mono",
      "--caps"
    ]
  },
  {
    "code": "EMP-07",
    "unitId": "Création de mission — wizard (4 étapes)",
    "route": "/client/missions/nouvelle/2",
    "canonicalRoute": "/client/missions/nouvelle/2",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "chips",
      "form",
      "kpi",
      "cta"
    ],
    "variantOf": "EMP-06",
    "designApi": [
      "PATCH /v1/missions/draft/:id/step2",
      "GET /v1/geo/autocomplete",
      "GET /v1/geo/coverage"
    ],
    "tokens": [
      "--gold-500",
      "--amber-500",
      "--surface-2",
      "--emerald-500"
    ]
  },
  {
    "code": "EMP-08",
    "unitId": "Création de mission — wizard (4 étapes)",
    "route": "/client/missions/nouvelle/3",
    "canonicalRoute": "/client/missions/nouvelle/3",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "chips",
      "form",
      "list",
      "cta"
    ],
    "variantOf": "EMP-06",
    "designApi": [
      "PATCH /v1/missions/draft/:id/step3",
      "GET /v1/catalog/skills?q=",
      "GET /v1/catalog/evidence-types"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--surface-2",
      "--squircle-14",
      "--amber-500"
    ]
  },
  {
    "code": "EMP-09",
    "unitId": "Création de mission — wizard (4 étapes)",
    "route": "/client/missions/nouvelle/4",
    "canonicalRoute": "/client/missions/nouvelle/4",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "chips",
      "form",
      "price",
      "kpi",
      "cta"
    ],
    "variantOf": "EMP-06",
    "designApi": [
      "PATCH /v1/missions/draft/:id/step4",
      "POST /v1/pricing/quote",
      "GET /v1/pricing/benchmark?category="
    ],
    "tokens": [
      "--gold-500",
      "--price",
      "--display-1",
      "--amber-500",
      "--grad-gold"
    ]
  },
  {
    "code": "EMP-10",
    "unitId": "Qualification juridique (verdict)",
    "route": "/client/missions/:id/qualification",
    "canonicalRoute": "/client/missions/:id/qualification",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "verdict",
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/missions/:id/qualify",
      "GET /v1/missions/:id/qualification",
      "POST /v1/missions/:id/review-request"
    ],
    "tokens": [
      "--emerald-500",
      "--amber-500",
      "--clay-500",
      "--grad-emerald",
      "--display-2"
    ]
  },
  {
    "code": "EMP-11",
    "unitId": "Tarification FIN (client)",
    "route": "/client/missions/:id/tarification",
    "canonicalRoute": "/client/missions/:id/tarification",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "price",
      "list",
      "timeline",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/missions/:id/pricing",
      "POST /v1/missions/:id/pricing/simulate",
      "POST /v1/missions/:id/pricing/validate"
    ],
    "tokens": [
      "--display-1",
      "--price",
      "--gold-500",
      "--gold-300",
      "--mono",
      "--text-hi"
    ]
  },
  {
    "code": "EMP-12",
    "unitId": "Aperçu & confirmation de publication",
    "route": "/client/missions/:id/apercu",
    "canonicalRoute": "/client/missions/:id/apercu",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "price",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/missions/:id/preview",
      "GET /v1/missions/:id/public-render",
      "POST /v1/missions/:id/publish"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--surface-3",
      "--glass-2",
      "--caps"
    ]
  },
  {
    "code": "EMP-13",
    "unitId": "Aperçu & confirmation de publication",
    "route": "/client/missions/:id/publiee",
    "canonicalRoute": "/client/missions/:id/publiee",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "verdict",
      "kpi",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/missions/:id/publish (idempotent)",
      "GET /v1/missions/:id/matches?limit=2",
      "POST /v1/missions/:id/share-link"
    ],
    "tokens": [
      "--emerald-500",
      "--grad-emerald",
      "--gold-500",
      "--surface-2",
      "--mono"
    ]
  },
  {
    "code": "EMP-14",
    "unitId": "Mission — fiche dossier (client)",
    "route": "/client/missions/:id",
    "canonicalRoute": "/client/missions/:id",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "timeline",
      "list",
      "table",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/missions/:id",
      "GET /v1/missions/:id/timeline",
      "GET /v1/missions/:id/report.pdf",
      "POST /v1/missions/:id/dispute"
    ],
    "tokens": [
      "--surface-1",
      "--gold-500",
      "--emerald-500",
      "--clay-500",
      "--mono"
    ]
  },
  {
    "code": "EMP-15",
    "unitId": "Mission — édition & avenants",
    "route": "/client/missions/:id/modifier",
    "canonicalRoute": "/client/missions/:id/modifier",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "list",
      "form",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "PATCH /v1/missions/:id",
      "POST /v1/missions/:id/amendments",
      "GET /v1/missions/:id/diff"
    ],
    "tokens": [
      "--amber-500",
      "--gold-500",
      "--surface-2",
      "--mono",
      "--slate-500"
    ]
  },
  {
    "code": "EMP-16",
    "unitId": "Candidatures — file client & filtres",
    "route": "/client/missions/:id/candidatures",
    "canonicalRoute": "/client/missions/:id/candidatures",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "chips",
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/missions/:id/applications?sort=&segment=",
      "POST /v1/applications/:id/shortlist",
      "POST /v1/applications/:id/dismiss"
    ],
    "tokens": [
      "--surface-1",
      "--gold-500",
      "--emerald-500",
      "--text-mid",
      "--squircle-22"
    ]
  },
  {
    "code": "EMP-17",
    "unitId": "Profil candidat (vue client)",
    "route": "/client/candidats/:id",
    "canonicalRoute": "/client/candidats/:id",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "kpi",
      "ring",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/providers/:id/public-profile",
      "GET /v1/providers/:id/match-breakdown?mission=:mid",
      "POST /v1/applications/:id/questions"
    ],
    "tokens": [
      "--emerald-500",
      "--gold-500",
      "--surface-2",
      "--glass-2",
      "--mono"
    ]
  },
  {
    "code": "EMP-18",
    "unitId": "Matching — classement, run & explication",
    "route": "/client/missions/:id/matching",
    "canonicalRoute": "/client/missions/:id/matching",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "ring",
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/missions/:id/matches",
      "POST /v1/missions/:id/matching/runs",
      "GET /v1/matching/runs/:runId"
    ],
    "tokens": [
      "--violet-500",
      "--gold-500",
      "--surface-1",
      "--mono",
      "--glass-1"
    ]
  },
  {
    "code": "EMP-19",
    "unitId": "Matching — classement, run & explication",
    "route": "/client/missions/:id/matching/explication",
    "canonicalRoute": "/client/missions/:id/matching/explication",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "ring",
      "table",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/matching/runs/:runId/explain?providers=:a,:b,:c",
      "GET /v1/matching/rulesets/v7",
      "POST /v1/matching/feedback"
    ],
    "tokens": [
      "--violet-500",
      "--gold-500",
      "--slate-500",
      "--mono",
      "--glass-2",
      "--table"
    ]
  },
  {
    "code": "EMP-20",
    "unitId": "Candidatures — file client & filtres",
    "route": "/client/missions/:id/filtres",
    "canonicalRoute": "/client/missions/:id/filtres",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "form",
      "kpi",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/missions/:id/applications/search",
      "GET /v1/filters/presets",
      "POST /v1/filters/presets"
    ],
    "tokens": [
      "--surface-3",
      "--gold-500",
      "--clay-500",
      "--amber-500",
      "--squircle-14"
    ]
  },
  {
    "code": "EMP-21",
    "unitId": "Sélection & proposition (émission et suivi)",
    "route": "/client/missions/:id/selection",
    "canonicalRoute": "/client/missions/:id/selection",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "list",
      "price",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/missions/:id/select {applicationId}",
      "GET /v1/missions/:id/engagement-summary",
      "POST /v1/applications/:id/decline"
    ],
    "tokens": [
      "--gold-500",
      "--amber-500",
      "--emerald-500",
      "--display-2",
      "--glass-2"
    ]
  },
  {
    "code": "EMP-22",
    "unitId": "Sélection & proposition (émission et suivi)",
    "route": "/client/missions/:id/selection/confirmee",
    "canonicalRoute": "/client/missions/:id/selection/confirmee",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "verdict",
      "timeline",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/propositions/:id",
      "POST /v1/propositions/:id/withdraw",
      "GET /v1/propositions/:id/status"
    ],
    "tokens": [
      "--gold-500",
      "--grad-gold",
      "--emerald-500",
      "--mono",
      "--glass-1"
    ]
  },
  {
    "code": "EMP-23",
    "unitId": "Propositions — registre & expirations",
    "route": "/client/propositions",
    "canonicalRoute": "/client/propositions",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "chips",
      "list",
      "kpi"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/propositions?segment=",
      "POST /v1/propositions/:id/relaunch"
    ],
    "tokens": [
      "--surface-1",
      "--gold-500",
      "--mono",
      "--amber-500"
    ]
  },
  {
    "code": "EMP-24",
    "unitId": "Proposition — négociation, acceptation, retrait",
    "route": "/client/propositions/:id",
    "canonicalRoute": "/client/propositions/:id",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "price",
      "chat",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/propositions/:id/thread",
      "POST /v1/propositions/:id/messages",
      "POST /v1/propositions/:id/counter",
      "POST /v1/propositions/:id/accept"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--clay-500",
      "--mono",
      "--glass-2"
    ]
  },
  {
    "code": "EMP-25",
    "unitId": "Proposition — négociation, acceptation, retrait",
    "route": "/client/propositions/:id/contre",
    "canonicalRoute": "/client/propositions/:id/contre",
    "role": "EMPLOYER",
    "criticality": "P2",
    "zoneKinds": [
      "verdict",
      "timeline",
      "kpi",
      "cta"
    ],
    "variantOf": "EMP-24",
    "designApi": [
      "GET /v1/propositions/:id",
      "POST /v1/propositions/:id/withdraw"
    ],
    "tokens": [
      "--gold-500",
      "--mono",
      "--surface-1"
    ]
  },
  {
    "code": "EMP-26",
    "unitId": "Propositions — registre & expirations",
    "route": "/client/propositions/expirees",
    "canonicalRoute": "/client/propositions/expirees",
    "role": "EMPLOYER",
    "criticality": "P2",
    "zoneKinds": [
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/propositions?state=expired",
      "POST /v1/propositions/:id/relaunch"
    ],
    "tokens": [
      "--slate-500",
      "--gold-500",
      "--text-lo"
    ]
  },
  {
    "code": "EMP-27",
    "unitId": "Proposition — négociation, acceptation, retrait",
    "route": "/client/propositions/acceptees",
    "canonicalRoute": "/client/propositions/acceptees",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "verdict",
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/propositions?state=accepted",
      "POST /v1/contracts {propositionId}"
    ],
    "tokens": [
      "--emerald-500",
      "--gold-500",
      "--mono",
      "--glass-1"
    ]
  },
  {
    "code": "EMP-28",
    "unitId": "Proposition — négociation, acceptation, retrait",
    "route": "/client/propositions/:id/retrait",
    "canonicalRoute": "/client/propositions/:id/retrait",
    "role": "EMPLOYER",
    "criticality": "P2",
    "zoneKinds": [
      "form",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/propositions/:id/withdraw {reason}",
      "GET /v1/client/reputation/client-stats"
    ],
    "tokens": [
      "--clay-500",
      "--slate-500",
      "--surface-3",
      "--glass-3"
    ]
  },
  {
    "code": "EMP-29",
    "unitId": "Contrat — folio & états",
    "route": "/client/contrats/:id",
    "canonicalRoute": "/client/contrats/:id",
    "role": "EMPLOYER",
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
      "GET /v1/contracts/:id",
      "GET /v1/contracts/:id/versions",
      "GET /v1/contracts/:id/report.pdf",
      "POST /v1/contracts/:id/sign"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--clay-500",
      "--mono",
      "--glass-1"
    ]
  },
  {
    "code": "EMP-30",
    "unitId": "Contrat — versions & révisions",
    "route": "/client/contrats/:id/versions/:v",
    "canonicalRoute": "/client/contrats/:id/versions/:v",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "hero",
      "doc",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/contracts/:id/versions/:v/diff?from=:v0",
      "POST /v1/contracts/:id/versions/:v/accept",
      "POST /v1/contracts/:id/versions/:v/reject"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--clay-500",
      "--mono",
      "--text-mid"
    ]
  },
  {
    "code": "EMP-31",
    "unitId": "Contrat — signature",
    "route": "/client/contrats/:id/signer",
    "canonicalRoute": "/client/contrats/:id/signer",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "doc",
      "sign",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/contracts/:id/sign {method, consent, signatureArtifact}",
      "GET /v1/contracts/:id/required-consents"
    ],
    "tokens": [
      "--gold-500",
      "--grad-gold",
      "--emerald-500",
      "--mono",
      "--glass-4"
    ]
  },
  {
    "code": "EMP-32",
    "unitId": "Contrat — folio & états",
    "route": "/client/contrats/:id/actif",
    "canonicalRoute": "/client/contrats/:id/actif",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "hero",
      "timeline",
      "price",
      "cta"
    ],
    "variantOf": "EMP-29",
    "designApi": [
      "GET /v1/contracts/:id/state",
      "GET /v1/contracts/:id/obligations"
    ],
    "tokens": [
      "--gold-500",
      "--amber-500",
      "--clay-500",
      "--mono"
    ]
  },
  {
    "code": "EMP-33",
    "unitId": "Contrat — folio & états",
    "route": "/client/contrats/:id/termine",
    "canonicalRoute": "/client/contrats/:id/termine",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "verdict",
      "kpi",
      "list",
      "cta"
    ],
    "variantOf": "EMP-29",
    "designApi": [
      "GET /v1/contracts/:id/closure",
      "POST /v1/reviews {contractId}"
    ],
    "tokens": [
      "--emerald-500",
      "--gold-500",
      "--mono",
      "--glass-1"
    ]
  },
  {
    "code": "EMP-34",
    "unitId": "Contrat — folio & états",
    "route": "/client/contrats/:id/resilie",
    "canonicalRoute": "/client/contrats/:id/resilie",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "hero",
      "price",
      "timeline",
      "cta"
    ],
    "variantOf": "EMP-29",
    "designApi": [
      "GET /v1/contracts/:id/termination",
      "POST /v1/contracts/:id/termination/oppose",
      "POST /v1/payments/:id/pay"
    ],
    "tokens": [
      "--clay-500",
      "--gold-500",
      "--mono",
      "--slate-500"
    ]
  },
  {
    "code": "EMP-35",
    "unitId": "Contrat — folio & états",
    "route": "/client/contrats/:id/remplace",
    "canonicalRoute": "/client/contrats/:id/remplace",
    "role": "EMPLOYER",
    "criticality": "P2",
    "zoneKinds": [
      "hero",
      "list",
      "price",
      "cta"
    ],
    "variantOf": "EMP-29",
    "designApi": [
      "GET /v1/contracts/:id/succession",
      "GET /v1/contracts/:id/successor"
    ],
    "tokens": [
      "--gold-500",
      "--clay-500",
      "--mono",
      "--surface-2"
    ]
  },
  {
    "code": "EMP-36",
    "unitId": "Contrat — versions & révisions",
    "route": "/client/contrats/:id/historique",
    "canonicalRoute": "/client/contrats/:id/historique",
    "role": "EMPLOYER",
    "criticality": "P2",
    "zoneKinds": [
      "list",
      "table",
      "cta"
    ],
    "variantOf": "EMP-30",
    "designApi": [
      "GET /v1/contracts/:id/versions?include=rejected",
      "GET /v1/contracts/:id/versions/export"
    ],
    "tokens": [
      "--mono",
      "--slate-500",
      "--gold-500",
      "--clay-500"
    ]
  },
  {
    "code": "EMP-37",
    "unitId": "Exécution — suivi & validation client",
    "route": "/client/missions/:id/execution",
    "canonicalRoute": "/client/missions/:id/execution",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "timeline",
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/missions/:id/execution",
      "POST /v1/evidence/:id/approve",
      "POST /v1/evidence/:id/reject {reason}",
      "GET /v1/missions/:id/thread"
    ],
    "tokens": [
      "--emerald-500",
      "--amber-500",
      "--clay-500",
      "--gold-500",
      "--surface-1"
    ]
  },
  {
    "code": "EMP-38",
    "unitId": "Exécution — suivi & validation client",
    "route": "/client/evidence/:id",
    "canonicalRoute": "/client/evidence/:id",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "doc",
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": "EMP-37",
    "designApi": [
      "GET /v1/evidence/:id",
      "POST /v1/evidence/:id/approve",
      "POST /v1/evidence/:id/reject",
      "GET /v1/evidence/:id/versions"
    ],
    "tokens": [
      "--emerald-500",
      "--amber-500",
      "--clay-500",
      "--mono",
      "--glass-4"
    ]
  },
  {
    "code": "EMP-39",
    "unitId": "Litige client — ouverture",
    "route": "/client/missions/:id/litige/nouveau",
    "canonicalRoute": "/client/missions/:id/litige/nouveau",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "form",
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/missions/:id/disputes {category, facts, evidenceIds}",
      "GET /v1/disputes/templates?category="
    ],
    "tokens": [
      "--clay-500",
      "--clay-600",
      "--amber-500",
      "--glass-4",
      "--mono"
    ]
  },
  {
    "code": "EMP-40",
    "unitId": "Litige client — suivi",
    "route": "/client/missions/:id/litige",
    "canonicalRoute": "/client/missions/:id/litige",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "timeline",
      "chat",
      "price",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/disputes/:id",
      "POST /v1/disputes/:id/messages",
      "POST /v1/disputes/:id/resolution/accept",
      "POST /v1/disputes/:id/revision"
    ],
    "tokens": [
      "--clay-500",
      "--amber-500",
      "--emerald-500",
      "--glass-2",
      "--mono"
    ]
  },
  {
    "code": "EMP-41",
    "unitId": "Paiements client — échéances & échéancier",
    "route": "/client/paiements",
    "canonicalRoute": "/client/paiements",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "kpi",
      "timeline",
      "price",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/payments/schedules?role=client",
      "POST /v1/payments/:id/pay",
      "GET /v1/payments/:id/breakdown"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--clay-500",
      "--display-1",
      "--mono"
    ]
  },
  {
    "code": "EMP-42",
    "unitId": "Paiements client — échéances & échéancier",
    "route": "/client/paiements/:id",
    "canonicalRoute": "/client/paiements/:id",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "price",
      "list",
      "doc",
      "cta"
    ],
    "variantOf": "EMP-41",
    "designApi": [
      "GET /v1/payments/:id",
      "POST /v1/payments/:id/pay",
      "GET /v1/payments/:id/invoice.pdf"
    ],
    "tokens": [
      "--gold-500",
      "--price",
      "--mono",
      "--emerald-500"
    ]
  },
  {
    "code": "EMP-43",
    "unitId": "Paiement externe — déclaration & vérification",
    "route": "/client/paiements/declaration",
    "canonicalRoute": "/client/paiements/declaration",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "form",
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/payments/external-declarations",
      "GET /v1/payments/external-declarations/:id",
      "POST /v1/payments/external-declarations/:id/confirm"
    ],
    "tokens": [
      "--clay-500",
      "--gold-500",
      "--emerald-500",
      "--mono",
      "--glass-3"
    ]
  },
  {
    "code": "EMP-44",
    "unitId": "Paiement externe — déclaration & vérification",
    "route": "/client/paiements/declarations/:id/verification",
    "canonicalRoute": "/client/paiements/declarations/:id/verification",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "timeline",
      "table",
      "kpi",
      "cta"
    ],
    "variantOf": "EMP-43",
    "designApi": [
      "GET /v1/payments/external-declarations/:id/verification",
      "POST /v1/payments/external-declarations/:id/relaunch"
    ],
    "tokens": [
      "--mono",
      "--amber-500",
      "--emerald-500",
      "--clay-500"
    ]
  },
  {
    "code": "EMP-45",
    "unitId": "Paiements — historique & export",
    "route": "/client/paiements/historique",
    "canonicalRoute": "/client/paiements/historique",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "chips",
      "table",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/payments?role=client&cursor=&from=&to=",
      "GET /v1/payments/export.csv",
      "GET /v1/payments/summary"
    ],
    "tokens": [
      "--surface-1",
      "--mono",
      "--gold-500",
      "--clay-500",
      "--table"
    ]
  },
  {
    "code": "EMP-46",
    "unitId": "Paiements — historique & export",
    "route": "/client/paiements/:id/recu",
    "canonicalRoute": "/client/paiements/:id/recu",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "doc",
      "sign",
      "cta"
    ],
    "variantOf": "EMP-45",
    "designApi": [
      "GET /v1/payments/:id/receipt.pdf",
      "GET /v1/verify/:token (public)"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--mono",
      "--glass-1"
    ]
  },
  {
    "code": "EMP-47",
    "unitId": "Paiements client — échéances & échéancier",
    "route": "/client/paiements/plan",
    "canonicalRoute": "/client/paiements/plan",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "form",
      "price",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "PUT /v1/contracts/:id/payment-plan",
      "POST /v1/contracts/:id/payment-plan/amendment",
      "GET /v1/payment-plans/templates"
    ],
    "tokens": [
      "--gold-500",
      "--clay-500",
      "--emerald-500",
      "--mono",
      "--glass-2"
    ]
  },
  {
    "code": "EMP-48",
    "unitId": "Paiement — contestation",
    "route": "/client/paiements/:id/litige",
    "canonicalRoute": "/client/paiements/:id/litige",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "price",
      "form",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/payments/:id/disputes {nature, facts}",
      "GET /v1/payments/:id/recalculation"
    ],
    "tokens": [
      "--clay-500",
      "--gold-500",
      "--emerald-500",
      "--mono"
    ]
  },
  {
    "code": "EMP-49",
    "unitId": "Litige — fiche, pièces & résolution",
    "route": "/client/litiges/:id",
    "canonicalRoute": "/client/litiges/:id",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "chat",
      "table",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/disputes/:id/full",
      "POST /v1/disputes/:id/evidence",
      "POST /v1/disputes/:id/messages",
      "GET /v1/disputes/:id/deadlines"
    ],
    "tokens": [
      "--clay-500",
      "--amber-500",
      "--mono",
      "--glass-2",
      "--text-mid"
    ]
  },
  {
    "code": "EMP-50",
    "unitId": "Litige — fiche, pièces & résolution",
    "route": "/client/litiges/:id/preuves",
    "canonicalRoute": "/client/litiges/:id/preuves",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "list",
      "table",
      "kpi",
      "cta"
    ],
    "variantOf": "EMP-49",
    "designApi": [
      "GET /v1/disputes/:id/evidence",
      "GET /v1/disputes/:id/evidence/export.zip",
      "POST /v1/disputes/:id/evidence"
    ],
    "tokens": [
      "--mono",
      "--clay-500",
      "--amber-500",
      "--glass-1"
    ]
  },
  {
    "code": "EMP-51",
    "unitId": "Litige — fiche, pièces & résolution",
    "route": "/client/litiges/:id/resolution",
    "canonicalRoute": "/client/litiges/:id/resolution",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "price",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/disputes/:id/resolutions",
      "POST /v1/disputes/:id/resolutions/:rid/accept",
      "POST /v1/disputes/:id/resolutions/:rid/refuse"
    ],
    "tokens": [
      "--emerald-500",
      "--gold-500",
      "--clay-500",
      "--mono",
      "--glass-3"
    ]
  },
  {
    "code": "EMP-52",
    "unitId": "Litige — décision, escalade & clôture",
    "route": "/client/litiges/:id/escalade",
    "canonicalRoute": "/client/litiges/:id/escalade",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "form",
      "list",
      "timeline",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/disputes/:id/escalate",
      "GET /v1/disputes/:id/moderation-queue",
      "GET /v1/moderation/criteria (public)"
    ],
    "tokens": [
      "--violet-500",
      "--clay-500",
      "--gold-500",
      "--mono",
      "--surface-2"
    ]
  },
  {
    "code": "EMP-53",
    "unitId": "Litige — décision, escalade & clôture",
    "route": "/client/litiges/:id/attente",
    "canonicalRoute": "/client/litiges/:id/attente",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "timeline",
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": "EMP-52",
    "designApi": [
      "GET /v1/disputes/:id/instruction",
      "GET /v1/disputes/:id/sla"
    ],
    "tokens": [
      "--amber-500",
      "--slate-500",
      "--mono",
      "--glass-1"
    ]
  },
  {
    "code": "EMP-54",
    "unitId": "Litige — décision, escalade & clôture",
    "route": "/client/litiges/:id/decision",
    "canonicalRoute": "/client/litiges/:id/decision",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "verdict",
      "doc",
      "price",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/disputes/:id/decision",
      "GET /v1/disputes/:id/decision.pdf",
      "POST /v1/disputes/:id/revision"
    ],
    "tokens": [
      "--emerald-500",
      "--amber-500",
      "--clay-500",
      "--mono",
      "--glass-1"
    ]
  },
  {
    "code": "EMP-55",
    "unitId": "Litige — décision, escalade & clôture",
    "route": "/client/litiges/:id/cloture",
    "canonicalRoute": "/client/litiges/:id/cloture",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "verdict",
      "table",
      "list",
      "cta"
    ],
    "variantOf": "EMP-54",
    "designApi": [
      "GET /v1/disputes/:id/closure",
      "GET /v1/disputes/:id/archive.zip"
    ],
    "tokens": [
      "--slate-500",
      "--clay-500",
      "--mono",
      "--surface-1"
    ]
  },
  {
    "code": "EMP-56",
    "unitId": "Remplacement — déclenchement",
    "route": "/client/missions/:id/remplacement",
    "canonicalRoute": "/client/missions/:id/remplacement",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "timeline",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/missions/:id/replacement {reason}",
      "GET /v1/missions/:id/handover"
    ],
    "tokens": [
      "--clay-500",
      "--gold-500",
      "--emerald-500",
      "--mono"
    ]
  },
  {
    "code": "EMP-57",
    "unitId": "Remplacement — déclenchement",
    "route": "/client/missions/:id/remplacement/conditions",
    "canonicalRoute": "/client/missions/:id/remplacement/conditions",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "list",
      "price",
      "kpi",
      "cta"
    ],
    "variantOf": "EMP-56",
    "designApi": [
      "GET /v1/missions/:id/replacement/terms",
      "POST /v1/missions/:id/replacement/acknowledge"
    ],
    "tokens": [
      "--gold-500",
      "--clay-500",
      "--mono",
      "--glass-1"
    ]
  },
  {
    "code": "EMP-58",
    "unitId": "Remplacement — sélection",
    "route": "/client/missions/:id/remplacement/selection",
    "canonicalRoute": "/client/missions/:id/remplacement/selection",
    "role": "EMPLOYER",
    "criticality": "P0",
    "zoneKinds": [
      "kpi",
      "list",
      "ring",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/missions/:id/replacement/matching",
      "GET /v1/missions/:id/replacement/candidates",
      "POST /v1/missions/:id/replacement/propose"
    ],
    "tokens": [
      "--gold-500",
      "--clay-500",
      "--violet-500",
      "--mono"
    ]
  },
  {
    "code": "EMP-59",
    "unitId": "Remplacement — bascule",
    "route": "/client/missions/:id/remplacement/confirmation",
    "canonicalRoute": "/client/missions/:id/remplacement/confirmation",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "verdict",
      "table",
      "timeline",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/contracts/replacement {missionId, providerId}",
      "GET /v1/missions/:id/handover-dossier"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--slate-500",
      "--mono"
    ]
  },
  {
    "code": "EMP-60",
    "unitId": "Remplacement — bascule",
    "route": "/client/contrats/:id/successeur",
    "canonicalRoute": "/client/contrats/:id/successeur",
    "role": "EMPLOYER",
    "criticality": "P1",
    "zoneKinds": [
      "hero",
      "doc",
      "price",
      "cta"
    ],
    "variantOf": "EMP-59",
    "designApi": [
      "GET /v1/contracts/:id (successor)",
      "POST /v1/contracts/:id/sign",
      "GET /v1/contracts/:id/succession-chain"
    ],
    "tokens": [
      "--gold-500",
      "--slate-500",
      "--emerald-500",
      "--mono"
    ]
  }
] as const;

export const EMPLOYER_UNIT_IDS: readonly string[] = EMPLOYER_DESIGN_UNITS.map((unit) => unit.id);
