import React, { useState } from 'react';
import { ArrowRight, History, X, Compass, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Application } from '../types';
import { EditorialButton } from '../components/common/EditorialButton';
import { StatusBadge } from '../components/common/StatusBadge';
import { EditorialSheet } from '../components/common/EditorialSheet';

export const CandidateApplicationsScreen: React.FC = () => {
  const {
    applications,
    currentUser,
    withdrawApplication,
    openOfferDetail,
    offers,
    setActiveTab,
    setScreen
  } = useApp();

  const [selectedAppHistory, setSelectedAppHistory] = useState<Application | null>(null);
  const [withdrawModalApp, setWithdrawModalApp] = useState<Application | null>(null);

  const myApplications = applications.filter(a => a.candidateId === currentUser?.id);

  const handleConfirmWithdraw = async () => {
    if (!withdrawModalApp) return;
    await withdrawApplication(withdrawModalApp.id);
    setWithdrawModalApp(null);
  };

  const handleViewOffer = (offerId: string) => {
    const off = offers.find(o => o.id === offerId);
    if (off) openOfferDetail(off);
  };

  return (
    <div className="flex-1 flex flex-col p-6 bg-[#F3F3EC] select-none pb-24 font-operational text-xs text-[#17233B]">
      <div className="mb-6 space-y-1">
        <span className="editorial-kicker">
          ESPACE CANDIDAT · SUIVI
        </span>
        <h1 className="font-editorial text-3xl sm:text-4xl font-bold text-[#17233B] tracking-tight mt-0.5">
          Mes Candidatures
        </h1>
        <p className="text-xs text-[#17233B]/70 leading-relaxed pt-1">
          Suivez l état de vos candidatures auprès des recruteurs au Bénin.
        </p>
      </div>

      {myApplications.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto">
          <div className="w-14 h-14 rounded-full bg-[#17233B]/5 flex items-center justify-center text-[#17233B]/40 mb-3">
            <Compass className="w-6 h-6 stroke-[1.5]" />
          </div>
          <h2 className="font-editorial text-2xl font-bold text-[#17233B]">
            Aucune candidature en cours
          </h2>
          <p className="text-xs text-[#17233B]/60 max-w-xs mt-2 leading-relaxed">
            Consultez les offres près de chez vous et postulez selon vos compétences.
          </p>
          <div className="mt-6">
            <EditorialButton
              variant="primary"
              size="md"
              onClick={() => setActiveTab('DISCOVER')}
            >
              <span>Découvrir les offres</span>
              <ArrowRight className="w-4 h-4 ml-2" />
            </EditorialButton>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#17233B]/50 font-semibold border-b border-[#17233B]/10 pb-2">
            <span>{myApplications.length} CANDIDATURE(S)</span>
            <span>RÉPUBLIQUE DU BÉNIN</span>
          </div>

          <div className="divide-y divide-[#17233B]/10">
            {myApplications.map(app => {
              const canWithdraw = app.status === 'PENDING' || app.status === 'REVIEW';
              return (
                <div
                  key={app.id}
                  className="py-4 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[10px] font-mono text-[#17233B]/50 block">
                        Réf. {app.id} · {app.appliedDate}
                      </span>
                      <h3 className="font-editorial text-xl font-bold text-[#17233B] mt-0.5 leading-snug">
                        {app.offerTitle}
                      </h3>
                    </div>
                    <StatusBadge status={app.status} />
                  </div>

                  {app.status === 'SHORTLISTED' && (
                    <div className="p-3 bg-[#1BA64B]/8 border border-[#1BA64B]/20 rounded-[4px] text-[11px] text-[#17233B] flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#1BA64B] shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-[#1BA64B]">Dossier Retenu !</span>
                        <p className="text-[11px] text-[#17233B]/75 mt-0.5 leading-relaxed">
                          Le recruteur a sélectionné votre profil. Consultez vos messages ou vos contrats pour formaliser l'accord.
                        </p>
                      </div>
                    </div>
                  )}

                  {app.status === 'REJECTED' && (
                    <div className="p-3 bg-[#E23D3D]/6 border border-[#E23D3D]/15 rounded-[4px] text-[11px] text-[#E23D3D] space-y-1">
                      <div className="font-semibold">
                        Candidature non retenue
                      </div>
                      {app.note && (
                        <p className="text-[11px] text-[#17233B]/75 italic">
                          Motif : {app.note}
                        </p>
                      )}
                    </div>
                  )}

                  {app.status === 'WITHDRAWN' && (
                    <div className="p-2.5 bg-[#17233B]/5 rounded-[4px] text-[11px] text-[#17233B]/60 italic">
                      Candidature retirée par vos soins.
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={() => setSelectedAppHistory(app)}
                      className="flex items-center gap-1.5 text-[#17233B]/60 hover:text-[#17233B] text-[11px] tap-feedback cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Historique ({app.history.length})</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewOffer(app.offerId)}
                        className="px-2.5 py-1 text-xs text-[#17233B] underline underline-offset-2 font-medium hover:text-[#17233B]/70 cursor-pointer"
                      >
                        Voir l'offre
                      </button>
                      {app.contractId && (
                        <button
                          onClick={() => setScreen('CONTRACTS')}
                          className="px-2.5 py-1 text-xs font-semibold text-[#340C24] bg-[#340C24]/10 rounded hover:bg-[#340C24]/15 cursor-pointer"
                        >
                          Voir le contrat
                        </button>
                      )}
                      {canWithdraw && (
                        <button
                          onClick={() => setWithdrawModalApp(app)}
                          className="px-3 py-1 rounded-full border border-[#E23D3D]/30 text-[#E23D3D] text-[11px] font-medium hover:bg-[#E23D3D]/5 tap-feedback flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Retirer</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* History Modal */}
      <EditorialSheet
        isOpen={Boolean(selectedAppHistory)}
        onClose={() => setSelectedAppHistory(null)}
        title="Historique de candidature"
        subtitle={selectedAppHistory?.offerTitle}
      >
        <div className="space-y-3 font-operational text-xs">
          {selectedAppHistory?.history.map((h, idx) => (
            <div key={idx} className="p-3 bg-white rounded border border-[#17233B]/10 space-y-1 shadow-none">
              <div className="flex justify-between text-[10px] font-mono text-[#17233B]/50">
                <span>{h.timestamp}</span>
                <span className="font-bold text-[#17233B]">{h.actor}</span>
              </div>
              <p className="font-semibold text-xs text-[#17233B]">{h.action}</p>
            </div>
          ))}
        </div>
      </EditorialSheet>

      {/* Withdraw Confirmation Modal */}
      <EditorialSheet
        isOpen={Boolean(withdrawModalApp)}
        onClose={() => setWithdrawModalApp(null)}
        title="Retirer votre candidature ?"
        subtitle="Vous pourrez repostuler plus tard si vous le souhaitez"
        footer={
          <div className="flex items-center gap-3">
            <EditorialButton
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setWithdrawModalApp(null)}
            >
              Annuler
            </EditorialButton>
            <EditorialButton
              variant="danger"
              size="sm"
              className="flex-1"
              onClick={handleConfirmWithdraw}
            >
              Confirmer le retrait
            </EditorialButton>
          </div>
        }
      >
        <div className="space-y-3 font-operational text-xs">
          <p className="text-xs text-[#17233B]/80 leading-relaxed">
            Vous retirez votre candidature pour : <strong>{withdrawModalApp?.offerTitle}</strong>.
          </p>
        </div>
      </EditorialSheet>
    </div>
  );
};
