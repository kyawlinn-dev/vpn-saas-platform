# Burmese Bot Text — Master Reference

Every Burmese string the Telegram bot sends, in one place for review. Two sources:

1. **Static bot UI text** — reply keyboard, /start, key delivery, server,
   download picker, buy/trial flows, how-to. Lives in
   `backend/src/bot/strings.js`. Same for every reseller.
2. **Notification templates** — the automated customer DMs (trial/sub expiring,
   payment confirmed/rejected, data-limit). Lives in
   `backend/src/bot/notificationTemplates.js`. **Reseller-editable** in the
   dashboard → Notifications page; the text below is the platform default.

> Kept in sync with the code as of 2026-09-24 (post Marzneshin multi-protocol
> refactor: Shadowsocks/Outline + VLESS Reality). When editing: change it here
> for review, then tell me to copy into the code file (Part 1 needs a code edit;
> Part 2 defaults can also be pasted into the dashboard editor).

---

## Part 1 — Static bot text (`backend/src/bot/strings.js`)

### Reply keyboard button labels (`BTN`, `BTN_TRIAL`)
Must stay short — these are physical buttons, and must match `bot.hears()`.

| Constant | Text |
|---|---|
| `BTN_TRIAL` | `🎁 အစမ်းသုံး ရယူရန်` |
| `BTN.BUY` | `🛒 ပက်ကေ့ဂျ် ဝယ်ရန်` |
| `BTN.KEY` | `🔑 VPN Key ရယူရန်` |
| `BTN.BALANCE` | `📊 လက်ကျန်စစ်ရန်` |
| `BTN.SERVER` | `🌐 Server ပြောင်းရန်` |
| `BTN.DOWNLOAD` | `📥 App ဒေါင်းလုပ်` |
| `BTN.HOWTO` | `📖 အသုံးပြုနည်း` |

### /start — welcome (`startWelcome`) · placeholder `${brandName}`
```
🌐 <b>${brandName}</b> မှ ကြိုဆိုပါသည်! 🎉

<b>${brandName}</b> မှ VPN ဝန်ဆောင်မှုဖြင့် လုံခြုံ၊ မြန်ဆန်စွာ internet ကို ကမ္ဘာ့မည်သည့်နေရာမှမဆို ချိတ်ဆက်နိုင်ပါပြီ။

🎁 User အသစ်များ <b>အစမ်းသုံး ရယူရန်</b> ကို နှိပ်၍ အခမဲ့ trial ရယူနိုင်ပါသည်။

📌 Menu ကို အသုံးပြု၍ —
   • 🎁 Trial Key ရယူနိုင်သည် (တစ်ကြိမ်သာ)
   • 🛒 Package ဝယ်ယူနိုင်သည်
   • 🔑 VPN Key ရယူနိုင်သည်
   • 📊 လက်ကျန်ဒေတာ စစ်ဆေးနိုင်သည်

အောက်ပါ menu မှ ရွေးချယ်ပါ 👇
```

### /start — CTA inline buttons
| Constant | Text | Shown when |
|---|---|---|
| `START_CTA_TEXT` | `📲 ဘာများ ကူညီပေးရမလဲ?` | second /start message |
| `START_BTN_TRIAL_KEY` | `🎁 အစမ်းသုံး ရယူရန်` | new user (no trial yet) |
| `START_BTN_GET_KEY` | `🔑 VPN Key ရယူရန်` | returning user (trial used) |
| `START_BTN_BUY_PACKAGE` | `🛒 ပက်ကေ့ဂျ် ဝယ်ရန်` | always (Mini App button) |
| `START_BTN_ADMIN` | `👤 Admin / Support` | when support_username set |

