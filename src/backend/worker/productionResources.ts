/**
 * LE LABEUR — P0-CLOUDFLARE-PRODUCTION — inventaire AUDITABLE des ressources de
 * production.
 *
 * Ce module ne déploie rien, ne crée rien et ne lit aucun secret : il décrit
 * EXACTEMENT ce que le Worker de production exige (binding, variable, secret),
 * ce qui se passe quand la ressource manque (fermeture franche, jamais de
 * retombée silencieuse) et la commande d'approvisionnement correspondante.
 *
 * Il sert deux consommateurs :
 *   1. le Worker (`/readyz`) : quelles ressources sont RÉELLEMENT présentes dans
 *      l'environnement d'exécution (`auditRuntimeProductionResources`) ;
 *   2. le contrôle de déploiement (`scripts/deploy-production-preflight.ts`) :
 *      quelles ressources sont DÉCLARÉES dans `wrangler.toml`, et lesquelles sont
 *      restées des placeholders explicites (`parseWranglerProfiles`).
 *
 * Règle absolue : AUCUN secret n'est inventé, journalisé ou sérialisé. Les
 * secrets ne sont jamais décrits que par leur PRÉSENCE (`resolved` / `absent`).
 */

import {
  PLACEHOLDER_CONNECTION_STRING,
  resolvePostgresTarget,
  type WorkerPersistenceEnvironment,
} from '../persistence/config';

export type ProductionResourceKind = 'binding' | 'var' | 'secret';

/**
 * Sévérité d'une ressource manquante :
 *  - `blocking` : la production ne peut pas servir le trafic (le Worker reste
 *    fermé et le déclencheur périodique ne fait rien) ;
 *  - `degraded` : le domaine concerné reste fermé (501) mais le reste du service
 *    est exploitable — jamais de simulation pour autant.
 */
export type ProductionResourceSeverity = 'blocking' | 'degraded';

export interface ProductionResourceRequirement {
  /** Identifiant stable, utilisé par le rapport `/readyz` et le préflight. */
  id: string;
  kind: ProductionResourceKind;
  /** Nom EXACT du binding ou de la variable tel que lu par le Worker. */
  name: string;
  secret: boolean;
  severity: ProductionResourceSeverity;
  purpose: string;
  /** Comportement RÉEL quand la ressource manque (aucune invention). */
  failClosed: string;
  /** Commande / action d'approvisionnement, exécutée par l'exploitant. */
  provisioning: string;
}

/**
 * Inventaire des ressources de production. Il ne contient QUE des éléments
 * réellement lus par le code existant : aucune ressource « souhaitable » n'est
 * déclarée ici.
 */
