-- Payment tracking for branded quotes (cash / Zelle / PayPal / other).
-- Status may become 'paid'; paid_at + payment_method record how it was settled.

ALTER TABLE quotes ADD COLUMN paid_at TEXT;
ALTER TABLE quotes ADD COLUMN payment_method TEXT;
ALTER TABLE quotes ADD COLUMN payment_note TEXT;
