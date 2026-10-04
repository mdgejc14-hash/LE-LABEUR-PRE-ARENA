import React, { useState, useMemo } from 'react';
import {
  Briefcase,
  Search,
  Filter,
  CheckCircle,
  Clock,
  Eye,
  X,
  MapPin,
  Building,
  Users
} from 'lucide-react';
import { Offer, Application } from '../../types';

interface AdminOffersTabProps {
  offers: Offer[];
  applications: Application[];
  initialStatusFilter?: string;
}

export const AdminOffersTab: React.FC<AdminOffersTabProps> = ({
  offers,
  applications,
  initialStatusFilter
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter || 'ALL');
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);

  const filteredOffers = useMemo(() => {
    return offers.filter(o => {
      if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchTitle = o.title.toLowerCase().includes(q);
        const matchEmp = o.employerName.toLowerCase().includes(q);
        const matchLoc = o.location.toLowerCase().includes(q);
        const matchId = o.id.toLowerCase().includes(q);
        if (!matchTitle && !matchEmp && !matchLoc && !matchId) return false;
      }
      return true;
    });
  }, [offers, statusFilter, search]);

  const relatedApplications = useMemo(() => {
    if (!selectedOffer) return [];
    return applications.filter(a => a.offerId === selectedOffer.id);
  }, [selectedOffer, applications]);

  return (
    <div className="space-y-4">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-editorial text-2xl font-bold text-[#17233B]">
            Centre National des Offres d'Emploi
          </h2>
          <p className="text-xs text-[#17233B]/60">
            Supervision de toutes les offres publiées, pourvues et en cours d'attribution
          </p>
        </div>

        {/* Filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-9 px-2.5 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B]"
        >
          <option value="ALL">Tous les statuts</option>
          <option value="ACTIVE">Actives (Visibles candidats)</option>
          <option value="FILLED">Pourvues (Clôturées avec succès)</option>
          <option value="PAUSED">Suspendues / En pause</option>
          <option value="CANCELLED">Annulées</option>
        </select>
      </div>

      {/* 2. Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-3 text-[#17233B]/40" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par identifiant (OFFER-), titre de métier, employeur ou commune..."
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
                <th className="p-3">Titre de l'offre</th>
                <th className="p-3">Employeur</th>
                <th className="p-3">Localisation</th>
                <th className="p-3">Rémunération</th>
                <th className="p-3">Statut</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#17233B]/5">
              {filteredOffers.map(o => {
                const isActive = o.status === 'ACTIVE';
                const isFilled = o.status === 'FILLED';
                const appCount = applications.filter(a => a.offerId === o.id).length;

                return (
                  <tr key={o.id} className="hover:bg-[#F3F3EC]/50 transition-colors">
                    <td className="p-3 font-mono font-medium text-[#17233B]">
                      {o.id}
                    </td>
                    <td className="p-3 font-medium text-[#17233B]">
                      <div className="font-semibold">{o.title}</div>
                      <div className="text-[10px] text-[#17233B]/50">{appCount} candidature{appCount > 1 ? 's' : ''}</div>
                    </td>
                    <td className="p-3 text-[#17233B]/80 font-medium">
                      {o.employerName}
                    </td>
                    <td className="p-3 text-[#17233B]/70 max-w-[180px] truncate">
                      {o.location}
                    </td>
                    <td className="p-3 font-semibold text-[#17233B]">
                      {o.remuneration.toLocaleString()} FCFA
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : isFilled
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-[#17233B]/10 text-[#17233B]'
                      }`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedOffer(o)}
                        className="px-2.5 py-1 text-xs border border-[#17233B]/15 rounded bg-white hover:bg-[#F3F3EC] text-[#17233B] font-medium cursor-pointer tap-feedback inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Détails</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredOffers.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs text-[#17233B]/50">
                    Aucune offre ne correspond aux critères.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Offer Details Modal */}
      {selectedOffer && (
        <div className="fixed inset-0 z-50 bg-[#17233B]/60 backdrop-blur-xs flex justify-end animate-fadeIn">
          <div className="w-full max-w-xl bg-white h-full overflow-y-auto p-6 space-y-6 shadow-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between pb-4 border-b border-[#17233B]/10">
                <div>
                  <span className="text-[10px] uppercase font-mono font-semibold text-[#17233B]/60">
                    FICHE OFFRE · {selectedOffer.id}
                  </span>
                  <h3 className="font-editorial text-xl font-bold text-[#17233B] mt-1">
                    {selectedOffer.title}
                  </h3>
                  <p className="text-xs text-[#17233B]/70">
                    Publiée par {selectedOffer.employerName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOffer(null)}
                  className="w-8 h-8 rounded-full border border-[#17233B]/15 flex items-center justify-center text-[#17233B]/60 hover:text-[#17233B] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Status & Contract Type */}
              <div className="my-4 p-3 bg-[#F3F3EC] border border-[#17233B]/10 rounded flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] text-[#17233B]/50 uppercase font-medium">Statut</span>
                  <div className="font-semibold text-sm text-[#17233B]">{selectedOffer.status}</div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-[#17233B]/50 uppercase font-medium">Rémunération</span>
                  <div className="font-bold text-sm text-[#17233B]">{selectedOffer.remuneration.toLocaleString()} FCFA</div>
                </div>
              </div>

              {/* Details & Location */}
              <div className="space-y-3 py-3 border-b border-[#17233B]/10 text-xs">
                <div className="flex items-center gap-2 text-[#17233B]">
                  <MapPin className="w-4 h-4 text-[#17233B]/50" />
                  <span>{selectedOffer.location}</span>
                </div>
                <div className="flex items-center gap-2 text-[#17233B]">
                  <Building className="w-4 h-4 text-[#17233B]/50" />
                  <span>Type de contrat : {selectedOffer.contractType}</span>
                </div>
                {selectedOffer.summary && (
                  <p className="text-[11px] text-[#17233B]/70 bg-[#F3F3EC] p-3 rounded">
                    {selectedOffer.summary}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedOffer.skills.map((skill, idx) => (
                    <span key={idx} className="px-2 py-0.5 rounded bg-[#17233B]/5 border border-[#17233B]/10 text-[10px] font-medium text-[#17233B]">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* Related Applications */}
              <div className="py-4 space-y-2">
                <h4 className="font-semibold text-[#17233B] uppercase tracking-wider text-[11px]">
                  Candidatures rattachées ({relatedApplications.length})
                </h4>
                {relatedApplications.map(app => (
                  <div key={app.id} className="p-3 bg-[#F3F3EC]/70 rounded border border-[#17233B]/5 text-xs flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-[#17233B]">{app.candidateName}</div>
                      <div className="text-[10px] text-[#17233B]/50 font-mono">{app.candidatePublicId} · Postulé le {app.appliedDate}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-white text-[#17233B] font-semibold text-[10px]">
                      {app.status}
                    </span>
                  </div>
                ))}
                {relatedApplications.length === 0 && (
                  <p className="text-xs text-[#17233B]/40 italic">Aucune candidature reçue pour l'instant.</p>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-[#17233B]/10">
              <button
                type="button"
                onClick={() => setSelectedOffer(null)}
                className="w-full h-10 bg-[#17233B] text-white rounded text-xs font-semibold cursor-pointer"
              >
                Fermer la fiche offre
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
