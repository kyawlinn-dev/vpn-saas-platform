---
title: NovaNet MM VPN Pricing Plans
last_updated: 2026-08-10
audience: customer
consumers: [content-agent, rag-bot]
pillars: [Package-Spotlight, Offer, Convenience, Trust]
tags: [pricing, plans, mmk, tiers, packages]
source: production `vpn_plans` table (queried 2026-08-10)
---

# NovaNet MM VPN Pricing Plans

Canonical pricing for all NovaNet MM VPN packages. All prices sourced
from the production `vpn_plans` table on 2026-08-10.

## Facts (canonical values)

**All 7 active plans:**

### 30-day plans

| Plan | Data | Recommended devices | Price |
|---|---|---|---|
| Trial Plan | 5 GB | 1 | Free (7 days validity) |
| Basic Plan | 50 GB | 2 (unlimited allowed) | 4,000 MMK |
| Premium Plan | 100 GB | 3 (unlimited allowed) | 5,000 MMK |
| Max Plan | 200 GB | 5 (unlimited allowed) | 8,000 MMK |

### 90-day plans

| Plan | Data | Recommended devices | Price | Effective monthly |
|---|---|---|---|---|
| Basic Plan | 150 GB | 2 (unlimited allowed) | 11,000 MMK | ~3,667 MMK/mo (save 8%) |
| Premium Plan | 300 GB | 3 (unlimited allowed) | 13,000 MMK | ~4,333 MMK/mo (save 13%) |
| Max Plan | 600 GB | 5 (unlimited allowed) | 22,000 MMK | ~7,333 MMK/mo (save 8%) |

### Device policy (IMPORTANT — different from what the DB `max_devices` column says)

**Devices are effectively UNLIMITED.** The `max_devices` column in the
`vpn_plans` table is a *recommended* device count based on the data
amount, not a technical enforcement. In practice, NovaNet MM allows one
key to be used on as many devices as the customer wants — the only
practical limit is the data amount (higher device count = data burns
faster). This is a real differentiator vs many other Myanmar VPN
sellers who enforce a hard device cap.

**Marketing framing:**
- Say: "Device အလုံးရေ အကန့်အသတ်လုံးဝမရှိပါ" ("no device limit")
- Say: "Phone / Laptop / Mac / PC — အားလုံးမှာ တစ်ချိန်တည်း သုံးလို့ရ"
- Recommend a device count only as a *use-case guide*, not a rule

**Trial specs:**
- Trial name: `Trial Plan`
- Data: 5 GB
- Validity: 7 days
- Devices: 1
- Price: 0 MMK
- Available to: new users only (one trial per Telegram account)
- Servers: Trial-tier only (currently Singapore)
- Features listed in DB: `["5 GB Trial Servers", "7 Days Validity", "Test before buying"]`

**Feature list from DB (per-plan `features` jsonb column):**
- Basic 30d: `["50 GB Premium Servers", "High-Speed Private Servers", "No-Log Policy", "Up to 2 devices", "30 Days Validity"]`
- Max 30d: `["200 GB Premium Servers", "High-Speed Private Servers", "No-Log Policy", "Up to 5 devices", "30 Days Validity"]`
- Basic 90d: `["150 GB Premium Servers", "High-Speed Private Servers", "No-Log Policy", "Up to 2 devices", "90 Days Validity"]`
- Max 90d: `["600 GB Premium Servers", "High-Speed Private Servers", "No-Log Policy", "Up to 5 devices", "90 Days Validity"]`
- Premium 30d + 90d: `features` array empty in DB — safe defaults from tier

**Currency:** MMK (Myanmar Kyat). No USD or foreign pricing.

**Plan storage:** All plans in `vpn_plans` table
(`backend/supabase/migrations/0001_initial_schema.sql`). Fields:
`name`, `price_mmk`, `data_limit_gb` (0 = unlimited), `duration_days`,
`max_devices`, `is_active`, `is_trial`, `features` (jsonb), `sort_order`,
`allowed_regions` (server-region filter, currently null for all plans =
all servers available).

## FAQ (Burmese + English)

