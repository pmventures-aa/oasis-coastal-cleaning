-- Oasis Coastal Cleaning — every email she sends a customer, written down.
--
-- The rule this exists to keep: nothing reaches a customer unless she tapped
-- a button for it. There is no cron, no trigger, no send-on-status-change.
-- So the only question left is "did I already send that?", and until now the
-- answer lived in her memory and in her sent folder.
--
-- One row per attempt, written whether it went or not, never updated. A
-- failure is as much a fact as a success: "I sent that on Tuesday" and "it
-- bounced on Tuesday" are different things for her to act on.
--
-- Apply with the Cloudflare dashboard (D1 -> oasis -> Console) or:
--   npx wrangler d1 migrations apply oasis --remote

CREATE TABLE IF NOT EXISTS email_log (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,

  -- Which letter: request_received, quote, booking_confirmation,
  -- visit_reminder, on_my_way, visit_summary, invoice.
  kind        TEXT NOT NULL,

  -- What it was about, so a client profile can show every letter about them
  -- without caring which screen it was sent from.
  entity_kind TEXT,            -- lead | quote | appointment | invoice | customer
  entity_id   TEXT,
  customer_id TEXT,

  to_email    TEXT NOT NULL,
  subject     TEXT NOT NULL,

  -- sent | failed. A row is never rewritten: a second try is a second row.
  status      TEXT NOT NULL DEFAULT 'sent',
  error       TEXT,

  -- Null until there are named users. Then it answers "who sent this?"
  sent_by     TEXT,

  -- True when she edited the wording in the preview before sending, so a
  -- letter that does not match the template is not a mystery later.
  edited      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_email_log_entity ON email_log(entity_kind, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_email_log_customer ON email_log(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_email_log_kind ON email_log(kind, created_at);
