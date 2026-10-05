import React from 'react';
import { Compass, Bookmark, MessageSquare, User, Users, Briefcase, LayoutDashboard, FileCheck2, Wallet } from 'lucide-react';
import { useApp, MainTab } from '../../context/AppContext';

export const AndroidBottomNav: React.FC = () => {
  const { currentRole, activeTab, setActiveTab, conversations, applications, currentUser, paymentDeclarations } = useApp();

  const myConversations = conversations.filter(c => c.participantIds.includes(currentUser?.id || ''));
  const totalUnread = myConversations.reduce((acc, c) => acc + c.unreadCount, 0);
  const pendingAppsCount = applications.filter(a => a.status === 'PENDING').length;

  const candidateTabs: { id: MainTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'DISCOVER', label: 'Découvrir', icon: Compass },
    { id: 'APPLICATIONS', label: 'Candidatures', icon: FileCheck2 },
    { id: 'FAVORITES', label: 'Favoris', icon: Bookmark },
    { id: 'MESSAGES', label: 'Messages', icon: MessageSquare },
    { id: 'PROFILE', label: 'Profil', icon: User }
  ];

  // PHASE 4 : l'onglet « Paiements » est commun à l'employeur (ses
  // déclarations) et à l'administrateur (contrôle administratif).
  const employerTabs: { id: MainTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'DASHBOARD', label: 'Accueil', icon: LayoutDashboard },
    { id: 'OFFERS', label: 'Offres', icon: Briefcase },
    { id: 'APPLICATIONS', label: 'Candidatures', icon: Users },
    { id: 'PAYMENTS', label: 'Paiements', icon: Wallet },
    { id: 'MESSAGES', label: 'Messages', icon: MessageSquare },
    { id: 'PROFILE', label: 'Profil', icon: User }
  ];

  const rejectedPaymentsCount = paymentDeclarations.filter(payment => payment.status === 'REJECTED').length;
  const paymentsToVerifyCount = paymentDeclarations.filter(payment =>
    payment.status === 'SUBMITTED' || payment.status === 'UNDER_REVIEW' || payment.status === 'RESUBMITTED').length;

  const tabs = currentRole === 'EMPLOYER' || currentRole === 'ADMIN' ? employerTabs : candidateTabs;

  return (
    <nav 
      aria-label="Navigation principale"
      className="sticky bottom-0 z-40 w-full bg-[#FFFFFF] border-t border-[#17233B]/10 select-none"
    >
      <div
        className="grid h-16 max-w-md mx-auto px-1"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex flex-col items-center justify-center h-full min-h-[44px] tap-feedback ${
                isActive ? 'text-[#17233B]' : 'text-[#17233B]/40 hover:text-[#17233B]/70'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-105 stroke-[2]' : 'stroke-[1.6]'}`} />
                {tab.id === 'MESSAGES' && totalUnread > 0 && (
                  <span className="absolute -top-1 -right-2 w-3.5 h-3.5 bg-[#340C24] text-[#F8BBCB] text-[9px] font-bold rounded-full flex items-center justify-center">
                    {totalUnread}
                  </span>
                )}
                {tab.id === 'PAYMENTS' && currentRole === 'EMPLOYER' && rejectedPaymentsCount > 0 && (
                  <span className="absolute -top-1 -right-2 w-3.5 h-3.5 bg-[#A33A2B] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {rejectedPaymentsCount}
                  </span>
                )}
                {tab.id === 'PAYMENTS' && currentRole === 'ADMIN' && paymentsToVerifyCount > 0 && (
                  <span className="absolute -top-1 -right-2 w-3.5 h-3.5 bg-[#A33A2B] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {paymentsToVerifyCount}
                  </span>
                )}
                {tab.id === 'APPLICATIONS' && currentRole === 'EMPLOYER' && pendingAppsCount > 0 && (
                  <span className="absolute -top-1 -right-2 w-3.5 h-3.5 bg-[#FFA800] text-[#17233B] text-[9px] font-bold rounded-full flex items-center justify-center">
                    {pendingAppsCount}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-operational tracking-tight mt-1 truncate px-0.5 ${isActive ? 'font-semibold text-[#17233B]' : 'font-normal'}`}>
                {tab.label}
              </span>
              {isActive && (
                <div className="absolute top-0 w-8 h-[2px] bg-[#17233B] rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
