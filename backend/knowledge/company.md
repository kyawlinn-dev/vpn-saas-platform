---
title: NovaNet MM Brand & Company
last_updated: 2026-08-10
audience: customer
consumers: [content-agent, rag-bot]
pillars: [Trust, Convenience, Education]
tags: [brand, company, about, novanetmm, myanmar, team, mission]
source: production `resellers` + `reseller_miniapps` tables + repo `README.md`
---

# NovaNet MM Brand & Company

Who NovaNet MM is, when we started, and what we stand for. Grounds every
"about us" / trust post the content agent generates.

## Facts (canonical values)

**Brand:**
- Public brand name: **NovaNet MM** (sometimes styled as "NovaNet MM VPN")
- Domain: `novanetmm.com` — `api.novanetmm.com` (backend) and `app.novanetmm.com` (Mini App)
- Bot: [@novanetmmvpn_bot](https://t.me/novanetmmvpn_bot)
- Support: [@novanetmmadmin](https://t.me/novanetmmadmin)
- Miniapp slug: `novanet-mm`
- Primary brand color: `#2f7bff` (blue) — brand-tokens.md paints a richer navy/cyan palette

**Team:**
- Operator name: **Kyaw Linn** (Myanmar-based)
- Real Myanmar software team (not offshore, not white-labeled)
- Small team by design — direct admin access, no call-center feel

**Operating status (from production DB):**
- Reseller record created: **2026-07-11** — active for ~1 month at time of writing
- Multi-tenant platform: NovaNet MM runs alongside 5 other reseller brands
  on the same infrastructure (each with their own bot, brand, and payment
  account)
- Active service metrics: 192 keys issued, 105 orders, 79 customers across
  the platform (as of 2026-08-10)

**What NovaNet MM is:**
- A Myanmar VPN reseller service selling Outline VPN access
- Built on our own multi-tenant platform (backend, Mini App, bot manager,
  admin dashboard, reseller dashboard — all in-house)
- Sells directly to end customers AND offers a reseller program for
  other Myanmar sellers (see `reseller.md` when written)

**What NovaNet MM is NOT:**
- Not affiliated with PassThru VPN, Outline Private VPN, Next Outline VPN,
  or any other similarly-named Myanmar VPN page
- Not owned by Google (we use Google Jigsaw's open-source Outline VPN
  client — we run our own servers behind it)
- Not a reseller of someone else's VPN service — we operate our own
  servers directly on DigitalOcean and Vultr

**Positioning (the sentence version):**
> NovaNet MM is a Myanmar-team-built Outline VPN service delivered
> through Telegram — with unlimited devices, instant activation, and a
> dynamic key that stays with you as your service grows.

## FAQ (Burmese + English)

Q_MM: NovaNet MM ကို ဘယ်သူတွေ လုပ်ဆောင်နေတာလဲ?
Q_EN: Who runs NovaNet MM?
A_MM: မြန်မာနိုင်ငံသား developer team တစ်ခုက ကိုယ်တိုင် တည်ဆောက်ပြီး ဝန်ဆောင်မှုပေးနေတာဖြစ်ပါတယ်။ Small team ဖြစ်တဲ့အတွက် Customer တစ်ဦးချင်းစီရဲ့ ပြဿနာကို တိုက်ရိုက် ဖြေရှင်းပေးနိုင်ပါတယ်။ ကမ္ဘာအနှံ့က international VPN provider တွေလို faceless call-center မဟုတ်ပါ — real Myanmar team နဲ့ တိုက်ရိုက် ဆက်သွယ်နိုင်ပါတယ်။
A_EN: Built and operated by a Myanmar software team. Small enough that we handle each customer directly — no offshore call center, no ticket queues. When you message admin, a real Myanmar person replies.

Q_MM: NovaNet MM က ဘယ်တုန်းက စတင်ခဲ့တာလဲ?
Q_EN: When did NovaNet MM start?
A_MM: 2026 ခုနှစ်ကတည်းက ဝန်ဆောင်မှုပေးနေတဲ့ ဝန်ဆောင်မှုတစ်ခုဖြစ်ပါတယ်။ Platform ကို in-house မှာ ကိုယ်တိုင် တည်ဆောက်ခဲ့တာဖြစ်ပြီး Outline VPN ရဲ့ open-source technology ကို အခြေခံပြီး build ထားပါတယ်။
A_EN: Operating since 2026. We built the platform in-house from scratch, using Outline VPN's open-source technology as the foundation.

Q_MM: NovaNet MM က PassThru VPN နဲ့ ဆက်နွယ်မှု ရှိသလား?
Q_EN: Is NovaNet MM related to PassThru VPN?
A_MM: မရှိပါ။ NovaNet MM သည် PassThru VPN, Outline Private VPN, Next Outline VPN နဲ့ တခြားသော Outline အမည်ရှိ page များနှင့် လုံးဝ ဆက်စပ်မှု မရှိပါ။ ကျွန်တော်တို့ရဲ့ server, key, ဝန်ဆောင်မှုအားလုံးက ကိုယ်ပိုင်ဖြစ်ပါတယ်။
A_EN: No. NovaNet MM is not affiliated with PassThru VPN, Outline Private VPN, Next Outline VPN, or any other Outline-branded page. Our servers, keys, and service are all our own.

Q_MM: NovaNet MM က Google Outline VPN ကိုပဲ သုံးတာလား?
Q_EN: Do you just resell Google's Outline VPN?
A_MM: Outline VPN ဆိုတာ Google Jigsaw က တီထွင်ထားတဲ့ open-source client software ပါ။ NovaNet MM ကတော့ (၁) ကိုယ်ပိုင် server တွေကို DigitalOcean နဲ့ Vultr မှာ တည်ဆောက်ပြီး (၂) Outline နဲ့ ချိတ်ဆက်ဖို့ လိုအပ်တဲ့ key တွေကို ကိုယ်တိုင် ထုတ်ပေးပြီး (၃) Telegram Bot + Mini App ကနေ Myanmar customer တွေအတွက် လွယ်လွယ်ကူကူ ရရှိအောင် ဝန်ဆောင်မှုပေးနေတာပါ။ ကျွန်တော်တို့က Google မှ resell လုပ်နေတာ မဟုတ်ပါ။
A_EN: Outline VPN is Google Jigsaw's open-source client software. NovaNet MM (1) runs our own servers on DigitalOcean and Vultr, (2) issues Outline keys ourselves, (3) delivers them via Telegram Bot + Mini App for Myanmar customers. We're not reselling Google's service — we run our own infrastructure using their client app.

Q_MM: NovaNet MM ကို ဘယ်လိုတွေ့နိုင်လဲ?
Q_EN: Where can I find NovaNet MM?
A_MM: တရားဝင် channel များက —
- **Telegram Bot:** [@novanetmmvpn_bot](https://t.me/novanetmmvpn_bot) — VPN အသုံးပြုမှုအားလုံးအတွက်
- **Telegram Admin:** [@novanetmmadmin](https://t.me/novanetmmadmin) — customer support အတွက်
- **Website:** novanetmm.com
- **Facebook Page:** NovaNet MM (verified)

အထက်ပါ channel ကနေ လွဲပြီး တခြား page များ (fake page များ) မှ ဝယ်ယူတာမျိုးကို ရှောင်ကြဉ်ပါ။
A_EN: Official channels —
- **Telegram Bot:** [@novanetmmvpn_bot](https://t.me/novanetmmvpn_bot)
- **Telegram Admin:** [@novanetmmadmin](https://t.me/novanetmmadmin)
- **Website:** novanetmm.com
- **Facebook Page:** NovaNet MM (verified)

Avoid buying from any other page — those are unauthorized resellers.

## Content angles (for content agent)

- **"Myanmar team ကိုယ်တိုင် တည်ဆောက်ထားတယ်" trust post** — differentiator vs
  faceless offshore providers
- **"Real Myanmar support" personality post** — human tone, direct admin
  contact, no ticket queues
- **"Official channels only" awareness post** — periodic reminder to
  buy from bot/verified Page only (never posted as a warning against
  specific competitors — see banned-claims.md)
- **"How NovaNet MM connects to Outline / Google" explainer** —
  clarify the mental model (Google made the app; we run the servers)
- **Brand story post (rare, high-quality)** — why we started, what
  problem we saw in the Myanmar VPN market
- **Multi-tenant platform mention** — occasionally show we run a
  platform (not just a single account) to signal legitimacy and
  reseller opportunity

## Do NOT claim

- ❌ Do NOT claim NovaNet MM is a Google product / built by Google — we
  use Google's open-source Outline client, we don't work for Google
- ❌ Do NOT claim affiliation with PassThru VPN, isoogood, or any
  other named competitor — we're independent
- ❌ Do NOT claim a specific team size or headcount — "small team",
  "Myanmar team" is fine; specific numbers can be checked
- ❌ Do NOT claim years of service tenure yet — service is ~1 month old
  in prod; use "operating since 2026" or "growing service" honestly
- ❌ Do NOT claim awards, press mentions, or investor backing that
  don't exist
- ❌ Do NOT claim office addresses, physical locations, or company
  registration details — remote-first small operation
- ❌ Do NOT claim a specific customer count as a milestone unless it's
  real — the 79-customer figure will change; only cite if fresh
- ❌ Do NOT name individual team members publicly beyond the operator
  handle (@novanetmmadmin) — respects team privacy
