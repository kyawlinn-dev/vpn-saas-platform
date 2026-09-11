---
title: NovaNet MM Troubleshooting
last_updated: 2026-08-10
audience: customer
consumers: [content-agent, rag-bot]
pillars: [How-To, Trust, Convenience]
tags: [troubleshooting, errors, issues, fixes, ios, android, outline, connection, payment]
source: `bot/strings.js` error messages + `KNOWN_BUGS.md` + `setup.md` + Outline common issues
---

# NovaNet MM Troubleshooting

Fixes for the issues customers actually hit. RAG-first content — the bot
should be able to answer these before escalating to a human admin.

## Facts (canonical values)

**Known error strings the customer might see (from `bot/strings.js`):**
- `❌ လက်ရှိ active package မရှိပါ` — customer has no active order/key. Solution: `/start` for trial, or buy a package.
- `⚠️ Key ရယူရာတွင် အမှားဖြစ်သွားသည်။ ခဏကြာပြီးနောက် ထပ်ကြိုးစားပါ` — transient DB/network error retrieving key. Solution: wait 30s, tap again.

**Known API error codes (from `KNOWN_BUGS.md` + `resellerMiniappRoutes.js`):**
- `409 ACTIVE_PACKAGE_EXISTS` — customer tried to buy a new package while an active order exists. **Design decision (2026-07-24):** only one active purchase order at a time. Customer must wait until current one expires OR contact admin.

**Common client-side errors:**
- iOS Outline: `"Unexpected nil disconnect error"` — see setup.md; delete VPN config + restart phone + re-add.
- Android: Outline shows "Not connected" repeatedly — usually a stale server; switch servers via Mini App.
- Windows/Mac: Outline says "Cannot connect" — check firewall / VPN blocker apps; retry with different server.

**Payment issues (from `purchase.md`):**
- Wrong amount sent → order NOT approved; contact admin
- Screenshot missing → order NOT approved; send screenshot via Admin/Support
- Screenshot edited/cropped → admin will reject; send a fresh original

## FAQ (Burmese + English)

Q_MM: Outline ချိတ်လို့ ရနေဘူး၊ ဘယ်လိုလုပ်ရမလဲ?
Q_EN: Outline won't connect. What should I do?
A_MM: အောက်ပါအဆင့်တွေကို တစ်ခုပြီး တစ်ခု စမ်းကြည့်ပါ —
1. **Server ပြောင်းကြည့်ပါ** — Mini App ရဲ့ **ဆာဗာ** tab ကနေ Singapore နဲ့ Japan ကို ပြောင်းစမ်းကြည့်ပါ (Paid user သာဖြစ်ရင်)
2. **Outline app ကို force close ပြီး ပြန်ဖွင့်ပါ** — အထူးသဖြင့် iOS မှာ helpful ပါ
3. **Key ကို ဖျက်ပြီး ပြန်ထည့်ကြည့်ပါ** — Outline app ထဲက key ကို remove လုပ်ပြီး Telegram Bot ရဲ့ 🔑 Outline Key ရယူရန် ကနေ ပြန်ရယူပါ
4. **ဖုန်း restart လုပ်ကြည့်ပါ** — VPN configuration တစ်ခုခု stuck ဖြစ်နေတာ ရှင်းသွားပါလိမ့်မယ်

အားလုံးလုပ်ပြီးလည်း အဆင်မပြေရင် Telegram Bot ရဲ့ **👤 Admin / Support** ကို ဆက်သွယ်ပါ။
A_EN: Try these in order —
1. **Switch server** — from Mini App **ဆာဗာ** tab, try switching between Singapore and Japan (paid users only)
2. **Force-close Outline app and reopen** — especially helpful on iOS
3. **Remove and re-add the key** — delete the key in Outline, then retrieve it fresh from the bot's 🔑 Outline Key ရယူရန်
4. **Restart your phone** — clears any stuck VPN configuration

If none of that works, contact **👤 Admin / Support** via the Telegram Bot.

Q_MM: iPhone မှာ "Unexpected nil disconnect error" ပြနေရင် ဘယ်လိုလုပ်ရမလဲ?
Q_EN: iPhone shows "Unexpected nil disconnect error" — how do I fix it?
A_MM: Outline app ရဲ့ version update ကြောင့် ဖြစ်လေ့ရှိတဲ့ ပြဿနာပါ —
1. ဖုန်း **Settings** → **General** → **VPN & Device Management** → **VPN** ကို သွားပါ
2. NovaNet MM နဲ့ စတဲ့ VPN configuration ဘေးက ⓘ ကို နှိပ်ပါ
3. **Delete VPN** ကို လုပ်လိုက်ပါ
4. ဖုန်းကို restart လုပ်ပါ
5. Outline app ဖွင့်ပြီး Connect ပြန်နှိပ်ရင် permission ပြန်တောင်းလာမှာမို့ **Allow** လုပ်ပါ

