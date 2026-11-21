# Catalog Platform — Observability Guide

**Version:** 1.0  
**Status:** Approved implementation guidance; verify against the implemented logging and health-check behaviour  
**Project:** AI-Native Engineer Code Challenge for Catalog Platform
**Services:** Catalog Service and Notification Service  
**Production logging target:** Amazon CloudWatch  
**Related documents:** `CLAUDE.md`, `SPEC.md`, `docs/architecture.md`, `docs/event-contracts.md`, `docs/data-model.md`, `docs/deployment.md`, `docs/security.md`

---

## 1. Purpose and Scope

This document defines the minimum observability needed to understand the catalogue request path and the asynchronous enquiry-to-email workflow.

The initial implementation should provide:

- Structured logs from Catalog Service and Notification Service.
- A correlation ID propagated across the synchronous and asynchronous workflow.
- Health and readiness checks suitable for Docker Compose and the future ECS target.
- Useful processing and failure context for Outbox publication, SQS consumption, email delivery and callback retries.
- Privacy-safe logs and operational signals.

The goal is to make the system diagnosable without introducing an unnecessary monitoring platform. Full production dashboards, distributed tracing infrastructure and a separate metrics stack are not required for this proof of concept unless a concrete implementation need is identified and approved.

This document is an implementation guide, not evidence that instrumentation or health checks already exist.

## 2. Observability Principles

1. **Follow one enquiry end to end.** Use stable identifiers to correlate the API request, Outbox event, SQS message, notification delivery and callback.
2. **Log events, not payloads.** Record the operation and outcome without writing customer contact information or full request/event bodies to logs.
3. **Distinguish business state from processing state.** Catalog Service owns the enquiry lifecycle; Notification Service owns email and callback progress.
4. **Make retries visible.** A failed email, pending callback, SQS redelivery and Outbox retry must be distinguishable.
5. **Keep health checks cheap.** Liveness must not depend on downstream services. Readiness must represent the dependencies needed to safely accept or process work.
6. **Do not hide dependency failures.** A provider, database or queue failure must not be logged or reported as a successful empty response.
7. **Keep local operation simple.** Docker Compose logs and health status should be sufficient for a reviewer to diagnose the local workflow.
8. **Use the AWS target naturally.** Production logs and available service metrics should be accessible through CloudWatch; do not require a paid third-party account.

## 3. Structured Logging

### 3.1 Format

Write logs as one structured JSON object per log event, to standard output/error so Docker and the production container platform can collect them.

Each log entry should include the following fields where applicable:

| Field | Meaning |
|---|---|
| `timestamp` | UTC timestamp in ISO 8601 format |
| `level` | Severity, such as `debug`, `info`, `warn` or `error` |
| `service` | Stable service name: `catalog-service` or `notification-service` |
| `environment` | Runtime environment, such as `local`, `test` or `production` |
| `message` | Short human-readable description of the event |
| `operation` | Stable operation name, such as `enquiry.create`, `outbox.publish` or `notification.callback` |
| `correlationId` | Correlation identifier, when available |
| `enquiryId` | Enquiry identifier, when relevant |
| `eventId` | Event identifier, when relevant |
| `notificationId` | Notification delivery record identifier, when available |
| `durationMs` | Elapsed time for a completed operation, when useful |
| `attempt` | Attempt number for a retryable operation, when relevant |
| `errorCategory` | Safe category such as `validation`, `database`, `provider`, `sqs` or `service_communication` |
| `errorCode` | Stable application error code, when available |

Do not populate fields with empty strings merely to make every log line identical. Include only the fields that apply to the event.

### 3.2 Severity guidance

| Level | Use |
|---|---|
| `debug` | Detailed local development diagnostics that do not contain sensitive data; keep production volume controlled. |
| `info` | Normal lifecycle milestones, successful requests and completed processing operations. |
| `warn` | Recoverable failures, retries, duplicate deliveries, degraded dependencies and Circuit Breaker state changes. |
| `error` | Operations that failed and require retry, intervention or investigation. |

