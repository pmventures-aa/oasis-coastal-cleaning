-- Which of the two ways a quote came to be marked paid: derived from its
-- invoices, or marked by hand on a job that was never billed. Without it,
-- voiding a payment could not tell a cache it owned from her own decision.
ALTER TABLE quotes ADD COLUMN paid_source TEXT;
