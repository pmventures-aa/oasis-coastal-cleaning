/* The contact record: what we know, what is wrong, and whether they are
   still live in the book. */
import assert from 'node:assert/strict';
import { buildGroup, missingLine, completeness, clientFactGroups, propertyFactGroups,
  isBlank, factValue } from '../functions/_lib/recordFacts.js';
import { attentionFor, standingFor, isPastDay, ACTIVE_GRACE_DAYS }
  from '../functions/_lib/attention.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

/* -------------------------------------------------------------- facts */

test('a blank fact is dropped rather than printed as a dash', () => {
  const g = buildGroup('How to reach them', [
    { label: 'Name', value: 'Maria Delgado' },
    { label: 'Company', value: '' },
    { label: 'Phone', value: '—' },
    { label: 'Email', value: 'Not provided' }
  ]);
  assert.equal(g.facts.length, 1);
  assert.equal(g.facts[0].value, 'Maria Delgado');
  assert.equal(g.missing, 3, 'the dash and the placeholder count as absent');
});

test('what is missing is said once, not once per line', () => {
  const g = buildGroup('x', [{ label: 'a', value: '' }, { label: 'b', value: '' }]);
  assert.equal(missingLine(g), '2 more things not recorded.');
  assert.equal(missingLine(buildGroup('x', [{ label: 'a', value: '' }])),
    '1 more thing not recorded.');
  assert.equal(missingLine(buildGroup('x', [{ label: 'a', value: 'y' }])), '');
});

test('a yes-or-no reads as a word, and a list as a sentence', () => {
  assert.equal(factValue(true), 'Yes');
  assert.equal(factValue(false), 'No');
  assert.equal(factValue(['Tuesdays', 'Fridays']), 'Tuesdays, Fridays');
  assert.equal(factValue([null, '']), '');
  assert.equal(isBlank([null, '-']), true);
});

test('completeness counts across the groups, so a thin record shows as thin', () => {
  const groups = [
    buildGroup('a', [{ label: 'x', value: '1' }, { label: 'y', value: '' }]),
    buildGroup('b', [{ label: 'z', value: '2' }])
  ];
  assert.deepEqual(completeness(groups), { have: 2, total: 3, done: false });
  assert.equal(completeness([buildGroup('a', [{ label: 'x', value: '1' }])]).done, true);
});

test('a client with almost nothing on file still groups cleanly', () => {
  const groups = clientFactGroups({ name: 'Maria Delgado' });
  assert.equal(groups.length, 2);
  const reach = groups[0];
  assert.equal(reach.facts.length, 1);
  assert.ok(reach.missing > 0);
  /* The point: no group vanishes and none is a wall of dashes. */
  assert.ok(groups.every((g) => Array.isArray(g.facts)));
});

test('what the cleaner needs at the door belongs to the place, not the person', () => {
  const groups = propertyFactGroups(
    { access: 'Gate 4417', pets: 'Biscuit', warnings: 'Loose step' });
  const door = groups.find((g) => g.title === 'At the door');
  assert.deepEqual(door.facts.map((f) => f.label), ['Getting in', 'Pets', 'Careful']);
});

test('every place keeps its own door notes', () => {
  /* The beach house has a lockbox and no dog; the condo has a gate code
     and a cat that bolts. One set of notes for both is a cleaner at the
     wrong door with the wrong code. */
  const beach = propertyFactGroups({ access: 'Lockbox 2231' });
  const condo = propertyFactGroups({ access: 'Gate 4417', pets: 'Cat, bolts' });
  const doorOf = (g) => g.find((x) => x.title === 'At the door').facts
    .map((f) => f.label + ': ' + f.value);
  assert.deepEqual(doorOf(beach), ['Getting in: Lockbox 2231']);
  assert.deepEqual(doorOf(condo), ['Getting in: Gate 4417', 'Pets: Cat, bolts']);
});

/* ---------------------------------------------------------- attention */

test('late is judged by the day, not the minute', () => {
  assert.equal(isPastDay('2026-11-11', '2026-11-12T00:30:00Z'), true);
  assert.equal(isPastDay('2026-11-12', '2026-11-12T18:00:00Z'), false,
    'work due today must not read as overdue this evening');
});

test('overdue money comes first', () => {
  const items = attentionFor({
    invoices: [
      { id: 'i1', state: 'sent', balance: 5000, due_date: '2026-12-01' },
      { id: 'i2', state: 'sent', balance: 150050, due_date: '2026-11-01' }
    ],
    issues: [{ id: 's1', severity: 'attention', category_label: 'Damage' }]
  }, '2026-11-12T12:00:00Z');
  assert.equal(items[0].tone, 'overdue');
  assert.equal(items[0].title, '$1,500.50 overdue', 'two decimals, always');
});

