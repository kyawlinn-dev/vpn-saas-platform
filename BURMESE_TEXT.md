# Telegram Text — Current Source Reference

Exported declarations from the implementation source. Inline handler copy and reseller overrides are outside this snapshot. No claim of deployment.


Exported declarations: 94.
## backend/src/bot/strings.js

Source SHA-256 (LF-normalized): 35cde6f0c61f1d3e2a3a6141ebe11771f69fc7a06f88ca45d260b0a2ed38f7f2

```javascript
export const BTN = {
  KEY:      "🔑 ကျွန်ုပ်၏ VPN Key",
  BALANCE:  "📊 ဒေတာနှင့် သက်တမ်းစစ်ရန်",
  SERVER:   "🌐 ဆာဗာ ပြောင်းရန်",
  DOWNLOAD: "📥 VPN App ရယူရန်",
  HOWTO:    "📖 အသုံးပြုနည်း လမ်းညွှန်",
};
```

```javascript
export const LEGACY_BTN = {
  KEY: "🔑 VPN Key ရယူရန်",
  BALANCE: "📊 လက်ကျန်စစ်ရန်",
  SERVER: "🌐 Server ပြောင်းရန်",
  DOWNLOAD: "📥 App ဒေါင်းလုပ်",
  HOWTO: "📖 အသုံးပြုနည်း",
  TRIAL: "🎁 အစမ်းသုံး ရယူရန်",
  BUY: "🛒 ပက်ကေ့ဂျ် ဝယ်ရန်",
};
```

```javascript
export const BTN_TRIAL = "🎁 အခမဲ့ စမ်းသုံးမည်";
```

```javascript
export function startWelcome(brandName) {
  return `🌐 <b>${brandName}</b> မှ နွေးထွေးစွာ ကြိုဆိုပါသည်! 🎉\n\nလိုင်းပိတ်ပင်မှုမရှိဘဲ လုံခြုံစွာ အင်တာနက် အသုံးပြုနိုင်ရန် VPN ဝန်ဆောင်မှု ပေးနေပါသည်။`;
}
```

```javascript
export const START_CTA_TEXT = "အောက်ပါခလုတ်များမှ မိမိအသုံးပြုလိုရာကို ရွေးချယ်ပါ 👇";
```

```javascript
export const MENU_MY_VPN = "🛡️ ကျွန်ုပ်၏ VPN";
```

```javascript
export const MENU_HELP = "💬 အကူအညီနှင့် လမ်းညွှန်";
```

```javascript
export const MENU_BACK = "⬅️ နောက်သို့";
```

```javascript
export const MENU_HOME = "🏠 ပင်မသို့";
```

```javascript
export const MENU_MY_VPN_TEXT = "<b>ကျွန်ုပ်၏ VPN</b>\nအသုံးပြုလိုသည့်အရာကို ရွေးချယ်ပါ။";
```

```javascript
export const MENU_HELP_TEXT = "<b>အကူအညီနှင့် လမ်းညွှန်</b>\nသိလိုသည့်အရာကို ရွေးချယ်ပါ။";
```

```javascript
export const START_BTN_ADMIN        = "👤 Admin / Support";
```

```javascript
export const START_BTN_TRIAL_KEY    = BTN_TRIAL;
```

```javascript
export const START_BTN_GET_KEY      = BTN.KEY;
```

```javascript
export const START_BTN_BUY_PACKAGE  = "🛒 ပက်ကေ့ဂျ် ဝယ်ယူမည်";
```

```javascript
export const START_CB_GET_KEY   = "start:get_key";
```

```javascript
export const START_CB_GET_TRIAL = "start:get_trial";
```

```javascript
export function appOpenText(brandName) {
  const name = brandName || "VPN";
  return `📱 <b>${name} Mini App</b> တွင် ဆာဗာများ၊ ပက်ကေ့ဂျ်များနှင့် အကောင့်အချက်အလက်များကို စီမံခန့်ခွဲနိုင်ပါသည် 👇`;
}
```

```javascript
export const APP_BTN_OPEN = "📱 Mini App ဖွင့်ရန်";
```

```javascript
export const APP_UNAVAILABLE = "⚠️ Mini App ကို ယခု ဖွင့်၍ မရသေးပါ။ ခဏအကြာတွင် ထပ်မံကြိုးစားပါ။";
```

```javascript
export const COMMAND_START_REQUIRED = "ပထမဆုံး /start ကို နှိပ်ပြီး အကောင့်ဖွင့်ပါ။ ထို့နောက် ဤလုပ်ဆောင်ချက်ကို ပြန်ရွေးနိုင်ပါသည်။";
```

```javascript
export function keyFoundHeader(customerName) {
  return `🔑 <b>${customerName}</b> အတွက် VPN ချိတ်ဆက်ရန် Key:`;
}
```

```javascript
export function keyServerLine(flag, serverName) {
  return `🌐 ချိတ်ဆက်ထားသော ဆာဗာ: ${flag} <b>${serverName}</b>`;
}
```

```javascript
export const KEY_COPY_INSTRUCTIONS_SS =
  "📋 <b>အသုံးပြုနည်း:</b>\n၁။ အထက်ပါ Key ကို နှိပ်ပြီး Copy ယူပါ\n" +
  "၂။ <b>Outline App</b> ကိုဖွင့်ပြီး ထည့်သွင်းပါ\n၃။ <b>Connect</b> ကိုနှိပ်ပါ ✅\n\n" +
  "App မရှိသေးပါက အောက်ပါ 📥 VPN App ရယူရန် ကို နှိပ်ပါ။";
```

```javascript
export const KEY_COPY_INSTRUCTIONS =
  "📋 <b>အသုံးပြုနည်း:</b>\n၁။ အထက်ပါ QR ကို Scan ဖတ်ပါ (သို့) Key ကို Copy ယူပါ\n" +
  "၂။ <b>Happ / Hiddify / V2Box</b> ထဲတွင် ထည့်သွင်းပါ\n" +
  "၃။ ဆာဗာရွေးချယ်ပြီး <b>Connect</b> ကို နှိပ်ပါ ✅\n\n" +
  "App မရှိသေးပါက အောက်ပါ 📥 VPN App ရယူရန် ကို နှိပ်ပါ။";
```

