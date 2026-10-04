import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  CheckCircle,
  Eye,
  X
} from 'lucide-react';
import { CommissionPaymentRecord, Contract } from '../../types';

interface AdminPaymentsTabProps {
  payments: CommissionPaymentRecord[];
  contracts: Contract[];
  onVerifyPayment: (paymentId: string) => Promise<void>;
  onRejectPayment: (paymentId: string, reason: string) => Promise<void>;
  initialStatusFilter?: string;
}

export const AdminPaymentsTab: React.FC<AdminPaymentsTabProps> = ({
  payments,
  contracts,
  onVerifyPayment,
  onRejectPayment,
  initialStatusFilter
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter || 'ALL');
  const [busyId, setBusyId] = useState('');
  const [rejectingId, setRejectingId] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchEmp = p.employerName.toLowerCase().includes(q);
        const matchRef = (p.reference || '').toLowerCase().includes(q);
        const matchTx = p.transactionId.toLowerCase().includes(q);
        const matchId = p.paymentId.toLowerCase().includes(q);
        const matchOffer = p.offerTitle.toLowerCase().includes(q);
        if (!matchEmp && !matchRef && !matchTx && !matchId && !matchOffer) return false;
      }
      return true;
    });
  }, [payments, statusFilter, search]);

  const handleApprove = async (paymentId: string) => {
    setBusyId(paymentId);
    setError('');
    setMessage('');
    try {
      await onVerifyPayment(paymentId);
      setMessage('Paiement validé avec succès. L’échéance du contrat est marquée PAYÉE.');
    } catch (err: any) {
      setError(err.message || 'Impossible de valider ce paiement.');
    } finally {
      setBusyId('');
    }
  };

  const handleConfirmReject = async (paymentId: string) => {
    if (!rejectReason.trim()) {
      setError('Le motif du rejet est obligatoire pour informer l’employeur.');
      return;
    }
    setBusyId(paymentId);
    setError('');
    setMessage('');
    try {
      await onRejectPayment(paymentId, rejectReason.trim());
      setMessage('Paiement rejeté. L’employeur a été notifié pour régularisation.');
      setRejectingId('');
      setRejectReason('');
    } catch (err: any) {
      setError(err.message || 'Impossible de rejeter ce paiement.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-editorial text-2xl font-bold text-[#17233B]">
            Centre des Paiements & Commissions
          </h2>
          <p className="text-xs text-[#17233B]/60">
            Contrôle des déclarations de commissions (25% M1 · 0% M2+) et des salaires
          </p>
        </div>

        {/* Filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-9 px-2.5 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B]"
        >
          <option value="ALL">Tous les statuts</option>
          <option value="PENDING_VERIFICATION">À vérifier (Prioritaire)</option>
          <option value="PAID">Validés / Encaissés</option>
          <option value="REJECTED">Rejetés (À régulariser)</option>
        </select>
      </div>

      {/* 2. Messages & Search */}
      {message && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-3 text-[#17233B]/40" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par référence, employeur, transaction MoMo/Flooz, ou mission..."
          className="w-full h-10 pl-9 pr-3 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B] placeholder-[#17233B]/40 focus:outline-none focus:border-[#17233B]"
        />
      </div>

      {/* 3. Table */}
      <div className="bg-white border border-[#17233B]/10 rounded-[4px] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-operational">
            <thead className="bg-[#17233B]/5 text-[#17233B]/70 uppercase tracking-wider text-[10px] border-b border-[#17233B]/10">
              <tr>
                <th className="p-3">Référence</th>
                <th className="p-3">Employeur & Mission</th>
                <th className="p-3">Période</th>
                <th className="p-3">Montant soumis</th>
                <th className="p-3">Preuve / Moyen</th>
                <th className="p-3">Statut</th>
                <th className="p-3 text-right">Décision Administrative</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#17233B]/5">
              {filteredPayments.map(p => {
                const isPending = p.status === 'PENDING_VERIFICATION';
                const isPaid = p.status === 'PAID';
                const isRejected = p.status === 'REJECTED';
                const isRejectingThis = rejectingId === p.paymentId;

                return (
                  <tr key={p.paymentId} className="hover:bg-[#F3F3EC]/50 transition-colors">
                    <td className="p-3 font-mono font-medium text-[#17233B]">
                      {p.reference}
                      <div className="text-[10px] text-[#17233B]/40 font-mono">{p.paymentId}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-[#17233B]">{p.employerName}</div>
                      <div className="text-[11px] text-[#17233B]/60">{p.offerTitle}</div>
                    </td>
                    <td className="p-3 font-medium text-[#17233B]">
                      {p.periodKey}
                      <div className="text-[10px] text-[#17233B]/40">{p.paymentDate}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-[#17233B] text-sm">
                        {p.amountSubmitted.toLocaleString()} {p.currency}
                      </div>
                    </td>
                    <td className="p-3 text-[11px] text-[#17233B]/70">
                      <div>Tx: <span className="font-mono font-semibold">{p.transactionId}</span></div>
                      <div className="text-[10px] text-[#17233B]/50">{p.paymentMethod}</div>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        isPending
                          ? 'bg-amber-100 text-amber-800'
                          : isPaid
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {isPending ? (
                        isRejectingThis ? (
                          <div className="space-y-1.5 min-w-[200px] text-left">
                            <input
                              type="text"
                              value={rejectReason}
                              onChange={e => setRejectReason(e.target.value)}
                              placeholder="Motif du rejet (ex. montant non concordant)"
                              className="w-full h-8 px-2 bg-white border border-rose-300 rounded text-[11px]"
                            />
                            <div className="flex gap-1 justify-end">
                              <button
                                type="button"
                                disabled={busyId === p.paymentId || !rejectReason.trim()}
                                onClick={() => handleConfirmReject(p.paymentId)}
                                className="px-2 py-1 bg-[#A33A2B] text-white rounded text-[10px] font-semibold cursor-pointer disabled:opacity-50"
                              >
                                Confirmer Rejet
                              </button>
                              <button
                                type="button"
                                onClick={() => { setRejectingId(''); setRejectReason(''); }}
                                className="px-2 py-1 border border-[#17233B]/20 text-[#17233B] rounded text-[10px] cursor-pointer"
                              >
                                Annuler
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-1.5 justify-end">
                            <button
                              type="button"
                              disabled={busyId === p.paymentId}
                              onClick={() => handleApprove(p.paymentId)}
                              className="px-2.5 py-1 bg-[#17233B] hover:bg-[#17233B]/90 text-white rounded text-xs font-medium inline-flex items-center gap-1 cursor-pointer tap-feedback disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Valider</span>
                            </button>
                            <button
                              type="button"
                              disabled={busyId === p.paymentId}
                              onClick={() => { setRejectingId(p.paymentId); setRejectReason(''); }}
                              className="px-2.5 py-1 border border-[#A33A2B]/30 hover:bg-[#A33A2B]/10 text-[#A33A2B] rounded text-xs font-medium inline-flex items-center gap-1 cursor-pointer tap-feedback disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Rejeter</span>
                            </button>
                          </div>
                        )
                      ) : (
                        <span className="text-[11px] text-[#17233B]/40 italic">
                          Dossier clos
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredPayments.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs text-[#17233B]/50">
                    Aucun paiement ne correspond aux critères.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
