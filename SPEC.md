# Catalog Platform — Product and Engineering Specification

**Version:** 1.0  
**Status:** Initial implementation baseline  
**Project:** AI-Native Engineer Code Challenge for Catalog Platform 
**Primary source:** `Code Challenge - AI-Native Engineer.pdf`  
**Related instructions:** `CLAUDE.md`  
**Implementation stack:** React, TypeScript, Node.js, Express, PostgreSQL and AWS-compatible messaging

---

## 1. Purpose

This document defines the product requirements, functional behaviour, service boundaries, API expectations, data ownership, event-processing behaviour and verification criteria for the Catalog Platform.

It is the implementation specification for the project. It must be read together with:

- `CLAUDE.md` — engineering rules, implementation governance and workflow.
- `ASSUMPTIONS.md` — the register of ambiguities and assumptions.
- `DECISIONS.md` — architectural decisions, rationale and trade-offs.
- `PLAN.md` — implementation phases and verification gates.

The original assessment is the authority for the hiring exercise's explicit requirements. Additional architecture in this specification represents approved project design choices; it must not be described as an explicit requirement from the assessment unless the assessment says so.

## 2. Product Objective

Build a small, usable web product catalogue that allows customers to:

1. Browse featured products.
2. Browse products by category.
3. Search for products.
4. View product details.
5. Submit an enquiry about a product.

The initial implementation also supports category enquiries as an extension of the same enquiry capability.

The proof of concept must be a foundation that can evolve. In particular, the following are expected to be replaceable without rewriting core business logic:

- Product data provider.
- Email provider.
- Frontend presentation and styling.

The implementation must be small and well-reasoned. It must not become an unnecessarily complex enterprise platform.

## 3. Requirement Classification

Requirements in this document are classified as follows.

### 3.1 Original assessment requirements

These are explicitly required by the supplied assessment:

- React web application with TypeScript preferred, or another listed client option.
- Node.js with TypeScript preferred, or PHP with Laravel, as the backend option.
- Product data must be accessed through the backend; the client must not call Fake Store API directly.
- Any included infrastructure must be compatible with AWS.
- A reviewer must be able to run the application locally in under 10 minutes by following the README.
- No committed secrets.
- No paid services or accounts that the reviewer must create.
- Homepage with five selected featured products.
- Category browsing with top-rated and additional products.
- Text-based product search.
- Product details page.
- Product enquiry form that sends an email to the sales inbox and displays a Thank You message.
- Full source code, including unit, integration and any other relevant tests.
- Feature branch and an open PR into `main`.
- README, decisions/assumptions, AI usage notes and actual time spent.

### 3.2 Approved project design choices

These are additional decisions made for this implementation:

- React + TypeScript frontend.
- Node.js + TypeScript + Express backend.
- Exactly two business microservices: Catalog Service and Notification Service.
- API Gateway as the only frontend-to-backend entry point.
- PostgreSQL for enquiry persistence.
- AWS SQS for asynchronous notification processing.
- ElasticMQ as the local SQS-compatible implementation.
- Transactional Outbox for reliable publication of enquiry events.
- Mailpit for local email capture and Amazon SES as the production email-provider target.
- Separate persistence ownership for Catalog Service and Notification Service.
- Notification Service reports successful notification processing to Catalog Service through an internal HTTP PATCH API.
- Circuit Breaker and durable callback retry for Catalog Service communication.
- Enquiry lifecycle states: `RECEIVED`, `PROCESSED` and `RESOLVED`.

### 3.3 Deferred requirements

The following are not part of the initial assessment implementation unless separately approved:

- Sales dashboard or CRM interface.
- Customer accounts and general customer authentication.
- Shopping cart, checkout, payment or inventory management.
- Enquiries for entity types other than `PRODUCT` and `CATEGORY`.
- Multi-tenancy.
- SNS fan-out or multiple notification consumers.
- Full production AWS provisioning.
- Kubernetes or additional business microservices.

## 4. Technology and Runtime Baseline

| Layer | Local implementation | Production target |
|---|---|---|
| Frontend | React + TypeScript + Vite | Static assets in S3, delivered through CloudFront |
| Public API entry | Nginx reverse proxy | Amazon API Gateway HTTP API |
| Catalog Service | Node.js + TypeScript + Express container | ECS Fargate |
| Notification Service | Node.js + TypeScript worker container | ECS Fargate |
| Catalog persistence | PostgreSQL | Amazon RDS for PostgreSQL |
| Notification persistence | Separate logical PostgreSQL database | Separate RDS database/schema or independently managed persistence |
| Message queue | ElasticMQ | Amazon SQS Standard Queue |
| Failed messages | ElasticMQ queue configured for local retry/dead-letter behaviour where supported | Amazon SQS Dead Letter Queue |
| Email | Mailpit SMTP | Amazon SES |
| Secrets/configuration | `.env` for local development; `.env.example` committed | IAM task roles and AWS Secrets Manager where appropriate |
| Containers | Docker Compose | ECS Fargate |

Use AWS SDK for JavaScript v3 for SQS operations in both local and production environments. Local configuration may specify an ElasticMQ endpoint. Production configuration must use the normal AWS endpoint and IAM task-role credentials.

