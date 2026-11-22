# Catalog Platform — Architecture and Engineering Decisions

**Version:** 1.0  
**Status:** Initial approved decision baseline  
**Project:** AI-Native Engineer Code Challenge for Catalog Platform
**Related documents:** `CLAUDE.md`, `SPEC.md`, `ASSUMPTIONS.md`, `PLAN.md`  
**Decision format:** Lightweight Architecture Decision Records (ADRs)

---

## 1. Purpose

This document records the significant engineering decisions made for the Catalog Platform, including the context, selected approach, alternatives considered, rationale and consequences.

It complements the other project documents:

- `CLAUDE.md` defines engineering rules, implementation guardrails and the development/review workflow.
- `SPEC.md` defines what the product and its services must do.
- `ASSUMPTIONS.md` records how ambiguities in the assessment or specification are interpreted.
- `DECISIONS.md` explains why significant engineering choices were made.
- `PLAN.md` defines the implementation sequence and verification gates.

The original assessment remains authoritative for its explicit acceptance criteria. The decisions below are approved project design choices; they must not be represented as requirements explicitly mandated by the assessment.

## 2. Decision Status and Change Control

All decisions in this initial baseline are **ACCEPTED** unless a section explicitly says otherwise.

A decision may be changed only when:

1. New evidence shows that the selected approach does not satisfy a requirement.
2. An implementation constraint makes the decision impractical or unsafe.
3. A material improvement can be made without introducing disproportionate complexity or compromising assessment requirements.

When a decision changes:

- Record the reason and date of change.
- Explain the alternative selected and why.
- Identify affected services, APIs, events, data models and tests.
- Update `SPEC.md`, `ASSUMPTIONS.md` and relevant technical documents.
- Preserve the previous decision history rather than silently rewriting it.

Do not change an approved architectural decision merely because another technology or pattern is available.

## 3. Decision Summary

| ID | Decision | Status | Related assumptions |
|---|---|---|---|
| ADR-001 | Use React and TypeScript for the web client, and Node.js, TypeScript and Express for the backend | ACCEPTED | — |
| ADR-002 | Use a pnpm monorepo for the web app, two services and shared contracts | ACCEPTED | — |
| ADR-003 | Keep exactly two business microservices: Catalog Service and Notification Service | ACCEPTED | ASM-008, ASM-018 |
| ADR-004 | Route browser API traffic through one API Gateway; keep Notification Service private | ACCEPTED | ASM-016, ASM-029, ASM-030 |
| ADR-005 | Isolate Fake Store API behind a replaceable product-provider interface | ACCEPTED | ASM-014, ASM-015, ASM-017 |
| ADR-006 | Use PostgreSQL with separate data ownership and logical databases per service | ACCEPTED | ASM-018 |
| ADR-007 | Use AWS SQS and AWS SDK v3; use ElasticMQ locally instead of BullMQ | ACCEPTED | ASM-016, ASM-019, ASM-020 |
| ADR-008 | Use the Transactional Outbox Pattern for enquiry event publication | ACCEPTED | ASM-021 |
| ADR-009 | Accept enquiries asynchronously with HTTP 202 after the database transaction commits | ACCEPTED | ASM-010 |
| ADR-010 | Keep enquiry business status separate from notification delivery status | ACCEPTED | ASM-011, ASM-023, ASM-024 |
| ADR-011 | Report successful email processing through an internal Catalog Service PATCH API | ACCEPTED | ASM-023, ASM-030 |
| ADR-012 | Persist notification and callback progress separately; retry callbacks without resending successful email | ACCEPTED | ASM-020, ASM-023 |
| ADR-013 | Use a Circuit Breaker around the Notification-to-Catalog HTTP client | ACCEPTED | ASM-022, ASM-023 |
| ADR-014 | Keep email templates in Notification Service source code and abstract the email provider | ACCEPTED | ASM-011, ASM-012, ASM-013 |
| ADR-015 | Use local service substitutes while keeping production integrations AWS-compatible | ACCEPTED | ASM-016, ASM-017 |
| ADR-016 | Defer full AWS provisioning and non-essential product capabilities | ACCEPTED | ASM-024, ASM-026, ASM-027 |
| ADR-017 | Deliver the implementation as sequential, reviewed PRs into `main` instead of one assessment PR | ACCEPTED (supersedes CLAUDE.md §21 single-PR rule) | — |
| ADR-018 | Authenticate the internal callback with a shared bearer token on a separate private listener | ACCEPTED | ASM-030, ASM-032 |
| ADR-019 | Expose a read-only, PII-free enquiry status API from Catalog Service | ACCEPTED | ASM-035 |

---

## 4. Architecture Decisions

### ADR-001 — Approved Application Technology Stack

**Status:** ACCEPTED  
**Context:** The assessment permits a React web client and a Node.js or Laravel backend. The implementation must be delivered quickly, be maintainable and remain explainable during the follow-up interview.

**Decision:**

Use:

