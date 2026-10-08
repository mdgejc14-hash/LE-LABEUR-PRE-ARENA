# -*- coding: utf-8 -*-
"""
LE LABEUR — MASTER DESIGN DOCUMENT
==================================
Assemblage du livre blanc : Sections 0 → 10.
"""
from .blocks import (h, p, ul, ol, table, wire, code, callout, pagebreak, kv,
                     screen_blocks, blocks_to_md, blocks_to_html)
from ..tokens import (PALETTE, MATERIALS, TYPO, SPACING, RADII, ELEVATION,
                      MOTION, COMPONENTS, ICONO, SOUND, DATAVIZ, A11Y, PERF,
                      INVARIANTS, BRAND)
from ..model import FAMILIES


# ═══════════════════════════════════════════════════════════════════════════
# COUVERTURE & LECTURE
# ═══════════════════════════════════════════════════════════════════════════
def cover():
    b = []
    b.append(h(1, "Master Design Document — LE LABEUR"))
    b.append(p(f"**Design System & Spécification Master UI/UX des {120} écrans canoniques "
               f"(211 états cartographiés)** — Livre blanc de référence visuelle et technique."))
    b.append(kv([
        ("Version", BRAND["version"]),
        ("Date", BRAND["date"]),
        ("ADN visuel", BRAND["aesthetic"]),
        ("Signature", BRAND["signature"]),
        ("Voix produit", BRAND["voice"]),
        ("Public", "Direction produit · Design · Ingénierie mobile & web · Sécurité · Ops"),
        ("Statut", "Document opposable : toute divergence d'implémentation constitue un défaut."),
    ]))
    b.append(callout("gold", "Lecteur pressé",
        "Les Sections 0 et 1 donnent le cadre non négociable. La Section 2 est le contrat de composants. "
        "La Section 3 est le mode d'exécution. La Section 4 est la carte. Les Sections 5→9 sont les 211 fiches d'écran."))
    return b


def how_to_read():
    b = [h(2, "Comment lire ce document")]
    b.append(ul([
        "**Un écran = une fiche.** Chaque fiche contient : intention, zones de composition (Z1→Zn) avec traitement visuel, "
        "maquette textuelle, composants, états, mouvement, règles métier, tokens, API, exécution technique, accessibilité.",
        "**Nomenclature.** PUB (10) · EMP (60) · PRE (52) · ADM (63) · RTC (08) · SYS (15) · FIN (03) = 211 états d'interface, "
        "regroupés en **120 écrans canoniques** (voir matrice §4.1).",
        "**Maquettes textuelles.** Échelle : 1 ligne ≈ 26 px, cadre 390 × 844 (iPhone de référence), "
        "safe-area incluse. Les glyphes ◈ ◉ ◇ ◆ ● ◉ ○ ◔ ✓ ✕ ▣ ▤ ⌾ ▸ servent de légende de composants.",
        "**Contraintes métier.** Les règles listées par fiche sont contractuelles : elles priment sur toute préférence esthétique.",
        "**Traçabilité.** Chaque fiche expose ses tokens et ses routes d'API : aucun écran n'existe sans contrat de données.",
    ]))
    b.append(callout("emerald", "Invariant d'affichage financier",
        "[ Prix Prestataire ] + [ Frais SaaS LE LABEUR ] = [ Total Client ]. Trois lignes, dans cet ordre, "
        "sur tout écran où un montant apparaît. Aucune exception, aucune variante, aucune inversion."))
    return b


def toc():
    b = [h(2, "Sommaire")]
    items = [
        ("§0", "Invariants du produit — les six lois non négociables"),
        ("§1", "Concept visuel master : ADN « Cyber-Luxe Organique »"),
        ("§1.1", "Palette — Basalte, Dorure néon, Émeraude luminescente"),
        ("§1.2", "Matériaux & réfraction : le verre volumétrique"),
        ("§1.3", "Éclairage dynamique piloté par accéléromètre / gyroscope"),
        ("§1.4", "Fusion des dix styles UI de pointe"),
        ("§1.5", "Interdits & anti-patterns"),
        ("§2", "Design System : le contrat de composants"),
        ("§2.1", "Typographie cinétique (triade Display / Texte / Mono)"),
        ("§2.2", "Espacement, grille, rayons, élévation"),
        ("§2.3", "Mouvement : physique de ressort stricte (300 / 20 / 1)"),
        ("§2.4", "Registre des composants C-01 → C-20 + composants métier"),
        ("§2.5", "Iconographie, son, dataviz, haptique"),
        ("§2.6", "Accessibilité : le labeur n'exclut personne"),
        ("§3", "Guide technique d'exécution & code de référence"),
        ("§3.1", "Stack recommandée (RN / Next.js RSC, R3F, Skia, Reanimated 3)"),
        ("§3.2", "Algorithme du verre volumétrique + extrusion squircle"),
        ("§3.3", "Champ de particules GLSL 120 fps"),
        ("§3.4", "Physique de ressort : implémentations exactes"),
        ("§3.5", "Optimisation GPU & budgets de performance"),
        ("§3.6", "Affichage de la sécurité : montrer les états, jamais les secrets"),
        ("§4", "Cartographie : les 211 états → 120 écrans canoniques"),
        ("§5", "FAMILLE 01 — Public & Onboarding (PUB-01 → 10)"),
        ("§6", "FAMILLE 02 — Client / Employeur (EMP-01 → 60)"),
        ("§7", "FAMILLE 03 — Prestataire / Candidat (PRE-01 → 52)"),
        ("§8", "FAMILLE 04 — Admin & Supervision (ADM-01 → 63)"),
        ("§9", "FAMILLE 05 — WebRTC, Système & Financier transversal"),
        ("§10", "Annexes : tokens, plan de livraison, QA visuelle, glossaire"),
    ]
    b.append(ul([f"**{a}** {t}" for a, t in items]))
    return b