```javascript
export const KEY_BTN_DOWNLOAD = BTN.DOWNLOAD;
```

```javascript
export const KEY_NO_ACTIVE =
  "လက်ရှိ အသုံးပြုနိုင်သော VPN Key မရှိပါ။\n\nအောက်ပါခလုတ်မှ ပက်ကေ့ဂျ် ဝယ်ယူနိုင်ပါသည် 👇";
```

```javascript
export const KEY_ERROR =
  "⚠️ Key ရယူရာတွင် အမှားဖြစ်သွားသည်။ ခဏကြာပြီးနောက် ထပ်ကြိုးစားပါ။";
```

```javascript
export const BALANCE_TEXT =
  "📊 <b>သင်၏ VPN ဒေတာနှင့် သက်တမ်း အခြေအနေ</b>\n\n" +
  "အသေးစိတ်အချက်အလက်များကို Mini App တွင် ကြည့်ရှုနိုင်ပါသည်။";
```

```javascript
export function balanceText({
  usedGb,
  remainingGb,
  isUnlimited,
  expiryDate,
  formatBurmeseDate,
  queuedPlan = null,
  totalGb = null,
  businessSummary = null,
  lastPackage = null,
}) {
  if (businessSummary && businessSummary.access_status !== "active") {
    return "📊 VPN ဒေတာအခြေအနေ\n\nအသုံးပြုနေသော ပက်ကေ့ချ်မရှိပါ။" + (lastPackage ? "\n\nနောက်ဆုံးအသုံးပြုခဲ့သော ပက်ကေ့ချ်: <b>"+escapeHtml(lastPackage.planName || "Package")+"</b>"+(lastPackage.expiryDate ? "\n"+formatBurmeseDate(lastPackage.expiryDate) : "") : "");
  }
  const gb = (n) => n == null ? "မရနိုင်သေးပါ" : Number(n) === 0 ? "0 GB" : Number(n) < 0.01 ? "&lt;0.01 GB" : Number(n).toFixed(2)+" GB";
  const totalLine = isUnlimited ? "Unlimited" : gb(totalGb);
  const remainingLine = isUnlimited
    ? "🔓 အကန့်အသတ်မရှိ (Unlimited)"
    : remainingGb != null
      ? gb(remainingGb)
      : "-";

  let queuedSection = "";
  if (queuedPlan) {
    const qData = queuedPlan.dataLimitGb ? `${queuedPlan.dataLimitGb} GB` : "Unlimited";
    const qDays = queuedPlan.durationDays ? `${queuedPlan.durationDays} ရက်` : "";
    queuedSection =
      "\n\n⏳ <b>ကြိုတင်ဝယ်ယူထားသော နောက်ပက်ကေ့ဂျ်:</b>\n" +
      `📦 <b>${queuedPlan.planName}</b>\n` +
      `📊 ဒေတာ: <b>${qData}</b>  |  ⏰ သက်တမ်း: <b>${qDays}</b>\n` +
      "ℹ️ <i>လက်ရှိပက်ကေ့ဂျ် ကုန်ဆုံးပြီးမှ အလိုအလျောက် စတင်ပါမည်။</i>";
  }

  const expiryLine = expiryDate ? `\n📅 သက်တမ်းကုန်ဆုံးမည့်ရက်: ${formatBurmeseDate(expiryDate)}` : "";

  return (
    "📊 <b>သင်၏ VPN ဒေတာနှင့် သက်တမ်း အခြေအနေ:</b>\n\n" +
    `📦 စုစုပေါင်း ဒေတာ: <b>${totalLine}</b>\n` +
    `📈 အသုံးပြုထားသော ဒေတာ: <b>${gb(usedGb)}</b>\n` +
    `📉 ကျန်ရှိသော ဒေတာ: <b>${remainingLine}</b>` +
    expiryLine +
    queuedSection +
    "\n\nအသေးစိတ်အချက်အလက်များကို Mini App တွင်လည်း ကြည့်ရှုနိုင်ပါသည် 👇"
  );
}
```

```javascript
export function balanceQueuedOnlyText({ queuedPlan }) {
  const qData = queuedPlan.dataLimitGb ? `${queuedPlan.dataLimitGb} GB` : "Unlimited";
  const qDays = queuedPlan.durationDays ? `${queuedPlan.durationDays} ရက်` : "";
  return (
    "📊 <b>သင်၏ VPN အကောင့် အခြေအနေ:</b>\n\n" +
    "ℹ️ လက်ရှိ အသုံးပြုနိုင်သော ပက်ကေ့ဂျ် မရှိပါ။\n\n" +
    "⏳ <b>ကြိုတင်ဝယ်ယူထားသော နောက်ပက်ကေ့ဂျ်:</b>\n" +
    `📦 <b>${queuedPlan.planName}</b>\n` +
    `📊 ဒေတာ: <b>${qData}</b>  |  ⏰ သက်တမ်း: <b>${qDays}</b>\n\n` +
    "အသေးစိတ်အချက်အလက်များကို Mini App တွင် ကြည့်ရှုနိုင်ပါသည်။"
  );
}
```

```javascript
export const BALANCE_BTN_OPEN = "📱 Mini App ဖွင့်ရန်";
```

```javascript
export const SERVER_BTN_OPEN = "🌐 Change Server";
```

```javascript
export const SERVER_NO_ACCOUNT =
  "⚠️ အကောင့် မရှိပါ။ /start ကို ဦးစွာ နှိပ်ပါ။";
```

