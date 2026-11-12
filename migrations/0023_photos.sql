-- Photos from a visit.
--
-- The file goes in R2; this is the row that says what it is and, above
-- all, whether a client may see it. Default is no. A photo of the inside
-- of somebody's house is not published because a cleaner took it: she
-- ticks it through, the same gate as an issue.
--
-- The object key is stored, never a public URL. The bucket is private and
-- every read goes through a route that checks who is asking.

CREATE TABLE IF NOT EXISTS visit_photos (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  customer_id    TEXT,

  object_key     TEXT NOT NULL,
  file_name      TEXT,
  content_type   TEXT,
  size_bytes     INTEGER,

  caption        TEXT,
  -- The gate. Nothing reaches a client on nobody's say-so.
  client_visible INTEGER NOT NULL DEFAULT 0,
  approved_at    TEXT,
  approved_by    TEXT,

  uploaded_by    TEXT,
  archived_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_visit_photos_appt
  ON visit_photos(appointment_id, archived_at);
