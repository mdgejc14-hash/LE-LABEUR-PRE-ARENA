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
  // P0-PAY-1 : agrégat Payment du cycle et déclarations append-only.
  '0008_payment_cycle',
  // P0-PAY-3 : ledger externe, batch reprenable et revues ADMIN de paiement.
  '0009_payment_external_reconciliation',
  '0010_salary_confirmation',
  // P0-DISPUTE-1 : claims, demandes de preuve et restrictions provisoires.
  '0011_dispute_claims',
  // P0-NOTIFICATIONS : boîte de réception In-App (canal prioritaire). Les
  // canaux Push et Email restent des abstractions de code, sans table ni
  // fournisseur réel.
  '0012_notifications',
  // P0-REPLACEMENT : dossier traçable relié au Claim, au contrat source, à
  // l'offre, à la candidature, à la proposition et au contrat successeur.
  '0013_replacements',
  // P0-MATCHING : qualification d'offre, profils minimaux et snapshots explicables.
  '0014_matching',
  // P0-REPUTATION : ledger d'événements documentés (fait source, règle/version,
  // impact, explication, statut réversible, historique append-only). Aucun
  // second ledger d'audit : `automation_audit_ledger` reste l'unique trace.
  '0015_reputation_ledger',
];

export const SCHEMA_MIGRATIONS_TABLE = 'schema_migrations';

/** Table de suivi du runner (créée par lui, jamais par une migration). */
export const SCHEMA_MIGRATIONS_DDL = `CREATE TABLE IF NOT EXISTS ${SCHEMA_MIGRATIONS_TABLE} (
  id          TEXT PRIMARY KEY,
  checksum    TEXT NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INTEGER NOT NULL DEFAULT 0
)`;
