/** RTC —— contrat de props commun à tous les écrans d'unité. */

export interface RtcUnitProps {
  /** Unité de production livrée (RTC-01, RTC-02, RTC-04, RTC-05, RTC-08). */
  readonly unitId: string;
  /** Chemin technique réel (namespace /appel du routeur P0, jamais renommé). */
  readonly pathname: string;
  /** Segments après le préfixe de namespace. */
  readonly segments: readonly string[];
  /** Paramètres extraits du motif de route réel (`:id`). */
  readonly params: Readonly<Record<string, string>>;
}
