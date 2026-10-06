/**
 * Gestion des horaires du chat d'assistance :
 * Ouvert du lundi au vendredi de 9h00 à 17h00 (Heure de Paris).
 */

export interface ChatScheduleStatus {
  isOpen: boolean;
  scheduleMessage: string;
  badgeText: string;
  openingHoursText: string;
}

export function getChatScheduleStatus(refDate: Date = new Date()): ChatScheduleStatus {
  try {
    const dayStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Paris',
      weekday: 'short',
    }).format(refDate);

    const hour = parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Paris',
        hour: 'numeric',
        hourCycle: 'h23',
      }).format(refDate),
      10
    );

    const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(dayStr);
    const isOpen = isWeekday && hour >= 9 && hour < 17;

    let scheduleMessage = '';
    let badgeText = '';

    if (isOpen) {
      scheduleMessage = "Service EN LIGNE disponible en direct • Ouvert jusqu'à 17h00";
      badgeText = 'En direct (9h-17h)';
    } else if (isWeekday && hour < 9) {
      scheduleMessage = "Actuellement fermé • Réouverture ce matin à 09h00";
      badgeText = 'Ouverture à 09h00';
    } else if (isWeekday && hour >= 17 && dayStr !== 'Fri') {
      scheduleMessage = "Actuellement fermé • Réouverture demain à 09h00 (laissez un message)";
      badgeText = 'Fermé • Réouverture 9h';
    } else {
      scheduleMessage = "Fermé pour le week-end • Réouverture lundi à 09h00 (laissez un message)";
      badgeText = 'Fermé le week-end';
    }

    return {
      isOpen,
      scheduleMessage,
      badgeText,
      openingHoursText: 'Ouvert du lundi au vendredi de 09h00 à 17h00',
    };
  } catch (e) {
    // Fallback simple
    const day = refDate.getDay();
    const h = refDate.getHours();
    const isOpen = day >= 1 && day <= 5 && h >= 9 && h < 17;
    return {
      isOpen,
      scheduleMessage: isOpen
        ? "Disponible en direct jusqu'à 17h00"
        : 'Actuellement fermé • Horaires : Lun–Ven 9h–17h',
      badgeText: isOpen ? 'En direct' : 'Fermé',
      openingHoursText: 'Du lundi au vendredi de 09h00 à 17h00',
    };
  }
}
