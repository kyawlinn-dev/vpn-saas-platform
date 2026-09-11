---
title: NovaNet MM Server Locations
last_updated: 2026-08-10
audience: customer
consumers: [content-agent, rag-bot]
pillars: [Convenience, Server-Launches, Use-Case, Education]
tags: [servers, locations, countries, use-case]
source: production `vpn_servers` + miniapp i18n (queried 2026-08-10)
---

# NovaNet MM Server Locations

Real production server list. Small on purpose — quality over quantity.
Do not invent additional locations. If we add a country, we update this
file first, then post about it.

## Facts (canonical values)

**All active servers (source: `vpn_servers` table, `status = active`):**

| Server | Country | City | Region | Tier | Capacity |
|---|---|---|---|---|---|
| Outline SG 01 | 🇸🇬 Singapore | Singapore | sgp1 | Premium (default) | 100 keys max |
| Outline Japan Osaka 01 | 🇯🇵 Japan | Osaka | kix | Premium | 100 keys max |
| Singapore Trial | 🇸🇬 Singapore | Singapore | sgp1 | **Trial** | 150 keys max |

**Summary:**
- **2 premium countries:** Singapore + Japan
- **1 dedicated trial server:** Singapore trial-tier
- **Default server:** Outline Singapore 1 (marked `is_default = true`)

**Server-tier lock (bidirectional — enforced in Mini App):**
- Trial plan users → Trial-tier servers ONLY (currently Singapore Trial)
- Paid plan users (Basic / Premium / Max) → Premium-tier servers ONLY (Singapore + Japan)
- Paid users **cannot** use the trial server; trial users **cannot** use premium servers
- Enforced by Mini App logic (see `servers.restrictedTrialDescription` and `servers.restrictedPremiumDescription` in `miniapp/src/i18n/language.jsx`)

**Server switching (paid users):**
- Location: Mini App → **ဆာဗာ** tab (bottom nav)
- One tap → server change is instant
- Outline key stays the same — no need to add a new key

**Historical / decommissioned servers** (do NOT mention in content):
- India (Bangalore) — decommissioned
- 12 other legacy codenames (London, NYC, SFO, Sydney, Frankfurt) — all decommissioned

## FAQ (Burmese + English)

Q_MM: NovaNet MM မှာ ဘယ်နိုင်ငံက server တွေရှိလဲ?
Q_EN: Which server countries does NovaNet MM have?
A_MM: လက်ရှိမှာ Singapore 🇸🇬 နဲ့ Japan 🇯🇵 ဆိုပြီး နိုင်ငံ ၂ ခုမှာ Premium server ရှိပါတယ်။ Trial အသုံးပြုသူများအတွက်တော့ Singapore မှာ သီးသန့် Trial server တစ်ခု ရှိပါတယ်။ Mini App ရဲ့ **ဆာဗာ** tab ကနေ တစ်ချက်နှိပ်ရုံနဲ့ ကြိုက်တဲ့ server ကို ပြောင်းလို့ရပါတယ်။
A_EN: We have Premium servers in 2 countries: Singapore 🇸🇬 and Japan 🇯🇵. Trial users get a dedicated Singapore Trial server. Switch between them from the Mini App's **ဆာဗာ** (Servers) tab — one tap.

Q_MM: Trial အသုံးပြုသူတွေက ဘယ် server သုံးလို့ရလဲ?
Q_EN: Which servers can free-trial users use?
A_MM: Trial အသုံးပြုသူများသည် Singapore Trial server ကိုသာ ချိတ်ဆက်နိုင်ပါတယ်။ Japan server နဲ့ Premium Singapore server တွေကို Paid Plan (Basic, Premium, Max) ဝယ်ယူပြီးမှသာ အသုံးပြုနိုင်ပါလိမ့်မယ်။
A_EN: Trial users can only connect to the Singapore Trial server. Japan and Premium Singapore servers unlock only after buying a paid plan (Basic, Premium, or Max).

Q_MM: ငါက Paid Plan ဝယ်ထားပြီးသားပါ။ Trial server ကို သုံးလို့ရမလား?
Q_EN: I'm on a paid plan. Can I still use the Trial server?
A_MM: မရပါ။ Paid Plan (Basic / Premium / Max) အသုံးပြုသူများသည် Premium server (Singapore + Japan) တွေကိုသာ ချိတ်ဆက်နိုင်ပါတယ်။ Trial server က trial အသုံးပြုသူများအတွက် သီးသန့်ထားရှိတာဖြစ်လို့ Paid Plan နဲ့ချိတ်ဆက်၍ မရပါ။
A_EN: No. Paid Plan users (Basic / Premium / Max) can only connect to Premium servers (Singapore + Japan). The Trial server is reserved for trial users and can't be used with a paid plan.

Q_MM: Server ကို ဘယ်လိုပြောင်းရမလဲ?
Q_EN: How do I switch servers?
A_MM: Telegram Bot ရဲ့ **🛒 ဝယ်ယူရန်** ခလုတ်ကနေ Mini App ကို ဖွင့်ပါ → အောက်ခြေက **ဆာဗာ** tab ကို နှိပ်ပါ → Singapore သို့မဟုတ် Japan ကို ရွေးပါ။ Server ပြောင်းလိုက်ချိန်မှာ key က တူတူပဲဖြစ်လို့ Outline app ထဲမှာ key ပြန်ထည့်စရာ မလိုပါ။ Outline မှာ Disconnect ပြီး Connect ကို ပြန်နှိပ်လိုက်ရင် server အသစ်နဲ့ ချိတ်ဆက်ပြီးဖြစ်ပါလိမ့်မယ်။
A_EN: Open the Mini App via **🛒 ဝယ်ယူရန်** in Telegram Bot → tap the **ဆာဗာ** tab at the bottom → pick Singapore or Japan. Your Outline key stays the same, so no need to re-add. In Outline, tap Disconnect then Connect again — you're on the new server.

