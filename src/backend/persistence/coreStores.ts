/**
 * LE LABEUR — P0-A — implémentation MÉMOIRE du noyau relationnel.
 *
 * Usages :
 *  - tests et parité de contrat avec l'adaptateur PostgreSQL ;
 *  - mode `memory` de la composition Worker (tests/démo serveur uniquement).
 *
 * Cette implémentation n'est branchée sur AUCUNE route : en P0-A, les handlers
 * métier restent absents (501). Elle ne remplace pas `MockService`, qui reste
 * le mode DEMO par défaut du navigateur.
 */

import type { UserRole } from '../../types';
import { ADMIN_PERMISSIONS, permissionsForRole } from '../identity/permissions';
import type { Permission } from '../productionContracts';
import {
  APPLICATION_STATUS_VALUES,
  assertStatusDomain,
  clampStoreLimit,
  CONTRACT_STATUS_VALUES,
  CoreStoreError,
  OFFER_STATUS_VALUES,
  PROPOSAL_STATUS_VALUES,
  type ApplicationRecord,
  type ApplicationStore,
  type ContractRecord,
  type ContractStore,
  type CoreStores,
  type OfferRecord,
  type OfferStore,
  type PermissionStore,
  type ProposalRecord,
  type ProposalStore,
} from './coreRecords';

export interface InMemoryCoreStoreSeed {
  offers?: readonly OfferRecord[];
  applications?: readonly ApplicationRecord[];
  contracts?: readonly ContractRecord[];
  proposals?: readonly ProposalRecord[];
  rolePermissions?: Partial<Record<UserRole, readonly Permission[]>>;
  userPermissions?: Record<string, readonly Permission[]>;
}

