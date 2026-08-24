# Oasis Coastal Cleaning — website

Static site. Plain HTML, CSS and vanilla JavaScript — no framework, no build step,
no `npm install`. What is in this folder is exactly what gets served.

It is a **separate Cloudflare Pages project** from anything else in this repository.
Nothing here shares a project, a domain or a binding with the rest of the repo.

---

## 1. Before it goes live

Four things need real values. All four live in **`js/data.js`**, marked `← SET THIS`.

| What | Where | Why it matters |
|---|---|---|
| Phone number | `business.phone` | Right now it is `(561) 555-0100`, a reserved test number that will not ring. Every Call and Text button on the site is built from it. |
| License and insurance wording | `business.licenseNote` | It appears on every page. Only publish it once the paperwork is real — set it to `''` to hide the badge until then. |
| Kristina's own paragraph | `about.ownerNote` | The About page reads fine without it, but a real paragraph in her voice is the single biggest trust signal on the site. |
| A photo of her | `about.photo` | Drop a JPG in `/social/` and point at it, e.g. `'/social/kristina.jpg'`. A face converts better than a logo. |

Two more to switch on when ready: `turnstileSiteKey` (spam protection, §4)
and `business.social` (footer links).

---

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
   - Build output directory: `oasis-coastal-cleaning`
   - Root directory: `/`
5. Save and deploy.
6. Add the custom domain and the `www` variant under **Custom domains**.

Or from a terminal, inside this folder:

```sh
npx wrangler pages deploy . --project-name oasis-coastal-cleaning
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

## 5. What is in here

```
index.html … contact.html   the eight pages, plus thank-you and 404
js/data.js                  ← the file to edit
js/site.js                  renders the header, footer, sticky bar and every list
js/quote.js                 the quote form and its live estimate
css/site.css                layout and components
tokens.css                  brand colors and type — do not hard-code a hex anywhere else
functions/api/quote.js      the form handler
logo/ favicon/ social/      brand images, already sized
_headers _redirects         caching, security headers, old-URL redirects
sitemap.xml robots.txt      search engines
wrangler.toml               deploy config for this project only
```

## 6. Notes on the build

- **Mobile first.** The sticky Call · Text · Quote bar is the highest-converting
  element on a home services site; it is on every page below 860px.
- **The estimate is a range, never a fixed price.** It is computed in the browser
  from `js/data.js` and is deliberately ±10% around the calculation, with the
  caveat text next to it on every screen size.
- **No reviews are invented.** The testimonials list ships empty on purpose.
- **The logo is never placed on a photo** and the name is never set beside the
  badge, per the brand book — the badge already contains both.
- Accessibility: skip link, visible focus rings, labelled fields, 44px tap
  targets, and the whole site works with the keyboard.
