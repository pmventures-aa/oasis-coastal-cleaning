# Property lookup (beds / baths / sq ft)

The admin **Fill beds / baths / sq ft** button looks up public property records
from the street address on a lead and fills bedrooms, bathrooms, size, and
property type.

Zillow does **not** offer a public API for this. We use **RentCast**.

## One-time setup (about 2 minutes)

1. Sign up free at [app.rentcast.io](https://app.rentcast.io/app/api) → create an
   API key (Developer plan includes **50 lookups/month**).
2. Cloudflare dashboard → **Workers & Pages** → **oasis-coastal-cleaning** →
   **Settings** → **Variables and secrets**.
3. Add a **Secret** named exactly:
   ```
   RENTCAST_API_KEY
   ```
   Paste the RentCast key.
4. **Redeploy** the latest deployment (Environment changes only apply to a new
   deploy). Deployments → ⋮ on the latest → Retry deployment.

After that, open any lead in `/admin/`, confirm the address is filled, and tap
**Fill beds / baths / sq ft** (on the Quotes bar or Intake → Property).

## Notes

- Address format that works best: street + city + ZIP (state defaults to FL).
- Free tier is 50 requests/month; each tap uses one request.
- Source code: `functions/api/admin/property-lookup.js`
