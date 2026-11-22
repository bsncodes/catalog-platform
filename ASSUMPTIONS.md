# Catalog Platform — Assumptions Register

**Version:** 1.0  
**Status:** Initial implementation baseline  
**Project:** AI-Native Engineer Code Challenge for Catalog Platform
**Related documents:** `CLAUDE.md`, `SPEC.md`, `DECISIONS.md`, `PLAN.md`  
**Source assessment:** `Code Challenge - AI-Native Engineer.pdf`

---

## 1. Purpose

This document records assumptions made where the original assessment or approved project specification leaves a requirement open to interpretation.

It is intended to:

- Make ambiguity visible rather than allowing undocumented implementation choices.
- Explain why a particular interpretation was selected.
- Identify the implementation impact of each assumption.
- Define how each assumption will be verified.
- Give the independent PR reviewer a clear register to challenge.

This register does not replace the original assessment, `SPEC.md` or `DECISIONS.md`.

- The original assessment remains authoritative for the hiring exercise's explicit requirements.
- `SPEC.md` defines the approved product and technical scope.
- `ASSUMPTIONS.md` records how unspecified details are interpreted.
- `DECISIONS.md` records significant engineering choices, their rationale, alternatives and consequences.

An assumption must not be presented as a requirement explicitly stated by the assessment.

---

## 2. Assumption Classification

### 2.1 Impact

| Classification | Meaning |
|---|---|
| **LOW** | Minor behaviour or presentation detail with limited architectural impact. |
| **MEDIUM** | Affects functional behaviour, API design or implementation structure. |
| **HIGH** | Affects architecture, data ownership, security, reliability or an important business rule. |

### 2.2 Status

| Status | Meaning |
|---|---|
| **PROPOSED** | Identified but not yet accepted as the implementation baseline. |
| **ACCEPTED** | Approved for implementation. |
| **IMPLEMENTED** | Implemented, but not yet fully verified. |
| **VERIFIED** | Implemented and supported by passing verification evidence. |
| **REJECTED** | Considered and deliberately not adopted. |
| **SUPERSEDED** | Replaced by a later assumption or decision; retain the history. |

All entries in this initial register are marked `ACCEPTED` unless explicitly identified otherwise. This means they are approved implementation assumptions, not proof that implementation has already occurred.

---

## 3. Assumption Summary

| ID | Area | Assumption | Impact | Status |
|---|---|---|---|---|
| ASM-001 | Featured products | Five homepage products are selected through backend configuration. | MEDIUM | VERIFIED |
| ASM-002 | Category ranking | Show up to five top-rated products per category. | MEDIUM | VERIFIED |
| ASM-003 | Category ranking | Break equal ratings by product ID ascending. | LOW | VERIFIED |
| ASM-004 | Search | Search title, description and category using case-insensitive partial matching. | MEDIUM | VERIFIED |
| ASM-005 | Search | Reject an empty or whitespace-only submitted search query. | LOW | VERIFIED |
| ASM-006 | Product details | Display the useful product fields supplied by the normalized provider model. | LOW | VERIFIED |
| ASM-007 | Enquiry form | Name, email and phone are required; message is optional. | MEDIUM | VERIFIED |
| ASM-008 | Category enquiry | Provide a category enquiry entry point on the category page as an approved extension. | MEDIUM | VERIFIED |
| ASM-009 | Entity validation | Validate the referenced product/category and retain an entity snapshot. | MEDIUM | VERIFIED |
| ASM-010 | Async acknowledgement | Return `202 Accepted` after enquiry and outbox commit; confirmation means received, not emailed. | HIGH | VERIFIED |
| ASM-011 | Email success | Provider acceptance is the success signal; inbox delivery confirmation is outside initial scope. | MEDIUM | IMPLEMENTED |
| ASM-012 | Sales routing | Resolve recipients using server-side configuration by enquiry type. | MEDIUM | VERIFIED |
| ASM-013 | Email templates | Keep PRODUCT and CATEGORY email templates in Notification Service source code. | LOW | VERIFIED |
| ASM-014 | Product persistence | Use Fake Store API as the initial product source; persist enquiries, not a duplicate product catalogue. | MEDIUM | IMPLEMENTED |
| ASM-015 | Provider failures | Surface provider errors; do not convert them into successful empty product results. | MEDIUM | VERIFIED |
| ASM-016 | Local infrastructure | Use local substitutes while keeping application integration AWS-compatible. | HIGH | IMPLEMENTED |
| ASM-017 | Offline testing | Use a fixture-backed provider for deterministic tests and offline verification. | LOW | VERIFIED |
| ASM-018 | Database isolation | Separate service-owned logical databases and credentials; a shared local PostgreSQL container is acceptable. | HIGH | VERIFIED |
| ASM-019 | SQS queue type | Use SQS Standard Queue because strict message ordering is not required. | MEDIUM | IMPLEMENTED |
| ASM-020 | Delivery semantics | Assume at-least-once message delivery and make consumers idempotent. | HIGH | VERIFIED |
| ASM-021 | Outbox publisher | Poll and safely claim committed unpublished outbox records. | HIGH | VERIFIED |
| ASM-022 | Retry settings | Use configurable initial retry and Circuit Breaker values; tune from observed behaviour. | MEDIUM | VERIFIED |
| ASM-023 | Callback retry | Persist pending Catalog callback work in Notification Service and retry independently. | HIGH | VERIFIED |
| ASM-024 | Enquiry resolution | Model `RESOLVED` but defer the sales dashboard and full sales authentication workflow. | MEDIUM | IMPLEMENTED |
| ASM-025 | API errors | Use consistent error responses and standard HTTP status meanings. | MEDIUM | VERIFIED |
| ASM-026 | Catalogue pagination | Do not implement pagination in the initial proof of concept unless the upstream catalogue size makes it necessary. | LOW | IMPLEMENTED |
| ASM-027 | Product caching | Do not introduce a separate product cache in the initial implementation. | LOW | IMPLEMENTED |
| ASM-028 | Visual design | Use a clean, responsive and accessible default design; detailed brand styling is not supplied. | LOW | IMPLEMENTED |
| ASM-029 | Customer access | Catalogue browsing and enquiry submission are public; protect internal service operations separately. | MEDIUM | IMPLEMENTED |
| ASM-030 | Callback authentication | Protect the internal callback with private service connectivity and service-to-service authentication. | HIGH | VERIFIED |
| ASM-031 | Featured products | A configured featured product missing from the provider fails the request (502) instead of showing fewer than five. | LOW | VERIFIED |
| ASM-032 | Callback authentication | Implement ASM-030 as a shared bearer token on a separate internal listener (port 3001) that the Gateway never routes. | HIGH | VERIFIED |
| ASM-033 | Callback terminal state | Add a monitored terminal `FAILED` callback status for non-retryable rejections and exhausted callback retries. | MEDIUM | VERIFIED |
| ASM-034 | Duplicate email window | A crash after provider acceptance but before the ledger records `SENT` can resend one email on redelivery; this window is accepted, not eliminated. | MEDIUM | IMPLEMENTED |
| ASM-035 | Enquiry status lookup | A public, read-only, PII-free status endpoint keyed by the unguessable enquiry ID is acceptable without customer authentication. | MEDIUM | VERIFIED |

