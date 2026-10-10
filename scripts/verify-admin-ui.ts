/**
 * P4D-DESIGN-ADMIN-CLAIMS — vérification UI réelle (Chromium) de l'espace
 * supervision livré (P4A + P4B-1 contrats + P4B-2 paiements + P4C salaire + P4D Claims).
 *
 * Comme le script P2, ce script n'affirme rien sur des données simulées dans
 * l'application : les fixtures HTTP vivent ICI et ne sont jamais activées dans
 * le produit. Ce qui est vérifié dans un navigateur réel :
 *
 *  1. AUCUNE source de données configurée : les 29 fiches ADM rendent leur
 *     conteneur (`data-unit`, `data-screen`), la structure déclarée par le
 *     design (`data-sheet-frame`) et le BACKEND_GAP, sans débordement
 *     horizontal à 360 px comme à 1440 px ; aucun terme du Master Design ni
 *     libellé financier interdit n'est rendu ;
 *  2. session ADMIN + réponses serveur (fixtures) : le registre des contrats
 *     affiche les valeurs réellement reçues (référence, statut, parties,
 *     montant du contrat), la fiche compose ses zones depuis ces mêmes données,
 *     les incidents affichent le Claim rattaché, le journal rend
 *     l'historique émis — et l'état « hors page chargée » reste honnête pour
 *     une référence absente ;
 *  3. la fiche de révision forcée (ADM-16) ne rend AUCUN formulaire : aucune
 *     saisie là où aucune commande serveur n'existe ;
 *  4. refus réels : compte non-ADMIN → StateGuard 403, session absente → 401,
 *     erreur serveur → 500 avec la seule corrélation du serveur, jamais un
 *     secret ni un message brut ;
 *  5. clavier et focus : navigation au dock avec focus rendu au contenu,
 *     segment du registre activable au clavier (aria-pressed), tables sémantiques ;
 *  6. reduced-motion : les transitions de l'espace supervision sont neutralisées ;
 *  7. P4B-2 : états/natures de Paiement, permissions, déclaration vs vérification
 *     vs PAID, rapprochement/revue, erreurs/vides, idempotence UI, 360/1440 px.
 *     Toutes les commandes de test sont interceptées par Playwright : aucun
 *     handler financier réel n'est appelé ;
 *  8. P4C : confirmations de Salaire — file réelle des paiements SALARY,
 *     confirmation du Candidat jamais déduite, distinction
 *     déclaration/vérification/PAID/confirmation, fiche de preuve sans
 *     formulaire ni secret, 360/1440 px ;
 *  9. P4D : Claims issus des routes ADMIN réelles, filtres de page locale,
 *     revue/demande de justificatif/décision avec idempotence, permissions,
 *     statuts terminaux, références opaques masquées, aucun contrôle de
 *     restriction/remplacement, 360/1440 px.
 *
 * Exécution : `npm run verify:admin-ui`.
 */

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';
import bundledChromium from '@sparticuz/chromium';
import { createServer, type ViteDevServer } from 'vite';
import { ADMIN_DESIGN_SCREENS } from '../src/admin/catalog';
import { unitForScreen, resolveAdminScreen } from '../src/admin/screenMap';
import { deliveredScreensForUnit } from '../src/admin/screenMap';
import { DOCK_DEFINITIONS } from '../src/design-system/shells/shellNavigation';

const FORBIDDEN = ['Mission', 'Missions', 'Client', 'Clients', 'Prestataire', 'Prestataires', 'Prestation', 'Litige', 'Litiges'];
const FORBIDDEN_FINANCE = ['Prix Prestataire', 'Frais SaaS', 'Total Client', 'barème', 'Barème', 'séquestre', 'escrow'];
const SERVER_SECRET = 'SECRET_MUST_NOT_RENDER';
const SERVER_REQUEST_ID = 'req-adm-456';

/** Chemin concret d'un motif de fiche (`:id` → référence présente dans les fixtures). */
function concretePath(pattern: string): string {
  return pattern
    .split('/')
    .map((segment) => (segment.startsWith(':') ? 'ctr-e2e-1' : segment))
    .join('/');
}

// Bibliothèques du runtime Chromium empaqueté (aucun téléchargement, installation système minimale).
const require = createRequire(import.meta.url);
const libraryDirectory = resolve('.tmp/p4b1-chromium');
if (!process.env.CHROMIUM_PATH && process.platform === 'linux') {
  mkdirSync(libraryDirectory, { recursive: true });
  const archive = resolve(require.resolve('@sparticuz/chromium'), '../../bin/al2023.tar.br');
  writeFileSync(resolve(libraryDirectory, 'al2023.tar'), brotliDecompressSync(readFileSync(archive)));
  execFileSync('tar', ['-xf', resolve(libraryDirectory, 'al2023.tar'), '-C', libraryDirectory]);
}

/* ── Fixtures de réponse serveur (test-only) : DTOs réels du produit ── */

const FIXTURE_CONTRACT = {
  id: 'ctr-e2e-1',
  offerId: 'off-e2e-1',
  offerTitle: 'Entretien ménager hebdomadaire',
  proposalId: 'prp-e2e-1',
  applicationId: 'app-e2e-1',
  employerId: 'usr-emp-e2e',
  employerName: 'A. Gbian',
  employeeId: 'usr-can-e2e',
  employeeName: 'R. Sika',
  monthlySalary: 120000,
  currency: 'XOF',
  startDate: '2026-09-01T00:00:00.000Z',
  currentMonth: 2,
  status: 'ACTIVE',
  employerSigned: true,
  employerSignedAt: '2026-08-28T09:00:00.000Z',
  employeeSigned: true,
  employeeSignedAt: '2026-08-30T10:30:00.000Z',
  missionDescription: 'Entretien des communs chaque lundi et jeudi.',
  location: 'Abomey-Calavi',
  durationMonths: 6,
  periodicity: 'MENSUELLE',
  conditions: ['Période d’essai de 15 jours', 'Reprise en cas d’absence'],
  monthlyCheckpoints: [
    { monthNumber: 1, periodKey: '2026-09', salaryAmount: 120000, employeeShareAmount: 120000, leLabeurShareAmount: 30000, currency: 'XOF', isStarted: true, employerStartAnswer: 'YES', employeeStartAnswer: 'YES', startConfirmed: true },
  ],
  commissionLedger: [],
  paymentSchedule: [],
  commissionPercentage: 25,
  commissionAmountDue: 30000,
  commissionStatus: 'SCHEDULED',
  history: [
    { id: 'log-e2e-1', timestamp: '2026-08-25T10:00:00.000Z', event: 'CONTRACT_CREATED', description: 'Contrat préparé en brouillon depuis la proposition acceptée prp-e2e-1.', actor: 'A. Gbian' },
    { id: 'log-e2e-2', timestamp: '2026-09-02T08:00:00.000Z', event: 'CONTRACT_ACTIVATED', description: 'Double signature bilatérale complétée : contrat actif.', actor: 'Système' },
  ],
};

const FIXTURE_CLAIM = {
  claimId: 'clm-e2e-1',
  contractId: 'ctr-e2e-1',
  claimantId: 'usr-can-e2e',
  respondentId: 'usr-emp-e2e',
  type: 'CONTRACT_INCIDENT',
  reason: 'Retard de reprise signalé',
  status: 'OPEN',
  createdAt: '2026-09-20T00:00:00.000Z',
  dueAt: '2026-09-25T00:00:00.000Z',
  evidenceReference: 'private-claim-evidence-reference-e2e',
  salaryConfirmationId: 'private-salary-confirmation-e2e',
  metadata: { internalMarker: 'private-claim-metadata-e2e' },
  idempotencyKey: 'private-claim-idempotency-key-e2e',
  evidenceRequests: [{
    evidenceRequestId: 'evr-e2e-1',
    claimId: 'clm-e2e-1',
    requestedFrom: 'usr-emp-e2e',
    requestedBy: 'usr-admin-e2e',
    requestedType: 'CONTRACT_EVIDENCE',
    status: 'SUBMITTED',
    createdAt: '2026-09-20T10:00:00.000Z',
    submittedAt: '2026-09-21T10:00:00.000Z',
    evidenceReference: 'private-request-evidence-reference-e2e',
  }],
  restrictions: [{
    restrictionId: 'rsk-e2e-1',
    claimId: 'clm-e2e-1',
    userId: 'usr-emp-e2e',
    scope: 'CONTRACT_TERMINATE',
    status: 'ACTIVE',
    reason: 'private-restriction-reason-e2e',
    appliedBy: 'usr-admin-e2e',
    appliedAt: '2026-09-20T11:00:00.000Z',
  }],
};

const FIXTURE_DECISION_CLAIM = {
  ...FIXTURE_CLAIM,
  claimId: 'clm-decision-e2e',
  type: 'PAYMENT_DISPUTE',
  reason: 'Contestation examinée par la revue ADMIN',
  status: 'ADMIN_REVIEW',
  evidenceReference: undefined,
  salaryConfirmationId: undefined,
  metadata: {},
  idempotencyKey: 'private-decision-claim-key-e2e',
  evidenceRequests: [],
  restrictions: [],
};

const FIXTURE_TERMINAL_CLAIM = {
  ...FIXTURE_CLAIM,
  claimId: 'clm-terminal-e2e',
  type: 'OTHER_REVIEW_REQUIRED',
  reason: 'Dossier arrivé à une issue terminale',
  status: 'RESOLVED',
  resolvedAt: '2026-09-22T10:00:00.000Z',
  resolvedBy: 'usr-admin-e2e',
  resolution: 'Résolution motivée enregistrée',
  evidenceReference: undefined,
  salaryConfirmationId: undefined,
  metadata: {},
  idempotencyKey: 'private-terminal-claim-key-e2e',
  evidenceRequests: [],
  restrictions: [],
};

