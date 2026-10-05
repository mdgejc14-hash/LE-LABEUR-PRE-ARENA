import {
  UserProfile,
  Offer,
  Application,
  Contract,
  Incident,
  Conversation,
  ChatMessage,
  MissionProposal,
  ReplacementDossier,
  CommissionPaymentRecord,
  PaymentDeclaration,
  AppNotification,
  SystemAuditLog,
  CallRecord,
  CommunicationEvent,
  ResourceDocument,
} from '../types';
import { getAvatar } from '../utils/assets';
import { loadDiscoveredResources } from '../resources/pdfLoader';

export const INITIAL_USERS: UserProfile[] = [
  // 1. Amina Dossou (Candidat - Menuiserie fine & Ébénisterie - Cotonou)
  {
    id: 'user-cand-1',
    publicId: 'LAB-C-000001',
    role: 'CANDIDATE',
    fullName: 'Amina Dossou',
    name: 'Amina Dossou',
    verified: true,
    email: 'amina.dossou@lelabeur.bj',
    phone: '+229 97 41 28 81',
    headline: "Menuisière d'Art & Agencement Contemporain",
    location: 'Cotonou — Cadjèhoun Kpota (Littoral)',
    departmentId: 'dept-littoral',
    communeId: 'com-cotonou',
    arrondissementId: 'arr-cotonou-12',
    localityId: 'loc-cadjehoun-kpota',
    detailedAddress: 'Rue des Palmiers, Carré 412, Cadjèhoun Kpota',
    avatarUrl: getAvatar('user-cand-1'),
    bio: "Diplômée du Centre de Perfectionnement Artisanal de Cotonou. 7 ans d'expérience en ébénisterie de bois noble (iroko, teck du Bénin), agencement sur mesure et lecture rigoureuse de plans architecturaux.",
    skills: ['Menuiserie fine', 'Lecture de plan', 'Ébénisterie', 'Agencement sur mesure', 'Finition huile bio'],
    experienceYears: 7,
    desiredContract: 'CDI ou Mission longue',
    desiredSalary: '180 000 FCFA / mois',
    availability: 'Immédiate',
    portfolio: [
      { title: 'Bibliothèque en teck massif', subtitle: 'Résidence privée Cadjèhoun', year: '2025' },
      { title: 'Claustra et portes sculptées', subtitle: 'Hôtel Haie Vive', year: '2024' }
    ],
    matchCompatibility: 96
  },
  // 2. Rodrigue Akpakoun (Candidat - Électricien Bâtiment - Abomey-Calavi)
  {
    id: 'user-cand-2',
    publicId: 'LAB-C-000002',
    role: 'CANDIDATE',
    fullName: 'Rodrigue Akpakoun',
    name: 'Rodrigue Akpakoun',
    verified: true,
    email: 'rodrigue.akpakoun@lelabeur.bj',
    phone: '+229 95 89 44 12',
    headline: 'Électricien Bâtiment & Systèmes Solaires Ondulés',
    location: 'Abomey-Calavi — Godomey (Atlantique)',
    departmentId: 'dept-atlantique',
    communeId: 'com-abomey-calavi',
    arrondissementId: 'arr-godomey',
    localityId: 'loc-godomey-togoudo',
    detailedAddress: 'Carrefour Togoudo, Immeuble Donatien',
    avatarUrl: getAvatar('user-cand-2'),
    bio: 'Technicien électricien certifié basse tension et énergie solaire photovoltaïque. Habilitation BR valide, 6 ans de chantiers résidentiels, tertiaires et cliniques médicales entre Cotonou et Calavi.',
    skills: ['Câblage armoire TGBT', 'Habilitation BR', 'Schéma unifilaire', 'Installation solaire', 'Diagnostic panne'],
    experienceYears: 6,
    desiredContract: "Mission d'urgence ou CDD",
    desiredSalary: '140 000 FCFA / mois',
    availability: 'Immédiate',
    portfolio: [
      { title: 'Tableau divisionnaire villa R+2', subtitle: 'Godomey Salento', year: '2025' }
    ],
    matchCompatibility: 92
  },
  // 3. Yasmine Hounkpatin (Candidat - Ménagère & Intendance - Cotonou Fidjrossè)
  {
    id: 'user-cand-3',
    publicId: 'LAB-C-000003',
    role: 'CANDIDATE',
    fullName: 'Yasmine Hounkpatin',
    name: 'Yasmine Hounkpatin',
    verified: true,
    email: 'yasmine.hounkpatin@lelabeur.bj',
    phone: '+229 66 12 34 56',
    headline: 'Gouvernante de Maison & Intendance de Standing',
    location: 'Cotonou — Fidjrossè Kpota (Littoral)',
    departmentId: 'dept-littoral',
    communeId: 'com-cotonou',
    arrondissementId: 'arr-cotonou-12',
    localityId: 'loc-fidjrosse-kpota',
    detailedAddress: 'Près de la pharmacie Fidjrossè Plage',
    avatarUrl: getAvatar('user-cand-3'),
    bio: "Excellente pratique de l'entretien de résidences privées de prestige et intendance hôtelière. Rigueur dans l'hygiène, discrétion absolue et accueil courtois.",
    skills: ['Intendance privée', 'Lessive soignée & Repassage', 'Hygiène HACCP', 'Gestion des stocks'],
    experienceYears: 6,
    desiredContract: 'CDI ou Contrat mensuel',
    desiredSalary: '80 000 FCFA / mois',
    availability: 'Immédiate',
    portfolio: [],
    matchCompatibility: 94
  },
  // 4. Marcellin Houngbédji (Candidat - Chef Cuisinier)
  {
    id: 'user-cand-4',
    publicId: 'LAB-C-000004',
    role: 'CANDIDATE',
    fullName: 'Marcellin Houngbédji',
    name: 'Marcellin Houngbédji',
    verified: true,
    email: 'marcellin.h@lelabeur.bj',
    phone: '+229 97 55 01 24',
    headline: 'Chef Cuisinier Privé & Maître Rôtisseur',
    location: 'Cotonou — Haie Vive (Littoral)',
    avatarUrl: getAvatar('user-cand-4'),
    bio: 'Cuisine africaine raffinée, grillades braisées au feu de bois et gastronomie internationale. 9 ans de service.',
    skills: ['Cuisine bistronomique', 'HACCP', 'Grillades braisées', 'Fiches techniques'],
    experienceYears: 9,
    desiredContract: 'Contrat mensuel',
    desiredSalary: '110 000 FCFA / mois',
    availability: 'Immédiate',
    portfolio: [],
    matchCompatibility: 89
  },
  // 5. Christian Zannou (Candidat - Ferronnier Métallier)
  {
    id: 'user-cand-5',
    publicId: 'LAB-C-000005',
    role: 'CANDIDATE',
    fullName: 'Christian Zannou',
    name: 'Christian Zannou',
    verified: true,
    email: 'christian.zannou@lelabeur.bj',
    phone: '+229 95 44 33 22',
    headline: "Ferronnier Métallier d'Art & Portails de Sécurité",
    location: 'Porto-Novo — Ouando (Ouémé)',
    avatarUrl: getAvatar('user-cand-5'),
    bio: "Artisan métallier formé aux ateliers de l'Ouémé. Confection soignée de verrières contemporaines en acier et portails.",
    skills: ['Soudure TIG/MIG', 'Découpe acier', 'Lecture de plan', 'Forge manuelle'],
    experienceYears: 8,
    desiredContract: 'Mission 4 à 6 mois',
    desiredSalary: '120 000 FCFA / mois',
    availability: 'Immédiate',
    portfolio: [],
    matchCompatibility: 94
  },
  // 6. Karim Bio Guéra (Candidat - Chauffeur VIP)
  {
    id: 'user-cand-6',
    publicId: 'LAB-C-000006',
    role: 'CANDIDATE',
    fullName: 'Karim Bio Guéra',
    name: 'Karim Bio Guéra',
    verified: true,
    email: 'karim.bioguera@lelabeur.bj',
    phone: '+229 97 89 01 23',
    headline: 'Chauffeur de Direction & Protocole VIP',
    location: 'Parakou — Titirou (Borgou)',
    avatarUrl: getAvatar('user-cand-6'),
    bio: '10 ans de conduite de directeurs généraux et délégations. Permis B/C, conduite défensive.',
    skills: ['Conduite défensive', 'Ponctualité stricte', 'Protocole officiel'],
    experienceYears: 10,
    desiredContract: 'CDI ou Contrat mensuel',
    desiredSalary: '95 000 FCFA / mois',
    availability: 'Immédiate',
    portfolio: [],
    matchCompatibility: 88
  },
  // 7. Béatrice Agbessi
  {
    id: 'user-cand-7',
    publicId: 'LAB-C-000007',
    role: 'CANDIDATE',
    fullName: 'Béatrice Agbessi',
    name: 'Béatrice Agbessi',
    verified: true,
    email: 'beatrice.agbessi@lelabeur.bj',
    phone: '+229 67 33 22 11',
    headline: 'Ménagère Soignée & Entretien Quotidien de Villa',
    location: 'Abomey-Calavi — Tankpé (Atlantique)',
    avatarUrl: getAvatar('user-cand-7'),
    bio: "Spécialiste de la propreté du domicile familial, nettoyage minutieux des sols en marbre et carreaux.",
    skills: ['Nettoyage des sols', 'Lessive & Repassage', 'Rangement des pièces'],
    experienceYears: 4,
    desiredContract: 'Temps plein mensuel',
    desiredSalary: '50 000 FCFA / mois',
    availability: 'Immédiate',
    portfolio: [],
    matchCompatibility: 91
  },
  // 8. Modeste Kpadonou
  {
    id: 'user-cand-8',
    publicId: 'LAB-C-000008',
    role: 'CANDIDATE',
    fullName: 'Modeste Kpadonou',
    name: 'Modeste Kpadonou',
    verified: true,
    email: 'modeste.kpadonou@lelabeur.bj',
    phone: '+229 96 11 22 33',
    headline: 'Maçon Coffreur & Chef d équipe Gros Œuvre',
    location: 'Bohicon — Gare Marchande (Zou)',
    avatarUrl: getAvatar('user-cand-8'),
    bio: '8 ans d expérience sur des chantiers d immeubles R+2 à R+4 au Bénin.',
    skills: ['Gros œuvre', 'Coulage béton', 'Coffrage bois', 'Pose d agglos'],
    experienceYears: 8,
    desiredContract: 'Mission de chantier',
    desiredSalary: '100 000 FCFA / mois',
    availability: 'Immédiate',
    portfolio: [],
    matchCompatibility: 90
  },

  // EMPLOYEURS BÉNINOIS
  // 1. Reine Houénou (Directrice Générale — Atelier Bois & Agencement Bénin)
  {
    id: 'user-emp-1',
    publicId: 'LAB-R-000001',
    role: 'EMPLOYER',
    fullName: 'Reine Houénou',
    name: 'Reine Houénou',
    verified: true,
    email: 'reine.houenou@bois-agencement.bj',
    phone: '+229 97 60 70 80',
    headline: 'Directrice Générale — Atelier Bois & Agencement Bénin',
    companyName: 'Atelier Bois & Agencement Bénin',
    managerName: 'Reine Houénou',
    location: 'Cotonou — Cadjèhoun Kpota (Littoral)',
    departmentId: 'dept-littoral',
    communeId: 'com-cotonou',
    arrondissementId: 'arr-cotonou-12',
    localityId: 'loc-cadjehoun-kpota',
    detailedAddress: 'Carré 450, Cadjèhoun Kpota',
    avatarUrl: getAvatar('user-emp-1'),
    bio: "Entreprise d'agencement intérieur de standing, ébénisterie contemporaine et mobilier en bois noble intervenant sur les résidences et bureaux au Bénin.",
    skills: ['Agencement de luxe', "Coordination d'artisans", 'Suivi de chantier'],
    experienceYears: 14,
    desiredContract: 'Recruteur',
    desiredSalary: 'N/A',
    availability: 'Recrutement continu',
    portfolio: []
  },
  // 2. Jean-Baptiste Soglo
  {
    id: 'user-emp-2',
    publicId: 'LAB-R-000002',
    role: 'EMPLOYER',
    fullName: 'Jean-Baptiste Soglo',
    name: 'Jean-Baptiste Soglo',
    verified: true,
    email: 'jb.soglo@batisseurs-golfe.bj',
    phone: '+229 95 12 34 56',
    headline: 'Directeur de Travaux — Les Bâtisseurs du Golfe Bénin',
    companyName: 'Les Bâtisseurs du Golfe Bénin',
    location: 'Abomey-Calavi — Arconville (Atlantique)',
    avatarUrl: getAvatar('user-emp-2'),
    bio: "Société générale de construction et génie civil réalisant des résidences modernes et cliniques.",
    skills: ['Génie civil', 'Électricité tertiaire', 'Chantiers prioritaires'],
    experienceYears: 16,
    desiredContract: 'Recruteur',
    desiredSalary: 'N/A',
    availability: 'En recherche active',
    portfolio: []
  },
  // 3. Dr. Félicité Agossa
  {
    id: 'user-emp-3',
    publicId: 'LAB-R-000003',
    role: 'EMPLOYER',
    fullName: 'Dr. Félicité Agossa',
    name: 'Dr. Félicité Agossa',
    verified: true,
    email: 'dr.agossa@residence-fidjrosse.bj',
    phone: '+229 97 22 33 44',
    headline: 'Administratrice de Biens — Domaine Familial Fidjrossè Plage',
    companyName: 'Domaine Familial Fidjrossè Plage',
    location: 'Cotonou — Fidjrossè Plage (Littoral)',
    avatarUrl: getAvatar('user-emp-3'),
    bio: 'Gestion et intendance d une grande propriété familiale privée et d un cabinet médical.',
    skills: ['Intendance privée', 'Personnel de maison qualifié', 'Discrétion'],
    experienceYears: 11,
    desiredContract: 'Recruteur',
    desiredSalary: 'N/A',
    availability: 'En recrutement',
    portfolio: []
  },
  // 4. Oumar Bio Sanni
  {
    id: 'user-emp-4',
    publicId: 'LAB-R-000004',
    role: 'EMPLOYER',
    fullName: 'Oumar Bio Sanni',
    name: 'Oumar Bio Sanni',
    verified: true,
    email: 'oumar.biosanni@forge-oueme.bj',
    phone: '+229 95 98 76 54',
    headline: "Maître Artisan Métallier — Ateliers Métal de l'Ouémé",
    companyName: "Ateliers Métal de l'Ouémé",
    location: 'Porto-Novo — Ouando (Ouémé)',
    avatarUrl: getAvatar('user-emp-4'),
    bio: "Atelier réputé de métallerie d art, portails automatisés et menuiserie acier de haute sécurité.",
    skills: ['Ferronnerie', "Serrurerie d'art", 'Menuiserie acier'],
    experienceYears: 18,
    desiredContract: 'Recruteur',
    desiredSalary: 'N/A',
    availability: 'En recrutement',
    portfolio: []
  },
  // ADMIN
  {
    id: 'user-admin-1',
    publicId: 'LAB-A-000001',
    role: 'ADMIN',
    fullName: 'Cellule Centrale de Contrôle LE LABEUR Bénin',
    name: 'Cellule Centrale LE LABEUR',
    verified: true,
    email: 'admin.benin@lelabeur.bj',
    phone: '+229 21 30 40 50',
    headline: 'Supervision des Accords & Arbitrage Déontologique Bénin',
    location: 'Cotonou — Haie Vive (Bénin)',
    avatarUrl: getAvatar('user-admin-1'),
    bio: "Cellule juridique et financière LE LABEUR République du Bénin : arbitrage des incidents, audits des commissions 25%/0%, déploiement des missions d'urgence nationales.",
    skills: ['Arbitrage de contrat', 'Audit des commissions', 'Médiation'],
    experienceYears: 12,
    desiredContract: 'Admin',
    desiredSalary: 'N/A',
    availability: 'Permanente',
    portfolio: []
  }
];