---

## 4. Detailed Assumptions

### ASM-001 — Featured Product Selection

**Source:** Original assessment, page 2; `SPEC.md`, FR-001.  
**Impact:** MEDIUM  
**Status:** VERIFIED

**Ambiguity**  
The assessment says five products have been chosen to be featured/top-rated, but does not specify how the business selection is stored or changed.

**Assumption**  
The five homepage featured products are selected through backend configuration. The initial implementation will use a configured list of product identifiers. The homepage will not independently calculate the five highest-rated products unless the configured selection explicitly uses that rule.

**Rationale**  
Featured merchandising is a business choice and should not be coupled to frontend code or confused with category rating order.

**Implementation impact**
- Catalog Service resolves the configured identifiers through the product provider.
- React displays the response and contains no hardcoded featured selection.
- Local configuration may use environment variables or a committed non-secret configuration file.

**Validation**
- Verify that the API returns exactly five configured products when all configured products are available.
- Verify deterministic handling when a configured product is missing or the configuration is invalid.

---

### ASM-002 — Number of Top-Rated Products per Category

**Source:** Original assessment, page 3; `SPEC.md`, FR-002.  
**Impact:** MEDIUM  
**Status:** VERIFIED

**Ambiguity**  
The assessment requires top-rated products and additional products for a category but does not state how many products belong in the top-rated section.

**Assumption**  
Display up to five top-rated products per category. If fewer than five products exist, display all available products in the top-rated section and no additional products.

**Rationale**  
This provides a consistent experience with the homepage's five featured products while preserving the distinction between highlighted and additional catalogue items.

**Implementation impact**
- Catalog Service performs category filtering and ranking.
- The API response separates `topRated` and `additionalProducts`.
- Additional products exclude all products already in `topRated`.

**Validation**
- Test categories with more than five products, exactly five products and fewer than five products.
- Verify that no product appears in both sections.

---

### ASM-003 — Category Rating Tie-Breaker

**Source:** Original assessment, page 3; `SPEC.md`, FR-002.  
**Impact:** LOW  
**Status:** VERIFIED

**Ambiguity**  
The assessment does not define ordering when two products have the same rating.

**Assumption**  
Sort by rating descending and then product ID ascending. Products with missing rating data are placed after products with valid ratings.

**Rationale**  
A deterministic tie-breaker prevents ordering from changing unpredictably between requests.

**Implementation impact**  
Implement the ordering in Catalog Service, not in the frontend.

**Validation**  
Unit-test equal ratings and missing rating values.

---

### ASM-004 — Searchable Product Fields and Matching

**Source:** Original assessment, page 3; `SPEC.md`, FR-003.  
**Impact:** MEDIUM  
**Status:** VERIFIED

**Ambiguity**  
The assessment requires text matching but does not define which product fields or matching rules are used.

**Assumption**  
Search the product title, description and category using case-insensitive partial matching after trimming leading and trailing whitespace.

**Rationale**  
These fields cover the most useful customer-facing catalogue text without introducing a search engine or external dependency.

**Implementation impact**  
Search is implemented behind the Catalog Service API. The frontend submits the search term and renders only returned matches.

**Validation**  
Test title, description and category matches; case differences; partial matches; and non-matching queries.

---

### ASM-005 — Empty Search Query

**Source:** Original assessment, page 3; `SPEC.md`, FR-003.  
**Impact:** LOW  
**Status:** VERIFIED

**Ambiguity**  
The assessment does not specify what happens when the customer submits an empty or whitespace-only search.

**Assumption**  
Catalog Service rejects an empty or whitespace-only submitted search with a documented validation response. The frontend should prevent an empty search submission where practical.

