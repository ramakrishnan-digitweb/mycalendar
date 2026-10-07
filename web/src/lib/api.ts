import type {
  BookingView,
  CreateBookingRequest,
  CreateBookingResponse,
  PublicEventTypeResponse,
  PublicProfile,
  SlotsResponse,
} from '../types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type RequestOptions = { method?: string; body?: unknown; token?: string };

export async function request<T>(path: string, { method = 'GET', body, token }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Network error. Check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

const enc = encodeURIComponent;

export const publicApi = {
  profile: () => request<PublicProfile>('/public/profile'),
  eventType: (slug: string) => request<PublicEventTypeResponse>(`/public/event-types/${enc(slug)}`),
  slots: (slug: string, from: string, to: string) =>
    request<SlotsResponse>(`/public/event-types/${enc(slug)}/slots?from=${enc(from)}&to=${enc(to)}`),
  book: (body: CreateBookingRequest) => request<CreateBookingResponse>('/public/bookings', { method: 'POST', body }),
  booking: (id: string, token: string) => request<BookingView>(`/public/bookings/${enc(id)}?token=${enc(token)}`),
  cancel: (id: string, token: string, reason: string) =>
    request<{ ok: true }>(`/public/bookings/${enc(id)}/cancel`, { method: 'POST', body: { token, reason } }),
};
