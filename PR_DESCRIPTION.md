# Catalog Platform — Pull Request Summary

Delivery was split into five sequential PRs into `main` at the project owner's request (`DECISIONS.md` ADR-017). This file summarises the whole submission. Each PR's own description carries its detailed verification.

## PR metadata

| PR | Branch | Scope | Reviewed head | Review outcome | State |
|---|---|---|---|---|---|
| [#1](https://github.com/bsncodes/catalog-platform/pull/1) | `chore/setup` | Workspace, shared contracts, PostgreSQL/ElasticMQ/Mailpit | `9ccbd8b` | CHANGES REQUIRED → fixed → REVIEW PASSED | Merged by owner |
| [#2](https://github.com/bsncodes/catalog-platform/pull/2) | `feat/catalog-service` | Catalog Service, outbox, internal callback, CI/CodeQL/Dependabot | `03a53dd` | PASSED with P2s → fixed → CHANGES REQUIRED (RV2-06) → fixed → REVIEW PASSED | Merged by owner |
| [#7](https://github.com/bsncodes/catalog-platform/pull/7) | `feat/notification-service` | Notification Service | `7d78b0d` | CHANGES REQUIRED → fixed → REVIEW PASSED → follow-up → REVIEW PASSED | Merged by owner |
| [#9](https://github.com/bsncodes/catalog-platform/pull/9) | `feat/frontend-gateway` | React frontend + Nginx gateway | `3ebab07` | REVIEW PASSED with optional P3s; merged by owner at `3ebab07`. The P3 fixes (`14deff9`) were pushed after the merge, so they ship in PR 5, along with RV4-05 | Merged by owner |
| [#12](https://github.com/bsncodes/catalog-platform/pull/12) | `test/e2e-docs` | Playwright E2E, CI E2E job, carried RV4-01..05 fixes, final documentation | `6fc219b` | CHANGES REQUIRED (docs only) → corrected → **REVIEW PASSED** (6011518525); CI 6/6 green | **Open: submission PR** |

PRs #3–#6, #8, #10 and #11 are Dependabot dependency updates, not part of the assessment implementation. The owner merged #4–#6 (GitHub Actions) and #11 (nginx 1.31); #3, #8 and #10 (Node 26 base images) are open.

## Summary

- **Customer journey:** homepage with five backend-configured featured products, category browsing (top rated + additional), search, product details, and product and category enquiries with a Thank You confirmation.
- **Two microservices** with separate databases. Catalog Service owns the catalogue, enquiries, lifecycle, Transactional Outbox and internal callback. Notification Service owns the SQS consumer, email delivery ledger, templates, callback retry and circuit breaker.
- **AWS-compatible messaging:** AWS SDK v3 against ElasticMQ locally (SQS + DLQ in AWS). SMTP to Mailpit locally, with an Amazon SES adapter behind the same interface.
- **Reliability:** atomic enquiry + outbox; at-least-once tolerant consumers; email never resent because of a callback failure; durable callback retries that survive restarts; `RESOLVED` never regressed.
- **Enquiry status API:** `GET /api/catalog/enquiries/{enquiryId}` returns the lifecycle (`RECEIVED` / `PROCESSED` / `RESOLVED`) with timestamps, no customer data (ASM-035, ADR-019); added after the initial submission review at the owner's request.
- **Local:** `cp .env.example .env && docker compose up --build` → http://localhost:8080, with emails visible at http://localhost:8025.

## Assessment acceptance criteria

| Acceptance criterion | Status | Evidence |
|---|---|---|
| Homepage displays the five selected featured products. | PASS | `GET /api/catalog/products/featured` (config `FEATURED_PRODUCT_IDS`); `catalogService.test.ts`; `app.test.tsx`; E2E step 1 |
| Selecting a category displays top-rated and additional products in that category. | PASS | `getCategoryProducts` ordering/dedup tests; RTL category test; E2E step 2 (women's clothing: 5 + 1) |
| Submitting a search term displays only products whose text matches. | PASS | Case-insensitive title/description/category tests, blank `q` → 400; RTL search tests; E2E step 3 |
| Selecting a product tile opens its product details page. | PASS | Product API tests (404/400/provider errors); RTL details test (incl. review count); E2E step 4 |
| Submitting a product enquiry sends an email to the configured sales inbox and displays a Thank You message. | PASS | E2E: Thank You shown → enquiry + outbox persisted → SQS → email in Mailpit to `product-sales@example.com` → internal PATCH → `PROCESSED`; CI smoke repeats the asynchronous chain |

Category enquiries (approved extension, ASM-008) reuse the same model and workflow and are routed to `category-sales@example.com` (E2E test 2).

## Architecture and implementation

```
Browser ──► Nginx gateway :8080 ──► /api/catalog/* ──► Catalog Service :3000 (public)
                │                                         │  PostgreSQL "catalog" (enquiries, outbox, processed_events)
                └─ React SPA                              │  Outbox publisher ──► SQS queue (ElasticMQ) ──► DLQ
                                                          ▲
               Catalog internal :3001 (bearer token) ◄────┤ PATCH notification-status
                                                          │
                                   Notification Service ──┘  PostgreSQL "notification" (notification_deliveries)
                                   (SQS consumer, templates, SMTP→Mailpit / SES, callback retry, circuit breaker)
```

Details: `README.md`, `docs/architecture.md`, `docs/data-model.md`, `docs/event-contracts.md`.

## Key decisions and assumptions

- ADR-017: sequential PRs, the owner's decision; it supersedes the single-PR rule in `CLAUDE.md` §21.
- ADR-018 / ASM-032: internal callback served on a separate listener, authenticated with a bearer token, never routed by the gateway.
- ASM-031: a configured featured product missing upstream → explicit 502 rather than fewer than five.
- ASM-033: terminal monitored `FAILED` callback status (non-retryable rejection or max attempts).
- ASM-034: the duplicate-email window between provider acceptance and the ledger write is accepted, minimised by the email lease and enforced timeouts.

**Approved design deviations:** ADR-017 (PR strategy) only. The architecture is as specified in `SPEC.md`/`CLAUDE.md`.

## Local setup and reviewer instructions

```bash
git clone https://github.com/bsncodes/catalog-platform.git && cd catalog-platform
cp .env.example .env
docker compose up --build
```

Then open http://localhost:8080, submit an enquiry, and check http://localhost:8025. Set `PRODUCT_PROVIDER=fixture` in `.env` to run fully offline. No AWS account or credentials are required.

## Tests and verification

| Suite | Command | Result |
|---|---|---|
| Typecheck (strict) | `pnpm typecheck` | pass |
| Lint | `pnpm lint` | pass |
| Contracts | `pnpm test` | 23 |
| Catalog unit/API | `pnpm test` | 48 |
| Notification unit | `pnpm test` | 24 |
| Web (React Testing Library) | `pnpm test` | 17 |
| Catalog integration (PostgreSQL + ElasticMQ) | `pnpm test:integration` | 20 |
| Notification integration (PostgreSQL + ElasticMQ) | `pnpm test:integration` | 16 |
| End-to-end (Playwright, full stack) | `pnpm test:e2e` | 5 |
| GitHub Actions | quality, integration, compose smoke, CodeQL (from PR #2); E2E job (from PR #12) | green on PRs #2, #7, #9 and #12 (CI did not exist for PR #1) |

Critical failure paths covered by tests:
- email failure leaves the enquiry `RECEIVED`
- exhausted retries go to the DLQ (real ElasticMQ redrive)
- a callback failure is retried without resending the email, including after a simulated restart
- circuit breaker CLOSED / OPEN / HALF_OPEN
- duplicate and concurrent deliveries send one email
- duplicate and stale callbacks never regress `RESOLVED`
- outbox atomic rollback, concurrent claims and lease recovery
- a hung SQS endpoint or email provider times out

## Screenshots or recordings

Not included. The Playwright suite exercises the UI against the running stack, and traces are uploaded by CI on failure.

## Known limitations and deferred work

- **No CD:** deployment to AWS (ECR/ECS/S3/CloudFront) needs an AWS account and an OIDC role (ADR-016). The pipeline is documented, not automated.
- **No sales UI or authentication:** `RESOLVED` exists only as a domain operation (`resolveEnquiry`), with no public route (ASM-024).
- **Alerting is log-based:** `callback_status = FAILED` and DLQ depth are logged/queryable; CloudWatch alarms are future work.
- **Duplicate-email window:** a crash between provider acceptance and the ledger commit can resend one email (ASM-034).
- **No caching:** products are fetched from the provider per request (ASM-027).
- **Frontend bundle:** includes all of Zod (about 50 kB gzip).
- **Email provider errors are all treated as retryable** (permanent rejections still use the SQS retries).

Next steps and growth beyond the PoC: `DECISIONS.md` §9.

## Independent PR review

- **Reviewer:** Claude Code `pr-reviewer` subagent (`.claude/agents/pr-reviewer.md`, Claude Opus 5.5). It is the same model family as the implementer, so this is not a cross-model review.
- **Findings:** P0: 0. P1: 0. P2: 6 (RV1-01, RV1-02, RV2-01, RV2-02, RV2-06, RV3-01), all fixed. P3: 13 (incl. RV4-01..05), all fixed (RV4-01..05 via PR 5) or documented.
- Verdicts were published as GitHub COMMENT reviews on each PR, with the reviewed SHA. No formal approval is claimed (the author and reviewer share an identity).
- Finding-by-finding history: `AI_USAGE.md` §5–6 and each PR's conversation.

## Final checklist

- [x] Each PR targets `main` from its feature branch; the owner merges.
- [x] The five original acceptance criteria have evidence (above).
- [x] Full source code and tests are included; no secrets are committed (`.env` is git-ignored; `.env.example` has local placeholders only).
- [x] Setup verified from a clean checkout by the CI compose smoke and E2E jobs.
- [x] Tests, type checking and lint have recorded outcomes.
- [x] Known limitations are disclosed.
- [x] `AI_USAGE.md` and `TIME_SPENT.md` reflect actual work.
- [x] The independent reviewer published a verdict on every PR. Corrections were pushed to the same PR and re-reviewed, except for #9: it was merged at its reviewed head before the P3 fix commit landed, so those fixes are carried and re-reviewed in #12.