export const PRODUCTION_REQUIREMENTS: readonly ProductionResourceRequirement[] = [
  {
    id: 'hyperdrive',
    kind: 'binding',
    name: 'HYPERDRIVE',
    secret: false,
    severity: 'blocking',
    purpose: 'Pool PostgreSQL managé (Hyperdrive) alimentant le pilote `pg` du Worker.',
    failClosed: 'Persistance `misconfigured` : /healthz 503, routes métier fermées, aucune connexion tentée.',
    provisioning: 'npx wrangler hyperdrive create lelabeur-prod --connection-string="postgresql://…" --caching-disabled=true',
  },
  {
    id: 'documents-bucket',
    kind: 'binding',
    name: 'DOCUMENTS_BUCKET',
    secret: false,
    severity: 'degraded',
    purpose: 'Bucket R2 du domaine DOCUMENTS & PREUVES (métadonnées en PostgreSQL, contenu en R2).',
    failClosed: 'Domaine documents fermé : routes documents 501, aucun objet physique exposé.',
    provisioning: 'npx wrangler r2 bucket create lelabeur-documents-production',
  },
  {
    id: 'persistence-mode',
    kind: 'var',
    name: 'PERSISTENCE',
    secret: false,
    severity: 'blocking',
    purpose: 'Mode de persistance déclaré (`postgres` attendu en production).',
    failClosed: 'Mode `memory`/`closed` refusé en production : frontière fermée.',
    provisioning: 'wrangler.toml — [env.production.vars] PERSISTENCE = "postgres"',
  },
  {
    id: 'worker-environment',
    kind: 'var',
    name: 'WORKER_ENV',
    secret: false,
    severity: 'blocking',
    purpose: 'Nom déclaré de l’environnement déployé (`production`), jamais déduit.',
    failClosed: 'Sans `WORKER_ENV=production`, les invariants de production ne sont pas appliqués.',
    provisioning: 'wrangler.toml — [env.production.vars] WORKER_ENV = "production"',
  },
  {
    id: 'cookie-secure',
    kind: 'var',
    name: 'COOKIE_SECURE',
    secret: false,
    severity: 'blocking',
    purpose: 'Cookie de session strictement TLS en production.',
    failClosed: '`COOKIE_SECURE=false` en production ferme la frontière (aucun cookie non-TLS).',
    provisioning: 'wrangler.toml — [env.production.vars] COOKIE_SECURE = "true"',
  },
  {
    id: 'cron-cadence',
    kind: 'var',
    name: 'CRON_CADENCE',
    secret: false,
    severity: 'degraded',
    purpose: 'Cadence de cron DÉCLARÉE, miroir de `[env.production.triggers] crons` (décision d’exploitation).',
    failClosed: 'Sans cadence déclarée, `/readyz` signale `blocked` : impossible de prouver ce qui est planifié.',
    provisioning: 'wrangler.toml — [env.production.vars] CRON_CADENCE = "* * * * *" (valeur validée par l’exploitant)',
  },
  {
    id: 'google-audience',
    kind: 'var',
    name: 'GOOGLE_CLIENT_ID',
    secret: false,
    severity: 'degraded',
    purpose: 'Audience OAuth Google PUBLIQUE vérifiée côté serveur (aucun secret client).',
    failClosed: 'Sans audience, l’authentification reste fermée (401) et les routes métier 501.',
    provisioning: 'npx wrangler secret put GOOGLE_CLIENT_ID --env production  # ou var publique',
  },
  {
    id: 'db-pool-max',
    kind: 'var',
    name: 'DB_POOL_MAX',
    secret: false,
    severity: 'degraded',
    purpose: 'Taille du pool `pg` local au Worker (Hyperdrive reste le pool réel).',
    failClosed: 'Valeur absente = défaut documenté (5) ; valeur invalide = persistance fermée.',
    provisioning: 'wrangler.toml — [env.production.vars] DB_POOL_MAX = "5"',
  },
  {
    id: 'db-statement-timeout',
    kind: 'var',
    name: 'DB_STATEMENT_TIMEOUT_MS',
    secret: false,
    severity: 'degraded',
    purpose: 'Timeout d’énoncé PostgreSQL appliqué par `SET LOCAL` (100..120000 ms).',
    failClosed: 'Valeur absente = défaut documenté (15000) ; valeur invalide = persistance fermée.',
    provisioning: 'wrangler.toml — [env.production.vars] DB_STATEMENT_TIMEOUT_MS = "15000"',
  },
  {
    id: 'db-application-name',
    kind: 'var',
    name: 'DB_APPLICATION_NAME',
    secret: false,
    severity: 'degraded',
    purpose: 'Identifiant lisible dans `pg_stat_activity` pour l’exploitation.',
    failClosed: 'Valeur absente = défaut documenté (`lelabeur-worker`) ; valeur invalide = persistance fermée.',
    provisioning: 'wrangler.toml — [env.production.vars] DB_APPLICATION_NAME = "lelabeur-worker"',
  },
  {
    id: 'session-ttl',
    kind: 'var',
    name: 'SESSION_TTL_SECONDS',
    secret: false,
    severity: 'degraded',
    purpose: 'Durée de vie de la session serveur (défaut applicatif : 12 h).',
    failClosed: 'Valeur absente = défaut applicatif ; aucune session n’est créée sans persistance durable.',
    provisioning: 'wrangler.toml — [env.production.vars] SESSION_TTL_SECONDS = "43200"',
  },
  {
    id: 'document-url-signing-secret',
    kind: 'secret',
    name: 'DOCUMENT_URL_SIGNING_SECRET',
    secret: true,
    severity: 'degraded',
    purpose: 'Clé HMAC (≥ 16 caractères) des URL de téléchargement signées du domaine documents.',
    failClosed: 'Émission d’URL signée 501 explicite ; le téléchargement authentifié reste disponible.',
    provisioning: 'npx wrangler secret put DOCUMENT_URL_SIGNING_SECRET --env production',
  },
  {
    id: 'postgres-connection-fallback',
    kind: 'secret',
    name: 'POSTGRES_CONNECTION_STRING',
    secret: true,
    severity: 'degraded',
    purpose: 'Repli de connexion directe si aucun binding Hyperdrive n’est disponible (dépannage).',
    failClosed: 'Repli inutilisé : la connexion vient du binding Hyperdrive, jamais d’une valeur par défaut.',
    provisioning: 'npx wrangler secret put POSTGRES_CONNECTION_STRING --env production  # repli uniquement',
  },
  {
    id: 'payment-pre-due-lead-time',
    kind: 'var',
    name: 'PAYMENT_PRE_DUE_LEAD_TIME_MS',
    secret: false,
    severity: 'degraded',
    purpose: 'Décision d’EXPLOITATION : avance du rappel pré-échéance (aucune valeur par défaut dans le code).',
    failClosed: 'Absente = aucun job pré-échéance armé (état voulu, aucune règle inventée).',
    provisioning: 'wrangler.toml — [env.production.vars] PAYMENT_PRE_DUE_LEAD_TIME_MS = "<entier > 0 décidé>"',
  },
  {
    id: 'claim-evidence-deadline',
    kind: 'var',
    name: 'CLAIM_EVIDENCE_DEADLINE_MS',
    secret: false,
    severity: 'degraded',
    purpose: 'Décision d’EXPLOITATION : délai de preuve Claim (aucune valeur par défaut dans le code).',
    failClosed: 'Absente = aucune échéance de preuve armée (état voulu, aucune durée inventée).',
    provisioning: 'wrangler.toml — [env.production.vars] CLAIM_EVIDENCE_DEADLINE_MS = "<entier > 0 décidé>"',
  },
] as const;