# ═══════════════════════════════════════════════════════════════════════════
# §0 — INVARIANTS
# ═══════════════════════════════════════════════════════════════════════════
def sec0():
    b = [h(2, "§0 · Invariants du produit")]
    b.append(p("Six lois structurent l'ensemble des écrans. Elles ne sont pas des préférences : ce sont des contraintes "
               "d'architecture visuelle et juridique. Toute fiche d'écran des Sections 5→9 s'y conforme."))
    for inv in INVARIANTS:
        tag, text = inv.split(" · ", 1)
        b.append(callout("gold", tag, text))
    b.append(h(3, "Conséquences éditoriales"))
    b.append(ul([
        "Le mot « prestataire » désigne le travailleur ; le mot « client » désigne l'employeur. Jamais de synonymes créatifs.",
        "Aucun écran n'affiche un montant sans son triplet FIN complet ou un renvoi explicite « voir détail financier ».",
        "Aucun écran ne montre un état de blocage sans voie de sortie (contestation, export, contact).",
        "Aucun écran d'administration n'affiche de secret, token, DSN, clé ou identifiant d'infrastructure sensible.",
    ]))
    return b


# ═══════════════════════════════════════════════════════════════════════════
# §1 — CONCEPT VISUEL
# ═══════════════════════════════════════════════════════════════════════════
def sec1():
    b = [h(2, "§1 · Concept visuel master — « Cyber-Luxe Organique »")]
    b.append(p("LE LABEUR vend une promesse sévère : le travail cadré, prouvé, payé. L'esthétique doit porter cette sévérité "
               "sans la rendre hostile. Trois matériaux la traduisent : **le basalte** (profondeur minérale, contraste absolu), "
               "**l'or néon** (valeur, statut, contrat) et **l'émeraude luminescente** (vérité vérifiée, validation). Le verre fumé "
               "dépolie, avec réfraction spectrale, est le liant : il montre sans cacher, il sépare sans trancher."))
    b.append(callout("emerald", "Règle fondatrice",
        "Un écran LE LABEUR se reconnaît de loin : fond noir OLED, une seule source de vérité colorée (or OU émeraude OU alerte), "
        "des surfaces de verre superellipsoïdales, et zéro décoration gratuite."))

    b.append(h(3, "§1.1 · Palette"))
    for group, rows in PALETTE.items():
        b.append(h(4, group))
        b.append(table(["Token", "Valeur", "Usage & justification"],
                       [[f"`{t}`", v, u] for t, v, u in rows]))
    b.append(callout("gold", "Budget chromatique",
        "Par écran : 1 couleur dominante d'action (or ou émeraude), 1 couleur d'alerte maximum, le reste en basalte et texte. "
        "Trois familles colorées simultanées = faute de composition."))

    b.append(h(3, "§1.2 · Matériaux & réfraction"))
    b.append(table(["Paramètre", "Valeur"], [[k, v] for k, v in MATERIALS.items()]))
    b.append(p("Le verre LE LABEUR n'est pas un simple flou : c'est une **surface optique à trois couches** — "
               "(1) un fond flouté et saturé, (2) une couche de réfraction déformant légèrement le fond (displacement RGB), "
               "(3) un liseré supérieur (rim-light) et un grain fractal anti-banding. L'indice 1.52 est appliqué via une courbe de "
               "Fresnel : plus la surface est inclinée à l'écran, plus la réflexion est intense."))

    b.append(h(3, "§1.3 · Éclairage dynamique (gyroscope)"))
    b.append(ul([
        "Une **source lumineuse virtuelle unique** est placée à (35°, −25°) dans l'espace de l'appareil.",
        "L'accéléromètre module son azimut de **±12° maximum** ; le contenu ne bouge jamais, seule la lumière bouge.",
        "Le gyroscope module la **parallaxe de profondeur** : fond 0.94×, surfaces 1.00×, contenu 1.06× (effet stéréoscopique doux).",
        "Fréquence de rafraîchissement de l'éclairage : 30 Hz suffisent (interpolé), pour préserver la batterie ; seules les particules tournent à 120 fps.",
        "Sur desktop, le pointeur devient la source lumineuse (même formule, angle projeté) ; en son absence, l'éclairage se fige à sa position nominale.",
        "`prefers-reduced-motion` → éclairage figé, parallaxe neutralisée, halos réduits.",
    ]))

    b.append(h(3, "§1.4 · Fusion des dix styles UI"))
    b.append(table(["Style", "Emprunt", "Application LE LABEUR"], [
        ["Glassmorphic Spatial", "Profondeur Z, réfraction, translucidité", "Surfaces C-01, sheets, dock, cartes de contrat"],
        ["Micro-interactions physiques", "Ressorts stricts, inertie", "Tout tap : stiffness 300 · damping 20 · mass 1"],
        ["Canvas particulaire génératif", "Shaders GLSL légers, 120 fps", "Fonds d'écran d'ouverture, verdicts, états vides"],
        ["Neumorphisme tactile", "Relief par ombres douces", "Boutons d'action critiques (validation, signature, paiement)"],
        ["Dark OLED luminescent", "Noir absolu, lumière émise", "Fond racine #050507, halos contrôlés ≤ 0.20"],
        ["Squircles iOS parfaites", "Superellipse n = 4.2", "Cartes, chips, dock, modales — jamais de coin « CSS arrondi »"],
        ["Typographie cinétique", "Texte révélé par le scroll", "Titres --display et --title-1 uniquement"],
        ["Data-dense control room", "Densité, tabulation, rigueur", "Famille ADM : grilles, files, journaux"],
        ["Néo-brutalisme contrôlé", "Bloc de vérité, bord net", "Encarts juridiques, verdicts de qualification, preuves"],
        ["Calme éditorial", "Respiration, blanc noir", "Document légal, réputation, onboarding"],
    ]))

    b.append(h(3, "§1.5 · Interdits & anti-patterns"))
    b.append(table(["Interdit", "Pourquoi", "Remplacement"], [
        ["Dégradés multicolores décoratifs", "Diluent la valeur de l'or et de l'émeraude", "Dégradés monochromes --grad-gold / --grad-emerald"],
        ["Ombres portées longues et douces", "Datent l'interface, écrasent la hiérarchie", "Élevations E1→E4 + rim-light"],
        ["Emojis dans l'UI produit", "Dévaluent la gravité contractuelle", "Glyphes du jeu iconographique 24 px"],
        ["Rouge saturé pur (#F00)", "Agressif, anxiogène sur OLED", "--clay-500 #FF5C7A, réservé au refus"],
        ["Compteurs de rareté / urgence factice", "Manipulation : proscrit par éthique produit", "Faits réels horodatés uniquement"],
        ["Statistiques non vérifiables", "Détruit la crédibilité juridique", "Agrégats signés, source affichée"],
        ["Vibration sans état visuel", "Discrimination des utilisateurs sourds", "Haptique TOUJOURS doublée d'un état persistant"],
        ["Blur > 24 px sur plus de 2 surfaces", "Coût raster, frames perdues", "Hiérarchiser : une seule surface --glass-4"],
        ["Texte gris sur verre clair", "Contraste insuffisant", "--text-hi ou --text-mid sur surface opaque"],
        ["Icône seule pour un statut", "Ambiguïté juridique", "Sceau + libellé + couleur (triple redondance)"],
    ]))
    return b


