---
title: NovaNet MM Purchase Flow & Payment
last_updated: 2026-08-10
audience: customer
consumers: [content-agent, rag-bot]
pillars: [Convenience, How-To, Trust]
tags: [purchase, payment, kbzpay, wave, telegram, mini-app, order]
source: production `reseller_miniapps` + `vpn_orders` + `order_payments` + miniapp i18n
---

# NovaNet MM Purchase Flow & Payment

How customers buy a plan, pay, and receive a key. Also documents the
payment methods we accept and the review flow.

## Facts (canonical values)

**Purchase flow (self-serve, 24/7, immediate access):**
1. Customer opens the Telegram Bot (via reseller's link)
2. Bot menu shows a **🛒 ဝယ်ယူရန်** inline button → opens Mini App
3. Mini App bottom nav: **မူလ** / **ပက်ကေ့ချ်** / **ဆာဗာ**
4. Customer taps **ပက်ကေ့ချ်** → sees active plans (Trial + Basic/Premium/Max in 30d + 90d flavors)
5. Customer taps **ဝယ်မည် · [price]** on the chosen plan → checkout page
6. Checkout page shows KBZPay + Wave Money account details
7. Customer transfers the exact plan price to the shown account
8. Customer taps **Payment screenshot တင်မည်** → uploads receipt image
9. Optionally adds a payment note (`payment.note`, e.g. "KBZPay 3:10 PM တွင် ပေးချေပြီး")
10. Customer taps **Payment တင်မည်** to submit
11. **Package is added IMMEDIATELY** — the customer's existing dynamic key
    starts serving the new plan's data/duration right away. No wait for
    admin. (Enforced in `backend/src/routes/public/ssconfRouter.js` — accepts
    both `pending_review` and `confirmed` orders.)
12. Admin later verifies the payment for billing/settlement, but this
    happens in the background and does NOT gate customer access

**Why the customer never re-adds a key:**
Every customer has a single persistent `ssconf_token` (from their trial
onward). The public URL `/k/[token].json` is a **dynamic subscription** —
resolves at query-time to whatever the customer's currently-active order
is. So when they buy a new plan, the same key still works — no
re-adding, no downtime.

**Payment methods accepted:**
- **KBZPay** — primary, most Myanmar customers
- **Wave Money** — alternative

**Payment account (from `reseller_miniapps.payment_info`):**
- Account name: **Kyaw Linn**
- Account number: **09958712289**
- Same number for both KBZPay and Wave Money

**Real Mini App labels (Burmese, from `miniapp/src/i18n/language.jsx`):**
- Nav tabs: `မူလ` (home) · `ပက်ကေ့ချ်` (packages) · `ဆာဗာ` (servers)
- Buy button on a plan: `ဝယ်မည် · {price}` (e.g. "ဝယ်မည် · 5,000 MMK")
- Buy again (if already purchased that plan): `ထပ်ဝယ်မည် · {price}`
- Checkout button: `ငွေပေးချေမည်`
- Screenshot upload trigger: `Payment screenshot တင်မည်`
- After upload: `Screenshot အသင့်ဖြစ်ပါပြီ`
- Submit button: `Payment တင်မည်` (submitting state: `တင်နေသည်...`)
- Payment note placeholder: `ဥပမာ KBZPay ဖြင့် 3:10 PM တွင် ပေးချေပြီး`

**Order review states (from `vpn_orders.review_status`):**
- `pending_review` — payment uploaded, waiting on admin
- `confirmed` — admin approved, key issued
- `rejected` — payment failed verification (wrong amount, unclear screenshot, etc.)

**Order lifecycle (from `vpn_orders.status`):**
- `pending` → `active` (after admin confirm) → `expired` (after duration) OR `stopped` (admin action)

**Payment lifecycle (from `vpn_orders.payment_status`):**
- `unpaid` → `paid` → optionally `overdue` (if follow-up needed)

**Sources: authoritative DB tables:**
- `vpn_orders` — one row per order
- `order_payments` — one row per payment attempt (an order can have retries)
- `reseller_miniapps.payment_info` — jsonb of accepted payment methods per reseller

## FAQ (Burmese + English)

Q_MM: Package ဘယ်လိုဝယ်ရမလဲ?
Q_EN: How do I buy a plan?
A_MM: Telegram Bot ကို ဖွင့်ပြီး **🛒 ဝယ်ယူရန်** ကို နှိပ်ပါ။ Mini App ဖွင့်လာရင် အောက်ခြေက **ပက်ကေ့ချ်** tab ကို ရွေးပါ။ ကြိုက်တဲ့ plan ရဲ့ **ဝယ်မည် · [ဈေးနှုန်း]** ခလုတ်ကို နှိပ်ရင် checkout page ကို ရောက်ပါလိမ့်မယ်။ KBZPay ဒါမှမဟုတ် Wave Money account ကို ငွေလွှဲပြီး၊ **Payment screenshot တင်မည်** ကို နှိပ်၍ ငွေလွှဲ receipt ကို upload လုပ်ပါ။ ပြီးရင် **Payment တင်မည်** ကို နှိပ်လိုက်ရုံနဲ့ package ကို **ချက်ချင်း** ရရှိသွားပါလိမ့်မယ်။ Key အသစ်ထည့်စရာ မလိုပါ — လက်ရှိသုံးနေတဲ့ key က plan အသစ်ရဲ့ data ကို အလိုအလျောက် ဆက်လက် ရရှိသုံးစွဲပေးမှာ ဖြစ်ပါတယ်။
A_EN: Open Telegram Bot → tap **🛒 ဝယ်ယူရန်** → in the Mini App tap **ပက်ကေ့ချ်** at the bottom → tap **ဝယ်မည် · [price]** on your chosen plan → transfer to KBZPay/Wave, tap **Payment screenshot တင်မည်** to upload the receipt, then **Payment တင်မည်** to submit. **The package is added immediately** — no need to add a new key. Your existing key automatically starts serving the new plan's data.

Q_MM: ဘယ်လိုပေးလို့ရလဲ?
Q_EN: What payment methods do you accept?
A_MM: **KBZPay** နဲ့ **Wave Money** ကို လက်ခံပါတယ်။ ငွေလွှဲမယ့် account က —
- Account name: **Kyaw Linn**
- Number: **09958712289** (KBZPay နဲ့ Wave Money ၂ ခုစလုံး တူညီပါတယ်)
A_EN: **KBZPay** and **Wave Money**. Transfer account:
- Account name: **Kyaw Linn**
- Number: **09958712289** (same for both KBZPay and Wave Money)

Q_MM: ငွေလွှဲပြီးရင် ဘယ်လောက်ကြာမှ VPN သုံးလို့ရမလဲ?
Q_EN: How long after payment until I can use the VPN?
A_MM: **ချက်ချင်း သုံးလို့ရပါတယ်။** Payment screenshot ကို upload လုပ်ပြီး **Payment တင်မည်** ကို နှိပ်လိုက်တဲ့အခါ package က ချက်ချင်း active ဖြစ်သွားပါတယ်။ ကိုယ့်ရဲ့ လက်ရှိ Outline key က plan အသစ်ရဲ့ data ကို အလိုအလျောက် ဆက်လက်သုံးစွဲပေးမှာမို့ Admin ရဲ့ approve ကို စောင့်စရာ မလိုပါ။ (Admin က payment ကို နောက်ကွယ်မှာ verify လုပ်ပါတယ်၊ ဒါပေမယ့် သင့်ရဲ့ VPN access ကို မထိခိုက်စေပါ။)
A_EN: **Immediately.** As soon as you upload the payment screenshot and tap **Payment တင်မည်**, the package activates instantly. Your existing Outline key automatically starts serving the new plan's data — no waiting for admin approval. (Admin verifies the payment in the background for billing purposes, but it does NOT gate your VPN access.)

Q_MM: Package ဝယ်ပြီးရင် key အသစ် ထည့်ရမလား?
Q_EN: Do I need to add a new key after buying a package?
A_MM: **မလိုပါ။** သင့်ရဲ့ လက်ရှိ Outline key က plan အသစ်နဲ့ အလိုအလျောက် ဆက်လက်အလုပ်လုပ်ပါလိမ့်မယ်။ ကျွန်တော်တို့ရဲ့ key က dynamic subscription တစ်ခုဖြစ်လို့ package အသစ်ဝယ်တိုင်း၊ server ပြောင်းတိုင်း၊ trial ကနေ paid ကူးတိုင်း — key က တူတူပဲ ဆက်လက် အလုပ်လုပ်ပါလိမ့်မယ်။
A_EN: **No.** Your existing Outline key continues to work with the new plan automatically. Our keys are dynamic subscription URLs — the same key stays with you across new package purchases, server switches, and trial-to-paid transitions.

Q_MM: Payment screenshot က ဘယ်လိုပုံ upload လုပ်ရမလဲ?
Q_EN: What should the payment screenshot look like?
A_MM: KBZPay app သို့မဟုတ် Wave Money app က transaction receipt ကို ရိုက်ပြီး upload လုပ်ပါ။ အောက်ပါ အချက်တွေ ရှင်းရှင်း မြင်ရဖို့ လိုအပ်ပါတယ် —
- (၁) ငွေပမာဏ
- (၂) ငွေလွှဲရက်စွဲနဲ့ အချိန်
- (၃) ငွေလွှဲသည့် account နံပါတ်
- (၄) receiver name (Kyaw Linn)

Screenshot ကို crop လုပ်တာ၊ edit လုပ်တာ မလုပ်ပါနဲ့ — admin မှ တခြားပုံစံနဲ့ ပြန်ပို့ခိုင်းနိုင်ပါတယ်။
A_EN: Take a clear screenshot of the KBZPay or Wave Money transaction receipt showing:
- (1) exact amount
- (2) date & time
- (3) sender's account number
- (4) receiver name (Kyaw Linn)

Do NOT crop or edit the screenshot — admin will ask for a fresh one if it looks modified.

Q_MM: ငွေပမာဏ မှားပြီး ပိုတာ / လျော့တာ လွှဲမိရင် ဘယ်လိုလုပ်ရမလဲ?
Q_EN: What if I sent the wrong amount?
A_MM: ငွေပမာဏ မှားရင် order approve ဖြစ်မှာ မဟုတ်ပါ။
- ငွေပိုပို့မိရင် — Admin/Support ကို ဆက်သွယ်ပြီး ငွေပြန်လိုက်လျော လိုပါက ရနိုင်ပါတယ်။
- လျော့ပို့မိရင် — ကျန်တဲ့ ငွေပမာဏကို ဖြည့်လွှဲပြီး screenshot နှစ်ခုစလုံးကို ပို့ပေးပါ။

ရှင်းလင်းချက်လိုပါက Telegram Bot ရဲ့ **👤 Admin / Support** ကို ဆက်သွယ်ပါ။
A_EN: Wrong amount = order not approved.
- Overpaid → contact Admin/Support for a refund adjustment
- Underpaid → transfer the remaining amount and send both screenshots

When in doubt, reach admin via **👤 Admin / Support** in the Telegram Bot.

Q_MM: ငွေလွှဲပြီး Screenshot upload မလုပ်လိုက်ရင် ဘယ်လိုဖြစ်မလဲ?
Q_EN: What if I paid but didn't upload the screenshot?
A_MM: Screenshot မတင်ရင် admin က ငွေရရှိတာ မမြင်နိုင်လို့ order approve မဖြစ်ပါ။ Screenshot ကို Telegram Bot ရဲ့ **👤 Admin / Support** ကနေ လက်တင်ပို့ပေးပါ။ Order ID နဲ့ transaction time ကို ထည့်ပြောပါ။
A_EN: Without a screenshot admin can't verify the payment. Send the screenshot manually via the Telegram Bot's **👤 Admin / Support** — include your order ID and transaction time.

Q_MM: Package မဝယ်ခင် စမ်းသုံးလို့ရလား?
Q_EN: Can I try before buying?
A_MM: ရပါတယ်။ New user တိုင်းအတွက် **5 GB / 7 ရက် Free Trial** ရရှိနိုင်ပါတယ်။ Trial က credit card မလိုအပ်ဘဲ ရနိုင်ပါတယ်။ အသေးစိတ်ကို `trial.md` မှာ ကြည့်ပါ။
A_EN: Yes — every new user gets a 5 GB / 7 days free trial, no card needed. See `trial.md`.

Q_MM: Renewal က အလိုအလျောက် လုပ်ပေးလား?
Q_EN: Is renewal automatic?
A_MM: မဟုတ်ပါ။ Auto-renewal မလုပ်ပေးပါ။ လက်ရှိ plan ကုန်တဲ့အခါ Mini App ရဲ့ **ပက်ကေ့ချ်** tab ကနေ plan အသစ်ကို ကိုယ်တိုင် ဝယ်ရပါလိမ့်မယ်။ လက်ရှိ plan မကုန်ခင် နောက်ထပ် plan ကို ကြိုတင်ဝယ်ထားလို့လည်း ရပါတယ်။
A_EN: No, no auto-renewal. Manually buy a new plan from the Mini App's **ပက်ကေ့ချ်** tab when your current one ends. You can also pre-buy the next plan before the current one expires.

## Content angles (for content agent)

- **"Package ဝယ်နည်း" step-by-step how-to carousel** (style F, real
  screenshots of Mini App with actual Burmese labels)
- **"Admin မလို" self-serve differentiator post** — bot-based buy runs
  24/7, no admin wait (PassThru-inspired positioning, Post 4 style)
- **KBZPay/Wave dual-payment convenience post** — Myanmar-native payment
  options highlighted
- **Payment troubleshooting mini-guide** — screenshot requirements + what
  to do if wrong amount / missing receipt
- **"Payment နဲ့ key delivery process ဘယ်လိုလုပ်တာလဲ" transparency post** —
  build trust by showing the review flow openly
- **Renewal reminder post** — soft nudge targeting customers ~3 days
  before expiry

## Do NOT claim

- ❌ Do NOT claim auto-renewal exists — customer must manually re-buy
- ✅ DO claim **immediate access after payment** — key is live the moment
  the customer taps Payment တင်မည်. Do NOT say "wait for admin approval"
  or "hours for delivery" — that's inaccurate and understates our
  self-serve advantage
- ❌ Do NOT accept crypto, foreign card, PayPal, or any non-KBZPay/Wave
  payment method — none of those are wired up
- ❌ Do NOT publish the payment account number in mass content posts —
  it's fine in DMs and the Mini App but posting it on Facebook/TikTok
  invites impersonation scams
- ❌ Do NOT quote a specific SLA time ("15 minutes", "1 hour") for
  payment review — depends on admin availability; "within business hours"
  is the safe framing
- ❌ Do NOT claim refunds are automatic — case-by-case admin decision
- ❌ Do NOT claim we accept partial payment or installment plans — full
  price up-front is required
- ❌ Do NOT use "Packages" or "Buy Now" as English labels in Burmese
  posts — the Mini App shows **ပက်ကေ့ချ်** and **ဝယ်မည်**
