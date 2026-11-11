-- What the cleaner needs at the door.
--
-- The property already carried getting in, parking, pets, the day they
-- like and a note. These are the rest of what Kristina currently keeps in
-- her head or in a text thread, and what a new cleaner has no way to know:
-- where the bins go, where the supplies are kept, what not to touch, and
-- anything that could hurt somebody or cost money.
--
-- On the PROPERTY, not the customer: a client with two addresses has two
-- answers, and a warning about the wrong house is worse than none.

ALTER TABLE properties ADD COLUMN bins TEXT;          -- "Kerb Tuesday night, green is recycling"
ALTER TABLE properties ADD COLUMN supplies TEXT;      -- "Under the sink. Hoover in the hall cupboard."
ALTER TABLE properties ADD COLUMN do_not_touch TEXT;  -- "Study desk. Mother's china in the dresser."
ALTER TABLE properties ADD COLUMN warnings TEXT;      -- "Loose step on the deck. Alarm arms at 6."
