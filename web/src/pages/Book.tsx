import { DateTime } from 'luxon';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { MonthCalendar } from '../components/MonthCalendar';
import { TimezoneSelect } from '../components/TimezoneSelect';
import { Alert, Button, Card, Field, Input, Loading, Spinner, Textarea, cx } from '../components/ui';
import { ApiError, publicApi } from '../lib/api';
import { browserZone, durationLabel, fmtDateLong, fmtRange, fmtTime, locationSummary } from '../lib/time';
import type { PublicEventTypeResponse } from '../types';

export default function Book() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();

  const [info, setInfo] = useState<PublicEventTypeResponse | null>(null);
  const [notFound, setNotFound] = useState('');
  const [zone, setZone] = useState(browserZone);
  const [month, setMonth] = useState<DateTime>(() => DateTime.now().setZone(browserZone()).startOf('month'));
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotsError, setSlotsError] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [form, setForm] = useState({ name: '', email: '', notes: '', website: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    publicApi.eventType(slug).then(
      (res) => {
        setInfo(res);
        document.title = `${res.eventType.title} · ${res.host.name}`;
      },
      (e: Error) => setNotFound(e.message),
    );
  }, [slug]);

  const loadSlots = useCallback(async () => {
    setSlotsLoading(true);
    setSlotsError('');
    const now = DateTime.now();
    const from = DateTime.max(month.startOf('month'), now);
    const to = month.plus({ months: 1 }).startOf('month');
    try {
      const res = to > from ? await publicApi.slots(slug, from.toUTC().toISO()!, to.toUTC().toISO()!) : { slots: [] };
      setSlots(res.slots);
    } catch (e) {
      setSlotsError((e as Error).message);
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [slug, month]);

  useEffect(() => {
    if (info) void loadSlots();
  }, [info, loadSlots]);

  // Group slots by local date in the viewer's zone.
  const byDate = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of slots) {
      const d = DateTime.fromISO(s, { zone }).toISODate()!;
      map.set(d, [...(map.get(d) ?? []), s]);
    }
    return map;
  }, [slots, zone]);

  // Keep the selected date valid: default to the first available day of the month.
  useEffect(() => {
    if (slotsLoading) return;
    if (!selectedDate || !byDate.has(selectedDate)) setSelectedDate(byDate.keys().next().value ?? null);
  }, [byDate, slotsLoading, selectedDate]);

  const changeZone = (z: string) => {
    setZone(z);
    setMonth((m) => m.setZone(z, { keepLocalTime: true }).startOf('month'));
    setSelectedSlot(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await publicApi.book({ eventSlug: slug, start: selectedSlot, timezone: zone, ...form });
      navigate(`/booking/${res.booking.id}?token=${encodeURIComponent(res.token)}&new=1`);
    } catch (err) {
      setSubmitError((err as Error).message);
      if (err instanceof ApiError && err.status === 409) {
        setSelectedSlot(null);
        void loadSlots();
      }
      setSubmitting(false);
    }
  };

  if (notFound) {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold">Meeting type not found</h1>
        <p className="mt-2 text-stone-600">{notFound}</p>
        <Link to="/" className="mt-6 inline-block text-teal-700 underline">
          See all meeting types
        </Link>
      </main>
    );
  }
  if (!info) return <Loading />;

  const { eventType: et, host } = info;
  const daySlots = selectedDate ? (byDate.get(selectedDate) ?? []) : [];
  const currentMonth = DateTime.now().setZone(zone).startOf('month');
  const endOf = (s: string) => DateTime.fromISO(s).plus({ minutes: et.durationMin }).toISO()!;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:py-14">
      <Card className="grid overflow-hidden md:grid-cols-[minmax(0,17rem)_1fr]">
        <aside className="border-b border-stone-200 p-6 md:border-r md:border-b-0">
          <Link to="/" className="text-sm text-stone-500 hover:text-stone-800">
            {host.name}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{et.title}</h1>
          <ul className="mt-4 space-y-2 text-sm text-stone-600">
            <li>⏱ {durationLabel(et.durationMin)}</li>
            <li>📍 {locationSummary(et.location)}</li>
            {selectedSlot && <li className="font-medium text-teal-800">🗓 {fmtRange(selectedSlot, endOf(selectedSlot), zone)}</li>}
          </ul>
          {et.description && <p className="mt-4 whitespace-pre-line text-sm text-stone-600">{et.description}</p>}
        </aside>

        {selectedSlot ? (
          <section className="p-6">
            <button type="button" onClick={() => setSelectedSlot(null)} className="mb-4 text-sm text-teal-700 hover:underline">
              ← Back
            </button>
            <h2 className="text-lg font-semibold">Enter your details</h2>
            <form onSubmit={submit} className="mt-4 max-w-md space-y-4">
              <Field label="Your name">
                <Input required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Email" hint="Confirmation and calendar invite are sent here.">
                <Input
                  required
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="Anything to share before the meeting? (optional)">
                <Textarea value={form.notes} maxLength={2000} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </Field>
              {/* Honeypot: hidden from people, bots fill it. */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden
                className="absolute -left-[9999px] size-px opacity-0"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
              {submitError && <Alert>{submitError}</Alert>}
              <Button type="submit" busy={submitting} className="w-full sm:w-auto">
                Confirm booking
              </Button>
            </form>
          </section>
        ) : (
          <section className="grid gap-6 p-6 lg:grid-cols-[1fr_13rem]">
            <div>
              <h2 className="mb-4 text-lg font-semibold">Select a date & time</h2>
              <MonthCalendar
                month={month}
                available={new Set(byDate.keys())}
                selected={selectedDate}
                onSelect={setSelectedDate}
                onMonthChange={setMonth}
                canGoBack={month > currentMonth}
                loading={slotsLoading}
              />
              <div className="mt-6">
                <label htmlFor="tz" className="mb-1.5 block text-sm font-medium text-stone-700">
                  Time zone
                </label>
                <TimezoneSelect id="tz" value={zone} onChange={changeZone} />
              </div>
              {slotsError && (
                <div className="mt-4">
                  <Alert>{slotsError}</Alert>
                </div>
              )}
              {!slotsLoading && !slotsError && byDate.size === 0 && (
                <div className="mt-4 rounded-lg bg-stone-100 p-4 text-sm text-stone-600">
                  No open times in {month.toFormat('LLLL')}.{' '}
                  <button type="button" className="font-medium text-teal-700 underline" onClick={() => setMonth(month.plus({ months: 1 }))}>
                    Check next month
                  </button>
                </div>
              )}
            </div>

            <div>
              {slotsLoading ? (
                <div className="flex justify-center pt-10 text-stone-400">
                  <Spinner />
                </div>
              ) : (
                selectedDate && (
                  <>
                    <h3 className="mb-3 text-sm font-medium text-stone-700">{fmtDateLong(selectedDate, zone)}</h3>
                    <ul className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
                      {daySlots.map((s) => (
                        <li key={s}>
                          <button
                            type="button"
                            onClick={() => setSelectedSlot(s)}
                            className={cx(
                              'w-full rounded-lg border border-teal-600/40 py-2.5 text-sm font-semibold text-teal-800 transition',
                              'hover:border-teal-700 hover:bg-teal-50',
                            )}
                          >
                            {fmtTime(s, zone)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )
              )}
            </div>
          </section>
        )}
      </Card>
    </main>
  );
}