Q_MM: ကျွန်တော့်အတွက် Singapore ကောင်းလား၊ Japan ကောင်းလား?
Q_EN: Which is better for me — Singapore or Japan?
A_MM: Facebook, TikTok, ရိုးရိုး browsing နဲ့ Asia streaming အတွက်ဆို **Singapore** က မြန်မာနဲ့ ပိုနီးလို့ ping တိုပြီး လိုင်း အမြန်ဆုံးပါ။ Gaming (Asia region), anime, JP content တွေအတွက်ဆို **Japan** က ပိုသင့်တော်ပါတယ်။ ၂ ခုစလုံး တစ်ချက်နှိပ်ရုံနဲ့ အလွယ်တကူ ပြောင်းလို့ရလို့ စမ်းပြီး ကိုယ့်ရဲ့အသုံးပြုမှုနဲ့ ကိုက်ညီတဲ့ဟာကို ရွေးလိုက်ပါ။
A_EN: For Facebook, TikTok, general browsing, and Asia streaming — **Singapore** is faster (closer to Myanmar, lower ping). For gaming (Asia region), anime, and JP content — **Japan** works better. Both are one tap away — try each and pick what feels smoother.

Q_MM: နိုင်ငံ တခြားထပ်တိုးဖို့ ရှိလား?
Q_EN: Will you add more countries?
A_MM: ဝန်ဆောင်မှုတိုးချဲ့တဲ့အခါ ကျွန်တော်တို့ရဲ့ Facebook Page နဲ့ Telegram Bot ကနေ တိုက်ရိုက် အသိပေးပေးပါလိမ့်မယ်။ လက်ရှိမှာတော့ Singapore နဲ့ Japan ၂ ခုစလုံးရဲ့ လိုင်း quality ကို အကောင်းဆုံးဖြစ်အောင် အာရုံစိုက်ထားပါတယ်။
A_EN: We'll announce it on our Facebook Page and Telegram Bot when we add new countries. Right now we're focused on keeping Singapore + Japan at peak quality.

Q_MM: Server တစ်ခုက ချိတ်မရဘူးဆိုရင် ဘယ်လိုလုပ်ရမလဲ?
Q_EN: What if a server won't connect?
A_MM: တခြား server (Singapore သို့မဟုတ် Japan) ကို Mini App ရဲ့ **ဆာဗာ** tab ကနေ ပြောင်းစမ်းကြည့်ပါ။ ၂ ခုစလုံး ချိတ်မရသေးရင် Outline app ကို force close လုပ်ပြီး key ကို ဖျက်ကာ ပြန်ထည့်ကြည့်ပါ။ အဆင်မပြေသေးရင် Telegram Bot ရဲ့ **👤 Admin / Support** ကို ဆက်သွယ်ပါ။
A_EN: Try switching to the other server (Singapore or Japan) from the Mini App's **ဆာဗာ** tab. If both still fail, force-close Outline, remove the key, and add it back. If still stuck, contact **👤 Admin / Support** via the Telegram Bot.

## Content angles (for content agent)

Post ideas grounded in the real 2-country setup:

- **"Singapore vs Japan — ဘယ်ဟာ ရွေးမလဲ" comparison** — genuine
  decision help; use-case-driven per country
- **"Server ပြောင်းနည်း" how-to carousel** — step-by-step Mini App tutorial
  using real Burmese labels (**ဆာဗာ** tab)
- **Singapore speed post** — why closest = fastest from Myanmar
- **Japan server niche post** — gaming (Asia region) + anime + JP content
  audience
- **Multi-device trust post** — same key works on both servers and
  unlimited devices simultaneously
- **Trial → paid upgrade nudge** — "Singapore Trial စမ်းပြီးရင် Japan
  server အသုံးပြုချင်ရင် Paid Plan ဝယ်ကြည့်ပါ"
- **Server quality > quantity** — anti-competitor framing: our 2 servers
  are hand-tuned, always monitored — beats large bulk servers with
  overloaded connections

## Do NOT claim

- ❌ Do NOT claim any country other than Singapore + Japan is available
- ❌ Do NOT claim India, Netherlands, US, UK, Korea, Thailand, or any
  other country — those are decommissioned or never existed
- ❌ Do NOT claim we have "9 countries" or "12 countries" like competitors do —
  we have 2 countries; that's competitors' number, not ours
- ❌ Do NOT claim Japan is available on the free trial — trial is Singapore only
- ❌ Do NOT claim Paid Plan users can also use the Trial server — the
  Mini App enforces tier lock in both directions
- ❌ Do NOT claim we have redundant servers within Singapore or Japan
  (SG-1, SG-2, JP-1, JP-2, etc.) — we have one active premium per country
- ❌ Do NOT promise a specific streaming service works (Netflix Japan,
  Amazon US, etc.) — geo-unblocking is not guaranteed
- ❌ Do NOT quote specific latency numbers unless recently measured
- ❌ Do NOT list server IP addresses or internal codenames — only
  display names ("Singapore", "Japan")
- ❌ Do NOT announce a "coming soon" country unless the server is
  actually being provisioned right now
