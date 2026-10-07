import { DateTime } from 'luxon';
import { useEffect, useState } from 'react';
import { TimezoneSelect } from '../../components/TimezoneSelect';
import { Alert, Button, Card, Field, Input, Loading } from '../../components/ui';
import { browserZone } from '../../lib/time';
import type { Availability as AvailabilityT, DateOverride, TimeRange, Weekday } from '../../types';
import { adminApi } from './adminApi';

const DAYS: { key: Weekday; label: string }[] = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];
const DEFAULT_RANGE: TimeRange = { start: '09:00', end: '17:00' };

export default function Availability() {
  const [avail, setAvail] = useState<AvailabilityT | null>(null);
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi.availability().then(
      (res) => {
        setIsDefault(res.isDefault);
        setAvail(res.isDefault ? { ...res.availability, timezone: browserZone() } : res.availability);
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  const save = async () => {
    if (!avail) return;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      setAvail(await adminApi.saveAvailability(avail));
      setIsDefault(false);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!avail) return error ? <Alert>{error}</Alert> : <Loading />;

  const setDay = (day: Weekday, ranges: TimeRange[]) => {
    setSaved(false);
    setAvail({ ...avail, weekly: { ...avail.weekly, [day]: ranges } });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Availability</h1>
        <p className="mt-1 text-sm text-stone-600">
          Your weekly working hours. Busy times in your Google Calendar and existing bookings are removed automatically.
        </p>
      </div>

      {isDefault && <Alert tone="info">These are default hours and are not saved yet. Review them and press Save.</Alert>}

      <Card className="space-y-6 p-6">
        <Field label="Your time zone">
          <TimezoneSelect
            value={avail.timezone}
            onChange={(timezone) => {
              setSaved(false);
              setAvail({ ...avail, timezone });
            }}
          />
        </Field>

        <ul className="divide-y divide-stone-100">
          {DAYS.map(({ key, label }) => {
            const ranges = avail.weekly[key];
            const on = ranges.length > 0;
            return (
              <li key={key} className="flex flex-wrap items-start gap-4 py-3">
                <label className="flex w-32 items-center gap-2 pt-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => setDay(key, e.target.checked ? [DEFAULT_RANGE] : [])}
                    className="size-4 accent-teal-700"
                  />
                  {label}
                </label>
                {on ? (
                  <RangesEditor ranges={ranges} onChange={(r) => setDay(key, r)} />
                ) : (
                  <span className="pt-2 text-sm text-stone-400">Unavailable</span>
                )}
              </li>
            );
          })}
        </ul>

        {error && <Alert>{error}</Alert>}
        {saved && <Alert tone="success">Saved.</Alert>}
        <Button onClick={save} busy={busy}>
          Save weekly hours
        </Button>
      </Card>

      <Overrides timezone={avail.timezone} />
    </div>
  );
}

function RangesEditor({ ranges, onChange }: { ranges: TimeRange[]; onChange: (r: TimeRange[]) => void }) {
  const update = (i: number, patch: Partial<TimeRange>) => onChange(ranges.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      {ranges.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input type="time" value={r.start} onChange={(e) => update(i, { start: e.target.value })} className="w-32" />
          <span className="text-stone-400">–</span>
          <Input type="time" value={r.end} onChange={(e) => update(i, { end: e.target.value })} className="w-32" />
          <button
            type="button"
            aria-label="Remove time range"
            onClick={() => onChange(ranges.filter((_, j) => j !== i))}
            className="grid size-8 place-items-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const last = ranges.at(-1);
          onChange([...ranges, last ? { start: last.end, end: last.end < '23:00' ? addHour(last.end) : '23:59' } : DEFAULT_RANGE]);
        }}
        className="text-sm text-teal-700 hover:underline"
      >
        + Add hours
      </button>
    </div>
  );
}

const addHour = (hhmm: string) => DateTime.fromFormat(hhmm, 'HH:mm').plus({ hours: 1 }).toFormat('HH:mm');

function Overrides({ timezone }: { timezone: string }) {
  const [list, setList] = useState<DateOverride[] | null>(null);
  const [date, setDate] = useState('');
  const [mode, setMode] = useState<'off' | 'custom'>('off');
  const [ranges, setRanges] = useState<TimeRange[]>([DEFAULT_RANGE]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => adminApi.overrides().then(setList, (e: Error) => setError(e.message));
  useEffect(() => void load(), []);

  const add = async () => {
    if (!date) return setError('Pick a date.');
    setBusy(true);
    setError('');
    try {
      await adminApi.saveOverride(date, mode === 'off' ? [] : ranges);
      setDate('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: string) => {
    try {
      await adminApi.deleteOverride(d);
      setList((l) => l?.filter((o) => o.date !== d) ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const today = DateTime.now().setZone(timezone).toISODate()!;

  return (
    <Card className="space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold">Date overrides</h2>
        <p className="mt-1 text-sm text-stone-600">Days off or different hours for specific dates (in {timezone}).</p>
      </div>

      <div className="flex flex-wrap items-start gap-4 rounded-xl bg-stone-50 p-4">
        <Field label="Date">
          <Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </Field>
        <fieldset className="space-y-2 pt-1">
          <legend className="mb-1.5 text-sm font-medium text-stone-700">On this day</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={mode === 'off'} onChange={() => setMode('off')} className="accent-teal-700" />
            Unavailable all day
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={mode === 'custom'} onChange={() => setMode('custom')} className="accent-teal-700" />
            Different hours
          </label>
        </fieldset>
        {mode === 'custom' && (
          <div className="pt-7">
            <RangesEditor ranges={ranges} onChange={setRanges} />
          </div>
        )}
        <div className="w-full">
          <Button variant="secondary" onClick={add} busy={busy}>
            Add override
          </Button>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}
      {!list ? (
        !error && <Loading />
      ) : list.length === 0 ? (
        <p className="text-sm text-stone-500">No upcoming overrides.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {list.map((o) => (
            <li key={o.date} className="flex items-center justify-between gap-4 py-3 text-sm">
              <span className="font-medium">{DateTime.fromISO(o.date).toFormat('ccc, d LLL yyyy')}</span>
              <span className="flex-1 text-stone-600">
                {o.ranges.length ? o.ranges.map((r) => `${r.start}–${r.end}`).join(', ') : 'Unavailable'}
              </span>
              <Button variant="ghost" onClick={() => remove(o.date)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