test('a paid or voided invoice is not something to chase', () => {
  const items = attentionFor({ invoices: [
    { id: 'i1', state: 'paid', balance: 0, due_date: '2026-01-01' },
    { id: 'i2', state: 'void', balance: 9000, due_date: '2026-01-01' }
  ] }, '2026-11-12T12:00:00Z');
  assert.equal(items.length, 0);
});

test('an urgent find is as loud as late money; a resolved one is silent', () => {
  const items = attentionFor({ issues: [
    { id: 's1', severity: 'urgent', category_label: 'Leak' },
    { id: 's2', severity: 'urgent', category_label: 'Old one', resolved_at: '2026-11-01' }
  ] }, '2026-11-12T12:00:00Z');
  assert.equal(items.length, 1);
  assert.equal(items[0].tone, 'overdue');
  assert.match(items[0].title, /Urgent: Leak/);
});

test('a brand new client is not nagged about an empty diary', () => {
  /* Every new client has nothing booked. A strip that lights up for all
     of them is a strip nobody reads. */
  const fresh = attentionFor({ visits: [] }, '2026-11-12T12:00:00Z');
  assert.equal(fresh.length, 0);

  const lapsed = attentionFor({ visits: [
    { status: 'confirmed', start_at: '2026-10-01T14:00:00Z' }
  ] }, '2026-11-12T12:00:00Z');
  assert.equal(lapsed.length, 1);
  assert.equal(lapsed[0].title, 'Nothing booked');
});

test('nothing is wrong, so nothing is said', () => {
  assert.deepEqual(attentionFor({
    invoices: [{ id: 'i1', state: 'paid', balance: 0 }],
    visits: [{ status: 'confirmed', start_at: '2026-12-01T14:00:00Z' }]
  }, '2026-11-12T12:00:00Z'), []);
});

/* ----------------------------------------------------------- standing */

test('a quarterly client is not lapsed because a month went by', () => {
  const visits = [{ status: 'confirmed', start_at: '2026-10-05T14:00:00Z' }];
  assert.equal(standingFor({ visits }, '2026-11-12T12:00:00Z'), 'active');
});

test('past the grace window with nothing live, they are past', () => {
  const visits = [{ status: 'confirmed', start_at: '2026-01-05T14:00:00Z' }];
  assert.equal(standingFor({ visits }, '2026-11-12T12:00:00Z'), 'past');
});

test('money owed or a standing arrangement keeps them live', () => {
  const old = [{ status: 'confirmed', start_at: '2026-01-05T14:00:00Z' }];
  assert.equal(standingFor({ visits: old,
    invoices: [{ state: 'sent', balance: 100 }] }, '2026-11-12T12:00:00Z'), 'active');
  assert.equal(standingFor({ visits: old,
    jobs: [{ status: 'open' }] }, '2026-11-12T12:00:00Z'), 'active');
  assert.equal(standingFor({ visits: old,
    jobs: [{ status: 'paused' }] }, '2026-11-12T12:00:00Z'), 'active',
    'a job on hold is an arrangement, not an ending');
});

test('her own word beats every signal', () => {
  assert.equal(standingFor({ closed_at: '2026-11-01',
    visits: [{ status: 'confirmed', start_at: '2026-12-01T14:00:00Z' }] },
    '2026-11-12T12:00:00Z'), 'past');
});

test('somebody nothing has happened with is new, not past', () => {
  assert.equal(standingFor({}, '2026-11-12T12:00:00Z'), 'new');
  assert.equal(ACTIVE_GRACE_DAYS, 60);
});

/* ------------------------------------------------- she said so (0028) */

test('a client marked finished reads as past whatever the signals say', () => {
  /* standingFor has deferred to closed_at since it was written, and the
     record route has always passed customer.closed_at into it -- but the
     column did not exist, so the value was undefined every time and the
     override could not fire. Someone she had parted with went on reading as
     active for the full sixty days of grace. */
  const live = {
    visits: [{ status: 'confirmed', start_at: '2026-12-20T14:00:00Z' }],
    invoices: [{ state: 'sent', balance: 9000, created_at: '2026-11-01' }],
    jobs: [{ status: 'open' }]
  };
  assert.equal(standingFor(live, '2026-11-12T12:00:00Z'), 'active');
  assert.equal(standingFor({ ...live, closed_at: '2026-11-10T09:00:00Z' },
    '2026-11-12T12:00:00Z'), 'past');
});

test('clearing it hands them back to the signals', () => {
  const live = { visits: [{ status: 'confirmed', start_at: '2026-12-20T14:00:00Z' }] };
  assert.equal(standingFor({ ...live, closed_at: null }, '2026-11-12T12:00:00Z'), 'active');
});

test('finished is not the same as nothing has happened', () => {
  /* A client with no history at all is new, not past. The override only
     speaks for someone she has actually decided about. */
  assert.equal(standingFor({}, '2026-11-12T12:00:00Z'), 'new');
  assert.equal(standingFor({ closed_at: '2026-11-10T09:00:00Z' }, '2026-11-12T12:00:00Z'), 'past');
});

console.log('\n' + n + ' passed');
