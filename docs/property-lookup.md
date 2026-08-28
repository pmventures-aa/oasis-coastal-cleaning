# Property lookup (beds / baths / sq ft)

The admin **Fill beds / baths / sq ft** button looks up public property records
from [RentCast](https://developers.rentcast.io/reference/introduction.md) and
fills bedrooms, bathrooms, size, and property type.

Zillow does **not** offer a public API for this.

We call their single-property query exactly as documented:

```
GET https://api.rentcast.io/v1/properties?address=Street,%20City,%20State,%20Zip
Header: X-Api-Key: <RENTCAST_API_KEY>
```

No other query parameters (`limit`, `city`, `zipCode`) are sent. Mixing those
in with a street address turns the request into a bulk area search and is why
lookup can fail even with a valid key.

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

After that, open any lead in `/admin/`, confirm street + city (or ZIP) is filled,
and tap **Fill beds / baths / sq ft**.

## Notes

- Best intake: street on its own, city from the dropdown, 5-digit ZIP.
- A full line pasted into Address (`123 Main St, Boca Raton, FL 33432`) is parsed.
- Free tier is 50 requests/month; each tap uses one request (two if the street
  has an apt/unit we retry without).
- Source: `functions/_lib/rentcast.js`