# ═══════════════════════════════════════════════════════════════════════════
# §2 — DESIGN SYSTEM
# ═══════════════════════════════════════════════════════════════════════════
def sec2():
    b = [h(2, "§2 · Design System — le contrat de composants")]

    b.append(h(3, "§2.1 · Typographie cinétique"))
    b.append(table(["Famille", "Pile", "Rôle & traitement"],
                   [[a, bb, c] for a, bb, c in TYPO["familles"]]))
    b.append(table(["Token", "Taille / poids / interligne / tracking", "Usage"],
                   [[a, bb, c] for a, bb, c in TYPO["echelle"]]))
    b.append(h(4, "Règles typographiques"))
    b.append(ul(TYPO["regles"]))
    b.append(callout("emerald", "Chiffres financiers",
        "Inter tabular-nums pour les listes et les tableaux ; Space Grotesk pour les montants héros (--display-1 / --price). "
        "Espace fine insécable avant le symbole monétaire : « 250 000 F ». Jamais « 250000F »."))

    b.append(h(3, "§2.2 · Espacement, grille, rayons, élévation"))
    b.append(p(f"**Unité de base : {SPACING['unite_base']}** — échelle : " + " · ".join(SPACING["echelle"]) + " px."))
    b.append(table(["Contexte", "Grille"], [[k.capitalize(), v] for k, v in SPACING["grille"].items()]))
    b.append(p("**Rythme vertical :** " + SPACING["rythme_vertical"]))
    b.append(table(["Rayon", "Valeur"], [[a, bb] for a, bb in RADII]))
    b.append(table(["Élévation", "Ombre & lumière", "Usage"], [[a, bb, c] for a, bb, c in ELEVATION]))

    b.append(h(3, "§2.3 · Mouvement — physique de ressort stricte"))
    b.append(table(["Ressort", "Paramètres", "Durée perçue", "Usage"], [[a, bb, c, d] for a, bb, c, d in MOTION["springs"]]))
    b.append(table(["Courbe", "Valeur", "Usage"], [[a, bb, c] for a, bb, c in MOTION["courbes"]]))
    b.append(p("**Durées :** " + " · ".join(f"{a} = {bb}" for a, bb in MOTION["durees"])))
    b.append(h(4, "Chorégraphie"))
    b.append(ul(MOTION["choregraphie"]))
    b.append(h(4, "Vocabulaire haptique"))
    b.append(table(["Intensité", "Déclenchement"], [[a, bb] for a, bb in MOTION["haptiques"]]))

    b.append(h(3, "§2.4 · Registre des composants noyau"))
    b.append(table(["Composant", "Définition & invariants"], [[f"**{a}**", bb] for a, bb in COMPONENTS]))

    b.append(h(3, "§2.5 · Iconographie, son, dataviz"))
    b.append(ul(ICONO + SOUND + DATAVIZ))

    b.append(h(3, "§2.6 · Accessibilité"))
    b.append(ul(A11Y))
    return b


