// GÉNÉRÉ PAR scripts/design/generate-admin-catalog.py — NE PAS ÉDITER À LA MAIN.
// Source : design/llab/content/adm_*.py, design/llab/units.py — tranches livrées :
// P4A (ADM-01 → ADM-12), P4B-1 CONTRATS (ADM-13 → ADM-17), P4B-2 PAIEMENTS (ADM-18 → ADM-22)
// P4C SALAIRE (ADM-23 → ADM-24), P4D CLAIMS (ADM-26 → ADM-30), P4E-1 REMPLACEMENTS (ADM-31 → ADM-33),
// P4E-2 RÉPUTATION (ADM-34 → ADM-36).
// Régénérer : npm run design:admin
//
// Référence de design UNIQUEMENT : aucun libellé de ce fichier n'est affiché par
// l'interface. Les textes visibles viennent de src/admin/vocabulary.ts (vocabulaire
// LE LABEUR : ADMIN, EMPLOYER, CANDIDATE, OFFER, APPLICATION, PROPOSAL, CONTRACT, CLAIM,
// PAYMENT, SALARY, REPLACEMENT, MATCHING, DOCUMENT, QUALIFICATION, REPUTATION).
// Les routes sont celles du routeur P0 : elles ne sont ni renommées ni réécrites.

