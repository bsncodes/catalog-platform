# Catalog Platform — Time Spent

**Version:** 1.0  
**Status:** Tracking template — actual execution time not yet recorded  
**Project:** AI-Native Engineer Code Challenge  
**Planning baseline:** 180 minutes (from `PLAN.md`)  
**Tracking rule:** Record measured time only; never copy target time into the actual column.

---

## 1. Purpose

This document records the actual time spent planning, implementing, testing, reviewing and preparing the Catalog Platform submission. It is intended to make the assessment time-box transparent and auditable.

`PLAN.md` defines an approximate 180-minute allocation. This file records what actually happened. The target is not evidence of time spent, and exceeding it is not a reason to skip required functionality, testing or review.

## 2. Time-Recording Rules

1. Record actual start and finish times as work happens, preferably at the end of each phase or focused session.
2. Record active project elapsed time, including time spent supervising AI-assisted implementation, running commands, waiting for relevant builds/tests and reviewing outputs while the task is in progress.
3. Exclude meal breaks, personal breaks and unrelated work. Record substantial interruptions separately so the elapsed timeline remains understandable.
4. Do not reconstruct precise durations from memory. Mark an entry `Not tracked` when reliable timing evidence is unavailable.
5. Keep the date, timezone and clock format consistent. Use `Asia/Kolkata` and 24-hour local time unless the assessment specifies otherwise.
6. Link each phase to evidence where possible: commits, PR activity, test output, screenshots or completed deliverables.
7. If work is resumed on another day, create a separate session entry. Sum the session durations for the phase; do not treat the calendar gap as working time.
8. Record the final measured total even when it exceeds 180 minutes. Explain overruns and deferred work rather than altering the numbers.

**Duration definitions**

- **Active project time:** Time spent directly progressing or supervising the assessment work, excluding breaks and unrelated interruptions.
- **Wall-clock span:** Time between the first and last recorded work timestamps, including breaks and interruptions that occurred within that span.
- **AI tool runtime (optional):** Time reported by the tool for an agent or job. This is a diagnostic metric and must not be added again to active project time when it overlaps with the same session.

Use active project time for the phase total and comparison with the 180-minute target. Use wall-clock span only to explain the overall timeline.

## 3. Phase-Level Summary

The targets below are copied from the approved phase allocation in `PLAN.md`. Actual durations and variance are intentionally blank until measured.

| Phase | Activity | Target (min) | Actual (min) | Variance (min) | Status / evidence |
|---|---|---:|---:|---:|---|
| 0 | Planning and repository inspection | 15 | — | — | Not yet measured; record repository baseline and feature branch |
| 1 | Repository and infrastructure setup | 15 | — | — | Not yet measured; link setup commits and local startup evidence |
| 2 | Catalog Service | 35 | — | — | Not yet measured; link implementation commits and API tests |
| 3 | Frontend | 35 | — | — | Not yet measured; link implementation commits and UI verification |
| 4 | Enquiry and event processing | 35 | — | — | Not yet measured; link service commits and workflow/failure-path tests |
| 5 | Testing and integration | 20 | — | — | Not yet measured; link exact test commands and results |
| 6 | PR and independent review | 15 | — | — | Not yet measured; link PR, reviewer verdict and reviewed SHA |
| 7 | Final corrections and documentation | 10 | — | — | Not yet measured; link final corrections and submission evidence |
| | **Total** | **180** | **—** | **—** | **Calculate after all actual phase entries are recorded** |

**Variance formula:** `Actual minutes − Target minutes`. A positive value is an overrun; a negative value is time saved. Do not report a total actual duration while any material execution time is untracked without clearly qualifying the total.

## 4. Session Log

Add one row for each focused work session. Use additional rows when a phase spans multiple sessions or days.

| Session | Date | Phase | Start (IST) | End (IST) | Breaks / unrelated interruption (min) | Active project time (min) | Work performed and outcome | Evidence |
|---|---|---|---|---|---:|---:|---|---|
| S-001 | 2026-11-22 | 0, 1, 2, 6 (interleaved) | 13:32 | 13:54 | 0 | 22 | Repository inspection; workspace + contracts + infra (PR 1); Catalog Service implementation and tests; PR strategy changed to sequential PRs (ADR-017, owner decision at ~13:44); PR #1 opened, reviewed (CHANGES REQUIRED, 2×P2 + 3×P3), fixed, re-reviewed (REVIEW PASSED); owner merged PR #1 at 13:53 | Start `date` 13:32:41; commits d6d0378, 9ccbd8b, PR #1 reviews 6011199598 / 6011207779 |
| S-001 (cont.) | 2026-11-22 | 2, 3, 4, 5, 6 (interleaved) | 13:54 | 14:33 | 0 | 39 | PR #2 opened; CI/CodeQL/Dependabot added at owner request; RV2-01..06 fixed over three review rounds; owner merged PR #2 (~14:17). Notification Service built and tested; PR #7 opened, RV3-01..03 fixed, re-reviewed twice (REVIEW PASSED at 7d78b0d). React frontend + Nginx gateway built and verified (PR 4, local). Playwright E2E 5/5; fresh `down -v` → ready in 145s → E2E 5/5 with live Fake Store | PR #2 reviews 6011233839…6011294790; PR #7 reviews 6011373403…6011412047; CI runs on each PR |

