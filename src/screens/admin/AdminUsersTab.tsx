import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Filter,
  LockKeyhole,
  UnlockKeyhole,
  CheckCircle,
  AlertTriangle,
  Clock,
  Eye,
  X,
  FileText,
  Briefcase,
  Phone,
  Mail,
  MapPin,
  Calendar
} from 'lucide-react';
import { UserProfile, Contract, Offer, Application, CommissionPaymentRecord, Incident } from '../../types';
import { EditorialButton } from '../../components/common/EditorialButton';

interface AdminUsersTabProps {
  users: UserProfile[];
  contracts: Contract[];
  offers: Offer[];
  applications: Application[];
  payments: CommissionPaymentRecord[];
  incidents: Incident[];
  onBlockUser: (userId: string, reason: string) => Promise<void>;
  onUnblockUser: (userId: string) => Promise<void>;
  initialFilter?: string;
}

export const AdminUsersTab: React.FC<AdminUsersTabProps> = ({
  users,
  contracts,
  offers,
  applications,
  payments,
  incidents,
  onBlockUser,
  onUnblockUser,
  initialFilter
}) => {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'CANDIDATE' | 'EMPLOYER' | 'ADMIN'>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>(initialFilter || 'ALL');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [isBlocking, setIsBlocking] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // J+3 checker
  const daysLateFor = (dateValue?: string): number => {
    if (!dateValue) return 0;
    const due = new Date(`${dateValue}T00:00:00.000Z`).getTime();
    if (!Number.isFinite(due)) return 0;
    return Math.max(0, Math.floor((Date.now() - due) / 86400000));
  };

  const hasJ3Due = (employerId: string): boolean => {
    return contracts
      .filter(c => c.employerId === employerId)
      .some(contract => contract.paymentSchedule.some(entry => {
        const salaryLate = ['DUE', 'REJECTED'].includes(entry.salaryStatus) && daysLateFor(entry.salaryDueDate) >= 3;
        const commissionLate = entry.commissionAmount > 0 && ['DUE', 'REJECTED'].includes(entry.commissionStatus) && daysLateFor(entry.commissionDueDate) >= 3;
        return salaryLate || commissionLate;
      }));
  };

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // Role filter
      if (roleFilter !== 'ALL' && user.role !== roleFilter) return false;

      // Status filter
      if (statusFilter === 'BLOCKED' && user.accountStatus !== 'BLOCKED') return false;
      if (statusFilter === 'ACTIVE' && user.accountStatus === 'BLOCKED') return false;
      if (statusFilter === 'J3_LATE') {
        if (user.role !== 'EMPLOYER' || !hasJ3Due(user.id)) return false;
      }

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchName = user.fullName.toLowerCase().includes(q) || (user.name && user.name.toLowerCase().includes(q));
        const matchEmail = user.email.toLowerCase().includes(q);
        const matchPhone = user.phone.toLowerCase().includes(q);
        const matchId = user.publicId.toLowerCase().includes(q) || user.id.toLowerCase().includes(q);
        const matchLoc = user.location.toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchPhone && !matchId && !matchLoc) return false;
      }

      return true;
    });
  }, [users, roleFilter, statusFilter, search, contracts]);

  const handleExecuteBlock = async (userId: string) => {
    if (!blockReason.trim()) {
      setActionError('Le motif du blocage est obligatoire (ex. impayé J+3 non régularisé).');
      return;
    }
    setActionLoading(true);
    setActionError('');
    try {
      await onBlockUser(userId, blockReason.trim());
      setActionSuccess('Compte utilisateur bloqué avec succès.');
      setIsBlocking(false);
      setBlockReason('');
      // update selectedUser state
      if (selectedUser?.id === userId) {
        setSelectedUser(prev => prev ? { ...prev, accountStatus: 'BLOCKED', blockReason: blockReason.trim() } : null);
      }
    } catch (e: any) {
      setActionError(e.message || 'Impossible de bloquer le compte.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExecuteUnblock = async (userId: string) => {
    setActionLoading(true);
    setActionError('');
    try {
      await onUnblockUser(userId);
      setActionSuccess('Compte débloqué et réactivé.');
      if (selectedUser?.id === userId) {
        setSelectedUser(prev => prev ? { ...prev, accountStatus: 'ACTIVE', blockReason: undefined } : null);
      }
    } catch (e: any) {
      setActionError(e.message || 'Impossible de débloquer le compte.');
    } finally {
      setActionLoading(false);
    }
  };

  // Related data for selected user
  const userOffers = useMemo(() => {
    if (!selectedUser) return [];
    return offers.filter(o => o.employerId === selectedUser.id);
  }, [selectedUser, offers]);

  const userContracts = useMemo(() => {
    if (!selectedUser) return [];
    return contracts.filter(c => c.employerId === selectedUser.id || c.employeeId === selectedUser.id);
  }, [selectedUser, contracts]);

  const userApps = useMemo(() => {
    if (!selectedUser) return [];
    return applications.filter(a => a.candidateId === selectedUser.id || userOffers.some(o => o.id === a.offerId));
  }, [selectedUser, applications, userOffers]);

  const userIncidents = useMemo(() => {
    if (!selectedUser) return [];
    return incidents.filter(i => i.employerId === selectedUser.id || i.employeeId === selectedUser.id);
  }, [selectedUser, incidents]);

  return (
    <div className="space-y-4">
      {/* 1. Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-editorial text-2xl font-bold text-[#17233B]">
            Répertoire des Utilisateurs
          </h2>
          <p className="text-xs text-[#17233B]/60">
            {filteredUsers.length} utilisateur{filteredUsers.length > 1 ? 's' : ''} correspondant{filteredUsers.length > 1 ? 's' : ''}
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Role filter */}
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value as any)}
            className="h-9 px-2.5 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B]"
          >
            <option value="ALL">Tous les rôles</option>
            <option value="CANDIDATE">Candidats</option>
            <option value="EMPLOYER">Employeurs</option>
            <option value="ADMIN">Administrateurs</option>
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="h-9 px-2.5 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B]"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="ACTIVE">Actifs</option>
            <option value="BLOCKED">Bloqués</option>
            <option value="J3_LATE">Arrivés à J+3</option>
          </select>
        </div>
      </div>

      {/* 2. Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-3 text-[#17233B]/40" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par nom, email, téléphone, identifiant public (LAB-C, LAB-R) ou ville..."
          className="w-full h-10 pl-9 pr-3 bg-white border border-[#17233B]/15 rounded-[4px] text-xs text-[#17233B] placeholder-[#17233B]/40 focus:outline-none focus:border-[#17233B]"
        />
      </div>

      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>{actionError}</span>
        </div>
      )}

      {/* 3. Users Table */}
      <div className="bg-white border border-[#17233B]/10 rounded-[4px] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-operational">
            <thead className="bg-[#17233B]/5 text-[#17233B]/70 uppercase tracking-wider text-[10px] border-b border-[#17233B]/10">
              <tr>
                <th className="p-3">Utilisateur</th>
                <th className="p-3">Identifiant</th>
                <th className="p-3">Rôle</th>
                <th className="p-3">Localisation</th>
                <th className="p-3">Statut</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#17233B]/5">
              {filteredUsers.map(user => {
                const isBlocked = user.accountStatus === 'BLOCKED';
                const isJ3 = user.role === 'EMPLOYER' && hasJ3Due(user.id);
                return (
                  <tr key={user.id} className="hover:bg-[#F3F3EC]/50 transition-colors">
                    <td className="p-3 font-medium text-[#17233B]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#17233B]/5 border border-[#17233B]/10 flex items-center justify-center font-bold text-[#17233B]/60 text-xs">
                          {user.fullName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold">{user.fullName}</div>
                          <div className="text-[11px] text-[#17233B]/50">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-[#17233B]/70">
                      {user.publicId}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        user.role === 'ADMIN'
                          ? 'bg-[#17233B] text-white'
                          : user.role === 'EMPLOYER'
                          ? 'bg-[#B5CEDB]/30 text-[#17233B]'
                          : 'bg-[#1BA64B]/15 text-[#1BA64B]'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="p-3 text-[11px] text-[#17233B]/70 max-w-[180px] truncate">
                      {user.location}
                    </td>
                    <td className="p-3">
                      {isBlocked ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-medium">
                          <LockKeyhole className="w-3 h-3" /> Bloqué
                        </span>
                      ) : isJ3 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-medium">
                          <AlertTriangle className="w-3 h-3" /> J+3 Retard
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-medium">
                          <CheckCircle className="w-3 h-3" /> Actif
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedUser(user)}
                        className="px-2.5 py-1 text-xs border border-[#17233B]/15 rounded bg-white hover:bg-[#F3F3EC] text-[#17233B] font-medium cursor-pointer tap-feedback inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Fiche</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-xs text-[#17233B]/50">
                    Aucun utilisateur ne correspond aux critères de recherche.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Fiche Utilisateur Modal / Drawer (Section 9 & 10) */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-[#17233B]/60 backdrop-blur-xs flex justify-end animate-fadeIn">
          <div className="w-full max-w-xl bg-white h-full overflow-y-auto p-6 space-y-6 shadow-2xl flex flex-col justify-between">
            <div>
              {/* Drawer Header */}
              <div className="flex items-start justify-between pb-4 border-b border-[#17233B]/10">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#17233B]/5 border border-[#17233B]/15 flex items-center justify-center font-bold text-lg text-[#17233B]">
                    {selectedUser.fullName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-editorial text-xl font-bold text-[#17233B]">
                      {selectedUser.fullName}
                    </h3>
                    <p className="text-xs text-[#17233B]/60 font-mono">
                      {selectedUser.publicId} · Rôle : {selectedUser.role}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedUser(null); setIsBlocking(false); setBlockReason(''); }}
                  className="w-8 h-8 rounded-full border border-[#17233B]/15 flex items-center justify-center text-[#17233B]/60 hover:text-[#17233B] cursor-pointer"
                  aria-label="Fermer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Status Alert */}
              {selectedUser.accountStatus === 'BLOCKED' ? (
                <div className="my-4 p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 flex items-start gap-2">
                  <LockKeyhole className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">Compte actuellement bloqué</div>
                    <div className="text-[11px] mt-0.5">Motif : {selectedUser.blockReason || 'Non précisé'}</div>
                  </div>
                </div>
              ) : selectedUser.role === 'EMPLOYER' && hasJ3Due(selectedUser.id) ? (
                <div className="my-4 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">Alerte J+3 Retard Constaté</div>
                    <div className="text-[11px] mt-0.5">Ce compte a au moins une échéance impayée depuis plus de 3 jours. Blocage administratif autorisé.</div>
                  </div>
                </div>
              ) : null}

              {/* Coordonnées & Profil */}
              <div className="py-4 space-y-3 border-b border-[#17233B]/10 text-xs">
                <h4 className="font-semibold text-[#17233B] uppercase tracking-wider text-[11px]">
                  Coordonnées vérifiées
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-[#17233B]/80">
                    <Mail className="w-3.5 h-3.5 text-[#17233B]/40 shrink-0" />
                    <span className="truncate">{selectedUser.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#17233B]/80">
                    <Phone className="w-3.5 h-3.5 text-[#17233B]/40 shrink-0" />
                    <span>{selectedUser.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[#17233B]/80 col-span-2">
                    <MapPin className="w-3.5 h-3.5 text-[#17233B]/40 shrink-0" />
                    <span>{selectedUser.location}</span>
                  </div>
                </div>
                {selectedUser.bio && (
                  <p className="text-[11px] text-[#17233B]/70 bg-[#F3F3EC] p-2.5 rounded italic">
                    « {selectedUser.bio} »
                  </p>
                )}
              </div>

              {/* Statistiques Métier Associées */}
              <div className="py-4 space-y-3 border-b border-[#17233B]/10">
                <h4 className="font-semibold text-[#17233B] uppercase tracking-wider text-[11px]">
                  Activité dans LE LABEUR
                </h4>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2.5 bg-[#F3F3EC] rounded">
                    <div className="text-base font-bold font-editorial text-[#17233B]">{userContracts.length}</div>
                    <div className="text-[10px] text-[#17233B]/60 uppercase">Contrats</div>
                  </div>
                  <div className="p-2.5 bg-[#F3F3EC] rounded">
                    <div className="text-base font-bold font-editorial text-[#17233B]">
                      {selectedUser.role === 'EMPLOYER' ? userOffers.length : userApps.length}
                    </div>
                    <div className="text-[10px] text-[#17233B]/60 uppercase">
                      {selectedUser.role === 'EMPLOYER' ? 'Offres' : 'Candidatures'}
                    </div>
                  </div>
                  <div className="p-2.5 bg-[#F3F3EC] rounded">
                    <div className="text-base font-bold font-editorial text-[#17233B]">{userIncidents.length}</div>
                    <div className="text-[10px] text-[#17233B]/60 uppercase">Incidents</div>
                  </div>
                </div>
              </div>

              {/* Contrats de cet utilisateur */}
              <div className="py-4 space-y-2">
                <h4 className="font-semibold text-[#17233B] uppercase tracking-wider text-[11px]">
                  Dossiers Contractuels ({userContracts.length})
                </h4>
                {userContracts.map(c => (
                  <div key={c.id} className="p-2.5 bg-[#F3F3EC]/70 rounded border border-[#17233B]/5 text-xs flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-[#17233B]">{c.offerTitle}</div>
                      <div className="text-[10px] text-[#17233B]/50 font-mono">{c.id} · Statut : {c.status}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-[#17233B]">{c.monthlySalary.toLocaleString()} FCFA</div>
                      <div className="text-[10px] text-[#1BA64B]">Com. 25% : {(c.firstMonthCommission ?? c.commissionAmountDue ?? Math.round(c.monthlySalary * 0.25)).toLocaleString()} FCFA</div>
                    </div>
                  </div>
                ))}
                {userContracts.length === 0 && (
                  <p className="text-xs text-[#17233B]/40 italic">Aucun contrat enregistré.</p>
                )}
              </div>
            </div>

            {/* Bottom Actions (Bloquer / Débloquer) */}
            <div className="pt-4 border-t border-[#17233B]/10 space-y-3">
              {isBlocking ? (
                <div className="space-y-2 bg-rose-50 p-3 rounded border border-rose-200">
                  <label className="block text-xs font-semibold text-rose-900">
                    Motif obligatoire du blocage administratif
                  </label>
                  <input
                    type="text"
                    value={blockReason}
                    onChange={e => setBlockReason(e.target.value)}
                    placeholder="Ex: Échéance impayée à J+3 non régularisée"
                    className="w-full h-9 px-2.5 bg-white border border-rose-300 rounded text-xs text-[#17233B]"
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      disabled={actionLoading || !blockReason.trim()}
                      onClick={() => handleExecuteBlock(selectedUser.id)}
                      className="px-3 py-1.5 bg-[#A33A2B] text-white rounded text-xs font-medium cursor-pointer tap-feedback disabled:opacity-50"
                    >
                      {actionLoading ? 'Blocage en cours...' : 'Confirmer le blocage'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsBlocking(false); setBlockReason(''); }}
                      className="px-3 py-1.5 border border-[#17233B]/20 text-[#17233B] rounded text-xs font-medium cursor-pointer"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : selectedUser.accountStatus === 'BLOCKED' ? (
                <EditorialButton
                  variant="primary"
                  fullWidth
                  disabled={actionLoading}
                  onClick={() => handleExecuteUnblock(selectedUser.id)}
                >
                  <UnlockKeyhole className="w-4 h-4 mr-2" />
                  <span>{actionLoading ? 'Déblocage en cours...' : 'Débloquer et réactiver ce compte'}</span>
                </EditorialButton>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsBlocking(true)}
                    className="flex-1 h-10 border border-[#A33A2B]/30 hover:bg-[#A33A2B]/10 text-[#A33A2B] rounded text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer tap-feedback"
                  >
                    <LockKeyhole className="w-3.5 h-3.5" />
                    <span>Bloquer ce compte</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
