import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicRecordResponse } from '../dist/src/api/public-record-pages.js';
void test('historical project references explain missing or hidden records without exposing them', async () => {
  const calls = [];
  const read = async (u) => {
    calls.push(u.pathname);
    if (u.pathname === '/api/directory/m')
      return {
        status: 200,
        body: {
          id: 'm',
          name: 'Member',
          work: {
            contributed: [
              { id: 'RC', title: 'Result <unsafe>', project_id: 'withdrawn' },
            ],
          },
        },
      };
    return { status: 404, body: {} };
  };
  const r = await publicRecordResponse(
    new URL('https://uain.global/network/directory/m'),
    read,
  );
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.body, /href="\/network\/projects\/withdrawn"/);
  assert.match(r.body, /Historical project reference unavailable/);
  assert.match(r.body, /Result &lt;unsafe&gt;/);
  assert.ok(calls.every((p) => p.startsWith('/api/')));
});
