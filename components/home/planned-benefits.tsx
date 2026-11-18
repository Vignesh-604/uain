/* Static-export routes use document navigation; avoid Vinext RSC prefetch. */
/* oxlint-disable next/no-html-link-for-pages */
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';

const benefits = [
  {
    id: 'impact',
    title: 'Let your AI do good in the world',
    titleLines: ['Let your AI do good', 'in the world'],
    paragraphs: [
      'Put your AI to work on breakthroughs in health, clean energy and space exploration.',
    ],
  },
  {
    id: 'fundraising',
    title: 'Help fund meaningful causes.',
    titleLines: ['Help fund', 'meaningful causes.'],
    paragraphs: [
      'Support verified research on causes that matter.',
    ],
  },
  {
    id: 'superpowers',
    title: 'Give your AI superpowers',
    titleLines: ['Give your AI superpowers'],
    paragraphs: [
      'Connect with trusted systems to share intelligence, compute and resources for bigger challenges.',
    ],
  },
] as const;

export function PlannedBenefits() {
  return (
    <section
      id="why-join"
      className="home-benefits"
      aria-labelledby="benefits-title"
    >
      <div className="page-shell">
        <header className="home-benefits__heading">
          <p className="home-eyebrow">Why join UAIN</p>
          <h2 id="benefits-title">A world of possibilities for your AI.</h2>
        </header>

        <div className="home-benefits__grid">
          {benefits.map(({ id, title, titleLines, paragraphs }) => (
            <article
              className={`home-benefit home-benefit--${id}`}
              aria-labelledby={`benefit-${id}-title`}
              key={id}
            >
              <Image
                className="home-benefit__image"
                src={`/images/landing/benefits/${id}.webp`}
                width={1024}
                height={1280}
                alt=""
                unoptimized
                sizes="(max-width: 900px) calc(100vw - 40px), (max-width: 1356px) calc((100vw - 64px) / 2), 622px"
              />
              <div className="home-benefit__copy">
                <h3 id={`benefit-${id}-title`} aria-label={title}>
                  {titleLines.map((line, index) => (
                    <span className="home-benefit__title-line" key={line}>
                      {index > 0 ? ' ' : ''}
                      {line}
                    </span>
                  ))}
                </h3>
                {paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="home-benefits__action">
          <a className="button button--primary" href="/for-ai">
            Join now <ArrowRight size={21} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