Do not emit an `error` log for every expected validation rejection if it would create noise. Use the appropriate level for the event and preserve enough context to diagnose it.

### 3.3 Example log records

The following examples are illustrative. They show the shape of the log, not an assertion that these messages are currently emitted.

Successful durable enquiry acceptance:

```json
{
  "timestamp": "2026-11-22T10:15:30.120Z",
  "level": "info",
  "service": "catalog-service",
  "environment": "local",
  "message": "Enquiry accepted and outbox event committed",
  "operation": "enquiry.create",
  "correlationId": "req-example-001",
  "enquiryId": "c4c4315c-9a52-4a9c-a45e-9df7f8b4f2d1",
  "eventId": "f0a1f47a-29ad-4b2e-91d9-7f2f8d3a6e11",
  "durationMs": 38
}
```

Recoverable Catalog callback failure:

```json
{
  "timestamp": "2026-11-22T10:16:02.450Z",
  "level": "warn",
  "service": "notification-service",
  "environment": "local",
  "message": "Catalog callback failed; durable retry remains pending",
  "operation": "notification.callback",
  "correlationId": "req-example-001",
  "enquiryId": "c4c4315c-9a52-4a9c-a45e-9df7f8b4f2d1",
  "eventId": "f0a1f47a-29ad-4b2e-91d9-7f2f8d3a6e11",
  "attempt": 2,
  "errorCategory": "service_communication",
  "errorCode": "CATALOG_CALLBACK_UNAVAILABLE"
}
```

### 3.4 What must never be logged

Do not log:

- Complete enquiry request bodies or event payloads.
- Customer names, email addresses or phone numbers.
- Customer-provided enquiry messages.
- Rendered email bodies or recipient lists.
- Passwords, access tokens, API keys, SMTP credentials or AWS credentials.
- Database connection strings or secret environment variables.
- Raw provider response bodies when they may contain customer data or credentials.
- Stack traces or internal implementation details in public API responses.

Use stable identifiers and safe error categories instead. If an exception message may contain personal data or secrets, sanitize it before logging. Public error responses must remain generic and include a correlation/request identifier where available.

## 4. Correlation ID Propagation

### 4.1 Header and generation

Use `X-Correlation-ID` on public API requests.

- Accept a valid caller-supplied correlation ID as diagnostic metadata.
- If it is absent or invalid, generate a new identifier in Catalog Service or at the trusted API entry layer.
- Return the effective correlation ID in the response header.
- Apply a bounded length and safe character policy to prevent header/log injection.
- Never use the correlation ID as an authentication credential or authorization decision.

The exact generation library and formatting are implementation choices. Keep the value opaque and stable for the lifetime of the request and its asynchronous work.

### 4.2 End-to-end propagation

Propagate the same correlation ID through the following path:

```text
Browser request
  └─ X-Correlation-ID
       ↓
API Gateway
       ↓
Catalog Service request logs
       ↓
Enquiry + Outbox transaction
       ↓
CATALOG_ENQUIRY_SUBMITTED event
       ↓
SQS message
       ↓
Notification Service consumer logs
       ↓
Email delivery record and callback retry
       ↓
Internal Catalog Service PATCH callback
```

The event envelope field is `correlationId`. It is optional when no correlation ID is available. The originating `eventId` and `enquiryId` must remain stable across Outbox publication retries.

### 4.3 Correlation versus identity

Use each identifier for its intended purpose:

| Identifier | Purpose |
|---|---|
| `correlationId` | Connect related operations across the full customer journey |
| `enquiryId` | Identify the business enquiry owned by Catalog Service |
| `eventId` | Identify one event instance and support event idempotency |
| `notificationId` | Identify a Notification Service delivery record, where one is exposed internally |
| SQS message ID / receipt handle | Transport-level diagnostics only; not a substitute for `eventId` |

Do not use high-cardinality identifiers as metric labels. They belong in logs and traces, not aggregate metric dimensions.

## 5. Operational Logging by Workflow

