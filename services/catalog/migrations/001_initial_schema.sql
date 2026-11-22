-- Catalog Service owned schema. Never accessed by Notification Service.
CREATE TABLE catalog_enquiries (
  id               UUID PRIMARY KEY,
  entity_type      TEXT NOT NULL CHECK (entity_type IN ('PRODUCT', 'CATEGORY')),
  entity_id        TEXT NOT NULL,
  entity_snapshot  JSONB NOT NULL,
  customer_name    TEXT NOT NULL,
  customer_email   TEXT NOT NULL,
  customer_phone   TEXT NOT NULL,
  message          TEXT NULL,
  status           TEXT NOT NULL CHECK (status IN ('RECEIVED', 'PROCESSED', 'RESOLVED')),
  received_at      TIMESTAMPTZ NOT NULL,
  processed_at     TIMESTAMPTZ NULL,
  resolved_at      TIMESTAMPTZ NULL,
  resolved_by      TEXT NULL,
  resolution_notes TEXT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX catalog_enquiries_status_idx ON catalog_enquiries (status, received_at DESC);
CREATE INDEX catalog_enquiries_entity_idx ON catalog_enquiries (entity_type, entity_id, created_at DESC);

CREATE TABLE outbox_events (
  id                    UUID PRIMARY KEY,
  aggregate_type        TEXT NOT NULL,
  aggregate_id          UUID NOT NULL REFERENCES catalog_enquiries (id),
  event_type            TEXT NOT NULL,
  event_version         INTEGER NOT NULL,
  payload               JSONB NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at          TIMESTAMPTZ NULL,
  claimed_by            TEXT NULL,
  claim_expires_at      TIMESTAMPTZ NULL,
  publish_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (publish_attempt_count >= 0),
  last_publish_error    TEXT NULL
);
CREATE INDEX outbox_events_unpublished_idx ON outbox_events (created_at) WHERE published_at IS NULL;

CREATE TABLE processed_events (
  event_id        UUID PRIMARY KEY,
  enquiry_id      UUID NOT NULL REFERENCES catalog_enquiries (id),
  callback_result TEXT NOT NULL CHECK (callback_result IN ('APPLIED', 'STALE_IGNORED')),
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX processed_events_enquiry_idx ON processed_events (enquiry_id, processed_at DESC);
