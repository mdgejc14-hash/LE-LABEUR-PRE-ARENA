/** Concatène les classes non vides (aucune dépendance externe). */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
