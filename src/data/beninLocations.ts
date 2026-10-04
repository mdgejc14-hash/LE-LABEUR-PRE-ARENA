/**
 * Référentiel géographique LE LABEUR — structure de données et sélecteurs.
 * Sources de référence :
 * - Ministère de la Décentralisation et de la Gouvernance Locale
 * - Institut National de la Statistique et de la Démographie (INStaD)
 * - Nomenclatures officielles et cahiers des villages et quartiers de ville
 *
 * Hiérarchie :
 * CIBLE NATIONALE : 12 départements -> 77 communes -> 546 arrondissements -> 5 295 villages/quartiers.
 * IMPORTANT : le fichier embarqué doit être considéré comme complet uniquement si les
 * compteurs ci-dessous atteignent ces objectifs. Tant qu'ils ne les atteignent pas,
 * l'interface ne doit pas présenter cette source comme un référentiel national complet.
 */

export interface BeninLocality {
  id: string;
  name: string;
  type: 'QUARTIER' | 'VILLAGE';
}

export interface BeninArrondissement {
  id: string;
  name: string;
  communeId: string;
  departmentId: string;
  localities: BeninLocality[];
}

export interface BeninCommune {
  id: string;
  name: string;
  departmentId: string;
  arrondissements: BeninArrondissement[];
}

export interface BeninDepartment {
  id: string;
  name: string;
  chefLieu: string;
  communes: BeninCommune[];
}

export interface LocationSearchResult {
  id: string;
  localityName?: string;
  arrondissementName?: string;
  communeName: string;
  departmentName: string;
  departmentId: string;
  communeId: string;
  arrondissementId?: string;
  localityId?: string;
  formattedLabel: string;
  type: 'DEPARTMENT' | 'COMMUNE' | 'ARRONDISSEMENT' | 'LOCALITY';
}

