# Florida address typeahead (admin)

Admin **ZIP → Street** fields (New Quote, New Lead, Profile) suggest Florida
addresses near the ZIP you enter. International results are filtered out.

## How Kristina should enter an address

1. **ZIP first** (e.g. `33063`) — fills City when known (Margate).
2. **Street next** (e.g. `2156 NW 62nd Ave`) — suggestions use that ZIP as a
   location bias and expand abbreviations (`NW` → Northwest, `Ave` → Avenue).
3. Tap a suggestion — street, city, and ZIP are filled. If OpenStreetMap only
   has the street (no house number), we still keep the number she typed.

## API

`GET /api/admin/address-suggest` (signed-in only)

| Query | Result |
|---|---|
| `?zip=33063` | `{ place: { zip, city, lat, lon } }` |
| `?q=2156%20NW%2062nd%20Ave&zip=33063` | `{ suggestions: [ … ] }` |

## Providers

1. **Mapbox** (optional) — Cloudflare secret `MAPBOX_ACCESS_TOKEN`
2. **Photon / OpenStreetMap** (default) — free, no key

OSM coverage varies by street. ZIP-first + abbreviation expansion makes Margate /
Broward addresses much more reliable than free-typing street alone.
