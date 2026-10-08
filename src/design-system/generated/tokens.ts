// GÉNÉRÉ PAR scripts/design/generate-frontend-tokens.py — NE PAS ÉDITER À LA MAIN.
// Source : design/llab/tokens.py, design/llab/units.py.
// Régénérer : npm run design:tokens

export const NON_DEFINI = 'NON DÉFINIE' as const;
export type NonDefini = typeof NON_DEFINI;

/** Identité de la source (BRAND). */
export const TOKEN_SOURCE = {
  name: 'LE LABEUR',
  tagline: 'Le travail, cadré, prouvé, payé.',
  aesthetic: 'Cyber-Luxe Organique',
  voice: 'Sobre, souverain, juridiquement précis. Jamais bavard.',
  signature: 'Or = valeur & statut · Émeraude = vérité & validation · Noir = profondeur & focus',
  version: '1.0.0',
  date: '2026-10-07',
  file: 'design/llab/tokens.py',
} as const;

/** 211 états → 177 canons → 120 unités (design/llab/units.py). */
export const ARBITRAGE = {
  etats: 211,
  canons: 177,
  unites: 120,
} as const;

/** Palette « Basalte & Dorure » : lignes brutes de tokens.py. */
export const PALETTE = [
  {
    label: 'Fondations (Noir OLED, Basalte)',
    rows: [
      {
        cssVar: '--surface-0',
        key: 'surface0',
        value: '#050507',
        usage: 'OLED absolu. Fond racine de toutes les familles. Économie d\'énergie sur dalle AMOLED.',
      },
      {
        cssVar: '--surface-1',
        key: 'surface1',
        value: '#0A0A0F',
        usage: 'Basalte mat. Feuilles, corps de page, arrière-plan des listes.',
      },
      {
        cssVar: '--surface-2',
        key: 'surface2',
        value: '#101018',
        usage: 'Basalte clair. Cartes au repos, puces, lignes de tableau.',
      },
      {
        cssVar: '--surface-3',
        key: 'surface3',
        value: '#17171F',
        usage: 'Basalte relevé. Cartes actives, feuilles modales, encarts.',
      },
      {
        cssVar: '--surface-4',
        key: 'surface4',
        value: '#1E1E28',
        usage: 'Basalte sommité. Hover, éléments sélectionnés, chips actives.',
      },
      {
        cssVar: '--stroke-sub',
        key: 'strokeSub',
        value: 'rgba(255,255,255,0.08)',
        usage: 'Liseré sub-atomique. Séparateurs, bordures de cartes au repos.',
      },
      {
        cssVar: '--stroke-mid',
        key: 'strokeMid',
        value: 'rgba(255,255,255,0.14)',
        usage: 'Liseré standard. Contours de champs, bordures actives.',
      },
      {
        cssVar: '--stroke-sup',
        key: 'strokeSup',
        value: 'rgba(255,255,255,0.22)',
        usage: 'Liseré supérieur. Rim-light : arête haute des surfaces en verre.',
      },
    ],
  },
  {
    label: 'Dorure néon (statut, valeur, contrat)',
    rows: [
      {
        cssVar: '--gold-200',
        key: 'gold200',
        value: '#FFE9BD',
        usage: 'Or pâle. Dégradé de tête, texte sur or, halo interne.',
      },
      {
        cssVar: '--gold-300',
        key: 'gold300',
        value: '#FFD47A',
        usage: 'Or clair. Icônes de statut premium, badges « Or ».',
      },
      {
        cssVar: '--gold-400',
        key: 'gold400',
        value: '#E5A93C',
        usage: 'Dorure diffuse officielle LE LABEUR. Accents secondaires, tracés.',
      },
      {
        cssVar: '--gold-500',
        key: 'gold500',
        value: '#FFB800',
        usage: 'Or néon primaire. CTA de statut, prix prestataire, sceaux de contrat.',
      },
      {
        cssVar: '--gold-600',
        key: 'gold600',
        value: '#C98F1F',
        usage: 'Or profond. Dégradé de pied, ombre portée dorée (blur 24, α 0.28).',
      },
      {
        cssVar: '--gold-aura',
        key: 'goldAura',
        value: 'rgba(255,184,0,0.16)',
        usage: 'Halo doré de respiration (pulse). Jamais > 0.20.',
      },
      {
        cssVar: '--grad-gold',
        key: 'gradGold',
        value: 'linear-gradient(135deg,#FFE9BD 0%,#FFB800 46%,#C98F1F 100%)',
        usage: 'Dégradé signature « Lingot ». Réservé aux moments de valeur (paiement, contrat signé).',
      },
    ],
  },
  {
    label: 'Émeraude luminescente (vérité, validation, succès)',
    rows: [
      {
        cssVar: '--emerald-200',
        key: 'emerald200',
        value: '#B8FFE4',
        usage: 'Émeraude laiteuse. Texte sur émeraude, halo.',
      },
      {
        cssVar: '--emerald-400',
        key: 'emerald400',
        value: '#3BFFB8',
        usage: 'Émeraude vive. Icônes de succès, progression de timeline.',
      },
      {
        cssVar: '--emerald-500',
        key: 'emerald500',
        value: '#00F5A0',
        usage: 'Émeraude primaire. Validation juridique « Éligible », OTP confirmé, soumission acceptée.',
      },
      {
        cssVar: '--emerald-600',
        key: 'emerald600',
        value: '#00C97F',
        usage: 'Émeraude profonde. Pression, dégradés, ombres de succès.',
      },
      {
        cssVar: '--emerald-aura',
        key: 'emeraldAura',
        value: 'rgba(0,245,160,0.14)',
        usage: 'Halo de validation. Pulse 1× à l\'événement, puis extinction.',
      },
      {
        cssVar: '--grad-emerald',
        key: 'gradEmerald',
        value: 'linear-gradient(135deg,#B8FFE4 0%,#00F5A0 52%,#00C97F 100%)',
        usage: 'Dégradé « Sceau ». Signature OTP, validation de réception de salaire.',
      },
    ],
  },
  {
    label: 'Signaux (alertes, refus, système)',
    rows: [
      {
        cssVar: '--amber-500',
        key: 'amber500',
        value: '#FFB020',
        usage: 'Vigilance. Revue humaine en attente, échéance < 48 h.',
      },
      {
        cssVar: '--clay-500',
        key: 'clay500',
        value: '#FF5C7A',
        usage: 'Refus / litige. Mission bloquée, candidature rejetée, erreur 4xx métier.',
      },
      {
        cssVar: '--clay-600',
        key: 'clay600',
        value: '#D93A5C',
        usage: 'Refus profond. Dégradés d\'erreur, bouton destructif pressé.',
      },
      {
        cssVar: '--violet-500',
        key: 'violet500',
        value: '#7A5CFF',
        usage: 'Info système. Runs de matching, jobs, callbacks.',
      },
      {
        cssVar: '--cyan-500',
        key: 'cyan500',
        value: '#5CC8FF',
        usage: 'Réfraction spectrale. Franges de verre, WebRTC (canaux média).',
      },
      {
        cssVar: '--slate-500',
        key: 'slate500',
        value: '#6E6E7E',
        usage: 'Neutre désactivé. États disabled, métadonnées, placeholders.',
      },
    ],
  },
  {
    label: 'Typographie couleur (contrastes AA/AAA vérifiés sur --surface-0)',
    rows: [
      {
        cssVar: '--text-hi',
        key: 'textHi',
        value: '#F5F5F7',
        usage: 'Titres et valeurs. Contraste 18.1:1 (AAA).',
        contrastClaim: 18.1,
      },
      {
        cssVar: '--text-mid',
        key: 'textMid',
        value: '#A9A9B8',
        usage: 'Corps secondaire, descriptions. Contraste 8.4:1 (AAA).',
        contrastClaim: 8.4,
      },
      {
        cssVar: '--text-lo',
        key: 'textLo',
        value: '#6E6E7E',
        usage: 'Métadonnées, timestamps. Contraste 4.6:1 (AA). Jamais < 12 px.',
        contrastClaim: 4.6,
      },
      {
        cssVar: '--text-gold',
        key: 'textGold',
        value: '#FFD47A',
        usage: 'Prix, statuts premium. Contraste 12.9:1 (AAA).',
        contrastClaim: 12.9,
      },
      {
        cssVar: '--text-sign',
        key: 'textSign',
        value: '#B8FFE4',
        usage: 'Validations, confirmations. Contraste 15.2:1 (AAA).',
        contrastClaim: 15.2,
      },
    ],
  },
] as const;

