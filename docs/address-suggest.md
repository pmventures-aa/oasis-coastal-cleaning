# Florida address typeahead (admin)

Admin **ZIP → Street** fields (New Quote, New Lead, Profile) suggest Florida
addresses in the ZIP you enter. Street is locked until ZIP is 5 digits.

## How Kristina should enter an address

1. **ZIP first** (e.g. `33063`) — fills City when known (Margate for 33063,
   not the USPS postal city “Pompano Beach”). Street field unlocks.
   Changing or re-entering ZIP always refreshes City.
2. **Street next** (e.g. `2156 NW 62nd Ave`) — suggestions stay in that ZIP.
   Abbreviations expand (`NW` → Northwest, `Ave` → Avenue).
3. Tap a suggestion — street, city, and ZIP are filled. If the map only has
   the street (no house number), we still keep the number she typed.

## API

`GET /api/admin/address-suggest` (signed-in only)

| Query | Result |
|---|---|
| `?zip=33063` | `{ place: { zip, city, lat, lon } }` |
| `?q=2156%20NW%2062nd%20Ave&zip=33063` | `{ suggestions: [ … ] }` |

## Providers

1. **Nominatim** (when ZIP + house number) — house-level match, correct city
2. **Mapbox** (optional) — Cloudflare secret `MAPBOX_ACCESS_TOKEN`
3. **Photon / OpenStreetMap** — street autocomplete; OSM often stores the road
   on `name` (not `street`), which we now treat as a street
4. **Typed fallback** — if nothing matches, offer the typed street + ZIP city
