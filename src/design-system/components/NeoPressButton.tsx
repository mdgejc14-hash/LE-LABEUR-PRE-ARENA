/**
 * C-03 NeoPressButton (Web) — bouton à enfoncement par ombre interne.
 *
 * Variantes (fiches SYS : « or » = CTA plein, « fantôme », « texte ») :
 *  - primary : fond --gold-500, texte --surface-0 (contraste 11.7:1) ;
 *  - ghost   : contour --text-mid (8.8:1 sur --surface-0), texte --text-hi ;
 *  - text    : texte --text-gold, sans contour.
 * Enfoncement : ombre interne E1 (tokens) animée par le ressort « snap » (motion@12).
 * Réduction de mouvement : fondu de 120 ms. Cible tactile ≥ 44 px.
 * Gyroscope : NON IMPLÉMENTÉ (pas de capteur ni de permission dans cette fondation).
 */

import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { transitionFor, usePrefersReducedMotion } from '../motion';
import { cx } from './cx';

export type NeoVariant = 'primary' | 'ghost' | 'text';

export interface NeoPressButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: NeoVariant;
  type?: 'button' | 'submit' | 'reset';
  /** Traitement en cours : aria-busy, action non déclenchable, libellé lu par les lecteurs d'écran. */
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

export function NeoPressButton({
  variant = 'ghost',
  type = 'button',
  loading = false,
  fullWidth = false,
  icon,
  disabled = false,
  className,
  children,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  onKeyDown,
  onKeyUp,
  ...rest
}: NeoPressButtonProps) {
  const reduced = usePrefersReducedMotion();
  const [pressed, setPressed] = useState(false);
  const inert = disabled || loading;

  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      aria-busy={loading ? true : undefined}
      aria-disabled={loading && !disabled ? true : undefined}
      className={cx('lbm-neo', `lbm-neo--${variant}`, fullWidth && 'lbm-neo--full', className)}
      data-variant={variant}
      data-pressed={pressed ? 'true' : undefined}
      onPointerDown={(event) => {
        if (!inert) setPressed(true);
        onPointerDown?.(event);
      }}
      onPointerUp={(event) => {
        setPressed(false);
        onPointerUp?.(event);
      }}
      onPointerLeave={(event) => {
        setPressed(false);
        onPointerLeave?.(event);
      }}
      onPointerCancel={(event) => {
        setPressed(false);
        onPointerCancel?.(event);
      }}
      onKeyDown={(event) => {
        if ((event.key === ' ' || event.key === 'Enter') && !inert) setPressed(true);
        onKeyDown?.(event);
      }}
      onKeyUp={(event) => {
        setPressed(false);
        onKeyUp?.(event);
      }}
    >
      <motion.span
        aria-hidden="true"
        className="lbm-neo__press"
        initial={false}
        animate={{ opacity: pressed && !inert ? 1 : 0 }}
        transition={transitionFor('snap', reduced)}
      />
      {icon && (
        <span aria-hidden="true" className="lbm-neo__icon">
          {icon}
        </span>
      )}
      <span className="lbm-neo__label">{children}</span>
      {loading && <span className="lbm-sr-only">Traitement en cours</span>}
    </button>
  );
}
