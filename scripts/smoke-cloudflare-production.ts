/**
 * LE LABEUR — P0-CLOUDFLARE-PRODUCTION — smoke tests de production.
 *
 * Contrat de sûreté (aucune exception) :
 *   * LECTURE SEULE : le script ne fait que des `GET` et des requêtes
 *     volontairement refusées (401/404/405). Aucune écriture, aucun dossier
 *     métier modifié, aucun paiement, aucun transfert, aucune migration ;
 *   * AUCUN SECRET fourni n'est journalisé (seule sa présence est testée) ;
 *   * AUCUN résultat n'est inventé : sans URL déployée ou sans session ADMIN,
 *     les vérifications correspondantes sont rendues `BLOCKED_EXTERNAL_ACCESS`,
 *     jamais `OK`.
 *
 * Utilisation :
 *   LELABEUR_SMOKE_BASE_URL="https://lelabeur-api.<compte>.workers.dev" \
 *     npm run smoke:production
 *
 *   # Pour les vérifications détaillées (/readyz complet) : fournir une session
 *   # ADMIN disposant de la permission EXISTANTE `audit:read`.
 *   LELABEUR_SMOKE_SESSION_COOKIE="lelabeur_session=…" npm run smoke:production
 *
 * Codes de sortie : 0 = tout est vérifié et conforme ; 3 = au moins une
 * vérification est bloquée par une ressource externe manquante ; 1 = échec réel
 * (le service ne se comporte pas comme la production l'exige).
 */

const BASE_URL = process.env.LELABEUR_SMOKE_BASE_URL?.trim().replace(/\/$/, '');
const SESSION_COOKIE = process.env.LELABEUR_SMOKE_SESSION_COOKIE?.trim();
const BASE_URL_VALUE = BASE_URL ?? '';
const EXPECTED_CHECKS = [
  'worker', 'postgres', 'migrations', 'queue', 'cron',
  'automation', 'notifications', 'documents', 'r2', 'audit',
] as const;

type Status = 'ok' | 'blocked-external' | 'failed';

interface SmokeResult {
  id: string;
  status: Status;
  detail: string;
}

const results: SmokeResult[] = [];

function record(id: string, status: Status, detail: string): void {
  results.push({ id, status, detail });
}

async function fetchWithTimeout(path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(`${BASE_URL_VALUE}${path}`, { ...init, signal: controller.signal, redirect: 'manual' });
  } finally {
    clearTimeout(timer);
  }
}

interface ReadinessBody {
  status?: string;
  apiVersion?: string;
  detailed?: boolean;
  violations?: unknown;
  resources?: unknown;
  checks?: Array<{ id?: string; status?: string; detail?: string; observed?: Record<string, unknown> }>;
}

