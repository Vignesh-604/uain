import { test } from 'node:test';
import assert from 'node:assert/strict';
const m = await import('../dist/src/api/discovery-sitemaps.js').catch(() => ({}));
test('aggregate enumerates leaves without nesting indexes', () => {
  const xml = m.sitemapIndex(201, 50001);
  assert.match(xml, /tasks\/sitemap-2.xml/);
  assert.match(xml, /records\/sitemap-2.xml/);
  assert.doesNotMatch(xml, /<loc>https:\/\/uain.global\/tasks\/sitemap.xml/);
});
test('leaf maps enforce canonical ownership and bounds', () => {
  assert.match(m.sitemapLeaf(['/tasks/A', '/tasks/A']), /<url>/);
  assert.equal(
    (m.sitemapLeaf(['/tasks/A', '/tasks/A']).match(/<url>/g) ?? []).length,
    1,
  );
  for (const p of ['https://evil.test', '//evil.test', '/tasks/A?x=1'])
    assert.throws(() => m.sitemapLeaf([p]));
  assert.throws(
    () => m.sitemapLeaf(Array.from({ length: 50001 }, (_, i) => '/tasks/' + i)),
    /limit/,
  );
});
test('unfiltered task pagination is self canonical and filters noindex', () => {
  assert.deepEqual(
    m.taskPagePolicy(new URL('https://uain.global/tasks?page=2'), 2),
    { canonical: '/tasks?page=2', noindex: false },
  );
  for (const q of ['?q=x', '?sort=newest', '?status=closed', '?status=bogus'])
    assert.equal(
      m.taskPagePolicy(new URL('https://uain.global/tasks' + q), 1).noindex,
      true,
    );
});

test('HTML listing refuses incomplete authority before interpreting zero or page counts',()=>{for(const r of [{totalOpen:null,count:0,pages:1},{central:{status:'unavailable'},count:0},{central:{status:'available',truncated:true},count:1}])assert.equal(m.taskListingComplete(r),false);assert.equal(m.taskListingComplete({count:25,pages:2,central:{status:'available',truncated:false}}),true);});
