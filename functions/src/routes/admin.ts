import { Router } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { requireHost } from '../auth';
import { cancelBooking } from '../bookings';
import { refs, type BookingDoc } from '../db';
import { HttpError, parse } from '../errors';
import { createGoogleAuthUrl, disconnectGoogle, getGoogleStatus } from '../google';
import { availabilitySchema, cancelSchema, eventTypeSchema, isoDate, overrideSchema, settingsSchema } from '../schemas';
import { listEventTypes, loadAvailability, loadSettings, toBookingView } from '../store';
import type { DateOverride } from '../types';

export const adminRouter = Router();
adminRouter.use(requireHost);

adminRouter.get('/me', (_req, res) => {
  res.json({ ok: true });
});

// Settings
adminRouter.get('/settings', async (_req, res) => {
  res.json(await loadSettings());
});

adminRouter.put('/settings', async (req, res) => {
  const settings = parse(settingsSchema, req.body);
  await refs.settings().set(settings);
  res.json(settings);
});

// Availability
adminRouter.get('/availability', async (_req, res) => {
  res.json(await loadAvailability());
});

adminRouter.put('/availability', async (req, res) => {
  const availability = parse(availabilitySchema, req.body);
  await refs.availability().set(availability);
  res.json(availability);
});

adminRouter.get('/overrides', async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const snap = await refs.overrides().where('date', '>=', today).orderBy('date').get();
  res.json(snap.docs.map((d) => d.data() as DateOverride));
});

adminRouter.put('/overrides/:date', async (req, res) => {
  const date = parse(isoDate, req.params.date);
  const { ranges } = parse(overrideSchema, req.body);
  const override: DateOverride = { date, ranges };
  await refs.overrides().doc(date).set(override);
  res.json(override);
});

adminRouter.delete('/overrides/:date', async (req, res) => {
  await refs.overrides().doc(parse(isoDate, req.params.date)).delete();
  res.json({ ok: true });
});

// Event types
async function assertSlugFree(slug: string, exceptId?: string) {
  const snap = await refs.eventTypes().where('slug', '==', slug).get();
  if (snap.docs.some((d) => d.id !== exceptId)) throw new HttpError(409, `The link "/${slug}" is already used.`);
}

const RESERVED_SLUGS = new Set(['admin', 'api', 'booking', 'assets']);

adminRouter.get('/event-types', async (_req, res) => {
  res.json(await listEventTypes());
});

adminRouter.post('/event-types', async (req, res) => {
  const input = parse(eventTypeSchema, req.body);
  if (RESERVED_SLUGS.has(input.slug)) throw new HttpError(400, `"${input.slug}" is reserved.`);
  await assertSlugFree(input.slug);
  const ref = await refs.eventTypes().add(input);
  res.status(201).json({ ...input, id: ref.id });
});

adminRouter.put('/event-types/:id', async (req, res) => {
  const input = parse(eventTypeSchema, req.body);
  if (RESERVED_SLUGS.has(input.slug)) throw new HttpError(400, `"${input.slug}" is reserved.`);
  const ref = refs.eventTypes().doc(req.params.id);
  if (!(await ref.get()).exists) throw new HttpError(404, 'Event type not found.');
  await assertSlugFree(input.slug, ref.id);
  await ref.set(input);
  res.json({ ...input, id: ref.id });
});

adminRouter.delete('/event-types/:id', async (req, res) => {
  await refs.eventTypes().doc(req.params.id).delete();
  res.json({ ok: true });
});

// Bookings
adminRouter.get('/bookings', async (req, res) => {
  const now = Timestamp.now();
  const past = req.query.scope === 'past';
  const snap = await refs
    .bookings()
    .where('startAt', past ? '<' : '>=', now)
    .orderBy('startAt', past ? 'desc' : 'asc')
    .limit(200)
    .get();
  res.json(snap.docs.map((d) => toBookingView(d.id, d.data() as BookingDoc)));
});

adminRouter.post('/bookings/:id/cancel', async (req, res) => {
  const { reason } = parse(cancelSchema, req.body);
  await cancelBooking(req.params.id, 'host', reason);
  res.json({ ok: true });
});

// Google Calendar connection
adminRouter.get('/google', async (_req, res) => {
  res.json(await getGoogleStatus());
});

adminRouter.post('/google/connect', async (_req, res) => {
  res.json({ url: await createGoogleAuthUrl() });
});

adminRouter.post('/google/disconnect', async (_req, res) => {
  await disconnectGoogle();
  res.json({ ok: true });
});
