# Catalog Platform — Implementation Plan

**Version:** 1.0  
**Status:** Initial execution baseline  
**Project:** AI-Native Engineer Code Challenge for Catalog Platform
**Target time-box:** 2–3 hours (180-minute planning target)  
**Execution model:** Sequential, phase-gated implementation with autonomous low-risk decisions  
**Review model:** Independent PR Reviewer Subagent in the same Claude Code session

---

## 1. Purpose

This document converts the approved requirements and architecture into an executable implementation sequence. It defines the order of work, the expected outputs of each phase, verification gates, time allocation and the conditions for declaring the assessment ready for submission.

It is an execution plan, not a replacement for the requirements or architecture documents. Implementation must follow:

- `CLAUDE.md` — engineering guardrails, technology constraints, working practices and Git/PR workflow.
- `SPEC.md` — functional behaviour, APIs, data ownership, event processing and acceptance criteria.
- `ASSUMPTIONS.md` — accepted interpretations of ambiguous requirements.
- `DECISIONS.md` — accepted architecture decisions, rationale and trade-offs.

The original assessment remains authoritative for its explicit requirements. The approved architecture must be implemented without misrepresenting additional design choices as original assessment requirements.

## 2. Execution Principles

1. Deliver the smallest complete implementation that demonstrates the required customer journey.
2. Implement the five original assessment scenarios before optional enhancements.
3. Keep exactly two business microservices: Catalog Service and Notification Service.
4. Preserve service-owned data, API and event contracts.
5. Build and verify the application locally using Docker Compose and AWS-compatible local dependencies.
6. Write tests as features are implemented; do not defer all testing to the final phase.
7. Make low-risk implementation decisions autonomously and record new assumptions before relying on them.
8. Do not change an accepted architecture decision silently.
9. Do not claim a feature, test, local startup, review or PR state is complete without checking it.
10. Keep the assessment PR open and unmerged.

### 2.1 Priority order

| Priority | Outcome | Rule |
|---|---|---|
| P0 — Assessment path | Homepage, category browsing, search, product details, product enquiry and Thank You confirmation | Must be demonstrable. |
| P1 — Approved architecture | Two services, API Gateway, PostgreSQL ownership, Outbox, SQS and asynchronous email | Implement the accepted design without adding services or infrastructure. |
| P1 — Lifecycle and recovery | Correct `RECEIVED → PROCESSED → RESOLVED` lifecycle, idempotency and callback recovery | Must not be weakened to make the happy path appear complete. |
| P1 — Local verification | Docker Compose startup and complete local enquiry-to-email flow | Must be reproducible from a clean checkout. |
| P2 — Submission quality | Focused tests, documentation, independent PR review and known limitations | Complete within the time-box where practical; report unfinished work honestly. |

Do not use P2 polish or optional functionality to displace P0 acceptance criteria or the critical enquiry workflow.

## 3. Critical Path and Dependencies

The implementation follows this dependency order:

1. Inspect the repository and confirm the working baseline.
2. Establish the pnpm workspace, application skeleton and local runtime dependencies.
3. Implement Catalog Service product-provider integration and catalogue APIs.
4. Implement the customer-facing React pages against the public API contract.
5. Implement enquiry persistence, Outbox publication, SQS consumption, email delivery and the internal status callback.
6. Verify the full customer journey and critical failure paths.
7. Create the feature branch PR and run the independent reviewer.
8. Correct accepted findings, re-verify and finalize submission documentation.

The browser must communicate only through the API Gateway. The local Nginx entry point serves the frontend and proxies the public `/api/catalog` path to Catalog Service. Notification Service remains a private worker and is not exposed to the browser.

## 4. Time Allocation

The following allocation preserves the 180-minute target defined in `CLAUDE.md`. It is an approximate planning aid, not a delivery guarantee or permission to skip verification.

