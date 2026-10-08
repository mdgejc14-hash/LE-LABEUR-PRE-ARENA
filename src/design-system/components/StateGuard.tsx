/**
 * C-19 StateGuard (Web) — gabarit unique des états système (SYS-01 → SYS-15).
 *
 * Tout le texte visible provient du catalogue GÉNÉRÉ depuis design/llab/content/sys.py :
 * titre, explication factuelle, actions de sortie, nom de la liste de garanties.
 * Aucune phrase n'est saisie à la main, sauf les libellés de repli signalés ci-dessous.
 *
 * Éléments : glyphe (sceau C-04) → titre → explication → garanties (uniquement si le
 * serveur les a vérifiées) → code de corrélation copiable (uniquement s'il est sûr) →
 * actions de sortie (une seule action pleine : « or » de la fiche).
 *
 * Libellés de repli (NON définis dans sys.py) :
 *  - « Revenir » : sortie de l'état « chargement » (SYS-01 : écran annulable) ;
 *  - « Heure de reprise non communiquée. » : maintenance sans heure fournie ;
 *  - « Copier » : action de copie du code de corrélation.
 * Glyphes provisoires (sys.py ne décrit pas de glyphe) : chargement, maintenance, 425, limites.
 */

import { useId, useState, type ReactNode } from 'react';
import {
  Cog,
  Clock,
  ClipboardList,
  DoorClosed,
  Gauge,
  GitMerge,
  Hourglass,
  Copy,
  Check,
  KeyRound,
  Layers,
  Lock,
  RouteOff,
  SignalLow,
  Unlink,
  WifiOff,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { STATE_GUARD_CATALOG, type StateGuardKey } from '../generated/stateGuardCatalog';
import { sanitizeCorrelationId } from '../correlation';
import { navigate } from '../../routing/navigation';
import { NeoPressButton, type NeoVariant } from './NeoPressButton';
import { SquircleCard } from './SquircleCard';
import { StatusSeal, type SealTone } from './StatusSeal';
import { cx } from './cx';

const STATE_ICON: Record<StateGuardKey, LucideIcon> = {
  loading: Layers,
  offline: WifiOff,
  '401': KeyRound,
  '403': Lock,
  '404': RouteOff,
  '409': GitMerge,
  '422': ClipboardList,
  '425': SignalLow,
  '429': Hourglass,
  '500': Cog,
  '502': Unlink,
  '503': DoorClosed,
  '504': Clock,
  maintenance: Wrench,
  limites: Gauge,
};

const FALLBACK_EXIT_LABEL = 'Revenir';
const MISSING_RESUME_TIME = 'Heure de reprise non communiquée.';

export interface ExitActionEvent {
  readonly index: number;
  readonly label: string;
  readonly variant: NeoVariant;
}

export interface StateGuardProps {
  state: StateGuardKey;
  /** Code de corrélation fourni par le serveur. Affiché seulement s'il est sûr. */
  correlationId?: unknown;
  /** Garanties vérifiées côté serveur uniquement (ex. « Aucune de vos données n'a été perdue »). */
  guarantees?: readonly string[];
  /** Heure de reprise (maintenance uniquement), fournie par le serveur. */
  resumeAt?: string;
  /** Destination de sortie par défaut (sans gestionnaire fourni). */
  exitHref?: string;
  onExitAction?: (event: ExitActionEvent) => void;
  headingLevel?: 1 | 2;
  className?: string;
}

function findEntry(state: StateGuardKey) {
  const entry = STATE_GUARD_CATALOG.find((item) => item.key === state);
  if (!entry) throw new Error(`état StateGuard inconnu : ${state}`);
  return entry;
}

/** Libellé court du sceau : code HTTP quand il existe (« 401 »), sinon le titre. */
function sealLabel(title: string): string {
  const code = /^(\d{3})\b/.exec(title);
  return code ? code[1] : title;
}

function explanationFor(entry: ReturnType<typeof findEntry>, resumeAt: string | undefined): string | null {
  if (!entry.explanation) return null;
  if (entry.explanationPlaceholders.length === 0) return entry.explanation;
  return resumeAt ? entry.explanation.replace('{heure}', resumeAt) : MISSING_RESUME_TIME;
}

function CorrelationLine({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(id);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="lbm-state__correlation">
      <span className="lbm-state__kicker">Code de corrélation</span>
      <code className="lbm-state__code">{id}</code>
      <NeoPressButton variant="text" onClick={copy} aria-label="Copier le code de corrélation">
        <span aria-hidden="true" className="lbm-state__copy-icon">
          {copied ? <Check size={16} strokeWidth={1.5} /> : <Copy size={16} strokeWidth={1.5} />}
        </span>
        {copied ? 'Copié' : 'Copier'}
      </NeoPressButton>
    </div>
  );
}

export function StateGuard({
  state,
  correlationId,
  guarantees = [],
  resumeAt,
  exitHref = '/',
  onExitAction,
  headingLevel = 1,
  className,
}: StateGuardProps): ReactNode {
  const entry = findEntry(state);
  const titleId = useId();
  const Heading = headingLevel === 2 ? 'h2' : 'h1';
  const Icon = STATE_ICON[state];
  const tone: SealTone = (entry.glyph.tone as SealTone | null) ?? 'slate';
  const isLoading = state === 'loading';
  const explanation = explanationFor(entry, resumeAt);
  const safeCorrelation = sanitizeCorrelationId(correlationId);
  const actions = entry.exitActions.length > 0
    ? entry.exitActions.map((action) => ({ label: action.label, variant: action.variant as NeoVariant }))
    : [{ label: FALLBACK_EXIT_LABEL, variant: 'text' as NeoVariant }];

  const runExit = (index: number, label: string, variant: NeoVariant) => {
    if (onExitAction) {
      onExitAction({ index, label, variant });
      return;
    }
    if (entry.exitActions.length === 0 && typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate(exitHref);
  };

  return (
    <section
      className={cx('lbm-state', `lbm-state--${state}`, className)}
      aria-labelledby={titleId}
      data-state={state}
      data-code={entry.code}
      role={isLoading ? 'status' : undefined}
      aria-live={isLoading ? 'polite' : undefined}
      aria-busy={isLoading ? true : undefined}
    >
      <SquircleCard radius={28} elevation={2} className="lbm-state__card">
        <div className="lbm-state__hero">
          <StatusSeal tone={tone} label={sealLabel(entry.title)} glyph={<Icon strokeWidth={1.5} />} />
          <Heading id={titleId} className="lbm-state__title">
            {entry.title}
          </Heading>
        </div>

        {isLoading ? (
          <div className="lbm-state__skeleton" aria-hidden="true">
            <span className="lbm-skeleton lbm-skeleton--wide" />
            <span className="lbm-skeleton" />
            <span className="lbm-skeleton lbm-skeleton--short" />
          </div>
        ) : (
          explanation && <p className="lbm-state__explanation">{explanation}</p>
        )}

        {guarantees.length > 0 && (
          <div className="lbm-state__guarantees">
            {entry.guaranteesLabel && <p className="lbm-state__kicker">{entry.guaranteesLabel}</p>}
            <ul>
              {guarantees.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {safeCorrelation && <CorrelationLine id={safeCorrelation} />}

        <div className="lbm-state__actions">
          {actions.map((action, index) => (
            <NeoPressButton
              key={`${index}-${action.label}`}
              variant={action.variant}
              fullWidth={index === 0}
              onClick={() => runExit(index, action.label, action.variant)}
            >
              {action.label}
            </NeoPressButton>
          ))}
        </div>
      </SquircleCard>
    </section>
  );
}
