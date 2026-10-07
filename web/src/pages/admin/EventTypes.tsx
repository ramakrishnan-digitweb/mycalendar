import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert, Button, Card, Field, Input, Loading, Select, Textarea, cx } from '../../components/ui';
import { LOCATION_LABELS, durationLabel, locationSummary } from '../../lib/time';
import type { EventType, EventTypeInput, LocationType } from '../../types';
import { adminApi } from './adminApi';

const NEW_EVENT: EventTypeInput = {
  slug: '30min',
  title: '30 minute meeting',
  description: '',
  durationMin: 30,
  slotIntervalMin: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 10,
  minNoticeMin: 240,
  maxDaysAhead: 60,
  location: { type: 'google_meet', value: '' },
  active: true,
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export default function EventTypes() {
  const [list, setList] = useState<EventType[] | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; data: EventTypeInput } | null>(null);
  const [error, setError] = useState('');

  const load = () => adminApi.eventTypes().then(setList, (e: Error) => setError(e.message));
  useEffect(() => void load(), []);

  if (editing) {
    return (
      <Editor
        initial={editing.data}
        id={editing.id}
        onDone={() => {
          setEditing(null);
          void load();
        }}
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Meeting types</h1>
        <Button onClick={() => setEditing({ id: null, data: { ...NEW_EVENT, slug: list?.length ? '' : NEW_EVENT.slug } })}>
          + New
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {!list ? (
        !error && <Loading />
      ) : list.length === 0 ? (
        <Card className="p-10 text-center text-stone-500">
          No meeting types yet. Create one so people can book you.
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((et) => (
            <li key={et.id}>
              <Card className={cx('flex h-full flex-col p-5', !et.active && 'opacity-60')}>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{et.title}</h2>
                  {!et.active && <span className="rounded bg-stone-200 px-1.5 py-0.5 text-xs">Hidden</span>}
                </div>
                <p className="mt-1 text-sm text-stone-500">
                  {durationLabel(et.durationMin)} · {locationSummary(et.location)}
                </p>
                <p className="mt-1 truncate text-sm text-teal-700">
                  {location.origin}/{et.slug}
                </p>
                <div className="mt-4 flex gap-2 pt-1">
                  <Button variant="secondary" onClick={() => setEditing({ id: et.id, data: et })}>
                    Edit
                  </Button>
                  <Button variant="ghost" onClick={() => navigator.clipboard.writeText(`${location.origin}/${et.slug}`)}>
                    Copy link
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Editor({ initial, id, onDone }: { initial: EventTypeInput; id: string | null; onDone: () => void }) {
  const [data, setData] = useState<EventTypeInput>(() => {
    const { slug, title, description, durationMin, slotIntervalMin, bufferBeforeMin, bufferAfterMin, minNoticeMin, maxDaysAhead, location, active } =
      initial;
    return { slug, title, description, durationMin, slotIntervalMin, bufferBeforeMin, bufferAfterMin, minNoticeMin, maxDaysAhead, location, active };
  });
  const [slugTouched, setSlugTouched] = useState(Boolean(id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = <K extends keyof EventTypeInput>(k: K, v: EventTypeInput[K]) => setData((d) => ({ ...d, [k]: v }));
  const num = (k: 'durationMin' | 'slotIntervalMin' | 'bufferBeforeMin' | 'bufferAfterMin' | 'minNoticeMin' | 'maxDaysAhead') => ({
    type: 'number',
    min: 0,
    required: true,
    value: String(data[k]),
    onChange: (e: ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value)),
  });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (id) await adminApi.updateEventType(id, data);
      else await adminApi.createEventType(data);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!id || !window.confirm(`Delete "${data.title}"? Existing bookings are kept.`)) return;
    setBusy(true);
    try {
      await adminApi.deleteEventType(id);
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const needsValue = data.location.type !== 'google_meet';

  return (
    <form onSubmit={save}>
      <button type="button" onClick={onDone} className="mb-4 text-sm text-teal-700 hover:underline">
        ← All meeting types
      </button>
      <h1 className="mb-6 text-2xl font-semibold">{id ? 'Edit meeting type' : 'New meeting type'}</h1>
      <Card className="space-y-8 p-6">
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Title">
            <Input
              required
              value={data.title}
              onChange={(e) => {
                set('title', e.target.value);
                if (!slugTouched) set('slug', slugify(e.target.value));
              }}
            />
          </Field>
          <Field label="Link" hint={`${location.origin}/${data.slug || '…'}`}>
            <Input
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={data.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set('slug', e.target.value.toLowerCase());
              }}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description (shown on the booking page)">
              <Textarea value={data.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Location">
            <Select
              value={data.location.type}
              onChange={(e) => set('location', { ...data.location, type: e.target.value as LocationType })}
            >
              {Object.entries(LOCATION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          {needsValue ? (
            <Field label={data.location.type === 'phone' ? 'Phone details' : data.location.type === 'in_person' ? 'Address' : 'Location details'}>
              <Input
                required
                value={data.location.value ?? ''}
                placeholder={data.location.type === 'phone' ? 'I will call you on the number you share' : ''}
                onChange={(e) => set('location', { ...data.location, value: e.target.value })}
              />
            </Field>
          ) : (
            <p className="self-end pb-2 text-sm text-stone-500">A Meet link is created for each booking (needs Google Calendar connected).</p>
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <Field label="Duration (minutes)">
            <Input {...num('durationMin')} min={5} />
          </Field>
          <Field label="Start times every (minutes)" hint="e.g. 30 → 9:00, 9:30, 10:00">
            <Input {...num('slotIntervalMin')} min={5} />
          </Field>
          <Field label="Buffer before (minutes)">
            <Input {...num('bufferBeforeMin')} />
          </Field>
          <Field label="Buffer after (minutes)">
            <Input {...num('bufferAfterMin')} />
          </Field>
          <Field label="Minimum notice (minutes)" hint="240 = no bookings less than 4 hours away">
            <Input {...num('minNoticeMin')} />
          </Field>
          <Field label="Bookable up to (days ahead)">
            <Input {...num('maxDaysAhead')} min={1} />
          </Field>
        </section>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={data.active} onChange={(e) => set('active', e.target.checked)} className="size-4 accent-teal-700" />
          Visible and bookable
        </label>

        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap gap-2 border-t border-stone-200 pt-6">
          <Button type="submit" busy={busy}>
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          {id && (
            <Button type="button" variant="ghost" className="ml-auto text-red-700 hover:bg-red-50" onClick={remove}>
              Delete
            </Button>
          )}
        </div>
      </Card>
    </form>
  );
}
