/**
 * Cookie de session serveur : opaque, HttpOnly, Secure, SameSite=Lax, Path=/.
 * Aucun rôle, aucun identifiant acteur et aucune donnée Google n'y sont écrits.
 */

export const SESSION_COOKIE_NAME = '__Host-lelabeur_session';

export function readSessionCookie(request: Request, cookieName = SESSION_COOKIE_NAME): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (name !== cookieName) continue;
    const value = part.slice(index + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}

export interface SessionCookieOptions {
  cookieName?: string;
  secure?: boolean;
  maxAgeSeconds?: number;
}

export function serializeSessionCookie(token: string, options: SessionCookieOptions = {}): string {
  const name = options.cookieName ?? SESSION_COOKIE_NAME;
  const attributes = [
    `${name}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (options.secure !== false) attributes.push('Secure');
  if (typeof options.maxAgeSeconds === 'number') attributes.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`);
  return attributes.join('; ');
}

export function serializeExpiredSessionCookie(options: SessionCookieOptions = {}): string {
  const name = options.cookieName ?? SESSION_COOKIE_NAME;
  const attributes = [`${name}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (options.secure !== false) attributes.splice(4, 0, 'Secure');
  return attributes.join('; ');
}