```javascript
export const SERVER_NO_ACTIVE =
  "ဆာဗာ ပြောင်းလဲရန် လက်ရှိအသုံးပြုနိုင်သော ပက်ကေ့ဂျ် လိုအပ်ပါသည်။ အောက်ပါခလုတ်မှ ဝယ်ယူနိုင်ပါသည် 👇";
```

```javascript
export const SERVER_VLESS_EXPLAIN =
  "🌐 <b>ဆာဗာ ရွေးချယ်မှု လမ်းညွှန်</b>\n\n" +
  "အသုံးပြုနိုင်သော ဆာဗာများကို <b>Happ / Hiddify / V2Box</b> App ထဲတွင် ကြည့်ရှုနိုင်ပါသည်။\n\n" +
  "ဆာဗာ ပြောင်းလဲလိုပါက App ထဲရှိ ဆာဗာစာရင်းမှ ရွေးချယ်ပါ။";
```

```javascript
export const SERVER_VLESS_TRIAL =
  "⚡ <b>အစမ်းသုံး ဆာဗာ သီးသန့် ချိတ်ဆက်မှု</b>\n\n" +
  "အစမ်းသုံး Key ဖြင့် သတ်မှတ်ထားသော အစမ်းသုံး ဆာဗာကိုသာ ချိတ်ဆက်နိုင်ပါသည်။\n\n" +
  "အခြားဆာဗာများ အသုံးပြုလိုပါက ပက်ကေ့ဂျ် ဝယ်ယူနိုင်ပါသည်။";
```

```javascript
export function serverChooseText(isTrial) {
  const trialNote = isTrial
    ? "\n\n🔒 Premium ဆာဗာများ အသုံးပြုရန် ဝယ်ယူထားသော ပက်ကေ့ဂျ် လိုအပ်ပါသည်။"
    : "";
  return (
    "🌐 <b>ချိတ်ဆက်လိုသည့် ဆာဗာကို ရွေးချယ်ပါ</b>\n\n" +
    "အသုံးပြုလိုသော ဆာဗာတစ်ခုကို နှိပ်ပါ 👇" +
    trialNote
  );
}
```

```javascript
export const SERVER_SWITCHING =
  "⏳ ဆာဗာ ပြောင်းလဲပေးနေပါသည်... ခဏစောင့်ဆိုင်းပေးပါ 🙏";
```

```javascript
export function serverSwitchSuccess(flag, name) {
  return (
    `✅ <b>${flag} ${name}</b> သို့ ပြောင်းလဲပြီးပါပြီ!\n\n` +
    "Key အသစ်ကို ရယူရန် ပင်မသို့ ပြန်သွားပြီး ကျွန်ုပ်၏ VPN ကို ဖွင့်ပါ။"
  );
}
```

```javascript
export const SERVER_TRIAL_LOCKED =
  "🔒 <b>Premium ဆာဗာ ဖြစ်ပါသည်</b>\n\n" +
  "အစမ်းသုံး ပက်ကေ့ဂျ်ဖြင့် အစမ်းသုံး ဆာဗာကိုသာ ချိတ်ဆက်နိုင်ပါသည်။\n" +
  "Premium ဆာဗာ အသုံးပြုရန် ပင်မသို့ ပြန်သွားပြီး ပက်ကေ့ဂျ် ဝယ်ယူပါ။";
```

```javascript
export const SERVER_ALREADY_LINKED =
  "✅ လက်ရှိတွင် ဤဆာဗာနှင့် ချိတ်ဆက်ထားပြီး ဖြစ်ပါသည်";
```

```javascript
export const SERVER_NO_KEY =
  "⚠️ VPN Key မရှိသေးပါ။\n\n" +
  "ပင်မသို့ ပြန်သွားပြီး ကျွန်ုပ်၏ VPN မှ Key ကို စစ်ဆေးပါ။ ထို့နောက် ဆာဗာ ပြောင်းနိုင်ပါသည်။";
```

```javascript
export const SERVER_SWITCH_ERROR =
  "⚠️ Server ပြောင်းရာတွင် အမှားဖြစ်သွားသည်။ ခဏကြာပြီးနောက် ထပ်ကြိုးစားပါ။";
```

```javascript
export const DL_CB = {
  // Level 1
  PROTO:   "dl:proto",
  SS:      "dl:ss",
  VLESS:   "dl:vl",
  // Level 2 — Outline
  SS_IOS:  "dl:ss:ios",
  SS_AND:  "dl:ss:and",
  SS_MAC:  "dl:ss:mac",
  SS_WIN:  "dl:ss:win",
  // Level 2 — VLESS / Xray
  VL_IOS:  "dl:vl:ios",
  VL_AND:  "dl:vl:and",
  VL_MAC:  "dl:vl:mac",
  VL_WIN:  "dl:vl:win",
};
```

```javascript
export const DOWNLOAD_PICKER_TEXT =
  "<b>App ဒေါင်းလုဒ်</b>\n\nဘယ် App ကို သုံးမလဲ?";
```

```javascript
export const DL_PROTO_BTNS = {
  SS:    "📱 Outline",
  VLESS: "Hiddify / Happ / V2Box",
};
```

```javascript
export const DL_OS_BTNS = {
  IOS:     "🍎 iPhone / iPad",
  ANDROID: "🤖 Android",
  MACOS:   "💻 macOS",
  WINDOWS: "🪟 Windows",
  BACK:    "⬅️ ပြန်သွားရန်",
};
```

```javascript
export const DL_SS_TEXT =
  `${EMO.OUTLINE} <b>Outline — Platform ရွေးချယ်ပါ</b>\n\n` +
  "<b>Outline</b> app သည် Outline key ကို တိုက်ရိုက် ထည့်သွင်းနိုင်သည်။\n" +
  "Device ကို ရွေးချယ်ပါ 👇";
```

```javascript
export const DL_VLESS_TEXT =
  `${EMO.HIDDIFY} <b>Hiddify / Happ / V2Box</b>\n\nသုံးမည့်စက်ကို ရွေးပါ။`;
```

