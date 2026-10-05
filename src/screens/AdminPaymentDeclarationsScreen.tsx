import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  UnlockKeyhole,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { appRepositories as repositories } from '../repositories/provider';
import { EditorialButton } from '../components/common/EditorialButton';
import { EditorialSheet } from '../components/common/EditorialSheet';
import { HairlineDivider } from '../components/common/HairlineDivider';
import {
  PAYMENT_HISTORY_LABELS,
  PAYMENT_KIND_LABELS,
  PAYMENT_METHODS,
  PAYMENT_STATUS_LABELS,
  daysLateForPayment,
  evaluatePaymentBlockingRule,
  isPaymentAwaitingAdminAction,
} from '../domain/paymentDeclarations';
import type { PaymentBlockingEvaluation } from '../repositories/interfaces';
import type {
  PaymentDeclaration,
  PaymentDeclarationKind,
  PaymentDeclarationStatus,
  UserProfile,
} from '../types';

const STATUS_STYLES: Record<PaymentDeclarationStatus, string> = {
  DRAFT: 'bg-[#17233B]/5 text-[#17233B]/70 border-[#17233B]/10',
  SUBMITTED: 'bg-[#FFA800]/10 text-[#7B5B00] border-[#FFA800]/25',
  UNDER_REVIEW: 'bg-[#B5CEDB]/40 text-[#17233B] border-[#17233B]/15',
  APPROVED: 'bg-[#1BA64B]/10 text-[#14662F] border-[#1BA64B]/25',
  REJECTED: 'bg-[#E23D3D]/8 text-[#A33A2B] border-[#E23D3D]/25',
  RESUBMITTED: 'bg-[#B5CEDB]/40 text-[#17233B] border-[#17233B]/15',
};

const STATUS_FILTERS: Array<{ id: 'ALL' | PaymentDeclarationStatus; label: string }> = [
  { id: 'ALL', label: 'Tous les statuts' },
  { id: 'SUBMITTED', label: 'Soumises — à vérifier' },
  { id: 'UNDER_REVIEW', label: 'En cours de vérification' },
  { id: 'RESUBMITTED', label: 'Régularisées — à re-vérifier' },
  { id: 'APPROVED', label: 'Approuvées' },
  { id: 'REJECTED', label: 'Rejetées' },
  { id: 'DRAFT', label: 'Brouillons' },
];