export const INITIAL_OFFERS: Offer[] = [
  {
    id: 'OFFER-001',
    title: "Menuisier d'Art & Poseur de Meubles d'Édition",
    employerId: 'user-emp-1',
    employerName: 'Atelier Bois & Agencement Bénin',
    employerLocation: 'Cotonou — Cadjèhoun Kpota (Littoral)',
    contractType: 'Mission 6 mois renouvelable',
    remuneration: 180000,
    currency: 'FCFA',
    location: 'Cotonou — Cadjèhoun Kpota (Littoral)',
    departmentId: 'dept-littoral',
    municipalityId: 'com-cotonou',
    arrondissementId: 'arr-cotonou-12',
    localityId: 'loc-cadjehoun-kpota',
    locationLabel: 'Cotonou — Cadjèhoun Kpota (Littoral)',
    domainId: 'dom-artisanat',
    jobId: 'job-menuisier-bois',
    postedDate: '02 Octobre 2026',
    isUrgent: false,
    isLeLabeurJob: false,
    skills: ['Menuiserie fine', 'Lecture de plan', 'Finition huile bio', 'Pose meuble'],
    summary: "Nous recherchons un artisan menuisier consciencieux pour la fabrication et la pose soignée des agencements intérieurs dans deux villas d'architecte à Cadjèhoun.",
    responsibilities: [
      "Façonnage et ajustement en atelier des éléments de menuiserie en bois noble béninois (teck, iroko).",
      "Pose soignée sur site sans dégradation des enduits existants.",
      "Finitions soignées aux huiles naturelles écologiques et vernis mat."
    ],
    conditions: [
      "Contrat encadré LE LABEUR : Part employeur 25% Mois 1 / Salaire 100% employé Mois 2.",
      "Outillage individuel de qualité fourni sur le chantier.",
      "Horaires : 8h00 à 17h00 du lundi au vendredi."
    ],
    selectionProcess: [
      "Vérification du dossier et réalisations passées par la cellule LE LABEUR.",
      "Échange technique avec Madame Reine Houénou à l atelier de Cadjèhoun.",
      "Test pratique d'ajustement en atelier avant contractualisation."
    ],
    compatibilityScore: 96,
    status: 'FILLED',
    startDate: '15 Octobre 2026',
    durationMonths: 6
  },
  {
    id: 'OFFER-002',
    title: 'Électricien Bâtiment — Raccordement Armoire & Clinique',
    employerId: 'user-emp-2',
    employerName: 'Les Bâtisseurs du Golfe Bénin',
    employerLocation: 'Abomey-Calavi — Godomey (Atlantique)',
    contractType: 'CDD Chantier 4 mois',
    remuneration: 140000,
    currency: 'FCFA',
    location: 'Abomey-Calavi — Godomey (Atlantique)',
    departmentId: 'dept-atlantique',
    municipalityId: 'com-abomey-calavi',
    arrondissementId: 'arr-godomey',
    localityId: 'loc-godomey-togoudo',
    locationLabel: 'Abomey-Calavi — Godomey (Atlantique)',
    domainId: 'dom-btp',
    jobId: 'job-electricien-batiment',
    postedDate: '01 Octobre 2026',
    isUrgent: false,
    isLeLabeurJob: false,
    skills: ['Câblage armoire TGBT', 'Habilitation BR', 'Schéma unifilaire', 'Installation solaire'],
    summary: "Dans le cadre de l'extension d'une clinique médicale à Godomey, nous recrutons un électricien confirmé pour le câblage de l'armoire divisionnaire et le réseau secouru ondulé.",
    responsibilities: [
      "Tirage de câbles selon plans et pose des chemins de câbles métalliques.",
      "Câblage armoire TGBT divisionnaire et raccordement onduleur médical.",
      "Tests d'isolement, équilibrage des phases et mise en service sécurisée."
    ],
    conditions: [
      "Chantier sous supervision déontologique LE LABEUR.",
      "Équipements de protection individuelle (EPI) fournis par l'entreprise.",
      "Indemnité forfaitaire de transport Cotonou-Calavi incluse."
    ],
    selectionProcess: [
      "Vérification de l'habilitation BR et des références chantiers.",
      "Entretien avec le conducteur de travaux Jean-Baptiste Soglo."
    ],
    compatibilityScore: 92,
    status: 'ACTIVE',
    startDate: '12 Octobre 2026',
    durationMonths: 4
  },
  {
    id: 'OFFER-003',
    title: 'Gouvernante de Maison & Intendance Résidence Privée',
    employerId: 'user-emp-3',
    employerName: 'Dr. Félicité Agossa',
    employerLocation: 'Cotonou — Fidjrossè Plage (Littoral)',
    contractType: 'Contrat mensuel reconductible',
    remuneration: 80000,
    currency: 'FCFA',
    location: 'Cotonou — Fidjrossè Plage (Littoral)',
    departmentId: 'dept-littoral',
    municipalityId: 'com-cotonou',
    arrondissementId: 'arr-cotonou-12',
    localityId: 'loc-fidjrosse-plage',
    locationLabel: 'Cotonou — Fidjrossè Plage (Littoral)',
    domainId: 'dom-maison-entretien',
    jobId: 'job-intendant',
    postedDate: '03 Octobre 2026',
    isUrgent: false,
    isLeLabeurJob: false,
    skills: ['Intendance privée', 'Lessive soignée & Repassage', 'Hygiène HACCP', 'Discrétion'],
    summary: "Recherche gouvernante expérimentée pour la gestion complète de l'intendance d'une grande résidence privée à Fidjrossè Plage.",
    responsibilities: [
      "Entretien quotidien méthodique des pièces de vie et chambres d'hôtes.",
      "Lessive délicate, détachage et repassage vapeur soigné.",
      "Gestion des stocks de produits ménagers et courses d'appoint."
    ],
    conditions: [
      "Cadre de travail respectueux et sécurisant avec contrat LE LABEUR.",
      "Repas de midi pris en charge sur place.",
      "Repos hebdomadaire garanti le dimanche."
    ],
    selectionProcess: [
      "Audit des références préalables et antécédents professionnels.",
      "Entretien direct avec Madame Agossa à la résidence."
    ],
    compatibilityScore: 94,
    status: 'ACTIVE',
    startDate: '20 Octobre 2026',
    durationMonths: 12
  },
  {
    id: 'OFFER-004',
    title: "Ferronnier Métallier — Verrières & Garde-corps d'Art",
    employerId: 'user-emp-4',
    employerName: "Ateliers Métal de l'Ouémé",
    employerLocation: 'Porto-Novo — Ouando (Ouémé)',
    contractType: 'Mission 5 mois',
    remuneration: 120000,
    currency: 'FCFA',
    location: 'Porto-Novo — Ouando (Ouémé)',
    departmentId: 'dept-oueme',
    municipalityId: 'com-porto-novo',
    arrondissementId: 'arr-pn-4',
    localityId: 'loc-ouando',
    locationLabel: 'Porto-Novo — Ouando (Ouémé)',
    domainId: 'dom-artisanat',
    jobId: 'job-soudeur-metallier',
    postedDate: '28 Septembre 2026',
    isUrgent: false,
    isLeLabeurJob: false,
    skills: ['Soudure TIG/MIG', 'Découpe acier', 'Lecture de plan', 'Forge manuelle'],
    summary: "Fabrication en atelier et pose sur site de verrières de style industriel et de garde-corps d'art en acier pour des résidences neuves à Porto-Novo et Sèmè-Kpodji.",
    responsibilities: [
      "Débit, meulage et soudure TIG/MIG des profils métalliques légers.",
      "Traitement de surface antirouille époxy avant peinture thermolaquée.",
      "Pose et scellement d'aplomb sur chantiers avec prises de niveaux laser."
    ],
    conditions: [
      "Atelier équipé avec postes TIG/MIG professionnels.",
      "Mandat LE LABEUR : respect strict des paiements directs à l'artisan."
    ],
    selectionProcess: [
      "Test de cordon de soudure TIG à l'atelier d'Ouando.",
      "Contrat direct formalisé sous LE LABEUR."
    ],
    compatibilityScore: 93,
    status: 'FILLED',
    startDate: '01 Novembre 2026',
    durationMonths: 5
  },
  {
    id: 'OFFER-005',
    title: 'Ménagère & Entretien Résidence Privée de Famille',
    employerId: 'user-emp-1',
    employerName: 'Atelier Bois & Agencement Bénin',
    employerLocation: 'Cotonou — Cadjèhoun Kpota (Littoral)',
    contractType: 'Contrat mensuel 12 mois',
    remuneration: 50000,
    currency: 'FCFA',
    location: 'Cotonou — Haie Vive (Littoral)',
    departmentId: 'dept-littoral',
    municipalityId: 'com-cotonou',
    arrondissementId: 'arr-cotonou-12',
    localityId: 'loc-haie-vive',
    locationLabel: 'Cotonou — Haie Vive (Littoral)',
    domainId: 'dom-maison-entretien',
    jobId: 'job-menagere',
    postedDate: '01 Octobre 2026',
    isUrgent: false,
    isLeLabeurJob: false,
    skills: ['Nettoyage des sols', 'Lessive & Repassage', 'Rangement des pièces', 'Entretien sanitaires'],
    summary: "Recherche d'une aide-ménagère appliquée et discrète pour l'entretien d'une villa familiale à la Haie Vive : balayage, lavage des carrelages, dépoussiérage et vaisselle.",
    responsibilities: [
      "Nettoyage minutieux et régulier des pièces de vie et terrasses.",
      "Lessive soignée des vêtements du quotidien et linge de table.",
      "Maintien de l ordre et de la propreté générale du domicile."
    ],
    conditions: [
      "LE LABEUR garantit 75% premier salaire / 100% les mois suivants.",
      "Règlement direct de 50 000 FCFA à l employée chaque fin de mois."
    ],
    selectionProcess: [
      "Entretien d'accueil avec les employeurs.",
      "Validation sous contrat LE LABEUR."
    ],
    compatibilityScore: 95,
    status: 'ACTIVE',
    startDate: '10 Octobre 2026',
    durationMonths: 12
  },
  {
    id: 'OFFER-URGENT-001',
    title: "MISSION D'URGENCE : Électricien Chantiers Prioritaires Calavi",
    employerId: 'user-admin-1',
    employerName: 'Cellule Centrale de Contrôle LE LABEUR Bénin',
    employerLocation: 'Abomey-Calavi — Arconville (Atlantique)',
    contractType: "Mission d'urgence 30 jours",
    remuneration: 150000,
    currency: 'FCFA',
    location: 'Abomey-Calavi — Arconville (Atlantique)',
    departmentId: 'dept-atlantique',
    municipalityId: 'com-abomey-calavi',
    arrondissementId: 'arr-calavi-centre',
    localityId: 'loc-arconville',
    locationLabel: 'Abomey-Calavi — Arconville (Atlantique)',
    domainId: 'dom-btp',
    jobId: 'job-electricien-batiment',
    postedDate: '04 Octobre 2026',
    isUrgent: true,
    isLeLabeurJob: true,
    leLabeurTag: "Mandat d'arbitrage direct LE LABEUR Bénin",
    skills: ['Câblage armoire TGBT', 'Habilitation BR', 'Diagnostic panne', 'Dépannage express'],
    summary: "Mission d'urgence mandatée directement par la cellule LE LABEUR Bénin suite à la défaillance d'un artisan sur un chantier prioritaire à Calavi.",
    responsibilities: [
      "Audit express de l installation électrique existante.",
      "Reprise des non-conformités sur l armoire principale.",
      "Mise en sécurité immédiate des circuits sensibles."
    ],
    conditions: [
      "Rémunération garantie et consignée par LE LABEUR Bénin.",
      "Démarrage sous 24h requis."
    ],
    selectionProcess: [
      "Sélection immédiate sur dossier vérifié LE LABEUR."
    ],
    compatibilityScore: 98,
    status: 'ACTIVE',
    startDate: 'Immédiat',
    durationMonths: 1
  }
];

