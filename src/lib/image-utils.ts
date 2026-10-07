/**
 * Utilitaire robuste de gestion des images des lots d'enchères
 * Garantit qu'aucune image ne disparaît ou ne reste cassée en production.
 */

export const FALLBACK_ANTIQUE_IMAGE = '/fallback-antique.svg';

/**
 * Normalise la liste des images d'un lot quel que soit le format renvoyé par la base
 * (tableau, chaîne JSON, URL unique)
 */
export function normalizeLotImages(rawImages: any): string[] {
  if (!rawImages) return [FALLBACK_ANTIQUE_IMAGE];

  let list: string[] = [];
  if (Array.isArray(rawImages)) {
    list = rawImages;
  } else if (typeof rawImages === 'string') {
    try {
      const parsed = JSON.parse(rawImages);
      if (Array.isArray(parsed)) list = parsed;
      else if (typeof parsed === 'string') list = [parsed];
    } catch {
      list = [rawImages];
    }
  }

  const cleaned = list
    .filter((u) => typeof u === 'string' && u.trim().length > 0)
    .map((u) => u.trim());

  return cleaned.length > 0 ? cleaned : [FALLBACK_ANTIQUE_IMAGE];
}

/**
 * Récupère l'image principale d'un lot
 */
export function getLotPrimaryImage(rawImages: any): string {
  const list = normalizeLotImages(rawImages);
  return list[0] || FALLBACK_ANTIQUE_IMAGE;
}

/**
 * Gestionnaire d'erreur intelligent pour les balises <img> :
 * 1. Tente de basculer sur le proxy backend /api/image-proxy si l'URL externe est bloquée (CORS / Adblocker / CDN Unsplash)
 * 2. Si le proxy échoue également, bascule sur le visuel SVG haute fidélité local /fallback-antique.svg
 */
export function handleLotImageError(
  e: React.SyntheticEvent<HTMLImageElement>,
  originalUrl?: string
): void {
  const target = e.currentTarget;
  const currentSrc = target.src;

  // Si on est déjà sur le SVG local, ne rien faire de plus
  if (currentSrc.includes('fallback-antique.svg')) {
    return;
  }

  // Tenter le proxy serveur si c'est une URL externe qui a échoué
  const urlToProxy = originalUrl || currentSrc;
  if (urlToProxy.startsWith('http') && !currentSrc.includes('/api/image-proxy')) {
    target.src = `/api/image-proxy?url=${encodeURIComponent(urlToProxy)}`;
    return;
  }

  // Si même le proxy échoue, basculer sur le fallback universel
  target.src = FALLBACK_ANTIQUE_IMAGE;
}