```javascript
export const DL_SS_PLATFORMS = {
  ios: {
    text:
      `🍎 <b>iPhone / iPad — Outline</b>\n\n` +
      `${EMO.OUTLINE} <b>Outline</b> — App Store မှ download ဆွဲပြီး\n` +
      "VPN key ကို app ထဲ ထည့်သွင်းပါ 👇",
    apps: [
      { label: "📲 Outline — App Store", url: "https://apps.apple.com/app/id1356177741" },
    ],
  },
  android: {
    text:
      `🤖 <b>Android — Outline</b>\n\n` +
      `${EMO.OUTLINE} <b>Outline</b> — Google Play မှ download ဆွဲပြီး\n` +
      "VPN key ကို app ထဲ ထည့်သွင်းပါ 👇",
    apps: [
      { label: "📲 Outline — Google Play", url: "https://play.google.com/store/apps/details?id=org.outline.android.client" },
    ],
  },
  macos: {
    text:
      `💻 <b>macOS — Outline</b>\n\n` +
      `${EMO.OUTLINE} <b>Outline</b> — Mac App Store မှ download ဆွဲပြီး\n` +
      "VPN key ကို app ထဲ ထည့်သွင်းပါ 👇",
    apps: [
      { label: "📲 Outline — Mac App Store", url: "https://apps.apple.com/app/id1356177741" },
    ],
  },
  windows: {
    text:
      `🪟 <b>Windows — Outline</b>\n\n` +
      `${EMO.OUTLINE} <b>Outline</b> — download ဆွဲပြီး install လုပ်ကာ\n` +
      "VPN key ကို app ထဲ ထည့်သွင်းပါ 👇",
    apps: [
      { label: "📲 Outline — Windows", url: "https://getoutline.org/get-started/#step-3" },
    ],
  },
};
```

```javascript
export const DL_VLESS_PLATFORMS = {
  ios: {
    text:
      "🍎 <b>iPhone / iPad</b>\n\nApp ကို ရွေးပြီး VPN လင့်ခ် ထည့်ပါ။",
    apps: [
      { label: "📲 Hiddify",  url: "https://apps.apple.com/app/id6596777532" },
      { label: "📲 Happ",     url: "https://apps.apple.com/app/id6504287215" },
      { label: "📲 V2Box",    url: "https://apps.apple.com/app/id6446814690" },
      { label: "📲 V2rayTun", url: "https://apps.apple.com/app/id6476628951" },
    ],
  },
  android: {
    text:
      "🤖 <b>Android</b>\n\nApp ကို ရွေးပြီး VPN လင့်ခ် ထည့်ပါ။",
    apps: [
      { label: "📲 Hiddify",  url: "https://play.google.com/store/apps/details?id=app.hiddify.com" },
      { label: "📲 Happ",     url: "https://play.google.com/store/apps/details?id=com.happproxy" },
      { label: "📲 V2rayNG",  url: "https://play.google.com/store/apps/details?id=com.v2ray.ang" },
    ],
  },
  macos: {
    text:
      "💻 <b>macOS</b>\n\nApp ကို ရွေးပြီး VPN လင့်ခ် ထည့်ပါ။",
    apps: [
      { label: "📲 Hiddify", url: "https://apps.apple.com/app/id6596777532" },
      { label: "📲 Happ",    url: "https://apps.apple.com/app/id6504287215" },
      { label: "📲 V2Box",   url: "https://apps.apple.com/app/id6446814690" },
    ],
  },
  windows: {
    text:
      "🪟 <b>Windows</b>\n\nApp ကို ဒေါင်းလုဒ်လုပ်ပြီး VPN လင့်ခ် ထည့်ပါ။",
    apps: [
      { label: "📲 Hiddify — Windows", url: "https://github.com/hiddify/hiddify-app/releases/latest" },
    ],
  },
};
```

```javascript
export const BTN_BUY = "🛒 ပက်ကေ့ဂျ် ဝယ်ယူမည်";
```

```javascript
export const BUY_SELECT_PROTOCOL =
  "<b>အသုံးပြုလိုသည့် App ရွေးချယ်ပါ</b>\n\n" +
  "📱 <b>Outline App</b>\n🌐 <b>Happ / Hiddify / V2Box</b>";
```

```javascript
export const BUY_PROTO_SS_BTN   = "📱 Outline";
```

```javascript
export const BUY_PROTO_VLESS_BTN = "Hiddify / Happ / V2Box";
```

```javascript
export const BUY_SELECT_PLAN =
  "🛒 <b>ပက်ကေ့ဂျ် ရွေးချယ်ရန်</b>\n\n" +
  "အသုံးပြုလိုသည့် ဒေတာပမာဏနှင့် သက်တမ်းကို ရွေးချယ်ပါ 👇";
```

```javascript
export const BUY_NO_PLANS =
  "⚠️ ယခုအချိန်တွင် ဝယ်ယူ၍ရသော package မရှိပါ။\n" +
  "ခဏကြာပြီးနောက် ထပ်ကြိုးစားပါ သို့မဟုတ် Admin ကို ဆက်သွယ်ပါ။";
```

```javascript
export function buyPaymentInstructions(plan, paymentMethods) {
  const methodLines = (paymentMethods || [])
    .map((m) => `   • <b>${m.method}</b>: ${m.account_number}${m.account_name ? ` (${m.account_name})` : ""}`)
    .join("\n");

  return [
    `📦 <b>${plan.name}</b>`,
    `💰 ကျသင့်ငွေ: <b>${plan.price_mmk.toLocaleString()} MMK</b>`,
    `📊 ဒေတာ: <b>${plan.data_limit_gb} GB</b>  |  ⏰ သက်တမ်း: <b>${plan.duration_days} ရက်</b>`,
    "",
    "💳 <b>ငွေပေးချေရမည့် အကောင့်များ</b>",
    methodLines || "   ➡️ Admin ကို တိုက်ရိုက် ဆက်သွယ်ပါ",
    "",
    "📸 ငွေလွှဲပြီးပါက <b>ငွေလွှဲပြေစာ (Screenshot)</b> ကို ဤ chat တွင် ပေးပို့ပါ 👇",
    "",
    "⏱ <i>ဤဝယ်ယူမှုအဆင့်သည် ၁၀ မိနစ်သာ အကျုံးဝင်ပါသည်။ ထိုအချိန်အတွင်း ပြေစာ ပေးပို့ပါ။</i>",
  ].join("\n");
}
```

