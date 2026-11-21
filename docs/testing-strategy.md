# Catalog Platform — Testing Strategy

**Version:** 1.0  
**Status:** Approved test-planning baseline; execution results must be recorded separately  
**Project:** AI-Native Engineer Code Challenge for Catalog Platform
**Related documents:** `CLAUDE.md`, `SPEC.md`, `PLAN.md`, `ASSUMPTIONS.md`, `DECISIONS.md`, `docs/api-contracts.md`, `docs/openapi.yaml`, `docs/event-contracts.md`, `docs/data-model.md`, `docs/deployment.md`

---

## 1. Purpose

This document defines how the Catalog Platform will be tested. It turns the original assessment acceptance criteria and the approved engineering specification into an executable test plan.

The objective is to provide confidence in:

- The five original customer-facing acceptance criteria.
- The boundary between the React frontend, API Gateway, Catalog Service and product data provider.
- Durable enquiry acceptance and Transactional Outbox publication.
- Asynchronous notification processing through SQS-compatible messaging.
- Correct email delivery and enquiry lifecycle behaviour.
- Recovery from duplicate messages, email failures, callback failures and service restarts.
- Local reproducibility without an AWS account, paid service or live email delivery.

This is a test plan, not evidence that tests have already been implemented or passed. Record actual commands, results, failures and relevant evidence in the implementation log and Pull Request materials.

## 2. Testing Principles

1. **Test behaviour, not implementation trivia.** Assert observable contract and business outcomes rather than private implementation details.
2. **Write tests alongside features.** Do not defer all tests to the end of implementation.
3. **Prioritize the customer journey.** The original product catalogue and product enquiry flow take priority over optional features.
4. **Test failure paths explicitly.** Notification delivery, callback recovery, persistence and message acknowledgement are critical behaviours.
5. **Keep tests deterministic.** Use fixtures, controlled clocks where needed, test doubles and local infrastructure. Do not depend on paid services or live email delivery.
6. **Preserve service ownership.** Tests must not make Notification Service read or write Catalog Service tables.
7. **Avoid false guarantees.** SQS Standard Queue is at-least-once; email delivery cannot be claimed to be exactly once.
8. **Verify the clean-checkout experience.** The documented local startup and test instructions must work from a clean checkout.
9. **Do not hide failures.** A failed test, type check or lint run must be fixed or explicitly recorded with its impact.
10. **Do not optimize for coverage percentages.** Meaningful assertions around critical behaviour matter more than a coverage target invented for this assessment.

## 3. Test Levels and Responsibilities

Use the existing project tooling where possible. `CLAUDE.md` recommends Vitest, Supertest, React Testing Library and Playwright. Confirm the actual installed versions and workspace scripts before documenting or running commands. Do not add a new testing framework without a concrete need.

| Level | Scope | Primary purpose | Typical tools |
|---|---|---|---|
| Unit | Domain functions, validators, adapters, templates, retry logic | Fast, isolated behaviour checks | Vitest |
| Component | React components and interactions | UI states, accessibility and form behaviour | React Testing Library |
| API/integration | Express routes, services, repositories and real PostgreSQL transactions | Verify service contracts and persistence | Vitest, Supertest, PostgreSQL test instance |
| Messaging integration | Outbox publisher and SQS consumer | Verify AWS SDK v3 integration against the supported local SQS subset | ElasticMQ, AWS SDK v3, test harness |
| Email integration | Email provider adapter and templates | Verify accepted messages are rendered and captured locally | Mailpit |
| End-to-end | Browser through Gateway, Catalog, Outbox, SQS, Notification and callback | Demonstrate the complete customer journey | Playwright and Docker Compose |
| Static quality | Type checking, linting and build | Catch unsafe types and build/configuration defects | TypeScript compiler and configured linter/build tools |

### 3.1 Unit tests

Unit tests should cover pure domain logic and components behind interfaces. They should not require Docker, external network access, PostgreSQL or live email.