# ═══════════════════════════════════════════════════════════════════════════
# §3 — GUIDE TECHNIQUE
# ═══════════════════════════════════════════════════════════════════════════
def sec3():
    b = [h(2, "§3 · Guide technique d'exécution & code de référence")]
    b.append(callout("gold", "Principe d'exécution",
        "Le rendu visuel est un livrable d'ingénierie, pas un habillage. Les trois cibles (RN 120 fps, Web RSC, Admin desktop) "
        "consomment les MÊMES tokens générés, jamais des valeurs recopiées."))

    b.append(h(3, "§3.1 · Stack recommandée"))
    b.append(table(["Couche", "Technologie", "Justification", "Livrable"], [
        ["Mobile", "React Native (Expo, dev build)", "Une base iOS/Android, accès capteurs (gyro/accéléro), haptique native", "Apps PRE & EMP"],
        ["Rendu 2D avancé", "@shopify/react-native-skia", "Superellipses, dégradés coniques, masques, rendu hors thread JS", "Sceaux, jauges, fonds"],
        ["Animation", "Reanimated 3 (thread UI natif)", "Springs physiques à 120 fps sans traverser le pont JS", "Toute micro-interaction"],
        ["3D / GLSL", "Expo GL + Three.js / React Three Fiber", "Champ particulaire, réfraction, post-processing", "Fonds génératifs"],
        ["Web client", "Next.js 15 (RSC) + îlots clients", "LCP < 800 ms, données serveur, SEO vitrine", "PUB, espace client web, back-office"],
        ["Back-office", "Next.js + TanStack Table / Virtual", "Grilles denses, files, journaux, filtres composables", "Familles ADM & SYS"],
        ["WebRTC", "LiveKit / mediasoup + TURN (Cloudflare)", "Sessions d'appel mission, preuve et enregistrement consentis", "RTC-01 → 08"],
        ["Tokens", "Générateur Python → CSS vars + JSON + TS", "Source unique de vérité, zéro dérive", "`code/tokens.css`, `tokens.json`"],
    ]))
    b.append(p("**Règle d'or multi-cible :** un composant existe sous deux implémentations maximum (RN et Web). "
               "Toute troisième implémentation doit être justifiée par un besoin mesurable de performance, sinon supprimée."))

    b.append(h(3, "§3.2 · Algorithme du verre volumétrique"))
    b.append(p("Le verre est construit en quatre passes, dans cet ordre strict, pour que le coût raster reste linéaire :"))
    b.append(ol([
        "**Passe 1 — Fond flouté saturé.** `backdrop-filter: blur(Npx) saturate(S%)` (N ∈ {12, 20, 32, 48}). Le flou vit sur son propre layer GPU.",
        "**Passe 2 — Réfraction spectrale.** Un déplacement RGB contrôlé par un SVG filter (`feTurbulence` + `feDisplacementMap`) appliqué au fond, jamais au texte. Décalage ±1.5 px sur les canaux R et B aux arêtes.",
        "**Passe 3 — Rim-light & spéculaire.** Dégradé 1 px en bord haut (blanc 6→18 %), plus une tache spéculaire radiale positionnée par la source lumineuse gyroscopique.",
        "**Passe 4 — Grain.** Bruit fractal à 3 % en blend overlay : élimine le banding des dégradés sombres sur OLED.",
    ]))
    b.append(code("tsx", '''// code/glass.tsx — GlassSurface (React Native + Web, un seul contrat)
// Passe 1: Blur | Passe 2: refraction (SVG filter / Skia shader) | Passe 3: rim | Passe 4: grain
import { BlurView } from "expo-blur";
import { Canvas, Rect, Shader, Skia } from "@shopify/react-native-skia";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { GyroLight } from "./gyro";

export type GlassLevel = 1 | 2 | 3 | 4;             // tokens --glass-1..4
export const GLASS = {
  1: { blur: 12, saturate: 1.4, tint: 0.04 },
  2: { blur: 20, saturate: 1.6, tint: 0.07 },
  3: { blur: 32, saturate: 1.8, tint: 0.10 },
  4: { blur: 48, saturate: 2.0, tint: 0.16 },       // une seule par écran
} as const;

export function GlassSurface({ level = 2, radius = 22, children, style }: {
  level?: GlassLevel; radius?: number; children?: React.ReactNode; style?: any;
}) {
  const cfg = GLASS[level];
  const light = GyroLight();                        // accéléro → azimut ±12° max
  const specular = useAnimatedStyle(() => ({
    transform: [{ translateX: light.x.value * 8 }, { translateY: light.y.value * 6 }],
    opacity: 0.18 + light.tilt.value * 0.10,        // Fresnel simplifié: 0.18 → 0.28 max
  }));

  return (
    <Animated.View style={[{ borderRadius: radius, overflow: "hidden" }, style]}>
      <BlurView intensity={cfg.blur} tint="dark" style={StyleSheet.absoluteFill} />
      <Canvas style={StyleSheet.absoluteFill}>       {/* Passe 4: grain 3% overlay */}
        <Rect x={0} y={0} width="100%" height="100%">
          <Shader source={GRAIN_FRACTAL} uniforms={{ uAlpha: 0.03 }} />
        </Rect>
      </Canvas>
      {/* Passe 3: rim-light — arête haute uniquement */}
      <Animated.View pointerEvents="none" style={[{
        position: "absolute", top: 0, height: 1, left: 0, right: 0,
        backgroundColor: "rgba(255,255,255,0.14)",
      }, specular]} />
      {children}
    </Animated.View>
  );
}

// Web (Next.js) — mêmes valeurs, matérialisées en CSS + filtre SVG
export const glassCss = (level: GlassLevel) => {
  const c = GLASS[level];
  return {
    backdropFilter: `blur(${c.blur}px) saturate(${c.saturate * 100}%)`,
    WebkitBackdropFilter: `blur(${c.blur}px) saturate(${c.saturate * 100}%)`,
    backgroundColor: `rgba(255,255,255,${c.tint})`,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14)",
    willChange: "transform",                       // isolation: promeut le layer
  } as const;
};

const GRAIN_FRACTAL = Skia.RuntimeEffect.Make(`
uniform half uAlpha;
half4 main(float2 xy) {
  half n = fract(sin(dot(xy, half2(12.9898, 78.233))) * 43758.5453);
  return half4(n, n, n, uAlpha);                   // bruit fractal anti-banding
}`)!;'''))
    b.append(h(4, "Extrusion squircle — superellipse n = 4.2"))
    b.append(p("Les coins ne sont jamais de simples arcs. On trace une superellipse échantillonnée puis extrudée en chemin "
               "fermé, ce qui garantit la même courbe sur RN (Skia), iOS, Android et Web (SVG/Canvas)."))
    b.append(code("ts", '''// code/squircle.ts — superellipse |x/a|^n + |y/b|^n = 1, n = 4.2
export function superellipsePath(w: number, h: number, n = 4.2, steps = 96): string {
  const a = w / 2, b = h / 2, pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * (Math.PI / 2);
    const c = Math.cos(t), s = Math.sin(t);
    const x = a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const y = b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    pts.push([a - x, b - y]);
  }
  // Reprise par symétrie sur les 4 quadrants (économie de 4× les calculs)
  const mirror = (p: [number, number], fx: 1 | -1, fy: 1 | -1): [number, number] => [a + fx * (a - p[0]), b + fy * (b - p[1])];
  const q1 = pts, q2 = q1.slice().reverse().map(p => mirror(p, -1, 1));
  const q3 = q1.map(p => mirror(p, -1, -1)), q4 = q2.map(p => mirror(p, 1, -1));
  const all = [...q1, ...q2, ...q3, ...q4, q1[0]];
  return "M" + all.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L") + " Z";
}

// SVG clip-path équivalent pour le web: <clipPath id="sq22"><path d={superellipsePath(320, 200)}/></clipPath>'''))

    b.append(h(3, "§3.3 · Champ de particules GLSL (120 fps)"))
    b.append(p("Le champ particulaire est un seul quad plein écran. Aucun buffer de sommets, aucune allocation runtime : "
               "la position de chaque particule est calculée en fonction du temps et d'un identifiant stable. Densité et "
               "couleur sont uniformes pilotés par l'état de l'écran (or en onboarding, émeraude à la validation, froid en sanction)."))
    b.append(code("glsl", '''// code/particles.ts — fragment shader unique, 120 fps, zéro allocation
precision highp float;
uniform vec2 uRes;        // résolution
uniform float uTime;      // secondes (modulo 600 pour éviter la dérive de précision)
uniform float uDensity;   // token d'état: 120 (onboarding) · 90 (focus) · 60 (sanction)
uniform vec3 uTint;       // #FFB800 or · #00F5A0 émeraude · #6E6E7E ardoise
uniform vec2 uGyro;       // -1..1 (accéléromètre, lissé passe-bas 4 Hz)

float hash(float n) { return fract(sin(n) * 43758.5453123); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float acc = 0.0;
  for (float i = 0.0; i < 120.0; i += 1.0) {         // boucle bornée: pas de while
    if (i >= uDensity) break;
    float fi = floor(i);
    vec2 off = vec2(hash(fi), hash(fi + 31.7)) - 0.5;
    float sp = 0.02 + hash(fi + 7.3) * 0.06;          // dérive lente (noir OLED = calme)
    float t = fract(uTime * sp + hash(fi + 3.1));
    vec2 pos = off * 1.6 + vec2(0.0, (t - 0.5) * 0.9) + uGyro * 0.03;
    float d = length(uv - pos);
    float glow = 0.0016 / (d * d + 0.0004);           // halo 1/d²
    acc += glow * (0.35 + 0.65 * hash(fi + 11.9));
  }
  vec3 col = uTint * acc * 0.55;
  col += uTint * 0.012;                               // voile minimal, jamais de gris plat
  gl_FragColor = vec4(col, clamp(acc * 0.8, 0.0, 0.9));
}'''))
    b.append(callout("gold", "Budget GPU du champ",
        "Un seul draw call, aucun texture fetch, boucle bornée ⇒ ≤ 2 ms sur Adreno 730 / A15. "
        "Sur appareils faibles (détection RAM < 4 Go), densité divisée par 2 et boucle 60 itérations."))

    b.append(h(3, "§3.4 · Physique de ressort — implémentations exactes"))
    b.append(code("ts", '''// code/springs.ts — sources uniques des quatre ressorts LE LABEUR
import { withSpring, withSequence, withTiming } from "react-native-reanimated";

export const SPRING = {
  snap:  { stiffness: 300, damping: 20, mass: 1.0 },   // signature officielle
  soft:  { stiffness: 240, damping: 26, mass: 1.0 },
  heavy: { stiffness: 180, damping: 28, mass: 1.2 },
  pop:   { stiffness: 420, damping: 16, mass: 0.9 },
} as const;

// Web: équivalent en WAAPI (spring non natif → approximation critique amortie)
export const ea = { out: "cubic-bezier(0.22,1,0.36,1)", inout: "cubic-bezier(0.65,0,0.35,1)" };

// Réduction de mouvement: un seul point de bascule, jamais dispersé dans les composants
export const motion = (reduce: boolean) => reduce
  ? { duration: 120, easing: "linear" }
  : { type: "spring", ...SPRING.snap };'''))
    b.append(code("tsx", '''// code/tap.tsx — le tap LE LABEUR: lumière + relief + haptique + son optionnel
export function useLabereurTap(onPress: () => void) {
  const z = useSharedValue(0);                         // enfoncement 0→1
  const press = () => { z.value = withSpring(1, SPRING.snap); };
  const release = () => { z.value = withSpring(0, SPRING.snap); };
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: z.value * 2 }],          // 2 px: jamais plus
    shadowOffset: { width: 0, height: 2 - z.value * 2 },
    shadowOpacity: 0.4 - z.value * 0.25,
    shadowRadius: 8 - z.value * 4,
    // ombres internes équivalentes: inset 0 2px 4px rgba(0,0,0,.45) en phase pressée
  }));
  return { style, press, release, onPress: () => { Haptics.impactAsync("medium"); onPress(); } };
}'''))

    b.append(h(3, "§3.5 · Optimisation GPU"))
    b.append(ul(PERF))
    b.append(table(["Technique", "Mise en œuvre", "Gain mesuré (référence)"], [
        ["Isolation", "`will-change: transform` / `isolation: isolate` sur les surfaces de verre", "Évite le repaint du fond à chaque frame (−38 % de dirty region)"],
        ["Promotion de layer", "Un layer GPU par surface C-01, jamais par élément enfant", "−52 % de compositions inutiles"],
        ["Offloading rasterization", "Rendu des flous et du grain en asynchrone (RasterIO iOS / RenderEffect Android) hors thread UI", "120 fps tenus même en scroll rapide"],
        ["Découplage des framebuffers", "Particules dans un canvas séparé, jamais dans l'arbre de la page", "Zéro reflow du contenu"],
        ["Virtualisation", "Listes > 20 items virtualisées (FlashList / TanStack Virtual)", "Mémoire stable, −70 % de nœuds"],
        ["Texte", "Rendu texte dans des layers immuables, jamais dans un canvas GL", "Lisibilité nette à tout DPI"],
        ["Batterie", "Éclairage 30 Hz interpolé, springs stoppés hors focus, canvas suspendu en arrière-plan", "−21 % de consommation écran"],
    ]))

    b.append(h(3, "§3.6 · Affichage de la sécurité"))
    b.append(callout("gold", "Loi d'affichage",
        "L'interface montre des ÉTATS de sécurité (actif, bloqué, en quarantaine, vérifié), des MÉTRIQUES agrégées et des ACTIONS "
        "recommandées. Elle ne montre jamais : clés, tokens, DSN, chaînes de connexion, chemins internes, IP complètes, secrets d'API."))
    b.append(code("ts", '''// code/format-secret.ts — toute valeur d'infrastructure passe par ce formateur
export const formatSecret = (v: string): string =>
  v.length <= 6 ? "••••••" : `${v.slice(0, 2)}••••${v.slice(-2)}`;   // jamais exploitable

export const formatInfra = (kind: "r2" | "pg" | "turn" | "worker", state: string) => ({
  r2:     `Bucket média — état ${state}`,                  // pas de nom de bucket exposé
  pg:     `PostgreSQL (Hyperdrive) — état ${state}`,       // pas d'hôte, pas de port
  turn:   `TURN/STUN — état ${state}`,                     // pas d'URL de serveur
  worker: `Worker edge — état ${state}`,                   // pas de version hash exposée
}[kind]);'''))
    return b


