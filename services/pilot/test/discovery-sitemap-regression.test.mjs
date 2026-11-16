import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queryNativePublicRows } from '../dist/src/native/public-query.js';
const url = (page = 1) =>
  new URL(
    `https://uain.global/api/tasks?discover=1&status=sitemap&page_size=200&page=${page}`,
  );
const central = (n) => ({
  status: 'available',
  truncated: false,
  rows: Array.from({ length: n }, (_, i) => ({
    id: `T-central-${i}`,
    kind: 'central',
    claimable: true,
    status: 'open',
  })),
  history: [{ id: 'closed', status: 'closed' }],
});
for (const n of [0, 1, 200, 201])
  test(`sitemap includes all ${n} eligible central rows across shards`, () => {
    const c = central(n),
      ids = [];
    for (let page = 1; page <= Math.max(1, Math.ceil(n / 200)); page++) {
      const r = queryNativePublicRows(url(page), [], {}, undefined, c);
      assert.equal(r.count, n);
      ids.push(...r.tasks.map((t) => t.id));
    }
    assert.equal(new Set(ids).size, n);
  });
test('sitemap refuses unavailable or incomplete central authority', () => {
  for (const c of [
    { status: 'unavailable', rows: [] },
    { ...central(1), truncated: true },
  ])
    assert.throws(
      () => queryNativePublicRows(url(), [], {}, undefined, c),
      /sitemap authority unavailable/,
    );
});
test('sitemap deduplicates and excludes unclaimable central rows and history', () => {
  const c = central(1);
  c.rows.push(c.rows[0], { id: 'held', claimable: false, status: 'open' });
  assert.deepEqual(
    queryNativePublicRows(url(), [], {}, undefined, c).tasks.map((t) => t.id),
    ['T-central-0'],
  );
});

test('sitemap omits central IDs without a public detail route',()=>{const c=central(1);c.rows.push({id:'unrouted',claimable:true,status:'open'},{id:'T-123',claimable:true,status:'open'});assert.deepEqual(queryNativePublicRows(url(),[],{},undefined,c).tasks.map(t=>t.id),['T-central-0']);});
