import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeSlots, type SlotInput } from './slots';
import type { Availability } from './types';

const nineToFive = [{ start: '09:00', end: '17:00' }];
const availability: Availability = {
  timezone: 'Asia/Colombo', // UTC+5:30, no DST
  weekly: { mon: nineToFive, tue: nineToFive, wed: nineToFive, thu: nineToFive, fri: nineToFive, sat: [], sun: [] },
};
const rules = {
  durationMin: 30,
  slotIntervalMin: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minNoticeMin: 0,
  maxDaysAhead: 60,
};

// Monday 2026-10-12 in Colombo = 2026-10-11T18:30Z .. 2026-10-12T18:30Z
const monStart = Date.parse('2026-10-11T18:30:00Z');
const monEnd = Date.parse('2026-10-12T18:30:00Z');
const base: SlotInput = {
  availability,
  overrides: new Map(),
  rules,
  busy: [],
  from: monStart,
  to: monEnd,
  now: Date.parse('2026-10-01T00:00:00Z'),
};

test('weekday produces 16 half-hour slots in host timezone', () => {
  const slots = computeSlots(base);
  assert.equal(slots.length, 16);
  assert.equal(slots[0], '2026-10-12T03:30:00.000Z'); // 09:00 Colombo
  assert.equal(slots.at(-1), '2026-10-12T11:00:00.000Z'); // 16:30 Colombo
});

test('weekend has no slots', () => {
  const slots = computeSlots({ ...base, from: monStart - 2 * 86400000, to: monStart });
  assert.deepEqual(slots, []);
});

test('busy time and buffers remove overlapping slots', () => {
  const busy = [{ start: Date.parse('2026-10-12T04:30:00Z'), end: Date.parse('2026-10-12T05:00:00Z') }]; // 10:00-10:30
  assert.equal(computeSlots({ ...base, busy }).length, 15);
  const buffered = computeSlots({ ...base, busy, rules: { ...rules, bufferBeforeMin: 15, bufferAfterMin: 15 } });
  assert.ok(!buffered.includes('2026-10-12T04:00:00.000Z')); // 9:30 ends at 10:00 + 15 min buffer
  assert.ok(!buffered.includes('2026-10-12T05:00:00.000Z')); // 10:30 starts 0 min after busy
  assert.equal(buffered.length, 13);
});

test('date override replaces weekly hours; empty override = day off', () => {
  const custom = computeSlots({ ...base, overrides: new Map([['2026-10-12', [{ start: '13:00', end: '14:00' }]]]) });
  assert.deepEqual(custom, ['2026-10-12T07:30:00.000Z', '2026-10-12T08:00:00.000Z']);
  assert.deepEqual(computeSlots({ ...base, overrides: new Map([['2026-10-12', []]]) }), []);
});

test('minimum notice and booking horizon are respected', () => {
  const now = Date.parse('2026-10-12T05:10:00Z'); // 10:40 Colombo
  const slots = computeSlots({ ...base, now, rules: { ...rules, minNoticeMin: 60 } });
  assert.equal(slots[0], '2026-10-12T06:30:00.000Z'); // 12:00 is first start >= 11:40
  const far = computeSlots({ ...base, now: monStart - 86400000 * 10, rules: { ...rules, maxDaysAhead: 5 } });
  assert.deepEqual(far, []);
});

test('DST zone keeps local wall-clock hours', () => {
  const ny: Availability = { ...availability, timezone: 'America/New_York' };
  // Sunday 2026-11-01 DST ends; check Monday 2026-11-02 starts at 09:00 EST = 14:00Z
  const from = Date.parse('2026-11-02T05:00:00Z');
  const slots = computeSlots({ ...base, availability: ny, from, to: from + 86400000 });
  assert.equal(slots[0], '2026-11-02T14:00:00.000Z');
});