const FIXTURE_SALARY_REJECTED_DECLARATION = {
  declarationId: 'decl-salary-old-e2e',
  paymentId: 'pay-salary-e2e',
  contractId: 'ctr-e2e-1',
  periodKey: '2026-09',
  paymentType: 'SALARY',
  attemptNumber: 1,
  amount: 120000,
  currency: 'XOF',
  reference: 'salary-old-ref-e2e',
  externalTransactionId: 'salary-old-ext-e2e',
  provider: 'fixture-external-source',
  proof: { fileName: 'preuve-salaire-e2e.pdf' },
  comment: 'Déclaration historique de test',
  submittedAt: '2026-09-03T10:00:00.000Z',
  submittedBy: 'usr-emp-e2e',
  outcome: 'REJECTED',
  reviewedAt: '2026-09-03T11:00:00.000Z',
  reviewedBy: 'usr-admin-e2e',
  rejectionReason: 'Référence externe discordante',
  idempotencyKey: 'decl-salary-old-key-e2e',
  createdAt: '2026-09-03T10:00:00.000Z',
  updatedAt: '2026-09-03T11:00:00.000Z',
};

const FIXTURE_SALARY_PENDING_DECLARATION = {
  declarationId: 'decl-salary-current-e2e',
  paymentId: 'pay-salary-e2e',
  contractId: 'ctr-e2e-1',
  periodKey: '2026-09',
  paymentType: 'SALARY',
  attemptNumber: 2,
  amount: 120000,
  currency: 'XOF',
  reference: 'salary-current-ref-e2e',
  externalTransactionId: 'salary-current-ext-e2e',
  provider: 'fixture-external-source',
  proof: { fileName: 'preuve-salaire-courante-e2e.pdf' },
  comment: 'Déclaration en attente de vérification',
  submittedAt: '2026-09-04T10:00:00.000Z',
  submittedBy: 'usr-emp-e2e',
  outcome: 'PENDING',
  idempotencyKey: 'decl-salary-current-key-e2e',
  createdAt: '2026-09-04T10:00:00.000Z',
  updatedAt: '2026-09-04T10:00:00.000Z',
};

const FIXTURE_FEE_VERIFIED_DECLARATION = {
  declarationId: 'decl-fee-e2e',
  paymentId: 'pay-fee-e2e',
  contractId: 'ctr-e2e-1',
  periodKey: '2026-09',
  paymentType: 'PLATFORM_FEE',
  attemptNumber: 1,
  amount: 30000,
  currency: 'XOF',
  reference: 'fee-ref-e2e',
  externalTransactionId: 'fee-ext-e2e',
  provider: 'fixture-external-source',
  submittedAt: '2026-09-05T10:00:00.000Z',
  submittedBy: 'usr-emp-e2e',
  outcome: 'VERIFIED',
  reviewedAt: '2026-09-05T11:00:00.000Z',
  reviewedBy: 'usr-admin-e2e',
  idempotencyKey: 'decl-fee-key-e2e',
  createdAt: '2026-09-05T10:00:00.000Z',
  updatedAt: '2026-09-05T11:00:00.000Z',
};

const FIXTURE_SALARY_PAYMENT = {
  paymentId: 'pay-salary-e2e',
  contractId: 'ctr-e2e-1',
  employerId: 'usr-emp-e2e',
  candidateId: 'usr-can-e2e',
  paymentType: 'SALARY',
  scheduleEntryId: 'schedule-salary-e2e',
  monthNumber: 1,
  periodKey: '2026-09',
  amount: 120000,
  currency: 'XOF',
  scheduledAt: '2026-09-01T00:00:00.000Z',
  dueAt: '2026-09-03T00:00:00.000Z',
  status: 'PENDING_VERIFICATION',
  due: true,
  declared: true,
  verified: false,
  paid: false,
  rejected: false,
  idempotencyKey: 'payment-salary-e2e',
  declarationCount: 2,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-04T10:00:00.000Z',
  submittedAt: '2026-09-04T10:00:00.000Z',
  submittedBy: 'usr-emp-e2e',
  reference: 'salary-current-ref-e2e',
  externalTransactionId: 'salary-current-ext-e2e',
  provider: 'fixture-external-source',
  currentDeclarationId: 'decl-salary-current-e2e',
  declarations: [FIXTURE_SALARY_REJECTED_DECLARATION, FIXTURE_SALARY_PENDING_DECLARATION],
};

const FIXTURE_FEE_PAYMENT = {
  paymentId: 'pay-fee-e2e',
  contractId: 'ctr-e2e-1',
  employerId: 'usr-emp-e2e',
  candidateId: 'usr-can-e2e',
  paymentType: 'PLATFORM_FEE',
  scheduleEntryId: 'schedule-fee-e2e',
  monthNumber: 1,
  periodKey: '2026-09',
  amount: 30000,
  currency: 'XOF',
  scheduledAt: '2026-09-01T00:00:00.000Z',
  dueAt: '2026-09-03T00:00:00.000Z',
  status: 'VERIFIED',
  due: true,
  declared: true,
  verified: true,
  paid: false,
  rejected: false,
  idempotencyKey: 'payment-fee-e2e',
  declarationCount: 1,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-05T11:00:00.000Z',
  submittedAt: '2026-09-05T10:00:00.000Z',
  submittedBy: 'usr-emp-e2e',
  reference: 'fee-ref-e2e',
  externalTransactionId: 'fee-ext-e2e',
  provider: 'fixture-external-source',
  currentDeclarationId: 'decl-fee-e2e',
  declarations: [FIXTURE_FEE_VERIFIED_DECLARATION],
};

const FIXTURE_SCHEDULED_PAYMENT = {
  paymentId: 'pay-scheduled-e2e',
  contractId: 'ctr-e2e-1',
  employerId: 'usr-emp-e2e',
  candidateId: 'usr-can-e2e',
  paymentType: 'SALARY',
  scheduleEntryId: 'schedule-next-e2e',
  monthNumber: 2,
  periodKey: '2026-10',
  amount: 120000,
  currency: 'XOF',
  scheduledAt: '2026-10-01T00:00:00.000Z',
  dueAt: '2026-10-03T00:00:00.000Z',
  status: 'SCHEDULED',
  due: false,
  declared: false,
  verified: false,
  paid: false,
  rejected: false,
  idempotencyKey: 'payment-scheduled-e2e',
  declarationCount: 0,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  declarations: [],
};

const FIXTURE_BATCH_REPORT = {
  batch: {
    batchId: 'batch-e2e-1',
    provider: 'fixture-external-source',
    idempotencyKey: 'batch-key-e2e',
    payloadHash: 'hash-e2e',
    requestedBy: 'usr-admin-e2e',
    status: 'PARTIAL',
    totalItems: 4,
    processedItems: 3,
    matchedItems: 1,
    mismatchedItems: 1,
    notFoundItems: 0,
    duplicateItems: 0,
    reviewItems: 1,
    failedItems: 0,
    pendingItems: 0,
    processingItems: 0,
    retryableItems: 1,
    createdAt: '2026-09-06T10:00:00.000Z',
    startedAt: '2026-09-06T10:00:01.000Z',
    completedAt: '2026-09-06T10:01:00.000Z',
  },
  items: [
    {
      itemId: 'item-match-e2e', batchId: 'batch-e2e-1', itemIndex: 0, provider: 'fixture-external-source',
      externalTransactionId: 'ext-match-e2e', reference: 'ref-match-e2e',
      normalizedMetadata: { amount: 120000, currency: 'XOF', status: 'SUCCESS', payer: 'usr-emp-e2e', recipient: 'usr-can-e2e' },
      validationReasons: [], status: 'MATCH', matchedPaymentId: 'pay-salary-e2e', attempts: 1,
      nextAttemptAt: '2026-09-06T10:00:00.000Z', createdAt: '2026-09-06T10:00:00.000Z', updatedAt: '2026-09-06T10:00:10.000Z',
      result: {
        verdict: 'MATCH', paymentId: 'pay-salary-e2e', provider: 'fixture-external-source', externalTransactionId: 'ext-match-e2e',
        reference: 'ref-match-e2e',
        comparisons: [{ field: 'reference', expected: 'ref-match-e2e', actual: 'ref-match-e2e', matched: true }],
        reasons: [], reconciledAt: '2026-09-06T10:00:10.000Z',
      },
    },
    {
      itemId: 'item-mismatch-e2e', batchId: 'batch-e2e-1', itemIndex: 1, provider: 'fixture-external-source',
      externalTransactionId: 'ext-mismatch-e2e', reference: 'ref-mismatch-e2e',
      normalizedMetadata: { amount: 30000, currency: 'XOF', status: 'SUCCESS' },
      validationReasons: [], status: 'MISMATCH', matchedPaymentId: 'pay-fee-e2e', attempts: 1,
      nextAttemptAt: '2026-09-06T10:00:00.000Z', createdAt: '2026-09-06T10:00:00.000Z', updatedAt: '2026-09-06T10:00:20.000Z',
      result: {
        verdict: 'MISMATCH', paymentId: 'pay-fee-e2e', provider: 'fixture-external-source', externalTransactionId: 'ext-mismatch-e2e',
        reference: 'ref-mismatch-e2e',
        comparisons: [{ field: 'amount', expected: 30000, actual: 29900, matched: false, detail: 'Comparaison explicitement fournie par la fixture.' }],
        reasons: ['Montant externe discordant.'], reconciledAt: '2026-09-06T10:00:20.000Z',
      },
    },
    {
      itemId: 'item-review-e2e', batchId: 'batch-e2e-1', itemIndex: 2, provider: 'fixture-external-source',
      externalTransactionId: 'ext-review-e2e', reference: 'ref-review-e2e',
      normalizedMetadata: { amount: 30000, currency: 'XOF', status: 'SUCCESS' },
      validationReasons: [], status: 'REVIEW_REQUIRED', matchedPaymentId: 'pay-fee-e2e', reviewId: 'review-e2e-1', attempts: 1,
      nextAttemptAt: '2026-09-06T10:00:00.000Z', createdAt: '2026-09-06T10:00:00.000Z', updatedAt: '2026-09-06T10:00:30.000Z',
      result: {
        verdict: 'REVIEW_REQUIRED', paymentId: 'pay-fee-e2e', provider: 'fixture-external-source', externalTransactionId: 'ext-review-e2e',
        reference: 'ref-review-e2e', comparisons: [], reasons: ['Revue ADMIN requise.'], reconciledAt: '2026-09-06T10:00:30.000Z',
      },
    },
    {
      itemId: 'item-retry-e2e', batchId: 'batch-e2e-1', itemIndex: 3, provider: 'fixture-external-source',
      externalTransactionId: 'ext-retry-e2e', reference: 'ref-retry-e2e',
      normalizedMetadata: { amount: 10000, currency: 'XOF', status: 'UNKNOWN' },
      validationReasons: ['Élément de test en reprise.'], status: 'RETRYABLE', attempts: 1,
      nextAttemptAt: '2026-09-06T10:05:00.000Z', createdAt: '2026-09-06T10:00:00.000Z', updatedAt: '2026-09-06T10:00:40.000Z',
    },
  ],
  cursor: null,
  limit: 100,
  hasMore: false,
};

