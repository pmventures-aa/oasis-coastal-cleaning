-- A quote does not stop mattering when it is accepted. The work still has to
-- happen and the money still has to arrive, and those are the two things
-- Kristina chases. Both are on the quote, because that is what names the price.
ALTER TABLE quotes ADD COLUMN completed_at TEXT;
ALTER TABLE quotes ADD COLUMN paid_at TEXT;
ALTER TABLE quotes ADD COLUMN paid_note TEXT;