```javascript
export const BUY_PROCESSING =
  "⏳ ပြေစာကို လက်ခံရရှိပြီး ဆောင်ရွက်နေပါသည်... ခဏစောင့်ဆိုင်းပေးပါ 🙏";
```

```javascript
export function buySuccessText(planName, dynamicUrl, expiryDate, formatBurmeseDate) {
  return [
    `✅ <b>${planName}</b> ပက်ကေ့ဂျ် စတင်ပါပြီ!`,
    "",
    "🔑 သင်၏ VPN Key (Subscription URL):",
    `<pre>${dynamicUrl}</pre>`,
    "",
    "အထက်ပါ URL ကို copy ကူး၍ <b>Hiddify</b> app တွင် ထည့်သွင်းပါ။",
    "",
    `📅 သက်တမ်းကုန်ရက်: ${expiryDate ? formatBurmeseDate(expiryDate) : "—"}`,
    "",
    "⚠️ ငွေပေးချေမှုကို Reseller မှ စစ်ဆေးနေပါသည်။ မမှန်ကန်ပါက ဝန်ဆောင်မှု ရပ်နားမည်ဖြစ်သည်။",
  ].join("\n");
}
```

```javascript
export const BUY_ALREADY_QUEUED =
  "ℹ️ လက်ရှိပက်ကေ့ဂျ်အပြင် ကြိုတင်ဝယ်ယူထားသော နောက်ပက်ကေ့ဂျ်တစ်ခု ရှိပြီးဖြစ်ပါသည်။\n\n" +
  "နောက်ထပ် ဝယ်ယူနိုင်မည့်အချိန်တွင် ပြန်လည်ကြိုးစားပါ။\n" +
  "အသေးစိတ်ကြည့်ရန် ပင်မသို့ ပြန်သွားပြီး ဒေတာနှင့် သက်တမ်းကို စစ်ဆေးပါ။";
```

```javascript
export const BUY_PAYMENT_UNDER_REVIEW =
  "⏳ လက်ရှိဝယ်ယူမှု၏ ငွေပေးချေမှုကို စစ်ဆေးနေပါသည်။ အတည်ပြုပြီးမှ နောက်ပက်ကေ့ဂျ်ကို ဝယ်ယူနိုင်ပါမည်။";
```

```javascript
export const BUY_ALREADY_ACTIVE =
  "ℹ️ လက်ရှိ ပက်ကေ့ဂျ် ရှိနေပါသည်။ ဤဝယ်ယူမှုကို ဆက်မလုပ်ဆောင်နိုင်ခဲ့ပါ။\n\n" +
  "ပင်မသို့ ပြန်သွားပြီး ထပ်မံကြိုးစားပါ။ အဆင်မပြေပါက သင့်ရောင်းချသူထံ ဆက်သွယ်ပါ။";
```

```javascript
export function buyExtendSuccessText(planName, durationDays, dataLimitGb) {
  return [
    `✅ <b>${planName}</b> ကို နောက်အသုံးပြုမည့် ပက်ကေ့ဂျ်အဖြစ် မှတ်တမ်းတင်ပြီးပါပြီ။`,
    "",
    `📊 ဒေတာ: <b>${dataLimitGb} GB</b>  |  ⏰ သက်တမ်း: <b>${durationDays} ရက်</b>`,
    "",
    "ℹ️ လက်ရှိပက်ကေ့ဂျ် ကုန်ဆုံးပြီးမှ နောက်ပက်ကေ့ဂျ် စတင်ပါမည်။ ယခု Key အသစ် ထုတ်ပေးမည်မဟုတ်ပါ။",
    "",
    "⚠️ ငွေပေးချေမှုကို Reseller မှ စစ်ဆေးနေပါသည်။",
  ].join("\n");
}
```

```javascript
export const BUY_CANCELLED =
  "ပက်ကေ့ဂျ် ဝယ်ယူမှုကို ပယ်ဖျက်လိုက်ပါပြီ။\n\n" +
  "ပြန်လည်ဝယ်ယူလိုပါက ပင်မမှ ပက်ကေ့ဂျ် ဝယ်ယူမည်ကို ရွေးချယ်နိုင်ပါသည်။";
```

```javascript
export const BUY_ERROR =
  "⚠️ ဝယ်ယူမှုတွင် အမှားဖြစ်သွားသည်။ ထပ်ကြိုးစားပါ သို့မဟုတ် Admin ကို ဆက်သွယ်ပါ။";
```

```javascript
export const BUY_NO_SESSION =
  "📸 ပြေစာကို ရရှိပါသည်။ သို့သော် ၎င်းကို ချိတ်ဆက်ရန် ဝယ်ယူမှုအဆင့် မရှိပါ။\n\n" +
  "/start ဖြင့် ပင်မသို့ ပြန်သွားပါ။ ပက်ကေ့ဂျ်ကို ရွေးပြီး ငွေပေးချေမှုအဆင့်တွင် ပြေစာကို ထပ်မံပေးပို့ပါ။";
```

