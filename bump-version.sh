#!/bin/sh
# Stamps every stylesheet and script reference in public/ with ?v=<token>.
#
# Why this exists: Cloudflare's edge caches /css/site.css and /js/site.js but
# never caches the HTML (it comes back cf-cache-status: DYNAMIC). A deploy that
# only changes CSS therefore reaches nobody until the old cached copy expires —
# which is how a finished design sat invisible behind a day-old cache. Because
# the HTML is always fresh, pointing it at a URL the edge has never seen gets
# the new file to every visitor at once, with no cache purge.
#
# Run this after changing anything in css/ or js/, then commit and push.
set -e
cd "$(dirname "$0")"
TOKEN="${1:-$(date -u +%Y%m%d%H%M)}"
for f in public/*.html public/admin/index.html; do
  [ -f "$f" ] || continue
  # Strip any existing token first so re-runs do not stack them.
  sed -i -E 's#(href="/(tokens\.css|css/[a-z-]+\.css))(\?v=[0-9a-zA-Z.-]+)?"#\1?v='"$TOKEN"'"#g' "$f"
  sed -i -E 's#(src="/js/[a-z-]+\.js)(\?v=[0-9a-zA-Z.-]+)?"#\1?v='"$TOKEN"'"#g' "$f"
  # The portal's manifest is a static asset too, so the edge caches it and a
  # changed start_url or icon would not reach a phone that had seen the old one.
  sed -i -E 's#(href="/admin/app\.webmanifest)(\?v=[0-9a-zA-Z.-]+)?"#\1?v='"$TOKEN"'"#g' "$f"
  # The font preloads must carry the SAME token as the url() in tokens.css
  # below, or the browser preloads one URL, the stylesheet asks for another,
  # and every visitor downloads each font twice.
  sed -i -E 's#(href="/fonts/[a-z-]+\.woff2)(\?v=[0-9a-zA-Z.-]+)?"#\1?v='"$TOKEN"'"#g' "$f"
done
# Stamping the font URLs means /fonts/* can be cached for a year (see
# public/_headers): a replaced file reaches everyone on the next deploy because
# its URL changes, rather than waiting for a cache to expire.
sed -i -E "s#(url\('/fonts/[a-z-]+\.woff2)(\?v=[0-9a-zA-Z.-]+)?'#\1?v=$TOKEN'#g" public/tokens.css
echo "stamped ?v=$TOKEN"
grep -ho '?v=[0-9a-zA-Z.-]*' public/index.html | sort -u

# The pages carry a prerendered copy of everything js/site.js builds from
# js/data.js, so the first paint is the finished page instead of a set of
# holes. That copy is only true until data.js changes, and this script already
# has to run after any js change, so it is also where the copy gets rebuilt.
node tools/prerender.mjs