- React with TypeScript and Vite for the frontend.
- Node.js with TypeScript and Express for both backend services.
- Zod for request and external-data validation.
- PostgreSQL for persistent data.
- AWS SDK for JavaScript v3 for SQS operations.
- Vitest, Supertest, React Testing Library and Playwright for appropriate test layers.
- pnpm for package management.

**Alternatives considered:**

- Native iOS or Android client.
- PHP with Laravel.
- A larger backend framework or additional infrastructure libraries.

**Rationale:**

The selected stack is explicitly permitted by the assessment and supports rapid delivery. TypeScript provides shared type discipline across the frontend, services and event contracts. Express is sufficient for the small API surface and avoids introducing framework complexity that does not solve a requirement.

**Consequences:**

- The team can use one primary language across the application.
- Service boundaries and provider interfaces must provide architectural clarity rather than relying on framework features.
- TypeScript strict mode and validation at external boundaries are required.

---

### ADR-002 — Use a pnpm Monorepo

**Status:** ACCEPTED  
**Context:** The project contains a frontend, two backend services, shared API/event contracts and infrastructure configuration. These components are delivered together for one take-home assessment but must retain clear ownership boundaries.

**Decision:**

Use a pnpm workspace monorepo with separate applications for:

- `apps/web`
- `apps/catalog-service`
- `apps/notification-service`

Use a small shared package for versioned API and event contracts where appropriate.

**Alternatives considered:**

- Separate repositories for each application/service.
- A single application package containing all code.

**Rationale:**

A monorepo simplifies reviewer setup, dependency management, local orchestration and coordinated changes. Separate application directories preserve deployable and testable boundaries. Shared packages should contain contracts only, not shared business logic or repositories.

**Consequences:**

- Root scripts should make build, lint, type-check and test commands discoverable.
- Each service must retain its own runtime entry point, configuration, migrations and Dockerfile.
- Shared packages must not create hidden runtime coupling between services.

---

### ADR-003 — Keep Exactly Two Business Microservices

**Status:** ACCEPTED  
**Context:** Product catalogue behaviour and notification delivery have different responsibilities and different expected change patterns. Enquiry creation is currently part of the catalogue product journey and does not need an independent service for this assessment.

**Decision:**

Create exactly two business microservices:

1. **Catalog Service** — owns products, categories, search, product details, product/category enquiry creation, enquiry persistence, enquiry lifecycle, outbox and the internal notification-status callback API.
2. **Notification Service** — owns SQS consumption, email template selection/rendering, recipient resolution, email provider integration, notification delivery records and callback retry processing.

Do not introduce a separate Enquiry Service or Customer Service.

**Alternatives considered:**

- A single modular monolith.
- Three services, with enquiry management separated from catalogue.
- A separate service for each entity type.

**Rationale:**

The two selected services establish a meaningful boundary between catalogue/enquiry business ownership and notification delivery. A separate Enquiry Service would add network, deployment and operational complexity without a requirement that justifies it. Product and category enquiries share one enquiry model and lifecycle for the initial scope.

**Consequences:**

- Catalog Service is the sole authority for enquiry business status.
- Notification Service must not access Catalog Service tables directly.
- The two services can be deployed and scaled independently.
- The design must handle network and delivery failures explicitly.

**Related assumptions:** ASM-008, ASM-018, ASM-024.

---

### ADR-004 — Use an API Gateway as the Single Browser API Entry Point

**Status:** ACCEPTED  
**Context:** The frontend must not depend on internal service hostnames or know the backend service topology. The assessment also prohibits the browser from calling Fake Store API directly.

**Decision:**

All browser-to-backend API requests must pass through one API Gateway.

- Locally, Nginx serves the built React application and proxies `/api/*` requests to Catalog Service.
- In production, CloudFront serves React static assets from S3 and routes the API path to Amazon API Gateway HTTP API.
- API Gateway routes public catalogue and enquiry API requests to Catalog Service.
- Notification Service is not publicly exposed; it consumes SQS messages and calls Catalog Service through private service-to-service connectivity.

**Alternatives considered:**

- Browser calls each microservice directly.
- Browser calls Catalog Service by its internal URL.
- A custom Node.js gateway service.

**Rationale:**

A single public API entry point decouples the frontend from service topology and centralizes external routing. Nginx is adequate for local reverse-proxy behaviour; Amazon API Gateway is the production API management target. CloudFront and API Gateway have separate responsibilities: CloudFront distributes static assets and forwards API paths, while API Gateway handles backend API routing.

**Consequences:**

- Frontend uses a same-origin API path such as `/api/catalog`.
- No internal service URL or port may be embedded in frontend code.
- Internal Notification-to-Catalog traffic must not be routed through a public customer endpoint.
- Local Nginx behaviour is a functional substitute, not a complete emulation of CloudFront or API Gateway features.

**Related assumptions:** ASM-016, ASM-029, ASM-030.

---

### ADR-005 — Isolate the External Product Source Behind a Provider Interface

