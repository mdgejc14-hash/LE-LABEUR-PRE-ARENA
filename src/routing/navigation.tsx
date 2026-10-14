/**
 * LE LABEUR — Navigation client (P0-DESIGN-FOUNDATION).
 *
 * Routage progressif sans bibliothèque externe : history API + événement de synchronisation.
 * Le legacy (AppContext) n'utilise pas la navigation par URL et reste inchangé.
 */

import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

const NAVIGATE_EVENT = 'lbm:navigate';

/** Change d'URL sans rechargement et notifie les abonnés du routeur. */
export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  if (options.replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

function currentPathname(): string {
  return typeof window === 'undefined' ? '/' : window.location.pathname;
}

/** Chemin courant ; réactif aux retours arrière / avant et aux `navigate()`. */
export function useCurrentPathname(): string {
  return useSyncExternalStore(subscribe, currentPathname, () => '/');
}

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  children?: ReactNode;
}

/** Lien interne : navigation sans rechargement, comportement natif conservé pour les modificateurs. */
export function Link({ href, onClick, children, target, ...rest }: LinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (target && target !== '_self') return;
    if (!href.startsWith('/') || href.startsWith('//')) return;
    event.preventDefault();
    navigate(href);
  };
  return (
    <a href={href} onClick={handleClick} target={target} {...rest}>
      {children}
    </a>
  );
}