Q_MM: NovaNet MM VPN မှာ ဘယ်လို plan တွေရှိလဲ?
Q_EN: What plans does NovaNet MM VPN offer?
A_MM: ရက် ၃၀ Package ၃ မျိုးနဲ့ ရက် ၉၀ Package ၃ မျိုး၊ စုစုပေါင်း ၆ မျိုးရှိပါတယ်။

**ရက် ၃၀** — Basic 50GB (၄,၀၀၀ ကျပ်) · Premium 100GB (၅,၀၀၀ ကျပ်) · Max 200GB (၈,၀၀၀ ကျပ်)
**ရက် ၉၀** — Basic 150GB (၁၁,၀၀၀ ကျပ်) · Premium 300GB (၁၃,၀၀၀ ကျပ်) · Max 600GB (၂၂,၀၀၀ ကျပ်)

New user တိုင်းအတွက် 5GB / ရက် ၇ ရက် Trial Plan ကို အခမဲ့ ရရှိနိုင်ပါတယ်။
A_EN: Six paid plans total — three 30-day and three 90-day packages.

**30-day** — Basic 50 GB (4,000 MMK) · Premium 100 GB (5,000 MMK) · Max 200 GB (8,000 MMK)
**90-day** — Basic 150 GB (11,000 MMK) · Premium 300 GB (13,000 MMK) · Max 600 GB (22,000 MMK)

Every new user gets a 5 GB / 7 days Trial Plan free.

Q_MM: ဘယ် plan က ကျွန်တော့်အတွက် အသင့်တော်ဆုံးလဲ?
Q_EN: Which plan is best for me?
A_MM: ကိုယ့်ရဲ့ အသုံးပြုမှုပေါ်မူတည်ပါတယ် —

- တစ်ရက်ကို ၃၀ ကနေ ၆၀ မိနစ်လောက်သာ Facebook, messaging အတွက် သုံးမယ်ဆိုရင် → **Basic 50GB**
- Facebook Live, streaming, gaming တွေကို ပုံမှန်သုံးမယ်ဆိုရင် → **Premium 100GB** (အသုံးများဆုံး ရွေးချယ်မှု)
- Data အလုံအလောက်ရှိစေချင်တယ်၊ device အများကြီးမှာ share သုံးမယ်ဆိုရင် → **Max 200GB**

၃ လ တစ်ကြိမ်တည်း ဝယ်ချင်ရင်တော့ ရက် ၉၀ Plan တွေက monthly ဈေးထက် ၈% ကနေ ၁၃% အထိ သက်သာပါတယ်။
A_EN: Depends on usage —

- Light social media / messaging (~30-60 min/day) → **Basic 50 GB**
- Regular streaming / FB Live / gaming → **Premium 100 GB** (most popular)
- Heavy use or many shared devices → **Max 200 GB**

90-day plans save 8–13% vs paying monthly.

Q_MM: Basic နဲ့ Premium ဘယ်လိုကွာလဲ?
Q_EN: What's the difference between Basic and Premium?
A_MM: အဓိကကွာခြားချက်တွေက —
- **Data ပမာဏ:** Basic 50GB · Premium 100GB (နှစ်ဆ)
- **Recommended device:** Basic ၂ လုံး · Premium ၃ လုံး (၂ ခုစလုံးမှာ device unlimited allowed)
- **Speed နဲ့ server:** အတူတူပါပဲ (Singapore နဲ့ Japan Premium server အားလုံး သုံးလို့ရ)

ဈေး ကွာခြားချက်က ၁,၀၀၀ ကျပ်သာဖြစ်လို့ Premium က data နှစ်ဆ ရရှိတဲ့အတွက် တွက်ခြေ ပိုကိုက်ပါတယ်။
A_EN: Main differences —
- **Data:** Basic 50 GB · Premium 100 GB (2× more)
- **Recommended devices:** Basic 2 · Premium 3 (both allow unlimited in practice)
- **Speed & server access:** identical (both use Singapore + Japan Premium servers)

Price gap is only 1,000 MMK — Premium is much better value at double the data.