export const INITIAL_APPLICATIONS: Application[] = [
  {
    id: 'APP-001',
    offerId: 'OFFER-001',
    offerTitle: "Menuisier d'Art & Poseur de Meubles d'Édition",
    candidateId: 'user-cand-1',
    candidateName: 'Amina Dossou',
    candidateHeadline: "Menuisière d'Art & Agencement Contemporain",
    candidateAvatar: getAvatar('user-cand-1'),
    appliedDate: '02 Octobre 2026',
    status: 'SHORTLISTED',
    note: "Profil très qualifié en ébénisterie de teck et iroko. Portfolio en phase avec les standards de l atelier.",
    contractId: 'CTR-001',
    history: [
      { action: 'Candidature soumise', timestamp: '02/10/2026 10:15', actor: 'Amina Dossou' },
      { action: 'Dossier examiné et présélectionné', timestamp: '02/10/2026 14:30', actor: 'Reine Houénou' },
      { action: 'Proposition de mission formulée', timestamp: '02/10/2026 16:00', actor: 'Reine Houénou' }
    ]
  },
  {
    id: 'APP-002',
    offerId: 'OFFER-002',
    offerTitle: 'Électricien Bâtiment — Raccordement Armoire & Clinique',
    candidateId: 'user-cand-2',
    candidateName: 'Rodrigue Akpakoun',
    candidateHeadline: 'Électricien Bâtiment & Systèmes Solaires Ondulés',
    candidateAvatar: getAvatar('user-cand-2'),
    appliedDate: '01 Octobre 2026',
    status: 'REVIEW',
    note: "Habilitation BR vérifiée. Bonnes compétences sur réseaux ondulés.",
    contractId: 'CTR-003',
    history: [
      { action: 'Candidature soumise', timestamp: '01/10/2026 11:20', actor: 'Rodrigue Akpakoun' }
    ]
  },
  {
    id: 'APP-003',
    offerId: 'OFFER-003',
    offerTitle: 'Gouvernante de Maison & Intendance Résidence Privée',
    candidateId: 'user-cand-3',
    candidateName: 'Yasmine Hounkpatin',
    candidateHeadline: 'Gouvernante de Maison & Intendance de Standing',
    candidateAvatar: getAvatar('user-cand-3'),
    appliedDate: '03 Octobre 2026',
    status: 'SHORTLISTED',
    note: 'Très bonne expérience en intendance à Fidjrossè.',
    history: [
      { action: 'Candidature reçue', timestamp: '03/10/2026 09:00', actor: 'Yasmine Hounkpatin' },
      { action: 'Entretien téléphonique réalisé', timestamp: '03/10/2026 14:00', actor: 'Dr. Félicité Agossa' }
    ]
  },
  {
    id: 'APP-004',
    offerId: 'OFFER-004',
    offerTitle: "Ferronnier Métallier — Verrières & Garde-corps d'Art",
    candidateId: 'user-cand-5',
    candidateName: 'Christian Zannou',
    candidateHeadline: "Ferronnier Métallier d'Art & Portails de Sécurité",
    candidateAvatar: getAvatar('user-cand-5'),
    appliedDate: '29 Septembre 2026',
    status: 'SHORTLISTED',
    note: 'Épreuve pratique soudure TIG excellente à Ouando.',
    contractId: 'CTR-002',
    history: [
      { action: 'Candidature soumise', timestamp: '29/09/2026 09:30', actor: 'Christian Zannou' },
      { action: 'Retenu pour contrat', timestamp: '30/09/2026 17:00', actor: 'Oumar Bio Sanni' }
    ]
  }
];

