/**
 * LE LABEUR — P0-CLOUDFLARE-PRODUCTION — tests déterministes des invariants de
 * production, de l'inventaire des ressources et de la lecture de `wrangler.toml`.
 *
 * Aucun réseau, aucun compte Cloudflare : ces tests vérifient que la
 * configuration préparée est FERMÉE par défaut, qu'aucune valeur inventée ne
 * peut passer pour une ressource, et que les ressources requises sont déclarées
 * exactement là où le déploiement les cherche.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateProductionGuard } from './productionGuard';
import {
  PRODUCTION_REQUIREMENTS,
  auditRuntimeProductionResources,
  findWranglerProfile,
  isPlaceholderHyperdriveId,
  isPlaceholderValue,
  parseWranglerProfiles,
} from './productionResources';

export interface ProductionGuardTestResult {
  name: string;
  success: boolean;
  detail: string;
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runProductionGuardTests(): Promise<ProductionGuardTestResult[]> {
  const results: ProductionGuardTestResult[] = [];
  const check = async (name: string, test: () => void | Promise<void>) => {
    try {
      await test();
      results.push({ name, success: true, detail: 'OK' });
    } catch (error) {
      results.push({ name, success: false, detail: String((error as Error)?.message ?? error) });
    }
  };

  const wrangler = readFileSync(resolve(REPO_ROOT, 'wrangler.toml'), 'utf8');
  const profiles = parseWranglerProfiles(wrangler);
  const defaultProfile = findWranglerProfile(profiles, 'default');
  const production = findWranglerProfile(profiles, 'production');

  await check('P0-CPROD garde-fou : hors production, aucun invariant ne s’applique', () => {
    for (const environment of [undefined, 'development', 'workerd-local', 'test-local', 'staging']) {
      const evaluation = evaluateProductionGuard({ WORKER_ENV: environment, PERSISTENCE: 'memory', COOKIE_SECURE: 'false' });
      assert(evaluation.production === false, `environnement ${environment} ne doit pas être traité comme la production`);
      assert(evaluation.blocking === false, 'aucune fermeture hors production');
      assert(evaluation.primaryReason === null, 'aucun motif hors production');
    }
    // Un `WORKER_ENV` en casse différente reste la production (jamais déduite).
    assert(evaluateProductionGuard({ WORKER_ENV: 'PRODUCTION' }).production === true, 'casse insensible attendue');
  });

  await check('P0-CPROD garde-fou : production sans PostgreSQL → fermeture franche, jamais de mémoire', () => {
    for (const persistence of [undefined, 'memory', 'closed', 'inventé']) {
      const evaluation = evaluateProductionGuard({
        WORKER_ENV: 'production',
        ...(persistence ? { PERSISTENCE: persistence } : {}),
        COOKIE_SECURE: 'true',
        HYPERDRIVE: { connectionString: 'postgresql://u:p@hyperdrive.example:5432/db' },
      });
      assert(evaluation.production === true, 'production attendue');
      assert(evaluation.blocking === true, `persistance « ${persistence} » doit fermer la frontière`);
      assert(evaluation.primaryReason === 'production-requires-postgres', `motif attendu, reçu ${evaluation.primaryReason}`);
    }
  });

  await check('P0-CPROD garde-fou : cookie non TLS, override de test et cible absente sont refusés', () => {
    const insecure = evaluateProductionGuard({
      WORKER_ENV: 'production',
      PERSISTENCE: 'postgres',
      COOKIE_SECURE: 'false',
      HYPERDRIVE: { connectionString: 'postgresql://u:p@hyperdrive.example:5432/db' },
    });
    assert(insecure.blocking && insecure.primaryReason === 'production-insecure-cookie', 'cookie non TLS refusé');

    const override = evaluateProductionGuard({
      WORKER_ENV: 'production',
      PERSISTENCE: 'postgres',
      COOKIE_SECURE: 'true',
      TEST_ONLY_GOOGLE_JWKS_URL: 'http://127.0.0.1:8799/jwks',
      HYPERDRIVE: { connectionString: 'postgresql://u:p@hyperdrive.example:5432/db' },
    });
    assert(override.blocking, 'override de test refusé en production');
    assert(override.violations.some(violation => violation.code === 'production-test-jwks-override'), 'motif override attendu');

    const noTarget = evaluateProductionGuard({ WORKER_ENV: 'production', PERSISTENCE: 'postgres', COOKIE_SECURE: 'true' });
    assert(noTarget.blocking && noTarget.primaryReason === 'production-missing-hyperdrive', 'absence de cible refusée');

    const placeholderTarget = evaluateProductionGuard({
      WORKER_ENV: 'production',
      PERSISTENCE: 'postgres',
      COOKIE_SECURE: 'true',
      POSTGRES_CONNECTION_STRING: 'postgresql://user:password@host:5432/database',
    });
    assert(
      placeholderTarget.violations.some(violation => violation.code === 'production-missing-hyperdrive'),
      'une chaîne documentaire n’est pas une cible',
    );
  });

  await check('P0-CPROD garde-fou : production complète → aucune violation (et aucun secret dans les messages)', () => {
    const secret = 'motdepasse-hyperdrive-tres-secret';
    const evaluation = evaluateProductionGuard({
      WORKER_ENV: 'production',
      PERSISTENCE: 'postgres',
      IDENTITY_STORE: 'postgres',
      COOKIE_SECURE: 'true',
      HYPERDRIVE: { connectionString: `postgresql://lelabeur:${secret}@hyperdrive.example:5432/lelabeur?sslmode=require` },
    });
    assert(evaluation.production === true, 'production attendue');
    assert(evaluation.blocking === false, `aucune violation attendue, reçu ${evaluation.violations.map(v => v.code).join(', ')}`);
    for (const violation of evaluation.violations) {
      assert(!violation.message.includes(secret), 'aucun secret dans un message d’invariant');
      assert(!violation.consequence.includes(secret), 'aucun secret dans une conséquence');
    }
  });

  await check('P0-CPROD inventaire : chaque exigence est publiée avec sa fermeture et son approvisionnement', () => {
    assert(PRODUCTION_REQUIREMENTS.length >= 12, 'inventaire complet attendu');
    for (const requirement of PRODUCTION_REQUIREMENTS) {
      assert(Boolean(requirement.purpose), `${requirement.id}: finalité attendue`);
      assert(Boolean(requirement.failClosed), `${requirement.id}: comportement de fermeture attendu`);
      assert(Boolean(requirement.provisioning), `${requirement.id}: commande d’approvisionnement attendue`);
      if (requirement.secret) {
        assert(/secret put/.test(requirement.provisioning), `${requirement.id}: un secret s’approvisionne par \`wrangler secret put\``);
      }
    }
    const hyperdrive = PRODUCTION_REQUIREMENTS.find(requirement => requirement.id === 'hyperdrive');
    assert(hyperdrive?.severity === 'blocking' && hyperdrive.kind === 'binding', 'Hyperdrive bloquant attendu');
    const bucket = PRODUCTION_REQUIREMENTS.find(requirement => requirement.id === 'documents-bucket');
    assert(bucket?.name === 'DOCUMENTS_BUCKET', 'binding R2 attendu');
    const signing = PRODUCTION_REQUIREMENTS.find(requirement => requirement.id === 'document-url-signing-secret');
    assert(signing?.secret === true, 'le secret de signature documentaire doit être déclaré secret');
  });

  await check('P0-CPROD inventaire : l’audit runtime ne lit jamais la valeur d’un secret', () => {
    const secret = 'signature-secrete-de-32-caracteres!!';
    const audit = auditRuntimeProductionResources({
      PERSISTENCE: 'postgres',
      HYPERDRIVE: { connectionString: 'postgresql://u:motdepasse@hyperdrive.example:5432/lelabeur' },
      DOCUMENTS_BUCKET: { head: () => Promise.resolve(null) },
      DOCUMENT_URL_SIGNING_SECRET: secret,
      GOOGLE_CLIENT_ID: '',
      CRON_CADENCE: '*/5 * * * *',
      POSTGRES_CONNECTION_STRING: 'postgresql://user:password@host:5432/database',
      COOKIE_SECURE: 'true',
      WORKER_ENV: 'production',
    });
    const serialized = JSON.stringify(audit);
    assert(!serialized.includes(secret), 'la valeur du secret ne doit jamais apparaître');
    assert(!serialized.includes('motdepasse'), 'aucun mot de passe dans l’audit');
    const byId = new Map(audit.map(entry => [entry.id, entry]));
    assert(byId.get('hyperdrive')?.status === 'resolved', 'binding Hyperdrive résolu');
    assert(byId.get('documents-bucket')?.status === 'resolved', 'binding R2 présent');
    assert(byId.get('document-url-signing-secret')?.status === 'resolved', 'secret détecté par sa présence');
    assert(byId.get('google-audience')?.status === 'absent', 'audience vide = absente (frontière fermée)');
    assert(byId.get('postgres-connection-fallback')?.status === 'placeholder', 'chaîne documentaire refusée');
    assert(byId.get('payment-pre-due-lead-time')?.status === 'absent', 'aucune valeur d’exploitation inventée');
  });

  await check('P0-CPROD placeholders : aucune valeur documentaire n’est exploitable', () => {
    assert(isPlaceholderValue('REMPLACER_PAR_ID_HYPERDRIVE_PRODUCTION') === true, 'préfixe REMPLACER_ refusé');
    assert(isPlaceholderValue('postgresql://user:password@host:5432/database') === true, 'chaîne documentaire refusée');
    assert(isPlaceholderValue('*/5 * * * *') === false, 'une cadence de cron n’est pas un placeholder');
    assert(isPlaceholderHyperdriveId(undefined) === true, 'absence = non résolu');
    assert(isPlaceholderHyperdriveId('00000000-0000-0000-0000-000000000000') === true, 'ID nul refusé');
    assert(isPlaceholderHyperdriveId('a1b2c3d4-1111-4222-8333-444455556666') === false, 'ID réel accepté');
  });

  await check('P0-CPROD wrangler.toml : profils lus, cadence identique, R2 privé, aucune seconde file', () => {
    assert(Boolean(defaultProfile) && Boolean(production), 'profils default et production attendus');
    assert(defaultProfile?.main === 'src/backend/worker/cloudflareEntry.ts', 'entrée Worker déclarée');
    assert(defaultProfile?.compatibilityFlags.includes('nodejs_compat'), 'nodejs_compat requis par pg');

    // Cron : un trigger, une cadence déclarée, miroir exact entre les deux profils.
    assert(production?.cronTriggers.length === 1, 'une cadence de production attendue');
    assert(defaultProfile?.cronTriggers.length === 1, 'une cadence de développement attendue (--test-scheduled)');
    assert(
      production?.cronTriggers[0] === production?.vars.CRON_CADENCE,
      'la cadence doit être publiée telle quelle par CRON_CADENCE (aucune divergence tolérée)',
    );
    assert(
      defaultProfile?.cronTriggers[0] === production?.cronTriggers[0],
      'les profils doivent déclarer la même cadence tant que l’exploitant n’a pas décidé autrement',
    );
    assert(production?.cronTriggers[0]?.split(/\s+/).length === 5, 'cadence à 5 champs attendue');

    // R2 : binding privé, aucun domaine public.
    const bucket = production?.r2Buckets.find(entry => entry.binding === 'DOCUMENTS_BUCKET');
    assert(Boolean(bucket?.value), 'binding DOCUMENTS_BUCKET attendu en production');
    assert(isPlaceholderValue(bucket?.value) === false, 'nom de bucket réel attendu');
    const activeWrangler = wrangler.split(/\r?\n/).filter(line => !line.trim().startsWith('#')).join('\n');
    assert(!/r2\.dev/i.test(activeWrangler), 'aucun domaine public r2.dev dans la configuration active');
    assert(
      !/(^|\s)(public_url|custom_domain|custom_domains|preview_url)\s*=/m.test(activeWrangler),
      'aucun domaine public personnalisé déclaré pour le bucket',
    );

    // Aucun stockage parallèle : la file durable reste automation_outbox.
    for (const profile of profiles) {
      assert(profile.queues === false, `${profile.name}: aucune Cloudflare Queue (file unique = automation_outbox)`);
      assert(profile.kvNamespaces === false, `${profile.name}: aucun KV`);
      assert(profile.durableObjects === false, `${profile.name}: aucun Durable Object`);
      assert(profile.d1Databases === false, `${profile.name}: aucun D1`);
      assert(profile.services === false, `${profile.name}: aucun Service binding`);
    }

    // Production : Hyperdrive volontairement absent, procédure d'activation documentée.
    assert((production?.hyperdrive ?? []).length === 0, 'aucun ID Hyperdrive inventé en production');
    assert(/wrangler hyperdrive create/.test(wrangler), 'la création du Hyperdrive de production doit être documentée');
    assert(/\[\[env\.production\.hyperdrive\]\]/.test(wrangler), 'le bloc d’activation doit rester documenté (commenté)');
    assert(/--caching-disabled=true/.test(wrangler), 'cache Hyperdrive explicitement désactivé');
  });

  await check('P0-CPROD wrangler.toml : aucun secret, aucune chaîne de connexion active', () => {
    const active = wrangler.split(/\r?\n/).filter(line => !line.trim().startsWith('#')).join('\n');
    assert(!/postgres(ql)?:\/\//i.test(active), 'aucune chaîne de connexion active');
    assert(!/password\s*=/i.test(active), 'aucun mot de passe');
    for (const requirement of PRODUCTION_REQUIREMENTS.filter(entry => entry.secret)) {
      assert(
        !new RegExp(`^\\s*${requirement.name}\\s*=`, 'm').test(active),
        `${requirement.name} ne doit JAMAIS être une var en clair`,
      );
    }
  });

  await check('P0-CPROD wrangler.toml : le profil de production redéclare ce que le runtime exige', () => {
    const vars = production?.vars ?? {};
    assert(vars.PERSISTENCE === 'postgres', 'PERSISTENCE=postgres attendu en production');
    assert(vars.WORKER_ENV === 'production', 'WORKER_ENV=production attendu (invariants appliqués)');
    assert(vars.COOKIE_SECURE === 'true', 'cookie TLS exigé en production');
    for (const required of ['DB_POOL_MAX', 'DB_STATEMENT_TIMEOUT_MS', 'DB_APPLICATION_NAME', 'SESSION_TTL_SECONDS']) {
      assert(Boolean(vars[required]), `${required} doit être redéclaré (les vars ne sont pas héritées)`);
    }
    // Les décisions d'exploitation restent ABSENTES : aucune règle métier inventée.
    assert(vars.PAYMENT_PRE_DUE_LEAD_TIME_MS === undefined, 'aucun délai pré-échéance par défaut');
    assert(vars.CLAIM_EVIDENCE_DEADLINE_MS === undefined, 'aucune durée de preuve par défaut');
    assert(vars.GOOGLE_CLIENT_ID === '', 'audience publique vide = frontière fermée');
  });

  return results;
}