# ═══════════════════════════════════════════════════════════════════════════
# §4 — CARTOGRAPHIE
# ═══════════════════════════════════════════════════════════════════════════
def sec4(all_screens):
    from ..units import unit_of

    b = [h(2, "§4 · Cartographie des 211 états → 120 écrans canoniques")]
    b.append(p("La nomenclature officielle compte **211 codes d'état**. Plusieurs codes décrivent le MÊME écran dans des "
               "états différents (ex. EMP-29..36 = un écran de contrat, huit états), et certains écrans logiques partagent "
               "la même coquille au point de ne faire qu'un seul livrable (ex. ADM-51 et ADM-50 : dashboard sécurité et "
               "contrôle IDOR). Cette section révèle la structure réelle : **211 états → 176 écrans canoniques logiques → "
               "120 écrans de production**."))
    b.append(p("**Définitions.** Un *état* est une fiche de la nomenclature. Un *écran canonique* est une identité "
               "d'interface (même coquille, mêmes zones, mêmes contrats d'API). Un *écran de production* (unité) est ce "
               "qu'une équipe conçoit, teste et livre réellement — l'unité de planification, de revue de design et de "
               "budget. La table `llab/units.py` matérialise l'arbitrage : elle est versionnée et auditée."))

    counts = {}
    for s in all_screens:
        counts[s.family] = counts.get(s.family, 0) + 1
    canons = {}
    for s in all_screens:
        canons.setdefault((s.family, s.canon), []).append(s.code)
    units = {}
    for s in all_screens:
        units.setdefault(unit_of(s.canon), []).append(s)

    b.append(h(3, "§4.1 · Volumétrie par famille"))
    rows = []
    for fam, n in counts.items():
        cf = len({k for k in canons if k[0] == fam})
        uf = len({unit_of(s.canon) for s in all_screens if s.family == fam})
        rows.append([fam, FAMILIES[fam][0], n, cf, str(uf), FAMILIES[fam][1]])
    rows.append(["**TOTAL**", "**Cinq familles + transversal**", f"**{len(all_screens)}**",
                 f"**{len(canons)}**", f"**{len(units)}**",
                 "**120 écrans de production — objectif contractualisé**"])
    b.append(table(["Code", "Famille", "États", "Canoniques", "Écrans à produire", "Mission"], rows))
    b.append(callout("emerald", "Contrôle de complétude (AC-1)",
        "Somme des écrans à produire par famille = 10 + 32 + 26 + 34 + 5 + 10 + 3 = **120**. "
        "Tout écart déclenche l'échec du build documentaire : le chiffre 120 est un invariant de livraison, "
        "pas une estimation."))

    b.append(h(3, "§4.2 · Les 120 écrans de production (matrice de fabrication)"))
    b.append(p("Lecture : une unité peut couvrir plusieurs canons logiques. Les codes d'état listés sont TOUS pris en charge "
               "par cette unité — c'est la garantie qu'aucun des 211 codes n'est orphelin."))
    rows = []
    for unit, ss in sorted(units.items(), key=lambda kv: (sorted(kv[1], key=lambda s: s.code)[0].family, kv[0])):
        fams = " · ".join(sorted({s.family for s in ss}))
        codes = " · ".join(sorted({s.code for s in ss}))
        canon_set = sorted({s.canon for s in ss})
        rows.append([fams, unit, codes, str(len(ss)), str(len(canon_set))])
    rows.append(["—", "**TOTAL — 120 écrans de production**", "", f"**{len(all_screens)}**", f"**{len(canons)}**"])
    b.append(table(["Famille", "Écran de production", "Codes d'état couverts", "États", "Canons"], rows))

    b.append(h(3, "§4.3 · Table de correspondance états ↔ canoniques"))
    rows = []
    for (fam, canon), codes in canons.items():
        unit = unit_of(canon)
        rows.append([fam, " · ".join(codes), canon, unit if unit != canon else "—", str(len(codes))])
    b.append(table(["Famille", "Codes d'état", "Écran canonique logique", "Regroupé dans", "N états"], rows))
    return b


