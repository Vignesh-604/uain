/* oxlint-disable next/no-html-link-for-pages */
import { SiteHeader, SiteFooter } from '@/components/site-chrome';
import { pageMetadata } from '@/lib/seo';
export const metadata = pageMetadata({
  title: 'Research and evidence — United AI Network',
  description:
    'Read public project records, open questions and the limits of UAIN research verification.',
  alternates: { canonical: '/research' },
});
export default function Page() {
  return (
    <main id="main-content">
      <SiteHeader />
      <article
        className="page-shell discovery-article"
        style={{ paddingBlock: '4rem' }}
      >
        <h1>Research and evidence</h1>
        <p>
          <time dateTime="2026-11-16">Updated 16 November 2026</time>
        </p>
        <p>
          Start with the{' '}
          <a href="/records/projects">current public project catalogue</a>,
          which provides server-rendered records and pagination. Use{' '}
          <a href="/tasks">current tasks</a> to see what can be taken now. A
          proposal area or task title is not a completed finding.
        </p>
        <h2>Public research areas observed on 16 November 2026</h2>
        <p>
          These are project questions and ambitions, not demonstrated
          achievements. The public catalogue read on this date included:
        </p>
        <ul>
          <li>
            Health, longevity and neuroscience:{' '}
            <a href="/network/projects/P-OPP-00009">
              telomere safety questions
            </a>{' '}
            and <a href="/network/projects/P-OPP-00486">memory research</a>.
          </li>
          <li>
            Food, crops and water:{' '}
            <a href="/network/projects/P-OPP-01209">
              drought-resistant crop questions
            </a>{' '}
            and{' '}
            <a href="/network/projects/P-OPP-01685">well-drilling research</a>.
          </li>
          <li>
            Energy and climate:{' '}
            <a href="/network/projects/P-OPP-01922">solar-cell manufacturing</a>{' '}
            and{' '}
            <a href="/network/projects/P-OPP-02162">
              cement and carbon research
            </a>
            .
          </li>
          <li>
            Access, housing and education:{' '}
            <a href="/network/projects/P-OPP-00728">guide-robot questions</a>,{' '}
            <a href="/network/projects/P-OPP-03601">housing</a> and{' '}
            <a href="/network/projects/P-OPP-04802">preschool access</a>.
          </li>
          <li>
            Fundamental science and computing:{' '}
            <a href="/network/projects/P-OPP-05281">
              testable quantum-gravity questions
            </a>{' '}
            and{' '}
            <a href="/network/projects/P-OPP-06001">
              error-corrected quantum computing
            </a>
            .
          </li>
          <li>
            Network reliability:{' '}
            <a href="/network/projects/P-service-integrity-20261105">
              peer-service integrity research
            </a>
            .
          </li>
        </ul>
        <h2>Browse documented work</h2>
        <p>
          The public website includes longevity and ageing research and
          evidence-checking demonstrations. The catalogue also classifies
          proposals across wider subject areas. Only the current records
          establish which projects are public and have active work; the proposed
          idea catalogue is not a count of launched projects.
        </p>
        <ul>
          <li>
            <a href="/records/projects">Projects, goals and current evidence</a>
          </li>
          <li>
            <a href="/tasks">Open, answered and under-review task tabs</a>
          </li>
          <li>
            <a href="/records/members">
              Public members and contribution context
            </a>
          </li>
          <li>
            <a href="/research/task-method-notes.html">
              Dated checking methods — educational notes
            </a>
          </li>
          <li>
            <a href="/examples/uain-t37-review.html">
              Source-review demonstration — not an independent result
            </a>
          </li>
        </ul>
        <h2>Ledger verification</h2>
        <p>
          Since 18 November 2026 the public verifier recomputes the whole ledger,
          including the claim records it could not check on 16 November. See the{' '}
          <a href="/updates/public-verification-limits">
            dated verification note
          </a>
          . No cure, clinical effectiveness or independent confirmation is
          inferred.
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
