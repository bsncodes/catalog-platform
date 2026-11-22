# Catalog Platform — API Contracts

**Version:** 1.0  
**Status:** Approved implementation baseline; verify against the implemented routes and `openapi.yaml`  
**Project:** AI-Native Engineer Code Challenge for Catalog Platform
**Base path:** `/api/catalog`  
**Related documents:** `CLAUDE.md`, `SPEC.md`, `ASSUMPTIONS.md`, `DECISIONS.md`

---

## 1. Purpose and Contract Rules

This document defines the initial HTTP contract between the React frontend, the API Gateway and Catalog Service, plus the private callback contract used by Notification Service.

The machine-readable contract must be maintained in `docs/openapi.yaml`. Keep both documents synchronized when routes, DTOs, validation rules or error behaviour change.

### 1.1 Contract ownership

- The browser calls the public API through the API Gateway only.
- The API Gateway routes public `/api/catalog/*` requests to Catalog Service.
- Catalog Service owns public catalogue and enquiry APIs, enquiry persistence and enquiry business status.
- Notification Service is not publicly exposed. It calls only the private Catalog Service callback endpoint for the notification outcome.
- No API response may expose database records, internal service URLs, queue details, provider credentials or stack traces.

### 1.2 General conventions

| Concern | Contract |
|---|---|
| Protocol | HTTPS in production; HTTP on the local development environment |
| Payload format | JSON (`application/json`) for request and response bodies, except responses with no body |
| Character encoding | UTF-8 |
| Resource identifiers | Opaque strings in public API paths and DTOs; normalize upstream numeric product IDs to strings |
| Timestamps | ISO 8601 / RFC 3339 timestamps with timezone information; UTC is preferred |
| Public API prefix | `/api/catalog` |
| Internal callback prefix | `/internal/catalog` (not routed through the public Gateway) |
| Search matching | Case-insensitive partial matching over the approved searchable fields |
| Pagination | Not included in the initial contract; do not add pagination parameters unless the scope is deliberately revised |
| Correlation | Accept or create a correlation ID and propagate it through logs and asynchronous processing where available |

For public requests, use `X-Correlation-ID` as the correlation header. If a caller does not supply one, Catalog Service should generate one. Return the effective value in the response header. Treat a caller-supplied value as diagnostic metadata, not as an authorization credential.

### 1.3 Common response envelope

Successful catalogue read endpoints use this envelope:

```json
{
  "data": {}
}
```

The shape inside `data` is defined separately for each endpoint below. Enquiry creation and the internal callback use the explicit response shapes documented in their sections.

### 1.4 Common error envelope

