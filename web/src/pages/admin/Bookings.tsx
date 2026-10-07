import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Loading, cx } from '../../components/ui';
import { browserZone, fmtRange, locationSummary } from '../../lib/time';
import type { BookingView } from '../../types';
import { adminApi } from './adminApi';

export default function Bookings() {
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const [bookings, setBookings] = useState<BookingView[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const zone = browserZone();

  const load = useCallback(() => {
    setBookings(null);
    setError('');
    adminApi.bookings(scope).then(setBookings, (e: Error) => setError(e.message));
  }, [scope]);

  useEffect(load, [load]);

  const cancel = async (b: BookingView) => {
    const reason = window.prompt(`Cancel "${b.eventTitle}" with ${b.name}?\n\nOptional reason (sent to the guest):`);
    if (reason === null) return;
    setBusyId(b.id);
    try {
      await adminApi.cancelBooking(b.id, reason);
      setBookings((list) => list?.map((x) => (x.id === b.id ? { ...x, status: 'cancelled', cancelReason: reason || null } : x)) ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bookings</h1>
        <div className="flex rounded-lg bg-stone-200/60 p-1 text-sm">
          {(['upcoming', 'past'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={cx('rounded-md px-3 py-1 capitalize', scope === s ? 'bg-white font-medium shadow-sm' : 'text-stone-600')}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {!bookings ? (
        !error && <Loading />
      ) : bookings.length === 0 ? (
        <Card className="p-10 text-center text-stone-500">No {scope} bookings.</Card>
      ) : (
        <ul className="space-y-3">
          {bookings.map((b) => {
            const cancelled = b.status === 'cancelled';
            return (
              <li key={b.id}>
                <Card className={cx('flex flex-wrap gap-4 p-5', cancelled && 'opacity-60')}>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium">
                      {fmtRange(b.start, b.end, zone)}
                      {cancelled && <span className="ml-2 rounded bg-stone-200 px-1.5 py-0.5 text-xs text-stone-700">Cancelled</span>}
                    </p>
                    <p className="text-sm text-stone-700">
                      {b.eventTitle} with <span className="font-medium">{b.name}</span>{' '}
                      <a href={`mailto:${b.email}`} className="text-teal-700 hover:underline">
                        {b.email}
                      </a>
                    </p>
                    <p className="text-sm text-stone-500">
                      {b.meetLink ? (
                        <a href={b.meetLink} target="_blank" rel="noreferrer" className="text-teal-700 hover:underline">
                          {b.meetLink}
                        </a>
                      ) : (
                        locationSummary(b.location)
                      )}
                      {' · '}Guest time zone: {b.timezone}
                    </p>
                    {b.notes && <p className="mt-2 rounded-lg bg-stone-50 p-3 text-sm whitespace-pre-line text-stone-700">{b.notes}</p>}
                    {cancelled && b.cancelReason && <p className="text-sm text-stone-500">Reason: {b.cancelReason}</p>}
                  </div>
                  {!cancelled && scope === 'upcoming' && (
                    <Button variant="secondary" busy={busyId === b.id} onClick={() => cancel(b)} className="self-start">
                      Cancel
                    </Button>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
