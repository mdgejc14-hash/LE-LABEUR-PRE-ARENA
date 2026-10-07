/**
 * LE LABEUR — P0-LOAD-TESTS — client de charge HTTP réel.
 *
 * Requêtes TCP réelles via `node:http` (agent keep-alive, sockets illimitées
 * côté client), chronométrées à l'horloge monotone, avec :
 *  - timeout par requête (interruption réelle de la socket, pas un abandon) ;
 *  - nouvelle tentative facultative, COMPTÉE (jamais silencieuse) ;
 *  - classification des erreurs (timeout / réseau / statut HTTP).
 *
 * Aucune mesure n'est extrapolée : chaque appel produit un échantillon réel ou
 * un échec réel.
 */

import { Agent, request as httpRequest, type IncomingMessage } from 'node:http';
import { MetricsCollector, type Sample } from './loadMetrics';

export interface RequestSpec {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  /** Étiquette de mesure (sinon `METHOD path-pattern`). */
  label?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  /** Attendu pour considérer la requête comme réussie. */
  expectedStatus?: readonly number[];
  timeoutMs?: number;
  retries?: number;
}

export interface RequestOutcome {
  status: number;
  ok: boolean;
  durationMs: number;
  timeout: boolean;
  retries: number;
  body: string;
  headers: Record<string, string>;
  error?: string;
}

export interface LoadClientOptions {
  baseUrl: string;
  defaultTimeoutMs?: number;
  defaultRetries?: number;
  /** Sockets simultanées par origine. */
  maxSockets?: number;
  collector?: MetricsCollector;
}

const DEFAULT_EXPECTED: readonly number[] = [200, 201];

export class LoadHttpClient {
  readonly collector: MetricsCollector;
  private readonly agent: Agent;
  private readonly baseUrl: string;
  private readonly defaultTimeoutMs: number;
  private readonly defaultRetries: number;

  constructor(options: LoadClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 15_000;
    this.defaultRetries = options.defaultRetries ?? 0;
    this.collector = options.collector ?? new MetricsCollector();
    this.agent = new Agent({
      keepAlive: true,
      keepAliveMsecs: 30_000,
      maxSockets: options.maxSockets ?? 512,
      maxFreeSockets: 256,
    });
  }

  async send(spec: RequestSpec): Promise<RequestOutcome> {
    const label = spec.label ?? `${spec.method} ${spec.path}`;
    const expected = spec.expectedStatus ?? DEFAULT_EXPECTED;
    const timeoutMs = spec.timeoutMs ?? this.defaultTimeoutMs;
    const maxRetries = spec.retries ?? this.defaultRetries;

    let attempt = 0;
    let lastOutcome: RequestOutcome | null = null;
    const totalStarted = process.hrtime.bigint();

    for (;;) {
      const outcome = await this.once(spec, timeoutMs);
      if (outcome.ok || attempt >= maxRetries) {
        lastOutcome = { ...outcome, retries: attempt, durationMs: elapsed(totalStarted) };
        break;
      }
      attempt += 1;
      lastOutcome = outcome;
      // Backoff borné et DÉCLARÉ : 25 ms × tentative, plafonné à 200 ms.
      await sleep(Math.min(200, 25 * attempt));
    }

    const result = lastOutcome as RequestOutcome;
    this.collector.record(label, {
      durationMs: result.durationMs,
      ok: result.ok,
      timeout: result.timeout,
      retries: result.retries,
      status: result.status,
    });
    return result;
  }

  private once(spec: RequestSpec, timeoutMs: number): Promise<RequestOutcome> {
    const expected = spec.expectedStatus ?? DEFAULT_EXPECTED;
    const started = process.hrtime.bigint();
    const url = new URL(`${this.baseUrl}${spec.path}`);
    const headers: Record<string, string> = { ...(spec.headers ?? {}) };
    let payload: Buffer | undefined;
    if (spec.body !== undefined) {
      payload = typeof spec.body === 'string' ? Buffer.from(spec.body, 'utf8') : Buffer.from(spec.body);
      headers['content-length'] = String(payload.length);
    }

    return new Promise<RequestOutcome>(resolve => {
      let settled = false;
      const finish = (outcome: RequestOutcome): void => {
        if (settled) return;
        settled = true;
        resolve(outcome);
      };

      const nodeRequest = httpRequest(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port,
          method: spec.method,
          path: `${url.pathname}${url.search}`,
          headers,
          agent: this.agent,
        },
        (response: IncomingMessage) => {
          const chunks: Buffer[] = [];
          response.on('data', chunk => chunks.push(Buffer.from(chunk)));
          response.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            const status = response.statusCode ?? 0;
            finish({
              status,
              ok: expected.includes(status),
              durationMs: elapsed(started),
              timeout: false,
              retries: 0,
              body,
              headers: Object.fromEntries(
                Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : String(value ?? '')]),
              ),
            });
          });
          response.on('error', (error: Error) => finish({
            status: 0,
            ok: false,
            durationMs: elapsed(started),
            timeout: false,
            retries: 0,
            body: '',
            headers: {},
            error: `response-error: ${error.message}`,
          }));
        },
      );

      nodeRequest.setTimeout(timeoutMs, () => {
        // Interruption RÉELLE : la socket est détruite, le serveur voit l'abandon.
        nodeRequest.destroy(new Error(`timeout après ${timeoutMs} ms`));
      });

      nodeRequest.on('error', (error: Error) => {
        const timedOut = /timeout/i.test(error.message);
        finish({
          status: 0,
          ok: false,
          durationMs: elapsed(started),
          timeout: timedOut,
          retries: 0,
          body: '',
          headers: {},
          error: error.message,
        });
      });

      if (payload) nodeRequest.end(payload);
      else nodeRequest.end();
    });
  }

  close(): void {
    this.agent.destroy();
  }
}

function elapsed(started: bigint): number {
  return Number((process.hrtime.bigint() - started) / 1_000_000n);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Extrait un cookie de session de l'en-tête `set-cookie` d'une réponse. */
export function sessionCookieFrom(outcome: RequestOutcome, cookieName: string): string {
  const header = outcome.headers['set-cookie'] ?? '';
  const match = new RegExp(`${cookieName}=([^;,\\s]+)`).exec(header);
  if (!match) throw new Error(`cookie de session absent (statut ${outcome.status}) : ${outcome.body.slice(0, 200)}`);
  return match[1];
}

export function jsonOf<T>(outcome: RequestOutcome): T {
  return JSON.parse(outcome.body) as T;
}