/** Valeurs de couleur par clé camelCase (ex. COLOR.gold500). */
export const COLOR = {
  surface0: '#050507',
  surface1: '#0A0A0F',
  surface2: '#101018',
  surface3: '#17171F',
  surface4: '#1E1E28',
  strokeSub: 'rgba(255,255,255,0.08)',
  strokeMid: 'rgba(255,255,255,0.14)',
  strokeSup: 'rgba(255,255,255,0.22)',
  gold200: '#FFE9BD',
  gold300: '#FFD47A',
  gold400: '#E5A93C',
  gold500: '#FFB800',
  gold600: '#C98F1F',
  goldAura: 'rgba(255,184,0,0.16)',
  gradGold: 'linear-gradient(135deg,#FFE9BD 0%,#FFB800 46%,#C98F1F 100%)',
  emerald200: '#B8FFE4',
  emerald400: '#3BFFB8',
  emerald500: '#00F5A0',
  emerald600: '#00C97F',
  emeraldAura: 'rgba(0,245,160,0.14)',
  gradEmerald: 'linear-gradient(135deg,#B8FFE4 0%,#00F5A0 52%,#00C97F 100%)',
  amber500: '#FFB020',
  clay500: '#FF5C7A',
  clay600: '#D93A5C',
  violet500: '#7A5CFF',
  cyan500: '#5CC8FF',
  slate500: '#6E6E7E',
  textHi: '#F5F5F7',
  textMid: '#A9A9B8',
  textLo: '#6E6E7E',
  textGold: '#FFD47A',
  textSign: '#B8FFE4',
} as const;