/** Sous-ensemble d'environnement lu par l'audit des ressources (aucune valeur secrète). */
export interface ProductionEnvironmentView extends WorkerPersistenceEnvironment {
  DOCUMENTS_BUCKET?: unknown;
  DOCUMENT_URL_SIGNING_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  CRON_CADENCE?: string;
  SESSION_TTL_SECONDS?: string;
  COOKIE_SECURE?: string;
  WORKER_ENV?: string;
  PAYMENT_PRE_DUE_LEAD_TIME_MS?: string;
  CLAIM_EVIDENCE_DEADLINE_MS?: string;
}

export type ProductionResourceStatus = 'resolved' | 'absent' | 'placeholder';

export interface ProductionResourceAuditEntry {
  id: string;
  kind: ProductionResourceKind;
  name: string;
  secret: boolean;
  severity: ProductionResourceSeverity;
  status: ProductionResourceStatus;
  /** Motif expurgé : jamais la valeur d'un secret, jamais une chaîne de connexion. */
  detail: string;
}

/** Valeurs explicitement NON exploitables : refusées au même titre qu'une absence. */
export const PLACEHOLDER_PREFIXES: readonly string[] = ['REMPLACER_', 'PLACEHOLDER_', 'CHANGEME', '<', 'TODO_'];

export function isPlaceholderValue(value: string | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  if (trimmed === PLACEHOLDER_CONNECTION_STRING) return true;
  return PLACEHOLDER_PREFIXES.some(prefix => trimmed.toUpperCase().startsWith(prefix));
}

/**
 * Chaîne de connexion DOCUMENTAIRE (celle des exemples du dépôt) ou à
 * identifiants d'exemple : elle ne doit jamais être prise pour une ressource —
 * elle est refusée par le résolveur de cible et signalée comme placeholder.
 */
export function isPlaceholderConnectionString(value: string | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  if (isPlaceholderValue(trimmed)) return true;
  return /(?:^|\/\/)(user|utilisateur|lelabeur):(password|motdepasse|mot-de-passe)@(host|hote|localhost)/i.test(trimmed)
    || /@(host|hote)[:/]/i.test(trimmed);
}

function isBindingPresent(value: unknown): boolean {
  return typeof value === 'object' && value !== null;
}

/**
 * Audit RÉEL de l'environnement d'exécution : chaque ressource de l'inventaire
 * est classée `resolved`, `placeholder` ou `absent`, sans jamais lire ni
 * exposer la valeur d'un secret.
 */