const EMBEDDED_BENIN_DEPARTMENTS: BeninDepartment[] = [
  // 1. LITTORAL (Cotonou)
  {
    id: 'dept-littoral',
    name: 'Littoral',
    chefLieu: 'Cotonou',
    communes: [
      {
        id: 'com-cotonou',
        name: 'Cotonou',
        departmentId: 'dept-littoral',
        arrondissements: [
          {
            id: 'arr-cotonou-1',
            name: '1er Arrondissement',
            communeId: 'com-cotonou',
            departmentId: 'dept-littoral',
            localities: [
              { id: 'loc-dandji', name: 'Dandji', type: 'QUARTIER' },
              { id: 'loc-donaten', name: 'Donaten', type: 'QUARTIER' },
              { id: 'loc-finagnon', name: 'Finagnon', type: 'QUARTIER' },
              { id: 'loc-tokplegbe', name: 'Tokplégbé', type: 'QUARTIER' },
              { id: 'loc-suru-lere', name: 'Suru-Léré', type: 'QUARTIER' },
              { id: 'loc-avotrou', name: 'Avotrou', type: 'QUARTIER' }
            ]
          },
          {
            id: 'arr-cotonou-2',
            name: '2e Arrondissement',
            communeId: 'com-cotonou',
            departmentId: 'dept-littoral',
            localities: [
              { id: 'loc-irede', name: 'Irédé', type: 'QUARTIER' },
              { id: 'loc-kpondehou', name: 'Kpondéhou', type: 'QUARTIER' },
              { id: 'loc-senade', name: 'Sénadé', type: 'QUARTIER' },
              { id: 'loc-lom-nava', name: 'Lom-Nava', type: 'QUARTIER' }
            ]
          },
          {
            id: 'arr-cotonou-3',
            name: '3e Arrondissement',
            communeId: 'com-cotonou',
            departmentId: 'dept-littoral',
            localities: [
              { id: 'loc-adoglata', name: 'Adogleta', type: 'QUARTIER' },
              { id: 'loc-agbato', name: 'Agbato', type: 'QUARTIER' },
              { id: 'loc-agbodjedo', name: 'Agbodjèdo', type: 'QUARTIER' },
              { id: 'loc-akpakpa-dodome', name: 'Akpakpa Dodomè', type: 'QUARTIER' },
              { id: 'loc-enagnon', name: 'Enagnon', type: 'QUARTIER' },
              { id: 'loc-kpankpan', name: 'Kpankpan', type: 'QUARTIER' },
              { id: 'loc-midombo', name: 'Midombo', type: 'QUARTIER' },
              { id: 'loc-segbeva', name: 'Ségbéya', type: 'QUARTIER' }
            ]
          },
          {
            id: 'arr-cotonou-4',
            name: '4e Arrondissement',
            communeId: 'com-cotonou',
            departmentId: 'dept-littoral',
            localities: [
              { id: 'loc-gbegheyin', name: 'Gbedjromèdé', type: 'QUARTIER' },
              { id: 'loc-fifadji', name: 'Fifadji', type: 'QUARTIER' },
              { id: 'loc-abokicodji', name: 'Abokicodji', type: 'QUARTIER' },
              { id: 'loc-ohlanssou', name: 'Ohlanssou', type: 'QUARTIER' }
            ]
          },
          {
            id: 'arr-cotonou-5',
            name: '5e Arrondissement',
            communeId: 'com-cotonou',
            departmentId: 'dept-littoral',
            localities: [
              { id: 'loc-becou', name: 'Bécou', type: 'QUARTIER' },
              { id: 'loc-chateau-eau', name: "Château d'eau", type: 'QUARTIER' },
              { id: 'loc-djidje', name: 'Djidjè', type: 'QUARTIER' },
              { id: 'loc-gbenan', name: 'Gbénan', type: 'QUARTIER' },
              { id: 'loc-zokpa', name: 'Zongo Nima', type: 'QUARTIER' }
            ]
          },
          {
            id: 'arr-cotonou-6',
            name: '6e Arrondissement',
            communeId: 'com-cotonou',
            departmentId: 'dept-littoral',
            localities: [
              { id: 'loc-aidjedo', name: 'Aïdjèdo', type: 'QUARTIER' },
              { id: 'loc-ahouansori', name: 'Ahouansori Agata', type: 'QUARTIER' },
              { id: 'loc-ahouansori-toweta', name: 'Ahouansori Towéta', type: 'QUARTIER' },
              { id: 'loc-ladji', name: 'Ladji', type: 'QUARTIER' },
              { id: 'loc-vedoko', name: 'Vèdoko', type: 'QUARTIER' }
            ]
          },
          {
            id: 'arr-cotonou-7',
            name: '7e Arrondissement',
            communeId: 'com-cotonou',
            departmentId: 'dept-littoral',
            localities: [
              { id: 'loc-dagbedji', name: 'Dagbédji', type: 'QUARTIER' },
              { id: 'loc-enagnon-7', name: 'Enagnon', type: 'QUARTIER' },
              { id: 'loc-gbegamey', name: 'Gbégamey', type: 'QUARTIER' },
              { id: 'loc-missite', name: 'Missité', type: 'QUARTIER' },
              { id: 'loc-saint-jean', name: 'Saint Jean', type: 'QUARTIER' },
              { id: 'loc-sedjro', name: 'Sèdjro', type: 'QUARTIER' }
            ]
          },
          {
            id: 'arr-cotonou-8',
            name: '8e Arrondissement',
            communeId: 'com-cotonou',
            departmentId: 'dept-littoral',
            localities: [
              { id: 'loc-agontinkon', name: 'Agontinkon', type: 'QUARTIER' },
              { id: 'loc-houenoussou', name: 'Houénoussou', type: 'QUARTIER' },
              { id: 'loc-mededjro', name: 'Mèdèdjro', type: 'QUARTIER' },
              { id: 'loc-minontin', name: 'Ménontin', type: 'QUARTIER' },
              { id: 'loc-sainte-rita', name: 'Sainte Rita', type: 'QUARTIER' }
            ]
          },
          {
            id: 'arr-cotonou-9',
            name: '9e Arrondissement',
            communeId: 'com-cotonou',
            departmentId: 'dept-littoral',
            localities: [
              { id: 'loc-fifadji-9', name: 'Fifadji Ouest', type: 'QUARTIER' },
              { id: 'loc-kouhounou', name: 'Kouhounou', type: 'QUARTIER' },
              { id: 'loc-vossa', name: 'Vossa', type: 'QUARTIER' },
              { id: 'loc-zogbo', name: 'Zogbo', type: 'QUARTIER' },
              { id: 'loc-zogbohoue', name: 'Zogbohouè', type: 'QUARTIER' }
            ]
          },
          {
            id: 'arr-cotonou-10',
            name: '10e Arrondissement',
            communeId: 'com-cotonou',
            departmentId: 'dept-littoral',
            localities: [
              { id: 'loc-midombo-10', name: 'Midombo', type: 'QUARTIER' },
              { id: 'loc-missogbe', name: 'Missogbé', type: 'QUARTIER' },
              { id: 'loc-yenaoua', name: 'Yénawa', type: 'QUARTIER' }
            ]
          },
          {
            id: 'arr-cotonou-11',
            name: '11e Arrondissement',
            communeId: 'com-cotonou',
            departmentId: 'dept-littoral',
            localities: [
              { id: 'loc-albarika-cot', name: 'Albarika', type: 'QUARTIER' },
              { id: 'loc-gbediga', name: 'Gbédiga', type: 'QUARTIER' },
              { id: 'loc-houeyiho', name: 'Houéyiho', type: 'QUARTIER' },
              { id: 'loc-vodje-centre', name: 'Vodjè Centre', type: 'QUARTIER' },
              { id: 'loc-vodje-rail', name: 'Vodjè Rail', type: 'QUARTIER' }
            ]
          },
          {
            id: 'arr-cotonou-12',
            name: '12e Arrondissement',
            communeId: 'com-cotonou',
            departmentId: 'dept-littoral',
            localities: [
              { id: 'loc-cadjehoun-kpota', name: 'Cadjèhoun Kpota', type: 'QUARTIER' },
              { id: 'loc-cadjehoun-chateau', name: 'Cadjèhoun Gare', type: 'QUARTIER' },
              { id: 'loc-haie-vive', name: 'Haie Vive', type: 'QUARTIER' },
              { id: 'loc-les-cocotiers', name: 'Les Cocotiers', type: 'QUARTIER' },
              { id: 'loc-patte-oie', name: "Patte d'Oie", type: 'QUARTIER' },
              { id: 'loc-fidjrosse-kpota', name: 'Fidjrossè Kpota', type: 'QUARTIER' },
              { id: 'loc-fidjrosse-centre', name: 'Fidjrossè Centre', type: 'QUARTIER' },
              { id: 'loc-fidjrosse-plage', name: 'Fidjrossè Plage', type: 'QUARTIER' }
            ]
          },
          {
            id: 'arr-cotonou-13',
            name: '13e Arrondissement',
            communeId: 'com-cotonou',
            departmentId: 'dept-littoral',
            localities: [
              { id: 'loc-agla-centre', name: 'Agla Centre', type: 'QUARTIER' },
              { id: 'loc-agla-figaro', name: 'Agla Figaro', type: 'QUARTIER' },
              { id: 'loc-agla-les-pylones', name: 'Agla Les Pylônes', type: 'QUARTIER' },
              { id: 'loc-ahogbohoue', name: 'Ahogbohouè', type: 'QUARTIER' },
              { id: 'loc-missite-13', name: 'Missité', type: 'QUARTIER' }
            ]
          }
        ]
      }
    ]
  },
  // 2. ATLANTIQUE
  {
    id: 'dept-atlantique',
    name: 'Atlantique',
    chefLieu: 'Allada',
    communes: [
      {
        id: 'com-abomey-calavi',
        name: 'Abomey-Calavi',
        departmentId: 'dept-atlantique',
        arrondissements: [
          {
            id: 'arr-calavi-centre',
            name: 'Calavi Centre',
            communeId: 'com-abomey-calavi',
            departmentId: 'dept-atlantique',
            localities: [
              { id: 'loc-arconville', name: 'Arconville', type: 'QUARTIER' },
              { id: 'loc-zogbadje', name: 'Zogbadjè', type: 'QUARTIER' },
              { id: 'loc-bidossessi', name: 'Bidossèssi', type: 'QUARTIER' },
              { id: 'loc-kpota-calavi', name: 'Kpota', type: 'QUARTIER' }
            ]
          },
          {
            id: 'arr-godomey',
            name: 'Godomey',
            communeId: 'com-abomey-calavi',
            departmentId: 'dept-atlantique',
            localities: [
              { id: 'loc-godomey-togoudo', name: 'Togoudo', type: 'QUARTIER' },
              { id: 'loc-salento', name: 'Salento', type: 'QUARTIER' },
              { id: 'loc-dekounge', name: 'Dékoungbé', type: 'QUARTIER' },
              { id: 'loc-maria-gleta', name: 'Maria-Gléta', type: 'QUARTIER' },
              { id: 'loc-cocotomey', name: 'Cocotomey', type: 'QUARTIER' },
              { id: 'loc-womey', name: 'Womey', type: 'QUARTIER' }
            ]
          },
          {
            id: 'arr-akassato',
            name: 'Akassato',
            communeId: 'com-abomey-calavi',
            departmentId: 'dept-atlantique',
            localities: [
              { id: 'loc-akassato-centre', name: 'Akassato Centre', type: 'QUARTIER' },
              { id: 'loc-missessinto', name: 'Missèssinto', type: 'VILLAGE' },
              { id: 'loc-adjagbo', name: 'Adjagbo', type: 'VILLAGE' }
            ]
          },
          {
            id: 'arr-glo-djigbe',
            name: 'Glo-Djigbé',
            communeId: 'com-abomey-calavi',
            departmentId: 'dept-atlantique',
            localities: [
              { id: 'loc-gdiz', name: 'Zone Industrielle GDIZ', type: 'QUARTIER' },
              { id: 'loc-glo-centre', name: 'Glo Centre', type: 'VILLAGE' }
            ]
          },
          {
            id: 'arr-togba',
            name: 'Togba',
            communeId: 'com-abomey-calavi',
            departmentId: 'dept-atlantique',
            localities: [
              { id: 'loc-tankpe', name: 'Tankpé', type: 'QUARTIER' },
              { id: 'loc-houekanme', name: 'Houèkanmè', type: 'QUARTIER' }
            ]
          }
        ]
      },
      {
        id: 'com-ouidah',
        name: 'Ouidah',
        departmentId: 'dept-atlantique',
        arrondissements: [
          {
            id: 'arr-ouidah-1',
            name: 'Ouidah I (Centre Historique)',
            communeId: 'com-ouidah',
            departmentId: 'dept-atlantique',
            localities: [
              { id: 'loc-maro', name: 'Maro', type: 'QUARTIER' }
            ]
          },
          {
            id: 'arr-pahou',
            name: 'Pahou',
            communeId: 'com-ouidah',
            departmentId: 'dept-atlantique',
            localities: [
              { id: 'loc-pahou-centre', name: 'Pahou Centre', type: 'QUARTIER' }
            ]
          }
        ]
      }
    ]
  },
  // 3. OUÉMÉ
  {
    id: 'dept-oueme',
    name: 'Ouémé',
    chefLieu: 'Porto-Novo',
    communes: [
      {
        id: 'com-porto-novo',
        name: 'Porto-Novo',
        departmentId: 'dept-oueme',
        arrondissements: [
          {
            id: 'arr-pn-1',
            name: '1er Arrondissement',
            communeId: 'com-porto-novo',
            departmentId: 'dept-oueme',
            localities: [
              { id: 'loc-attake', name: 'Attakè', type: 'QUARTIER' }
            ]
          },
          {
            id: 'arr-pn-4',
            name: '4e Arrondissement',
            communeId: 'com-porto-novo',
            departmentId: 'dept-oueme',
            localities: [
              { id: 'loc-ouando', name: 'Ouando', type: 'QUARTIER' },
              { id: 'loc-dowa', name: 'Dowa', type: 'QUARTIER' }
            ]
          }
        ]
      }
    ]
  },
  // 4. BORGOU
  {
    id: 'dept-borgou',
    name: 'Borgou',
    chefLieu: 'Parakou',
    communes: [
      {
        id: 'com-parakou',
        name: 'Parakou',
        departmentId: 'dept-borgou',
        arrondissements: [
          {
            id: 'arr-parakou-1',
            name: '1er Arrondissement',
            communeId: 'com-parakou',
            departmentId: 'dept-borgou',
            localities: [
              { id: 'loc-titirou', name: 'Titirou', type: 'QUARTIER' },
              { id: 'loc-albarika-prk', name: 'Albarika', type: 'QUARTIER' }
            ]
          }
        ]
      }
    ]
  },
  // 5. ZOU
  {
    id: 'dept-zou',
    name: 'Zou',
    chefLieu: 'Abomey',
    communes: [
      {
        id: 'com-bohicon',
        name: 'Bohicon',
        departmentId: 'dept-zou',
        arrondissements: [
          {
            id: 'arr-bohicon-1',
            name: 'Bohicon I',
            communeId: 'com-bohicon',
            departmentId: 'dept-zou',
            localities: [
              { id: 'loc-bohicon-gare', name: 'Gare Marchande', type: 'QUARTIER' }
            ]
          }
        ]
      }
    ]
  }
];


