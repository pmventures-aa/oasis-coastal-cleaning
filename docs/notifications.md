# Getting the leads to Kristina

Every quote request is written to the D1 database and shows up in the portal at
`/admin/` whether or not any of this is set up. This file is only about the
push — getting a message to her the moment one lands, so she does not have to
remember to check.

The code does not care which company carries the message. Whichever key is set
in the Pages project decides. Set two and they both fire, which is how you move
from one to another without a gap.

Cloudflare dashboard → Workers & Pages → **oasis-coastal-cleaning** → Settings →
Variables and secrets → **Production**. Add as a **Secret**, then redeploy.

---

## Option 1 — Resend

3,000 emails a month, 100 a day, free, no card.

1. Sign up at resend.com **using info@oasiscoastalcleaning.com**. That address
   is then verified on the account, which matters for step 3.
2. API Keys → Create API Key → sending access → copy it.
3. Add secret `RESEND_API_KEY`.

That works immediately, sending from `onboarding@resend.dev`. Resend's shared
address will only deliver to the address the account was opened with — fine
here, since that is exactly where the leads are going.

To send from her own domain instead: Domains → Add `send.oasiscoastalcleaning.com` →
Resend shows DNS records → add them in Cloudflare DNS → then set `QUOTE_FROM_EMAIL`
in wrangler.toml, e.g. `Oasis Coastal Cleaning <quotes@send.oasiscoastalcleaning.com>`.

### Quote delivery tracking (Resend webhook)

Webhook endpoint (live): `https://www.oasiscoastalcleaning.com/api/webhooks/resend`

Events: `email.delivered`, `email.opened`, `email.bounced`, `email.complained`

Add secret `RESEND_WEBHOOK_SECRET` — the **Signing Secret** shown when the webhook
was created in Resend (starts with `whsec_`). Without it the endpoint still works,
but signatures are not verified.

## Option 2 — Brevo

300 emails a day, free, no card. Worth picking over Resend if she would rather
have a normal inbox-style dashboard, or wants the same account to send customer
receipts later.

1. Sign up at brevo.com.
2. SMTP & API → API Keys → Generate → copy it.
3. Add secret `BREVO_API_KEY`.
4. Add variable `QUOTE_FROM_EMAIL` — Brevo needs a real from address. Use a
   Brevo-verified sender, or verify the domain the same way as above.

## Option 3 — no email account at all

Add a plain variable `NOTIFY_WEBHOOK_URL` and the function POSTs this to it:

```json
{ "to": "info@…", "subject": "Quote request — Home Cleaning in Delray Beach",
  "text": "Name: …\nPhone: …", "replyTo": "customer@…",
  "source": "oasiscoastalcleaning.com" }
```

Point it at a Zapier or Make webhook, a Slack incoming webhook, or an Apple
Shortcut on her phone — the last one gives her a push notification with the
lead in it, which for a phone-first business beats an email she has to open.

---

## What does not work, and why

**Cloudflare Email Routing.** It only receives. `info@oasiscoastalcleaning.com`
can be a routing address that forwards to her real inbox, and that is worth
doing — but routing cannot send, so it cannot carry these notifications.

**The `send_email` Workers binding.** Cloudflare can send from a Worker, free,
no third party. Pages Functions cannot use it: the binding is declared in
wrangler config and Pages bindings are set in the dashboard, which has no
send_email option. Using it would mean converting the whole project from Pages
to a Worker.

**iCloud / Apple Mail SMTP.** Workers cannot open an SMTP connection the way a
mail client does. Her iCloud address is a fine destination, not a sender.

---

## Checking it works

Send yourself a request through the live form. Then:

- the lead is in `/admin/` either way — that is the record
- the API response body carries `"emailed": true` or `false`
- if false, the reason is in the Pages deployment logs (Cloudflare dashboard →
  the project → the deployment → Functions → real-time logs), as
  `Lead could not be stored or emailed: …` or as an `emailed:false` response