export interface AdminDesignScreen {
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

export interface AdminDesignUnit {
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

export const ADMIN_DESIGN_UNITS = [
  {
    "id": "ADM-01",
    "canon": "ADM — dashboard général",
    "criticality": "P0",
    "archetype": "Salle de contrôle",
    "screenCodes": [
      "ADM-01"
    ],
    "routes": [
      "/admin"
    ],
    "zoneKinds": [
      "cta",
      "kpi",
      "list",
      "table",
      "timeline"
    ],
    "componentRefs": [
      "Carte",
      "Journal",
      "Mode",
      "Tuile"
    ],
    "stateNames": [
      "Nominal",
      "Charge",
      "Incident",
      "Astreinte"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--emerald-500",
      "--gold-500",
      "--mono",
      "--surface-0"
    ],
    "designApi": [
      "GET /admin/overview",
      "GET /admin/queues/summary",
      "GET /admin/activity?since=",
      "GET /admin/health/series?window=24h"
    ]
  },
  {
    "id": "ADM-02",
    "canon": "ADM — utilisateurs (liste & fiche)",
    "criticality": "P0",
    "archetype": "Annuaire opérationnel",
    "screenCodes": [
      "ADM-02",
      "ADM-03"
    ],
    "routes": [
      "/admin/utilisateurs",
      "/admin/utilisateurs/:id"
    ],
    "zoneKinds": [
      "cta",
      "form",
      "hero",
      "kpi",
      "list",
      "table"
    ],
    "componentRefs": [
      "Badge",
      "Bandeau",
      "Chronologie",
      "En-tête",
      "Journal",
      "Notes",
      "Recherche",
      "Table"
    ],
    "stateNames": [
      "Vide",
      "Résultats",
      "Sélection multiple",
      "Accès refusé",
      "Compte sain",
      "Compte sous surveillance",
      "Compte bloqué",
      "Compte supprimé"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--emerald-500",
      "--mono",
      "--surface-1",
      "--table",
      "--text-lo"
    ],
    "designApi": [
      "GET /admin/users?q=&role=&state=&cursor=",
      "POST /admin/exports {type, filters, motive}",
      "GET /admin/users/:id",
      "GET /admin/users/:id/timeline",
      "POST /admin/users/:id/notes",
      "POST /admin/users/:id/review"
    ]
  },
  {
    "id": "ADM-04",
    "canon": "ADM — blocage (geste)",
    "criticality": "P0",
    "archetype": "Geste lourd, tracé",
    "screenCodes": [
      "ADM-04",
      "ADM-05"
    ],
    "routes": [
      "/admin/utilisateurs/:id/blocage",
      "/admin/blocages"
    ],
    "zoneKinds": [
      "cta",
      "form",
      "kpi",
      "list",
      "table"
    ],
    "componentRefs": [
      "Badge",
      "Double",
      "Formulaire",
      "Notification",
      "Simulateur",
      "Statistiques",
      "Table"
    ],
    "stateNames": [
      "Préparation",
      "Contre-signature requise",
      "Prononcé",
      "Contestation",
      "Levée",
      "Vide",
      "Actif",
      "Appel en cours",
      "Annulé en appel"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--clay-600",
      "--emerald-500",
      "--glass-3",
      "--mono",
      "--table"
    ],
    "designApi": [
      "POST /admin/users/:id/block {scope, duration, motive}",
      "POST /admin/users/:id/unblock",
      "POST /admin/users/:id/block/countersign",
      "GET /admin/blocks?cursor=&filters=",
      "GET /admin/blocks/stats",
      "POST /admin/blocks/export"
    ]
  },
  {
    "id": "ADM-06",
    "canon": "ADM — qualification (file & revue)",
    "criticality": "P0",
    "archetype": "File des verdicts en attente",
    "screenCodes": [
      "ADM-06",
      "ADM-07"
    ],
    "routes": [
      "/admin/qualification",
      "/admin/qualification/:id"
    ],
    "zoneKinds": [
      "chat",
      "cta",
      "hero",
      "kpi",
      "list",
      "table",
      "verdict"
    ],
    "componentRefs": [
      "Badge",
      "Checklist",
      "Comparateur",
      "Compteur",
      "Fil",
      "Panneau",
      "Table",
      "Verrou"
    ],
    "stateNames": [
      "File saine",
      "Surcharge",
      "Élément verrouillé",
      "Vide",
      "En examen",
      "Complément demandé",
      "Décision prête",
      "Abandon/skip"
    ],
    "tokens": [
      "--amber-500",
      "--glass-1",
      "--gold-500",
      "--mono",
      "--surface-1",
      "--table",
      "--text-mid",
      "--violet-500"
    ],
    "designApi": [
      "GET /admin/qualification/queue?cursor=",
      "POST /admin/qualification/:id/claim",
      "GET /admin/qualification/sla",
      "GET /admin/qualification/:id",
      "POST /admin/qualification/:id/request-info",
      "POST /admin/qualification/:id/recuse"
    ]
  },
  {
    "id": "ADM-08",
    "canon": "ADM — qualification (décision)",
    "criticality": "P0",
    "archetype": "Verdict humain",
    "screenCodes": [
      "ADM-08",
      "ADM-09"
    ],
    "routes": [
      "/admin/qualification/:id/decision",
      "/admin/qualification/historique"
    ],
    "zoneKinds": [
      "cta",
      "doc",
      "kpi",
      "list",
      "table",
      "verdict"
    ],
    "componentRefs": [
      "Cartes",
      "Distribution",
      "Détecteur",
      "Générateur",
      "Récapitulatif",
      "Signature",
      "Table"
    ],
    "stateNames": [
      "Brouillon",
      "Publiée",
      "Bloquée",
      "Annulée en recours",
      "Nominal",
      "Dérive détectée",
      "Recours élevé",
      "Vide"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--emerald-500",
      "--glass-2",
      "--mono",
      "--table",
      "--violet-500"
    ],
    "designApi": [
      "POST /admin/qualification/:id/decision {verdict, ruleRefs, facts, clientText}",
      "GET /admin/qualification/:id/effects-preview",
      "GET /admin/qualification/history?cursor=&filters=",
      "GET /admin/qualification/analytics",
      "POST /admin/qualification/export"
    ]
  },
  {
    "id": "ADM-10",
    "canon": "ADM — matching (runs & règles)",
    "criticality": "P1",
    "archetype": "Salle des moteurs",
    "screenCodes": [
      "ADM-10",
      "ADM-12"
    ],
    "routes": [
      "/admin/matching",
      "/admin/matching/rulesets"
    ],
    "zoneKinds": [
      "cta",
      "form",
      "kpi",
      "list",
      "table"
    ],
    "componentRefs": [
      "Badge",
      "Garde-fous",
      "Historique",
      "Indicateur",
      "Simulation",
      "Table",
      "Éditeur"
    ],
    "stateNames": [
      "Nominal",
      "Lent",
      "Échec",
      "Vide",
      "Active",
      "En test",
      "Bloquée",
      "Archivée"
    ],
    "tokens": [
      "--clay-500",
      "--emerald-500",
      "--gold-500",
      "--mono",
      "--table",
      "--violet-500"
    ],
    "designApi": [
      "GET /admin/matching/runs?cursor=",
      "POST /admin/matching/runs/:id/retry",
      "GET /admin/matching/health",
      "GET /admin/matching/rulesets",
      "POST /admin/matching/rulesets/:v/simulate",
      "POST /admin/matching/rulesets/:v/activate"
    ]
  },
  {
    "id": "ADM-11",
    "canon": "ADM — matching (audit)",
    "criticality": "P0",
    "archetype": "Rayons X du moteur",
    "screenCodes": [
      "ADM-11"
    ],
    "routes": [
      "/admin/matching/runs/:id"
    ],
    "zoneKinds": [
      "cta",
      "list",
      "ring",
      "table"
    ],
    "componentRefs": [
      "Anonymisation",
      "Histogramme",
      "Matrice",
      "Tests"
    ],
    "stateNames": [
      "Conforme",
      "À surveiller",
      "Hors seuil",
      "Run purgé"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--mono",
      "--table",
      "--violet-500"
    ],
    "designApi": [
      "GET /admin/matching/runs/:id",
      "GET /admin/matching/runs/:id/bias-tests",
      "POST /admin/matching/factors/:id/disable"
    ]
  },
  {
    "id": "ADM-13",
    "canon": "ADM — contrats (registre)",
    "criticality": "P0",
    "archetype": "Grand livre des engagements",
    "screenCodes": [
      "ADM-13"
    ],
    "routes": [
      "/admin/contrats"
    ],
    "zoneKinds": [
      "chips",
      "cta",
      "kpi",
      "table"
    ],
    "componentRefs": [
      "Badge",
      "Détecteur",
      "Table"
    ],
    "stateNames": [
      "Nominal",
      "Charge incident",
      "Signatures bloquées",
      "Vide"
    ],
    "tokens": [
      "--amber-500",
      "--gold-500",
      "--mono",
      "--surface-1",
      "--table"
    ],
    "designApi": [
      "GET /admin/contracts?segment=&cursor=",
      "GET /admin/contracts/summary",
      "POST /admin/contracts/export"
    ]
  },
  {
    "id": "ADM-14",
    "canon": "ADM — contrat (fiche, incidents & journal)",
    "criticality": "P0",
    "archetype": "Dossier contractuel complet",
    "screenCodes": [
      "ADM-14",
      "ADM-15",
      "ADM-17"
    ],
    "routes": [
      "/admin/contrats/:id",
      "/admin/contrats/:id/incidents",
      "/admin/contrats/:id/journal"
    ],
    "zoneKinds": [
      "cta",
      "doc",
      "hero",
      "kpi",
      "list",
      "table",
      "timeline"
    ],
    "componentRefs": [
      "Actions",
      "Bandeau",
      "C-06",
      "Export",
      "Notes",
      "Score",
      "Table",
      "Vérificateur"
    ],
    "stateNames": [
      "Actif sain",
      "En incident",
      "Contesté",
      "Audit demandé",
      "Stable",
      "À surveiller",
      "Risque élevé",
      "Résolu",
      "Intègre",
      "Rupture détectée",
      "Volumineux",
      "Vide"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--emerald-500",
      "--gold-500",
      "--mono",
      "--surface-1",
      "--table",
      "--violet-500"
    ],
    "designApi": [
      "GET /admin/contracts/:id",
      "POST /admin/contracts/:id/notes",
      "GET /admin/contracts/:id/versions",
      "GET /admin/contracts/:id/incidents",
      "POST /admin/contracts/:id/incidents",
      "POST /admin/contracts/:id/preventions {type}",
      "GET /admin/contracts/:id/journal?cursor=",
      "POST /admin/contracts/:id/journal/verify",
      "GET /admin/contracts/:id/journal/export"
    ]
  },
  {
    "id": "ADM-16",
    "canon": "ADM — contrat (révision forcée)",
    "criticality": "P0",
    "archetype": "Écrire la loi du dossier",
    "screenCodes": [
      "ADM-16"
    ],
    "routes": [
      "/admin/contrats/:id/revision-forcee"
    ],
    "zoneKinds": [
      "cta",
      "doc",
      "form",
      "kpi"
    ],
    "componentRefs": [
      "Aperçu",
      "Bloc",
      "Double",
      "Formulaire"
    ],
    "stateNames": [
      "Préparation",
      "Contre-signature",
      "Appliquée",
      "Annulée"
    ],
    "tokens": [
      "--clay-500",
      "--clay-600",
      "--glass-3",
      "--gold-500",
      "--mono"
    ],
    "designApi": [
      "POST /admin/contracts/:id/forced-revision {type, legalBasis, motive, patch}",
      "POST /admin/contracts/:id/forced-revision/countersign"
    ]
  },
  {
    "id": "ADM-18",
    "canon": "ADM — paiements (vue globale & réconciliation)",
    "criticality": "P0",
    "archetype": "Tour de contrôle financier",
    "screenCodes": [
      "ADM-18",
      "ADM-19"
    ],
    "routes": [
      "/admin/paiements",
      "/admin/paiements/reconciliation"
    ],
    "zoneKinds": [
      "cta",
      "kpi",
      "list",
      "table",
      "timeline"
    ],
    "componentRefs": [
      "Badge",
      "Bandeau",
      "Détecteur",
      "Histogramme",
      "Journal",
      "Table",
      "Écriture"
    ],
    "stateNames": [
      "Nominal",
      "Taux d'échec élevé",
      "Volume inhabituel",
      "PSP indisponible",
      "Équilibré",
      "Écart mineur",
      "Écart significatif",
      "Imputé"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--emerald-500",
      "--gold-500",
      "--mono",
      "--table"
    ],
    "designApi": [
      "GET /admin/payments/overview",
      "GET /admin/payments/events?since=",
      "GET /admin/psp/health",
      "GET /admin/reconciliation?period=&operator=",
      "POST /admin/reconciliation/gaps/:id/impute {motive, entry}",
      "GET /admin/reconciliation/summary"
    ]
  },
  {
    "id": "ADM-20",
    "canon": "ADM — paiements (anomalies, déclarations & incidents)",
    "criticality": "P0",
    "archetype": "Chasse aux irrégularités",
    "screenCodes": [
      "ADM-20",
      "ADM-21",
      "ADM-22"
    ],
    "routes": [
      "/admin/paiements/anomalies",
      "/admin/paiements/declarations-externes",
      "/admin/paiements/incidents/:id"
    ],
    "zoneKinds": [
      "cta",
      "doc",
      "hero",
      "kpi",
      "list",
      "table",
      "timeline"
    ],
    "componentRefs": [
      "Carte",
      "Double",
      "Décision",
      "Lien",
      "Panneau",
      "Preuve",
      "Statistiques",
      "Table",
      "Traitement",
      "Visionneuse"
    ],
    "stateNames": [
      "Nominal",
      "Vague",
      "Faux positif",
      "Confirmée",
      "Dans les délais",
      "Contestée",
      "Confirmée",
      "Fraude établie",
      "Ouvert",
      "Résolu",
      "Escaladé",
      "Rouvert"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--clay-600",
      "--emerald-500",
      "--glass-2",
      "--mono",
      "--table",
      "--violet-500"
    ],
    "designApi": [
      "GET /admin/payments/anomalies?cursor=",
      "POST /admin/payments/anomalies/:id/treat",
      "POST /admin/payments/anomalies/:id/false-positive",
      "GET /admin/payments/external-declarations?cursor=",
      "POST /admin/payments/external-declarations/:id/decide",
      "GET /admin/payments/incidents/:id",
      "POST /admin/payments/incidents/:id/resolve {option, entries}",
      "POST /admin/payments/incidents/:id/escalate"
    ]
  },
  {
    "id": "ADM-23",
    "canon": "ADM — salaire (confirmations & preuves OTP)",
    "criticality": "P0",
    "archetype": "Preuves de versement",
    "screenCodes": [
      "ADM-23",
      "ADM-24"
    ],
    "routes": [
      "/admin/salaire/confirmations",
      "/admin/salaire/preuves/:id"
    ],
    "zoneKinds": [
      "cta",
      "hero",
      "kpi",
      "list",
      "table"
    ],
    "componentRefs": [
      "Bloc",
      "Décision",
      "Journal",
      "Lien",
      "Signaux",
      "Table"
    ],
    "stateNames": [
      "Nominal",
      "Accumulation",
      "OTP expirés",
      "Blocage complet",
      "Valide",
      "Douteuse",
      "Invalidée",
      "Introuvable"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--emerald-500",
      "--mono",
      "--table"
    ],
    "designApi": [
      "GET /admin/salary/confirmations?cursor=",
      "POST /admin/salary/confirmations/:id/remind",
      "GET /admin/salary/confirmations/stats",
      "GET /admin/salary/proofs/:id",
      "POST /admin/salary/proofs/:id/validate",
      "POST /admin/salary/proofs/:id/invalidate {motive}"
    ]
  },
  {
    "id": "ADM-26",
    "canon": "ADM — litiges (file)",
    "criticality": "P0",
    "archetype": "File des conflits",
    "screenCodes": [
      "ADM-26"
    ],
    "routes": [
      "/admin/litiges"
    ],
    "zoneKinds": [
      "cta",
      "kpi",
      "list",
      "table"
    ],
    "componentRefs": [
      "Compteur",
      "Marqueur",
      "Table",
      "Verrou"
    ],
    "stateNames": [
      "File saine",
      "Surcharge",
      "Afflux",
      "Vide"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--mono",
      "--table",
      "--violet-500"
    ],
    "designApi": [
      "GET /admin/disputes?queue=&cursor=",
      "POST /admin/disputes/:id/claim",
      "GET /admin/disputes/sla"
    ]
  },
  {
    "id": "ADM-27",
    "canon": "ADM — litige (fiche & pièces)",
    "criticality": "P0",
    "archetype": "Dossier contradictoire complet",
    "screenCodes": [
      "ADM-27",
      "ADM-28"
    ],
    "routes": [
      "/admin/litiges/:id",
      "/admin/litiges/:id/pieces"
    ],
    "zoneKinds": [
      "chat",
      "cta",
      "hero",
      "kpi",
      "list",
      "table"
    ],
    "componentRefs": [
      "Chronologie",
      "Matrice",
      "Métadonnées",
      "Notes",
      "Recevabilité",
      "Résumé",
      "Table",
      "Visionneuse"
    ],
    "stateNames": [
      "Instruction",
      "Complète",
      "Incomplète (silence)",
      "Recours",
      "Concordant",
      "Contradictoire",
      "Insuffisant",
      "Pièce tardive"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--glass-1",
      "--mono",
      "--text-mid"
    ],
    "designApi": [
      "GET /admin/disputes/:id/full",
      "POST /admin/disputes/:id/request-evidence",
      "POST /admin/disputes/:id/recuse",
      "GET /admin/disputes/:id/evidence",
      "POST /admin/disputes/:id/evidence/:eid/admissibility",
      "GET /admin/disputes/:id/contradictions"
    ]
  },
  {
    "id": "ADM-29",
    "canon": "ADM — litige (décision)",
    "criticality": "P0",
    "archetype": "Rédiger le verdict",
    "screenCodes": [
      "ADM-29",
      "ADM-30"
    ],
    "routes": [
      "/admin/litiges/:id/decision",
      "/admin/litiges/decisions"
    ],
    "zoneKinds": [
      "cta",
      "doc",
      "kpi",
      "list",
      "price",
      "table",
      "verdict"
    ],
    "componentRefs": [
      "Comparateur",
      "Double",
      "Gabarits",
      "Indicateur",
      "Liaison",
      "Simulateur",
      "Table"
    ],
    "stateNames": [
      "Brouillon",
      "Contre-signature",
      "Publiée",
      "Infirmée en recours",
      "Stable",
      "Divergence détectée",
      "Infirmation élevée",
      "Vide"
    ],
    "tokens": [
      "--clay-500",
      "--emerald-500",
      "--glass-2",
      "--gold-500",
      "--mono",
      "--table",
      "--violet-500"
    ],
    "designApi": [
      "POST /admin/disputes/:id/decision {issue, facts, evidenceRefs, ruleRefs, calculation}",
      "GET /admin/disputes/:id/decision/preview-effects",
      "GET /admin/disputes/decisions?cursor=",
      "GET /admin/disputes/decisions/analytics",
      "GET /admin/disputes/decisions/compare?ids="
    ]
  },
  {
    "id": "ADM-31",
    "canon": "ADM — remplacements (file & arbitrage)",
    "criticality": "P1",
    "archetype": "Transition sous surveillance",
    "screenCodes": [
      "ADM-31",
      "ADM-32",
      "ADM-33"
    ],
    "routes": [
      "/admin/remplacements",
      "/admin/remplacements/:id",
      "/admin/remplacements/:id/arbitrage"
    ],
    "zoneKinds": [
      "cta",
      "doc",
      "hero",
      "kpi",
      "list",
      "price",
      "table",
      "timeline",
      "verdict"
    ],
    "componentRefs": [
      "Alerte",
      "Badge",
      "C-06",
      "Contestation",
      "Double",
      "Notification",
      "Panneau",
      "Simulateur",
      "Table"
    ],
    "stateNames": [
      "Fluide",
      "Enlisé",
      "Contesté",
      "Échoué",
      "Nominal",
      "Contestation active",
      "Paiement du sortant en retard",
      "Clôturé",
      "À trancher",
      "Contre-signature",
      "Rendu",
      "Infirmé"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--clay-600",
      "--emerald-500",
      "--glass-3",
      "--gold-500",
      "--mono",
      "--table"
    ],
    "designApi": [
      "GET /admin/replacements?cursor=",
      "POST /admin/replacements/:id/reassign",
      "GET /admin/replacements/stats",
      "GET /admin/replacements/:id/full",
      "POST /admin/replacements/:id/intervene",
      "POST /admin/replacements/:id/arbitrate {causeFound, payoutCorrect, perimeterValid, motive, entries}",
      "GET /admin/replacements/:id/arbitrate/preview"
    ]
  },
  {
    "id": "ADM-34",
    "canon": "ADM — réputation (ledger, corrections & audit)",
    "criticality": "P0",
    "archetype": "Grand livre de l'honneur",
    "screenCodes": [
      "ADM-34",
      "ADM-36"
    ],
    "routes": [
      "/admin/reputation",
      "/admin/reputation/audit"
    ],
    "zoneKinds": [
      "cta",
      "form",
      "kpi",
      "list",
      "table"
    ],
    "componentRefs": [
      "Aperçu",
      "Formulaire",
      "Journal",
      "Rapport",
      "Table",
      "Tableau",
      "Vérificateur"
    ],
    "stateNames": [
      "Nominal",
      "Corrections élevées",
      "Contestation en attente",
      "Rupture de chaîne",
      "Intègre",
      "Anomalie",
      "Vérification en cours",
      "Non planifiée"
    ],
    "tokens": [
      "--amber-500",
      "--clay-500",
      "--emerald-500",
      "--mono",
      "--table"
    ],
    "designApi": [
      "GET /admin/reputation/entries?cursor=",
      "POST /admin/reputation/entries/corrections {subjectId, delta, motive, caseRef}",
      "GET /admin/reputation/summary",
      "POST /admin/audit/integrity/run {scope}",
      "GET /admin/audit/integrity/runs",
      "GET /admin/audit/integrity/report.pdf"
    ]
  },
  {
    "id": "ADM-35",
    "canon": "ADM — réputation (contestations)",
    "criticality": "P1",
    "archetype": "Écouter les recours",
    "screenCodes": [
      "ADM-35"
    ],
    "routes": [
      "/admin/reputation/contestations"
    ],
    "zoneKinds": [
      "cta",
      "doc",
      "kpi",
      "table"
    ],
    "componentRefs": [
      "Analyse",
      "Dossier",
      "Signal"
    ],
    "stateNames": [
      "Dans les délais",
      "Acceptée",
      "Rejetée",
      "SLA dépassé"
    ],
    "tokens": [
      "--amber-500",
      "--emerald-500",
      "--mono",
      "--table"
    ],
    "designApi": [
      "GET /admin/reputation/contests?cursor=",
      "POST /admin/reputation/contests/:id/decide {outcome, motive, delta?}"
    ]
  }
] as const;

export const ADMIN_DESIGN_SCREENS = [
  {
    "code": "ADM-01",
    "unitId": "ADM — dashboard général",
    "route": "/admin",
    "canonicalRoute": "/admin",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "kpi",
      "list",
      "table",
      "timeline",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/overview",
      "GET /admin/queues/summary",
      "GET /admin/activity?since=",
      "GET /admin/health/series?window=24h"
    ],
    "tokens": [
      "--surface-0",
      "--gold-500",
      "--clay-500",
      "--amber-500",
      "--mono",
      "--emerald-500"
    ]
  },
  {
    "code": "ADM-02",
    "unitId": "ADM — utilisateurs (liste & fiche)",
    "route": "/admin/utilisateurs",
    "canonicalRoute": "/admin/utilisateurs",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "form",
      "table",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/users?q=&role=&state=&cursor=",
      "POST /admin/exports {type, filters, motive}"
    ],
    "tokens": [
      "--surface-1",
      "--mono",
      "--clay-500",
      "--emerald-500",
      "--amber-500",
      "--table"
    ]
  },
  {
    "code": "ADM-03",
    "unitId": "ADM — utilisateurs (liste & fiche)",
    "route": "/admin/utilisateurs/:id",
    "canonicalRoute": "/admin/utilisateurs/:id",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "kpi",
      "list",
      "table",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/users/:id",
      "GET /admin/users/:id/timeline",
      "POST /admin/users/:id/notes",
      "POST /admin/users/:id/review"
    ],
    "tokens": [
      "--surface-1",
      "--mono",
      "--clay-500",
      "--amber-500",
      "--text-lo"
    ]
  },
  {
    "code": "ADM-04",
    "unitId": "ADM — blocage (geste)",
    "route": "/admin/utilisateurs/:id/blocage",
    "canonicalRoute": "/admin/utilisateurs/:id/blocage",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "form",
      "list",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /admin/users/:id/block {scope, duration, motive}",
      "POST /admin/users/:id/unblock",
      "POST /admin/users/:id/block/countersign"
    ],
    "tokens": [
      "--clay-500",
      "--clay-600",
      "--amber-500",
      "--mono",
      "--glass-3"
    ]
  },
  {
    "code": "ADM-05",
    "unitId": "ADM — blocage (geste)",
    "route": "/admin/blocages",
    "canonicalRoute": "/admin/blocages",
    "role": "ADMIN",
    "criticality": "P1",
    "zoneKinds": [
      "table",
      "kpi",
      "list",
      "cta"
    ],
    "variantOf": "ADM-04",
    "designApi": [
      "GET /admin/blocks?cursor=&filters=",
      "GET /admin/blocks/stats",
      "POST /admin/blocks/export"
    ],
    "tokens": [
      "--mono",
      "--clay-500",
      "--emerald-500",
      "--table"
    ]
  },
  {
    "code": "ADM-06",
    "unitId": "ADM — qualification (file & revue)",
    "route": "/admin/qualification",
    "canonicalRoute": "/admin/qualification",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "kpi",
      "table",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/qualification/queue?cursor=",
      "POST /admin/qualification/:id/claim",
      "GET /admin/qualification/sla"
    ],
    "tokens": [
      "--surface-1",
      "--amber-500",
      "--violet-500",
      "--mono",
      "--table"
    ]
  },
  {
    "code": "ADM-07",
    "unitId": "ADM — qualification (file & revue)",
    "route": "/admin/qualification/:id",
    "canonicalRoute": "/admin/qualification/:id",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "verdict",
      "list",
      "chat",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/qualification/:id",
      "POST /admin/qualification/:id/request-info",
      "POST /admin/qualification/:id/recuse"
    ],
    "tokens": [
      "--violet-500",
      "--gold-500",
      "--mono",
      "--glass-1",
      "--text-mid"
    ]
  },
  {
    "code": "ADM-08",
    "unitId": "ADM — qualification (décision)",
    "route": "/admin/qualification/:id/decision",
    "canonicalRoute": "/admin/qualification/:id/decision",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "verdict",
      "doc",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /admin/qualification/:id/decision {verdict, ruleRefs, facts, clientText}",
      "GET /admin/qualification/:id/effects-preview"
    ],
    "tokens": [
      "--emerald-500",
      "--clay-500",
      "--amber-500",
      "--mono",
      "--glass-2"
    ]
  },
  {
    "code": "ADM-09",
    "unitId": "ADM — qualification (décision)",
    "route": "/admin/qualification/historique",
    "canonicalRoute": "/admin/qualification/historique",
    "role": "ADMIN",
    "criticality": "P2",
    "zoneKinds": [
      "table",
      "kpi",
      "list",
      "cta"
    ],
    "variantOf": "ADM-08",
    "designApi": [
      "GET /admin/qualification/history?cursor=&filters=",
      "GET /admin/qualification/analytics",
      "POST /admin/qualification/export"
    ],
    "tokens": [
      "--mono",
      "--violet-500",
      "--amber-500",
      "--table"
    ]
  },
  {
    "code": "ADM-10",
    "unitId": "ADM — matching (runs & règles)",
    "route": "/admin/matching",
    "canonicalRoute": "/admin/matching",
    "role": "ADMIN",
    "criticality": "P1",
    "zoneKinds": [
      "kpi",
      "table",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/matching/runs?cursor=",
      "POST /admin/matching/runs/:id/retry",
      "GET /admin/matching/health"
    ],
    "tokens": [
      "--violet-500",
      "--mono",
      "--emerald-500",
      "--table"
    ]
  },
  {
    "code": "ADM-11",
    "unitId": "ADM — matching (audit)",
    "route": "/admin/matching/runs/:id",
    "canonicalRoute": "/admin/matching/runs/:id",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "ring",
      "table",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/matching/runs/:id",
      "GET /admin/matching/runs/:id/bias-tests",
      "POST /admin/matching/factors/:id/disable"
    ],
    "tokens": [
      "--violet-500",
      "--clay-500",
      "--amber-500",
      "--mono",
      "--table"
    ]
  },
  {
    "code": "ADM-12",
    "unitId": "ADM — matching (runs & règles)",
    "route": "/admin/matching/rulesets",
    "canonicalRoute": "/admin/matching/rulesets",
    "role": "ADMIN",
    "criticality": "P1",
    "zoneKinds": [
      "table",
      "form",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/matching/rulesets",
      "POST /admin/matching/rulesets/:v/simulate",
      "POST /admin/matching/rulesets/:v/activate"
    ],
    "tokens": [
      "--violet-500",
      "--gold-500",
      "--clay-500",
      "--mono"
    ]
  },
  {
    "code": "ADM-13",
    "unitId": "ADM — contrats (registre)",
    "route": "/admin/contrats",
    "canonicalRoute": "/admin/contrats",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "chips",
      "table",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/contracts?segment=&cursor=",
      "GET /admin/contracts/summary",
      "POST /admin/contracts/export"
    ],
    "tokens": [
      "--surface-1",
      "--gold-500",
      "--amber-500",
      "--mono",
      "--table"
    ]
  },
  {
    "code": "ADM-14",
    "unitId": "ADM — contrat (fiche, incidents & journal)",
    "route": "/admin/contrats/:id",
    "canonicalRoute": "/admin/contrats/:id",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "timeline",
      "table",
      "doc",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/contracts/:id",
      "POST /admin/contracts/:id/notes",
      "GET /admin/contracts/:id/versions"
    ],
    "tokens": [
      "--surface-1",
      "--gold-500",
      "--clay-500",
      "--mono",
      "--table"
    ]
  },
  {
    "code": "ADM-15",
    "unitId": "ADM — contrat (fiche, incidents & journal)",
    "route": "/admin/contrats/:id/incidents",
    "canonicalRoute": "/admin/contrats/:id/incidents",
    "role": "ADMIN",
    "criticality": "P1",
    "zoneKinds": [
      "table",
      "kpi",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/contracts/:id/incidents",
      "POST /admin/contracts/:id/incidents",
      "POST /admin/contracts/:id/preventions {type}"
    ],
    "tokens": [
      "--clay-500",
      "--amber-500",
      "--violet-500",
      "--mono"
    ]
  },
  {
    "code": "ADM-16",
    "unitId": "ADM — contrat (révision forcée)",
    "route": "/admin/contrats/:id/revision-forcee",
    "canonicalRoute": "/admin/contrats/:id/revision-forcee",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "form",
      "doc",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /admin/contracts/:id/forced-revision {type, legalBasis, motive, patch}",
      "POST /admin/contracts/:id/forced-revision/countersign"
    ],
    "tokens": [
      "--clay-600",
      "--clay-500",
      "--mono",
      "--glass-3",
      "--gold-500"
    ]
  },
  {
    "code": "ADM-17",
    "unitId": "ADM — contrat (fiche, incidents & journal)",
    "route": "/admin/contrats/:id/journal",
    "canonicalRoute": "/admin/contrats/:id/journal",
    "role": "ADMIN",
    "criticality": "P1",
    "zoneKinds": [
      "table",
      "kpi",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/contracts/:id/journal?cursor=",
      "POST /admin/contracts/:id/journal/verify",
      "GET /admin/contracts/:id/journal/export"
    ],
    "tokens": [
      "--mono",
      "--emerald-500",
      "--clay-500",
      "--table"
    ]
  },
  {
    "code": "ADM-18",
    "unitId": "ADM — paiements (vue globale & réconciliation)",
    "route": "/admin/paiements",
    "canonicalRoute": "/admin/paiements",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "kpi",
      "timeline",
      "table",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/payments/overview",
      "GET /admin/payments/events?since=",
      "GET /admin/psp/health"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--clay-500",
      "--mono",
      "--table"
    ]
  },
  {
    "code": "ADM-19",
    "unitId": "ADM — paiements (vue globale & réconciliation)",
    "route": "/admin/paiements/reconciliation",
    "canonicalRoute": "/admin/paiements/reconciliation",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "table",
      "kpi",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/reconciliation?period=&operator=",
      "POST /admin/reconciliation/gaps/:id/impute {motive, entry}",
      "GET /admin/reconciliation/summary"
    ],
    "tokens": [
      "--emerald-500",
      "--clay-500",
      "--amber-500",
      "--mono",
      "--table"
    ]
  },
  {
    "code": "ADM-20",
    "unitId": "ADM — paiements (anomalies, déclarations & incidents)",
    "route": "/admin/paiements/anomalies",
    "canonicalRoute": "/admin/paiements/anomalies",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "list",
      "table",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/payments/anomalies?cursor=",
      "POST /admin/payments/anomalies/:id/treat",
      "POST /admin/payments/anomalies/:id/false-positive"
    ],
    "tokens": [
      "--clay-500",
      "--clay-600",
      "--mono",
      "--amber-500",
      "--table"
    ]
  },
  {
    "code": "ADM-21",
    "unitId": "ADM — paiements (anomalies, déclarations & incidents)",
    "route": "/admin/paiements/declarations-externes",
    "canonicalRoute": "/admin/paiements/declarations-externes",
    "role": "ADMIN",
    "criticality": "P1",
    "zoneKinds": [
      "table",
      "doc",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/payments/external-declarations?cursor=",
      "POST /admin/payments/external-declarations/:id/decide"
    ],
    "tokens": [
      "--clay-500",
      "--amber-500",
      "--emerald-500",
      "--mono",
      "--glass-2"
    ]
  },
  {
    "code": "ADM-22",
    "unitId": "ADM — paiements (anomalies, déclarations & incidents)",
    "route": "/admin/paiements/incidents/:id",
    "canonicalRoute": "/admin/paiements/incidents/:id",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "timeline",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/payments/incidents/:id",
      "POST /admin/payments/incidents/:id/resolve {option, entries}",
      "POST /admin/payments/incidents/:id/escalate"
    ],
    "tokens": [
      "--clay-500",
      "--emerald-500",
      "--violet-500",
      "--mono",
      "--glass-2"
    ]
  },
  {
    "code": "ADM-23",
    "unitId": "ADM — salaire (confirmations & preuves OTP)",
    "route": "/admin/salaire/confirmations",
    "canonicalRoute": "/admin/salaire/confirmations",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "kpi",
      "table",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/salary/confirmations?cursor=",
      "POST /admin/salary/confirmations/:id/remind",
      "GET /admin/salary/confirmations/stats"
    ],
    "tokens": [
      "--emerald-500",
      "--amber-500",
      "--clay-500",
      "--mono",
      "--table"
    ]
  },
  {
    "code": "ADM-24",
    "unitId": "ADM — salaire (confirmations & preuves OTP)",
    "route": "/admin/salaire/preuves/:id",
    "canonicalRoute": "/admin/salaire/preuves/:id",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "table",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/salary/proofs/:id",
      "POST /admin/salary/proofs/:id/validate",
      "POST /admin/salary/proofs/:id/invalidate {motive}"
    ],
    "tokens": [
      "--mono",
      "--emerald-500",
      "--clay-500",
      "--amber-500",
      "--table"
    ]
  },
  {
    "code": "ADM-26",
    "unitId": "ADM — litiges (file)",
    "route": "/admin/litiges",
    "canonicalRoute": "/admin/litiges",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "kpi",
      "table",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/disputes?queue=&cursor=",
      "POST /admin/disputes/:id/claim",
      "GET /admin/disputes/sla"
    ],
    "tokens": [
      "--clay-500",
      "--amber-500",
      "--violet-500",
      "--mono",
      "--table"
    ]
  },
  {
    "code": "ADM-27",
    "unitId": "ADM — litige (fiche & pièces)",
    "route": "/admin/litiges/:id",
    "canonicalRoute": "/admin/litiges/:id",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "hero",
      "chat",
      "table",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/disputes/:id/full",
      "POST /admin/disputes/:id/request-evidence",
      "POST /admin/disputes/:id/recuse"
    ],
    "tokens": [
      "--clay-500",
      "--amber-500",
      "--mono",
      "--glass-1",
      "--text-mid"
    ]
  },
  {
    "code": "ADM-28",
    "unitId": "ADM — litige (fiche & pièces)",
    "route": "/admin/litiges/:id/pieces",
    "canonicalRoute": "/admin/litiges/:id/pieces",
    "role": "ADMIN",
    "criticality": "P1",
    "zoneKinds": [
      "list",
      "table",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/disputes/:id/evidence",
      "POST /admin/disputes/:id/evidence/:eid/admissibility",
      "GET /admin/disputes/:id/contradictions"
    ],
    "tokens": [
      "--mono",
      "--clay-500",
      "--amber-500",
      "--glass-1"
    ]
  },
  {
    "code": "ADM-29",
    "unitId": "ADM — litige (décision)",
    "route": "/admin/litiges/:id/decision",
    "canonicalRoute": "/admin/litiges/:id/decision",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "verdict",
      "doc",
      "price",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /admin/disputes/:id/decision {issue, facts, evidenceRefs, ruleRefs, calculation}",
      "GET /admin/disputes/:id/decision/preview-effects"
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
    "code": "ADM-30",
    "unitId": "ADM — litige (décision)",
    "route": "/admin/litiges/decisions",
    "canonicalRoute": "/admin/litiges/decisions",
    "role": "ADMIN",
    "criticality": "P1",
    "zoneKinds": [
      "table",
      "kpi",
      "list",
      "cta"
    ],
    "variantOf": "ADM-29",
    "designApi": [
      "GET /admin/disputes/decisions?cursor=",
      "GET /admin/disputes/decisions/analytics",
      "GET /admin/disputes/decisions/compare?ids="
    ],
    "tokens": [
      "--mono",
      "--violet-500",
      "--clay-500",
      "--table"
    ]
  },
  {
    "code": "ADM-31",
    "unitId": "ADM — remplacements (file & arbitrage)",
    "route": "/admin/remplacements",
    "canonicalRoute": "/admin/remplacements",
    "role": "ADMIN",
    "criticality": "P1",
    "zoneKinds": [
      "kpi",
      "table",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/replacements?cursor=",
      "POST /admin/replacements/:id/reassign",
      "GET /admin/replacements/stats"
    ],
    "tokens": [
      "--clay-500",
      "--amber-500",
      "--mono",
      "--table"
    ]
  },
  {
    "code": "ADM-32",
    "unitId": "ADM — remplacements (file & arbitrage)",
    "route": "/admin/remplacements/:id",
    "canonicalRoute": "/admin/remplacements/:id",
    "role": "ADMIN",
    "criticality": "P1",
    "zoneKinds": [
      "hero",
      "timeline",
      "table",
      "cta"
    ],
    "variantOf": "ADM-31",
    "designApi": [
      "GET /admin/replacements/:id/full",
      "POST /admin/replacements/:id/intervene"
    ],
    "tokens": [
      "--gold-500",
      "--clay-500",
      "--emerald-500",
      "--mono"
    ]
  },
  {
    "code": "ADM-33",
    "unitId": "ADM — remplacements (file & arbitrage)",
    "route": "/admin/remplacements/:id/arbitrage",
    "canonicalRoute": "/admin/remplacements/:id/arbitrage",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "verdict",
      "doc",
      "price",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /admin/replacements/:id/arbitrate {causeFound, payoutCorrect, perimeterValid, motive, entries}",
      "GET /admin/replacements/:id/arbitrate/preview"
    ],
    "tokens": [
      "--clay-600",
      "--gold-500",
      "--mono",
      "--glass-3"
    ]
  },
  {
    "code": "ADM-34",
    "unitId": "ADM — réputation (ledger, corrections & audit)",
    "route": "/admin/reputation",
    "canonicalRoute": "/admin/reputation",
    "role": "ADMIN",
    "criticality": "P0",
    "zoneKinds": [
      "kpi",
      "table",
      "form",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/reputation/entries?cursor=",
      "POST /admin/reputation/entries/corrections {subjectId, delta, motive, caseRef}",
      "GET /admin/reputation/summary"
    ],
    "tokens": [
      "--mono",
      "--emerald-500",
      "--clay-500",
      "--amber-500",
      "--table"
    ]
  },
  {
    "code": "ADM-35",
    "unitId": "ADM — réputation (contestations)",
    "route": "/admin/reputation/contestations",
    "canonicalRoute": "/admin/reputation/contestations",
    "role": "ADMIN",
    "criticality": "P1",
    "zoneKinds": [
      "table",
      "doc",
      "kpi",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "GET /admin/reputation/contests?cursor=",
      "POST /admin/reputation/contests/:id/decide {outcome, motive, delta?}"
    ],
    "tokens": [
      "--amber-500",
      "--emerald-500",
      "--mono",
      "--table"
    ]
  },
  {
    "code": "ADM-36",
    "unitId": "ADM — réputation (ledger, corrections & audit)",
    "route": "/admin/reputation/audit",
    "canonicalRoute": "/admin/reputation/audit",
    "role": "ADMIN",
    "criticality": "P1",
    "zoneKinds": [
      "kpi",
      "table",
      "list",
      "cta"
    ],
    "variantOf": null,
    "designApi": [
      "POST /admin/audit/integrity/run {scope}",
      "GET /admin/audit/integrity/runs",
      "GET /admin/audit/integrity/report.pdf"
    ],
    "tokens": [
      "--emerald-500",
      "--clay-500",
      "--mono",
      "--table"
    ]
  }
] as const;

export const ADMIN_UNIT_IDS: readonly string[] = ADMIN_DESIGN_UNITS.map((unit) => unit.id);