/** Verre 1→4 : teinte, flou (px) et saturation (%). */
export const GLASS_LEVELS = {
  1: {
    cssVar: '--glass-1',
    usage: 'Verre de fond : panneaux pleine page, arrière-plans de section.',
    tint: 'rgba(255,255,255,0.04)',
    alpha: 0.04,
    blurPx: 12,
    saturatePct: 140,
  },
  2: {
    cssVar: '--glass-2',
    usage: 'Verre de carte : surfaces de contenu principales.',
    tint: 'rgba(255,255,255,0.07)',
    alpha: 0.07,
    blurPx: 20,
    saturatePct: 160,
  },
  3: {
    cssVar: '--glass-3',
    usage: 'Verre flottant : barres d\'action, sheets, tab-bars.',
    tint: 'rgba(255,255,255,0.10)',
    alpha: 0.1,
    blurPx: 32,
    saturatePct: 180,
  },
  4: {
    cssVar: '--glass-4',
    usage: 'Verre critique : modales de signature/OTP, overlays plein écran.',
    tint: 'rgba(255,255,255,0.16)',
    alpha: 0.16,
    blurPx: 48,
    saturatePct: 200,
  },
} as const;

/** Matériaux : réfraction, rim-light, bruit, squircle. */
export const MATERIALS = {
  refractionIndex: 1.52,
  opticalThicknessPx: 18,
  spectralFringePx: 1.5,
  blurLevelsPx: {
    1: 12,
    2: 20,
    3: 32,
    4: 48,
  },
  specular: {
    azimuthDeg: 35,
    elevationDeg: -25,
    modulationDeg: 12,
  },
  rimLight: {
    insetTopPx: 1,
    alphaMin: 0.06,
    alphaMax: 0.18,
  },
  noise: {
    baseFrequency: 0.8,
    opacity: 0.03,
    blend: 'overlay',
  },
  squircle: {
    exponent: 4.2,
    radiiTokensPx: [14, 22, 28, 34],
    radiiDocumentedPx: [14, 18, 22, 28, 34],
  },
} as const;