export function createInMemoryCoreStores(seed: InMemoryCoreStoreSeed = {}): CoreStores {
  const offers = new Map<string, OfferRecord>();
  const applications = new Map<string, ApplicationRecord>();
  const contracts = new Map<string, ContractRecord>();
  const proposals = new Map<string, ProposalRecord>();

  for (const offer of seed.offers ?? []) {
    assertStatusDomain(offer.status, OFFER_STATUS_VALUES, 'offers');
    offers.set(offer.id, { ...offer });
  }
  for (const application of seed.applications ?? []) {
    assertStatusDomain(application.status, APPLICATION_STATUS_VALUES, 'applications');
    applications.set(application.id, { ...application });
  }
  for (const contract of seed.contracts ?? []) {
    assertStatusDomain(contract.status, CONTRACT_STATUS_VALUES, 'contracts');
    contracts.set(contract.id, { ...contract });
  }
  for (const proposal of seed.proposals ?? []) {
    assertStatusDomain(proposal.status, PROPOSAL_STATUS_VALUES, 'proposals');
    proposals.set(proposal.id, { ...proposal });
  }

  const rolePermissions: Partial<Record<UserRole, readonly Permission[]>> = {
    CANDIDATE: permissionsForRole('CANDIDATE'),
    EMPLOYER: permissionsForRole('EMPLOYER'),
    ADMIN: ADMIN_PERMISSIONS,
    ...seed.rolePermissions,
  };
  const userPermissions = new Map<string, readonly Permission[]>(Object.entries(seed.userPermissions ?? {}));

  const offerStore: OfferStore = {
    async create(record) {
      assertStatusDomain(record.status, OFFER_STATUS_VALUES, 'offers');
      if (offers.has(record.id)) {
        throw new CoreStoreError('DUPLICATE', 'offers', `Offre ${record.id} déjà persistée.`);
      }
      offers.set(record.id, { ...record });
      return { ...record };
    },
    async findById(offerId) {
      const record = offers.get(offerId);
      return record ? { ...record } : null;
    },
    async findByIdForShare(offerId) {
      // The memory adapter is single-process and has no database row locks.
      const record = offers.get(offerId);
      return record ? { ...record } : null;
    },

    async listByEmployer(employerId, limit) {
      const bounded = clampStoreLimit(limit);
      return [...offers.values()]
        .filter(offer => offer.employerId === employerId)
        .sort((left, right) => right.postedDate.localeCompare(left.postedDate) || left.id.localeCompare(right.id))
        .slice(0, bounded)
        .map(offer => ({ ...offer }));
    },
    async updateStatus(offerId, status, updatedAt) {
      assertStatusDomain(status, OFFER_STATUS_VALUES, 'offers');
      const record = offers.get(offerId);
      if (!record) return null;
      const updated: OfferRecord = { ...record, status, updatedAt };
      offers.set(offerId, updated);
      return { ...updated };
    },
    async listPublic(limit, filter) {
      const bounded = clampStoreLimit(limit);
      return [...offers.values()]
        .filter(offer => {
          if (offer.status !== 'ACTIVE') return false;
          if (filter?.departmentId?.trim() && offer.departmentId !== filter.departmentId.trim()) return false;
          if (filter?.communeId?.trim() && offer.municipalityId !== filter.communeId.trim()) return false;
          if (filter?.contractType?.trim() && offer.contractType !== filter.contractType.trim()) return false;
          if (filter?.searchQuery?.trim()) {
            const q = filter.searchQuery.trim().toLowerCase();
            const matches = offer.title.toLowerCase().includes(q)
              || (offer.summary || '').toLowerCase().includes(q)
              || offer.location.toLowerCase().includes(q);
            if (!matches) return false;
          }
          return true;
        })
        .sort((left, right) => right.postedDate.localeCompare(left.postedDate) || left.id.localeCompare(right.id))
        .slice(0, bounded)
        .map(offer => ({ ...offer }));
    },
  };

  const applicationStore: ApplicationStore = {
    async create(record) {
      assertStatusDomain(record.status, APPLICATION_STATUS_VALUES, 'applications');
      if (applications.has(record.id)) {
        throw new CoreStoreError('DUPLICATE', 'applications', `Candidature ${record.id} déjà persistée.`);
      }
      const duplicate = [...applications.values()].some(
        candidate => candidate.offerId === record.offerId && candidate.candidateId === record.candidateId,
      );
      if (duplicate) {
        throw new CoreStoreError('DUPLICATE', 'applications', 'Une candidature existe déjà pour cette offre et ce candidat.');
      }
      applications.set(record.id, { ...record });
      return { ...record };
    },
    async findById(applicationId) {
      const record = applications.get(applicationId);
      return record ? { ...record } : null;
    },
    async findByIdForUpdate(applicationId) {
      // Aucun verrou de ligne en mémoire : le compare-and-set ci-dessous reste
      // la garantie d'atomicité de cet adaptateur.
      return applicationStore.findById(applicationId);
    },
    async compareAndSetStatus(applicationId, expectedStatus, patch) {
      assertStatusDomain(patch.status, APPLICATION_STATUS_VALUES, 'applications');
      assertStatusDomain(expectedStatus, APPLICATION_STATUS_VALUES, 'applications');
      const record = applications.get(applicationId);
      if (!record || record.status !== expectedStatus) return null;
      const updated: ApplicationRecord = {
        ...record,
        status: patch.status,
        updatedAt: patch.updatedAt,
        history: [...record.history, { ...patch.historyEntry }],
        ...(patch.note !== undefined ? { note: patch.note } : {}),
      };
      applications.set(applicationId, updated);
      return { ...updated, history: updated.history.map(entry => ({ ...entry })) };
    },
    async findByOfferAndCandidate(offerId, candidateId) {
      const record = [...applications.values()].find(
        application => application.offerId === offerId && application.candidateId === candidateId,
      );
      return record ? { ...record } : null;
    },
    async listByOffer(offerId, limit, afterId) {
      const bounded = clampStoreLimit(limit);
      const ordered = [...applications.values()]
        .filter(application => application.offerId === offerId)
        .sort((left, right) => left.appliedDate.localeCompare(right.appliedDate) || left.id.localeCompare(right.id));
      let start = 0;
      if (afterId) {
        const cursorIndex = ordered.findIndex(application => application.id === afterId);
        if (cursorIndex < 0) return [];
        start = cursorIndex + 1;
      }
      return ordered.slice(start, start + bounded).map(application => ({ ...application }));
    },
    async listByCandidate(candidateId, limit) {
      const bounded = clampStoreLimit(limit);
      return [...applications.values()]
        .filter(application => application.candidateId === candidateId)
        .sort((left, right) => right.appliedDate.localeCompare(left.appliedDate) || left.id.localeCompare(right.id))
        .slice(0, bounded)
        .map(application => ({ ...application }));
    },
    async updateStatus(applicationId, status, updatedAt, contractId) {
      assertStatusDomain(status, APPLICATION_STATUS_VALUES, 'applications');
      const record = applications.get(applicationId);
      if (!record) return null;
      const updated: ApplicationRecord = {
        ...record,
        status,
        updatedAt,
        ...(contractId ? { contractId } : {}),
      };
      applications.set(applicationId, updated);
      return { ...updated };
    },
    async attachContract(applicationId, contractId, updatedAt) {
      const record = applications.get(applicationId);
      if (!record || record.contractId) return null;
      const updated: ApplicationRecord = { ...record, contractId, updatedAt };
      applications.set(applicationId, updated);
      return { ...updated };
    },
  };

  const contractStore: ContractStore = {
    async create(record) {
      assertStatusDomain(record.status, CONTRACT_STATUS_VALUES, 'contracts');
      if (contracts.has(record.id)) {
        throw new CoreStoreError('DUPLICATE', 'contracts', `Contrat ${record.id} déjà persisté.`);
      }
      contracts.set(record.id, { ...record });
      return { ...record };
    },
    async findById(contractId) {
      const record = contracts.get(contractId);
      return record ? { ...record } : null;
    },
    async findByIdForUpdate(contractId) {
      // Aucun verrou de ligne en mémoire : le compare-and-set / sign ci-dessous
      // restent les garanties d'atomicité de cet adaptateur.
      return contractStore.findById(contractId);
    },
    async compareAndSetStatus(contractId, expectedStatus, patch) {
      assertStatusDomain(patch.status, CONTRACT_STATUS_VALUES, 'contracts');
      assertStatusDomain(expectedStatus, CONTRACT_STATUS_VALUES, 'contracts');
      const record = contracts.get(contractId);
      if (!record || record.status !== expectedStatus) return null;
      const updated: ContractRecord = {
        ...record,
        status: patch.status,
        updatedAt: patch.updatedAt,
        history: [...record.history, { ...patch.historyEntry }],
        // `SEND` pose la signature employeur dans la même écriture (modèle réel).
        ...(patch.signatureParty === 'EMPLOYER'
          ? { employerSigned: true, employerSignedAt: patch.updatedAt }
          : {}),
        ...(patch.signatureParty === 'EMPLOYEE'
          ? { employeeSigned: true, employeeSignedAt: patch.updatedAt }
          : {}),
      };
      contracts.set(contractId, updated);
      return { ...updated, history: updated.history.map(entry => ({ ...entry })) };
    },
    async sign(contractId, party, patch) {
      const record = contracts.get(contractId);
      if (!record) return null;
      if (record.status !== 'SIGNATURE') return null;
      if (party === 'EMPLOYER' && record.employerSigned) return null;
      if (party === 'EMPLOYEE' && record.employeeSigned) return null;
      const updated: ContractRecord = {
        ...record,
        updatedAt: patch.signedAt,
        history: [...record.history, { ...patch.historyEntry }],
        ...(party === 'EMPLOYER'
          ? { employerSigned: true, employerSignedAt: patch.signedAt }
          : { employeeSigned: true, employeeSignedAt: patch.signedAt }),
      };
      contracts.set(contractId, updated);
      return { ...updated, history: updated.history.map(entry => ({ ...entry })) };
    },
    async listByEmployer(employerId, limit) {
      const bounded = clampStoreLimit(limit);
      return [...contracts.values()]
        .filter(contract => contract.employerId === employerId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
        .slice(0, bounded)
        .map(contract => ({ ...contract }));
    },
    async listByEmployee(employeeId, limit) {
      const bounded = clampStoreLimit(limit);
      return [...contracts.values()]
        .filter(contract => contract.employeeId === employeeId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
        .slice(0, bounded)
        .map(contract => ({ ...contract }));
    },
    async listAll(limit, afterId) {
      const bounded = clampStoreLimit(limit);
      const ordered = [...contracts.values()]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
      let start = 0;
      if (afterId) {
        const cursorIndex = ordered.findIndex(contract => contract.id === afterId);
        if (cursorIndex < 0) return [];
        start = cursorIndex + 1;
      }
      return ordered.slice(start, start + bounded).map(contract => ({ ...contract }));
    },
    async saveAutomationSchedule(contractId, patch) {
      const record = contracts.get(contractId);
      if (!record) return null;
      const updated: ContractRecord = {
        ...record,
        paymentSchedule: patch.paymentSchedule.map(entry => ({ ...entry })),
        commissionLedger: patch.commissionLedger.map(entry => ({ ...entry })),
        commissionAmountDue: patch.commissionAmountDue,
        commissionStatus: patch.commissionStatus,
        updatedAt: patch.updatedAt,
      };
      contracts.set(contractId, updated);
      return {
        ...updated,
        paymentSchedule: updated.paymentSchedule.map(entry => ({ ...entry })),
        commissionLedger: updated.commissionLedger.map(entry => ({ ...entry })),
        history: updated.history.map(entry => ({ ...entry })),
      };
    },
    async updateStatus(contractId, status, updatedAt) {
      assertStatusDomain(status, CONTRACT_STATUS_VALUES, 'contracts');
      const record = contracts.get(contractId);
      if (!record) return null;
      const updated: ContractRecord = { ...record, status, updatedAt };
      contracts.set(contractId, updated);
      return { ...updated };
    },
  };

  const proposalStore: ProposalStore = {
    async create(record) {
      assertStatusDomain(record.status, PROPOSAL_STATUS_VALUES, 'proposals');
      if (proposals.has(record.id)) {
        throw new CoreStoreError('DUPLICATE', 'proposals', `Proposition ${record.id} déjà persistée.`);
      }
      proposals.set(record.id, { ...record });
      return { ...record };
    },
    async findById(proposalId) {
      const record = proposals.get(proposalId);
      return record ? { ...record } : null;
    },
    async findByIdForUpdate(proposalId) {
      // Aucun verrou de ligne en mémoire : le compare-and-set ci-dessous reste
      // la garantie d'atomicité de cet adaptateur.
      return proposalStore.findById(proposalId);
    },
    async compareAndSetStatus(proposalId, expectedStatus, patch) {
      assertStatusDomain(patch.status, PROPOSAL_STATUS_VALUES, 'proposals');
      assertStatusDomain(expectedStatus, PROPOSAL_STATUS_VALUES, 'proposals');
      const record = proposals.get(proposalId);
      if (!record || record.status !== expectedStatus) return null;
      const updated: ProposalRecord = {
        ...record,
        status: patch.status,
        updatedAt: patch.updatedAt,
        ...(patch.revisionNotes !== undefined ? { revisionNotes: patch.revisionNotes } : {}),
      };
      proposals.set(proposalId, updated);
      return { ...updated };
    },
    async listAll(limit, afterId) {
      const bounded = clampStoreLimit(limit);
      const ordered = [...proposals.values()]
        .sort((left, right) => right.sentAt.localeCompare(left.sentAt) || left.id.localeCompare(right.id));
      let start = 0;
      if (afterId) {
        const cursorIndex = ordered.findIndex(proposal => proposal.id === afterId);
        if (cursorIndex < 0) return [];
        start = cursorIndex + 1;
      }
      return ordered.slice(start, start + bounded).map(proposal => ({ ...proposal }));
    },
    async attachContract(proposalId, contractId, updatedAt) {
      const record = proposals.get(proposalId);
      if (!record || record.contractId) return null;
      const updated: ProposalRecord = { ...record, contractId, updatedAt };
      proposals.set(proposalId, updated);
      return { ...updated };
    },
  };

  const permissionStore: PermissionStore = {
    async listRolePermissions(role) {
      return [...(rolePermissions[role] ?? [])];
    },
    async listUserPermissions(userId) {
      return [...(userPermissions.get(userId) ?? [])];
    },
    async listEffectivePermissions(userId, role) {
      const effective = new Set<string>([...(rolePermissions[role] ?? []), ...(userPermissions.get(userId) ?? [])]);
      return [...effective].sort() as Permission[];
    },
  };

  return {
    offers: offerStore,
    applications: applicationStore,
    contracts: contractStore,
    proposals: proposalStore,
    permissions: permissionStore,
  };
}
