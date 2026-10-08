// squircle.ts — superellipse |x/a|^n + |y/b|^n = 1, n = 4.2
// LE LABEUR · Cyber-Luxe Organique · extraction de la Section 3 du Master Design Document
//──────────────────────────────────────────────────────────────────────────
// code/squircle.ts — superellipse |x/a|^n + |y/b|^n = 1, n = 4.2
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

// SVG clip-path équivalent pour le web: <clipPath id="sq22"><path d={superellipsePath(320, 200)}/></clipPath>
