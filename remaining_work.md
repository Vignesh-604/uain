# Remaining discovery work

Register as of 16 November 2026. All implementation remains local at D:\uain on codex/uain-discovery-20261116. No publication or account submission is claimed. The source checkout D:\uain-universa is unchanged.

## Verified local work

- [x] Windows D: checkout, exact origin and audited baseline; branch created before edits (16 November 2026; docs/discovery/2026-11-16-audit.md).
- [x] Reproduced central-task sitemap omission, then added eligible central rows with deduplication and refusal of unavailable/truncated authority (16 November 2026; regression fixtures 0/1/200/201 and authority tests).
- [x] Added bounded canonical sitemap serialization, aggregate index and record sharding across 50,000 URLs (16 November 2026; discovery-sitemaps and discovery-record-shards tests).
- [x] Self-canonical unfiltered task pagination, noindex filter/search combinations, bounded malformed query rejection and out-of-range 404 (16 November 2026; policy tests; full HTTP integration remains below).
- [x] Historical project references use existing public identity reads, escaped text and unavailable catalogue fallback, with bounded lookup latency (16 November 2026; historical-project-references and existing public-record tests).
- [x] Source-linked initial HTML, explanatory pages, research subjects from fresh public catalogue, governance labels and source-attributed verification-limit note (16 November 2026; built-HTML and SEO checks).
- [x] Key-local continuation guidance replaces machine-guide private-key display/paste instructions; no keys read or generated (16 November 2026; source diff).
- [x] IndexNow CLI defaults to dry-run, restricts host/routes, batches and records bounded response handling (16 November 2026; 10 IndexNow tests). No hosted proof or submission.
- [x] Pinned dependency installation, web build including social-preview and owned-discovery checks, website tsc, pilot compilation, 65 focused pilot tests, 18 script/HTML tests and expanded static SEO checks (16 November 2026; local temporary logs, details in audit).
- [x] Nginx routing script parses under Git Bash (16 November 2026; bash -n). This is not an actual Nginx acceptance run.

## Remaining acceptance and external gates

- [x] Independent whole-branch code review and all five Important fixes (16 November 2026; correction ledger and passing regressions).
- [ ] Actual Nginx fixture routing, including aggregate/XML/proof precedence, /research directory collision, /sitemap and old explainer redirect. Local Docker is prohibited by repository instruction. Remote runner requires rsync, which this Windows Git Bash does not expose.
- [ ] Both full backend passes against test-only PostgreSQL, including write-thread mode. UAIN_TEST_PG is not configured. No merge is authorized or attempted.
- [ ] Repository-wide lint remains failing, with many existing source/test diagnostics. New-file scoped lint also exposes the unchanged pilot tsconfig strictNullChecks requirement in an enabled lint rule; do not claim lint is green.
- [ ] Edge mobile/keyboard and hydrated behavior, JS-disabled visual review, full task HTTP integration under the real authority. Build-output checks establish initial HTML only.
- [ ] Inspect the exact authorized Google and Bing UAIN properties and collect UAIN-only console baseline/URL inspections. App-control approval timed out before any authenticated read; no tabs/accounts changed.
- [ ] Inspect existing UAIN Bing/IndexNow ownership proof before any key decision. Reuse existing method; do not guess or rotate. Hosted key publication requires reviewed release and live exact-byte verification.
- [ ] Submit existing/repaired canonical maps and genuinely changed published URLs only after live publication and scoped site confirmation. Preserve actual receipts; distinguish submitted, verified, crawled and indexed.
- [ ] Owner-approved legal/privacy/contact facts before publishing those routes; no placeholder legal promises or invented identity.
- [ ] Owner selection of publishable case studies with source/result/review evidence; the current update reports verification limits only.
- [ ] Confirm public-export changes are ported into the working release repository through the reviewed release path. No local branch push, merge, deployment or direct production modification is authorized.
- [ ] Post-rollout 7/14/28-day measurement and fresh fixed-prompt AI-search citation comparisons; these are not scheduled automations.

## Review follow-ups

- [x] Independent review completed and five Important findings reproduced and corrected locally (16 November 2026; audit correction ledger and regression tests). No Critical findings.
- [ ] Deferred minor: derive insight article modified date from its actual content changes, including the November governance label.
- [ ] Deferred minor: reject/noindex duplicate page query parameters explicitly, beyond current bounds/canonical collapse.

Final post-review verification, 16 November 2026: 68 focused pilot tests and 21 script/HTML tests pass; website build/TypeScript, pilot type/boundary checks and build, SEO and routing-script syntax checks pass. Full PostgreSQL/Nginx/browser and repository-wide lint gates remain open as stated above.