const formatDateTime = (value?: string): string =>
  value ? new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const formatDay = (value?: string): string =>
  value ? new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const AdminPaymentDeclarationsScreen: React.FC = () => {
  const {
    currentUser,
    contracts,
    paymentDeclarations,
    refreshPaymentDeclarations,
    startPaymentDeclarationReview,
    approvePaymentDeclaration,
    rejectPaymentDeclaration,
    blockEmployerForPayment,
    unblockEmployerForPayment,
  } = useApp();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PaymentDeclarationStatus>('ALL');
  const [kindFilter, setKindFilter] = useState<'ALL' | PaymentDeclarationKind>('ALL');
  const [onlyAwaiting, setOnlyAwaiting] = useState(false);
  const [openId, setOpenId] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [approveNote, setApproveNote] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [blockingEvaluation, setBlockingEvaluation] = useState<PaymentBlockingEvaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadUsers = useCallback(async () => {
    if (!currentUser || currentUser.role !== 'ADMIN') return;
    try {
      setUsers(await repositories.getAllUsers(currentUser.id));
    } catch {
      setUsers([]);
    }
  }, [currentUser]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const refreshAll = useCallback(async () => {
    await refreshPaymentDeclarations();
    await loadUsers();
  }, [refreshPaymentDeclarations, loadUsers]);

  const awaitingCount = useMemo(
    () => paymentDeclarations.filter(item => isPaymentAwaitingAdminAction(item.status)).length,
    [paymentDeclarations],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return paymentDeclarations.filter(item => {
      if (onlyAwaiting && !isPaymentAwaitingAdminAction(item.status)) return false;
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (kindFilter !== 'ALL' && item.kind !== kindFilter) return false;
      if (query) {
        const haystack = [item.id, item.reference, item.transactionId, item.employerName, item.contractTitle, item.periodKey]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [paymentDeclarations, search, statusFilter, kindFilter, onlyAwaiting]);

  const openDeclaration = useCallback(async (declaration: PaymentDeclaration) => {
    setOpenId(declaration.id);
    setRejectReason('');
    setApproveNote('');
    setBlockReason('');
    setBlockingEvaluation(null);
    setError('');
    setMessage('');
    // Ouverture du dossier = prise en charge de la vérification (traçable).
    try {
      await startPaymentDeclarationReview(declaration.id);
    } catch {
      // La lecture du dossier reste possible même si la prise en charge échoue.
    }
  }, [startPaymentDeclarationReview]);

  const selected = useMemo(
    () => paymentDeclarations.find(item => item.id === openId) ?? null,
    [paymentDeclarations, openId],
  );

  const employer = useMemo(
    () => (selected ? users.find(user => user.id === selected.employerId) ?? null : null),
    [users, selected],
  );

  const contract = useMemo(
    () => (selected ? contracts.find(item => item.id === selected.contractId) ?? null : null),
    [contracts, selected],
  );

  // Évaluation servie par le repository (source unique, identique à l'action).
  useEffect(() => {
    if (!selected || !currentUser) {
      setBlockingEvaluation(null);
      return;
    }
    let cancelled = false;
    repositories
      .getPaymentBlockingEvaluation(selected.id, currentUser.id)
      .then(evaluation => {
        if (!cancelled) setBlockingEvaluation(evaluation);
      })
      .catch(() => {
        // Repli local d'affichage : l'action reste contrôlée côté serveur.
        if (!cancelled && selected && employer) {
          const fallback = evaluatePaymentBlockingRule({
            status: selected.status,
            dueDate: selected.dueDate,
            rejectionCount: selected.rejectionCount,
            employerBlocked: employer.accountStatus === 'BLOCKED',
          });
          setBlockingEvaluation({
            paymentId: selected.id,
            employerId: selected.employerId,
            employerName: selected.employerName,
            employerBlocked: employer.accountStatus === 'BLOCKED',
            canBlock: fallback.canBlock,
            canUnblock: fallback.canUnblock,
            ...(fallback.rule ? { rule: fallback.rule } : {}),
            label: fallback.label,
            daysLate: fallback.daysLate,
            underVerification: fallback.underVerification,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected, employer, currentUser]);

  const blocking = blockingEvaluation;

  const run = async (action: () => Promise<unknown>, success: string, close: boolean) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      setMessage(success);
      await refreshAll();
      if (close) setOpenId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setBusy(false);
    }
  };

  if (!currentUser || currentUser.role !== 'ADMIN') return null;

  return (
    <div className="p-4 space-y-4 font-operational pb-28">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="editorial-kicker">CELLULE DE CONTRÔLE · PAIEMENTS</span>
          <h1 className="text-xl font-semibold text-[#17233B] mt-1">Paiements à vérifier</h1>
          <p className="text-[11px] text-[#17233B]/55 mt-0.5">
            Déclarations de paiement externe soumises par les employeurs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshAll()}
          className="w-10 h-10 rounded-full border border-[#17233B]/10 bg-white flex items-center justify-center text-[#17233B] shrink-0"
          aria-label="Actualiser"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-white border border-[#17233B]/10 p-3">
          <div className="text-[10px] uppercase tracking-wide text-[#17233B]/50">À traiter</div>
          <div className="text-xl font-semibold text-[#7B5B00] mt-1">{awaitingCount}</div>
        </div>
        <div className="rounded-2xl bg-white border border-[#17233B]/10 p-3">
          <div className="text-[10px] uppercase tracking-wide text-[#17233B]/50">Approuvés</div>
          <div className="text-xl font-semibold text-[#14662F] mt-1">
            {paymentDeclarations.filter(item => item.status === 'APPROVED').length}
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-[#17233B]/10 p-3">
          <div className="text-[10px] uppercase tracking-wide text-[#17233B]/50">Rejetés</div>
          <div className="text-xl font-semibold text-[#A33A2B] mt-1">
            {paymentDeclarations.filter(item => item.status === 'REJECTED').length}
          </div>
        </div>
      </div>

      {message && (
        <div className="rounded-2xl px-4 py-3 text-xs bg-emerald-50 text-emerald-700 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {message}
        </div>
      )}
      {error && (
        <div className="rounded-2xl px-4 py-3 text-xs bg-red-50 text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-3 text-[#17233B]/40" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher : employeur, contrat, transaction, référence"
            className="w-full h-10 pl-9 pr-3 bg-white border border-[#17233B]/15 rounded-xl text-xs"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'ALL' | PaymentDeclarationStatus)}
          className="h-10 px-3 bg-white border border-[#17233B]/15 rounded-xl text-xs"
        >
          {STATUS_FILTERS.map(filter => (
            <option key={filter.id} value={filter.id}>{filter.label}</option>
          ))}
        </select>
        <select
          value={kindFilter}
          onChange={e => setKindFilter(e.target.value as 'ALL' | PaymentDeclarationKind)}
          className="h-10 px-3 bg-white border border-[#17233B]/15 rounded-xl text-xs"
        >
          <option value="ALL">Toutes natures</option>
          <option value="COMMISSION">Commission LE LABEUR</option>
          <option value="SALARY">Salaire du travailleur</option>
        </select>
        <label className="h-10 px-3 inline-flex items-center gap-2 bg-white border border-[#17233B]/15 rounded-xl text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={onlyAwaiting}
            onChange={e => setOnlyAwaiting(e.target.checked)}
            className="accent-[#17233B]"
          />
          À traiter uniquement
        </label>
      </div>

      <div className="bg-white border border-[#17233B]/10 rounded-[4px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#17233B]/5 text-[#17233B]/70 uppercase tracking-wider text-[10px] border-b border-[#17233B]/10">
              <tr>
                <th className="p-3">Référence</th>
                <th className="p-3">Employeur & contrat</th>
                <th className="p-3">Montant</th>
                <th className="p-3">Transaction</th>
                <th className="p-3">Statut</th>
                <th className="p-3 text-right">Dossier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#17233B]/5">
              {filtered.map(item => (
                <tr key={item.id} className="hover:bg-[#F3F3EC]/60 transition-colors">
                  <td className="p-3">
                    <div className="font-mono font-medium text-[#17233B]">{item.reference}</div>
                    <div className="text-[10px] text-[#17233B]/40 font-mono">{item.id}</div>
                    <div className="text-[10px] text-[#17233B]/50">{formatDay(item.paidAt)}</div>
                  </td>
                  <td className="p-3">
                    <div className="font-semibold text-[#17233B]">{item.employerName}</div>
                    <div className="text-[11px] text-[#17233B]/60">{item.contractTitle}</div>
                    <div className="text-[10px] text-[#17233B]/45">
                      {item.periodKey} · {PAYMENT_KIND_LABELS[item.kind]} · échéance {formatDay(item.dueDate)}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="font-bold text-[#17233B] text-sm">
                      {item.amount.toLocaleString()} {item.currency}
                    </div>
                    {item.amount !== item.amountDue && (
                      <div className="text-[10px] text-[#A33A2B]">attendu {item.amountDue.toLocaleString()}</div>
                    )}
                  </td>
                  <td className="p-3 text-[11px]">
                    <div className="font-mono font-semibold text-[#17233B] break-all">{item.transactionId}</div>
                    <div className="text-[10px] text-[#17233B]/50">
                      {PAYMENT_METHODS.find(m => m.id === item.paymentMethod)?.label ?? item.paymentMethod}
                    </div>
                  </td>
                  <td className="p-3">
                    <span className={`inline-block px-2 py-0.5 rounded-[4px] border text-[10px] font-semibold uppercase ${STATUS_STYLES[item.status]}`}>
                      {PAYMENT_STATUS_LABELS[item.status]}
                    </span>
                    {daysLateForPayment(item.dueDate) >= 3 && item.status !== 'APPROVED' && (
                      <div className="text-[10px] text-[#A33A2B] mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> J+{daysLateForPayment(item.dueDate)}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => void openDeclaration(item)}
                      className="px-2.5 py-1 border border-[#17233B]/20 hover:bg-[#17233B]/5 text-[#17233B] rounded text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" /> Ouvrir
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-xs text-[#17233B]/50">
                    Aucune déclaration ne correspond aux critères.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <EditorialSheet
        isOpen={Boolean(selected)}
        onClose={() => setOpenId('')}
        title={selected ? `Dossier ${selected.reference}` : 'Dossier'}
        subtitle={selected ? `${selected.employerName} · ${selected.contractTitle}` : undefined}
      >
        {selected && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className={`inline-block px-2 py-0.5 rounded-[4px] border text-[10px] font-semibold uppercase ${STATUS_STYLES[selected.status]}`}>
                {PAYMENT_STATUS_LABELS[selected.status]}
              </span>
              <span className="text-[10px] text-[#17233B]/50 font-mono">{selected.id}</span>
            </div>

            <section className="rounded-xl border border-[#17233B]/10 bg-white p-3 space-y-1.5">
              <h3 className="text-[11px] uppercase tracking-wide text-[#17233B]/50 font-semibold">Déclaration</h3>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                <div>
                  <dt className="text-[#17233B]/50">Montant déclaré</dt>
                  <dd className="font-semibold text-[#17233B]">
                    {selected.amount.toLocaleString()} {selected.currency}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#17233B]/50">Montant attendu</dt>
                  <dd className={`font-semibold ${selected.amount !== selected.amountDue ? 'text-[#A33A2B]' : 'text-[#17233B]'}`}>
                    {selected.amountDue.toLocaleString()} {selected.currency}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#17233B]/50">Nature</dt>
                  <dd>{PAYMENT_KIND_LABELS[selected.kind]}</dd>
                </div>
                <div>
                  <dt className="text-[#17233B]/50">Moyen</dt>
                  <dd>{PAYMENT_METHODS.find(m => m.id === selected.paymentMethod)?.label ?? selected.paymentMethod}</dd>
                </div>
                <div>
                  <dt className="text-[#17233B]/50">Transaction</dt>
                  <dd className="font-mono break-all">{selected.transactionId}</dd>
                </div>
                <div>
                  <dt className="text-[#17233B]/50">Référence</dt>
                  <dd className="font-mono break-all">{selected.reference}</dd>
                </div>
                <div>
                  <dt className="text-[#17233B]/50">Payé le</dt>
                  <dd>{formatDateTime(selected.paidAt)}</dd>
                </div>
                <div>
                  <dt className="text-[#17233B]/50">Soumis le</dt>
                  <dd>{formatDateTime(selected.submittedAt)}</dd>
                </div>
                <div>
                  <dt className="text-[#17233B]/50">Période</dt>
                  <dd>{selected.periodKey}</dd>
                </div>
                <div>
                  <dt className="text-[#17233B]/50">Échéance</dt>
                  <dd>
                    {formatDay(selected.dueDate)}
                    {daysLateForPayment(selected.dueDate) > 0 && selected.status !== 'APPROVED' && (
                      <span className="ml-1 text-[#A33A2B]">· J+{daysLateForPayment(selected.dueDate)}</span>
                    )}
                  </dd>
                </div>
              </dl>
              {selected.comment && (
                <p className="text-[11px] text-[#17233B]/60 italic border-t border-[#17233B]/5 pt-2">
                  « {selected.comment} »
                </p>
              )}
            </section>

            <section className="rounded-xl border border-[#17233B]/10 bg-white p-3 space-y-2">
              <h3 className="text-[11px] uppercase tracking-wide text-[#17233B]/50 font-semibold">Justificatif</h3>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#17233B]/40 shrink-0" />
                <span className="font-mono text-[11px] text-[#17233B] truncate flex-1">{selected.proof.fileName}</span>
                {/^https?:|^data:image/.test(selected.proof.uri) ? (
                  <a
                    href={selected.proof.uri}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 bg-[#17233B] text-white rounded text-[10px] font-semibold"
                  >
                    Ouvrir
                  </a>
                ) : (
                  <span className="text-[10px] text-[#17233B]/45 italic">référence démo</span>
                )}
              </div>
              <p className="text-[10px] text-[#17233B]/50">
                {selected.proof.mimeType ?? 'type inconnu'}
                {selected.proof.sizeBytes ? ` · ${(selected.proof.sizeBytes / 1024).toFixed(0)} Ko` : ''} · déposé le{' '}
                {formatDateTime(selected.proof.uploadedAt)}
                {selected.proof.documentId ? ` · document ${selected.proof.documentId}` : ''}
              </p>
            </section>

            <section className="rounded-xl border border-[#17233B]/10 bg-white p-3 space-y-1.5">
              <h3 className="text-[11px] uppercase tracking-wide text-[#17233B]/50 font-semibold">Employeur & contrat</h3>
              <p className="font-semibold text-[#17233B]">{employer?.fullName ?? selected.employerName}</p>
              <p className="text-[11px] text-[#17233B]/60">
                {employer?.publicId ?? '—'} · {employer?.email ?? '—'} · {employer?.phone ?? '—'}
              </p>
              <p className="text-[11px] text-[#17233B]/60">
                Compte :{' '}
                {employer?.accountStatus === 'BLOCKED' ? (
                  <span className="text-[#A33A2B] font-semibold">BLOQUÉ — {employer.blockReason ?? 'motif non renseigné'}</span>
                ) : (
                  <span className="text-emerald-700 font-semibold">Actif</span>
                )}
              </p>
              <p className="text-[11px] text-[#17233B]/60">
                Contrat {contract?.id ?? selected.contractId} · {contract?.employeeName ?? '—'} ·{' '}
                {contract ? `${contract.monthlySalary.toLocaleString()} ${contract.currency}/mois` : '—'}
              </p>
            </section>

            <section className="rounded-xl border border-[#17233B]/10 bg-white p-3 space-y-2">
              <h3 className="text-[11px] uppercase tracking-wide text-[#17233B]/50 font-semibold">
                Historique ({selected.history.length})
              </h3>
              <ol className="space-y-2 border-l border-[#17233B]/10 pl-3">
                {selected.history.map(event => (
                  <li key={event.id} className="relative">
                    <span className="absolute -left-[17px] top-1.5 w-2 h-2 rounded-full bg-[#17233B]/30" />
                    <p className="font-semibold text-[#17233B]">{PAYMENT_HISTORY_LABELS[event.type]}</p>
                    <p className="text-[10px] text-[#17233B]/55">
                      {formatDateTime(event.occurredAt)} · {event.actorName} ({event.actorRole})
                      {event.fromStatus && event.toStatus ? ` · ${event.fromStatus} → ${event.toStatus}` : ''}
                    </p>
                    {event.reason && <p className="text-[10px] text-[#17233B]/70 italic">« {event.reason} »</p>}
                  </li>
                ))}
              </ol>
            </section>

            {selected.rejectionReason && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3">
                <p className="text-[11px] font-semibold text-[#A33A2B]">Dernier motif de rejet</p>
                <p className="text-[11px] text-[#A33A2B]/90 mt-1">{selected.rejectionReason}</p>
                <p className="text-[10px] text-[#A33A2B]/70 mt-1">
                  Rejets cumulés : {selected.rejectionCount} · régularisations : {selected.resubmissionCount}
                </p>
              </div>
            )}

            {isPaymentAwaitingAdminAction(selected.status) && (
              <section className="rounded-xl border border-[#17233B]/10 bg-white p-3 space-y-3">
                <h3 className="text-[11px] uppercase tracking-wide text-[#17233B]/50 font-semibold">Décision</h3>
                <input
                  type="text"
                  value={approveNote}
                  onChange={e => setApproveNote(e.target.value)}
                  placeholder="Note d’approbation (facultative)"
                  className="w-full h-10 px-3 bg-white border border-[#17233B]/15 rounded-xl text-xs"
                />
                <EditorialButton
                  variant="primary"
                  fullWidth
                  disabled={busy}
                  onClick={() => void run(
                    () => approvePaymentDeclaration(selected.id, approveNote.trim() || undefined),
                    'Paiement approuvé. L’employeur est notifié.',
                    true,
                  )}
                >
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Approuver la déclaration
                </EditorialButton>

                <HairlineDivider />

                <label className="block text-[11px] font-semibold text-[#A33A2B]">
                  Motif du rejet (obligatoire)
                </label>
                <textarea
                  rows={3}
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Ex. Montant non concordant, justificatif illisible, transaction introuvable…"
                  className="w-full p-2 bg-white border border-[#E23D3D]/30 rounded-xl text-xs"
                />
                <EditorialButton
                  variant="danger"
                  fullWidth
                  disabled={busy || rejectReason.trim().length < 5}
                  onClick={() => void run(
                    () => rejectPaymentDeclaration(selected.id, rejectReason.trim()),
                    'Paiement rejeté avec motif. L’employeur doit régulariser.',
                    true,
                  )}
                >
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                  Rejeter la déclaration
                </EditorialButton>
                {rejectReason.trim().length < 5 && (
                  <p className="text-[10px] text-[#17233B]/50">
                    Le motif est obligatoire : il est conservé dans l’historique et transmis à l’employeur.
                  </p>
                )}
              </section>
            )}

            {blocking && selected && (
              <section className="rounded-xl border border-[#17233B]/10 bg-white p-3 space-y-3">
                <h3 className="text-[11px] uppercase tracking-wide text-[#17233B]/50 font-semibold">
                  Compte employeur
                </h3>
                <p className="text-[10px] text-[#17233B]/45">
                  {blocking.employerName} · {blocking.employerId}
                </p>
                <p className="text-[11px] text-[#17233B]/70 flex items-start gap-1.5">
                  {blocking.canBlock ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-[#A33A2B] shrink-0 mt-0.5" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5 text-[#17233B]/40 shrink-0 mt-0.5" />
                  )}
                  <span>{blocking.label}</span>
                </p>
                {blocking.daysLate > 0 && (
                  <p className="text-[10px] text-[#17233B]/50 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Retard constaté : {blocking.daysLate} jour(s) après l’échéance.
                  </p>
                )}
                {(blocking.canBlock || blocking.canUnblock) && (
                  <>
                    <input
                      type="text"
                      value={blockReason}
                      onChange={e => setBlockReason(e.target.value)}
                      placeholder={blocking.canBlock ? 'Motif du blocage (obligatoire)' : 'Motif du déblocage (obligatoire)'}
                      className="w-full h-10 px-3 bg-white border border-[#17233B]/15 rounded-xl text-xs"
                    />
                    {blocking.canBlock && (
                      <EditorialButton
                        variant="danger"
                        fullWidth
                        disabled={busy || blockReason.trim().length < 5}
                        onClick={() => void run(
                          () => blockEmployerForPayment(selected.id, blockReason.trim()),
                          'Compte employeur bloqué et tracé dans l’historique.',
                          false,
                        )}
                      >
                        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LockKeyhole className="w-4 h-4 mr-2" />}
                        Bloquer l’employeur
                      </EditorialButton>
                    )}
                    {blocking.canUnblock && (
                      <EditorialButton
                        variant="secondary"
                        fullWidth
                        disabled={busy || blockReason.trim().length < 5}
                        onClick={() => void run(
                          () => unblockEmployerForPayment(selected.id, blockReason.trim()),
                          'Compte employeur débloqué après régularisation.',
                          false,
                        )}
                      >
                        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UnlockKeyhole className="w-4 h-4 mr-2" />}
                        Débloquer l’employeur
                      </EditorialButton>
                    )}
                  </>
                )}
              </section>
            )}
          </div>
        )}
      </EditorialSheet>
    </div>
  );
};

export default AdminPaymentDeclarationsScreen;
