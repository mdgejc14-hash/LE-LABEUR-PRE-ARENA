/** Local PostgreSQL-backed Automation Worker (no Cloudflare Queue or Cron). */
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createPostgresDatabase } from '../src/backend/persistence/postgresDatabase';
import { toPostgresClientPort } from '../src/backend/persistence/sqlClient';
import { createLocalAutomationRuntime } from '../src/backend/automation/runtime';

function connectionStringFromEnvironment(): string | undefined {
  return process.env.AUTOMATION_DATABASE_URL?.trim()
    || process.env.DATABASE_URL?.trim()
    || process.env.POSTGRES_CONNECTION_STRING?.trim()
    || undefined;
}

function optionValue(args: readonly string[], name: string): string | undefined {
  const prefix = `${name}=`;
  return args.find(argument => argument.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const connectionString = connectionStringFromEnvironment();
  if (!connectionString) {
    console.error('Définir AUTOMATION_DATABASE_URL, DATABASE_URL ou POSTGRES_CONNECTION_STRING.');
    process.exitCode = 2;
    return;
  }

  const args = process.argv.slice(2);
  const once = args.includes('--once');
  const pollMs = Number(optionValue(args, '--poll-ms') ?? process.env.AUTOMATION_POLL_MS ?? '1000');
  const batchSize = Number(optionValue(args, '--batch-size') ?? process.env.AUTOMATION_BATCH_SIZE ?? '20');
  if (!Number.isInteger(pollMs) || pollMs < 100) throw new Error('--poll-ms must be an integer >= 100.');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new Error('--batch-size must be 1..1000.');

  const pool = new Pool({ connectionString, max: 3, application_name: 'lelabeur-automation-local' });
  pool.on('error', () => undefined);
  const database = createPostgresDatabase(toPostgresClientPort(pool), {
    applicationName: 'lelabeur-automation',
    redactSecrets: [connectionString],
  });
  const runtime = createLocalAutomationRuntime(database, {
    workerId: `automation-local-${process.pid}-${randomUUID().slice(0, 8)}`,
    batchSize,
  });

  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  try {
    do {
      const result = await runtime.tick();
      console.log(JSON.stringify({
        outbox: result.outbox,
        events: result.events,
        jobs: result.jobs,
        at: new Date().toISOString(),
      }));
      if (once || stopping) break;
      await new Promise(resolve => setTimeout(resolve, pollMs));
    } while (!stopping);
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    await pool.end().catch(() => undefined);
  }
}

void main().catch(error => {
  // Driver errors may contain connection parameters; redact before display.
  const message = String((error as Error)?.message ?? error)
    .split(connectionStringFromEnvironment() ?? '\u0000').join('[connection-redacted]')
    .replace(/postgres(?:ql)?:\/\/[^\s@]*@/gi, 'postgresql://[redacted]@');
  console.error(`Automation worker stopped: ${message}`);
  process.exitCode = 1;
});
