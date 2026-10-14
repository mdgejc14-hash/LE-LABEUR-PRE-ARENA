# LE LABEUR — Master Design Document

**Design System & Spécification Master UI/UX** — livre blanc de référence, exportable en PDF.
ADN visuel : **Cyber-Luxe Organique** (noir OLED, basalte mat, dorure néon, émeraude luminescente, verre fumé réfractif).

---

## Chiffres du document

| Nomenclature | États | Canons logiques | Écrans de production |
|---|---:|---:|---:|
| PUB — Public & Onboarding | 10 | 10 | **10** |
| EMP — Client / Employeur | 60 | 44 | **32** |
| PRE — Prestataire / Candidat | 52 | 38 | **26** |
| ADM — Admin & Supervision | 63 | 59 | **34** |
| RTC — WebRTC & temps réel | 8 | 8 | **5** |
| SYS — États système | 15 | 15 | **10** |
| FIN — Financier transversal | 3 | 3 | **3** |
| **TOTAL** | **211** | **177** | **120** |

Lecture : 211 codes d'état (la nomenclature officielle) → 177 écrans canoniques logiques →
**120 écrans réellement à produire** (regroupements documentés dans `llab/units.py`, section §4.2 du livre).
Le compte est vérifié automatiquement par le pipeline : tout écart fait échouer le build.

## Livrables (`out/`)

| Fichier | Contenu |
|---|---|
| `LE-LABEUR-Master-Design-Document.pdf` | **Le livre complet — 462 pages**, thème sombre, une fiche par page |
| `LE-LABEUR-Master-Design-Document.html` | Version navigable **autonome** (polices embarquées en base64) |
| `LE-LABEUR-Master-Design-Document.md` | Texte intégral (Markdown), 1,6 Mo |
| `le-labeur-screens.csv` | Les 211 états : code, famille, grappe, route, rôle, criticité, canon, zones, composants, états, tokens |
| `le-labeur-screens.json` | Spécification machine-readable complète (zones, composants, états, mouvement, règles, tokens, API, tech, a11y) |
| `tokens.css` / `tokens.json` | Tokens générés, prêts à consommer (web & React Native) |
| `screens/<famille>.md` | Extraction par famille, lisible isolément (7 fichiers) |
| `screens/<famille>-cards.html` | Planches de cartes d'écran (une fiche par carte) |
| `RAPPORT-DE-LIVRAISON.md` | **Preuve d'achèvement** régénérée à chaque exécution : volumétrie, contrôles automatiques, inventaire |
| `index.json` | Inventaire généré : chiffres, chemins, horodatage |

## Structure du livre

- **§0** Invariants du produit — les six lois non négociables (dont INV-1 : triplet financier)
- **§1** ADN visuel « Cyber-Luxe Organique » : palette, matériaux (IOR 1.52, niveaux de verre 1→4), éclairage dynamique
  accéléromètre/gyroscope, fusion des dix styles UI de pointe, interdits et anti-patterns
- **§2** Design System : typographie cinétique, grille, rayons (squircles n = 4.2), élévation E0→E4,
  mouvements (ressorts snap 300/20/1, soft, heavy, pop), registre C-01→C-20, iconographie, son, dataviz, accessibilité
- **§3** Guide d'exécution technique : stack (React Native + Reanimated 3 / Next.js RSC / Three.js-R3F + Skia),
  algorithme du verre volumétrique, extrusion squircle, champ de particules GLSL 120 fps, ressorts, optimisation GPU,
  affichage sécurisé (`formatSecret()`)
- **§4** Cartographie : 211 états → 177 canoniques → **120 écrans de production** (matrice de fabrication + correspondances)
- **§5→§9** Les 211 fiches : intention, maquette textuelle (cadre 390 × 844), zones Z1→Zn avec traitement visuel,
  composants, états, mouvement, règles métier opposables, tokens, contrats d'API, exécution technique, accessibilité
- **§10** Annexes : plan de livraison 12 semaines / 4 lots, checklist QA, décisions d'architecture (ADR), glossaire

## Composants de référence (`code/`)

| Fichier | Rôle |
|---|---|
| `glass.tsx` | Surface de verre volumétrique 1→4 : trois passes (blur, réfraction, rim), grain fractal, voile gyroscopique |
| `squircle.ts` | Superellipse \|x/a\|^n + \|y/b\|^n = 1 (n = 4.2), chemin fermé RN/Web identique |
| `particles.ts` | Champ de particules GLSL 120 fps, densité pilotée par l'état, zéro allocation par image |
| `springs.ts` | Les quatre ressorts officiels, une seule source de vérité |
| `tap.tsx` | Le tap LE LABEUR : lumière, relief, haptique, son optionnel |
| `useCanopy.ts` | Hook d'animation unifié + entrées échelonnées + éclairage d'orientation (30 Hz) |
| `PriceBreakdown.tsx` | **Invariant INV-1** : `[ Prix Prestataire ] + [ Frais SaaS LE LABEUR ] = [ Total Client ]` |
| `OtpProof.tsx` | **Invariant INV-4** : preuve de réception de salaire (12 caractères), état « payé » jamais usurpé |
| `telemetry.ts` | Budgets d'images par type d'écran, règles d'isolation GPU, sonde de mesure 120 fps |
| `format-secret.ts` | Aucun secret d'infrastructure rendu, jamais (tokens, OTP, clés PSP, DSN, buckets, URLs TURN) |

## Régénérer les livrables

```bash
cd le-labeur
pip3 install weasyprint            # dépendance non persistante du rendu PDF
python3 -m llab.run                # tout recompiler : MD, HTML, PDF, CSV, JSON, tokens, extractions
python3 -m llab.units              # contrôle : 211 états → 177 canoniques → 120 écrans de production
```

Le pipeline échoue si les 120 écrans de production ne sont pas atteints ; il imprime l'inventaire des fichiers écrits.

## Arborescence

```
le-labeur/
├── llab/
│   ├── tokens.py            # source unique des tokens (couleurs, verre, typo, mouvement, C-01→C-20…)
│   ├── model.py             # Screen/Zone, validate(), canonical_count()
│   ├── archetypes.py        # moteur de maquettes ASCII (cadre 64 chars, 20 gabarits par nature de zone)
│   ├── units.py             # consolidation 211 → 177 → 120 (arbitrage versionné)
│   ├── run.py               # pipeline de production documentaire
│   ├── content/             # 17 modules : pub, emp_a→d, pre_a→d, adm_a→e, rtc, sys, fin
│   └── render/              # blocks (MD/HTML), document (le livre), export (PDF/CSV/JSON/tokens)
├── assets/fonts/            # Inter (4 graisses, instances statiques), JetBrains Mono, Space Grotesk
├── code/                    # composants de référence extraits de la §3
└── out/                     # livrables générés
```
