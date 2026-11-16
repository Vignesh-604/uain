import fs from 'node:fs';
import { updates } from '../lib/updates.ts';
import { insights } from '../lib/insights.ts';
const p = 'public/sitemap.xml';
let xml = fs.readFileSync(p, 'utf8');
// One source owns each editorial article slug/date; existing non-editorial entries stay intact.
xml = xml.replace(
  /\s*<url>\s*<loc>https:\/\/uain\.global\/(?:updates|insights)\/[^<]+<\/loc>[\s\S]*?<\/url>/g,
  '',
);
const articles = [
  ...insights.map((i) => ({ path: '/insights/' + i.slug })),
  ...updates.map((u) => ({ path: '/updates/' + u.slug, date: u.date })),
];
xml = xml.replace(
  '</urlset>',
  articles
    .map(
      (a) =>
        `  <url><loc>https://uain.global${a.path}</loc>${a.date ? `<lastmod>${a.date}</lastmod>` : ''}</url>`,
    )
    .join('\n') + '\n</urlset>',
);
fs.writeFileSync(p, xml);
