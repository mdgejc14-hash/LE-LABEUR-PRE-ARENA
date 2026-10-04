import React, { useState } from 'react';
import { Play, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { EditorialSheet } from './EditorialSheet';

interface ScenarioItem {
  id: number;
  title: string;
  category: 'CANDIDAT' | 'EMPLOYEUR' | 'FINANCE' | 'INCIDENT' | 'REMPLACEMENT' | 'RÈGLES';
  description: string;
}

const ALL_SCENARIOS: ScenarioItem[] = [
  { id: 1, title: 'Candidat postule puis retire sa candidature', category: 'CANDIDAT', description: 'Application créée puis passée au statut WITHDRAWN avec motif.' },
  { id: 2, title: 'Employeur refuse une candidature', category: 'EMPLOYEUR', description: 'Statut REJECTED avec note constructive transmise au candidat.' },
  { id: 3, title: 'Employeur sélectionne (shortlist)', category: 'EMPLOYEUR', description: 'Statut SHORTLISTED et ouverture du canal de discussion.' },
  { id: 4, title: 'Candidat refuse une proposition', category: 'CANDIDAT', description: 'Proposition formelle déclinée dans le fil officiel.' },
  { id: 5, title: 'Candidat demande modification', category: 'CANDIDAT', description: 'Demande d ajustement sur montant, conditions ou horaires.' },
  { id: 6, title: 'Contrat créé au statut SIGNATURE', category: 'RÈGLES', description: 'Contrat généré en attente de signature bilatérale du salarié.' },
  { id: 7, title: 'Candidat signe et active le contrat', category: 'RÈGLES', description: 'Contrat actif et offre passée au statut FILLED.' },
  { id: 8, title: 'Offre FILLED invisible dans la recherche', category: 'EMPLOYEUR', description: 'Retrait automatique du catalogue public tout en conservant l historique.' },
  { id: 9, title: 'M1 Protection contre arrêt direct', category: 'INCIDENT', description: 'Toute demande d arrêt passe par incident LE LABEUR.' },
  { id: 10, title: 'M2 Dissociation bilatérale avec motif', category: 'RÈGLES', description: 'Fin de mission à partir de M2 avec notification et traçabilité.' }
];

export const ScenarioDrawer: React.FC = () => {
  const { scenarioDrawerOpen, setScenarioDrawerOpen, runScenario, runAutomatedTests } = useApp();
  const [runningId, setRunningId] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<{ success: boolean; label: string; explanation: string } | null>(null);
  const [testsResults, setTestsResults] = useState<{ passed: boolean; results: any[] } | null>(null);
  const [runningTests, setRunningTests] = useState(false);

  const handleRun = async (sc: ScenarioItem) => {
    setRunningId(sc.id);
    setLastResult(null);
    try {
      const res = await runScenario(sc.id);
      setLastResult(res);
    } catch (err: any) {
      setLastResult({
        success: false,
        label: `CAS ${sc.id} : Erreur`,
        explanation: err.message || 'Erreur lors de l exécution du scénario.'
      });
    } finally {
      setRunningId(null);
    }
  };

  const handleRunTests = async () => {
    setRunningTests(true);
    setTestsResults(null);
    try {
      const res = await runAutomatedTests();
      setTestsResults(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setRunningTests(false);
    }
  };

  return (
    <EditorialSheet
      isOpen={scenarioDrawerOpen}
      onClose={() => setScenarioDrawerOpen(false)}
      title="Console QA & Validation Déontologique"
      subtitle="Exécution des tests déterministes LE LABEUR"
    >
      <div className="space-y-4 font-operational text-xs">
        {/* Banner with 21 Tests Runner */}
        <div className="p-3.5 bg-[#340C24]/10 border border-[#340C24]/20 rounded-[4px] flex items-center justify-between">
          <div>
            <span className="font-bold text-[#340C24] block text-xs">
              82 Tests Déterministes Métier (suite actuelle)
            </span>
            <span className="text-[11px] text-[#17233B]/70">
              Valide règles 25%/0%, isolation, M1 protection, FILLED, anti-doublon.
            </span>
          </div>
          <button
            onClick={handleRunTests}
            disabled={runningTests}
            className="px-3.5 py-2 bg-[#340C24] text-[#F8BBCB] rounded-[4px] text-xs font-semibold hover:bg-[#340C24]/90 tap-feedback disabled:opacity-50 cursor-pointer"
          >
            {runningTests ? 'Exécution...' : 'Lancer les 82 tests'}
          </button>
        </div>

        {/* 21 Tests Results Panel */}
        {testsResults && (
          <div className="p-3.5 bg-white rounded border border-[#17233B]/10 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs">
                Résultat des tests : {testsResults.passed ? 'TOUS RÉUSSIS' : 'Des tests ont échoué'}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${testsResults.passed ? 'bg-[#1BA64B]/10 text-[#1BA64B]' : 'bg-[#E23D3D]/10 text-[#E23D3D]'}`}>
                {testsResults.passed ? '100% SUCCÈS' : 'ÉCHEC'}
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1.5 divide-y divide-[#17233B]/5 pt-1">
              {testsResults.results.map(r => (
                <div key={r.id} className="pt-1.5 flex items-start justify-between text-[11px] gap-2">
                  <span className="text-[#17233B]">{r.name}</span>
                  <span className={`font-mono font-bold shrink-0 ${r.success ? 'text-[#1BA64B]' : 'text-[#E23D3D]'}`}>
                    {r.success ? 'PASS' : 'FAIL'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Banner with last result */}
        {lastResult && (
          <div className={`p-3 rounded border text-xs ${
            lastResult.success
              ? 'bg-[#1BA64B]/10 border-[#1BA64B]/30 text-[#17233B]'
              : 'bg-[#E23D3D]/10 border-[#E23D3D]/30 text-[#E23D3D]'
          }`}>
            <div className="flex items-center gap-1.5 font-bold mb-1">
              {lastResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-[#1BA64B] shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-[#E23D3D] shrink-0" />
              )}
              <span>{lastResult.label}</span>
            </div>
            <p className="text-[11px] leading-relaxed text-[#17233B]/80">
              {lastResult.explanation}
            </p>
          </div>
        )}

        {/* List of Scenarios */}
        <div className="space-y-2">
          {ALL_SCENARIOS.map(sc => (
            <div
              key={sc.id}
              className="p-3 bg-white rounded border border-[#17233B]/10 hover:border-[#17233B]/30 transition-all flex items-center justify-between gap-3 shadow-xs"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] font-bold text-[#17233B]/50 bg-[#17233B]/5 px-1.5 py-0.5 rounded">
                    CAS {sc.id}
                  </span>
                  <span className="text-[9px] font-mono uppercase text-[#340C24] font-semibold">
                    {sc.category}
                  </span>
                </div>
                <h4 className="font-editorial text-sm font-bold text-[#17233B] mt-0.5 leading-snug">
                  {sc.title}
                </h4>
                <p className="text-[11px] text-[#17233B]/60 leading-normal line-clamp-1">
                  {sc.description}
                </p>
              </div>
              <button
                disabled={runningId === sc.id}
                onClick={() => handleRun(sc)}
                className="px-3 py-1.5 bg-[#17233B] text-[#F3F3EC] rounded text-[11px] font-medium flex items-center gap-1.5 shrink-0 hover:bg-[#17233B]/90 tap-feedback disabled:opacity-40 cursor-pointer"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>{runningId === sc.id ? 'Test...' : 'Exécuter'}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </EditorialSheet>
  );
};