/**
 * Complément structurel du référentiel national.
 *
 * Cette couche ajoute les 7 départements et les communes manquantes dans la
 * base actuelle, sans inventer leurs arrondissements ou villages/quartiers.
 * Les données détaillées déjà présentes sont conservées intactes.
 *
 * Source de cadrage : référentiel administratif national (MDGL / INStaD / IGN).
 */
const BENIN_NATIONAL_STRUCTURE: Record<string, {
  name: string;
  chefLieu: string;
  communes: string[];
}> = {
  'dept-alibori': {
    name: 'Alibori',
    chefLieu: 'Kandi',
    communes: ['Banikoara', 'Gogounou', 'Kandi', 'Karimama', 'Malanville', 'Ségbana'],
  },
  'dept-atacora': {
    name: 'Atacora',
    chefLieu: 'Natitingou',
    communes: ['Boukoumbé', 'Cobly', 'Kérou', 'Kouandé', 'Matéri', 'Natitingou', 'Ouassa-Péhunco', 'Tanguiéta', 'Toucountouna'],
  },
  'dept-atlantique': {
    name: 'Atlantique',
    chefLieu: 'Allada',
    communes: ['Abomey-Calavi', 'Allada', 'Kpomassè', 'Ouidah', 'So-Ava', 'Toffo', 'Tori-Bossito', 'Zè'],
  },
  'dept-borgou': {
    name: 'Borgou',
    chefLieu: 'Parakou',
    communes: ['Bembèrèkè', 'Kalalé', "N'Dali", 'Nikki', 'Parakou', 'Pèrèrè', 'Sinendé', 'Tchaourou'],
  },
  'dept-collines': {
    name: 'Collines',
    chefLieu: 'Dassa-Zoumè',
    communes: ['Bantè', 'Dassa-Zoumè', 'Glazoué', 'Ouèssè', 'Savalou', 'Savè'],
  },
  'dept-couffo': {
    name: 'Couffo',
    chefLieu: 'Aplahoué',
    communes: ['Aplahoué', 'Djakotomey', 'Dogbo', 'Klouékanmè', 'Lalo', 'Toviklin'],
  },
  'dept-donga': {
    name: 'Donga',
    chefLieu: 'Djougou',
    communes: ['Bassila', 'Copargo', 'Djougou', 'Ouaké'],
  },
  'dept-littoral': {
    name: 'Littoral',
    chefLieu: 'Cotonou',
    communes: ['Cotonou'],
  },
  'dept-mono': {
    name: 'Mono',
    chefLieu: 'Lokossa',
    communes: ['Athiémé', 'Bopa', 'Comè', 'Grand-Popo', 'Houéyogbé', 'Lokossa'],
  },
  'dept-oueme': {
    name: 'Ouémé',
    chefLieu: 'Porto-Novo',
    communes: ['Adjarra', 'Adjohoun', 'Aguégués', 'Akpro-Missérété', 'Avrankou', 'Bonou', 'Dangbo', 'Porto-Novo', 'Sèmè-Podji'],
  },
  'dept-plateau': {
    name: 'Plateau',
    chefLieu: 'Pobè',
    communes: ['Adja-Ouèrè', 'Ifangni', 'Kétou', 'Pobè', 'Sakété'],
  },
  'dept-zou': {
    name: 'Zou',
    chefLieu: 'Abomey',
    communes: ['Abomey', 'Agbangnizoun', 'Bohicon', 'Covè', 'Djidja', 'Ouinhi', 'Za-Kpota', 'Zagnanado', 'Zogbodomey'],
  },
};

