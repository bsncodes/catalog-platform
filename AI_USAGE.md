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
| Claude Code — Claude Opus 5.5, Medium effort | Selected in project instructions; actual implementation usage must be confirmed | Primary implementation engineer for repository inspection, coding, tests and documentation updates | This exact model/effort is declared in `CLAUDE.md`. Add actual session dates and tasks after running it. |
| Claude Code `pr-reviewer` subagent | Required by the project workflow; completion not yet evidenced here | Independent review of the actual pull-request diff, acceptance criteria, architecture and failure paths | The prescribed instruction-file location is `.claude/agents/pr-reviewer.md`. Record whether that file is committed, the model used, PR URL, reviewed commit SHA and actual verdict after the review occurs. |
| Additional specialist or external model reviewers | Not recorded as used | Optional architecture or reliability review at major milestones | `CLAUDE.md` permits additional specialist agents and an external model such as GPT-6, but explicitly says not to claim cross-model review unless it actually happened. |

### Usage status at the time this file was created

- Planning/documentation assistance: used.
- Claude implementation sessions: selected in the instructions; execution details still need to be logged.
- Independent PR review: required by the instructions; no completed review evidence is recorded in this file yet.
- Test execution and code corrections: record actual outcomes during implementation; do not infer them from `PLAN.md`.

## 3. Agent Instructions and Project Context

The following project files provide instructions or context to AI tools and should be committed with the repository:

| File | Purpose | Status / use |
|---|---|---|
| `CLAUDE.md` | Engineering constitution, stack constraints, architecture guardrails, autonomous execution rules and PR-review workflow | Present in the project document set and designated as the primary agent instruction file. |
| `SPEC.md` | Functional requirements, service boundaries, API expectations, event processing and verification criteria | Present; use as the implementation specification. |
| `ASSUMPTIONS.md` | Records interpretations of ambiguity and their status | Present; update when implementation evidence confirms or invalidates an assumption. |
| `DECISIONS.md` | Records architectural decisions, alternatives, rationale and consequences | Present; change only through deliberate decision/change control. |
| `PLAN.md` | Implementation phases, time targets, dependencies and exit gates | Present; update actual phase status and deviations during execution. |
| `.claude/agents/pr-reviewer.md` | Dedicated reviewer-agent instructions | Required path in `CLAUDE.md` and `PLAN.md`. Confirm that the file exists in the implementation repository and is committed before claiming the reviewer is configured. |

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

## 5. AI Errors, Human Review and Corrections

### 5.1 Confirmed documentation-process correction

During documentation preparation, the user clarified that edits must remain scoped to the requested file and must not rewrite unrelated sections or existing documents. The user also emphasized that generated Markdown must be valid and preserve the existing content and structure where a change is narrow.

**Correction applied to the workflow:** Subsequent document deliverables were generated as separate files, and the existing project documents were treated as source material rather than rewritten as part of each new document. This is a documentation/workflow correction; it is not a claim that an implementation-code defect has already been found and fixed.

### 5.2 Implementation-code errors

No specific AI-generated implementation-code defect or implementation correction is evidenced in the project records at the time this file was created. Complete this section during the coding session with real examples. Do not invent an error merely to fill the section.

Use this format for each actual incident:

| Field | Record |
|---|---|
| Date / session | `YYYY-MM-DD`, tool and model |
| AI-generated output | File, function, design or recommendation that was incorrect |
| How it was detected | Failing test, type check, code inspection, reviewer finding, runtime reproduction or requirement mismatch |
| Why it was wrong | Technical explanation and impact |
| Correction | What was changed and by whom |
| Verification | Exact test/check/review evidence after the correction |

### 5.3 Review discipline

For every material AI-generated change:

1. Compare it with the original assessment and the current `SPEC.md`.
2. Check that it follows `CLAUDE.md`, `ASSUMPTIONS.md` and `DECISIONS.md`.
3. Inspect the actual diff and affected call paths; do not rely only on the AI's summary.
4. Run the relevant tests, type checks and lint checks. Record exact commands and outcomes.
5. For critical workflow changes, inspect both the success path and the relevant failure/retry path.
6. Evaluate reviewer findings technically. Accept or reject each with a reason; do not blindly apply suggestions.

## 6. Planned Independent Review Evidence

Complete this section only after the reviewer has inspected the actual pull request.

| Item | Actual value |
|---|---|
| Reviewer agent name | Pending |
| Reviewer model / provider | Pending — record the actual model, not the configured intention |
| Agent instruction file committed | Pending — verify `.claude/agents/pr-reviewer.md` |
| Pull request URL / number | Pending |
| Reviewed commit SHA | Pending |
| Review date | Pending |
| Verdict | Pending — `CHANGES REQUIRED` or `REVIEW PASSED` |
| Findings and severity | Pending — link to actual PR comments or review record |
| Corrections made | Pending — link to commits and regression tests |
| Re-review commit SHA / outcome | Pending, if a re-review occurs |
| External cross-model review | Pending / not performed unless actual evidence is added |

A reviewer subagent running in the same model family is an independent agent review, but it is not automatically an external cross-model review. Describe the review accurately.

## 7. Actual AI-Assisted Work Log

Add a row for each meaningful implementation or review session. Keep the entries concise but specific enough for the follow-up interview.

| Date | Tool / exact model | Task | Files or areas changed | Human verification performed | Outcome / follow-up |
|---|---|---|---|---|---|
| 2026-11-21 | GPT-6 | Planning and project-document preparation | `ASSUMPTIONS.md`, `DECISIONS.md`, `PLAN.md` | User reviewed the direction and provided corrections; no application-code verification is implied | Planning records prepared; implementation usage remains to be logged |
| Pending | Claude Code — exact model/configuration | Implementation | Pending | Pending | Pending |
| Pending | Claude Code `pr-reviewer` subagent — exact model | Independent PR review | Pending | Actual PR diff and findings must be checked | Pending |

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

**Ownership statement:** AI tools assisted with planning and are intended to assist with implementation and review. The submitting engineer remains responsible for understanding, reviewing, testing and defending the complete solution.
