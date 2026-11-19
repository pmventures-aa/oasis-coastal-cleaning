/* A database that is behind the code.
   -------------------------------------------------------------------------
   There is no wrangler token in the deploy environment, so
   `npx wrangler d1 migrations apply` is not a step anybody working on this
   site can take. Migrations reach the live database when somebody with the
   Cloudflare account runs them, or when applySchema does it from inside the
   app. Between a deploy and that moment, the code is ahead of the database.

   That gap took the portal down for a week. The requests list is the first
   thing /admin loads, its query names columns from several migrations, and
   one of them was not there. The route reported "the leads table is missing"
   -- a guess, printed as a fact, for every possible failure -- and told
   Kristina to run the command she had no way to run. The screen then wrote
   that message over the whole application, so the nav went with it, and with
   the nav went Settings and the button that would have fixed it.

   These run every admin route against a database stopped at an early
   migration. None of them may fail that way again. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeD1 } from './helpers/d1.mjs';
import { makeSessionCookie } from '../functions/_lib/auth.js';

const env = (d) => ({ DB: d, ADMIN_PASSWORD: 'x', SESSION_SECRET: 's'.repeat(32),
  SITE_URL: 'https://x.test', QUOTE_TO_EMAIL: 'kr@test.co' });

/* Only the two oldest migrations: the shape the live database had while the
   portal was down. */
const OLD = ['0001_leads.sql', '0002_quotes.sql'];

const ROUTES = ['leads', 'pipeline', 'customers', 'schedule', 'settings', 'invoices',
  'price-book', 'users', 'security', 'status', 'issues', 'slots', 'email', 'jobs'];

test('no admin screen 503s because the database is behind', async () => {
  const d = makeD1(OLD);
  const cookie = (await makeSessionCookie(env(d), false)).split(';')[0];
  const broken = [];

  for (const name of ROUTES) {
    const mod = await import(`../functions/api/admin/${name}.js`);
    if (!mod.onRequestGet) continue;
    let res;
    try {
      res = await mod.onRequestGet({
        request: new Request(`https://x.test/api/admin/${name}`, { headers: { Cookie: cookie } }),
        env: env(d), params: {} });
    } catch (err) {
      broken.push(`${name}: threw ${err.message}`);
      continue;
    }
    if (res.status >= 500) {
      const body = await res.json().catch(() => ({}));
      broken.push(`${name}: ${res.status} ${body.error || ''}`);
    }
  }

  assert.deepEqual(broken, [],
    'these fail on a database that is behind, and the portal loads them on sign-in');
});

test('the requests list brings the database up to date rather than giving up', async () => {
  const d = makeD1(OLD);
  assert.ok(!d._raw.prepare("SELECT name FROM pragma_table_info('leads')").all()
    .some((c) => c.name === 'converted_at'), 'this database should start without it');

  d._raw.exec(`INSERT INTO leads (id, created_at, name, phone, email, service)
    VALUES ('l1','2026-11-19','Maria Delgado','5610000000','m@a.co','home')`);

  const leads = await import('../functions/api/admin/leads.js');
  const cookie = (await makeSessionCookie(env(d), false)).split(';')[0];
  const res = await leads.onRequestGet({
    request: new Request('https://x.test/api/admin/leads', { headers: { Cookie: cookie } }),
    env: env(d) });

  assert.equal(res.status, 200, 'the list should come back, not a setup message');
  assert.equal((await res.json()).leads.length, 1, 'and the request should be in it');
  assert.ok(d._raw.prepare("SELECT name FROM pragma_table_info('leads')").all()
    .some((c) => c.name === 'converted_at'), 'the missing column should have been added');
});

test('a failure that is not a missing table does not claim one', async () => {
  /* The message was wrong in a specific way: it named the table as the cause
     of every failure, including the ones where the table was plainly there. */
  const leads = await import('../functions/api/admin/leads.js');
  const d = makeD1(OLD);
  const cookie = (await makeSessionCookie(env(d), false)).split(';')[0];

  /* A database that answers nothing at all: applySchema cannot help, so this
     is the path where the route does have to report a failure. */
  const dead = { prepare: () => ({ bind: () => ({ all: () => Promise.reject(new Error('D1_ERROR: network')) }),
                                   first: () => Promise.reject(new Error('D1_ERROR: network')),
                                   run: () => Promise.reject(new Error('D1_ERROR: network')) }) };
  const res = await leads.onRequestGet({
    request: new Request('https://x.test/api/admin/leads', { headers: { Cookie: cookie } }),
    env: { ...env(d), DB: dead } });

  assert.equal(res.status, 503);
  const body = await res.json();
  assert.doesNotMatch(body.error, /table is missing/i,
    'the table is not missing; a network error is not a schema problem');
  assert.doesNotMatch(body.error, /wrangler/i,
    'she has no terminal and no token; this is not an instruction she can follow');
  assert.match(body.detail, /network/, 'the real reason should still be reported');
  assert.equal(body.canSetUp, true, 'and the screen should be able to offer the button');
});

test('the screen shows the failure in place of the list, not in place of the app', () => {
  /* The regression that turned one broken query into a dead portal: the
     handler wrote its message over root, which is the whole application --
     nav, Today, Money, the diary, Settings, and the Set them up button that
     would have fixed it. */
  const js = readFileSync(new URL('../public/js/admin.js', import.meta.url).pathname, 'utf8');

  /* Three places write to root on purpose and must keep doing so: the sign-in
     screen, first-run setup, and render() itself. Each of those IS the whole
     screen. What may not happen is a failed fetch doing it. */
  const loader = js.slice(js.indexOf("api('/api/admin/leads' + qs)"),
                          js.indexOf("api('/api/admin/leads' + qs)") + 1400);
  assert.ok(loader.length > 100, 'could not find the requests loader');
  assert.doesNotMatch(loader, /root\.innerHTML\s*=/,
    'a list that cannot be read must not take the nav, Settings and the rest ' +
    'of the portal down with it');

  assert.match(js, /state\.leadsError \? leadsErrorHtml\(\)/,
    'the requests list needs a failure state of its own');
  assert.match(js, /function leadsErrorHtml/);

  /* And it must offer the fix rather than a command line. */
  const fn = js.slice(js.indexOf('function leadsErrorHtml'), js.indexOf('function dbSetUp'));
  assert.doesNotMatch(fn, /wrangler/i,
    'she has no terminal and no token; offering that command is offering nothing');
  assert.match(fn, /data-db-setup/, 'it should offer to bring the database up to date');
  assert.match(js, /\[data-db-setup\]/, 'and something must answer that button');
});
