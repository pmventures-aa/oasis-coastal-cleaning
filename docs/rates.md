# Kristina's working rates

**Not published anywhere.** This file lives outside `public/`, so it is never
served to the website — it is a private reference for writing quotes.

Deliberately kept out of `public/js/data.js`, because anything in there is
downloaded by every visitor and readable in the browser's View Source.

## Starting points

Her revised figures, August 2026:

| Service | Starts at | Basis |
|---|---|---|
| Home Cleaning | $120 | per visit |
| Office Cleaning | $100 | per visit |
| Organizing | $40 | per hour |
| Laundry | $15 | per hamper |

These floors (plus per-add-on starting prices) also power the tap-to-add chips in
the admin quote composer (`public/js/admin-catalog.js`). That file is only loaded
on `/admin`, not the public site. She can still edit any price after tapping;
the last price she used for each chip is remembered in her browser.

These are floors, not quotes. What moves a real number up:

- More square footage, more bathrooms, more floors
- The first visit, which catches up on everything that has built up
- Pets
- Add-ons — inside the oven, the fridge, windows, wall washing
- A one-time visit rather than a standing one

And down:

- Weekly or biweekly instead of one-off
- A home that is already tidy on arrival
- Rooms she is asked to skip
- Several add-ons bundled into one visit
- Being on a route she already drives that day

## Why the site shows no prices

Every job is quoted individually after reading what the customer sent. A
figure published before anyone has seen the house is either padded to cover the
worst case, or about to be revised upward once she walks in — and once it is on
the page, it caps what she can quote.

The quote form collects enough detail to price a job properly: service, size,
bedrooms and baths, frequency, add-ons, pets, stairs, city, access and their own
notes. All of it lands in the dashboard at `/admin`, where she writes a branded
quote with custom line items and emails it. The customer opens a private link
and clicks to accept.
