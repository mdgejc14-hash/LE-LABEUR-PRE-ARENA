import React, { useState } from 'react';
import {
  RotateCcw,
  UserCheck,
  Send,
  FileCheck,
  CheckCircle,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';
import { ReplacementDossier, UserProfile } from '../../types';

interface AdminReplacementsTabProps {
  replacements: ReplacementDossier[];
  candidates: UserProfile[];
  onAssignCandidate: (replacementId: string, candidateId: string) => Promise<void>;
  onTransferCandidate: (replacementId: string) => Promise<void>;
  onFinalizeContract: (replacementId: string) => Promise<void>;
}

export const AdminReplacementsTab: React.FC<AdminReplacementsTabProps> = ({
  replacements,
  candidates,
  onAssignCandidate,
  onTransferCandidate,
  onFinalizeContract
}) => {
  const [selectedCandidate, setSelectedCandidate] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const executeAction = async (id: string, actionFn: () => Promise<void>, successText: string) => {
    setBusyId(id);
    setError('');
    setMessage('');
    try {
      await actionFn();
      setMessage(successText);
    } catch (err: any) {
      setError(err.message || 'Action impossible.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Header */}
      <div>
        <h2 className="font-editorial text-2xl font-bold text-[#17233B]">
          Cellule des Remplacements d'Urgence
        </h2>
        <p className="text-xs text-[#17233B]/60">
          Garantie de continuité de service : sourcing prioritaire, transfert et réémission contractuelle
        </p>
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

      {/* 2. Replacement Dossiers List */}
      <div className="space-y-4">
        {replacements.map(rep => {
          const candidateChoice = selectedCandidate[rep.id] || '';
          const isSourcing = rep.status === 'SOURCING_CANDIDATES';
          const isSelected = rep.status === 'CANDIDATE_SELECTED';
          const isTransferred = rep.status === 'TRANSFERRED_TO_EMPLOYER';
          const isFinalized = rep.status === 'CONTRACT_FINALIZED';

          return (
            <div key={rep.id} className="bg-white border border-[#17233B]/10 rounded-[4px] p-5 space-y-4 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#17233B]">{rep.id}</span>
                    <span className="text-[10px] text-[#17233B]/50">· Incident d'origine {rep.incidentId}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-indigo-100 text-indigo-900">
                      {rep.status}
                    </span>
                  </div>
                  <h3 className="font-editorial text-lg font-bold text-[#17233B] mt-1">
                    {rep.urgentOfferTitle}
                  </h3>
                  <p className="text-xs text-[#17233B]/70">
                    Contrat initial : <span className="font-mono font-medium">{rep.originalContractId}</span> · Employeur : <span className="font-semibold">{rep.employerName}</span>
                  </p>
                </div>

                <div className="text-right text-[11px] text-[#17233B]/50 shrink-0">
                  Ouvert le {rep.openedAt}
                </div>
              </div>

              {/* Progress Steps */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs py-2 border-y border-[#17233B]/10">
                <div className={`p-2 rounded ${isSourcing || isSelected || isTransferred || isFinalized ? 'bg-[#17233B] text-white font-medium' : 'bg-[#F3F3EC] text-[#17233B]/50'}`}>
                  1. Sourcing
                </div>
                <div className={`p-2 rounded ${isSelected || isTransferred || isFinalized ? 'bg-[#17233B] text-white font-medium' : 'bg-[#F3F3EC] text-[#17233B]/50'}`}>
                  2. Sélection
                </div>
                <div className={`p-2 rounded ${isTransferred || isFinalized ? 'bg-[#17233B] text-white font-medium' : 'bg-[#F3F3EC] text-[#17233B]/50'}`}>
                  3. Transfert
                </div>
                <div className={`p-2 rounded ${isFinalized ? 'bg-[#1BA64B] text-white font-semibold' : 'bg-[#F3F3EC] text-[#17233B]/50'}`}>
                  4. Contrat Actif
                </div>
              </div>

              {/* Operational Action Controls */}
              <div className="pt-2">
                {isSourcing && (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-[#17233B]">
                      Affecter un artisan qualifié du vivier national
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={candidateChoice}
                        onChange={e => setSelectedCandidate(prev => ({ ...prev, [rep.id]: e.target.value }))}
                        className="flex-1 h-10 px-3 bg-white border border-[#17233B]/15 rounded text-xs text-[#17233B]"
                      >
                        <option value="">Sélectionner un artisan disponible...</option>
                        {candidates.map(can => (
                          <option key={can.id} value={can.id}>
                            {can.fullName} ({can.publicId}) · {can.location}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!candidateChoice || busyId === `assign-${rep.id}`}
                        onClick={() => executeAction(
                          `assign-${rep.id}`,
                          () => onAssignCandidate(rep.id, candidateChoice),
                          'Candidat affecté avec succès au dossier de remplacement.'
                        )}
                        className="px-4 h-10 bg-[#17233B] text-white rounded text-xs font-semibold cursor-pointer tap-feedback disabled:opacity-50"
                      >
                        Affecter
                      </button>
                    </div>
                  </div>
                )}

                {isSelected && (
                  <div className="flex items-center justify-between bg-indigo-50 p-3 rounded border border-indigo-200 text-xs">
                    <div>
                      <div className="font-semibold text-indigo-950">Artisan retenu pour le remplacement</div>
                      <div className="text-[11px] text-indigo-800">
                        {rep.selectedCandidateName} ({rep.selectedCandidatePublicId})
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === `transfer-${rep.id}`}
                      onClick={() => executeAction(
                        `transfer-${rep.id}`,
                        () => onTransferCandidate(rep.id),
                        'Profil transféré à l’employeur. Dossier prêt pour finalisation contractuelle.'
                      )}
                      className="px-4 py-2 bg-[#17233B] text-white rounded text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer tap-feedback disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Transférer à l'employeur</span>
                    </button>
                  </div>
                )}

                {isTransferred && (
                  <div className="flex items-center justify-between bg-amber-50 p-3 rounded border border-amber-200 text-xs">
                    <div>
                      <div className="font-semibold text-amber-950">Profil validé par l'employeur</div>
                      <div className="text-[11px] text-amber-800">Prêt pour réémission du nouveau contrat de travail</div>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === `finalize-${rep.id}`}
                      onClick={() => executeAction(
                        `finalize-${rep.id}`,
                        () => onFinalizeContract(rep.id),
                        'Nouveau contrat de remplacement généré sous signature. Remplacement actif !'
                      )}
                      className="px-4 py-2 bg-[#1BA64B] text-white rounded text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer tap-feedback disabled:opacity-50"
                    >
                      <FileCheck className="w-3.5 h-3.5" />
                      <span>Finaliser le Contrat</span>
                    </button>
                  </div>
                )}

                {isFinalized && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-950 flex items-center justify-between">
                    <div>
                      <div className="font-semibold">Remplacement mené à terme avec succès</div>
                      <div className="text-[11px] text-emerald-800">
                        Nouveau contrat actif émis : <span className="font-mono font-bold">{rep.newContractId}</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-emerald-700 font-mono font-semibold">100% GARANTI</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {replacements.length === 0 && (
          <div className="p-8 bg-white border border-[#17233B]/10 rounded text-center text-xs text-[#17233B]/50">
            Aucun dossier de remplacement actif. Tous les postes sont pourvus.
          </div>
        )}
      </div>
    </div>
  );
};
