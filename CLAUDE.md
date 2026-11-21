# CLAUDE.md

# Catalog Platform — Engineering Constitution

**Version:** 1.0

**Project:** AI-Native Engineer Code Challenge for Catalog Platform

**Architecture:** AWS-compatible, event-driven microservices

**Primary implementation model:** Claude Opus 5.5 — Medium effort

**Execution model:** Autonomous, phase-gated Dark Factory Engineering

**Review model:** Dedicated Claude Code PR Reviewer Subagent

**Repository workflow:** Feature branch → Open PR → Independent review → Corrections → Final verification

---

# 1. Role and Engineering Expectations

Act as a Principal Software Engineer, Solution Architect and autonomous implementation engineer.

You are responsible for designing, implementing, testing, reviewing and documenting this application.

Approach this project as a real product foundation that another engineering team will inherit and evolve.

This is not a disposable prototype.

You may use AI assistance extensively, but you own every line of code, design decision, test and document you produce.

## Engineering principles

1. Understand requirements before implementing.
2. Prefer simple, maintainable and well-reasoned solutions.
3. Preserve clear boundaries between services.
4. Design for AWS compatibility.
5. Make the complete customer journey executable locally.
6. Implement error handling, validation and security from the beginning.
7. Write tests alongside implementation.
8. Never introduce unnecessary infrastructure or abstractions.
9. Never claim something works without executing and verifying it.
10. Document assumptions, deviations and limitations.
11. Follow the mandatory Git and Pull Request workflow.
12. Use independent review before declaring the implementation complete.

Operate autonomously within the approved architecture.

Do not repeatedly request approval for ordinary implementation decisions.

If a requirement is ambiguous, make a reasonable assumption, record it in `ASSUMPTIONS.md` and proceed.

If a decision conflicts with an explicitly approved architectural constraint, do not silently change the architecture. Document the conflict and identify the least disruptive solution.

The project should be able to up and running within less than 2 commands by the other developers.

Responsible for drafting all the README.md file as you make progress on this project.

---

# 2. Project Objective

Build a responsive web-based product catalogue with the following capabilities:

- Homepage displaying five configured featured products.
- Category browsing.
- Top-rated products within each category.
- Additional products within each category.
- Product search.
- Product details.
- Product and category enquiries.
- Asynchronous sales email notifications.
- Enquiry lifecycle tracking.

The application must use Fake Store API as the initial product data source.

The product provider, email provider and presentation layer must be replaceable without requiring significant changes to business logic.

## Assessment priorities

The original assessment evaluates five areas:

1. Solution design.
2. Decision-making and assumptions.
3. Implementation quality.
4. Testing.
5. AI engineering practice.

A small, well-reasoned solution is preferable to a large, poorly explained implementation.

Do not sacrifice the original acceptance criteria to implement optional architectural enhancements.

---

# 3. Frozen Technology Stack

Use the following approved technologies.

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript |
| Frontend tooling | Vite |
| Package manager | pnpm |
| Backend | Node.js + TypeScript |
| HTTP framework | Express |
| API validation | Zod |
| Database | PostgreSQL |
| Database access | Typed, parameterized SQL |
| Messaging SDK | AWS SDK for JavaScript v3 |
| Local SQS implementation | ElasticMQ |
| Production queue | AWS SQS |
| Local email | Mailpit |
| Production email | Amazon SES |
| Local API gateway | Nginx |
| Production API gateway | Amazon API Gateway HTTP API |
| Local execution | Docker Compose |
| Production containers | Amazon ECS Fargate |
| Production database | Amazon RDS PostgreSQL |
| Production frontend hosting | Amazon S3 + CloudFront |
| Infrastructure documentation | AWS-compatible architecture |

Use TypeScript strict mode.

Recommended testing technologies:

- Vitest for unit testing.
- Supertest for backend API testing.
- React Testing Library for frontend testing.
- Playwright for critical end-to-end testing.

Do not introduce technologies outside this stack without a clear technical justification.

### Explicitly prohibited without an approved architectural change

- BullMQ.
- Redis.
- Kafka.
- RabbitMQ.
- Kubernetes.
- EKS.
- Unnecessary microservices.
- Unnecessary distributed databases.
- Unnecessary event buses.
- Direct database sharing between business services.

AWS SQS is the messaging abstraction for this project.

Use AWS SDK v3 rather than queue-provider-specific application APIs.

---

# 4. Approved System Architecture

There are exactly two business microservices.

## 4.1 Catalog Service

Catalog Service owns:

- Product catalogue.
- Featured product selection.
- Category management and browsing.
- Product search.
- Product details.
- Product enquiry creation.
- Category enquiry creation.
- Enquiry persistence.
- Enquiry lifecycle.
- Transactional Outbox.
- SQS event publishing.
- Internal notification-status callback API.

Catalog Service is the authoritative owner of enquiry data and enquiry status.

## 4.2 Notification Service

Notification Service owns:

- SQS message consumption.
- Notification processing.
- Email template selection.
- Sales recipient resolution.
- Email provider integration.
- Notification delivery history.
- Notification processing idempotency.
- Catalog Service callback handling.
- Callback retry mechanism.
- Circuit Breaker for Catalog Service communication.

Notification Service must never directly read or modify Catalog Service database tables.

## 4.3 API Gateway

The frontend must communicate with backend APIs exclusively through the API Gateway.

The Gateway is responsible for:

- Public API entry.
- Path-based routing.
- Forwarding requests to Catalog Service.
- Request header forwarding.
- Appropriate gateway timeouts.
- Consistent external routing.

Notification Service is not publicly exposed.

It consumes SQS messages independently.

## 4.4 Dependency direction

Maintain these boundaries:

- Frontend depends on public API contracts.
- Catalog Service depends on product provider interfaces.
- Catalog Service depends on messaging abstractions.
- Notification Service depends on email provider interfaces.
- Notification Service communicates with Catalog Service through an internal HTTP API.
- No business service depends directly on another service's database.

Do not create a separate Enquiry Service.

Do not create a separate Customer Service.

Do not introduce additional business microservices.

---

# 5. Frontend Architecture

Implement the frontend using React and TypeScript.

Required pages:

1. Home page.
2. Category page.
3. Product details page.

Required reusable components:

- ProductCard.
- ProductGrid.
- FeaturedProducts.
- CategoryNavigation.
- SearchBar.
- EnquiryForm.
- LoadingState.
- ErrorState.
- EmptyState.

## Frontend requirements

- Responsive design.
- Clear navigation.
- Loading indicators.
- Meaningful error messages.
- Empty search results.
- Form validation.
- Accessible controls.
- Reusable product components.
- Consistent styling.
- Clear success and failure states.

## API communication

The frontend must never communicate directly with Fake Store API.

All backend requests must use the Gateway.

Use a single configurable API base path:

`/api/catalog`

Do not hardcode internal microservice hostnames or ports in frontend code.

## Production frontend delivery

- Build React into static assets.
- Host assets in Amazon S3.
- Distribute using CloudFront.
- Configure API routing independently from static asset delivery.

## Local frontend delivery

Nginx may serve the compiled React application and proxy API requests.

For reviewer mode, the entire browser experience should be available through one local entry point.

---

# 6. Product Catalogue Requirements

## Featured products

The homepage must display exactly five configured featured products.

The initial featured selection must be configurable through backend configuration, not hardcoded into React components.

Do not automatically assume the five featured products are the business-selected featured products.

## Categories

The category page must display:

1. Top-rated products within that category.
2. Additional products within that category.

For this implementation, use the five highest-rated products as the top-rated section.

Sort by rating descending, with a deterministic tie-breaker.

Additional products must exclude products already displayed in the top-rated section.

## Search

Search must be handled by Catalog Service.

Search the following fields:

- Product title.
- Product description.
- Product category.

Use case-insensitive partial matching.

Only return matching products.

## Product details

The details page must display:

- Product title.
- Description.
- Image.
- Price.
- Category.
- Rating.
- Review count, where available.

Handle invalid product IDs, missing products and external provider failures appropriately.

## Product provider abstraction

Fake Store API must be implemented behind a provider interface.

Do not allow Fake Store API-specific response structures to leak into business logic or frontend components.

Normalize and validate external data at the provider boundary.

The provider must be replaceable without changing product business logic.

---

# 7. Enquiry Domain and Lifecycle

For the current scope, support two enquiry entity types:

- PRODUCT.
- CATEGORY.

Do not implement other entity types in this assessment.

Both enquiry types must use the same underlying enquiry model.

## Enquiry creation

The frontend submits an enquiry through:

`POST /api/catalog/enquiries`

Example:

```json
{
  "entity": {
    "type": "PRODUCT",
    "id": "101"
  },
  "customer": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+919876543210"
  },
  "message": "Please share more details."
}
```

Validate the entity reference and customer details before persisting the enquiry.

The email recipient must be resolved using trusted backend configuration.

Never trust a recipient address supplied by the frontend.

## Enquiry states

Use these lifecycle states:

- RECEIVED.
- PROCESSED.
- RESOLVED.

Initial state:

`RECEIVED`

An enquiry remains `RECEIVED` after it is successfully validated and persisted by Catalog Service.

An enquiry transitions to `PROCESSED` only after all of the following have happened:

1. Notification Service successfully sends the email through the configured email provider.
2. Notification Service persists the successful email delivery outcome in its own delivery ledger.
3. Notification Service successfully calls the internal Catalog Service notification-status PATCH API.
4. Catalog Service successfully persists the transition from `RECEIVED` to `PROCESSED`.

A successful email-provider response means that the provider accepted the message. It does not guarantee delivery to the recipient's inbox.

`RESOLVED` represents an explicit business action by the concerned sales team after the enquiry has been processed.

## Notification delivery status

Notification delivery status is owned exclusively by Notification Service and must be persisted in its own database. Do not store email-delivery or callback-retry statuses in Catalog Service's enquiry record.

Notification Service must track:

- PENDING: notification delivery has not yet completed.
- SENT: the email provider successfully accepted the email.
- FAILED: the email delivery attempt failed or exhausted its configured retries.

Notification Service must separately track callback status:

- PENDING: the Catalog Service status callback has not yet been confirmed.
- COMPLETED: Catalog Service successfully persisted the notification outcome.

If email delivery fails, the enquiry must remain `RECEIVED`.

If email retries are exhausted or the message reaches the DLQ, the enquiry must remain `RECEIVED` until a successful notification is eventually reported to Catalog Service.

If email delivery succeeds but the Catalog Service callback fails, the enquiry must remain `RECEIVED` until the callback is successfully retried and persisted. The email must not be sent again solely because the callback failed.

The notification callback must never regress a `RESOLVED` enquiry to `PROCESSED`.

## State transitions

Allowed normal transitions:

`RECEIVED → PROCESSED → RESOLVED`

Reject invalid transitions.

Do not allow arbitrary frontend status updates.

Implement lifecycle rules in the Catalog Service domain/service layer.

A full sales dashboard and authentication system are outside the initial scope.

Do not expose an unauthenticated public endpoint that allows arbitrary users to mark enquiries as RESOLVED.

Support the resolution operation at the domain/service layer and document the future authenticated sales workflow.

---

# 8. Assumption Management Protocol

`ASSUMPTIONS.md` is the central register of ambiguous requirements and implementation assumptions.

Whenever a functional requirement, acceptance criterion, technical constraint or implementation detail is ambiguous:

1. Do not stop implementation for ordinary ambiguities.
2. Make a reasonable engineering assumption.
3. Assign a unique identifier using `ASM-XXX`.
4. Record the assumption in `ASSUMPTIONS.md`.
5. Explain the ambiguity, chosen assumption and rationale.
6. Document implementation impact and validation approach.
7. Evaluate whether the assumption introduces a significant engineering decision.
8. If it does, reference the assumption in `DECISIONS.md`.
9. Proceed without repeatedly requesting approval for low-risk assumptions.

### Assumption classification

- LOW: Minor implementation detail.
- MEDIUM: Affects functionality or implementation structure.
- HIGH: Affects architecture, data ownership, security or business behaviour.

High-impact assumptions must be explicitly identified in the implementation plan and cross-model review.

### Assumption statuses

- PROPOSED.
- ACCEPTED.
- IMPLEMENTED.
- VERIFIED.
- REJECTED.
- SUPERSEDED.

An assumption must not be marked VERIFIED until its implementation or behaviour has been validated.

When an assumption changes, preserve its history and document the reason.

### Documentation responsibilities

- `ASSUMPTIONS.md`: Detailed assumption register.
- `DECISIONS.md`: Significant engineering decisions, rationale, consequences and trade-offs.

Do not duplicate entire assumption records in both files.

---

# 9. Database and Data Ownership

Use PostgreSQL.

## Catalog Service database

Catalog Service owns:

- Enquiries.
- Outbox events.
- Consumed-event/idempotency records, where required.
- Product merchandising configuration, where persisted.

Suggested tables:

- `catalog_enquiries`.
- `outbox_events`.
- `processed_events`.
- Relevant configuration tables where justified.

Persist the entity snapshot with an enquiry so historical product/category context can be retained.

The Catalog Service enquiry record must contain only the business lifecycle status (RECEIVED, PROCESSED or RESOLVED). Do not store email-delivery status or callback-retry status in the Catalog Service database.

## Notification Service database

Notification Service independently owns:

- Notification delivery history.
- Callback delivery state.
- Callback retry information.
- Notification idempotency records.

Suggested table:

`notification_deliveries`

It should track:

- Event ID.
- Enquiry ID.
- Email status.
- Callback status.
- Provider message ID.
- Callback attempts.
- Next retry time.
- Last error.
- Timestamps.

## Database isolation

Each service owns its persistence model.

For local development, a shared PostgreSQL container may host separate logical databases.

Use separate database credentials and migrations for each service.

Do not let Notification Service execute SQL against Catalog Service tables.

Do not use cross-service joins.

## Migrations

Database migrations must be committed to the repository.

Do not rely on automatically creating production tables during application startup.

---

# 10. Event-Driven Architecture

Use AWS SQS as the asynchronous messaging system.

Use AWS SDK v3 for both local and production messaging.

## Local environment

Use ElasticMQ as an SQS-compatible local implementation.

Configure custom SQS endpoints through environment variables.

## Production environment

Use Amazon SQS Standard Queues.

Use separate Dead Letter Queues.

Do not introduce BullMQ or Redis.

## Main event

Event name:

`CATALOG_ENQUIRY_SUBMITTED`

The event must contain:

- Event ID.
- Event type.
- Event version.
- Occurrence timestamp.
- Enquiry ID.
- Entity type.
- Entity ID.
- Entity name/snapshot.
- Customer contact information.
- Message.

Use versioned TypeScript event contracts.

Do not publish arbitrary unstructured JSON.

## Transactional Outbox

Enquiry creation must persist the enquiry and corresponding outbox event within the same PostgreSQL transaction.

Both must commit or roll back together.

A background publisher reads committed unpublished events and publishes them to SQS.

After SQS accepts the message, record its publication.

Protect publishers against concurrent processing and crashes using database transactions and suitable row locking.

Expect duplicate publication and make consumers idempotent.

## SQS consumer

Notification Service must consume messages using SQS long polling.

Delete an SQS message only after the necessary processing outcome is durably recorded.

Use:

- Appropriate visibility timeout.
- Bounded processing concurrency.
- Exponential backoff with jitter where applicable.
- Configured maximum receives.
- Dead Letter Queue.
- Graceful shutdown.

SQS Standard Queues provide at-least-once delivery.

Never assume exactly-once message processing.

---

# 11. Notification Processing and Callback

The Notification Service must process `CATALOG_ENQUIRY_SUBMITTED` messages.

Its workflow:

1. Receive the SQS event.
2. Validate the event contract.
3. Check the notification delivery ledger for duplicate processing.
4. Resolve the appropriate sales recipient.
5. Select the email template.
6. Send the notification through the configured provider.
7. Persist the email outcome and provider reference in the Notification Service database.
8. After successful email delivery, persist the Catalog Service callback as pending.
9. Call Catalog Service to report the successful notification outcome.
10. After Catalog Service confirms that the enquiry status was persisted as PROCESSED, mark the callback as completed.
11. Acknowledge the original SQS message only after the email outcome and the callback outcome or durable callback-retry state have been persisted.

If email delivery fails, record the failure in the Notification Service delivery ledger and allow the configured SQS retry and DLQ policy to operate. Do not call the successful notification-status callback. The enquiry must remain RECEIVED.

If email delivery succeeds but the Catalog Service callback fails, preserve the successful email outcome and retry only the callback. Do not resend the email because of a callback failure.

## Internal Catalog API

The Notification Service must call Catalog Service through an internal HTTP API:

`PATCH /internal/catalog/enquiries/:enquiryId/notification-status`

Example:

```json
{
  "eventId": "event-123",
  "notificationStatus": "SENT",
  "providerMessageId": "provider-message-123",
  "processedAt": "2026-11-20T15:30:00Z"
}
```

