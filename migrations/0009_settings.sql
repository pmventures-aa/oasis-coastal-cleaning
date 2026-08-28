-- Things Kristina should be able to change without anyone editing a file.
-- One row per setting, so adding one later is an insert rather than a
-- migration. Values are text; the code decides what each one means.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT
);
