/**
 * Local vector SVG assets & avatars for LE LABEUR
 * Clean editorial architectural style, zero external CDN dependencies.
 */

function createSvgAvatar(initials: string, bg: string, accent: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
    <rect width="160" height="160" rx="8" fill="${bg}"/>
    <circle cx="80" cy="62" r="32" fill="${accent}" opacity="0.85"/>
    <path d="M26 142 C26 106, 52 98, 80 98 C108 98, 134 106, 134 142 Z" fill="${accent}" opacity="0.95"/>
    <text x="80" y="72" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'DM Sans', sans-serif" font-size="24" font-weight="700" fill="#FFFFFF">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const LOCAL_AVATARS: Record<string, string> = {
  // Candidates Bénin
  'user-cand-1': createSvgAvatar('AD', '#17233B', '#B5CEDB'), // Amina Dossou (Cotonou)
  'user-cand-2': createSvgAvatar('RA', '#340C24', '#F8BBCB'), // Rodrigue Akpakoun (Abomey-Calavi)
  'user-cand-3': createSvgAvatar('YH', '#17233B', '#B5CEDB'), // Yasmine Hounkpatin (Cotonou)
  'user-cand-4': createSvgAvatar('MH', '#340C24', '#F8BBCB'), // Marcellin Houngbédji (Cotonou)
  'user-cand-5': createSvgAvatar('CZ', '#17233B', '#B5CEDB'), // Christian Zannou (Porto-Novo)
  'user-cand-6': createSvgAvatar('KB', '#340C24', '#F8BBCB'), // Karim Bio Guéra (Parakou)
  'user-cand-7': createSvgAvatar('BA', '#17233B', '#B5CEDB'), // Béatrice Agbessi (Abomey-Calavi)
  'user-cand-8': createSvgAvatar('MK', '#340C24', '#F8BBCB'), // Modeste Kpadonou (Bohicon)

  // Employers Bénin
  'user-emp-1': createSvgAvatar('RH', '#17233B', '#B5CEDB'), // Reine Houénou (Cotonou)
  'user-emp-2': createSvgAvatar('JS', '#340C24', '#F8BBCB'), // Jean-Baptiste Soglo (Abomey-Calavi)
  'user-emp-3': createSvgAvatar('FA', '#17233B', '#B5CEDB'), // Dr. Félicité Agossa (Cotonou)
  'user-emp-4': createSvgAvatar('OB', '#340C24', '#F8BBCB'), // Oumar Bio Sanni (Porto-Novo)

  // Admin Bénin
  'user-admin-1': createSvgAvatar('LB', '#340C24', '#C5A059'), // Cellule Centrale LE LABEUR Bénin
};

export const DEFAULT_AVATAR = createSvgAvatar('LB', '#17233B', '#B5CEDB');

export function getAvatar(id?: string): string {
  if (id && LOCAL_AVATARS[id]) {
    return LOCAL_AVATARS[id];
  }
  return DEFAULT_AVATAR;
}