အဆင်မပြေရင် @novanetmmadmin ကို ဆက်သွယ်ပါ။
A_EN: Common iOS Outline bug after an app update —
1. Phone **Settings** → **General** → **VPN & Device Management** → **VPN**
2. Tap ⓘ next to the NovaNet MM VPN entry
3. Tap **Delete VPN**
4. Restart the phone
5. Open Outline, tap Connect — allow permission again when asked

If still stuck, contact @novanetmmadmin.

Q_MM: "လက်ရှိ active package မရှိပါ" လို့ ပြနေရင် ဘယ်လိုလုပ်ရမလဲ?
Q_EN: Bot says "No active package" — what do I do?
A_MM: သင့်ရဲ့ account မှာ active plan မရှိသေးဘူး ဆိုတဲ့ အဓိပ္ပါယ်ပါ။
- **အသစ်ဆိုရင်:** `/start` ကို နှိပ်ရင် 5GB Trial က အလိုအလျောက် စတင်ပါလိမ့်မယ်
- **Trial အသုံးပြုပြီးသားဆိုရင်:** Mini App ရဲ့ **ပက်ကေ့ချ်** tab ကနေ Basic (၄,၀၀၀ ကျပ်) ဒါမှမဟုတ် ပိုမြင့်တဲ့ plan တစ်ခုကို ဝယ်ပါ
- **Package က ကုန်သွားပြီးဆိုရင်:** တူညီတဲ့နည်းလမ်းနဲ့ plan အသစ်ဝယ်ပါ — လက်ရှိ key က အလိုအလျောက် ဆက်လက် အလုပ်လုပ်ပါလိမ့်မယ်
A_EN: Means your account has no active plan.
- **New user:** tap `/start` — 5GB trial auto-activates
- **Trial already used:** buy Basic (4,000 MMK) or higher from Mini App **ပက်ကေ့ချ်** tab
- **Package expired:** buy a new plan the same way — your existing key resumes automatically

Q_MM: Package အသစ်ဝယ်လို့ "already have an active package" (409 error) ပြနေရင် ဘယ်လိုလုပ်ရမလဲ?
Q_EN: Trying to buy a new package shows "already have an active package" (409 error) — what now?
A_MM: NovaNet MM မှာ လက်ရှိ active package တစ်ခုတည်း သာ ရှိလို့ရပါတယ်။ ဒါဆိုရင် ရွေးချယ်စရာ ၂ ခုရှိပါတယ် —
1. လက်ရှိ package ကုန်တဲ့အထိ စောင့်ပြီးမှ package အသစ်ဝယ်ပါ
2. Admin (@novanetmmadmin) ကို ဆက်သွယ်ပြီး လက်ရှိ package ကို ဖျက်ခိုင်းပြီးမှ package အသစ်ဝယ်ပါ

Renew / top-up feature ကို ဗားရှင်းအသစ်မှာ ထည့်ဖို့ ကြိုတင်စီစဉ်ထားပါတယ်။
A_EN: NovaNet MM only allows one active purchase package at a time. Two options —
1. Wait until your current package expires, then buy a new one
2. Contact admin (@novanetmmadmin) to cancel the current package first

Renew/top-up feature is planned for a future version.

Q_MM: Server ပြောင်းလို့ ရသေးဘဲ လိုင်း မမြန်ရင် ဘယ်လိုလုပ်ရမလဲ?
Q_EN: Switched servers but the connection is still slow — what now?
A_MM: အောက်ပါ အချက်တွေ စမ်းကြည့်ပါ —
- Outline app ထဲမှာ **Disconnect** နှိပ်ပြီး **Connect** ကို ပြန်နှိပ်လိုက်ပါ (server အသစ်နဲ့ ချိတ်ဆက်စေဖို့ လိုအပ်တာ ဖြစ်နိုင်ပါတယ်)
- တခြား server ကို စမ်းကြည့်ပါ — Singapore က Facebook အတွက် ပိုမြန်၊ Japan က gaming အတွက် ပိုသင့်တော်
- WiFi ကနေ Mobile data ကို ပြောင်းစမ်းကြည့်ပါ — တခါတရံ ISP ဘက်က ပြဿနာ ဖြစ်နိုင်ပါတယ်
- အခြား VPN app တွေ တစ်ချိန်တည်း run နေတယ်ဆိုရင် ပိတ်ပါ

ဆက်ပြီး ဖြစ်နေရင် @novanetmmadmin ကို screenshot နဲ့ အတူ ဆက်သွယ်ပါ။
A_EN: Try —
- Tap **Disconnect** then **Connect** in Outline again (may need to re-handshake with the new server)
- Try the other server — Singapore is faster for Facebook; Japan is better for gaming
- Switch between WiFi and mobile data — sometimes ISP is the issue
- Close any other running VPN apps

If it persists, contact @novanetmmadmin with a screenshot.

