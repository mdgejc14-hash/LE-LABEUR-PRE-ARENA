/**
 * Navigation des shells (P0-DESIGN-FOUNDATION).
 *
 * Libellés et glyphes : CHROME_BY_FAMILY généré depuis design/llab (model.py, content/*.py).
 * Chemins : routes réelles des fiches (EMP/PRE/ADM). Les icônes sont des choix
 * d'implémentation (lucide-react, déjà présent). Le test de fondation vérifie que
 * chaque libellé est celui de la source et que chaque chemin est une route de fiche.
 */

import {
  Activity,
  Banknote,
  Briefcase,
  ClipboardList,
  FileSignature,
  Home,
  ListOrdered,
  Scale,
  Server,
  ShieldCheck,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { CHROME_BY_FAMILY, FAMILY_ORDER } from '../generated/chrome';
import type { DockItem } from '../components/BottomDock';

export type FamilyCode = (typeof FAMILY_ORDER)[number];

interface DockDefinition {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  /** Route de fiche la plus proche (documentée dans docs/P0-DESIGN-FOUNDATION.md). */
  readonly ficheRoute: string;
}

export const DOCK_DEFINITIONS: Readonly<Record<'EMP' | 'PRE' | 'ADM', readonly DockDefinition[]>> = {
  EMP: [
    { label: 'Accueil', href: '/client', icon: Home, ficheRoute: '/client' },
    { label: 'Missions', href: '/client/missions', icon: Briefcase, ficheRoute: '/client/missions' },
    { label: 'Contrats', href: '/client/contrats', icon: FileSignature, ficheRoute: '/client/contrats' },
    { label: 'Argent', href: '/client/paiements', icon: Wallet, ficheRoute: '/client/paiements' },
    { label: 'Profil', href: '/client/profil', icon: UserRound, ficheRoute: '/client/profil' },
  ],
  PRE: [
    { label: 'Accueil', href: '/prestataire', icon: Home, ficheRoute: '/prestataire' },
    { label: 'Missions', href: '/prestataire/missions', icon: Briefcase, ficheRoute: '/prestataire/missions' },
    { label: 'Candidatures', href: '/prestataire/candidatures', icon: ClipboardList, ficheRoute: '/prestataire/candidatures' },
    { label: 'Salaire', href: '/prestataire/salaire', icon: Banknote, ficheRoute: '/prestataire/salaire' },
    { label: 'Profil', href: '/prestataire/profil', icon: UserRound, ficheRoute: '/prestataire/profil' },
  ],
  ADM: [
    // « Flux » : rattachement au tableau de bord de supervision (ADM-01), à confirmer par le design.
    { label: 'Flux', href: '/admin', icon: Activity, ficheRoute: '/admin' },
    { label: 'Files', href: '/admin/ops/queues', icon: ListOrdered, ficheRoute: '/admin/ops/queues' },
    { label: 'Litiges', href: '/admin/litiges', icon: Scale, ficheRoute: '/admin/litiges' },
    { label: 'Sécu', href: '/admin/securite', icon: ShieldCheck, ficheRoute: '/admin/securite' },
    { label: 'Infra', href: '/admin/infra', icon: Server, ficheRoute: '/admin/infra' },
  ],
};

/** Entrées de dock prêtes à l'emploi pour une famille (libellés de la source). */
export function dockItemsFor(family: 'EMP' | 'PRE' | 'ADM'): readonly DockItem[] {
  return DOCK_DEFINITIONS[family].map((def) => ({ id: def.href, label: def.label, href: def.href, icon: def.icon }));
}

/** Chrome généré d'une famille : titre d'appbar, glyphe, libellés du dock. */
export function chromeFor(family: FamilyCode) {
  return CHROME_BY_FAMILY[family];
}