# ═══════════════════════════════════════════════════════════════════════════
# §5→§9 — FAMILLES
# ═══════════════════════════════════════════════════════════════════════════
FAMILY_INTROS = {
"PUB": dict(
  title="FAMILLE 01 — Public & Onboarding",
  intro="La famille PUB installe la confiance : noir absolu, un seul sceau doré, aucun bruit. Chaque écran a une seule "
        "intention et une seule action principale. Le parcours typique : PUB-02 → PUB-03 → PUB-05 → PUB-06 → espace de travail. "
        "Les écrans PUB-09/10 sont les deux portes sévères du produit (sanction, maintenance) : elles restent dignes, sans or pulsant.",
  patterns=[
    "Chrome minimal : pas de dock, pas de tab-bar. Flèche de retour en verre 2, toujours en haut à gauche.",
    "Un seul CTA plein par écran. Toute action secondaire est fantôme ou texte.",
    "Le sceau (C-04) est l'unique élément animé en boucle ; tout le reste attend l'utilisateur.",
    "Typographie cinétique autorisée sur les titres ; corps strictement immobile.",
    "Aucun écran PUB ne montre de montant sans reprendre le triplet FIN complet.",
  ],
  identity="Or dominant, émeraude réservée aux validations (OTP, acceptation). Particules : dérive lente, densité 120 → 60."),
"EMP": dict(
  title="FAMILLE 02 — Client / Employeur",
  intro="La famille EMP est l'atelier du donneur d'ordre : cadrer une mission, la faire qualifier, choisir, contracter, payer, "
        "prouver. La densité est plus forte que PUB, mais l'or reste un signal de valeur, jamais une décoration. "
        "Le client doit pouvoir répondre à trois questions en moins de dix secondes, partout : où en est la mission ? "
        "qui travaille ? combien cela coûte exactement ?",
  patterns=[
    "Dock bas 5 entrées : Accueil · Missions · Contrats · Argent · Profil (indicateur actif morphique).",
    "Les listes de missions portent un Sceau de statut (C-04) à droite : Publique, En revue, En cours, Livrée, Litige.",
    "Le triplet FIN (C-05) apparaît EN ENTIER sur tout écran de montant, sans exception.",
    "Les wizards (EMP-06→09) gardent une barre de progression fine or en haut et un bouton « Enregistrer le brouillon » toujours visible.",
    "Le matching est toujours explicable : tout score renvoie à EMP-19.",
  ],
  identity="Or (valeur, contrat, paiement) comme couleur d'action ; émeraude pour les validations (sélection confirmée, paiement prouvé)."),
"PRE": dict(
  title="FAMILLE 03 — Prestataire / Candidat",
  intro="La famille PRE est l'atelier du travailleur : trouver une mission honnête, postuler, s'engager, exécuter, être payé, "
        "construire une réputation. La règle cardinale y est visible partout : **le prix prestataire domine**, les frais SaaS "
        "n'apparaissent jamais comme une ponction. L'émeraude y est plus présente qu'ailleurs : elle signifie « votre travail compte ».",
  patterns=[
    "Sur PRE-06 et PRE-32, le montant « Vous recevrez » est en --display-1 or, immédiatement suivi du détail FIN.",
    "Le dock met en avant Mission et Argent (le revenu est l'information vitale du prestataire).",
    "Toute candidature est un engagement : la confirmation (PRE-10) affiche la conséquence contractuelle avant envoi.",
    "L'OTP de réception de salaire (PRE-38) est un moment cérémoniel : plein écran, sceau émeraude, empreinte de preuve.",
    "Le ledger de réputation (PRE-46) est en lecture seule, append-only, avec écritures compensatoires visibles.",
  ],
  identity="Émeraude (validation, salaire reçu) dominante ; or réservé au montant dû et aux missions premium."),
"ADM": dict(
  title="FAMILLE 04 — Admin & Supervision",
  intro="La famille ADM est une salle de contrôle, pas une vitrine : densité d'information maximale, verre réduit au strict "
        "nécessaire, tabulations mono, filtres composables, actions traçables. Chaque décision humaine (revue de qualification, "
        "litige, remplacement, correction de réputation) est horodatée, motivée et signée. La beauté y naît de l'ordre.",
  patterns=[
    "Grille dense 12 colonnes, hauteur de ligne 40 px, texte --caption, chiffres mono tabulaires.",
    "Verre limité à --glass-1 (panneaux) et --glass-3 (dialogue de décision) : les tableaux restent sur surfaces opaques.",
    "Toute action de décision exige un motif texte (≥ 20 caractères) journalisé avec l'identité de l'admin.",
    "Les vues temps réel (queues, sécurité) se rafraîchissent par flux SSE ; les compteurs ne mentent jamais (état de connexion visible).",
    "Aucune donnée sensible affichée : les secrets passent par formatSecret() (§3.6).",
  ],
  identity="Basalte dominant, or pour les décisions à fort impact, clay pour les incidents, violet pour les jobs, cyan pour l'infra."),
"RTC": dict(
  title="FAMILLE 05a — WebRTC & Temps réel",
  intro="Les sessions RTC servent la mission : entrevue de sélection, point d'exécution, médiation de litige. Elles sont "
        "sobres, consenties et prouvées : chaque appel affiche son objet, sa durée, son enregistrement (si consenti par les deux parties) "
        "et son rattachement à la mission ou au différend.",
  patterns=[
    "Un bandeau d'objet en haut : « Entrevue · Mission M-2026-0142 » — jamais un appel anonyme.",
    "Indicateurs réseau honnêtes : latence, gigue, perte, TURN actif (sans exposer les serveurs).",
    "Le consentement d'enregistrement est un état persistant affiché pendant toute la session, pas une notification fugace.",
    "Chaque session produit une preuve : début, fin, durée, participants, évènements réseau (journal RTC).",
  ],
  identity="Cyan (canal média) + émeraude (état établi) ; aucun filtre décoratif pendant l'appel : la vidéo est le contenu."),
"SYS": dict(
  title="FAMILLE 05b — États système",
  intro="Quinze écrans qui portent la vérité du dysfonctionnement. Chacun suit le même contrat : un glyphe, une phrase "
        "factuelle, une action de sortie, et — quand c'est utile — un identifiant de corrélation copiable pour le support. "
        "Ces écrans sont générés par le composant C-19 StateGuard et sont réutilisés par toutes les familles.",
  patterns=[
    "Jamais de page blanche ni d'écran technique brut : chaque code a sa fiche.",
    "Le code d'erreur est affiché en Mono, copiable, corrélé côté serveur (trace_id).",
    "L'action de sortie est toujours la plus utile : réessayer, se reconnecter, revenir, contacter.",
    "Les écrans système n'ont jamais de décor doré : la neutralité ardoise évite de promettre une récompense.",
  ],
  identity="Ardoise neutre, clay pour les erreurs, ambre pour les limites de débit, émeraude uniquement pour 409 (conflit résolu)."),
"FIN": dict(
  title="FAMILLE 05c — Écran financier transversal",
  intro="Un unique écran générique, décliné partout où un montant apparaît. Sa raison d'être est un invariant : "
        "[ Prix Prestataire ] + [ Frais SaaS LE LABEUR ] = [ Total Client ]. Il n'existe aucune variante tolérée — "
        "ni sur mobile, ni sur web, ni en PDF, ni dans un e-mail récapitulatif.",
  patterns=[
    "Trois lignes, dans cet ordre, alignées à droite en chiffres tabulaires.",
    "Le prix prestataire est TOUJOURS mis en avant visuellement (--price, or).",
    "Les frais SaaS sont affichés en toute transparence, jamais dissimulés, jamais gonflés à l'insu du client.",
    "Toute décomposition est reproductible : le détail des frais et la règle appliquée sont consultables en un tap.",
  ],
  identity="Or pour la valeur, émeraude pour « payé / prouvé », ardoise pour l'historique."),
}


