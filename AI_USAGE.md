# AI Usage Notes

**Version:** 1.0  
**Status:** Working record — planning and documentation stage  
**Project:** AI-Native Engineer Code Challenge for Catalog Platform
**Last updated:** 2026-11-21

> **Accuracy rule:** This file distinguishes AI tools that have already been used from tools selected for the implementation workflow. Update it as implementation, testing and review happen. Do not present planned work, generated code, prompts, reviews or test results as completed evidence.

## 1. Summary

AI assistance has been used to structure the project documentation and record the intended engineering workflow. The implementation model and review workflow are specified in `CLAUDE.md`, but this document must be updated with the exact models and agents actually invoked during the coding session.

The human owner remains responsible for the submitted source code, design decisions, tests and documentation. AI output is a proposal until it has been inspected and verified.

## 2. Tools and Models

| Tool / model | Status | Intended or completed use | Evidence / notes |
|---|---|---|---|
| ChatGPT — GPT-6 | Used for planning and documentation in this preparation workflow | Requirements analysis, architecture clarification, and drafting the project records | Assisted with `ASSUMPTIONS.md`, `DECISIONS.md` and `PLAN.md`. The user reviewed the direction and corrected scope and document-editing expectations during the conversation. |
| Claude Code (VS Code extension) — Claude Opus 5.5 (`claude-opus-5-5`) | Used, 2026-11-22 from 13:32 IST | Primary implementation engineer: repository inspection, all application code, tests, Docker/CI configuration, PR creation and documentation updates | One continuous session supervised by the project owner; see §7 and `TIME_SPENT.md`. |
| Claude Code `pr-reviewer` subagent — `model: inherit` (Claude Opus 5.5) | Used on every PR | Independent, read-only review of each PR's real diff, published as GitHub COMMENT reviews | `.claude/agents/pr-reviewer.md` is committed. Same model family as the implementer, so this is an independent agent review, **not** a cross-model review. Evidence in §6. |
| Additional specialist or external model reviewers | Not used | — | No external cross-model review was performed during implementation. |
| GitHub CodeQL + Dependabot | Used (automated) | Static analysis on every PR; dependency update PRs | CodeQL flagged one issue (missing rate limit on `/health/ready`), fixed in PR #2. Dependabot opened PRs #3–#6, which were left for the owner to decide. |

### Usage status at submission

- Planning/documentation assistance (GPT-6): used before implementation (2026-11-21).
- Implementation (Claude Code, Opus 5.5): used for the whole build on 2026-11-22.
- Independent PR review (`pr-reviewer` subagent): ran on every PR, with fix-and-re-review cycles (§6).
- Test results quoted in the PRs and README were produced by commands actually run in this session or by GitHub Actions.

## 3. Agent Instructions and Project Context

The following project files provide instructions or context to AI tools and should be committed with the repository:

| File | Purpose | Status / use |
|---|---|---|
| `CLAUDE.md` | Engineering constitution, stack constraints, architecture guardrails, autonomous execution rules and PR-review workflow | Present in the project document set and designated as the primary agent instruction file. |
| `SPEC.md` | Functional requirements, service boundaries, API expectations, event processing and verification criteria | Present; use as the implementation specification. |
| `ASSUMPTIONS.md` | Records interpretations of ambiguity and their status | Present; update when implementation evidence confirms or invalidates an assumption. |
| `DECISIONS.md` | Records architectural decisions, alternatives, rationale and consequences | Present; change only through deliberate decision/change control. |
| `PLAN.md` | Implementation phases, time targets, dependencies and exit gates | Present; update actual phase status and deviations during execution. |
| `.claude/agents/pr-reviewer.md` | Dedicated reviewer-agent instructions | Committed (tracked since the initial docs commit). Used for all 9 review runs in §6. Tools: Read, Grep, Glob, Bash; read-only; `model: inherit`. |
| `.github/workflows/ci.yml`, `codeql.yml`, `.github/dependabot.yml` | Automated verification on every PR | Added in PR #2 at the owner's request; E2E job added in PR 5. |

`README.md`, `TIME_SPENT.md`, `PR_DESCRIPTION.md` and the detailed `docs/` contracts are execution/submission records. Update them from the real implementation and measured results rather than treating the planning documents as evidence that the work has been completed.

## 4. Key Prompts and Directional Moments

