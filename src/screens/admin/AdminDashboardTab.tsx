import React from 'react';
import {
  Users,
  Briefcase,
  FileCheck2,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Clock,
  LockKeyhole,
  ArrowRight,
  DollarSign,
  TrendingUp,
  FileSpreadsheet,
  AlertCircle
} from 'lucide-react';
import {
  UserProfile,
  Offer,
  Application,
  Contract,
  CommissionPaymentRecord,
  Incident,
  ReplacementDossier,
  SystemAuditLog,
  RevenueMetrics
} from '../../types';

interface AdminDashboardTabProps {
  users: UserProfile[];
  offers: Offer[];
  applications: Application[];
  contracts: Contract[];
  payments: CommissionPaymentRecord[];
  incidents: Incident[];
  replacements: ReplacementDossier[];
  auditLogs: SystemAuditLog[];
  metrics: RevenueMetrics | null;
  onNavigateTab: (tab: any, filterParam?: string) => void;
  onSelectUser?: (user: UserProfile) => void;
}

export const AdminDashboardTab: React.FC<AdminDashboardTabProps> = ({
  users,
  offers,
  applications,
  contracts,
  payments,
  incidents,
  replacements,
  auditLogs,
  metrics,
  onNavigateTab,
  onSelectUser
}) => {
  // Calculations based on real repository data
  const totalUsers = users.length;
  const activeCandidates = users.filter(u => u.role === 'CANDIDATE' && u.accountStatus !== 'BLOCKED').length;
  const activeEmployers = users.filter(u => u.role === 'EMPLOYER' && u.accountStatus !== 'BLOCKED').length;
  const blockedUsers = users.filter(u => u.accountStatus === 'BLOCKED').length;

  const activeOffers = offers.filter(o => o.status === 'ACTIVE').length;
  const filledOffers = offers.filter(o => o.status === 'FILLED').length;

  const pendingApps = applications.filter(a => a.status === 'PENDING').length;
  const shortlistedApps = applications.filter(a => a.status === 'SHORTLISTED').length;
  const hiredApps = applications.filter(a => a.status === 'HIRED').length;

  const inSigningContracts = contracts.filter(c => ['SIGNATURE', 'PENDING_EMPLOYER', 'PENDING_EMPLOYEE'].includes(c.status)).length;
  const activeContracts = contracts.filter(c => c.status === 'ACTIVE').length;
  const terminatedContracts = contracts.filter(c => c.status === 'TERMINATED').length;

  const pendingPayments = payments.filter(p => p.status === 'PENDING_VERIFICATION').length;
  const rejectedPayments = payments.filter(p => p.status === 'REJECTED').length;

  const openIncidents = incidents.filter(i => ['OPEN', 'UNDER_REVIEW'].includes(i.status)).length;
  const ongoingReplacements = replacements.filter(r => r.status !== 'CONTRACT_FINALIZED').length;

  // J+3 check on contracts
  const daysLateFor = (dateValue?: string): number => {
    if (!dateValue) return 0;
    const due = new Date(`${dateValue}T00:00:00.000Z`).getTime();
    if (!Number.isFinite(due)) return 0;
    return Math.max(0, Math.floor((Date.now() - due) / 86400000));
  };

  const hasJ3Due = (contract: Contract): boolean => contract.paymentSchedule.some(entry => {
    const salaryLate = ['DUE', 'REJECTED'].includes(entry.salaryStatus) && daysLateFor(entry.salaryDueDate) >= 3;
    const commissionLate = entry.commissionAmount > 0 && ['DUE', 'REJECTED'].includes(entry.commissionStatus) && daysLateFor(entry.commissionDueDate) >= 3;
    return salaryLate || commissionLate;
  });

  const j3EmployersCount = users.filter(u => u.role === 'EMPLOYER' && contracts.filter(c => c.employerId === u.id).some(hasJ3Due)).length;

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-[#17233B] text-[#F3F3EC] p-6 rounded-[4px] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] uppercase tracking-widest text-[#B5CEDB] font-mono">
            TOUR DE CONTRÔLE NATIONALE · RÉPUBLIQUE DU BÉNIN
          </span>
          <h2 className="font-editorial text-2xl md:text-3xl font-bold mt-1 text-white">
            Vue d'ensemble de la Plateforme
          </h2>
          <p className="text-xs text-[#B5CEDB]/80 mt-1 max-w-xl">
            Surveillance en temps réel des accords de travail, encaissement déontologique des commissions 25%/0% et arbitrage national.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-[10px] text-[#B5CEDB]/60 uppercase">Commissions encaissées</div>
            <div className="text-xl font-bold font-editorial text-[#1BA64B]">
              {(metrics?.totalEncaissed || 0).toLocaleString()} FCFA
            </div>
          </div>
        </div>
      </div>

      {/* 2. Centre "Actions prioritaires à traiter" (Section 6) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#A33A2B]" />
            <h3 className="font-editorial text-lg font-bold text-[#17233B]">
              Centre d'Intervention Rapide
            </h3>
          </div>
          <span className="text-xs text-[#17233B]/50 font-operational">
            Dossiers nécessitant une décision administrative immédiate
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Paiements à vérifier */}
          <div
            onClick={() => onNavigateTab('PAYMENTS', 'PENDING_VERIFICATION')}
            className={`p-4 rounded-[4px] border transition-all cursor-pointer tap-feedback ${
              pendingPayments > 0
                ? 'bg-amber-50/70 border-amber-300 hover:bg-amber-50'
                : 'bg-white border-[#17233B]/10 hover:bg-[#F3F3EC]'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-semibold tracking-wider text-[#17233B]/60">
                  Finances & Commissions
                </span>
                <div className="text-2xl font-bold font-editorial text-[#17233B] mt-1">
                  {pendingPayments}
                </div>
                <p className="text-xs text-[#17233B]/70 mt-1">
                  Paiement{pendingPayments > 1 ? 's' : ''} en attente de vérification
                </p>
              </div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                pendingPayments > 0 ? 'bg-amber-500 text-white' : 'bg-[#17233B]/5 text-[#17233B]/40'
              }`}>
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-[#17233B]/10 flex items-center justify-between text-[11px] font-medium text-[#17233B]/70">
              <span>Examiner les preuves</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Incidents à arbitrer */}
          <div
            onClick={() => onNavigateTab('INCIDENTS', 'OPEN')}
            className={`p-4 rounded-[4px] border transition-all cursor-pointer tap-feedback ${
              openIncidents > 0
                ? 'bg-rose-50/70 border-rose-300 hover:bg-rose-50'
                : 'bg-white border-[#17233B]/10 hover:bg-[#F3F3EC]'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-semibold tracking-wider text-[#A33A2B]">
                  Arbitrage Déontologique
                </span>
                <div className="text-2xl font-bold font-editorial text-[#A33A2B] mt-1">
                  {openIncidents}
                </div>
                <p className="text-xs text-[#17233B]/70 mt-1">
                  Incident{openIncidents > 1 ? 's' : ''} à traiter
                </p>
              </div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                openIncidents > 0 ? 'bg-[#A33A2B] text-white' : 'bg-[#17233B]/5 text-[#17233B]/40'
              }`}>
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-[#17233B]/10 flex items-center justify-between text-[11px] font-medium text-[#A33A2B]">
              <span>Rendre une décision</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Alertes J+3 Retard */}
          <div
            onClick={() => onNavigateTab('USERS', 'J3_LATE')}
            className={`p-4 rounded-[4px] border transition-all cursor-pointer tap-feedback ${
              j3EmployersCount > 0
                ? 'bg-orange-50/70 border-orange-300 hover:bg-orange-50'
                : 'bg-white border-[#17233B]/10 hover:bg-[#F3F3EC]'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-semibold tracking-wider text-orange-700">
                  Recouvrement & Suspension
                </span>
                <div className="text-2xl font-bold font-editorial text-orange-700 mt-1">
                  {j3EmployersCount}
                </div>
                <p className="text-xs text-[#17233B]/70 mt-1">
                  Employeur{j3EmployersCount > 1 ? 's' : ''} arrivés à J+3
                </p>
              </div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                j3EmployersCount > 0 ? 'bg-orange-600 text-white' : 'bg-[#17233B]/5 text-[#17233B]/40'
              }`}>
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-[#17233B]/10 flex items-center justify-between text-[11px] font-medium text-orange-700">
              <span>Vérifier ou bloquer</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Remplacements urgents */}
          <div
            onClick={() => onNavigateTab('REPLACEMENTS')}
            className={`p-4 rounded-[4px] border transition-all cursor-pointer tap-feedback ${
              ongoingReplacements > 0
                ? 'bg-indigo-50/70 border-indigo-300 hover:bg-indigo-50'
                : 'bg-white border-[#17233B]/10 hover:bg-[#F3F3EC]'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-semibold tracking-wider text-indigo-700">
                  Continuité de Service
                </span>
                <div className="text-2xl font-bold font-editorial text-indigo-700 mt-1">
                  {ongoingReplacements}
                </div>
                <p className="text-xs text-[#17233B]/70 mt-1">
                  Remplacement{ongoingReplacements > 1 ? 's' : ''} en cours de sourcing
                </p>
              </div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                ongoingReplacements > 0 ? 'bg-indigo-600 text-white' : 'bg-[#17233B]/5 text-[#17233B]/40'
              }`}>
                <RotateCcw className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-[#17233B]/10 flex items-center justify-between text-[11px] font-medium text-indigo-700">
              <span>Gérer les remplacements</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Contrats en attente de signature */}
          <div
            onClick={() => onNavigateTab('CONTRACTS', 'SIGNATURE')}
            className="p-4 rounded-[4px] border border-[#17233B]/10 bg-white hover:bg-[#F3F3EC] transition-all cursor-pointer tap-feedback"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-semibold tracking-wider text-[#17233B]/60">
                  Formalisation Contractuelle
                </span>
                <div className="text-2xl font-bold font-editorial text-[#17233B] mt-1">
                  {inSigningContracts}
                </div>
                <p className="text-xs text-[#17233B]/70 mt-1">
                  Contrat{inSigningContracts > 1 ? 's' : ''} en attente de signature
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-[#17233B]/5 text-[#17233B] flex items-center justify-center">
                <FileCheck2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-[#17233B]/10 flex items-center justify-between text-[11px] font-medium text-[#17233B]/70">
              <span>Voir les contrats</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Candidatures non traitées */}
          <div
            onClick={() => onNavigateTab('APPLICATIONS', 'PENDING')}
            className="p-4 rounded-[4px] border border-[#17233B]/10 bg-white hover:bg-[#F3F3EC] transition-all cursor-pointer tap-feedback"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-semibold tracking-wider text-[#17233B]/60">
                  Vivier & Réponses
                </span>
                <div className="text-2xl font-bold font-editorial text-[#17233B] mt-1">
                  {pendingApps}
                </div>
                <p className="text-xs text-[#17233B]/70 mt-1">
                  Candidature{pendingApps > 1 ? 's' : ''} en attente de premier examen
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-[#17233B]/5 text-[#17233B] flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-[#17233B]/10 flex items-center justify-between text-[11px] font-medium text-[#17233B]/70">
              <span>Accéder aux candidatures</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Matrice Complète des KPIs Prioritaires (Section 5) */}
      <div className="space-y-3">
        <h3 className="font-editorial text-lg font-bold text-[#17233B]">
          Métriques Globales d'Activité
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <div className="bg-white p-3.5 border border-[#17233B]/10 rounded-[4px]">
            <span className="text-[10px] text-[#17233B]/50 uppercase tracking-wide">Utilisateurs inscrits</span>
            <div className="text-xl font-bold font-editorial text-[#17233B] mt-1">{totalUsers}</div>
            <div className="text-[11px] text-[#17233B]/60 mt-0.5">{activeCandidates} candidats · {activeEmployers} employeurs</div>
          </div>

          <div className="bg-white p-3.5 border border-[#17233B]/10 rounded-[4px]">
            <span className="text-[10px] text-[#17233B]/50 uppercase tracking-wide">Offres actives</span>
            <div className="text-xl font-bold font-editorial text-[#17233B] mt-1">{activeOffers}</div>
            <div className="text-[11px] text-[#17233B]/60 mt-0.5">{filledOffers} offre(s) déjà pourvue(s)</div>
          </div>

          <div className="bg-white p-3.5 border border-[#17233B]/10 rounded-[4px]">
            <span className="text-[10px] text-[#17233B]/50 uppercase tracking-wide">Missions & Contrats Actifs</span>
            <div className="text-xl font-bold font-editorial text-[#1BA64B] mt-1">{activeContracts}</div>
            <div className="text-[11px] text-[#17233B]/60 mt-0.5">{terminatedContracts} contrat(s) terminés</div>
          </div>

          <div className="bg-white p-3.5 border border-[#17233B]/10 rounded-[4px]">
            <span className="text-[10px] text-[#17233B]/50 uppercase tracking-wide">Comptes bloqués</span>
            <div className={`text-xl font-bold font-editorial mt-1 ${blockedUsers > 0 ? 'text-[#A33A2B]' : 'text-[#17233B]'}`}>
              {blockedUsers}
            </div>
            <div className="text-[11px] text-[#17233B]/60 mt-0.5">Pour impayé J+3 ou infraction</div>
          </div>

          <div className="bg-white p-3.5 border border-[#17233B]/10 rounded-[4px]">
            <span className="text-[10px] text-[#17233B]/50 uppercase tracking-wide">Candidatures Shortlistées</span>
            <div className="text-xl font-bold font-editorial text-[#17233B] mt-1">{shortlistedApps}</div>
            <div className="text-[11px] text-[#17233B]/60 mt-0.5">{hiredApps} embauché(s)</div>
          </div>

          <div className="bg-white p-3.5 border border-[#17233B]/10 rounded-[4px]">
            <span className="text-[10px] text-[#17233B]/50 uppercase tracking-wide">Commissions Dues (Recouvrement)</span>
            <div className="text-xl font-bold font-editorial text-[#17233B] mt-1">
              {(metrics?.totalDue || 0).toLocaleString()} FCFA
            </div>
            <div className="text-[11px] text-[#17233B]/60 mt-0.5">25% M1 (0 FCFA de frais salarié)</div>
          </div>

          <div className="bg-white p-3.5 border border-[#17233B]/10 rounded-[4px]">
            <span className="text-[10px] text-[#17233B]/50 uppercase tracking-wide">Paiements Rejetés</span>
            <div className={`text-xl font-bold font-editorial mt-1 ${rejectedPayments > 0 ? 'text-[#A33A2B]' : 'text-[#17233B]'}`}>
              {rejectedPayments}
            </div>
            <div className="text-[11px] text-[#17233B]/60 mt-0.5">En attente de nouvelle preuve</div>
          </div>

          <div className="bg-white p-3.5 border border-[#17233B]/10 rounded-[4px]">
            <span className="text-[10px] text-[#17233B]/50 uppercase tracking-wide">Taux de Remplacement</span>
            <div className="text-xl font-bold font-editorial text-[#17233B] mt-1">100 %</div>
            <div className="text-[11px] text-[#17233B]/60 mt-0.5">Garantie prioritaire assurée</div>
          </div>
        </div>
      </div>

      {/* 4. Flux des Activités Récentes (Section 7) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-editorial text-lg font-bold text-[#17233B]">
            Journal d'Activité Récent
          </h3>
          <button
            onClick={() => onNavigateTab('AUDIT')}
            className="text-xs text-[#17233B]/60 hover:text-[#17233B] font-medium flex items-center gap-1 cursor-pointer"
          >
            <span>Voir tout l'audit ({auditLogs.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="bg-white border border-[#17233B]/10 rounded-[4px] divide-y divide-[#17233B]/5 shadow-xs">
          {auditLogs.slice(0, 8).map(log => (
            <div key={log.id} className="p-3.5 flex items-start justify-between gap-3 text-xs font-operational">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 text-[9px] font-semibold font-mono rounded uppercase bg-[#17233B]/5 text-[#17233B]/80">
                    {log.action}
                  </span>
                  <span className="text-[#17233B]/40 text-[11px]">
                    {log.timestamp}
                  </span>
                </div>
                <p className="text-[#17233B] font-medium pt-0.5">
                  {log.summary}
                </p>
                <p className="text-[11px] text-[#17233B]/50">
                  Acteur : <span className="font-semibold text-[#17233B]/70">{log.actor}</span> ({log.role}) · Entité : {log.entity} {log.entityId ? `(${log.entityId})` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (log.entity === 'PAYMENT') onNavigateTab('PAYMENTS');
                  else if (log.entity === 'INCIDENT') onNavigateTab('INCIDENTS');
                  else if (log.entity === 'CONTRACT') onNavigateTab('CONTRACTS');
                  else if (log.entity === 'OFFER') onNavigateTab('OFFERS');
                  else if (log.entity === 'USER') onNavigateTab('USERS');
                  else onNavigateTab('AUDIT');
                }}
                className="text-[11px] text-[#17233B]/60 hover:text-[#17233B] font-medium shrink-0 pt-1 cursor-pointer tap-feedback"
              >
                Ouvrir dossier →
              </button>
            </div>
          ))}
          {auditLogs.length === 0 && (
            <div className="p-6 text-center text-xs text-[#17233B]/50">
              Aucun événement d'audit enregistré pour le moment.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