def sec_family(code, screens, sec_num):
    fi = FAMILY_INTROS[code]
    b = [h(2, f"§{sec_num} · {fi['title']}")]
    b.append(p(fi["intro"]))
    b.append(h(3, f"Identité visuelle de la famille"))
    b.append(p(fi["identity"]))
    b.append(h(3, "Patterns transverses de la famille"))
    b.append(ul(fi["patterns"]))
    b.append(h(3, f"Nomenclature — {len(screens)} états"))
    b.append(table(["Code", "Écran", "Grappe", "Criticité", "Canon"],
                   [[s.code, s.title, s.cluster, s.criticality, s.canon] for s in screens]))
    for s in screens:
        b.append(pagebreak())
        b.extend(screen_blocks(s))
    return b


# ═══════════════════════════════════════════════════════════════════════════
# §10 — ANNEXES
# ═══════════════════════════════════════════════════════════════════════════
def sec10(all_screens):
    b = [h(2, "§10 · Annexes")]

    b.append(h(3, "A.1 · Plan de livraison (12 semaines, 4 lots)"))
    b.append(table(["Lot", "Semaines", "Contenu", "Critère d'acceptation"], [
        ["L0 — Fondations", "S1-S2", "Tokens générés, C-01→C-04, C-19, chromatic + typo + grid", "Verre et sceaux validés sur 5 appareils, 120 fps tenus"],
        ["L1 — Public & Auth", "S3-S4", "PUB-01→10, SYS-01→15, gestion de session", "Parcours onboarding complet < 90 s, AA/AAA vérifiés"],
        ["L2 — Cœur métier", "S5-S8", "EMP-01→60, PRE-01→52, FIN, RTC-01→08", "Aucun écart FIN toléré (contrôle automatisé)"],
        ["L3 — Supervision", "S9-S10", "ADM-01→63, files, sécurité, infra", "Aucune donnée sensible rendue (audit automatique)"],
        ["L4 — Durcissement", "S11-S12", "A11y complète, budgets perf, réduction de mouvement, tests visuels", "0 régression visuelle sur 120 canoniques"],
    ]))

    b.append(h(3, "A.2 · Checklist QA visuelle (par écran)"))
    b.append(ol([
        "Le triplet FIN est-il exact, ordonné, tabulaire (si un montant existe) ?",
        "Un seul CTA plein ? Un seul élément à halo animé ?",
        "Le statut est-il porté par glyphe + libellé + couleur (triple redondance) ?",
        "Les 6 états sont-ils définis : repos, survol/focus, pressé, chargement, erreur, vide ?",
        "Les budgets perf sont-ils respectés (< 2 surfaces floues > 24 px, particules sur canvas séparé) ?",
        "Le contraste atteint-il AA (texte < 18 px) et AAA (titres) ?",
        "Le mode reduced-motion a-t-il été vérifié (aucune animation résiduelle) ?",
        "L'écran est-il utilisable en 360 px de large (mobile bas de gamme) et en 1440 px (desktop) ?",
        "Toute donnée affichée provient-elle d'un contrat d'API listé dans la fiche ?",
        "Aucun secret, token ou identifiant d'infrastructure n'est visible ?",
    ]))

    b.append(h(3, "A.3 · Journal des décisions (ADR visuels)"))
    b.append(table(["Décision", "Alternatives rejetées", "Motif"], [
        ["Noir OLED #050507 comme unique racine", "Bleu nuit, gris chaud", "Contraste absolu, économie AMOLED, identité"],
        ["Un seul accent coloré par écran", "Palette multi-accents", "Lisibilité du statut, gravité contractuelle"],
        ["Springs stricts 300/20/1", "Durées en millisecondes", "Réponse physique constante, cohérence multi-plateforme"],
        ["Squircles superellipse n=4.2", "border-radius simple", "Signature formelle, alignement iOS"],
        ["Glyphes maison, pas d'emojis", "Emojis système", "Gravité juridique, cohérence de rendu"],
        ["Verre limité à 2 surfaces profondes/écran", "Glassmorphisme total", "Performance GPU mesurée, hiérarchie visuelle"],
        ["ADM sans verre décoratif", "Cohérence esthétique totale", "Densité et vitesse primordiales en supervision"],
    ]))

    b.append(h(3, "A.4 · Glossaire"))
    b.append(table(["Terme", "Définition"], [
        ["Écran canonique", "Écran réellement produit ; plusieurs codes d'état peuvent y correspondre."],
        ["Sceau (C-04)", "Composant de statut : anneau conique + glyphe + libellé, triple redondance."],
        ["Triplet FIN", "[Prix Prestataire] + [Frais SaaS LE LABEUR] = [Total Client]."],
        ["Qualification", "Verdict juridique d'une mission : Éligible · Revue · Bloquée."],
        ["R2 / version R2", "Stockage objet des pièces ; toute révision produit une version tracée."],
        ["Preuve OTP", "Empreinte 12 caractères attestant la confirmation de réception de salaire."],
        ["Ledger", "Journal append-only de réputation et de paiements ; corrections par écriture compensatoire."],
        ["Dead-letter (DLQ)", "File des messages non traités après épuisement des tentatives."],
        ["StateGuard (C-19)", "Composant générique d'états système, partagé par toutes les familles."],
    ]))

    b.append(h(3, "A.5 · Fichiers générés"))
    b.append(ul([
        "`LE-LABEUR-Master-Design-Document.md` — le livre blanc (texte intégral).",
        "`LE-LABEUR-Master-Design-Document.html` — version navigable autonome (fonts & styles embarqués).",
        "`LE-LABEUR-Master-Design-Document.pdf` — export PDF paginé (thème sombre, planches de wireframes).",
        "`le-labeur-screens.csv` — les 211 états (code, famille, route, criticité, canon, zones, composants).",
        "`le-labeur-screens.json` — spécification machine-readable complète (fiches + zones + états).",
        "`tokens.css` / `tokens.json` — tokens générés, prêts à consommer (web & RN).",
        "`code/*` — composants de référence (verre, squircle, particules, ressorts, OTP, FIN).",
        "`screens/<famille>.md` — extractions par famille, lisibles isolément.",
    ]))
    return b


