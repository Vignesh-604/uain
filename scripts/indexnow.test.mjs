import { test } from 'node:test';
import assert from 'node:assert/strict';
const m = await import('./indexnow.mjs').catch(() => ({}));
test('IndexNow dry-run deduplicates canonical public URLs without network', async () => {
  let calls = 0;
  const r = await m.submitIndexNow(
    ['https://uain.global/about', 'https://uain.global/about'],
    {
      fetch: () => {
        calls++;
      },
    },
  );
  assert.equal(r.dryRun, true);
  assert.equal(r.count, 1);
  assert.equal(calls, 0);
});
test('IndexNow rejects unsafe, private and query URLs', () => {
  for (const u of [
    'http://uain.global/',
    'https://elsewhere.test/',
    'https://x@uain.global/',
    'https://uain.global/admin',
    'https://uain.global/tasks?q=x',
    'https://uain.global/api/enrol',
    'https://uain.global/support',
    'https://uain.global/a#b',
  ])
    assert.throws(() => m.publicUrl(u));
});
for (const status of [200, 202, 400, 403, 422, 429, 500])
  test(`IndexNow handles ${status} with bounded retries`, async () => {
    let calls = 0;
    const r = await m.submitIndexNow(['https://uain.global/about'], {
      live: true,
      key: 'a'.repeat(32),
      fetch: async (_url, options) => {
        if (options?.method !== 'POST') return {status:200,text:async()=> 'a'.repeat(32)};
        calls++;
        return { status };
      },
      sleep: async () => {},
    });
    assert.equal(calls, status === 429 || status >= 500 ? 3 : 1);
    assert.equal(r.receipts[0].status, status);
    assert.equal(r.receipts[0].accepted, status === 200 || status === 202);
    assert.equal(r.receipts[0].pending, status === 202);
  });
test('IndexNow bounds network failures', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      m.submitIndexNow(['https://uain.global/about'], {
        live: true,
        key: 'a'.repeat(32),
        fetch: async (_url, options) => {
        if (options?.method !== 'POST') return {status:200,text:async()=> 'a'.repeat(32)};
          calls++;
          throw Error('offline');
        },
        sleep: async () => {},
      }),
    /offline/,
  );
  assert.equal(calls, 3);
});

test('live mode validates ownership with injected transport before any POST',async()=>{const calls=[];await assert.rejects(()=>m.submitIndexNow(['https://uain.global/about'],{live:true,key:'a'.repeat(32),fetch:async(url,opts)=>{calls.push({url,method:opts?.method??'GET'});return {status:200,text:async()=> 'wrong key'};}}),/ownership proof/);assert.equal(calls.length,1);assert.equal(calls[0].method,'GET');});

test('IndexNow splits 10001 changed URLs into bounded batches after proof',async()=>{const sizes=[];const r=await m.submitIndexNow(Array.from({length:10001},(_,i)=>'https://uain.global/tasks/T-test-'+i),{live:true,key:'a'.repeat(32),fetch:async(_url,options)=>{if(options?.method!=='POST')return {status:200,text:async()=> 'a'.repeat(32)};sizes.push(JSON.parse(options.body).urlList.length);return {status:200};}});assert.deepEqual(sizes,[10000,1]);assert.equal(r.count,10001);});

test('IndexNow excludes task machine endpoints and IDs without document routes',()=>{
 for(const path of ['/tasks/feed.json','/tasks/sitemap.xml','/tasks/sitemap-1.xml','/tasks/_','/network/projects/_']) assert.throws(()=>m.publicUrl('https://uain.global'+path));
});