### 3.2 Integration tests

Integration tests should exercise real boundaries where correctness depends on them. In particular, use a real PostgreSQL test database for transaction and persistence behaviour. Use ElasticMQ and Mailpit for local messaging/email integration where practical.

### 3.3 End-to-end tests

Keep the E2E suite small and focused. At minimum, automate the full successful product enquiry journey and the most important failure/recovery scenarios. A manual demonstration may supplement automated tests but must not replace required automated critical-path coverage.

## 4. Test Environment and Test Data

### 4.1 Local dependencies

The local test environment should use:

- PostgreSQL with separate Catalog Service and Notification Service logical databases/credentials.
- ElasticMQ for the SQS-compatible operations used by the application.
- Mailpit for email capture.
- The local Nginx Gateway and frontend when running full E2E tests.
- Fixture-backed product data for deterministic automated tests.

Do not require AWS credentials, an AWS account, paid infrastructure or an external SMTP/email account for automated tests.

ElasticMQ is not a complete emulator of all AWS SQS features. Test the subset used by the application and document any differences. Local tests do not prove every production AWS-managed behaviour.

### 4.2 Product fixtures

Use controlled fixtures that cover:

- Exactly five configured featured products.
- More than five products in a category.
- Fewer than five products in a category.
- Equal product ratings.
- Missing optional rating data.
- Matching and non-matching search terms.
- Invalid or missing products/categories.
- Malformed or incomplete upstream provider data.

Fixtures must be deterministic and should not depend on the live Fake Store API. A separate optional manual smoke test may exercise the live provider, but it must not be required for the core test suite.

### 4.3 Enquiry fixtures

Use representative PRODUCT and CATEGORY enquiries with valid and invalid contact details. Do not use real customer personal information. Avoid writing full customer data to test logs or CI output.

### 4.4 Isolation and cleanup

- Give each test suite a known database state.
- Clean or roll back test data without deleting shared developer data.
- Ensure queue messages from one test cannot leak into another test.
- Use unique event/enquiry identifiers in integration tests.
- Reset or isolate Mailpit messages before assertions.
- Avoid tests that pass only because of execution order.

## 5. Catalog Service Test Plan

### 5.1 Product provider adapter

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| CAT-PROD-001 | Valid Fake Store API product response | Maps to the normalized internal Product DTO | P1 |
| CAT-PROD-002 | Provider returns malformed product data | Adapter rejects invalid data; service does not return a misleading success | P1 |
| CAT-PROD-003 | Provider request times out | A controlled upstream timeout/error is returned | P1 |
| CAT-PROD-004 | Provider returns an upstream error | Error is surfaced using the documented API error contract | P1 |
| CAT-PROD-005 | Optional rating is absent | Product is represented according to the normalized DTO, with rating `null` when unavailable | P2 |
| CAT-PROD-006 | Product identifier is numeric upstream | Public/internal normalized identifier is consistently represented as a string | P2 |
| CAT-PROD-007 | Fixture provider is selected | Product results are deterministic and independent of external network | P1 |

### 5.2 Catalogue domain and APIs

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| CAT-API-001 | Request featured products with valid configuration | Exactly five configured products are returned | P1 |
| CAT-API-002 | Featured-product configuration references an unavailable product | Behaviour is deterministic and follows the documented configuration error policy | P2 |
| CAT-API-003 | List categories | Normalized category identifiers and names are returned | P1 |
| CAT-API-004 | Request products for a category with more than five products | Top-rated section contains up to five correctly ranked products; additional section contains the rest | P1 |
| CAT-API-005 | Request products for a category with fewer than five products | All available products appear in the top-rated section; additional section is empty | P1 |
| CAT-API-006 | Two products have equal ratings | Approved deterministic tie-breaker is applied | P2 |
| CAT-API-007 | Request category products | No product is duplicated between `topRated` and `additionalProducts` | P1 |
| CAT-API-008 | Search by title, description or category | Only products matching the submitted term are returned | P1 |
| CAT-API-009 | Search uses different letter casing or a partial term | Case-insensitive partial matching works | P1 |
| CAT-API-010 | Search term is empty or whitespace-only | Documented validation error is returned; it does not become match-all search | P1 |
| CAT-API-011 | Product details request for an existing product | Correct normalized product is returned | P1 |
| CAT-API-012 | Product details request for a missing/invalid product | Appropriate `400` or `404` response is returned according to the contract | P1 |
| CAT-API-013 | Provider fails during a catalogue API request | Error response is returned; no successful empty result hides the failure | P1 |