| Phase | Activity | Target |
|---|---|---:|
| 0 | Planning and repository inspection | 15 minutes |
| 1 | Repository and infrastructure setup | 15 minutes |
| 2 | Catalog Service | 35 minutes |
| 3 | Frontend | 35 minutes |
| 4 | Enquiry and event processing | 35 minutes |
| 5 | Testing and integration | 20 minutes |
| 6 | PR and independent review | 15 minutes |
| 7 | Final corrections and documentation | 10 minutes |
| | **Total** | **180 minutes** |

Record actual time in `TIME_SPENT.md`. Do not copy the target allocation into the actual-time record as though it were measured. If the work exceeds the target, preserve correctness, record the actual duration and document anything deferred.

## 5. Implementation Phases

### Phase 0 — Planning and Repository Inspection

**Target:** 15 minutes  
**Depends on:** None

**Tasks**

- Inspect the current repository, branch, Git status, available scripts and existing implementation before changing files.
- Confirm the latest `main` state and create/use the dedicated assessment feature branch; never implement directly on `main`.
- Read the relevant sections of `CLAUDE.md`, `SPEC.md`, `ASSUMPTIONS.md` and `DECISIONS.md` before implementing each affected area.
- Confirm the approved stack, service boundaries, public API path, event contract expectations and local dependencies.
- Map the original assessment's five functional scenarios to implementation modules and tests.
- Identify any existing files or working implementation that must be preserved.
- Record any newly discovered ambiguity in `ASSUMPTIONS.md`; do not overwrite or silently reinterpret an accepted assumption.

**Deliverables**

- A repository-aware implementation checklist.
- A dedicated feature branch based on the latest `main`.
- A list of existing code and documentation that must be preserved.
- No unrecorded architecture changes.

**Exit gate**

- The repository and current Git state are understood.
- The implementation path is consistent with the approved architecture.
- There is no unresolved contradiction affecting the next implementation step.

### Phase 1 — Repository and Local Infrastructure Setup

**Target:** 15 minutes  
**Depends on:** Phase 0

**Tasks**

- Establish or validate the pnpm monorepo structure for the React app, Catalog Service, Notification Service and shared contracts.
- Configure TypeScript strict mode and the common development/test scripts.
- Add the Docker Compose local runtime for the approved components:
  - Nginx as the single local browser entry point.
  - React application build/static serving.
  - Catalog Service.
  - Notification Service worker.
  - PostgreSQL.
  - ElasticMQ for the SQS-compatible local queue.
  - Mailpit for local email capture.
- Keep Catalog Service and Notification Service persistence logically separate, with separate credentials and migrations. A shared local PostgreSQL container is acceptable; shared service tables are not.
- Add `.env.example` with documented non-secret configuration. Do not commit credentials or real secrets.
- Configure health/readiness checks and dependency readiness handling. Do not assume Compose startup order alone means a dependency is ready.
- Configure the public `/api/catalog` route through Nginx. Do not expose Notification Service as a public route.
- Add the minimum queue initialization/configuration needed for the local workflow, including the supported DLQ behaviour.
- Inspect the dedicated reviewer configuration at `.claude/agents/pr-reviewer.md`; create or update it only if needed, preserving existing working instructions. The reviewer must be able to inspect source and publish PR review communication, but must not modify source files or push commits.

**Deliverables**

- Working monorepo and package scripts.
- Docker Compose configuration for the required local components.
- Environment template and local service configuration.
- Health/readiness endpoints or checks for the running services.

**Exit gate**

- The project builds far enough to start its application skeleton.
- PostgreSQL, ElasticMQ and Mailpit are reachable from their intended services.
- The Nginx/API routing boundary is in place.
- No extra business microservice or prohibited infrastructure has been introduced.

### Phase 2 — Catalog Service

**Target:** 35 minutes  
**Depends on:** Phase 1

**Tasks**

- Implement Catalog Service modules for HTTP routes/controllers, application/domain services, provider adapters and data access.
- Define a normalized internal product model and a replaceable product-provider interface.
- Implement Fake Store API as the initial external provider. Validate and normalize its response at the provider boundary; do not leak provider-specific models into business logic or React.
- Provide a fixture-backed provider or equivalent deterministic test seam for offline tests.
- Implement the required catalogue behaviours:
  - Homepage returns exactly five configured featured products.
  - Category browsing returns the top-rated products and a separate additional-products collection.
  - Top-rated ordering is rating descending, then product ID ascending for ties; additional products exclude the top-rated products.
  - Search matches product title, description and category using case-insensitive partial matching.
  - Product details return title, description, image, price, category, rating and review count where available.
