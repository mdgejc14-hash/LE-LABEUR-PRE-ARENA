import React, { useState, useMemo } from 'react';
import {
  FileCheck2,
  Search,
  Filter,
  Eye,
  Calendar,
  DollarSign,
  AlertTriangle,
  RotateCcw,
  CheckCircle,
  Clock,
  X
} from 'lucide-react';
import { Contract, Incident, ReplacementDossier } from '../../types';

interface AdminContractsTabProps {
  contracts: Contract[];
  incidents: Incident[];
  replacements: ReplacementDossier[];
  initialStatusFilter?: string;
}

export const AdminContractsTab: React.FC<AdminContractsTabProps> = ({
  contracts,
  incidents,
  replacements,
  initialStatusFilter
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter || 'ALL');
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);

  const filteredContracts = useMemo(() => {
    return contracts.filter(c => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchTitle = c.offerTitle.toLowerCase().includes(q);
        const matchId = c.id.toLowerCase().includes(q);
        const matchEmp = c.employerName.toLowerCase().includes(q);
        const matchCan = c.employeeName.toLowerCase().includes(q);
        if (!matchTitle && !matchId && !matchEmp && !matchCan) return false;
      }
      return true;
    });
  }, [contracts, statusFilter, search]);

  const contractIncidents = useMemo(() => {
    if (!selectedContract) return [];
    return incidents.filter(i => i.contractId === selectedContract.id);
  }, [selectedContract, incidents]);

  const contractReplacement = useMemo(() => {
    if (!selectedContract) return null;
    return replacements.find(r => r.originalContractId === selectedContract.id || r.newContractId === selectedContract.id) || null;
  }, [selectedContract, replacements]);

  return (
    <div className="space-y-4">
      {/* 1. Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-editorial text-2xl font-bold text-[#17233B]">
            Centre National des Contrats
          </h2>
          <p className="text-xs text-[#17233B]/60">
            {filteredContracts.length} contrat{filteredContracts.length > 1 ? 's' : ''} répertorié{filteredContracts.length > 1 ? 's' : ''}
          </p>
        </div>

        {/* Filter status */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-9 px-2.5 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B]"
        >
          <option value="ALL">Tous les statuts</option>
          <option value="ACTIVE">Actifs en cours</option>
          <option value="SIGNATURE">En cours de signature</option>
          <option value="INCIDENT">Sous Incident / Arbitrage</option>
          <option value="TERMINATED">Terminés / Résiliés</option>
          <option value="REPLACED">Remplacés</option>
        </select>
      </div>

      {/* 2. Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-3 text-[#17233B]/40" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par référence contrat (CTR-), employeur, artisan ou titre..."
          className="w-full h-10 pl-9 pr-3 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B] placeholder-[#17233B]/40 focus:outline-none focus:border-[#17233B]"
        />
      </div>

      {/* 3. Table */}
      <div className="bg-white border border-[#17233B]/10 rounded-[4px] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-operational">
            <thead className="bg-[#17233B]/5 text-[#17233B]/70 uppercase tracking-wider text-[10px] border-b border-[#17233B]/10">
              <tr>
                <th className="p-3">Réf. Contrat</th>
                <th className="p-3">Mission & Titre</th>
                <th className="p-3">Employeur</th>
                <th className="p-3">Salarié</th>
                <th className="p-3">Rémunération</th>
                <th className="p-3">Statut</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#17233B]/5">
              {filteredContracts.map(c => {
                const isSignature = ['SIGNATURE', 'PENDING_EMPLOYER', 'PENDING_EMPLOYEE'].includes(c.status);
                const isIncident = c.status === 'INCIDENT';
                const isActive = c.status === 'ACTIVE';
                return (
                  <tr key={c.id} className="hover:bg-[#F3F3EC]/50 transition-colors">
                    <td className="p-3 font-mono font-semibold text-[#17233B]">
                      {c.id}
                    </td>
                    <td className="p-3 font-medium text-[#17233B]">
                      <div className="font-semibold">{c.offerTitle}</div>
                      <div className="text-[10px] text-[#17233B]/50">Du {c.startDate} au {c.endDate}</div>
                    </td>
                    <td className="p-3 text-[#17233B]/80 font-medium">
                      {c.employerName}
                    </td>
                    <td className="p-3 text-[#17233B]/80 font-medium">
                      {c.employeeName}
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-[#17233B]">{c.monthlySalary.toLocaleString()} FCFA</div>
                      <div className="text-[10px] text-[#1BA64B]">Com. M1 : {(c.firstMonthCommission ?? c.commissionAmountDue ?? Math.round(c.monthlySalary * 0.25)).toLocaleString()} FCFA</div>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : isIncident
                          ? 'bg-rose-100 text-rose-800'
                          : isSignature
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-[#17233B]/10 text-[#17233B]'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedContract(c)}
                        className="px-2.5 py-1 text-xs border border-[#17233B]/15 rounded bg-white hover:bg-[#F3F3EC] text-[#17233B] font-medium cursor-pointer tap-feedback inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Dossier</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredContracts.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs text-[#17233B]/50">
                    Aucun contrat ne correspond à ce filtre.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Contract Detail Drawer */}
      {selectedContract && (
        <div className="fixed inset-0 z-50 bg-[#17233B]/60 backdrop-blur-xs flex justify-end animate-fadeIn">
          <div className="w-full max-w-xl bg-white h-full overflow-y-auto p-6 space-y-6 shadow-2xl flex flex-col justify-between">
            <div>
              {/* Header */}
              <div className="flex items-start justify-between pb-4 border-b border-[#17233B]/10">
                <div>
                  <span className="text-[10px] uppercase font-mono font-semibold text-[#17233B]/60">
                    DOSSIER CONTRACTUEL · {selectedContract.id}
                  </span>
                  <h3 className="font-editorial text-xl font-bold text-[#17233B] mt-1">
                    {selectedContract.offerTitle}
                  </h3>
                  <p className="text-xs text-[#17233B]/70">
                    {selectedContract.employerName} ↔ {selectedContract.employeeName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedContract(null)}
                  className="w-8 h-8 rounded-full border border-[#17233B]/15 flex items-center justify-center text-[#17233B]/60 hover:text-[#17233B] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Status Banner */}
              <div className="my-4 p-3 bg-[#F3F3EC] border border-[#17233B]/10 rounded flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] text-[#17233B]/50 uppercase font-medium">Statut d'exécution</span>
                  <div className="font-semibold text-sm text-[#17233B]">{selectedContract.status}</div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-[#17233B]/50 uppercase font-medium">Signatures</span>
                  <div className="text-xs font-medium text-[#17233B]">
                    {selectedContract.signedByEmployer ? '✓ Employeur' : '✗ Employeur'} · {selectedContract.signedByEmployee ? '✓ Salarié' : '✗ Salarié'}
                  </div>
                </div>
              </div>

              {/* Conditions financières & déontologiques */}
              <div className="py-3 border-b border-[#17233B]/10 space-y-2 text-xs">
                <h4 className="font-semibold text-[#17233B] uppercase tracking-wider text-[11px]">
                  Conditions Financières Déontologiques
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2.5 bg-white border border-[#17233B]/10 rounded">
                    <span className="text-[10px] text-[#17233B]/60 uppercase">Salaire Net Garanti</span>
                    <div className="text-base font-bold text-[#17233B]">{selectedContract.monthlySalary.toLocaleString()} FCFA</div>
                    <div className="text-[10px] text-[#1BA64B]">0 FCFA de frais déduits au salarié</div>
                  </div>
                  <div className="p-2.5 bg-white border border-[#17233B]/10 rounded">
                    <span className="text-[10px] text-[#17233B]/60 uppercase">Commission LE LABEUR (M1)</span>
                    <div className="text-base font-bold text-[#17233B]">{(selectedContract.firstMonthCommission ?? selectedContract.commissionAmountDue ?? Math.round(selectedContract.monthlySalary * 0.25)).toLocaleString()} FCFA</div>
                    <div className="text-[10px] text-[#17233B]/60">25% en M1 · 0% en M2+</div>
                  </div>
                </div>
              </div>

              {/* Échéancier de paiement complet */}
              <div className="py-4 space-y-2 border-b border-[#17233B]/10">
                <h4 className="font-semibold text-[#17233B] uppercase tracking-wider text-[11px]">
                  Échéancier Mensuel des Règlements ({selectedContract.paymentSchedule.length} mois)
                </h4>
                <div className="space-y-1.5">
                  {selectedContract.paymentSchedule.map(entry => (
                    <div key={entry.monthNumber} className="p-2.5 bg-[#F3F3EC]/70 rounded border border-[#17233B]/5 text-xs flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-[#17233B]">
                          Mois {entry.monthNumber} · Échéance {entry.salaryDueDate}
                        </div>
                        <div className="text-[10px] text-[#17233B]/60">
                          Salaire : <span className="font-semibold">{entry.salaryAmount.toLocaleString()} FCFA</span> ({entry.salaryStatus})
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-[#1BA64B]">
                          Com : {entry.commissionAmount.toLocaleString()} FCFA
                        </div>
                        <div className="text-[10px] font-medium text-[#17233B]/70">
                          {entry.commissionStatus}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Incidents & Remplacement rattachés */}
              {contractIncidents.length > 0 && (
                <div className="py-4 space-y-2">
                  <h4 className="font-semibold text-[#A33A2B] uppercase tracking-wider text-[11px] flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Incidents Enregistrés sur ce Contrat ({contractIncidents.length})</span>
                  </h4>
                  {contractIncidents.map(inc => (
                    <div key={inc.id} className="p-2.5 bg-rose-50 border border-rose-200 rounded text-xs space-y-1">
                      <div className="font-semibold text-rose-900">{inc.reason} ({inc.status})</div>
                      <div className="text-[11px] text-rose-800">{inc.description}</div>
                    </div>
                  ))}
                </div>
              )}

              {contractReplacement && (
                <div className="py-3 bg-indigo-50 border border-indigo-200 rounded p-3 text-xs space-y-1">
                  <div className="font-semibold text-indigo-900 flex items-center gap-1">
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Dossier de Remplacement Prioritaire Associé</span>
                  </div>
                  <div className="text-indigo-800 text-[11px]">
                    Identifiant : {contractReplacement.id} · Statut : {contractReplacement.status}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[#17233B]/10">
              <button
                type="button"
                onClick={() => setSelectedContract(null)}
                className="w-full h-10 bg-[#17233B] text-white rounded text-xs font-semibold cursor-pointer"
              >
                Fermer la fiche contrat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
