// GÉNÉRÉ PAR scripts/design/generate-rtc-catalog.py — NE PAS ÉDITER À LA MAIN.
// Source : design/llab/content/rtc.py, design/llab/units.py.
// Régénérer : npm run design:rtc
//
// Référence de design UNIQUEMENT : aucun libellé de ce fichier n'est affiché par
// l'interface. Les textes visibles viennent de src/rtc/vocabulary.ts (vocabulaire
// LE LABEUR : SESSION, CONTRAT, EMPLOYEUR, CANDIDAT).
// Les routes sont celles du routeur P0 : elles ne sont ni renommées ni réécrites.

export interface RtcDesignScreen {
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

export interface RtcDesignUnit {
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

export const RTC_DESIGN_UNITS = [
  {
    "id": "RTC-01",
    "canon": "RTC — pré-appel & diagnostic réseau",
    "criticality": "P0",
    "archetype": "Se préparer",
    "screenCodes": [
      "RTC-01",
      "RTC-07"
    ],
    "routes": [
      "/appel/:id/preparation",
      "/appel/:id/diagnostic"
    ],
    "zoneKinds": [
      "cta",
      "hero",
      "kpi",
      "list",
      "media",
      "timeline"
    ],
    "componentRefs": [
      "Bandes",
      "Bloc",
      "C-16",
      "Conseils",
      "Courbe",
      "Jauge",
      "Rapport",
      "Test"
    ],
    "stateNames": [
      "Prêt",
      "Micro indisponible",
      "Réseau faible",
      "Interlocuteur absent",
      "Sans consentement croisé",
      "Bonne qualité",
      "Dégradée",
      "Mauvaise",
      "Relais imposé"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--cyan-500",
      "--emerald-500",
      "--glass-2",
      "--mono"
    ],
    "designApi": [
      "GET /v1/calls/:id/precheck",
      "POST /v1/calls/:id/consent {recording}",
      "POST /v1/calls/:id/join",
      "GET /v1/calls/:id/diagnostics",
      "POST /v1/calls/:id/quality/profile {preset}",
      "POST /v1/calls/:id/diagnostics/send"
    ]
  },
  {
    "id": "RTC-02",
    "canon": "RTC — invitation & connexion",
    "criticality": "P1",
    "archetype": "Recevoir l'appel",
    "screenCodes": [
      "RTC-02",
      "RTC-03"
    ],
    "routes": [
      "/appel/:id/invitation",
      "/appel/:id/connexion"
    ],
    "zoneKinds": [
      "cta",
      "hero",
      "kpi",
      "media"
    ],
    "componentRefs": [
      "Bouton",
      "C-16",
      "Halo",
      "Liste",
      "Motifs",
      "Sonnerie"
    ],
    "stateNames": [
      "Sonnerie",
      "Refus",
      "Déjà en appel",
      "Appel annulé par l'appelant",
      "Reporté",
      "Établissement', 1-3 s",
      "Relais nécessaire",
      "Échec vidéo",
      "Échec total"
    ],
    "tokens": [
      "--clay-500",
      "--cyan-500",
      "--emerald-500",
      "--glass-1",
      "--glass-3",
      "--mono"
    ],
    "designApi": [
      "GET /v1/calls/:id/invitation",
      "POST /v1/calls/:id/accept {audioOnly}",
      "POST /v1/calls/:id/decline {reason?}",
      "GET /v1/calls/:id/connection-state",
      "POST /v1/calls/:id/downgrade {audioOnly: true}",
      "POST /v1/calls/:id/cancel"
    ]
  },
  {
    "id": "RTC-04",
    "canon": "RTC — session active",
    "criticality": "P0",
    "archetype": "La conversation",
    "screenCodes": [
      "RTC-04"
    ],
    "routes": [
      "/appel/:id"
    ],
    "zoneKinds": [
      "cta",
      "kpi",
      "media"
    ],
    "componentRefs": [
      "Bandeau",
      "C-16",
      "Note",
      "PIP",
      "Partage"
    ],
    "stateNames": [
      "Normal",
      "Réseau dégradé",
      "Reconnexion",
      "Un participant seul",
      "Enregistrement consenti"
    ],
    "tokens": [
      "--clay-500",
      "--cyan-500",
      "--emerald-500",
      "--glass-3",
      "--surface-0"
    ],
    "designApi": [
      "POST /v1/calls/:id/tracks {audio, video}",
      "POST /v1/calls/:id/notes",
      "POST /v1/calls/:id/share {documentId}",
      "POST /v1/calls/:id/hangup"
    ]
  },
  {
    "id": "RTC-05",
    "canon": "RTC — fin de session & historique",
    "criticality": "P1",
    "archetype": "Après l'appel",
    "screenCodes": [
      "RTC-05",
      "RTC-06"
    ],
    "routes": [
      "/appel/:id/fin",
      "/appels"
    ],
    "zoneKinds": [
      "cta",
      "doc",
      "kpi",
      "list",
      "verdict"
    ],
    "componentRefs": [
      "Badge",
      "Carte",
      "Empreinte",
      "Lecteur",
      "Lien",
      "Notes"
    ],
    "stateNames": [
      "Sans enregistrement",
      "Avec enregistrement",
      "Appel interrompu",
      "Appel en litige",
      "Vide",
      "Long",
      "Session liée à un litige",
      "Enregistrement purgé"
    ],
    "tokens": [
      "--cyan-500",
      "--emerald-500",
      "--glass-1",
      "--gold-500",
      "--mono",
      "--surface-1",
      "--text-lo"
    ],
    "designApi": [
      "GET /v1/calls/:id/summary",
      "POST /v1/calls/:id/actions",
      "GET /v1/calls/:id/recording",
      "POST /v1/calls/:id/report",
      "GET /v1/calls/history?cursor=",
      "GET /v1/calls/:id/summary"
    ]
  },
  {
    "id": "RTC-08",
    "canon": "RTC — consentement",
    "criticality": "P0",
    "archetype": "Consentir ou refuser",
    "screenCodes": [
      "RTC-08"
    ],
    "routes": [
      "/appel/:id/consentement"
    ],
    "zoneKinds": [
      "cta",
      "hero",
      "kpi",
      "list"
    ],
    "componentRefs": [
      "Bloc",
      "Bouton",
      "Indicateur"
    ],
    "stateNames": [
      "En attente",
      "Accordé mutuellement",
      "Refus",
      "Révocation",
      "Litige ouvert après coup"
    ],
    "tokens": [
      "--clay-500",
      "--emerald-500",
      "--glass-4",
      "--mono",
      "--surface-2"
    ],
    "designApi": [
      "GET /v1/calls/:id/consent",
      "POST /v1/calls/:id/consent {recording: true|false}",
      "POST /v1/calls/:id/consent/revoke"
    ]
  }
] as const;

export const RTC_DESIGN_SCREENS = [
  {
    "code": "RTC-01",
    "unitId": "RTC — pré-appel & diagnostic réseau",
    "route": "/appel/:id/preparation",
    "canonicalRoute": "/appel/:id/preparation",
    "role": "EMPLOYER/CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "media",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/calls/:id/precheck",
      "POST /v1/calls/:id/consent {recording}",
      "POST /v1/calls/:id/join"
    ],
    "tokens": [
      "--cyan-500",
      "--emerald-500",
      "--amber-500",
      "--clay-500",
      "--glass-2"
    ]
  },
  {
    "code": "RTC-02",
    "unitId": "RTC — invitation & connexion",
    "route": "/appel/:id/invitation",
    "canonicalRoute": "/appel/:id/invitation",
    "role": "EMPLOYER/CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "hero",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/calls/:id/invitation",
      "POST /v1/calls/:id/accept {audioOnly}",
      "POST /v1/calls/:id/decline {reason?}"
    ],
    "tokens": [
      "--emerald-500",
      "--cyan-500",
      "--clay-500",
      "--glass-3",
      "--mono"
    ]
  },
  {
    "code": "RTC-03",
    "unitId": "RTC — invitation & connexion",
    "route": "/appel/:id/connexion",
    "canonicalRoute": "/appel/:id/connexion",
    "role": "EMPLOYER/CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "media",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/calls/:id/connection-state",
      "POST /v1/calls/:id/downgrade {audioOnly: true}",
      "POST /v1/calls/:id/cancel"
    ],
    "tokens": [
      "--cyan-500",
      "--emerald-500",
      "--clay-500",
      "--mono",
      "--glass-1"
    ]
  },
  {
    "code": "RTC-04",
    "unitId": "RTC — session active",
    "route": "/appel/:id",
    "canonicalRoute": "/appel/:id",
    "role": "EMPLOYER/CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "media",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /v1/calls/:id/tracks {audio, video}",
      "POST /v1/calls/:id/notes",
      "POST /v1/calls/:id/share {documentId}",
      "POST /v1/calls/:id/hangup"
    ],
    "tokens": [
      "--surface-0",
      "--cyan-500",
      "--emerald-500",
      "--clay-500",
      "--glass-3"
    ]
  },
  {
    "code": "RTC-05",
    "unitId": "RTC — fin de session & historique",
    "route": "/appel/:id/fin",
    "canonicalRoute": "/appel/:id/fin",
    "role": "EMPLOYER/CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "verdict",
      "list",
      "doc",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/calls/:id/summary",
      "POST /v1/calls/:id/actions",
      "GET /v1/calls/:id/recording",
      "POST /v1/calls/:id/report"
    ],
    "tokens": [
      "--emerald-500",
      "--gold-500",
      "--cyan-500",
      "--mono",
      "--glass-1"
    ]
  },
  {
    "code": "RTC-06",
    "unitId": "RTC — fin de session & historique",
    "route": "/appels",
    "canonicalRoute": "/appels",
    "role": "EMPLOYER/CANDIDATE",
    "criticality": "P2",
    "zoneKinds": [
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/calls/history?cursor=",
      "GET /v1/calls/:id/summary"
    ],
    "tokens": [
      "--surface-1",
      "--cyan-500",
      "--mono",
      "--text-lo"
    ]
  },
  {
    "code": "RTC-07",
    "unitId": "RTC — pré-appel & diagnostic réseau",
    "route": "/appel/:id/diagnostic",
    "canonicalRoute": "/appel/:id/diagnostic",
    "role": "EMPLOYER/CANDIDATE",
    "criticality": "P1",
    "zoneKinds": [
      "kpi",
      "list",
      "timeline",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/calls/:id/diagnostics",
      "POST /v1/calls/:id/quality/profile {preset}",
      "POST /v1/calls/:id/diagnostics/send"
    ],
    "tokens": [
      "--cyan-500",
      "--amber-500",
      "--clay-500",
      "--mono"
    ]
  },
  {
    "code": "RTC-08",
    "unitId": "RTC — consentement",
    "route": "/appel/:id/consentement",
    "canonicalRoute": "/appel/:id/consentement",
    "role": "EMPLOYER/CANDIDATE",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /v1/calls/:id/consent",
      "POST /v1/calls/:id/consent {recording: true|false}",
      "POST /v1/calls/:id/consent/revoke"
    ],
    "tokens": [
      "--emerald-500",
      "--clay-500",
      "--surface-2",
      "--mono",
      "--glass-4"
    ]
  }
] as const;

export const RTC_UNIT_IDS: readonly string[] = RTC_DESIGN_UNITS.map((unit) => unit.id);
