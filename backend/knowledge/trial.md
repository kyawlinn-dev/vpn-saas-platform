---
title: NovaNet MM Free Trial
last_updated: 2026-08-10
audience: customer
consumers: [content-agent, rag-bot]
pillars: [Convenience, Trust, Anti-Free-VPN, How-To]
tags: [trial, free, 5gb, 7days, new-user, onboarding]
source: production `vpn_plans` + `reseller_miniapps` + `telegram_links` tables (queried 2026-08-10)
---

# NovaNet MM Free Trial

The 5 GB / 7-day free trial. First customer touchpoint. Used to close
the "just try it" pillar in every marketing post that mentions trial.

## Facts (canonical values)

**Trial Plan (from `vpn_plans`):**
- Name in DB: `Trial Plan` (`is_trial = true`)
- Data: **5 GB**
- Validity: **7 days from claim**
- Recommended devices: 1 (unlimited allowed — same as paid plans, but
  practically pointless on a 5 GB budget)
- Price: **0 MMK**
- Features (per DB): `["5 GB Trial Servers", "7 Days Validity", "Test before buying"]`

**Trial server access:**
- Trial users can only use the trial-tier server: `sgp1-6607-trial`
  (Singapore, DigitalOcean, capacity 100 keys, currently 2 in use)
- **Cannot** use the premium Singapore server or the Japan Osaka server
- If trial user wants Japan / better Singapore, they upgrade to any
  paid plan (Basic / Premium / Max)

**Eligibility (from `telegram_links` table):**
- One trial per Telegram account
- Enforced via `trial_used_at` column — atomic claim prevents
  double-trial race conditions (see `backend/src/services/trialService.js`)
- After trial ends, customer must buy a paid plan; no second trial

**Reseller mini-app defaults (from `reseller_miniapps` table):**
- `trial_enabled = true` (default on)
- `trial_data_limit_gb = 5`
- `trial_duration_days = 7`
- Reseller admins can toggle trial on/off per-reseller

**How trial ends:**
- Whichever comes first: 5 GB used **OR** 7 days elapsed
- No auto-renewal, no auto-charge
- No warning notification currently (potential improvement item)
- Customer must actively buy a paid plan to continue after trial