**Rationale**  
An empty search should not accidentally become an unfiltered match-all query and be mistaken for a successful search.

**Implementation impact**  
Trim and validate the search query at the API boundary.

**Validation**  
Test empty, whitespace-only and valid search queries.

---

### ASM-006 — Product Details Fields

**Source:** Original assessment, page 3; `SPEC.md`, FR-004.  
**Impact:** LOW  
**Status:** VERIFIED

**Ambiguity**  
The assessment requires a product details page but does not enumerate every field to display.

**Assumption**  
Display product ID, title, description, image, price, category, rating and review count when available from the normalized product model.

**Rationale**  
These are the useful catalogue details supplied by the initial product source and support an informed enquiry.

**Implementation impact**  
Catalog Service normalizes provider data. React renders the internal product contract rather than the upstream response shape.

**Validation**  
Test rendering when optional rating/review data is absent and when an image fails to load.

---

### ASM-007 — Required Enquiry Contact Fields

**Source:** Original assessment, page 3; `SPEC.md`, FR-005.  
**Impact:** MEDIUM  
**Status:** VERIFIED

**Ambiguity**  
The assessment says customers provide contact details but does not list the exact fields.

**Assumption**  
Customer name, email address and phone number are required. A free-text message is optional.

**Rationale**  
These fields provide the sales team with basic contact information and context for follow-up.

**Implementation impact**
- Validate the fields on the frontend for user experience.
- Validate all fields again in Catalog Service.
- Do not accept a sales recipient address from the customer.

**Validation**  
Test missing fields, invalid email, invalid phone input, optional message and valid submission.

---

### ASM-008 — Category Enquiry Entry Point

**Source:** Approved project extension; `SPEC.md`, FR-006.  
**Impact:** MEDIUM  
**Status:** VERIFIED

**Ambiguity**  
The original assessment requires product enquiries. Category enquiries were added to the project scope, but the original brief does not define where a customer initiates one.

**Assumption**  
Provide a simple category enquiry action on the category page. It uses the same enquiry form and API as product enquiries, with `entity.type = CATEGORY` and the selected category identifier.

**Rationale**  
This demonstrates the agreed generic enquiry model without creating another service or separate workflow.

**Implementation impact**  
The category page can open or display the shared enquiry form. Product enquiry remains the critical assessment path and must be completed first.

**Validation**  
Verify that a category enquiry references the selected category and uses the same persistence and notification flow as a product enquiry.

---

### ASM-009 — Entity Validation and Snapshot

**Source:** Approved project design; `SPEC.md`, Sections 7 and 9.  
**Impact:** MEDIUM  
**Status:** VERIFIED

**Ambiguity**  
The assessment does not specify how the application proves that a referenced product or category exists when an enquiry is submitted, nor how it preserves historical context.

**Assumption**  
Before persisting an enquiry, Catalog Service validates the referenced product or category through its product-provider abstraction. It stores a small snapshot of the relevant entity information with the enquiry.

**Rationale**  
This prevents enquiries being created for invalid catalogue references and preserves the context even if upstream metadata later changes.

**Implementation impact**
- Product validation resolves the selected product.
- Category validation checks the selected category.
- The snapshot contains only the information needed for enquiry history and notification content.
- The snapshot is not a second authoritative product catalogue.

**Validation**  
Test valid and invalid entity references and verify that the stored snapshot matches the entity at submission time.

---

### ASM-010 — Asynchronous Enquiry Acknowledgement

**Source:** Original assessment, page 3; approved event-driven design; `SPEC.md`, Sections 6 and 8.  
**Impact:** HIGH  
**Status:** VERIFIED

**Ambiguity**  
The original assessment describes an email being sent and a Thank You message being shown, but does not prescribe whether the HTTP request waits for the email provider.

**Assumption**  
Enquiry submission is asynchronous. Catalog Service returns `202 Accepted` only after the enquiry and its outbox event have both been committed in the same database transaction. The frontend then displays a confirmation that the enquiry has been received. It must not say that the email has already been sent.

**Rationale**  
The customer response should not depend on email-provider availability. The database transaction establishes durable acceptance, while the notification workflow proceeds independently.

**Implementation impact**
- Persist enquiry and outbox event atomically.
- Return no success if the transaction fails.
- Do not wait for SQS consumption or email sending before responding.
- The end-to-end test must verify eventual email notification separately.

**Validation**  
Test that a committed enquiry returns `202` and `RECEIVED`; test that database failure returns an error and no false confirmation; verify eventual email delivery in the integrated workflow.

---

### ASM-011 — Meaning of Successful Email Sending

**Source:** Approved project design; `SPEC.md`, Sections 7 and 11.  
**Impact:** MEDIUM  
**Status:** IMPLEMENTED

**Ambiguity**  
The phrase "email successfully sent" can mean provider acceptance or confirmed delivery into the recipient's inbox.

**Assumption**  
For the initial implementation, successful sending means the configured email provider (Mailpit SMTP locally or SES in production) accepts the send request and returns a successful provider response. Actual inbox delivery, bounce and complaint feedback are outside initial scope.

**Rationale**  
The initial application does not implement provider delivery-event ingestion. Provider acceptance is the observable success signal available to the Notification Service.

**Implementation impact**  
Notification Service records `email_status = SENT` only after a successful provider response and retains the provider message identifier when available.

**Validation**  
Test provider success and failure responses. Do not label a failed provider request as SENT.

---

### ASM-012 — Sales Recipient Resolution