```javascript
export function resellerNotifyCaption({ customerName, planName, priceMmk, durationDays, dataLimitGb, orderId, isExtend = false }) {
  const header = isExtend
    ? "💰 <b>ကြိုတင်ဝယ်ယူမှု ငွေလွှဲပြေစာ ရောက်ရှိလာပါပြီ</b>"
    : "💰 <b>ငွေလွှဲပြေစာ အသစ် ရောက်ရှိလာပါပြီ</b>";
  return [
    header,
    "",
    `👤 ဝယ်ယူသူ: <b>${customerName}</b>`,
    `📦 ပက်ကေ့ဂျ်: <b>${planName}</b>`,
    `💵 ကျသင့်ငွေ: <b>${priceMmk.toLocaleString()} MMK</b>`,
    `📊 ဒေတာ: <b>${dataLimitGb} GB</b>  |  ⏰ သက်တမ်း: <b>${durationDays} ရက်</b>`,
    "",
    `🆔 အော်ဒါအမှတ်: <code>${orderId}</code>`,
    "",
    "✅ မှန်ကန်ပါက <b>အတည်ပြုမည်</b> ကို နှိပ်ပါ\n❌ မမှန်ကန်ပါက <b>ငြင်းပယ်မည်</b> ကို နှိပ်ပါ",
  ].join("\n");
}
```

```javascript
export const NOTIFY_CONFIRM_BTN = "✅ ပြေစာ အတည်ပြုမည်";
```

```javascript
export const NOTIFY_REJECT_BTN  = "❌ ပြေစာ ငြင်းပယ်မည်";
```

```javascript
export const NOTIFY_CONFIRMED = "\n\n✅ <b>ငွေပေးချေမှု အတည်ပြုပြီး</b>";
```

```javascript
export const NOTIFY_REJECTED  = "\n\n❌ <b>ငြင်းပယ်ပြီး — ဝန်ဆောင်မှု ရပ်နားသွားမည်</b>";
```

```javascript
export const CUSTOMER_PAYMENT_CONFIRMED =
  "✅ <b>ငွေပေးချေမှု အတည်ပြုပြီးပါပြီ</b>\n\n" +
  "လက်ရှိ Key ကို ကြည့်ရန် /start ကို နှိပ်ပြီး ကျွန်ုပ်၏ VPN ကို ဖွင့်ပါ။ " +
  "ကြိုတင်ဝယ်ယူထားသော ပက်ကေ့ဂျ်ဖြစ်ပါက လက်ရှိပက်ကေ့ဂျ် ကုန်ဆုံးပြီးမှ စတင်ပါမည်။";
```

```javascript
export const CUSTOMER_PAYMENT_REJECTED =
  "⚠️ <b>ငွေပေးချေမှု အတည်မပြုနိုင်ပါ</b>\n\n" +
  "ပေးပို့ထားသော ငွေလွှဲပြေစာကို အတည်မပြုနိုင်သဖြင့် ဤဝယ်ယူမှု၏ အသုံးပြုခွင့်ကို ရပ်နားထားပါသည်။\n\n" +
  "အသေးစိတ် သိရှိလိုပါက သင့်ရောင်းချသူထံ ဆက်သွယ်ပါ။";
```

```javascript
export const TRIAL_SELECT_PROTOCOL =
  "🎁 <b>အခမဲ့ စမ်းသုံးမည့် App ရွေးချယ်ပါ</b>\n\n" +
  "📱 <b>Outline App</b>\n🌐 <b>Happ / Hiddify / V2Box</b>";
```

```javascript
export const TRIAL_PROCESSING =
  "⏳ အစမ်းသုံး VPN Key ဖန်တီးပေးနေပါသည်... ခဏစောင့်ဆိုင်းပေးပါ 🙏";
```

```javascript
export const TRIAL_ALREADY_USED =
  "ℹ️ အခမဲ့စမ်းသုံးခွင့်ကို ရယူပြီးဖြစ်ပါသည်။\n\n" +
  "ဆက်လက်အသုံးပြုလိုပါက အောက်ပါ ပက်ကေ့ဂျ် ဝယ်ယူမည် ကို နှိပ်ပါ။";
```

```javascript
export const TRIAL_NO_ACCOUNT =
  "⚠️ အကောင့် မရှိပါ။ /start ကို ဦးစွာ နှိပ်ပါ။";
```

```javascript
export const TRIAL_ERROR =
  "⚠️ အစမ်းသုံး Key ဖန်တီး၍ မရသေးပါ။\n" +
  "ခဏအကြာတွင် ထပ်မံကြိုးစားပါ။ အကူအညီလိုအပ်ပါက သင့်ရောင်းချသူထံ ဆက်သွယ်ပါ။";
```

```javascript
export const HOWTO_BTN_SS = "📱 Outline အသုံးပြုနည်း";
```

```javascript
export const HOWTO_BTN_VLESS = "Hiddify / Happ / V2Box အသုံးပြုနည်း";
```

```javascript
export const HOWTO_CB = {
  SS: "howto:ss",
  VLESS: "howto:vless",
};
```

```javascript
export function howtoQueuedNotice(queuedProtocol) {
  const isQueuedSs = queuedProtocol === "shadowsocks";
  const appName = isQueuedSs ? "Outline" : "Hiddify / Happ / V2Box";
  return (
    "<b>နောက်အသုံးပြုမည့် package</b>\n" +
    `လက်ရှိ package ကုန်သွားလျှင် <b>${appName}</b> နဲ့ သုံးပါ။`
  );
}
```

```javascript
export function howToUseSS(queuedNotice = "") {
  return [
    "<b>Outline အသုံးပြုနည်း</b>",
    "",
    "1. Outline ကို ဒေါင်းလုဒ်လုပ်ပါ။",
    "2. ကျွန်ုပ်၏ VPN မှ Key ကို ရယူပါ။",
    "3. Key ကို Outline ထဲ ထည့်ပါ။",
    "4. Connect နှိပ်ပါ။",
    ...(queuedNotice ? ["", queuedNotice] : []),
  ].join("\n");
}
```

