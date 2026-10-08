// particles.ts — fragment shader unique, 120 fps, zéro allocation
// LE LABEUR · Cyber-Luxe Organique · extraction de la Section 3 du Master Design Document
//──────────────────────────────────────────────────────────────────────────
// code/particles.ts — fragment shader unique, 120 fps, zéro allocation
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
}