- Validate empty search input and invalid product/category references using the documented API error convention.
- Apply bounded upstream timeouts and surface provider failures honestly; do not return an empty success response when the provider has failed.
- Keep product data sourced from the provider. Do not create a duplicate persisted product catalogue or introduce a cache for the initial assessment.
- Add unit/API tests for each implemented catalogue behaviour as it is completed.

**Deliverables**

- Catalog Service product-provider abstraction and Fake Store API adapter.
- Public catalogue API routes for featured products, categories, search and product details.
- Normalized product response contract.
- Deterministic tests for mapping, ranking, searching and provider failures.

**Exit gate**

- All catalogue APIs return the agreed normalized contract.
- The five featured products come from backend configuration, not hardcoded React data.
- Category sections do not duplicate products.
- Search and details behave as specified.
- Provider failure is distinguishable from a valid empty result.

### Phase 3 — Frontend

**Target:** 35 minutes  
**Depends on:** Phase 2 and the public API contract

**Tasks**

- Implement the React + TypeScript + Vite frontend and the required pages:
  - Home page.
  - Category page.
  - Product details page.
- Implement reusable components where they support the required experience, including ProductCard, ProductGrid, FeaturedProducts, CategoryNavigation, SearchBar, EnquiryForm, LoadingState, ErrorState and EmptyState.
- Load catalogue data only through the configured `/api/catalog` base path.
- Do not call Fake Store API, internal service hostnames, Notification Service, SQS or PostgreSQL from the browser.
- Render five backend-configured featured products on the homepage.
- Render top-rated and additional products separately on category pages.
- Implement text search and useful empty/error states.
- Implement product details and the product enquiry entry point. Include the approved category enquiry entry point as part of the same enquiry capability.
- Use a responsive and accessible visual baseline with keyboard-accessible controls, clear labels and validation messages.
- Show a clear Thank You/received confirmation after the API has accepted the enquiry. The wording must not imply that the sales email has already been delivered.
- Add frontend tests for the key page and form states.

**Deliverables**

- Three required customer-facing pages.
- Reusable presentation components for catalogue and enquiry flows.
- Gateway-only API integration.
- Loading, empty, validation, success and failure states.

**Exit gate**

- The five original catalogue scenarios can be navigated through the browser against the API.
- The browser does not know internal service addresses or external product-provider details.
- The enquiry form submits to the public Catalog API and displays an accurate accepted/received confirmation.

### Phase 4 — Enquiry Domain and Event Processing

**Target:** 35 minutes  
**Depends on:** Phase 1 and the Catalog Service foundations from Phase 2

This phase is on the critical path. Do not replace its reliability requirements with synchronous email in the customer request or with an in-memory-only retry loop.

**Catalog Service tasks**

- Implement one enquiry model for `PRODUCT` and `CATEGORY` entity types.
- Validate required customer fields and the referenced entity before persistence. Retain an entity snapshot with the enquiry.
- Resolve sales recipients from trusted backend configuration; never accept a recipient address from customer input.
- In one database transaction, persist the enquiry with initial status `RECEIVED` and its corresponding Outbox event.
- Return HTTP `202 Accepted` only after the transaction commits. The response confirms durable receipt, not email delivery.
- Implement a safe Outbox publisher that claims committed unpublished rows and publishes the versioned event to the configured SQS queue using AWS SDK v3. Record publication only after SQS accepts the message; tolerate duplicate publication.
- Implement the private internal PATCH callback for Notification Service to report successful email processing. Catalog Service remains the only owner of enquiry business status and must apply the callback idempotently.

**Notification Service tasks**

