import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
const HOST = 'uain.global',
  ENDPOINT = 'https://api.indexnow.org/indexnow';
// Deliberately limited to public, canonical document routes. No action endpoints.
const PUBLIC =
  /^\/(?:$|about$|how-it-works$|faq$|research$|updates(?:\/[a-z0-9-]+)?$|governance$|sitemap$|status$|for-ai$|guide$|try$|earth$|editorial$|donation-use$|research-bench$|ledger\/verify$|insights(?:\/[a-z0-9-]+)?$|records\/(?:projects|members)$|network(?:\/(?:projects|directory)(?:\/[A-Za-z0-9][A-Za-z0-9._:-]{0,255})?|\/leaderboard)?$|tasks(?:\/(?:T-[0-9]+|T-[A-Za-z][A-Za-z0-9._-]{0,93}))?$|(?:research|examples)\/[a-z0-9-]+\.html$)/;
export function publicUrl(value) {
  const u = new URL(value);
  if (
    u.protocol !== 'https:' ||
    u.host !== HOST ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    !PUBLIC.test(u.pathname) ||
    value !== u.href
  )
    throw Error('Expected canonical public UAIN URL');
  return u.href;
}
export async function submitIndexNow(values, options = {}) {
  const urls = [...new Set(values.map(publicUrl))];
  if (!options.live) return { dryRun: true, count: urls.length, urls };
  const key = options.key;
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(key ?? ''))
    throw Error('Dedicated hosted IndexNow key required');
  const request = options.fetch ?? fetch,
    sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    receipts = [];
  // Verify exact hosted proof through the same transport before every live batch run. Never log it.
  {
    const proof = await request(`https://${HOST}/${key}.txt`, {
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (proof.status !== 200 || (await proof.text()) !== key)
      throw Error('Hosted ownership proof unavailable');
  }
  for (let start = 0; start < urls.length; start += 10000) {
    const batch = urls.slice(start, start + 10000);
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await request(ENDPOINT, {
          method: 'POST',
          redirect: 'error',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            host: HOST,
            key,
            keyLocation: `https://${HOST}/${key}.txt`,
            urlList: batch,
          }),
          signal: AbortSignal.timeout(15000),
        });
        if ((response.status !== 429 && response.status < 500) || attempt === 2)
          break;
      } catch (e) {
        if (attempt === 2) throw e;
      }
      await sleep(500 * 2 ** attempt);
    }
    receipts.push({
      receivedAt: new Date().toISOString(),
      count: batch.length,
      status: response.status,
      accepted: [200, 202].includes(response.status),
      pending: response.status === 202,
    });
  }
  return { dryRun: false, count: urls.length, receipts };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const args = process.argv.slice(2),
      live = args.includes('--live'),
      file = args.find((x) => !x.startsWith('--'));
    if (!file)
      throw Error('Usage: node scripts/indexnow.mjs URLs.json [--live]');
    const result = await submitIndexNow(
      JSON.parse(await readFile(file, 'utf8')),
      { live, key: process.env.UAIN_INDEXNOW_KEY },
    );
    console.log(JSON.stringify(result));
    if (result.receipts?.some((r) => !r.accepted)) process.exitCode = 1;
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