### 5.3 Enquiry validation and persistence

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| CAT-ENQ-001 | Valid PRODUCT enquiry | Enquiry is persisted with status `RECEIVED` | P0 |
| CAT-ENQ-002 | Valid CATEGORY enquiry | Same enquiry model is used with entity type `CATEGORY` | P1 |
| CAT-ENQ-003 | Unsupported entity type | Request is rejected | P1 |
| CAT-ENQ-004 | Referenced product/category does not exist | Request is rejected using the documented validation/not-found contract | P1 |
| CAT-ENQ-005 | Missing or invalid customer name/email/phone | Request is rejected with safe field-level validation details | P1 |
| CAT-ENQ-006 | Optional message is omitted | Enquiry is accepted without an invented message | P2 |
| CAT-ENQ-007 | Client attempts to supply a sales recipient | Client value is ignored/rejected; server-side configuration remains authoritative | P1 |
| CAT-ENQ-008 | Enquiry creation succeeds | `202 Accepted` is returned only after the database transaction commits | P0 |
| CAT-ENQ-009 | Database transaction fails | No success response is returned; neither enquiry nor Outbox record is partially committed | P0 |
| CAT-ENQ-010 | Enquiry is committed while SQS is unavailable | Enquiry remains durably `RECEIVED`; Outbox record remains available for retry | P0 |

### 5.4 Transactional Outbox

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| CAT-OUT-001 | Enquiry transaction commits | Enquiry and matching Outbox event both exist | P0 |
| CAT-OUT-002 | Enquiry transaction rolls back | Neither enquiry nor Outbox event remains committed | P0 |
| CAT-OUT-003 | SQS accepts the event | Outbox record is marked published only after acceptance is confirmed | P0 |
| CAT-OUT-004 | SQS send fails | Outbox record remains unpublished and is eligible for retry | P0 |
| CAT-OUT-005 | Publisher crashes after SQS accepts but before marking published | Retry may publish a duplicate; event ID remains stable and consumer idempotency handles it | P0 |
| CAT-OUT-006 | Two publisher workers claim records concurrently | Active records are not incorrectly processed by both workers at the same time; locking/claim behaviour is safe | P1 |
| CAT-OUT-007 | Publisher restarts with abandoned claim | Abandoned claim can be recovered after its lease/claim policy permits | P1 |

## 6. Notification Service Test Plan

### 6.1 Event validation and consumer idempotency

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| NOT-EVT-001 | Valid version-1 `CATALOG_ENQUIRY_SUBMITTED` event | Event is accepted for processing | P0 |
| NOT-EVT-002 | Malformed JSON or missing required fields | Event is rejected safely and handled by the configured poison-message/DLQ policy | P1 |
| NOT-EVT-003 | Unknown event type or unsupported version | Event is not processed as a supported enquiry event; it remains diagnosable | P1 |
| NOT-EVT-004 | Same event ID is delivered more than once | Existing delivery ledger is reused; successful email is not deliberately sent again | P0 |
| NOT-EVT-005 | Delivery ledger already records `SENT` and callback `PENDING` | Callback processing resumes without resending email | P0 |
| NOT-EVT-006 | Delivery ledger records callback `COMPLETED` | Duplicate event is acknowledged safely without repeating completed work | P0 |
| NOT-EVT-007 | Concurrent duplicate deliveries for the same event ID | Unique constraints/locking prevent concurrent duplicate email processing where the design promises it | P1 |