export function auditRuntimeProductionResources(env: ProductionEnvironmentView): ProductionResourceAuditEntry[] {
  const target = resolvePostgresTarget(env);

  return PRODUCTION_REQUIREMENTS.map(requirement => {
    const base = {
      id: requirement.id,
      kind: requirement.kind,
      name: requirement.name,
      secret: requirement.secret,
      severity: requirement.severity,
    };

    switch (requirement.id) {
      case 'hyperdrive': {
        if (target.ok) {
          return { ...base, status: 'resolved' as const, detail: `binding résolu (source ${target.target.source}).` };
        }
        if (target.reason === 'placeholder-connection-string') {
          return { ...base, status: 'placeholder' as const, detail: 'chaîne de connexion documentaire refusée comme placeholder.' };
        }
        return { ...base, status: 'absent' as const, detail: `aucun binding exploitable (${target.reason}).` };
      }
      case 'postgres-connection-fallback': {
        const fallback = env.POSTGRES_CONNECTION_STRING?.trim();
        if (!fallback) {
          return {
            ...base,
            status: 'absent' as const,
            detail: 'aucun repli provisionné : la connexion vient du binding Hyperdrive (état normal).',
          };
        }
        if (isPlaceholderConnectionString(fallback)) {
          return {
            ...base,
            status: 'placeholder' as const,
            detail: 'chaîne de connexion documentaire ou à identifiants d’exemple : refusée comme repli.',
          };
        }
        return { ...base, status: 'resolved' as const, detail: 'repli provisionné (valeur jamais lue ni journalisée).' };
      }
      case 'documents-bucket': {
        return isBindingPresent(env.DOCUMENTS_BUCKET)
          ? { ...base, status: 'resolved' as const, detail: 'binding R2 présent (contenu jamais exposé par sa clé).' }
          : { ...base, status: 'absent' as const, detail: 'aucun binding R2 : domaine documents fermé.' };
      }
      default: {
        const raw = (env as unknown as Record<string, unknown>)[requirement.name];
        if (requirement.secret) {
          const value = typeof raw === 'string' ? raw.trim() : '';
          return value.length > 0
            ? { ...base, status: 'resolved' as const, detail: 'secret provisionné (valeur jamais lue ni journalisée).' }
            : { ...base, status: 'absent' as const, detail: 'secret non provisionné.' };
        }
        const value = typeof raw === 'string' ? raw.trim() : '';
        if (!value) return { ...base, status: 'absent' as const, detail: 'variable non déclarée.' };
        if (isPlaceholderValue(value)) {
          return { ...base, status: 'placeholder' as const, detail: 'valeur placeholder explicite, non exploitable.' };
        }
        return { ...base, status: 'resolved' as const, detail: 'variable déclarée.' };
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* Lecture AUDITABLE de `wrangler.toml` (aucun déploiement, aucun CLI)  */
/* ------------------------------------------------------------------ */

export interface WranglerBindingDeclaration {
  binding: string;
  value: string;
}

export interface WranglerProfileAudit {
  /** `default` pour la racine du fichier, sinon le nom de `[env.<nom>]`. */
  name: string;
  workerName: string | null;
  main: string | null;
  compatibilityDate: string | null;
  compatibilityFlags: string[];
  vars: Record<string, string>;
  hyperdrive: WranglerBindingDeclaration[];
  r2Buckets: WranglerBindingDeclaration[];
  cronTriggers: string[];
  queues: boolean;
  kvNamespaces: boolean;
  durableObjects: boolean;
  d1Databases: boolean;
  services: boolean;
}

const EMPTY_PROFILE = (name: string): WranglerProfileAudit => ({
  name,
  workerName: null,
  main: null,
  compatibilityDate: null,
  compatibilityFlags: [],
  vars: {},
  hyperdrive: [],
  r2Buckets: [],
  cronTriggers: [],
  queues: false,
  kvNamespaces: false,
  durableObjects: false,
  d1Databases: false,
  services: false,
});

function unquote(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseInlineArray(value: string): string[] {
  return value
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map(part => unquote(part))
    .filter(part => part.length > 0);
}

/**
 * Lecture LIGNE À LIGNE, volontairement limitée aux clés auditées par cette
 * tranche. Elle ne remplace pas un parseur TOML : elle ne sert qu'à PROUVER ce
 * qui est déclaré (et ce qui ne l'est pas) sans dépendre du CLI `wrangler`, qui
 * exige un compte Cloudflare authentifié.
 */
export function parseWranglerProfiles(text: string): WranglerProfileAudit[] {
  const profiles = new Map<string, WranglerProfileAudit>([['default', EMPTY_PROFILE('default')]]);
  const lines = text.split(/\r?\n/);
  let current = 'default';
  let section = '';
  let pendingArrayKey: string | null = null;
  let pendingArrayValues: string[] = [];
  /** Bloc `[[hyperdrive]]` / `[[r2_buckets]]` en cours de lecture. */
  let activeBinding: { kind: 'hyperdrive' | 'r2'; entry: WranglerBindingDeclaration } | null = null;

  const profileOf = (name: string): WranglerProfileAudit => {
    const existing = profiles.get(name);
    if (existing) return existing;
    const created = EMPTY_PROFILE(name);
    profiles.set(name, created);
    return created;
  };

  const flushArray = () => {
    if (!pendingArrayKey) return;
    const profile = profileOf(current);
    if (pendingArrayKey === 'crons') profile.cronTriggers = [...pendingArrayValues];
    if (pendingArrayKey === 'compatibility_flags') profile.compatibilityFlags = [...pendingArrayValues];
    pendingArrayKey = null;
    pendingArrayValues = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (pendingArrayKey) {
      pendingArrayValues.push(...parseInlineArray(line.replace(/^\[/, '')));
      if (line.includes(']')) flushArray();
      continue;
    }
    if (line.startsWith('#')) continue;

    const tableMatch = /^\[\[?([^\]]+)\]\]?$/.exec(line);
    if (tableMatch) {
      const header = tableMatch[1].trim();
      section = header;
      activeBinding = null;
      const envMatch = /^env\.([^.]+)(?:\.(.+))?$/.exec(header);
      if (envMatch) {
        current = envMatch[1];
        profileOf(current);
        const sub = envMatch[2] ?? '';
        if (sub === 'queues' || sub.startsWith('queues.')) profileOf(current).queues = true;
        if (sub === 'kv_namespaces') profileOf(current).kvNamespaces = true;
        if (sub === 'durable_objects' || sub.startsWith('durable_objects.')) profileOf(current).durableObjects = true;
        if (sub === 'd1_databases') profileOf(current).d1Databases = true;
        if (sub === 'services') profileOf(current).services = true;
        if (sub === 'hyperdrive') activeBinding = { kind: 'hyperdrive', entry: { binding: '', value: '' } };
        if (sub === 'r2_buckets') activeBinding = { kind: 'r2', entry: { binding: '', value: '' } };
      } else {
        current = 'default';
        if (header === 'queues' || header.startsWith('queues.')) profileOf('default').queues = true;
        if (header === 'kv_namespaces') profileOf('default').kvNamespaces = true;
        if (header === 'durable_objects' || header.startsWith('durable_objects.')) profileOf('default').durableObjects = true;
        if (header === 'd1_databases') profileOf('default').d1Databases = true;
        if (header === 'services') profileOf('default').services = true;
        if (header === 'hyperdrive') activeBinding = { kind: 'hyperdrive', entry: { binding: '', value: '' } };
        if (header === 'r2_buckets') activeBinding = { kind: 'r2', entry: { binding: '', value: '' } };
      }
      continue;
    }

    const assignment = /^([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!assignment) continue;
    const key = assignment[1];
    const value = assignment[2].trim();
    const profile = profileOf(current);

    if (key === 'crons' || key === 'compatibility_flags') {
      const values = parseInlineArray(value);
      if (value.startsWith('[') && !value.includes(']')) {
        pendingArrayKey = key;
        pendingArrayValues = values;
        continue;
      }
      if (key === 'crons') profile.cronTriggers = values;
      else profile.compatibilityFlags = values;
      continue;
    }

    // Bindings déclarés par bloc : au plus une paire (binding, valeur) par bloc.
    if (activeBinding && activeBinding.kind === 'hyperdrive') {
      if (key === 'binding') activeBinding.entry.binding = unquote(value);
      if (key === 'id') activeBinding.entry.value = unquote(value);
      if (!profile.hyperdrive.includes(activeBinding.entry)) profile.hyperdrive.push(activeBinding.entry);
      continue;
    }
    if (activeBinding && activeBinding.kind === 'r2') {
      if (key === 'binding') activeBinding.entry.binding = unquote(value);
      if (key === 'bucket_name') activeBinding.entry.value = unquote(value);
      if (!profile.r2Buckets.includes(activeBinding.entry)) profile.r2Buckets.push(activeBinding.entry);
      continue;
    }

    if (section === 'vars' || section.endsWith('.vars')) {
      profile.vars[key] = unquote(value);
      continue;
    }

    switch (key) {
      case 'name':
        if (section === '' || /^env\.[^.]+$/.test(section)) profile.workerName = unquote(value);
        break;
      case 'main':
        profile.main = unquote(value);
        break;
      case 'compatibility_date':
        profile.compatibilityDate = unquote(value);
        break;
      default:
        break;
    }
  }

  flushArray();
  return [...profiles.values()];
}

export function findWranglerProfile(profiles: readonly WranglerProfileAudit[], name: string): WranglerProfileAudit | undefined {
  return profiles.find(profile => profile.name === name);
}

/** Un identifiant Hyperdrive placeholder (`00000000-…`) n'est PAS une ressource. */
export const HYPERDRIVE_PLACEHOLDER_ID = '00000000-0000-0000-0000-000000000000';

export function isPlaceholderHyperdriveId(id: string | undefined): boolean {
  const trimmed = id?.trim();
  if (!trimmed) return true;
  return trimmed === HYPERDRIVE_PLACEHOLDER_ID || isPlaceholderValue(trimmed);
}