/** Un corps de réponse ne doit JAMAIS contenir de secret ni de chaîne de connexion. */
function assertNoSecretLeak(label: string, text: string): void {
  const patterns: RegExp[] = [/postgres(ql)?:\/\/[^\s"']*@/i, /password\s*=\s*\S+/i, /\[secret|sup3r|secret_/i];
  for (const pattern of patterns) {
    if (pattern.test(text)) throw new Error(`${label}: une valeur sensible apparaît dans la réponse`);
  }
  if (SESSION_COOKIE && text.includes(SESSION_COOKIE)) {
    throw new Error(`${label}: le cookie de session fourni apparaît dans la réponse`);
  }
}

async function checkAnonymousSurface(): Promise<void> {
  /* 1 — Worker vivant + forme du rapport de santé. */
  try {
    const response = await fetchWithTimeout('/healthz');
    const text = await response.text();
    assertNoSecretLeak('/healthz', text);
    const body = JSON.parse(text) as { status?: string; apiVersion?: string; persistence?: unknown; runtime?: unknown };
    if (body.apiVersion !== 'v1') throw new Error(`apiVersion inattendue: ${body.apiVersion}`);
    if (!['ok', 'degraded', 'boundary-only'].includes(body.status ?? '')) {
      throw new Error(`status inattendu: ${body.status}`);
    }
    if (![200, 503].includes(response.status)) throw new Error(`code HTTP inattendu: ${response.status}`);
    if ((response.status === 503) !== (body.status === 'degraded')) {
      throw new Error(`incohérence statut HTTP/état: ${response.status} / ${body.status}`);
    }
    record('http.healthz', 'ok', `GET /healthz → ${response.status} « ${body.status} » (aucune fuite de secret)`);
  } catch (error) {
    record('http.healthz', 'failed', String((error as Error)?.message ?? error));
  }

  /* 2 — Préparation de production : statuts seuls pour un appelant anonyme. */
  let readiness: ReadinessBody | null = null;
  try {
    const response = await fetchWithTimeout('/readyz');
    const text = await response.text();
    assertNoSecretLeak('/readyz', text);
    readiness = JSON.parse(text) as ReadinessBody;
    if (!['ready', 'degraded', 'blocked'].includes(readiness.status ?? '')) {
      throw new Error(`status inattendu: ${readiness.status}`);
    }
    if (readiness.detailed !== false) throw new Error('le rapport anonyme ne doit PAS être détaillé');
    if (readiness.resources !== undefined || readiness.violations !== undefined) {
      throw new Error('le rapport anonyme ne doit exposer ni ressources ni violations détaillées');
    }
    if (readiness.checks && readiness.checks.length > 0) {
      const missing = EXPECTED_CHECKS.filter(id => !readiness!.checks!.some(check => check.id === id));
      if (missing.length > 0) throw new Error(`vérifications absentes: ${missing.join(', ')}`);
    }
    record('http.readyz', 'ok', `GET /readyz → ${response.status} « ${readiness.status} » (statuts seuls, détail protégé)`);
  } catch (error) {
    record('http.readyz', 'failed', String((error as Error)?.message ?? error));
  }

  /* 3 — Frontière d'authentification : aucune route protégée ne s'ouvre. */
  try {
    const protectedPaths = [
      '/api/v1/me',
      '/api/v1/admin/users',
      '/api/v1/admin/audit',
      '/api/v1/admin/payments',
    ];
    for (const path of protectedPaths) {
      const response = await fetchWithTimeout(path);
      if (response.status !== 401) throw new Error(`${path} → ${response.status} (401 attendu sans session)`);
    }
    record('http.auth-boundary', 'ok', `${protectedPaths.length} routes protégées refusent l’accès anonyme (401)`);
  } catch (error) {
    record('http.auth-boundary', 'failed', String((error as Error)?.message ?? error));
  }

  /* 4 — Aucune route de drain/cron/debug exposée par un Worker DÉPLOYÉ. */
  try {
    const forbidden: Array<[string, string]> = [
      ['/__scheduled', 'GET'],
      ['/__scheduled?cron=*+*+*+*+*', 'POST'],
      ['/api/v1/automation/drain', 'POST'],
      ['/api/v1/cron', 'POST'],
      ['/api/v1/automation/run', 'POST'],
      ['/api/v1/scheduled', 'POST'],
    ];
    for (const [path, method] of forbidden) {
      const response = await fetchWithTimeout(path, { method, ...(method === 'POST' ? { body: '{}' } : {}) });
      if (![404, 405].includes(response.status)) {
        throw new Error(`${method} ${path} → ${response.status} (404/405 attendu)`);
      }
    }
    record('http.no-debug-route', 'ok', `${forbidden.length} routes de déclenchement/diagnostic absentes ou refusées`);
  } catch (error) {
    record('http.no-debug-route', 'failed', String((error as Error)?.message ?? error));
  }

  /* 5 — Le rapport de santé n'accepte aucune mutation. */
  try {
    const response = await fetchWithTimeout('/healthz', { method: 'POST', body: '{}' });
    if (![404, 405, 501].includes(response.status)) {
      throw new Error(`POST /healthz → ${response.status} (aucune mutation attendue)`);
    }
    record('http.healthz-readonly', 'ok', `POST /healthz refusé (${response.status}) : le diagnostic reste en lecture`);
  } catch (error) {
    record('http.healthz-readonly', 'failed', String((error as Error)?.message ?? error));
  }

  /* 6 — Paiements : aucune route financière ne s'ouvre sans session ADMIN. */
  try {
    const response = await fetchWithTimeout('/api/v1/admin/payments/smoke-test-payment/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': 'smoke-000000-0000' },
      body: '{}',
    });
    if (response.status !== 401) throw new Error(`approbation anonyme → ${response.status} (401 attendu)`);
    record('payment.inert', 'ok', 'aucune transition de paiement accessible anonymement (aucun paiement déclenché par ce test)');
  } catch (error) {
    record('payment.inert', 'failed', String((error as Error)?.message ?? error));
  }

  return;
}

