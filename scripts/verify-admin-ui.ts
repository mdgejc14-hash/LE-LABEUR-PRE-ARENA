/**
 * P4G-4-DESIGN-ADMIN-INFRASTRUCTURE — vérification UI réelle (Chromium) de
 * l'espace supervision livré (P4A + P4B-1 contrats + P4B-2 paiements + P4C
 * salaire + P4D Claims + P4E-1 Remplacements + P4E-2 Réputation + P4F
 * Documents + P4F-2 Notifications + P4G-1 opérations + P4G-2 supervision +
 * P4G-3 sécurité + P4G-4 topologie/Worker edge).
 *
 * Comme le script P2, ce script n'affirme rien sur des données simulées dans
 * l'application : les fixtures HTTP vivent ICI et ne sont jamais activées dans
 * le produit. Ce qui est vérifié dans un navigateur réel :
 *
 *  1. AUCUNE source de données configurée : les 52 fiches ADM rendent leur
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
 * 10. P4E-1 : Remplacements issus des routes ADMIN réelles en lecture seule
 *     (admin.replacements.list/read), filtre/recherche locaux au clavier,
 *     pagination curseur single-flight, dossier composé bloc par bloc
 *     (Claim, Contrats source/successeur, Proposition, Paiements par Contrat),
 *     Proposition envoyée ≠ acceptée, Contrat successeur DRAFT ≠ actif, aucun
 *     transfert de Paiement, permissions par bloc, 403/404/500/not-configured,
 *     arbitrage sans formulaire, aucune commande envoyée, 360/1440 px.
 * 11. P4E-2 : ledger réel admin.reputation.entries (audit:read), impact stocké
 *     sans score 0-100, correction REVERSE/RESTORE idempotente
 *     (incidents:arbitrate), réconciliation d'un sujet, ADM-35/36 BACKEND_GAP
 *     sans formulaire, 403/500/501, aucune vue self, 360/1440 px.
 * 11. P4F Documents : registre réel (lignes, pagination, filtre clavier), 501/vide/
 *     erreur/refus, contrôle d'intégrité technique (verdict serveur seul),
 *     révocation motivée (motif 3–1000, confirmation, Idempotency-Key),
 *     ADM-39/40 sans action ; aucun object_key rendu ; 360/1440 px.
 * 12. P4G-2 : routes ADM-47/48/49, aucune requête ops, mesures absentes en « — »,
 * aucune liste de DLQ/incidents assimilée à zéro, référence incident non vérifiée,
 * actions non implémentées désactivées, navigation, refus 401/403 et erreur 500.
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

/* ── P4E-1 · Remplacements (fixtures HTTP de vérification, jamais dans l'application) ── */
const FIXTURE_RPL_SOURCE_CONTRACT = {
  ...FIXTURE_CONTRACT,
  id: 'ctr-rpl-src',
  status: 'REPLACED',
  replacementId: 'rpl-e2e-2',
  replacedContractId: 'ctr-rpl-new',
  history: [
    { id: 'log-rpl-1', timestamp: '2026-09-10T08:00:00.000Z', event: 'CONTRACT_ACTIVATED', description: 'Contrat actif.', actor: 'Système' },
    { id: 'log-rpl-2', timestamp: '2026-09-20T09:00:00.000Z', event: 'CONTRACT_REPLACED', description: 'Contrat passé à REPLACED par la décision ADMIN du Claim clm-rpl-2.', actor: 'Superviseur' },
    { id: 'log-rpl-3', timestamp: '2026-09-28T09:00:00.000Z', event: 'REPLACEMENT_SUCCESSOR_LINKED', description: 'Contrat successeur ctr-rpl-new lié au Remplacement.', actor: 'A. Gbian' },
  ],
};
const FIXTURE_RPL_SELECTED_SOURCE_CONTRACT = {
  ...FIXTURE_CONTRACT,
  id: 'ctr-rpl-src1',
  status: 'REPLACED',
  replacementId: 'rpl-e2e-1',
  history: [
    { id: 'log-rpl-11', timestamp: '2026-09-10T08:00:00.000Z', event: 'CONTRACT_ACTIVATED', description: 'Contrat actif.', actor: 'Système' },
    { id: 'log-rpl-12', timestamp: '2026-09-20T09:00:00.000Z', event: 'CONTRACT_REPLACED', description: 'Contrat passé à REPLACED par la décision ADMIN du Claim clm-rpl-e2e.', actor: 'Superviseur' },
  ],
};
const FIXTURE_RPL_SUCCESSOR_CONTRACT = {
  ...FIXTURE_CONTRACT,
  id: 'ctr-rpl-new',
  status: 'DRAFT',
  employeeId: 'usr-can-rpl',
  employeeName: 'K. Houngbo',
  employerSigned: false,
  employeeSigned: false,
  replacementId: 'rpl-e2e-2',
  replacedContractId: 'ctr-rpl-src',
  history: [
    { id: 'log-rpl-4', timestamp: '2026-09-28T09:00:00.000Z', event: 'CONTRACT_CREATED', description: 'Contrat successeur préparé en brouillon depuis la Proposition acceptée prop-rpl-2.', actor: 'A. Gbian' },
  ],
};
const FIXTURE_RPL_BASE = {
  employerId: 'usr-emp-e2e',
  employerName: 'A. Gbian',
  openedAt: '2026-09-20T09:00:00.000Z',
  createdAt: '2026-09-20T09:00:00.000Z',
  updatedAt: '2026-09-25T09:00:00.000Z',
};
const FIXTURE_RPL_PENDING = { ...FIXTURE_RPL_BASE, id: 'rpl-e2e-0', incidentId: 'clm-rpl-0', claimId: 'clm-rpl-0', originalContractId: 'ctr-rpl-zero', status: 'PENDING_OFFER' };
const FIXTURE_RPL_SELECTED = {
  ...FIXTURE_RPL_BASE,
  id: 'rpl-e2e-1',
  incidentId: 'clm-rpl-e2e',
  claimId: 'clm-rpl-e2e',
  originalContractId: 'ctr-rpl-src1',
  urgentOfferId: 'off-rpl-1',
  urgentOfferTitle: 'Reprise entretien hebdomadaire',
  selectedCandidateId: 'usr-can-rpl',
  selectedCandidateName: 'K. Houngbo',
  selectedApplicationId: 'app-rpl-1',
  selectedProposalId: 'prop-rpl-1',
  status: 'CANDIDATE_SELECTED',
};
const FIXTURE_RPL_FINALIZED = {
  ...FIXTURE_RPL_SELECTED,
  id: 'rpl-e2e-2',
  incidentId: 'clm-rpl-2',
  claimId: 'clm-rpl-2',
  originalContractId: 'ctr-rpl-src',
  selectedProposalId: 'prop-rpl-2',
  newContractId: 'ctr-rpl-new',
  status: 'CONTRACT_FINALIZED',
};
const FIXTURE_RPL_NEXT_PAGE = { ...FIXTURE_RPL_BASE, id: 'rpl-e2e-3', incidentId: 'clm-rpl-3', claimId: 'clm-rpl-3', originalContractId: 'ctr-rpl-three', urgentOfferId: 'off-rpl-3', urgentOfferTitle: 'Reprise garde de nuit', status: 'SOURCING_CANDIDATES' };
const FIXTURE_RPL_PROPOSAL_BASE = {
  conversationId: 'conv-rpl', offerId: 'off-rpl-1', applicationId: 'app-rpl-1', employerId: 'usr-emp-e2e', employerName: 'A. Gbian',
  employeeId: 'usr-can-rpl', employeeName: 'K. Houngbo', missionTitle: 'Reprise entretien hebdomadaire', amount: 120000, currency: 'XOF',
  periodicity: 'MENSUELLE', startDate: '2026-10-01T00:00:00.000Z', durationMonths: 6, location: 'Abomey-Calavi', conditions: [],
  sentAt: '2026-09-24T10:00:00.000Z', updatedAt: '2026-09-24T10:00:00.000Z',
};
const FIXTURE_RPL_PROPOSALS = [
  { ...FIXTURE_RPL_PROPOSAL_BASE, id: 'prop-rpl-1', status: 'SENT' },
  { ...FIXTURE_RPL_PROPOSAL_BASE, id: 'prop-rpl-2', status: 'ACCEPTED', contractId: 'ctr-rpl-new' },
];
const FIXTURE_RPL_SOURCE_PAYMENT = {
  ...FIXTURE_SCHEDULED_PAYMENT,
  paymentId: 'pay-rpl-src1',
  contractId: 'ctr-rpl-src1',
  idempotencyKey: 'IDEMPOTENCY_MUST_NOT_RENDER',
};
const FIXTURE_RPL_FINALIZED_SOURCE_PAYMENT = {
  ...FIXTURE_SCHEDULED_PAYMENT,
  paymentId: 'pay-rpl-src2',
  contractId: 'ctr-rpl-src',
  idempotencyKey: 'IDEMPOTENCY_MUST_NOT_RENDER',
};
const FIXTURE_RPL_CLAIM = {
  ...FIXTURE_CLAIM,
  claimId: 'clm-rpl-e2e',
  contractId: 'ctr-rpl-src1',
  type: 'CONTRACT_INCIDENT',
  status: 'RESOLVED',
  replacementId: 'rpl-e2e-1',
  resolvedAt: '2026-09-20T09:00:00.000Z',
  evidenceRequests: [],
  restrictions: [],
};

