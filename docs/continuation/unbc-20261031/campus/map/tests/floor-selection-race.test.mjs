// Regression test for review finding 4 (Nov 1, 2026): a stale floor load must not
// override a newer floor selection, and concurrent requests share one fetch.
// Evaluates the ACTUAL show() and loadFloor() from index.html in a Node VM with
// controlled fetch completions (DOM stubs; not a browser test).
// usage: node floor-selection-race.test.mjs [path/to/index.html] [receipt.json]   (exit 0 = pass)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const input = path.resolve(process.argv[2] || path.join(here, '..', 'index.html'));
const html = fs.readFileSync(input, 'utf8');
const slice = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); assert(i >= 0 && j > i, a); return html.slice(i, j); };
const code = slice('async function loadFloor(', '\nfunction renderFloor(');

function harness() {
  const floors = [{ id: 'campus-floor-1', name: 'A' }, { id: 'floor-2', name: 'B' }];
  const pending = new Map(), fetches = [];
  const buttons = floors.map((f) => ({ dataset: { id: f.id }, setAttribute(k, v) { this[k] = v; } }));
  const ctx = {
    state: { floors, data: {}, loading: new Map(), showToken: 0 },
    GATEWAYS: [],
    document: { querySelectorAll() { return buttons; } },
    fetch(url) {
      fetches.push(url);
      return new Promise((resolve) => pending.set(url, () => resolve({ json: async () => ({ loaded: url, links: [], doors: [] }) })));
    },
    prepare(f) { return { bounds: [], from: f.loaded }; },
    $() { return { innerHTML: '' }; }, fit() {}, draw() {},
    renderFloor(f) { ctx.rendered = f.id; },
    location: { hash: '' }, history: { replaceState(_, __, h) { ctx.location.hash = h; } },
  };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  const done = (id) => pending.get(`floors/${id}.json`)();
  const observe = () => ({ rendered: ctx.rendered, hash: ctx.location.hash, cur: ctx.state.cur && ctx.state.cur.id,
    selectedTabs: buttons.filter((b) => b['aria-selected'] === 'true').map((b) => b.dataset.id) });
  return { ctx, done, observe, fetches };
}
const flush = () => new Promise((r) => setImmediate(r));
const results = {};

// 1. Reviewer's order: choose Floor 1, then Floor 2; Floor 2 finishes first, Floor 1 last.
{
  const h = harness();
  const first = h.ctx.show('campus-floor-1'), last = h.ctx.show('floor-2');
  h.done('floor-2'); const rLast = await last;
  h.done('campus-floor-1'); const rFirst = await first;
  const o = h.observe();
  assert.deepEqual(o, { rendered: 'floor-2', hash: '#floor-2', cur: 'floor-2', selectedTabs: ['floor-2'] });
  assert.equal(rLast, true); assert.equal(rFirst, false);
  results.staleFinishesLast = { ...o, staleRequestReturned: rFirst };
}
// 2. Stale finishes first: still only the newest selection is shown.
{
  const h = harness();
  const first = h.ctx.show('campus-floor-1'), last = h.ctx.show('floor-2');
  h.done('campus-floor-1'); await flush(); const rFirst = await first;
  assert.equal(rFirst, false); assert.equal(h.ctx.rendered, undefined);
  h.done('floor-2'); await last;
  const o = h.observe();
  assert.deepEqual(o, { rendered: 'floor-2', hash: '#floor-2', cur: 'floor-2', selectedTabs: ['floor-2'] });
  results.staleFinishesFirst = o;
}
// 3. A-B-A: the final choice A wins even though B finishes last; A is fetched once.
{
  const h = harness();
  const p1 = h.ctx.show('campus-floor-1'), p2 = h.ctx.show('floor-2'), p3 = h.ctx.show('campus-floor-1');
  h.done('campus-floor-1'); await flush(); h.done('floor-2');
  const r = await Promise.all([p1, p2, p3]);
  const o = h.observe();
  assert.deepEqual(r, [false, false, true]);
  assert.deepEqual(o, { rendered: 'campus-floor-1', hash: '#campus-floor-1', cur: 'campus-floor-1', selectedTabs: ['campus-floor-1'] });
  assert.equal(h.fetches.filter((u) => u === 'floors/campus-floor-1.json').length, 1, 'deduplicated load');
  results.abaDeduplicated = { ...o, fetches: h.fetches };
}
const receipt = JSON.stringify({ status: 'PASS', input, inputSha256: createHash('sha256').update(html).digest('hex'),
  method: 'Actual show()/loadFloor() from index.html in a Node VM with controlled fetch completions and DOM stubs; not a browser run.', results }, null, 2) + '\n';
if (process.argv[3]) fs.writeFileSync(process.argv[3], receipt);
process.stdout.write(receipt);