**Status:** ACCEPTED  
**Context:** Fake Store API is allowed for the proof of concept, while the assessment explicitly expects the product data source to be replaceable.

**Decision:**

Catalog Service must depend on an internal product catalogue provider interface. Implement Fake Store API as the initial adapter. Validate and map upstream responses into the application's internal product model at the adapter boundary.

Use a fixture-backed implementation for deterministic tests and optional offline local verification.

Do not persist a duplicate product catalogue unless a later requirement justifies it. Persist the enquiry and a snapshot of the referenced entity to preserve the context that existed when the customer submitted the enquiry.

**Alternatives considered:**

- Calling Fake Store API directly from React.
- Exposing Fake Store API response structures throughout the backend.
- Copying the full catalogue into PostgreSQL for the initial proof of concept.

**Rationale:**

The provider interface prevents upstream API contracts from leaking into the business domain or frontend. A fixture-backed provider makes tests deterministic and reduces dependence on an external API. Persisting an enquiry snapshot preserves history without requiring a second product catalogue store.

**Consequences:**

- All product data used by the browser passes through Catalog Service.
- Provider errors must be represented as errors, not silently converted into empty successful results.
- Product provider replacement should not require changes to frontend components or core product services.

**Related assumptions:** ASM-014, ASM-015, ASM-017.

---

### ADR-006 — Use PostgreSQL with Service-Owned Data Stores

**Status:** ACCEPTED  
**Context:** Enquiries must be durably persisted before the customer receives the acceptance response. The Notification Service also needs durable delivery and callback progress so it can recover after restarts without unnecessarily resending an email.

**Decision:**

Use PostgreSQL for persistence, with separate data ownership:

- Catalog Service owns its enquiry, outbox and consumed-event/idempotency records.
- Notification Service owns its notification-delivery ledger and callback-retry records.

For local development, one PostgreSQL container may host separate logical databases with separate credentials and migrations. Production must preserve the same service ownership boundary using separately managed databases/schemas and appropriately isolated credentials.

**Alternatives considered:**

- One shared database schema used freely by both services.
- No database and queue-only enquiry handling.
- A separate database technology for each service.

**Rationale:**

The enquiry must survive queue or email-provider outages. Separate ownership prevents one service from depending on another service's internal schema. A single local PostgreSQL container keeps reviewer setup simple without removing logical isolation.

**Consequences:**

- No cross-service database reads or writes.
- Each service owns its migrations and repository layer.
- Cross-service state changes happen through APIs or messages.
- Database transactions cannot atomically include SQS operations; the Outbox decision addresses publication consistency.

**Related assumptions:** ASM-018.

---

### ADR-007 — Use AWS SQS, Not BullMQ, for Asynchronous Messaging

**Status:** ACCEPTED  
**Context:** The target architecture should be AWS-compatible. The Notification Service needs to consume enquiry events asynchronously. Local execution must not require an AWS account or paid service.

**Decision:**

Use AWS SQS Standard Queue in production and ElasticMQ as the local SQS-compatible implementation. Use AWS SDK for JavaScript v3 for both publishing and consuming. Do not use BullMQ or Redis.

Use separate queue configuration for the enquiry notification flow and a production SQS Dead Letter Queue for messages that exhaust the configured receive policy.

**Alternatives considered:**

- BullMQ backed by Redis.
- RabbitMQ.
- Kafka.
- SNS topic with SQS subscriptions.
- Direct synchronous HTTP communication for email delivery.

**Rationale:**

SQS is the target production messaging service and is compatible with the AWS infrastructure constraint. Using the AWS SDK locally against ElasticMQ keeps application messaging code aligned with the production SQS API. There is one independent consumer in the initial scope, so SNS fan-out or a topic is unnecessary. Standard Queue is sufficient because strict ordering is not a business requirement.

**Consequences:**

- The application uses SQS send/receive/delete semantics rather than BullMQ Queue/Worker semantics.
- SQS Standard delivery is at-least-once; consumers must be idempotent.
- ElasticMQ implements only a subset of SQS; AWS-specific behaviours must be validated separately before production deployment.
- Queue visibility timeout, long polling, receive limits and DLQ policy must be configured deliberately.

**Related assumptions:** ASM-016, ASM-019, ASM-020.

---

### ADR-008 — Use the Transactional Outbox Pattern

**Status:** ACCEPTED  
**Context:** Catalog Service must persist an enquiry and publish a corresponding SQS event. PostgreSQL and SQS cannot participate in one ordinary atomic transaction. A direct database-write-then-SQS-send sequence can persist an enquiry while losing its event if SQS is unavailable. Sending to SQS first can publish an event for an enquiry whose database transaction later fails.

**Decision:**

Persist the enquiry and an outbox event in the same PostgreSQL transaction. A background publisher claims committed, unpublished outbox records and sends them to SQS. Mark an outbox record as published only after SQS accepts the message.