Add rows as required; do not leave placeholder rows in the final submitted record if no session took place.

## 5. Planning and Documentation Preparation

The project documents `ASSUMPTIONS.md`, `DECISIONS.md`, `PLAN.md` and `AI_USAGE.md` have been prepared before implementation. Their existence is documented in the repository, but the time spent producing them was not measured with a reliable timer in this record.

**Treatment:** Do not assign retrospective minute estimates to this preparation work. If reliable contemporaneous timestamps or tooling records are available, add a clearly labelled pre-execution session to the session log and include it in the total only if it falls within the assessment's measured time window. Otherwise, state that pre-execution documentation time is untracked and keep it separate from the measured implementation total.

## 6. Milestone Timeline

Complete this section using actual timestamps and links.

| Milestone | Actual date and time (IST) | Evidence / reference |
|---|---|---|
| Repository inspection completed | 2026-11-22 13:33 | Feature branch created after reading CLAUDE/PLAN/contracts docs |
| Feature branch created | 2026-11-22 13:33 (`feat/catalog-platform`); replaced by per-PR branches from 13:47 (ADR-017) | `git checkout -b` output |
| Local environment starts successfully | 2026-11-22 ~13:51 infra + Catalog (no gateway yet) | `docker compose up -d --build catalog`: migrate applied, catalog healthy, featured 200, enquiry 202 + outbox published |
| Catalogue experience completed | 2026-11-22 ~14:20 (frontend + gateway verified locally) | RTL 14/14; gateway curls; E2E steps 1–4 |
| Enquiry-to-email happy path verified | 2026-11-22 ~14:11 (backend), ~14:24 (browser E2E) | Enquiry → Mailpit → PROCESSED locally; Playwright journey |
| Failure and retry paths verified | 2026-11-22 ~14:12 | Notification integration tests (email failure, DLQ, callback retry after restart, circuit breaker) |
| Assessment PR opened | PR #1 (setup) opened 2026-11-22 ~13:48–13:50; merged by owner 13:53 | https://github.com/bsncodes/catalog-platform/pull/1 |
| Independent reviewer verdict received | PR #1: CHANGES REQUIRED then REVIEW PASSED (9ccbd8b) before 13:53 | PR #1 reviews |
| Required corrections completed | Pending | Pending |
| Final verification completed | Pending | Pending |

## 7. Time-Box Review

Complete after implementation and review are finished.

| Metric | Actual result |
|---|---|
| Total active project time | Pending — calculate from measured sessions |
| Total wall-clock span | Pending — derive from first and last timestamps |
| Total breaks / unrelated interruptions | Pending |
| Difference from 180-minute target | Pending |
| Phases completed within target | Pending |
| Main causes of overruns or savings | Pending |
| Work deferred or left incomplete | Pending — cross-reference `PLAN.md` and known limitations |

### Reflection

- **What consumed more time than expected?** Pending.
- **What was completed faster than expected, and why?** Pending.
- **Which implementation or verification trade-offs were made?** Pending; link relevant decisions and review findings.
- **Did the time-box affect quality or scope?** Pending; describe the evidence and any deferred work.

## 8. Before Submission

- [ ] Replace all `Pending` placeholders with measured values or an explicit `Not tracked` explanation.
- [ ] Ensure phase actuals reconcile with the session log.
- [ ] Calculate total active project time and variance from 180 minutes.
- [ ] Explain any untracked preparation time; do not imply it was included in the measured total.
- [ ] Link commits, tests and PR/reviewer evidence where available.
- [ ] Ensure claims match `PLAN.md`, `AI_USAGE.md`, the Git history and the final PR.
- [ ] Remove unused placeholder session rows.
- [ ] Record incomplete work and limitations honestly.

---

**Accuracy statement:** This document starts as an unfilled tracking template. No actual implementation duration, execution timestamp, test result or reviewer duration is asserted until it is measured and entered.
