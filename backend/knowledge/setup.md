---
title: NovaNet MM Outline Setup Guide
last_updated: 2026-08-10
audience: customer
consumers: [content-agent, rag-bot]
pillars: [How-To, Education, Convenience]
tags: [setup, outline, ios, android, windows, mac, install, key, connect]
source: `bot/strings.js` + `bot/handlers.js` + `marketing/novanet-user-manual.md`
---

# NovaNet MM Outline Setup Guide

Install Outline VPN and add the NovaNet MM key. Cross-device, one-time
setup per device.

## Facts (canonical values)

**Prerequisite apps (customer needs these installed):**
- **Outline** — the VPN client. Free, official.
  - iOS: https://apps.apple.com/app/id1356177741
  - Android: https://play.google.com/store/apps/details?id=org.outline.android.client
  - macOS: https://apps.apple.com/app/id1356178125
  - Windows: https://apps.microsoft.com/store/detail/outline/9NQMQLKNTQX6
  - Linux: https://getoutline.org
- **Telegram** — for the bot + Mini App.

(URLs verified against `backend/src/bot/strings.js` `DOWNLOAD_PLATFORMS`.)

**Bot has a built-in download picker:** From the persistent menu, tap
**📥 Download Outline** → pick your device (🍎 iOS / 🤖 Android / 💻 macOS /
🪟 Windows) → the bot sends the correct store link. Customers don't need
to remember URLs.

**Key format:**
- Outline keys are `ssconf://...` URLs (Shadowsocks config).
- Delivered by the NovaNet MM Bot in a message with a **➕ Add Key To Outline** button.

**Two ways to add a key:**
1. **Button flow (recommended):** Tap **➕ Add Key To Outline** in the bot
   message → Outline app opens with the key pre-loaded → Confirm.
2. **Manual flow (fallback):** Copy the `ssconf://` URL from the bot
   message → open Outline → tap **Add Access Key** (or **+**) → paste →
   Save.

**Cross-device support:**
- Same key works on Phone / Tablet / Laptop / Desktop simultaneously
- No separate keys per device
- Device policy is unlimited (see `plans.md`)

**Server switching (paid users):**
- Add key once — server changes happen via Mini App **ဆာဗာ** tab
- The key does NOT need to be re-added when switching servers
- In Outline, just tap Disconnect → Connect again to route through the new server

**Bot menu (verified against `strings.js` `BTN` object):**
- 🔑 Outline Key ရယူရန်
- 📊 လက်ကျန်စစ်ရန်
- 🌐 Server ပြောင်းရန်
- 📥 Download Outline
- 📖 အသုံးပြုနည်း

## FAQ (Burmese + English)

Q_MM: Outline app က ဘယ်ကနေ download လုပ်ရမလဲ?
Q_EN: Where do I download the Outline app?
A_MM: နည်းလမ်း ၂ မျိုးရှိပါတယ် —

**နည်းလမ်း ၁ (အလွယ်ဆုံး):** NovaNet MM Bot ရဲ့ menu ကနေ **📥 Download Outline** ကို နှိပ်ပြီး ကိုယ့် device (🍎 iOS / 🤖 Android / 💻 macOS / 🪟 Windows) ကို ရွေးလိုက်ပါ။ Bot က တိုက်ရိုက် download link ပို့ပေးပါလိမ့်မယ်။

**နည်းလမ်း ၂:** ကိုယ့်ဖုန်း / ကွန်ပျူတာ ရဲ့ App Store / Play Store / Microsoft Store မှာ "Outline" ဆိုပြီး ကိုယ်တိုင် ရှာဖွေ download လုပ်နိုင်ပါတယ်။

နည်းလမ်း ၂ ခုစလုံးက အတူတူပါပဲ — Bot က link ကို တစ်ချက်နှိပ်ရုံနဲ့ ရလို့ ပိုမြန်ပါတယ်။
A_EN: Two ways —

**Option 1 (easiest):** From the NovaNet MM Bot menu, tap **📥 Download Outline** and pick your device (🍎 iOS / 🤖 Android / 💻 macOS / 🪟 Windows). Bot sends the direct store link.

**Option 2:** Search "Outline" in your phone's App Store / Play Store / Microsoft Store and download it yourself.

Both work identically — Option 1 is just faster because it's one tap.

