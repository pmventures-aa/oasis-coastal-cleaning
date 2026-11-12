/* "A customer opens a quote."
   -------------------------------------------------------------------------
   Settings has offered that as a switch since the notification settings were
   written. alertTarget builds its key from the kind it is handed --
   'notify_on_' + kind -- and four kinds are passed somewhere in the code:
   request, accept, decline, followup. 'view' was not. So the switch could be
   turned on and nothing would ever happen, and nothing on the screen said so.

   (Worth recording: a plain grep for notify_on_accept finds it only in the
   settings file and in admin.js, which is what first made all five look dead.
   They are not. The key is built, not written.) */
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { alertTarget, DEFAULTS } from '../functions/_lib/settings.js';
import { buildQuoteOpenedEmail } from '../functions/_lib/email.js';
import { recordQuoteView } from '../functions/_lib/quotes.js';

const env = { SITE_URL: 'https://www.oasiscoastalcleaning.com', QUOTE_TO_EMAIL: 'kr@test' };

test('every switch Settings shows corresponds to a kind the code passes', () => {
  /* The check that would have caught this. Each notify_on_<kind> key must be
     handed to alertTarget somewhere, or it is a switch with nothing behind it. */
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(dir + e.name + '/') : [dir + e.name]);
  const base = new URL('../functions/', import.meta.url).pathname;
  const code = walk(base).filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(f, 'utf8')).join('\n');

  const kinds = Object.keys(DEFAULTS).filter((k) => k.startsWith('notify_on_'))
    .map((k) => k.slice('notify_on_'.length));
  assert.ok(kinds.length >= 5, 'expected the notification switches to still be there');

  const orphans = kinds.filter((k) => !code.includes(`, '${k}')`));
  assert.deepEqual(orphans, [],
    'these switches are in Settings and never reach alertTarget, so turning ' +
    'one on does nothing');
});

test('the switch gates the alert', () => {
  assert.equal(alertTarget({ ...DEFAULTS, notify_on_view: 'no' }, env, 'view'), null);
  assert.equal(alertTarget({ ...DEFAULTS, notify_on_view: 'yes' }, env, 'view'), 'kr@test');
});

test('and it is off unless she turns it on', () => {
  assert.equal(alertTarget(DEFAULTS, env, 'view'), null,
    'this one is noisy by nature; it should not start on');
});

test('only the first open is news', async () => {
  /* The same quote reopened six times while somebody thinks it over is not
     six pieces of news, so recordQuoteView reports which one this was. */
  const writes = [];
  const db = { prepare: (sql) => ({ bind: (...a) => ({ run: async () => writes.push([sql, a]) }) }) };

  assert.equal(await recordQuoteView(db, { id: 'q1', status: 'sent', first_viewed_at: null }), true);
  assert.equal(await recordQuoteView(db, { id: 'q1', status: 'sent', first_viewed_at: '2026-11-01' }), false);
  assert.ok(writes.length >= 2, 'the view should still be counted either way');
});

test('a draft nobody has sent is not a view at all', async () => {
  const db = { prepare: () => { throw new Error('should not have written'); } };
  assert.equal(await recordQuoteView(db, { id: 'q1', status: 'draft' }), false);
});

test('the alert says what happened and leads back to the portal', () => {
  const mail = buildQuoteOpenedEmail(env, {
    quote: { customer_name: 'Maria Delgado', total: 28500 }, lead: {} });
  assert.match(mail.subject, /opened/i);
  assert.match(mail.subject, /Maria Delgado/);
  assert.match(mail.subject, /285/);
  assert.match(mail.text, /opened your quote/i);
  assert.match(mail.text, /Nothing has been decided/i,
    'an open is not an acceptance and the email should not let her read it as one');
  assert.match(mail.html, /oasiscoastalcleaning\.com\/admin/);
});
