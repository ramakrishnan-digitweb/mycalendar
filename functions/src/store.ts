import { Timestamp, type Transaction } from 'firebase-admin/firestore';
import { DateTime } from 'luxon';
import { refs, type BookingDoc } from './db';
import { HttpError } from './errors';
import type { BusyInterval } from './slots';
import type { Availability, BookingView, EventType, HostSettings, TimeRange } from './types';

const DAY = 86_400_000;
const nineToFive = (): TimeRange[] => [{ start: '09:00', end: '17:00' }];

export const DEFAULT_AVAILABILITY: Availability = {
  timezone: 'UTC',
  weekly: { mon: nineToFive(), tue: nineToFive(), wed: nineToFive(), thu: nineToFive(), fri: nineToFive(), sat: [], sun: [] },
};

export const DEFAULT_SETTINGS: HostSettings = { name: 'My Calendar', welcome: '' };

export async function loadSettings(): Promise<HostSettings> {
  const snap = await refs.settings().get();
  return { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<HostSettings> | undefined) };
}

export async function loadAvailability(): Promise<{ availability: Availability; isDefault: boolean }> {
  const snap = await refs.availability().get();
  return snap.exists
    ? { availability: snap.data() as Availability, isDefault: false }
    : { availability: DEFAULT_AVAILABILITY, isDefault: true };
}

/** Overrides for host-local dates covering [from, to]. */
export async function loadOverrides(from: number, to: number, zone: string, tx?: Transaction) {
  const first = DateTime.fromMillis(from, { zone }).toISODate()!;
  const last = DateTime.fromMillis(to, { zone }).toISODate()!;
  const query = refs.overrides().where('date', '>=', first).where('date', '<=', last);
  const snap = tx ? await tx.get(query) : await query.get();
  return new Map(snap.docs.map((d) => [d.get('date') as string, d.get('ranges') as TimeRange[]]));
}

/** Confirmed bookings overlapping [from, to). Assumes no booking is longer than a day. */
export async function loadBookingBusy(from: number, to: number, tx?: Transaction): Promise<BusyInterval[]> {
  const query = refs
    .bookings()
    .where('startAt', '>=', Timestamp.fromMillis(from - DAY))
    .where('startAt', '<', Timestamp.fromMillis(to));
  const snap = tx ? await tx.get(query) : await query.get();
  return snap.docs
    .map((d) => d.data() as BookingDoc)
    .filter((b) => b.status === 'confirmed' && b.endAt.toMillis() > from)
    .map((b) => ({ start: b.startAt.toMillis(), end: b.endAt.toMillis() }));
}

export async function listEventTypes(): Promise<EventType[]> {
  const snap = await refs.eventTypes().orderBy('title').get();
  return snap.docs.map((d) => ({ ...(d.data() as Omit<EventType, 'id'>), id: d.id }));
}

export async function findActiveEventType(slug: string): Promise<EventType> {
  const snap = await refs.eventTypes().where('slug', '==', slug).limit(1).get();
  const doc = snap.docs[0];
  if (!doc || !doc.get('active')) throw new HttpError(404, 'This meeting type does not exist.');
  return { ...(doc.data() as Omit<EventType, 'id'>), id: doc.id };
}

export function toBookingView(id: string, b: BookingDoc): BookingView {
  return {
    id,
    eventSlug: b.eventSlug,
    eventTitle: b.eventTitle,
    start: b.startAt.toDate().toISOString(),
    end: b.endAt.toDate().toISOString(),
    name: b.name,
    email: b.email,
    notes: b.notes,
    timezone: b.timezone,
    status: b.status,
    location: b.location,
    meetLink: b.meetLink,
    cancelReason: b.cancelReason,
    createdAt: b.createdAt.toDate().toISOString(),
  };
}
