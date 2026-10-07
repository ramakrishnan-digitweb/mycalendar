import { DateTime } from 'luxon';
import { z } from 'zod';

export const isValidZone = (tz: string) => DateTime.local().setZone(tz).isValid;

const zone = z.string().refine(isValidZone, 'Unknown timezone');
const hhmm = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, 'Time must be HH:mm');

const timeRange = z
  .object({ start: hhmm, end: hhmm })
  .refine((r) => r.start < r.end, 'End time must be after start time');

const dayRanges = z.array(timeRange).max(12);

export const availabilitySchema = z.object({
  timezone: zone,
  weekly: z.object({
    mon: dayRanges,
    tue: dayRanges,
    wed: dayRanges,
    thu: dayRanges,
    fri: dayRanges,
    sat: dayRanges,
    sun: dayRanges,
  }),
});

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

export const overrideSchema = z.object({ ranges: dayRanges });

const minutes = (min: number, max: number) => z.number().int().min(min).max(max);

export const eventTypeSchema = z.object({
  slug: z
    .string()
    .max(60)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes'),
  title: z.string().trim().min(1).max(100),
  description: z.string().max(2000).default(''),
  durationMin: minutes(5, 480),
  slotIntervalMin: minutes(5, 480),
  bufferBeforeMin: minutes(0, 240),
  bufferAfterMin: minutes(0, 240),
  minNoticeMin: minutes(0, 60 * 24 * 60),
  maxDaysAhead: minutes(1, 365),
  location: z.object({
    type: z.enum(['google_meet', 'phone', 'in_person', 'custom']),
    value: z.string().trim().max(500).optional(),
  }),
  active: z.boolean(),
});

export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  welcome: z.string().max(1000).default(''),
});

export const createBookingSchema = z.object({
  eventSlug: z.string().min(1).max(60),
  start: z.iso.datetime({ offset: true }),
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.email('Enter a valid email').max(200),
  notes: z.string().max(2000).default(''),
  timezone: zone,
  website: z.string().optional(),
});

export const cancelSchema = z.object({
  token: z.string().optional(),
  reason: z.string().trim().max(500).default(''),
});

export const slotsQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
});