/* ── P4E-2 · Réputation (fixtures HTTP de vérification, jamais dans l'application) ── */
const FIXTURE_REP_ACTIVE = {
  reputationId: 'rpt-e2e-1',
  subjectUserId: 'usr-can-e2e',
  sourceEvent: 'CONTRACT_COMPLETED',
  sourceEventId: 'hist-e2e-1',
  sourceEntityType: 'CONTRACT',
  sourceEntityId: 'ctr-e2e-1',
  ruleCode: 'CONTRACT_COMPLETED_PARTY',
  ruleVersion: 'P0-REPUTATION-1',
  category: 'MISSION_EXECUTION',
  direction: 'POSITIVE',
  impact: 3,
  explanation: 'Contrat mené jusqu’à sa fin (fait documenté, sans appréciation de qualité).',
  actorId: 'SYSTEM',
  provenance: 'EVENT',
  occurredAt: '2026-09-15T10:00:00.000Z',
  createdAt: '2026-09-15T10:05:00.000Z',
  status: 'ACTIVE',
  history: [] as Array<Record<string, string>>,
  ruleStillInCatalog: true,
};
const FIXTURE_REP_REVERSED = {
  reputationId: 'rpt-e2e-2',
  subjectUserId: 'usr-emp-e2e',
  sourceEvent: 'CLAIM_RESOLVED',
  sourceEventId: 'outbox-e2e-2',
  sourceEntityType: 'CLAIM',
  sourceEntityId: 'clm-e2e-1',
  ruleCode: 'ADMIN_DECISION_UNFAVORABLE_RESPONDENT',
  ruleVersion: 'P0-REPUTATION-1',
  category: 'DISPUTE_OUTCOME',
  direction: 'NEGATIVE',
  impact: -4,
  explanation: 'Décision ADMIN rendue sur un Claim : les faits examinés ont été retenus après instruction.',
  actorId: 'usr-admin-e2e',
  provenance: 'EVENT',
  occurredAt: '2026-09-18T10:00:00.000Z',
  createdAt: '2026-09-18T10:05:00.000Z',
  status: 'REVERSED',
  reversedAt: '2026-09-19T08:00:00.000Z',
  reversedBy: 'usr-admin-e2e',
  reversalReason: 'Correction ADMIN de vérification',
  history: [
    {
      at: '2026-09-19T08:00:00.000Z',
      actorId: 'usr-admin-e2e',
      action: 'REVERSED',
      reason: 'Correction ADMIN de vérification',
      fromStatus: 'ACTIVE',
      toStatus: 'REVERSED',
    },
  ],
  ruleStillInCatalog: true,
};
const FIXTURE_REP_NEXT_PAGE = {
  ...FIXTURE_REP_ACTIVE,
  reputationId: 'rpt-e2e-3',
  subjectUserId: 'usr-can-next',
  sourceEntityId: 'ctr-e2e-next',
  impact: 2,
  sourceEvent: 'EXECUTION_CONFIRMED',
  ruleCode: 'EXECUTION_CONFIRMED_PARTY',
  explanation: 'Fin d’exécution confirmée par une partie du Contrat (fait d’historique documenté).',
};

/* ── P4F-2 · Notifications (fixture HTTP d'une réponse ADMIN réelle) ── */
const FIXTURE_NOTIFICATION = {
  id: 'ntf-e2e-1',
  recipientId: 'usr-admin-e2e',
  recipientRole: 'ADMIN',
  type: 'NEW_APPLICATION',
  title: 'Nouvelle Candidature à examiner',
  message: 'Une nouvelle Candidature est disponible dans la file ADMIN.',
  linkRef: { screen: 'ADM-06' },
  sourceEventId: 'evt-notification-e2e-1',
  sourceEventType: 'APPLICATION_SUBMITTED',
  aggregateType: 'APPLICATION',
  aggregateId: 'app-e2e-1',
  payload: { secret: SERVER_SECRET },
  dedupeKey: 'private-dedupe-key-e2e',
  isRead: false,
  readState: 'UNREAD',
  pushStatus: 'NOT_AVAILABLE',
  emailStatus: 'SKIPPED',
  createdAt: '2026-10-10T09:00:00.000Z',
  updatedAt: '2026-10-10T09:00:00.000Z',
};
const FIXTURE_NOTIFICATION_READ = {
  ...FIXTURE_NOTIFICATION,
  id: 'ntf-e2e-2',
  type: 'ACCOUNT_UNBLOCKED',
  title: 'Compte rétabli',
  message: 'Le compte est de nouveau accessible.',
  isRead: true,
  readState: 'READ',
  pushStatus: 'NOT_AVAILABLE',
  emailStatus: 'NOT_AVAILABLE',
};
const FIXTURE_NOTIFICATION_NEXT_PAGE = {
  ...FIXTURE_NOTIFICATION,
  id: 'ntf-e2e-3',
  title: 'Notification de la page suivante',
  message: 'Ligne suivante fournie par la réponse serveur.',
  isRead: false,
  readState: 'UNREAD',
};

function reputationDetail(entry: typeof FIXTURE_REP_ACTIVE | typeof FIXTURE_REP_REVERSED | typeof FIXTURE_REP_NEXT_PAGE) {
  return {
    ...entry,
    rule: {
      code: entry.ruleCode,
      version: entry.ruleVersion,
      category: entry.category,
      direction: entry.direction,
      impact: entry.impact,
      explanation: entry.explanation,
    },
    source: {
      event: entry.sourceEvent,
      eventId: entry.sourceEventId,
      entityType: entry.sourceEntityType,
      entityId: entry.sourceEntityId,
    },
  };
}