Use safe row claiming/locking so multiple publisher instances do not intentionally process the same row concurrently. Design for the unavoidable case where SQS accepts a message but the publisher crashes before marking the outbox row published.

**Alternatives considered:**

- Direct SQS publish after enquiry persistence without an outbox.
- Publish to SQS before committing the enquiry.
- Distributed transaction across PostgreSQL and SQS.

**Rationale:**

The Outbox ensures the enquiry and intent to publish are committed or rolled back together. It makes publication recoverable after transient SQS failure without pretending that PostgreSQL and SQS provide a shared transaction.

**Consequences:**

- Duplicate publication is possible and expected in crash/retry scenarios.
- Event consumers must be idempotent.
- Outbox rows need publication state, timestamps and observability.
- Publisher concurrency and row claiming require tests.

**Related assumptions:** ASM-021.

---

### ADR-009 — Return HTTP 202 After Durable Enquiry Acceptance

**Status:** ACCEPTED  
**Context:** Email delivery is asynchronous. The customer should not wait for Notification Service or the email provider to complete before receiving acknowledgement. However, the system must not acknowledge an enquiry that was not durably accepted.

**Decision:**

Catalog Service returns `202 Accepted` only after the enquiry and its outbox event are successfully committed in one database transaction.

The frontend confirmation means the platform has received the enquiry. It must not claim that the sales team has already received, processed or resolved it.

**Alternatives considered:**

- Wait synchronously for the email before responding.
- Return success before persistence completes.
- Return `200 OK` for every successful enquiry submission.

**Rationale:**

The response represents durable acceptance for asynchronous processing. It decouples customer response time from email delivery while avoiding false success if persistence fails.

**Consequences:**

- A successful HTTP response does not imply email delivery.
- The initial response contains the enquiry ID and `RECEIVED` state.
- Email delivery and enquiry processing happen after the customer response.

**Related assumptions:** ASM-010.

---

### ADR-010 — Separate Enquiry Business Lifecycle from Notification Delivery State

**Status:** ACCEPTED  
**Context:** Enquiry handling is a business lifecycle, while email sending is a technical delivery process. A notification may fail or be retried without changing whether the enquiry has been received or resolved.

**Decision:**

Catalog Service owns exactly three business states:

`RECEIVED → PROCESSED → RESOLVED`

Notification Service independently owns email delivery states (`PENDING`, `SENT`, `FAILED`) and callback-processing states (`PENDING`, `COMPLETED`). These delivery states are not columns in Catalog Service's enquiry record.

The authoritative transition rules are:

- Persisted enquiry starts as `RECEIVED`.
- Email failure leaves the enquiry `RECEIVED`.
- Email retry exhaustion or DLQ placement leaves it `RECEIVED`.
- Successful provider acceptance alone does not change Catalog Service status.
- Catalog Service changes the enquiry to `PROCESSED` only after it successfully persists the authenticated, idempotent success callback.
- An explicit sales business action changes `PROCESSED` to `RESOLVED`.

**Alternatives considered:**

- Store `PENDING`, `SENT` and `FAILED` as enquiry lifecycle states.
- Allow Notification Service to update the enquiry database directly.
- Treat email provider acceptance as an automatic business-state update without a callback.

**Rationale:**

This keeps business ownership in Catalog Service and delivery mechanics in Notification Service. It also ensures that notification failures do not create false business transitions.

**Consequences:**

- The enquiry remains `RECEIVED` during email retries and callback outages.
- `PROCESSED` is reached only after the Catalog database commit for the callback succeeds.
- `RESOLVED` is not automatically reached by a notification event.
- Tests must cover all allowed and disallowed transitions.

**Related assumptions:** ASM-011, ASM-023, ASM-024.

---

### ADR-011 — Report Successful Email Processing through an Internal Catalog PATCH API

**Status:** ACCEPTED  
**Context:** Notification Service sends email, but Catalog Service owns enquiry lifecycle. Direct database access would violate service ownership.

**Decision:**

After the email provider accepts the email and Notification Service durably records that outcome, Notification Service calls:

`PATCH /internal/catalog/enquiries/:enquiryId/notification-status`

Catalog Service validates the internal caller and event identity, then idempotently persists the `RECEIVED → PROCESSED` transition. The callback endpoint is private and not exposed through the public frontend API Gateway route.

**Alternatives considered:**

- Notification Service writes directly to Catalog Service's database.
- Catalog Service polls Notification Service's database.
- Add a second event/queue for the callback in the initial implementation.

**Rationale:**

An internal API makes ownership explicit and keeps the initial architecture understandable. It also gives Catalog Service the authority to validate and persist its own lifecycle transition.

**Consequences:**

- Notification Service needs an authenticated internal HTTP client.
- Catalog Service callback handling must be idempotent.
- A callback failure must not trigger a second email send.
- Callback retry must be durable within Notification Service.
- Notification Service must distinguish provider success from callback completion.

**Related assumptions:** ASM-023, ASM-030.

---

### ADR-012 — Persist Notification Delivery and Callback Progress Independently

