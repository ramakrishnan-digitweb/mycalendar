// Types shared with the web app (imported there with `import type` only).
// Keep this file free of runtime imports.

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** Local wall-clock range in the host's timezone, "HH:mm" (end may be "24:00"). */
export interface TimeRange {
  start: string;
  end: string;
}

export interface Availability {
  timezone: string;
  weekly: Record<Weekday, TimeRange[]>;
}

/** Replaces the weekly hours for one date. Empty ranges = day off. */
export interface DateOverride {
  date: string; // YYYY-MM-DD in host timezone
  ranges: TimeRange[];
}

export type LocationType = 'google_meet' | 'phone' | 'in_person' | 'custom';

export interface EventLocation {
  type: LocationType;
  /** Phone number, address, or custom text. Unused for google_meet. */
  value?: string;
}

export interface EventType {
  id: string;
  slug: string;
  title: string;
  description: string;
  durationMin: number;
  slotIntervalMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  maxDaysAhead: number;
  location: EventLocation;
  active: boolean;
}

export type EventTypeInput = Omit<EventType, 'id'>;

export interface HostSettings {
  name: string;
  welcome: string;
}

export interface PublicEventType {
  slug: string;
  title: string;
  description: string;
  durationMin: number;
  location: EventLocation;
}

export interface PublicProfile {
  name: string;
  welcome: string;
  eventTypes: PublicEventType[];
}

export interface PublicEventTypeResponse {
  eventType: PublicEventType;
  host: { name: string; timezone: string };
}

export interface SlotsResponse {
  /** Slot start times, ISO 8601 UTC. */
  slots: string[];
}

export type BookingStatus = 'confirmed' | 'cancelled';

export interface BookingView {
  id: string;
  eventSlug: string;
  eventTitle: string;
  start: string; // ISO UTC
  end: string; // ISO UTC
  name: string;
  email: string;
  notes: string;
  timezone: string; // attendee's timezone at booking time
  status: BookingStatus;
  location: EventLocation;
  meetLink: string | null;
  cancelReason: string | null;
  createdAt: string;
}

export interface CreateBookingRequest {
  eventSlug: string;
  start: string;
  name: string;
  email: string;
  notes: string;
  timezone: string;
  /** Honeypot, must stay empty. */
  website?: string;
}

export interface CreateBookingResponse {
  booking: BookingView;
  token: string;
}

export interface GoogleStatus {
  connected: boolean;
  email: string | null;
  /** True when a token is stored but Google rejected it — reconnect needed. */
  needsReconnect: boolean;
}