let fixturePaymentRows: Record<string, unknown>[] = [FIXTURE_SALARY_PAYMENT, FIXTURE_FEE_PAYMENT, FIXTURE_SCHEDULED_PAYMENT];
let fixtureClaimRows: Record<string, unknown>[] = [FIXTURE_CLAIM, FIXTURE_DECISION_CLAIM, FIXTURE_TERMINAL_CLAIM];
type PaymentListMode = 'ready' | 'empty' | 'not-configured' | 'error';
type SessionMode = 'admin' | 'employer' | 'anonymous' | 'error';

async function startApp(environment: 'demo' | 'api'): Promise<{ origin: string; server: ViteDevServer }> {
  const server = await createServer({
    server: { host: '0.0.0.0', port: 0 },
    define:
      environment === 'api'
        ? {
            'import.meta.env.VITE_DEMO_MODE': JSON.stringify('false'),
            'import.meta.env.VITE_API_BASE_PATH': JSON.stringify('/api/v1'),
          }
        : { 'import.meta.env.VITE_DEMO_MODE': JSON.stringify('true') },
  });
  await server.listen();
  const address = server.httpServer!.address();
  assert.ok(address && typeof address !== 'string');
  return { origin: `http://127.0.0.1:${address.port}`, server };
}

let browser;
let passed = 0;
let demoServer: ViteDevServer | undefined;
let apiServer: ViteDevServer | undefined;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (await bundledChromium.executablePath()),
    args: bundledChromium.args.filter((arg) => !arg.includes('disable-web-security') && !arg.includes('allow-running-insecure-content')),
    headless: true,
    env: {
      ...process.env,
      LD_LIBRARY_PATH: [resolve(libraryDirectory, 'lib'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
    },
  });
  const context = await browser.newContext();
  await context.addInitScript('window.__name = (value) => value;');
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  /** Fixtures HTTP : session réelle et pages ADMIN réelles (jamais dans l'application). */
  let sessionMode: SessionMode = 'admin';
  let paymentListMode: PaymentListMode = 'ready';
  let paymentReadPermission = true;
  let paymentActionPermissions: 'all' | 'read-only' = 'all';
  let claimActionPermissions: 'all' | 'read-only' = 'all';
  let claimListCalls = 0;
  let claimDetailCalls = 0;
  const claimCommandRequests: Array<{ command: string; claimId: string; key: string; body: Record<string, unknown> }> = [];
  let paymentListDelayMs = 0;
  let approveFailureCount = 0;
  let approveDelayMs = 0;
  let batchRetryFailureCount = 0;
  let paymentListCalls = 0;
  let paymentDetailCalls = 0;
  const approveIdempotencyKeys: string[] = [];
  const rejectIdempotencyKeys: string[] = [];
  const confirmRequests: string[] = [];
  const batchRetryIdempotencyKeys: string[] = [];
  const reviewDecisionRequests: Array<{ key: string; body: Record<string, unknown> }> = [];
  const correctionAttemptRequests: Array<{ key: string; body: Record<string, unknown> }> = [];
  const resetPaymentFixtures = () => {
    fixturePaymentRows = [FIXTURE_SALARY_PAYMENT, FIXTURE_FEE_PAYMENT, FIXTURE_SCHEDULED_PAYMENT];
    paymentListMode = 'ready';
    paymentReadPermission = true;
    paymentActionPermissions = 'all';
    paymentListDelayMs = 0;
    approveFailureCount = 0;
    approveDelayMs = 0;
    batchRetryFailureCount = 0;
    paymentListCalls = 0;
    paymentDetailCalls = 0;
    approveIdempotencyKeys.length = 0;
    rejectIdempotencyKeys.length = 0;
    confirmRequests.length = 0;
    batchRetryIdempotencyKeys.length = 0;
    reviewDecisionRequests.length = 0;
    correctionAttemptRequests.length = 0;
  };
  const resetClaimFixtures = () => {
    fixtureClaimRows = [
      { ...FIXTURE_CLAIM, evidenceRequests: [...FIXTURE_CLAIM.evidenceRequests], restrictions: [...FIXTURE_CLAIM.restrictions] },
      { ...FIXTURE_DECISION_CLAIM, evidenceRequests: [], restrictions: [] },
      { ...FIXTURE_TERMINAL_CLAIM, evidenceRequests: [], restrictions: [] },
    ];
    claimActionPermissions = 'all';
    claimListCalls = 0;
    claimDetailCalls = 0;
    claimCommandRequests.length = 0;
  };
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname.endsWith('/auth/session')) {
      if (sessionMode === 'anonymous') {
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      if (sessionMode === 'error') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authenticated: true,
          user: {
            id: 'usr-admin-e2e',
            role: sessionMode === 'admin' ? 'ADMIN' : 'EMPLOYER',
            status: 'ACTIVE',
            displayName: sessionMode === 'admin' ? 'Superviseur de test' : 'Employeur de test',
          },
          permissions: sessionMode === 'admin'
            ? [
                'users:read:any',
                'contracts:read:any',
                'incidents:read:any',
                ...(claimActionPermissions === 'all' ? ['incidents:arbitrate'] : []),
                ...(paymentReadPermission ? ['payments:read:any'] : []),
                ...(paymentActionPermissions === 'all' ? ['payments:approve', 'payments:reject'] : []),
              ]
            : [],
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/admin/contracts') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [FIXTURE_CONTRACT], cursor: null, limit: 100, hasMore: false }) });
      return;
    }
    if (url.pathname === '/api/v1/admin/claims' && method === 'GET') {
      claimListCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: fixtureClaimRows, cursor: null, limit: 100, hasMore: false }),
      });
      return;
    }
    if (url.pathname.startsWith('/api/v1/admin/claims/')) {
      const segments = url.pathname.split('/');
      const claimId = decodeURIComponent(segments[5] ?? '');
      const command = segments[6] ?? '';
      const claim = fixtureClaimRows.find((item) => item.claimId === claimId);
      if (!claim) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Claim absent de la fixture.', requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      if (method === 'GET' && !command) {
        claimDetailCalls += 1;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(claim) });
        return;
      }
      if (method === 'POST' && ['review', 'evidence-requests', 'decision'].includes(command)) {
        if (sessionMode !== 'admin' || claimActionPermissions !== 'all') {
          await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'FORBIDDEN', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
          return;
        }
        const body = route.request().postDataJSON() as Record<string, unknown>;
        const key = route.request().headers()['idempotency-key'] ?? '';
        claimCommandRequests.push({ command, claimId, key, body });
        let updated: Record<string, unknown>;
        if (command === 'review') {
          updated = { ...claim, status: 'ADMIN_REVIEW' };
        } else if (command === 'evidence-requests') {
          const evidenceRequests = Array.isArray(claim.evidenceRequests) ? claim.evidenceRequests as Record<string, unknown>[] : [];
          const evidenceRequest = {
            evidenceRequestId: 'evr-requested-e2e',
            claimId,
            requestedFrom: body.requestedFrom,
            requestedBy: 'usr-admin-e2e',
            requestedType: body.requestedType,
            status: 'PENDING',
            createdAt: '2026-09-23T10:00:00.000Z',
          };
          updated = { ...claim, status: 'EVIDENCE_REQUESTED', evidenceRequests: [...evidenceRequests, evidenceRequest] };
        } else {
          if (claim.status !== 'ADMIN_REVIEW') {
            await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'BUSINESS_RULE_VIOLATION', message: 'Le Claim doit être en revue ADMIN.', requestId: SERVER_REQUEST_ID } }) });
            return;
          }
          const decision = body.decision === 'REJECT' ? 'REJECTED' : 'RESOLVED';
          updated = {
            ...claim,
            status: decision,
            resolvedAt: '2026-09-23T11:00:00.000Z',
            resolvedBy: 'usr-admin-e2e',
            resolution: body.resolution,
          };
        }
        fixtureClaimRows = fixtureClaimRows.map((item) => item.claimId === claimId ? updated : item);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
        return;
      }
    }
    if (url.pathname === '/api/v1/admin/payments' && method === 'GET') {
      paymentListCalls += 1;
      if (!paymentReadPermission) {
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'FORBIDDEN', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      if (paymentListDelayMs > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, paymentListDelayMs));
      if (paymentListMode === 'error') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      const items = paymentListMode === 'empty' || paymentListMode === 'not-configured' ? [] : fixturePaymentRows;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items,
          cursor: null,
          limit: 100,
          hasMore: false,
          ...(paymentListMode === 'not-configured' ? { persistence: 'not-configured' } : {}),
        }),
      });
      return;
    }
    if (url.pathname.startsWith('/api/v1/payments/') && method === 'GET') {
      paymentDetailCalls += 1;
      const paymentId = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
      if (!paymentReadPermission) {
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'FORBIDDEN', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      const payment = fixturePaymentRows.find((item) => item.paymentId === paymentId);
      if (!payment) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Paiement absent de la fixture.', requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payment) });
      return;
    }
    if (url.pathname.startsWith('/api/v1/admin/payments/') && method === 'POST') {
      const paymentId = decodeURIComponent(url.pathname.split('/')[5] ?? '');
      const command = url.pathname.split('/').at(-1);
      const key = route.request().headers()['idempotency-key'] ?? '';
      if (command === 'approve') {
        approveIdempotencyKeys.push(key);
        if (approveDelayMs > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, approveDelayMs));
        if (approveFailureCount > 0) {
          approveFailureCount -= 1;
          await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
          return;
        }
        const current = fixturePaymentRows.find((item) => item.paymentId === paymentId);
        if (!current) {
          await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Paiement absent de la fixture.', requestId: SERVER_REQUEST_ID } }) });
          return;
        }
        const declarations = Array.isArray(current.declarations)
          ? (current.declarations as Array<Record<string, unknown>>).map((declaration) => declaration.declarationId === current.currentDeclarationId
              ? { ...declaration, outcome: 'VERIFIED', reviewedAt: '2026-09-07T12:00:00.000Z', reviewedBy: 'usr-admin-e2e' }
              : declaration)
          : [];
        const updated = { ...current, status: 'VERIFIED', verified: true, paid: false, declarations, verifiedAt: '2026-09-07T12:00:00.000Z', verifiedBy: 'usr-admin-e2e', updatedAt: '2026-09-07T12:00:00.000Z' };
        fixturePaymentRows = fixturePaymentRows.map((item) => item.paymentId === paymentId ? updated : item);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
        return;
      }
      if (command === 'reject') {
        rejectIdempotencyKeys.push(key);
        const requestBody = route.request().postDataJSON() as { reason?: string };
        const current = fixturePaymentRows.find((item) => item.paymentId === paymentId);
        if (!current) {
          await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Paiement absent de la fixture.', requestId: SERVER_REQUEST_ID } }) });
          return;
        }
        const declarations = Array.isArray(current.declarations)
          ? (current.declarations as Array<Record<string, unknown>>).map((declaration) => declaration.declarationId === current.currentDeclarationId
              ? { ...declaration, outcome: 'REJECTED', reviewedAt: '2026-09-07T12:00:00.000Z', reviewedBy: 'usr-admin-e2e', rejectionReason: requestBody.reason }
              : declaration)
          : [];
        const updated = { ...current, status: 'REJECTED', rejected: true, declarations, rejectionReason: requestBody.reason, updatedAt: '2026-09-07T12:00:00.000Z' };
        fixturePaymentRows = fixturePaymentRows.map((item) => item.paymentId === paymentId ? updated : item);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
        return;
      }
      if (command === 'confirm') {
        confirmRequests.push(key);
        const current = fixturePaymentRows.find((item) => item.paymentId === paymentId);
        const updated = current ? { ...current, status: 'PAID', verified: true, paid: true, updatedAt: '2026-09-07T12:10:00.000Z' } : null;
        if (updated) fixturePaymentRows = fixturePaymentRows.map((item) => item.paymentId === paymentId ? updated : item);
        await route.fulfill(updated
          ? { status: 200, contentType: 'application/json', body: JSON.stringify(updated) }
          : { status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Paiement absent de la fixture.', requestId: SERVER_REQUEST_ID } }) });
        return;
      }
    }
    if (url.pathname === '/api/v1/admin/payment-reconciliation/batches/batch-e2e-1' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE_BATCH_REPORT) });
      return;
    }
    if (url.pathname === '/api/v1/admin/payment-reconciliation/batches/batch-e2e-1/retry' && method === 'POST') {
      batchRetryIdempotencyKeys.push(route.request().headers()['idempotency-key'] ?? '');
      if (batchRetryFailureCount > 0) {
        batchRetryFailureCount -= 1;
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...FIXTURE_BATCH_REPORT, replayed: true }) });
      return;
    }
    if (url.pathname === '/api/v1/admin/payment-reconciliation/reviews/review-e2e-1/decision' && method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const key = route.request().headers()['idempotency-key'] ?? '';
      reviewDecisionRequests.push({ key, body });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ review: {
          reviewId: 'review-e2e-1', batchId: 'batch-e2e-1', itemId: 'item-review-e2e', paymentId: 'pay-fee-e2e',
          reason: 'Revue de rapprochement', decision: body.decision, openedBy: 'usr-admin-e2e', openedAt: '2026-09-06T10:00:00.000Z',
          actorId: 'usr-admin-e2e', decidedAt: '2026-09-07T12:00:00.000Z', createdAt: '2026-09-06T10:00:00.000Z', updatedAt: '2026-09-07T12:00:00.000Z',
        } }),
      });
      return;
    }
    if (url.pathname === '/api/v1/admin/payment-reconciliation/reviews/review-e2e-1/correction-attempts' && method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const key = route.request().headers()['idempotency-key'] ?? '';
      correctionAttemptRequests.push({ key, body });
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ correctionAttempt: {
          correctionAttemptId: 'cor-e2e-1', reviewId: 'review-e2e-1', batchId: 'batch-e2e-1', itemId: 'item-review-e2e', paymentId: 'pay-fee-e2e',
          attemptedBy: 'usr-admin-e2e', idempotencyKey: key, proposedChanges: body.proposedChanges, evidenceReference: body.evidenceReference,
          note: body.note, status: 'RECORDED', createdAt: '2026-09-07T12:01:00.000Z',
        } }),
      });
      return;
    }
    if (url.pathname === '/api/v1/admin/users') {
      // Non-régression P4A : page vide réelle (aucun compte inventé).
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], cursor: null, limit: 100, hasMore: false }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Ressource non attendue par la vérification.', requestId: SERVER_REQUEST_ID } }) });
  });

  const check = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (error) {
      console.error('URL', page.url(), 'ERREURS', errors);
      throw error;
    }
    passed += 1;
    console.log(`PASS ${name}`);
  };

  const screenText = () => page.locator('[data-unit]').first().innerText();
  const says = (text: string, needle: string) => text.toLowerCase().includes(needle.toLowerCase());
  const stripTechnicalTokens = (text: string) =>
    text.replace(/[A-Za-z0-9_@?&=%./:[\]{}#-]*\/[A-Za-z0-9_@?&=%./:[\]{}#-]*/g, ' ');
  const assertNoForbiddenText = async (label: string, rawText: string) => {
    const text = stripTechnicalTokens(rawText);
    for (const term of FORBIDDEN) {
      assert.ok(!new RegExp(`(^|[^\\p{L}])${term}([^\\p{L}]|$)`, 'iu').test(text), `${label} : terme interdit « ${term} » rendu`);
    }
    for (const finance of FORBIDDEN_FINANCE) assert.ok(!text.includes(finance), `${label} : libellé financier interdit « ${finance} » rendu`);
    assert.ok(!text.includes(SERVER_SECRET), `${label} : message serveur brut rendu`);
  };

  /* ── 1. Aucune source de données configurée : 29 fiches, deux largeurs ── */
  const demo = await startApp('demo');
  demoServer = demo.server;
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await check(`ADM fiches — ${ADMIN_DESIGN_SCREENS.length} fiches rendues, structure déclarée inspectable, source absente dite (${width}px)`, async () => {
      for (const screen of ADMIN_DESIGN_SCREENS) {
        const path = concretePath(screen.route);
        const unitId = unitForScreen(screen.code);
        await page.goto(demo.origin + path);
        await page.locator(`[data-screen="${screen.code}"]`).waitFor();
        await page.locator(`[data-unit="${unitId}"]`).waitFor();
        await page.locator(`[data-sheet-frame="${screen.code}"]`).waitFor();
        await page.locator('[data-backend-gap="true"]').first().waitFor();
        const text = await screenText();
        assert.ok(says(text, 'Source de données non configurée'), `${path} : absence de source non dite`);
        await assertNoForbiddenText(path, text);
        assert.equal(await page.locator('main').count(), 1, `${path} : un seul main attendu`);
        const zones = await page.locator('[data-zone]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-zone')));
        for (const kind of screen.zoneKinds as readonly string[]) {
          assert.ok(zones.includes(kind), `${path} : zone déclarée « ${kind} » absente`);
        }
        for (const zone of zones) {
          assert.ok((screen.zoneKinds as readonly string[]).includes(zone!), `${path} : genre de zone inventé « ${zone} »`);
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} : débordement horizontal`);
      }
    });
  }

  await check('ADM dock + clavier — onglets réels, focus rendu au contenu, segments du registre activables au clavier', async () => {
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto(demo.origin + '/admin');
    await page.locator('[data-screen="ADM-01"]').waitFor();
    for (const item of DOCK_DEFINITIONS.ADM) {
      assert.equal(await page.locator(`.lbm-dock a[href="${item.href}"]`).count(), 1, `onglet absent : ${item.href}`);
    }
    // Navigation réelle depuis une fiche livrée vers l'onglet « Flux » : le focus
    // doit être rendu au contenu principal (accessibilité clavier du shell P0).
    await page.goto(demo.origin + '/admin/contrats');
    await page.locator('[data-screen="ADM-13"]').waitFor();
    await page.locator('.lbm-dock a[href="/admin"]').click();
    await page.waitForURL(`${demo.origin}/admin`);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'lbm-main', 'focus non rendu au contenu après navigation');
    // Repli honnête : un chemin ADM sans fiche de la tranche reste traité par la
    // fondation (unité rattachée non intégrée ou 404 de shell), jamais une fausse page.
    await page.goto(demo.origin + '/admin/matching/runs');
    await page.locator('[data-route-fallback="true"], [data-state], [data-unit]').first().waitFor();
    const fallback = await page.locator('[data-route-fallback="true"]').count();
    if (fallback > 0) {
      const text = await screenText();
      assert.ok(says(text, 'Aucun écran livré'), 'repli sans libellé de désignation');
    } else {
      assert.ok(await page.locator('[data-state], [data-unit]').first().isVisible(), 'état honnête attendu');
    }
  });

  await check('ADM chemin sans fiche — aucune invention : repli ou unité rattachée, libellé du design jamais rendu', async () => {
    assert.equal(resolveAdminScreen('/admin/contrats/ctr-9/versions'), null, 'aucune fiche ADMIN « versions » ne doit exister');
    await page.goto(demo.origin + '/admin/contrats/ctr-9/versions');
    const bodyText = await page.locator('body').innerText();
    assert.ok(!says(bodyText, 'ADM — contrat (fiche'), 'libellé du Master Design rendu');
    // La route est hors fiches livrées : soit 404 de shell, soit repli — jamais une fausse page contrats.
    assert.equal(await page.locator('[data-screen="ADM-14"]').count(), 0, 'aucune fiche ne doit être rendue sur un chemin non décrit');
  });

  /* ── 2. Session ADMIN + données serveur réelles (fixtures) ── */
  const api = await startApp('api');
  apiServer = api.server;

  await check('ADM-18 — registre réel, Salaire séparé des frais LE LABEUR, statuts serveur et filtres clavier', async () => {
    sessionMode = 'admin';
    resetPaymentFixtures();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(api.origin + '/admin/paiements');
    await page.locator('[data-screen="ADM-18"]').waitFor();
    await page.getByText('pay-salary-e2e', { exact: true }).first().waitFor();
    let text = await screenText();
    assert.ok(text.includes('120000 XOF'), 'montant unitaire de Salaire absent');
    assert.ok(text.includes('30000 XOF'), 'montant unitaire des frais absent');
    assert.ok(says(text, 'Salaire · SALARY'), 'nature Salaire réelle absente');
    assert.ok(says(text, 'Frais dus à LE LABEUR · PLATFORM_FEE'), 'nature des frais de LE LABEUR réelle absente');
    assert.ok(says(text, 'PENDING_VERIFICATION') && says(text, 'VERIFIED') && says(text, 'SCHEDULED'), 'états serveur réels absents');
    assert.ok(!text.includes('150000'), 'un total financier recalculé ne doit jamais être affiché');
    await assertNoForbiddenText('/admin/paiements', text);
    assert.equal(await page.locator('[data-screen="ADM-18"] table caption').count(), 1, 'table sans légende accessible');
    assert.equal(await page.locator('[data-screen="ADM-18"] table thead th[scope="col"]').count(), 9, 'en-têtes de colonnes non sémantiques');

    const feeFilter = page.getByRole('button', { name: 'Frais LE LABEUR' });
    await feeFilter.focus();
    await feeFilter.press('Enter');
    assert.equal(await feeFilter.getAttribute('aria-pressed'), 'true', 'filtre clavier non activé');
    assert.equal(await page.locator('[data-screen="ADM-18"] tbody tr').count(), 1, 'le filtre local de nature doit limiter à la page réellement chargée');
    assert.ok(!(await screenText()).includes('pay-salary-e2e'), 'un Salaire reste affiché après filtre frais');
    await page.getByRole('button', { name: 'Tous', exact: true }).click();

    await page.setViewportSize({ width: 360, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 5000 }).catch(() => undefined);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'débordement horizontal du registre à 360 px');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 5000 }).catch(() => undefined);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'débordement horizontal du registre à 1440 px');
  });

  await check('ADM-18/21 — consultation, déclaration distincte de la vérification, vérification distincte de PAID, clé idempotente réutilisée', async () => {
    sessionMode = 'admin';
    resetPaymentFixtures();
    approveFailureCount = 1;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(api.origin + '/admin/paiements');
    await page.locator('[data-screen="ADM-18"]').waitFor();
    await page.getByRole('button', { name: 'Consulter le Paiement pay-salary-e2e' }).click();
    const detail = page.locator('[data-payment-detail="pay-salary-e2e"]');
    await detail.waitFor();
    await detail.getByText('Confirmation du Candidat (OTP)', { exact: false }).waitFor();
    assert.ok((await detail.innerText()).includes('Non exposée par le DTO Payment'), 'confirmation du Candidat inventée ou non déclarée');
    await detail.getByRole('button', { name: 'Préparer la vérification' }).click();
    const confirmVerification = detail.getByRole('button', { name: 'Confirmer la vérification' });
    await confirmVerification.click();
    await detail.locator('[data-command-error="true"]').waitFor();
    assert.equal(approveIdempotencyKeys.length, 1, 'première commande verify attendue');
    assert.ok(approveIdempotencyKeys[0], 'clé d’idempotence absente');
    assert.ok(!(await detail.innerText()).includes(SERVER_SECRET), 'message serveur brut rendu dans l’erreur');
    await confirmVerification.click();
    await detail.getByRole('status').filter({ hasText: 'Réponse serveur' }).waitFor();
    assert.equal(approveIdempotencyKeys.length, 2, 'commande rejouée avec réponse fixture attendue');
    assert.equal(approveIdempotencyKeys[0], approveIdempotencyKeys[1], 'le rejeu de la même commande doit réutiliser la même clé d’idempotence');
    const verifiedText = await detail.innerText();
    assert.ok(says(verifiedText, 'Vérifié — non payé') && says(verifiedText, 'VERIFIED'), `la déclaration vérifiée n’est pas distincte du statut du cycle : ${verifiedText}`);
    assert.ok(says(verifiedText, 'Statut PAID du cycle') && says(verifiedText, 'Non'), 'l’état PAID ne reste pas séparé de VERIFIED');
    assert.ok(says(verifiedText, 'Préparer le passage à PAID'), 'transition serveur vers PAID non proposée depuis VERIFIED');
    assert.equal(confirmRequests.length, 0, 'aucune transition PAID ne doit être déclenchée par le test de vérification');
    assert.equal(paymentDetailCalls, 1, 'lecture unitaire réelle attendue');
    await assertNoForbiddenText('/admin/paiements (consultation)', verifiedText);
  });

  await check('ADM-18 — single-flight clavier/souris : double clic pendant une commande = une seule requête', async () => {
    sessionMode = 'admin';
    resetPaymentFixtures();
    approveDelayMs = 450;
    await page.goto(api.origin + '/admin/paiements');
    await page.locator('[data-screen="ADM-18"]').waitFor();
    await page.getByRole('button', { name: 'Consulter le Paiement pay-salary-e2e' }).click();
    const detail = page.locator('[data-payment-detail="pay-salary-e2e"]');
    await detail.waitFor();
    await detail.getByRole('button', { name: 'Préparer la vérification' }).click();
    await detail.getByRole('button', { name: 'Confirmer la vérification' }).dblclick();
    await detail.getByRole('status').filter({ hasText: 'Réponse serveur' }).waitFor();
    assert.equal(approveIdempotencyKeys.length, 1, 'un double clic a produit plusieurs requêtes');
    assert.ok(approveIdempotencyKeys[0], 'commande UI sans Idempotency-Key');
    assert.equal(confirmRequests.length, 0, 'la vérification ne doit pas appeler la transition PAID');
  });

  await check('ADM-18 — autorisation, chargement, erreur, vide et frontière de contrôle not-configured', async () => {
    sessionMode = 'admin';
    resetPaymentFixtures();
    paymentReadPermission = false;
    await page.goto(api.origin + '/admin/paiements');
    await page.locator('[data-state="403"]').waitFor();
    assert.equal(paymentListCalls, 1, 'lecture ADMIN doit atteindre la permission serveur réelle');
    await assertNoForbiddenText('paiements 403 permission', await page.locator('[data-state="403"]').innerText());

    paymentReadPermission = true;
    paymentListMode = 'error';
    await page.goto(api.origin + '/admin/paiements');
    await page.locator('[data-state="500"]').waitFor();
    assert.ok(!(await page.locator('[data-state="500"]').innerText()).includes(SERVER_SECRET), 'erreur de liste révèle le message brut');

    paymentListMode = 'empty';
    await page.goto(api.origin + '/admin/paiements');
    await page.getByText('Aucun Paiement n’est renvoyé par le registre ADMIN réel.').waitFor();

    paymentListMode = 'not-configured';
    await page.goto(api.origin + '/admin/paiements');
    await page.getByText('not-configured', { exact: false }).waitFor();
    assert.ok(!(await screenText()).includes('Aucun Paiement n’est renvoyé'), 'frontière de contrôle présentée comme un registre métier vide');

    paymentListMode = 'ready';
    paymentListDelayMs = 1500;
    await page.goto(api.origin + '/admin/paiements');
    await page.locator('[data-screen="ADM-18"] [data-loading="true"]').waitFor();
    await page.locator('[data-screen="ADM-18"] table').waitFor();
    paymentListDelayMs = 0;
  });

  await check('ADM-21 — permissions d’action, déclarations réelles et distinction Salaire/frais/déclaration/vérification', async () => {
    sessionMode = 'admin';
    resetPaymentFixtures();
    paymentActionPermissions = 'read-only';
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(api.origin + '/admin/paiements/declarations-externes');
    await page.locator('[data-screen="ADM-21"]').waitFor();
    await page.getByText('decl-salary-current-e2e', { exact: false }).waitFor();
    const text = await screenText();
    assert.ok(says(text, 'REJECTED') && says(text, 'PENDING') && says(text, 'VERIFIED'), 'états réels des tentatives absents');
    assert.ok(says(text, 'Déclaration externe ≠ vérification ≠ paiement'), 'distinctions de cycle non rappelées');
    assert.ok(says(text, 'Salaire · SALARY') && says(text, 'Frais dus à LE LABEUR · PLATFORM_FEE'), 'types réels ou séparation métier absents');
    assert.ok(text.includes('120000 XOF') && text.includes('30000 XOF'), 'montants unitaires de la réponse serveur absents');
    assert.ok(!text.includes('150000'), 'total monétaire recalculé rendu');
    assert.ok(says(text, 'payments:approve absente') || says(text, 'permission'), 'absence de permission non dite');
    assert.equal(await page.getByRole('button', { name: 'Préparer la vérification' }).count(), 0, 'action visible sans payments:approve');
    assert.equal(approveIdempotencyKeys.length, 0, 'aucune mutation ne doit être déclenchée sans permission');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'débordement horizontal ADM-21 à 1440 px');
    await page.setViewportSize({ width: 360, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 5000 }).catch(() => undefined);
    const mobileLayout = await page.evaluate(() => ({
      viewport: innerWidth,
      scroll: document.documentElement.scrollWidth,
      overflow: Array.from(document.querySelectorAll('*')).map((element) => {
        const bounds = element.getBoundingClientRect();
        return { tag: element.tagName, className: (element as HTMLElement).className, text: (element.textContent ?? '').trim().slice(0, 100), left: bounds.left, right: bounds.right, width: bounds.width };
      }).filter((element) => element.left < -1 || element.right > innerWidth + 1).slice(0, 30),
    }));
    if (mobileLayout.scroll > mobileLayout.viewport) console.error('DEBUG ADM-21 mobile overflow', JSON.stringify(mobileLayout, null, 2));
    assert.ok(mobileLayout.scroll <= mobileLayout.viewport, 'débordement horizontal ADM-21 à 360 px');
    await assertNoForbiddenText('/admin/paiements/declarations-externes', text);
  });

  await check('ADM-19 — lot connu, verdicts/comparaisons réels, retry idempotent, décision de revue et tentative non appliquée', async () => {
    sessionMode = 'admin';
    resetPaymentFixtures();
    batchRetryFailureCount = 1;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(api.origin + '/admin/paiements/reconciliation');
    await page.locator('[data-screen="ADM-19"]').waitFor();
    await page.getByLabel('Identifiant du lot de rapprochement').fill('batch-e2e-1');
    await page.getByRole('button', { name: 'Consulter le lot' }).click();
    await page.getByRole('heading', { name: 'Lot batch-e2e-1', exact: true }).waitFor();
    let text = await screenText();
    assert.ok(says(text, 'MATCH') && says(text, 'MISMATCH') && says(text, 'REVIEW_REQUIRED') && says(text, 'RETRYABLE'), 'verdicts et états réels du lot absents');
    assert.ok(says(text, 'Comparaisons renvoyées par le serveur'), 'comparaisons serveur non disponibles à l’inspection');
    assert.ok(says(text, 'Un lot déjà identifié') || says(text, 'lot'), 'état d’accès au lot non clair');
    await page.getByRole('button', { name: 'Reprendre les éléments échoués ou réessayables' }).click();
    await page.locator('[data-command-error="true"]').waitFor();
    const retryButton = page.getByRole('button', { name: 'Reprendre les éléments échoués ou réessayables' });
    await retryButton.click();
    await page.getByRole('status').filter({ hasText: 'rejouée' }).waitFor();
    assert.equal(batchRetryIdempotencyKeys.length, 2, 'reprise test attendue deux fois');
    assert.ok(batchRetryIdempotencyKeys[0], 'clé d’idempotence retry absente');
    assert.equal(batchRetryIdempotencyKeys[0], batchRetryIdempotencyKeys[1], 'même reprise doit garder la même clé au rejeu');

    const correctionDetails = page.locator('[data-screen="ADM-19"] details').filter({ hasText: 'Consigner une tentative de correction' }).first();
    await correctionDetails.locator('summary').click();
    const correctionForm = correctionDetails.locator('form');
    await correctionForm.locator('textarea').first().fill('{"reference":"proposition-e2e"}');
    await correctionForm.getByRole('button', { name: 'Enregistrer la tentative' }).click();
    await page.locator('[data-screen="ADM-19"] [role="status"]').filter({ hasText: 'non appliquée' }).waitFor();
    assert.equal(correctionAttemptRequests.length, 1, 'tentative de correction append-only absente');
    assert.deepEqual(correctionAttemptRequests[0].body.proposedChanges, { reference: 'proposition-e2e' });
    assert.ok(correctionAttemptRequests[0].key, 'clé d’idempotence de correction absente');

    const decisionDetails = page.locator('[data-screen="ADM-19"] details').filter({ hasText: 'Consigner une décision de revue' }).first();
    await decisionDetails.locator('summary').click();
    await decisionDetails.getByLabel('Décision réelle acceptée par le serveur').selectOption('CONFIRMED');
    await decisionDetails.getByLabel('Référence de preuve (facultative)').fill('preuve-revue-e2e');
    await decisionDetails.getByRole('button', { name: 'Consigner la décision' }).click();
    await page.locator('[data-screen="ADM-19"] [role="status"]').filter({ hasText: 'statut du Paiement n’est pas modifié' }).waitFor();
    assert.equal(reviewDecisionRequests.length, 1, 'décision de revue réelle non envoyée à la route mockée');
    assert.equal(reviewDecisionRequests[0].body.decision, 'CONFIRMED');
    assert.ok(reviewDecisionRequests[0].key, 'clé d’idempotence de revue absente');
    assert.equal(confirmRequests.length, 0, 'le rapprochement ou la revue ne doit pas déclencher une transition PAID');
    text = await screenText();
    assert.ok(says(text, 'le statut du Paiement n’est pas modifié') && says(text, 'non appliquée au Paiement'), 'distinction revue/correction vs paiement non déclarée');
    await assertNoForbiddenText('/admin/paiements/reconciliation', text);
    await page.setViewportSize({ width: 360, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 5000 }).catch(() => undefined);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'débordement horizontal ADM-19 à 360 px');
  });

  await check('ADM-20/22 — gaps honnêtes : aucune anomalie ou incident financier simulé, aucun formulaire sans handler', async () => {
    sessionMode = 'admin';
    resetPaymentFixtures();
    await page.goto(api.origin + '/admin/paiements/anomalies');
    await page.locator('[data-screen="ADM-20"]').waitFor();
    const anomalyText = await screenText();
    assert.ok(says(anomalyText, 'BACKEND_GAP'), 'gap de détection absent');
    assert.ok(says(anomalyText, 'Aucune anomalie'), 'file d’anomalies simulée ou état vide ambigu');
    assert.equal(await page.locator('[data-screen="ADM-20"] form').count(), 0, 'aucune mutation ne peut être proposée sans handler');
    await page.goto(api.origin + '/admin/paiements/incidents/pay-salary-e2e');
    await page.locator('[data-screen="ADM-22"]').waitFor();
    const incidentText = await screenText();
    assert.ok(says(incidentText, 'pay-salary-e2e'), 'référence technique d’incident non conservée');
    assert.ok(says(incidentText, 'BACKEND_GAP') && says(incidentText, 'Aucun détail financier'), 'absence de handler d’incident non dite');
    assert.equal(await page.locator('[data-screen="ADM-22"] form').count(), 0, 'aucun formulaire sur la fiche d’incident absente');
    await assertNoForbiddenText('/admin/paiements/anomalies et incidents', `${anomalyText} ${incidentText}`);
  });

  await check('ADM-23/24 — confirmations de Salaire : paiements SALARY réels, confirmation jamais déduite, preuve sans formulaire ni secret', async () => {
    sessionMode = 'admin';
    resetPaymentFixtures();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(api.origin + '/admin/salaire/confirmations');
    await page.locator('[data-screen="ADM-23"]').waitFor();
    await page.getByText('pay-salary-e2e', { exact: true }).first().waitFor();
    const detailCallsBefore = paymentDetailCalls;
    let text = await screenText();
    assert.ok(says(text, 'Confirmations de Salaire'), 'titre de la fiche absent');
    assert.ok(text.includes('120000 XOF'), 'montant unitaire serveur absent');
    assert.ok(!text.includes('30000 XOF'), 'les frais LE LABEUR ne font pas partie de la file Salaire');
    assert.ok(!text.includes('pay-fee-e2e'), 'un Paiement hors nature Salaire ne doit pas figurer dans la file');
    assert.ok(!text.includes('150000'), 'total monétaire recalculé rendu');
    assert.ok(says(text, 'Non exposée'), 'confirmation du Candidat non dite');
    assert.ok(says(text, 'BACKEND_GAP'), 'gaps ADM-23 non rendus');
    assert.ok(text.includes('—'), 'repère d’absence « — » absent');
    assert.ok(says(text, 'ne vaut jamais vérification') && says(text, 'VERIFIED ne vaut pas PAID'), 'distinctions déclaration/vérification/PAID absentes');
    assert.ok(says(text, 'n’est jamais assimilée à un paiement non effectué'), 'règle d’absence de confirmation non affichée');
    assert.equal(await page.locator('[data-screen="ADM-23"] form').count(), 0, 'aucune commande ne peut être proposée sans handler');
    assert.equal(await page.locator('[data-screen="ADM-23"] table thead th[scope="col"]').count(), 10, 'en-têtes de colonnes non sémantiques');
    await assertNoForbiddenText('/admin/salaire/confirmations', text);

    // Consultation unitaire réelle (payments.read) : mêmes états, aucune confirmation inventée.
    await page.getByRole('button', { name: 'Consulter le Paiement pay-salary-e2e' }).click();
    const detail = page.locator('[data-payment-detail="pay-salary-e2e"]');
    await detail.waitFor();
    const detailText = await detail.innerText();
    assert.ok(detailText.includes('Non exposée par le DTO Payment'), 'confirmation du Candidat inventée ou non déclarée');
    assert.ok(says(detailText, 'Statut PAID du cycle'), 'état PAID non présenté comme distinct');
    assert.equal(paymentDetailCalls, detailCallsBefore + 1, 'lecture unitaire payments.read attendue une fois');
    await assertNoForbiddenText('/admin/salaire/confirmations (consultation)', detailText);

    // Responsive 1440 px puis 360 px.
    await page.locator('[data-screen="ADM-23"]').waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'débordement horizontal ADM-23 à 1440 px');
    await page.setViewportSize({ width: 360, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 5000 }).catch(() => undefined);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'débordement horizontal ADM-23 à 360 px');

    // ADM-24 : dossier de preuve absent — aucune saisie, aucun secret, aucun geste.
    await page.goto(api.origin + '/admin/salaire/preuves/pay-salary-e2e');
    await page.locator('[data-screen="ADM-24"]').waitFor();
    const proofText = await screenText();
    assert.ok(says(proofText, 'pay-salary-e2e'), 'référence technique de chemin non conservée');
    assert.ok(says(proofText, 'BACKEND_GAP'), 'gap ADM-24 absent');
    assert.ok(says(proofText, 'Aucun code'), 'interdiction d’afficher un secret OTP non dite');
    assert.ok(proofText.includes('—'), 'repères d’absence « — » absents');
    assert.equal(await page.locator('[data-screen="ADM-24"] form').count(), 0, 'aucun formulaire sur une fiche sans handler');
    assert.equal(await page.locator('[data-screen="ADM-24"] input, [data-screen="ADM-24"] textarea, [data-screen="ADM-24"] select').count(), 0, 'aucune saisie sur une capacité absente');
    await assertNoForbiddenText('/admin/salaire/preuves', proofText);
    await page.setViewportSize({ width: 360, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 5000 }).catch(() => undefined);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'débordement horizontal ADM-24 à 360 px');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 5000 }).catch(() => undefined);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'débordement horizontal ADM-24 à 1440 px');
  });

  await check('ADM-26/27/28 — file et dossier Claim réels, revue/demande de justificatif idempotentes, références opaques masquées', async () => {
    sessionMode = 'admin';
    resetClaimFixtures();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(api.origin + '/admin/litiges');
    await page.locator('[data-screen="ADM-26"]').waitFor();
    await page.getByText('clm-e2e-1', { exact: true }).first().waitFor();
    let text = await screenText();
    assert.ok(says(text, '3 Claim(s) renvoyé(s)'), 'compte local des Claims chargés absent');
    assert.ok(says(text, 'ADMIN_REVIEW') && says(text, 'OPEN') && says(text, 'RESOLVED'), 'statuts réellement renvoyés absents');
    assert.ok(says(text, 'uniquement les Claims effectivement reçus'), 'portée de page/cursor non déclarée');
    assert.equal(claimListCalls, 1, 'une page réelle doit alimenter le registre');
    await page.getByLabel('Rechercher un Claim dans les pages chargées').fill('clm-e2e-1');
    assert.equal(await page.locator('[data-screen="ADM-26"] tbody tr').count(), 1, 'recherche locale limitée aux pages reçues');
    await assertNoForbiddenText('/admin/litiges', text);

    await page.goto(api.origin + '/admin/litiges/clm-e2e-1');
    await page.locator('[data-screen="ADM-27"]').waitFor();
    await page.getByText('Retard de reprise signalé', { exact: true }).waitFor();
    text = await screenText();
    assert.ok(text.includes('usr-can-e2e') && text.includes('usr-emp-e2e'), 'identifiants de compte réels absents');
    assert.ok(says(text, 'Référence Claim') && says(text, 'Motif transmis'), 'dossier Claim réel incomplet');
    for (const marker of [
      'private-claim-evidence-reference-e2e',
      'private-salary-confirmation-e2e',
      'private-claim-metadata-e2e',
      'private-claim-idempotency-key-e2e',
      'private-request-evidence-reference-e2e',
      'private-restriction-reason-e2e',
      'CONTRACT_TERMINATE',
    ]) assert.ok(!text.includes(marker), `champ opaque/hors scope rendu : ${marker}`);
    assert.equal(await page.getByRole('button', { name: /Appliquer la restriction|Libérer la restriction/i }).count(), 0, 'aucun contrôle de restriction ne doit exister');
    assert.equal(await page.locator('[data-screen="ADM-27"] table thead th[scope="col"]').count(), 6, 'table des demandes non sémantique');
    await page.getByLabel('Note facultative de mise en revue ADMIN').fill('Note de revue E2E');
    await page.getByRole('button', { name: 'Transmettre à la revue ADMIN' }).click();
    await page.locator('[data-screen="ADM-27"] dd').filter({ hasText: 'ADMIN_REVIEW' }).waitFor();
    assert.equal(claimCommandRequests.length, 1, 'commande de revue absente');
    assert.equal(claimCommandRequests[0].command, 'review');
    assert.equal(claimCommandRequests[0].claimId, 'clm-e2e-1');
    assert.deepEqual(claimCommandRequests[0].body, { note: 'Note de revue E2E' });
    assert.ok(claimCommandRequests[0].key, 'clé d’idempotence de revue absente');

    await page.goto(api.origin + '/admin/litiges/clm-e2e-1/pieces');
    await page.locator('[data-screen="ADM-28"]').waitFor();
    await page.getByLabel('Type de justificatif demandé').selectOption('SUPPORTING_EVIDENCE');
    await page.getByLabel('Compte destinataire de la demande').selectOption('usr-can-e2e');
    text = await screenText();
    assert.ok(says(text, 'Non fournie par le serveur'), 'échéance absente doit rester absente');
    for (const marker of ['private-claim-evidence-reference-e2e', 'private-request-evidence-reference-e2e', 'private-restriction-reason-e2e']) {
      assert.ok(!text.includes(marker), `référence/valeur sensible rendue dans ADM-28 : ${marker}`);
    }
    await page.getByRole('button', { name: 'Envoyer la demande au serveur' }).click();
    await page.locator('[data-screen="ADM-28"] dd').filter({ hasText: 'EVIDENCE_REQUESTED' }).waitFor();
    assert.equal(claimCommandRequests.length, 2, 'commande de demande de justificatif absente');
    assert.equal(claimCommandRequests[1].command, 'evidence-requests');
    assert.deepEqual(claimCommandRequests[1].body, { requestedType: 'SUPPORTING_EVIDENCE', requestedFrom: 'usr-can-e2e' });
    assert.ok(claimCommandRequests[1].key, 'clé d’idempotence de demande absente');
    assert.ok(!('dueAt' in claimCommandRequests[1].body), 'l’interface ne doit pas calculer d’échéance');
    text = await screenText();
    assert.ok(says(text, 'EVIDENCE_REQUESTED') && says(text, 'Demander un justificatif'), 'état de commande réel absent');
    await assertNoForbiddenText('/admin/litiges/clm-e2e-1', text);
    await page.setViewportSize({ width: 360, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 5000 }).catch(() => undefined);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'débordement horizontal ADM-28 à 360 px');
  });

  await check('ADM-29/30 — décision limitée à RESOLVE/REJECT et projection des seuls Claims terminés', async () => {
    sessionMode = 'admin';
    resetClaimFixtures();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(api.origin + '/admin/litiges/clm-decision-e2e/decision');
    await page.locator('[data-screen="ADM-29"]').waitFor();
    await page.getByLabel('Résolution motivée du Claim').fill('Résolution E2E consignée par le serveur');
    const decision = page.getByLabel('Décision ADMIN du Claim');
    const decisionValues = await decision.locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
    assert.deepEqual(decisionValues, ['RESOLVE', 'REJECT'], 'aucune décision REPLACE ou autre option ne doit être proposée');
    await page.getByLabel('Je confirme l’envoi d’une décision terminale au serveur ; celui-ci revalide l’état courant et l’idempotence.').check();
    await page.getByRole('button', { name: 'Envoyer la décision ADMIN' }).click();
    await page.locator('[data-screen="ADM-29"] dd').filter({ hasText: 'RESOLVED' }).waitFor();
    assert.equal(claimCommandRequests.length, 1, 'commande de décision absente');
    assert.equal(claimCommandRequests[0].command, 'decision');
    assert.equal(claimCommandRequests[0].claimId, 'clm-decision-e2e');
    assert.deepEqual(claimCommandRequests[0].body, { decision: 'RESOLVE', resolution: 'Résolution E2E consignée par le serveur' });
    assert.ok(claimCommandRequests[0].key, 'clé d’idempotence de décision absente');
    assert.equal(await page.locator('[data-screen="ADM-29"] form').count(), 0, 'aucune seconde décision après terminalité');
    let text = await screenText();
    assert.ok(says(text, 'statut serveur est terminal') || says(text, 'résolution motivée'), 'état terminal après réponse serveur non présenté');
    await assertNoForbiddenText('/admin/litiges/clm-decision-e2e/decision', text);

    await page.goto(api.origin + '/admin/litiges/decisions');
    await page.locator('[data-screen="ADM-30"]').waitFor();
    await page.getByText('clm-decision-e2e', { exact: true }).waitFor();
    text = await screenText();
    assert.ok(says(text, 'clm-terminal-e2e') && says(text, 'clm-decision-e2e'), 'Claims terminés renvoyés par la page réelle absents');
    assert.ok(!text.includes('clm-e2e-1'), 'Claim non terminal ne doit pas apparaître dans la projection ADM-30');
    assert.ok(says(text, 'ceci n’est pas un journal d’événements exhaustif'), 'portée limitée de l’historique non dite');
    assert.ok(says(text, 'RESOLVED'), 'statut terminal réel absent');
    await assertNoForbiddenText('/admin/litiges/decisions', text);
    await page.setViewportSize({ width: 360, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 5000 }).catch(() => undefined);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'débordement horizontal ADM-30 à 360 px');
  });

  await check('ADM Claims — les actions restent conditionnées aux permissions ADMIN réelles', async () => {
    sessionMode = 'admin';
    resetClaimFixtures();
    claimActionPermissions = 'read-only';
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(api.origin + '/admin/litiges/clm-decision-e2e');
    await page.reload();
    await page.locator('[data-screen="ADM-27"]').waitFor();
    assert.ok(await page.getByText(/incidents:arbitrate est absente/).count() > 0, 'absence de permission de mutation non dite');
    assert.equal(await page.locator('[data-screen="ADM-27"] form').count(), 0, 'formulaire rendu sans incidents:arbitrate');
    assert.equal(claimCommandRequests.length, 0, 'aucune commande sans incidents:arbitrate');

    resetClaimFixtures();
    sessionMode = 'employer';
    await page.goto(api.origin + '/admin/litiges');
    await page.reload();
    await page.locator('[data-state="403"]').waitFor();
    assert.equal(claimListCalls, 0, 'un compte Employeur ne doit jamais appeler la route ADMIN Claim');
    assert.equal(claimDetailCalls, 0, 'un compte Employeur ne doit jamais appeler la lecture ADMIN Claim');
    await assertNoForbiddenText('/admin/litiges refusé', await page.locator('[data-state="403"]').innerText());
    sessionMode = 'admin';
  });

  await check('ADM — refus non-ADMIN sur la route Paiement : aucune lecture ADMIN ni accès partie contourné', async () => {
    resetPaymentFixtures();
    sessionMode = 'employer';
    await page.goto(api.origin + '/admin/paiements');
    await page.locator('[data-state="403"]').waitFor();
    assert.equal(paymentListCalls, 0, 'la page protégée ne doit pas appeler admin.payments.list après refus');
    assert.equal(paymentDetailCalls, 0, 'aucune lecture unitaire ne doit contourner la garde ADMIN');
    await assertNoForbiddenText('paiements refusés', await page.locator('[data-state="403"]').innerText());
    sessionMode = 'admin';
  });

  await check('ADM registre (ADM-13) — les valeurs affichées viennent de la réponse serveur, aucune donnée de démonstration', async () => {
    sessionMode = 'admin';
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(api.origin + '/admin/contrats');
    await page.locator('[data-screen="ADM-13"]').waitFor();
    await page.locator('text=ctr-e2e-1').first().waitFor();
    const text = await screenText();
    assert.ok(text.includes('ctr-e2e-1'), 'référence réelle absente du registre');
    assert.ok(says(text, 'A. Gbian') && says(text, 'R. Sika'), 'parties réelles absentes');
    assert.ok(/120[\s\u00a0\u202f]?000/.test(text), 'salaire mensuel réel absent');
    assert.ok(says(text, 'Actif'), 'statut réel absent');
    assert.ok(!says(text, 'Source de données non configurée'), 'la mention « source absente » ne doit plus apparaître avec une source réelle');
    await assertNoForbiddenText('/admin/contrats', text);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'débordement horizontal 1440');
    await page.setViewportSize({ width: 360, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 5000 }).catch(() => undefined);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'débordement horizontal 360');
  });

  await check('ADM registre — segment clavier : le filtre local sélectionne sur la donnée réelle (aria-pressed)', async () => {
    await page.goto(api.origin + '/admin/contrats');
    await page.locator('[data-screen="ADM-13"]').waitFor();
    const chip = page.locator('button:has-text("En incident")').first();
    await chip.focus();
    await chip.press('Enter');
    assert.equal(await chip.getAttribute('aria-pressed'), 'true', 'segment non activé au clavier');
    const text = await screenText();
    assert.ok(says(text, 'Aucun contrat sur les filtres'), 'le filtre doit vider honnêtement la table (aucun contrat INCIDENT dans la page)');
    assert.equal(await page.locator('td:has-text("ctr-e2e-1")').count(), 0, 'le contrat ACTIF ne doit pas rester sous le segment incident');
  });

  await check('ADM fiche (ADM-14) — parties, conditions, signatures, frise et jalons composés depuis la page réelle', async () => {
    await page.goto(api.origin + '/admin/contrats/ctr-e2e-1');
    await page.locator('[data-screen="ADM-14"]').waitFor();
    await page.locator('[data-screen="ADM-14"]').getByText('ctr-e2e-1', { exact: false }).first().waitFor();
    const text = await screenText();
    assert.ok(text.includes('ctr-e2e-1'), 'référence absente');
    assert.ok(says(text, 'Période d’essai de 15 jours'), 'condition réelle absente');
    assert.ok(says(text, 'Signé'), 'état de signature réel absent');
    assert.ok(says(text, 'Contrat préparé en brouillon'), 'frise d’historique réelle absente');
    assert.ok(says(text, '2026-09'), 'jalon d’exécution réel absent');
    await assertNoForbiddenText('/admin/contrats/ctr-e2e-1', text);
  });

  await check('ADM incidents (ADM-15) — le Claim rattaché vient de la réponse serveur ; score et actions préventives déclarés indisponibles', async () => {
    await page.goto(api.origin + '/admin/contrats/ctr-e2e-1/incidents');
    await page.locator('[data-screen="ADM-15"]').waitFor();
    await page.locator('[data-screen="ADM-15"]').getByText('clm-e2e-1', { exact: false }).waitFor();
    const text = await screenText();
    assert.ok(text.includes('clm-e2e-1'), 'Claim rattaché absent');
    assert.ok(says(text, 'Incident de contrat'), 'type de Claim réel absent');
    assert.ok(says(text, 'Ouvert'), 'statut de Claim réel absent');
    assert.ok(says(text, 'Aucun endpoint de score'), 'capacité absente non déclarée');
    await assertNoForbiddenText('/admin/contrats/ctr-e2e-1/incidents', text);
  });

  await check('ADM journal (ADM-17) — l’historique émis est rendu ; vérification et export déclarés indisponibles', async () => {
    await page.goto(api.origin + '/admin/contrats/ctr-e2e-1/journal');
    await page.locator('[data-screen="ADM-17"]').waitFor();
    await page.locator('[data-screen="ADM-17"]').getByText('CONTRACT_CREATED', { exact: false }).waitFor();
    const text = await screenText();
    assert.ok(says(text, 'CONTRACT_CREATED'), 'événement réel absent du journal');
    assert.ok(text.includes('A. Gbian'), 'acteur réel absent du journal');
    assert.ok(says(text, 'aucun export'), 'capacité absente non déclarée');
    await assertNoForbiddenText('/admin/contrats/ctr-e2e-1/journal', text);
  });

  await check('ADM révision forcée (ADM-16) — capacité absente, AUCUN formulaire rendu, aucune commande simulée', async () => {
    await page.goto(api.origin + '/admin/contrats/ctr-e2e-1/revision-forcee');
    await page.locator('[data-screen="ADM-16"]').waitFor();
    await page.locator('[data-screen="ADM-16"]').getByRole('heading', { name: 'Révision forcée — indisponible', exact: true }).waitFor();
    const text = await screenText();
    assert.ok(says(text, 'indisponible'), 'capacité absente non dite');
    assert.equal(await page.locator('[data-screen="ADM-16"] form').count(), 0, 'aucun formulaire possible : aucune route serveur');
    assert.equal(await page.locator('[data-screen="ADM-16"] textarea, [data-screen="ADM-16"] select').count(), 0, 'aucune saisie sur une capacité absente');
    assert.ok(says(text, 'flux métier'), 'règle de tracabilité non rappelée');
    await assertNoForbiddenText('/admin/contrats/ctr-e2e-1/revision-forcee', text);
  });

  await check('ADM fiche — référence hors page chargée : état honnête, rien de rechargé à part', async () => {
    await page.goto(api.origin + '/admin/contrats/ctr-inexistant');
    await page.locator('[data-screen="ADM-14"]').waitFor();
    await page.locator('[data-screen="ADM-14"]').getByText('n’est pas dans la page réellement chargée', { exact: false }).waitFor();
    const text = await screenText();
    assert.ok(says(text, 'n’est pas dans la page réellement chargée'), 'état introuvable non dit');
    assert.ok(says(text, 'BACKEND_GAP'), 'capacité absente non déclarée');
  });

  await check('ADM refus — non-ADMIN 403, session absente 401, erreur serveur 500 avec seule la corrélation du serveur', async () => {
    sessionMode = 'employer';
    await page.goto(api.origin + '/admin/contrats');
    await page.locator('[data-state="403"]').waitFor();
    assert.equal(await page.locator('[data-unit]').count(), 0, 'aucun écran ADMIN sur un refus');
    sessionMode = 'anonymous';
    await page.goto(api.origin + '/admin/contrats/ctr-e2e-1');
    await page.locator('[data-state="401"]').waitFor();
    await assertNoForbiddenText('401', await page.locator('[data-state="401"]').innerText());
    sessionMode = 'error';
    await page.goto(api.origin + '/admin/contrats');
    await page.locator('[data-state="500"]').waitFor();
    const errorText = await page.locator('[data-state="500"]').innerText();
    assert.ok(errorText.includes(SERVER_REQUEST_ID), 'corrélation serveur non affichée');
    assert.ok(!errorText.includes(SERVER_SECRET), 'message brut rendu');
  });

  await check('ADM accessibilité & reduced-motion — table sémantique, légende SR, transitions neutralisées en mouvement réduit', async () => {
    sessionMode = 'admin';
    await page.goto(api.origin + '/admin/contrats');
    await page.locator('[data-screen="ADM-13"]').waitFor();
    await page.locator('[data-screen="ADM-13"] table caption.sr-only, [data-screen="ADM-13"] table caption').waitFor();
    assert.equal(await page.locator('[data-screen="ADM-13"] table caption.sr-only, [data-screen="ADM-13"] table caption').count(), 1, 'table sans caption');
    assert.ok(await page.locator('[data-screen="ADM-13"] table thead th').first().getAttribute('scope') === 'col', 'en-tête sans scope');
    const inputs = await page.locator('[data-screen="ADM-13"] input[type="search"]').count();
    assert.ok(inputs === 1, 'recherche sans champ accessible unique');
    assert.ok(await page.locator('[data-screen="ADM-13"] input[type="search"]').getAttribute('aria-label'), 'champ de recherche sans libellé accessible');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const duration = await page.evaluate(() => {
      const chip = document.querySelector('.lbm-admin__chip') as HTMLElement | null;
      return chip ? getComputedStyle(chip).transitionDuration : '0s';
    });
    const seconds = duration.split(',').map((value) => {
      const numeric = parseFloat(value) || 0;
      return value.includes('ms') ? numeric / 1000 : numeric;
    });
    assert.ok(Math.max(...seconds) <= 0.001, `transition non neutralisée en mouvement réduit : ${duration}`);
    await page.emulateMedia({ reducedMotion: null });
  });

  await check('ADM non-régression P4A — tableau de bord et utilisateurs toujours rendus (données réelles de la fixture)', async () => {
    sessionMode = 'admin';
    await page.goto(api.origin + '/admin');
    await page.locator('[data-screen="ADM-01"]').waitFor();
    await page.goto(api.origin + '/admin/utilisateurs');
    await page.locator('[data-screen="ADM-02"]').waitFor();
    // Le registre ADMIN des utilisateurs n'est pas servi par la fixture : l'écran
    // doit rester honnête (état d'erreur ou vide), jamais de données inventées.
    const text = await screenText();
    assert.ok(says(text, 'Utilisateurs'), 'fiche ADM-02 non rendue');
    await assertNoForbiddenText('/admin/utilisateurs (non-régression)', text);
    assert.ok(await page.locator('[data-backend-gap="true"]').first().isVisible(), 'BACKEND_GAP de la fiche utilisateur perdu');
  });

  assert.deepEqual(errors, [], `erreurs de page : ${errors.join(' · ')}`);
  console.log(`Total: ${passed}/${passed} vérifications navigateur PASS (fixtures HTTP locales ; aucune donnée de démonstration dans l’application).`);
} finally {
  await browser?.close();
  await demoServer?.close();
  await apiServer?.close();
}
