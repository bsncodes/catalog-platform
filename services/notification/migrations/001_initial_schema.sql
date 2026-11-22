-- Notification Service owned schema. Never accessed by Catalog Service.
CREATE TABLE notification_deliveries (
  id                        UUID PRIMARY KEY,
  event_id                  UUID NOT NULL UNIQUE,
  enquiry_id                UUID NOT NULL, -- cross-service reference only; no foreign key
  event_type                TEXT NOT NULL,
  event_version             INTEGER NOT NULL,
  entity_type               TEXT NOT NULL,
  correlation_id            TEXT NULL,
  email_status              TEXT NOT NULL DEFAULT 'PENDING' CHECK (email_status IN ('PENDING', 'SENT', 'FAILED')),
  callback_status           TEXT NULL CHECK (callback_status IN ('PENDING', 'COMPLETED', 'FAILED')),
  provider_message_id       TEXT NULL,
  attempt_count             INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  callback_attempt_count    INTEGER NOT NULL DEFAULT 0 CHECK (callback_attempt_count >= 0),
  last_email_attempt_at     TIMESTAMPTZ NULL,
  last_callback_attempt_at  TIMESTAMPTZ NULL,
  email_sent_at             TIMESTAMPTZ NULL,
  email_lease_until         TIMESTAMPTZ NULL,
  next_callback_retry_at    TIMESTAMPTZ NULL,
  callback_completed_at     TIMESTAMPTZ NULL,
  last_email_error          TEXT NULL,
  last_callback_error       TEXT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sent_has_provider_reference CHECK (email_status <> 'SENT' OR (provider_message_id IS NOT NULL AND email_sent_at IS NOT NULL)),
  CONSTRAINT callback_requires_sent_email CHECK (callback_status IS NULL OR email_status = 'SENT')
);
CREATE INDEX notification_deliveries_callback_due_idx ON notification_deliveries (next_callback_retry_at) WHERE callback_status = 'PENDING';
CREATE INDEX notification_deliveries_enquiry_idx ON notification_deliveries (enquiry_id);
