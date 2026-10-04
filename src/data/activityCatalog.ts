/**
 * Référentiel extensible des domaines et métiers proposés par LE LABEUR.
 * Il s'agit d'un catalogue applicatif : il doit pouvoir évoluer sans modifier
 * la logique métier ni le moteur de recherche.
 */

export interface ActivityJob {
  id: string;
  title: string;
  domainId: string;
  domainTitle: string;
  specialties: string[];
  skills: string[];
  description: string;
  defaultMonthlySalaryBenin: number;
}

export interface ActivityDomain {
  id: string;
  title: string;
  shortDescription: string;
  iconName: string;
  jobs: ActivityJob[];
}

type DomainSeed = {
  id: string;
  title: string;
  description: string;
  icon: string;
  jobs: Array<{
    id: string;
    title: string;
    specialties: string[];
    skills: string[];
    description: string;
    salary: number;
  }>;
};

const DOMAIN_SEEDS: DomainSeed[] = [
  {
    id: 'dom-maison-entretien', title: 'Maison & Entretien', icon: 'Home',
    description: 'Personnel de maison, intendance, hygiène et entretien.',
    jobs: [
      { id: 'job-menagere', title: 'Ménagère', specialties: ['Entretien quotidien', 'Résidence privée'], skills: ['Nettoyage', 'Lessive', 'Entretien sanitaires'], description: 'Assure la propreté et l’entretien courant du domicile ou des locaux.', salary: 45000 },
      { id: 'job-femme-menage', title: 'Femme de ménage', specialties: ['Nettoyage bureaux', 'Grand nettoyage'], skills: ['Dépoussiérage', 'Lavage sols', 'Tri'], description: 'Réalise les prestations régulières de nettoyage.', salary: 45000 },
      { id: 'job-aide-menagere', title: 'Aide-ménagère', specialties: ['Aide à domicile'], skills: ['Ménage', 'Rangement', 'Courses'], description: 'Accompagne les tâches ménagères et domestiques.', salary: 50000 },
      { id: 'job-lessive', title: 'Lessive & linge', specialties: ['Lavage', 'Séchage'], skills: ['Lavage', 'Tri linge', 'Détachage'], description: 'Prend en charge l’entretien du linge et des textiles.', salary: 45000 },
      { id: 'job-repassage', title: 'Repassage', specialties: ['Linge professionnel', 'Linge de maison'], skills: ['Repassage', 'Pliage', 'Finition'], description: 'Prépare et repasse les vêtements et linges.', salary: 45000 },
      { id: 'job-intendant', title: 'Intendant de maison', specialties: ['Résidence de standing', 'Coordination'], skills: ['Gestion maison', 'Stocks', 'Supervision'], description: 'Coordonne l’intendance générale d’une résidence.', salary: 75000 },
    ]
  },
  {
    id: 'dom-agriculture', title: 'Agriculture', icon: 'Sprout', description: 'Production agricole, élevage et travaux ruraux.',
    jobs: [
      { id: 'job-agriculteur', title: 'Agriculteur', specialties: ['Cultures vivrières', 'Maraîchage'], skills: ['Préparation sol', 'Semis', 'Récolte'], description: 'Conduit les opérations courantes de production agricole.', salary: 70000 },
      { id: 'job-ouvrier-agricole', title: 'Ouvrier agricole', specialties: ['Plantation', 'Récolte'], skills: ['Plantation', 'Sarclage', 'Récolte'], description: 'Participe aux travaux agricoles de terrain.', salary: 50000 },
      { id: 'job-maraicher', title: 'Maraîcher', specialties: ['Tomate', 'Poivron', 'Piment', 'Gingembre'], skills: ['Irrigation', 'Pépinière', 'Fertilisation'], description: 'Produit des légumes et condiments en maraîchage.', salary: 65000 },
    ]
  },
  {
    id: 'dom-btp', title: 'BTP', icon: 'Hammer', description: 'Construction, gros œuvre et second œuvre.',
    jobs: [
      { id: 'job-macon', title: 'Maçon', specialties: ['Gros œuvre', 'Rénovation'], skills: ['Coffrage', 'Ferraillage', 'Béton'], description: 'Réalise les travaux de maçonnerie et de structure.', salary: 90000 },
      { id: 'job-manoeuvre', title: 'Manœuvre', specialties: ['Chantier'], skills: ['Manutention', 'Préparation chantier'], description: 'Assiste les équipes sur les travaux de chantier.', salary: 50000 },
      { id: 'job-coffreur', title: 'Coffreur ferrailleur', specialties: ['Fondations', 'Dalles'], skills: ['Coffrage', 'Ferraillage', 'Lecture plan'], description: 'Prépare coffrages et armatures pour ouvrages en béton.', salary: 100000 },
    ]
  },
  {
    id: 'dom-commerce', title: 'Commerce', icon: 'ShoppingBag', description: 'Vente, caisse, prospection et gestion de boutique.',
    jobs: [
      { id: 'job-vendeur', title: 'Vendeur / Vendeuse', specialties: ['Boutique', 'Marché'], skills: ['Accueil', 'Vente', 'Conseil'], description: 'Accueille les clients et réalise les ventes.', salary: 60000 },
      { id: 'job-caissier', title: 'Caissier', specialties: ['Supermarché', 'Boutique'], skills: ['Encaissement', 'Caisse', 'Comptage'], description: 'Assure l’encaissement et le suivi de caisse.', salary: 65000 },
      { id: 'job-commercial', title: 'Commercial terrain', specialties: ['Prospection', 'B2B'], skills: ['Prospection', 'Négociation', 'Suivi client'], description: 'Développe un portefeuille clients et partenaires.', salary: 90000 },
    ]
  },
  {
    id: 'dom-transport', title: 'Transport', icon: 'Car', description: 'Conduite, transport de personnes et de marchandises.',
    jobs: [
      { id: 'job-chauffeur', title: 'Chauffeur particulier', specialties: ['Ville', 'Interurbain'], skills: ['Conduite défensive', 'Ponctualité', 'Entretien véhicule'], description: 'Assure le transport sécurisé de personnes.', salary: 85000 },
      { id: 'job-chauffeur-poids-lourd', title: 'Chauffeur poids lourd', specialties: ['Camion', 'Livraison'], skills: ['Conduite PL', 'Chargement', 'Sécurité'], description: 'Transporte des marchandises selon les itinéraires prévus.', salary: 110000 },
    ]
  },
  {
    id: 'dom-logistique', title: 'Logistique', icon: 'Boxes', description: 'Stockage, préparation, livraison et manutention.',
    jobs: [
      { id: 'job-livreur', title: 'Livreur', specialties: ['Moto', 'Voiture'], skills: ['Navigation', 'Livraison', 'Encaissement'], description: 'Livre commandes et colis au client final.', salary: 60000 },
      { id: 'job-coursier', title: 'Coursier', specialties: ['Documents', 'Petits colis'], skills: ['Itinéraire', 'Ponctualité'], description: 'Effectue des courses professionnelles et administratives.', salary: 60000 },
      { id: 'job-manutentionnaire', title: 'Manutentionnaire', specialties: ['Entrepôt', 'Chargement'], skills: ['Port de charges', 'Tri', 'Stockage'], description: 'Manipule, trie et déplace les marchandises.', salary: 55000 },
    ]
  },
  {
    id: 'dom-restauration', title: 'Restauration', icon: 'Utensils', description: 'Cuisine, service, plonge et métiers de salle.',
    jobs: [
      { id: 'job-aide-cuisinier', title: 'Aide-cuisinier', specialties: ['Cuisine africaine', 'Cuisine rapide'], skills: ['Préparation', 'Hygiène', 'Découpe'], description: 'Assiste le cuisinier dans la préparation des repas.', salary: 60000 },
      { id: 'job-cuisinier', title: 'Cuisinier', specialties: ['Restaurant', 'Cuisine familiale'], skills: ['Cuisine', 'Organisation', 'Hygiène'], description: 'Prépare les repas et organise le poste cuisine.', salary: 80000 },
      { id: 'job-plongeur', title: 'Plongeur', specialties: ['Restaurant', 'Hôtellerie'], skills: ['Nettoyage vaisselle', 'Hygiène'], description: 'Assure la plonge et la propreté de l’espace cuisine.', salary: 50000 },
    ]
  },
  {
    id: 'dom-artisanat', title: 'Artisanat', icon: 'Scissors', description: 'Métiers artisanaux et fabrication sur mesure.',
    jobs: [
      { id: 'job-menuisier', title: 'Menuisier', specialties: ['Bois', 'Agencement'], skills: ['Menuiserie', 'Lecture plan', 'Finition'], description: 'Fabrique et pose des ouvrages en bois.', salary: 120000 },
      { id: 'job-soudeur', title: 'Soudeur / Métallier', specialties: ['Portails', 'Charpente'], skills: ['Soudure TIG/MIG', 'Découpe acier'], description: 'Fabrique et assemble des structures métalliques.', salary: 100000 },
      { id: 'job-tapissier', title: 'Tapissier', specialties: ['Mobilier', 'Décoration'], skills: ['Garnissage', 'Tissus', 'Finition'], description: 'Restaure et habille les mobiliers.', salary: 80000 },
    ]
  },
  {
    id: 'dom-couture', title: 'Couture', icon: 'Scissors', description: 'Confection, retouche et stylisme.',
    jobs: [
      { id: 'job-couturier', title: 'Couturier / Couturière', specialties: ['Sur mesure', 'Traditionnel'], skills: ['Coupe', 'Couture machine', 'Finition'], description: 'Confectionne des vêtements sur mesure.', salary: 70000 },
      { id: 'job-retoucheur', title: 'Retoucheur', specialties: ['Retouches', 'Ajustements'], skills: ['Ourlet', 'Ajustement', 'Réparation'], description: 'Réalise les retouches et réparations de vêtements.', salary: 60000 },
    ]
  },
  {
    id: 'dom-beaute', title: 'Beauté', icon: 'Sparkles', description: 'Coiffure, esthétique, soins et beauté.',
    jobs: [
      { id: 'job-coiffeur', title: 'Coiffeur / Coiffeuse', specialties: ['Homme', 'Femme', 'Enfant'], skills: ['Coupe', 'Brushing', 'Tresses'], description: 'Réalise les prestations de coiffure.', salary: 65000 },
      { id: 'job-estheticienne', title: 'Esthéticienne', specialties: ['Soins visage', 'Manucure'], skills: ['Soins', 'Hygiène', 'Beauté'], description: 'Réalise les soins esthétiques et prestations beauté.', salary: 70000 },
    ]
  },
  {
    id: 'dom-securite', title: 'Sécurité', icon: 'Shield', description: 'Gardiennage et protection des personnes et sites.',
    jobs: [
      { id: 'job-gardien', title: 'Gardien', specialties: ['Résidence', 'Commerce'], skills: ['Surveillance', 'Rondes', 'Rapports'], description: 'Assure la surveillance d’un site et le contrôle des accès.', salary: 55000 },
      { id: 'job-agent-securite', title: 'Agent de sécurité', specialties: ['Site privé', 'Événement'], skills: ['Contrôle accès', 'Vigilance', 'Gestion incident'], description: 'Protège les personnes, biens et accès d’un site.', salary: 65000 },
    ]
  },
  {
    id: 'dom-mecanique', title: 'Mécanique', icon: 'Wrench', description: 'Réparation et entretien automobile et moto.',
    jobs: [
      { id: 'job-mecanicien-auto', title: 'Mécanicien automobile', specialties: ['Entretien', 'Diagnostic'], skills: ['Vidange', 'Freinage', 'Diagnostic'], description: 'Entretient et répare les véhicules automobiles.', salary: 90000 },
      { id: 'job-mecanicien-moto', title: 'Mécanicien moto', specialties: ['Scooter', 'Moto'], skills: ['Moteur', 'Transmission', 'Freinage'], description: 'Entretient et répare les motos et scooters.', salary: 70000 },
    ]
  },
  {
    id: 'dom-electricite', title: 'Électricité', icon: 'Zap', description: 'Installations électriques et énergie.',
    jobs: [
      { id: 'job-electricien-batiment', title: 'Électricien bâtiment', specialties: ['Résidentiel', 'Tertiaire'], skills: ['Câblage', 'Tableau électrique', 'Diagnostic'], description: 'Installe, entretient et dépanne les installations électriques.', salary: 110000 },
      { id: 'job-solariste', title: 'Installateur solaire', specialties: ['Solaire domestique', 'Onduleurs'], skills: ['Panneaux', 'Batteries', 'Onduleurs'], description: 'Installe et entretient les systèmes solaires.', salary: 120000 },
    ]
  },
  {
    id: 'dom-plomberie', title: 'Plomberie', icon: 'Droplets', description: 'Installation sanitaire, eau et dépannage.',
    jobs: [
      { id: 'job-plombier', title: 'Plombier', specialties: ['Sanitaire', 'Bâtiment'], skills: ['Tuyauterie', 'Robinetterie', 'Dépannage'], description: 'Installe et dépanne les réseaux d’eau et équipements sanitaires.', salary: 90000 },
      { id: 'job-installateur-sanitaire', title: 'Installateur sanitaire', specialties: ['Salle de bain', 'Cuisine'], skills: ['Pose équipements', 'Étanchéité'], description: 'Pose les équipements sanitaires et raccordements.', salary: 85000 },
    ]
  },
  {
    id: 'dom-education', title: 'Éducation', icon: 'GraduationCap', description: 'Enseignement, accompagnement scolaire et formation.',
    jobs: [
      { id: 'job-enseignant', title: 'Enseignant', specialties: ['Primaire', 'Secondaire'], skills: ['Pédagogie', 'Préparation cours'], description: 'Dispense des cours et accompagne les apprenants.', salary: 100000 },
      { id: 'job-repetiteur', title: 'Répétiteur', specialties: ['Mathématiques', 'Français', 'Sciences'], skills: ['Pédagogie', 'Suivi élève'], description: 'Accompagne individuellement les élèves dans leurs apprentissages.', salary: 60000 },
    ]
  },
  {
    id: 'dom-services-personnes', title: 'Services aux personnes', icon: 'HeartHandshake', description: 'Aide à domicile, garde d’enfants et accompagnement.',
    jobs: [
      { id: 'job-babysitter', title: 'Baby-sitter', specialties: ['Garde enfant', 'Sortie école'], skills: ['Surveillance', 'Ponctualité', 'Sécurité enfant'], description: 'Assure la garde d’enfants au domicile ou après l’école.', salary: 55000 },
      { id: 'job-assistant-domicile', title: 'Aide à domicile', specialties: ['Personnes âgées', 'Accompagnement'], skills: ['Accompagnement', 'Hygiène', 'Courses'], description: 'Accompagne une personne dans les tâches courantes du quotidien.', salary: 70000 },
    ]
  },
  {
    id: 'dom-administration', title: 'Administration', icon: 'FileText', description: 'Accueil, secrétariat, bureautique et gestion courante.',
    jobs: [
      { id: 'job-assistant-admin', title: 'Assistant administratif', specialties: ['Bureau', 'PME'], skills: ['Bureautique', 'Classement', 'Accueil'], description: 'Soutient l’organisation quotidienne d’un bureau ou service.', salary: 90000 },
      { id: 'job-secretaire', title: 'Secrétaire', specialties: ['Accueil', 'Gestion agenda'], skills: ['Bureautique', 'Rédaction', 'Organisation'], description: 'Assure l’accueil, la correspondance et le suivi administratif.', salary: 95000 },
    ]
  },
  {
    id: 'dom-informatique', title: 'Informatique', icon: 'Monitor', description: 'Support, développement, réseaux et services numériques.',
    jobs: [
      { id: 'job-support-it', title: 'Technicien support informatique', specialties: ['Dépannage', 'Réseau local'], skills: ['Windows', 'Réseaux', 'Diagnostic'], description: 'Assure l’assistance et la maintenance informatique.', salary: 120000 },
      { id: 'job-developpeur', title: 'Développeur web', specialties: ['Sites web', 'Applications'], skills: ['HTML/CSS', 'JavaScript', 'Git'], description: 'Conçoit et maintient des sites et applications web.', salary: 180000 },
    ]
  },
  {
    id: 'dom-evenementiel', title: 'Événementiel', icon: 'CalendarDays', description: 'Organisation, décoration, service et animation d’événements.',
    jobs: [
      { id: 'job-decorateur', title: 'Décorateur événementiel', specialties: ['Mariage', 'Cérémonie'], skills: ['Décoration', 'Installation', 'Créativité'], description: 'Prépare et installe les décors d’événements.', salary: 100000 },
      { id: 'job-agent-evenement', title: 'Agent événementiel', specialties: ['Accueil', 'Logistique événement'], skills: ['Accueil', 'Orientation', 'Organisation'], description: 'Soutient l’organisation opérationnelle d’un événement.', salary: 60000 },
    ]
  },
];

export const ACTIVITY_CATALOG: ActivityDomain[] = DOMAIN_SEEDS.map(domain => ({
  id: domain.id,
  title: domain.title,
  shortDescription: domain.description,
  iconName: domain.icon,
  jobs: domain.jobs.map(job => ({
    id: job.id,
    title: job.title,
    domainId: domain.id,
    domainTitle: domain.title,
    specialties: job.specialties,
    skills: job.skills,
    description: job.description,
    defaultMonthlySalaryBenin: job.salary,
  })),
}));

export function getAllJobs(): ActivityJob[] {
  return ACTIVITY_CATALOG.flatMap(domain => domain.jobs);
}

export function searchActivities(query: string): ActivityJob[] {
  const all = getAllJobs();
  if (!query || query.trim().length === 0) return all.slice(0, 15);
  const clean = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  return all.filter(job => {
    const values = [job.title, job.domainTitle, ...job.specialties, ...job.skills];
    return values.some(value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(clean));
  });
}

export const ACTIVITY_DOMAINS = ACTIVITY_CATALOG;
