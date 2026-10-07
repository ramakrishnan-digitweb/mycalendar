import { DateTime } from 'luxon';
import type { EventLocation } from '../types';

export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const allZones = (): string[] => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [browserZone(), 'UTC'];
  }
};

export const zoneLabel = (zone: string) => {
  const offset = DateTime.now().setZone(zone).toFormat('ZZ');
  return `${zone.replace(/_/g, ' ')} (UTC${offset})`;
};

export const fmtTime = (iso: string, zone: string) => DateTime.fromISO(iso, { zone }).toFormat('h:mm a');

export const fmtDateLong = (iso: string, zone: string) =>
  DateTime.fromISO(iso, { zone }).toFormat('cccc, d LLLL yyyy');

export const fmtRange = (start: string, end: string, zone: string) =>
  `${fmtDateLong(start, zone)} · ${fmtTime(start, zone)} – ${fmtTime(end, zone)}`;

export const durationLabel = (min: number) => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

export const LOCATION_LABELS: Record<EventLocation['type'], string> = {
  google_meet: 'Google Meet',
  phone: 'Phone call',
  in_person: 'In person',
  custom: 'Other',
};

export const locationSummary = (loc: EventLocation) =>
  loc.type === 'google_meet' ? 'Google Meet' : loc.value || LOCATION_LABELS[loc.type];
