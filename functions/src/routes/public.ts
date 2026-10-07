import { Router } from 'express';
import { cancelBooking, createBooking, getBookingWithToken, getSlots } from '../bookings';
import { HttpError, parse } from '../errors';
import { cancelSchema, createBookingSchema, slotsQuerySchema } from '../schemas';
import { findActiveEventType, listEventTypes, loadAvailability, loadSettings } from '../store';
import type { EventType, PublicEventType, PublicEventTypeResponse, PublicProfile, SlotsResponse } from '../types';

const MAX_RANGE_MS = 45 * 86_400_000;

const toPublic = (et: EventType): PublicEventType => ({
  slug: et.slug,
  title: et.title,
  description: et.description,
  durationMin: et.durationMin,
  location: et.location,
});

export const publicRouter = Router();

publicRouter.get('/profile', async (_req, res) => {
  const [settings, eventTypes] = await Promise.all([loadSettings(), listEventTypes()]);
  const body: PublicProfile = {
    name: settings.name,
    welcome: settings.welcome,
    eventTypes: eventTypes.filter((e) => e.active).map(toPublic),
  };
  res.json(body);
});

publicRouter.get('/event-types/:slug', async (req, res) => {
  const [et, settings, { availability }] = await Promise.all([
    findActiveEventType(req.params.slug),
    loadSettings(),
    loadAvailability(),
  ]);
  const body: PublicEventTypeResponse = {
    eventType: toPublic(et),
    host: { name: settings.name, timezone: availability.timezone },
  };
  res.json(body);
});

publicRouter.get('/event-types/:slug/slots', async (req, res) => {
  const q = parse(slotsQuerySchema, req.query);
  const from = Date.parse(q.from);
  const to = Date.parse(q.to);
  if (to <= from || to - from > MAX_RANGE_MS) throw new HttpError(400, 'Invalid date range.');
  const et = await findActiveEventType(req.params.slug);
  const body: SlotsResponse = { slots: await getSlots(et, from, to) };
  res.set('Cache-Control', 'no-store').json(body);
});

publicRouter.post('/bookings', async (req, res) => {
  const input = parse(createBookingSchema, req.body);
  if (input.website) throw new HttpError(400, 'Invalid request.'); // honeypot filled → bot
  res.status(201).json(await createBooking(input));
});

publicRouter.get('/bookings/:id', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  res.set('Cache-Control', 'no-store').json(await getBookingWithToken(req.params.id, token));
});

publicRouter.post('/bookings/:id/cancel', async (req, res) => {
  const input = parse(cancelSchema, req.body);
  await cancelBooking(req.params.id, 'attendee', input.reason, input.token);
  res.json({ ok: true });
});