export const INITIAL_CONTRACTS: Contract[] = [
  // 1. Contrat 1 (CTR-001): Mois 1 en cours. Total: 30 000 FCFA. Part employé (75%) = 22 500 FCFA. Part LE LABEUR (25%) = 7 500 FCFA due.
  {
    id: 'CTR-001',
    offerId: 'OFFER-001',
    offerTitle: "Menuisier d'Art & Poseur de Meubles d'Édition",
    applicationId: 'APP-001',
    employerId: 'user-emp-1',
    employerName: 'Atelier Bois & Agencement Bénin',
    employerPublicId: 'LAB-R-000001',
    employeeId: 'user-cand-1',
    employeeName: 'Amina Dossou',
    employeePublicId: 'LAB-C-000001',
    monthlySalary: 30000,
    currency: 'FCFA',
    startDate: '15 Septembre 2026',
    currentMonth: 1,
    status: 'ACTIVE',
    employerSigned: true,
    employerSignedAt: '15/09/2026 08:30',
    employeeSigned: true,
    employeeSignedAt: '15/09/2026 09:00',
    missionDescription: "Fabrication et pose soignée des agencements intérieurs dans deux villas d'architecte à Cadjèhoun.",
    location: 'Cotonou — Cadjèhoun Kpota (Littoral)',
    durationMonths: 6,
    periodicity: 'Mensuel',
    conditions: [
      "Outillage électroportatif professionnel fourni sur le chantier.",
      "Horaires : 8h00 à 17h00 du lundi au vendredi.",
      "Règlement direct employeur à employé chaque fin de mois."
    ],
    additionalNotes: 'Mission sous déontologie LE LABEUR : protection Mois 1 et médiation garantie.',
    paymentSchedule: [],
    monthlyCheckpoints: [
      {
        monthNumber: 1,
        periodKey: 'Mois 01',
        salaryAmount: 30000,
        employeeShareAmount: 22500,
        leLabeurShareAmount: 7500,
        currency: 'FCFA',
        isStarted: true,
        employerStartAnswer: 'YES',
        employeeStartAnswer: 'YES',
        startConfirmed: true,
        isSalaryPaidToEmployee: true,
        salaryDeclaredAt: '28/09/2026 18:00',
        salaryPhone: '+229 97 60 70 80',
        salaryTxnId: 'SAL-MTN-8829104',
        salaryProofFileName: 'recu_salaire_momo.png',
        employeeSalaryConfirmation: 'RECEIVED',
        employeeSalaryConfirmedAt: '28/09/2026 18:30',
        employerConfirmed: true,
        employeeConfirmed: true,
        notes: 'Chantier démarré dans les délais. Part nette employé (22 500 FCFA) versée le 28/09 par MTN Mobile Money et confirmée par la salariée.',
        confirmedAt: '28/09/2026'
      }
    ],
    commissionLedger: [
      {
        contractId: 'CTR-001',
        monthNumber: 1,
        salaryBase: 30000,
        percentage: 25,
        amountDue: 7500,
        amountSubmitted: 0,
        status: 'DUE',
        createdAt: '28/09/2026 18:30'
      }
    ],
    commissionPercentage: 25,
    commissionAmountDue: 7500,
    commissionStatus: 'DUE',
    history: [
      { id: 'LOG-1', timestamp: '15/09/2026 09:00', event: 'CONTRACT_CREATED', description: 'Contrat signé suite à proposition acceptée. Salaire total fixé : 30 000 FCFA.', actor: 'Système LE LABEUR' },
      { id: 'LOG-2', timestamp: '15/09/2026 09:30', event: 'MISSION_CONFIRMED', description: 'Prise de poste effective validée bilatéralement sur site à Cadjèhoun.', actor: 'Reine Houénou & Amina Dossou' },
      { id: 'LOG-3', timestamp: '28/09/2026 18:00', event: 'SALARY_PAID_DIRECT', description: 'Premier salaire direct (part nette 75% = 22 500 FCFA) versé directement à l employée par l employeur.', actor: 'Reine Houénou' },
      { id: 'LOG-3B', timestamp: '28/09/2026 18:30', event: 'SALARY_CONFIRMED_BY_EMPLOYEE', description: 'Réception de la part salariale nette de 22 500 FCFA confirmée par Amina Dossou.', actor: 'Amina Dossou' },
      { id: 'LOG-4', timestamp: '28/09/2026 18:35', event: 'COMMISSION_DUE', description: 'Part LE LABEUR (25% = 7 500 FCFA) exigible auprès de l employeur (l artisan ne paie rien). Vos recrutements restent 100% ouverts.', actor: 'Système LE LABEUR' }
    ]
  },
  // 2. Contrat 2 (CTR-002): Mois 2+ (deuxième mois). Total: 45 000 FCFA. Part employé (100%) = 45 000 FCFA, LE LABEUR (0%) = 0 FCFA.
  {
    id: 'CTR-002',
    offerId: 'OFFER-004',
    offerTitle: "Ferronnier Métallier — Verrières d'Art",
    applicationId: 'APP-004',
    employerId: 'user-emp-4',
    employerName: "Ateliers Métal de l'Ouémé",
    employerPublicId: 'LAB-R-000004',
    employeeId: 'user-cand-5',
    employeeName: 'Christian Zannou',
    employeePublicId: 'LAB-C-000005',
    monthlySalary: 45000,
    currency: 'FCFA',
    startDate: '10 Août 2026',
    currentMonth: 2,
    status: 'ACTIVE',
    employerSigned: true,
    employerSignedAt: '10/08/2026 09:00',
    employeeSigned: true,
    employeeSignedAt: '10/08/2026 09:15',
    missionDescription: 'Fabrication de garde-corps contemporains et verrières sur mesure à Ouando.',
    location: 'Porto-Novo — Ouando (Ouémé)',
    durationMonths: 5,
    periodicity: 'Mensuel',
    conditions: [
      'Fourniture acier et consommables assurée par l employeur.',
      '100% du salaire versé à l artisan dès le Mois 2 (0% de commission LE LABEUR).'
    ],
    additionalNotes: 'Contrat stabilisé en Mois 2.',
    paymentSchedule: [],
    monthlyCheckpoints: [
      {
        monthNumber: 1,
        periodKey: 'Mois 01 (Août 2026)',
        salaryAmount: 45000,
        employeeShareAmount: 33750,
        leLabeurShareAmount: 11250,
        currency: 'FCFA',
        isStarted: true,
        startConfirmed: true,
        isSalaryPaidToEmployee: true,
        salaryDeclaredAt: '08/09/2026',
        employeeSalaryConfirmation: 'RECEIVED',
        employerConfirmed: true,
        employeeConfirmed: true
      },
      {
        monthNumber: 2,
        periodKey: 'Mois 02 (Septembre 2026)',
        salaryAmount: 45000,
        employeeShareAmount: 45000,
        leLabeurShareAmount: 0,
        currency: 'FCFA',
        isStarted: true,
        startConfirmed: true,
        isSalaryPaidToEmployee: true,
        salaryDeclaredAt: '08/10/2026',
        employeeSalaryConfirmation: 'RECEIVED',
        employerConfirmed: true,
        employeeConfirmed: true,
        notes: 'Mois 2 effectif : 100% du salaire (45 000 FCFA) perçu intégralement par Christian Zannou. Commission LE LABEUR = 0 FCFA.'
      }
    ],
    commissionLedger: [
      {
        contractId: 'CTR-002',
        monthNumber: 1,
        salaryBase: 45000,
        percentage: 25,
        amountDue: 11250,
        amountSubmitted: 11250,
        status: 'PAID',
        paymentId: 'PAY-HIST-01',
        createdAt: '08/09/2026',
        verifiedAt: '09/09/2026 10:00'
      },
      {
        contractId: 'CTR-002',
        monthNumber: 2,
        salaryBase: 45000,
        percentage: 0,
        amountDue: 0,
        amountSubmitted: 0,
        status: 'PAID',
        createdAt: '08/10/2026'
      }
    ],
    commissionPercentage: 0,
    commissionAmountDue: 0,
    commissionStatus: 'PAID',
    history: [
      { id: 'LOG-201', timestamp: '10/08/2026 09:15', event: 'CONTRACT_CREATED', description: 'Contrat signé.', actor: 'Système LE LABEUR' },
      { id: 'LOG-202', timestamp: '09/09/2026 10:00', event: 'M1_COMMISSION_SETTLED', description: 'Commission M1 (11 250 FCFA) réglée et auditée par l administration.', actor: 'Cellule Admin LE LABEUR' },
      { id: 'LOG-203', timestamp: '08/10/2026 10:00', event: 'MONTH_2_TRANSITION', description: 'Passage en Mois 2 : commission LE LABEUR fixée à 0%, 100% au travailleur.', actor: 'Système LE LABEUR' }
    ]
  },
  // 3. Contrat 3 (CTR-003): Remplacement suite à incident (Abomey-Calavi)
  {
    id: 'CTR-003',
    offerId: 'OFFER-002',
    offerTitle: 'Électricien Bâtiment Réseau Ondulé Clinique',
    applicationId: 'APP-002',
    employerId: 'user-emp-2',
    employerName: 'Les Bâtisseurs du Golfe Bénin',
    employerPublicId: 'LAB-R-000002',
    employeeId: 'user-cand-2',
    employeeName: 'Rodrigue Akpakoun',
    employeePublicId: 'LAB-C-000002',
    monthlySalary: 140000,
    currency: 'FCFA',
    startDate: '20 Septembre 2026',
    currentMonth: 1,
    status: 'INCIDENT',
    employerSigned: true,
    employerSignedAt: '20/09/2026',
    employeeSigned: true,
    employeeSignedAt: '20/09/2026',
    missionDescription: "Raccordement réseau secouru ondulé clinique Godomey.",
    location: 'Abomey-Calavi — Godomey (Atlantique)',
    durationMonths: 4,
    periodicity: 'Mensuel',
    conditions: ['Prise en charge matériel de sécurité.'],
    incidentId: 'INC-001',
    paymentSchedule: [],
    monthlyCheckpoints: [
      {
        monthNumber: 1,
        periodKey: 'Mois 01',
        salaryAmount: 140000,
        employeeShareAmount: 105000,
        leLabeurShareAmount: 35000,
        currency: 'FCFA',
        isStarted: true,
        employerStartAnswer: 'YES',
        employeeStartAnswer: 'NO',
        startDivergence: true,
        isSalaryPaidToEmployee: false,
        employerConfirmed: true,
        employeeConfirmed: false,
        divergenceArbitrationNote: 'Divergence constatée sur les horaires de présence à la clinique. En cours d examen par la cellule de contrôle LE LABEUR Bénin.'
      }
    ],
    commissionLedger: [
      {
        contractId: 'CTR-003',
        monthNumber: 1,
        salaryBase: 140000,
        percentage: 25,
        amountDue: 0,
        amountSubmitted: 0,
        status: 'PENDING_VERIFICATION',
        createdAt: '20/09/2026'
      }
    ],
    commissionPercentage: 25,
    commissionAmountDue: 0,
    commissionStatus: 'PENDING_VERIFICATION',
    history: [
      { id: 'LOG-301', timestamp: '20/09/2026', event: 'CONTRACT_CREATED', description: 'Contrat signé.', actor: 'Système LE LABEUR' },
      { id: 'LOG-302', timestamp: '25/09/2026', event: 'INCIDENT_OPENED', description: 'Désaccord signalé par l employeur sur le respect des horaires.', actor: 'Jean-Baptiste Soglo' }
    ]
  }
];