/** Triade typographique (Display, Texte, Mono). */
export const TYPE_FAMILIES = [
  {
    role: 'Display',
    family: 'Space Grotesk',
    weights: [600, 700],
  },
  {
    role: 'Texte',
    family: 'Inter',
    weights: [400, 500, 600],
  },
  {
    role: 'Mono',
    family: 'JetBrains Mono',
    weights: [400, 700],
  },
] as const;

/** Échelle typographique (taille, graisse, interligne, tracking em). */
export const TYPE_SCALE = [
  {
    cssName: '--display-1',
    key: 'display1',
    sizePx: 48,
    weight: 700,
    lineHeightPx: 52,
    trackingEm: -0.02,
    usage: 'Chiffre héros : montant de salaire, total client, verdict de qualification.',
  },
  {
    cssName: '--display-2',
    key: 'display2',
    sizePx: 40,
    weight: 700,
    lineHeightPx: 46,
    trackingEm: -0.02,
    usage: 'Titres de plein écran : splash, verdicts, succès.',
  },
  {
    cssName: '--title-1',
    key: 'title1',
    sizePx: 28,
    weight: 600,
    lineHeightPx: 34,
    trackingEm: -0.01,
    usage: 'Titres de page (H1 d\'écran) : « Mes missions », « Ma réputation ».',
  },
  {
    cssName: '--title-2',
    key: 'title2',
    sizePx: 22,
    weight: 600,
    lineHeightPx: 28,
    trackingEm: -0.01,
    usage: 'Titres de section, en-têtes de feuille.',
  },
  {
    cssName: '--title-3',
    key: 'title3',
    sizePx: 18,
    weight: 600,
    lineHeightPx: 24,
    trackingEm: 0,
    usage: 'Titres de carte, noms de candidats, lignes de contrat.',
  },
  {
    cssName: '--headline',
    key: 'headline',
    sizePx: 18,
    weight: 500,
    lineHeightPx: 26,
    trackingEm: 0,
    usage: 'Sous-titres parlants, résumés d\'état.',
  },
  {
    cssName: '--body',
    key: 'body',
    sizePx: 16,
    weight: 400,
    lineHeightPx: 24,
    trackingEm: 0,
    usage: 'Corps de texte, descriptions, messages.',
  },
  {
    cssName: '--callout',
    key: 'callout',
    sizePx: 15,
    weight: 500,
    lineHeightPx: 22,
    trackingEm: 0,
    usage: 'Encarts, notes juridiques, aides contextuelles.',
  },
  {
    cssName: '--caption',
    key: 'caption',
    sizePx: 13,
    weight: 500,
    lineHeightPx: 18,
    trackingEm: 0.01,
    usage: 'Légendes, timestamps, métadonnées de carte.',
  },
  {
    cssName: '--micro',
    key: 'micro',
    sizePx: 11,
    weight: 600,
    lineHeightPx: 14,
    trackingEm: 0.06,
    usage: 'Micro-libellés, étapes de wizard, compteurs d\'onglet.',
  },
  {
    cssName: '--caps',
    key: 'caps',
    sizePx: 11,
    weight: 700,
    lineHeightPx: 14,
    trackingEm: 0.12,
    usage: 'Étiquettes capitales : « PRIX PRESTATAIRE », « FRAIS SAAS ».',
  },
  {
    cssName: '--price',
    key: 'price',
    sizePx: 34,
    weight: 700,
    lineHeightPx: 38,
    trackingEm: -0.01,
    usage: 'Montant en contexte : prix prestataire, frais, total (tnum obligatoire).',
  },
] as const;