**Source:** Original assessment, page 3; approved project design; `SPEC.md`, Section 13.  
**Impact:** MEDIUM  
**Status:** VERIFIED

**Ambiguity**  
The assessment refers to a sales inbox but does not specify recipient-management rules or whether product and category enquiries go to different teams.

**Assumption**  
Resolve recipients using trusted server-side configuration keyed by enquiry type. PRODUCT and CATEGORY may use separate configured addresses; in local development, both may point to the same Mailpit-captured inbox.

**Rationale**  
This supports routing to the concerned sales team without trusting customer input or building an administrative recipient-management feature.

**Implementation impact**
- Keep recipient configuration outside email templates.
- Do not accept recipient addresses in public enquiry requests.
- Use environment configuration locally and managed configuration/secrets in production as appropriate.

**Validation**  
Test recipient selection for PRODUCT and CATEGORY and verify that customer-supplied fields cannot override it.

---

### ASM-013 — Email Template Storage

**Source:** Approved project decision.  
**Impact:** LOW  
**Status:** VERIFIED

**Ambiguity**  
The assessment requires an email but does not prescribe how templates are stored or managed.

**Assumption**  
Keep PRODUCT and CATEGORY email templates in Notification Service source code, under a dedicated templates directory. Each template supports HTML and plain-text output.

**Rationale**  
Source-controlled templates are easy to review, test and version. A dynamic template-management system is unnecessary for the proof of concept.

**Implementation impact**
- Use typed rendering contracts.
- Escape untrusted customer content in HTML.
- Keep template rendering separate from SMTP/SES transport.

**Validation**  
Unit-test subject, required content, text output and safe HTML rendering for both enquiry types.

---

### ASM-014 — Product Data Persistence

**Source:** Original assessment, page 1; approved project design.  
**Impact:** MEDIUM  
**Status:** IMPLEMENTED

**Ambiguity**  
The assessment allows Fake Store API and does not require a product database. The project does require durable enquiry persistence for its approved event-driven flow.

**Assumption**  
Fake Store API remains the initial source of product data. Catalog Service does not create a second persistent product catalogue in the initial implementation. PostgreSQL is used for enquiry, outbox and related operational records.

**Rationale**  
This keeps the proof of concept focused and demonstrates provider replaceability without duplicating product-source responsibilities.

**Implementation impact**
- Product access stays behind the provider interface.
- Enquiries retain an entity snapshot for historical context.
- Do not add a product synchronization pipeline or product administration UI.

**Validation**  
Verify that product endpoints use the provider abstraction and that enquiry persistence does not depend on a locally seeded product table.

---

### ASM-015 — External Product Provider Failures

**Source:** Approved project design; `SPEC.md`, FR-004 and Section 8.  
**Impact:** MEDIUM  
**Status:** VERIFIED

**Ambiguity**  
The assessment does not define how the application behaves if Fake Store API is unavailable, slow or returns malformed data.

**Assumption**  
Catalog Service uses bounded upstream timeouts, validates provider responses and returns a meaningful failure response when the provider cannot supply the requested catalogue data. It must not return an empty successful result that hides an upstream failure.

**Rationale**  
A failed upstream request is different from a valid empty catalogue or a product-not-found result.

**Implementation impact**
- Map upstream timeout and availability failures to documented gateway/service errors.
- Keep provider errors out of the frontend's internal implementation details.
- Do not add an application-level product cache in the initial implementation.

**Validation**  
Test timeout, non-success upstream response, malformed response, missing product and valid empty result separately where applicable.

---

### ASM-016 — Local AWS-Compatible Infrastructure

**Source:** Original assessment, page 2; approved project architecture.  
**Impact:** HIGH  
**Status:** IMPLEMENTED

**Ambiguity**  
The assessment requires included infrastructure to be AWS-compatible and requires a reviewer to run the application locally, but does not prescribe local emulators.

**Assumption**  
Use local substitutes while keeping application-facing integrations compatible with the selected AWS services:

- Nginx for local routing and static frontend serving.
- ElasticMQ for the SQS API subset used by the application.
- PostgreSQL container for the RDS PostgreSQL-compatible engine.
- Mailpit for local SMTP capture.
- Docker Compose for local service orchestration.

Production targets remain API Gateway, S3/CloudFront, ECS Fargate, RDS PostgreSQL, SQS, DLQ and SES.

**Rationale**  
The reviewer must not need an AWS account, credentials or paid services to verify the application.

**Implementation impact**
- Use AWS SDK v3 for SQS in local and production environments.
- Make endpoint, region and queue URL configurable.
- Document emulator limitations.
- Do not claim local emulation validates all AWS service features, IAM policies or managed-service behaviour.

**Validation**  
Run the complete workflow through Docker Compose without AWS credentials. Verify the actual SQS operations used against ElasticMQ.

---

### ASM-017 — Deterministic and Offline Tests

**Source:** Approved project design.  
**Impact:** LOW  
**Status:** VERIFIED

**Ambiguity**  
The assessment permits Fake Store API but does not specify how automated tests remain deterministic when an external provider is unavailable.

**Assumption**  
Provide a fixture-backed implementation of the product-provider interface for automated tests and optional offline local verification. The default reviewer demo may use Fake Store API if reachable.

**Rationale**  
Tests should not depend on external network availability or mutable third-party data.

**Implementation impact**  
Test Catalog Service business behaviour using deterministic fixtures and test provider failure handling separately.

**Validation**  
Run the automated test suite with outbound network access disabled and verify that tests remain deterministic.

---

### ASM-018 — Database Isolation Across Services