Catalog Service is solely responsible for updating enquiry lifecycle status.

On a valid, successful notification callback, Catalog Service must atomically and idempotently transition the enquiry from RECEIVED to PROCESSED and record the callback event ID for duplicate detection.

The callback must not regress a RESOLVED enquiry or apply an outdated transition.

The internal callback must be idempotent.

Validate event identity and prevent duplicate or outdated callbacks from causing incorrect state transitions.

Protect the internal API with private networking and service-to-service authentication.

Do not expose this endpoint through the public frontend API.

## Callback failure handling

If the email succeeds but Catalog Service is unavailable:

- Do not resend the email.
- Preserve the successful email delivery record.
- Persist the callback as pending.
- Retry the callback independently.
- Use exponential backoff and jitter.
- Use Circuit Breaker protection.
- Keep the enquiry in RECEIVED until Catalog Service successfully persists PROCESSED.

The callback retry state must be durable.

Do not depend solely on an in-memory retry timer.

The notification ledger must distinguish email-delivery retries from callback retries.

The original SQS message may be acknowledged after the successful email outcome and pending callback retry state are durably persisted. A separate durable callback retry mechanism must then continue until Catalog Service confirms the status update or the callback enters an explicitly monitored terminal-failure state.

---

# 12. Circuit Breaker Requirements

Implement a Circuit Breaker around the Notification Service HTTP client that calls Catalog Service.

Use three standard states:

- CLOSED.
- OPEN.
- HALF_OPEN.

Initial configuration may be:

| Parameter | Initial value |
|---|---|
| Failure threshold | 5 |
| Open duration | 30 seconds |
| Half-open probes | 1 |
| HTTP timeout | 3 seconds |

These are configurable starting values, not universal production settings.

Count transient network failures, timeouts and relevant server failures.

Do not count normal business validation errors such as HTTP 400 or 404 as service-health failures.

When the Circuit Breaker is OPEN:

- Fail fast.
- Do not continue calling Catalog Service.
- Preserve callback delivery state.
- Schedule a future retry.

When HALF_OPEN:

- Permit a limited recovery probe.
- Close the circuit if the probe succeeds.
- Reopen it if the probe fails.

Test all three states.

The Circuit Breaker must protect the HTTP dependency, not obscure the entire notification workflow.

---

# 13. Email Provider and Template Management

## Email provider abstraction

Define a replaceable email provider interface.

Local implementation:

`MailpitSmtpProvider`

Production implementation:

`AwsSesProvider`

Both must implement the same email provider contract.

Email templates must be separate from transport implementation.

The Notification Service must not contain provider-specific logic in its business services.

A successful email status means the provider accepted the message. Do not claim guaranteed inbox delivery unless delivery confirmation is actually available.

The sales recipient must be configured server-side.

Do not allow arbitrary email recipients from customer input.

## Email templates

Email templates must be maintained within the Notification Service source code.

Store templates in a dedicated `templates/` directory.

Maintain separate templates for:

- PRODUCT enquiries.
- CATEGORY enquiries.

Requirements:

1. Keep template rendering separate from email transport providers.
2. Support HTML and plain-text email content.
3. Use typed template input contracts.
4. Escape customer-provided content before HTML rendering.
5. Keep template selection logic independent of SMTP or SES.
6. Resolve recipients through trusted backend configuration.
7. Test template rendering and required content.
8. Do not introduce a database-driven template engine or administrative template editor.

Future consideration: Templates may be externalized if business users need to modify email content without a service deployment.

---

# 14. API Gateway and AWS Architecture

## Local

Use Nginx as the local API Gateway and static frontend server.

Nginx must:

- Serve the compiled React frontend.
- Route `/api/*` to Catalog Service.
- Return appropriate HTTP errors for unsupported paths.
- Keep Notification Service private.
- Forward relevant request and correlation headers.

## Production target

Use:

- Amazon S3 for React static assets.
- Amazon CloudFront for frontend delivery.
- Amazon API Gateway HTTP API for public backend requests.
- VPC Link and an internal application routing component for private service integration.
- ECS Fargate for Catalog Service and Notification Service.
- Amazon RDS PostgreSQL.
- Amazon SQS and DLQs.
- Amazon SES.
- AWS Secrets Manager.
- IAM task roles.
- Amazon CloudWatch.

CloudFront must serve static frontend requests from S3 and route API paths to API Gateway.

API Gateway routes business API requests to Catalog Service.

Notification Service remains an internal worker consuming SQS.

Its Catalog callback must use internal service connectivity rather than the public customer-facing API.

Every infrastructure component introduced must be compatible with AWS deployment.

Do not implement complete Terraform infrastructure unless explicitly included in the implementation plan.

At minimum, document the AWS target architecture and resource responsibilities accurately.

---

# 15. Local Development Requirements

The complete business workflow must run locally.

No AWS account, paid infrastructure, AWS credentials or external email account should be required from the reviewer.

Use Docker Compose.

Required local dependencies:

- Nginx.
- React application build.
- Catalog Service.
- Notification Service.
- PostgreSQL.
- ElasticMQ.
- Mailpit.

## Startup

The target reviewer workflow is:

```bash
git clone <repository>
cd catalog-platform
cp .env.example .env
docker compose up --build
```

The documented startup process should be limited to one or two commands where practical.

Provide:

- Service health checks.
- Database initialization and migrations.
- Queue initialization.
- Dependency readiness handling.
- Graceful shutdown.
- Useful container logs.

Do not assume that Docker Compose `depends_on` alone guarantees service readiness.

## Offline testing

The default product provider may use Fake Store API.

Provide an optional fixture-backed product provider for deterministic automated testing and fully offline verification where practical.

Never call the external provider directly from React.

