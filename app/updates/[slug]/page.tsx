/* oxlint-disable next/no-html-link-for-pages */
import { notFound } from 'next/navigation';
import { pageMetadata } from '@/lib/seo';
import { updates } from '@/lib/updates';
import { SiteHeader, SiteFooter } from '@/components/site-chrome';
export const dynamicParams = false;
export function generateStaticParams() {
  return updates.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = updates.find((u) => u.slug === slug);
  if (!item) return {};
  return pageMetadata({
    title: item.title + ' — UAIN',
    description:
      'A dated note on incomplete public claim verification, with the original source.',
    alternates: { canonical: '/updates/' + item.slug },
  });
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = updates.find((u) => u.slug === slug);
  if (!item) notFound();
  return (
    <main id="main-content">
      <SiteHeader />
      <article
        className="page-shell article__body"
        style={{ paddingBlock: '4rem' }}
      >
        <h1>{item.title}</h1>
        <p>
          <time dateTime={item.date}>16 November 2026</time>
        </p>
        <p>
          This editorial note summarizes the repository status recorded on this
          date. It reports no new research result.
        </p>
        <p>
          The public README records HTTP 409 responses for claim-record routes.
          Six claim commitments at ledger entries 1527, 1530, 1536, 1561, 1573
          and 1595 could not yet be recomputed from the public API. A verifier
          stopping at an unavailable record is incomplete verification.
        </p>
        <p>
          This is a dated source observation, not a new live verification run. A
          hash chain commits to recorded bytes; it does not prove scientific
          correctness. Read the <a href="/ledger/verify">verification method</a>{' '}
          and current source for later corrections.
        </p>
        <p>
          Source and attribution:{' '}
          <a href={item.source}>
            UAIN public repository README at the audited commit
          </a>
          . Editorial explanation prepared with AI assistance;{' '}
          <a href="/editorial">corrections and evidence policy</a>.
        </p>
        <p>
          <a href="/research">Research hub</a> ·{' '}
          <a href="/updates">All updates</a>
        </p>
      </article>
      <SiteFooter />
    </main>
  );
}