```javascript
export function howToUseVless(queuedNotice = "") {
  return [
    "<b>Hiddify / Happ / V2Box အသုံးပြုနည်း</b>",
    "",
    "1. သုံးမည့် App ကို ဒေါင်းလုဒ်လုပ်ပါ။",
    "2. ကျွန်ုပ်၏ VPN မှ Key ကို ရယူပါ။",
    "3. လင့်ခ်ကို App ထဲ ထည့်ပါ (သို့) QR ဖတ်ပါ။",
    "4. Server ရွေးပြီး Connect နှိပ်ပါ။",
    ...(queuedNotice ? ["", queuedNotice] : []),
  ].join("\n");
}
```

```javascript
export function howToUse() {
  return [
    "<b>VPN အသုံးပြုနည်း</b>",
    "",
    "သုံးမည့် App ကို ရွေးပြီး အသုံးပြုနည်းကို ကြည့်ပါ။",
  ].join("\n");
}
```

## backend/src/bot/notificationTemplates.js

Source SHA-256 (LF-normalized): 76faea42994aa7f22274b062b84abd98710ddb39d7e46a32fc8747474906c840

```javascript
export function formatBurmeseDate(value) {
  if (!value) return "";
  const s = String(value).slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return s;
  return `${toBurmeseNumber(y)} ခုနှစ်၊ ${BURMESE_MONTHS[m - 1]}လ ${toBurmeseNumber(d)} ရက်`;
}
```

```javascript
export const NOTIFICATION_EVENT_TYPES = [
  "trial_ending_24h",
  "trial_expired",
  "subscription_expiring_3d",
  "subscription_expired",
  "payment_confirmed",
  "payment_rejected",
  "data_limit_reached",
  "data_limit_warning",
];
```

```javascript
export const EVENT_META = {
  trial_ending_24h: {
    label: "Trial ကုန်ဆုံးရန် ၂၄ နာရီ ကျန်",
    description: "Trial package expires in exactly 1 day.",
    // deep_link_url isn't in the default text — it drives the "Package
    // ဝယ်ရန်" inline button instead (see DEEP_LINK_BUTTON_EVENTS in
    // notificationService.js). Still listed here since it's available data.
    placeholders: ["brand_name", "expiry_date", "price_from_mmk", "deep_link_url"],
  },
  trial_expired: {
    label: "Trial ကုန်ဆုံးပြီး",
    description: "Trial package expired today.",
    // deep_link_url drives the "Package ဝယ်ရန်" inline button, not raw text
    // in the body — see DEEP_LINK_BUTTON_EVENTS in notificationService.js.
    placeholders: ["brand_name", "price_from_mmk", "deep_link_url", "support_username"],
  },
  subscription_expiring_3d: {
    label: "Package ကုန်ဆုံးရန် ၃ ရက် ကျန်",
    description: "Paid subscription expires in 3 days.",
    // deep_link_url drives the "Package ဝယ်ရန်" inline button, not raw text
    // in the body — see DEEP_LINK_BUTTON_EVENTS in notificationService.js.
    placeholders: ["brand_name", "plan_name", "expiry_date", "deep_link_url"],
  },
  subscription_expired: {
    label: "Package ကုန်ဆုံးပြီး",
    description: "Paid subscription expired today.",
    placeholders: ["brand_name", "plan_name", "deep_link_url", "support_username"],
  },
  payment_confirmed: {
    label: "ငွေပေးချေမှု အတည်ပြုပြီး",
    description: "order_payments.review_status flipped to confirmed.",
    placeholders: ["brand_name", "plan_name", "expiry_date"],
  },
  payment_rejected: {
    label: "ငွေပေးချေမှု လက်မခံ",
    description: "order_payments.review_status flipped to rejected.",
    placeholders: ["brand_name", "plan_name", "reject_reason", "support_username"],
  },
  data_limit_reached: {
    label: "Data limit ကုန်ဆုံးပြီး",
    description:
      "Fires the moment syncUsageJob auto-stops an order for exceeding its plan's " +
      "data limit — trial or paid, whichever hits first. Independent of the " +
      "date-based trial_expired/subscription_expired events, which wouldn't " +
      "fire until the order's original calendar expiry date even though " +
      "access was already cut off earlier for running out of data.",
    placeholders: ["brand_name", "plan_name", "deep_link_url"],
  },
  data_limit_warning: {
    label: "Data limit ကုန်ခါနီးပြီ (80%)",
    description:
      "Advance warning at 80% of the plan's data limit, checked on the same " +
      "hourly syncUsageJob tick as data_limit_reached — the data-limit side's " +
      "equivalent of trial_ending_24h / subscription_expiring_3d, so customers " +
      "get a heads-up before hitting a hard cutoff either way (by date or by " +
      "data), not just for the date-based one.",
    placeholders: ["brand_name", "plan_name", "percent_used", "remaining_gb", "deep_link_url"],
  },
};
```

