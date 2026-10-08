// tap.tsx — le tap LE LABEUR: lumière + relief + haptique + son optionnel
// LE LABEUR · Cyber-Luxe Organique · extraction de la Section 3 du Master Design Document
//──────────────────────────────────────────────────────────────────────────
// code/tap.tsx — le tap LE LABEUR: lumière + relief + haptique + son optionnel
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
}
