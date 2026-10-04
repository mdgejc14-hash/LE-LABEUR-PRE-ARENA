/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AndroidDeviceFrame } from './components/common/AndroidDeviceFrame';
import { AndroidTopBar } from './components/navigation/AndroidTopBar';
import { AndroidBottomNav } from './components/navigation/AndroidBottomNav';

// Écrans de démarrage & Onboarding officiel
import { SplashScreen } from './screens/SplashScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { RoleSelectionScreen } from './screens/RoleSelectionScreen';
import { AuthScreen } from './screens/AuthScreen';

// Écrans principaux Candidat & Employeur
import { DiscoverScreen } from './screens/DiscoverScreen';
import { OfferDetailScreen } from './screens/OfferDetailScreen';
import { CandidateApplicationsScreen } from './screens/CandidateApplicationsScreen';
import { EmployerDashboardScreen } from './screens/EmployerDashboardScreen';
import { AdminDashboardScreen } from './screens/AdminDashboardScreen';
import { EmployerOffersScreen } from './screens/EmployerOffersScreen';
import { EmployerApplicationsScreen } from './screens/EmployerApplicationsScreen';
import { TalentsScreen } from './screens/TalentsScreen';
import { TalentDetailScreen } from './screens/TalentDetailScreen';
import { MessagesScreen } from './screens/MessagesScreen';
import { ChatDetailScreen } from './screens/ChatDetailScreen';
import { FavoritesScreen } from './screens/FavoritesScreen';
import { ProfileScreen } from './screens/ProfileScreen';

// Écran Mes Contrats (RÈGLE 3 & 4 : ROUTE CONTRACTS AJOUTÉE)
import { ContractsScreen } from './screens/ContractsScreen';

// Overlays & Composants d'appel et de ressources
import { AudioCallScreen } from './components/calls/AudioCallScreen';
import { IncomingCallBanner } from './components/calls/IncomingCallBanner';
import { MicrophonePermissionModal } from './components/permissions/MicrophonePermissionModal';
import { ResourceCatalogSheet } from './components/resources/ResourceCatalogSheet';
import { ScenarioDrawer } from './components/common/ScenarioDrawer';
import { IS_DEMO_MODE } from './utils/config';

const AppContent: React.FC = () => {
  const {
    screen,
    currentRole,
    activeTab,
    navigateBack
  } = useApp();

  // Rendu de l'onglet actif dans l'écran principal
  const renderMainTabContent = () => {
    // Profil (commun aux deux rôles avec adaptation)
    if (activeTab === 'PROFILE') {
      return <ProfileScreen />;
    }

    // Messages (commun aux deux rôles)
    if (activeTab === 'MESSAGES') {
      return <MessagesScreen />;
    }

    // Rôle Employeur
    if (currentRole === 'EMPLOYER') {
      switch (activeTab) {
        case 'DASHBOARD':
          return <EmployerDashboardScreen />;
        case 'OFFERS':
          return <EmployerOffersScreen />;
        case 'APPLICATIONS':
          return <EmployerApplicationsScreen />;
        default:
          return <EmployerDashboardScreen />;
      }
    }

    // Rôle Admin (accès aux vues de supervision)
    if (currentRole === 'ADMIN') {
      switch (activeTab) {
        case 'DASHBOARD':
          return <AdminDashboardScreen />;
        case 'OFFERS':
          return <EmployerOffersScreen />;
        case 'APPLICATIONS':
          return <EmployerApplicationsScreen />;
        default:
          return <TalentsScreen />;
      }
    }

    // Rôle Candidat / Artisan par défaut
    switch (activeTab) {
      case 'DISCOVER':
        return <DiscoverScreen />;
      case 'APPLICATIONS':
        return <CandidateApplicationsScreen />;
      case 'FAVORITES':
        return <FavoritesScreen />;
      default:
        return <DiscoverScreen />;
    }
  };

  // 1. Parcours de Lancement : SPLASH officiel
  if (screen === 'SPLASH') {
    return (
      <AndroidDeviceFrame>
        <SplashScreen />
      </AndroidDeviceFrame>
    );
  }

  // 2. Onboarding : 3 étapes avant le choix du profil
  if (screen === 'ONBOARDING') {
    return (
      <AndroidDeviceFrame>
        <OnboardingScreen />
      </AndroidDeviceFrame>
    );
  }

  // 3. Choix du profil : Candidat / Employeur (Avant authentification uniquement)
  if (screen === 'ROLE_SELECT' || screen === 'ROLE_SELECTION') {
    return (
      <AndroidDeviceFrame>
        <RoleSelectionScreen />
      </AndroidDeviceFrame>
    );
  }

  // 4. Authentification / Connexion
  if (screen === 'AUTH') {
    return (
      <AndroidDeviceFrame>
        <AuthScreen />
      </AndroidDeviceFrame>
    );
  }

  // 5. RÈGLE 3 : Route CONTRACTS (Mes Contrats)
  if (screen === 'CONTRACTS') {
    return (
      <AndroidDeviceFrame>
        <AndroidTopBar
          showBack
          onBack={navigateBack}
          title="Mes Contrats"
        />
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
          <ContractsScreen />
        </div>
        <AndroidBottomNav />
        <IncomingCallBanner />
        <AudioCallScreen />
        <MicrophonePermissionModal />
        <ResourceCatalogSheet />
      </AndroidDeviceFrame>
    );
  }

  // 6. Détail d'une offre
  if (screen === 'OFFER_DETAIL') {
    return (
      <AndroidDeviceFrame>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
          <OfferDetailScreen />
        </div>
      </AndroidDeviceFrame>
    );
  }

  // 7. Détail d'un candidat / artisan
  if (screen === 'CANDIDATE_DETAIL') {
    return (
      <AndroidDeviceFrame>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
          <TalentDetailScreen />
        </div>
      </AndroidDeviceFrame>
    );
  }

  // 8. Conversation directe / Chat
  if (screen === 'CHAT_DETAIL') {
    return (
      <AndroidDeviceFrame>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
          <ChatDetailScreen />
        </div>
      </AndroidDeviceFrame>
    );
  }

  // 9. Écran Principal (MAIN) avec TopBar, Contenu Tab et BottomNav
  return (
    <AndroidDeviceFrame>
      <AndroidTopBar />
      <main className="flex-1 min-h-0 flex flex-col overflow-y-auto no-scrollbar relative bg-[#F3F3EC]">
        {renderMainTabContent()}
      </main>
      <AndroidBottomNav />

      {/* Overlays globaux : Audio Call, Notifications, Modales, QA Drawer */}
      <IncomingCallBanner />
      <AudioCallScreen />
      <MicrophonePermissionModal />
      <ResourceCatalogSheet />
      {IS_DEMO_MODE && currentRole === 'ADMIN' && <ScenarioDrawer />}
    </AndroidDeviceFrame>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
