import { DateTime } from 'luxon';
import type { Availability, EventType, TimeRange, Weekday } from './types';

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Epoch-millisecond interval, end exclusive. */
export interface BusyInterval {
  start: number;
  end: number;
}

export type SlotRules = Pick<
  EventType,
  | 'durationMin'
  | 'slotIntervalMin'
  | 'bufferBeforeMin'
  | 'bufferAfterMin'
  | 'minNoticeMin'
  | 'maxDaysAhead'
>;

export interface SlotInput {
  availability: Availability;
  /** YYYY-MM-DD (host tz) → ranges that replace the weekly hours for that date. */
  overrides: Map<string, TimeRange[]>;
  rules: SlotRules;
  busy: BusyInterval[];
  /** Only slots starting in [from, to) are returned. */
  from: number;
  to: number;
  now: number;
}

/** How far around a candidate slot busy time must be looked up. */
export const slotPaddingMs = (r: SlotRules) =>
  (r.durationMin + r.bufferBeforeMin + r.bufferAfterMin) * MINUTE;

function atTime(day: DateTime, hhmm: string): DateTime {
  const [h, m] = hhmm.split(':').map(Number);
  return h === 24 ? day.plus({ days: 1 }) : day.set({ hour: h, minute: m });
}

/** Returns free slot start times as ISO UTC strings, sorted. Pure — no I/O. */
export function computeSlots(input: SlotInput): string[] {
  const { availability, overrides, rules, busy, now } = input;
  const zone = availability.timezone;
  const from = Math.max(input.from, now + rules.minNoticeMin * MINUTE);
  const to = Math.min(input.to, now + rules.maxDaysAhead * DAY);
  if (from >= to) return [];

  const duration = rules.durationMin * MINUTE;
  const step = Math.max(5, rules.slotIntervalMin) * MINUTE;
  const before = rules.bufferBeforeMin * MINUTE;
  const after = rules.bufferAfterMin * MINUTE;

  const result = new Set<number>();
  let day = DateTime.fromMillis(from, { zone }).startOf('day');
  const lastDay = DateTime.fromMillis(to, { zone }).startOf('day');

  while (day <= lastDay) {
    const ranges = overrides.get(day.toISODate()!) ?? availability.weekly[WEEKDAYS[day.weekday - 1]] ?? [];
    for (const range of ranges) {
      const windowStart = atTime(day, range.start).toMillis();
      const windowEnd = atTime(day, range.end).toMillis();
      for (let s = windowStart; s + duration <= windowEnd; s += step) {
        if (s < from || s >= to) continue;
        const blockStart = s - before;
        const blockEnd = s + duration + after;
        if (busy.some((b) => b.start < blockEnd && b.end > blockStart)) continue;
        result.add(s);
      }
    }
    day = day.plus({ days: 1 });
  }

  return [...result].sort((a, b) => a - b).map((ms) => new Date(ms).toISOString());
}