export const TYPE_RULES = ['Un seul --display-1 par écran. Deux = aucune hiérarchie.', 'Tout montant FCFA/€ utilise Inter tabular-nums + espace fine insécable avant le symbole.', 'La typographie cinétique (translée/exposée au scroll) ne s\'applique QU\'aux --display et --title-1 : le corps reste immobile pour la lisibilité.', 'Interdiction d\'italique hors citations juridiques (CGU, clauses de contrat).', 'Le Mono est un matériau de preuve : références, hash, OTP, versions R2 — jamais du texte marketing.'] as const;

/** Unité 4 px, échelle, grilles mobile/tablette/desktop, rythme vertical. */
export const SPACING = {
  baseUnitPx: 4,
  scalePx: [2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96],
  grid: {
    mobile: {
      columns: 4,
      gutterPx: 16,
      marginPx: 20,
    },
    tablet: {
      columns: 8,
      gutterPx: 20,
      marginPx: 32,
    },
    desktop: {
      columns: 12,
      gutterPx: 24,
      marginPx: 40,
      maxWidthPx: 1180,
    },
  },
  verticalRhythmPx: {
    block: 8,
    section: 24,
    verdict: 40,
  },
} as const;

/** Rayons et squircles (superellipse n = 4.2). */
export const RADII = [
  {
    cssVar: '--r-2',
    px: 4,
    exponent: null,
    kind: 'radius',
  },
  {
    cssVar: '--r-3',
    px: 8,
    exponent: null,
    kind: 'radius',
  },
  {
    cssVar: '--r-4',
    px: 12,
    exponent: null,
    kind: 'radius',
  },
  {
    cssVar: '--r-5',
    px: 16,
    exponent: null,
    kind: 'radius',
  },
  {
    cssVar: '--r-6',
    px: 20,
    exponent: null,
    kind: 'radius',
  },
  {
    cssVar: '--r-7',
    px: 24,
    exponent: null,
    kind: 'radius',
  },
  {
    cssVar: '--r-full',
    px: 999,
    exponent: null,
    kind: 'full',
  },
  {
    cssVar: '--squircle-14',
    px: 14,
    exponent: 4.2,
    kind: 'squircle',
  },
  {
    cssVar: '--squircle-22',
    px: 22,
    exponent: 4.2,
    kind: 'squircle',
  },
  {
    cssVar: '--squircle-28',
    px: 28,
    exponent: 4.2,
    kind: 'squircle',
  },
  {
    cssVar: '--squircle-34',
    px: 34,
    exponent: 4.2,
    kind: 'squircle',
  },
] as const;

/** Élévations E0→E4. haloColor = NON_DEFINI quand la source ne donne pas de valeur. */
export const ELEVATION = [
  {
    level: 0,
    label: 'E0 — Plat',
    shadow: null,
    rimAlpha: null,
    haloColor: null,
    usage: 'Listes internes, séparateurs',
  },
  {
    level: 1,
    label: 'E1 — Posée',
    shadow: '0px 1px 2px rgba(0,0,0,0.40)',
    offsetYPx: 1,
    blurPx: 2,
    alpha: 0.4,
    rimAlpha: 0.06,
    halo: null,
    haloColor: NON_DEFINI,
    usage: 'Cartes au repos',
  },
  {
    level: 2,
    label: 'E2 — Soule­vée',
    shadow: '0px 8px 24px rgba(0,0,0,0.55)',
    offsetYPx: 8,
    blurPx: 24,
    alpha: 0.55,
    rimAlpha: 0.1,
    halo: null,
    haloColor: NON_DEFINI,
    usage: 'Cartes actives, hover',
  },
  {
    level: 3,
    label: 'E3 — Flottante',
    shadow: '0px 16px 48px rgba(0,0,0,0.65)',
    offsetYPx: 16,
    blurPx: 48,
    alpha: 0.65,
    rimAlpha: 0.14,
    halo: 'halo contextuel',
    haloColor: NON_DEFINI,
    usage: 'Sheets, popovers, tab-bar',
  },
  {
    level: 4,
    label: 'E4 — Critique',
    shadow: '0px 24px 72px rgba(0,0,0,0.72)',
    offsetYPx: 24,
    blurPx: 72,
    alpha: 0.72,
    rimAlpha: 0.18,
    halo: 'halo doré/émeraude',
    haloColor: NON_DEFINI,
    usage: 'OTP, signature, paie confirmée',
  },
] as const;

