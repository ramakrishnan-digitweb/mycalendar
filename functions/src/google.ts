import { auth, calendar, type calendar_v3 } from '@googleapis/calendar';
import { randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, HOST_EMAIL, appUrl } from './config';
import { refs, type BookingDoc, type GoogleDoc } from './db';
import { HttpError } from './errors';
import type { BusyInterval } from './slots';
import type { GoogleStatus } from './types';

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
];
const STATE_TTL_MS = 10 * 60_000;

export const googleRedirectUri = () => `${appUrl()}/api/google/callback`;

function oauthClient() {
  return new auth.OAuth2(GOOGLE_CLIENT_ID.value(), GOOGLE_CLIENT_SECRET.value(), googleRedirectUri());
}

async function connectedClient() {
  const snap = await refs.google().get();
  if (!snap.exists) return null;
  const doc = snap.data() as GoogleDoc;
  const client = oauthClient();
  client.setCredentials({ refresh_token: doc.refreshToken });
  return { client, doc };
}

async function calendarApi(): Promise<calendar_v3.Calendar | null> {
  const c = await connectedClient();
  return c ? calendar({ version: 'v3', auth: c.client }) : null;
}

export async function createGoogleAuthUrl(): Promise<string> {
  const state = randomBytes(24).toString('base64url');
  await refs.oauthStates().doc(state).set({ createdAt: Timestamp.now() });
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // always return a refresh token
    scope: SCOPES,
    state,
    login_hint: HOST_EMAIL.value(),
  });
}

export async function completeGoogleAuth(code: string, state: string): Promise<void> {
  const stateRef = refs.oauthStates().doc(state);
  const stateSnap = await stateRef.get();
  if (!stateSnap.exists) throw new HttpError(400, 'Invalid or expired sign-in state. Try connecting again.');
  await stateRef.delete();
  if (Date.now() - (stateSnap.get('createdAt') as Timestamp).toMillis() > STATE_TTL_MS) {
    throw new HttpError(400, 'Sign-in took too long. Try connecting again.');
  }

  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new HttpError(400, 'Google did not return a refresh token. Try again.');
  const granted = tokens.scope?.split(' ') ?? [];
  if (!SCOPES.slice(2).every((s) => granted.includes(s))) {
    throw new HttpError(400, 'Calendar permissions were not granted. Tick both calendar boxes on the Google consent screen.');
  }

  let email: string | null = null;
  if (tokens.id_token) {
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: GOOGLE_CLIENT_ID.value() });
    email = ticket.getPayload()?.email ?? null;
  }
  const doc: GoogleDoc = { refreshToken: tokens.refresh_token, email, scope: tokens.scope ?? null, connectedAt: Timestamp.now() };
  await refs.google().set(doc);
}

export async function getGoogleStatus(): Promise<GoogleStatus> {
  const c = await connectedClient();
  if (!c) return { connected: false, email: null, needsReconnect: false };
  try {
    await c.client.getAccessToken();
    return { connected: true, email: c.doc.email, needsReconnect: false };
  } catch (err) {
    logger.warn('Google token refresh failed', err);
    return { connected: true, email: c.doc.email, needsReconnect: true };
  }
}

export async function disconnectGoogle(): Promise<void> {
  const c = await connectedClient();
  if (!c) return;
  try {
    await c.client.revokeToken(c.doc.refreshToken);
  } catch (err) {
    logger.warn('Google token revoke failed (continuing)', err);
  }
  await refs.google().delete();
}

/** Busy intervals from the host's primary Google Calendar. Empty when not connected. */
export async function getGoogleBusy(from: number, to: number): Promise<BusyInterval[]> {
  const cal = await calendarApi();
  if (!cal) return [];
  const res = await cal.freebusy.query({
    requestBody: {
      timeMin: new Date(from).toISOString(),
      timeMax: new Date(to).toISOString(),
      items: [{ id: 'primary' }],
    },
  });
  const primary = res.data.calendars?.primary;
  if (primary?.errors?.length) throw new Error(`Google free/busy error: ${JSON.stringify(primary.errors)}`);
  return (primary?.busy ?? []).map((b) => ({ start: Date.parse(b.start!), end: Date.parse(b.end!) }));
}

/** Creates the event on the host's calendar and invites the attendee. Adds a Meet link when requested. */
export async function createGoogleEvent(
  bookingId: string,
  b: BookingDoc,
  hostName: string,
  manageUrl: string,
): Promise<{ eventId: string; meetLink: string | null } | null> {
  const cal = await calendarApi();
  if (!cal) return null;
  const meet = b.location.type === 'google_meet';
  const res = await cal.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: meet ? 1 : 0,
    sendUpdates: 'all',
    requestBody: {
      summary: `${b.eventTitle}: ${b.name} & ${hostName}`,
      description: [b.notes && `Notes from ${b.name}:\n${b.notes}`, `Cancel: ${manageUrl}`].filter(Boolean).join('\n\n'),
      start: { dateTime: b.startAt.toDate().toISOString() },
      end: { dateTime: b.endAt.toDate().toISOString() },
      attendees: [{ email: b.email, displayName: b.name }],
      location: meet ? undefined : b.location.value || undefined,
      conferenceData: meet
        ? { createRequest: { requestId: bookingId, conferenceSolutionKey: { type: 'hangoutsMeet' } } }
        : undefined,
      extendedProperties: { private: { bookingId } },
    },
  });
  const meetLink =
    res.data.hangoutLink ??
    res.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ??
    null;
  return { eventId: res.data.id!, meetLink };
}

export async function deleteGoogleEvent(eventId: string): Promise<void> {
  const cal = await calendarApi();
  if (!cal) return;
  try {
    await cal.events.delete({ calendarId: 'primary', eventId, sendUpdates: 'all' });
  } catch (err) {
    const status = (err as { code?: number }).code;
    if (status !== 404 && status !== 410) throw err;
  }
}