async function checkDetailedSurface(): Promise<void> {
  if (!SESSION_COOKIE) {
    for (const id of ['http.readyz.detailed', 'cron.proof', 'postgres.proof', 'migrations.proof', 'r2.proof']) {
      record(id, 'blocked-external', 'session ADMIN non fournie (LELABEUR_SMOKE_SESSION_COOKIE) : vérification impossible sans authentification');
    }
    return;
  }

  const response = await fetchWithTimeout('/readyz', { headers: { cookie: SESSION_COOKIE } });
  const text = await response.text();
  assertNoSecretLeak('/readyz (détaillé)', text);
  const body = JSON.parse(text) as ReadinessBody;

  if (body.detailed !== true) {
    record('http.readyz.detailed', 'failed', `le détail ADMIN n’est pas servi (detailed=${String(body.detailed)})`);
    return;
  }
  record('http.readyz.detailed', 'ok', `rapport détaillé servi à la session ADMIN (permission audit:read), ${body.checks?.length ?? 0} vérifications`);

  const byId = new Map((body.checks ?? []).map(check => [check.id, check]));
  const assertOk = (id: string, label: string, requirement: string) => {
    const check = byId.get(id);
    if (!check) {
      record(label, 'failed', `vérification « ${id} » absente du rapport`);
      return;
    }
    if (check.status !== 'ok') {
      record(label, check.status === 'blocked' ? 'blocked-external' : 'failed', `${requirement} — état observé: ${check.status} (${check.detail ?? 'sans détail'})`);
      return;
    }
    record(label, 'ok', requirement);
  };

  assertOk('postgres', 'postgres.proof', 'PostgreSQL sondé (SELECT 1) et joignable');
  assertOk('migrations', 'migrations.proof', 'migrations attendues appliquées (schema_migrations)');
  assertOk('cron', 'cron.proof', 'cadence déclarée ET dernier tick réellement tracé (CRON_TICK_EXECUTED)');
  assertOk('queue', 'queue.proof', 'file durable lisible (aucun dead-letter, aucun claim orphelin)');
  assertOk('r2', 'r2.proof', 'binding R2 répondant à une lecture head');
  assertOk('documents', 'documents.proof', 'métadonnées documentaires lisibles');
  assertOk('notifications', 'notifications.proof', 'boîte In-App lisible');
  assertOk('audit', 'audit.proof', 'ledger d’audit opérationnel');

  if (Array.isArray(body.violations) && body.violations.length > 0) {
    record('production.invariants', 'failed', `invariants de production violés: ${body.violations.length}`);
  } else {
    record('production.invariants', 'ok', 'aucun invariant de production violé');
  }
}

async function main(): Promise<void> {
  console.log('============================================================');
  console.log(' LE LABEUR — P0-CLOUDFLARE-PRODUCTION — smoke tests (lecture seule)');
  console.log('============================================================');

  if (!BASE_URL) {
    console.log('BLOCKED_EXTERNAL_ACCESS  deployment.base-url — LELABEUR_SMOKE_BASE_URL absent :');
    console.log('                         aucun Worker n’est déployé dans cette session (aucun compte Cloudflare),');
    console.log('                         donc aucun smoke test HTTP de production ne peut être exécuté.');
    console.log('                         Les vérifications équivalentes exécutables localement restent :');
    console.log('                           npm test / npm run verify:postgres / npm run verify:workerd / npm run deploy:preflight');
    process.exitCode = 3;
    return;
  }

  await checkAnonymousSurface();
  await checkDetailedSurface();

  for (const result of results) {
    const prefix = result.status === 'ok' ? 'OK      ' : result.status === 'failed' ? 'FAILED  ' : 'BLOCKED_EXTERNAL_ACCESS ';
    console.log(`${prefix} ${result.id} — ${result.detail}`);
  }
  const failed = results.filter(result => result.status === 'failed').length;
  const blocked = results.filter(result => result.status === 'blocked-external').length;
  console.log('------------------------------------------------------------');
  console.log(`Vérifiés : ${results.length - failed - blocked}/${results.length - blocked} — échecs : ${failed} — bloqués : ${blocked}`);
  console.log('Aucun paiement, aucun transfert et aucune écriture n’ont été déclenchés par ces tests.');
  process.exitCode = failed > 0 ? 1 : blocked > 0 ? 3 : 0;
}

void main().catch(error => {
  console.error(`Smoke tests interrompus: ${String((error as Error)?.message ?? error)}`);
  process.exitCode = 1;
});