### 5.1 Public catalogue requests

Catalog Service should log meaningful request completion information:

- Operation/route template and HTTP method.
- Response status.
- Duration.
- Correlation ID.
- Safe error category/code when a request fails.

Avoid logging raw query strings if they may contain user-supplied search content. Do not log full request bodies.

### 5.2 Enquiry acceptance and Outbox

Record the following milestones:

- Enquiry validation accepted or rejected.
- Enquiry and Outbox transaction committed or rolled back.
- Outbox record claimed for publication.
- SQS publication accepted or failed.
- Outbox record marked published.
- Outbox retry or abandoned-claim recovery.

Use `enquiryId`, `eventId`, `correlationId`, attempt number and duration where relevant. Do not log the customer object or serialized event payload.

### 5.3 SQS and notification processing

Notification Service should record:

- Message received and event validation outcome.
- Duplicate event detected and the idempotent path selected.
- Delivery record created or reused.
- Email attempt started and provider outcome recorded.
- Email retry scheduled or message sent to DLQ according to queue policy.
- Callback marked pending, attempted, completed or rescheduled.
- SQS message acknowledged only after the required durable state exists.

Never log the message body. Use the event and enquiry identifiers to connect the worker activity to Catalog Service.

### 5.4 Callback and Circuit Breaker

Record:

- Callback attempt number and outcome.
- Safe callback result: `APPLIED`, `DUPLICATE` or `STALE_IGNORED`.
- Retry scheduling and next-attempt time.
- Circuit Breaker transition: `CLOSED`, `OPEN` or `HALF_OPEN`.
- Terminal failure requiring operational attention, if the implementation defines one.

A callback failure after email success must be visible as a pending callback, not as a failed email. Do not retry email merely because the callback failed.

## 6. Health and Readiness Checks

### 6.1 Liveness

Liveness answers: **Is the process alive and able to continue running?**

- It should be fast and local to the process.
- It must not make network calls to PostgreSQL, SQS, the email provider or Fake Store API.
- It should fail only when the process is unhealthy enough to require restart.

A dependency outage must not cause the container to be repeatedly restarted merely because liveness includes an external dependency check.

### 6.2 Readiness

Readiness answers: **Can this service safely accept or process the work it is responsible for right now?**

- Check dependencies that are essential to the service's immediate operation.
- For Catalog Service, database availability is essential to safely accept and durably persist an enquiry.
- For Notification Service, its own database and the configured SQS connectivity are essential to normal worker operation.
- Do not make a non-essential external dependency an unconditional readiness requirement if the service can still start and return a clear dependency error for the affected operation.
- Readiness checks must be bounded, infrequent enough to avoid creating load, and must not trigger cascading failures.

The product provider and email provider should be checked through appropriate operation-level failure handling. Do not create an aggressive readiness loop that repeatedly calls external providers simply to decide whether the process is alive.

### 6.3 Worker health

Notification Service is a background worker and is not a public customer-facing API.

Its operational health should show whether:

- The worker process is running.
- It can access its own persistence.
- It can poll the configured queue.
- It is not stuck in an uncontrolled processing loop.
- Pending callback work remains durable and observable.

Expose health information only through the local/container health mechanism or private operational access. Do not expose worker administration or dependency endpoints through the public API Gateway.

### 6.4 Endpoint naming

Use distinct liveness and readiness checks. A conventional path pair such as `/health/live` and `/health/ready` may be used, but the final paths must match the actual service routes, Docker Compose health checks and README. Do not document an endpoint as available until it is implemented and verified.

Health responses should be minimal. Do not return database connection strings, credentials, internal hostnames, queue URLs or detailed dependency exceptions.

## 7. Operational Signals and Metrics

The proof of concept does not require a new metrics database or a dashboard platform. It should, however, make the following aggregate signals available through logs, health state or platform-native metrics where practical.

### 7.1 Catalog Service