export const INITIAL_INCIDENTS: Incident[] = [
  {
    id: 'INC-001',
    contractId: 'CTR-003',
    offerTitle: 'Électricien Bâtiment Réseau Ondulé Clinique',
    employerId: 'user-emp-2',
    employerName: 'Les Bâtisseurs du Golfe Bénin',
    employeeId: 'user-cand-2',
    employeeName: 'Rodrigue Akpakoun',
    reportedBy: 'EMPLOYER',
    reason: "Divergence d'horaires et interruption imprévue de présence",
    description: "Le technicien ne s'est pas présenté aux rendez-vous d'intervention programmés avec le médecin-chef de la clinique à Calavi le 24 septembre.",
    evidenceNote: 'Pointage de garde et relevé du gardien de la clinique attestant l absence.',
    createdAt: '25 Septembre 2026 14:15',
    status: 'UNDER_REVIEW',
    history: [
      { action: 'Signalement incident déclaré', timestamp: '25/09/2026 14:15', actor: 'Jean-Baptiste Soglo' },
      { action: 'Dossier transmis au médiateur LE LABEUR Bénin', timestamp: '25/09/2026 15:00', actor: 'Système LE LABEUR' }
    ]
  }
];

export const INITIAL_REPLACEMENTS: ReplacementDossier[] = [
  {
    id: 'REP-001',
    incidentId: 'INC-001',
    originalContractId: 'CTR-003',
    employerId: 'user-emp-2',
    employerName: 'Les Bâtisseurs du Golfe Bénin',
    urgentOfferId: 'OFFER-URGENT-001',
    urgentOfferTitle: "MISSION D'URGENCE : Électricien Chantiers Prioritaires Calavi",
    selectedCandidateId: undefined,
    selectedCandidateName: undefined,
    status: 'SOURCING_CANDIDATES',
    createdAt: '26 Septembre 2026 09:00',
    updatedAt: '26 Septembre 2026 11:30'
  }
];