Q_MM: Premium နဲ့ Max ဘယ်လိုကွာလဲ?
Q_EN: What's the difference between Premium and Max?
A_MM: Data ပမာဏ (100GB vs 200GB) နဲ့ recommended device count (၃ vs ၅) ကွာသွားပါတယ်။ တစ်အိမ်တည်း family သုံး၊ ရုံးသုံး၊ ရုပ်ရှင်နဲ့ ဂိမ်း ပုံမှန်သုံးတဲ့ heavy user တွေအတွက် Max plan က ပိုသင့်တော်ပါတယ်။
A_EN: Data (100 GB vs 200 GB) and recommended devices (3 vs 5). Max is better for family/office sharing or heavy users like streamers/gamers.

Q_MM: ရက် ၃၀ plan နဲ့ ရက် ၉၀ plan ဘယ်ဟာ တွက်ခြေ ကိုက်လဲ?
Q_EN: Is 30-day or 90-day better value?
A_MM: ရက် ၉၀ plan က monthly ဈေးထက် ၈% ကနေ ၁၃% အထိ သက်သာပါတယ်။ ဥပမာ — Premium 30 ရက် × ၃ = ၁၅,၀၀၀ ကျပ်၊ Premium 90 ရက် တစ်ခုက ၁၃,၀၀၀ ကျပ်သာဖြစ်လို့ ၂,၀၀၀ ကျပ် သက်သာပါတယ်။ ဆက်တိုက် သုံးမယ်လို့ သေချာရင် ရက် ၉၀ plan ကို ရွေးလိုက်ပါ။
A_EN: 90-day plans save 8–13% vs paying monthly. Example: Premium 30d × 3 = 15,000 MMK, but Premium 90d = 13,000 MMK — saves 2,000 MMK. If you're sure you'll keep using it, go 90-day.

Q_MM: Data ကုန်သွားရင် ဘယ်လိုလုပ်ရမလဲ?
Q_EN: What happens when my data runs out?
A_MM: Data ကုန်တဲ့အခါ VPN key က ရပ်တန့်သွားပါလိမ့်မယ်။ ဆက်လက်အသုံးပြုချင်ရင် Mini App ရဲ့ **ပက်ကေ့ချ်** tab ကနေ plan အသစ်တစ်ခုကို ဝယ်လိုက်ပါ။ လက်ရှိ plan မကုန်ခင် နောက်ထပ် plan ကို ကြိုတင်ဝယ်ထားလို့လည်း ရပါတယ်။
A_EN: When data runs out, the key stops. To keep using it, buy a new plan from the Mini App's **ပက်ကေ့ချ်** tab. You can also pre-buy the next plan before the current one expires.

Q_MM: Package က ရက် ကုန်ရင် ဘယ်လိုလုပ်ရမလဲ?
Q_EN: What happens after the plan expires?
A_MM: သတ်မှတ်ရက် ကုန်တဲ့အခါ VPN key က ခေတ္တ ရပ်တန့်သွားပါလိမ့်မယ်။ Mini App ရဲ့ **ပက်ကေ့ချ်** tab ကနေ package အသစ်တစ်ခုကို ဝယ်ပြီး payment screenshot upload လုပ်ကာ **Payment တင်မည်** ကို နှိပ်လိုက်ရုံနဲ့ ဝန်ဆောင်မှုက **ချက်ချင်း** ပြန်စတင်ပါလိမ့်မယ်။ Key အသစ်ထည့်စရာ မလိုပါ — လက်ရှိ key က plan အသစ်နဲ့ အလိုအလျောက် ဆက်လက် အလုပ်လုပ်ပါလိမ့်မယ်။
A_EN: When the duration ends, the key temporarily stops. Buy a new package from the Mini App's **ပက်ကေ့ချ်** tab, upload payment screenshot, tap **Payment တင်မည်** — service resumes **immediately**. No new key needed; the existing key automatically continues with the new plan.