**Status:** ACCEPTED  
**Context:** Email may succeed while the Catalog PATCH callback fails. If the SQS message is redelivered and Notification Service does not remember the successful email, the customer may receive duplicate emails. In-memory callback retry would also be lost if the worker restarts.

**Decision:**

Notification Service maintains a durable delivery ledger in its own database. It records at least:

- Event ID and enquiry ID.
- Email delivery state.
- Provider message ID, when available.
- Callback state.
- Attempt information and next retry time.
- Last failure information and timestamps.

After email provider acceptance, persist `email_status = SENT` and `callback_status = PENDING` before attempting the Catalog callback.

If the callback fails, retain the successful email outcome and retry the callback independently. Do not resend an email merely because the callback failed.

Acknowledge the original SQS message only after the email outcome and any pending callback work have been durably recorded so that a separate retry process can recover it.

**Alternatives considered:**

- Keep all progress only in memory.
- Retry the entire SQS job, including email sending, after callback failure.
- Store delivery state in Catalog Service's database.

**Rationale:**

Separate durable progress allows Notification Service to recover after process restarts and prevents callback retries from automatically repeating an already successful email operation.

**Consequences and limitations:**

- At-least-once processing still applies.
- A crash between external email acceptance and local persistence can still create duplicate-send risk; exactly-once email delivery cannot be guaranteed by a local database transaction.
- Use provider idempotency capabilities if available, without assuming they exist.
- The callback retry process must use leases/claims or equivalent concurrency control.
- Alert or expose exhausted callback retries; do not silently discard them.

---

### ADR-013 — Apply a Circuit Breaker to the Catalog Callback HTTP Client

**Status:** ACCEPTED  
**Context:** Notification Service depends on Catalog Service to report successful email processing. If Catalog Service is unavailable, repeated HTTP attempts can waste resources and amplify an outage.

**Decision:**

Implement a Circuit Breaker around the Notification Service's outbound Catalog Service HTTP client.

Use CLOSED, OPEN and HALF_OPEN states. Initial configuration is configurable and may start with:

- Failure threshold: 5.
- Open duration: 30 seconds.
- Half-open probes: 1.
- HTTP timeout: 3 seconds.

Count transient network failures, timeouts and relevant server failures. Do not count expected business responses such as validation errors or resource-not-found responses as service-health failures.

When the circuit is OPEN, fail fast and preserve the pending callback for durable retry. When HALF_OPEN, permit a limited probe to test recovery.

**Alternatives considered:**

- No Circuit Breaker; rely only on HTTP timeouts and retries.
- Retry continuously without limiting calls to an unhealthy dependency.
- Introduce a distributed Circuit Breaker coordinator.

**Rationale:**

A lightweight Circuit Breaker protects the callback dependency without introducing another infrastructure component. Durable retry remains responsible for eventually delivering the callback; the Circuit Breaker is not a message store or retry mechanism.

**Consequences:**

- Circuit Breaker state is local to each Notification Service process unless a later scale requirement justifies coordination.
- Callback state must be persisted independently of breaker state.
- Retry and circuit-open durations must avoid tight retry loops.
- Unit tests must verify all three states and exclusion of non-transient business errors.

**Related assumptions:** ASM-022, ASM-023.

---

### ADR-014 — Keep Email Templates in Source Code and Abstract the Provider

**Status:** ACCEPTED  
**Context:** The assessment expects the email provider to be replaceable. The initial product only needs a small number of stable enquiry templates.

**Decision:**

Keep PRODUCT and CATEGORY enquiry templates inside Notification Service source code. Provide HTML and plain-text renderings through typed template inputs. Keep template rendering independent from the email transport adapter.

Define one email provider interface with:

- A local Mailpit SMTP implementation.
- A production Amazon SES implementation.

Resolve sender and sales recipient addresses through trusted server-side configuration. Customer input must never control recipients or template selection. Escape untrusted customer content when producing HTML.

**Alternatives considered:**

- Store templates in a database.
- Use a third-party template management service.
- Build a template administration interface.
- Embed email HTML directly in notification business logic.

**Rationale:**

Source-controlled templates are simple to review, test and version. A provider interface allows the transport to change without rewriting notification business logic. A dynamic template-management system is not justified by the initial requirements.

**Consequences:**

- Template changes require a code change and deployment.
- Template rendering can be unit-tested.
- Mailpit and SES use the same rendered template contract.
- Externalizing templates can be considered later if business users need to edit content independently.

**Related assumptions:** ASM-011, ASM-012, ASM-013.

---

### ADR-015 — Use AWS-Compatible Local Substitutes and Docker Compose

**Status:** ACCEPTED  
**Context:** Included infrastructure must be AWS-compatible. The reviewer must run the application locally in under 10 minutes without creating a paid account or AWS account.

**Decision:**

Use Docker Compose to run the complete local workflow with:

- Nginx for local frontend serving and API reverse proxy.
- PostgreSQL for service-owned data stores.
- ElasticMQ for the subset of SQS API behaviour required locally.
- Mailpit for local SMTP capture.
- Containerized Catalog and Notification services.
- React build served through the local Nginx entry point.

Use AWS SDK v3 against ElasticMQ locally and normal AWS endpoints with IAM task roles in production. Use the same PostgreSQL engine locally and in the RDS production target. Use the same email-provider interface for Mailpit and SES.

**Alternatives considered:**

- Require the reviewer to provision AWS resources.
- Use paid email or queue services.
- Use BullMQ/Redis locally and translate to SQS in production.
- Use a different database locally from the production target.

**Rationale:**

Local substitutes keep the reviewer experience reproducible while preserving the production integration contracts. Using BullMQ locally would create a separate queue API and processing model rather than exercising the SQS SDK path.

**Consequences:**

- Local emulators do not reproduce every managed AWS feature.
- SQS features used locally must be explicitly limited and tested.
- Production IAM, VPC, API Gateway, SES and operational configuration still require AWS validation.
- The clean-checkout startup process must be tested and documented.

**Related assumptions:** ASM-016, ASM-017.

---

### ADR-016 — Defer Full AWS Provisioning and Non-Essential Product Scope

**Status:** ACCEPTED  
**Context:** The assessment is time-boxed and evaluates judgement, implementation quality and the critical customer path. It does not require a live cloud deployment or additional catalogue/business capabilities.

**Decision:**

Implement and verify the complete core workflow locally. Document the production AWS topology and service mapping, but do not build a full Terraform deployment unless the implementation plan shows it can be completed and validated without compromising the assessment.

Defer:

- Sales dashboard and complete sales-user authentication flow.
- Shopping cart, checkout, payment and inventory.
- CRM integration.
- Additional enquiry entity types.
- Multi-tenancy.
- SNS fan-out.
- Kubernetes/EKS.
- Advanced analytics and caching.

Model the `RESOLVED` enquiry state and its domain transition, but do not build a sales interface for the initial assessment.

**Alternatives considered:**

- Deploy every component to AWS during the assessment.
- Build a sales portal and additional business capabilities.
- Add infrastructure and services primarily to make the architecture appear more sophisticated.

**Rationale:**

The original assessment rewards a small, well-reasoned solution and requires local reviewer reproducibility. Optional features must not displace the five original acceptance criteria, tests or documentation.

**Consequences:**

- AWS production compatibility is demonstrated through design, approved service choices and configuration boundaries, not a live AWS deployment.
- Deferred items must be listed honestly in the README and PR.
- The actual time spent and any scope reductions must be recorded.

**Related assumptions:** ASM-024, ASM-026, ASM-027.

---

### ADR-017 — Sequential Pull Requests Instead of One Assessment PR

**Status:** ACCEPTED — decided by the project owner on 2026-11-22 during the implementation session.

**Context:** `CLAUDE.md` §21 and `PLAN.md` Phase 6 originally required one cohesive assessment PR. During implementation the project owner chose to split delivery into multiple PRs after the repository setup was complete.

**Decision:** Deliver the work as five sequential PRs, each targeting `main` and each opened only after the previous one has been merged by the project owner:

1. `chore/setup` — pnpm workspace, TypeScript/ESLint tooling, shared versioned contracts, local infrastructure (PostgreSQL, ElasticMQ, Mailpit), `.env.example`.
2. `feat/catalog-service` — catalogue APIs, enquiry persistence, Transactional Outbox, internal notification-status callback.
3. `feat/notification-service` — SQS consumer, delivery ledger, templates, email providers, durable callback retry and Circuit Breaker.
4. `feat/frontend-gateway` — React application and the Nginx API Gateway.
5. `test/e2e-docs` — Playwright end-to-end verification and final submission documentation.

Each PR receives its own `pr-reviewer` subagent review, published on that PR. The implementation engineer never merges; merging is the project owner's action.

**Rationale:** Smaller PRs give focused, reviewable diffs per service boundary and let review findings be fixed close to the code that introduced them.

**Consequences:**

- Each PR must be independently buildable and testable; Docker Compose grows one service per PR.
- The end-to-end journey is only demonstrable once PRs 1–4 are merged; PR 5 provides the full-journey evidence.
- Review evidence and time spent are recorded per PR.
- The single-PR wording in `CLAUDE.md` §21/§23 is superseded by this decision for this assessment; the rest of the review workflow (independent reviewer, published verdict, fix-and-re-review) still applies.

**Final state and deviation from the brief (owner decision, 2026-11-22 22:06 IST):** every assessment PR, including the last submission PR #14, was merged by the owner. The brief asks for a feature-branch PR into `main` to be **left open**. With everything merged, **there is no open assessment PR**. The owner chose this knowingly: when offered a final open PR, they replied *"No, keep everything merged."* The PR descriptions of #1, #2, #7, #9, #12, #13 and #14, together with `PR_DESCRIPTION.md`, remain the review record.

---