/** Quatre ressorts officiels : snap, soft, heavy, pop. */
export const SPRINGS = [
  {
    name: 'snap',
    stiffness: 300,
    damping: 20,
    mass: 1.0,
    approxMs: 320,
    usage: 'Taps, toggles, sélection, chips. Réponse < 100 ms obligatoire.',
  },
  {
    name: 'soft',
    stiffness: 240,
    damping: 26,
    mass: 1.0,
    approxMs: 420,
    usage: 'Entrées de carte, apparition de listes.',
  },
  {
    name: 'heavy',
    stiffness: 180,
    damping: 28,
    mass: 1.2,
    approxMs: 560,
    usage: 'Sheets, modales, verdicts de qualification.',
  },
  {
    name: 'pop',
    stiffness: 420,
    damping: 16,
    mass: 0.9,
    approxMs: 240,
    usage: 'Badges, pastilles, micro-rewards (candidature envoyée).',
  },
] as const;

/** Courbes cubic-bezier officielles. */
export const EASINGS = [
  {
    cssVar: '--ease-labeur-out',
    bezier: [0.22, 1.0, 0.36, 1.0],
    usage: 'Sorties, révélations, sortie de modale',
  },
  {
    cssVar: '--ease-labeur-inout',
    bezier: [0.65, 0.0, 0.35, 1.0],
    usage: 'Transitions d\'état de page, morphing de tab-bar',
  },
  {
    cssVar: '--ease-anticipate',
    bezier: [0.68, -0.55, 0.27, 1.55],
    usage: 'Rare : annulation, refus (jamais sur succès)',
  },
] as const;

/** Durées officielles (ms) et stagger plafonné. */
export const DURATIONS_MS = {
  micro: 120,
  base: 240,
  page: 420,
  cinematique: 640,
  haloPulseMs: 2400,
  staggerMsPerIndex: 60,
  staggerCap: 8,
} as const;

export const MOTION_RULES = ['Toute apparition respecte l\'ordre Z : fond → surface → contenu → action.', 'Le stagger est plafonné à 8 éléments : au-delà, apparition par blocs de 8.', 'Aucune animation ne bloque l\'interaction : l\'écran est tappable dès l\'image 1.', 'prefers-reduced-motion → springs remplacés par fade 120 ms, halos figés à 40% d\'opacité.', 'Le gyroscope modifie la spécularité (±12° max), jamais la position du contenu.'] as const;

/** Intentions haptiques (non actionnées sur le Web : aucune valeur définie). */
export const HAPTICS = [
  {
    id: 'light',
    usage: 'Sélection de chip, toggle, tab',
  },
  {
    id: 'medium',
    usage: 'Candidature envoyée, paiement déclaré, OTP chiffre saisi',
  },
  {
    id: 'heavy',
    usage: 'Contrat signé, salaire confirmé reçu, verdict « Éligible »',
  },
  {
    id: 'rigid',
    usage: 'Erreur de validation, refus, rejet de pièce R2',
  },
] as const;