ElasticMQ is an SQS-compatible local implementation, not the complete AWS SQS service. Document and test the subset of SQS behaviour used by the application. Do not claim that local emulation validates every AWS-managed feature.

## 5. System Architecture and Service Boundaries

There are exactly two business microservices.

### 5.1 Frontend

The React application provides the customer-facing experience. It must call backend APIs only through the API Gateway path exposed to the browser.

The frontend must not:

- Call Fake Store API directly.
- Call Catalog Service by its internal hostname or port.
- Call Notification Service directly.
- Know about SQS, ElasticMQ, PostgreSQL, SES or internal service topology.

Use a single configurable API base path, initially `/api/catalog`.

### 5.2 API Gateway

The API Gateway is the public entry point for frontend API requests.

Responsibilities:

- Route public catalogue and enquiry API paths to Catalog Service.
- Forward relevant request headers and correlation identifiers.
- Apply sensible request and upstream timeouts.
- Return consistent gateway errors for unavailable upstream services.
- Keep Notification Service and its internal callback mechanisms off the public frontend API surface.

Locally, Nginx serves the compiled React application and proxies `/api/*` requests to Catalog Service. In production, CloudFront serves React assets from S3 and routes the API path to Amazon API Gateway. API Gateway routes public business APIs to Catalog Service.

Notification Service is a private worker. It consumes SQS messages and calls Catalog Service over private service-to-service connectivity.

### 5.3 Catalog Service

Catalog Service owns:

- Product catalogue access and normalization.
- Featured product selection.
- Category browsing and ranking.
- Product search.
- Product details.
- Product and category enquiry creation.
- Enquiry persistence and lifecycle state.
- Catalog database migrations and repositories.
- Transactional Outbox records and publishing.
- The internal notification-status callback API.

Catalog Service is the sole authority for enquiry business status.

### 5.4 Notification Service

Notification Service owns:

- SQS consumption.
- Enquiry notification processing.
- Email template selection and rendering.
- Trusted sales-recipient resolution.
- Email provider integration.
- Notification delivery history.
- Email-processing idempotency.
- Catalog callback delivery state and retry.
- Circuit Breaker for its Catalog Service HTTP client.
- Notification database migrations and repositories.

Notification Service must never directly read or modify Catalog Service database tables.

### 5.5 External product provider

Fake Store API is the initial product data source. It must be isolated behind a Catalog Service provider interface. External response models must be validated and mapped into internal product models before being returned by the service.

### 5.6 Dependency direction

- React depends on public API contracts only.
- Catalog Service depends on a product-provider abstraction, its own persistence and its SQS publisher abstraction.
- Notification Service depends on its own persistence, SQS consumer, email-provider abstraction and internal Catalog Service client.
- Notification Service communicates with Catalog Service through an internal HTTP API, not direct database access.
- No business service may use another service's database as an integration mechanism.

## 6. Functional Requirements

### FR-001 — Homepage and featured products

**Classification:** Original assessment requirement  
**Priority:** Critical

The homepage must display five products selected as featured by backend configuration.

The five featured product IDs must not be hardcoded into React components. The Catalog Service is responsible for resolving and returning the configured products.

Each featured product card should display:

- Product image.
- Product title.
- Price.
- Rating, when available.

Selecting a product card must navigate to that product's details page.

**Acceptance criteria**

- Given five products have been selected as featured products.
- When a customer views the homepage.
- Then the five configured featured products are displayed.
- When the customer selects a featured product.
- Then the matching product details page opens.

**Clarification:** The homepage requirement is about five selected featured products. Do not infer that the service must dynamically choose the five highest-rated products unless that is the configured selection rule.

### FR-002 — Category browsing

**Classification:** Original assessment requirement  
**Priority:** Critical

Customers must be able to view available categories and select a category to browse its products.

The category page must contain two sections:

1. Top-rated products in the selected category.
2. Additional products in the selected category.

For the initial implementation, show up to five top-rated products, ordered by rating descending. Use a deterministic tie-breaker, such as product ID ascending. If the category contains fewer than five products, show all available products in the top-rated section and no additional products.

Additional products must exclude every product already displayed in the top-rated section.

**Acceptance criteria**

- Given products are organized into categories.
- When a customer selects a category.
- Then the page displays the top-rated products in that category.
- And it displays additional products in that category.
- And no product is duplicated between the two sections.

### FR-003 — Product search

**Classification:** Original assessment requirement  
**Priority:** Critical

Customers must be able to enter a search term and explicitly submit the search.

Search is performed by Catalog Service, not by direct browser calls to Fake Store API.

The approved searchable fields are:

- Product title.
- Product description.
- Product category.

Matching is case-insensitive and supports partial text matches.

**Acceptance criteria**

- Given a customer enters a search term.
- When the customer submits the search.
- Then only products matching the term in the supported fields are returned.
- Non-matching products are excluded.

The implementation must handle empty input, whitespace-only input and no-result cases consistently. The API contract must define whether an empty query is rejected or treated as an unfiltered catalogue request; the frontend must not accidentally treat an empty submitted search as a successful match-all query.

