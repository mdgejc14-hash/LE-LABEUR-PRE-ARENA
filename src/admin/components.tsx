/**
 * ADM —— primitives de composition des écrans de supervision.
 *
 * AUCUNE deuxième bibliothèque : ces primitives composent exclusivement les
 * composants de la fondation P0 (C-01 GlassSurface, C-02 SquircleCard,
 * C-03 NeoPressButton, C-04 StatusSeal, C-19 StateGuard via SystemFeedback) et
 * les tokens générés. Chaque section porte son `data-zone` (genres de zones des
 * fiches ADM) pour rester inspectable.
 *
 * Libellés : ils viennent des écrans (vocabulaire LE LABEUR). Aucune phrase
 * métier n'est écrite ici.
 */

import { useId, type ReactNode } from 'react';
import { GlassSurface, NeoPressButton, SquircleCard, StatusSeal, type SealTone } from '../design-system/components';
import { Link } from '../routing/navigation';
import { adminScreenByCode } from './screenMap';

/** Genres de zones réellement déclarés par les fiches ADM des tranches livrées. */
export type AdminZoneKind =
  | 'hero' | 'kpi' | 'list' | 'table' | 'timeline' | 'form' | 'cta'
  | 'chips' | 'ring' | 'verdict' | 'doc' | 'chat' | 'price';

export function AdminPage({ unitId, screenCode, children }: { unitId: string; screenCode?: string; children: ReactNode }) {
  return (
    <div className="lbm-admin" data-unit={unitId} data-screen={screenCode}>
      <p className="lbm-kicker lbm-mono" data-unit-badge="">
        {screenCode ? `${unitId} · ${screenCode}` : unitId}
      </p>
      {children}
    </div>
  );
}

export function Zone({ kind, children, label }: { kind: AdminZoneKind; children: ReactNode; label?: string }) {
  return (
    <section className="lbm-admin__zone" data-zone={kind} aria-label={label}>
      {children}
    </section>
  );
}

export function PageHead({
  title,
  lede,
  seal,
  headingLevel = 1,
}: {
  title: string;
  lede?: string;
  seal?: { tone: SealTone; label: string };
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <Zone kind="hero">
      <div className="lbm-admin__head">
        <div>
          <Heading className="lbm-title">{title}</Heading>
          {lede ? <p className="lbm-lede">{lede}</p> : null}
        </div>
        {seal ? <StatusSeal tone={seal.tone} label={seal.label} /> : null}
      </div>
    </Zone>
  );
}

/**
 * STRUCTURE DE FICHE (coquille inspectable).
 *
 * Quand aucune source de données n'est configurée, l'écran affiche l'absence de
 * source ET la structure déclarée par le design pour cette fiche : une zone par
 * genre déclaré, sans une seule valeur. Rien n'est inventé : les genres de
 * zones viennent du catalogue généré, la légende dit qu'aucune donnée n'est
 * affichée. C'est ce qui rend la structure vérifiable dans un environnement
 * sans backend, sans jamais simuler de données.
 */
export function SheetFrame({ screenCode }: { screenCode: string }) {
  const screen = adminScreenByCode(screenCode);
  if (!screen) return null;
  const kinds = screen.zoneKinds as readonly AdminZoneKind[];
  return (
    <div className="lbm-admin__frame" data-sheet-frame={screenCode}>
      <h1 className="lbm-title">{`Fiche ${screenCode}`}</h1>
      <p className="lbm-lede">
        {`Structure déclarée par le design : ${kinds.length} zones. Aucune donnée n'est affichée dans cet environnement.`}
      </p>
      {kinds.map((kind) => (
        <Zone key={kind} kind={kind} label={`Zone ${kind}`}>
          <p className="lbm-mono lbm-caption lbm-muted" data-zone-kind={kind}>
            {`zone : ${kind}`}
          </p>
        </Zone>
      ))}
    </div>
  );
}

export function KpiRow({ items }: { items: readonly { label: string; value: string }[] }) {
  if (items.length === 0) return null;
  return (
    <Zone kind="kpi" label="Repères">
      <div className="lbm-admin__kpis">
        {items.map((item) => (
          <SquircleCard key={item.label} radius={22} elevation={1} className="lbm-admin__kpi">
            <p className="lbm-kicker">{item.label}</p>
            <p className="lbm-admin__kpi-value lbm-mono">{item.value}</p>
          </SquircleCard>
        ))}
      </div>
    </Zone>
  );
}

export function Panel({
  title,
  children,
  zone = 'list',
  tone,
}: {
  title: string;
  children: ReactNode;
  zone?: AdminZoneKind;
  tone?: 'plain' | 'notice';
}) {
  const headingId = useId();
  return (
    <Zone kind={zone}>
      <SquircleCard radius={22} elevation={1} className="lbm-panel lbm-admin__panel" aria-labelledby={headingId}>
        <h2 id={headingId} className="lbm-title-2">
          {title}
        </h2>
        {tone === 'notice' ? <p className="lbm-caption lbm-muted">{children}</p> : children}
      </SquircleCard>
    </Zone>
  );
}

/** Liste de lignes réelles ; `empty` est rendu uniquement quand la liste est vide. */
export function RecordList<T>({
  items,
  empty,
  render,
  label,
}: {
  items: readonly T[];
  empty?: ReactNode;
  render: (item: T, index: number) => ReactNode;
  label?: string;
}) {
  if (items.length === 0) return <>{empty ?? null}</>;
  return (
    <ul className="lbm-admin__list" aria-label={label}>
      {items.map((item, index) => (
        <li key={index} className="lbm-admin__row">
          {render(item, index)}
        </li>
      ))}
    </ul>
  );
}