**Source:** Approved project architecture; `SPEC.md`, Section 9.  
**Impact:** HIGH  
**Status:** VERIFIED

**Ambiguity**  
The assessment does not prescribe database topology. The project requires separate data ownership for the two services.

**Assumption**  
Catalog Service and Notification Service have separate logical databases and separate credentials. A single PostgreSQL container may host both databases locally. Production may use a PostgreSQL RDS deployment with separately controlled databases or schemas and credentials, provided ownership and access isolation are preserved.

**Rationale**  
This demonstrates service data ownership without requiring multiple database servers for a small assessment.

**Implementation impact**
- Each service maintains its own migrations and repositories.
- Notification Service cannot query Catalog Service tables.
- Catalog Service cannot query Notification Service delivery records.

**Validation**  
Verify connection configuration and ensure each service's database user cannot access the other service's owned tables/database.

---

### ASM-019 — SQS Queue Type and Ordering

**Source:** Approved project architecture.  
**Impact:** MEDIUM  
**Status:** IMPLEMENTED

**Ambiguity**  
The assessment does not require message ordering or FIFO processing.

**Assumption**  
Use an SQS Standard Queue for enquiry notification events. Strict ordering is not required for independent enquiries.

**Rationale**  
Standard Queue semantics are sufficient for this workflow and avoid introducing FIFO-specific grouping and deduplication design without a demonstrated requirement.

**Implementation impact**  
The consumer must tolerate duplicate and potentially out-of-order delivery. Use durable idempotency keys based on event identity.

**Validation**  
Test duplicate delivery and ensure processing correctness does not depend on global ordering.

---

### ASM-020 — At-Least-Once Message Delivery

**Source:** AWS SQS Standard Queue behaviour and approved project architecture.  
**Impact:** HIGH  
**Status:** VERIFIED

**Ambiguity**  
The assessment does not discuss duplicate message delivery or exactly-once processing.

**Assumption**  
Design for at-least-once delivery. Both outbox publication and Notification Service consumption may result in duplicate events. Notification processing must use durable event identity and idempotent operations.

**Rationale**  
The design must remain correct under normal distributed-system retry and crash scenarios.

**Implementation impact**
- Use a stable event ID.
- Enforce uniqueness in Notification Service delivery records.
- Make callback application idempotent in Catalog Service.
- Do not claim exactly-once email delivery.

**Validation**  
Deliver the same event more than once and verify that an already-recorded successful email is not resent unnecessarily and that the callback does not cause duplicate state transitions.

---

### ASM-021 — Outbox Publisher Execution Model

**Source:** Approved Transactional Outbox design; `SPEC.md`, Section 10.  
**Impact:** HIGH  
**Status:** VERIFIED

**Ambiguity**  
The specification requires background publication but does not prescribe the exact scheduling, polling interval or claiming implementation.

**Assumption**  
Use a background publisher within Catalog Service that periodically claims committed unpublished outbox records, publishes them to SQS and records publication only after SQS confirms acceptance. The polling interval and batch size should be configurable with conservative defaults.

**Rationale**  
A database-backed outbox is sufficient for the assessment and avoids adding another service or scheduler infrastructure.

**Implementation impact**
- Claim records safely to avoid concurrent publishers processing the same row unnecessarily.
- Recover claimed records after process restart.
- Expect duplicate publication if the process crashes after queue acceptance but before marking the row published.
- Rely on consumer idempotency for duplicate protection.

**Validation**  
Test publisher crash/restart, SQS unavailable and duplicate publication scenarios.

---

### ASM-022 — Initial Retry and Circuit Breaker Parameters

**Source:** Approved project design; `SPEC.md`, Section 12.  
**Impact:** MEDIUM  
**Status:** VERIFIED

**Ambiguity**  
The assessment does not prescribe retry counts, backoff schedules or Circuit Breaker thresholds.

**Assumption**  
Use the following as configurable initial values, not fixed production guarantees:

- Circuit Breaker qualifying failure threshold: 5 consecutive failures.
- Circuit Breaker open duration: 30 seconds.
- Half-open probes: 1.
- Catalog callback HTTP timeout: 3 seconds.
- Retry strategy: exponential backoff with jitter.
- SQS redrive maximum receive count: start at 5 unless implementation testing supports a better value.

**Rationale**  
These values provide a simple initial policy for a low-volume proof of concept. They must be configurable and revisited using observed processing time and failure behaviour.

**Implementation impact**  
Do not hardcode retry and breaker settings throughout the code. Keep them in validated configuration.

**Validation**  
Test the Circuit Breaker states, timeout handling, bounded retries and eventual DLQ behaviour. Document any values changed during implementation.

---

### ASM-023 — Independent Durable Catalog Callback Retry

**Source:** Approved project design; `SPEC.md`, Sections 9, 11 and 12.  
**Impact:** HIGH  
**Status:** VERIFIED

**Ambiguity**  
The architecture requires callback recovery after a successful email send, but does not mandate a separate callback queue or a particular retry scheduler.

**Assumption**  
Persist callback status and next retry time in Notification Service's delivery ledger. A Notification Service background retry worker scans due pending callbacks and retries the Catalog Service PATCH independently of email sending. Do not add a separate broker or microservice for this initial workflow.

**Rationale**  
A durable database-backed retry mechanism is sufficient for this assessment and keeps callback failure independent from email delivery.

