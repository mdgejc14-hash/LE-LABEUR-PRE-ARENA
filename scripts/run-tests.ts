import { runPublicTests } from '../src/public/public.test';
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
import { runProposalDomainTests } from '../src/backend/api/proposals.test';
import { runProposalTransitionTests } from '../src/domain/proposalTransitions.test';
import { runContractTransitionTests } from '../src/domain/contractTransitions.test';
import { runContractDomainTests } from '../src/backend/api/contracts.test';
import { runPostContractTransitionTests } from '../src/domain/postContractTransitions.test';
import { runPostContractDomainTests } from '../src/backend/api/postContract.test';
import { runContractScheduleAutomationTests } from '../src/domain/contractScheduleAutomation.test';
import { runPaymentLifecycleTests } from '../src/domain/paymentLifecycle.test';
import { runPaymentCycleTests } from '../src/backend/api/payments.test';
import { runExternalPaymentProviderTests } from '../src/backend/api/externalPaymentProvider.test';
import { runPaymentMissionCloseTests } from '../src/backend/api/paymentMissionClose.test';
import { runClaimDomainTests } from '../src/backend/api/claims.test';
import { runReplacementDomainTests } from '../src/backend/api/replacements.test';
import { runContractAutomationTests } from '../src/backend/automation/contractActivation.test';
import { runCronQueueTests } from '../src/backend/automation/cronQueue.test';
import { runNotificationTests } from '../src/backend/notifications/notifications.test';
import { runMatchingTests } from '../src/backend/matching/matching.test';
import { runReputationTests } from '../src/backend/api/reputation.test';
import { runDocumentDomainTests } from '../src/backend/api/documents.test';
import { runWebRtcTests } from '../src/backend/webrtc/webrtc.test';
import { runSecurityAntiFraudTests } from '../src/backend/api/securityAntiFraud.test';
import { runDesignFoundationTests } from '../src/design-system/foundation.test';
import { runRoutingTests } from '../src/routing/routing.test';
import { runEmployerTests } from '../src/employer/employer.test';

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
  const proposalMatrix = runProposalTransitionTests();
  const proposalDomain = await runProposalDomainTests();
  const contractMatrix = runContractTransitionTests();
  const contractDomain = await runContractDomainTests();
  const postContractMatrix = runPostContractTransitionTests();
  const postContractDomain = await runPostContractDomainTests();
  const contractScheduleRules = runContractScheduleAutomationTests();
  const contractAutomation = await runContractAutomationTests();
  const cronQueue = await runCronQueueTests();
  const paymentLifecycle = runPaymentLifecycleTests();
  const paymentCycle = await runPaymentCycleTests();
  const externalPaymentProvider = await runExternalPaymentProviderTests();
  const paymentMissionClose = await runPaymentMissionCloseTests();
  const claimDomain = await runClaimDomainTests();
  const replacementDomain = await runReplacementDomainTests();
  const notificationLayer = await runNotificationTests();
  const matching = await runMatchingTests();
  const reputation = await runReputationTests();
  const documents = await runDocumentDomainTests();
  const webrtc = await runWebRtcTests();
  const securityAntiFraud = await runSecurityAntiFraudTests();
  const designFoundation = runDesignFoundationTests();
  const routing = runRoutingTests();
  const publicAuth = await runPublicTests();
  const employer = await runEmployerTests();

  const suites: Array<{ name: string; cases: TestCase[] }> = [
    { name: 'P1 — Public / Auth / System integration', cases: publicAuth },
    { name: 'P2 — Espace employeur (32 unités / 60 fiches : routeur P0, API existantes, états, garde-fous vocabulaire et finance)', cases: employer },
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
    { name: 'P0-E5 — cycle PROPOSITION (statuts réels, transitions ouvertes et refusées, éligibilité, événements documentés)', cases: proposalMatrix },
    { name: 'P0-E5 — émission et cycle PROPOSITION (PostgreSQL, autorisation, ownership, idempotence, concurrence, rollback, lecture ADMIN)', cases: proposalDomain },
    { name: 'P0-F — matrice CONTRAT (statuts réels, transitions ouvertes et refusées, signature, protection M1, événements documentés)', cases: contractMatrix.map(result => ({ name: result.name, success: result.success, detail: result.details })) },
    { name: 'P0-F — cycle CONTRAT (création depuis ACCEPTED, envoi, signature, activation, fin, terminaison; PostgreSQL, autorisation, idempotence, concurrence, rollback)', cases: contractDomain },
    { name: 'P0-CONTRACT-POST — matrice post-contrat (cascade RÈGLE 21, HIRED→CONTRACTED, transitions refusées, work execution sans statut inventé, horaires simples, événements documentés)', cases: postContractMatrix.map(result => ({ name: result.name, success: result.success, detail: result.details })) },
    { name: 'P0-CONTRACT-POST — cascade d’embauche réelle (FILLED, HIRED→CONTRACTED, CLOSED_OFFER_FILLED; PostgreSQL, autorisation, idempotence, convergence, concurrence, rollback, non-régression P0-F/P0-AUTO-2)', cases: postContractDomain },
    { name: 'P0-AUTO-2 — règles d’automatisation contractuelle (périodicités réelles, échéancier, commission 25 %, échéances J+3, rappels, règles manquantes non inventées, post-contrat reporté)', cases: contractScheduleRules.map(result => ({ name: result.name, success: result.success, detail: result.details })) },
    { name: 'P0-PAY-1 — cycle PAIEMENT (règles métier: statuts, matrice de transitions, matérialisation, déclaration, vérification locale, rappels configurés, frontière fournisseur)', cases: paymentLifecycle.map(result => ({ name: result.name, success: result.success, detail: result.details })) },
    { name: 'P0-PAY-1 — cycle PAIEMENT réel (matérialisation, SCHEDULED→DUE, déclaration, vérification, rapprochement, rejet, régularisation; PostgreSQL, rôles, séparation salaire/commission, idempotence, concurrence, rollback, audit, aucun paiement exécuté)', cases: paymentCycle },
    { name: 'P0-PAY-2 / P0-SALARY-VERIFY — paiement externe → PAID → confirmation P0-SALARY-1 (webhook sécurisé, audit, OTP/nonce, idempotence, aucun paiement réel)', cases: externalPaymentProvider },
    { name: 'P0-PAYMENT-VERIFY — mission terminée → paiement attendu → paiement externe → vérification (clôture de mission, échéances atteintes, déclaration, décision ADMIN, webhook, rejet/régularisation; PostgreSQL, idempotence, concurrence, intégrité, aucun fonds)', cases: paymentMissionClose },
    { name: 'P0-DISPUTE-1 — cycle Claim réel (PostgreSQL, autorisation, idempotence, concurrence, rollback, preuve, deadline configurée, résolution déterministe/ADMIN, restrictions réversibles, M1, audit, séparation DEMO/API)', cases: claimDomain },
    { name: 'P0-REPLACEMENT — workflow persistant (REPLACE, ownership, idempotence/concurrence, Application → Proposal → Contract, liens historiques, notifications, paiements non transférés)', cases: replacementDomain },
    { name: 'P0-NOTIFICATIONS — couche de notification (événement → Outbox/Automation existants → In-App → Push/Email en abstraction; destinataires, lu/non lu, idempotence, rejeu, concurrence, retry, couverture auditée)', cases: notificationLayer },
    { name: 'P0-MATCHING — qualification indépendante, revue humaine, ranking explicable, consentement, idempotence, concurrence, ownership et exclusion des facteurs sensibles', cases: matching },
    { name: 'P0-REPUTATION — ledger d’événements documentés (faits réels, règles versionnées, explications, idempotence, concurrence, neutralité des litiges ouverts, corrections ADMIN auditées, permissions, non-régression P0-MATCHING/PAIEMENT/REPLACEMENT)', cases: reputation },
    { name: 'P0-R2 — DOCUMENTS & PREUVES (upload, métadonnées, hash SHA-256, versionnement append-only, récupération exacte, ownership/permissions/anti-IDOR, audit existant, liens version↔entité/acceptation, intégrité, révocation, rétention sans durée inventée, idempotence, concurrence, garde-fous juridiques/financiers, non-régression)', cases: documents },
    { name: 'P0-WEBRTC — contrat actif, participants réels, invitation Outbox, signaling REST/offer-answer-ICE, credentials courts, replay, expiration, révocation, fermeture, purge, statut ICE/TURN et absence d’enregistrement/biométrie', cases: webrtc },
    { name: 'P0-SECURITY-ANTI-FRAUD — couche transversale finale de sécurité et anti-fraude (40 scénarios : identité, RBAC, IDOR tous domaines, webhooks HMAC/replay/mismatch, DECLARED≠VERIFIED≠PAID, OTP salaire, R2 intégrité/révocation/object_key, WebRTC, idempotence, concurrence, routes internes, rate-limit, anti-falsification, audit ADMIN, masquage erreurs, APDP)', cases: securityAntiFraud },
    { name: 'P0-AUTO-2 — CONTRACT_ACTIVATED réel (Outbox → Queue → Worker → AutomationEngine → échéancier salarial, échéancier de commission, échéances, rappels; PostgreSQL, idempotence, concurrence, retry, dead-letter, rollback, audit, séparation DEMO/API)', cases: contractAutomation },
    { name: 'P0-CRON-QUEUE — déclenchement périodique sur la queue EXISTANTE (Cron scheduled() réel → worker : jobs échus/futurs, double déclenchement, deux workers, retry, dead-letter, crash après réservation, idempotence métier, audit du tick, échéances paiement/claim/salaire, notification workflow existant, réputation planifiable, sécurité, non-régression R2/REPUTATION/MATCHING/REPLACEMENT/PAIEMENT/NOTIFICATIONS; PostgreSQL PGlite, aucun Cloudflare réel)', cases: cronQueue },
    { name: 'P0-DESIGN-FOUNDATION — tokens (parité avec design/llab/tokens.py), verre, squircle, mouvement, StateGuard (sys.py), shells, responsive 360/1440, reduced-motion, accessibilité', cases: designFoundation },
    { name: 'P0-DESIGN-FOUNDATION — routage progressif (namespaces, legacy /, unités de production, états SYS, dock ancré dans les fiches)', cases: routing },
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
