import React, { useState } from 'react';
import { Plus, Users, Briefcase, PlusCircle, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EditorialButton } from '../components/common/EditorialButton';
import { StatusBadge } from '../components/common/StatusBadge';
import { EditorialSheet } from '../components/common/EditorialSheet';

export const EmployerOffersScreen: React.FC = () => {
  const { offers, applications, openOfferDetail, openConversationForContext, candidates, currentUser, createOffer } = useApp();
  const [newOfferModalOpen, setNewOfferModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSalary, setNewSalary] = useState('180000');
  const [newLocation, setNewLocation] = useState('Cotonou — Cadjèhoun Kpota (Littoral)');
  const [newContractType, setNewContractType] = useState('Mission 6 mois');
  const [newSkills, setNewSkills] = useState('Menuiserie, Lecture de plan, Finition');
  const [newDescription, setNewDescription] = useState('Recherche artisan qualifié pour travaux et pose soignée.');
  const [newDuration, setNewDuration] = useState('6');

  const myOffers = offers.filter(o => !o.isLeLabeurJob && o.employerId === currentUser?.id);

  const handlePublish = async () => {
    if (!newTitle.trim()) return;
    const skillsList = newSkills.split(',').map(s => s.trim()).filter(Boolean);
    await createOffer({
      title: newTitle,
      employerId: currentUser?.id || 'user-emp-1',
      employerName: currentUser?.fullName || "Atelier Bois & Agencement Bénin",
      employerLocation: newLocation,
      contractType: newContractType,
      remuneration: Number(newSalary) || 180000,
      currency: 'FCFA',
      location: newLocation,
      isUrgent: false,
      isLeLabeurJob: false,
      skills: skillsList.length > 0 ? skillsList : ['Artisanat qualifié'],
      summary: newDescription || 'Recherche professionnelle qualifiée sous contrat LE LABEUR.',
      responsibilities: ['Exécution soignée des ouvrages confiés', 'Respect du planning'],
      conditions: ['Règlement direct de fin de mois', 'Matériel de protection fourni'],
      selectionProcess: ['Examen du profil', 'Échange direct', 'Proposition de mission'],
      durationMonths: Number(newDuration) || 6
    });
    setNewOfferModalOpen(false);
    setNewTitle('');
    setNewDescription('');
  };

  return (
    <div className="flex-1 flex flex-col p-5 bg-[#F3F3EC] select-none pb-24 font-operational text-xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="editorial-kicker">
            Mes Offres d'Emploi
          </span>
          <h1 className="font-editorial text-2xl sm:text-3xl font-bold text-[#17233B] tracking-tight mt-0.5">
            Offres Publiées
          </h1>
          <p className="text-xs text-[#17233B]/70 mt-0.5">
            Vos besoins de recrutement au Bénin (ouvertes ou pourvues).
          </p>
        </div>
        <EditorialButton
          variant="primary"
          size="sm"
          onClick={() => setNewOfferModalOpen(true)}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          <span>Publier</span>
        </EditorialButton>
      </div>

      {myOffers.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto">
          <div className="w-14 h-14 rounded-full bg-[#17233B]/5 flex items-center justify-center text-[#17233B]/40 mb-3">
            <Briefcase className="w-6 h-6 stroke-[1.5]" />
          </div>
          <h2 className="font-editorial text-xl font-bold text-[#17233B]">
            Aucune offre publiée pour le moment
          </h2>
          <p className="text-xs text-[#17233B]/60 max-w-xs mt-1 leading-relaxed">
            Formulez votre premier besoin. La publication est gratuite.
          </p>
          <div className="mt-5">
            <EditorialButton
              variant="primary"
              size="md"
              onClick={() => setNewOfferModalOpen(true)}
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              <span>Publier une offre</span>
            </EditorialButton>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-[11px] font-mono uppercase tracking-widest text-[#17233B]/50 font-bold">
            {myOffers.length} OFFRE(S) DANS VOTRE HISTORIQUE
          </div>
          {myOffers.map(offer => {
            const offerApps = applications.filter(a => a.offerId === offer.id);
            const isFilled = offer.status === 'FILLED';

            return (
              <div
                key={offer.id}
                className={`bg-[#FFFFFF] rounded-[4px] border ${
                  isFilled ? 'border-[#1BA64B]/30' : 'border-[#17233B]/12'
                } overflow-hidden shadow-xs`}
              >
                <div 
                  className="p-4 cursor-pointer hover:bg-[#F3F3EC]/50 transition-colors"
                  onClick={() => openOfferDetail(offer)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-[#17233B]/50">{offer.id} · {offer.postedDate}</span>
                        {isFilled && (
                          <span className="text-[10px] font-mono text-[#1BA64B] bg-[#1BA64B]/10 px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Poste pourvu
                          </span>
                        )}
                      </div>
                      <h3 className="font-editorial text-lg font-bold text-[#17233B] mt-0.5">
                        {offer.title}
                      </h3>
                      <p className="text-xs font-operational text-[#17233B]/60 mt-0.5">
                        {offer.location} · {offer.contractType}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-[#17233B] bg-[#17233B]/5 px-2.5 py-1 rounded">
                      {offer.remuneration.toLocaleString()} {offer.currency}
                    </span>
                  </div>

                  {/* RÈGLE 22 : Message confirmation de fermeture d'offre */}
                  {isFilled && (
                    <div className="mt-2 p-2 bg-[#1BA64B]/8 border border-[#1BA64B]/20 rounded text-[11px] text-[#17233B]/80">
                      <strong>Le poste est maintenant pourvu.</strong> L'offre a été retirée de la recherche publique candidat tout en restant archivée ici.
                    </div>
                  )}
                </div>

                <div className="p-3 bg-[#F3F3EC]/50 border-t border-[#17233B]/10 font-operational">
                  <div className="flex items-center justify-between text-xs text-[#17233B]/70 mb-2 font-medium">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-[#17233B]/50" />
                      <span>Candidatures reçues ({offerApps.length})</span>
                    </span>
                  </div>

                  {offerApps.length === 0 ? (
                    <p className="text-[11px] text-[#17233B]/50 italic">
                      Aucune candidature pour l'instant.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {offerApps.map(app => (
                        <div
                          key={app.id}
                          className="p-2.5 bg-[#FFFFFF] rounded-[4px] border border-[#17233B]/10 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2.5">
                            <img
                              src={app.candidateAvatar}
                              alt={app.candidateName}
                              className="w-8 h-8 rounded-[3px] object-cover shrink-0"
                              referrerPolicy="no-referrer"
                            />
                            <div>
                              <p className="text-xs font-bold text-[#17233B]">{app.candidateName}</p>
                              <p className="text-[10px] text-[#17233B]/60">{app.candidateHeadline}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusBadge status={app.status} />
                            <button
                              onClick={async () => {
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
                                    contextTitle: `${offer.title} — Candidature`
                                  }
                                );
                              }}
                              className="text-xs text-[#17233B] font-medium hover:underline p-1 cursor-pointer"
                            >
                              Échanger
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Publish Offer Sheet */}
      <EditorialSheet
        isOpen={newOfferModalOpen}
        onClose={() => setNewOfferModalOpen(false)}
        title="Publier un besoin"
        subtitle="Remplissez les détails du travail"
        footer={
          <EditorialButton
            variant="primary"
            fullWidth
            onClick={handlePublish}
          >
            Valider et publier
          </EditorialButton>
        }
      >
        <div className="space-y-4 font-operational text-xs">
          <div>
            <label className="block font-medium text-[#17233B] mb-1">
              Titre du poste
            </label>
            <input
              type="text"
              placeholder="Ex. Ébéniste d agencement"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              className="w-full h-10 px-3 bg-[#FFFFFF] border border-[#17233B]/20 rounded-[4px] text-xs text-[#17233B]"
            />
          </div>

          <div>
            <label className="block font-medium text-[#17233B] mb-1">
              Lieu de travail au Bénin
            </label>
            <input
              type="text"
              placeholder="Ex. Cotonou — Cadjèhoun Kpota"
              value={newLocation}
              onChange={e => setNewLocation(e.target.value)}
              className="w-full h-10 px-3 bg-[#FFFFFF] border border-[#17233B]/20 rounded-[4px] text-xs text-[#17233B]"
            />
          </div>

          <div>
            <label className="block font-medium text-[#17233B] mb-1">
              Rémunération mensuelle (FCFA)
            </label>
            <input
              type="number"
              value={newSalary}
              onChange={e => setNewSalary(e.target.value)}
              className="w-full h-10 px-3 bg-[#FFFFFF] border border-[#17233B]/20 rounded-[4px] text-xs font-mono text-[#17233B]"
            />
          </div>

          <p className="text-[11px] text-[#17233B]/60 leading-relaxed pt-2">
            La règle déontologique s appliquera : 25% de commission sur le 1er salaire (payée par l employeur), puis 0% pour les mois suivants. Le salarié ne paie aucun frais.
          </p>
        </div>
      </EditorialSheet>
    </div>
  );
};