export const INITIAL_COMMISSIONS: CommissionPaymentRecord[] = [
  {
    paymentId: 'PAY-001',
    contractId: 'CTR-001',
    offerTitle: "Menuisier d'Art & Poseur de Meubles d'Édition",
    employerId: 'user-emp-1',
    employerName: 'Atelier Bois & Agencement Bénin',
    employeeId: 'user-cand-1',
    employeeName: 'Amina Dossou',
    monthNumber: 1,
    periodKey: 'Mois 01 (Septembre 2026)',
    amountDue: 7500,
    amountSubmitted: 7500,
    currency: 'FCFA',
    transactionId: 'TXN-MTN-20260928-883',
    senderPhone: '+229 97 60 70 80',
    reference: 'COMM-CTR-001-M1',
    paymentDate: '28/09/2026',
    paymentTime: '19:10',
    proofUri: 'blob:proof-sample-url',
    proofFileName: 'recu_mtn_momo_7500.png',
    status: 'PENDING_VERIFICATION',
    createdAt: '28/09/2026 19:12',
    notes: 'Paiement effectué via MTN Mobile Money Bénin. En attente de validation comptable LE LABEUR.'
  }
];

/**
 * PHASE 4A (MODE DEMO) — déclarations de paiement externe de l'employeur démo
 * (Reine Houénou / Atelier Bois & Agencement Bénin, contrat CTR-001).
 * Un brouillon modifiable + une déclaration déjà soumise, cohérentes avec
 * l'historique du contrat CTR-001 (salaire direct versé le 28/09/2026).
 *
 * PHASE 4C (MODE DEMO) — une deuxième déclaration soumise, portée par un autre
 * employeur (Les Bâtisseurs du Golfe Bénin, contrat CTR-003), afin que l'écran
 * ADMIN « Paiements à vérifier » liste au moins deux dossiers réels.
 */
