/**
 * Démonstration de la fondation (P0-DESIGN-FOUNDATION) — route /fondation/* (hors produit, retirable).
 * Affiche les tokens, les composants C-01 → C-20 retenus et les shells, à partir des données générées.
 */

import type { CSSProperties, ReactNode } from 'react';
import { ARBITRAGE, A11Y, ELEVATION, PALETTE, PERF, RADII, SPACING, SPRINGS, TOKEN_SOURCE, TYPE_SCALE } from '../generated/tokens';
import { FAMILY_LABELS } from '../generated/chrome';
import { STATE_GUARD_CATALOG } from '../generated/stateGuardCatalog';
import { integrationSummary } from '../../routing/integration';
import { Link } from '../../routing/navigation';
import { BottomDock } from '../components/BottomDock';
import { GlassSurface } from '../components/GlassSurface';
import { NeoPressButton } from '../components/NeoPressButton';
import { SquircleCard } from '../components/SquircleCard';
import { StatusSeal, type SealTone } from '../components/StatusSeal';
import { dockItemsFor } from '../shells/shellNavigation';
import { contrastRatio } from '../tokens';

const TONES: readonly SealTone[] = ['gold', 'emerald', 'amber', 'clay', 'violet', 'cyan', 'slate'];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="lbm-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="lbm-title-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ShellLinks() {
  const links: Array<[string, string]> = [
    ['/client', 'Shell CLIENT (EMP)'],
    ['/prestataire', 'Shell PRESTATAIRE (PRE)'],
    ['/admin', 'Shell ADMIN (ADM)'],
    ['/appels', 'Shell RTC (RTC)'],
    ['/etat', 'Shell SYSTEM — états (SYS)'],
    ['/fondation/public', 'Shell PUBLIC (PUB) — démonstration'],
  ];
  return (
    <ul className="lbm-link-grid">
      {links.map(([href, label]) => (
        <li key={href}>
          <Link href={href} className="lbm-link-card">
            <span className="lbm-mono">{href}</span>
            <span>{label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function GlassSamples() {
  return (
    <div className="lbm-grid">
      {[1, 2, 3, 4].map((level) => (
        <div key={level} className="lbm-cell lbm-cell--third">
          <GlassSurface level={level as 1 | 2 | 3 | 4} elevation={level >= 3 ? 3 : 1} className="lbm-sample lbm-sample--glass">
            <p className="lbm-caption">Verre {level}</p>
            <p className="lbm-caption lbm-muted">
              {level >= 3 ? 'Flou profond : budget ≤ 2 par écran' : 'Flou standard'}
            </p>
          </GlassSurface>
        </div>
      ))}
    </div>
  );
}

function SquircleSamples() {
  return (
    <div className="lbm-grid">
      <div className="lbm-cell lbm-cell--half">
        <SquircleCard radius={22} elevation={1} className="lbm-sample">
          <p className="lbm-body">Carte au repos · rayon 22 · E1</p>
        </SquircleCard>
      </div>
      <div className="lbm-cell lbm-cell--half">
        <SquircleCard radius={28} elevation={2} tone="active" className="lbm-sample">
          <p className="lbm-body">Carte héros · rayon 28 · E2</p>
        </SquircleCard>
      </div>
    </div>
  );
}

function ButtonSamples() {
  return (
    <div className="lbm-button-row">
      <NeoPressButton variant="primary">Action principale</NeoPressButton>
      <NeoPressButton variant="ghost">Fantôme</NeoPressButton>
      <NeoPressButton variant="text">Texte</NeoPressButton>
      <NeoPressButton variant="ghost" disabled>
        Désactivé
      </NeoPressButton>
      <NeoPressButton variant="primary" loading>
        En cours
      </NeoPressButton>
    </div>
  );
}

function SealSamples() {
  return (
    <div className="lbm-seal-row">
      {TONES.map((tone) => (
        <StatusSeal key={tone} tone={tone} label={tone === 'gold' ? 'Or' : tone} size="sm" />
      ))}
      <StatusSeal tone="emerald" label="Éligible" pulse />
    </div>
  );
}

function DockSamples() {
  return (
    <div className="lbm-dock-samples">
      <BottomDock ariaLabel="Exemple dock client" items={dockItemsFor('EMP')} currentPath="/client/missions" variant="glass" />
      <BottomDock ariaLabel="Exemple dock supervision" items={dockItemsFor('ADM')} currentPath="/admin/litiges" variant="solid" />
    </div>
  );
}

function PaletteSwatches() {
  return (
    <div className="lbm-swatches">
      {PALETTE.map((group) => (
        <div key={group.label} className="lbm-swatch-group">
          <p className="lbm-caption lbm-muted">{group.label}</p>
          <ul className="lbm-swatch-list">
            {group.rows.map((row) => {
              const solid = row.value.startsWith('#');
              const onDark = solid ? contrastRatio(row.value, '#050507') : null;
              return (
                <li key={row.cssVar} className="lbm-swatch">
                  <span
                    className="lbm-swatch__chip"
                    aria-hidden="true"
                    style={{ background: `var(${row.cssVar})` } as CSSProperties}
                  />
                  <span className="lbm-swatch__meta">
                    <span className="lbm-mono">{row.cssVar}</span>
                    <span className="lbm-mono lbm-muted">{row.value.length > 40 ? 'dégradé / composé' : row.value}</span>
                    {onDark !== null && <span className="lbm-caption lbm-muted">contraste sur surface-0 : {onDark.toFixed(2)}:1</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function TypeSamples() {
  const samples = TYPE_SCALE.filter((row) => ['display1', 'title1', 'title3', 'body', 'caption', 'price'].includes(row.key));
  return (
    <ul className="lbm-type-list">
      {samples.map((row) => (
        <li key={row.key} className="lbm-type-sample" style={{ fontSize: row.sizePx, fontWeight: row.weight, lineHeight: `${row.lineHeightPx}px`, letterSpacing: `${row.trackingEm}em` }}>
          <span>{row.key} — {row.sizePx}/{row.weight}</span>
        </li>
      ))}
    </ul>
  );
}

function TokenFacts() {
  return (
    <div className="lbm-facts">
      <dl>
        <dt>Espacement</dt>
        <dd>Unité {SPACING.baseUnitPx} px · échelle {SPACING.scalePx.join(' · ')}</dd>
        <dt>Grille</dt>
        <dd>
          {SPACING.grid.mobile.columns} colonnes (mobile) · {SPACING.grid.tablet.columns} (tablette) · {SPACING.grid.desktop.columns} (desktop), conteneur max {SPACING.grid.desktop.maxWidthPx} px
        </dd>
        <dt>Rayons</dt>
        <dd>{RADII.map((r) => `${r.cssVar.replace('--', '')} ${r.px}`).join(' · ')}</dd>
        <dt>Élévations</dt>
        <dd>{ELEVATION.filter((e) => e.shadow).map((e) => e.label).join(' · ')}</dd>
        <dt>Ressorts</dt>
        <dd>{SPRINGS.map((s) => `${s.name} ${s.stiffness}/${s.damping}/${s.mass}`).join(' · ')}</dd>
      </dl>
    </div>
  );
}

function BudgetFacts() {
  return (
    <ul className="lbm-facts-list">
      <li>LCP cible &lt; {PERF.lcpBudgetMs} ms (4G) — non mesuré dans cette fondation</li>
      <li>Interaction &lt; {PERF.interactionBudgetMs} ms — non mesurée</li>
      <li>Flou &gt; {PERF.deepBlurThresholdPx} px : {PERF.deepSurfacesMax} surfaces simultanées au plus</li>
      <li>Appareils &lt; {PERF.lowMemoryRamGb} Go de RAM : verre opaque (--surface-2 + grain)</li>
      <li>Cibles tactiles ≥ {A11Y.touchTargetMobilePx} px (mobile), ≥ {A11Y.touchTargetDesktopPx} px (desktop)</li>
      <li>Focus : {A11Y.focusRingPx} px --gold-500 + halo {A11Y.focusHaloPx} px (α {A11Y.focusHaloAlpha})</li>
    </ul>
  );
}

export function FoundationIndexPage() {
  const summary = integrationSummary();
  return (
    <div className="lbm-page lbm-page--wide">
      <p className="lbm-kicker">{TOKEN_SOURCE.name} · {TOKEN_SOURCE.aesthetic} · v{TOKEN_SOURCE.version}</p>
      <h1 className="lbm-title">Fondation du Design Final</h1>
      <p className="lbm-lede">Démonstration technique (Web). Les écrans de production ne sont pas intégrés ici.</p>

      <Section id="shells" title="Shells et namespaces">
        <ShellLinks />
      </Section>

      <Section id="components" title="Composants de fondation (C-01 · C-02 · C-03 · C-04 · C-19 · C-20)">
        <h3 className="lbm-title-3">C-01 GlassSurface</h3>
        <GlassSamples />
        <h3 className="lbm-title-3">C-02 SquircleCard</h3>
        <SquircleSamples />
        <h3 className="lbm-title-3">C-03 NeoPressButton</h3>
        <ButtonSamples />
        <h3 className="lbm-title-3">C-04 StatusSeal</h3>
        <SealSamples />
        <h3 className="lbm-title-3">C-20 BottomDock</h3>
        <DockSamples />
        <h3 className="lbm-title-3">C-19 StateGuard</h3>
        <ul className="lbm-link-grid">
          {STATE_GUARD_CATALOG.map((state) => (
            <li key={state.key}>
              <Link href={state.route} className="lbm-link-card">
                <span className="lbm-mono">{state.code}</span>
                <span>{state.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="tokens" title="Tokens (source : design/llab/tokens.py)">
        <PaletteSwatches />
        <h3 className="lbm-title-3">Typographie</h3>
        <TypeSamples />
        <TokenFacts />
      </Section>

      <Section id="budgets" title="Accessibilité et performance">
        <BudgetFacts />
      </Section>

      <Section id="units" title="Unités de production">
        <p className="lbm-body">
          {ARBITRAGE.etats} états → {ARBITRAGE.canons} canons → {ARBITRAGE.unites} unités. Intégrées : {summary.integrees} / {summary.total}.
        </p>
        <ul className="lbm-facts-list">
          {(Object.keys(FAMILY_LABELS) as Array<keyof typeof FAMILY_LABELS>).map((family) => (
            <li key={family}>{FAMILY_LABELS[family].label}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

export function FoundationPublicPage() {
  return (
    <div className="lbm-page">
      <p className="lbm-kicker">PUB · chrome minimal</p>
      <h1 className="lbm-title">Accueil public (démonstration)</h1>
      <GlassSurface level={2} elevation={1} className="lbm-panel">
        <p className="lbm-body">
          Le shell PUBLIC n&apos;affiche qu&apos;un glyphe et aucun dock. Les écrans PUB de production ne sont pas intégrés.
        </p>
        <div className="lbm-button-row">
          <NeoPressButton variant="primary">Continuer</NeoPressButton>
          <NeoPressButton variant="ghost">Plus tard</NeoPressButton>
        </div>
      </GlassSurface>
      <p className="lbm-caption">
        <Link href="/fondation">Retour à la fondation</Link>
      </p>
    </div>
  );
}
