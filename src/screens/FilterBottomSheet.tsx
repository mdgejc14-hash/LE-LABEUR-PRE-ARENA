import React, { useMemo, useState } from 'react';
import { FilterState } from '../types';
import { EditorialSheet } from '../components/common/EditorialSheet';
import { EditorialButton } from '../components/common/EditorialButton';
import {
  BENIN_DEPARTMENTS,
  getCommunesByDepartment,
  getArrondissementsByCommune,
  getLocalitiesByArrondissement,
  getBeninLocationCoverage,
  searchBeninLocations
} from '../data/beninLocations';
import { ACTIVITY_DOMAINS, getAllJobs } from '../data/activityCatalog';
import { MapPin, Briefcase, RotateCcw, Info } from 'lucide-react';

interface FilterBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  filterState: FilterState;
  onApply: (updated: Partial<FilterState>) => void;
  onReset: () => void;
  resultsCount: number;
}

export const FilterBottomSheet: React.FC<FilterBottomSheetProps> = ({
  isOpen,
  onClose,
  filterState,
  onApply,
  onReset,
  resultsCount
}) => {
  const [localState, setLocalState] = useState<FilterState>({ ...filterState });

  const communes = localState.departmentId
    ? getCommunesByDepartment(localState.departmentId)
    : [];

  const arrondissements = localState.communeId
    ? getArrondissementsByCommune(localState.communeId)
    : [];

  const coverage = getBeninLocationCoverage();
  const [locationSearch, setLocationSearch] = useState('');
  const locationSuggestions = useMemo(() => searchBeninLocations(locationSearch, 8), [locationSearch]);
  const jobOptions = useMemo(() => getAllJobs().filter(job => !localState.selectedDomain || job.domainId === localState.selectedDomain), [localState.selectedDomain]);

  const localities = localState.arrondissementId
    ? getLocalitiesByArrondissement(localState.arrondissementId)
    : [];

  const handleApply = () => {
    onApply(localState);
    onClose();
  };

  const handleReset = () => {
    onReset();
    setLocalState({
      searchQuery: '',
      location: '',
      departmentId: '',
      communeId: '',
      arrondissementId: '',
      localityId: '',
      contractType: '',
      minSalary: 0,
      availability: '',
      remoteOption: 'ALL',
      selectedSkills: [],
      selectedDomain: '',
      selectedJob: ''
    });
    onClose();
  };

  return (
    <EditorialSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Filtres de recherche"
    >
      <div className="p-5 space-y-6 font-operational text-[#17233B]">
        {/* Localisation Bénin */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-[#17233B]/70 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#340C24]" />
              Localisation au Bénin
            </label>
            <span className="text-[10px] text-[#17233B]/50 font-medium">4 niveaux administratifs</span>
          </div>

          <div className="space-y-2.5">
            <div className="relative">
              <label className="text-[11px] text-[#17233B]/60 block mb-1">Rechercher une zone</label>
              <input
                value={locationSearch}
                onChange={(e) => setLocationSearch(e.target.value)}
                placeholder="Département, commune, arrondissement, quartier..."
                className="w-full h-10 px-3 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B] placeholder-[#17233B]/40 focus:outline-none focus:border-[#17233B]"
              />
              {locationSearch.trim() && locationSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-56 overflow-y-auto bg-white border border-[#17233B]/15 rounded-[4px] shadow-lg">
                  {locationSuggestions.map((result) => (
                    <button
                      key={`${result.type}-${result.id}`}
                      type="button"
                      onClick={() => {
                        setLocalState(prev => ({
                          ...prev,
                          location: result.formattedLabel,
                          departmentId: result.departmentId,
                          communeId: result.communeId || '',
                          arrondissementId: result.arrondissementId || '',
                          localityId: result.localityId || ''
                        }));
                        setLocationSearch(result.formattedLabel);
                      }}
                      className="w-full text-left px-3 py-2.5 border-b border-[#17233B]/5 last:border-b-0 hover:bg-[#17233B]/5 cursor-pointer"
                    >
                      <div className="text-[11px] font-semibold text-[#17233B]">{result.localityName || result.arrondissementName || result.communeName}</div>
                      <div className="text-[10px] text-[#17233B]/50">{result.formattedLabel}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-[#17233B]/60 block mb-1">1. Département</label>
                <select
                  value={localState.departmentId || ''}
                  onChange={(e) => {
                    const depId = e.target.value;
                    const dep = BENIN_DEPARTMENTS.find(d => d.id === depId);
                    setLocalState(prev => ({
                      ...prev,
                      departmentId: depId,
                      communeId: '',
                      arrondissementId: '',
                      localityId: '',
                      location: dep ? dep.name : ''
                    }));
                  }}
                  className="w-full h-10 px-2.5 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B]"
                >
                  <option value="">Tous les départements</option>
                  {BENIN_DEPARTMENTS.map(dep => (
                    <option key={dep.id} value={dep.id}>{dep.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] text-[#17233B]/60 block mb-1">2. Commune</label>
                <select
                  value={localState.communeId || ''}
                  onChange={(e) => {
                    const comId = e.target.value;
                    const com = communes.find(c => c.id === comId);
                    setLocalState(prev => ({
                      ...prev,
                      communeId: comId,
                      arrondissementId: '',
                      localityId: '',
                      location: com ? `${com.name}` : prev.location
                    }));
                  }}
                  disabled={!localState.departmentId}
                  className="w-full h-10 px-2.5 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B] disabled:bg-[#17233B]/5 disabled:text-[#17233B]/40"
                >
                  <option value="">Toutes les communes</option>
                  {communes.map(com => (
                    <option key={com.id} value={com.id}>{com.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-[#17233B]/60 block mb-1">3. Arrondissement</label>
                <select
                  value={localState.arrondissementId || ''}
                  onChange={(e) => {
                    const arrId = e.target.value;
                    const arr = arrondissements.find(a => a.id === arrId);
                    setLocalState(prev => ({
                      ...prev,
                      arrondissementId: arrId,
                      localityId: '',
                      location: arr ? `${arr.name}` : prev.location
                    }));
                  }}
                  disabled={!localState.communeId}
                  className="w-full h-10 px-2.5 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B] disabled:bg-[#17233B]/5 disabled:text-[#17233B]/40"
                >
                  <option value="">Tous les arrondissements</option>
                  {arrondissements.map(arr => (
                    <option key={arr.id} value={arr.id}>{arr.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] text-[#17233B]/60 block mb-1">4. Quartier / Village</label>
                <select
                  value={localState.localityId || ''}
                  onChange={(e) => {
                    const locId = e.target.value;
                    const loc = localities.find(l => l.id === locId);
                    setLocalState(prev => ({
                      ...prev,
                      localityId: locId,
                      location: loc ? `${loc.name}` : prev.location
                    }));
                  }}
                  disabled={!localState.arrondissementId}
                  className="w-full h-10 px-2.5 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B] disabled:bg-[#17233B]/5 disabled:text-[#17233B]/40"
                >
                  <option value="">Tous les quartiers/villages</option>
                  {localities.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[10px] text-[#17233B]/50 bg-[#17233B]/5 p-2 rounded-[4px]">
              <Info className="w-3.5 h-3.5 shrink-0 text-[#340C24]" />
              <span>{coverage.isComplete ? 'Référentiel géographique national du Bénin.' : `Référentiel en cours d’intégration (${coverage.departments}/${coverage.targets.departments} départements, ${coverage.communes}/${coverage.targets.communes} communes).`}</span>
            </div>
          </div>
        </div>

        {/* Domaine d'activité */}
        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-[#17233B]/70 flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5 text-[#340C24]" />
            Secteur d'activité
          </label>
          <select
            value={localState.selectedDomain || ''}
            onChange={(e) => setLocalState(prev => ({ ...prev, selectedDomain: e.target.value, selectedJob: '' }))}
            className="w-full h-10 px-2.5 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B]"
          >
            <option value="">Tous les secteurs</option>
            {ACTIVITY_DOMAINS.map(dom => (
              <option key={dom.id} value={dom.id}>{dom.title}</option>
            ))}
          </select>
        </div>

        {/* Métier */}
        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-[#17233B]/70 flex items-center gap-1.5">
            Métier
          </label>
          <select
            value={localState.selectedJob || ''}
            onChange={(e) => setLocalState(prev => ({ ...prev, selectedJob: e.target.value }))}
            className="w-full h-10 px-2.5 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B]"
          >
            <option value="">Tous les métiers</option>
            {jobOptions.map(job => (
              <option key={job.id} value={job.id}>{job.title}</option>
            ))}
          </select>
        </div>

        {/* Type de mission / contrat */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-[#17233B]/70">
            Type de mission
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { id: '', label: 'Tous' },
              { id: 'CDI', label: 'CDI' },
              { id: 'CDD', label: 'CDD' },
              { id: 'MISSION', label: 'Mission / Chantier' },
              { id: 'JOURNALIER', label: 'Journalier' }
            ].map(type => (
              <button
                key={type.id}
                type="button"
                onClick={() => setLocalState(prev => ({ ...prev, contractType: type.id }))}
                className={`px-3 py-1.5 rounded-[4px] text-xs border transition-colors cursor-pointer ${
                  localState.contractType === type.id
                    ? 'bg-[#17233B] text-white border-[#17233B]'
                    : 'bg-white text-[#17233B]/70 border-[#17233B]/15 hover:border-[#17233B]/40'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* Boutons d'action */}
        <div className="pt-4 border-t border-[#17233B]/10 flex gap-2.5">
          <EditorialButton
            variant="outline"
            onClick={handleReset}
            className="flex-1"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Réinitialiser
          </EditorialButton>
          <EditorialButton
            variant="primary"
            onClick={handleApply}
            className="flex-2"
          >
            Afficher {resultsCount} résultat{resultsCount > 1 ? 's' : ''}
          </EditorialButton>
        </div>
      </div>
    </EditorialSheet>
  );
};
