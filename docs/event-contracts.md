# Catalog Platform — Event Contracts

**Version:** 1.0  
**Status:** Approved implementation baseline; verify against the implemented publisher and consumer  
**Project:** AI-Native Engineer Code Challenge for Catalog Platform
**Primary event:** `CATALOG_ENQUIRY_SUBMITTED`  
**Transport:** Amazon SQS Standard Queue (production); ElasticMQ (local)  
**Related documents:** `CLAUDE.md`, `SPEC.md`, `ASSUMPTIONS.md`, `DECISIONS.md`, `PLAN.md`, `docs/api-contracts.md`

---

## 1. Purpose and Scope

This document defines the asynchronous event contract between Catalog Service and Notification Service.

The initial implementation publishes one business event: `CATALOG_ENQUIRY_SUBMITTED`. It represents a product or category enquiry that has been validated and durably accepted by Catalog Service.

The event is delivered through an SQS-compatible queue. It initiates the Notification Service workflow that sends an email to the configured sales inbox and reports successful provider acceptance back to Catalog Service.

This document covers the event envelope and versioning, payload validation, Transactional Outbox publication, SQS delivery and acknowledgement, consumer idempotency, email failure and callback recovery, DLQ handling, correlation and privacy.

It does not define a second notification event, a public event API, or a new business microservice.

## 2. Ownership and Boundaries

### 2.1 Catalog Service owns

- Creation and persistence of the enquiry.
- The initial `RECEIVED` business status.
- Creation of the Outbox event in the same database transaction as the enquiry.
- Serialization and publication of the event to SQS.
- The authoritative enquiry lifecycle: `RECEIVED → PROCESSED → RESOLVED`.
- The private notification-status callback API and idempotent status transition.

### 2.2 Notification Service owns

- Consumption and validation of the event.
- Idempotent notification processing.
- Sales recipient resolution from trusted server-side configuration.
- Email template selection and rendering.
- Email provider interaction.
- Its own notification delivery ledger.
- Durable callback retry state and Circuit Breaker behaviour.

### 2.3 Non-negotiable boundaries

- Notification Service must not read or write Catalog Service database tables.
- Catalog Service must not depend on Notification Service's internal database schema.
- Notification Service reports successful email processing through the private Catalog Service callback defined in `docs/api-contracts.md`.
- Only Catalog Service may persist changes to enquiry business status.
- Email delivery status and callback retry status belong to Notification Service, not the Catalog Service enquiry record.
- The browser does not publish or consume this event.

---

## 3. Event Envelope

### 3.1 Event name and version

| Field | Value |
|---|---|
| `eventType` | `CATALOG_ENQUIRY_SUBMITTED` |
| `eventVersion` | `1` |
| Producer | Catalog Service Outbox publisher |
| Consumer | Notification Service |
| Delivery transport | SQS Standard Queue |

`eventVersion` is an integer identifying the payload schema version. The first implementation uses version `1`.

### 3.2 Required envelope fields

| Field | Type | Required | Description |
|---|---|---:|---|
| `eventId` | UUID string | Yes | Stable unique identifier for this event. Used for consumer idempotency and callback deduplication. |
| `eventType` | string literal | Yes | Must be `CATALOG_ENQUIRY_SUBMITTED`. |
| `eventVersion` | integer | Yes | Must be `1` for this contract. |
| `occurredAt` | ISO 8601 timestamp | Yes | UTC timestamp representing when the enquiry and Outbox event were created. |
| `correlationId` | string | No | Request correlation identifier, propagated when available. |
| `data` | object | Yes | Event-specific payload described below. |

### 3.3 Event payload fields

| Field | Type | Required | Description |
|---|---|---:|---|
| `data.enquiryId` | UUID string | Yes | Catalog Service enquiry identifier. |
| `data.entity.type` | enum | Yes | `PRODUCT` or `CATEGORY`. |
| `data.entity.id` | string | Yes | Identifier of the referenced product or category. |
| `data.entity.name` | string | Yes | Product title or category name captured when the enquiry was accepted. |
| `data.customer.name` | string | Yes | Customer name required by the sales notification. |
| `data.customer.email` | string | Yes | Customer email address. |
| `data.customer.phone` | string | Yes | Customer phone number. |
| `data.message` | string | No | Optional customer-provided message. Omit when no message was supplied. |

