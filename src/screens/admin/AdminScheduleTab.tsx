import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Search,
  Clock,
  AlertTriangle,
  CheckCircle,
  FileSpreadsheet
} from 'lucide-react';
import { Contract } from '../../types';

interface AdminScheduleTabProps {
  contracts: Contract[];
}

export const AdminScheduleTab: React.FC<AdminScheduleTabProps> = ({ contracts }) => {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'J3' | 'DUE' | 'PENDING' | 'PAID'>('ALL');

  const daysLateFor = (dateValue?: string): number => {
    if (!dateValue) return 0;
    const due = new Date(`${dateValue}T00:00:00.000Z`).getTime();
    if (!Number.isFinite(due)) return 0;
    return Math.max(0, Math.floor((Date.now() - due) / 86400000));
  };

  // Flatten all contract payment schedule entries
  const allEntries = useMemo(() => {
    const list: Array<{
      contractId: string;
      employerName: string;
      employeeName: string;
      offerTitle: string;
      monthNumber: number;
      salaryAmount: number;
      salaryStatus: string;
      salaryDueDate: string;
      commissionAmount: number;
      commissionStatus: string;
      commissionDueDate: string;
      isJ3Late: boolean;
      daysLate: number;
    }> = [];

    contracts.forEach(c => {
      c.paymentSchedule.forEach(entry => {
        const daysLate = Math.max(daysLateFor(entry.salaryDueDate), daysLateFor(entry.commissionDueDate));
        const salaryLate = ['DUE', 'REJECTED'].includes(entry.salaryStatus) && daysLateFor(entry.salaryDueDate) >= 3;
        const commissionLate = entry.commissionAmount > 0 && ['DUE', 'REJECTED'].includes(entry.commissionStatus) && daysLateFor(entry.commissionDueDate) >= 3;
        const isJ3Late = salaryLate || commissionLate;

        list.push({
          contractId: c.id,
          employerName: c.employerName,
          employeeName: c.employeeName,
          offerTitle: c.offerTitle,
          monthNumber: entry.monthNumber,
          salaryAmount: entry.salaryAmount,
          salaryStatus: entry.salaryStatus,
          salaryDueDate: entry.salaryDueDate,
          commissionAmount: entry.commissionAmount,
          commissionStatus: entry.commissionStatus,
          commissionDueDate: entry.commissionDueDate,
          isJ3Late,
          daysLate
        });
      });
    });

    return list;
  }, [contracts]);

  const filteredEntries = useMemo(() => {
    return allEntries.filter(item => {
      if (filterType === 'J3' && !item.isJ3Late) return false;
      if (filterType === 'DUE' && item.salaryStatus !== 'DUE' && item.commissionStatus !== 'DUE') return false;
      if (filterType === 'PENDING' && item.commissionStatus !== 'PENDING_VERIFICATION') return false;
      if (filterType === 'PAID' && item.salaryStatus !== 'PAID') return false;

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchEmp = item.employerName.toLowerCase().includes(q);
        const matchCan = item.employeeName.toLowerCase().includes(q);
        const matchCId = item.contractId.toLowerCase().includes(q);
        const matchTitle = item.offerTitle.toLowerCase().includes(q);
        if (!matchEmp && !matchCan && !matchCId && !matchTitle) return false;
      }
      return true;
    });
  }, [allEntries, filterType, search]);

  return (
    <div className="space-y-4">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-editorial text-2xl font-bold text-[#17233B]">
            Échéancier National & Recouvrement
          </h2>
          <p className="text-xs text-[#17233B]/60">
            Suivi des échéances salariales et déontologiques de commissions (J+3)
          </p>
        </div>

        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value as any)}
          className="h-9 px-2.5 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B]"
        >
          <option value="ALL">Toutes les échéances</option>
          <option value="J3">Impayés J+3 (Blocage imminent)</option>
          <option value="DUE">Échues / À payer</option>
          <option value="PENDING">Commissions en vérification</option>
          <option value="PAID">Salaires honorés (Payés)</option>
        </select>
      </div>

      {/* 2. Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-3 text-[#17233B]/40" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filtrer par contrat (CTR-), employeur, artisan ou mission..."
          className="w-full h-10 pl-9 pr-3 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B] placeholder-[#17233B]/40 focus:outline-none focus:border-[#17233B]"
        />
      </div>

      {/* 3. Table */}
      <div className="bg-white border border-[#17233B]/10 rounded-[4px] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-operational">
            <thead className="bg-[#17233B]/5 text-[#17233B]/70 uppercase tracking-wider text-[10px] border-b border-[#17233B]/10">
              <tr>
                <th className="p-3">Contrat</th>
                <th className="p-3">Employeur ↔ Salarié</th>
                <th className="p-3">Mois</th>
                <th className="p-3">Échéance</th>
                <th className="p-3">Salaire Net</th>
                <th className="p-3">Commission LE LABEUR</th>
                <th className="p-3 text-right">Alerte Recouvrement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#17233B]/5">
              {filteredEntries.map((item, idx) => (
                <tr key={`${item.contractId}-${item.monthNumber}-${idx}`} className="hover:bg-[#F3F3EC]/50 transition-colors">
                  <td className="p-3 font-mono font-medium text-[#17233B]">
                    {item.contractId}
                  </td>
                  <td className="p-3">
                    <div className="font-semibold text-[#17233B]">{item.employerName}</div>
                    <div className="text-[11px] text-[#17233B]/60">↔ {item.employeeName}</div>
                  </td>
                  <td className="p-3 font-semibold text-[#17233B]">
                    Mois {item.monthNumber}
                  </td>
                  <td className="p-3 text-[#17233B]/70 text-[11px]">
                    {item.salaryDueDate}
                  </td>
                  <td className="p-3">
                    <div className="font-semibold">{item.salaryAmount.toLocaleString()} FCFA</div>
                    <span className={`text-[10px] font-medium uppercase ${item.salaryStatus === 'PAID' ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {item.salaryStatus}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="font-semibold text-[#1BA64B]">
                      {item.commissionAmount > 0 ? `${item.commissionAmount.toLocaleString()} FCFA` : '0 FCFA (M2+)'}
                    </div>
                    <span className="text-[10px] text-[#17233B]/60 font-medium">
                      {item.commissionStatus}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    {item.isJ3Late ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                        <AlertTriangle className="w-3 h-3" /> J+3 (+{item.daysLate}j)
                      </span>
                    ) : item.daysLate > 0 && item.salaryStatus === 'DUE' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-medium">
                        <Clock className="w-3 h-3" /> Retard ({item.daysLate}j)
                      </span>
                    ) : item.salaryStatus === 'PAID' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-medium">
                        <CheckCircle className="w-3 h-3" /> Conforme
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#17233B]/40">À venir</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs text-[#17233B]/50">
                    Aucune échéance ne correspond à ce filtre.
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
