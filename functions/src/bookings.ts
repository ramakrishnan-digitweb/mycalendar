import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { db, refs, type BookingDoc } from './db';
import { manageUrl, sendBookingEmails } from './email';
import { HttpError } from './errors';
import { createGoogleEvent, deleteGoogleEvent, getGoogleBusy } from './google';
import { computeSlots, slotPaddingMs } from './slots';
import {
  findActiveEventType,
  loadAvailability,
  loadBookingBusy,
  loadOverrides,
  loadSettings,
  toBookingView,
} from './store';
import type { CreateBookingRequest, CreateBookingResponse, EventType } from './types';

const MINUTE = 60_000;

/** Free slots for an event type in [from, to). Combines weekly hours, overrides, bookings and Google busy time. */
export async function getSlots(et: EventType, from: number, to: number): Promise<string[]> {
  const { availability } = await loadAvailability();
  const pad = slotPaddingMs(et);
  const [overrides, bookingBusy, googleBusy] = await Promise.all([
    loadOverrides(from, to, availability.timezone),
    loadBookingBusy(from - pad, to + pad),
    getGoogleBusy(from - pad, to + pad),
  ]);
  return computeSlots({
    availability,
    overrides,
    rules: et,
    busy: [...bookingBusy, ...googleBusy],
    from,
    to,
    now: Date.now(),
  });
}

export async function createBooking(req: CreateBookingRequest): Promise<CreateBookingResponse> {
  const et = await findActiveEventType(req.eventSlug);
  const start = Date.parse(req.start);
  const end = start + et.durationMin * MINUTE;
  const pad = slotPaddingMs(et);

  const [{ availability }, settings, googleBusy] = await Promise.all([
    loadAvailability(),
    loadSettings(),
    getGoogleBusy(start - pad, end + pad),
  ]);

  const ref = refs.bookings().doc();
  const now = Timestamp.now();
  const booking: BookingDoc = {
    eventTypeId: et.id,
    eventSlug: et.slug,
    eventTitle: et.title,
    startAt: Timestamp.fromMillis(start),
    endAt: Timestamp.fromMillis(end),
    name: req.name,
    email: req.email.toLowerCase(),
    notes: req.notes,
    timezone: req.timezone,
    status: 'confirmed',
    location: { type: et.location.type, value: et.location.value ?? '' },
    meetLink: null,
    googleEventId: null,
    cancelToken: randomBytes(24).toString('base64url'),
    cancelReason: null,
    cancelledBy: null,
    cancelledAt: null,
    // Booked less than a day ahead: the confirmation email doubles as the reminder.
    reminderSent: start - now.toMillis() < 24 * 60 * MINUTE,
    createdAt: now,
  };

  // Re-validate the slot inside a transaction so two people can't take the same time.
  await db.runTransaction(async (tx) => {
    const [overrides, bookingBusy] = await Promise.all([
      loadOverrides(start, end, availability.timezone, tx),
      loadBookingBusy(start - pad, end + pad, tx),
    ]);
    const slots = computeSlots({
      availability,
      overrides,
      rules: et,
      busy: [...bookingBusy, ...googleBusy],
      from: start,
      to: start + 1,
      now: now.toMillis(),
    });
    if (slots[0] !== new Date(start).toISOString()) {
      throw new HttpError(409, 'Sorry, that time was just taken or is no longer available. Please pick another.');
    }
    tx.create(ref, booking);
  });

  try {
    const event = await createGoogleEvent(ref.id, booking, settings.name, manageUrl(ref.id, booking.cancelToken));
    if (event) {
      booking.googleEventId = event.eventId;
      booking.meetLink = event.meetLink;
      await ref.update({ googleEventId: event.eventId, meetLink: event.meetLink });
    }
  } catch (err) {
    logger.error('Failed to create Google Calendar event', { bookingId: ref.id, err });
  }

  await sendBookingEmails('confirmed', {
    id: ref.id,
    booking,
    hostName: settings.name,
    hostTimezone: availability.timezone,
  });

  return { booking: toBookingView(ref.id, booking), token: booking.cancelToken };
}

function tokensMatch(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Loads a booking for the attendee, checking the secret token from their email link. */
export async function getBookingWithToken(id: string, token: string) {
  const snap = await refs.bookings().doc(id).get();
  if (!snap.exists || !tokensMatch(token, snap.get('cancelToken') ?? '')) {
    throw new HttpError(404, 'Booking not found.');
  }
  return toBookingView(snap.id, snap.data() as BookingDoc);
}

export async function cancelBooking(
  id: string,
  by: 'attendee' | 'host',
  reason: string,
  token?: string,
): Promise<void> {
  const ref = refs.bookings().doc(id);
  let booking!: BookingDoc;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpError(404, 'Booking not found.');
    booking = snap.data() as BookingDoc;
    if (by === 'attendee') {
      if (!token || !tokensMatch(token, booking.cancelToken)) throw new HttpError(404, 'Booking not found.');
      if (booking.startAt.toMillis() < Date.now()) throw new HttpError(400, 'This meeting has already started.');
    }
    if (booking.status === 'cancelled') throw new HttpError(409, 'This booking is already cancelled.');
    const update = {
      status: 'cancelled' as const,
      cancelReason: reason || null,
      cancelledBy: by,
      cancelledAt: Timestamp.now(),
    };
    tx.update(ref, update);
    booking = { ...booking, ...update };
  });

  if (booking.googleEventId) {
    try {
      await deleteGoogleEvent(booking.googleEventId);
    } catch (err) {
      logger.error('Failed to delete Google Calendar event', { bookingId: id, err });
    }
  }

  const [settings, { availability }] = await Promise.all([loadSettings(), loadAvailability()]);
  await sendBookingEmails('cancelled', {
    id,
    booking,
    hostName: settings.name,
    hostTimezone: availability.timezone,
  });
}
