// format-secret.ts — toute valeur d'infrastructure passe par ce formateur
// LE LABEUR · Cyber-Luxe Organique · extraction de la Section 3 du Master Design Document
//──────────────────────────────────────────────────────────────────────────
// code/format-secret.ts — toute valeur d'infrastructure passe par ce formateur
export const formatSecret = (v: string): string =>
  v.length <= 6 ? "••••••" : `${v.slice(0, 2)}••••${v.slice(-2)}`;   // jamais exploitable

export const formatInfra = (kind: "r2" | "pg" | "turn" | "worker", state: string) => ({
  r2:     `Bucket média — état ${state}`,                  // pas de nom de bucket exposé
  pg:     `PostgreSQL (Hyperdrive) — état ${state}`,       // pas d'hôte, pas de port
  turn:   `TURN/STUN — état ${state}`,                     // pas d'URL de serveur
  worker: `Worker edge — état ${state}`,                   // pas de version hash exposée
}[kind]);