### Get Key (🔑) · placeholders `${customerName}`, `${flag}`, `${serverName}`
```
keyFoundHeader:  🔑 ယခု <b>${customerName}</b> အကောင့်အတွက် VPN Key မှာ:
keyServerLine:   🌐 Linked Server: ${flag} ${serverName}
KEY_BTN_DOWNLOAD: 📥 App ဒေါင်းလုပ်

KEY_COPY_INSTRUCTIONS_SS (Shadowsocks/ssconf):
  📋 URL ကို tap/copy ကူး၍ <b>Outline</b> app တွင် ထည့်ပါ။
     App မရှိသေးပါက 📥 <b>App ဒေါင်းလုပ်</b> ကို နှိပ်ပါ။

KEY_COPY_INSTRUCTIONS (VLESS subscription + QR):
  📋 QR scan (သို့) URL ကို copy ကူး၍ <b>Hiddify</b> / Xray app တွင်
     Subscription URL အဖြစ် ထည့်ပါ။ App မရှိသေးပါက 📥 <b>App ဒေါင်းလုပ်</b> ကို နှိပ်ပါ။

KEY_NO_ACTIVE:
  ❌ လက်ရှိ active package မရှိပါ။

  • Trial စမ်းသုံးရန် 🎁 <b>အစမ်းသုံး ရယူရန်</b> ကို နှိပ်ပါ
  • Package ဝယ်ယူရန် 🛒 <b>ပက်ကေ့ဂျ် ဝယ်ရန်</b> ကို နှိပ်ပါ

KEY_ERROR:
  ⚠️ Key ရယူရာတွင် အမှားဖြစ်သွားသည်။ ခဏကြာပြီးနောက် ထပ်ကြိုးစားပါ။
```

### Balance (📊)
```
BALANCE_TEXT:
  📊 <b>လက်ကျန် GB စစ်ဆေးရန်:</b>
  လက်ကျန် data နှင့် သက်တမ်း အချက်အလက်များကို VPN app တွင် ကြည့်ရှုနိုင်ပါသည်။
  အောက်ပါ <b>Open VPN</b> ကို နှိပ်ပါ 👇

balanceText (with numbers): 📈 အသုံးပြုပြီး / 📉 လက်ကျန် / 📅 သက်တမ်းကုန်ရက်
BALANCE_BTN_OPEN: 📊 Open VPN
```

### Server (🌐)
```
SERVER_VLESS_EXPLAIN (premium VLESS — covers all nodes):
  🌐 <b>VLESS Subscription</b>
  သင့် VLESS subscription သည် <b>server အားလုံးကို အလိုအလျောက် ပေါင်းစပ်</b>ပေးသည်။
  Hiddify / Xray app က <b>အကောင်းဆုံး server</b> ကို အလိုအလျောက် ရွေးပေးမည်ဖြစ်၍ manual switch မလိုပါ။

SERVER_VLESS_TRIAL (trial VLESS — one node only):
  ⚡ <b>VLESS Trial · Trial Server သာ</b>
  Trial VLESS key သည် <b>Trial server တစ်ခုသာ</b> ချိတ်ဆက်နိုင်သည်။
  🔓 Server အားလုံးသို့ ချိတ်ဆက်ရန် Premium package ဝယ်ယူပါ။

serverChooseText / SERVER_SWITCHING / serverSwitchSuccess / SERVER_TRIAL_LOCKED /
SERVER_ALREADY_LINKED / SERVER_NO_KEY / SERVER_SWITCH_ERROR — see strings.js.
SERVER_BTN_OPEN: 🌐 Change Server
```

### Download App (📥) — 3-level flow
Level 1 protocol picker → Level 2 OS picker → Level 3 app links.
```
DOWNLOAD_PICKER_TEXT:
  📥 <b>VPN App Download</b>
  Protocol ပေါ်မူတည်ပြီး App မတူပါ —
  📱 <b>Outline</b> — Outline app
  🌐 <b>VLESS / Xray</b> — Hiddify · V2Box · V2rayTun · V2rayNG
  သင်အသုံးပြုသော protocol ကို ရွေးချယ်ပါ 👇

DL_PROTO_BTNS:  SS `📱 Outline` · VLESS `🌐 VLESS / Xray`
DL_OS_BTNS:     🍎 iPhone / iPad · 🤖 Android · 💻 macOS · 🪟 Windows · ⬅️ ပြန်သွားရန်
```
Per-OS app link screens: `DL_SS_PLATFORMS` (Outline) and `DL_VLESS_PLATFORMS`
(Hiddify / V2Box / V2rayTun / V2rayNG) — full text + store URLs in strings.js.

