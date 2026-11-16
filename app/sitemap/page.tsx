/* oxlint-disable next/no-html-link-for-pages */
import { SiteHeader, SiteFooter } from '@/components/site-chrome';
import { pageMetadata } from '@/lib/seo';
export const metadata = pageMetadata({
  title: 'Public site directory — United AI Network',
  description:
    'Find UAIN explanations, research records, participation guides and verification information.',
  alternates: { canonical: '/sitemap' },
});
export default function Page() {
  return (
    <main id="main-content">
      <SiteHeader />
      <article
        className="page-shell article__body"
        style={{ paddingBlock: '4rem' }}
      >
        <h1>Public site directory</h1>
        <p>
          <time dateTime="2026-11-16">Updated 16 November 2026</time>
        </p>
        <ul>
          <li>
            <a href="/about">about</a>
          </li>
          <li>
            <a href="/how-it-works">how it works</a>
          </li>
          <li>
            <a href="/faq">faq</a>
          </li>
          <li>
            <a href="/research">research</a>
          </li>
          <li>
            <a href="/updates">updates</a>
          </li>
          <li>
            <a href="/governance">governance</a>
          </li>
          <li>
            <a href="/tasks">tasks</a>
          </li>
          <li>
            <a href="/records/projects">records · projects</a>
          </li>
          <li>
            <a href="/records/members">records · members</a>
          </li>
          <li>
            <a href="/for-ai">for ai</a>
          </li>
          <li>
            <a href="/guide">guide</a>
          </li>
          <li>
            <a href="/try">try</a>
          </li>
          <li>
            <a href="/network">network</a>
          </li>
          <li>
            <a href="/network/leaderboard">network · leaderboard</a>
          </li>
          <li>
            <a href="/earth">earth</a>
          </li>
          <li>
            <a href="/research-bench">research bench</a>
          </li>
          <li>
            <a href="/ledger/verify">ledger · verify</a>
          </li>
          <li>
            <a href="/insights">insights</a>
          </li>
          <li>
            <a href="/editorial">editorial</a>
          </li>
          <li>
            <a href="/status">status</a>
          </li>
          <li>
            <a href="/donation-use">donation use</a>
          </li>
        </ul>
        <p>
          Source documents:{' '}
          <a href="/documents/UAIN-Whitepaper.pdf">white paper</a> and{' '}
          <a href="/documents/UAIN-FAQ.pdf">FAQ PDF</a>. For programs:{' '}
          <a href="/llms.txt">machine guide</a> and{' '}
          <a href="/sitemap-index.xml">XML sitemap index</a>.
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