**Implementation impact**
- After email provider success, persist `email_status = SENT` and `callback_status = PENDING` before acknowledging the original SQS message.
- Retry only the callback when it fails.
- Mark callback complete only after Catalog Service confirms that the `PROCESSED` transition has been persisted.
- Recover pending callbacks after Notification Service restart.

**Validation**  
Send an email successfully, make Catalog Service unavailable, restart Notification Service, restore Catalog Service and verify that the callback eventually succeeds without another email send.

---

### ASM-024 — Enquiry Resolution Workflow

**Source:** Approved project scope; `SPEC.md`, Sections 7 and 23.  
**Impact:** MEDIUM  
**Status:** IMPLEMENTED

**Ambiguity**  
The project includes a `RESOLVED` lifecycle state, but the original assessment does not request a sales-management interface or user-management workflow.

**Assumption**  
Model and enforce the `PROCESSED → RESOLVED` domain transition. Do not build a sales dashboard or a full sales authentication experience in the initial assessment. Do not expose an unauthenticated public status-update endpoint.

**Rationale**  
This preserves the lifecycle model without expanding the proof of concept into a separate sales application.

**Implementation impact**  
Provide a protected domain/service operation and document the future authenticated sales workflow. Any exposed route must remain protected and must not permit arbitrary public resolution.

**Validation**  
Unit-test allowed and disallowed transitions, including the inability to resolve a `RECEIVED` enquiry through the normal workflow.

---

### ASM-025 — API Error Shape and Status Mapping

**Source:** Approved project design; `SPEC.md`, Sections 8 and 15.  
**Impact:** MEDIUM  
**Status:** VERIFIED

**Ambiguity**  
The original assessment does not prescribe response-body schemas or exact HTTP mappings for every failure.

**Assumption**  
Use a consistent JSON error response with a stable machine-readable code and a safe human-readable message. Use HTTP status codes according to the failure category:

- `400` or `422` for invalid input, choosing one convention consistently.
- `404` for a missing product, category or enquiry.
- `502` for an invalid or failed upstream response.
- `503` for a temporarily unavailable internal dependency where appropriate.
- `504` for an upstream timeout.
- `500` for unexpected internal failures without exposing stack traces.

**Rationale**  
Consistent errors simplify frontend behaviour, testing and operational diagnosis.

**Implementation impact**  
Define and document the final error contract in `docs/api-contracts.md` and `docs/openapi.yaml`.

**Validation**  
Test each documented error category and verify that stack traces, credentials and internal details are not exposed.

---

### ASM-026 — Pagination

**Source:** Original assessment, pages 2–3; approved project scope.  
**Impact:** LOW  
**Status:** IMPLEMENTED

**Ambiguity**  
The assessment does not specify pagination, page size or infinite scrolling.

**Assumption**  
Do not implement pagination for the initial proof of concept unless the current catalogue size or usability test demonstrates it is necessary. The API should be structured so pagination can be added later without changing product ownership boundaries.

**Rationale**  
Pagination is not necessary to demonstrate the stated acceptance criteria and may consume time better spent on the enquiry workflow and tests.

**Implementation impact**  
Return the available matching products for the initial catalogue scope. Avoid designing response contracts that prevent future pagination.

**Validation**  
Verify all expected products in the test fixture are available through category and search results.

---

### ASM-027 — Product Caching

**Source:** Approved project scope.  
**Impact:** LOW  
**Status:** IMPLEMENTED

**Ambiguity**  
The assessment does not specify caching or freshness requirements for product data.

**Assumption**  
Do not introduce Redis or a separate caching system in the initial implementation. Use bounded upstream timeouts and the provider abstraction. Add caching only if measured performance or upstream limitations justify it.

**Rationale**  
A cache is not needed to demonstrate the catalogue requirements and would add invalidation and operational concerns.

**Implementation impact**  
Keep product retrieval behind the provider/service boundary so caching can be introduced later without changing the frontend contract.

**Validation**  
Verify that provider latency and failures are handled correctly without relying on a cache.

---

### ASM-028 — Visual Design and Branding

**Source:** Original assessment, page 1.  
**Impact:** LOW  
**Status:** IMPLEMENTED

**Ambiguity**  
The assessment says creative work is being done but does not provide the final visual identity or design assets.

**Assumption**  
Use a clean, neutral, responsive catalogue design with accessible contrast, readable typography and consistent spacing. Keep styling and design tokens easy to replace.

**Rationale**  
The proof of concept needs to be usable and presentable without spending disproportionate time inventing a full brand system.

**Implementation impact**  
Centralize colours, spacing and typography tokens. Avoid embedding visual decisions in business components.

**Validation**  
Verify responsive layouts at common viewport sizes and test basic keyboard and form accessibility.

---

### ASM-029 — Customer Authentication

**Source:** Original assessment, pages 1–3; approved project scope.  
**Impact:** MEDIUM  
**Status:** IMPLEMENTED

**Ambiguity**  
The assessment describes public catalogue browsing and customer enquiries but does not require customer registration or authentication.

**Assumption**  
Catalogue browsing and enquiry submission are public operations. Do not add customer accounts or general customer authentication to the initial assessment. Protect internal service-to-service operations separately and apply validation and rate limiting to public enquiry submission.

**Rationale**  
Customer authentication is not needed for the stated customer journey and would add unrelated scope.

**Implementation impact**  
No login or registration pages. Internal callback authentication remains mandatory.

**Validation**  
Verify public catalogue and enquiry flows work without customer accounts and that internal callback operations are not publicly invocable.

---

### ASM-030 — Internal Callback Authentication