Q_MM: Key ကို ဘယ်လိုထည့်ရမလဲ?
Q_EN: How do I add the key?
A_MM: NovaNet MM Bot က ပို့တဲ့ key message ထဲမှာ **➕ Add Key To Outline** ဆိုတဲ့ ခလုတ်ကို နှိပ်ပါ။ Outline app ဖွင့်လာပြီး key ကို auto-fill လုပ်ပါလိမ့်မယ်။ Confirm နှိပ်ရင် key ထည့်ပြီးဖြစ်ပါပြီ။ ပြီးရင် Outline app ထဲမှာ **Connect** နှိပ်ရင် VPN ချိတ်ဆက်ပြီးဖြစ်ပါလိမ့်မယ်။
A_EN: In the key message from NovaNet MM Bot, tap the **➕ Add Key To Outline** button. Outline app opens with the key pre-loaded — tap Confirm. Then tap **Connect** in Outline.

Q_MM: **Add Key** ခလုတ်က အလုပ်မလုပ်ဘူးဆိုရင် ဘယ်လိုလုပ်ရမလဲ?
Q_EN: What if the "Add Key" button doesn't work?
A_MM: Manual နည်းလမ်း သုံးပါ။
1. Bot က key message ကို tap-and-hold လုပ်ပြီး `ssconf://...` ကနေ စတဲ့ URL ကို copy ကူးပါ။
2. Outline app ကို ဖွင့်ပါ။
3. **Add Access Key** ဒါမှမဟုတ် **+** ခလုတ်ကို နှိပ်ပါ။
4. Paste လုပ်ရင် key က အလိုအလျောက် ဝင်ပါလိမ့်မယ်။
5. Save လုပ်ပြီး Connect နှိပ်ပါ။
A_EN: Manual method:
1. Long-press the key message in the bot → copy the `ssconf://` URL
2. Open Outline app
3. Tap **Add Access Key** or **+** button
4. Paste — key auto-populates
5. Save, then Connect

Q_MM: တစ်ခုတည်း သော key ကို ဖုန်း၊ Laptop ၂ ခုစလုံးမှာ တစ်ချိန်တည်း သုံးလို့ရလား?
Q_EN: Can I use the same key on phone AND laptop at the same time?
A_MM: ရပါတယ်။ တစ်ခုတည်း သော key ကို Phone, Laptop, Mac, PC — device အားလုံးမှာ ထည့်ပြီး တစ်ချိန်တည်း အသုံးပြုနိုင်ပါတယ်။ Device အလုံးရေ အကန့်အသတ်လုံးဝ မရှိပါ။
A_EN: Yes — the same key works on unlimited Phone / Laptop / Mac / PC devices at the same time. No device limit.

Q_MM: Connect နှိပ်လိုက်ရင် Outline က "Permission" တောင်းနေရင် ဘယ်လိုလုပ်ရမလဲ?
Q_EN: Outline is asking for permission when I tap Connect?
A_MM: **Allow** ဒါမှမဟုတ် **Continue** ကို နှိပ်လိုက်ပါ။ VPN service အသုံးပြုဖို့ ဖုန်း/laptop က တစ်ကြိမ်တည်း allow လုပ်ဖို့ လိုအပ်ပါတယ်။ တစ်ခါ allow လုပ်ပြီးရင် နောက်တစ်ခါ တောင်းစရာ မရှိတော့ပါ။
A_EN: Tap **Allow** or **Continue**. VPN permission is one-time per device — the OS needs to confirm you want to route traffic through the VPN. Asked once, remembered forever.

Q_MM: Server ကို ဘယ်လိုပြောင်းရမလဲ?
Q_EN: How do I switch servers?
A_MM: Server switching က Outline app ထဲမှာ မဟုတ်ဘဲ Mini App ထဲမှာ လုပ်တာဖြစ်ပါတယ်။ Telegram Bot က **🛒 ဝယ်ယူရန်** ခလုတ်ကနေ Mini App ကို ဖွင့်ပါ → အောက်ခြေက **ဆာဗာ** tab ကို နှိပ်ပါ → Singapore သို့မဟုတ် Japan ကို ရွေးပါ။ ပြီးရင် Outline app ကို ဖွင့်ပြီး Disconnect နဲ့ Connect ကို တစ်ခါ ပြန်လုပ်လိုက်ရင် server အသစ်နဲ့ ချိတ်ဆက်ပြီးဖြစ်ပါလိမ့်မယ်။
A_EN: Server switching happens in the Mini App, not Outline. Open the Mini App via **🛒 ဝယ်ယူရန်** in Telegram Bot → tap **ဆာဗာ** tab at the bottom → pick Singapore or Japan. Then in Outline, tap Disconnect → Connect again to route through the new server.

