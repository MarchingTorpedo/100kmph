import type { Precision } from '@100kmph/tracking/view-types';

// Fixed zone so a static build reads the same on any machine.
const TIME = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
});

/** "12 Oct, 3:15 pm" in IST. */
export function formatTime(iso: string): string {
  return TIME.format(new Date(iso)).replace(/\b(am|pm)\b/i, (m) => m.toLowerCase());
}

/** Short tag for how exactly a position is known (timeline and map marker). */
export const precisionTag: Record<Precision, string> = {
  HUB: 'Hub scan',
  CITY: 'City',
  GPS: 'GPS',
  NONE: 'Position unknown',
};

/** Timeline rows without a place read better as "No location". */
export const timelineTag: Record<Precision, string> = { ...precisionTag, NONE: 'No location' };

export const levelWord = { fresh: 'Recent', aging: 'Ageing', stale: 'Stale' } as const;
