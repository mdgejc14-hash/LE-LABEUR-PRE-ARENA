import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, LockKeyhole, RefreshCw, UnlockKeyhole, XCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { appRepositories as repositories } from '../repositories/provider';
import { Contract, CommissionPaymentRecord, PaymentDeclaration, SystemAuditLog, UserProfile, Incident, ReplacementDossier } from '../types';
import { AdminPaymentDeclarationDetail, AdminPaymentsVerification } from './admin/AdminPaymentsVerification';

const daysLateFor = (dateValue?: string): number => {
  if (!dateValue) return 0;
  const due = new Date(`${dateValue}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(due)) return 0;
  return Math.max(0, Math.floor((Date.now() - due) / 86400000));
};

const hasJ3Due = (contract: Contract): boolean => contract.paymentSchedule.some(entry => {
  const salaryLate = ['DUE', 'REJECTED'].includes(entry.salaryStatus) && daysLateFor(entry.salaryDueDate) >= 3;
  const commissionLate = entry.commissionAmount > 0 && ['DUE', 'REJECTED'].includes(entry.commissionStatus) && daysLateFor(entry.commissionDueDate) >= 3;
  return salaryLate || commissionLate;
});

export const AdminDashboardScreen: React.FC = () => {
  const {
    currentUser,
    verifyCommissionPayment,
    rejectCommissionPayment,
    blockUser,
    unblockUser,
    arbitrateIncident,
    assignReplacementCandidate,
    transferReplacementCandidate,
    finalizeReplacementContract
  } = useApp();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [payments, setPayments] = useState<CommissionPaymentRecord[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [replacements, setReplacements] = useState<ReplacementDossier[]>([]);
  // PHASE 4C — consultation ADMIN des paiements soumis (lecture seule).
  const [submittedDeclarations, setSubmittedDeclarations] = useState<PaymentDeclaration[]>([]);
  const [declarationDetail, setDeclarationDetail] = useState<PaymentDeclaration | null>(null);
  const [declarationsLoading, setDeclarationsLoading] = useState(true);
  const [declarationError, setDeclarationError] = useState<string>('');
  const [openingDeclarationId, setOpeningDeclarationId] = useState<string>('');
  const [auditLogs, setAuditLogs] = useState<SystemAuditLog[]>([]);
  const [replacementSelections, setReplacementSelections] = useState<Record<string, string>>({});
  const [incidentNotes, setIncidentNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  const refresh = useCallback(async () => {
    if (!currentUser || currentUser.role !== 'ADMIN') return;
    setError('');
    setDeclarationsLoading(true);
    try {
      const [nextUsers, nextContracts, nextPayments, nextIncidents, nextReplacements, nextDeclarations, nextAuditLogs] = await Promise.all([
        repositories.getAllUsers(currentUser.id),
        repositories.getContractsByUser(currentUser.id, 'ADMIN'),
        repositories.getAllPaymentRecords(currentUser.id),
        repositories.getAllIncidents(currentUser.id),
        repositories.getAllReplacements(currentUser.id),
        repositories.listSubmittedPaymentDeclarations(currentUser.id),
        repositories.getAllAuditLogs(currentUser.id)
      ]);
      setUsers(nextUsers);
      setContracts(nextContracts);
      setPayments(nextPayments);
      setIncidents(nextIncidents);
      setReplacements(nextReplacements);
      setSubmittedDeclarations(nextDeclarations);
      setAuditLogs(nextAuditLogs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la supervision.');
    } finally {
      setDeclarationsLoading(false);
    }
  }, [currentUser]);

  /** Ouvre une déclaration soumise : la lecture passe par l'opération ADMIN du Repository. */
  const openDeclarationDetail = useCallback(async (paymentId: string) => {
    if (!currentUser || currentUser.role !== 'ADMIN') return;
    setOpeningDeclarationId(paymentId);
    setDeclarationError('');
    try {
      const declaration = await repositories.getSubmittedPaymentDeclaration(paymentId, currentUser.id);
      if (!declaration) throw new Error('Déclaration de paiement introuvable.');
      setDeclarationDetail(declaration);
    } catch (err) {
      setDeclarationError(err instanceof Error ? err.message : 'Impossible d’ouvrir cette déclaration.');
    } finally {
      setOpeningDeclarationId('');
    }
  }, [currentUser]);

  useEffect(() => { void refresh(); }, [refresh]);

  const employers = useMemo(() => users.filter(user => user.role === 'EMPLOYER'), [users]);
  const candidates = useMemo(() => users.filter(user => user.role === 'CANDIDATE' && user.accountStatus !== 'BLOCKED'), [users]);
  const pendingPayments = useMemo(() => payments.filter(payment => payment.status === 'PENDING_VERIFICATION'), [payments]);
  const openIncidents = useMemo(() => incidents.filter(incident => ['OPEN', 'UNDER_REVIEW'].includes(incident.status)), [incidents]);
  const blockedCount = employers.filter(user => user.accountStatus === 'BLOCKED').length;
  const j3Count = employers.filter(user => contracts.filter(contract => contract.employerId === user.id).some(hasJ3Due)).length;

  const contractsFor = (employerId: string) => contracts.filter(contract => contract.employerId === employerId);

  const execute = async (id: string, fn: () => Promise<unknown>, successMessage: string) => {
    setBusyId(id);
    setError('');
    setMessage('');
    try {
      await fn();
      setMessage(successMessage);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setBusyId('');
    }
  };

  if (!currentUser || currentUser.role !== 'ADMIN') return null;

  // PHASE 4C — détail d'une déclaration soumise, ouvert depuis la liste.
  if (declarationDetail) {
    return (
      <div className="p-4 pb-6 font-operational">
        <AdminPaymentDeclarationDetail
          declaration={declarationDetail}
          contracts={contracts}
          employers={users}
          auditLogs={auditLogs}
          onBack={() => setDeclarationDetail(null)}
        />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 font-operational">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#17233B]/50">ADMINISTRATION</p>
          <h1 className="text-xl font-semibold text-[#17233B] mt-1">Supervision LE LABEUR</h1>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="w-10 h-10 rounded-full border border-[#17233B]/10 bg-white flex items-center justify-center text-[#17233B]"
          aria-label="Actualiser"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {(message || error) && (
        <div className={`rounded-2xl px-4 py-3 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-white border border-[#17233B]/10 p-3">
          <div className="text-[10px] uppercase tracking-wide text-[#17233B]/50">Employeurs</div>
          <div className="text-xl font-semibold text-[#17233B] mt-1">{employers.length}</div>
        </div>
        <div className="rounded-2xl bg-white border border-[#17233B]/10 p-3">
          <div className="text-[10px] uppercase tracking-wide text-[#17233B]/50">J+3</div>
          <div className="text-xl font-semibold text-[#A33A2B] mt-1">{j3Count}</div>
        </div>
        <div className="rounded-2xl bg-white border border-[#17233B]/10 p-3">
          <div className="text-[10px] uppercase tracking-wide text-[#17233B]/50">Bloqués</div>
          <div className="text-xl font-semibold text-[#17233B] mt-1">{blockedCount}</div>
        </div>
      </div>

      {/* PHASE 4C — déclarations de paiement externes soumises par les employeurs (lecture seule) */}
      <AdminPaymentsVerification
        declarations={submittedDeclarations}
        contracts={contracts}
        employers={users}
        loading={declarationsLoading}
        error={declarationError}
        onOpenDeclaration={paymentId => void openDeclarationDetail(paymentId)}
        openingId={openingDeclarationId}
      />

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#17233B]">Commissions à vérifier</h2>
          <span className="text-xs text-[#17233B]/50">{pendingPayments.length}</span>
        </div>
        {pendingPayments.length === 0 ? (
          <div className="rounded-2xl bg-white border border-[#17233B]/10 p-4 text-sm text-[#17233B]/55">Aucune déclaration de commission en attente.</div>
        ) : (
          pendingPayments.map(payment => (
            <div key={payment.paymentId} className="rounded-2xl bg-white border border-[#17233B]/10 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[#17233B]">{payment.employerName}</p>
                  <p className="text-xs text-[#17233B]/55 mt-1">{payment.offerTitle} · {payment.periodKey}</p>
                  <p className="text-sm text-[#17233B] mt-2">{payment.amountSubmitted.toLocaleString()} {payment.currency}</p>
                  <p className="text-[11px] text-[#17233B]/50 mt-1">Réf. {payment.reference} · Transaction {payment.transactionId}</p>
                </div>
                <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-[#FFF2C9] text-[#7B5B00]">À vérifier</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busyId === payment.paymentId}
                  onClick={() => void execute(payment.paymentId, () => verifyCommissionPayment(payment.paymentId), 'Paiement approuvé.')}
                  className="h-10 rounded-xl bg-[#17233B] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" /> Approuver
                </button>
                <button
                  type="button"
                  disabled={busyId === payment.paymentId}
                  onClick={() => void execute(payment.paymentId, () => rejectCommissionPayment(payment.paymentId, 'Preuve ou informations à régulariser.'), 'Paiement rejeté ; l’échéance reste régularisable.')}
                  className="h-10 rounded-xl border border-[#A33A2B]/25 text-[#A33A2B] text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" /> Rejeter
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#17233B]">Incidents à arbitrer</h2>
          <span className="text-xs text-[#17233B]/50">{openIncidents.length}</span>
        </div>
        {openIncidents.length === 0 ? (
          <div className="rounded-2xl bg-white border border-[#17233B]/10 p-4 text-sm text-[#17233B]/55">Aucun incident en attente d’arbitrage.</div>
        ) : (
          openIncidents.map(incident => {
            const note = incidentNotes[incident.id] || '';
            return (
              <div key={incident.id} className="rounded-2xl bg-white border border-[#17233B]/10 p-4 space-y-3">
                <div>
                  <p className="font-semibold text-[#17233B]">{incident.offerTitle}</p>
                  <p className="text-xs text-[#17233B]/55 mt-1">{incident.employerName} ↔ {incident.employeeName}</p>
                  <p className="text-sm text-[#17233B] mt-2">{incident.reason}</p>
                  <p className="text-[11px] text-[#17233B]/55 mt-1">{incident.description}</p>
                </div>
                <input
                  type="text"
                  value={note}
                  onChange={e => setIncidentNotes(prev => ({ ...prev, [incident.id]: e.target.value }))}
                  placeholder="Note de décision administrative"
                  className="w-full h-10 px-3 bg-white border border-[#17233B]/15 rounded-xl text-xs"
                />
                <div className="grid grid-cols-3 gap-2">
                  {(['CONTINUER','ANNULER','REMPLACER'] as const).map(decision => (
                    <button
                      key={decision}
                      type="button"
                      disabled={busyId === `incident-${incident.id}-${decision}`}
                      onClick={() => void execute(
                        `incident-${incident.id}-${decision}`,
                        () => arbitrateIncident(
                          incident.id,
                          decision,
                          note.trim() || `Décision ${decision} enregistrée par l’administration.`
                        ),
                        decision === 'REMPLACER' ? 'Remplacement lancé.' : `Incident ${decision.toLowerCase()}.`
                      )}
                      className="h-10 rounded-xl border border-[#17233B]/10 bg-white text-[#17233B] text-[11px] font-semibold disabled:opacity-50"
                    >
                      {decision}
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#17233B]">Remplacements</h2>
          <span className="text-xs text-[#17233B]/50">{replacements.length}</span>
        </div>
        {replacements.length === 0 ? (
          <div className="rounded-2xl bg-white border border-[#17233B]/10 p-4 text-sm text-[#17233B]/55">Aucun dossier de remplacement.</div>
        ) : (
          replacements.map(rep => (
            <div key={rep.id} className="rounded-2xl bg-white border border-[#17233B]/10 p-4 space-y-3">
              <div>
                <p className="font-semibold text-[#17233B]">{rep.id} · {rep.urgentOfferTitle}</p>
                <p className="text-xs text-[#17233B]/55 mt-1">Statut : {rep.status} · Contrat d’origine : {rep.originalContractId}</p>
              </div>

              {rep.status === 'SOURCING_CANDIDATES' && (
                <div className="flex gap-2">
                  <select
                    value={replacementSelections[rep.id] || ''}
                    onChange={e => setReplacementSelections(prev => ({ ...prev, [rep.id]: e.target.value }))}
                    className="flex-1 h-10 px-3 bg-white border border-[#17233B]/15 rounded-xl text-xs"
                  >
                    <option value="">Sélectionner un candidat</option>
                    {candidates.map(candidate => (
                      <option key={candidate.id} value={candidate.id}>{candidate.fullName} · {candidate.publicId}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!replacementSelections[rep.id] || busyId === `select-${rep.id}`}
                    onClick={() => void execute(
                      `select-${rep.id}`,
                      () => assignReplacementCandidate(rep.id, replacementSelections[rep.id] || ''),
                      'Candidat sélectionné pour le remplacement.'
                    )}
                    className="h-10 rounded-xl bg-[#17233B] text-white px-4 text-xs font-semibold disabled:opacity-50"
                  >
                    Sélectionner
                  </button>
                </div>
              )}

              {rep.status === 'CANDIDATE_SELECTED' && (
                <button
                  type="button"
                  disabled={busyId === `transfer-${rep.id}`}
                  onClick={() => void execute(`transfer-${rep.id}`, () => transferReplacementCandidate(rep.id), 'Candidat transféré à l’employeur.')}
                  className="h-10 rounded-xl bg-[#17233B] text-white px-4 text-xs font-semibold disabled:opacity-50"
                >
                  Transférer à l’employeur
                </button>
              )}

              {rep.status === 'TRANSFERRED_TO_EMPLOYER' && (
                <button
                  type="button"
                  disabled={busyId === `finalize-${rep.id}`}
                  onClick={() => void execute(`finalize-${rep.id}`, () => finalizeReplacementContract(rep.id), 'Contrat de remplacement créé sous signature.')}
                  className="h-10 rounded-xl bg-[#17233B] text-white px-4 text-xs font-semibold disabled:opacity-50"
                >
                  Finaliser le contrat
                </button>
              )}

              {rep.status === 'CONTRACT_FINALIZED' && rep.newContractId && (
                <p className="text-xs text-emerald-700">Contrat généré : {rep.newContractId}. En attente de signature du candidat.</p>
              )}
            </div>
          ))
        )}
      </section>

      <section className="space-y-2 pb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#17233B]">Comptes employeurs</h2>
          <span className="text-xs text-[#17233B]/50">Blocage après J+3</span>
        </div>
        {employers.map(employer => {
          const employerContracts = contractsFor(employer.id);
          const j3 = employerContracts.filter(hasJ3Due).length > 0;
          const blocked = employer.accountStatus === 'BLOCKED';
          return (
            <div key={employer.id} className="rounded-2xl bg-white border border-[#17233B]/10 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[#17233B] truncate">{employer.fullName}</p>
                  <p className="text-xs text-[#17233B]/55 mt-1">{employer.publicId} · {employer.email}</p>
                  {blocked ? (
                    <p className="text-xs text-[#A33A2B] mt-2">COMPTE BLOQUÉ · {employer.blockReason || 'échéance non régularisée'}</p>
                  ) : j3 ? (
                    <p className="text-xs text-[#A33A2B] mt-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Échéance impayée depuis au moins 3 jours.</p>
                  ) : (
                    <p className="text-xs text-emerald-700 mt-2">Compte fonctionnel.</p>
                  )}
                </div>
                {blocked ? <LockKeyhole className="w-5 h-5 text-[#A33A2B]" /> : <UnlockKeyhole className="w-5 h-5 text-[#17233B]/35" />}
              </div>

              <div className="flex flex-wrap gap-2">
                {j3 && !blocked && (
                  <button
                    type="button"
                    disabled={busyId === employer.id}
                    onClick={() => void execute(`block-${employer.id}`, () => blockUser(employer.id, 'Échéance non régularisée à J+3.'), 'Compte bloqué.')}
                    className="h-10 rounded-xl bg-[#A33A2B] text-white px-4 text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
                  >
                    <LockKeyhole className="w-4 h-4" /> Bloquer
                  </button>
                )}
                {blocked && (
                  <button
                    type="button"
                    disabled={busyId === employer.id}
                    onClick={() => void execute(`unblock-${employer.id}`, () => unblockUser(employer.id), 'Compte débloqué.')}
                    className="h-10 rounded-xl bg-[#17233B] text-white px-4 text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
                  >
                    <UnlockKeyhole className="w-4 h-4" /> Déverrouiller
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
};

export default AdminDashboardScreen;