The event must contain only the data Notification Service needs to create the sales notification and call back Catalog Service. Do not include unrelated catalogue data, database fields, credentials, or provider configuration.

### 3.4 Canonical JSON example

```json
{
  "eventId": "f0a1f47a-29ad-4b2e-91d9-7f2f8d3a6e11",
  "eventType": "CATALOG_ENQUIRY_SUBMITTED",
  "eventVersion": 1,
  "occurredAt": "2026-11-22T10:15:30.000Z",
  "correlationId": "req-01JEXAMPLE",
  "data": {
    "enquiryId": "c4c4315c-9a52-4a9c-a45e-9df7f8b4f2d1",
    "entity": {
      "type": "PRODUCT",
      "id": "101",
      "name": "Example product"
    },
    "customer": {
      "name": "Jane Doe",
      "email": "jane@example.com",
      "phone": "+919876543210"
    },
    "message": "Please share more details."
  }
}
```

All identifiers and customer details above are illustrative. `correlationId` may be omitted when no correlation ID is available. The optional `message` field should be omitted rather than set to `null` when no customer message was provided.

### 3.5 Product and category examples

For a product enquiry, `entity.type` is `PRODUCT`, `entity.id` is the normalized product identifier as a string, and `entity.name` is the product title snapshot.

For a category enquiry, `entity.type` is `CATEGORY`, `entity.id` is the canonical category identifier, and `entity.name` is the category name snapshot.

Both types use the same event envelope and customer structure. Do not create separate event types or separate notification pipelines for product and category enquiries in the initial scope.

---

## 4. Validation Requirements

Catalog Service must validate the complete event before persisting it to the Outbox. Notification Service must independently validate every received message before processing it.

### 4.1 Envelope validation

- `eventId` must be a valid UUID and unique for the event creation operation.
- `eventType` must exactly match `CATALOG_ENQUIRY_SUBMITTED`.
- `eventVersion` must be the supported integer version `1`.
- `occurredAt` must be a valid ISO 8601 timestamp with timezone information; UTC is preferred.
- `correlationId`, when present, must be a bounded, non-empty string suitable for log correlation.
- `data` must be an object with the required fields.

### 4.2 Payload validation

- `enquiryId` must be a valid UUID.
- `entity.type` must be `PRODUCT` or `CATEGORY`.
- `entity.id` and `entity.name` must be non-empty strings after trimming.
- `customer.name` and `customer.phone` must be non-empty strings after trimming.
- `customer.email` must pass email-format validation.
- `message`, when present, must satisfy the same maximum length configured by the enquiry HTTP API.
- Unknown entity types must be rejected; they must not be guessed or silently coerced.
- The event must not contain a customer-selected sales recipient or template identifier.

Use one shared, version-controlled TypeScript event contract and runtime validation at producer and consumer boundaries. Do not publish arbitrary unvalidated JSON. Keep the implementation's field limits and validation rules synchronized with `docs/api-contracts.md` and `docs/openapi.yaml`.

### 4.3 Invalid or unsupported messages

A malformed event, unsupported event type or unsupported version must not be processed as a valid enquiry. Record a safe diagnostic and allow the queue's configured retry/redrive policy to move repeatedly failing messages to the DLQ. Do not silently delete poison messages or log their full customer payload.

---

## 5. Transactional Outbox Contract

### 5.1 Atomic creation

When Catalog Service accepts an enquiry, it must persist the following in a single PostgreSQL transaction:

1. The enquiry record with business status `RECEIVED`.
2. The corresponding Outbox record containing the complete, validated event envelope.

Both records must commit together or roll back together. Catalog Service must not return `202 Accepted` unless this transaction commits successfully.

The initial customer response confirms durable receipt of the enquiry. It does not mean the event has already been published or that the sales email has been sent.

### 5.2 Outbox record responsibilities

The Outbox record should preserve enough information to publish and recover the event reliably. At minimum, track:

- Event ID.
- Aggregate type and aggregate/enquiry ID.
- Event type and version.
- Serialized event payload.
- Creation timestamp.
- Publication timestamp, nullable until SQS accepts the message.
- Claim/lease metadata needed to coordinate concurrent publishers and recover abandoned claims.
- Publication attempt metadata and last publication error where useful.

The physical column names and exact schema belong in the database design/migration. This event contract does not mandate a specific Outbox table column naming convention.

### 5.3 Publisher behaviour

The Catalog Service Outbox publisher must:

1. Select committed, unpublished records.
2. Claim records safely so concurrent publisher instances do not process the same active claim unnecessarily.
3. Use AWS SDK for JavaScript v3 `SendMessage` to publish the serialized event to the configured SQS queue.
4. Mark the Outbox record as published only after SQS confirms acceptance.
5. Release or recover an abandoned claim when the publisher fails or restarts.
6. Use bounded polling and avoid uncontrolled tight retry loops.

Use an appropriate PostgreSQL claim strategy, such as `FOR UPDATE SKIP LOCKED`, where applicable.

### 5.4 Duplicate publication window

A publisher can crash after SQS accepts a message but before the Outbox record is marked as published. On recovery, the publisher may publish the same event again.

This is an expected failure window. It must be handled by Notification Service idempotency using the stable `eventId`. Do not claim that the Outbox plus SQS provides exactly-once delivery.

---

## 6. SQS Transport Contract

### 6.1 Queue type and compatibility

- Production queue: Amazon SQS Standard Queue.
- Local queue: ElasticMQ, accessed through AWS SDK for JavaScript v3 with a configurable custom endpoint.
- Production dead-letter queue: Amazon SQS DLQ associated with the source queue through a redrive policy.
- Queue URL and AWS region must be supplied through environment configuration.
- In AWS, use IAM task roles rather than static access keys.
- Do not use BullMQ, Redis, Kafka or RabbitMQ for this event flow.

SQS Standard Queue provides at-least-once delivery and does not guarantee ordering. The consumer must tolerate duplicate and out-of-order delivery. Strict ordering is not a requirement for this event.

ElasticMQ is a local SQS-compatible implementation, not a complete emulation of all AWS SQS behaviour. Verify the subset used by the application and document any local/production differences.

### 6.2 Message body

The SQS message body is the serialized JSON event envelope defined in Section 3. The event body is the source of truth for event identity, type, version and payload.

SQS message attributes may be added for operational filtering or diagnostics only when useful. They must not replace fields in the event envelope or become a second conflicting source of truth.

### 6.3 Consumer receive behaviour

Notification Service must:

- Receive messages using AWS SDK v3 long polling.
- Use a bounded receive batch size.
- Use bounded processing concurrency.
- Use a visibility timeout longer than normal processing time.
- Extend visibility when processing may exceed the configured timeout, where required by the implementation.
- Validate the message before any business processing.
- Handle graceful shutdown without acknowledging work whose durable outcome has not been recorded.
- Delete/acknowledge a message only after the applicable processing outcome and recovery state are durable.

The exact batch size, wait time, visibility timeout and maximum receive count are runtime configuration. Do not hardcode undocumented assumptions or claim they are universal production values.

---

## 7. Notification Consumer Processing

### 7.1 Processing sequence

For each valid event, Notification Service must:

1. Receive the SQS message.
2. Parse and validate the event envelope and version.
3. Look up the notification delivery ledger by `eventId`.
4. Avoid repeating a successful email send that has already been recorded.
5. Resolve the sales recipient from trusted server-side configuration based on the enquiry entity type, if a type-specific mapping is configured.
6. Select the PRODUCT or CATEGORY email template using the validated entity type.
7. Render the template with escaped customer-provided content.
8. Send the email through the configured email-provider abstraction.
9. Persist the provider outcome, provider message ID and email status in Notification Service's database.
10. After provider acceptance, persist callback status as `PENDING` before attempting the Catalog callback.
11. Call the private Catalog Service notification-status PATCH API.
12. On a safe successful callback response, persist callback status as `COMPLETED`.
13. Acknowledge the SQS message only after the email outcome and either callback completion or durable pending callback retry state have been persisted.