### ADR-018 — Internal Callback Authentication: Separate Listener + Shared Bearer Token

**Status:** ACCEPTED

**Context:** ASM-030 requires private connectivity plus service-to-service authentication for `PATCH /internal/catalog/enquiries/:id/notification-status`, without prescribing the mechanism.

**Decision:** Catalog Service runs two Express listeners in one process: the public API (port 3000, routed by the Gateway) and the internal API (port 3001, never routed by the Gateway). The internal API requires a bearer token (`INTERNAL_API_TOKEN`, minimum 16 characters) compared with `crypto.timingSafeEqual`.

**Alternatives considered:** mTLS (strong but heavy for local reviewer setup); AWS SigV4/IAM-authorised private API Gateway (good AWS fit, but requires AWS locally); network isolation only (rejected by ASM-030).

**Consequences:**
- Works identically locally and on ECS; in AWS the token lives in Secrets Manager and the internal port is restricted by security group to the Notification Service task.
- Token rotation requires coordinated redeploys; an IAM/SigV4 upgrade path is documented as future work.

---

### ADR-019 — Read-Only Enquiry Status API

**Status:** ACCEPTED — added at the owner's request on 2026-11-22.

**Context:** Checking an enquiry's progress previously required querying `catalog_enquiries` directly.

**Decision:** Add `GET /api/catalog/enquiries/{enquiryId}` to Catalog Service's public API. It returns status, timestamps and entity reference, and never customer data. It is served through the gateway, rate limited and `no-store`.

