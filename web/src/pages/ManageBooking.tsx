import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Alert, Button, Card, Field, Loading, Textarea } from '../components/ui';
import { publicApi } from '../lib/api';
import { browserZone, fmtRange, locationSummary } from '../lib/time';
import type { BookingView } from '../types';

export default function ManageBooking() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const isNew = params.get('new') === '1';

  const [booking, setBooking] = useState<BookingView | null>(null);
  const [error, setError] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    publicApi.booking(id, token).then(setBooking, (e: Error) => setError(e.message));
  }, [id, token]);

  if (error) {
    return (
      <Shell>
        <Alert>{error} The link may be incomplete. Use the link from your confirmation email.</Alert>
      </Shell>
    );
  }
  if (!booking) return <Loading />;

  const zone = booking.timezone || browserZone();
  const cancelled = booking.status === 'cancelled';
  const past = new Date(booking.start).getTime() < Date.now();

  const cancel = async () => {
    setBusy(true);
    setActionError('');
    try {
      await publicApi.cancel(id, token, reason);
      setBooking({ ...booking, status: 'cancelled', cancelReason: reason || null });
      setCancelOpen(false);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <Card className="p-6 sm:p-8">
        <div className="text-center">
          <div
            className={`mx-auto mb-4 grid size-12 place-items-center rounded-full text-xl ${cancelled ? 'bg-stone-200 text-stone-600' : 'bg-teal-100 text-teal-800'}`}
          >
            {cancelled ? '✕' : '✓'}
          </div>
          <h1 className="text-xl font-semibold">
            {cancelled ? 'This meeting is cancelled' : isNew ? 'You are booked!' : 'Your booking'}
          </h1>
          {isNew && !cancelled && (
            <p className="mt-2 text-sm text-stone-600">A confirmation and calendar invite were sent to {booking.email}.</p>
          )}
        </div>

        <dl className="mt-6 space-y-3 border-t border-stone-200 pt-6 text-sm">
          <Row label="What">{booking.eventTitle}</Row>
          <Row label="When">
            {fmtRange(booking.start, booking.end, zone)}
            <span className="block text-xs text-stone-500">{zone.replace(/_/g, ' ')}</span>
          </Row>
          <Row label="Where">
            {booking.meetLink && !cancelled ? (
              <a href={booking.meetLink} className="break-all text-teal-700 underline" target="_blank" rel="noreferrer">
                {booking.meetLink}
              </a>
            ) : (
              locationSummary(booking.location)
            )}
          </Row>
          <Row label="Name">{booking.name}</Row>
          {cancelled && booking.cancelReason && <Row label="Reason">{booking.cancelReason}</Row>}
        </dl>

        <div className="mt-8 border-t border-stone-200 pt-6">
          {cancelled ? (
            <Link to={`/${booking.eventSlug}`} className="text-sm font-medium text-teal-700 underline">
              Book a new time
            </Link>
          ) : past ? (
            <p className="text-sm text-stone-500">This meeting has already started.</p>
          ) : cancelOpen ? (
            <div className="space-y-4">
              <Field label="Reason for cancelling (optional)">
                <Textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
              </Field>
              {actionError && <Alert>{actionError}</Alert>}
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" busy={busy} onClick={cancel}>
                  Cancel meeting
                </Button>
                <Button variant="ghost" onClick={() => setCancelOpen(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-stone-500">Need a different time? Cancel and book again.</p>
              <Button variant="secondary" onClick={() => setCancelOpen(true)}>
                Cancel meeting
              </Button>
            </div>
          )}
        </div>
      </Card>
    </Shell>
  );
}

const Shell = ({ children }: { children: ReactNode }) => (
  <main className="mx-auto max-w-lg px-4 py-12 sm:py-20">{children}</main>
);

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-[5rem_1fr] gap-3">
    <dt className="text-stone-500">{label}</dt>
    <dd className="font-medium text-stone-800">{children}</dd>
  </div>
);