### 6.2 Email rendering and provider

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| NOT-EMAIL-001 | PRODUCT enquiry | PRODUCT template is selected | P1 |
| NOT-EMAIL-002 | CATEGORY enquiry | CATEGORY template is selected | P1 |
| NOT-EMAIL-003 | Customer content includes HTML/script markup | HTML output escapes customer-controlled content | P1 |
| NOT-EMAIL-004 | Email template renders | HTML and plain-text versions contain the required enquiry details | P1 |
| NOT-EMAIL-005 | Local email provider accepts message | Mailpit captures the expected sales email | P0 |
| NOT-EMAIL-006 | Email provider rejects/fails the send | Failure is durably recorded; callback is not invoked; enquiry stays `RECEIVED` | P0 |
| NOT-EMAIL-007 | Email provider acceptance response is received | `email_status = SENT` and provider message ID are persisted before callback attempt | P0 |
| NOT-EMAIL-008 | Provider outcome is uncertain because of timeout/network interruption | System does not falsely assert success; residual duplicate-send ambiguity is documented and handled according to the chosen policy | P1 |
| NOT-EMAIL-009 | Customer payload contains unexpected recipient-like fields | Recipient continues to come from trusted server configuration | P1 |

### 6.3 Callback, retry and Circuit Breaker

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| NOT-CB-001 | Email is accepted and callback succeeds with `APPLIED` | Catalog enquiry becomes `PROCESSED`; Notification callback state becomes `COMPLETED` | P0 |
| NOT-CB-002 | Same callback event is sent again | Catalog returns safe duplicate outcome; no duplicate/incorrect transition occurs | P0 |
| NOT-CB-003 | Enquiry is already `RESOLVED` when callback arrives | Catalog returns `STALE_IGNORED`; status remains `RESOLVED` | P0 |
| NOT-CB-004 | Catalog callback returns transient failure after email success | Email stays `SENT`; callback stays `PENDING`; retry is scheduled | P0 |
| NOT-CB-005 | Callback retries continue | No second email send occurs because of callback failure | P0 |
| NOT-CB-006 | Notification Service restarts with pending callback | Durable callback worker resumes and retries the callback | P0 |
| NOT-CB-007 | Circuit Breaker is `CLOSED` | Callback requests are permitted and failures are measured | P1 |
| NOT-CB-008 | Circuit Breaker reaches `OPEN` | Calls fail fast; callback remains durably pending | P1 |
| NOT-CB-009 | Circuit Breaker enters `HALF_OPEN` and probe succeeds | Circuit closes and callback processing can resume | P1 |
| NOT-CB-010 | Circuit Breaker enters `HALF_OPEN` and probe fails | Circuit reopens and pending callback remains durable | P1 |
| NOT-CB-011 | Non-retryable business response such as 400/404 | It is not incorrectly counted as a service-health failure | P2 |

### 6.4 SQS acknowledgement and DLQ

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| NOT-SQS-001 | Email fails | Original message is not acknowledged before the configured SQS retry/redrive path can operate | P0 |
| NOT-SQS-002 | Email succeeds and callback is completed | Message is acknowledged after durable outcomes are stored | P0 |
| NOT-SQS-003 | Email succeeds and callback is pending but durable | Message may be acknowledged after email success and callback retry state are durably persisted | P0 |
| NOT-SQS-004 | Consumer crashes before durable delivery state is persisted | Message can be redelivered and processed safely | P0 |
| NOT-SQS-005 | Message exhausts configured receive policy | Message is routed to the configured DLQ or supported local equivalent and remains inspectable | P1 |
| NOT-SQS-006 | DLQ message is redriven | Normal validation and idempotency checks still apply | P1 |
| NOT-SQS-007 | Graceful shutdown occurs during processing | No work is acknowledged before the required durable state exists | P1 |

