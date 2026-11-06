/* Florida observes daylight saving. A diary that assumes every day is 24
   hours long is wrong twice a year, and the two days it is wrong on are the
   two nobody checks. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  localToUtc, localStampToUtc, localDateOf, addDays, weekdayOf,
  spanOf, overlaps, expandBlock, outsideWorkingHours, findConflicts
} from '../functions/_lib/schedule.js';

const H = 3600000;

test('local wall clock to instant', async (t) => {
  await t.test('winter is UTC-5', () => {
    assert.equal(localToUtc(2026, 1, 15, 9, 0).toISOString(), '2026-01-15T14:00:00.000Z');
  });
  await t.test('summer is UTC-4', () => {
    assert.equal(localToUtc(2026, 7, 15, 9, 0).toISOString(), '2026-07-15T13:00:00.000Z');
  });
  await t.test('the morning the clocks go forward', () => {
    /* 2026-03-08: 2am jumps to 3am. 9am is still 9am, on the new offset. */
    assert.equal(localToUtc(2026, 3, 8, 9, 0).toISOString(), '2026-03-08T13:00:00.000Z');
  });
  await t.test('the morning the clocks go back', () => {
    assert.equal(localToUtc(2026, 11, 1, 9, 0).toISOString(), '2026-11-01T14:00:00.000Z');
  });
  await t.test('a time that does not exist resolves rather than throws', () => {
    /* 2:30am on spring-forward Sunday never happens. */
    const t230 = localToUtc(2026, 3, 8, 2, 30);
    assert.ok(!isNaN(t230.getTime()));
    assert.equal(localDateOf(t230), '2026-03-08', 'and it stays on the right day');
  });
});

test('an all-day block is calendar days, not 24-hour slabs', async (t) => {
  await t.test('an ordinary day is 24 hours', () => {
    const s = spanOf({ all_day: 1, start_date: '2026-01-15', end_date: '2026-01-15' });
    assert.equal((s.end - s.start) / H, 24);
  });
  await t.test('spring forward makes it 23', () => {
    const s = spanOf({ all_day: 1, start_date: '2026-03-08', end_date: '2026-03-08' });
    assert.equal((s.end - s.start) / H, 23, 'a 24-hour assumption leaks an hour into the next day');
  });
  await t.test('and falling back makes it 25', () => {
    const s = spanOf({ all_day: 1, start_date: '2026-11-01', end_date: '2026-11-01' });
    assert.equal((s.end - s.start) / H, 25);
  });
  await t.test('a multi-day block ends at midnight after its last day', () => {
    const s = spanOf({ all_day: 1, start_date: '2026-06-01', end_date: '2026-06-03' });
    assert.equal(localDateOf(new Date(s.start)), '2026-06-01');
    assert.equal((s.end - s.start) / H, 72, 'three whole days');
  });
});

test('overlap is half-open', async (t) => {
  const at = (d, a, b) => ({ all_day: 0,
    start_at: localStampToUtc(d, a).toISOString(), end_at: localStampToUtc(d, b).toISOString() });

  await t.test('back-to-back jobs do not fight over the boundary', () => {
    assert.equal(overlaps(spanOf(at('2026-06-01', '10:00', '12:00')),
                          spanOf(at('2026-06-01', '12:00', '14:00'))), false);
  });
  await t.test('a minute of genuine overlap counts', () => {
    assert.equal(overlaps(spanOf(at('2026-06-01', '10:00', '12:00')),
                          spanOf(at('2026-06-01', '11:59', '13:00'))), true);
  });
  await t.test('an appointment crossing midnight overlaps the next morning', () => {
    const late = { all_day: 0,
      start_at: localStampToUtc('2026-06-01', '22:00').toISOString(),
      end_at: localStampToUtc('2026-06-02', '02:00').toISOString() };
    assert.equal(overlaps(spanOf(late), spanOf(at('2026-06-02', '01:00', '03:00'))), true);
    assert.equal(overlaps(spanOf(late), spanOf(at('2026-06-02', '09:00', '11:00'))), false);
  });
  await t.test('an all-day block swallows every timed job that day', () => {
    const allDay = { all_day: 1, start_date: '2026-06-01', end_date: '2026-06-01' };
    assert.equal(overlaps(spanOf(allDay), spanOf(at('2026-06-01', '07:00', '09:00'))), true);
    assert.equal(overlaps(spanOf(allDay), spanOf(at('2026-06-02', '07:00', '09:00'))), false);
  });
});

