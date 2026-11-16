import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
for (const path of [
  'about',
  'how-it-works',
  'faq',
  'research',
  'governance',
  'updates',
  'sitemap',
  'updates/public-verification-limits',
])
  test(
    path + ' has meaningful no-JavaScript HTML and canonical metadata',
    () => {
      const html = fs.readFileSync('dist/client/' + path + '.html', 'utf8');
      const document = html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
      assert.equal((document.match(/<h1[ >]/g) ?? []).length, 1);
      assert.ok(document.includes('href="https://uain.global/' + path + '"'));
      assert.match(document, /<meta name="description" content="[^"]+/);
      assert.match(document, /16 November 2026/);
      assert.match(document, /Source|source/);
      assert.doesNotMatch(document, /<form/);
    },
  );

test('insight governance change has consistent visible, structured and sitemap dates',()=>{
 const path='/insights/measured-trust-not-blind-trust';
 const html=fs.readFileSync('dist/client'+path+'.html','utf8');
 const schemas=[...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m=>JSON.parse(m[1]));
 assert.equal(schemas.find(s=>s['@type']==='Article').dateModified,'2026-11-16');
 assert.match(html.replace(/<!--[\s\S]*?-->/g,''),/Updated 16 November 2026/);
 const map=fs.readFileSync('public/sitemap.xml','utf8');
 assert.ok(map.includes('<loc>https://uain.global'+path+'</loc><lastmod>2026-11-16</lastmod>'));
});

test('homepage contains the exact UAIN-specific Bing ownership proof in its head',()=>{
 const head=fs.readFileSync('dist/client/index.html','utf8').split('</head>')[0];
 assert.match(head,/<meta name="msvalidate\.01" content="570530BEEE384EE71F1852F8040785AD"\s*\/?\s*>/);
});