**Alternatives considered:** expose Notification Service delivery details as well (rejected: it would need Catalog to read another service's data, or Notification Service to be publicly exposed); authenticate the lookup (deferred with customer authentication, ASM-029).

**Consequences:** A public read path now exists for the business lifecycle only. The contract change is reflected in `docs/api-contracts.md` §3.2 and `docs/openapi.yaml`. A future authenticated sales API can return richer details, including customer data.

---

## 5. Cross-Cutting Rules Derived from the Decisions

The following rules summarize the combined effect of the accepted decisions. They are not additional independent architecture choices.

### 5.1 Enquiry lifecycle ownership

- Catalog Service owns the enquiry record and business status.
- Notification Service owns email delivery and callback progress.
- No service directly updates another service's database.

### 5.2 Enquiry lifecycle semantics

The only business lifecycle states are:

`RECEIVED → PROCESSED → RESOLVED`

- Enquiry and outbox committed: `RECEIVED`.
- Email failure or exhausted retries: remains `RECEIVED`.
- Email provider acceptance while callback is pending: remains `RECEIVED`.
- Catalog Service persists successful notification callback: `PROCESSED`.
- Explicit sales action: `RESOLVED`.

Email success alone does not change Catalog Service status. The callback must be successfully persisted by Catalog Service.

### 5.3 Notification recovery

- Record successful email delivery before attempting the Catalog callback.
- If the callback fails, retry the callback without resending the successful email.
- Persist retry state so worker restarts do not lose pending work.
- Use the Circuit Breaker to protect the Catalog HTTP dependency, not as a replacement for durable retry.
- Design for at-least-once message processing and duplicate mitigation. Do not promise exactly-once email delivery.

### 5.4 Public and private communication

- Browser traffic: React → API Gateway → Catalog Service.
- Event delivery: Catalog Outbox Publisher → SQS → Notification Service.
- Status callback: Notification Service → private Catalog Service PATCH API.
- Notification Service has no public customer-facing route.

### 5.5 Local and production parity

- Local: Nginx, Docker Compose, PostgreSQL, ElasticMQ and Mailpit.
- Production target: CloudFront/S3, API Gateway, ECS Fargate, RDS PostgreSQL, SQS/DLQ and SES.
- Local emulators provide functional development/testing parity for selected interfaces, not full managed-service equivalence.

---

## 6. Alternatives Explicitly Rejected or Deferred

| Alternative | Decision | Reason |
|---|---|---|
| BullMQ + Redis | Rejected for initial implementation | SQS is the production target; use the AWS SDK locally against an SQS-compatible emulator. |
| Kafka or RabbitMQ | Rejected | No requirement for their capabilities; adds infrastructure and operational complexity. |
| Separate Enquiry Service | Rejected | Enquiry creation and lifecycle remain part of the current Catalog domain and scope. |
| Notification Service direct database update | Rejected | Violates Catalog Service data ownership. |
| Synchronous email in the customer HTTP request | Rejected | Couples customer response time and availability to the email provider. |
| Direct browser-to-microservice calls | Rejected | Couples frontend to internal topology and bypasses the API Gateway. |
| Browser-to-Fake Store API calls | Rejected | Explicitly prohibited by the assessment. |
| Database-driven email templates | Deferred | Not needed for the initial number of templates; source control is simpler. |
| SNS topic and multiple SQS subscriptions | Deferred | Only one notification consumer is required initially. |
| Full Terraform/AWS deployment | Deferred | Not required for the assessment; local reproducibility and AWS-compatible design take priority. |
| Sales dashboard | Deferred | Not part of the original acceptance criteria. |
| Additional enquiry entity types | Deferred | Initial scope is PRODUCT and CATEGORY only. |

---

## 7. Assumption References

The following assumptions support the decisions above. Their detailed ambiguity, rationale, implementation impact and validation approach remain in `ASSUMPTIONS.md`.

| Assumption IDs | Area |
|---|---|
| ASM-001 to ASM-007 | Featured selection, category presentation, search, product detail and enquiry form behaviour |
| ASM-008 to ASM-013 | Category enquiry, entity validation, asynchronous acknowledgement, email semantics, recipient resolution and templates |
| ASM-014 to ASM-018 | Product source, provider failures, local infrastructure, fixture testing and service database isolation |
| ASM-019 to ASM-023 | SQS type, delivery semantics, outbox publisher, retry settings and callback recovery |
| ASM-024 to ASM-030 | Resolution workflow, API errors, pagination, caching, visual design, customer access and callback authentication |

If an assumption is changed, reassess the decisions that reference it and update affected documents.

---

## 8. Final Decision Summary

The approved design is a deliberately small, AWS-compatible, event-driven application with two business microservices:

- **Catalog Service** owns catalogue capabilities and the complete enquiry business lifecycle.
- **Notification Service** consumes SQS events, sends email and reports success through a private Catalog Service API.

The application uses PostgreSQL for service-owned persistence, the Transactional Outbox Pattern for reliable event publication, AWS SQS for asynchronous processing, a durable notification ledger for recovery, and a Circuit Breaker for Catalog Service callback protection.

The frontend communicates only through the API Gateway. Locally, the complete core workflow runs with Docker Compose, Nginx, PostgreSQL, ElasticMQ and Mailpit. The production target maps to AWS managed services.

The architecture is intentionally limited to what supports the original assessment and the approved future-change boundaries. Additional services, infrastructure and product features must be justified by a concrete requirement rather than added for appearance.

---

## 9. Next Steps: With Another Day and Beyond the Proof of Concept

What was deliberately simplified, and what would come next, in priority order. Each item builds on an existing seam in the code; none needs the service boundaries redesigned.

### 9.1 With another day (highest value first)

1. **Operational alerting.** CloudWatch metric filters and alarms on `callback_status = 'FAILED'`, DLQ `ApproximateNumberOfMessagesVisible > 0`, outbox rows unpublished for more than N minutes, and circuit-breaker OPEN logs. Add a small replay runbook for DLQ messages. *(Today these are log/DB-visible only.)*
2. **Permanent vs transient email errors.** Classify SES/SMTP permanent rejections (for example 5xx SMTP, `MessageRejected`) as non-retryable so they go straight to the DLQ instead of using every SQS receive.
3. **An authenticated `RESOLVED` workflow.** Add an internal sales API behind authentication (Cognito/OIDC) that calls the existing `EnquiryService.resolveEnquiry`, with an audit trail (`resolved_by`, `resolution_notes` already exist).
4. **Continuous delivery.** A GitHub OIDC → AWS role, build and push images to ECR, deploy ECS Fargate services (migrations as a one-off task), sync the SPA to S3, invalidate CloudFront. Infrastructure as code (Terraform or CDK) for the resources in `docs/deployment.md`.
5. **Service-to-service authentication upgrade.** Replace the shared bearer token (ADR-018) with IAM/SigV4 on a private API, or with mTLS through ECS Service Connect, and rotate secrets through Secrets Manager.
6. **Product read cache.** A short-TTL in-process cache, or a cache at the Catalog boundary, for the provider's list and category reads, with stale-on-error to ride out provider outages (ASM-027).

### 9.2 Growing beyond the proof of concept

- **More providers or entity types:** add a `ProductProvider` implementation or an `EnquiryEntityType` and template. The contracts are versioned (`CATALOG_ENQUIRY_SUBMITTED` v1), so v2 events can run alongside v1 consumers.
- **More notification channels** (SMS, CRM): add consumers on an SNS → SQS fan-out from the same outbox event, without changing Catalog.
- **Scale:** both services are stateless apart from PostgreSQL. The outbox publisher and callback worker already use `SKIP LOCKED` leases, so they can run as several ECS tasks; SQS concurrency is configurable.
- **Duplicate-email window (ASM-034):** use the SES idempotency/configuration-set event stream, or a provider-side message deduplication key, to close the remaining crash window.
- **Pagination and search:** add server-side pagination and an indexed search store once the catalogue outgrows a single provider list call.

### 9.3 Requirements simplified or dropped for the time-box

- Delivery and bounce tracking beyond provider acceptance (ASM-011).
- Sales dashboard and authentication (ASM-024, ASM-029).
- Pagination and caching (ASM-026, ASM-027).
- Live AWS deployment: the architecture is AWS-compatible and runs locally on SQS-compatible ElasticMQ and SMTP (ADR-016).

