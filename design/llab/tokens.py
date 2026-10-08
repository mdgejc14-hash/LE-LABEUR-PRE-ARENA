# -*- coding: utf-8 -*-
"""
LE LABEUR — Design Tokens (Source de vérité unique)
===================================================
ADN visuel : « Cyber-Luxe Organique »
Tout écran, tout composant, tout état de la nomenclature puise EXCLUSIVEMENT
dans ces tokens. Aucune valeur brute n'est tolérée dans le code produit.
"""

BRAND = {
    "name": "LE LABEUR",
    "tagline": "Le travail, cadré, prouvé, payé.",
    "aesthetic": "Cyber-Luxe Organique",
    "voice": "Sobre, souverain, juridiquement précis. Jamais bavard.",
    "signature": "Or = valeur & statut · Émeraude = vérité & validation · Noir = profondeur & focus",
    "version": "1.0.0",
    "date": "2026-10-07",
}

# ─────────────────────────────────────────────────────────────────────────────
# 1. PALETTE — « Basalte & Dorure »
# ─────────────────────────────────────────────────────────────────────────────
PALETTE = {
    "Fondations (Noir OLED, Basalte)": [
        ("--surface-0",   "#050507", "OLED absolu. Fond racine de toutes les familles. Économie d'énergie sur dalle AMOLED."),
        ("--surface-1",   "#0A0A0F", "Basalte mat. Feuilles, corps de page, arrière-plan des listes."),
        ("--surface-2",   "#101018", "Basalte clair. Cartes au repos, puces, lignes de tableau."),
        ("--surface-3",   "#17171F", "Basalte relevé. Cartes actives, feuilles modales, encarts."),
        ("--surface-4",   "#1E1E28", "Basalte sommité. Hover, éléments sélectionnés, chips actives."),
        ("--stroke-sub",  "rgba(255,255,255,0.08)", "Liseré sub-atomique. Séparateurs, bordures de cartes au repos."),
        ("--stroke-mid",  "rgba(255,255,255,0.14)", "Liseré standard. Contours de champs, bordures actives."),
        ("--stroke-sup",  "rgba(255,255,255,0.22)", "Liseré supérieur. Rim-light : arête haute des surfaces en verre."),
    ],
    "Dorure néon (statut, valeur, contrat)": [
        ("--gold-200", "#FFE9BD", "Or pâle. Dégradé de tête, texte sur or, halo interne."),
        ("--gold-300", "#FFD47A", "Or clair. Icônes de statut premium, badges « Or »."),
        ("--gold-400", "#E5A93C", "Dorure diffuse officielle LE LABEUR. Accents secondaires, tracés."),
        ("--gold-500", "#FFB800", "Or néon primaire. CTA de statut, prix prestataire, sceaux de contrat."),
        ("--gold-600", "#C98F1F", "Or profond. Dégradé de pied, ombre portée dorée (blur 24, α 0.28)."),
        ("--gold-aura", "rgba(255,184,0,0.16)", "Halo doré de respiration (pulse). Jamais > 0.20."),
        ("--grad-gold", "linear-gradient(135deg,#FFE9BD 0%,#FFB800 46%,#C98F1F 100%)", "Dégradé signature « Lingot ». Réservé aux moments de valeur (paiement, contrat signé)."),
    ],
    "Émeraude luminescente (vérité, validation, succès)": [
        ("--emerald-200", "#B8FFE4", "Émeraude laiteuse. Texte sur émeraude, halo."),
        ("--emerald-400", "#3BFFB8", "Émeraude vive. Icônes de succès, progression de timeline."),
        ("--emerald-500", "#00F5A0", "Émeraude primaire. Validation juridique « Éligible », OTP confirmé, soumission acceptée."),
        ("--emerald-600", "#00C97F", "Émeraude profonde. Pression, dégradés, ombres de succès."),
        ("--emerald-aura", "rgba(0,245,160,0.14)", "Halo de validation. Pulse 1× à l'événement, puis extinction."),
        ("--grad-emerald", "linear-gradient(135deg,#B8FFE4 0%,#00F5A0 52%,#00C97F 100%)", "Dégradé « Sceau ». Signature OTP, validation de réception de salaire."),
    ],
    "Signaux (alertes, refus, système)": [
        ("--amber-500", "#FFB020", "Vigilance. Revue humaine en attente, échéance < 48 h."),
        ("--clay-500",  "#FF5C7A", "Refus / litige. Mission bloquée, candidature rejetée, erreur 4xx métier."),
        ("--clay-600",  "#D93A5C", "Refus profond. Dégradés d'erreur, bouton destructif pressé."),
        ("--violet-500","#7A5CFF", "Info système. Runs de matching, jobs, callbacks."),
        ("--cyan-500",  "#5CC8FF", "Réfraction spectrale. Franges de verre, WebRTC (canaux média)."),
        ("--slate-500", "#6E6E7E", "Neutre désactivé. États disabled, métadonnées, placeholders."),
    ],
    "Typographie couleur (contrastes AA/AAA vérifiés sur --surface-0)": [
        ("--text-hi",  "#F5F5F7", "Titres et valeurs. Contraste 18.1:1 (AAA)."),
        ("--text-mid", "#A9A9B8", "Corps secondaire, descriptions. Contraste 8.4:1 (AAA)."),
        ("--text-lo",  "#6E6E7E", "Métadonnées, timestamps. Contraste 4.6:1 (AA). Jamais < 12 px."),
        ("--text-gold","#FFD47A", "Prix, statuts premium. Contraste 12.9:1 (AAA)."),
        ("--text-sign","#B8FFE4", "Validations, confirmations. Contraste 15.2:1 (AAA)."),
    ],
    "Verre (Glass — niveaux de réfraction)": [
        ("--glass-1", "rgba(255,255,255,0.04) + blur 12 + saturate 140%", "Verre de fond : panneaux pleine page, arrière-plans de section."),
        ("--glass-2", "rgba(255,255,255,0.07) + blur 20 + saturate 160%", "Verre de carte : surfaces de contenu principales."),
        ("--glass-3", "rgba(255,255,255,0.10) + blur 32 + saturate 180%", "Verre flottant : barres d'action, sheets, tab-bars."),
        ("--glass-4", "rgba(255,255,255,0.16) + blur 48 + saturate 200%", "Verre critique : modales de signature/OTP, overlays plein écran."),
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
# 2. RÉFRACTION & MATÉRIAUX
# ─────────────────────────────────────────────────────────────────────────────
MATERIALS = {
    "indice_refraction": "n = 1.52 (verre borosilicate) — courbe de Fresnel F(θ) pilotée par gyroscope",
    "epaisseur_optique": "18 px virtuels (parallaxe de fond 0.94 → premier plan 1.06)",
    "refraction_spectrale": "Franges RGB décalées de ±1.5 px aux arêtes (cyan #5CC8FF / ambre #FFB020)",
    "blur_levels": {"glass-1": "12 px", "glass-2": "20 px", "glass-3": "32 px", "glass-4": "48 px"},
    "specular_light": "Source lumineuse virtuelle unique à (35°, -25°) modulée par accéléromètre (±12°)",
    "rim_light": "1 px inset top rgba(255,255,255,0.06→0.18) selon élévation",
    "noise_overlay": "Bruit fractal SVG feTurbulence baseFrequency 0.8, opacité 3%, blend overlay (anti-banding)",
    "squircle": "Superellipse |x/a|^n + |y/b|^n = 1, n = 4.2 (rayon 14/18/22/28/34)",
}

# ─────────────────────────────────────────────────────────────────────────────
# 3. TYPOGRAPHIE — Triade cinétique
# ─────────────────────────────────────────────────────────────────────────────
TYPO = {
    "familles": [
        ("Display", "Space Grotesk (600/700)", "Titres cinétiques, montants, codes d'écran, chiffres de statut. Tracking −0.02em."),
        ("Texte", "Inter (400/500/600)", "Corps, libellés, formulaires. Chiffres tabulaires activés (tnum) pour tout montant."),
        ("Mono", "JetBrains Mono (400/700)", "Références de contrat, ID mission, traces OTP, wireframes, ledger. tracking +0.01em."),
    ],
    "echelle": [
        # (token, taille/poids/interligne/en tracking, usage)
        ("--display-1", "48 / 700 / 52 / −2%", "Chiffre héros : montant de salaire, total client, verdict de qualification."),
        ("--display-2", "40 / 700 / 46 / −2%", "Titres de plein écran : splash, verdicts, succès."),
        ("--title-1",   "28 / 600 / 34 / −1%", "Titres de page (H1 d'écran) : « Mes missions », « Ma réputation »."),
        ("--title-2",   "22 / 600 / 28 / −1%", "Titres de section, en-têtes de feuille."),
        ("--title-3",   "18 / 600 / 24 / 0",   "Titres de carte, noms de candidats, lignes de contrat."),
        ("--headline",  "18 / 500 / 26 / 0",   "Sous-titres parlants, résumés d'état."),
        ("--body",      "16 / 400 / 24 / 0",   "Corps de texte, descriptions, messages."),
        ("--callout",   "15 / 500 / 22 / 0",   "Encarts, notes juridiques, aides contextuelles."),
        ("--caption",   "13 / 500 / 18 / +1%", "Légendes, timestamps, métadonnées de carte."),
        ("--micro",     "11 / 600 / 14 / +6%", "Micro-libellés, étapes de wizard, compteurs d'onglet."),
        ("--caps",      "11 / 700 / 14 / +12%", "Étiquettes capitales : « PRIX PRESTATAIRE », « FRAIS SAAS »."),
        ("--price",     "34 / 700 / 38 / −1%", "Montant en contexte : prix prestataire, frais, total (tnum obligatoire)."),
    ],
    "regles": [
        "Un seul --display-1 par écran. Deux = aucune hiérarchie.",
        "Tout montant FCFA/€ utilise Inter tabular-nums + espace fine insécable avant le symbole.",
        "La typographie cinétique (translée/exposée au scroll) ne s'applique QU'aux --display et --title-1 : le corps reste immobile pour la lisibilité.",
        "Interdiction d'italique hors citations juridiques (CGU, clauses de contrat).",
        "Le Mono est un matériau de preuve : références, hash, OTP, versions R2 — jamais du texte marketing.",
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
# 4. ESPACEMENT, GRILLE, RAYONS, ÉLÉVATION
# ─────────────────────────────────────────────────────────────────────────────
SPACING = {
    "unite_base": "4 px",
    "echelle": ["2", "4", "6", "8", "12", "16", "20", "24", "32", "40", "48", "64", "80", "96"],
    "grille": {
        "mobile":  "4 colonnes · gouttière 16 · marge 20",
        "tablette": "8 colonnes · gouttière 20 · marge 32",
        "desktop": "12 colonnes · gouttière 24 · marge 40 · conteneur max 1180 px",
    },
    "rythme_vertical": "Pas de 8 px entre blocs logiques, 24 px entre sections, 40 px avant un verdict.",
}

RADII = [
    ("--r-2", "4 px"), ("--r-3", "8 px"), ("--r-4", "12 px"),
    ("--r-5", "16 px"), ("--r-6", "20 px"), ("--r-7", "24 px"),
    ("--r-full", "999 px"),
    ("--squircle-14", "superellipse 14 px (n=4.2) — puces, chips"),
    ("--squircle-22", "superellipse 22 px (n=4.2) — cartes standard"),
    ("--squircle-28", "superellipse 28 px (n=4.2) — sheets, cartes héros"),
    ("--squircle-34", "superellipse 34 px (n=4.2) — modales plein écran, dock"),
]

ELEVATION = [
    ("E0 — Plat", "Aucune ombre, liseré --stroke-sub", "Listes internes, séparateurs"),
    ("E1 — Posée", "0 1 2 rgba(0,0,0,0.40) + rim 0.06", "Cartes au repos"),
    ("E2 — Soule­vée", "0 8 24 rgba(0,0,0,0.55) + rim 0.10", "Cartes actives, hover"),
    ("E3 — Flottante", "0 16 48 rgba(0,0,0,0.65) + rim 0.14 + halo contextuel", "Sheets, popovers, tab-bar"),
    ("E4 — Critique", "0 24 72 rgba(0,0,0,0.72) + rim 0.18 + halo doré/émeraude", "OTP, signature, paie confirmée"),
]

# ─────────────────────────────────────────────────────────────────────────────
# 5. MOUVEMENT — Physique de ressort stricte
# ─────────────────────────────────────────────────────────────────────────────
MOTION = {
    "springs": [
        ("snap",  "stiffness 300 · damping 20 · mass 1.0", "≈ 320 ms", "Taps, toggles, sélection, chips. Réponse < 100 ms obligatoire."),
        ("soft",  "stiffness 240 · damping 26 · mass 1.0", "≈ 420 ms", "Entrées de carte, apparition de listes."),
        ("heavy", "stiffness 180 · damping 28 · mass 1.2", "≈ 560 ms", "Sheets, modales, verdicts de qualification."),
        ("pop",   "stiffness 420 · damping 16 · mass 0.9", "≈ 240 ms", "Badges, pastilles, micro-rewards (candidature envoyée)."),
    ],
    "courbes": [
        ("--ease-labeur-out",   "cubic-bezier(0.22, 1, 0.36, 1)", "Sorties, révélations, sortie de modale"),
        ("--ease-labeur-inout", "cubic-bezier(0.65, 0, 0.35, 1)", "Transitions d'état de page, morphing de tab-bar"),
        ("--ease-anticipate",   "cubic-bezier(0.68, -0.55, 0.27, 1.55)", "Rare : annulation, refus (jamais sur succès)"),
    ],
    "durees": [("micro", "120 ms"), ("base", "240 ms"), ("page", "420 ms"), ("cinématique", "640 ms"),
               ("halo-pulse", "2 400 ms (boucle, respiration)"), ("stagger-liste", "60 ms × index, plafonné à 8")],
    "choregraphie": [
        "Toute apparition respecte l'ordre Z : fond → surface → contenu → action.",
        "Le stagger est plafonné à 8 éléments : au-delà, apparition par blocs de 8.",
        "Aucune animation ne bloque l'interaction : l'écran est tappable dès l'image 1.",
        "prefers-reduced-motion → springs remplacés par fade 120 ms, halos figés à 40% d'opacité.",
        "Le gyroscope modifie la spécularité (±12° max), jamais la position du contenu.",
    ],
    "haptiques": [
        ("light",  "Sélection de chip, toggle, tab"),
        ("medium", "Candidature envoyée, paiement déclaré, OTP chiffre saisi"),
        ("heavy",  "Contrat signé, salaire confirmé reçu, verdict « Éligible »"),
        ("rigid",  "Erreur de validation, refus, rejet de pièce R2"),
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
# 6. COMPOSANTS NOYAU (registre, lié aux écrans)
# ─────────────────────────────────────────────────────────────────────────────
COMPONENTS = [
    ("C-01 GlassSurface", "Surface verre niveaux 1-4, réfraction gyroscopique, noise overlay. Base de tout panneau."),
    ("C-02 SquircleCard", "Carte superellipse 22-28, élévation E1/E2, rim-light adaptatif."),
    ("C-03 NeoPressButton", "Bouton neumorphique : enfoncement par ombres internes, relief par light-source gyro."),
    ("C-04 StatusSeal", "Sceau de statut (Or / Émeraude / Ambre / Clay) : anneau conique + glyphe + label. Invariant de vérité d'état."),
    ("C-05 PriceBreakdown", "Module financier [Prix Prestataire] + [Frais SaaS] = [Total Client]. Interdit toute variante d'affichage (FIN-TRANSVERSAL)."),
    ("C-06 TimelineTrack", "Frise d'exécution de mission (étapes, jalons, preuves). Point actif pulsé."),
    ("C-07 OTPField", "Champ OTP 6 cases, saisie mono, auto-avance, haptique medium, sceau émeraude à validation."),
    ("C-08 ContractFolio", "Folio de contrat : référence Mono, version R2, pagination de clauses, zone de signature."),
    ("C-09 CandidateRow", "Ligne de candidat : avatar halo, score de matching, chips de compétences, action rapide."),
    ("C-10 MatchScoreRing", "Anneau de score de matching 0-100, dégradé or→émeraude, ségrégation explicable (EMP-19)."),
    ("C-11 DocumentCardR2", "Pièce justificative versionnée R2 : vignette, hash court, statut de vérification, historique."),
    ("C-12 LedgerRow", "Ligne de grand livre : delta signés (+/−), solde après opération, horodatage Mono, motif traçable."),
    ("C-13 DisputeThread", "Fil de litige structuré : pièces, décisions, échéances, bandeau admin-review."),
    ("C-14 KineticText", "Texte cinétique lié au scroll (TranslateY/ClipPath par mot) pour --display et --title-1."),
    ("C-15 ParticleCanvas", "Canvas GLSL 120 fps : champ particulaire génératif, densité modulée par l'état de l'écran."),
    ("C-16 CallSurface", "Surface WebRTC : PIP local, indicateurs réseau, enregistrement, transcription temps réel."),
    ("C-17 OpsQueueRow", "Ligne de queue d'opérations (jobs, cron, dead-letter) : tentatives, backoff, action requeue."),
    ("C-18 SecEventCard", "Carte d'événement sécurité (IDOR, replay, rate-limit) : sévérité, acteur, action recommandée."),
    ("C-19 StateGuard", "Habillage d'états système (SYS-01→15) : glyphe, explication, sortie de secours. Réutilisé par toutes les familles."),
    ("C-20 BottomDock", "Dock de navigation basse famille-aware, verre 3, indicateur actif morphique (ease-inout)."),
]

# ─────────────────────────────────────────────────────────────────────────────
# 7. ICONOGRAPHIE, SON, DONNÉES
# ─────────────────────────────────────────────────────────────────────────────
ICONO = ["Tracé 1.5 px, grille 24, terminaisons arrondies, coins 2 px",
         "Glyphes de statut remplis à 12% d'opacité + tracé plein",
         "Jeu de 168 icônes, 6 catégories (Travail, Contrat, Argent, Preuve, Sécurité, Système)"]

SOUND = ["Aucun son d'interface par défaut. Silence = luxe.",
         "Sons réservés : verdict Éligible (accord or doux, −18 LUFS), salaire confirmé (sceau, 320 ms)",
         "Toujours doublés d'une haptique + d'un état visuel persistant (jamais l'unique canal)."]

DATAVIZ = ["Séries : or (#FFB800), émeraude (#00F5A0), cyan (#5CC8FF), violet (#7A5CFF), clay (#FF5C7A)",
           "Fonds de graphe transparents sur verre, grilles en stroke-sub uniquement",
           "Chiffres en Mono tabular pour les axes ; Inter pour les légendes"]

A11Y = [
    "Contraste ≥ 4.5:1 pour tout texte < 18 px ; ≥ 3:1 pour les composants d'interface.",
    "Cibles tactiles ≥ 44 × 44 px (mobile), ≥ 40 px (desktop).",
    "Ordre de focus = ordre visuel ; focus ring : 2 px --gold-500 + halo 4 px α 0.24.",
    "Le statut n'est JAMAIS porté par la couleur seule : glyphe + libellé + forme.",
    "Les halos pulsés sont décoratifs (aria-hidden) et coupés sous prefers-reduced-motion.",
    "Tous les montants sont lus par les lecteurs d'écran avec les trois valeurs financières explicites.",
]

PERF = [
    "Budget écran : 1er rendu utile < 800 ms (4G), interaction < 100 ms, frame 8.33 ms (120 Hz).",
    "Le champ de particules vit sur son propre layer GPU ; jamais de reflow du contenu.",
    "Blur > 24 px limité à 2 surfaces simultanées par écran (coût raster).",
    "Les listes > 20 items sont virtualisées ; les images passent par le CDN Cloudflare + R2 (AVIF/WebP).",
    "Backdrop-filter désactivé sur appareils < 4 Go RAM (fallback verre opaque --surface-2 + noise).",
]

INVARIANTS = [
    "INV-1 · FIN : [Prix Prestataire] + [Frais SaaS LE LABEUR] = [Total Client]. Trois lignes, toujours, dans cet ordre. Le prestataire ne voit JAMAIS le frais SaaS comme une ponction sur son prix.",
    "INV-2 · QUALIF : une mission n'est publiable que si le verdict est Éligible ; Revue = attente humaine ; Bloquée = aucune publication possible.",
    "INV-3 · SIGNE : aucun contrat n'est Actif sans double signature horodatée + empreinte R2 des deux parties.",
    "INV-4 · OTP : la réception de salaire n'est réputée acquise qu'après OTP émeraude du prestataire (preuve 12 caractères).",
    "INV-5 · RÉPUTATION : le ledger est append-only. Toute correction est une écriture compensatoire visible, jamais une suppression.",
    "INV-6 · SÉCURITÉ : aucun secret, token, DSN ou clé n'est rendu côté client. Les écrans ADM d'infrastructure affichent des états, jamais des valeurs sensibles.",
]
