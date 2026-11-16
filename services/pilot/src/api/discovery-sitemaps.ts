/* oxlint-disable typescript/no-useless-default-assignment -- Rule requires strictNullChecks; this pilot compiles with strict:false. */
const ORIGIN = 'https://uain.global';
const escape = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
export function sitemapLeaf(paths: string[]) {
  const unique = [...new Set(paths)];
  if (unique.length > 50000) throw Error('sitemap URL limit');
  const entries = unique
    .map((p) => {
      const u = new URL(p, ORIGIN);
      if (
        !p.startsWith('/') ||
        p.startsWith('//') ||
        u.origin !== ORIGIN ||
        u.search ||
        u.hash ||
        u.pathname !== p
      )
        throw Error('canonical sitemap path required');
      return `<url><loc>${escape(u.href)}</loc></url>`;
    })
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`;
  if (Buffer.byteLength(xml) > 50 * 1024 * 1024)
    throw Error('sitemap byte limit');
  return xml;
}
export function sitemapIndex(taskCount: number, recordCount = 0) {
  for (const n of [taskCount, recordCount])
    if (!Number.isSafeInteger(n) || n < 0)
      throw Error('complete sitemap count required');
  const paths = [
    '/sitemap.xml',
    ...(recordCount > 50000
      ? Array.from(
          { length: Math.ceil(recordCount / 50000) },
          (_, i) => `/records/sitemap-${i + 1}.xml`,
        )
      : ['/records/sitemap.xml']),
    ...Array.from(
      { length: Math.max(1, Math.ceil(taskCount / 200)) },
      (_, i) => `/tasks/sitemap-${i + 1}.xml`,
    ),
  ];
  if (paths.length > 50000) throw Error('sitemap index limit');
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<sitemap><loc>${ORIGIN}${p}</loc></sitemap>`).join('')}</sitemapindex>`;
}
export function taskPagePolicy(url: URL, page: number) {
  const duplicateKeys = [...url.searchParams.keys()].some(k=>url.searchParams.getAll(k).length>1);
  const noindex = duplicateKeys || [...url.searchParams].some(
    ([k, v]) => k !== 'page' && !(k === 'status' && v === 'open'),
  );
  return { canonical: page > 1 ? `/tasks?page=${page}` : '/tasks', noindex };
}

/** A partial authority cannot support zero totals, page counts or missing-page conclusions. */
export function taskListingComplete(result: {totalOpen?:number|null;central?:{status?:string;truncated?:boolean}}){return result.totalOpen!==null&&result.central?.status!=='unavailable'&&!result.central?.truncated;}
