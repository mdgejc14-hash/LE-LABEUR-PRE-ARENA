/**
 * Configuration & Flags d'environnement LE LABEUR
 * En production : VITE_DEMO_MODE=false (par défaut)
 * En mode démonstration / QA : VITE_DEMO_MODE=true
 */
export const IS_DEMO_MODE: boolean =
  typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_DEMO_MODE === 'true';
