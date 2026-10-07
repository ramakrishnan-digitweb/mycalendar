import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, connectAuthEmulator, getAuth } from 'firebase/auth';
import { request } from '../../lib/api';
import type { Availability, BookingView, DateOverride, EventType, EventTypeInput, GoogleStatus, HostSettings, TimeRange } from '../../types';

// Firebase is only loaded on admin pages, keeping the public booking pages light.
const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

export const auth = getAuth(app);
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
export const googleProvider = new GoogleAuthProvider();

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  return request<T>(`/admin${path}`, { method, body, token });
}

const enc = encodeURIComponent;

export const adminApi = {
  me: () => call<{ ok: true }>('/me'),

  settings: () => call<HostSettings>('/settings'),
  saveSettings: (s: HostSettings) => call<HostSettings>('/settings', 'PUT', s),

  availability: () => call<{ availability: Availability; isDefault: boolean }>('/availability'),
  saveAvailability: (a: Availability) => call<Availability>('/availability', 'PUT', a),
  overrides: () => call<DateOverride[]>('/overrides'),
  saveOverride: (date: string, ranges: TimeRange[]) => call<DateOverride>(`/overrides/${enc(date)}`, 'PUT', { ranges }),
  deleteOverride: (date: string) => call<{ ok: true }>(`/overrides/${enc(date)}`, 'DELETE'),

  eventTypes: () => call<EventType[]>('/event-types'),
  createEventType: (e: EventTypeInput) => call<EventType>('/event-types', 'POST', e),
  updateEventType: (id: string, e: EventTypeInput) => call<EventType>(`/event-types/${enc(id)}`, 'PUT', e),
  deleteEventType: (id: string) => call<{ ok: true }>(`/event-types/${enc(id)}`, 'DELETE'),

  bookings: (scope: 'upcoming' | 'past') => call<BookingView[]>(`/bookings?scope=${scope}`),
  cancelBooking: (id: string, reason: string) => call<{ ok: true }>(`/bookings/${enc(id)}/cancel`, 'POST', { reason }),

  google: () => call<GoogleStatus>('/google'),
  connectGoogle: () => call<{ url: string }>('/google/connect', 'POST'),
  disconnectGoogle: () => call<{ ok: true }>('/google/disconnect', 'POST'),
};