### FR-004 — Product details

**Classification:** Original assessment requirement  
**Priority:** Critical

Selecting a product tile opens a product details page.

The page must display:

- Product ID.
- Title.
- Description.
- Image.
- Price.
- Category.
- Rating and review count when available.
- An Enquire action.

The service must handle invalid IDs, missing products, provider errors, timeouts and malformed upstream data using appropriate error responses and frontend states.

**Acceptance criteria**

- Given a customer is browsing products.
- When they select a product tile.
- Then the application displays the corresponding product details page.

### FR-005 — Product enquiry

**Classification:** Original assessment requirement  
**Priority:** Critical

A customer viewing a product must be able to select Enquire, provide contact details and submit an enquiry.

Required customer information:

- Name.
- Email address.
- Phone number.

An optional message may be supplied.

The enquiry must reference the product being viewed.

**Acceptance criteria**

- Given a customer is viewing a product.
- And the customer selects Enquire.
- And the customer provides valid contact details.
- When the customer submits the form.
- Then the enquiry is accepted and persisted.
- And the notification workflow is initiated.
- And the customer sees a Thank You message.
- And the sales inbox receives an email through the notification workflow.

The customer confirmation acknowledges that the enquiry has been durably received. It must not claim that email delivery has already completed if notification processing is asynchronous.

### FR-006 — Category enquiry

**Classification:** Approved project extension  
**Priority:** Secondary

The same enquiry capability may be used for a category reference.

Supported entity types are initially:

- `PRODUCT`
- `CATEGORY`

Both use the same enquiry model and event structure. Product enquiry is the critical assessment path; category enquiry must not delay completion of the original product enquiry flow.

No other entity types are included in the initial implementation.

## 7. Enquiry Domain and Lifecycle

### 7.1 Enquiry ownership

Catalog Service owns the enquiry record and is the sole authority for the business lifecycle status.

Notification Service owns email delivery and callback-processing records in its own persistence layer.

### 7.2 Business lifecycle states

The enquiry has exactly three business lifecycle states:

- `RECEIVED`
- `PROCESSED`
- `RESOLVED`

#### RECEIVED

The enquiry has been validated and committed to Catalog Service's database, together with its outbox event.

`RECEIVED` is the initial state.

The enquiry remains `RECEIVED` while:

- The SQS event is waiting to be processed.
- Notification Service is attempting to send the email.
- Email delivery fails.
- Email delivery retries are in progress.
- Email retry attempts are exhausted or the message reaches the DLQ.
- Email has succeeded but the Catalog Service callback has not yet been successfully persisted.

#### PROCESSED

The enquiry transitions to `PROCESSED` only after all of the following have occurred:

1. Notification Service successfully sends the notification through the configured email provider.
2. Notification Service durably records the successful email outcome.
3. Notification Service calls the internal Catalog Service notification-status PATCH API.
4. Catalog Service validates and idempotently persists the transition from `RECEIVED` to `PROCESSED`.
5. Catalog Service confirms the persisted outcome to Notification Service.

For this specification, successful sending means the email provider accepted the send request. It does not guarantee that the message reached the recipient's inbox. Actual delivery/bounce feedback is outside the initial scope.

#### RESOLVED

`RESOLVED` represents an explicit business action by the concerned sales team after the enquiry has been processed.

Email delivery must never automatically mark an enquiry as resolved.

A full sales dashboard and sales-user authentication flow are deferred. The lifecycle operation must nevertheless be modelled and protected from unauthenticated public access.

### 7.3 Allowed state transitions

The normal transitions are:

`RECEIVED → PROCESSED → RESOLVED`

Reject invalid transitions.

A duplicate notification callback must not cause a duplicate transition or change the result of an already processed enquiry.

A callback must never regress a `RESOLVED` enquiry to `PROCESSED`.

### 7.4 Notification delivery state

Notification delivery state is separate from enquiry business state.

It is owned exclusively by Notification Service and persisted in Notification Service's database.

The initial email delivery states are:

- `PENDING`
- `SENT`
- `FAILED`

The callback processing states are:

- `PENDING`
- `COMPLETED`

These states must not be stored as columns in Catalog Service's enquiry record.

### 7.5 Authoritative lifecycle rules

| Situation | Enquiry business status |
|---|---|
| Enquiry and outbox event successfully committed | `RECEIVED` |
| Event published to SQS | `RECEIVED` |
| Notification consumer receives event | `RECEIVED` |
| Email send attempt fails | `RECEIVED` |
| Email retries continue | `RECEIVED` |
| Email retries exhausted / DLQ | `RECEIVED` |
| Email provider accepts email but callback is pending | `RECEIVED` |
| Catalog Service successfully persists notification success callback | `PROCESSED` |
| Sales team explicitly resolves enquiry | `RESOLVED` |

**Non-negotiable rule:** Email failure or retry exhaustion must never transition an enquiry out of `RECEIVED`. Successful email sending alone is not sufficient to transition the status; Catalog Service must successfully persist the callback first.

## 8. Public and Internal API Requirements

The detailed machine-readable API contract should be maintained in `docs/openapi.yaml`. The following routes define the initial API surface.