Q_MM: Data usage က မှားနေတယ်လို့ ထင်ရင် ဘယ်လိုလုပ်ရမလဲ?
Q_EN: My data usage looks wrong — what should I do?
A_MM: NovaNet MM က data ကို server-side က ကိုယ်တိုင် တိုင်းတာတာဖြစ်ပါတယ်။
- Mini App ရဲ့ **မူလ** tab မှာ လက်ရှိ usage ကို စစ်ကြည့်ပါ
- Outline app ထဲက usage counter နဲ့ ကွာနေရင် — Mini App ရဲ့ figure ကို ယုံပါ (server က authoritative source)
- ကွာနေတာ တကယ်များနေရင် @novanetmmadmin ကို screenshot နဲ့ ဆက်သွယ်ပါ
A_EN: NovaNet MM measures data server-side.
- Check current usage on the Mini App's **မူလ** tab
- If Outline app's counter differs, trust the Mini App (server is the authoritative source)
- If the discrepancy is very large, contact @novanetmmadmin with a screenshot

Q_MM: Payment လွှဲပြီး Screenshot upload မဖြစ်ဘူးဆိုရင် ဘယ်လိုလုပ်ရမလဲ?
Q_EN: I paid but the screenshot upload failed — what now?
A_MM: အောက်ပါအဆင့်များ စမ်းကြည့်ပါ —
1. Mini App ကို ပိတ်ပြီး ပြန်ဖွင့်ကြည့်ပါ (session refresh)
2. Screenshot file size သိပ်ကြီးရင် screenshot ကို ပြန်ရိုက်ပါ (crop မလုပ်ရ)
3. WiFi/Mobile data connection ကို စစ်ကြည့်ပါ
4. ဆက်လက် fail ဖြစ်ရင် Telegram Bot ရဲ့ **👤 Admin / Support** ကနေ screenshot ကို လက်တင်ပို့ပါ — order ID, transaction time, ငွေပမာဏတွေ ထည့်ပြောပါ

**မှတ်ချက်:** ငွေလွှဲပြီးသားဆိုရင် စိတ်မပူပါနဲ့ — screenshot ကို admin ဆီ တိုက်ရိုက်ပို့ရင် order ကို ဆက်လက်ဖြေရှင်းပေးပါလိမ့်မယ်။
A_EN: Try —
1. Close and reopen the Mini App (refresh the session)
2. If the screenshot file is too large, retake a smaller one (don't crop)
3. Check WiFi/mobile data connection
4. If it still fails, send the screenshot manually via the Telegram Bot's **👤 Admin / Support** — include order ID, transaction time, and amount

**Note:** If you already transferred the money, don't worry — sending the screenshot directly to admin lets them process the order.

Q_MM: Trial ကို ကြိုးစားပေမယ့် "already used" လို့ ပြနေရင် ဘယ်လိုလုပ်ရမလဲ?
Q_EN: Trying to claim trial but it says "already used" — what does this mean?
A_MM: သင့်ရဲ့ Telegram account က တစ်ကြိမ် trial ကို ရယူပြီးသားဖြစ်ပါတယ်။ Trial က Telegram account တစ်ခုစီအတွက် တစ်ကြိမ်သာ ရရှိနိုင်ပါတယ်။ VPN ဆက်လက်အသုံးပြုချင်ရင် Basic plan (၄,၀၀၀ ကျပ်) ကို Mini App ကနေ ဝယ်ယူပါ။
A_EN: Your Telegram account has already claimed a trial. Trials are one-per-Telegram-account. To keep using VPN, buy Basic plan (4,000 MMK) from the Mini App.

## Content angles (for content agent)

- **"Outline ချိတ်လို့ရနေဘူးရင် ဘာလုပ်ရမလဲ" quick-fix carousel** — 4-step
  troubleshooting sequence (switch server → force close → re-add key →
  restart phone)
- **"iOS Unexpected nil disconnect" fix post** — specific technical
  help; positions us as helpful (mirrors PassThru Post 28)
- **"Server switch ပြီးလည်း လိုင်း မမြန်ရင်" tip post** — reminds
  customers to Disconnect + Connect after switching
- **"Payment issue troubleshooting" mini-guide** — screenshot
  requirements + backup channel via Admin
- **"Data usage differs between apps" clarification post** — trust
  anchor about server-side measurement authority
- **"One active package at a time" awareness post** — soft explanation
  of the 409 rule so customers don't get frustrated

## Do NOT claim

- ❌ Do NOT claim we can fix ISP-level issues — network problems outside
  our servers are outside our scope
- ❌ Do NOT claim we can recover data on expired plans — data doesn't
  roll over
- ❌ Do NOT claim any troubleshooting takes "less than 1 minute" — set
  honest expectations
- ❌ Do NOT publish internal error codes (like `ACTIVE_PACKAGE_EXISTS`)
  in customer-facing posts — customer-friendly framing only
- ❌ Do NOT direct customers to third-party VPN troubleshooting sites —
  keep them in our support channel
- ❌ Do NOT recommend uninstalling Outline as a first step — it's a
  last resort; re-adding the key usually solves it
- ❌ Do NOT claim we can refund a mistaken payment automatically —
  refund is case-by-case admin decision