- Implement the SQS consumer using AWS SDK v3, long polling, bounded concurrency and graceful shutdown.
- Validate the versioned event contract and use its event ID for idempotency.
- Implement the Notification Service-owned delivery ledger and callback progress state in its separate logical database.
- Implement the email-provider interface with Mailpit/local SMTP and an AWS SES production adapter boundary.
- Implement separate PRODUCT and CATEGORY templates with HTML and plain-text content. Escape customer-provided values and keep recipients/provider configuration server-side.
- On email provider acceptance, durably record `email_status = SENT`, preserve the provider message ID and persist `callback_status = PENDING` before callback processing.
- Call Catalog Service's private `PATCH /internal/catalog/enquiries/:enquiryId/notification-status` endpoint. Mark the callback complete only after Catalog Service confirms that it persisted `PROCESSED`.
- Implement durable database-backed callback retries independently of email sending. A callback failure must not trigger another email send.
- Implement configurable exponential backoff with jitter and the Circuit Breaker around the Catalog HTTP client. Use the initial configuration in `ASSUMPTIONS.md` as a starting point, not a hardcoded universal policy.
- Acknowledge the original SQS message only after the email outcome and either callback completion or durable pending callback retry state have been persisted.
- For email failure, keep the enquiry `RECEIVED`, record the delivery failure and allow the configured SQS retry/DLQ policy to operate.

**Lifecycle tasks**

- Enforce the only normal business transitions: `RECEIVED → PROCESSED → RESOLVED`.
- Ensure `PROCESSED` occurs only after successful provider acceptance, durable notification recording and Catalog Service callback persistence.
- Ensure a duplicate or stale callback cannot regress a `RESOLVED` enquiry.
- Model the `PROCESSED → RESOLVED` domain operation, but do not build a sales dashboard or expose an unauthenticated public resolution endpoint.

**Deliverables**

- Enquiry API and shared PRODUCT/CATEGORY model.
- Atomic enquiry + Outbox persistence.
- SQS publisher and Notification Service consumer.
- Notification delivery ledger and callback retry worker.
- Mailpit email delivery with source-controlled templates.
- Internal authenticated callback and Circuit Breaker.
- Lifecycle transition rules and tests.

**Exit gate**

- Enquiry acceptance is durable and returns `202` only after commit.
- The email notification is asynchronous and delivered through the local provider.
- Email failure leaves the enquiry `RECEIVED`.
- Callback failure after email success is durably retried without resending the email.
- Catalog Service alone persists the transition to `PROCESSED`.
- No public route allows arbitrary lifecycle mutation.

### Phase 5 — Testing and Integration Verification

**Target:** 20 minutes  
**Depends on:** Phases 2–4; tests should already exist from earlier phases

**Tasks**

- Run package-level unit and API tests for each application.
- Run type checking and linting for the workspace.
- Run database migration checks and verify each service uses only its own logical database and credentials.
- Start the complete local environment from a clean state using the documented Docker Compose command.
- Verify the browser flow through Nginx/API Gateway routing.
- Execute at least one end-to-end flow:
  1. Load the catalogue.
  2. Select a product.
  3. Submit a valid enquiry.
  4. Verify the enquiry and Outbox event commit atomically with status `RECEIVED`.
  5. Verify the event is published to ElasticMQ and consumed by Notification Service.
  6. Verify the expected sales email appears in Mailpit.
  7. Verify the internal callback is invoked and Catalog Service persists `PROCESSED`.
  8. Verify callback completion is persisted and the SQS message is acknowledged.
- Verify at least the critical failure paths:
  - Email failure leaves the enquiry `RECEIVED` and uses retry/DLQ behaviour.
  - Catalog callback failure after email success leaves the enquiry `RECEIVED` and retries the callback without sending another email.
  - Duplicate SQS delivery/callback does not repeat completed work or regress `RESOLVED`.
- Check structured logs and correlation identifiers without exposing customer personal data or secrets.
- Record the exact commands and results used. Do not report tests that were not run.

**Deliverables**

- Passing critical unit/API/integration tests.
- Verified local end-to-end customer journey.
- Evidence for email failure and callback retry behaviour.
- Actual test commands and outcomes for the PR description.

**Exit gate**

