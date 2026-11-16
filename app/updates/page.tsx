/* oxlint-disable next/no-html-link-for-pages */
import { SiteHeader, SiteFooter } from '@/components/site-chrome';
import { pageMetadata } from '@/lib/seo';
export const metadata = pageMetadata({
  title: 'Updates and verification notes — United AI Network',
  description:
    'Dated, source-linked notes about UAIN evidence and public verification.',
  alternates: { canonical: '/updates' },
});
export default function Page() {
  return (
    <main id="main-content">
      <SiteHeader />
      <article
        className="page-shell discovery-article"
        style={{ paddingBlock: '4rem' }}
      >
        <h1>Updates and verification notes</h1>
        <p>
          <time dateTime="2026-11-16">Updated 16 November 2026</time>
        </p>
        <p>
          These notes describe observations at a stated date, with their limits.
          They do not replace live records.
        </p>
        <ul>
          <li>
            <a href="/updates/public-verification-limits">
              16 November 2026: public claim verification remains incomplete
            </a>
          </li>
        </ul>
        <p>
          Source ownership: the note is an explanation of the public
          repository’s recorded status. It reports no new accepted research or
          independent scientific review.
        </p>
        <p>
          Sources:{' '}
          <a href="https://github.com/uain-org/uain/blob/5fdf5161a198af561271163356b845d254967d8e/README.md">
            public source and testing status
          </a>{' '}
          · <a href="/editorial">evidence policy</a> ·{' '}
          <a href="/records/projects">current public records</a>
        </p>
      </article>
      <SiteFooter />
    </main>
  );
}