export function RecordCard({
  title,
  href,
  seal,
  facts,
  children,
}: {
  title: string;
  href?: string;
  seal?: { tone: SealTone; label: string };
  facts?: readonly { label: string; value: string }[];
  children?: ReactNode;
}) {
  return (
    <GlassSurface level={2} elevation={1} className="lbm-admin__card">
      <div className="lbm-admin__card-head">
        <div>
          {href ? <Link href={href} className="lbm-admin__card-title">{title}</Link>
            : <span className="lbm-admin__card-title">{title}</span>}
          {facts && facts.length > 0 ? (
            <dl className="lbm-admin__facts">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd className="lbm-mono">{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
        {seal ? <StatusSeal tone={seal.tone} label={seal.label} size="sm" /> : null}
      </div>
      {children}
    </GlassSurface>
  );
}

export function KeyValues({ items, title }: { items: readonly { label: string; value: string | null }[]; title?: string }) {
  const visible = items.filter((item) => item.value !== null && item.value !== '');
  if (visible.length === 0) return null;
  return (
    <dl className="lbm-admin__kv" aria-label={title}>
      {visible.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Jalon de frise : date ou statut réel, jamais une échéance calculée. */
export function Timeline({ steps }: { steps: readonly { label: string; detail?: string; done: boolean }[] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="lbm-admin__timeline">
      {steps.map((step) => (
        <li key={step.label} data-done={step.done ? 'true' : 'false'}>
          <span aria-hidden="true" className="lbm-admin__timeline-dot" />
          <span className="lbm-admin__timeline-label">{step.label}</span>
          {step.detail ? <span className="lbm-mono lbm-caption">{step.detail}</span> : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * Table dense de données RÉELLES (fiche « table »). Sémantique HTML complète :
 * caption lisible par les lecteurs d'écran, en-têtes `scope="col"`, aucune
 * donnée calculée ni tri inventé côté interface.
 */
export function DataTable({
  caption,
  head,
  rows,
  empty,
}: {
  caption: string;
  head: readonly string[];
  rows: readonly (readonly ReactNode[])[];
  empty?: ReactNode;
}) {
  return (
    <Zone kind="table" label={caption}>
      <div className="lbm-admin__table-wrap">
        <table className="lbm-admin__table">
          <caption className="lbm-sr-only">{caption}</caption>
          <thead>
            <tr>
              {head.map((column) => (
                <th key={column} scope="col">{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={head.length}>{empty ?? null}</td>
              </tr>
            ) : (
              rows.map((cells, rowIndex) => (
                <tr key={rowIndex}>
                  {cells.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Zone>
  );
}

export function EmptyNotice({ children }: { children: ReactNode }) {
  return (
    <GlassSurface level={1} className="lbm-admin__notice" data-empty="true">
      <p className="lbm-body">{children}</p>
    </GlassSurface>
  );
}

/**
 * BACKEND_GAP : capacité absente du backend. Le texte nomme la fiche et la
 * route DÉCRITE par le design, pour que l'écart soit vérifiable — jamais une
 * valeur de remplacement inventée.
 */
export function GapNotice({ title, items }: { title: string; items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <GlassSurface level={1} className="lbm-admin__gap" data-backend-gap="true">
      <p className="lbm-kicker">{title}</p>
      <ul>
        {items.map((item) => (
          <li key={item} className="lbm-body">
            {item}
          </li>
        ))}
      </ul>
      <p className="lbm-caption lbm-muted">Aucune valeur n'est affichée à la place : la donnée manquante n'est pas inventée.</p>
    </GlassSurface>
  );
}

/** Erreur de commande affichée en ligne (état StateGuard + corrélation sûre). */
export function ActionError({ error }: { error: { state: string; correlationId?: string } }) {
  return (
    <GlassSurface level={1} className="lbm-admin__gap" data-command-error="true" role="alert">
      <p className="lbm-kicker">Échec de la commande</p>
      <p className="lbm-body">
        {`L’action n’a pas été appliquée. État : ${error.state}.`}
        {error.correlationId ? ` Corrélation : ${error.correlationId}.` : ''}
      </p>
    </GlassSurface>
  );
}

export function LoadingBlock({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="lbm-admin__loading" role="status" aria-live="polite" data-loading="true">
      <span className="lbm-sr-only">{label}</span>
      <span className="lbm-skeleton lbm-skeleton--wide" aria-hidden="true" />
      {Array.from({ length: rows - 1 }, (_, index) => (
        <span key={index} className={index % 2 === 0 ? 'lbm-skeleton' : 'lbm-skeleton lbm-skeleton--short'} aria-hidden="true" />
      ))}
    </div>
  );
}

export function ActionRow({ children }: { children: ReactNode }) {
  return (
    <Zone kind="cta" label="Actions">
      <div className="lbm-admin__actions">{children}</div>
    </Zone>
  );
}

export function FilterChips({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Zone kind="chips" label={label}>
      <div className="lbm-admin__chips" role="group" aria-label={label}>
        {options.map((option) => {
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              className="lbm-admin__chip"
              aria-pressed={active}
              data-active={active ? 'true' : undefined}
              onClick={() => onChange(option.id)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </Zone>
  );
}

/** Champ de formulaire : libellé explicite, état réel, aucune valeur inventée. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const hintId = useId();
  return (
    <label className="lbm-admin__field">
      <span>{label}</span>
      {children}
      {hint ? <span id={hintId} className="lbm-caption lbm-muted">{hint}</span> : null}
    </label>
  );
}

export function RetryButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  return (
    <NeoPressButton variant="ghost" onClick={onClick} loading={busy}>
      Actualiser
    </NeoPressButton>
  );
}

export { GlassSurface, NeoPressButton, SquircleCard, StatusSeal };
export { Link };
