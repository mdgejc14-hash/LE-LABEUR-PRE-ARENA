// springs.ts — sources uniques des quatre ressorts LE LABEUR
// LE LABEUR · Cyber-Luxe Organique · extraction de la Section 3 du Master Design Document
//──────────────────────────────────────────────────────────────────────────
// code/springs.ts — sources uniques des quatre ressorts LE LABEUR
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
  : { type: "spring", ...SPRING.snap };