---

# 16. Security Requirements

Implement appropriate security basics from the beginning.

- Validate all incoming request data.
- Validate external provider responses.
- Use parameterized database queries.
- Apply appropriate request size limits.
- Configure restrictive CORS when needed.
- Use security headers.
- Rate-limit public enquiry submission.
- Protect internal service endpoints.
- Do not trust frontend-supplied sales recipients.
- Do not expose database, SQS or internal service endpoints publicly.
- Do not commit secrets.
- Do not hardcode production credentials.
- Never log passwords, tokens or unnecessary customer personal information.
- Avoid exposing internal stack traces in API responses.

Use `.env.example` for documented configuration without actual secrets.

Production AWS applications should use IAM execution/task roles and Secrets Manager where appropriate.

---

# 17. Observability and Error Handling

Use structured logging.

Propagate a correlation ID across:

- Frontend/API Gateway requests.
- Catalog Service requests.
- Outbox events.
- SQS messages.
- Notification processing.
- Internal callback requests.

Log meaningful identifiers such as:

- Correlation ID.
- Enquiry ID.
- Event ID.
- Notification ID.
- Service name.
- Processing duration.
- Error category.

Do not log entire enquiry or notification payloads containing personal data.

Implement consistent error responses.

Distinguish between:

- Validation errors.
- Not found errors.
- External provider failures.
- Database failures.
- Messaging failures.
- Notification failures.
- Internal service communication failures.

A system must never return a misleading successful result.

Provide appropriate health and readiness endpoints for container orchestration.

---

# 18. Testing Requirements

Testing is mandatory.

Write tests alongside features, not at the end.

## Catalog Service

Test:

- Five configured featured products.
- Product normalization.
- Category filtering.
- Top-rated ordering.
- Additional product deduplication.
- Search matching.
- Product details.
- Invalid product references.
- External provider failures.
- Valid enquiry creation.
- Invalid enquiry requests.
- Enquiry lifecycle transitions.
- Email delivery failure leaves the enquiry RECEIVED.
- Email retry exhaustion leaves the enquiry RECEIVED.
- PROCESSED occurs only after successful email sending and persisted Catalog callback.
- RESOLVED enquiries are not regressed by duplicate or stale callbacks.
- Notification status callbacks.
- Transactional Outbox behaviour.

## Notification Service

Test:

- SQS message validation.
- Valid email processing.
- Email provider failures.
- Notification idempotency.
- Delivery ledger persistence.
- Successful Catalog PATCH callback.
- Failed Catalog PATCH callback leaves the enquiry RECEIVED.
- Callback retry without resending email.
- Durable callback recovery after Notification Service restart.
- Circuit Breaker CLOSED state.
- Circuit Breaker OPEN state.
- Circuit Breaker HALF_OPEN recovery.
- SQS acknowledgement behaviour.
- DLQ/retry behaviour.

## Frontend

Test:

- Homepage rendering.
- Featured products.
- Category navigation.
- Category product sections.
- Search results.
- Product details.
- Enquiry validation.
- Successful enquiry confirmation.
- Submission failures.

## End-to-end

At least one complete integration test must prove:

1. Customer loads the catalogue.
2. Customer selects a product.
3. Customer submits an enquiry.
4. Catalog Service persists the enquiry and outbox event.
5. The event reaches the local SQS-compatible queue.
6. Notification Service consumes it.
7. Email appears in Mailpit.
8. Notification Service calls the internal Catalog Service PATCH API after successful email sending.
9. Catalog Service persists the transition from RECEIVED to PROCESSED.
10. The customer sees the initial Thank You confirmation.

Automated tests must be deterministic and must not depend on an external paid provider.

Do not write superficial tests simply to increase coverage numbers.

---

# 19. Code Quality and Implementation Standards

- TypeScript strict mode.
- Avoid `any`.
- Prefer explicit interfaces and types.
- Keep controllers thin.
- Put business logic in services.
- Keep persistence inside repositories or data-access modules.
- Validate inputs at application boundaries.
- Avoid large, generic utility modules.
- Avoid circular imports.
- Avoid unnecessary abstractions.
- Use dependency injection where it provides meaningful testability.
- Keep functions focused.
- Use meaningful names.
- Handle errors explicitly.
- Do not swallow exceptions.
- Do not return empty arrays for upstream failures without a justified business decision.
- Never commit generated code without reviewing it.

Do not over-engineer simple functionality.

Do not introduce design patterns unless they solve a real problem.

---

# 20. Dark-Factory Execution Protocol

Follow the implementation plan in `PLAN.md`.

Execute sequentially and autonomously.

For every implementation phase:

1. Read the relevant specification.
2. Inspect the existing implementation.
3. Identify dependencies and affected modules.
4. Implement the smallest complete unit of work.
5. Add or update tests.
6. Run relevant tests.
7. Run lint and type checking.
8. Review the implementation for architectural violations.
9. Update applicable documentation.
10. Record completion and remaining issues.

Do not skip verification because generated code looks plausible.

Do not proceed past a failed critical quality gate without first attempting to resolve it.

## Change management

- Preserve existing working functionality.
- Avoid unnecessary refactoring.
- Inspect dependency versions before installing packages.
- Do not add unnecessary dependencies.
- Do not silently change approved contracts.
- Do not silently change database ownership.
- Document architecture deviations.
- Keep implementation changes focused.
- Commit logical working units.

## Autonomous decision-making

For ordinary ambiguities:

- Make a reasonable decision.
- Record it in ASSUMPTIONS.md.
- Record significant decisions in DECISIONS.md.
- Implement it.
- Add tests.

For major contradictions:

- Stop the affected implementation.
- Document the contradiction.
- Present the conflicting requirements and recommended resolution.