| Signal | Why it matters |
|---|---|
| Request count and status by route template | Shows API usage and failures without high-cardinality labels |
| Request latency by operation | Helps identify slow catalogue/provider requests |
| Enquiry acceptance and rejection counts | Shows the volume and outcome of enquiry submissions |
| Outbox pending count | Reveals events that have not yet been published |
| Oldest unpublished Outbox age | Detects a publisher backlog even when the pending count is small |
| Outbox publication failures/retries | Shows messaging dependency problems |
| Database connection/transaction failures | Shows persistence health |

### 7.2 Notification Service

| Signal | Why it matters |
|---|---|
| SQS messages received and acknowledged | Shows consumer activity |
| SQS visible-message count and oldest-message age | Indicates a growing processing backlog |
| DLQ message count | Identifies messages requiring inspection or recovery |
| Email attempts, successes and failures | Shows notification delivery outcomes |
| Pending callback count and oldest pending callback age | Detects callback recovery backlog |
| Callback attempts, successes and failures | Shows Catalog Service communication health |
| Circuit Breaker state changes | Makes dependency protection visible |
| Worker processing duration and retry counts | Helps identify slow or repeatedly failing work |

### 7.3 Metric dimensions and privacy

Use low-cardinality dimensions such as:

- Service name.
- Environment.
- Operation/route template.
- Outcome category.
- Error category.

Do not use customer email, phone, name, enquiry ID, event ID, correlation ID or raw search text as metric dimensions or labels.

### 7.4 Thresholds and alerting

No production throughput target, availability SLA or alert threshold is specified by the assessment. Do not invent hard numerical thresholds and present them as agreed service objectives.

For the initial implementation, ensure the following conditions can be detected:

- Outbox backlog is growing or its oldest record is not progressing.
- SQS queue age/count is growing persistently.
- Messages are accumulating in the DLQ.
- Email failures are recurring.
- Callback records remain pending or grow in age/count.
- The Circuit Breaker remains open for an extended period.
- A service remains unready or repeatedly restarts.

Any production alert threshold should be chosen from expected workload and operational objectives, not copied blindly from development defaults.

## 8. Local Development Observability

The local environment should be diagnosable with Docker Compose and the applications' structured container logs.

Useful generic commands:

```bash
# Check service/container state
docker compose ps

# Follow one service's logs
docker compose logs -f <service-name>

# Follow all services
docker compose logs -f

# Inspect recent logs
docker compose logs --tail=200 <service-name>
```

Replace `<service-name>` with the actual service name from the repository's Compose file. Do not copy an assumed service name into the README.

During local verification, a developer should be able to trace one enquiry using its `correlationId`, `enquiryId` and `eventId` without reading customer PII from logs.

The local environment does not need a separate dashboard stack. Mailpit remains the local email inspection tool; it is not a substitute for application logs or delivery-ledger state.

## 9. Production AWS Mapping

The approved production target uses AWS-managed observability capabilities rather than a new business service:

| Concern | Production target |
|---|---|
| Container application logs | CloudWatch Logs |
| Container/service health | ECS task/container health checks |
| SQS queue backlog and age | SQS service metrics, available through CloudWatch |
| DLQ monitoring | DLQ queue metrics and operational inspection |
| Application-level logs | Structured JSON emitted by the services and collected in CloudWatch |
| Secret handling | IAM task roles and Secrets Manager; secrets must never appear in logs |

The initial assessment does not require full CloudWatch dashboards, alarms, tracing infrastructure or Terraform provisioning. Document and implement only what is needed for local reproducibility and a credible AWS-compatible design. Any production monitoring configuration beyond the scope of the proof of concept should be listed as future work, not described as deployed.

## 10. Operational Triage Guide

Use this table as a first diagnostic path. It does not replace investigation of the actual code, logs or persisted state.

