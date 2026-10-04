import React, { useState } from 'react';
import {
  Users,
  Search,
  Check,
  X,
  MessageSquare,
  Eye,
  MapPin,
  Clock,
  Phone
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EditorialButton } from '../components/common/EditorialButton';
import { StatusBadge } from '../components/common/StatusBadge';
import { EditorialSheet } from '../components/common/EditorialSheet';
import { Application } from '../types';

export const EmployerApplicationsScreen: React.FC = () => {
  const {
    currentUser,
    applications,
    offers,
    candidates,
    openCandidateDetail,
    openConversationForContext,
    examineApplication,
    shortlistApplication,
    rejectApplication,
    startAudioCall
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'SHORTLISTED' | 'REJECTED'>('ALL');
  const [selectedOfferId, setSelectedOfferId] = useState<string>('ALL');
  const [rejectModalApp, setRejectModalApp] = useState<any | null>(null);
  const [rejectReasonNote, setRejectReasonNote] = useState('');
  const [callToast, setCallToast] = useState<string | null>(null);

  const myOffers = offers.filter(o => !o.isLeLabeurJob && o.employerId === currentUser?.id);
  const myOfferIds = myOffers.map(o => o.id);

  const filteredApps = applications.filter(app => {
    if (!myOfferIds.includes(app.offerId)) return false;
    if (selectedOfferId !== 'ALL' && app.offerId !== selectedOfferId) return false;
    if (statusFilter === 'PENDING' && (app.status !== 'PENDING' && app.status !== 'REVIEW')) return false;
    if (statusFilter === 'SHORTLISTED' && app.status !== 'SHORTLISTED') return false;
    if (statusFilter === 'REJECTED' && app.status !== 'REJECTED') return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      app.candidateName.toLowerCase().includes(q) ||
      app.candidateHeadline.toLowerCase().includes(q) ||
      app.offerTitle.toLowerCase().includes(q)
    );
  });

  const handleOpenProfile = (candidateId: string) => {
    const fullCand = candidates.find(c => c.id === candidateId);
    if (fullCand) {
      openCandidateDetail(fullCand);
    }
  };

  const handleContact = async (app: Application) => {
    const fullCand = candidates.find(c => c.id === app.candidateId);
    await openConversationForContext(
      {
        id: app.candidateId,
        publicId: fullCand?.publicId || '',
        name: app.candidateName,
        role: 'CANDIDATE',
        avatarUrl: app.candidateAvatar || fullCand?.avatarUrl || ''
      },
      {
        contextType: 'APPLICATION',
        contextRefId: app.id,
        contextTitle: `${app.offerTitle} — Candidature`
      }
    );
  };

  const handleAudioCall = async (app: any) => {
    try {
      await startAudioCall({
        id: app.candidateId,
        fullName: app.candidateName,
        role: 'CANDIDATE',
        avatarUrl: app.candidateAvatar || '',
        headline: app.offerTitle
      });
    } catch {
      setCallToast("Microphone non disponible pour l'appel.");
      setTimeout(() => setCallToast(null), 3000);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectModalApp) return;
    await rejectApplication(rejectModalApp.id, rejectReasonNote || 'Profil non retenu pour ce chantier.');
    setRejectModalApp(null);
    setRejectReasonNote('');
  };

  return (
    <div className="flex-1 flex flex-col p-5 bg-[#F3F3EC] select-none pb-24 font-operational text-xs text-[#17233B]">
      <div className="mb-4">
        <span className="editorial-kicker">
          Espace Recrutement
        </span>
        <h1 className="font-editorial text-2xl sm:text-3xl font-bold text-[#17233B] tracking-tight mt-0.5">
          Candidatures Reçues
        </h1>
        <p className="text-xs text-[#17233B]/70 mt-0.5">
          Profils qualifiés ayant postulé à vos offres
        </p>
      </div>

      <div className="relative mb-3">
        <Search className="w-4 h-4 absolute left-3.5 top-3 text-[#17233B]/40" />
        <input
          type="text"
          placeholder="Rechercher par travailleur, métier ou mot-clé..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full h-10 pl-9 pr-3 bg-white border border-[#17233B]/15 rounded-[4px] text-xs font-operational text-[#17233B] placeholder-[#17233B]/40 focus:outline-none focus:border-[#17233B]"
        />
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-[4px] text-[11px] font-medium transition-colors shrink-0 cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-[#17233B] text-[#F3F3EC]'
                : 'bg-white border border-[#17233B]/10 text-[#17233B]/70 hover:text-[#17233B]'
            }`}
          >
            Toutes ({myOffers.length > 0 ? applications.filter(a => myOfferIds.includes(a.offerId)).length : 0})
          </button>
          <button
            onClick={() => setStatusFilter('PENDING')}
            className={`px-3 py-1.5 rounded-[4px] text-[11px] font-medium transition-colors shrink-0 cursor-pointer ${
              statusFilter === 'PENDING'
                ? 'bg-[#FFA800] text-[#17233B] font-bold'
                : 'bg-white border border-[#17233B]/10 text-[#17233B]/70 hover:text-[#17233B]'
            }`}
          >
            À examiner ({applications.filter(a => myOfferIds.includes(a.offerId) && (a.status === 'PENDING' || a.status === 'REVIEW')).length})
          </button>
          <button
            onClick={() => setStatusFilter('SHORTLISTED')}
            className={`px-3 py-1.5 rounded-[4px] text-[11px] font-medium transition-colors shrink-0 cursor-pointer ${
              statusFilter === 'SHORTLISTED'
                ? 'bg-[#1BA64B] text-white font-bold'
                : 'bg-white border border-[#17233B]/10 text-[#17233B]/70 hover:text-[#17233B]'
            }`}
          >
            Retenues ({applications.filter(a => myOfferIds.includes(a.offerId) && a.status === 'SHORTLISTED').length})
          </button>
          <button
            onClick={() => setStatusFilter('REJECTED')}
            className={`px-3 py-1.5 rounded-[4px] text-[11px] font-medium transition-colors shrink-0 cursor-pointer ${
              statusFilter === 'REJECTED'
                ? 'bg-[#E23D3D] text-white font-bold'
                : 'bg-white border border-[#17233B]/10 text-[#17233B]/70 hover:text-[#17233B]'
            }`}
          >
            Refusées ({applications.filter(a => myOfferIds.includes(a.offerId) && a.status === 'REJECTED').length})
          </button>
        </div>

        {myOffers.length > 0 && (
          <select
            value={selectedOfferId}
            onChange={e => setSelectedOfferId(e.target.value)}
            className="w-full h-9 px-3 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B]"
          >
            <option value="ALL">Toutes mes offres</option>
            {myOffers.map(o => (
              <option key={o.id} value={o.id}>
                {o.title} ({o.id})
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-3">
        {filteredApps.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-[4px] border border-[#17233B]/10 text-[#17233B]/50">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="font-editorial text-base font-bold text-[#17233B]">
              Aucune candidature trouvée
            </p>
          </div>
        ) : (
          filteredApps.map(app => {
            const candidateInfo = candidates.find(c => c.id === app.candidateId);
            return (
              <div
                key={app.id}
                className="p-4 bg-white rounded-[4px] border border-[#17233B]/12 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <img
                      src={app.candidateAvatar}
                      alt={app.candidateName}
                      className="w-13 h-15 rounded-[3px] object-cover shrink-0 border border-[#17233B]/10 shadow-xs"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-editorial text-base font-bold text-[#17233B] truncate">
                          {app.candidateName}
                        </h3>
                        {candidateInfo?.publicId && (
                          <span className="font-mono text-[9px] text-[#340C24] bg-[#340C24]/5 px-1 py-0.5 rounded font-bold">
                            {candidateInfo.publicId}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#17233B]/75 truncate font-medium">
                        {app.candidateHeadline}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-[#17233B]/60 mt-0.5">
                        <span className="flex items-center gap-0.5">
                          <MapPin className="w-3 h-3" />
                          <span>{candidateInfo?.location || 'Bénin'}</span>
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-0.5 text-[#1BA64B]">
                          <Clock className="w-3 h-3" />
                          <span>{candidateInfo?.availability || 'Disponible'}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={app.status} />
                </div>

                <div className="p-2 bg-[#F3F3EC] rounded text-[11px] flex items-center justify-between">
                  <span className="text-[#17233B]/80 font-medium truncate">
                    Offre : <strong>{app.offerTitle}</strong>
                  </span>
                  <span className="text-[10px] font-mono text-[#17233B]/50 shrink-0 ml-2">
                    {app.appliedDate}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-[#17233B]/5">
                  <EditorialButton
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenProfile(app.candidateId)}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    <span>Profil</span>
                  </EditorialButton>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleAudioCall(app)}
                      className="py-1 px-2.5 border border-[#1BA64B]/30 bg-[#1BA64B]/10 rounded text-[#17233B] hover:bg-[#1BA64B]/20 tap-feedback flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                      title="Appel direct LE LABEUR"
                    >
                      <Phone className="w-3.5 h-3.5 text-[#1BA64B]" />
                      <span>Appel</span>
                    </button>
                    <EditorialButton
                      variant="outline"
                      size="sm"
                      onClick={() => handleContact(app)}
                    >
                      <MessageSquare className="w-3 h-3 mr-1" />
                      <span>Chat</span>
                    </EditorialButton>
                    {app.status === 'PENDING' && (
                      <EditorialButton
                        variant="secondary"
                        size="sm"
                        onClick={() => examineApplication(app.id)}
                      >
                        <span>Examiner</span>
                      </EditorialButton>
                    )}
                    {app.status !== 'SHORTLISTED' && (
                      <EditorialButton
                        variant="primary"
                        size="sm"
                        onClick={() => shortlistApplication(app.id)}
                      >
                        <Check className="w-3 h-3 mr-1" />
                        <span>Retenir</span>
                      </EditorialButton>
                    )}
                    {app.status !== 'REJECTED' && (
                      <button
                        onClick={() => setRejectModalApp(app)}
                        title="Refuser la candidature avec motif"
                        className="w-8 h-8 flex items-center justify-center rounded border border-[#E23D3D]/30 text-[#E23D3D] hover:bg-[#E23D3D]/10 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <EditorialSheet
        isOpen={Boolean(rejectModalApp)}
        onClose={() => setRejectModalApp(null)}
        title="Refuser la candidature"
        subtitle="Un motif sera notifié au candidat"
        footer={
          <div className="flex items-center gap-2">
            <EditorialButton
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setRejectModalApp(null)}
            >
              Annuler
            </EditorialButton>
            <EditorialButton
              variant="danger"
              size="sm"
              className="flex-1"
              onClick={handleConfirmReject}
            >
              Confirmer le refus
            </EditorialButton>
          </div>
        }
      >
        <div className="space-y-3 font-operational text-xs">
          <p className="text-[#17233B]/80">
            Candidat : <strong>{rejectModalApp?.candidateName}</strong> pour <em>{rejectModalApp?.offerTitle}</em>.
          </p>
          <div>
            <label className="block font-medium text-[#17233B] mb-1">
              Motif du refus
            </label>
            <textarea
              rows={3}
              value={rejectReasonNote}
              onChange={e => setRejectReasonNote(e.target.value)}
              placeholder="Ex. Profil orienté menuiserie bois plutôt que laquage cabine..."
              className="w-full p-2.5 bg-white border border-[#17233B]/20 rounded text-xs text-[#17233B]"
            />
          </div>
        </div>
      </EditorialSheet>

      {callToast && (
        <div className="fixed top-16 left-4 right-4 z-50 max-w-sm mx-auto p-3 bg-[#17233B] text-[#F3F3EC] rounded-[4px] shadow-lg flex items-center justify-between gap-2 text-xs font-operational animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#1BA64B] shrink-0" />
            <span>{callToast}</span>
          </div>
          <button
            onClick={() => setCallToast(null)}
            className="text-[10px] font-mono opacity-60 hover:opacity-100 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};