### 7.2 Durable delivery ledger

Notification Service owns the notification delivery ledger. It must be durable across process restarts and provide an idempotency key based on `eventId`.

**Email status**

- `PENDING` — no successful provider acceptance has been recorded.
- `SENT` — the provider accepted the email and the successful outcome is durably stored.
- `FAILED` — the email attempt failed; the enquiry remains `RECEIVED`.

**Callback status**

- `PENDING` — successful email acceptance is recorded, but Catalog Service has not yet confirmed the business status update.
- `COMPLETED` — Catalog Service confirmed that it safely handled the callback.

Persist relevant attempt counts, next retry time, provider message ID, timestamps and a sanitized last error as needed. Exact columns and database schema belong in the Notification Service data model.

### 7.3 Duplicate event behaviour

When the same `eventId` is delivered more than once:

- Reuse the existing delivery ledger record.
- If email status is already `SENT`, do not send the email again solely because the message was redelivered.
- If callback status is `PENDING`, continue or schedule callback processing; do not repeat email delivery.
- If callback status is `COMPLETED`, treat the event as already processed and acknowledge the duplicate message safely.
- Do not use enquiry ID alone as the event idempotency key; the event ID identifies the specific event instance.

The Catalog callback must independently be idempotent. Catalog Service records callback event IDs or uses an equivalent atomic mechanism.

### 7.4 Email failure

If the email provider reports a failure:

- Record the failed attempt in Notification Service's delivery ledger.
- Do not invoke the successful notification-status callback.
- Do not change Catalog Service enquiry status.
- The enquiry remains `RECEIVED`.
- Do not acknowledge the SQS message while the email outcome/retry policy still depends on queue redelivery.
- Allow the configured SQS retry and redrive policy to operate.
- After the configured maximum receive policy is exhausted, the message must be routed to the DLQ and remain inspectable.

A message reaching the DLQ is not proof that the enquiry was processed. Provide a documented, controlled recovery/redrive approach. Do not silently discard failed enquiries.

### 7.5 Provider timeout and uncertain outcome

A network timeout can occur after the provider has accepted an email but before Notification Service receives or persists the provider response. The system cannot always know whether the provider accepted the message.

Do not claim exactly-once email delivery. Record this as a residual failure mode. Use provider idempotency support only if the selected provider contract actually supports it; do not assume all SMTP or SES send paths provide an idempotency key.

The consumer must avoid deliberate duplicate sends when a successful outcome is already recorded. Any unavoidable ambiguity must be documented rather than hidden.

---

## 8. Callback Processing and Enquiry Lifecycle

### 8.1 Callback request

After the email provider accepts the email and the successful email outcome plus pending callback state are durably stored, Notification Service calls:

`PATCH /internal/catalog/enquiries/{enquiryId}/notification-status`

The request body is defined in `docs/api-contracts.md` and `docs/openapi.yaml`:

```json
{
  "eventId": "f0a1f47a-29ad-4b2e-91d9-7f2f8d3a6e11",
  "notificationStatus": "SENT",
  "providerMessageId": "provider-message-123",
  "processedAt": "2026-11-22T10:15:32.000Z"
}
```

Do not create a second callback format in the event consumer. The callback uses the same originating `eventId` for idempotency.

### 8.2 Callback success semantics

Catalog Service may return one of the safe outcomes defined by the API contract:

- `APPLIED` — `RECEIVED` was successfully transitioned to `PROCESSED` and persisted.
- `DUPLICATE` — the callback event was already handled safely.
- `STALE_IGNORED` — the enquiry is already `RESOLVED`; the callback did not regress its state.

For all three safe outcomes, Notification Service may mark callback status `COMPLETED`.

### 8.3 Callback failure and retry

If the email was accepted but the Catalog callback fails or Catalog Service is unavailable:

- Keep `email_status = SENT`.
- Keep `callback_status = PENDING`.
- Preserve the provider message ID.
- Do not resend the email because the callback failed.
- Persist retry scheduling and attempt information in Notification Service's database.
- Retry the callback independently from SQS email delivery retries.
- Keep the Catalog enquiry `RECEIVED` until Catalog Service successfully persists `PROCESSED`.

The callback retry mechanism must survive Notification Service restarts. An in-memory timer or retry loop alone is insufficient. A database-backed retry worker is an approved approach; do not introduce another broker or service without an approved decision.

The original SQS message may be acknowledged once the email outcome and pending callback retry state have been durably stored. The independent callback retry worker then continues until completion or an explicitly monitored terminal-failure state.

### 8.4 Catalog enquiry lifecycle

The only normal lifecycle is:

`RECEIVED → PROCESSED → RESOLVED`

| Event/condition | Catalog enquiry status |
|---|---|
| Enquiry and Outbox event committed | `RECEIVED` |
| Event published to SQS | `RECEIVED` |
| Notification consumer receives event | `RECEIVED` |
| Email attempt fails or retries | `RECEIVED` |
| Email retries exhausted / DLQ | `RECEIVED` |
| Email accepted; callback pending | `RECEIVED` |
| Catalog Service persists successful callback | `PROCESSED` |
| Explicit sales business action | `RESOLVED` |

Only Catalog Service owns and persists this business status. Notification Service's `SENT` or `COMPLETED` ledger values are not substitutes for the Catalog enquiry lifecycle.

---

## 9. Retry, Circuit Breaker and Dead-Letter Handling

### 9.1 Email retry

Email failure follows the source SQS queue's configured retry/redrive policy. The exact maximum receive count, backoff settings and DLQ policy must be configured and documented for the chosen local and production queue implementations.

Do not create unbounded immediate retries. Do not mark an email as sent unless provider acceptance is known and durably recorded.

### 9.2 Callback retry

Callback retry is independent from email delivery retry. It is durably scheduled in Notification Service's data store and must not cause email redelivery.

Use exponential backoff with jitter. Keep retry timing and maximum/terminal-failure policy configurable and observable.

### 9.3 Circuit Breaker

Implement the Circuit Breaker around Notification Service's HTTP client to Catalog Service with the states:

- `CLOSED` — callback requests are permitted and outcomes are measured.
- `OPEN` — fail fast without contacting Catalog Service; preserve pending callback state.
- `HALF_OPEN` — permit a limited recovery probe.

Initial configurable values from `SPEC.md`:

| Parameter | Initial value |
|---|---:|
| Consecutive qualifying failure threshold | 5 |
| Open duration | 30 seconds |
| Half-open probes | 1 |
| HTTP timeout | 3 seconds |

These are starting assumptions, not universal production settings. Count network errors, timeouts and relevant 5xx responses. Do not count ordinary business responses such as 400 or 404 as service-health failures.

### 9.4 DLQ inspection and recovery

- Keep messages moved to the DLQ inspectable.
- Record enough diagnostic context to identify the event without logging unnecessary customer personal information.
- Document the operator procedure for inspection and controlled redrive.
- Replayed messages must pass through the same event validation and idempotency checks.
- Never use manual redrive as a way to bypass validation, duplicate protection or callback recovery.
- Do not mark a DLQ event processed merely because it was moved or inspected.

The exact operational tooling for DLQ redrive can be implemented or documented based on the local/production environment. No customer-facing DLQ management interface is required for the initial assessment.

---

## 10. Versioning and Compatibility Rules

The event schema is explicitly versioned through `eventVersion`.

For version `1`:

- Do not rename or remove required fields without creating a new event version.
- Do not change the meaning or type of an existing field within version `1`.
- New optional fields may be added only when older consumers can safely ignore them and the runtime schema permits forward-compatible handling.
- A change that requires new consumer behaviour or changes the meaning of existing data must use a new version and be recorded in `DECISIONS.md`.
- Consumers must reject unsupported versions safely and allow the configured retry/DLQ policy to preserve the message for inspection.
- Keep TypeScript types, runtime validators, producer serialization tests and consumer contract tests synchronized.

Do not create multiple competing definitions of the event payload in Catalog Service and Notification Service. Prefer a shared, versioned contract package/module within the repository if the monorepo structure supports it without creating a runtime service dependency.