| Symptom | First places to inspect | Expected interpretation |
|---|---|---|
| Enquiry API rejects a valid-looking request | Catalog Service validation/error log and API response correlation ID | Confirm request schema, entity existence and safe error details |
| Enquiry is `RECEIVED` and no email appears | Outbox state, publisher logs, source queue age and Notification Service logs | The event may not have published or the worker may not have consumed it |
| Outbox pending count keeps growing | Catalog Service publisher logs and PostgreSQL connectivity | SQS connectivity, claim recovery or publisher failure may be blocking progress |
| SQS backlog grows | Notification worker health, queue receive logs and provider outcome | Consumer may be unavailable, slow or repeatedly failing |
| Message appears in DLQ | Event ID, safe error category and receive/retry history | Inspect the event and follow the documented recovery/redrive process |
| Email is recorded `SENT`, enquiry remains `RECEIVED` | Notification delivery ledger, callback pending status and Catalog callback logs | Email succeeded; callback has not yet been confirmed. Retry the callback, not the email |
| Callback pending count grows | Catalog Service availability, callback errors and Circuit Breaker transitions | Catalog callback path may be unavailable or returning retryable failures |
| Circuit Breaker is `OPEN` | Callback error history and Catalog Service health/readiness | Fail-fast protection is active; preserve pending callback records and wait for scheduled probes/retries |
| Enquiry is `PROCESSED` but email not visible in inbox | Provider acceptance record and provider-side delivery telemetry, if available | `PROCESSED` means provider acceptance and persisted callback, not guaranteed inbox delivery |

Do not manually edit database state to make an enquiry appear processed. Use the defined retry or recovery flow so that delivery and lifecycle evidence remain consistent.

## 11. Verification Requirements

The following are implementation and test requirements, not claims that they have passed.

### Logging and correlation

- [ ] Both services emit structured JSON logs to stdout/stderr.
- [ ] Logs include service name, environment, operation and severity.
- [ ] A request correlation ID is accepted or generated and returned consistently.
- [ ] The correlation ID is propagated through the Outbox event, SQS message, Notification Service and callback.
- [ ] `enquiryId` and `eventId` are present in relevant workflow logs.
- [ ] Logs contain no customer names, email addresses, phone numbers, message bodies, full event payloads or secrets.
- [ ] Error categories are useful and do not expose stack traces to API clients.

### Health and readiness

- [ ] Liveness does not call external dependencies.
- [ ] Catalog Service readiness checks its essential persistence dependency.
- [ ] Notification Service readiness/worker health reflects its required database and queue dependencies.
- [ ] Health probes are bounded and do not create cascading load.
- [ ] Health checks do not expose internal details or credentials.
- [ ] Docker Compose health checks match the actual implemented paths and startup dependencies.

### Operational signals

- [ ] Outbox failures and pending work can be identified.
- [ ] SQS backlog and DLQ state can be inspected.
- [ ] Email outcome and callback pending state can be distinguished.
- [ ] Callback retries and Circuit Breaker transitions are observable.
- [ ] No high-cardinality identifier or personal data is used as a metric label.

### Evidence

- [ ] Record the actual health-check paths and commands in `README.md` and `docs/deployment.md`.
- [ ] Record the implemented log fields and any operational limitations.
- [ ] Add test evidence for correlation propagation, health semantics and PII-safe logging.
- [ ] Update `PR_DESCRIPTION.md` with only checks that were actually run.

Do not mark this document's checklist complete until the corresponding implementation and tests have been executed.

## 12. Change Control

When observability requirements change:

1. Preserve the service ownership and privacy rules in `CLAUDE.md`, `SPEC.md` and `docs/security.md`.
2. Update the event propagation rules in `docs/event-contracts.md` if event fields or delivery behaviour change.
3. Update health-check paths in `docs/deployment.md`, Docker Compose and `README.md` together.
4. Record any additional infrastructure or material operational decision in `DECISIONS.md` before introducing it.
5. Keep logs, metrics and health responses free from customer PII and secrets.
6. Do not claim production dashboards, alarms or tracing are deployed unless they actually are.

---

**Guiding rule:** An engineer should be able to trace an enquiry from acceptance to email processing and callback completion using safe identifiers and durable state, without exposing customer data or adding an unnecessary observability platform.
