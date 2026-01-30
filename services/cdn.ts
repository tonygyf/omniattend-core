export const CDN_BASE_URL = 'https://files.gyf123.dpdns.org/';
export const DEFAULT_AVATAR = 'https://ui-avatars.com/api/?name=Avatar&background=0D8ABC&color=fff';

export const getFullImageUrl = (path?: string | null): string => {
  const p = (path || '').trim();
  if (!p) return DEFAULT_AVATAR;
  if (p.startsWith('http')) return p;
  const clean = p.startsWith('/') ? p.slice(1) : p;
  return `${CDN_BASE_URL}${encodeURI(clean)}`;
};
