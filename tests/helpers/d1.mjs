/* A D1 stand-in backed by real SQLite, so the schedule tests run the real
   migration and the real SQL rather than a hand-written fake that agrees
   with whatever the code happens to do. */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export function makeD1(migrations = ['0011_schedule.sql']) {
  const db = new DatabaseSync(':memory:');
  for (const m of migrations) {
    db.exec(readFileSync(new URL('../../migrations/' + m, import.meta.url), 'utf8'));
  }
  const wrap = (sql) => {
    const ops = (...args) => ({
      first: async () => { const r = db.prepare(sql).all(...args); return r.length ? r[0] : null; },
      all: async () => ({ results: db.prepare(sql).all(...args) }),
      run: async () => { db.prepare(sql).run(...args); return { success: true }; }
    });
    return Object.assign(ops(), { bind: ops });
  };
  return { prepare: wrap, _raw: db };
}
