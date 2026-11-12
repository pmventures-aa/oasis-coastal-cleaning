/* Two descriptions of one database.
   -------------------------------------------------------------------------
   migrations/ is the history, applied in filename order by wrangler.
   functions/_lib/schema.js is what the in-app setup creates, and this
   container has no CLOUDFLARE_API_TOKEN, so the in-app path is the one that
   actually runs here. When the two disagree, the code works on a database
   built one way and fails on a database built the other -- and it fails at
   the moment the column is first written, which is usually the moment
   something has already gone wrong.

   closed_at was the version of this that cost real behaviour: attention.js
   read it, the record route passed it, no migration and no schema entry
   created it, and the override it guarded could never fire. email_error was
   the version waiting to happen: written in four places, created by a
   migration, absent from schema.js.

   These read both and compare them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const dir = new URL('../migrations/', import.meta.url).pathname;
const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(dir + f, 'utf8')).join('\n');
const schema = readFileSync(new URL('../functions/_lib/schema.js', import.meta.url).pathname, 'utf8');

const section = (name) => schema.split(`const ${name} = [`, 2)[1].split('\n];', 1)[0];

test('every table a migration creates, the in-app setup can create too', () => {
  const made = new Set();
  for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi)) {
    made.add(m[1].toLowerCase());
  }
  const listed = new Set();
  for (const m of section('TABLES').matchAll(/\['(\w+)',/g)) listed.add(m[1].toLowerCase());

  const missing = [...made].filter((t) => !listed.has(t)).sort();
  assert.deepEqual(missing, [],
    'in migrations but not in schema.js TABLES: a database set up in the app will not have these');
});

test('every column a migration adds, the in-app setup can add too', () => {
  const added = new Set();
  for (const m of sql.matchAll(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/gi)) {
    added.add(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`);
  }
  const listed = new Set();
  for (const m of section('COLUMNS').matchAll(/\['(\w+)',\s*'(\w+)',\s*'[^']+'\]/g)) {
    listed.add(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`);
  }

  const missing = [...added].filter((c) => !listed.has(c)).sort();
  assert.deepEqual(missing, [],
    'added by a migration but not in schema.js COLUMNS: the write that needs ' +
    'one of these will fail on a database set up in the app');
});

test('and nothing in schema.js is missing a migration behind it', () => {
  /* The other direction. A column only the in-app setup knows about works
     until someone runs the migrations on a fresh database and does not get
     it. Both lists should describe the same database. */
  const added = new Set();
  for (const m of sql.matchAll(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/gi)) {
    added.add(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`);
  }
  /* A column written straight into a CREATE TABLE in a migration counts too. */
  for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\n\s*\);/gi)) {
    const table = m[1].toLowerCase();
    for (const line of m[2].split('\n')) {
      const col = line.trim().match(/^(\w+)\s+(TEXT|INTEGER|REAL|BLOB|NUMERIC)\b/i);
      if (col) added.add(`${table}.${col[1].toLowerCase()}`);
    }
  }
  const orphans = [];
  for (const m of section('COLUMNS').matchAll(/\['(\w+)',\s*'(\w+)',\s*'[^']+'\]/g)) {
    const key = `${m[1].toLowerCase()}.${m[2].toLowerCase()}`;
    if (!added.has(key)) orphans.push(key);
  }
  assert.deepEqual(orphans.sort(), [],
    'in schema.js COLUMNS with no migration behind it; a database built from ' +
    'migrations/ alone would not have these');
});

test('the migrations are numbered without a gap or a repeat', () => {
  /* They are applied in filename order, so a duplicate number is two files
     with no defined order between them. */
  const names = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const nums = names.map((f) => Number(f.slice(0, 4)));
  const dupes = nums.filter((v, i) => nums.indexOf(v) !== i);
  assert.deepEqual(dupes, [], 'two migrations share a number: their order is undefined');
  for (let i = 1; i < nums.length; i++) {
    assert.equal(nums[i], nums[i - 1] + 1,
      `a gap between ${names[i - 1]} and ${names[i]} — one of them is probably missing`);
  }
});

test('the in-app schema really builds a database the code can write to', () => {
  /* Comparing two lists only proves they agree. This runs the one that
     actually executes in production -- there is no CLOUDFLARE_API_TOKEN in
     the deploy environment, so applySchema is the path a new table takes --
     and then writes a row through it. */
  const tables = [...section('TABLES').matchAll(/\['(\w+)',\s*`([\s\S]*?)`\]/g)];
  const cols = [...section('COLUMNS').matchAll(/\['(\w+)',\s*'(\w+)',\s*'([^']+)'\]/g)];
  assert.ok(tables.length > 20, 'expected the whole table list');

  const db = new DatabaseSync(':memory:');
  for (const [, , ddl] of tables.map((m) => [0, m[1], m[2]])) db.exec(ddl);
  for (const m of cols) {
    try { db.exec(`ALTER TABLE ${m[1]} ADD COLUMN ${m[2]} ${m[3]}`); }
    catch (e) {
      if (!/duplicate column/i.test(e.message)) {
        assert.fail(`schema.js cannot add ${m[1]}.${m[2]}: ${e.message}`);
      }
    }
  }

  /* A request arriving, becoming a client, and that client being marked
     finished -- across the three tables this sweep touched. */
  db.exec(`INSERT INTO leads (id, created_at, name, phone, email, service)
           VALUES ('l1','2026-11-12','A','1','a@b.co','home')`);
  db.exec(`INSERT INTO customers (id, created_at, name) VALUES ('c1','2026-11-12','A')`);
  db.exec(`UPDATE leads SET converted_at = '2026-11-12', customer_id = 'c1' WHERE id = 'l1'`);
  db.exec(`UPDATE customers SET closed_at = '2026-11-12' WHERE id = 'c1'`);
  assert.equal(db.prepare('SELECT closed_at FROM customers WHERE id = ?').get('c1').closed_at,
    '2026-11-12');
});