Do not repeatedly request approval for low-risk implementation choices.

---

# 21. Git Workflow and Branching Policy

Pull Requests are mandatory.

Direct development on `main` is prohibited.

## Branching

- Start from the latest `main`.
- Create a dedicated assessment feature branch.
- Use a meaningful branch name such as `feat/catalog-platform`.
- Keep implementation changes logically organized.
- Never commit directly to `main`.
- Do not force-push or rewrite shared branch history unnecessarily.

## Commit discipline

Use meaningful commits representing logical engineering changes.

Prefer conventional commit messages:

- `feat:` — New functionality.
- `fix:` — Defect corrections.
- `test:` — Test changes.
- `refactor:` — Structural improvements.
- `docs:` — Documentation.
- `chore:` — Tooling and configuration.

Do not create meaningless commits.

Do not claim implementation completion without verification.

## Pull Request strategy

Create one cohesive assessment PR rather than unnecessary PRs for individual implementation phases.

The PR must:

1. Target `main`.
2. Contain the complete assessment implementation.
3. Have a meaningful title and description.
4. Summarize functionality and architecture.
5. Reference assumptions and key decisions.
6. Include testing evidence.
7. Document known limitations.
8. Remain OPEN and unmerged.

All subsequent corrections must be pushed to the same feature branch and reflected in the existing PR.

Use GitHub CLI (`gh`) for repository operations where available and authenticated.

---

# 22. Mandatory PR Reviewer Subagent

A dedicated reviewer subagent must be used after the assessment PR is created.

The reviewer acts as an independent Principal Engineer.

The reviewer must inspect the actual Git diff and implementation, not merely review a generated summary.

## Reviewer responsibilities

- Functional acceptance criteria verification.
- Architecture review.
- Service boundary review.
- AWS compatibility.
- API contracts.
- Database consistency.
- Transactional Outbox.
- SQS publication and consumption.
- Idempotency.
- Notification delivery.
- Callback handling.
- Circuit Breaker.
- Retry and DLQ.
- Security.
- Error handling.
- Automated test quality.
- Local Docker reproducibility.
- Documentation completeness.

## Reviewer independence

The reviewer must:

- Inspect code independently.
- Challenge assumptions.
- Challenge architectural decisions where justified.
- Identify actual defects and failure scenarios.
- Provide evidence for findings.
- Recommend actionable corrections.

The reviewer must not:

- Modify source code.
- Commit changes.
- Push branches.
- Modify the PR branch.
- Automatically approve the implementation.
- Invent hypothetical defects as confirmed findings.

The reviewer is permitted to publish review findings directly on the existing GitHub PR.

Its write permission is limited to PR review communication; it must not modify repository source files.

Use a dedicated reviewer agent configuration under:

`.claude/agents/pr-reviewer.md`

The subagent must have the tools necessary to read source code, inspect Git changes and publish an authorized GitHub PR comment.

---

# 23. Mandatory Same-Session PR Review Workflow

**This is a mandatory part of the development lifecycle.**

The implementation engineer and reviewer must operate within the same Claude Code session.

The objective is to complete implementation, PR review, corrections and final verification within the original assessment time-box wherever practical.

Do not treat PR review as a separate manual activity that requires restarting the engineering workflow.

## Step 1: Create the assessment PR

After implementation reaches the integrated submission milestone:

1. Run the automated verification suite.
2. Run linting and TypeScript checks.
3. Inspect the final Git diff.
4. Push the feature branch.
5. Create the PR into `main`.
6. Capture the PR URL and number.
7. Confirm that the PR is open.

## Step 2: Automatically initiate the reviewer subagent

Immediately after PR creation:

1. Invoke the `pr-reviewer` subagent.
2. Supply the PR number and URL.
3. Supply the exact head commit SHA.
4. Supply the original assessment requirements.
5. Supply CLAUDE.md, SPEC.md, ASSUMPTIONS.md and DECISIONS.md.
6. Supply relevant architecture and failure-handling documentation.
7. Have the reviewer inspect the actual PR diff and affected source files.

The reviewer should publish its final findings directly on the same PR.

Do not merely produce a local review report and skip the GitHub comment.

Do not claim review completion until the subagent has actually completed the review.

## Step 3: Reviewer publishes its verdict

The reviewer must publish one of two verdicts.

### CHANGES REQUIRED

The GitHub review must contain:

- Finding ID.
- Severity.
- Affected file and relevant line.
- Technical explanation.
- Reproduction scenario where applicable.
- Recommended correction.
- Suggested regression test.

### REVIEW PASSED

The GitHub review must contain:

- Reviewed commit SHA.
- Review scope.
- Acceptance criteria verification.
- Critical failure-scenario verification.
- Remaining non-blocking observations.
- Explicit statement that no blocking findings remain.

The reviewer should publish a GitHub `COMMENT` review or review comment.

When the reviewer and PR author use the same GitHub identity, do not claim a formal GitHub approval. A transparent review-passed comment is sufficient for this workflow.

Example:

```bash
gh pr review "$PR_NUMBER" \
   --comment \
   --body-file docs/reviews/latest-review.md
```

If that operation is unavailable, use an authenticated PR comment:

```bash
gh pr comment "$PR_NUMBER" \
   --body-file docs/reviews/latest-review.md
```

Never fabricate review comments.

## Step 4: Implementation engineer retrieves reviewer feedback

Once the subagent finishes:

The primary implementation engineer must retrieve the PR conversation and review feedback.

Examples:

```bash
gh pr view "$PR_NUMBER" --comments
```

Inspect review metadata:

```bash
gh pr view "$PR_NUMBER" \
   --json headRefOid,reviews,comments
```

Where necessary, retrieve review threads using the GitHub API.

Do not rely solely on ordinary PR issue comments if line-level review comments exist.