**How to claim (customer's real steps — verified against `handlers.js`):**
1. Open the Telegram Bot (via reseller's link or QR)
2. Tap **Start**
3. **Trial is auto-created on `/start`** — no menu picking needed. The
   bot shows a welcome message that says `"✅ Trial Package ကို
   အလိုအလျောက် ဖန်တီးပြီးပါပြီ! 🔑 Outline Key ရယူရန် ကို နှိပ်ပါ"`
4. From the persistent bot menu, tap **🔑 Outline Key ရယူရန်**
5. Bot returns your Outline key with a **➕ Add Key To Outline** button
6. Tap **Add Key To Outline** — Outline app opens with the key pre-loaded
7. In Outline, tap **Connect**

**Persistent bot menu (5 buttons, auto-shown after /start):**
- 🔑 Outline Key ရယူရန်
- 📊 လက်ကျန်စစ်ရန်
- 🌐 Server ပြောင်းရန်
- 📥 Download Outline
- 📖 အသုံးပြုနည်း

**Inline CTA buttons (second message after /start):**
- 🛒 ဝယ်ယူရန် / သက်တမ်းတိုးရန် (opens Mini App)
- 👤 Admin / Support

## FAQ (Burmese + English)

Q_MM: Free trial က ဘယ်လိုရလဲ?
Q_EN: How do I claim the free trial?
A_MM: Telegram Bot ကိုဖွင့်ပြီး **Start** နှိပ်ရုံနဲ့ 5GB Trial ကို အလိုအလျောက် ရရှိပါလိမ့်မယ်။ ရွေးစရာ မလိုပါ။ ပြီးရင် menu က **🔑 Outline Key ရယူရန်** ကို နှိပ်ပါ။ Bot က သင့် key ကို **➕ Add Key To Outline** ခလုတ်နဲ့အတူ ပြန်ပို့ပါလိမ့်မယ်။ ခလုတ်ကို နှိပ်ရင် Outline app ဖွင့်လာပြီး key ကို auto-fill လုပ်ပါလိမ့်မယ်။ Confirm ပြီး Connect နှိပ်လိုက်ရင် စတင်အသုံးပြုနိုင်ပါပြီ။
A_EN: Just open the Telegram Bot and tap **Start** — the 5GB Trial is created automatically, no menu selection needed. Then tap **🔑 Outline Key ရယူရန်** from the persistent menu. Bot returns your key with an **➕ Add Key To Outline** button. Tap it → Outline opens with the key pre-loaded → Confirm → Connect.

Q_MM: Trial က ဘယ်လောက်ကြာ သုံးလို့ရလဲ?
Q_EN: How long does the trial last?
A_MM: 5 GB data ဒါမှမဟုတ် ရက် ၇ ရက် — ဒီ ၂ ခုထဲက ဘယ်ဟာ အရင်ကုန်တာနဲ့ trial ကုန်ဆုံးပါလိမ့်မယ်။ Data နဲ့ အချိန်က သီးခြားစီ တွက်ပါတယ်။
A_EN: Whichever comes first — 5 GB used **or** 7 days elapsed. Data cap and time cap count separately.

Q_MM: 5 GB က ဘယ်လောက်ကြာ သုံးလို့ရလဲ?
Q_EN: How long does 5 GB actually last?
A_MM: အသုံးပြုမှုပေါ်မူတည်ပါတယ် —
- Facebook, TikTok scroll (တစ်ရက် ၃၀ မိနစ်လောက်) → ၅-၇ ရက်
- YouTube 720p streaming (တစ်ရက် ၃၀ မိနစ်လောက်) → ၂-၃ ရက်
- Video call (တစ်ရက် ၁၅ မိနစ်လောက်) → ၃-၄ ရက်

Trial က "စမ်းသုံးဖို့" အတွက်သာ ရည်ရွယ်ထားတာဖြစ်လို့ ပုံမှန်သုံးမယ်ဆိုရင်တော့ Basic 50GB plan (၄,၀၀၀ ကျပ်) က တိုက်ရိုက် အသင့်တော်ဆုံးပါ။
A_EN: Depends on usage —
- Facebook/TikTok scrolling (~30 min/day) → 5–7 days
- YouTube 720p streaming (~30 min/day) → 2–3 days
- Video call (~15 min/day) → 3–4 days

Trial is meant for "testing" only. For regular use, Basic 50 GB (4,000 MMK) is the sweet spot.

Q_MM: Trial က နောက်တစ်ခါ ရနိုင်လား?
Q_EN: Can I get another trial after this one ends?
A_MM: မရနိုင်ပါ။ Trial က Telegram account တစ်ခုကို တစ်ကြိမ်သာ ရရှိနိုင်ပါတယ်။ Trial ကုန်ပြီးရင် paid plan (Basic, Premium, Max) တစ်ခုကို Mini App ကနေ ဝယ်ယူဖို့ လိုအပ်ပါတယ်။
A_EN: No — one trial per Telegram account, ever. After trial ends, buy a paid plan (Basic, Premium, or Max) via Mini App.

Q_MM: Trial က ဘယ် server သုံးလို့ရလဲ?
Q_EN: Which server does the trial use?
A_MM: Trial အသုံးပြုသူများသည် Singapore Trial server ကိုသာ အသုံးပြုနိုင်ပါတယ်။ Japan Premium server ကို paid plan (Basic / Premium / Max) ဝယ်ယူပြီးမှသာ အသုံးပြုနိုင်ပါလိမ့်မယ်။
A_EN: Trial users can only use the Singapore Trial server. Japan Premium server unlocks with any paid plan (Basic / Premium / Max).

Q_MM: Trial က credit card လိုအပ်လား? အလိုအလျောက် ငွေဖြတ်ခံရမလား?
Q_EN: Does the trial need a credit card? Will I get auto-charged?
A_MM: **လိုအပ်ခြင်း မရှိပါ။** Credit card ဒါမှမဟုတ် payment method တစ်ခုမှ မလိုအပ်ဘဲ Trial ကို ရရှိနိုင်ပါတယ်။ Trial ကုန်တဲ့အခါလည်း အလိုအလျောက် charge မလုပ်ပါဘူး — သင်ကိုယ်တိုင် plan ဝယ်ယူတဲ့အခါမှသာ ငွေပေးရမှာဖြစ်ပါတယ်။
A_EN: **No credit card needed.** Trial claims with zero payment info. Never auto-charges — you only pay when you actively buy a paid plan.

Q_MM: Trial ကုန်ရင် ဆက်လုပ်ဖို့ ဘယ်လိုလုပ်ရမလဲ?
Q_EN: What do I do after the trial ends?
A_MM: Mini App ရဲ့ **ပက်ကေ့ချ်** tab ကနေ Basic (၄,၀၀၀ ကျပ်)၊ Premium (၅,၀၀၀ ကျပ်) ဒါမှမဟုတ် Max (၈,၀၀၀ ကျပ်) plan တစ်ခုကို ရွေးဝယ်ပါ။ KBZPay / Wave Money နဲ့ ငွေလွှဲပြီး payment screenshot ကို upload လုပ်၍ **Payment တင်မည်** ကို နှိပ်လိုက်ရုံနဲ့ package က **ချက်ချင်း** active ဖြစ်ပါလိမ့်မယ်။ Key အသစ်ထည့်စရာ မလိုပါ — trial ကာလမှာ သုံးခဲ့တဲ့ key က plan အသစ်နဲ့ အလိုအလျောက် ဆက်လက်အလုပ်လုပ်ပါလိမ့်မယ်။ Server ရွေးချယ်မှုအရ Japan Premium server ကိုပါ ချိတ်ဆက် အသုံးပြုနိုင်ပါလိမ့်မယ်။
A_EN: Open Mini App → **ပက်ကေ့ချ်** tab → pick Basic (4,000 MMK), Premium (5,000 MMK), or Max (8,000 MMK). Pay via KBZPay/Wave, upload screenshot, tap **Payment တင်မည်** — the package activates **immediately**. No new key needed — the same key you used during trial automatically starts serving the new plan. You'll also gain access to the Japan Premium server.

## Content angles (for content agent)

- **"5GB Free Trial ယူနည်း" how-to carousel** (style F, iPhone-frame
  with real screenshots) — the classic onboarding post
- **"No credit card, no auto-charge" trust anchor** — differentiator vs
  international VPN services that require card up-front
- **"5GB က ဘယ်လောက်ကြာ သုံးလို့ရလဲ" education post** — realistic
  expectation-setting; naturally nudges toward Basic 50GB paid plan
- **Trial → paid conversion nudge** — soft ~5-day-later post reminding
  trial users a paid plan is next
- **"Test before buy" positioning** — anti-free-VPN framing: "why lock
  into a free VPN with hidden costs when you can properly test a paid
  service for free"
- **Bot self-serve trial claim** — no admin needed, works 24/7, 3-step

## Do NOT claim

- ❌ Do NOT claim the trial extends automatically or gives extra data —
  it's strictly 5 GB / 7 days, one-time
- ❌ Do NOT claim trial users can access Japan server or premium servers —
  Singapore trial only
- ❌ Do NOT claim users get multiple trials or can "reset" the trial —
  one per Telegram account, atomically enforced
- ❌ Do NOT claim a specific "Facebook usage lasts X days" number without
  the ranges we listed above
- ❌ Do NOT claim device limit on the trial is 1 as a hard rule —
  same unlimited-devices policy applies as with paid plans (data will
  just run out much faster on multiple devices)
- ❌ Do NOT suggest customers create multiple Telegram accounts to game
  the trial — that's user-abuse we don't endorse
- ❌ Do NOT suggest the trial is a "sample" of premium service — it's a
  full service, just on the trial-tier server and with less data
