import { runAllDeterministicTests } from '../src/domain/businessRules.test';
import { runFinalStabilizationTests } from '../src/domain/finalStabilization.test';
import { runMassiveQaScenarios } from '../src/domain/qaMassive.test';
import { runBackendBoundaryTests } from '../src/backend/api/foundation.test';
import { runCallBoundaryTests } from '../src/services/calls/signalingCredentialClient.test';
import { runIdentitySessionTests } from '../src/backend/identity/identity.test';
import { runSessionBridgeTests } from '../src/repositories/sessionBridge.test';
import { runPaymentDeclarationTests } from '../src/repositories/paymentDeclarations.test';
import { runAdminPaymentDeclarationTests } from '../src/repositories/adminPaymentDeclarations.test';
import { runAdminPaymentDecisionTests } from '../src/repositories/adminPaymentDecisions.test';
import { runPostgresFoundationTests } from '../src/backend/persistence/persistence.test';

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
  const sessionBridge = await runSessionBridgeTests();
  const paymentDeclarations = await runPaymentDeclarationTests();
  const adminPaymentDeclarations = await runAdminPaymentDeclarationTests();
  const adminPaymentDecisions = await runAdminPaymentDecisionTests();
  const postgresFoundation = await runPostgresFoundationTests();

  const suites: Array<{ name: string; cases: TestCase[] }> = [
    { name: 'Domain deterministic', cases: deterministic.results.map(result => ({ name: result.name, success: result.success, detail: result.details })) },
    { name: 'Final stabilization', cases: stabilization.map(result => ({ name: result.name, success: result.success, detail: result.details })) },
    { name: 'Repository QA 800', cases: massive.results.map(result => ({ name: result.label, success: result.success, detail: result.detail })) },
    { name: 'Backend boundary', cases: boundary },
    { name: 'Mock/API WebRTC boundary', cases: callBoundary },
    { name: 'Server identity & session', cases: identity },
    { name: 'Frontend ↔ server session bridge', cases: sessionBridge },
    { name: 'Phases 4A/4B — déclarations de paiement employeur', cases: paymentDeclarations },
    { name: 'Phase 4C — consultation ADMIN des paiements soumis', cases: adminPaymentDeclarations },
    { name: 'Phase 4D — décision ADMIN sur un paiement soumis', cases: adminPaymentDecisions },
    { name: 'P0-A — fondation PostgreSQL (migrations, adaptateur, configuration, séparation DEMO/API)', cases: postgresFoundation },
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