- Type checking and lint pass, or any remaining failure is explicitly identified and scoped.
- Critical automated tests pass.
- The full local customer journey is verified.
- The application starts from a clean checkout using the README instructions.
- No test depends on a paid service or live external email delivery.

### Phase 6 — Pull Request and Independent Review

**Target:** 15 minutes  
**Depends on:** Phase 5

**Tasks**

- Review the actual Git diff, staged files and repository status.
- Confirm no secrets, generated artifacts or unrelated changes are included.
- Create meaningful commits using the agreed conventional commit style.
- Push the assessment feature branch.
- Create one cohesive PR targeting `main`; do not merge it.
- Write a complete PR description covering the customer features, architecture, key decisions/assumptions, tests, known limitations and local run instructions.
- Confirm the actual PR URL, head commit SHA and OPEN state.
- Immediately invoke the dedicated `pr-reviewer` subagent in the same Claude Code session.
- Give the reviewer the PR number/URL, exact head SHA, assessment requirements and the project documents. Require inspection of the real diff and affected files.
- Require a review verdict on the same PR: `CHANGES REQUIRED` or `REVIEW PASSED`, with evidence and actionable findings.
- Do not represent a local review summary as a completed PR review. Do not claim formal GitHub approval when the same identity cannot provide it.

**Deliverables**

- One pushed assessment feature branch.
- One open, unmerged PR targeting `main`.
- Actual independent reviewer findings published on the PR.

**Exit gate**

- PR state and reviewed commit SHA are verified.
- Reviewer has actually completed and published its verdict, or the incomplete review is explicitly recorded as a blocker/limitation.
- No PR merge has occurred.

### Phase 7 — Final Corrections and Documentation

**Target:** 10 minutes  
**Depends on:** Phase 6; may overlap with reviewer feedback retrieval within the same active session

**Tasks**

- Retrieve all reviewer findings, including line-level comments and review threads.
- Validate every finding against the actual code and requirements. Accept or reject with technical rationale; do not blindly apply suggestions.
- Fix all P0 and P1 findings. Resolve applicable P2 findings or document why they remain.
- Add regression tests for accepted defects and rerun the affected tests, type checking and linting.
- Push corrections to the same feature branch and update the same PR. Do not create a second assessment PR.
- Invoke a focused independent re-review after substantial corrections. The re-review must inspect the updated diff and reference the exact commit SHA.
- Update `README.md`, `AI_USAGE.md`, `TIME_SPENT.md` and `PR_DESCRIPTION.md` with actual state and evidence.
- Update `ASSUMPTIONS.md` statuses only when implementation and verification evidence justify the change. Update `DECISIONS.md` if an accepted design decision actually changes.
- Record any unimplemented requirement, deferred capability, test failure or remaining risk accurately.
- Confirm that the PR is still open and unmerged and that the final push is present on the PR branch.

**Deliverables**

- Corrections for accepted critical review findings.
- Regression and verification results for the corrected commit.
- Up-to-date reviewer documentation and submission materials.
- Actual elapsed time and outstanding limitations recorded.

**Exit gate**

- P0 and P1 findings are resolved, or the submission is explicitly reported as not ready.
- Required verification has been rerun after the final relevant changes.
- Final reviewer status and exact reviewed commit are documented.
- PR remains open and unmerged.
- No fabricated test, AI usage, review or time evidence is present.

## 6. Acceptance Criteria and Evidence Matrix

The implementation is assessed against the original customer scenarios and the approved project architecture. The evidence column describes what must be demonstrated; it is not a claim that the work has already been completed.