function makeCommuneId(name: string): string {
  return `com-${name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}`;
}

function mergeNationalBeninStructure(): BeninDepartment[] {
  const byId = new Map<string, BeninDepartment>(
    EMBEDDED_BENIN_DEPARTMENTS.map((department) => [
      department.id,
      {
        ...department,
        communes: [...department.communes],
      },
    ]),
  );

  for (const [departmentId, meta] of Object.entries(BENIN_NATIONAL_STRUCTURE)) {
    let department = byId.get(departmentId);

    if (!department) {
      department = {
        id: departmentId,
        name: meta.name,
        chefLieu: meta.chefLieu,
        communes: [],
      };
      byId.set(departmentId, department);
    }

    const existingCommuneIds = new Set(department.communes.map((commune) => commune.id));

    for (const communeName of meta.communes) {
      const communeId = makeCommuneId(communeName);

      if (existingCommuneIds.has(communeId)) continue;

      department.communes.push({
        id: communeId,
        name: communeName,
        departmentId,
        arrondissements: [],
      });
    }

    department.communes.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export const BENIN_DEPARTMENTS: BeninDepartment[] = mergeNationalBeninStructure();

export const BENIN_LOCATION_TARGETS = {
  departments: 12,
  communes: 77,
  arrondissements: 546,
  localities: 5295
} as const;

export interface BeninLocationCoverage {
  departments: number;
  communes: number;
  arrondissements: number;
  localities: number;
  targets: typeof BENIN_LOCATION_TARGETS;
  isComplete: boolean;
}

export function getBeninLocationCoverage(): BeninLocationCoverage {
  const departments = BENIN_DEPARTMENTS.length;
  const communes = BENIN_DEPARTMENTS.reduce((n, d) => n + d.communes.length, 0);
  const arrondissements = BENIN_DEPARTMENTS.reduce((n, d) => n + d.communes.reduce((m, c) => m + c.arrondissements.length, 0), 0);
  const localities = BENIN_DEPARTMENTS.reduce((n, d) => n + d.communes.reduce((m, c) => m + c.arrondissements.reduce((k, a) => k + a.localities.length, 0), 0), 0);

  const isComplete =
    departments === BENIN_LOCATION_TARGETS.departments &&
    communes === BENIN_LOCATION_TARGETS.communes &&
    arrondissements === BENIN_LOCATION_TARGETS.arrondissements &&
    localities === BENIN_LOCATION_TARGETS.localities;

  return { departments, communes, arrondissements, localities, targets: BENIN_LOCATION_TARGETS, isComplete };
}

export function searchBeninLocations(query: string, maxResults = 20): LocationSearchResult[] {
  const clean = query.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!clean) return [];

  const results: Array<LocationSearchResult & { score: number }> = [];
  const add = (item: LocationSearchResult, score: number) => results.push({ ...item, score });
  const matches = (value: string) => {
    const normalized = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (normalized === clean) return 100;
    if (normalized.startsWith(clean)) return 80;
    if (normalized.includes(clean)) return 60;
    return 0;
  };

  for (const department of BENIN_DEPARTMENTS) {
    const depScore = matches(department.name);
    if (depScore) {
      add({ id: department.id, departmentName: department.name, departmentId: department.id, communeName: '', communeId: '', formattedLabel: department.name, type: 'DEPARTMENT' }, depScore);
    }
    for (const commune of department.communes) {
      const communeScore = matches(commune.name);
      if (communeScore) {
        add({ id: commune.id, communeName: commune.name, departmentName: department.name, departmentId: department.id, communeId: commune.id, formattedLabel: `${commune.name}, ${department.name}`, type: 'COMMUNE' }, communeScore);
      }
      for (const arrondissement of commune.arrondissements) {
        const arrondissementScore = matches(arrondissement.name);
        if (arrondissementScore) {
          add({ id: arrondissement.id, arrondissementName: arrondissement.name, communeName: commune.name, departmentName: department.name, departmentId: department.id, communeId: commune.id, arrondissementId: arrondissement.id, formattedLabel: `${arrondissement.name}, ${commune.name} (${department.name})`, type: 'ARRONDISSEMENT' }, arrondissementScore);
        }
        for (const locality of arrondissement.localities) {
          const localityScore = matches(locality.name);
          if (localityScore) {
            add({ id: locality.id, localityName: locality.name, arrondissementName: arrondissement.name, communeName: commune.name, departmentName: department.name, departmentId: department.id, communeId: commune.id, arrondissementId: arrondissement.id, localityId: locality.id, formattedLabel: `${locality.name}, ${arrondissement.name}, ${commune.name} (${department.name})`, type: 'LOCALITY' }, localityScore);
          }
        }
      }
    }
  }

  return results
    .sort((a, b) => b.score - a.score || a.formattedLabel.localeCompare(b.formattedLabel, 'fr'))
    .slice(0, maxResults)
    .map(({ score, ...item }) => item);
}

export function getBeninDepartments(): { id: string; name: string }[] {
  return BENIN_DEPARTMENTS.map(d => ({ id: d.id, name: d.name }));
}

export function getCommunesByDepartment(departmentId: string): { id: string; name: string }[] {
  const dept = BENIN_DEPARTMENTS.find(d => d.id === departmentId);
  return dept ? dept.communes.map(c => ({ id: c.id, name: c.name })) : [];
}

export function getArrondissementsByCommune(communeId: string): { id: string; name: string }[] {
  for (const dept of BENIN_DEPARTMENTS) {
    const com = dept.communes.find(c => c.id === communeId);
    if (com) {
      return com.arrondissements.map(a => ({ id: a.id, name: a.name }));
    }
  }
  return [];
}

export function getLocalitiesByArrondissement(arrondissementId: string): BeninLocality[] {
  for (const dept of BENIN_DEPARTMENTS) {
    for (const com of dept.communes) {
      const arr = com.arrondissements.find(a => a.id === arrondissementId);
      if (arr) {
        return arr.localities;
      }
    }
  }
  return [];
}

export function formatHierarchyLabel(
  departmentName?: string,
  communeName?: string,
  arrondissementName?: string,
  localityName?: string
): string {
  const parts: string[] = [];
  if (localityName) parts.push(localityName);
  if (arrondissementName && !localityName) parts.push(arrondissementName);
  if (communeName) parts.push(communeName);
  if (departmentName) parts.push(`(${departmentName})`);
  return parts.join(', ');
}
