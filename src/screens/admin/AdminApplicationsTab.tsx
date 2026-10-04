import React, { useState, useMemo } from 'react';
import {
  FileCheck2,
  Search,
  Filter,
  Eye,
  CheckCircle,
  Clock,
  XCircle,
  Building,
  User
} from 'lucide-react';
import { Application, Offer, UserProfile } from '../../types';

interface AdminApplicationsTabProps {
  applications: Application[];
  offers: Offer[];
  candidates: UserProfile[];
  initialStatusFilter?: string;
  onSelectCandidate?: (candidate: UserProfile) => void;
}

export const AdminApplicationsTab: React.FC<AdminApplicationsTabProps> = ({
  applications,
  offers,
  candidates,
  initialStatusFilter,
  onSelectCandidate
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter || 'ALL');

  const filteredApplications = useMemo(() => {
    return applications.filter(a => {
      if (statusFilter !== 'ALL' && a.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchCan = a.candidateName.toLowerCase().includes(q);
        const matchTitle = a.offerTitle.toLowerCase().includes(q);
        const matchEmp = (a.employerName || '').toLowerCase().includes(q);
        const matchId = a.id.toLowerCase().includes(q);
        if (!matchCan && !matchTitle && !matchEmp && !matchId) return false;
      }
      return true;
    });
  }, [applications, statusFilter, search]);

  return (
    <div className="space-y-4">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-editorial text-2xl font-bold text-[#17233B]">
            Pipeline National des Candidatures
          </h2>
          <p className="text-xs text-[#17233B]/60">
            Supervision de toutes les postulations, shortlists et embauches de la plateforme
          </p>
        </div>

        {/* Filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-9 px-2.5 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B]"
        >
          <option value="ALL">Tous les statuts</option>
          <option value="PENDING">En attente d'examen</option>
          <option value="SHORTLISTED">Shortlistées</option>
          <option value="HIRED">Embauchées</option>
          <option value="REJECTED">Rejetées</option>
          <option value="CLOSED_OFFER_FILLED">Clôturées (Offre pourvue)</option>
        </select>
      </div>

      {/* 2. Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-3 text-[#17233B]/40" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par nom de candidat, titre de mission ou employeur..."
          className="w-full h-10 pl-9 pr-3 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B] placeholder-[#17233B]/40 focus:outline-none focus:border-[#17233B]"
        />
      </div>

      {/* 3. Table */}
      <div className="bg-white border border-[#17233B]/10 rounded-[4px] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-operational">
            <thead className="bg-[#17233B]/5 text-[#17233B]/70 uppercase tracking-wider text-[10px] border-b border-[#17233B]/10">
              <tr>
                <th className="p-3">Réf.</th>
                <th className="p-3">Candidat</th>
                <th className="p-3">Offre visée</th>
                <th className="p-3">Employeur</th>
                <th className="p-3">Date</th>
                <th className="p-3">Statut</th>
                <th className="p-3 text-right">Rémunération</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#17233B]/5">
              {filteredApplications.map(a => {
                const isShortlisted = a.status === 'SHORTLISTED';
                const isHired = a.status === 'HIRED';
                const isPending = a.status === 'PENDING';

                return (
                  <tr key={a.id} className="hover:bg-[#F3F3EC]/50 transition-colors">
                    <td className="p-3 font-mono font-medium text-[#17233B]">
                      {a.id}
                    </td>
                    <td className="p-3 font-medium text-[#17233B]">
                      <div className="font-semibold">{a.candidateName}</div>
                      <div className="text-[10px] text-[#17233B]/50 font-mono">{a.candidatePublicId}</div>
                    </td>
                    <td className="p-3 text-[#17233B] font-medium">
                      {a.offerTitle}
                    </td>
                    <td className="p-3 text-[#17233B]/80 font-medium">
                      {a.employerName}
                    </td>
                    <td className="p-3 text-[#17233B]/60 text-[11px]">
                      {a.appliedDate}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        isHired
                          ? 'bg-emerald-100 text-emerald-800'
                          : isShortlisted
                          ? 'bg-amber-100 text-amber-800'
                          : isPending
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-[#17233B]/10 text-[#17233B]'
                      }`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="p-3 text-right font-semibold text-[#17233B]">
                      {typeof a.remuneration === 'number' ? `${a.remuneration.toLocaleString()} FCFA` : (a.remuneration || '—')}
                    </td>
                  </tr>
                );
              })}
              {filteredApplications.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs text-[#17233B]/50">
                    Aucune candidature trouvée.
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
