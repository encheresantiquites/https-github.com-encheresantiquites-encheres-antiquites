import type { Sale, SaleDay, SaleStatus } from '../types/index.ts';

/**
 * CALENDRIER COMMERCIAL OFFICIEL — ENCHÈRES ANTIQUITÉS
 * Deux ventes privées par semaine :
 * - MARDI = Vente #1 (10h00 → 22h00)
 * - VENDREDI = Vente #2 (10h00 → 22h00)
 * 
 * Lundi & Jeudi : Journées exclusives de préparation et programmation.
 * Jamais de vente automatique le lundi ou le jeudi.
 */

export interface SaleScheduleConfig {
  tuesdayOpenTime: string;  // e.g. "10:00"
  tuesdayCloseTime: string; // e.g. "22:00"
  fridayOpenTime: string;   // e.g. "10:00"
  fridayCloseTime: string;  // e.g. "22:00"
}

export const DEFAULT_SCHEDULE_CONFIG: SaleScheduleConfig = {
  tuesdayOpenTime: '10:00',
  tuesdayCloseTime: '22:00',
  fridayOpenTime: '10:00',
  fridayCloseTime: '22:00',
};

/**
 * Convertit une date et heure dans le fuseau officiel Europe/Brussels en Date UTC réelle
 */
export function createBrusselsDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  const dummy = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Brussels',
    timeZoneName: 'longOffset',
  }).formatToParts(dummy);
  const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value;
  const match = offsetPart?.match(/GMT([+-])(\d{2}):(\d{2})/);
  const sign = match ? (match[1] === '+' ? -1 : 1) : 0;
  const offH = match ? parseInt(match[2], 10) : 0;
  const offM = match ? parseInt(match[3], 10) : 0;
  return new Date(Date.UTC(year, month - 1, day, hour + sign * offH, minute + sign * offM));
}

/**
 * Extrait les composantes calendaires actuelles dans le fuseau Europe/Brussels
 */
export function getBrusselsNowParts(refDate: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  const parts = formatter.formatToParts(refDate);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour, 10),
    minute: parseInt(map.minute, 10),
    dayOfWeek: weekdayMap[map.weekday] ?? refDate.getDay(),
  };
}

/**
 * Calcule la date et heure d'une vente (Mardi ou Vendredi) dans le fuseau Europe/Brussels
 * Horaires par défaut officiels : 10h00 à 22h00
 * @param day 'MARDI' | 'VENDREDI'
 * @param fromDate Date de référence
 * @param openTime Heure d'ouverture (ex: "10:00")
 * @param closeTime Heure de fermeture (ex: "22:00")
 */
export function calculateNextSaleDates(
  day: SaleDay,
  fromDate: Date = new Date(),
  openTime: string = '10:00',
  closeTime: string = '22:00'
): { startsAt: Date; endsAt: Date } {
  const targetDayOfWeek = day === 'MARDI' ? 2 : 5; // 2 = Mardi, 5 = Vendredi
  const bParts = getBrusselsNowParts(fromDate);
  let daysUntil = (targetDayOfWeek - bParts.dayOfWeek + 7) % 7;

  const [closeHour, closeMin] = closeTime.split(':').map(Number);
  const targetDayEndCandidate = createBrusselsDate(
    bParts.year,
    bParts.month,
    bParts.day + daysUntil,
    closeHour || 22,
    closeMin || 0
  );

  // Si le jour cible est aujourd'hui mais que l'heure de clôture (22h00) est passée, reporter à la semaine suivante
  if (daysUntil === 0 && targetDayEndCandidate.getTime() <= fromDate.getTime()) {
    daysUntil = 7;
  }

  const [openHour, openMin] = openTime.split(':').map(Number);
  const startsAt = createBrusselsDate(
    bParts.year,
    bParts.month,
    bParts.day + daysUntil,
    openHour || 10,
    openMin || 0
  );
  const endsAt = createBrusselsDate(
    bParts.year,
    bParts.month,
    bParts.day + daysUntil,
    closeHour || 22,
    closeMin || 0
  );

  return { startsAt, endsAt };
}

/**
 * Détermine le statut dynamique d'une vente par rapport à l'heure courante
 */
export function getComputedSaleStatus(sale: {
  status: string;
  startsAt: string | Date;
  endsAt: string | Date;
}): SaleStatus {
  if (sale.status === 'DRAFT' || sale.status === 'CANCELLED') {
    return sale.status as SaleStatus;
  }

  const now = Date.now();
  const start = new Date(sale.startsAt).getTime();
  const end = new Date(sale.endsAt).getTime();

  if (now < start) {
    return 'SCHEDULED';
  }
  if (now >= start && now < end) {
    return 'LIVE';
  }
  if (now >= end) {
    return sale.status === 'CLOSED' ? 'CLOSED' : 'ENDED';
  }
  return (sale.status as SaleStatus) || 'SCHEDULED';
}

/**
 * Libellé officiel en français pour les statuts de vente
 */
export function getSaleStatusBadge(status: string): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'LIVE':
      return {
        label: 'VENTE OUVERTE',
        className: 'bg-emerald-950 text-emerald-300 border border-emerald-500/40 shadow-sm animate-pulse',
      };
    case 'SCHEDULED':
      return {
        label: 'PROGRAMMÉE',
        className: 'bg-amber-950/80 text-amber-300 border border-amber-600/40',
      };
    case 'DRAFT':
      return {
        label: 'BROUILLON (EN PRÉPARATION)',
        className: 'bg-slate-800 text-slate-300 border border-slate-700',
      };
    case 'ENDED':
      return {
        label: 'VENTE TERMINÉE',
        className: 'bg-rose-950/80 text-rose-300 border border-rose-600/40',
      };
    case 'CLOSED':
      return {
        label: 'CLÔTURÉE & ADJUGÉE',
        className: 'bg-blue-950/80 text-blue-300 border border-blue-600/40',
      };
    default:
      return {
        label: status,
        className: 'bg-slate-800 text-slate-300',
      };
  }
}

/**
 * Formate une date en français pour l'en-tête commercial
 * Ex: "Mardi 13 octobre" ou "Vendredi 16 octobre"
 */
export function formatSaleDateHeader(dateStr: string | Date): string {
  const d = new Date(dateStr);
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(d);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/**
 * Formate la plage horaire d'une vente
 * Ex: "10h00 → 22h00"
 */
export function formatSaleHours(startsAt: string | Date, endsAt: string | Date): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  const startH = String(start.getHours()).padStart(2, '0') + 'h' + String(start.getMinutes()).padStart(2, '0');
  const endH = String(end.getHours()).padStart(2, '0') + 'h' + String(end.getMinutes()).padStart(2, '0');

  return `${startH} → ${endH}`;
}
