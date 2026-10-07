import { setGlobalOptions } from 'firebase-functions';
import { onRequest } from 'firebase-functions/https';
import * as logger from 'firebase-functions/logger';
import { onSchedule } from 'firebase-functions/scheduler';
import { Timestamp } from 'firebase-admin/firestore';
import { app } from './app';
import { GOOGLE_CLIENT_SECRET, RESEND_API_KEY } from './config';
import { refs, type BookingDoc } from './db';
import { sendBookingEmails } from './email';
import { loadAvailability, loadSettings } from './store';

setGlobalOptions({ region: 'us-central1', maxInstances: 5 });

/** All HTTP routes, served under /api/** via the Hosting rewrite. */
export const api = onRequest({ secrets: [GOOGLE_CLIENT_SECRET, RESEND_API_KEY] }, app);

/** Emails attendees ~24h before their meeting. */
export const sendReminders = onSchedule({ schedule: 'every 15 minutes', secrets: [RESEND_API_KEY] }, async () => {
  const now = Date.now();
  const snap = await refs
    .bookings()
    .where('startAt', '>', Timestamp.fromMillis(now))
    .where('startAt', '<=', Timestamp.fromMillis(now + 24 * 3_600_000))
    .get();
  const due = snap.docs.filter((d) => d.get('status') === 'confirmed' && !d.get('reminderSent'));
  if (!due.length) return;

  const [settings, { availability }] = await Promise.all([loadSettings(), loadAvailability()]);
  for (const doc of due) {
    // Mark first so a slow send can't cause a duplicate on the next run.
    await doc.ref.update({ reminderSent: true });
    await sendBookingEmails('reminder', {
      id: doc.id,
      booking: doc.data() as BookingDoc,
      hostName: settings.name,
      hostTimezone: availability.timezone,
    });
  }
  logger.info(`Sent ${due.length} reminder(s)`);
});