---

## 11. Correlation, Privacy and Security

### 11.1 Correlation

Propagate `correlationId` when available across:

1. Public enquiry request (`X-Correlation-ID`).
2. Catalog Service request handling.
3. Enquiry and Outbox creation.
4. SQS event envelope.
5. Notification Service processing.
6. Internal Catalog callback.

Log the following identifiers where useful:

- `correlationId`.
- `eventId`.
- `enquiryId`.
- Notification delivery record ID.
- Service name and operation.
- Attempt number and processing duration.

### 11.2 Privacy

The event contains customer contact data needed to notify sales. Treat the SQS message body and Outbox payload as sensitive application data.

- Do not log the full event payload.
- Do not log customer name, email, phone or message in normal application logs.
- Do not include personal data in error messages, metrics labels or high-cardinality telemetry.
- Keep access to queues and databases restricted to the relevant service identity.
- Use encrypted transport and the managed encryption controls available in the production environment.
- Keep secrets and provider credentials outside the event payload and source control.
- Define retention/deletion expectations for enquiry and notification records in the data model and operational policy; do not invent a retention period in this contract.

### 11.3 Trust boundaries

- Validate every message even when it originated from the internal Outbox publisher.
- Do not trust SQS message attributes as authorization data.
- Do not allow event payload values to choose arbitrary email recipients, email template paths or provider configuration.
- Authenticate the internal callback independently of `eventId` and `correlationId`.

---

## 12. Contract Testing Requirements

### 12.1 Catalog Service producer tests

- Event contains all required envelope and payload fields.
- Event type and version are correct.
- Product and category enquiry payloads conform to the same schema.
- `eventId` and `enquiryId` remain stable across Outbox publication retries.
- Enquiry and Outbox event commit atomically or both roll back.
- A failed SQS send does not mark an Outbox record published.
- A crash/retry around SQS acceptance may produce duplicate publication but preserves event identity.
- Optional fields are serialized consistently.

### 12.2 Notification Service consumer tests

- Valid version-1 event is accepted.
- Malformed event, unknown event type and unsupported version are rejected safely.
- Duplicate event ID does not repeat a completed email send.
- A `SENT` delivery with pending callback retries the callback without resending email.
- A completed callback is not repeated unnecessarily.
- Email failure leaves the Catalog enquiry `RECEIVED` and follows queue retry/DLQ policy.
- Unknown provider outcome is handled as an explicitly documented ambiguity, not falsely recorded as success.
- Consumer does not acknowledge before the required durable state is recorded.
- Customer PII is not written to logs.

### 12.3 Callback and recovery tests

- `APPLIED`, `DUPLICATE` and `STALE_IGNORED` are treated as safe callback completion outcomes.
- Transient callback failure leaves callback status pending.
- Callback retry survives Notification Service restart.
- Circuit Breaker transitions through `CLOSED`, `OPEN` and `HALF_OPEN` as configured.
- Callback retries do not cause another email send.
- Callback never regresses a `RESOLVED` enquiry.

### 12.4 Verification status

The checklist above is a test plan, not proof that tests have passed. Record actual commands and outcomes in `TIME_SPENT.md`, `PR_DESCRIPTION.md` and the relevant implementation evidence. Do not mark an event contract verified until both producer and consumer validation are implemented and tested.

---

## 13. Change Control

When a necessary event-contract change is identified:

1. Check the original assessment and `SPEC.md` before changing behaviour.
2. Record new ambiguity in `ASSUMPTIONS.md` when the source requirements leave a genuine gap.
3. Record material event, ownership or reliability changes in `DECISIONS.md`.
4. Update this document and any shared TypeScript event contract together.
5. Update producer and consumer runtime validation and tests.
6. Update `SPEC.md`, `docs/api-contracts.md` and `docs/openapi.yaml` only when their respective contracts are affected.
7. Record any operational or reviewer-visible change in `README.md` and `PR_DESCRIPTION.md`.

Do not silently rename the event, change the payload shape, change status ownership, or couple callback retry to email retry.