Q_MM: Device ဘယ်နှစ်ခုမှာ တွဲသုံးလို့ရလဲ?
Q_EN: How many devices per key?
A_MM: NovaNet MM မှာ **device အလုံးရေ အကန့်အသတ် လုံးဝ မရှိပါ**။ တစ်ခုတည်း သော key ကို Phone, Laptop, Mac, PC — device အားလုံးမှာ တစ်ပြိုင်တည်း သုံးလို့ရပါတယ်။ ဇယားထဲက Recommended device count (Basic ၂ / Premium ၃ / Max ၅) က plan ရဲ့ data ပမာဏနဲ့ ကိုက်ညီအောင် အကြံပြုထားတာသာဖြစ်ပြီး တင်းကြပ်တဲ့ ကန့်သတ်ချက် မဟုတ်ပါ။ device ပိုသုံးလေလေ data ပိုမြန်မြန် ကုန်လေလေဖြစ်တာကိုသာ သတိပြုပါ။
A_EN: **NovaNet MM has NO device limit.** The same key works on unlimited Phone / Laptop / Mac / PC devices at the same time. The recommended device counts (Basic 2 / Premium 3 / Max 5) are just suggestions matched to each plan's data amount — not hard caps. The only downside of using more devices is that data burns faster.

Q_MM: ဘယ်လိုပေးလို့ရလဲ?
Q_EN: How do I pay?
A_MM: **KBZPay** နဲ့ **Wave Money** ကို လက်ခံပါတယ်။ Mini App ရဲ့ checkout page ကနေ ငွေလွှဲပြီး payment screenshot ကို upload လုပ်၊ **Payment တင်မည်** ကို နှိပ်လိုက်ရုံနဲ့ package က **ချက်ချင်း** အလုပ်လုပ်ပါလိမ့်မယ်။ Key အသစ်ထည့်စရာမလို — လက်ရှိ key က အလိုအလျောက် ဆက်လက် အလုပ်လုပ်ပါလိမ့်မယ်။
A_EN: **KBZPay** and **Wave Money**. Pay via the Mini App checkout page, upload the screenshot, tap **Payment တင်မည်** — the package activates **immediately**. No new key needed — your existing key keeps working automatically.

## Content angles (for content agent)

Post ideas the content agent can pick up for pricing content:

- **Package Spotlight poster** — style B (isoogood-style 3-tier + iPhone)
  showing Basic / Premium / Max with real prices
- **"ဘယ် plan ရွေးရမလဲ" package explainer** — device count + data
  amount + use case per tier (post 18 & 27 in PassThru corpus style)
- **90-day value math post** — "Premium 30d x 3 = 15,000 ကျပ်၊ Premium
  90d = 13,000 ကျပ်သာ" savings comparison
- **"Device မကန့်သတ်ပါ" differentiator post** — the unlimited-device
  policy is a real moat vs sellers who cap at 1-2 devices per key.
  Frame as "Phone, Laptop, Mac အားလုံးမှာ တစ်ခုတည်း key နဲ့ သုံးလို့ရ"
- **Family/office use case** — highlight Max plan for heavy multi-device
  households (200 GB feeds many devices comfortably)
- **"Cheapest starting at 4,000 MMK"** — entry price hook for
  cost-conscious buyers
- **Free trial → paid conversion** — "5GB က Facebook ကြည့်ရင်
  ဘယ်လောက်ကြာလဲ" reality post nudging Basic 50GB
- **Renewal reminder** — soft nudge post targeting customers ~3-5 days
  before expiry
- **Basic vs Premium 1,000 MMK gap** — value comparison highlighting
  Premium is much better bargain at just 1,000 MMK more
- **Max plan for streaming/gaming** — niche audience post

## Do NOT claim

- ❌ Do NOT invent promo prices — no discount campaign is currently running
- ❌ Do NOT quote prices in USD or any currency other than MMK
- ❌ Do NOT claim there's a lifetime plan — all plans are duration-limited
- ❌ Do NOT claim data rolls over unused between plans — it does NOT
- ❌ Do NOT quote annual pricing — no annual plans exist
- ❌ Do NOT claim a HARD device limit — device counts are recommended
  guidelines only, not enforced caps. Framing must be "recommended" or
  "unlimited allowed", never "maximum 2 devices" or "limited to 3
  devices"
- ❌ Do NOT invent data amounts that don't match the DB values
  (50/100/200 GB for 30-day, 150/300/600 GB for 90-day)
- ❌ Do NOT claim refunds are automatic — refund policy is admin-managed
  case-by-case
- ❌ Do NOT quote old prices — Standard/Unlimited plan names are DEMO/legacy,
  NOT current. Current plans are Basic / Premium / Max only.
