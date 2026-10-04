import React, { useState, useEffect, useMemo } from 'react';
import { Plus, ShieldCheck, MapPin } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { EditorialSheet } from '../common/EditorialSheet';
import { EditorialButton } from '../common/EditorialButton';
import { getAvatar } from '../../utils/assets';
import {
  BENIN_DEPARTMENTS,
  getCommunesByDepartment,
  getArrondissementsByCommune,
  getLocalitiesByArrondissement,
  formatHierarchyLabel
} from '../../data/beninLocations';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, currentRole, updateCurrentUserProfile } = useApp();

  const [fullName, setFullName] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [phone, setPhone] = useState('');

  // Bénin Geographic Location Hierarchy
  const [departmentId, setDepartmentId] = useState('');
  const [communeId, setCommuneId] = useState('');
  const [arrondissementId, setArrondissementId] = useState('');
  const [localityId, setLocalityId] = useState('');
  const [detailedAddress, setDetailedAddress] = useState('');

  // Candidate Specific Fields
  const [experienceYears, setExperienceYears] = useState(3);
  const [desiredContract, setDesiredContract] = useState('');
  const [desiredSalary, setDesiredSalary] = useState('');
  const [availability, setAvailability] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [newSkillInput, setNewSkillInput] = useState('');

  // Employer Specific Fields
  const [companyName, setCompanyName] = useState('');
  const [managerName, setManagerName] = useState('');
  const [activity, setActivity] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [foundedYear, setFoundedYear] = useState('');

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const availableCommunes = useMemo(() => {
    if (!departmentId) return [];
    return getCommunesByDepartment(departmentId);
  }, [departmentId]);

  const availableArrondissements = useMemo(() => {
    if (!communeId) return [];
    return getArrondissementsByCommune(communeId);
  }, [communeId]);

  const availableLocalities = useMemo(() => {
    if (!arrondissementId) return [];
    return getLocalitiesByArrondissement(arrondissementId);
  }, [arrondissementId]);

  useEffect(() => {
    if (currentUser) {
      setFullName(currentUser.fullName || '');
      setHeadline(currentUser.headline || '');
      setBio(currentUser.bio || '');
      setAvatarUrl(currentUser.avatarUrl || getAvatar(currentUser.id));
      setPhone(currentUser.phone || '+229 97 00 00 00');
      setDepartmentId(currentUser.departmentId || 'dept-littoral');
      setCommuneId(currentUser.communeId || 'com-cotonou');
      setArrondissementId(currentUser.arrondissementId || 'arr-cotonou-12');
      setLocalityId(currentUser.localityId || 'loc-cadjehoun-kpota');
      setDetailedAddress(currentUser.detailedAddress || '');
      setExperienceYears(currentUser.experienceYears || 3);
      setDesiredContract(currentUser.desiredContract || 'CDI ou Mission');
      setDesiredSalary(currentUser.desiredSalary || '150 000 FCFA / mois');
      setAvailability(currentUser.availability || 'Immédiate');
      setSkills(currentUser.skills || []);
      setCompanyName(currentUser.companyName || currentUser.fullName || '');
      setManagerName(currentUser.managerName || currentUser.fullName || '');
      setActivity(currentUser.activity || currentUser.headline || '');
      setTeamSize(currentUser.teamSize || '5 à 15 artisans');
      setFoundedYear(currentUser.foundedYear || '2020');
    }
  }, [currentUser, isOpen]);

  const computedFormattedLocation = useMemo(() => {
    const dept = BENIN_DEPARTMENTS.find(d => d.id === departmentId);
    const com = availableCommunes.find(c => c.id === communeId);
    const arr = availableArrondissements.find(a => a.id === arrondissementId);
    const loc = availableLocalities.find(l => l.id === localityId);
    const base = formatHierarchyLabel(dept?.name, com?.name, arr?.name, loc?.name);
    return base || 'Cotonou (Littoral, Bénin)';
  }, [departmentId, communeId, arrondissementId, localityId, availableCommunes, availableArrondissements, availableLocalities]);

  const handleAddSkill = () => {
    if (!newSkillInput.trim()) return;
    if (!skills.includes(newSkillInput.trim())) {
      setSkills([...skills, newSkillInput.trim()]);
    }
    setNewSkillInput('');
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setSkills(skills.filter(s => s !== skillToRemove));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setSaving(true);
    try {
      const fullLocationString = detailedAddress
        ? `${computedFormattedLocation} — ${detailedAddress}`
        : computedFormattedLocation;

      if (currentRole === 'EMPLOYER') {
        await updateCurrentUserProfile({
          fullName,
          headline: activity || headline,
          location: fullLocationString,
          departmentId,
          communeId,
          arrondissementId,
          localityId,
          detailedAddress,
          bio,
          avatarUrl,
          phone,
          companyName,
          managerName,
          activity,
          teamSize,
          foundedYear
        });
      } else {
        await updateCurrentUserProfile({
          fullName,
          headline,
          location: fullLocationString,
          departmentId,
          communeId,
          arrondissementId,
          localityId,
          detailedAddress,
          bio,
          avatarUrl,
          phone,
          skills,
          experienceYears,
          desiredContract,
          desiredSalary,
          availability
        });
      }
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 600);
    } catch (err) {
      console.error('Failed to update profile', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditorialSheet
      isOpen={isOpen}
      onClose={onClose}
      title={currentRole === 'EMPLOYER' ? "Profil Employeur" : "Mon Profil Professionnel"}
      subtitle={`Identifiant officiel : ${currentUser?.publicId || 'En cours d attribution'}`}
      footer={
        <div className="flex items-center gap-3">
          <EditorialButton
            variant="outline"
            onClick={onClose}
            className="flex-1"
            type="button"
          >
            Annuler
          </EditorialButton>
          <EditorialButton
            variant="primary"
            onClick={handleSave}
            className="flex-2"
            disabled={saving || !fullName.trim()}
          >
            {saving ? 'Enregistrement...' : savedSuccess ? 'Enregistré !' : 'Sauvegarder'}
          </EditorialButton>
        </div>
      }
    >
      <form onSubmit={handleSave} className="space-y-4 py-1 font-operational text-xs">
        <div className="p-3 bg-white rounded border border-[#17233B]/10 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase text-[#17233B]/50 block">Identifiant public LE LABEUR</span>
            <span className="text-sm font-mono font-bold text-[#17233B]">{currentUser?.publicId || 'Identifiant indisponible'}</span>
          </div>
          <span className="text-[10px] font-mono text-[#1BA64B] bg-[#1BA64B]/10 px-2 py-0.5 rounded">Vérifié</span>
        </div>

        <div>
          <label className="block text-[10px] font-mono text-[#17233B]/70 uppercase font-semibold">
            {currentRole === 'EMPLOYER' ? "Nom du responsable ou de l'entreprise" : 'Nom et Prénoms'} *
          </label>
          <input
            type="text"
            required
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="Ex. Reine Houénou"
            className="w-full mt-1 px-3 py-2 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
          />
        </div>

        <div>
          <label className="block text-[10px] font-mono text-[#17233B]/70 uppercase font-semibold">
            {currentRole === 'EMPLOYER' ? "Activité principale" : "Métier / Spécialité"} *
          </label>
          <input
            type="text"
            required
            value={headline}
            onChange={e => setHeadline(e.target.value)}
            placeholder={currentRole === 'EMPLOYER' ? "Ex. Atelier Bois & Agencement Bénin" : "Ex. Ébéniste d'Art & Poseur de Meubles"}
            className="w-full mt-1 px-3 py-2 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
          />
        </div>

        {/* Localisation Bénin */}
        <div className="p-3 bg-white border border-[#17233B]/15 rounded-[4px] space-y-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#17233B] uppercase tracking-wider">
            <MapPin className="w-3.5 h-3.5 text-[#17233B]" />
            <span>Localisation au Bénin</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-mono text-[#17233B]/60 uppercase">Pays</label>
              <input
                type="text"
                disabled
                value="Bénin"
                className="w-full mt-1 px-2.5 py-1.5 bg-[#F3F3EC] rounded border border-[#17233B]/10 text-xs text-[#17233B] font-medium"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-[#17233B]/60 uppercase">Département *</label>
              <select
                value={departmentId}
                onChange={e => {
                  setDepartmentId(e.target.value);
                  setCommuneId('');
                  setArrondissementId('');
                  setLocalityId('');
                }}
                className="w-full mt-1 px-2.5 py-1.5 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
              >
                <option value="">Sélectionner</option>
                {BENIN_DEPARTMENTS.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-[#17233B]/60 uppercase">Commune *</label>
              <select
                value={communeId}
                disabled={!departmentId}
                onChange={e => {
                  setCommuneId(e.target.value);
                  setArrondissementId('');
                  setLocalityId('');
                }}
                className="w-full mt-1 px-2.5 py-1.5 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B] disabled:opacity-40"
              >
                <option value="">Sélectionner</option>
                {availableCommunes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-[#17233B]/60 uppercase">Arrondissement *</label>
              <select
                value={arrondissementId}
                disabled={!communeId}
                onChange={e => {
                  setArrondissementId(e.target.value);
                  setLocalityId('');
                }}
                className="w-full mt-1 px-2.5 py-1.5 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B] disabled:opacity-40"
              >
                <option value="">Sélectionner</option>
                {availableArrondissements.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-mono text-[#17233B]/60 uppercase">Quartier ou Village</label>
              {availableLocalities.length > 0 ? (
                <select
                  value={localityId}
                  onChange={e => setLocalityId(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
                >
                  <option value="">Sélectionner ou préciser ci-dessous</option>
                  {availableLocalities.map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.type})</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="Ex. Cadjèhoun Kpota, Agla, Tankpé..."
                  value={detailedAddress}
                  onChange={e => setDetailedAddress(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
                />
              )}
            </div>
          </div>
          <div className="text-[10px] font-mono text-[#17233B]/60 pt-1">
            Zone enregistrée : <span className="font-semibold text-[#17233B]">{computedFormattedLocation}</span>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-mono text-[#17233B]/70 uppercase font-semibold">
            Téléphone (Protégé, non public)
          </label>
          <input
            type="text"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+229 97 12 34 56"
            className="w-full mt-1 px-3 py-2 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
          />
        </div>

        <div>
          <label className="block text-[10px] font-mono text-[#17233B]/70 uppercase font-semibold">
            Présentation & Savoir-faire
          </label>
          <textarea
            rows={3}
            value={bio}
            onChange={e => setBio(e.target.value)}
            placeholder="Décrivez votre parcours, vos réalisations et votre disponibilité..."
            className="w-full mt-1 px-3 py-2 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none focus:border-[#17233B]"
          />
        </div>

        {currentRole === 'CANDIDATE' && (
          <div className="space-y-3 pt-2 border-t border-[#17233B]/10">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-mono text-[#17233B]/70 uppercase font-semibold">
                  Années d expérience
                </label>
                <input
                  type="number"
                  min={0}
                  max={40}
                  value={experienceYears}
                  onChange={e => setExperienceYears(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-[#17233B]/70 uppercase font-semibold">
                  Disponibilité
                </label>
                <input
                  type="text"
                  value={availability}
                  onChange={e => setAvailability(e.target.value)}
                  placeholder="Ex. Immédiate"
                  className="w-full mt-1 px-3 py-2 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-[#17233B]/70 uppercase font-semibold">
                Rémunération souhaitée (FCFA / mois)
              </label>
              <input
                type="text"
                value={desiredSalary}
                onChange={e => setDesiredSalary(e.target.value)}
                placeholder="Ex. 150 000 FCFA / mois"
                className="w-full mt-1 px-3 py-2 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-[#17233B]/70 uppercase font-semibold mb-1">
                Compétences & Savoir-faire
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {skills.map(s => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#17233B]/5 border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B]"
                  >
                    <span>{s}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSkill(s)}
                      className="hover:text-[#E23D3D] cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSkillInput}
                  onChange={e => setNewSkillInput(e.target.value)}
                  placeholder="Ajouter une compétence..."
                  className="flex-1 px-3 py-1.5 bg-white rounded border border-[#17233B]/15 text-xs text-[#17233B] focus:outline-none"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSkill();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddSkill}
                  className="px-3 py-1.5 bg-[#17233B] text-white text-xs rounded-[4px] font-medium cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="p-3 rounded-[4px] bg-[#1BA64B]/10 border border-[#1BA64B]/20 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-[#1BA64B] shrink-0 mt-0.5" />
          <p className="text-[11px] text-[#17233B]/80 leading-relaxed">
            Vos informations sont protégées par LE LABEUR. Vos coordonnées personnelles ne sont partagées qu après accord mutuel.
          </p>
        </div>
      </form>
    </EditorialSheet>
  );
};
