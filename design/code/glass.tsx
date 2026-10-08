// glass.tsx — GlassSurface (React Native + Web, un seul contrat)
// LE LABEUR · Cyber-Luxe Organique · extraction de la Section 3 du Master Design Document
//──────────────────────────────────────────────────────────────────────────
// code/glass.tsx — GlassSurface (React Native + Web, un seul contrat)
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
}`)!;