**Source:** Approved project security design; `SPEC.md`, Sections 8 and 15.  
**Impact:** HIGH  
**Status:** VERIFIED

**Ambiguity**  
The specification requires private service-to-service communication and authentication but does not prescribe the precise local and AWS authentication mechanism.

**Assumption**  
The internal Catalog notification-status callback must be reachable only through private service connectivity and must require service-to-service authentication. Select a proportionate implementation that works locally and maps cleanly to AWS. Local credentials must be supplied through environment configuration; production credentials or identities must be managed through AWS-supported identity and secret mechanisms. Network isolation alone is not sufficient authentication.

**Rationale**  
The callback changes business lifecycle state and must not be callable by arbitrary public clients.

**Implementation impact**  
Document the selected mechanism in `DECISIONS.md` and `docs/api-contracts.md` before implementing the callback. Do not expose the internal route through the public frontend API Gateway.

**Validation**  
Test an authorized callback, missing/invalid credentials and attempts to reach the internal route through the public API surface.

---

### ASM-031 — Missing Configured Featured Product

**Source:** ASM-001 validation clause; `docs/api-contracts.md` §2.1.
**Impact:** LOW
**Status:** VERIFIED (covered by `services/catalog/test/catalogService.test.ts`)

**Ambiguity**
The featured endpoint must return exactly five configured products, but the behaviour when a configured product no longer exists upstream is not specified.

**Assumption**
Startup configuration requires exactly five distinct IDs. If the provider does not return one of them at request time, the endpoint returns `502 FEATURED_PRODUCT_UNAVAILABLE` and logs an error, rather than silently returning fewer than five or substituting another product.

**Rationale**
A silent substitution would misrepresent a business merchandising choice; an explicit error makes the configuration drift visible.

**Validation**
Unit test: a configured id `999` yields 502 `FEATURED_PRODUCT_UNAVAILABLE`.

---

### ASM-032 — Internal Callback Authentication Mechanism

**Source:** ASM-030; `docs/api-contracts.md` §4.1.
**Impact:** HIGH
**Status:** VERIFIED (covered by `services/catalog/test/publicApi.test.ts`)

**Assumption**
Catalog Service serves the internal callback on a separate HTTP listener (`INTERNAL_PORT`, default 3001) that the API Gateway never routes, and requires `Authorization: Bearer <INTERNAL_API_TOKEN>` compared in constant time. The public listener does not mount `/internal` at all. Locally the token comes from `.env`; in AWS it is a Secrets Manager secret injected into both ECS task definitions, and the internal listener is reachable only via private service connectivity (security group restricted to Notification Service). See `DECISIONS.md` ADR-018.

**Validation**
API tests: missing/wrong token → 401; valid token → 200; the public app returns 404 for `/internal/...`.

---

### ASM-033 — Terminal Callback Failure State

**Source:** `CLAUDE.md` §11 ("or the callback enters an explicitly monitored terminal-failure state"); `docs/data-model.md` §4.1.
**Impact:** MEDIUM
**Status:** VERIFIED (covered by `services/notification/test/integration/processor.test.ts`)

**Ambiguity**
The data model lists callback statuses `NULL`, `PENDING` and `COMPLETED`, while `CLAUDE.md` allows an explicitly monitored terminal failure without naming it.

**Assumption**
`notification_deliveries.callback_status` also allows `FAILED`. It is set when Catalog Service rejects the callback in a way that can never succeed (HTTP 400/404/409) or after `CALLBACK_MAX_ATTEMPTS` (default 50, backoff capped at 5 minutes). Each transition logs at `error` with `errorCategory=INTERNAL_COMMUNICATION` so it can be alerted on (CloudWatch metric filter in AWS). The enquiry stays `RECEIVED` in Catalog. 401/403 and 5xx/network/timeouts stay retryable; only network/timeout/5xx/429 count as Circuit Breaker failures.

**Validation**
Tests: 404 → `FAILED`; max attempts → `FAILED`; 503 → `PENDING` with backoff; circuit open → `PENDING` without a call.

---

### ASM-034 — Duplicate Email Window Between Provider Acceptance and Ledger Write

**Source:** `CLAUDE.md` §10–11 (at-least-once delivery; never resend because of a callback failure).
**Impact:** MEDIUM
**Status:** IMPLEMENTED

**Assumption**
SMTP/SES acceptance and the PostgreSQL ledger write cannot be made atomic. If the process crashes after the provider accepts the email but before `email_status = SENT` is committed, SQS redelivers the message and the email is sent again. The window is a few milliseconds and is accepted for this proof of concept. A callback failure never causes a resend, because `SENT` is committed before any callback attempt. A per-event email lease (`email_lease_until`) stops two concurrent consumers from both sending. If the processor's send guard times out while the provider call may still complete, the lease is **kept** (not cleared), so a redelivery cannot start a parallel send until the lease expires. A definite provider failure releases the lease so the retry can proceed.

---

### ASM-035 — Public Enquiry Status Lookup

