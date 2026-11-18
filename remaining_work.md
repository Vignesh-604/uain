# Prompt injection safe setup — 18 November 2026

- [ ] Kit 0.2.24 untrusted labels, Safe setup in both llms.txt, guide `safety` topic, join-page warning: release BAINK 0.3.107 and check live (uain.global deploys from main via uain-infrastructure).

# Repository cutover — 17 November 2026

- [x] Verify the first production release built from this public repository (17 November 2026).
- [x] Verify staging, backup and anchoring workflows, signed-root publication and runner ownership under the new repositories (17 November 2026).
- [x] Disable and archive the former private working repository after verified cutover (17 November 2026).

# Remaining discovery work

Updated 18 November 2026. Checkout D:\uain; synchronization branch codex/uain-discovery-sync-20261118; publication account Vignesh-604. The original implementation is already merged in both repositories, with the remaining public fixes merged in PR #13. This synchronization does not merge to main, switch production, or change deployment configuration.

## Verified pre-release checks

- [x] Task-map eligibility, shared detail IDs, complete-authority handling, canonical pagination, query bounds and noindex policy; tested through the compiled HTTP handler and query fixtures.
- [x] Actual Nginx routing: aggregate and leaf maps, record priority, research directory collision, HTML directory, ownership-proof file handler and exact relative redirect.
- [x] Both full PostgreSQL backend modes: each 932 tests, 923 passed, 0 failed, 9 explicit skips. GitHub Actions run https://github.com/Vignesh-604/uain/actions/runs/43904845015 at code commit 9f4f1bb.
- [x] Web build, social previews, owned discovery, website TypeScript, pilot type/boundary checks, SEO and 23 script/HTML tests in that successful run.
- [x] All 21,600 tracked public catalogue rows compared against project-area mapping.
- [x] All 31 focused valuation/catalogue checks passed locally with original valuation fixtures supplied read-only through UAIN_VALUATION_FIXTURE_DIR; zero skips. No private source content copied or published.
- [x] Lint regression comparison: 5,429 baseline diagnostics, 5,429 branch diagnostics, zero additional diagnostics. Global pre-existing lint debt remains; this does not claim repository-wide lint is clean.
- [x] Edge desktop and 390px mobile inspection of all new discovery pages plus network/project indexes; no horizontal overflow; keyboard menu/focus works; failed API reads show unavailable rather than zero. Visual QA fixed article typography and list visibility.
- [x] Initial HTML checks strip scripts to verify readable headings, dates, sources, canonical metadata and catalogue links.
- [x] UAIN-only Google/Bing console review, sample URL inspections, security/manual-action status and search/crawl baseline. Bing's exact verification tag is prepared and tested on the branch.
- [x] Independent reviews completed; all Important findings corrected, including retaining real catalogue coverage and failing on lost individual valuation fixtures.

## Explicit verification limits

The CI skips comprise six valuation comparisons whose documents are absent from the public export (all independently passed locally) and three pre-existing opt-in native epoch/guardian/vector integration tests. Those optional integration environments were not exercised. Browser developer-protocol permission was declined for JavaScript-disable emulation; it was not bypassed. Script-free built HTML was tested, and ordinary hydration/unavailable-data behavior was checked in Edge. No statement of clinical validation or complete private-network qualification is made.

## Release and post-publication work

- [x] Original discovery implementation merged; the remaining public signer and CI fixes are merged in PR #13. A fresh synchronization branch preserves current public main and subsequent contributors' changes. No additional production action is part of this synchronization.
- [x] Bing's exact proof is live and ownership verified. All six submitted maps showed Success in Bing and Google during the 16 November console checks; Bing reported zero errors and warnings.
- [x] IndexNow accepted 12 changed pages with HTTP 200 on 16 November; Google accepted About/Research priority crawl requests. The live crawl checked 381 advertised URLs plus the task index without HTTP/canonical/noindex failures. Receipts were retained outside the repository. These are dated submission observations, not guarantees of indexing or a new live check on 18 November.
- [ ] Check post-rollout map acceptance, exclusions, impressions and citations at 7/14/28 days; no automations scheduled.

Owner-approved legal/contact pages and additional research case studies remain optional future content, not invented placeholders in this release.
