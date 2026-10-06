/**
 * LE LABEUR — P0-C — manifeste des migrations attendues.
 *
 * Le Worker ne lit pas le système de fichiers : il ne peut donc pas découvrir
 * les migrations. Cette liste constante permet à `/healthz` de distinguer
 * `applied` de `pending` sans deviner, et un test vérifie qu'elle reste
 * exactement alignée sur le contenu réel de `migrations/`.
 */

export const EXPECTED_MIGRATION_IDS: readonly string[] = [
  '0001_identity_and_core',
  '0002_role_permissions_seed',
  '0003_core_nucleus_alignment',
  // P0-E5 : table `proposals` (propositions d'embauche).
  '0004_proposals',
  // P0-F : lien proposition → contrat + unicités du cycle CONTRAT.
  '0005_contract_lifecycle',
  // P0-AUTO-1 : outbox, jobs, idempotence et ledger transversaux.
  '0006_automation_foundation',
  // P0-AUTO-2 : échéances (Deadline/SLA), unicité des clés d'idempotence de
  // jobs, référence métier des jobs de rappel et index de lecture.
  '0007_contract_automation',
];

export const SCHEMA_MIGRATIONS_TABLE = 'schema_migrations';

/** Table de suivi du runner (créée par lui, jamais par une migration). */
export const SCHEMA_MIGRATIONS_DDL = `CREATE TABLE IF NOT EXISTS ${SCHEMA_MIGRATIONS_TABLE} (
  id          TEXT PRIMARY KEY,
  checksum    TEXT NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INTEGER NOT NULL DEFAULT 0
)`;