The entries below are **paraphrased summaries of the directions that shaped the approach**, not verbatim prompt transcripts. Retain or replace them with exact prompt excerpts from the actual coding sessions where available.

### 4.1 Use AI autonomously, but preserve human ownership

**Direction:** Use an AI coding workflow to plan and build the solution, while keeping the engineer accountable for every line, decision and test. Generated output must be reviewed and defensible in the follow-up interview.

**Effect on the solution:** The project uses explicit engineering instructions, decision records, phase gates, test evidence and an independent PR review. AI generation is not treated as proof of correctness.

### 4.2 Resolve ambiguity through recorded assumptions

**Direction:** When a requirement is unclear, make a reasonable assumption, record it in `ASSUMPTIONS.md` and proceed instead of repeatedly blocking implementation for clarification.

**Effect on the solution:** Assumptions have IDs, impact/status fields and links to the relevant design decisions. An assumption must be revisited when implementation evidence contradicts it.

### 4.3 Keep the business architecture deliberately small

**Direction:** Preserve exactly two business microservices: Catalog Service and Notification Service. Do not add a separate Enquiry Service or introduce infrastructure outside the approved stack without a justified architectural change.

**Effect on the solution:** Catalogue and enquiry business ownership stay in Catalog Service; notification delivery and its delivery ledger stay in Notification Service. The boundary is documented in `SPEC.md` and `DECISIONS.md`.

### 4.4 Use the SQS-compatible path locally and in production

**Direction:** Use AWS SDK for JavaScript v3 and SQS as the messaging abstraction. Use ElasticMQ for local execution; do not substitute BullMQ, Redis, Kafka or RabbitMQ as a shortcut.

**Effect on the solution:** The local environment is intended to exercise the SQS integration path without requiring reviewer AWS credentials or a paid account. Any emulator limitations must be called out and production AWS behaviour must not be assumed to have been fully verified locally.

### 4.5 Do not equate email acceptance with completed enquiry processing

**Direction:** Keep enquiry business status owned by Catalog Service. A successful email-provider acceptance is not enough to mark an enquiry `PROCESSED`; the Catalog Service callback must succeed and persist the transition. A callback failure after email acceptance must be retried without sending the email again.

**Effect on the solution:** `SPEC.md` and `DECISIONS.md` separate the enquiry lifecycle from notification delivery/callback state and require durable callback recovery and idempotency.

### 4.6 Actual directions during the implementation session (2026-11-22, verbatim where quoted)

| Time (IST) | Owner direction | AI response / effect |
|---|---|---|
| 13:32 | Session brief: *"Total time budget: 180 minutes from the actual session start … Follow `PLAN.md` … Do not force-push, merge, deploy, delete branches or publish changes to remote services without my explicit approval."* | Start time recorded from the system clock (13:32:41). Work ran autonomously; remote actions waited for approval. |
| ~13:44 | *"but are we doing in 1 PR or several PR's are raised?"* | Answered: one PR, per `CLAUDE.md` §21. |
| ~13:44 | *"no, lets break it and do it in multiple PR's after your setup is done"* | Asked two clarifying questions. The owner chose **"Sequential into main"** and **"Every PR"** reviewed. Recorded as ADR-017, which supersedes the single-PR rule. Work split into 5 PRs. |
| ~13:48 | *"yes approved all your git commands go ahead"* | Given after Claude Code's auto-mode safety check blocked the first `git push`. Branches pushed and PRs opened. Merging was left to the owner, and force-pushes were avoided (a rebased branch was reset to its pushed tip instead). |
| ~14:00 | *"can you setup and add all the relevant github CI/CD pipeline workflow actions in the PR2 only"* | Added CI (quality, integration with service containers, compose smoke), CodeQL and Dependabot to PR #2. CD to AWS was **not** automated: there is no AWS account or OIDC role, and the owner had asked for no deploys. Documented in the README. |
| 14:33 | *"note all this TIME_SPEND and AI_USAGE"* | This section, the review/runtime records below and the `TIME_SPENT.md` checkpoint. |
| 14:43 | *"we should only consider only the active time in the session, irrespective of how many agents are working, means the time we started and paused, and then resumed, until we finished, and the total time shouldn't exceed 180 mins."* | `TIME_SPENT.md` now counts session wall-clock time only: parallel agents add nothing, waiting inside the session counts, and there is a hard stop at 16:32:41 IST. |

