/* The portal draws settings in named groups. A field the server sends that no
   group lists is drawn in "Everything else" at runtime, which is a safety net
   and not a design — this catches the drift while it is still a diff. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FIELDS } from '../functions/_lib/settings.js';

/* Only the keys arrays. Reading every quoted word in the block picked up
   the group ids and the titles too, and then reported them as settings
   that do not exist. */
function groupKeys(block) {
  const body = block.slice(0, block.indexOf('];'));
  const out = [];
  for (const m of body.matchAll(/keys:\s*\[([^\]]*)\]/g)) {
    for (const q of m[1].match(/'([a-z0-9_]+)'/g) || []) out.push(q.replace(/'/g, ''));
  }
  return out;
}

test('every setting the server sends has a home in the portal', async () => {
  const src = await readFile(new URL('../public/js/admin.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('var SETTING_GROUPS = ['));
  const grouped = new Set(groupKeys(block));
  const homeless = FIELDS.map((f) => f.key).filter((k) => !grouped.has(k));
  assert.deepEqual(homeless, [], 'these settings are not in any group: ' + homeless.join(', '));
});

test('no group names a setting that does not exist', async () => {
  const src = await readFile(new URL('../public/js/admin.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('var SETTING_GROUPS = ['));
  const grouped = groupKeys(block);
  const keys = new Set(FIELDS.map((f) => f.key));
  const ghosts = grouped.filter((k) => !keys.has(k));
  assert.deepEqual(ghosts, [], 'these group entries match no setting: ' + ghosts.join(', '));
});
