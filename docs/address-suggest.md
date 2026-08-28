# Florida address typeahead (admin)

The admin **Street address** fields (New Quote, New Lead, Profile) suggest
Florida addresses as you type. International results are filtered out.

## How it works

`GET /api/admin/address-suggest?q=…` (signed-in only) returns:

```json
{ "ok": true, "suggestions": [
  { "address": "100 N Ocean Blvd", "city": "Boca Raton", "state": "FL", "zip": "33432", "label": "…" }
]}
```

Picking a suggestion fills street, city, and ZIP.

## Providers

1. **Mapbox** (optional) — if Cloudflare secret `MAPBOX_ACCESS_TOKEN` is set,
   suggestions use Mapbox Geocoding, still limited to a Florida bounding box and
   `country=US`.
2. **Photon / OpenStreetMap** (default) — free, no key. Same Florida bbox filter
   plus a US/Florida check on each result.

## Optional Mapbox setup

1. Create a token at [mapbox.com](https://account.mapbox.com/access-tokens/).
2. Cloudflare → Workers & Pages → `oasis-coastal-cleaning` → Variables and secrets.
3. Add Production secret `MAPBOX_ACCESS_TOKEN`.
4. Redeploy the latest deployment.

Without Mapbox, Florida suggestions still work via Photon.