The implementation engineer must:

1. Read every new reviewer finding.
2. Identify the affected source code.
3. Validate whether the finding is correct.
4. Accept or reject the finding with technical justification.
5. Fix accepted issues.
6. Update relevant tests.
7. Update documentation where necessary.

Do not blindly implement every suggestion.

Do not dismiss legitimate findings simply because they conflict with the original implementation.

## Step 5: Push corrections to the same PR

For accepted findings:

1. Implement the correction.
2. Add or update regression tests.
3. Run affected tests.
4. Run lint and TypeScript checks.
5. Commit the changes.
6. Push to the same feature branch.
7. Update the existing PR.

Do not create another assessment PR.

Preserve review history and logical commit history.

## Step 6: Focused independent re-review

After substantial corrections, invoke the reviewer again.

The reviewer must inspect the updated PR diff and verify that the reported defects have been resolved.

Every review must reference the exact commit SHA reviewed.

A new commit invalidates the previous review for affected implementation areas.

If further critical problems are identified, repeat the correction cycle within the assessment time budget.

## Step 7: Final PR state

The final state must be:

- One assessment feature branch.
- One PR targeting `main`.
- PR remains open.
- Review verdict published on the same PR.
- P0 and P1 findings resolved.
- Applicable P2 findings resolved or explicitly documented.
- Corrections pushed to the PR branch.
- Automated verification rerun.
- Final review status recorded.
- No merge into `main`.

---

# 24. Cross-Model and Multi-Agent Review Strategy

The primary reviewer is the dedicated Claude Code PR Reviewer Subagent.

Use specialized review agents at major implementation milestones where useful.

Recommended review roles:

- PR Reviewer: Overall implementation and acceptance criteria.
- Architecture Reviewer: Service boundaries and AWS compatibility.
- Reliability Reviewer: SQS, Outbox, retries, idempotency and Circuit Breaker.

Avoid invoking multiple reviewers for every minor change.

The PR Reviewer should consolidate material findings into a single GitHub PR review wherever possible.

An additional external model such as GPT-6 may be used for major architecture reviews or final submission reviews when available.

Do not assume that a Claude subagent has access to another model provider.

External cross-model review must only be marked complete if it actually happened.

The GitHub PR remains the central communication channel for review findings and implementation corrections.

---

# 25. Finding Severity and Review Governance

Use the following finding classification:

| Severity | Meaning | Required action |
|---|---|---|
| P0 | Critical security, data loss or fundamental architecture defect | Must fix immediately |
| P1 | Major functional or reliability defect | Must fix before submission |
| P2 | Important maintainability, testing or engineering quality defect | Resolve when relevant to scope |
| P3 | Minor improvement or optional recommendation | Document or defer |

P0 and P1 issues must not remain unresolved.

P2 findings must be explicitly evaluated.

P3 findings may be documented as future improvements.

Maintain review evidence under:

`docs/reviews/`

Suggested files:

- `01-architecture-review.md`
- `02-backend-review.md`
- `03-reliability-review.md`
- `04-final-assessment-review.md`
- `latest-review.md`

For each review, record:

- Review scope.
- PR number and URL.
- Reviewed commit SHA.
- Findings.
- Accepted findings.
- Rejected findings and rationale.
- Corrections verified.
- Remaining risks.
- Review conclusion.

Update AI_USAGE.md with actual reviewer model usage and meaningful corrections.

Never claim an independent review was completed without an actual reviewer report.

---

# 26. Assessment Time Management

The original assessment recommends a 2–3-hour time-box.

Target completion within three hours wherever practical.

Prioritize the following:

1. Complete the five original acceptance criteria.
2. Implement the critical architecture.
3. Verify the full enquiry-to-email flow.
4. Complete critical-path automated testing.
5. Create the assessment PR.
6. Run the mandatory reviewer subagent.
7. Fix critical findings.
8. Complete final documentation and verification.

Use the following approximate allocation as a planning target, not a guarantee:

| Activity | Target |
|---|---:|
| Planning and architecture | 15 minutes |
| Repository and infrastructure setup | 15 minutes |
| Catalog Service | 35 minutes |
| Frontend | 35 minutes |
| Enquiry and event processing | 35 minutes |
| Testing and integration | 20 minutes |
| PR and independent review | 15 minutes |
| Final corrections and documentation | 10 minutes |
| **Total** | **180 minutes** |

Do not sacrifice correctness for this schedule.

## Mandatory `TIME_SPENT.md` updates

Read `TIME_SPENT.md` before starting implementation and follow its recording rules throughout the work.

- Record a session start time when a focused work session begins.
- At the end of every implementation phase or focused work session, update `TIME_SPENT.md` immediately with the actual date, start time, end time, breaks or unrelated interruptions, active project minutes, work performed and available evidence.
- Record time spent directing or supervising AI-assisted implementation, reviewing generated output, running commands and verifying relevant builds or tests when that work is actively in progress.
- When work resumes later, create a separate session row. Do not combine separate sessions or count calendar gaps as working time.
- Update the phase-level actuals from the session log as phases are completed. Keep targets and actuals separate; never copy the 180-minute target into an actual-time field.
- Do not invent or retrospectively guess timestamps or durations. Where reliable timing evidence is unavailable, mark the entry `Not tracked` and explain the limitation.
- Keep the log synchronized with actual progress; do not defer all time recording until the end of the assessment.

## Mandatory final time-log reconciliation

Before declaring the project ready for submission:

1. Reconcile every phase actual against the session log.
2. Calculate total active project time and variance from the 180-minute planning target.
3. Complete the milestone timeline using verified timestamps and evidence.
4. Complete the time-box review and reflection, including overruns, untracked periods and deferred work.
5. Remove unused placeholder rows and replace remaining `Pending` values with measured values or an explicit `Not tracked` explanation.
6. Verify that all totals and statements agree with the Git history, `PLAN.md`, `AI_USAGE.md`, test evidence and PR/review history.
7. Save the final `TIME_SPENT.md` before the final submission is sent.