/** Registre C-01 → C-20. */
export const COMPONENT_REGISTRY = [
  {
    id: 'C-01',
    name: 'GlassSurface',
    definition: 'Surface verre niveaux 1-4, réfraction gyroscopique, noise overlay. Base de tout panneau.',
  },
  {
    id: 'C-02',
    name: 'SquircleCard',
    definition: 'Carte superellipse 22-28, élévation E1/E2, rim-light adaptatif.',
  },
  {
    id: 'C-03',
    name: 'NeoPressButton',
    definition: 'Bouton neumorphique : enfoncement par ombres internes, relief par light-source gyro.',
  },
  {
    id: 'C-04',
    name: 'StatusSeal',
    definition: 'Sceau de statut (Or / Émeraude / Ambre / Clay) : anneau conique + glyphe + label. Invariant de vérité d\'état.',
  },
  {
    id: 'C-05',
    name: 'PriceBreakdown',
    definition: 'Module financier [Prix Prestataire] + [Frais SaaS] = [Total Client]. Interdit toute variante d\'affichage (FIN-TRANSVERSAL).',
  },
  {
    id: 'C-06',
    name: 'TimelineTrack',
    definition: 'Frise d\'exécution de mission (étapes, jalons, preuves). Point actif pulsé.',
  },
  {
    id: 'C-07',
    name: 'OTPField',
    definition: 'Champ OTP 6 cases, saisie mono, auto-avance, haptique medium, sceau émeraude à validation.',
  },
  {
    id: 'C-08',
    name: 'ContractFolio',
    definition: 'Folio de contrat : référence Mono, version R2, pagination de clauses, zone de signature.',
  },
  {
    id: 'C-09',
    name: 'CandidateRow',
    definition: 'Ligne de candidat : avatar halo, score de matching, chips de compétences, action rapide.',
  },
  {
    id: 'C-10',
    name: 'MatchScoreRing',
    definition: 'Anneau de score de matching 0-100, dégradé or→émeraude, ségrégation explicable (EMP-19).',
  },
  {
    id: 'C-11',
    name: 'DocumentCardR2',
    definition: 'Pièce justificative versionnée R2 : vignette, hash court, statut de vérification, historique.',
  },
  {
    id: 'C-12',
    name: 'LedgerRow',
    definition: 'Ligne de grand livre : delta signés (+/−), solde après opération, horodatage Mono, motif traçable.',
  },
  {
    id: 'C-13',
    name: 'DisputeThread',
    definition: 'Fil de litige structuré : pièces, décisions, échéances, bandeau admin-review.',
  },
  {
    id: 'C-14',
    name: 'KineticText',
    definition: 'Texte cinétique lié au scroll (TranslateY/ClipPath par mot) pour --display et --title-1.',
  },
  {
    id: 'C-15',
    name: 'ParticleCanvas',
    definition: 'Canvas GLSL 120 fps : champ particulaire génératif, densité modulée par l\'état de l\'écran.',
  },
  {
    id: 'C-16',
    name: 'CallSurface',
    definition: 'Surface WebRTC : PIP local, indicateurs réseau, enregistrement, transcription temps réel.',
  },
  {
    id: 'C-17',
    name: 'OpsQueueRow',
    definition: 'Ligne de queue d\'opérations (jobs, cron, dead-letter) : tentatives, backoff, action requeue.',
  },
  {
    id: 'C-18',
    name: 'SecEventCard',
    definition: 'Carte d\'événement sécurité (IDOR, replay, rate-limit) : sévérité, acteur, action recommandée.',
  },
  {
    id: 'C-19',
    name: 'StateGuard',
    definition: 'Habillage d\'états système (SYS-01→15) : glyphe, explication, sortie de secours. Réutilisé par toutes les familles.',
  },
  {
    id: 'C-20',
    name: 'BottomDock',
    definition: 'Dock de navigation basse famille-aware, verre 3, indicateur actif morphique (ease-inout).',
  },
] as const;

export const ICONOGRAPHY = ['Tracé 1.5 px, grille 24, terminaisons arrondies, coins 2 px', 'Glyphes de statut remplis à 12% d\'opacité + tracé plein', 'Jeu de 168 icônes, 6 catégories (Travail, Contrat, Argent, Preuve, Sécurité, Système)'] as const;

export const SOUND_RULES = ['Aucun son d\'interface par défaut. Silence = luxe.', 'Sons réservés : verdict Éligible (accord or doux, −18 LUFS), salaire confirmé (sceau, 320 ms)', 'Toujours doublés d\'une haptique + d\'un état visuel persistant (jamais l\'unique canal).'] as const;

