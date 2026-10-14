/** PRE —— contrat de props commun à tous les écrans d'unité. */

export interface PrestataireUnitProps {
  /** Unité de production livrée (PRE-xx). */
  readonly unitId: string;
  /** Chemin technique réel (namespace /prestataire du routeur P0, jamais renommé). */
  readonly pathname: string;
  /** Segments après le préfixe de namespace. */
  readonly segments: readonly string[];
  /** Paramètres extraits du motif de route réel (`:id`, `:v`, `:aid`). */
  readonly params: Readonly<Record<string, string>>;
}