| Requirement | Required behaviour | Verification evidence |
|---|---|---|
| Homepage | Display five selected featured products. | API returns five backend-configured products; browser renders them. |
| Category browsing | Show top-rated and additional products within a category. | API ordering and deduplication tests; browser renders both sections. |
| Product search | Search product catalogue by text. | Case-insensitive partial-match tests; browser shows only returned matches. |
| Product details | Display the selected product's details. | Product API and page tests; invalid/missing product handling verified. |
| Product enquiry | Submit an enquiry, send an email to the configured sales inbox and show a Thank You/received state. | Enquiry/outbox integration test, Mailpit evidence and accurate frontend confirmation. |
| Backend-only product access | Browser never calls Fake Store API directly. | Inspect browser network calls and frontend source; provider calls originate in Catalog Service. |
| Local reviewer setup | Reviewer can run the application locally in under 10 minutes using README instructions, with no paid account or committed secret. | Clean-checkout startup test and documented exact commands. |
| AWS compatibility | Included infrastructure maps to the approved AWS services. | Configuration and architecture review; no unsupported local-only application API. |
| Enquiry lifecycle | `RECEIVED → PROCESSED → RESOLVED`, with Catalog Service owning status. | Domain and callback tests, including stale/duplicate callback protection. |
| Callback recovery | Retry a failed callback without resending a successful email. | Restart/recovery test with persisted callback state and one successful email record. |
| Submission workflow | Feature branch PR is open and unmerged; reviewer reports on the PR. | Verified PR URL/state, review comment/verdict and reviewed commit SHA. |

Category enquiries are an approved extension of the enquiry model and must reuse the same validated workflow; they do not replace the original product enquiry acceptance criterion.

## 7. Cross-Cutting Verification Gates

These gates apply throughout implementation, not only at the end.

### 7.1 Architecture gate

- Exactly two business microservices exist.
- Frontend browser traffic uses the API Gateway only.
- Notification Service is not publicly exposed.
- Notification Service never reads or writes Catalog Service database tables.
- Catalog Service exclusively owns enquiry business status.
- Email and callback status remain in Notification Service persistence.
- AWS SDK v3 and SQS-compatible interfaces are used; BullMQ, Redis, Kafka, RabbitMQ and Kubernetes are not introduced.

### 7.2 Data and event gate

- Enquiry and Outbox event commit in the same Catalog database transaction.
- Events are versioned and runtime-validated.
- The publisher tolerates duplicate publication and crashes.
- Consumers tolerate at-least-once delivery and use durable idempotency records.
- Notification success is durably stored before callback attempt.
- A pending callback survives Notification Service restart.
- SQS acknowledgement occurs only after required processing or retry state is durable.

### 7.3 Security gate

- Customer input is validated at boundaries.
- SQL access is parameterized.
- Sales recipients are resolved from trusted server-side configuration.
- Internal callback is private and authenticated.
- Public customers cannot change enquiry status.
- Secrets are not committed or logged.
- Personal customer data is not written to general application logs.

### 7.4 Quality gate

- TypeScript strict mode is enabled.
- Tests cover success and critical failure behaviour.
- Lint and type checking are run and outcomes recorded.
- Errors are explicit and do not masquerade as successful empty results.
- Docker Compose startup and the README are verified from a clean checkout.

## 8. Time-Box and Scope-Control Rules

The 180-minute schedule is a target. The order of priorities must not be inverted to preserve the appearance of finishing on time.

When time is running out:

1. Complete the five original assessment scenarios.
2. Preserve the approved service boundaries and critical enquiry workflow.
3. Finish the end-to-end happy path and critical failure tests.
4. Complete the feature branch PR and obtain the actual reviewer verdict where practical.
5. Record any deferred work, test gaps, outstanding findings and actual time.

Do not remove Outbox, durable callback retry, idempotency, the internal callback or service-owned persistence merely to fit the time-box. These are accepted architecture decisions, not optional polish.

Do not implement the following unless separately approved:

- Shopping cart, checkout, payment or inventory features.
- Customer accounts or general authentication.
- Sales dashboard or CRM integration.
- Additional business microservices or enquiry entity types.
- Pagination unless catalogue size/use demonstrates a need.
- Redis or a separate product cache.
- SNS fan-out, Kafka, RabbitMQ, BullMQ or another queue system.
- Kubernetes or EKS.
- Full production AWS provisioning.
- Advanced analytics or unrelated UI polish.

If a required capability cannot be completed within the target window, report it as incomplete and explain the impact. A documented limitation is preferable to a misleading claim of completion.

## 9. Documentation and Submission Updates

Maintain the root-level project documents as follows:

| Document | Update responsibility |
|---|---|
| `CLAUDE.md` | Change only when engineering guardrails or workflow instructions are deliberately revised. |
| `SPEC.md` | Update only when a requirement or approved contract changes through change control. |
| `PLAN.md` | Update actual phase status, deviations or sequencing changes when they materially affect execution. |
| `ASSUMPTIONS.md` | Record new ambiguities and update statuses based on implementation/verification evidence. |
| `DECISIONS.md` | Record significant architecture decisions and explain any approved change. |
| `README.md` | Provide prerequisites, local startup, configuration, test commands, routes and reviewer instructions. |
| `AI_USAGE.md` | Record actual tools/models, agent instruction files, 3–5 key prompts or moments, and actual mistakes/corrections. |
| `TIME_SPENT.md` | Record actual measured time by planning, building, testing and reviewing. |
| `PR_DESCRIPTION.md` | Keep the PR summary, test evidence, assumptions, limitations and final review state accurate. |

Do not fabricate prompts, AI mistakes, test outcomes, reviewer findings, PR state or time spent. The generated plan and target allocation are not evidence that implementation has occurred.

## 10. Final Submission Checklist

Use this checklist only after the corresponding work has actually been performed.

### Product and functionality

- [ ] Homepage displays five backend-configured featured products.
- [ ] Category page displays top-rated and additional products without duplication.
- [ ] Product search works through Catalog Service.
- [ ] Product details page displays normalized product information.
- [ ] Product enquiry can be submitted and displays a Thank You/received confirmation.
- [ ] Category enquiry uses the same enquiry model and workflow.

### Architecture and reliability

- [ ] Exactly two business microservices are implemented.
- [ ] Browser API calls use the API Gateway only.
- [ ] Catalog Service owns enquiry status; Notification Service owns delivery/callback progress.
- [ ] Enquiry and Outbox event are committed atomically.
- [ ] SQS processing is idempotent and handles at-least-once delivery.
- [ ] Email failure leaves the enquiry `RECEIVED`.
- [ ] Callback failure is durably retried without resending a successful email.
- [ ] Internal callback is private, authenticated and idempotent.
- [ ] Circuit Breaker and retry behaviour have been tested.

### Local execution and verification

- [ ] Docker Compose starts the full local application from a clean checkout.
- [ ] README commands work and local reviewer setup is under 10 minutes.
- [ ] Mailpit captures the expected sales email.
- [ ] Critical unit, API, integration and frontend tests pass.
- [ ] End-to-end enquiry-to-email-to-PROCESSED flow is verified.
- [ ] Type checking and lint outcomes are recorded.
- [ ] No committed secrets or paid reviewer dependencies are present.

### Pull Request and documentation

- [ ] Feature branch is pushed; no implementation was committed directly to `main`.
- [ ] One cohesive PR targets `main` and remains open/unmerged.
- [ ] PR description includes actual test results, assumptions and limitations.
- [ ] Independent reviewer inspected the actual diff and posted a verdict on the same PR.
- [ ] Reviewed commit SHA is recorded; re-review occurred after substantial corrections.
- [ ] P0 and P1 findings are resolved or the submission is reported as not ready.
- [ ] `README.md`, `AI_USAGE.md`, `TIME_SPENT.md` and `PR_DESCRIPTION.md` reflect actual work.
- [ ] `ASSUMPTIONS.md` and `DECISIONS.md` match the implemented design.

## 11. Completion Rule

The project is ready for submission only when the required customer experience, approved architecture, critical failure behaviour, local reproducibility, automated verification and PR review workflow have been evidenced.

A phase is not complete because its time allocation has elapsed or code has been generated. It is complete only when its exit gate has been checked and its actual result has been recorded.

The final PR must remain open and unmerged. Any outstanding requirement, failed test, unresolved critical review finding or unverified claim must be disclosed rather than hidden.

**Execution sequence:** Repository Inspection → Local Foundation → Catalog APIs → Frontend → Enquiry and Event Processing → Integration Verification → Open PR → Independent Review → Corrections → Re-verification → Final Submission.