test('a weekly block becomes the days it actually falls on', async (t) => {
  const block = {
    id: 'b1', all_day: 0, repeat_freq: 'weekly', repeat_days: '[5]',   // Fridays
    start_at: localStampToUtc('2026-06-05', '12:00').toISOString(),
    end_at: localStampToUtc('2026-06-05', '17:00').toISOString(),
    repeat_until: '2026-06-30', skip_dates: '["2026-06-19"]'
  };

  await t.test('every Friday in the window, minus the one lifted out', () => {
    const out = expandBlock(block, '2026-06-01', '2026-06-30');
    assert.deepEqual(out.map((o) => o.occurrence_date), ['2026-06-05', '2026-06-12', '2026-06-26']);
  });
  await t.test('it stops when the rule says to', () => {
    assert.equal(expandBlock(block, '2026-07-01', '2026-07-31').length, 0);
  });
  await t.test('each occurrence keeps the same wall-clock hours across DST', () => {
    const year = { ...block, repeat_until: '2026-12-31', skip_dates: '[]' };
    const out = expandBlock(year, '2026-10-26', '2026-11-08');
    const hours = out.map((o) => localStampToUtc(o.occurrence_date, '12:00').toISOString() === o.start_at);
    assert.deepEqual(hours, [true, true], 'noon stays noon on both sides of the change');
  });
  await t.test('an occurrence knows which block it came from', () => {
    const one = expandBlock(block, '2026-06-05', '2026-06-05')[0];
    assert.equal(one.occurrence_of, 'b1');
    assert.notEqual(one.id, 'b1', 'so moving one does not look like moving the rule');
  });
});

test('working hours come from the hours already published', async (t) => {
  await t.test('a Sunday evening job is flagged', () => {
    assert.equal(outsideWorkingHours({ all_day: 0,
      start_at: localStampToUtc('2026-06-07', '16:00').toISOString(),
      end_at: localStampToUtc('2026-06-07', '18:00').toISOString() }), true);
  });
  await t.test('the same hours on a Tuesday are fine', () => {
    assert.equal(outsideWorkingHours({ all_day: 0,
      start_at: localStampToUtc('2026-06-02', '16:00').toISOString(),
      end_at: localStampToUtc('2026-06-02', '18:00').toISOString() }), false);
  });
  await t.test('a job ending after close is flagged even if it starts inside', () => {
    assert.equal(outsideWorkingHours({ all_day: 0,
      start_at: localStampToUtc('2026-06-06', '16:00').toISOString(),   // Sat, closes 5
      end_at: localStampToUtc('2026-06-06', '18:00').toISOString() }), true);
  });
});

test('cancelled work releases its time; tentative work does not', async (t) => {
  const slot = { all_day: 0,
    start_at: localStampToUtc('2026-06-02', '10:00').toISOString(),
    end_at: localStampToUtc('2026-06-02', '12:00').toISOString() };
  const existing = (status) => ([{ id: 'a1', status, customer_name: 'Maria', ...slot }]);

  await t.test('a confirmed clean blocks it', () => {
    assert.equal(findConflicts(slot, { appointments: existing('confirmed') }).length, 1);
  });
  await t.test('a tentative one blocks it too', () => {
    const hit = findConflicts(slot, { appointments: existing('tentative') });
    assert.equal(hit.length, 1);
    assert.equal(hit[0].status, 'tentative', 'and says which it is');
  });
  await t.test('a cancelled one does not', () => {
    assert.equal(findConflicts(slot, { appointments: existing('cancelled') }).length, 0);
  });
  await t.test('editing an appointment does not conflict with itself', () => {
    assert.equal(findConflicts(slot, { appointments: existing('confirmed'), ignoreId: 'a1' }).length, 0);
  });
  await t.test('a conflict names what it ran into', () => {
    const hit = findConflicts(slot, { appointments: existing('confirmed') })[0];
    assert.equal(hit.label, 'Maria');
    assert.equal(hit.kind, 'appointment');
  });
});