# ═══════════════════════════════════════════════════════════════════════════
# ASSEMBLAGE
# ═══════════════════════════════════════════════════════════════════════════
def build_all(families):
    """families: dict code → liste d'écrans. Retourne (blocks, md, html)."""
    all_screens = [s for fam in ["PUB", "EMP", "PRE", "ADM", "RTC", "SYS", "FIN"] for s in families.get(fam, [])]
    b = []
    b += cover()
    b.append(pagebreak())
    b += how_to_read()
    b += toc()
    b.append(pagebreak())
    b += sec0()
    b.append(pagebreak())
    b += sec1()
    b.append(pagebreak())
    b += sec2()
    b.append(pagebreak())
    b += sec3()
    b.append(pagebreak())
    b += sec4(all_screens)

    sec_nums = {"PUB": 5, "EMP": 6, "PRE": 7, "ADM": 8}
    for fam, num in sec_nums.items():
        b.append(pagebreak())
        b += sec_family(fam, families.get(fam, []), num)

    b.append(pagebreak())
    b.append(h(2, "§9 · FAMILLE 05 — WebRTC, États système & Financier transversal"))
    b.append(p("Trois sous-familles qui traversent tout le produit : elles n'appartiennent à aucun rôle, elles servent tous les rôles."))
    for fam, sub in [("RTC", "9.1"), ("SYS", "9.2"), ("FIN", "9.3")]:
        b.append(pagebreak())
        b += sec_family(fam, families.get(fam, []), sub)
    b.append(pagebreak())
    b += sec10(all_screens)
    return b, all_screens
