import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Search,
  CheckCircle2,
  Clock,
  RotateCcw,
  CheckCircle,
  XCircle,
  FileText
} from 'lucide-react';
import { Incident } from '../../types';

interface AdminIncidentsTabProps {
  incidents: Incident[];
  onArbitrateIncident: (incidentId: string, decision: 'CONTINUER' | 'ANNULER' | 'REMPLACER', note: string) => Promise<void>;
  initialStatusFilter?: string;
}

export const AdminIncidentsTab: React.FC<AdminIncidentsTabProps> = ({
  incidents,
  onArbitrateIncident,
  initialStatusFilter
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter || 'ALL');
  const [busyId, setBusyId] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const filteredIncidents = useMemo(() => {
    return incidents.filter(i => {
      if (statusFilter === 'OPEN' && !['OPEN', 'UNDER_REVIEW'].includes(i.status)) return false;
      if (statusFilter === 'RESOLVED' && i.status !== 'RESOLVED') return false;
      if (statusFilter === 'REPLACEMENT_REQUESTED' && !['REPLACEMENT_REQUESTED', 'REPLACEMENT_IN_PROGRESS'].includes(i.status)) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchTitle = i.offerTitle.toLowerCase().includes(q);
        const matchEmp = i.employerName.toLowerCase().includes(q);
        const matchCan = i.employeeName.toLowerCase().includes(q);
        const matchReason = i.reason.toLowerCase().includes(q);
        const matchId = i.id.toLowerCase().includes(q);
        if (!matchTitle && !matchEmp && !matchCan && !matchReason && !matchId) return false;
      }
      return true;
    });
  }, [incidents, statusFilter, search]);

  const handleArbitrate = async (incidentId: string, decision: 'CONTINUER' | 'ANNULER' | 'REMPLACER') => {
    const note = notes[incidentId]?.trim() || `Décision d'arbitrage ${decision} rendue par l'administration centrale.`;
    setBusyId(`${incidentId}-${decision}`);
    setError('');
    setMessage('');
    try {
      await onArbitrateIncident(incidentId, decision, note);
      setMessage(
        decision === 'REMPLACER'
          ? 'Remplacement prioritaire activé. Dossier de sourcing ouvert.'
          : `Incident arbitré : décision "${decision}" enregistrée.`
      );
    } catch (err: any) {
      setError(err.message || 'Impossible d’arbitrer cet incident.');
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
            Centre National des Incidents & Arbitrages
          </h2>
          <p className="text-xs text-[#17233B]/60">
            Médiation déontologique, résiliation encadrée et déclenchement des remplacements d'urgence
          </p>
        </div>

        {/* Filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-9 px-2.5 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B]"
        >
          <option value="ALL">Tous les statuts</option>
          <option value="OPEN">En cours d'examen (Prioritaire)</option>
          <option value="REPLACEMENT_REQUESTED">Remplacement enclenché</option>
          <option value="RESOLVED">Arbitrés / Clôturés</option>
        </select>
      </div>

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

      {/* 2. Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-3 text-[#17233B]/40" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par identifiant incident (INC-), titre de mission, motif ou parties..."
          className="w-full h-10 pl-9 pr-3 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B] placeholder-[#17233B]/40 focus:outline-none focus:border-[#17233B]"
        />
      </div>

      {/* 3. Incidents List */}
      <div className="space-y-3">
        {filteredIncidents.map(inc => {
          const isOpen = ['OPEN', 'UNDER_REVIEW'].includes(inc.status);
          const currentNote = notes[inc.id] || '';

          return (
            <div key={inc.id} className="bg-white border border-[#17233B]/10 rounded-[4px] p-5 space-y-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#17233B]">{inc.id}</span>
                    <span className="text-[10px] text-[#17233B]/50 font-mono">· Contrat {inc.contractId}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      isOpen
                        ? 'bg-rose-100 text-rose-800'
                        : inc.status === 'REPLACEMENT_REQUESTED'
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {inc.status}
                    </span>
                  </div>
                  <h3 className="font-editorial text-lg font-bold text-[#17233B] mt-1">
                    {inc.offerTitle}
                  </h3>
                  <p className="text-xs text-[#17233B]/70 font-medium">
                    Employeur : <span className="text-[#17233B] font-semibold">{inc.employerName}</span> ↔ Salarié : <span className="text-[#17233B] font-semibold">{inc.employeeName}</span>
                  </p>
                </div>

                <div className="text-right text-[11px] text-[#17233B]/50 shrink-0">
                  Signalé le {inc.createdAt} par {inc.declaredBy}
                </div>
              </div>

              {/* Reason & Description */}
              <div className="p-3 bg-[#F3F3EC] rounded border border-[#17233B]/5 space-y-1 text-xs">
                <div className="font-semibold text-[#17233B]">Motif : {inc.reason}</div>
                <div className="text-[#17233B]/80 text-[11px]">{inc.description}</div>
              </div>

              {/* Administrative Resolution Info (if already arbitrated) */}
              {inc.arbitrationDecision && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-900 space-y-0.5">
                  <div className="font-semibold">Décision arbitrale : {inc.arbitrationDecision} ({inc.arbitratedAt})</div>
                  {inc.arbitrationNotes && (
                    <div className="text-[11px] text-emerald-800">Motivation : {inc.arbitrationNotes}</div>
                  )}
                </div>
              )}

              {/* Arbitration Actions (if still open) */}
              {isOpen && (
                <div className="pt-3 border-t border-[#17233B]/10 space-y-2">
                  <label className="block text-xs font-semibold text-[#17233B]">
                    Motivation officielle de la décision arbitrale
                  </label>
                  <input
                    type="text"
                    value={currentNote}
                    onChange={e => setNotes(prev => ({ ...prev, [inc.id]: e.target.value }))}
                    placeholder="Ex: Constat d'abandon de poste contradictoire validé, remplacement prioritaire ordonné..."
                    className="w-full h-9 px-3 bg-white border border-[#17233B]/15 rounded text-xs text-[#17233B]"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busyId.startsWith(inc.id)}
                      onClick={() => handleArbitrate(inc.id, 'CONTINUER')}
                      className="h-10 rounded border border-[#17233B]/20 bg-white hover:bg-[#F3F3EC] text-[#17233B] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer tap-feedback disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>CONTINUER (Médiation)</span>
                    </button>

                    <button
                      type="button"
                      disabled={busyId.startsWith(inc.id)}
                      onClick={() => handleArbitrate(inc.id, 'ANNULER')}
                      className="h-10 rounded border border-[#A33A2B]/30 bg-white hover:bg-rose-50 text-[#A33A2B] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer tap-feedback disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>ANNULER (Résiliation)</span>
                    </button>

                    <button
                      type="button"
                      disabled={busyId.startsWith(inc.id)}
                      onClick={() => handleArbitrate(inc.id, 'REMPLACER')}
                      className="h-10 rounded bg-[#17233B] hover:bg-[#17233B]/90 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer tap-feedback disabled:opacity-50"
                    >
                      <RotateCcw className="w-4 h-4 text-[#B5CEDB]" />
                      <span>REMPLACER (Urgence)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredIncidents.length === 0 && (
          <div className="p-8 bg-white border border-[#17233B]/10 rounded text-center text-xs text-[#17233B]/50">
            Aucun incident ne correspond à ce filtre.
          </div>
        )}
      </div>
    </div>
  );
};
