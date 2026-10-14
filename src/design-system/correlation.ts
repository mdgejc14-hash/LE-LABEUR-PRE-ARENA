/**
 * LE LABEUR — Code de corrélation affichable (C-19 StateGuard, INV-6).
 *
 * Seul un identifiant de REQUÊTE émis par le serveur peut être affiché, c'est-à-dire l'un des
 * trois formats réellement produits par l'API (src/backend/api/worker.ts) ou prévus par la fiche SYS-09 :
 *  - UUID (crypto.randomUUID) : error.requestId et en-tête x-request-id ;
 *  - repli « req-<base36>-<base36> » lorsque randomUUID est absent ;
 *  - trace-id au format W3C (32 hexadécimaux), prévu par SYS-09 (« trace_id »).
 * Tout autre valeur est refusée : identifiants d'entités (« usr_… »), clés, jetons, DSN, URL.
 * Une valeur refusée n'est jamais rendue ni copiable.
 */

const SERVER_REQUEST_ID_FORMATS: readonly RegExp[] = [
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  /^req-[0-9a-z]{1,12}-[0-9a-z]{1,12}$/,
  /^[0-9a-f]{32}$/,
];

// Filet de sécurité supplémentaire : mots-clés et schémas de secrets, même dans un format accepté.
const SECRET_HINTS = /(secret|token|passw|dsn|api[_-]?key|bearer|whsec|eyJ|postgres|mysql|redis|https?:|@|\/\/)/i;

/** Renvoie l'identifiant s'il est affichable (format serveur, sans indice de secret), sinon `null`. */
export function sanitizeCorrelationId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (SECRET_HINTS.test(candidate)) return null;
  return SERVER_REQUEST_ID_FORMATS.some((format) => format.test(candidate)) ? candidate : null;
}