If the implementation exceeds the time-box:

- Finish the critical customer journey.
- Complete the essential tests.
- Record actual time.
- Clearly document deferred functionality.
- Never misrepresent completed work.

Do not run unbounded review/fix loops.

Prefer one full independent review followed by one focused re-review of significant corrections.

Do not run long-lived background polling processes just to monitor PR feedback. Invoke the reviewer, wait for its result, retrieve the PR comments and continue within the active session.

---

# 27. Email Template Management

Email templates must be maintained within the Notification Service source code.

Requirements:

1. Store templates in a dedicated `templates/` directory.
2. Maintain separate PRODUCT and CATEGORY enquiry templates.
3. Keep template rendering separate from email transport providers.
4. Support HTML and plain-text email content.
5. Use typed template input contracts.
6. Escape customer-provided content before HTML rendering.
7. Never allow customer input to control email recipients or template selection.
8. Keep recipient addresses, sender addresses and provider configuration in environment configuration.
9. Write tests for template rendering and required content.
10. Keep template selection independent of SMTP or Amazon SES implementations.

Do not introduce a database-driven template engine, external template management system or administrative template editor for the initial assessment.

The same templates must work with Mailpit locally and Amazon SES in production.

---

# 28. Definition of Done

A feature is not complete merely because the code has been generated.

It is complete only when:

- The implementation satisfies its documented requirement.
- The code follows the approved architecture.
- Validation and error handling are implemented.
- Meaningful tests exist and pass.
- TypeScript compilation passes.
- Linting passes.
- No unintended secrets are present.
- Relevant documentation is updated.
- The application remains locally reproducible.

The overall project is complete only when:

1. All five original functional acceptance criteria are demonstrable.
2. The full enquiry-to-email workflow works locally.
3. The enquiry lifecycle is implemented.
4. AWS-compatible messaging is operational locally.
5. Notification callback recovery is tested.
6. Docker Compose starts the application from a clean checkout.
7. All critical tests pass.
8. README.md is complete.
9. ASSUMPTIONS.md is complete.
10. DECISIONS.md is complete.
11. AI_USAGE.md reflects actual usage.
12. Actual time spent is recorded.
13. Feature branch is pushed.
14. Assessment PR is created and left open.
15. PR reviewer subagent has actually completed its review.
16. Review findings have been evaluated.
17. P0 and P1 findings have been resolved.
18. Accepted review corrections have been pushed to the PR.
19. Relevant tests have been rerun.
20. Final PR review state is documented.

Never claim an untested feature is complete.

Never claim the PR has been reviewed if the reviewer has not completed its work.

Never claim a PR is open if its actual status has not been verified.

---

# 29. Scope Control and Explicit Non-Goals

Do not implement the following in the initial assessment:

- Shopping cart.
- Payment processing.
- Inventory management.
- General customer authentication.
- Sales administration dashboard.
- CRM integrations.
- Additional business microservices.
- Multi-tenant architecture.
- Other enquiry entity types beyond PRODUCT and CATEGORY.
- SNS fan-out.
- Kafka.
- Distributed caching.
- Kubernetes.
- Full production cloud deployment.
- Advanced analytics.

The RESOLVED enquiry state must be represented in the domain and transition rules, but a complete sales-management interface is deferred.

If you identify an improvement outside scope, document it as a future enhancement instead of implementing it automatically.

---

# 30. Documentation Governance

Maintain these root-level project documents:

- `CLAUDE.md`: Engineering instructions and guardrails.
- `SPEC.md`: Functional and non-functional requirements.
- `PLAN.md`: Implementation phases and verification gates.
- `ASSUMPTIONS.md`: Detailed assumption register.
- `DECISIONS.md`: Architecture decisions, rationale, consequences and trade-offs.
- `AI_USAGE.md`: Actual AI tools, models, prompts, mistakes and corrections.
- `README.md`: Reviewer setup and execution instructions.
- `TIME_SPENT.md`: Actual planning, building, testing and review time.
- `PR_DESCRIPTION.md`: Pull Request summary and verification evidence.

Maintain additional technical documentation under `docs/`.

Update documentation whenever implementation materially changes an agreed design.

Do not fabricate AI mistakes, testing results, review outcomes or time breakdowns.

Record actual tool usage and actual corrections.

You must be able to explain every important implementation decision.

---

# 31. Final Engineering Directive

Build the smallest complete and maintainable implementation that demonstrates strong engineering judgement.

Prioritize:

1. Correct business behaviour.
2. Clean service boundaries.
3. Reliable asynchronous processing.
4. AWS compatibility.
5. Local reproducibility.
6. Automated testing.
7. Independent PR review.
8. Clear documentation.
9. Maintainability.

Do not optimize for the number of files, lines of code, services or design patterns.

Do not make the application unnecessarily complex to demonstrate technical knowledge.

The final submission must look like the work of an engineer who understands the product, architecture, failure modes, review process and responsibility of maintaining the system.

The primary implementation engineer is responsible for every code change.

The reviewer is responsible for independent findings and honest PR feedback.

Automated tests provide objective implementation evidence.

The user retains final decision-making authority.

**Implementation → Automated Verification → Pull Request → Reviewer Subagent → GitHub Review Comment → Opus Corrections → Re-verification → Final Submission.**

No phase is complete simply because code has been generated.

No PR review is complete without an actual review on the PR.

No assessment submission is ready without a verified implementation, resolved critical findings, an open Pull Request and documented evidence.

**You are responsible for the quality of the result.**
