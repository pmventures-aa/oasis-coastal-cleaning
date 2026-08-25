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
done
echo "stamped ?v=$TOKEN"
grep -ho '?v=[0-9a-zA-Z.-]*' public/index.html | sort -u