Q_MM: ဖုန်းကို reset လုပ်ပြီး Outline ကို ပြန်တင်ရင် key ကို ဘယ်လိုပြန်ရလဲ?
Q_EN: I reset my phone. How do I get my key back?
A_MM: Telegram Bot ကို ဖွင့်ပါ → **🔑 Outline Key ရယူရန်** ကို နှိပ်ပါ → Bot က သင့် account ရဲ့ လက်ရှိ key ကို ပြန်ပေးပါလိမ့်မယ်။ **➕ Add Key To Outline** နှိပ်ပြီး ပြန်ထည့်လိုက်ရင် ရပါပြီ။
A_EN: Open Telegram Bot → tap **🔑 Outline Key ရယူရန်** → bot returns your current key → tap **➕ Add Key To Outline** to re-add.

Q_MM: iPhone မှာ "Unexpected nil disconnect error" ဆိုပြီး ပေါ်နေရင် ဘယ်လိုလုပ်ရမလဲ?
Q_EN: iOS shows "Unexpected nil disconnect error" — what do I do?
A_MM: Outline app ရဲ့ version update ကြောင့် ဖြစ်လေ့ရှိတဲ့ ပြဿနာပါ။
1. ဖုန်း **Settings** → **General** → **VPN & Device Management** → **VPN** ကို သွားပါ။
2. NovaNet MM နဲ့ စတဲ့ VPN configuration ဘေးက ⓘ ကို နှိပ်ပါ။
3. **Delete VPN** ကို လုပ်လိုက်ပါ။
4. ဖုန်းကို ပိတ်ဖွင့် (restart) လုပ်ပါ။
5. Outline မှာ Connect ပြန်နှိပ်ရင် permission ပြန်တောင်းလာမှာမို့ Allow လုပ်ပါ။

အဆင်မပြေရင် Telegram Bot ရဲ့ **👤 Admin / Support** ကို ဆက်သွယ်ပါ။
A_EN: Common iOS Outline bug after an app update.
1. Phone **Settings** → **General** → **VPN & Device Management** → **VPN**
2. Tap ⓘ next to the NovaNet MM VPN entry
3. Tap **Delete VPN**
4. Restart the phone
5. Open Outline, tap Connect — allow permission again when asked

If still stuck, contact **👤 Admin / Support** via the Telegram Bot.

## Content angles (for content agent)

- **"Outline VPN တင်နည်း — iOS" how-to carousel** (style F, real screenshots)
- **"Outline VPN တင်နည်း — Android" how-to carousel** (style F)
- **"NovaNet MM Key ကို Add လုပ်နည်း" 3-step tutorial** — the classic
  onboarding post using button flow
- **"Phone, Laptop, Mac အားလုံးမှာ တစ်ခုတည်း key နဲ့ သုံးလို့ရ" cross-device
  post** — unlimited-devices differentiator
- **"Key ပျောက်သွားရင် ဘယ်လိုပြန်ရလဲ" recovery how-to** — trust anchor
- **"iOS Unexpected nil disconnect" troubleshooting post** — mirrors
  PassThru Post 28's format, positions us as helpful/technical
- **Server switching walkthrough** — how paid users move between SG and JP
  via the Mini App **ဆာဗာ** tab
- **"Bot menu ကနေ တိုက်ရိုက် Outline download လုပ်နည်း"** — highlight the
  built-in download picker (many customers don't know it exists)
- **"Manual key add" backup method post** — for users whose button doesn't work

## Do NOT claim

- ❌ Do NOT claim Outline works without installing the Outline app —
  it doesn't; the app is required
- ❌ Do NOT claim our keys work with WireGuard, OpenVPN, or any other
  VPN client — only Outline (which uses Shadowsocks protocol)
- ❌ Do NOT claim setup is "no download needed" — the customer must
  install Outline first
- ❌ Do NOT claim the key auto-syncs across devices — customer must
  add the key on each device manually (or via bot recovery)
- ❌ Do NOT claim we install / configure the app on the customer's
  behalf — we deliver the key, customer installs the app
- ❌ Do NOT publish real key strings (`ssconf://...`) in public content
  posts — they're user-specific credentials
- ❌ Do NOT use "Servers tab" as an English label in Burmese posts —
  the Mini App shows **ဆာဗာ**