let fixturePaymentRows: Record<string, unknown>[] = [FIXTURE_SALARY_PAYMENT, FIXTURE_FEE_PAYMENT, FIXTURE_SCHEDULED_PAYMENT];
let fixtureClaimRows: Record<string, unknown>[] = [FIXTURE_CLAIM, FIXTURE_DECISION_CLAIM, FIXTURE_TERMINAL_CLAIM];
type NotificationListMode = 'ready' | 'empty' | 'not-installed' | 'error';
let notificationListMode: NotificationListMode = 'ready';
let notificationReadPermission = true;
let notificationListCalls = 0;
const notificationCursors: Array<string | null> = [];
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

  /* ── P4F · Documents (fixtures HTTP de vérification, jamais dans l'application) ── */
  let documentReadPermission = true;
  let documentListMode: 'ready' | 'empty' | 'not-installed' | 'error' = 'ready';
  let documentListCalls = 0;
  const documentListQueries: string[] = [];
  let documentIntegrityMode: 'match' | 'absent' = 'match';
  const documentCommandRequests: Array<{ command: string; key: string; body: Record<string, unknown>; path: string }> = [];
  const FIXTURE_DOCUMENT_VERSION = {
    versionId: 'ver-e2e-1',
    versionNumber: 1,
    contentType: 'application/pdf',
    declaredSizeBytes: 1024,
    sizeBytes: 1024,
    cryptographicHash: 'a'.repeat(64),
    hashAlgorithm: 'SHA-256',
    provenance: 'USER_UPLOAD',
    status: 'ACTIVE',
    createdAt: '2026-10-01T10:00:00.000Z',
    createdBy: 'usr-owner-e2e',
    registeredAt: '2026-10-01T10:01:00.000Z',
    retainUntil: null,
  };
  const FIXTURE_DOCUMENT_SUMMARY = {
    documentId: 'doc-e2e-1',
    ownerUserId: 'usr-owner-e2e',
    title: 'Contrat signé de test',
    fileName: 'contrat-e2e.pdf',
    documentType: 'CONTRACT_DOCUMENT',
    status: 'ACTIVE',
    currentVersionNumber: 1,
    retention: { retentionClass: 'CONTRACTUAL', durationStatus: 'PENDING_LEGAL_VALIDATION', retentionDays: null },
    createdAt: '2026-10-01T10:00:00.000Z',
    createdBy: 'usr-owner-e2e',
  };
  let fixtureDocument: Record<string, unknown> = { ...FIXTURE_DOCUMENT_SUMMARY };
  const resetDocumentFixtures = () => {
    documentReadPermission = true;
    documentListMode = 'ready';
    documentIntegrityMode = 'match';
    documentListCalls = 0;
    documentListQueries.length = 0;
    documentCommandRequests.length = 0;
    claimActionPermissions = 'all';
    fixtureDocument = { ...FIXTURE_DOCUMENT_SUMMARY };
  };
  const documentDetail = () => ({ ...fixtureDocument, versions: [FIXTURE_DOCUMENT_VERSION], links: [] });
  let paymentListMode: PaymentListMode = 'ready';
  let paymentReadPermission = true;
  let paymentActionPermissions: 'all' | 'read-only' = 'all';
  let claimActionPermissions: 'all' | 'read-only' = 'all';
  let claimListCalls = 0;
  let claimDetailCalls = 0;
  const claimCommandRequests: Array<{ command: string; claimId: string; key: string; body: Record<string, unknown> }> = [];
  // P4E-1 — état des fixtures Remplacement.
  type ReplacementMode = 'ready' | 'not-configured' | 'error';
  let replacementReadPermission = true;
  let proposalReadPermission = true;
  let replacementMode: ReplacementMode = 'ready';
  let replacementScenario = false;
  let replacementListCalls = 0;
  let replacementDetailCalls = 0;
  let replacementNextPageDelayMs = 0;
  let proposalListCalls = 0;
  const replacementCursors: Array<string | null> = [];
  const replacementMutations: string[] = [];
  const resetReplacementFixtures = () => {
    replacementReadPermission = true;
    proposalReadPermission = true;
    replacementMode = 'ready';
    replacementScenario = false;
    replacementListCalls = 0;
    replacementDetailCalls = 0;
    replacementNextPageDelayMs = 0;
    proposalListCalls = 0;
    replacementCursors.length = 0;
    replacementMutations.length = 0;
  };
  type ReputationMode = 'ready' | 'error' | 'closed';
  let reputationReadPermission = true;
  let reputationMode: ReputationMode = 'ready';
  let reputationListCalls = 0;
  let reputationDetailCalls = 0;
  let reputationNextPageDelayMs = 0;
  const reputationCursors: Array<string | null> = [];
  const reputationCommandRequests: Array<{ command: string; key: string; body: Record<string, unknown>; path: string }> = [];
  let fixtureReputationRows: Array<typeof FIXTURE_REP_ACTIVE | typeof FIXTURE_REP_REVERSED | typeof FIXTURE_REP_NEXT_PAGE> = [
    { ...FIXTURE_REP_ACTIVE, history: [] },
    { ...FIXTURE_REP_REVERSED, history: [...FIXTURE_REP_REVERSED.history] },
  ];
  const resetReputationFixtures = () => {
    reputationReadPermission = true;
    reputationMode = 'ready';
    reputationListCalls = 0;
    reputationDetailCalls = 0;
    reputationNextPageDelayMs = 0;
    reputationCursors.length = 0;
    reputationCommandRequests.length = 0;
    fixtureReputationRows = [
      { ...FIXTURE_REP_ACTIVE, history: [] },
      { ...FIXTURE_REP_REVERSED, history: [...FIXTURE_REP_REVERSED.history] },
    ];
  };
  const resetNotificationFixtures = () => {
    notificationListMode = 'ready';
    notificationReadPermission = true;
    notificationListCalls = 0;
    notificationCursors.length = 0;
  };
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
    if (url.pathname.startsWith('/api/v1/admin/documents') || /^\/api\/v1\/documents\/doc-e2e-1\/versions\/ver-e2e-1\/verify$/.test(url.pathname)) {
      const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      const errorBody = (code: string, message: string) => ({ error: { code, message, requestId: SERVER_REQUEST_ID } });
      if (url.pathname === '/api/v1/admin/documents' && method === 'GET') {
        documentListCalls += 1;
        documentListQueries.push(url.search);
        if (!documentReadPermission) return json(403, errorBody('FORBIDDEN', SERVER_SECRET));
        if (documentListMode === 'not-installed') return json(501, errorBody('NOT_IMPLEMENTED', SERVER_SECRET));
        if (documentListMode === 'error') return json(500, errorBody('INTERNAL', SERVER_SECRET));
        const items = documentListMode === 'empty' ? [] : [{ ...fixtureDocument }];
        return json(200, { items, cursor: null, limit: 50, hasMore: false });
      }
      if (url.pathname === '/api/v1/admin/documents/doc-e2e-1' && method === 'GET') {
        if (!documentReadPermission) return json(403, errorBody('FORBIDDEN', SERVER_SECRET));
        return json(200, documentDetail());
      }
      if (url.pathname === '/api/v1/admin/documents/doc-e2e-1/revoke' && method === 'POST') {
        const key = route.request().headers()['idempotency-key'] ?? '';
        const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
        documentCommandRequests.push({ command: 'revoke', key, body, path: url.pathname });
        if (sessionMode !== 'admin' || claimActionPermissions !== 'all') return json(403, errorBody('FORBIDDEN', SERVER_SECRET));
        if (typeof body.reason !== 'string' || body.reason.trim().length < 3) return json(400, errorBody('VALIDATION_ERROR', 'Motif invalide.'));
        if (fixtureDocument.status === 'REVOKED') return json(409, errorBody('BUSINESS_RULE_VIOLATION', 'Document déjà révoqué.'));
        fixtureDocument = { ...fixtureDocument, status: 'REVOKED', revokedAt: '2026-10-10T09:00:00.000Z', revokedBy: 'usr-admin-e2e', revocationReason: body.reason.trim() };
        return json(200, documentDetail());
      }
      if (url.pathname === '/api/v1/documents/doc-e2e-1/versions/ver-e2e-1/verify' && method === 'POST') {
        const key = route.request().headers()['idempotency-key'] ?? '';
        documentCommandRequests.push({ command: 'verify', key, body: {}, path: url.pathname });
        const present = documentIntegrityMode === 'match';
        return json(200, {
          documentId: 'doc-e2e-1',
          versionId: 'ver-e2e-1',
          expectedHash: 'a'.repeat(64),
          actualHash: present ? 'a'.repeat(64) : null,
          objectPresent: present,
          match: present,
          verifiedAt: '2026-10-10T09:05:00.000Z',
          scope: 'TECHNICAL_INTEGRITY',
        });
      }
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify(errorBody('NOT_FOUND', 'Ressource non attendue par la vérification.')) });
      return;
    }
    if (url.pathname === '/api/v1/admin/notifications' && method === 'GET') {
      notificationListCalls += 1;
      notificationCursors.push(url.searchParams.get('cursor'));
      const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      const errorBody = (code: string, message: string) => ({ error: { code, message, requestId: SERVER_REQUEST_ID } });
      if (!notificationReadPermission) return json(403, errorBody('FORBIDDEN', SERVER_SECRET));
      if (notificationListMode === 'not-installed') return json(501, errorBody('NOT_IMPLEMENTED', SERVER_SECRET));
      if (notificationListMode === 'error') return json(500, errorBody('INTERNAL', SERVER_SECRET));
      if (notificationListMode === 'empty') return json(200, { items: [], cursor: null, limit: 100, hasMore: false });
      if (url.searchParams.get('cursor') === 'ntf-e2e-2') {
        return json(200, { items: [FIXTURE_NOTIFICATION_NEXT_PAGE], cursor: null, limit: 100, hasMore: false });
      }
      return json(200, { items: [FIXTURE_NOTIFICATION, FIXTURE_NOTIFICATION_READ], cursor: 'ntf-e2e-2', limit: 100, hasMore: true });
    }
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
                ...(replacementReadPermission ? ['replacements:read:any'] : []),
                ...(proposalReadPermission ? ['applications:read:any'] : []),
                ...(reputationReadPermission ? ['audit:read'] : []),
                ...(documentReadPermission ? ['documents:read:any'] : []),
                ...(notificationReadPermission ? ['notifications:read:any'] : []),
              ]
            : [],
        }),
      });
      return;
    }
    if (url.pathname === '/api/v1/admin/reputation/entries' && method === 'GET') {
      reputationListCalls += 1;
      reputationCursors.push(url.searchParams.get('cursor'));
      if (!reputationReadPermission) {
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'FORBIDDEN', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      if (reputationMode === 'closed') {
        await route.fulfill({ status: 501, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_IMPLEMENTED', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      if (reputationMode === 'error') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      const cursor = url.searchParams.get('cursor');
      if (cursor === 'rpt-e2e-2') {
        if (reputationNextPageDelayMs > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, reputationNextPageDelayMs));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [FIXTURE_REP_NEXT_PAGE], cursor: null, limit: 100, hasMore: false }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: fixtureReputationRows, cursor: 'rpt-e2e-2', limit: 100, hasMore: true }),
      });
      return;
    }
    if (url.pathname.startsWith('/api/v1/admin/reputation/entries/') && method === 'GET') {
      reputationDetailCalls += 1;
      const reputationId = decodeURIComponent(url.pathname.split('/')[6] ?? '');
      if (!reputationReadPermission) {
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'FORBIDDEN', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      if (reputationMode === 'error') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      const entry = [...fixtureReputationRows, FIXTURE_REP_NEXT_PAGE].find((item) => item.reputationId === reputationId);
      if (!entry) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Entrée absente de la fixture.', requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reputationDetail(entry)) });
      return;
    }
    if (url.pathname.startsWith('/api/v1/admin/reputation/entries/') && url.pathname.endsWith('/correct') && method === 'POST') {
      const reputationId = decodeURIComponent(url.pathname.split('/')[6] ?? '');
      const key = route.request().headers()['idempotency-key'] ?? '';
      const body = route.request().postDataJSON() as Record<string, unknown>;
      reputationCommandRequests.push({ command: 'correct', key, body, path: url.pathname });
      if (sessionMode !== 'admin' || claimActionPermissions !== 'all') {
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'FORBIDDEN', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      const entry = fixtureReputationRows.find((item) => item.reputationId === reputationId);
      if (!entry) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Entrée absente.', requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      const action = body.action;
      if (action !== 'REVERSE' && action !== 'RESTORE') {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Action invalide.', requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      if (action === 'REVERSE' && entry.status !== 'ACTIVE') {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'BUSINESS_RULE_VIOLATION', message: 'Déjà révoquée.', requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      const updated = {
        ...entry,
        status: action === 'REVERSE' ? 'REVERSED' : 'ACTIVE',
        reversedAt: action === 'REVERSE' ? '2026-10-01T12:00:00.000Z' : undefined,
        reversedBy: action === 'REVERSE' ? 'usr-admin-e2e' : undefined,
        reversalReason: action === 'REVERSE' ? String(body.reason ?? '') : undefined,
        history: [
          ...entry.history,
          {
            at: '2026-10-01T12:00:00.000Z',
            actorId: 'usr-admin-e2e',
            action: action === 'REVERSE' ? 'REVERSED' : 'RESTORED',
            reason: String(body.reason ?? ''),
            fromStatus: entry.status,
            toStatus: action === 'REVERSE' ? 'REVERSED' : 'ACTIVE',
          },
        ],
      };
      fixtureReputationRows = fixtureReputationRows.map((item) => item.reputationId === reputationId ? updated : item);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reputationDetail(updated as typeof FIXTURE_REP_ACTIVE)) });
      return;
    }
    if (url.pathname === '/api/v1/admin/reputation/reconcile' && method === 'POST') {
      const key = route.request().headers()['idempotency-key'] ?? '';
      const body = route.request().postDataJSON() as Record<string, unknown>;
      reputationCommandRequests.push({ command: 'reconcile', key, body, path: url.pathname });
      if (sessionMode !== 'admin' || claimActionPermissions !== 'all') {
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'FORBIDDEN', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          subjectUserId: body.subjectUserId,
          scanned: 2,
          appended: 0,
          duplicates: 2,
          rulesVersion: 'P0-REPUTATION-1',
          reconciledAt: '2026-10-01T12:00:00.000Z',
          purpose: 'Finalité : documenter une fiabilité de coopération à partir de faits déjà persistés.',
        }),
      });
      return;
    }
    if (/\/api\/v1\/my\/reputation/.test(url.pathname)) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL', message: 'self-route-must-not-be-called', requestId: SERVER_REQUEST_ID } }) });
      return;
    }
    // P4E-1 — toute écriture vers un Remplacement serait une commande inventée.
    if (/\/api\/v1\/(admin\/)?replacements/.test(url.pathname) && method !== 'GET') {
      replacementMutations.push(`${method} ${url.pathname}`);
      await route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
      return;
    }
    if (url.pathname === '/api/v1/admin/replacements' && method === 'GET') {
      replacementListCalls += 1;
      const cursor = url.searchParams.get('cursor');
      replacementCursors.push(cursor);
      if (!replacementReadPermission) {
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'FORBIDDEN', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      if (replacementMode === 'error') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      if (replacementMode === 'not-configured') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], cursor: null, limit: 100, hasMore: false, persistence: 'not-configured' }) });
        return;
      }
      if (cursor === 'rpl-e2e-2') {
        if (replacementNextPageDelayMs > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, replacementNextPageDelayMs));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [FIXTURE_RPL_NEXT_PAGE], cursor: null, limit: 100, hasMore: false }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [FIXTURE_RPL_PENDING, FIXTURE_RPL_SELECTED, FIXTURE_RPL_FINALIZED], cursor: 'rpl-e2e-2', limit: 100, hasMore: true }) });
      return;
    }
    if (url.pathname.startsWith('/api/v1/admin/replacements/') && method === 'GET') {
      replacementDetailCalls += 1;
      const replacementId = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
      if (!replacementReadPermission) {
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'FORBIDDEN', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      if (replacementMode === 'error') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      const dossier = [FIXTURE_RPL_PENDING, FIXTURE_RPL_SELECTED, FIXTURE_RPL_FINALIZED, FIXTURE_RPL_NEXT_PAGE].find((item) => item.id === replacementId);
      if (!dossier) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Remplacement absent de la fixture.', requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dossier) });
      return;
    }
    if (url.pathname === '/api/v1/admin/proposals' && method === 'GET') {
      proposalListCalls += 1;
      if (!proposalReadPermission) {
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 'FORBIDDEN', message: SERVER_SECRET, requestId: SERVER_REQUEST_ID } }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: FIXTURE_RPL_PROPOSALS, cursor: null, limit: 100, hasMore: false }) });
      return;
    }
    if (url.pathname === '/api/v1/admin/claims/clm-rpl-e2e' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURE_RPL_CLAIM) });
      return;
    }
    if (url.pathname === '/api/v1/admin/contracts') {
      const items = replacementScenario ? [FIXTURE_CONTRACT, FIXTURE_RPL_SELECTED_SOURCE_CONTRACT, FIXTURE_RPL_SOURCE_CONTRACT, FIXTURE_RPL_SUCCESSOR_CONTRACT] : [FIXTURE_CONTRACT];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items, cursor: null, limit: 100, hasMore: false }) });
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

  /* ── 1. Aucune source de données configurée : toutes les fiches livrées, deux largeurs ── */
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

  /* ── P4E-1 · Remplacements (lecture seule) ── */

  await check('ADM-31 — file réelle des Remplacements : statuts serveur, filtre/recherche locaux au clavier, curseur single-flight, aucune commande', async () => {
    sessionMode = 'admin';
    resetReplacementFixtures();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(api.origin + '/admin/remplacements');
    await page.reload();
    await page.locator('[data-screen="ADM-31"]').waitFor();
    await page.getByText('rpl-e2e-1', { exact: true }).first().waitFor();
    let text = await screenText();
    assert.equal(replacementListCalls, 1, 'une seule page réelle doit alimenter la file');
    assert.deepEqual(replacementCursors, [null], 'premier appel sans curseur');
    for (const code of ['PENDING_OFFER', 'CANDIDATE_SELECTED', 'CONTRACT_FINALIZED']) assert.ok(text.includes(code), `statut serveur ${code} absent`);
    assert.ok(says(text, 'Offre de remplacement à publier') && says(text, 'Contrat successeur créé'), 'libellés officiels absents');
    assert.ok(says(text, '3 dossier(s) de Remplacement'), 'compte limité à la page chargée absent');
    assert.ok(says(text, 'Aucun total global'), 'portée des repères non déclarée');
    assert.ok(text.includes('K. Houngbo'), 'Candidat sélectionné réel absent');
    assert.equal(await page.locator('[data-screen="ADM-31"] tbody tr').count(), 3, 'trois dossiers réels');
    assert.equal(await page.locator('[data-screen="ADM-31"] a[href="/admin/litiges/clm-rpl-e2e"]').count(), 1, 'lien vers le Claim d’origine absent');
    // Filtre d'état au clavier.
    const select = page.getByLabel('Filtrer par statut de Remplacement');
    await select.focus();
    await select.selectOption('CANDIDATE_SELECTED');
    assert.equal(await page.locator('[data-screen="ADM-31"] tbody tr').count(), 1, 'filtre local par statut');
    await select.selectOption('all');
    await page.getByLabel('Rechercher un Remplacement dans les pages chargées').fill('ctr-rpl-zero');
    assert.equal(await page.locator('[data-screen="ADM-31"] tbody tr').count(), 1, 'recherche locale');
    await page.getByLabel('Rechercher un Remplacement dans les pages chargées').fill('');
    // Page suivante : double activation pendant le chargement = une seule requête.
    replacementNextPageDelayMs = 400;
    const more = page.getByRole('button', { name: 'Charger la page suivante' });
    await more.focus();
    await page.keyboard.press('Enter');
    await more.click({ force: true }).catch(() => undefined);
    await page.getByText('rpl-e2e-3', { exact: true }).first().waitFor();
    assert.deepEqual(replacementCursors, [null, 'rpl-e2e-2'], 'curseur officiel utilisé une seule fois (single-flight)');
    assert.equal(await page.locator('[data-screen="ADM-31"] tbody tr').count(), 4, 'page suivante ajoutée');
    assert.equal(await page.getByRole('button', { name: 'Charger la page suivante' }).count(), 0, 'plus de page annoncée par le serveur');
    text = await screenText();
    assert.ok(!text.includes(SERVER_SECRET), 'aucun message serveur brut');
    assert.equal(await page.locator('[data-screen="ADM-31"] form').count(), 0, 'aucun formulaire de commande');
    assert.ok(await page.locator('[data-backend-gap="true"]').first().isVisible(), 'BACKEND_GAP ADM-31 absent');
    assert.deepEqual(replacementMutations, [], 'aucune commande Remplacement envoyée');
    await assertNoForbiddenText('/admin/remplacements', text);
    await page.setViewportSize({ width: 360, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 5000 }).catch(() => undefined);
    const overflowing = await page.evaluate(() =>
      [...document.querySelectorAll('[data-screen="ADM-31"] *')]
        .filter((element) => element.getBoundingClientRect().right > innerWidth + 1 && !element.closest('.lbm-admin__table-wrap'))
        .slice(0, 5)
        .map((element) => `${element.tagName.toLowerCase()}.${element.className}`),
    );
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `débordement horizontal ADM-31 à 360 px : ${overflowing.join(' | ')}`);
  });

  await check('ADM-32 — dossier CANDIDATE_SELECTED : Claim, Contrat source REPLACED, Proposition envoyée ≠ acceptée, Paiements du Contrat source non transférés', async () => {
    sessionMode = 'admin';
    resetReplacementFixtures();
    resetPaymentFixtures();
    replacementScenario = true;
    fixturePaymentRows = [...fixturePaymentRows, FIXTURE_RPL_SOURCE_PAYMENT];
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(api.origin + '/admin/remplacements/rpl-e2e-1');
    await page.reload();
    await page.locator('[data-screen="ADM-32"]').waitFor();
    for (const block of ['claim', 'contracts', 'proposal', 'payments']) {
      await page.locator(`[data-block="${block}"][data-block-state="ready"]`).waitFor();
    }
    const text = await screenText();
    assert.ok(text.includes('rpl-e2e-1') && text.includes('clm-rpl-e2e') && text.includes('ctr-rpl-src1'), 'références réelles du dossier absentes');
    assert.ok(text.includes('CONTRACT_INCIDENT') && says(text, 'Contrat du Claim = Contrat source'), 'Claim d’origine non composé');
    assert.ok(text.includes('REPLACED') && text.includes('CONTRACT_REPLACED'), 'Contrat source REPLACED / historique absent');
    assert.ok(says(text, 'Envoyée — réponse du Candidat attendue') && text.includes('SENT'), 'Proposition SENT non distinguée');
    assert.ok(!says(text, 'Acceptée par le Candidat'), 'une Proposition envoyée ne doit pas être présentée comme acceptée');
    const steps = await page.locator('[data-screen="ADM-32"] .lbm-admin__timeline li').evaluateAll((items) => items.map((item) => item.getAttribute('data-done')));
    assert.deepEqual(steps, ['true', 'true', 'true', 'true', 'true', 'false', 'false', 'false'], 'déroulé : acceptation non déduite');
    assert.ok(says(text, 'l’Employeur émet la Proposition ; le Candidat y répond explicitement'), 'acteur de l’étape suivante absent');
    assert.ok(text.includes('pay-rpl-src1'), 'Paiement réel du Contrat source absent');
    assert.ok(!text.includes('pay-rpl-src2'), 'Paiement d’un autre Contrat source rattaché à tort');
    assert.ok(says(text, 'Aucun Contrat successeur : aucun Paiement ne peut lui être rattaché'), 'absence de successeur non dite');
    assert.equal(await page.locator('[data-no-payment-transfer="true"]').count(), 1, 'absence de transfert de Paiement non affichée');
    assert.ok(!text.includes('IDEMPOTENCY_MUST_NOT_RENDER'), 'clé d’idempotence rendue');
    assert.ok(!text.includes('pay-salary-e2e'), 'Paiement d’un autre Contrat rattaché à tort');
    assert.equal(await page.locator('[data-screen="ADM-32"] form').count(), 0, 'aucun formulaire');
    assert.equal(await page.locator('[data-screen="ADM-32"] table thead th[scope="col"]').count() > 0, true, 'tables non sémantiques');
    assert.deepEqual(replacementMutations, [], 'aucune commande Remplacement envoyée');
    await assertNoForbiddenText('/admin/remplacements/rpl-e2e-1', text);
    await page.setViewportSize({ width: 360, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 5000 }).catch(() => undefined);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'débordement horizontal ADM-32 à 360 px');
    resetPaymentFixtures();
    resetReplacementFixtures();
  });

  await check('ADM-32 — dossier CONTRACT_FINALIZED : Contrat successeur distinct en DRAFT (non actif), Proposition acceptée, Paiements séparés par Contrat', async () => {
    sessionMode = 'admin';
    resetReplacementFixtures();
    resetPaymentFixtures();
    replacementScenario = true;
    fixturePaymentRows = [...fixturePaymentRows, FIXTURE_RPL_SOURCE_PAYMENT, FIXTURE_RPL_FINALIZED_SOURCE_PAYMENT];
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(api.origin + '/admin/remplacements/rpl-e2e-2');
    await page.locator('[data-screen="ADM-32"]').waitFor();
    for (const block of ['contracts', 'proposal', 'payments']) {
      await page.locator(`[data-block="${block}"][data-block-state="ready"]`).waitFor();
    }
    const text = await screenText();
    assert.ok(text.includes('ctr-rpl-new') && text.includes('DRAFT'), 'Contrat successeur réel absent');
    assert.equal(await page.locator('[data-successor-inactive="DRAFT"]').count(), 1, 'Contrat successeur DRAFT non signalé comme non actif');
    assert.ok(says(text, 'Acceptée par le Candidat') && text.includes('ACCEPTED'), 'Proposition acceptée absente');
    const steps = await page.locator('[data-screen="ADM-32"] .lbm-admin__timeline li').evaluateAll((items) => items.map((item) => item.getAttribute('data-done')));
    assert.deepEqual(steps, ['true', 'true', 'true', 'true', 'true', 'true', 'true', 'false'], 'DRAFT ≠ actif dans le déroulé');
    assert.ok(says(text, 'Aucun Paiement du Contrat successeur dans la page chargée'), 'Paiements du successeur : aucun transfert');
    assert.ok(text.includes('pay-rpl-src2') && !text.includes('pay-rpl-src1'), 'Paiements du Contrat source restent rattachés à leur seul Contrat');
    assert.ok(text.includes('REPLACEMENT_SUCCESSOR_LINKED'), 'historique de liaison absent');
    assert.equal(await page.locator('a[href="/admin/contrats/ctr-rpl-new"]').count(), 1, 'lien vers la fiche du Contrat successeur absent');
    assert.deepEqual(replacementMutations, [], 'aucune commande Remplacement envoyée');
    await assertNoForbiddenText('/admin/remplacements/rpl-e2e-2', text);
    resetPaymentFixtures();
    resetReplacementFixtures();
  });

  await check('ADM-32 — permissions par bloc : lectures non permises non appelées, état dit, aucun échec global', async () => {
    sessionMode = 'admin';
    resetReplacementFixtures();
    resetPaymentFixtures();
    proposalReadPermission = false;
    paymentReadPermission = false;
    paymentListCalls = 0;
    await page.goto(api.origin + '/admin/remplacements/rpl-e2e-1');
    await page.reload();
    await page.locator('[data-screen="ADM-32"]').waitFor();
    await page.locator('[data-permission-missing="applications:read:any"]').waitFor();
    await page.locator('[data-permission-missing="payments:read:any"]').waitFor();
    assert.equal(proposalListCalls, 0, 'admin.proposals.list ne doit pas être appelée sans applications:read:any');
    assert.equal(paymentListCalls, 0, 'admin.payments.list ne doit pas être appelée sans payments:read:any');
    await page.locator('[data-block="claim"]').waitFor();
    resetPaymentFixtures();
    resetReplacementFixtures();
  });

  await check('ADM-33 — arbitrage : capacité absente, aucun formulaire ni commande, dossier réel seulement', async () => {
    sessionMode = 'admin';
    resetReplacementFixtures();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(api.origin + '/admin/remplacements/rpl-e2e-2/arbitrage');
    await page.locator('[data-screen="ADM-33"]').waitFor();
    await page.getByText('CONTRACT_FINALIZED', { exact: true }).first().waitFor();
    const text = await screenText();
    assert.ok(says(text, 'indisponible') && says(text, 'aucune saisie'), 'indisponibilité non dite');
    assert.equal(await page.locator('[data-screen="ADM-33"] form, [data-screen="ADM-33"] textarea, [data-screen="ADM-33"] input').count(), 0, 'aucun formulaire d’arbitrage');
    assert.equal(await page.locator('[data-screen="ADM-33"] button').filter({ hasNotText: /Actualiser/ }).count(), 0, 'aucun bouton de commande');
    assert.ok(await page.locator('[data-backend-gap="true"]').first().isVisible(), 'BACKEND_GAP ADM-33 absent');
    assert.equal(await page.locator('[data-screen="ADM-33"] [data-no-payment-transfer="true"]').count(), 1, 'aucune écriture financière : non dit');
    assert.deepEqual(replacementMutations, [], 'aucune commande Remplacement envoyée');
    await assertNoForbiddenText('/admin/remplacements/rpl-e2e-2/arbitrage', text);
    await page.setViewportSize({ width: 360, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 5000 }).catch(() => undefined);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'débordement horizontal ADM-33 à 360 px');
  });

  await check('ADM-31/32/33 — refus : 403 sans replacements:read:any et pour un Employeur, aucune lecture ADMIN appelée', async () => {
    resetReplacementFixtures();
    sessionMode = 'admin';
    replacementReadPermission = false;
    for (const path of ['/admin/remplacements', '/admin/remplacements/rpl-e2e-1', '/admin/remplacements/rpl-e2e-1/arbitrage']) {
      await page.goto(api.origin + path);
      await page.reload();
      await page.locator('[data-state="403"]').waitFor();
    }
    assert.equal(replacementListCalls + replacementDetailCalls, 0, 'aucune lecture sans permission replacements:read:any');
    resetReplacementFixtures();
    sessionMode = 'employer';
    await page.goto(api.origin + '/admin/remplacements');
    await page.reload();
    await page.locator('[data-state="403"]').waitFor();
    assert.equal(replacementListCalls, 0, 'un compte Employeur ne doit jamais appeler la file ADMIN');
    await assertNoForbiddenText('/admin/remplacements refusé', await page.locator('[data-state="403"]').innerText());
    sessionMode = 'admin';
    resetReplacementFixtures();
  });

  await check('ADM-31/32 — frontière not-configured, erreur 500 (corrélation seule), dossier 404 : états honnêtes', async () => {
    sessionMode = 'admin';
    resetReplacementFixtures();
    replacementMode = 'not-configured';
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(api.origin + '/admin/remplacements');
    await page.reload();
    await page.locator('[data-screen="ADM-31"]').waitFor();
    await page.getByText(/frontière de contrôle sans persistance métier/).waitFor();
    assert.equal(await page.locator('[data-screen="ADM-31"] tbody tr').count(), 0, 'aucune ligne inventée sans persistance');
    replacementMode = 'error';
    await page.reload();
    await page.locator('[data-state="500"]').waitFor();
    const errorText = await page.locator('[data-state="500"]').innerText();
    assert.ok(!errorText.includes(SERVER_SECRET), 'message serveur brut rendu');
    assert.ok(errorText.includes(SERVER_REQUEST_ID), 'corrélation serveur absente');
    replacementMode = 'ready';
    await page.goto(api.origin + '/admin/remplacements/rpl-absent');
    await page.locator('[data-state="404"]').waitFor();
    resetReplacementFixtures();
  });

  /* ── P4E-2 · Réputation ── */

  await check('ADM-34 — ledger réel : impact stocké, filtres serveur, curseur single-flight, aucun score inventé', async () => {
    sessionMode = 'admin';
    resetReputationFixtures();
    resetClaimFixtures();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(api.origin + '/admin/reputation');
    await page.reload();
    await page.locator('[data-screen="ADM-34"]').waitFor();
    await page.getByText('rpt-e2e-1', { exact: true }).first().waitFor();
    let text = await screenText();
    assert.equal(reputationListCalls, 1, 'une seule page réelle doit alimenter le ledger');
    assert.deepEqual(reputationCursors, [null], 'premier appel sans curseur');
    assert.ok(text.includes('ACTIVE') && text.includes('REVERSED'), 'statuts serveur absents');
    assert.ok(text.includes('+3') && text.includes('-4'), 'impacts stockés absents');
    assert.ok(says(text, 'aucun score 0-100') || says(text, 'aucun impact n’est additionné'), 'absence de score non dite');
    assert.ok(await page.locator('[data-no-invented-score="true"]').count() > 0, 'marqueur d’absence de score manquant');
    assert.ok(!/\b\d{1,3}\s*\/\s*100\b/.test(text), 'score 0-100 inventé');
    await page.getByLabel('Recherche locale dans le ledger').fill('rpt-e2e-1');
    assert.equal(await page.locator('[data-screen="ADM-34"] tbody tr').count(), 1, 'recherche locale');
    await page.getByLabel('Recherche locale dans le ledger').fill('');
    await page.getByRole('button', { name: 'Charger la page suivante' }).click();
    await page.getByText('rpt-e2e-3', { exact: true }).first().waitFor();
    assert.equal(reputationListCalls, 2, 'page suivante non demandée');
    assert.deepEqual(reputationCursors, [null, 'rpt-e2e-2']);
    text = await screenText();
    await assertNoForbiddenText('/admin/reputation', text);
    await page.setViewportSize({ width: 360, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 5000 }).catch(() => undefined);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'débordement horizontal ADM-34 à 360 px');
  });

  await check('ADM-34 — correction REVERSE idempotente, permission incidents:arbitrate, historique append-only', async () => {
    sessionMode = 'admin';
    resetReputationFixtures();
    resetClaimFixtures();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(api.origin + '/admin/reputation');
    await page.locator('[data-screen="ADM-34"]').waitFor();
    await page.getByRole('button', { name: 'rpt-e2e-1' }).click();
    await page.getByText('Contrat mené jusqu’à sa fin', { exact: false }).waitFor();
    assert.equal(reputationDetailCalls, 1, 'détail non lu');
    assert.ok(await page.getByText('Ouvrir Contrat ctr-e2e-1').count() > 0, 'lien vers le Contrat source');
    await page.getByLabel('Motif de correction de réputation').fill('Motif de révocation E2E consigné par le serveur');
    await page.getByText('Je confirme l’envoi de REVERSE au serveur', { exact: false }).click();
    await page.getByRole('button', { name: 'Envoyer REVERSE' }).click();
    await page.getByRole('button', { name: 'Envoyer RESTORE' }).waitFor();
    assert.equal(reputationCommandRequests.length, 1, 'commande de correction absente');
    assert.equal(reputationCommandRequests[0].command, 'correct');
    assert.deepEqual(reputationCommandRequests[0].body, { action: 'REVERSE', reason: 'Motif de révocation E2E consigné par le serveur' });
    assert.ok(reputationCommandRequests[0].key, 'clé d’idempotence absente');
    const text = await screenText();
    assert.ok(says(text, 'REVERSED'), 'statut après correction absent');
    await assertNoForbiddenText('/admin/reputation correction', text);

    resetClaimFixtures();
    claimActionPermissions = 'read-only';
    resetReputationFixtures();
    await page.reload();
    await page.locator('[data-screen="ADM-34"]').waitFor();
    await page.getByRole('button', { name: 'rpt-e2e-1' }).click();
    await page.getByText(/incidents:arbitrate est absente/).first().waitFor();
    assert.equal(await page.locator('[data-correction-form="true"]').count(), 0, 'formulaire de correction sans permission');
    assert.equal(reputationCommandRequests.length, 0, 'aucune commande sans permission');
  });

  await check('ADM-34 — réconciliation d’un sujet : rapport réel, pas un score', async () => {
    sessionMode = 'admin';
    resetReputationFixtures();
    resetClaimFixtures();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(api.origin + '/admin/reputation');
    await page.locator('[data-screen="ADM-34"]').waitFor();
    await page.getByLabel('Identifiant du sujet à réconcilier').fill('usr-can-e2e');
    await page.getByText('Je confirme l’envoi de la réconciliation', { exact: false }).click();
    await page.getByRole('button', { name: 'Réconcilier le sujet' }).click();
    // Locator borné au rapport : le sujet figure aussi dans le ledger (strict mode Playwright).
    await page.getByLabel('Rapport de réconciliation').getByText('usr-can-e2e', { exact: true }).waitFor();
    assert.equal(reputationCommandRequests.some((item) => item.command === 'reconcile'), true, 'réconciliation non envoyée');
    const reconcile = reputationCommandRequests.find((item) => item.command === 'reconcile')!;
    assert.deepEqual(reconcile.body, { subjectUserId: 'usr-can-e2e' });
    assert.ok(reconcile.key, 'clé d’idempotence de réconciliation absente');
    const text = await screenText();
    assert.ok(says(text, 'Faits parcourus') && says(text, 'Entrées ajoutées'), 'rapport réel absent');
    assert.ok(says(text, 'n’est pas une vérification de chaîne'), 'distinction réconciliation / intégrité non dite');
    await assertNoForbiddenText('/admin/reputation réconciliation', text);
  });

  await check('ADM-35 — recours : capacité absente, aucun formulaire ni file inventée', async () => {
    sessionMode = 'admin';
    resetReputationFixtures();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(api.origin + '/admin/reputation/contestations');
    await page.locator('[data-screen="ADM-35"]').waitFor();
    const text = await screenText();
    assert.ok(says(text, 'indisponible') || says(text, 'BACKEND_GAP'), 'capacité absente non dite');
    assert.equal(await page.locator('[data-screen="ADM-35"] form, [data-screen="ADM-35"] textarea').count(), 0, 'aucun formulaire de recours');
    assert.ok(await page.locator('[data-backend-gap="true"]').first().isVisible(), 'BACKEND_GAP ADM-35 absent');
    assert.equal(await page.locator('[data-screen="ADM-35"] tbody tr td').count() > 0, true, 'table vide attendue');
    await assertNoForbiddenText('/admin/reputation/contestations', text);
    await page.setViewportSize({ width: 360, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 5000 }).catch(() => undefined);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'débordement horizontal ADM-35 à 360 px');
  });

  await check('ADM-36 — audit d’intégrité : capacité absente, aucune vérification lancée', async () => {
    sessionMode = 'admin';
    resetReputationFixtures();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(api.origin + '/admin/reputation/audit');
    await page.locator('[data-screen="ADM-36"]').waitFor();
    const text = await screenText();
    assert.ok(says(text, 'indisponible'), 'capacité absente non dite');
    assert.equal(await page.locator('[data-screen="ADM-36"] form, [data-screen="ADM-36"] button').filter({ hasNotText: /Actualiser/ }).count(), 0, 'aucun bouton de vérification');
    assert.ok(await page.locator('[data-backend-gap="true"]').first().isVisible(), 'BACKEND_GAP ADM-36 absent');
    assert.ok(says(text, 'n’est pas une preuve d’intégrité') || says(text, 'Aucune route serveur de vérification'), 'réconciliation ≠ intégrité non dite');
    await assertNoForbiddenText('/admin/reputation/audit', text);
    await page.setViewportSize({ width: 360, height: 900 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 5000 }).catch(() => undefined);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'débordement horizontal ADM-36 à 360 px');
  });

  await check('ADM-34/35/36 — refus : 403 sans audit:read et pour un Employeur, aucune lecture ADMIN appelée', async () => {
    sessionMode = 'admin';
    resetReputationFixtures();
    reputationReadPermission = false;
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const path of ['/admin/reputation', '/admin/reputation/contestations', '/admin/reputation/audit']) {
      await page.goto(api.origin + path);
      await page.reload();
      await page.locator('[data-state="403"]').waitFor();
      assert.equal(reputationListCalls, 0, `${path} : lecture malgré le refus`);
    }
    reputationReadPermission = true;
    sessionMode = 'employer';
    await page.goto(api.origin + '/admin/reputation');
    await page.reload();
    await page.locator('[data-state="403"]').waitFor();
    assert.equal(reputationListCalls, 0, 'un Employeur ne doit pas appeler le ledger ADMIN');
    await assertNoForbiddenText('/admin/reputation refusé', await page.locator('[data-state="403"]').innerText());
    sessionMode = 'admin';
    resetReputationFixtures();
  });

  await check('ADM-34 — erreur 500 (corrélation seule) et 501 : états honnêtes, aucune vue self', async () => {
    sessionMode = 'admin';
    resetReputationFixtures();
    reputationMode = 'error';
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(api.origin + '/admin/reputation');
    await page.reload();
    await page.locator('[data-state="500"]').waitFor();
    const errorText = await page.locator('[data-state="500"]').innerText();
    assert.ok(!errorText.includes(SERVER_SECRET), 'message serveur brut rendu');
    assert.ok(errorText.includes(SERVER_REQUEST_ID), 'corrélation serveur absente');
    reputationMode = 'closed';
    await page.reload();
    await page.locator('[data-state="500"], [data-state="501"]').waitFor();
    resetReputationFixtures();
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

  await check('ADM-37 — registre réel : lignes de la réponse, pagination serveur, filtre au clavier, aucun object_key, 360 et 1440 px', async () => {
    sessionMode = 'admin';
    resetDocumentFixtures();
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(api.origin + '/admin/documents');
      await page.locator('[data-screen="ADM-37"]').waitFor();
      await page.locator('a[href="/admin/documents/doc-e2e-1/verification"]').waitFor();
      const text = await screenText();
      assert.ok(says(text, 'doc-e2e-1') && says(text, 'usr-owner-e2e'), `registre : lignes réelles absentes (${width}px)`);
      assert.ok(documentListQueries.at(-1)?.includes('limit=50'), `pagination serveur de 50 lignes attendue (${width}px)`);
      const html = await page.locator('[data-unit]').first().innerHTML();
      assert.ok(!/objectKey|object_key|storage\/|signed-download/i.test(html), `clé de stockage ou lien signé rendu (${width}px)`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `débordement horizontal (${width}px)`);
      await assertNoForbiddenText(`/admin/documents ${width}px`, text);
    }
    // Filtre serveur au clavier : Entrée dans le champ propriétaire relance la requête filtrée.
    const owner = page.getByLabel('Identifiant du propriétaire du Document');
    await owner.fill('usr-owner-e2e');
    const filtered = page.waitForRequest((request) => request.url().includes('ownerUserId=usr-owner-e2e'));
    await owner.press('Enter');
    await filtered;
    assert.ok(documentListQueries.some((query) => query.includes('ownerUserId=usr-owner-e2e')), 'filtre propriétaire non envoyé au serveur');
  });

  await check('ADM-37 — vide, non installé (501), erreur serveur et refus : états dits, aucune liste inventée', async () => {
    sessionMode = 'admin';
    resetDocumentFixtures();
    await page.setViewportSize({ width: 360, height: 900 });
    documentListMode = 'empty';
    await page.goto(api.origin + '/admin/documents');
    await page.getByText('Aucun Document n’est enregistré dans le registre.').waitFor();
    assert.equal(await page.locator('a[href^="/admin/documents/doc-"]').count(), 0, 'ligne inventée dans le registre vide');
    documentListMode = 'not-installed';
    await page.reload();
    await page.getByText('n’est pas installé dans cet environnement').waitFor();
    assert.equal(await page.locator('a[href^="/admin/documents/doc-"]').count(), 0, 'liste affichée à la place du 501');
    documentListMode = 'error';
    await page.reload();
    await page.locator('[data-state="500"]').waitFor();
    const errorText = await page.locator('[data-state="500"]').innerText();
    assert.ok(!errorText.includes(SERVER_SECRET), 'message serveur brut rendu');
    assert.ok(errorText.includes(SERVER_REQUEST_ID), 'corrélation serveur absente');
    documentListMode = 'ready';
    documentReadPermission = false;
    const callsBefore = documentListCalls;
    await page.reload();
    await page.locator('[data-state="403"]').waitFor();
    assert.equal(documentListCalls, callsBefore, 'appel ADMIN sans permission documents:read:any');
    resetDocumentFixtures();
  });

  await check('ADM-38 — contrôle d’intégrité : POST réel, verdict du serveur seul, jamais présenté comme preuve qualifiée', async () => {
    sessionMode = 'admin';
    resetDocumentFixtures();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(api.origin + '/admin/documents/doc-e2e-1/verification');
    await page.locator('[data-screen="ADM-38"]').waitFor();
    const recompute = page.getByRole('button', { name: 'Recalculer l’empreinte (contrôle technique)' });
    await recompute.click();
    await page.locator('[data-integrity-result="emerald"]').waitFor();
    const verify = documentCommandRequests.find((item) => item.command === 'verify');
    assert.ok(verify, 'contrôle d’intégrité non envoyé au serveur');
    assert.ok(verify.key, 'clé d’idempotence absente');
    const text = await screenText();
    assert.ok(says(text, 'Concordance technique') && says(text, 'ni une certification juridique'), 'verdict technique absent');
    assert.ok(!says(text, 'Document validé') && !says(text, 'horodatage qualifié attesté'), 'verdict présenté comme qualifié');
    assert.ok(!/objectKey|object_key/.test(await page.locator('[data-unit]').first().innerHTML()), 'clé de stockage rendue');
    documentCommandRequests.length = 0;
    documentIntegrityMode = 'absent';
    await page.reload();
    await page.getByRole('button', { name: 'Recalculer l’empreinte (contrôle technique)' }).click();
    await page.locator('[data-integrity-result="clay"]').waitFor();
    assert.ok(says(await screenText(), 'Contenu absent du stockage'), 'contenu absent non dit');
    resetDocumentFixtures();
  });

  await check('ADM-38 — révocation motivée : motif 3–1000, confirmation, clé idempotente, état relu ; sans permission, aucun formulaire', async () => {
    sessionMode = 'admin';
    resetDocumentFixtures();
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto(api.origin + '/admin/documents/doc-e2e-1/verification');
    await page.locator('[data-screen="ADM-38"]').waitFor();
    const form = page.locator('form[data-command-form="Révoquer le Document"]');
    await form.waitFor();
    const submit = form.getByRole('button', { name: 'Révoquer le Document' });
    const reason = form.getByLabel('Motif : Révoquer le Document');
    assert.equal(await submit.isDisabled(), true, 'bouton actif sans motif ni confirmation');
    await reason.fill('ab');
    await form.getByRole('checkbox').check();
    assert.equal(await submit.isDisabled(), true, 'motif de 2 caractères accepté');
    await reason.fill('Document hors périmètre');
    assert.equal(await submit.isDisabled(), false, 'motif valide et confirmé : envoi impossible');
    assert.ok(says(await form.innerText(), 'Aucune pièce n’est supprimée'), 'révocation présentée comme une suppression');
    await submit.click();
    await form.waitFor({ state: 'detached' });
    const revoke = documentCommandRequests.find((item) => item.command === 'revoke');
    assert.ok(revoke, 'révocation non envoyée');
    assert.deepEqual(revoke.body, { reason: 'Document hors périmètre' }, 'motif envoyé tel quel (trim)');
    assert.ok(revoke.key, 'clé d’idempotence absente');
    const text = await screenText();
    assert.ok(says(text, 'Révoqué'), 'état serveur non relu après révocation');
    await assertNoForbiddenText('/admin/documents révocation', text);
    // Sans incidents:arbitrate : aucun formulaire, une explication factuelle à la place.
    resetDocumentFixtures();
    claimActionPermissions = 'read-only';
    await page.reload();
    await page.locator('[data-screen="ADM-38"]').waitFor();
    assert.equal(await page.locator('form[data-command-form="Révoquer le Document"]').count(), 0, 'formulaire de révocation sans permission');
    assert.ok(await page.locator('[data-command-unavailable="true"]').first().isVisible(), 'explication de permission absente');
    resetDocumentFixtures();
  });

  await check('ADM-39 / ADM-40 — quarantaine et audit : BACKEND_GAP visibles, aucune action, aucune liste inventée', async () => {
    sessionMode = 'admin';
    resetDocumentFixtures();
    await page.setViewportSize({ width: 360, height: 900 });
    for (const [path, code] of [['/admin/documents/quarantaine', 'ADM-39'], ['/admin/documents/audit', 'ADM-40']] as const) {
      await page.goto(api.origin + path);
      await page.locator(`[data-screen="${code}"]`).waitFor();
      await page.locator('[data-backend-gap="true"]').first().waitFor();
      assert.equal(await page.locator(`[data-screen="${code}"] form`).count(), 0, `${code} : formulaire rendu`);
      assert.equal(await page.locator(`[data-screen="${code}"] button`).count(), 0, `${code} : bouton rendu sans handler`);
      await assertNoForbiddenText(path, await screenText());
    }
    assert.equal(documentListCalls, 0, 'ADM-39/40 n’appellent aucune liste ADMIN');
  });

  await check('ADM-41 — notification réelle : lecture In-App, curseur, états de canaux et payload opaque non rendu', async () => {
    sessionMode = 'admin';
    resetNotificationFixtures();
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(api.origin + '/admin/notifications');
      await page.locator('[data-screen="ADM-41"]').waitFor();
      await page.getByText('Nouvelle Candidature à examiner').waitFor();
      const text = await screenText();
      assert.ok(says(text, 'ntf-e2e-1') && says(text, 'Non lue'), `notification réelle absente (${width}px)`);
      assert.ok(says(text, 'Non disponible') && says(text, 'Non ciblé'), `états Push/Email réels absents (${width}px)`);
      assert.ok(!text.includes(SERVER_SECRET), `payload secret rendu (${width}px)`);
      assert.ok(notificationCursors[0] === null, 'première page sans curseur');
      assert.ok(new URL(page.url()).pathname === '/admin/notifications');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `débordement horizontal (${width}px)`);
      const html = await page.locator('[data-screen="ADM-41"]').innerHTML();
      assert.ok(!/payload|dedupeKey|sourceEvent|SECRET_MUST_NOT_RENDER/i.test(html), `données techniques de notification rendues (${width}px)`);
      await assertNoForbiddenText(`/admin/notifications ${width}px`, text);
    }
    const next = page.getByRole('button', { name: 'Charger la page suivante' });
    await next.click();
    await page.getByText('Notification de la page suivante').waitFor();
    assert.ok(notificationCursors.includes('ntf-e2e-2'), 'curseur serveur non rejoué');
    assert.equal(await page.getByRole('button', { name: 'Charger la page suivante' }).count(), 0, 'bouton de pagination conservé sans page suivante');
    assert.equal(await page.locator('button').filter({ hasText: 'Tester un envoi' }).count(), 0, 'commande d’envoi inventée');
  });

  await check('ADM-41 / ADM-42 / ADM-43 — 501, erreur, permission et gaps sans contrôles indisponibles', async () => {
    sessionMode = 'admin';
    resetNotificationFixtures();
    notificationListMode = 'empty';
    await page.setViewportSize({ width: 360, height: 900 });
    await page.goto(api.origin + '/admin/notifications');
    await page.getByText('Aucune notification In-App n’est présente').waitFor();
    assert.equal(await page.getByText('ntf-e2e-1').count(), 0, 'ligne inventée dans la page vide');
    notificationListMode = 'not-installed';
    await page.reload();
    await page.getByText('n’est pas installée dans cet environnement').first().waitFor();
    assert.equal(await page.getByText('ntf-e2e-1').count(), 0, 'liste affichée à la place du 501');
    notificationListMode = 'error';
    await page.reload();
    await page.locator('[data-state="500"]').waitFor();
    assert.ok(!(await page.locator('[data-state="500"]').innerText()).includes(SERVER_SECRET), 'message brut de notification rendu');

    resetNotificationFixtures();
    notificationReadPermission = false;
    const callsBeforePermission = notificationListCalls;
    await page.reload();
    await page.locator('[data-state="403"]').waitFor();
    assert.equal(notificationListCalls, callsBeforePermission, 'appel notification sans notifications:read:any');

    resetNotificationFixtures();
    for (const [path, code] of [['/admin/notifications/gabarits', 'ADM-42'], ['/admin/notifications/delivrabilite', 'ADM-43']] as const) {
      await page.goto(api.origin + path);
      await page.locator(`[data-screen="${code}"]`).waitFor();
      await page.locator('[data-backend-gap="true"]').first().waitFor();
      assert.equal(await page.locator(`[data-screen="${code}"] form`).count(), 0, `${code} : formulaire indisponible rendu`);
      assert.equal(await page.locator(`[data-screen="${code}"] button`).count(), 0, `${code} : bouton indisponible rendu`);
      await assertNoForbiddenText(path, await screenText());
    }
    assert.equal(notificationListCalls, 0, 'ADM-42/43 n’appellent pas la seule lecture notification');
  });

  await check('ADM-44/45/46 — session réelle, absence d’API ops, valeurs inconnues et aucun geste fictif (360/1440 px)', async () => {
    sessionMode = 'admin';
    const opsRequests: string[] = [];
    const trackOps = (request: { url(): string }) => {
      if (request.url().includes('/api/v1/admin/ops/')) opsRequests.push(request.url());
    };
    page.on('request', trackOps);
    try {
      for (const width of [360, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const [path, code] of [
          ['/admin/ops/queues', 'ADM-44'],
          ['/admin/ops/queues/file-inconnue', 'ADM-45'],
          ['/admin/ops/cron', 'ADM-46'],
        ] as const) {
          await page.goto(api.origin + path);
          const screen = page.locator(`[data-screen="${code}"]`);
          await screen.waitFor();
          await screen.locator('[data-backend-gap="true"]').waitFor();
          const text = await screen.innerText();
          assert.ok(text.includes('—') && says(text, 'Source absente'), `${code} : absence de valeur non annoncée`);
          assert.ok(says(text, 'BACKEND_GAP'), `${code} : capacité absente non signalée`);
          assert.equal(await screen.locator('form, button').count(), 0, `${code} : action sans handler`);
          assert.equal(await screen.locator('tbody tr').count(), 1, `${code} : seule la ligne d’état vide doit être rendue`);
          assert.ok(says(await screen.locator('tbody tr').innerText(), 'Source de supervision indisponible'), `${code} : la ligne vide ne doit pas suggérer une file saine`);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${code} : débordement à ${width}px`);
          await assertNoForbiddenText(path, text);
        }
      }
      assert.deepEqual(opsRequests, [], 'aucun appel vers une API ops inexistante');
      sessionMode = 'employer';
      await page.goto(api.origin + '/admin/ops/queues');
      await page.locator('[data-state="403"]').waitFor();
      assert.equal(await page.locator('[data-screen="ADM-44"]').count(), 0, 'ADMIN seul');
      assert.deepEqual(opsRequests, [], 'aucun appel ops après refus');
    } finally {
      page.off('request', trackOps);
      sessionMode = 'admin';
    }
  });

  await check('ADM-47/48/49 — données indisponibles, actions désactivées, routes, navigation et garde de session (360/1440 px)', async () => {
    sessionMode = 'admin';
    const unavailableRequests: string[] = [];
    const trackUnavailableRequests = (request: { url(): string }) => {
      const url = request.url();
      if (url.includes('/api/v1/admin/ops/') || url.endsWith('/api/v1/admin/incidents')) unavailableRequests.push(url);
    };
    page.on('request', trackUnavailableRequests);
    const paths = [
      ['/admin/ops/slo', 'ADM-47'],
      ['/admin/ops/dead-letter', 'ADM-48'],
      ['/admin/ops/incidents/inc-e2e-unverified', 'ADM-49'],
    ] as const;
    try {
      for (const width of [360, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const [path, code] of paths) {
          await page.goto(api.origin + path);
          const screen = page.locator(`[data-screen="${code}"]`);
          await screen.waitFor();
          await screen.locator('[data-backend-gap="true"]').last().waitFor();
          const text = await screen.innerText();
          assert.ok(says(text, 'BACKEND_GAP'), `${code} : écart serveur non signalé`);
          assert.ok(says(text, 'Indisponible'), `${code} : action absente non explicitée`);
          assert.equal(await screen.locator('form').count(), 0, `${code} : formulaire sans handler`);
          assert.ok(await screen.locator('button').count() > 0, `${code} : actions prévues non représentées`);
          assert.equal(await screen.locator('button:not([disabled])').count(), 0, `${code} : une action absente est activable`);
          assert.ok(await screen.locator('button[data-unavailable-action]').count() > 0, `${code} : contrôle indisponible non identifié`);
          if (code === 'ADM-47' || code === 'ADM-48') {
            const values = (await screen.locator('.lbm-admin__kpi-value').allTextContents()).map((value) => value.trim());
            assert.ok(values.length > 0, `${code} : repères absents`);
            assert.ok(values.every((value) => value === '—'), `${code} : valeur de métrique fictive (${values.join(', ')})`);
            assert.equal(await screen.locator('table tbody tr').count(), 1, `${code} : aucune ligne serveur ne doit être suggérée`);
            const emptyText = await screen.locator('table tbody tr').innerText();
            assert.ok(says(emptyText, 'Aucune'), `${code} : indisponibilité de la liste non dite`);
          }
          if (code === 'ADM-49') {
            assert.equal(await screen.locator('[data-unverified-reference]').innerText(), 'inc-e2e-unverified', 'la référence de chemin doit rester non vérifiée');
            assert.ok(says(text, 'non vérifiée'), 'statut de la référence non expliqué');
            const unknownFacts = (await screen.locator('[aria-label="Champs d’incident non disponibles"] dd').allTextContents()).map((value) => value.trim());
            assert.deepEqual(unknownFacts, ['—', '—', '—', '—', '—'], 'sévérité/portée/statut/propriétaire/durée ne doivent pas être déduits');
          }
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${code} : débordement à ${width}px`);
          await assertNoForbiddenText(path, text);
        }
      }
      assert.deepEqual(unavailableRequests, [], 'aucune API ops ni liste métier générique utilisée comme substitut');

      await page.goto(api.origin + '/admin/ops/queues');
      const queueScreen = page.locator('[data-screen="ADM-44"]');
      await queueScreen.waitFor();
      assert.equal(await queueScreen.locator('a[href="/admin/ops/slo"]').count(), 1, 'lien depuis les files vers le diagnostic SLO absent');
      assert.equal(await queueScreen.locator('a[href="/admin/ops/dead-letter"]').count(), 1, 'lien depuis les files vers la dead-letter absent');

      sessionMode = 'employer';
      for (const [path, code] of paths) {
        await page.goto(api.origin + path);
        await page.locator('[data-state="403"]').waitFor();
        assert.equal(await page.locator(`[data-screen="${code}"]`).count(), 0, `${code} : écran rendu sans session ADMIN`);
      }
      sessionMode = 'anonymous';
      await page.goto(api.origin + '/admin/ops/slo');
      await page.locator('[data-state="401"]').waitFor();
      sessionMode = 'error';
      await page.goto(api.origin + '/admin/ops/dead-letter');
      await page.locator('[data-state="500"]').waitFor();
      assert.ok(!(await page.locator('[data-state="500"]').innerText()).includes(SERVER_SECRET), 'erreur de session brute rendue');
      assert.deepEqual(unavailableRequests, [], 'aucune donnée ops après refus ou erreur de session');
    } finally {
      page.off('request', trackUnavailableRequests);
      sessionMode = 'admin';
    }
  });

  await check('ADM-50/51 — sécurité diagnostique sans détection inventée, garde et actions inertes (360/1440 px)', async () => {
    const paths = [['/admin/securite', 'ADM-50'], ['/admin/securite/idor', 'ADM-51']] as const;
    const securityRequests: string[] = [];
    const trackSecurityRequests = (request: { url(): string }) => {
      if (request.url().includes('/api/v1/admin/security/') || request.url().endsWith('/api/v1/admin/audit') || request.url().endsWith('/api/v1/admin/incidents')) securityRequests.push(request.url());
    };
    page.on('request', trackSecurityRequests);
    try {
      sessionMode = 'admin';
      for (const width of [360, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const [path, code] of paths) {
          await page.goto(api.origin + path);
          const screen = page.locator(`[data-screen="${code}"]`);
          await screen.waitFor();
          await screen.locator('[data-backend-gap="true"]').last().waitFor();
          const text = await screen.innerText();
          assert.ok(says(text, 'BACKEND_GAP') && says(text, 'Indisponible'), `${code} : absence de source/action non dite`);
          assert.ok(await screen.locator('[data-no-invented-security]').count() > 0, `${code} : absence de mesures non explicitée`);
          const values = (await screen.locator('.lbm-admin__kpi-value').allTextContents()).map((value) => value.trim());
          assert.ok(values.length > 0 && values.every((value) => value === '—'), `${code} : métrique fictive`);
          assert.equal(await screen.locator('table tbody tr').count(), 1, `${code} : liste factice`);
          assert.ok(says(await screen.locator('table tbody tr').innerText(), 'aucune'), `${code} : source absente non dite`);
          assert.equal(await screen.locator('form').count(), 0, `${code} : formulaire sans handler`);
          assert.ok(await screen.locator('button[data-unavailable-action]').count() > 0, `${code} : commande absente non identifiée`);
          assert.equal(await screen.locator('button:not([disabled])').count(), 0, `${code} : commande absente activable`);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${code} : débordement à ${width}px`);
          await assertNoForbiddenText(path, text);
        }
      }
      assert.deepEqual(securityRequests, [], 'aucune lecture de sécurité inventée ou collection de contrôle utilisée comme substitut');
      sessionMode = 'employer';
      for (const [path, code] of paths) {
        await page.goto(api.origin + path);
        await page.locator('[data-state="403"]').waitFor();
        assert.equal(await page.locator(`[data-screen="${code}"]`).count(), 0, `${code} : écran sans autorisation`);
      }
      sessionMode = 'anonymous';
      await page.goto(api.origin + paths[0][0]);
      await page.locator('[data-state="401"]').waitFor();
      sessionMode = 'error';
      await page.goto(api.origin + paths[1][0]);
      await page.locator('[data-state="500"]').waitFor();
      assert.ok(!(await page.locator('[data-state="500"]').innerText()).includes(SERVER_SECRET), 'détail de session divulgué');
      assert.deepEqual(securityRequests, [], 'aucune lecture sensible après refus ou erreur');
    } finally {
      page.off('request', trackSecurityRequests);
      sessionMode = 'admin';
    }
  });

  await check('ADM-57/58 — topologie et Worker edge diagnostiques, sans mesure ni action simulée (360/1440 px)', async () => {
    sessionMode = 'admin';
    const paths = [['/admin/infra', 'ADM-57'], ['/admin/infra/worker', 'ADM-58']] as const;
    const infrastructureRequests: string[] = [];
    const trackInfrastructureRequests = (request: { url(): string }) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/v1/admin/infra/') || path === '/healthz') infrastructureRequests.push(request.url());
    };
    page.on('request', trackInfrastructureRequests);
    try {
      for (const width of [360, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const [path, code] of paths) {
          await page.goto(api.origin + path);
          const screen = page.locator(`[data-screen="${code}"]`);
          await screen.waitFor();
          await screen.locator('[data-backend-gap="true"]').last().waitFor();
          const text = await screen.innerText();
          assert.ok(says(text, 'BACKEND_GAP'), `${code} : absence de contrat ADMIN non signalée`);
          assert.equal(await screen.locator('[data-no-invented-infrastructure]').count(), 1, `${code} : mesures absentes non expliquées`);
          const values = (await screen.locator('.lbm-admin__kpi-value').allTextContents()).map((value) => value.trim());
          assert.ok(values.length > 0 && values.every((value) => value === '—'), `${code} : état ou mesure inventé (${values.join(', ')})`);
          assert.equal(await screen.locator('form').count(), 0, `${code} : formulaire sans handler`);
          assert.ok(await screen.locator('button[data-unavailable-action]').count() > 0, `${code} : actions absentes non identifiées`);
          assert.equal(await screen.locator('button:not([disabled])').count(), 0, `${code} : action d’infrastructure activable`);
          if (code === 'ADM-58') {
            assert.equal(await screen.locator('table tbody tr').count(), 1, 'aucun déploiement serveur ne doit être suggéré');
            assert.ok(says(await screen.locator('table tbody tr').innerText(), 'Aucune liste'), 'liste de déploiements absente non expliquée');
          }
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${code} : débordement à ${width}px`);
          await assertNoForbiddenText(path, text);
        }
      }
      await page.goto(api.origin + '/admin/infra');
      const topology = page.locator('[data-screen="ADM-57"]');
      await topology.waitFor();
      assert.equal(await topology.locator('a[href="/admin/infra/worker"]').count(), 1, 'navigation vers ADM-58 absente');
      await topology.locator('a[href="/admin/infra/worker"]').click();
      await page.locator('[data-screen="ADM-58"]').waitFor();
      assert.equal(await page.locator('[data-screen="ADM-58"] a[href="/admin/infra"]').count(), 1, 'retour vers ADM-57 absent');
      assert.deepEqual(infrastructureRequests, [], 'aucune lecture /admin/infra ni /healthz utilisée comme substitut');

      sessionMode = 'employer';
      for (const [path, code] of paths) {
        await page.goto(api.origin + path);
        await page.locator('[data-state="403"]').waitFor();
        assert.equal(await page.locator(`[data-screen="${code}"]`).count(), 0, `${code} : accès non-ADMIN rendu`);
      }
      sessionMode = 'anonymous';
      await page.goto(api.origin + paths[0][0]);
      await page.locator('[data-state="401"]').waitFor();
      sessionMode = 'error';
      await page.goto(api.origin + paths[1][0]);
      await page.locator('[data-state="500"]').waitFor();
      assert.ok(!(await page.locator('[data-state="500"]').innerText()).includes(SERVER_SECRET), 'erreur de session brute rendue');
      assert.deepEqual(infrastructureRequests, [], 'aucune donnée infra après refus ou erreur de session');
    } finally {
      page.off('request', trackInfrastructureRequests);
      sessionMode = 'admin';
    }
  });

  assert.deepEqual(errors, [], `erreurs de page : ${errors.join(' · ')}`);
  console.log(`Total: ${passed}/${passed} vérifications navigateur PASS (fixtures HTTP locales ; aucune donnée de démonstration dans l’application).`);
} finally {
  await browser?.close();
  await demoServer?.close();
  await apiServer?.close();
}
