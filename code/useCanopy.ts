// USE CANOPY — LE LABEUR · Cyber-Luxe Organique
// Hook unique d'animation : une seule source de vérité pour les quatre ressorts,
// le multiplicateur global d'intensité et les haptiques associées.
// Règle INV-6 : aucun composant ne redéclare une constante physique.
// ────────────────────────────────────────────────────────────────────────────
import { useEffect } from "react";
import {
  useSharedValue,
  withSpring,
  withTiming,
  cancelAnimation,
  useAnimatedStyle,
  interpolate,
  useDerivedValue,
  Easing,
  type SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

// ── Les quatre ressorts officiels (Section 2.3 du document) ────────────────
export const SPRINGS = {
  snap: { stiffness: 300, damping: 20, mass: 1 }, // SIGNATURE — taps, cartes, sceaux
  soft: { stiffness: 240, damping: 26, mass: 1 }, // transitions calmes, listes
  heavy: { stiffness: 180, damping: 28, mass: 1 }, // panneaux de bas niveau, folios
  pop: { stiffness: 420, damping: 16, mass: 1 },  // erreurs, refus, attention brève
} as const;

export type SpringName = keyof typeof SPRINGS;

// ── Ressort « snap » : l'unique geste tactile du produit ───────────────────
export const withSnap = (to: number | object) => withSpring(to as number, SPRINGS.snap);
export const withSoft = (to: number | object) => withSpring(to as number, SPRINGS.soft);
export const withHeavy = (to: number | object) => withSpring(to as number, SPRINGS.heavy);
export const withPop = (to: number | object) => withSpring(to as number, SPRINGS.pop);

// ── Haptique : jamais gratuite, toujours sémantique ───────────────────────
export const HAPTIC: Record<string, () => void> = {
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  rigid: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  selection: () => Haptics.selectionAsync(),
};

/**
 * useCanopy — un seul hook pour tous les gestes d'interface.
 *
 * @param intensity  multiplicateur global (SYS-15 · accessibilité « intensité des animations »)
 * @param enabled    false en mode « réduction de mouvement » : les valeurs sont posées, pas animées
 */
export function useCanopy({ intensity = 1, enabled = true } = {}) {
  const p = useSharedValue(0);        // progress 0→1 du geste
  const lift = useSharedValue(0);     // élévation (ombre + lumière)
  const glow = useSharedValue(0);     // gain d'éclat or/émeraude

  const dur = (ms: number) => ms / Math.max(0.35, intensity);

  const press = (haptic: keyof typeof HAPTIC | null = "light") => {
    if (haptic) HAPTIC[haptic]?.();
    if (!enabled) { p.value = 1; lift.value = 1; return; }
    p.value = withSnap(1);
    lift.value = withTiming(1, { duration: dur(120), easing: Easing.bezier(0.22, 1, 0.36, 1) });
  };

  const release = (haptic: keyof typeof HAPTIC | null = null) => {
    if (haptic) HAPTIC[haptic]?.();
    if (!enabled) { p.value = 0; lift.value = 0; return; }
    p.value = withSnap(0);
    lift.value = withSoft(0);
  };

  const reveal = () => {
    if (!enabled) { glow.value = 1; return; }
    glow.value = withTiming(1, { duration: dur(640), easing: Easing.bezier(0.22, 1, 0.36, 1) });
  };

  const reset = () => { glow.value = 0; };

  // Style prêt à l'emploi : échelle + élévation, interpolées depuis le ressort.
  const style = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(p.value, [0, 1], [1, 1 - 0.02 * intensity]) },
      { translateY: interpolate(lift.value, [0, 1], [0, -2]) },
    ],
    opacity: interpolate(p.value, [0, 1], [1, 0.94]),
  }));

  return { p, lift, glow, style, press, release, reveal, reset, intensity, enabled };
}

/**
 * useEntrance — entrée de contenu (listes, cartes, folios).
 * Toujours ≤ 3 niveaux de stagger profond, jamais de cascade au-delà de 8 items :
 * au-delà, l'utilisateur perçoit une lenteur (test utilisateur S8).
 */
export function useEntrance(index = 0, intensity = 1) {
  const item = Math.min(index, 7);
  const appear = useSharedValue(0);

  useEffect(() => {
    const delay = item * 60 / Math.max(0.35, intensity);
    appear.value = withTiming(1, {
      duration: 420 / Math.max(0.35, intensity),
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
    return () => cancelAnimation(appear);
  }, [appear, item, intensity]);

  return useAnimatedStyle(() => ({
    opacity: interpolate(appear.value, [0, 1], [0, 1]),
    transform: [
      { translateY: interpolate(appear.value, [0, 1], [14, 0]) },
      { scale: interpolate(appear.value, [0, 1], [0.985, 1]) },
    ],
  }));
}

/**
 * useOrientationLight — éclairage dynamique (Section 1.3).
 * Fréquence volontairement limitée à 30 Hz : l'œil ne distingue pas le
 * déplacement du reflet au-delà, et la batterie compte.
 */
export function useOrientationLight(deviceMotion$: SharedValue<{ x: number; y: number }>) {
  const light = useDerivedValue(() => {
    const { x, y } = deviceMotion$.value;
    return {
      // Normalisé : le verre réagit dans une fenêtre étroite, jamais en plein soleil.
      angle: 135 + x * 22,
      x: interpolate(y, [-1, 1], [22, 78], "clamp"),
      y: interpolate(x, [-1, 1], [18, 82], "clamp"),
    };
  }, [deviceMotion$]);

  return useAnimatedStyle(() => ({
    // Passe par un gradient animé côté natif (Skia) — jamais par le thread JS.
    transform: [{ rotate: `${(light.value.angle - 135) * 0.12}deg` }],
  }));
}

// ── Intégration plateforme ────────────────────────────────────────────────
export const hapticsAvailable = Platform.OS === "ios" || Platform.OS === "android";