### 8.1 Public catalogue APIs

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/catalog/products/featured` | Return the five configured featured products |
| `GET` | `/api/catalog/products` | List products and support search parameters |
| `GET` | `/api/catalog/products/:productId` | Return one product |
| `GET` | `/api/catalog/categories` | Return available categories |
| `GET` | `/api/catalog/categories/:categoryId/products` | Return top-rated and additional products for a category |
| `POST` | `/api/catalog/enquiries` | Create a product or category enquiry |

The exact response DTOs, query parameter names, validation rules and error schema must be captured in `docs/api-contracts.md` and `docs/openapi.yaml` before or alongside implementation.

### 8.2 Enquiry creation response

The enquiry API returns `202 Accepted` after the enquiry and outbox event have been committed successfully.

Example response:

```json
{
  "enquiryId": "<uuid>",
  "status": "RECEIVED",
  "message": "Your enquiry has been received."
}
```

Do not return success if the database transaction fails.

Do not wait for email delivery before returning the initial customer response.

### 8.3 Internal notification-status callback

Notification Service reports successful email processing using:

`PATCH /internal/catalog/enquiries/:enquiryId/notification-status`

Example request:

```json
{
  "eventId": "<event-id>",
  "notificationStatus": "SENT",
  "providerMessageId": "<provider-message-id>",
  "processedAt": "<ISO-8601-timestamp>"
}
```

Catalog Service must:

1. Authenticate the internal caller.
2. Validate the request and event identity.
3. Verify that the enquiry exists.
4. Apply the valid `RECEIVED → PROCESSED` transition atomically.
5. Record the callback event ID for idempotency.
6. Return a response confirming the persisted state.

The callback must be idempotent. A repeat callback for the same event must not produce an incorrect transition.

If the enquiry is already `RESOLVED`, a stale callback must not change its state. Return a response that allows the caller to distinguish a safely handled duplicate/stale event from a transient failure.

This internal endpoint must not be exposed as a public frontend route through API Gateway.

### 8.4 Error behaviour

Use appropriate HTTP status codes and a consistent error body.

At minimum, distinguish:

- Invalid request: `400` or `422`, consistently documented.
- Resource not found: `404`.
- Upstream provider failure: appropriate `502` or `504`.
- Temporary internal dependency unavailability: appropriate `503` or another documented retryable response.
- Unexpected internal failure: `500` without leaking stack traces.

Do not convert upstream failures into successful empty results unless explicitly justified by the product requirement.

## 9. Data and Persistence Requirements

Each service owns its data and schema. A single local PostgreSQL container may host two separate logical databases for convenience, but each service must use separate credentials and migrations.

### 9.1 Catalog Service database

Catalog Service owns at least the following logical tables.

#### `catalog_enquiries`

Suggested fields:

- `id` — UUID primary key.
- `entity_type` — `PRODUCT` or `CATEGORY`.
- `entity_id` — identifier of the referenced product or category.
- `entity_snapshot` — JSONB snapshot of relevant entity information at submission time.
- `customer_name`.
- `customer_email`.
- `customer_phone`.
- `message` — nullable.
- `status` — only `RECEIVED`, `PROCESSED` or `RESOLVED`.
- `received_at`.
- `processed_at` — nullable.
- `resolved_at` — nullable.
- `resolved_by` — nullable.
- `resolution_notes` — nullable.
- `created_at`.
- `updated_at`.

Do not add email-delivery or callback-retry statuses to this table.

#### `outbox_events`

Suggested fields:

- `id` — unique event ID.
- `aggregate_type`.
- `aggregate_id` — enquiry ID.
- `event_type`.
- `event_version`.
- `payload` — JSONB.
- `created_at`.
- `published_at` — nullable.
- Publication attempt/claim metadata as required by the implementation.

#### `processed_events`

Use this or an equivalent durable mechanism to record callback event IDs already applied by Catalog Service.

### 9.2 Notification Service database

Notification Service owns a `notification_deliveries` table or equivalent durable model.

Suggested fields:

- `id`.
- `event_id` — unique for consumer idempotency.
- `enquiry_id`.
- `email_status` — `PENDING`, `SENT` or `FAILED`.
- `callback_status` — `PENDING` or `COMPLETED`.
- `provider_message_id` — nullable until available.
- `attempt_count`.
- `callback_attempt_count`.
- `next_retry_at` — nullable.
- `last_error` — nullable and sanitized.
- `created_at`.
- `updated_at`.

The model may be refined during implementation, but it must preserve the separation between email delivery and callback delivery.

### 9.3 Data ownership rules

- Catalog Service is the only writer of Catalog Service enquiry records.
- Notification Service is the only writer of Notification Service delivery records.
- Notification Service must not access Catalog Service tables.
- Catalog Service must not depend on Notification Service's internal schema.
- Do not use cross-service database joins.
- Do not log full customer or notification payloads unnecessarily.

### 9.4 Database migrations

Commit migrations to the repository.

Use separate migration paths and credentials for each service.

Do not rely on production application startup to create or mutate schemas implicitly.

## 10. Event Contract and SQS Requirements

### 10.1 Main event

Event name:

`CATALOG_ENQUIRY_SUBMITTED`

The event must be versioned and contain:

- `eventId`.
- `eventType`.
- `eventVersion`.
- `occurredAt`.
- `correlationId` where available.
- `data.enquiryId`.
- `data.entity.type`.
- `data.entity.id`.
- `data.entity.name` or a suitable snapshot.
- Customer contact details required for the sales notification.
- Optional customer message.

Use a TypeScript contract and runtime validation. Do not publish arbitrary unvalidated JSON.

The event should contain only the information required by the Notification Service. Protect message data and avoid logging personal information.

### 10.2 Transactional Outbox

Enquiry creation must persist the enquiry and the corresponding outbox event in a single PostgreSQL transaction.

Both records must commit together or roll back together.

A background publisher must:

1. Claim committed, unpublished outbox records safely.
2. Publish the event using AWS SDK v3 `SendMessage` to the configured SQS queue.
3. Mark the record published only after SQS confirms acceptance.
4. Release or recover claimed records after process failure.

The implementation must account for a crash after SQS accepts the message but before the outbox row is marked published. Duplicate publication is possible and must be handled by consumer idempotency.

Protect multiple publisher instances from unsafe concurrent claiming. Use an appropriate PostgreSQL locking/claiming strategy, such as `FOR UPDATE SKIP LOCKED`, when applicable.

### 10.3 SQS consumer

Notification Service consumes messages using AWS SDK v3 receive operations and long polling.

Use:

- A bounded receive batch size.
- Bounded concurrency.
- A visibility timeout longer than normal processing time, with extension/heartbeat handling if long processing is possible.
- A configured maximum receive count and DLQ redrive policy in production.
- Graceful shutdown.
- Message validation before processing.

SQS Standard Queues provide at-least-once delivery. The consumer must be idempotent.

Do not claim exactly-once delivery.

### 10.4 Local and production queue configuration

Local development uses ElasticMQ and AWS SDK v3 with a custom endpoint.

Production uses Amazon SQS Standard Queue and a corresponding DLQ.

Do not use BullMQ or Redis.

The queue URL and region must be configurable through environment variables. In production, use IAM task roles rather than static credentials.

## 11. Notification Processing and Callback Workflow

### 11.1 Notification processing sequence

Notification Service must:

1. Receive the SQS message.
2. Validate the event contract.
3. Check the notification delivery ledger using the event ID.
4. Avoid repeating an email send that has already been recorded as successful.
5. Resolve the sales recipient using trusted server-side configuration.
6. Select the relevant PRODUCT or CATEGORY email template.
7. Send the email through the configured provider.
8. Persist the successful provider outcome and provider message ID.
9. Persist the Catalog callback as pending.
10. Call Catalog Service's internal notification-status PATCH API.
11. On successful callback confirmation, persist callback completion.
12. Acknowledge the original SQS message only after the email outcome and callback outcome or durable callback-retry state have been persisted.

### 11.2 Email failure

If an email send attempt fails:

- Record the failed attempt in Notification Service's delivery ledger.
- Do not call the successful notification callback.
- Do not change Catalog Service enquiry status.
- The enquiry remains `RECEIVED`.
- Allow SQS retry according to the configured retry policy.
- If attempts are exhausted, route the message to the configured DLQ.
- The enquiry remains `RECEIVED` until a successful notification is eventually reported and persisted.

A DLQ message must remain inspectable and have a documented recovery/redrive approach. Do not silently discard failed enquiries or imply that they were processed.

### 11.3 Successful email, failed Catalog callback

If the email provider accepts the email but Catalog Service is unavailable or the PATCH request fails:

- Persist `email_status = SENT`.
- Preserve the provider message ID.
- Persist `callback_status = PENDING`.
- Do not send the email again solely because the callback failed.
- Retry the Catalog callback independently.
- Keep the enquiry `RECEIVED` until Catalog Service confirms that it has persisted `PROCESSED`.

A durable callback retry mechanism is required. An in-memory timer or retry loop alone is not sufficient.

The callback retry mechanism must recover after Notification Service restarts. It may use a database-backed retry worker or another explicitly documented durable mechanism. Do not introduce an additional broker or service without justification.

The original SQS message may be acknowledged once the successful email outcome and pending callback retry state are durably recorded. Callback processing must then continue independently until completion or an explicitly monitored terminal-failure state.

### 11.4 Idempotency and duplicate delivery

A duplicate SQS event must not cause an unnecessary duplicate email when a successful send has already been recorded.

Use a unique event ID and durable notification delivery record.

The callback must also be idempotent. Catalog Service must record processed callback event IDs or use an equivalent atomic mechanism.

Exactly-once email delivery cannot be guaranteed solely through SQS and a database transaction. Design for at-least-once processing and duplicate mitigation. Document the remaining provider/network ambiguity, including the possibility that a provider accepts a send immediately before the Notification Service crashes before recording that outcome.

## 12. Circuit Breaker and Retry Requirements

Implement a Circuit Breaker around the Notification Service HTTP client that calls Catalog Service.

The Circuit Breaker must implement:

- `CLOSED` — calls are permitted and outcomes are measured.
- `OPEN` — calls fail fast without contacting Catalog Service.
- `HALF_OPEN` — a limited probe is allowed to test recovery.

Initial configurable values:

| Setting | Initial value |
|---|---:|
| Failure threshold | 5 consecutive qualifying failures |
| Open duration | 30 seconds |
| Half-open probes | 1 |
| HTTP timeout | 3 seconds |

These are starting values and must be configurable.

Count network errors, timeouts and relevant 5xx responses as failures. Do not count ordinary business responses such as 400 or 404 as Circuit Breaker failures.

When the Circuit Breaker is OPEN:

- Do not continue calling Catalog Service.
- Keep the callback durably pending.
- Schedule or retain a future retry.
- Do not resend the already successful email.

Test CLOSED, OPEN and HALF_OPEN behaviour, including recovery.

Use exponential backoff with jitter for retry scheduling. Avoid unbounded immediate retries and retry storms.

## 13. Email Templates and Provider Abstraction

### 13.1 Templates

Email templates must live in Notification Service source code and be version-controlled.

Provide separate templates for:

- PRODUCT enquiry.
- CATEGORY enquiry.

Each template must support HTML and plain-text content.

Template rendering must:

- Use typed input contracts.
- Escape customer-provided content before including it in HTML.
- Keep rendering separate from email transport.
- Be unit tested.

Do not introduce a database-driven template management system or administrative template editor for the initial implementation.

### 13.2 Email provider interface

Define an email-provider abstraction.

Local implementation:

- Mailpit SMTP provider.

Production implementation:

- Amazon SES provider.

Both must satisfy the same application-level provider contract.

The notification domain must not depend on provider-specific implementation details.

A successful send status means the provider accepted the send request. It does not prove inbox delivery. Actual SES delivery/bounce event integration is deferred.

### 13.3 Recipient resolution

Resolve sales recipients through trusted server-side configuration.

The frontend must not choose an arbitrary sales recipient.

The initial implementation may use a configured sales inbox. If PRODUCT and CATEGORY enquiries require different sales inboxes, use a server-side mapping by enquiry type. Record the chosen assumption in `ASSUMPTIONS.md`.

## 14. Frontend Experience Requirements

The frontend must provide:

- Responsive catalogue pages.
- Clear category navigation.
- Product search with explicit submission.
- Product detail view.
- Enquiry form on the product page.
- Optional category enquiry entry point if implemented without delaying the original flow.
- Form-level validation and useful error messages.
- Loading and empty states.
- A Thank You state after the enquiry has been accepted and durably persisted by Catalog Service.

The Thank You state must not imply that sales has already received or resolved the enquiry. It means the platform has received the enquiry.

The design should be clean, usable and easy to restyle. Do not spend disproportionate time on animations or visual effects.

## 15. Security Requirements

Implement security basics appropriate to a public catalogue and enquiry workflow:

- Validate all public and internal API inputs.
- Validate and normalize external provider responses.
- Use parameterized SQL queries.
- Apply request body size limits.
- Configure restrictive CORS where cross-origin access is used.
- Apply security headers.
- Rate-limit public enquiry submission.
- Protect internal service endpoints with private networking and service-to-service authentication.
- Do not expose databases, SQS endpoints or internal worker endpoints publicly.
- Do not trust customer-supplied sales recipient addresses.
- Do not commit secrets or credentials.
- Use `.env.example` containing placeholders only.
- Use IAM task roles in AWS rather than static credentials.
- Avoid logging unnecessary customer personal information.
- Never return stack traces or internal secrets in public API errors.

## 16. Observability and Operational Behaviour

Use structured logs in both services.

Propagate a correlation ID through:

- API Gateway request.
- Catalog Service request.
- Outbox event.
- SQS message.
- Notification processing.
- Catalog callback.

Useful identifiers include:

- `correlationId`.
- `enquiryId`.
- `eventId`.
- `notificationId`.

Do not log complete enquiry or email payloads containing customer personal information.

Provide service health/readiness endpoints suitable for local orchestration and future ECS health checks.

Distinguish liveness from readiness where necessary. A service should not report readiness when required dependencies are unavailable, but health checks must not create cascading failures or excessive load.

## 17. Local Development and Reviewer Experience

The entire core business workflow must run locally without an AWS account, AWS credentials, paid services or an external email account.

Local services:

- React frontend.
- Nginx gateway/static server.
- Catalog Service.
- Notification Service.
- PostgreSQL.
- ElasticMQ.
- Mailpit.

Target reviewer flow:

```bash
cp .env.example .env
docker compose up --build
```

The README must explain any required prerequisite such as Docker and pnpm if local development outside containers is supported. The reviewer must be able to complete setup in under 10 minutes from a clean checkout.

Provide:

- Health checks.
- Database initialization and migrations.
- Queue initialization.
- Dependency readiness handling.
- Graceful shutdown.
- Useful container logs.
- A clear URL for the frontend.
- A clear URL for the Mailpit UI.

Do not assume Docker Compose `depends_on` alone means a dependency is ready.

The default product provider may use Fake Store API. Provide a fixture-backed provider for deterministic automated tests and optional offline local verification where practical. All product data used by the browser must still pass through Catalog Service.

## 18. AWS Production Compatibility

The target production architecture is:

| Capability | AWS target |
|---|---|
| Static frontend assets | Amazon S3 |
| Frontend distribution | Amazon CloudFront |
| Public API entry | Amazon API Gateway HTTP API |
| Backend container execution | Amazon ECS Fargate |
| Container images | Amazon ECR |
| Catalog persistence | Amazon RDS for PostgreSQL |
| Notification persistence | PostgreSQL persistence with separate service ownership |
| Asynchronous messaging | Amazon SQS Standard Queue |
| Failed message handling | Amazon SQS DLQ |
| Email | Amazon SES |
| Secrets | AWS Secrets Manager |
| Service permissions | IAM task roles |
| Logs and metrics | Amazon CloudWatch |

CloudFront serves frontend assets from S3 and routes the API path to API Gateway. API Gateway routes public business requests to Catalog Service. Notification Service consumes SQS messages and reaches Catalog Service through private service-to-service connectivity for the internal callback.

Full production AWS provisioning is not required for the initial assessment. Document the production topology and the local-to-AWS service mapping accurately. Do not claim local emulation proves all AWS service behaviour.

Any infrastructure included must be compatible with AWS, as required by the assessment.

## 19. Testing and Verification Requirements

Tests must provide confidence in the critical customer journey and the important failure paths. Write tests alongside features.

### 19.1 Catalog Service tests

Test at least:

- Five configured featured products are returned.
- Product adapter maps and validates external data.
- Category filtering is correct.
- Top-rated products are correctly ordered.
- Additional products exclude top-rated products.
- Search returns matching products only.
- Product details return the correct product.
- Missing/invalid products are handled correctly.
- Provider timeout/failure is handled correctly.
- Valid enquiry is persisted.
- Invalid enquiry is rejected.
- Enquiry and outbox event commit or roll back together.
- Outbox publisher recovers unpublished events.
- Duplicate callback event is idempotent.
- Only valid enquiry lifecycle transitions are accepted.
- Email failure does not alter enquiry status.
- Successful callback moves `RECEIVED` to `PROCESSED`.
- A stale callback does not regress `RESOLVED`.

### 19.2 Notification Service tests

Test at least:

- SQS event validation.
- Successful email delivery.
- Email template selection for PRODUCT and CATEGORY.
- HTML escaping and plain-text output.
- Email provider failure and retry behaviour.
- Duplicate SQS delivery and idempotency.
- Delivery ledger persistence.
- Successful Catalog PATCH callback.
- Catalog PATCH failure after email success.
- Callback retry without resending email.
- Recovery of pending callbacks after process restart.
- Circuit Breaker CLOSED, OPEN and HALF_OPEN states.
- SQS acknowledgement only after required durable state is recorded.
- DLQ/redrive behaviour or the supported local equivalent.

### 19.3 Frontend tests

Test at least:

- Homepage rendering and featured products.
- Category navigation.
- Category product sections.
- Search submission and results.
- Product details.
- Enquiry form validation.
- Customer Thank You state after accepted enquiry.
- Error handling for rejected/failed submissions.

### 19.4 End-to-end acceptance test

At least one complete local integration/E2E test must demonstrate:

1. Customer opens the catalogue.
2. Customer selects a product.
3. Customer submits a valid enquiry.
4. Catalog Service persists the enquiry as `RECEIVED` and writes its outbox event atomically.
5. The publisher sends the event to ElasticMQ using the AWS SDK.
6. Notification Service consumes the event.
7. Notification Service sends the email through Mailpit.
8. Notification Service records successful email processing.
9. Notification Service calls the internal Catalog PATCH API.
10. Catalog Service persists `PROCESSED`.
11. Notification Service records callback completion and acknowledges the original SQS message.
12. Mailpit contains the expected sales email.

Also verify a failure scenario in which email sending fails and the enquiry remains `RECEIVED`.

Tests must be deterministic and must not depend on paid services or live email delivery.

## 20. Quality and Implementation Standards

- Enable TypeScript strict mode.
- Avoid `any`; use explicit types and safe narrowing.
- Keep controllers thin.
- Put business rules in services/domain modules.
- Keep database access behind repositories or data-access modules.
- Validate data at application boundaries.
- Keep provider-specific models inside adapters.
- Keep event contracts versioned and runtime-validated.
- Avoid circular dependencies.
- Avoid swallowing exceptions.
- Use meaningful HTTP status codes.
- Do not convert dependency failures into misleading empty success responses.
- Use dependency injection where it improves testability without adding unnecessary complexity.
- Keep functions and modules focused.
- Do not introduce patterns without a concrete problem they solve.

## 21. Assessment Submission Requirements

The final submission must follow the original assessment instructions.

### Repository

- Host the complete source in GitHub, GitLab or Bitbucket.
- Include the full source code and tests.
- For a private repository, grant access to the reviewers named in the assessment email.

### Branch and Pull Request

- Work on a feature branch.
- Create a Pull Request into `main` in the candidate's repository.
- Leave the PR open and unmerged.
- Treat the PR description as part of the assessment submission.

### Required documentation

- `README.md` — setup, run instructions and reviewer configuration.
- `DECISIONS.md` — assumptions, simplifications, extensibility and next steps.
- `AI_USAGE.md` — tools/models, agent instruction files, plan/spec, 3–5 key prompts or moments, AI mistakes and how they were caught.
- `ASSUMPTIONS.md` — detailed assumption register as the approved project convention.
- `CLAUDE.md` — engineering instructions.
- `SPEC.md` — this specification.
- `TIME_SPENT.md` or equivalent — actual time split across planning, building, testing and reviewing.

The actual time spent must be recorded honestly. Do not fabricate tool usage, prompts, mistakes, test results or review outcomes.

## 22. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Maintainability | Clear service and module responsibilities |
| Extensibility | Replaceable product and email providers |
| Reliability | Durable event publication and recoverable notification processing |
| Performance | Bounded request timeouts and bounded worker concurrency |
| Type safety | TypeScript strict mode |
| Security | Validation, private service connectivity and secret management |
| Local execution | Full core workflow runnable through Docker Compose |
| AWS compatibility | Production mapping to the approved AWS services |
| Observability | Correlation IDs and structured logs |
| Testing | Automated critical-path and key failure-path coverage |
| Documentation | Clear requirements, assumptions, decisions and reviewer instructions |

No production-scale throughput target or availability SLA is specified by the assessment. Do not invent one.

## 23. Out of Scope

Do not implement these capabilities in the initial assessment unless separately approved:

- Shopping cart.
- Checkout or payment processing.
- Inventory management.
- General customer accounts or authentication.
- Sales administration dashboard.
- CRM integrations.
- Additional business microservices.
- Multi-tenant architecture.
- Enquiry entity types other than PRODUCT and CATEGORY.
- SNS fan-out or additional independent message consumers.
- Kafka, RabbitMQ, BullMQ or Redis.
- Kubernetes or EKS.
- Full production AWS deployment and provisioning.
- Advanced analytics.

The `RESOLVED` state must be represented in the enquiry domain and its transition rules. A complete sales-management UI and authentication workflow are deferred.

## 24. Implementation Priorities and Scope Control

The original assessment explicitly values a small, well-reasoned solution and gives a 2–3-hour target time-box. The approved architecture adds meaningful reliability capabilities, but implementation must still prioritize the original customer-facing requirements.

Priority order:

1. Make the five original acceptance criteria demonstrable.
2. Establish the approved Catalog and Notification service boundaries.
3. Implement enquiry persistence and the Transactional Outbox.
4. Implement local SQS-compatible asynchronous email processing.
5. Implement the successful notification callback and correct enquiry lifecycle.
6. Verify critical failure behaviour, including email failure and callback unavailability.
7. Complete critical-path tests.
8. Complete reviewer documentation and the open PR.

Do not add optional infrastructure, dashboards or unrelated features at the expense of the required customer journey. If a requirement is simplified or deferred to respect the time-box, record what was changed and why in `DECISIONS.md` and the final PR description.

## 25. Specification Authority and Change Control

This document is the primary functional and technical specification for implementation.

- `CLAUDE.md` defines engineering behaviour, guardrails and Git/review workflow.
- `ASSUMPTIONS.md` records ambiguities and assumptions.
- `DECISIONS.md` records engineering decisions and trade-offs.
- `PLAN.md` defines implementation phases and verification gates.
- `docs/api-contracts.md`, `docs/event-contracts.md`, `docs/data-model.md` and related technical documents provide detailed contracts and designs.

If documents conflict:

1. Preserve explicit requirements from the original assessment.
2. Preserve approved project architecture where it does not contradict the assessment.
3. Identify and document the conflict rather than silently choosing an interpretation.
4. Record the resolution in `ASSUMPTIONS.md` or `DECISIONS.md` as appropriate.
5. Update all affected documents so they remain consistent.

Changes to this specification must be deliberate and traceable. Do not silently expand scope.

---

## 26. Final Acceptance Summary

The project is functionally acceptable when all five original assessment scenarios are demonstrable:

1. Homepage displays the five configured featured products.
2. Category page displays top-rated and additional products for the selected category.
3. Search displays only matching products.
4. Selecting a product opens its details page.
5. A customer can submit a product enquiry, the platform displays a Thank You confirmation after durable acceptance, and the notification workflow sends an email to the sales inbox.

The approved engineering implementation is complete when, in addition:

- Catalog Service and Notification Service have clear ownership boundaries.
- The complete workflow is executable locally.
- Enquiry and outbox persistence are atomic.
- SQS-compatible publication and consumption work locally.
- Notification delivery and callback recovery are durable.
- `PROCESSED` is only persisted after successful email sending and successful Catalog callback persistence.
- Email failure leaves the enquiry `RECEIVED`.
- `RESOLVED` is only reached through an explicit sales business action.
- Critical tests pass.
- The README enables a reviewer to run the application in under 10 minutes.
- The required documentation is present.
- The feature branch and open PR are prepared and reviewed according to `CLAUDE.md`.

**The objective is a small, complete, defensible and AWS-compatible product foundation—not an unnecessarily complex enterprise platform.**