## 7. Frontend Test Plan

Use React Testing Library for component and interaction tests. Keep browser tests for the end-to-end customer journey rather than duplicating every unit assertion.

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| WEB-001 | Homepage loads | Five featured products are rendered from the API response | P1 |
| WEB-002 | Category navigation | Selecting a category opens the corresponding category view | P1 |
| WEB-003 | Category page | Top-rated and additional product sections render without duplicated products | P1 |
| WEB-004 | Search submission | Search sends the query through the configured Gateway API path and displays only returned matches | P1 |
| WEB-005 | Empty/no-result search | Validation or empty state is clear and does not show unrelated products | P1 |
| WEB-006 | Product selection | Selecting a product opens the matching product details page | P1 |
| WEB-007 | Product detail response | Normalized product fields are rendered, including optional rating handling | P1 |
| WEB-008 | Enquiry form invalid input | Field-level validation is shown and no request is submitted | P1 |
| WEB-009 | Enquiry accepted with `202` | Customer sees Thank You/received confirmation | P0 |
| WEB-010 | Enquiry request rejected or fails | Customer sees a useful error and can recover/retry safely | P1 |
| WEB-011 | Gateway/API unavailable | Loading/error state is displayed; no fake successful content is shown | P1 |
| WEB-012 | Browser network inspection | Frontend does not call Fake Store API or private service URLs directly | P0 |

The Thank You message must communicate durable receipt of the enquiry, not guaranteed email inbox delivery or sales resolution.

## 8. End-to-End Acceptance Scenarios

These tests demonstrate the behaviours that matter most to the assessment. Run them against the complete local environment where practical.

### 8.1 E2E-001 — Original product enquiry happy path

**Priority:** P0

1. Start the local application using the documented Docker Compose instructions.
2. Open the catalogue through the single local browser entry point.
3. Verify that five configured featured products are visible.
4. Select a product and open its details page.
5. Submit a valid product enquiry.
6. Verify that the customer receives a Thank You/received response after durable acceptance.
7. Verify that Catalog Service stores the enquiry with status `RECEIVED` and stores its Outbox event in the same transaction.
8. Verify that the Outbox publisher sends the event to ElasticMQ.
9. Verify that Notification Service consumes and validates the event.
10. Verify that Mailpit captures the expected sales email.
11. Verify that Notification Service stores `email_status = SENT` and the provider message ID.
12. Verify that Notification Service calls the private Catalog callback.
13. Verify that Catalog Service persists the enquiry status as `PROCESSED`.
14. Verify that Notification Service persists callback completion and acknowledges the SQS message.

**Pass condition:** The full customer journey works through the Gateway, no direct browser-to-provider call occurs, and both services retain their own data ownership.

### 8.2 E2E-002 — Email provider failure

**Priority:** P0

1. Submit a valid product enquiry.
2. Force the local email provider adapter to fail.
3. Verify that the delivery attempt is recorded as failed.
4. Verify that the successful notification callback is not called.
5. Verify that the enquiry remains `RECEIVED`.
6. Verify that SQS retry/redrive behaviour follows the configured local policy.

**Pass condition:** Email failure does not incorrectly mark the enquiry `PROCESSED` or `RESOLVED`.

### 8.3 E2E-003 — Callback failure after successful email

**Priority:** P0

1. Submit a valid enquiry and allow the email provider to accept the email.
2. Make Catalog Service's internal callback temporarily unavailable.
3. Verify that email status is durably `SENT` and callback status is `PENDING`.
4. Verify that the enquiry remains `RECEIVED` until Catalog Service confirms the callback.
5. Restart Notification Service while the callback is pending.
6. Restore Catalog Service and allow callback retry to proceed.
7. Verify the enquiry becomes `PROCESSED`.
8. Verify that Mailpit contains only the expected single successful email for the event.