**Source:** Owner request on 2026-11-22 (15:30 IST): an API to check an enquiry's status by ID instead of querying the database.
**Impact:** MEDIUM
**Status:** VERIFIED (covered by `services/catalog/test/publicApi.test.ts`, `test/enquiryService.test.ts`, `test/integration/enquiryLifecycle.test.ts`, the E2E journey and the CI smoke test. CI first ran on this code in PR #13 at `2338924`: 6/6 green)

**Ambiguity**
The original contract exposed enquiry creation only, and customer authentication is out of scope (ASM-029).

**Assumption**
`GET /api/catalog/enquiries/{enquiryId}` returns only the business lifecycle (status, timestamps, entity type/id/name). The random UUID enquiry ID, which is shown to the customer as their reference, works as a bearer-style lookup key. Because no personal data is returned, a lookup by a third party who learned the ID reveals only that an enquiry about a public product or category exists and how far it has progressed. The endpoint is read-only, `no-store` and rate limited. Notification-delivery internals are not exposed: Catalog may not read Notification Service data, and `PROCESSED` already implies email acceptance plus a persisted callback.

**Validation**
Tests assert RECEIVED → PROCESSED → RESOLVED with timestamps, no PII in the response, 400 for a malformed ID, 404 for an unknown one, and 429 when the rate limit is exceeded.

---

## 5. Confirmed Project Rules — Not Assumptions

The following are explicitly approved project rules. They are listed here for visibility but must not be treated as unresolved assumptions.

### 5.1 Enquiry lifecycle ownership

- Catalog Service is the sole owner of enquiry business lifecycle status.
- Notification Service owns its email delivery and callback-processing records.
- Notification Service never modifies Catalog Service database tables directly.

### 5.2 Enquiry lifecycle semantics

The only business states are:

`RECEIVED → PROCESSED → RESOLVED`

- A persisted enquiry starts as `RECEIVED`.
- Email failure or retry exhaustion leaves it `RECEIVED`.
- Successful provider acceptance alone does not change Catalog Service status.
- Notification Service must successfully report the outcome through the internal PATCH API.
- Catalog Service must successfully persist the transition before the enquiry is `PROCESSED`.
- The sales team explicitly performs the transition to `RESOLVED`.
- If the email succeeds but the callback fails, retry the callback without resending the email.

### 5.3 Service boundaries

- Exactly two business microservices: Catalog Service and Notification Service.
- No separate Enquiry Service.
- No direct database sharing between services.
- All browser API calls pass through the API Gateway.
- Notification Service is not publicly exposed.

### 5.4 Technology constraints

- AWS SDK v3 for SQS integration.
- ElasticMQ locally and Amazon SQS in production.
- Mailpit locally and Amazon SES as the production email target.
- Email templates are source-controlled inside Notification Service.
- No BullMQ, Redis, Kafka, RabbitMQ or Kubernetes in the initial scope.

### 5.5 Pull Request and review workflow

- Work on a feature branch, not directly on `main`.
- Create one cohesive assessment PR into `main` and leave it open and unmerged.
- After PR creation, invoke the dedicated PR Reviewer subagent in the same Claude Code session.
- The reviewer publishes findings or a review-passed comment on the same PR.
- The implementation engineer evaluates findings, fixes valid issues on the same branch and updates the same PR.
- The reviewer rechecks material corrections.
- Never claim a review occurred unless the reviewer actually completed it.

---

## 6. Assumption Change Process

When a new ambiguity is discovered during implementation:

1. Search this register to ensure the assumption is not already recorded.
2. Assign the next available identifier (`ASM-031`, `ASM-032`, and so on).
3. Record the source of the ambiguity.
4. Classify its impact.
5. State the chosen assumption and rationale.
6. Describe affected components and contracts.
7. Define a verification approach.
8. Reference the assumption in `DECISIONS.md` if it causes a significant engineering decision.
9. Update `SPEC.md` and related technical documents if the approved interpretation changes observable behaviour.
10. Preserve superseded entries rather than deleting their history.

### High-impact assumptions

HIGH-impact assumptions must be highlighted in `PLAN.md` and included in architecture or reliability review packages as appropriate.

If a high-impact assumption contradicts an explicit assessment requirement or an already approved project rule, do not proceed silently. Record the conflict and follow the change-control rules in `CLAUDE.md`.

### Verification evidence

When an assumption is implemented, update its status to `IMPLEMENTED`.

Only update it to `VERIFIED` after the relevant automated test, integration test, manual verification or other documented evidence has passed.

Do not mark an assumption `VERIFIED` based solely on code generation or a reviewer suggestion.

---

## 7. Relationship to Other Project Documents

| Document | Responsibility |
|---|---|
| `CLAUDE.md` | Engineering instructions, guardrails, execution and review workflow |
| `SPEC.md` | Functional and technical product specification |
| `ASSUMPTIONS.md` | Ambiguities and their approved interpretations |
| `DECISIONS.md` | Significant engineering decisions, alternatives and trade-offs |
| `PLAN.md` | Implementation phases, dependencies and quality gates |
| `docs/architecture.md` | Detailed local and AWS architecture |
| `docs/api-contracts.md` | Public and internal API contracts |
| `docs/event-contracts.md` | SQS event schemas and versioning |
| `docs/data-model.md` | Database ownership, entities and migrations |
| `docs/failure-handling.md` | Retry, idempotency, DLQ, Outbox and Circuit Breaker behaviour |
| `docs/testing-strategy.md` | Unit, integration, failure-path and end-to-end testing |

When documents conflict, preserve the original assessment's explicit requirements first, then the approved project architecture. Record and resolve conflicts deliberately; do not silently reinterpret requirements.

---

## 8. Final Guidance

The purpose of this register is to enable fast, disciplined implementation without repeated clarification requests.

Make reasonable assumptions for ordinary ambiguities, record them here, implement them consistently and verify them.

Do not use assumptions to override explicit assessment requirements, weaken security, hide defects or introduce unnecessary complexity.

**An assumption is a documented interpretation, not a fact supplied by the assessment.**