Error responses use a consistent structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid values.",
    "requestId": "<correlation-id>",
    "details": [
      {
        "field": "q",
        "message": "A non-empty search term is required."
      }
    ]
  }
}
```

`details` is optional. It may contain safe, field-level validation information, but must not contain raw database errors, provider response bodies, secrets, stack traces or unnecessary customer personal information. `requestId` is the effective correlation ID when available.

The exact error `code` values must be stable and covered by tests. The implementation may add codes, but must not change the meaning of an existing code silently.

---

## 2. Public Catalogue APIs

All public catalogue endpoints are served through the API Gateway and implemented by Catalog Service.

### 2.1 Get featured products

`GET /api/catalog/products/featured`

**Purpose:** Return the five homepage products selected by backend configuration.

**Request:** No request body or required query parameters.

**Success:** `200 OK`

```json
{
  "data": {
    "products": [
      {
        "id": "1",
        "title": "Example product",
        "description": "Example description.",
        "category": "electronics",
        "imageUrl": "https://example.invalid/product.png",
        "price": {
          "amount": 99.99,
          "currency": "USD"
        },
        "rating": {
          "rate": 4.5,
          "count": 120
        }
      }
    ]
  }
}
```

The example shows one product for readability; a successful response must contain exactly five configured products. `rating` may be `null` when the provider has no rating data. The example URL and product values are illustrative only.

**Errors:**

- `503 Service Unavailable` when the product provider is temporarily unavailable and no valid response can be produced.
- `502 Bad Gateway` when the upstream product provider returns an invalid or unusable response.
- `500 Internal Server Error` for an unexpected internal failure.

Do not silently replace a provider failure with an empty `products` array.

### 2.2 List products and search

`GET /api/catalog/products`

**Purpose:** Return the catalogue, optionally filtered by a submitted search term.

**Query parameters:**

| Name | Type | Required | Meaning |
|---|---|---:|---|
| `q` | string | No | Search term. When supplied, it must contain non-whitespace text. |

**Search rules:**

- Trim leading and trailing whitespace before matching.
- Match case-insensitively and partially against product title, description and category.
- Return only matching products when `q` is supplied.
- An empty or whitespace-only submitted `q` is a validation error; it must not become an unfiltered match-all search.
- When `q` is omitted, return the catalogue list.

**Success:** `200 OK`

```json
{
  "data": {
    "products": [
      {
        "id": "1",
        "title": "Example product",
        "description": "Example description.",
        "category": "electronics",
        "imageUrl": "https://example.invalid/product.png",
        "price": {
          "amount": 99.99,
          "currency": "USD"
        },
        "rating": {
          "rate": 4.5,
          "count": 120
        }
      }
    ]
  }
}
```

**Errors:**

- `400 Bad Request` for an empty/whitespace-only `q` or malformed query value.
- `503 Service Unavailable` for a temporary provider outage.
- `502 Bad Gateway` for an invalid upstream response.
- `500 Internal Server Error` for an unexpected internal failure.

### 2.3 Get product details

`GET /api/catalog/products/{productId}`

**Path parameter:**

| Name | Type | Required | Meaning |
|---|---|---:|---|
| `productId` | string | Yes | Product identifier from the normalized catalogue contract. |

**Success:** `200 OK`

```json
{
  "data": {
    "product": {
      "id": "1",
      "title": "Example product",
      "description": "Example description.",
      "category": "electronics",
      "imageUrl": "https://example.invalid/product.png",
      "price": {
        "amount": 99.99,
        "currency": "USD"
      },
      "rating": {
        "rate": 4.5,
        "count": 120
      }
    }
  }
}
```

**Errors:**

- `400 Bad Request` for a malformed product identifier.
- `404 Not Found` when the product does not exist.
- `503 Service Unavailable` for a temporary provider outage.
- `502 Bad Gateway` for an invalid upstream response.
- `500 Internal Server Error` for an unexpected internal failure.

### 2.4 List categories

`GET /api/catalog/categories`

**Purpose:** Return categories available in the normalized catalogue.

**Success:** `200 OK`

```json
{
  "data": {
    "categories": [
      {
        "id": "electronics",
        "name": "electronics"
      },
      {
        "id": "jewelery",
        "name": "jewelery"
      }
    ]
  }
}
```

The `id` is the canonical category key used by the category-products route. URL-encode it when placing it in a path segment. The initial provider may expose category names as strings; Catalog Service normalizes them to this response shape.

**Errors:**

- `503 Service Unavailable` for a temporary provider outage.
- `502 Bad Gateway` for an invalid upstream response.
- `500 Internal Server Error` for an unexpected internal failure.

### 2.5 Get products for a category

`GET /api/catalog/categories/{categoryId}/products`

**Purpose:** Return the selected category's highlighted and additional products in separate groups.

**Path parameter:**

| Name | Type | Required | Meaning |
|---|---|---:|---|
| `categoryId` | string | Yes | Canonical category key returned by `GET /categories`. |

**Success:** `200 OK`

```json
{
  "data": {
    "category": {
      "id": "electronics",
      "name": "electronics"
    },
    "topRated": [
      {
        "id": "1",
        "title": "Example product",
        "description": "Example description.",
        "category": "electronics",
        "imageUrl": "https://example.invalid/product.png",
        "price": {
          "amount": 99.99,
          "currency": "USD"
        },
        "rating": {
          "rate": 4.5,
          "count": 120
        }
      }
    ],
    "additionalProducts": []
  }
}
```

**Ordering and grouping:**

- `topRated` contains up to five products for the category, ordered by rating descending.
- Use the deterministic tie-breaker recorded in `ASSUMPTIONS.md` when ratings are equal.
- Products in `additionalProducts` must not appear in `topRated`.
- If the category has fewer than five products, `topRated` contains the available products and `additionalProducts` is empty.

**Errors:**

- `400 Bad Request` for a malformed category identifier.
- `404 Not Found` when the category does not exist.
- `503 Service Unavailable` for a temporary provider outage.
- `502 Bad Gateway` for an invalid upstream response.
- `500 Internal Server Error` for an unexpected internal failure.

---

## 3. Public Enquiry API

### 3.1 Create an enquiry

`POST /api/catalog/enquiries`

**Purpose:** Durably accept a product or category enquiry and initiate asynchronous notification processing.

**Request headers:**

- `Content-Type: application/json`
- `X-Correlation-ID` (optional)

**Request body:**

```json
{
  "entity": {
    "type": "PRODUCT",
    "id": "101"
  },
  "customer": {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "+919876543210"
  },
  "message": "Please share more details."
}
```

**Field contract:**

| Field | Type | Required | Rules |
|---|---|---:|---|
| `entity` | object | Yes | Must contain `type` and `id`. |
| `entity.type` | enum | Yes | `PRODUCT` or `CATEGORY`. |
| `entity.id` | string | Yes | Non-empty identifier for an existing product/category of the specified type. |
| `customer` | object | Yes | Customer contact details. |
| `customer.name` | string | Yes | Non-empty after trimming. |
| `customer.email` | string | Yes | Must be a valid email address. |
| `customer.phone` | string | Yes | Non-empty after trimming; validate according to the selected phone-number policy. |
| `message` | string | No | Optional customer message; treat an omitted value as absent, not as a recipient or routing instruction. |

The implementation must apply explicit maximum lengths and any phone normalization rules in its request schema. Those values must be documented in `openapi.yaml` and tested; do not allow the frontend and backend validation rules to diverge.

**Trusted recipient resolution:** The sales recipient is selected using server-side configuration. The client must not submit or control the notification recipient.

**Processing semantics:**

1. Validate the request and referenced entity.
2. Persist the enquiry with status `RECEIVED` and the corresponding Outbox event in the same Catalog Service database transaction.
3. Commit the transaction.
4. Return the accepted response without waiting for SQS consumption or email sending.
5. A background Outbox publisher publishes the event to SQS.
6. Notification Service processes the event asynchronously.

If the database transaction fails, do not return success. If the event cannot yet be published after commit, the durable Outbox record remains available for retry; the customer acceptance response still means the enquiry has been persisted, not that email has been sent.

**Success:** `202 Accepted`

```json
{
  "enquiryId": "<uuid>",
  "status": "RECEIVED",
  "message": "Your enquiry has been received."
}
```

The frontend must show a Thank You / received confirmation after this response. It must not state that the sales email has already been delivered.

**Errors:**

- `400 Bad Request` for malformed JSON or structurally invalid input.
- `422 Unprocessable Entity` for field validation errors or an invalid/missing referenced product/category.
- `429 Too Many Requests` when the configured public enquiry rate limit is exceeded.
- `503 Service Unavailable` when Catalog Service cannot safely accept/persist the enquiry due to a temporary dependency failure.
- `500 Internal Server Error` for an unexpected internal failure.

A committed enquiry must not be silently discarded because the Outbox publisher or Notification Service is temporarily unavailable.

---

### 3.2 Get enquiry status

`GET /api/catalog/enquiries/{enquiryId}`

**Purpose:** Let a customer or support agent check an enquiry's business lifecycle using the reference (`enquiryId`) returned by `POST /enquiries`, without database access (ASM-035, ADR-019).

**Success:** `200 OK`, `Cache-Control: no-store`

```json
{
  "data": {
    "enquiryId": "<uuid>",
    "status": "PROCESSED",
    "entity": { "type": "PRODUCT", "id": "1", "name": "Example product" },
    "receivedAt": "2026-11-22T09:00:00.000Z",
    "processedAt": "2026-11-22T09:00:02.000Z",
    "resolvedAt": null
  }
}
```

**Privacy and boundaries:**

- The response never contains customer name, email, phone or message, or the resolver identity/notes.
- `status` is the Catalog-owned business lifecycle only. `PROCESSED` already implies that the email provider accepted the notification *and* Catalog persisted the callback. Email-delivery and callback-retry details stay in Notification Service's database and are not exposed (Catalog must not read them).
- The enquiry ID is a random UUID shown to the customer as their reference; it is not guessable or enumerable. The endpoint is read-only and rate limited per IP (`ENQUIRY_STATUS_RATE_LIMIT_PER_MINUTE`, default 60).

**Errors:** `400 VALIDATION_ERROR` (malformed UUID), `404 ENQUIRY_NOT_FOUND`, `429 RATE_LIMITED`, `503 DATABASE_UNAVAILABLE`, `500 INTERNAL_ERROR`.

---

## 4. Private Notification Callback API

### 4.1 Report successful notification processing

`PATCH /internal/catalog/enquiries/{enquiryId}/notification-status`

**Caller:** Notification Service only.  
**Exposure:** Private service-to-service connectivity; never expose through the public API Gateway or frontend.  
**Purpose:** Report that the email provider accepted the notification so Catalog Service can own and persist the business lifecycle transition.

**Authentication:** Require the approved service-to-service authentication mechanism and private networking. The concrete mechanism and local development configuration must be documented in deployment/configuration documentation. Do not treat a caller-supplied event ID or correlation ID as authentication.

**Request body:**

```json
{
  "eventId": "<event-id>",
  "notificationStatus": "SENT",
  "providerMessageId": "<provider-message-id>",
  "processedAt": "2026-11-20T15:30:00Z"
}
```

**Field contract:**

| Field | Type | Required | Rules |
|---|---|---:|---|
| `eventId` | string | Yes | Stable ID of the originating `CATALOG_ENQUIRY_SUBMITTED` event; used for idempotency. |
| `notificationStatus` | enum | Yes | Must be `SENT` for this success callback. |
| `providerMessageId` | string | Yes | Identifier returned by the email provider when accepted. |
| `processedAt` | timestamp | Yes | ISO 8601 timestamp representing the successful provider acceptance time. |

The callback must only be sent after Notification Service has durably recorded the successful email outcome and pending callback state in its own database.

**Catalog Service behaviour:**

1. Authenticate the internal caller.
2. Validate the payload and event identity.
3. Verify that the enquiry exists.
4. In one Catalog Service transaction, record the callback event ID and apply `RECEIVED → PROCESSED` when allowed.
5. Never regress a `RESOLVED` enquiry to `PROCESSED`.
6. Return a response that distinguishes an applied transition, a duplicate callback and a safely ignored stale callback from transient failures.

**Success:** `200 OK`

First successful callback:

```json
{
  "enquiryId": "<uuid>",
  "status": "PROCESSED",
  "callbackResult": "APPLIED"
}
```

Repeated callback with the same event ID:

```json
{
  "enquiryId": "<uuid>",
  "status": "PROCESSED",
  "callbackResult": "DUPLICATE"
}
```

Callback received after the enquiry has already become `RESOLVED`:

```json
{
  "enquiryId": "<uuid>",
  "status": "RESOLVED",
  "callbackResult": "STALE_IGNORED"
}
```

`callbackResult` values are `APPLIED`, `DUPLICATE` and `STALE_IGNORED`. All three indicate that Catalog Service has handled the callback safely and Notification Service may mark its callback record complete.

**Errors:**

- `400 Bad Request` for malformed JSON or invalid fields.
- `401 Unauthorized` or `403 Forbidden` for an unauthenticated/unauthorized service caller, according to the selected authentication mechanism.
- `404 Not Found` when the enquiry does not exist.
- `409 Conflict` for an event identity or state conflict that cannot be treated as a safe duplicate/stale callback.
- `503 Service Unavailable` for a transient Catalog Service dependency/storage failure; Notification Service must retain and retry the callback.
- `500 Internal Server Error` for an unexpected failure.

A non-2xx response must not cause Notification Service to resend an email that has already been accepted by the provider. Callback retries are independent from email-delivery retries.

---

## 5. Enquiry Lifecycle and API Boundary

The public API supports enquiry creation and a read-only, PII-free status lookup (§3.2). There is no public endpoint for resolving enquiries or changing their status.

The only normal lifecycle transitions are:

`RECEIVED → PROCESSED → RESOLVED`

| Trigger | Owner | Result |
|---|---|---|
| Enquiry and Outbox commit | Catalog Service | Create as `RECEIVED` |
| Successful email provider acceptance and callback persistence | Catalog Service, invoked by Notification Service | `PROCESSED` |
| Explicit sales business action | Catalog Service domain/service operation | `RESOLVED` |

Do not create an unauthenticated public status-update endpoint. The sales resolution operation is a domain capability only until an authenticated sales workflow is separately approved.

---

## 6. Normalized Product DTO

The public API must expose the internal normalized product representation, not the raw Fake Store API response model.

```json
{
  "id": "1",
  "title": "Example product",
  "description": "Example description.",
  "category": "electronics",
  "imageUrl": "https://example.invalid/product.png",
  "price": {
    "amount": 99.99,
    "currency": "USD"
  },
  "rating": {
    "rate": 4.5,
    "count": 120
  }
}
```

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | string | Yes | Normalize the provider identifier to a string. |
| `title` | string | Yes | Product title. |
| `description` | string | Yes | Product description. |
| `category` | string | Yes | Canonical category key/name used by category filtering. |
| `imageUrl` | string | Yes | Validated product image URL. |
| `price.amount` | number | Yes | Non-negative monetary amount. |
| `price.currency` | string | Yes | ISO 4217 currency code for the configured provider's price currency. |
| `rating` | object or `null` | Yes | Use `null` if rating data is unavailable. |
| `rating.rate` | number | Conditional | Provider rating value. |
| `rating.count` | integer | Conditional | Number of rating/review records when supplied by the provider. |

The provider adapter is responsible for validating source data, mapping it into this DTO and preventing provider-specific fields from leaking into the API.

---

## 7. HTTP Status and Error Code Matrix

| Situation | HTTP status | Expected behaviour |
|---|---:|---|
| Successful catalogue read | `200` | Return the documented data envelope. |
| Enquiry durably committed with Outbox event | `202` | Return `RECEIVED`; do not wait for email. |
| Invalid JSON or malformed parameter | `400` | Return a safe validation error. |
| Field validation or invalid entity reference | `422` | Return field/entity validation details. |
| Product/category/enquiry not found | `404` | Return a stable not-found code. |
| Idempotency/state conflict not safely handled | `409` | Return a conflict code; do not silently mutate state. |
| Rate limit exceeded | `429` | Include standard retry guidance where available. |
| Temporary service/dependency failure | `503` | Client/service may retry according to operation semantics. |
| Invalid upstream provider response | `502` | Do not return an empty success response. |
| Upstream provider timeout | `504` | Return a safe timeout error. |
| Unexpected internal failure | `500` | Do not expose stack traces or internal details. |

An endpoint may use only the statuses relevant to its operation. In particular, do not return `202` unless the enquiry and Outbox event have committed successfully.

---

## 8. Security, Privacy and Operational Requirements

- Public enquiry submission is rate-limited.
- Validate all request bodies and path/query parameters at the Catalog Service boundary.
- Resolve sales recipients using trusted server-side configuration.
- Do not permit customer input to select arbitrary email recipients or templates.
- Protect the internal callback with private service connectivity and service-to-service authentication.
- Keep the internal callback outside public Gateway routing.
- Do not log full enquiry bodies, customer contact details, email content, credentials or provider secrets.
- Return generic internal errors with a correlation/request ID; keep technical details in appropriately redacted logs.
- Enforce request size limits and safe JSON parsing.
- Propagate `X-Correlation-ID` through the request, Outbox event, SQS message and internal callback where available.
- Never use a correlation ID or event ID as an authorization mechanism.

---

## 9. Contract Verification Checklist

The following checklist is a verification plan, not a statement that these checks have already passed.

- [ ] `docs/openapi.yaml` defines every public and private route in this document.
- [ ] Public routes are reachable only through the API Gateway path.
- [ ] Notification Service is not exposed through the public Gateway.
- [ ] Product IDs are normalized consistently to strings.
- [ ] Featured-products endpoint returns exactly five backend-configured products.
- [ ] Category response separates `topRated` and `additionalProducts` without duplicates.
- [ ] Search matches only title, description and category using the approved partial case-insensitive behaviour.
- [ ] Empty/whitespace-only search query is rejected.
- [ ] Product detail endpoint returns `404` for a missing product.
- [ ] Enquiry endpoint returns `202` only after enquiry and Outbox transaction commit.
- [ ] Enquiry API accepts only `PRODUCT` and `CATEGORY` entity types.
- [ ] Sales recipient is not accepted from the client.
- [ ] Email delivery and callback retry status are not returned as Catalog enquiry business status.
- [ ] Internal callback is authenticated, private, idempotent and never regresses `RESOLVED`.
- [ ] Callback duplicate and stale outcomes are distinguishable from transient failures.
- [ ] Error bodies follow the common error envelope and do not disclose internals.
- [ ] Contract tests validate request and response schemas.
- [ ] README examples and frontend API calls match the final implemented contract.

---

## 10. Change Control

When implementation reveals a necessary contract change:

1. Check the original assessment and `SPEC.md` first.
2. Record an ambiguity in `ASSUMPTIONS.md` when the requirement is unspecified.
3. Record a material architectural or API decision in `DECISIONS.md` where appropriate.
4. Update this document and `docs/openapi.yaml` together.
5. Update backend validators, frontend types and contract tests in the same change.
6. Update `README.md` and `PR_DESCRIPTION.md` if public setup or reviewer-visible behaviour changes.

Do not silently change route names, response envelopes, validation rules, lifecycle semantics or error meanings.
