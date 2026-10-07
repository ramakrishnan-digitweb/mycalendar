import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { BookingStatus, EventLocation } from './types';

if (!getApps().length) initializeApp();

export const db = getFirestore();

/** Booking as stored in Firestore. `cancelToken` never leaves the backend except to the booker. */
export interface BookingDoc {
  eventTypeId: string;
  eventSlug: string;
  eventTitle: string;
  startAt: Timestamp;
  endAt: Timestamp;
  name: string;
  email: string;
  notes: string;
  timezone: string;
  status: BookingStatus;
  location: EventLocation;
  meetLink: string | null;
  googleEventId: string | null;
  cancelToken: string;
  cancelReason: string | null;
  cancelledBy: 'attendee' | 'host' | null;
  cancelledAt: Timestamp | null;
  reminderSent: boolean;
  createdAt: Timestamp;
}

export interface GoogleDoc {
  refreshToken: string;
  email: string | null;
  scope: string | null;
  connectedAt: Timestamp;
}

export const refs = {
  settings: () => db.doc('config/settings'),
  availability: () => db.doc('config/availability'),
  google: () => db.doc('private/google'),
  eventTypes: () => db.collection('eventTypes'),
  overrides: () => db.collection('dateOverrides'),
  bookings: () => db.collection('bookings'),
  oauthStates: () => db.collection('oauthStates'),
};
