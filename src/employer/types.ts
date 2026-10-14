/** EMP —— contrat de props commun à tous les écrans d'unité. */

export interface EmployerUnitProps {
  /** Unité de production livrée (EMP-xx). */
  readonly unitId: string;
  /** Chemin technique réel (namespace /client du routeur P0, jamais renommé). */
  readonly pathname: string;
  /** Segments après le préfixe de namespace. */
  readonly segments: readonly string[];
  /** Paramètres extraits du motif de route réel (`:id`, `:v`). */
  readonly params: Readonly<Record<string, string>>;
}
