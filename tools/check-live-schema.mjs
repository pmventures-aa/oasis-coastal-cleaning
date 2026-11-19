/* ==========================================================================
   Oasis Coastal Cleaning — compare the live database to this code
   --------------------------------------------------------------------------
   The portal was down for a week because the deployed code expected a column
   the live database did not have. Nothing compared the two, so nothing noticed
   until Kristina opened /admin and found it dead.

   This reads the live schema and reports anything functions/_lib/schema.js
   expects and the database does not have. It only ever runs SELECTs.

     CLOUDFLARE_API_TOKEN=... node tools/check-live-schema.mjs

   The token needs D1 read access. The database id comes from wrangler.toml,
   and the account id from the API, so there is nothing to keep in step here.

   If it reports anything missing, either apply the migrations:

     npx wrangler d1 migrations apply oasis --remote

   or press "Bring the database up to date" in the portal, which applies the
   same schema from inside the app and needs no token at all.
   ========================================================================== */
import { readFileSync } from 'node:fs';

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
if (!TOKEN) {
  console.error('Set CLOUDFLARE_API_TOKEN (needs D1 read access).');
  process.exit(2);
}

const root = new URL('..', import.meta.url).pathname;
const toml = readFileSync(root + 'wrangler.toml', 'utf8');
const dbId = (toml.match(/database_id\s*=\s*"([0-9a-f-]+)"/) || [])[1];
if (!dbId) { console.error('No database_id in wrangler.toml.'); process.exit(2); }

/* Through curl rather than fetch(): it honours HTTPS_PROXY, NO_PROXY and the
   system CA store without any of this script knowing about them, which matters
   on a machine behind a proxy. The token goes in on stdin as a curl config
   rather than in argv, so it never shows up in the process list. */
const { execFile } = await import('node:child_process');
const { promisify } = await import('node:util');
const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const run = promisify(execFile);

/* The token goes in a curl config file rather than in argv, so it does not
   appear in the process list. Readable only by this user, and removed when
   the script exits however it exits. */
const confDir = mkdtempSync(tmpdir() + '/oasis-schema-');
const confPath = confDir + '/curl.conf';
writeFileSync(confPath, `header = "authorization: Bearer ${TOKEN}"\n`, { mode: 0o600 });
process.on('exit', () => { try { rmSync(confDir, { recursive: true, force: true }); } catch { /* going away anyway */ } });

const api = async (path, init) => {
  const args = ['--silent', '--show-error', '--max-time', '30', '--config', confPath,
                'https://api.cloudflare.com/client/v4' + path];
  if (init && init.method) args.push('-X', init.method);
  if (init && init.body) args.push('-H', 'content-type: application/json', '--data-binary', init.body);
  const { stdout } = await run('curl', args, { maxBuffer: 32 * 1024 * 1024 });
  let body;
  try { body = JSON.parse(stdout); }
  catch { throw new Error('Cloudflare did not return JSON: ' + stdout.slice(0, 200)); }
  if (!body.success) throw new Error(JSON.stringify(body.errors));
  return body.result;
};

const accounts = await api('/accounts');
let acct = null, q = null;
for (const a of accounts) {
  try {
    const probe = (sql) => api(`/accounts/${a.id}/d1/database/${dbId}/query`,
      { method: 'POST', body: JSON.stringify({ sql }) });
    await probe('SELECT 1');
    acct = a.id; q = async (sql) => (await probe(sql))[0].results;
    break;
  } catch { /* the database is not in this account */ }
}
if (!acct) { console.error(`No account this token can see holds database ${dbId}.`); process.exit(2); }

/* What the code expects. */
const src = readFileSync(root + 'functions/_lib/schema.js', 'utf8');
const sect = (n) => src.split(`const ${n} = [`, 2)[1].split('\n];', 1)[0];
const tables = [...sect('TABLES').matchAll(/\['(\w+)',\s*`([\s\S]*?)`\]/g)].map((m) => [m[1], m[2]]);

const declared = {};
for (const [name, ddl] of tables) {
  declared[name] = ddl.slice(ddl.indexOf('(') + 1, ddl.lastIndexOf(')'))
    .split(',').map((s) => s.trim().split(/\s+/)[0]).filter((c) => /^[a-z_]+$/i.test(c));
}
for (const m of sect('COLUMNS').matchAll(/\['(\w+)',\s*'(\w+)',\s*'([^']+)'\]/g)) {
  (declared[m[1]] ||= []).push(m[2]);
}

const live = new Set((await q("SELECT name FROM sqlite_master WHERE type='table'")).map((r) => r.name));
const missingTables = [], missingColumns = [];
for (const [name] of tables) {
  if (!live.has(name)) { missingTables.push(name); continue; }
  const have = new Set((await q(`SELECT name FROM pragma_table_info('${name}')`)).map((r) => r.name));
  for (const c of new Set(declared[name])) if (!have.has(c)) missingColumns.push(`${name}.${c}`);
}

const tracked = live.has('d1_migrations');
let behind = [];
if (tracked) {
  const applied = new Set((await q('SELECT name FROM d1_migrations')).map((r) => r.name));
  const { readdirSync } = await import('node:fs');
  behind = readdirSync(root + 'migrations').filter((f) => f.endsWith('.sql') && !applied.has(f));
}

const say = (label, list) => {
  console.log(`${label}: ${list.length ? list.length : 'none'}`);
  for (const x of list) console.log('   ' + x);
};
say('Missing tables', missingTables);
say('Missing columns', missingColumns);
console.log('Migrations tracked: ' + (tracked
  ? (behind.length ? `yes, ${behind.length} not recorded as applied` : 'yes, all recorded')
  : 'no — `wrangler d1 migrations apply` would try to replay every migration'));
for (const b of behind) console.log('   ' + b);

const bad = missingTables.length + missingColumns.length;
console.log(bad ? `\nThe live database is behind this code by ${bad} thing(s).`
                : '\nThe live database matches this code.');
process.exit(bad ? 1 : 0);