```javascript
export const DEFAULT_TEMPLATES = {
  // No raw {deep_link_url} in the body — it's attached as a "Package ဝယ်ရန်"
  // inline WebApp button instead (see DEEP_LINK_BUTTON_EVENTS in
  // notificationService.js). The {price_from_mmk} placeholder is populated
  // per-reseller from their cheapest active plan.
  trial_ending_24h: [
    "<b>⏰ အခမဲ့ စမ်းသုံးခွင့် မကြာမီ ကုန်ဆုံးပါမည်</b>",
    "",
    "အခမဲ့ စမ်းသုံးခွင့်သည် နောက် ၂၄ နာရီအတွင်း ကုန်ဆုံးမည် ဖြစ်ပါသည်။",
    "📅 ကုန်ဆုံးရက်: <b>{expiry_date}</b>",
    "ဆက်လက်အသုံးပြုလိုပါက အောက်ပါ Package ဝယ်ရန် ခလုတ်မှ {price_from_mmk} ကျပ်မှစ၍ ရွေးချယ်ဝယ်ယူနိုင်ပါသည် 👇",
  ].join("\n"),

  trial_expired: [
    "<b>⌛ အခမဲ့ စမ်းသုံးခွင့် ကုန်ဆုံးသွားပါပြီ</b>",
    "",
    "အခမဲ့ စမ်းသုံးခွင့် ကုန်ဆုံးသွားပါပြီ။",
    "ဆက်လက်အသုံးပြုလိုပါက အောက်ပါ Package ဝယ်ရန် ခလုတ်မှ {price_from_mmk} ကျပ်မှစ၍ ဝယ်ယူနိုင်ပါသည် 👇",
    "",
    "အကူအညီ လိုပါက Admin ကို ဆက်သွယ်ပါ 👇",
  ].join("\n"),

  subscription_expiring_3d: [
    "<b>⏰ ပက်ကေ့ဂျ် သက်တမ်းကုန်ရန် ၃ ရက် ကျန်ပါသည်</b>",
    "",
    "<b>{plan_name}</b> ပက်ကေ့ဂျ်သည် နောက် ၃ ရက်အတွင်း ကုန်ဆုံးမည် ဖြစ်ပါသည်။",
    "📅 ကုန်ဆုံးရက်: <b>{expiry_date}</b>",
    "ကြိုတင်ဝယ်ယူလိုပါက အောက်ပါ Package ဝယ်ရန် ခလုတ်ကို နှိပ်ပါ 👇",
  ].join("\n"),

  subscription_expired: [
    "<b>⌛ ပက်ကေ့ဂျ် သက်တမ်း ကုန်ဆုံးသွားပါပြီ</b>",
    "",
    "<b>{plan_name}</b> ပက်ကေ့ဂျ် သက်တမ်း ကုန်ဆုံးသွားပါပြီ။",
    "ဆက်လက်အသုံးပြုလိုပါက အောက်ပါ Package ဝယ်ရန် ခလုတ်ကို နှိပ်ပါ 👇",
    "",
    "အကူအညီ လိုပါက Admin ကို ဆက်သွယ်ပါ 👇",
  ].join("\n"),

  payment_confirmed: [
    "<b>✅ ငွေပေးချေမှု အတည်ပြုပြီးပါပြီ</b>",
    "",
    "ငွေပေးချေမှုကို အတည်ပြုပြီးပါပြီ။ ကျေးဇူးတင်ပါသည်။",
    "",
    "📦 ပက်ကေ့ဂျ်: <b>{plan_name}</b>",
    "📅 သက်တမ်း: <b>{expiry_date}</b> အထိ",
    "",
    "လက်ရှိ Key ကို ကြည့်ရန် bot ၏ ပင်မသို့ ပြန်သွားပြီး ကျွန်ုပ်၏ VPN ကို ဖွင့်ပါ။ နောက်ပက်ကေ့ဂျ်ဖြစ်ပါက လက်ရှိပက်ကေ့ဂျ် ကုန်ဆုံးပြီးမှ စတင်ပါမည်။",
  ].join("\n"),

  payment_rejected: [
    "<b>⚠️ ငွေပေးချေမှု အတည်မပြုနိုင်ပါ</b>",
    "",
    "ပေးပို့ထားသော ငွေလွှဲပြေစာကို အတည်မပြုနိုင်ပါ။",
    "",
    "📦 ပက်ကေ့ဂျ်: <b>{plan_name}</b>",
    "📝 အကြောင်းရင်း: {reject_reason}",
    "",
    "ပြန်လည် ငွေပေးချေရန်၊ သို့မဟုတ် အကူအညီ လိုပါက Admin ကို ဆက်သွယ်ပါ 👇",
  ].join("\n"),

  data_limit_reached: [
    "<b>🛑 ပက်ကေ့ဂျ် ဒေတာ ကုန်ဆုံးသွားပါပြီ</b>",
    "",
    "<b>{plan_name}</b> ပက်ကေ့ဂျ်၏ ဒေတာ ကုန်ဆုံးသွားသဖြင့် VPN ချိတ်ဆက်မှု ရပ်နားထားပါသည်။",
    "ဆက်လက်အသုံးပြုလိုပါက အောက်ပါ Package ဝယ်ရန် ခလုတ်ကို နှိပ်ပါ 👇",
  ].join("\n"),

  data_limit_warning: [
    "<b>⚠️ ပက်ကေ့ဂျ် ဒေတာ ကုန်ခါနီးပါပြီ</b>",
    "",
    "<b>{plan_name}</b> ပက်ကေ့ဂျ်၏ ဒေတာကို <b>{percent_used}%</b> အသုံးပြုပြီးပါပြီ။ လက်ကျန် <b>{remaining_gb} GB</b> ဖြစ်ပါသည်။",
    "ဒေတာကုန်ဆုံးပါက VPN ချိတ်ဆက်မှု ရပ်နားမည်ဖြစ်သည်။",
    "နောက်ပက်ကေ့ဂျ် ကြိုတင်ဝယ်ယူလိုပါက အောက်ပါ Package ဝယ်ရန် ခလုတ်ကို နှိပ်ပါ 👇",
  ].join("\n"),
};
```

```javascript
export function renderTemplate(text, data = {}) {
  return String(text || "").replace(/\{(\w+)\}/g, (_, key) =>
    data[key] != null ? String(data[key]) : ""
  );
}
```

```javascript
export const QUEUED_PAYMENT_CONFIRMED_TEXT = [
  "<b>✅ ငွေပေးချေမှု အတည်ပြုပြီးပါပြီ</b>",
  "💰 လက်ခံရရှိငွေ: <b>{amount_mmk} MMK</b>",
  "📦 နောက်ပက်ကေ့ဂျ်: <b>{plan_name}</b>",
  "လက်ရှိပက်ကေ့ဂျ် ကုန်ဆုံးပြီးမှ အလိုအလျောက် စတင်ပါမည်။ ထပ်မံ ငွေပေးချေရန် မလိုပါ။",
].join("\n");
```

```javascript
export function renderNotification(eventType, data, customText = null) {
  if (!NOTIFICATION_EVENT_TYPES.includes(eventType)) return null;
  if (customText) return renderTemplate(customText, data);
  return renderDefault(eventType, data);
}
```