### Buy Package (🛒) flow
```
BUY_SELECT_PROTOCOL:
  📶 <b>Protocol ရွေးချယ်ပါ</b>
     📱 <b>Outline</b> └ Outline app ဖြင့် တစ်ဆင့်ထည့်သွင်းပြီး အသုံးပြုနိုင်သည်
     🌐 <b>VLESS</b>   └ Hiddify / V2Box / V2rayTun / V2rayNG ဖြင့် အသုံးပြုနိုင်သည်
BUY_PROTO_SS_BTN: 📱 Outline · BUY_PROTO_VLESS_BTN: 🌐 VLESS

BUY_SELECT_PLAN: 🛒 <b>ပက်ကေ့ဂျ် ရွေးချယ်ပါ</b> …
BUY_NO_PLANS / BUY_PROCESSING / BUY_ALREADY_ACTIVE / BUY_CANCELLED / BUY_ERROR /
BUY_NO_SESSION — see strings.js.

buyPaymentInstructions(plan, methods): 📦 name / 💰 price MMK / 📊 GB | ⏰ ရက် /
  💳 ငွေပေးချေနည်း / 📸 screenshot ပေးပို့ရန် / ⏱ ၁၀ မိနစ်အတွင်း …

buySuccessText: ✅ <b>{plan}</b> ပက်ကေ့ဂျ် စတင်ပါပြီ! / 🔑 Subscription URL /
  Hiddify app တွင် ထည့်သွင်းပါ / 📅 သက်တမ်းကုန်ရက် / ⚠️ Reseller စစ်ဆေးဆဲ …
```

### Reseller notification (bot → reseller on purchase)
```
resellerNotifyCaption: 💰 <b>ငွေပေးချေမှု ရောက်ရှိလာပါပြီ</b> / 👤 Customer /
  📦 Package / 💵 MMK | 📊 GB | ⏰ ရက် / 🆔 Order / ✅ အတည်ပြုမည် ❌ ငြင်းပယ်မည်
NOTIFY_CONFIRM_BTN: ✅ အတည်ပြုမည် · NOTIFY_REJECT_BTN: ❌ ငြင်းပယ်မည်
NOTIFY_CONFIRMED: ✅ <b>ငွေပေးချေမှု အတည်ပြုပြီး</b>
NOTIFY_REJECTED:  ❌ <b>ငြင်းပယ်ပြီး — ဝန်ဆောင်မှု ရပ်နားသွားမည်</b>

CUSTOMER_PAYMENT_CONFIRMED: ✅ <b>ငွေပေးချေမှု အတည်ပြုပါပြီ</b> 🎉 / 🔑 VPN Key ရယူရန် …
CUSTOMER_PAYMENT_REJECTED:  ❌ <b>ငွေပေးချေမှု အတည်မပြုနိုင်ပါ</b> …
```

### Trial (🎁) flow
```
TRIAL_SELECT_PROTOCOL: 🎁 <b>Trial Key ရယူမည်</b> — Protocol picker (Outline / VLESS)
TRIAL_PROCESSING / TRIAL_ALREADY_USED / TRIAL_NO_ACCOUNT / TRIAL_ERROR — see strings.js.
```

### How-to (📖)
`howToUseSS()` (Outline), `howToUseVless()` (Hiddify/Xray), `howToUse()` (combined
guide when protocol unknown). Full step-by-step text in strings.js.

---

## Part 2 — Notification templates (`backend/src/bot/notificationTemplates.js`)

Reseller-editable defaults. Placeholder syntax `{key}` (single braces). Headers
are intentionally kept in casual English (product decision); bodies are Burmese.
8 event types:

### 1. `trial_ending_24h` · `{expiry_date}`, `{price_from_mmk}` (+ Package button)
```
<b>⏰ trial ending soon!</b>

သင့် အစမ်းသုံးပက်ကေ့ချ်သည် နောက် ၂၄ နာရီ အတွင်း ကုန်ဆုံးမည်ဖြစ်ပါသည်။
📅 ကုန်ဆုံးရက်: {expiry_date}
ပက်ကေ့ချ်အသစ်ဝယ်ယူရန် အောက်ပါ “Package ဝယ်ရန်” ခလုတ်ကိုနှိပ်ပြီး {price_from_mmk} ကျပ်မှစ၍ဝယ်ယူအားပေးနိုင်ပါတယ် 👇
```

### 2. `trial_expired` · `{price_from_mmk}`, `{support_username}`
```
<b>❌ trial expired!</b>

သင့်အစမ်းသုံးပက်ကေ့ချ်သည် ကုန်ဆုံးသွားပါပြီ။
ပက်ကေ့ချ်အသစ်ဝယ်ယူရန် အောက်ပါ "Package ဝယ်ရန်" ခလုတ်ကိုနှိပ်ပြီး {price_from_mmk} ကျပ်မှစ၍ဝယ်ယူအားပေးနိုင်ပါတယ် 👇

အကူအညီ လိုပါက Admin ကို ဆက်သွယ်ပါ 👇   (support_username မရှိပါက ဤစာကြောင်း ပျောက်သွားသည်)
```