### 4.7 Tooling and permission events

- **Auto-mode safety checks (Claude Code):** (1) a multi-heredoc shell command was blocked because the checker could not rule out a dangerous removal. Nothing was deleted; the files were rewritten with the Write tool. (2) `git commit && git push` was blocked as an outward action until the owner approved. The local commit was then made separately.
- **Owner-only actions:** all assessment PRs were merged by the owner, not the AI.
- **Merge/fix race (PR #9):** the owner merged #9 at its reviewed head `3ebab07` (14:48 IST) while the implementer was preparing fixes for the reviewer's P3 findings. The fix commit `14deff9` was then pushed to the already-merged branch. The re-review caught that these fixes never reached `main` and had no CI run. Correction: the fixes ship in PR 5, which contains `14deff9`, and they get CI there. Lesson: tell the owner when a fix round is in progress, and check the PR state before pushing.
- **Dependabot:** after CI landed, Dependabot opened #3 (Node 22 → 26 base image), #4–#6 (GitHub Actions major bumps). The AI did not merge or modify them. It recommended holding the untested Node 26 bump and left the decision to the owner.



### 5.1 Confirmed documentation-process correction

During documentation preparation, the user clarified that edits must remain scoped to the requested file and must not rewrite unrelated sections or existing documents. The user also emphasized that generated Markdown must be valid and preserve the existing content and structure where a change is narrow.

**Correction applied to the workflow:** Subsequent document deliverables were generated as separate files, and the existing project documents were treated as source material rather than rewritten as part of each new document. This is a documentation/workflow correction; it is not a claim that an implementation-code defect has already been found and fixed.

### 5.2 Implementation-code errors (actual, 2026-11-22, Claude Code / Opus 5.5)

| # | AI-generated output | How it was detected | Why it was wrong | Correction | Verification |
|---|---|---|---|---|---|
| 1 | SQS timeout fix for RV2-02 used only `requestTimeout` | `pr-reviewer` re-review reproduced a hung send against a TCP server that never replies (RV2-06) | In `@smithy/node-http-handler` 4.x, `requestTimeout` only logs a warning unless `throwOnRequestTimeout: true`. The outbox loop could still stall forever. | `createSqsClient` factory with `throwOnRequestTimeout` + `socketTimeout` (`03a53dd`). The same lesson was applied to Notification's SQS and SES clients. | New test asserts `TimeoutError`, and it **fails without the fix** (mutation-checked by the implementer and by the reviewer) |
| 2 | Event v1 schema used `min(1)` without trim/max | Reviewer RV1-01 ran the built schema with whitespace and a 50k-character message | Looser than the documented event contract | Trim + bounds, reusing the shared limits (`9ccbd8b`) | Contract tests for whitespace and oversize cases |
| 3 | Postgres health check `pg_isready` over the Unix socket | Reviewer RV1-02 (upstream image behaviour) | Could report healthy before the init script created the service roles/databases | TCP check (`9ccbd8b`) | Clean `down -v` boot verified |
| 4 | Catalog `pg.Pool` without an `'error'` listener | Reviewer RV2-01 reproduced a process exit via `pg_terminate_backend` | An idle-connection drop would crash Catalog and stop the outbox | Listener + `restart: unless-stopped` (`be5ee15`) | Integration test terminates a backend and queries again |
| 5 | SES client built with SDK defaults | Reviewer RV3-01 | A hung send could outlive the email lease and SQS visibility timeout, causing a duplicate email | `createSesClient` with enforced timeouts, a processor send-timeout guard, and config budget validation (`872100b`) | Hanging-provider integration test → `EMAIL_FAILED`; config tests |
| 6 | Vitest `--exclude` glob for unit tests | Local test failures (integration files ran in parallel against one DB) | The CLI glob did not match, so `pnpm test` also ran integration tests | Separate `vitest.config.ts` / `vitest.integration.config.ts` | Unit 39 + integration 17 green |
| 7 | `EnquiryRequest = z.output<…>` made `message` a required key | `pnpm typecheck` | Zod transform output typed `message: string \| undefined` as required | Explicit optional type in contracts | Typecheck 0 |
| 8 | Nginx: regex `location ~ ^/(api\|internal\|health)` alongside a plain `/api/catalog/` prefix | Manual curl through the gateway returned 404 for the API | Regex locations win over non-`^~` prefixes | `location ^~ /api/catalog/` | Gateway curls + CI smoke + E2E |
| 9 | Frontend toolchain: `@vitejs/plugin-react` 6 with Vite 7; `jsdom` 31 | Vitest startup errors | plugin-react 6 needs Vite 8; jsdom 31's undici 8 fails on the local Node 23.0 | plugin-react 5; pnpm override `jsdom: ^26.1.0` | 14 frontend tests green |
| 10 | E2E read the `<h1>` immediately after clicking a product | E2E assertion: expected the homepage hero title | Race with client-side navigation | Wait for the product URL/details first | 5/5 E2E green |
| 11 | 400 vs 422 mapping for enquiry validation | Reviewer RV2-03 | All schema failures returned 422; the contract says structural problems get 400 | Structural/field split (`be5ee15`) | API tests for both cases |
| 12 | Enquiry form said "not sent" on any failure, including a gateway timeout where the enquiry may have been stored | Reviewer RV4-01 | Misleading result, which could prompt a duplicate enquiry; nginx also returned HTML for gateway errors | JSON gateway errors; "could not confirm" wording for 504/network (`14deff9`) | RTL test; live: Catalog stopped → JSON 504 with correlation id |

Process issue: in one run the reviewer subagent checked out a commit inside the implementer's worktree, leaving it on a detached HEAD. No work was lost. Later review prompts required the reviewer to use its own worktree.

### 5.3 Review discipline

For every material AI-generated change:

1. Compare it with the original assessment and the current `SPEC.md`.
2. Check that it follows `CLAUDE.md`, `ASSUMPTIONS.md` and `DECISIONS.md`.
3. Inspect the actual diff and affected call paths; do not rely only on the AI's summary.
4. Run the relevant tests, type checks and lint checks. Record exact commands and outcomes.
5. For critical workflow changes, inspect both the success path and the relevant failure/retry path.
6. Evaluate reviewer findings technically. Accept or reject each with a reason; do not blindly apply suggestions.

## 6. Independent Review Evidence

Reviewer: Claude Code `pr-reviewer` subagent (`.claude/agents/pr-reviewer.md`, committed; `model: inherit` → Claude Opus 5.5). All reviews are GitHub **COMMENT** reviews; the author and reviewer share a GitHub identity, so no formal approval is claimed. No external cross-model review was performed.

| PR | Reviewed SHA | Verdict | Findings | Corrections |
|---|---|---|---|---|
| #1 setup | `d6d0378` | CHANGES REQUIRED (review 6011199598) | RV1-01 P2, RV1-02 P2, RV1-03..05 P3 | `9ccbd8b` |
| #1 | `9ccbd8b` | REVIEW PASSED (6011207779) | — | Merged by owner |
| #2 catalog | `3937ed7` | REVIEW PASSED with P2/P3 to resolve (6011233839) | RV2-01 P2, RV2-02 P2, RV2-03/04 P3 | — |
| #2 | `e7dcbdc` (CI added) | REVIEW PASSED (6011245842) | RV2-05 P3 (CodeQL) | — |
| #2 | `be5ee15` | CHANGES REQUIRED (6011271968) | RV2-06 P2: RV2-02 fix ineffective (reproduced) | `03a53dd` |
| #2 | `03a53dd` | REVIEW PASSED (6011294790) | — | Merged by owner |
| #7 notification | `39b2f71` | CHANGES REQUIRED (6011373403) | RV3-01 P2, RV3-02/03 P3 | `872100b` |
| #7 | `872100b` | REVIEW PASSED (6011398653) | Non-blocking: guard timeout released the email lease | `7d78b0d` (accepted voluntarily) |
| #7 | `7d78b0d` | REVIEW PASSED (6011412047) | — | — |
| #9 frontend/gateway | `3ebab07` | REVIEW PASSED with optional P3s (6011463722) | RV4-01 gateway HTML errors / misleading "not sent" on timeout; RV4-02 rating not announced to screen readers; RV4-03 silent 422; RV4-04 stale README table | Owner merged #9 at `3ebab07` (14:48 IST) before the fix commit was pushed |
| #9 | `14deff9` (pushed after merge) | CHANGES REQUIRED (6011475023): fixes correct, but **not in `main`**; new RV4-05 P3 | P1: RV4-01..03 not merged; RV4-05 unvalidated correlation id echoed into gateway JSON | Fixes shipped via PR 5 (contains `14deff9`) + RV4-05 fix in PR 5; RV4-04 fixed in PR 5 |

Later PR reviews are recorded in each PR's conversation and in `PR_DESCRIPTION.md`.

**Reviewer runtime (diagnostic only; it runs inside the session's wall clock, so per the owner's rule it adds nothing to `TIME_SPENT.md`):**

| Review run | Reviewed SHA | Wall time | Tool calls |
|---|---|---:|---:|
| PR #1 initial | `d6d0378` | 127 s | 10 |
| PR #1 re-review | `9ccbd8b` | 59 s | 5 |
| PR #2 initial | `3937ed7` | 225 s | 19 |
| PR #2 CI commit | `e7dcbdc` | 348 s (cumulative with the initial run) | 26 |
| PR #2 re-review | `be5ee15` | 207 s | 10 |
| PR #2 re-review | `03a53dd` | 122 s | 4 |
| PR #7 initial | `39b2f71` | 268 s | 14 |
| PR #7 re-review | `872100b` | 162 s | 5 |
| PR #7 re-review | `7d78b0d` | 163 s | 3 |

Every reviewer finding was validated by the implementer against the code before it was fixed. None was rejected, and one non-blocking observation was voluntarily implemented (`7d78b0d`). Re-reviews were run against the exact new head SHA each time.

A reviewer subagent running in the same model family is an independent agent review, but it is not automatically an external cross-model review. Describe the review accurately.

## 7. Actual AI-Assisted Work Log

Add a row for each meaningful implementation or review session. Keep the entries concise but specific enough for the follow-up interview.

| Date | Tool / exact model | Task | Files or areas changed | Human verification performed | Outcome / follow-up |
|---|---|---|---|---|---|
| 2026-11-21 | GPT-6 | Planning and project-document preparation | `ASSUMPTIONS.md`, `DECISIONS.md`, `PLAN.md` | User reviewed the direction and provided corrections; no application-code verification is implied | Planning records prepared; implementation usage remains to be logged |
| 2026-11-22 | Claude Code — Claude Opus 5.5 | Workspace, contracts, infra (PR #1) | root config, `packages/contracts`, `docker-compose.yml`, `infra/` | Owner approved the PR strategy and the push; owner merged | Merged |
| 2026-11-22 | Claude Code — Claude Opus 5.5 | Catalog Service + CI (PR #2) | `services/catalog`, `.github/` | 45 unit + 18 integration tests, compose smoke, GitHub Actions; owner requested CI in this PR | Merged after 3 review rounds |
| 2026-11-22 | Claude Code — Claude Opus 5.5 | Notification Service (PR #7) | `services/notification` | 24 unit + 16 integration tests, full local SQS→Mailpit→PROCESSED run | REVIEW PASSED at `7d78b0d` |
| 2026-11-22 | Claude Code — Claude Opus 5.5 | Frontend + gateway, Playwright E2E | `apps/web`, `infra/nginx`, `e2e/` | 14 RTL tests; 5 Playwright tests against the running stack | PRs 4–5 |
| 2026-11-22 | Claude Code `pr-reviewer` subagent — Opus 5.5 | Independent review of every PR | none (read-only) | Implementer validated every finding before fixing; all were accepted | See §6 |

## 8. Before Submission

- [ ] Replace intended-tool descriptions with exact tools/models actually used.
- [ ] Confirm the agent instruction files included in the committed repository.
- [ ] Preserve 3–5 meaningful prompts or moments; use exact excerpts where available and label paraphrases clearly.
- [ ] Add actual examples of AI mistakes and how they were caught, or explicitly state that no material implementation error was observed.
- [ ] Record actual reviewer agent/model, PR URL, reviewed SHA, verdict and corrections only after they occur.
- [ ] Record any external cross-model review only if it actually happened.
- [ ] Ensure no secrets, private credentials or sensitive prompt content are included.
- [ ] Keep this document consistent with `TIME_SPENT.md`, `PLAN.md`, the final PR and the repository history.

---

**Ownership statement:** AI tools assisted with planning, implementation and review. The submitting engineer remains responsible for understanding, reviewing, testing and defending the complete solution.