**Pass condition:** Callback recovery survives process restart and does not deliberately resend an already successful email.

### 8.4 E2E-004 — Duplicate delivery and stale callback

**Priority:** P0

1. Deliver the same SQS event more than once.
2. Verify duplicate delivery reuses the durable delivery record and does not deliberately repeat a successful email.
3. Send the same callback more than once and verify a safe duplicate result.
4. Set up an enquiry that has already reached `RESOLVED` in the domain/test fixture.
5. Deliver a delayed callback for that enquiry.
6. Verify the enquiry remains `RESOLVED` and the callback is safely treated as stale.

**Pass condition:** Duplicate or late delivery cannot cause a duplicate completed action or regress the business lifecycle.

### 8.5 E2E-005 — Clean-checkout reviewer startup

**Priority:** P0

1. Use a clean checkout of the assessment feature branch.
2. Follow only the README prerequisites and commands.
3. Start the full local environment.
4. Verify the frontend, API, database, queue and Mailpit are reachable as documented.
5. Execute the enquiry happy path.

**Pass condition:** The reviewer can start and interact with the solution in under 10 minutes without a paid account or AWS credentials.

## 9. Security and Privacy Tests

| ID | Scenario | Expected result | Priority |
|---|---|---|---|
| SEC-001 | Malformed or oversized public request | Request is rejected safely | P1 |
| SEC-002 | SQL-like input in enquiry fields | Queries remain parameterized; no SQL injection occurs | P1 |
| SEC-003 | HTML/script content in customer message | Email template output escapes content | P1 |
| SEC-004 | Client supplies arbitrary sales recipient | Server-side recipient configuration remains authoritative | P1 |
| SEC-005 | Unauthenticated caller attempts internal callback | Request is rejected | P0 |
| SEC-006 | Public Gateway route enumeration | Internal Notification callback is not exposed through public routing | P0 |
| SEC-007 | Application logs inspected during enquiry flow | Customer contact details, message body, secrets and provider credentials are not logged | P1 |
| SEC-008 | Repository and container configuration checked | No real secrets or credentials are committed | P0 |
| SEC-009 | Public enquiry rate limit is exceeded | Request is throttled with the documented response | P2 |
| SEC-010 | Error is returned from an internal dependency | Public response does not expose stack traces or internal details | P1 |

## 10. Static Quality and Build Gates

Run the checks configured by the actual repository scripts. At minimum, verify:

- TypeScript strict-mode compilation/type checking.
- Linting.
- Unit and component tests.
- Catalog Service API/integration tests.
- Notification Service integration tests.
- Contract/schema tests for HTTP and event payloads.
- Production frontend and backend builds.
- Critical local E2E scenarios.

Do not write guessed command names into the final README or PR. Once the repository scripts exist, record the exact executable commands and their actual outcomes.

A failed quality gate must be addressed before the next dependent phase. If a non-critical issue remains, identify the affected scope and its risk explicitly.

## 11. Test Execution Order

Use the following order to shorten feedback cycles and avoid relying on E2E tests for basic defects:

1. Run focused unit/component tests for the changed module.
2. Run service-level API and repository integration tests.
3. Run relevant event/HTTP contract tests.
4. Run cross-service messaging and notification integration tests.
5. Run the critical E2E flow and required failure/recovery scenarios.
6. Run workspace type checking, linting and production builds.
7. Run the full required test suite before creating the assessment PR.
8. After reviewer corrections, rerun affected tests and all relevant quality gates.
9. Before final submission, verify the final pushed commit and rerun the clean-checkout startup path.

Record each command, its result, and the commit SHA against which it was run.

## 12. Failure Diagnosis and Test Reliability

When a test fails:

1. Preserve the failure output and identify the failing boundary.
2. Determine whether the defect is in the code, test setup, fixture, environment or contract.
3. Do not weaken or delete an assertion merely to obtain a green build.
4. Correct the defect or document a justified test-design change.
5. Rerun the smallest relevant test first.
6. Rerun the broader suite when the fix may affect shared behaviour.
7. Record the outcome and any remaining limitation.

Flaky tests must be investigated. Do not hide flakiness with arbitrary sleeps, excessive retries or broad test exclusions. Prefer deterministic synchronization around observable state.

For asynchronous processing tests, wait for explicit states or bounded polling conditions rather than fixed long sleeps. Use a controlled clock for retry/backoff unit tests when possible.

## 13. Evidence and Reporting

Keep test evidence concise and auditable. The PR description should identify:

- Exact commands executed.
- Pass/fail result for each command.
- Relevant end-to-end scenarios demonstrated.
- Important failure and recovery scenarios verified.
- Any tests not run and why.
- Known limitations or unsupported local-emulator behaviour.
- Commit SHA corresponding to the test run.

Update `TIME_SPENT.md` with actual testing time and `PR_DESCRIPTION.md` with final test outcomes. Update `AI_USAGE.md` only when a test failure exposes an actual AI-generated mistake or a meaningful AI-assisted correction; do not invent such examples.

Do not report a test as passing because code was generated, a command was planned or a test file exists. Only an executed successful test is a pass.

## 14. Test Completion Checklist

The following checklist is intentionally uncompleted until execution evidence exists.

### Original assessment acceptance criteria

- [ ] Homepage displays five configured featured products.
- [ ] Category view displays top-rated and additional products without duplication.
- [ ] Search returns only matching products.
- [ ] Selecting a product opens its details page.
- [ ] Product enquiry sends an email through the local notification workflow and shows a Thank You message after durable acceptance.

### Architecture and reliability

- [ ] Browser uses the Gateway and does not call Fake Store API directly.
- [ ] Enquiry and Outbox event commit atomically.
- [ ] Outbox publisher handles SQS failure and duplicate-publication windows.
- [ ] Notification consumer validates events and is idempotent.
- [ ] Email failure leaves the enquiry `RECEIVED`.
- [ ] Successful callback moves `RECEIVED` to `PROCESSED`.
- [ ] Callback failure is retried durably without resending a successful email.
- [ ] Callback retry survives Notification Service restart.
- [ ] Duplicate and stale callbacks cannot regress `RESOLVED`.
- [ ] Circuit Breaker states have been tested.
- [ ] SQS acknowledgement occurs only after the required durable state is stored.

### Security and local reproducibility

- [ ] Internal callback is private and authenticated.
- [ ] Customer input is validated and HTML content escaped.
- [ ] No secrets or unnecessary personal data appear in logs or source control.
- [ ] Clean-checkout Docker Compose startup is verified.
- [ ] No paid account, AWS credential or live email dependency is needed by the reviewer.

### Final quality and evidence

- [ ] Type checking passes.
- [ ] Lint passes.
- [ ] Critical unit, component and integration tests pass.
- [ ] Critical E2E scenarios pass.
- [ ] Actual commands and outcomes are recorded.
- [ ] Test evidence is tied to the final relevant commit SHA.
- [ ] Outstanding test gaps and limitations are documented.

---

## 15. Change Control

When a new test reveals a defect or an approved design change:

1. Check the original assessment, `SPEC.md` and relevant contract documents.
2. Record a genuine ambiguity in `ASSUMPTIONS.md` when the requirement is unspecified.
3. Record a material architecture or behaviour change in `DECISIONS.md`.
4. Update the affected test cases and relevant API/event/data contracts together with the implementation.
5. Keep this strategy synchronized with the actual test suite; remove or revise cases only when there is a documented technical reason.
6. Record actual verification outcomes in `TIME_SPENT.md` and `PR_DESCRIPTION.md`.

Do not change a test expectation to conceal a regression or silently alter an approved requirement.
