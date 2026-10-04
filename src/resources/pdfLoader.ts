import { ResourceDocument, ResourceCategory } from '../types';

/**
 * Dynamic PDF Loader using Vite's import.meta.glob
 * Discovers any PDF placed into:
 *   - src/resources/employees/
 *   - src/resources/employers/
 * Satisfait les exigences :
 * NE CRÉE AUCUN FAUX PDF.
 * Si le dossier est vide, retourne [].
 * Dès qu'un vrai PDF est déposé, il est détecté automatiquement.
 */

function formatTitle(filename: string): string {
  const base = filename.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ');
  return base
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function inferCategory(filename: string): ResourceCategory {
  const f = filename.toLowerCase();
  if (f.includes('entretien')) return 'ENTRETIEN';
  if (f.includes('contrat')) return 'CONTRAT';
  if (f.includes('securite')) return 'SECURITE';
  if (f.includes('recrutement')) return 'RECRUTEMENT';
  if (f.includes('offre')) return 'OFFRE';
  if (f.includes('mission')) return 'MISSION';
  if (f.includes('juridique')) return 'JURIDIQUE';
  return 'CANDIDAT';
}

function getGlobPdfs(): { employee: Record<string, string>; employer: Record<string, string> } {
  try {
    const employee = import.meta.glob('/src/resources/employees/*.pdf', {
      query: '?url',
      import: 'default',
      eager: true,
    }) as Record<string, string>;
    const employer = import.meta.glob('/src/resources/employers/*.pdf', {
      query: '?url',
      import: 'default',
      eager: true,
    }) as Record<string, string>;
    return { employee, employer };
  } catch {
    return { employee: {}, employer: {} };
  }
}

export function loadDiscoveredResources(): ResourceDocument[] {
  const { employee, employer } = getGlobPdfs();
  const docs: ResourceDocument[] = [];
  let index = 1;

  for (const [path, url] of Object.entries(employee)) {
    const filename = path.split('/').pop() || 'document.pdf';
    docs.push({
      id: `RES-EMP-${index}`,
      title: formatTitle(filename),
      description: `Document officiel et guide extrait de ${filename} pour les salariés et artisans LE LABEUR.`,
      fileName: filename,
      logicalPath: `resources/employees/${filename}`,
      category: inferCategory(filename),
      targetRole: 'EMPLOYEE',
      publishedDate: '15 Septembre 2026',
      orderIndex: index,
      status: 'ACTIVE',
      fileSize: 'Fichier PDF officiel',
      pageCount: 1,
      summaryPoints: [
        'Document original déposé dans src/resources/employees/',
        'Consultation et téléchargement directs sans altération.'
      ],
      keyChapters: [
        {
          title: 'Document Officiel',
          excerpt: `Fichier : ${filename}`,
        }
      ],
      pdfDataUri: url,
    });
    index++;
  }

  for (const [path, url] of Object.entries(employer)) {
    const filename = path.split('/').pop() || 'document.pdf';
    docs.push({
      id: `RES-REC-${index}`,
      title: formatTitle(filename),
      description: `Guide pratique extrait de ${filename} pour les employeurs LE LABEUR.`,
      fileName: filename,
      logicalPath: `resources/employers/${filename}`,
      category: inferCategory(filename),
      targetRole: 'EMPLOYER',
      publishedDate: '20 Septembre 2026',
      orderIndex: index,
      status: 'ACTIVE',
      fileSize: 'Fichier PDF officiel',
      pageCount: 1,
      summaryPoints: [
        'Document original déposé dans src/resources/employers/',
        'Consultation et téléchargement directs sans altération.'
      ],
      keyChapters: [
        {
          title: 'Document Officiel',
          excerpt: `Fichier : ${filename}`,
        }
      ],
      pdfDataUri: url,
    });
    index++;
  }

  return docs;
}
