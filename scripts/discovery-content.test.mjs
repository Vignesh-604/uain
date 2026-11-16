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
