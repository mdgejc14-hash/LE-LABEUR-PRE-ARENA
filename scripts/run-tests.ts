import { runAllDeterministicTests } from '../src/domain/businessRules.test';
import { runFinalStabilizationTests } from '../src/domain/finalStabilization.test';
import { runMassiveQaScenarios } from '../src/domain/qaMassive.test';
import { runBackendBoundaryTests } from '../src/backend/api/foundation.test';
import { runCallBoundaryTests } from '../src/services/calls/signalingCredentialClient.test';
import { runIdentitySessionTests } from '../src/backend/identity/identity.test';
import { runPostgresIdentityTests } from '../src/backend/identity/postgresIdentity.test';
import { runSessionBridgeTests } from '../src/repositories/sessionBridge.test';
import { runPaymentDeclarationTests } from '../src/repositories/paymentDeclarations.test';
import { runAdminPaymentDeclarationTests } from '../src/repositories/adminPaymentDeclarations.test';
import { runAdminPaymentDecisionTests } from '../src/repositories/adminPaymentDecisions.test';
import { runPostgresFoundationTests } from '../src/backend/persistence/persistence.test';
import { runHealthReportTests } from '../src/backend/api/health.test';
import { runMigrationRunnerTests } from '../src/backend/persistence/migrationRunner.test';
import { runCloudflareConfigTests } from '../src/backend/worker/cloudflareConfig.test';
import { runCloudflareEntryTests } from '../src/backend/worker/cloudflareEntry.test';
import { runOfferDomainTests } from '../src/backend/api/offers.test';
import { runApplicationDomainTests } from '../src/backend/api/applications.test';
import { runApplicationDecisionTests } from '../src/backend/api/applicationDecisions.test';
import { runApplicationTransitionTests } from '../src/domain/applicationTransitions.test';

interface TestCase {
  name: string;
  success: boolean;
  detail?: string;
}

async function main(): Promise<void> {
  const deterministic = await runAllDeterministicTests();
  const stabilization = await runFinalStabilizationTests();
  const massive = await runMassiveQaScenarios(800);
  const boundary = await runBackendBoundaryTests();
  const callBoundary = runCallBoundaryTests();
  const identity = await runIdentitySessionTests();
  const postgresIdentity = await runPostgresIdentityTests();
  const sessionBridge = await runSessionBridgeTests();
  const paymentDeclarations = await runPaymentDeclarationTests();
  const adminPaymentDeclarations = await runAdminPaymentDeclarationTests();
  const adminPaymentDecisions = await runAdminPaymentDecisionTests();
  const postgresFoundation = await runPostgresFoundationTests();
  const healthReport = await runHealthReportTests();
  const migrationRunner = await runMigrationRunnerTests();
  const cloudflareConfig = await runCloudflareConfigTests();
  const cloudflareEntry = await runCloudflareEntryTests();
  const offerDomain = await runOfferDomainTests();
  const applicationDomain = await runApplicationDomainTests();
  const applicationDecisionMatrix = runApplicationTransitionTests();
  const applicationDecisions = await runApplicationDecisionTests();

  const suites: Array<{ name: string; cases: TestCase[] }> = [
    { name: 'Domain deterministic', cases: deterministic.results.map(result => ({ name: result.name, success: result.success, detail: result.details })) },
    { name: 'Final stabilization', cases: stabilization.map(result => ({ name: result.name, success: result.success, detail: result.details })) },
    { name: 'Repository QA 800', cases: massive.results.map(result => ({ name: result.label, success: result.success, detail: result.detail })) },
    { name: 'Backend boundary', cases: boundary },
    { name: 'Mock/API WebRTC boundary', cases: callBoundary },
    { name: 'Server identity & session', cases: identity },
    { name: 'P0-B — identité et sessions PostgreSQL (PGlite)', cases: postgresIdentity },
    { name: 'Frontend ↔ server session bridge', cases: sessionBridge },
    { name: 'Phases 4A/4B — déclarations de paiement employeur', cases: paymentDeclarations },
    { name: 'Phase 4C — consultation ADMIN des paiements soumis', cases: adminPaymentDeclarations },
    { name: 'Phase 4D — décision ADMIN sur un paiement soumis', cases: adminPaymentDecisions },
    { name: 'P0-A — fondation PostgreSQL (migrations, adaptateur, configuration, séparation DEMO/API)', cases: postgresFoundation },
    { name: 'P0-C — /healthz réel (persistance sondée, secrets, modes)', cases: healthReport },
    { name: 'P0-C — runner de migrations (manifeste, enveloppe, idempotence, checksum)', cases: migrationRunner },
    { name: 'P0-C — configuration Cloudflare Worker (bindings, secrets, isolation pg)', cases: cloudflareConfig },
    { name: 'P0-C — entrée Worker Cloudflare (composition, fermeture, cycle de pool)', cases: cloudflareEntry },
    { name: 'P0-E1 / P0-E2 — domaine OFFRES (création, cycle de vie des statuts, persistance, rôles, ownership, idempotence, rollback)', cases: offerDomain },
    { name: 'P0-E3 — soumission et consultation propriétaire des CANDIDATURES (PostgreSQL, rôles, ownership, idempotence, concurrence, rollback)', cases: applicationDomain },
    { name: 'P0-E4 — matrice de décision CANDIDATURE (statuts du code, transitions refusées, motifs, événements documentés)', cases: applicationDecisionMatrix },
    { name: 'P0-E4 — cycle de décision CANDIDATURE (examen, shortlist, rejet, retrait; PostgreSQL, autorisation, idempotence, concurrence, rollback)', cases: applicationDecisions },
  ];

  let total = 0;
  let failed = 0;
  for (const suite of suites) {
    const passed = suite.cases.filter(test => test.success).length;
    const suiteFailed = suite.cases.length - passed;
    total += suite.cases.length;
    failed += suiteFailed;
    console.log(`${suite.name}: ${passed}/${suite.cases.length} PASS`);
    for (const test of suite.cases.filter(item => !item.success)) {
      console.error(`  FAIL ${test.name}${test.detail ? ` — ${test.detail}` : ''}`);
    }
  }
  console.log(`Total: ${total - failed}/${total} PASS; ${failed} FAIL`);
  if (failed > 0) throw new Error(`${failed} test(s) failed.`);
}

void main();