export const DATAVIZ_RULES = ['Séries : or (#FFB800), émeraude (#00F5A0), cyan (#5CC8FF), violet (#7A5CFF), clay (#FF5C7A)', 'Fonds de graphe transparents sur verre, grilles en stroke-sub uniquement', 'Chiffres en Mono tabular pour les axes ; Inter pour les légendes'] as const;

/** Accessibilité : contrastes, cibles tactiles, focus. */
export const A11Y = {
  textContrastMin: 4.5,
  textContrastBelowPx: 18,
  uiContrastMin: 3.0,
  touchTargetMobilePx: 44,
  touchTargetDesktopPx: 40,
  focusRingPx: 2,
  focusHaloPx: 4,
  focusHaloAlpha: 0.24,
  rules: ['Contraste ≥ 4.5:1 pour tout texte < 18 px ; ≥ 3:1 pour les composants d\'interface.', 'Cibles tactiles ≥ 44 × 44 px (mobile), ≥ 40 px (desktop).', 'Ordre de focus = ordre visuel ; focus ring : 2 px --gold-500 + halo 4 px α 0.24.', 'Le statut n\'est JAMAIS porté par la couleur seule : glyphe + libellé + forme.', 'Les halos pulsés sont décoratifs (aria-hidden) et coupés sous prefers-reduced-motion.', 'Tous les montants sont lus par les lecteurs d\'écran avec les trois valeurs financières explicites.'],
} as const;

/** Budgets de performance (non mesurés dans cette fondation). */
export const PERF = {
  lcpBudgetMs: 800,
  interactionBudgetMs: 100,
  frameBudgetMs: 8.33,
  frameRateHz: 120,
  deepBlurThresholdPx: 24,
  deepSurfacesMax: 2,
  lowMemoryRamGb: 4,
  virtualizeListsAbove: 20,
  rules: ['Budget écran : 1er rendu utile < 800 ms (4G), interaction < 100 ms, frame 8.33 ms (120 Hz).', 'Le champ de particules vit sur son propre layer GPU ; jamais de reflow du contenu.', 'Blur > 24 px limité à 2 surfaces simultanées par écran (coût raster).', 'Les listes > 20 items sont virtualisées ; les images passent par le CDN Cloudflare + R2 (AVIF/WebP).', 'Backdrop-filter désactivé sur appareils < 4 Go RAM (fallback verre opaque --surface-2 + noise).'],
} as const;

/** Invariants produit INV-1 → INV-6. */
export const INVARIANTS = ['INV-1 · FIN : [Prix Prestataire] + [Frais SaaS LE LABEUR] = [Total Client]. Trois lignes, toujours, dans cet ordre. Le prestataire ne voit JAMAIS le frais SaaS comme une ponction sur son prix.', 'INV-2 · QUALIF : une mission n\'est publiable que si le verdict est Éligible ; Revue = attente humaine ; Bloquée = aucune publication possible.', 'INV-3 · SIGNE : aucun contrat n\'est Actif sans double signature horodatée + empreinte R2 des deux parties.', 'INV-4 · OTP : la réception de salaire n\'est réputée acquise qu\'après OTP émeraude du prestataire (preuve 12 caractères).', 'INV-5 · RÉPUTATION : le ledger est append-only. Toute correction est une écriture compensatoire visible, jamais une suppression.', 'INV-6 · SÉCURITÉ : aucun secret, token, DSN ou clé n\'est rendu côté client. Les écrans ADM d\'infrastructure affichent des états, jamais des valeurs sensibles.'] as const;

/** Jetons cités par les fiches et absents de tokens.py : signalés, jamais créés. */
export const UNDEFINED_TOKEN_REFERENCES = [
  {
    token: '--mono',
    note: 'Alias de la famille Mono (JetBrains Mono, TYPO.familles) — pas de jeton --mono explicite dans tokens.py.',
    citedBy: 179,
  },
  {
    token: '--table',
    note: 'NON DÉFINIE dans tokens.py — aucune valeur créée.',
    citedBy: 42,
  },
] as const;