export const INITIAL_PAYMENT_DECLARATIONS: PaymentDeclaration[] = [
  {
    paymentId: 'PDECL-DEMO-0002',
    employerId: 'user-emp-1',
    contractId: 'CTR-001',
    amount: 7500,
    currency: 'FCFA',
    paymentMethod: 'MOBILE_MONEY',
    transactionId: 'TXN-MTN-20261003-4471',
    reference: 'REF-LABEUR-CTR001-M1',
    paidAt: '2026-10-03T14:30:00.000Z',
    proofReference: 'RECU-MTN-4471-20261003',
    comment: 'Part LE LABEUR (25% du Mois 1) réglée par MTN Mobile Money. Reçu conservé, à compléter avant soumission.',
    status: 'DRAFT',
    createdAt: '2026-10-03T14:42:00.000Z',
    updatedAt: '2026-10-03T14:42:00.000Z'
  },
  {
    paymentId: 'PDECL-DEMO-0001',
    employerId: 'user-emp-1',
    contractId: 'CTR-001',
    amount: 22500,
    currency: 'FCFA',
    paymentMethod: 'MOBILE_MONEY',
    transactionId: 'SAL-MTN-8829104',
    reference: 'SAL-CTR-001-M1',
    paidAt: '2026-09-28T18:00:00.000Z',
    proofDocumentId: 'DOC-REC-SAL-CTR001-M1',
    comment: 'Part nette salariée (75% du Mois 1) versée directement à Amina Dossou et confirmée par elle.',
    status: 'SUBMITTED',
    submittedAt: '2026-09-28T18:12:00.000Z',
    createdAt: '2026-09-28T18:05:00.000Z',
    updatedAt: '2026-09-28T18:12:00.000Z'
  },
  {
    paymentId: 'PDECL-DEMO-0003',
    employerId: 'user-emp-2',
    contractId: 'CTR-003',
    amount: 35000,
    currency: 'FCFA',
    paymentMethod: 'BANK_TRANSFER',
    transactionId: 'VIR-BOA-20261001-55210',
    reference: 'COMM-CTR-003-M1',
    paidAt: '2026-10-01T09:20:00.000Z',
    proofReference: 'BORDEREAU-BOA-55210',
    comment: 'Part LE LABEUR (25% du Mois 1) réglée par virement bancaire BOA. Bordereau signé transmis à l’administration.',
    status: 'SUBMITTED',
    submittedAt: '2026-10-01T09:35:00.000Z',
    createdAt: '2026-10-01T09:30:00.000Z',
    updatedAt: '2026-10-01T09:35:00.000Z'
  }
];

export const INITIAL_CONVERSATIONS: Conversation[] = [
  {
    id: 'CONV-001',
    participantIds: ['user-cand-1', 'user-emp-1'],
    otherParticipant: {
      id: 'user-cand-1',
      publicId: 'LAB-C-000001',
      name: 'Amina Dossou',
      role: 'CANDIDATE',
      avatarUrl: getAvatar('user-cand-1')
    },
    contextType: 'CONTRACT',
    contextTitle: "Menuisier d'Art & Poseur de Meubles d'Édition",
    contextRefId: 'CTR-001',
    lastMessageText: "Parfait Madame Houénou, les panneaux en teck de Cadjèhoun sont débités.",
    lastMessageTime: '17:45',
    unreadCount: 0
  },
  {
    id: 'CONV-002',
    participantIds: ['user-cand-2', 'user-emp-2'],
    otherParticipant: {
      id: 'user-cand-2',
      publicId: 'LAB-C-000002',
      name: 'Rodrigue Akpakoun',
      role: 'CANDIDATE',
      avatarUrl: getAvatar('user-cand-2')
    },
    contextType: 'APPLICATION',
    contextTitle: 'Électricien Bâtiment — Clinique Godomey',
    contextRefId: 'APP-002',
    lastMessageText: "J'ai bien noté les exigences d'onduleur pour la salle d'opération.",
    lastMessageTime: 'Hier',
    unreadCount: 1
  }
];