### 3. `subscription_expiring_3d` · `{plan_name}`, `{expiry_date}`
```
<b>⏰ package ending soon!</b>

သင့် {plan_name} Package သည် နောက် ၃ ရက် အတွင်း ကုန်ဆုံးမည်။
📅 ကုန်ဆုံးရက်: {expiry_date}
သက်တမ်းတိုးရန် အောက်ပါ "Package ဝယ်ရန်" ခလုတ်ကိုနှိပ်ပြီး ဆက်လက်အသုံးပြုနိုင်ပါတယ် 👇
```

### 4. `subscription_expired` · `{plan_name}`, `{support_username}`
```
<b>❌ package expired!</b>

သင့် {plan_name} Package သည် ကုန်ဆုံးသွားပါပြီ။
သက်တမ်းတိုးရန် အောက်ပါ "Package ဝယ်ရန်" ခလုတ်ကိုနှိပ်ပါ 👇

အကူအညီ လိုပါက Admin ကို ဆက်သွယ်ပါ 👇   (support_username မရှိပါက ဤစာကြောင်း ပျောက်သွားသည်)
```

### 5. `payment_confirmed` · `{plan_name}`, `{expiry_date}`
```
<b>✅ payment confirmed!</b>

ကျေးဇူးတင်ပါတယ်! သင့်ငွေပေးချေမှုကို အတည်ပြုပြီးပါပြီ 🎉

📦 Package: {plan_name}
📅 သက်တမ်း: {expiry_date} အထိ

Key ရယူဖို့ အောက်က 🔑 VPN Key ရယူရန် ခလုတ်ကို နှိပ်ပါ 👇
```

### 6. `payment_rejected` · `{plan_name}`, `{reject_reason}`, `{support_username}`
```
<b>❌ payment rejected!</b>

သင့်ငွေပေးချေမှုအား အတည်မပြုနိုင်ပါ

📦 Package: {plan_name}
📝 အကြောင်းရင်း: {reject_reason}

ပြန်လည် ငွေပေးချေရန်၊ သို့မဟုတ် အကူအညီ လိုပါက Admin ကို ဆက်သွယ်ပါ 👇
```

### 7. `data_limit_reached` · `{plan_name}`
```
<b>⚠️ data limit reached!</b>

သင့် {plan_name} ၏ data limit ကို အသုံးပြုပြီးပါပြီ။ VPN ချိတ်ဆက်မှု ရပ်တန့်သွားပါပြီ။
ဆက်လက်အသုံးပြုလိုပါက အောက်ပါ "Package ဝယ်ရန်" ခလုတ်ကိုနှိပ်ပါ 👇
```

### 8. `data_limit_warning` · `{plan_name}`, `{percent_used}`, `{remaining_gb}`
```
<b>⚠️ data limit ကုန်ခါနီးပြီ!</b>

သင့် {plan_name} ၏ data ကို {percent_used}% အသုံးပြုပြီးပါပြီ — လက်ကျန် {remaining_gb} GB သာ ရှိပါတော့သည်။
Data ကုန်သွားပါက VPN ချိတ်ဆက်မှု ချက်ချင်း ရပ်တန့်သွားပါလိမ့်မည်။
ကြိုတင်ဝယ်ယူထားလိုပါက အောက်ပါ "Package ဝယ်ရန်" ခလုတ်ကိုနှိပ်ပါ 👇
```

---

## Editing notes

- **HTML tags allowed:** `<b>`, `<i>`, `<u>`, `<s>`, `<code>`, `<pre>`,
  `<a href>`, `<tg-emoji>`. Anything else breaks `parse_mode: HTML`.
- **Part 1 placeholders** use `${...}` (JS template literals) → code edit only.
- **Part 2 placeholders** use `{...}` (single braces) → dashboard-editable per
  reseller; unknown placeholders are rejected on save.
- **Protocol naming:** the bot brands Shadowsocks as **"Outline"** (the app) for
  users; VLESS Reality apps are Hiddify / V2Box / V2rayTun / V2rayNG. Keep this
  consistent.
- Emoji are load-bearing for scanability. Burmese digits (`၀-၉`) are used in
  notification dates via `formatBurmeseDate`.
