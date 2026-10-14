/** ADM —— contrat de props commun à tous les écrans d'unité. */

export interface AdminUnitProps {
  /** Unité de production livrée (ADM-xx). */
  readonly unitId: string;
  /** Chemin technique réel (namespace /admin du routeur P0, jamais renommé). */
  readonly pathname: string;
  /** Segments après le préfixe de namespace. */
  readonly segments: readonly string[];
  /** Paramètres extraits du motif de route réel (`:id`). */
  readonly params: Readonly<Record<string, string>>;
}