export const INITIAL_MESSAGES: Record<string, ChatMessage[]> = {
  'CONV-001': [
    {
      id: 'MSG-001',
      conversationId: 'CONV-001',
      senderId: 'user-emp-1',
      senderRole: 'EMPLOYER',
      text: "Bonjour Amina. Nous avons validé votre profil pour l'agencement à Cadjèhoun. Pouvez-vous passer à l'atelier demain à 9h ?",
      sentAt: '15/09/2026 10:00',
      isRead: true,
      status: 'READ'
    },
    {
      id: 'MSG-002',
      conversationId: 'CONV-001',
      senderId: 'user-cand-1',
      senderRole: 'CANDIDATE',
      text: "Bonjour Madame Houénou. C'est bien noté, je serai à l'atelier avec mon mètre et mon carnet de cotes.",
      sentAt: '15/09/2026 10:15',
      isRead: true,
      status: 'READ'
    },
    {
      id: 'MSG-003',
      conversationId: 'CONV-001',
      senderId: 'user-cand-1',
      senderRole: 'CANDIDATE',
      text: "Parfait Madame Houénou, les panneaux en teck de Cadjèhoun sont débités.",
      sentAt: '28/09/2026 17:45',
      isRead: true,
      status: 'READ'
    }
  ],
  'CONV-002': [
    {
      id: 'MSG-201',
      conversationId: 'CONV-002',
      senderId: 'user-emp-2',
      senderRole: 'EMPLOYER',
      text: "Bonjour Rodrigue. Avez-vous déjà câblé des tableaux avec inverseurs de source automatiques pour groupes électrogènes ?",
      sentAt: 'Hier 14:00',
      isRead: true,
      status: 'READ'
    },
    {
      id: 'MSG-202',
      conversationId: 'CONV-002',
      senderId: 'user-cand-2',
      senderRole: 'CANDIDATE',
      text: "J'ai bien noté les exigences d'onduleur pour la salle d'opération.",
      sentAt: 'Hier 14:25',
      isRead: false,
      status: 'DELIVERED'
    }
  ]
};

export const INITIAL_CALLS: CallRecord[] = [
  {
    id: 'CALL-001',
    conversationId: 'CONV-001',
    callerId: 'user-emp-1',
    callerName: 'Reine Houénou',
    callerRole: 'EMPLOYER',
    callerAvatar: getAvatar('user-emp-1'),
    callerHeadline: 'Directrice Générale — Atelier Bois & Agencement Bénin',
    receiverId: 'user-cand-1',
    receiverName: 'Amina Dossou',
    receiverRole: 'CANDIDATE',
    receiverAvatar: getAvatar('user-cand-1'),
    receiverHeadline: "Menuisière d'Art & Agencement Contemporain",
    status: 'ENDED',
    direction: 'OUTGOING',
    startedAt: '15/09/2026 09:30',
    connectedAt: '15/09/2026 09:30',
    endedAt: '15/09/2026 09:34',
    durationSeconds: 245,
    isMuted: false,
    isSpeakerOn: false,
    networkQuality: 'EXCELLENT',
    webrtcSessionId: 'webrtc-call-001'
  }
];

export const INITIAL_COMM_EVENTS: CommunicationEvent[] = [
  {
    id: 'CE-001',
    actorId: 'user-emp-1',
    actorName: 'Reine Houénou',
    actorRole: 'EMPLOYER',
    recipientId: 'user-cand-1',
    recipientName: 'Amina Dossou',
    recipientRole: 'CANDIDATE',
    offerId: 'OFFER-001',
    contractId: 'CTR-001',
    conversationId: 'CONV-001',
    type: 'CALL_ENDED',
    timestamp: '15/09/2026 09:34',
    metadata: { durationSeconds: 245 }
  }
];

export const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'NOTIF-001',
    recipientId: 'user-cand-1',
    type: 'CONTRACT_ACTIVE',
    title: 'Mission Enregistrée et Validée',
    message: 'Votre contrat pour l agencement à Cadjèhoun est actif. Vos rémunérations sont protégées à 100%.',
    linkRef: { screen: 'CONTRACTS' },
    isRead: false,
    createdAt: 'Il y a 2 jours'
  },
  {
    id: 'NOTIF-002',
    recipientId: 'user-emp-1',
    type: 'COMMISSION_DUE',
    title: 'Reconduction & Règle LE LABEUR',
    message: 'Votre versement direct de 22 500 FCFA à Amina Dossou a été confirmé. Part LE LABEUR (7 500 FCFA) à régler.',
    linkRef: { screen: 'CONTRACTS' },
    isRead: false,
    createdAt: 'Hier'
  }
];

export const INITIAL_AUDIT_LOGS: SystemAuditLog[] = [
  {
    id: 'AUD-001',
    timestamp: '02/10/2026 08:00',
    actor: 'Système LE LABEUR Bénin',
    role: 'SYSTEM',
    action: 'DISCOVERY_INDEX_INITIALIZED',
    entity: 'GEOGRAPHY',
    entityId: 'BENIN_12_DEPTS',
    summary: 'Initialisation du référentiel territorial officiel Bénin.'
  }
];

export const INITIAL_PROPOSALS: MissionProposal[] = [
  {
    id: 'PROP-001',
    conversationId: 'CONV-001',
    contractId: 'CTR-001',
    offerId: 'OFFER-001',
    applicationId: 'APP-001',
    employerId: 'user-emp-1',
    employerName: 'Atelier Bois & Agencement Bénin',
    employeeId: 'user-cand-1',
    employeeName: 'Amina Dossou',
    missionTitle: "Menuisier d'Art & Poseur de Meubles d'Édition",
    amount: 30000,
    currency: 'FCFA',
    periodicity: 'Mensuel',
    startDate: '15 Septembre 2026',
    durationMonths: 6,
    location: 'Cotonou — Cadjèhoun Kpota (Littoral)',
    conditions: [
      "Outillage individuel fourni.",
      "Règlement direct employeur chaque fin de mois."
    ],
    status: 'ACCEPTED',
    sentAt: '15/09/2026 08:00',
    updatedAt: '15/09/2026 08:30'
  }
];

export function getDiscoveredResources(): ResourceDocument[] {
  return loadDiscoveredResources();
}

export const INITIAL_PAYMENTS: CommissionPaymentRecord[] = INITIAL_COMMISSIONS;
export const INITIAL_SYSTEM_LOGS: SystemAuditLog[] = INITIAL_AUDIT_LOGS;
export const INITIAL_COMMUNICATION_EVENTS: CommunicationEvent[] = INITIAL_COMM_EVENTS;
export const INITIAL_RESOURCES: ResourceDocument[] = loadDiscoveredResources();
