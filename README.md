# Oasis Coastal Cleaning — website

Static site. Plain HTML, CSS and vanilla JavaScript — no framework, no build step,
no `npm install`. What is in this repository is exactly what gets served.

It stands entirely on its own: its own repository, its own Cloudflare Pages project,
its own domain and its own secrets. It shares no code, database, storage binding or
environment variable with any other site.

---

## 1. Before it goes live

Two things still need real values, both in **`public/js/data.js`**, marked `← SET THIS`.

| What | Where | Why it matters |
|---|---|---|
| License and insurance wording | `business.licenseNote` | It appears on every page. Only publish it once the paperwork is real — set it to `''` to hide the badge until then. |
| Kristina's own paragraph and photo | `about.ownerNote`, `about.photo` | The About page reads fine without them, but a face and a paragraph in her voice are the biggest trust signals on a site where someone is deciding whether to hand over a key. |

Phone and email are set: **(561) 201-7123** and **info@oasiscoastalcleaning.com**.

**Also worth a pass before launch:** every add-on price in `data.js` is a
placeholder at ordinary South Florida rates, and so are the bundle discount
percentages. They decide what Kristina gets suggested when a lead comes in, so
they should be her real numbers.

## 2. Changing the site

**Everything lives in `js/data.js`.** Every list, card, dropdown, price and
menu on the site is rendered from it. Editing that one file is the whole job.

- **Add a city** — put its name in the right group under `areas`. It appears on the
  service-area page, in the quote form dropdown and in the data Google reads.
- **Add a service** — copy an existing block in `services`. Four more are already
  written and waiting: move-in/move-out, rental turnovers and post-construction.
  Change `active: false` to `active: true` and the service appears on the services
  page, the pricing table and the quote form. That is the entire change.
- **Change a price** — `startingAt` is the "from" figure shown on cards and in the
  table. `estimate.hourlyRate`, `estimate.sizes[].hours` and `estimate.minimum`
  drive the live range on the quote form.
- **Add a review** — put it in `testimonials`. While that list is empty the reviews
  section removes itself from the home page, so nothing looks unfinished. Only put
  real ones in.
- **Add an FAQ** — one entry in `faqs`. It also feeds the FAQ data Google reads.
- **Change the menu** — reorder or rename entries in `nav`.

After editing, hard-refresh the browser (Cmd/Ctrl + Shift + R). Scripts are cached
for a day, so a normal refresh may show the old version.

---

## 3. Deploying

### First time

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages**.
2. Connect this repository. **Create a new project** — do not reuse an existing one.
3. Project name: `oasis-coastal-cleaning`
4. Build settings:
   - Framework preset: **None**
   - Build command: **leave empty**
   - Build output directory: `public`
   - Root directory: **leave empty**
5. Save and deploy.
6. Add the custom domain and the `www` variant under **Custom domains**.

**The layout is load-bearing.** Everything served lives in `public/`, and
`functions/` sits *outside* it at the repository root. Cloudflare compiles
`functions/` from the root and serves `public/` as the site, which is how
`/api/quote` works. Putting `functions/` inside the output directory, or
pointing the output directory at the repository root, fails the deploy.

Confirm it after the first deploy. The first request should answer, the second
should not:

```sh
curl -i https://oasis-coastal-cleaning.pages.dev/api/quote
#  → 405, "Send this form with POST."   ← the form handler is live

curl -i https://oasis-coastal-cleaning.pages.dev/api/health
#  → 404                                ← nothing else is attached
```

Or deploy straight from a terminal, in the repository root:

```sh
npx wrangler pages deploy public --project-name oasis-coastal-cleaning
```

### After that

Every push to the branch redeploys. There is no build to break.

---

## 4. The quote form

`functions/api/quote.js` is a Cloudflare Pages Function. It checks the spam token,
checks the fields, and emails the lead.

Set these under **Pages → Settings → Environment variables**:

| Variable | Required | What it is |
|---|---|---|
| `RESEND_API_KEY` | yes, to receive leads | Secret from [resend.com](https://resend.com). Without it the form tells the visitor email is not set up and offers them a mailto link instead — leads are never silently dropped. |
| `TURNSTILE_SECRET_KEY` | recommended | Secret half of the Turnstile pair. Pairs with `turnstileSiteKey` in `js/data.js`. Leave both empty and the check is skipped. |
| `QUOTE_TO_EMAIL` | no | Where leads land. Defaults to `info@oasiscoastalcleaning.com`. |
| `QUOTE_FROM_EMAIL` | no | A sender verified in Resend. Until the domain is verified, leave it unset. |

**Turning on spam protection:** Cloudflare dashboard → Turnstile → Add site →
copy the **site key** into `turnstileSiteKey` in `js/data.js`, and put the
**secret key** in the environment variable above. The widget appears on the form
by itself. A hidden honeypot field is always on regardless.

---

## 4b. The leads portal

Quote requests land at **`/admin`**. It needs three settings before it can show
anything; until then it displays its own setup instructions rather than an error.

| Setting | What it is |
|---|---|
| `ADMIN_PASSWORD` | The password for `/admin`. A secret. |
| `SESSION_SECRET` | Any long random string. Signs the login cookie. A secret. |
| `DB` binding | A D1 database, added in `wrangler.toml` — see the comments there. |

Setting it up, once:

```sh
npx wrangler d1 create oasis
# paste the printed database_id into wrangler.toml and uncomment that block
npx wrangler d1 migrations apply oasis --remote
git commit -am "Bind the leads database" && git push
```

Then add `ADMIN_PASSWORD` and `SESSION_SECRET` under **Settings → Variables and
secrets**, and retry the latest deployment so they take effect.

**The site works without any of this.** Requests are still emailed, the forms
still submit, nothing breaks — the portal simply has nothing to list. That is
deliberate: a missing binding should never take the site down.

Inside the portal each request opens to show everything the visitor sent, with
call, text and email buttons, a status you can move through
new → contacted → quoted → booked → closed, and a notes box that saves when you
click away. Anyone who asked for a call or a walkthrough on the confirmation
screen is flagged in the list.

## 5. What is in here

```
public/                     everything that is served — this is the site
  index.html … contact.html the eight pages, plus thank-you and 404
  admin/index.html          the leads portal
  js/data.js                ← the file to edit
  js/site.js                renders the header, footer, sticky bar and every list
  js/quote.js               the six-step quote request
  js/admin.js               the leads portal
  css/site.css              layout and components
  css/admin.css             the portal only
  tokens.css                brand colors and type — never hard-code a hex elsewhere
  logo/ favicon/ social/    brand images, already sized
  _headers _redirects       caching, security headers, old-URL redirects
  sitemap.xml robots.txt    search engines
functions/                  the API — must stay OUTSIDE public/
  api/quote.js              takes a request, stores it, emails her
  api/followup.js           the "call me" / "come see it" buttons
  api/admin/*.js            sign in, sign out, list and update leads
  _lib/                     shared helpers and session signing
migrations/0001_leads.sql   the leads table
```

## 6. Notes on the build

- **Mobile first.** The sticky Call · Text · Quote bar is the highest-converting
  element on a home services site; it is on every page below 860px.
- **No price is ever shown to a visitor.** Every figure on the site is a
  "starting at". The estimator still runs, but its number rides along with the
  submission so Kristina has something to quote against — set
  `showCustomerEstimate` to true in `data.js` if that should ever change.
- **The quote request is six short steps.** People answer more when each screen
  asks little. Nothing is sent until the last one, and the confirmation screen
  invites a call or an in-person walkthrough.
- **No reviews are invented.** The testimonials list ships empty on purpose.
- **The logo is never placed on a photo** and the name is never set beside the
  badge, per the brand book — the badge already contains both.
- Accessibility: skip link, visible focus rings, labelled fields, 44px tap
  targets, and the whole site works with the keyboard.
