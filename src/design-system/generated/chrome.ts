// GÉNÉRÉ PAR scripts/design/generate-frontend-tokens.py — NE PAS ÉDITER À LA MAIN.
// Source : design/llab/model.py, design/llab/content/*.py (CHROME_*).
// Régénérer : npm run design:tokens

/** Ordre canonique des familles. */
export const FAMILY_ORDER = ['PUB', 'EMP', 'PRE', 'ADM', 'RTC', 'SYS', 'FIN'] as const;

/** Libellés et intentions des familles (model.FAMILIES). */
export const FAMILY_LABELS = {
  PUB: {
    label: 'Famille 01 · Public & Onboarding',
    intent: 'Ouverture, confiance, entrée dans l\'acte de travail.',
  },
  EMP: {
    label: 'Famille 02 · Client / Employeur',
    intent: 'Cadrer, qualifier, contracter, payer, prouver.',
  },
  PRE: {
    label: 'Famille 03 · Prestataire / Candidat',
    intent: 'Trouver, postuler, exécuter, encaisser, réputation.',
  },
  ADM: {
    label: 'Famille 04 · Admin & Supervision',
    intent: 'Voir, décider, réconcilier, protéger.',
  },
  RTC: {
    label: 'Famille 05a · WebRTC & Temps réel',
    intent: 'Sessions d\'appel : pré-appel, invitation, actif, preuve.',
  },
  SYS: {
    label: 'Famille 05b · États système',
    intent: 'Chaque panne a un visage ; chaque sortie a une porte.',
  },
  FIN: {
    label: 'Famille 05c · Écran financier transversal',
    intent: 'Le modèle unique d\'affichage de la valeur.',
  },
} as const;

/** Chrome par défaut de chaque famille (appbar, dock, glyphe). */
export const CHROME_BY_FAMILY = {
  PUB: {
    appbar: null,
    dock: null,
    glyph: '◇',
  },
  EMP: {
    appbar: 'LE LABEUR',
    dock: ['Accueil', 'Missions', 'Contrats', 'Argent', 'Profil'],
    glyph: '◈',
  },
  PRE: {
    appbar: 'LE LABEUR',
    dock: ['Accueil', 'Missions', 'Candidatures', 'Salaire', 'Profil'],
    glyph: '◉',
  },
  ADM: {
    appbar: 'SUPERVISION',
    dock: ['Flux', 'Files', 'Litiges', 'Sécu', 'Infra'],
    glyph: '◆',
  },
  RTC: {
    appbar: 'SESSION',
    dock: null,
    glyph: '◉',
  },
  SYS: {
    appbar: null,
    dock: null,
    glyph: '▤',
  },
  FIN: {
    appbar: null,
    dock: null,
    glyph: '◈',
  },
} as const;
