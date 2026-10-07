# Mini App Burmese Text — Master Reference

All customer-facing text in the Telegram Mini App, from
`miniapp/src/i18n/language.jsx`. One dictionary, ~95 keys, organized by
namespace (`access.*`, `common.*`, `packages.*`, `payment.*`, `servers.*`,
`settings.*`). Burmese (MM) shown first, English (EN) alongside for
reference — the app defaults to MM and lets the customer switch.

**How this works in code:** every key is looked up via `t("key.name")` in
components. Placeholders use `{name}` syntax, substituted at render time
(e.g. `{date}`, `{price}`, `{count}`). Editing text here means editing the
matching line in `miniapp/src/i18n/language.jsx` — tell me the key + new
text and I'll make the change, or send me this whole file back edited and
I'll diff it in.

Unlike the notification templates, **this is not reseller-editable yet** —
same text for every reseller's Mini App. Let me know if you want that to
become per-reseller customizable too (same pattern as the Notifications
page).

---

## `access.*` — Home / VPN Access card

| Key | Burmese | English |
|---|---|---|
| access.active | VPN အသုံးပြုနိုင်ပါပြီ | VPN Access Active |
| access.addKey | Outline ထဲသို့ Key ထည့်မည် | Add Key to Outline |
| access.alreadyActive | သင့်မှာ active package ရှိပြီးသားပါ | You already have an active package |
| access.chooseServer | ဆာဗာရွေးမည် | Choose server |
| access.chooseServer.description | ပက်ကေ့ချ်အသုံးပြုနိုင်ပါပြီ။ Outline key ဖန်တီးရန် premium ဆာဗာတစ်ခုကို ရွေးပါ။ | Your package is active. Select one premium server to create your Outline key. |
| access.dataUsed | ဒီလအတွင်း အသုံးပြုထားသော data | Data used this month |
| access.noActivePackage | အသုံးပြုနေသော ပက်ကေ့ချ်မရှိပါ | No active package |
| access.packageLinked | သင့်အကောင့် ချိတ်ဆက်ပြီးပါပြီ။ VPN စတင်အသုံးပြုရန် ပက်ကေ့ချ်ရွေးပါ။ | Your account is linked. Choose a package to start secure VPN access. |
| access.paymentNotConfirmed | သင့်ငွေပေးချေမှုကို အတည်မပြုနိုင်ပါ | Payment not confirmed |
| access.paymentRejected | သင့်ငွေပေးချေမှုကို အတည်မပြုနိုင်ပါ။ Support သို့ဆက်သွယ်ပါ သို့မဟုတ် အသစ်ပြန်တင်ပါ။ | Your payment was rejected. Please contact support or submit a new payment. |
| access.premiumAccess | Premium Access | Premium Access |
| access.quickActions | အမြန်လုပ်ဆောင်မှုများ | Quick Actions |
| access.shareKey | Key မျှဝေမည် | Share Key |
| access.trial | Trial Access | Trial Access |
| access.validUntil | `{date}` အထိ အသုံးပြုနိုင်သည် | Valid until `{date}` |
| access.validUntilMissing | သက်တမ်းမပြထားပါ | No expiry shown |

## `app.*` — App shell

| Key | Burmese | English |
|---|---|---|
| app.subtitle | လုံခြုံသော private access | Secure private access |

## `common.*` — Shared UI strings

| Key | Burmese | English |
|---|---|---|
| common.active | အသုံးပြုနိုင်သည် | Active |
| common.backToHome | မူလသို့ ပြန်မည် | Back to Home |
| common.cancel | မလုပ်တော့ပါ | Cancel |
| common.contactSupport | Support ဆက်သွယ်မည် | Contact Support |
| common.current | လက်ရှိ | Current |
| common.currentPlan | လက်ရှိ ပက်ကေ့ချ် | Current Plan |
| common.data | Data | Data |
| common.days | `{count}` ရက် | `{count}` days |
| common.daysUnit | ရက် | days |
| common.flexible | Flexible | Flexible |
| common.highSpeed | မြန်နှုန်းမြင့် | High-speed |
| common.language | ဘာသာစကား | Language |
| common.mmk | ကျပ် | MMK |
| common.noExpiry | သက်တမ်းမပြထားပါ | No expiry shown |
| common.premium | Premium | Premium |
| common.premiumPlan | Premium Plan | Premium Plan |
| common.premiumVpn | Premium VPN | Premium VPN |
| common.support | Support | Support |
| common.unlimited | Unlimited | Unlimited |

## `error.*` — Error / crash screen

| Key | Burmese | English |
|---|---|---|
| error.contactSupport | Support ဆက်သွယ်မည် | Contact Support |
| error.message | Mini App ဖွင့်နေစဉ် ပြဿနာဖြစ်သွားပါသည်။ | Something went wrong while loading the Mini App. |
| error.retry | ထပ်စမ်းမည် | Try Again |
| error.title | ဖွင့်၍ မရပါ | Unable to load |

## `features.*` — Plan feature bullets

| Key | Burmese | English |
|---|---|---|
| features.devices | Device `{count}` ခုအထိ | Up to `{count}` device(s) |
| features.noLog | No-log policy | No-log policy |

## `nav.*` — Bottom tab bar

| Key | Burmese | English |
|---|---|---|
| nav.home | မူလ | Home |
| nav.packages | ပက်ကေ့ချ် | Packages |
| nav.servers | ဆာဗာ | Servers |

## `packages.*` — Packages / checkout flow

| Key | Burmese | English |
|---|---|---|
| packages.activePackageWarning | သင့်တွင် လက်ရှိသုံးနေသော ပက်ကေ့ချ်ရှိပြီးဖြစ်ပါသည်။ သက်တမ်းမကုန်မချင်း ထပ်မံဝယ်ယူ၍မရပါ။ လိုအပ်ပါက သင့် reseller ကို ဆက်သွယ်ပါ။ | You already have an active package. You can't buy another until it expires. Contact your reseller if you need help. |
| packages.activePlan | လက်ရှိ ပက်ကေ့ချ် | Current Plan |
| packages.backToPackages | ပက်ကေ့ချ်များသို့ ပြန်မည် | Back to Packages |
| packages.buyAgain | ထပ်ဝယ်မည် · `{price}` | Buy More · `{price}` |
| packages.buyNow | ဝယ်မည် · `{price}` | Buy Now · `{price}` |
| packages.choosePlan | ပက်ကေ့ချ် ရွေးပါ | Choose Your Plan |
| packages.empty.description | နောက်မှ ပြန်စစ်ပါ သို့မဟုတ် manual activation အတွက် support ဆက်သွယ်ပါ။ | Please check back later or contact support for manual activation. |
| packages.empty.title | ပက်ကေ့ချ် မရှိသေးပါ | No packages available |
| packages.noPlanSelected | ပက်ကေ့ချ် မရွေးရသေးပါ။ | No plan selected. |
| packages.popular | လူကြိုက်များ | Popular |
| packages.subtitle | ဝယ်ယူနည်း | How to buy |
| packages.buyGuide.step1 | လိုချင်တဲ့ ပက်ကေ့ချ်ကို ရွေးပါ။ | Choose your desired plan. |
| packages.buyGuide.step2 | Buy Now ကို နှိပ်ပါ။ | Tap Buy Now. |
| packages.buyGuide.step3 | ဘဏ်အကောင့်ထဲ ငွေလွှဲပြီး screenshot တင်ပါ။ | Transfer to the bank account and upload your screenshot. |
| packages.buyGuide.step4 | တင်ပြီးတာနဲ့ ချိတ်သုံးနိုင်ပြီး admin က payment စစ်ပါမယ်။ | You can connect right after submitting while admin reviews payment. |
| packages.waitingReview.description | Premium access အသုံးပြုနိုင်ပါပြီ။ သင့် reseller က payment screenshot ကို စစ်ဆေးပါမည်။ | Premium access is active. Your reseller will review the payment screenshot. |
| packages.waitingReview.title | ဝယ်ယူမှု စစ်ဆေးနေသည် | Purchase waiting for review |

## `payment.*` — Payment / checkout status

| Key | Burmese | English |
|---|---|---|
| payment.accountName | အကောင့်အမည် | Account name |
| payment.accountNumber | အကောင့်နံပါတ် | Account number |
| payment.amountPaid | ပေးချေထားသော ငွေပမာဏ | Amount paid |
| payment.approved.description | သင့် premium access ကို အတည်ပြုပြီး အသုံးပြုနိုင်ပါပြီ။ | Your premium access is confirmed and active. |
| payment.approved.title | Access အသုံးပြုနိုင်ပါပြီ | Access Activated! |
| payment.buyPackage | ပက်ကေ့ချ်ဝယ်မည် | Buy Package |
| payment.change | ပြောင်းမည် | Change |
| payment.checkout | ငွေပေးချေမည် | Checkout |
| payment.confirmed | အတည်ပြုပြီး | Confirmed |
| payment.connect | ချိတ်ဆက်မည် | Connect |
| payment.connecting | ချိတ်ဆက်နေသည်... | Connecting... |
| payment.copyFailed | Copy မရပါ။ ကိုယ်တိုင်ကူးပါ။ | Could not copy. Copy manually. |
| payment.copySuccess | အကောင့်နံပါတ် copy လုပ်ပြီးပါပြီ | Account number copied |
| payment.duration | သက်တမ်း | Duration |
| payment.exactAmount | `{amount}` တိတိ ဤအကောင့်သို့ လွှဲပြီး screenshot တင်ပါ။ | Transfer exactly `{amount}` to this account, then upload your screenshot below. |
| payment.expired | သက်တမ်းကုန်သည် | Expired |
| payment.failedSubmit | ဝယ်ယူမှု တင်သွင်း၍ မရပါ | Failed to submit purchase |
| payment.jpegHint | JPEG · PNG · WebP · အများဆုံး 5 MB | JPEG · PNG · WebP · max 5 MB |
| payment.linkDescription | သင့် Outline key ကို `{server}` နှင့် ချိတ်ဆက်ပါမည်။ လက်ရှိ key usage မပျောက်ပါ။ | Your Outline key will be connected to `{server}`. Your existing key usage is preserved. |
| payment.linkTitle | ဤဆာဗာကို ချိတ်မလား။ | Link this server? |
| payment.method | ငွေပေးချေမှုနည်းလမ်း | Payment Method |
| payment.noActiveOrder | Active order မရှိပါ | No Active Order |
| payment.noMethod | ငွေပေးချေမှုနည်းလမ်း မထည့်ရသေးပါ။ Support ဆက်သွယ်ပါ။ | No payment methods configured. Please contact support. |
| payment.noPackage.description | ဆာဗာချိတ်ရန် active package လိုအပ်ပါသည်။ စတင်ရန် ပက်ကေ့ချ်ရွေးပါ။ | You need an active package to connect to a server. Choose a package to get started. |
| payment.noPackage.title | အသုံးပြုနေသော ပက်ကေ့ချ်မရှိပါ | No active package |
| payment.note | ငွေပေးချေမှု မှတ်ချက် | Payment Note |
| payment.noteOptional | (optional) | (optional) |
| payment.notePlaceholder | ဥပမာ KBZPay ဖြင့် 3:10 PM တွင် ပေးချေပြီး | e.g. Paid with KBZPay at 3:10 PM |
| payment.payWith | `{method}` ဖြင့် ပေးချေမည် | Pay with `{method}` |
| payment.pending | စစ်ဆေးနေသည် | Pending Review |
| payment.pending.description | သင့်ငွေပေးချေမှုကို စစ်ဆေးနေပါသည်။ Reseller က screenshot စစ်နေစဉ် temporary premium access အသုံးပြုနိုင်ပါသည်။ | Your payment is being reviewed. Temporary premium access is active while your reseller checks the screenshot. |
| payment.pending.note | သင့် reseller က payment screenshot ကို စစ်ဆေးပါမည်။ Access သည် pending review အနေအထားဖြစ်နေပါမည်။ | Your reseller will review your payment screenshot. Access remains pending review. |
| payment.pending.title | Payment တင်ပြီးပါပြီ | Payment Submitted! |
| payment.plan | ပက်ကေ့ချ် | Plan |
| payment.previewAlt | Payment screenshot preview | Payment screenshot preview |
| payment.rejected | Reject ဖြစ်သည် | Rejected |
| payment.rejected.description | သင့် reseller က ဤငွေပေးချေမှုကို အတည်မပြုနိုင်ပါ။ VPN access ဖယ်ရှားပြီးပါပြီ။ | Your reseller could not confirm this payment. VPN access has been removed. |
| payment.rejected.title | Payment Reject ဖြစ်သည် | Payment Rejected |
| payment.renewNote | ပက်ကေ့ချ်သို့သွားပြီး order အသစ်တင်ပါ၊ သို့မဟုတ် မှားနေသည်ဟုထင်ပါက support ဆက်သွယ်ပါ။ | Open Packages to submit a new order, or contact support if this looks wrong. |
| payment.screenshot | Payment Screenshot | Payment Screenshot |
| payment.screenshotReady | Screenshot အသင့်ဖြစ်ပါပြီ | Screenshot ready |
| payment.selectedPlan | ရွေးထားသော ပက်ကေ့ချ် | Selected plan |
| payment.status | အခြေအနေ | Status |
| payment.statusTitle | Payment အခြေအနေ | Payment Status |
| payment.stopped | ရပ်ထားသည် | Stopped |
| payment.stopped.description | ဤ order သည် active မဟုတ်တော့ပါ။ Access အသစ်ရရန် ပက်ကေ့ချ်ရွေးပါ။ | This order is no longer active. Choose a package to renew access. |
| payment.submit | Payment တင်မည် | Submit Payment |
| payment.submitting | တင်နေသည်... | Submitting... |
| payment.upload | Payment screenshot တင်မည် | Upload payment screenshot |
| payment.uploading | Screenshot တင်နေသည်... | Uploading screenshot... |

## `servers.*` — Server list / selection

| Key | Burmese | English |
|---|---|---|
| servers.bestMs | `{ms}` ms အကောင်းဆုံး | `{ms}` ms best |
| servers.choose | ဆာဗာ ရွေးပါ | Choose Server |
| servers.count | `{count}` ဆာဗာ | `{count}` servers |
| servers.currentServer | လက်ရှိ ဆာဗာ | Current server |
| servers.failedLink | ဆာဗာ ချိတ်ဆက်၍ မရပါ | Failed to link server |
| servers.linked | ချိတ်ဆက်ပြီး | linked |
| servers.linkSuccess | ဆာဗာ ချိတ်ဆက်ပြီးပါပြီ | Server linked successfully |
| servers.openTelegramAgain | Telegram bot မှ ပြန်ဖွင့်ပါ။ | Open from Telegram bot again. |
| servers.search | နိုင်ငံ သို့မဟုတ် ဆာဗာ ရှာပါ | Search country or server |
| servers.select | ရွေးမည် | Select |
| servers.subtitle | သင့်အတွက် အကောင်းဆုံး ဆာဗာကို ရွေးပါ | Select the best server for you |
| servers.noneFound | ဆာဗာ မတွေ့ပါ | No servers found |
| servers.connect | ချိတ်မည် | Connect |
| servers.connected | လက်ရှိ | Connected |
| servers.details | ကြည့်မည် | Details |
| servers.premiumTier | Premium | Premium |
| servers.trialTier | Trial | Trial |
| servers.premiumServers | Premium ဆာဗာများ | Premium Servers |
| servers.trialServers | Trial ဆာဗာများ | Trial Servers |
| servers.restrictedTitle | ဤဆာဗာကို ချိတ်ဆက်၍ မရပါ | This server is not available |
| servers.restrictedDescription | သင့် package သည် ဤဆာဗာအတွက် မကိုက်ညီပါ။ | Your package cannot connect to this server. |
| servers.restrictedPremiumTitle | Premium ဆာဗာအတွက် package လိုအပ်သည် | Premium package required |
| servers.restrictedPremiumDescription | Trial package သည် Trial ဆာဗာများကိုသာ ချိတ်ဆက်နိုင်သည်။ Premium ဆာဗာအသုံးပြုရန် package ဝယ်ပါ။ | Trial packages can only connect to trial servers. Buy a premium package to use premium servers. |
| servers.restrictedTrialTitle | Trial ဆာဗာကို ချိတ်၍ မရပါ | Trial server unavailable |
| servers.restrictedTrialDescription | Premium package သည် Premium ဆာဗာများကိုသာ ချိတ်ဆက်နိုင်သည်။ Trial ဆာဗာများကို trial အသုံးပြုသူများအတွက် သီးသန့်ထားရှိသည်။ | Premium packages can only connect to premium servers. Trial servers are reserved for trial users. |
| servers.regionRestrictedTitle | ဤ Region ကို မသုံးနိုင်ပါ | Region not included |
| servers.regionRestrictedDescription | သင့် package တွင် ဤ Region မပါဝင်သေးပါ။ Support ကို ဆက်သွယ်ပါ။ | Your package does not include this region. Please contact support. |

## `settings.*` — Settings page

| Key | Burmese | English |
|---|---|---|
| settings.about | ဤ Mini App အကြောင်း | About this Mini App |
| settings.faq | FAQ | FAQ |
| settings.general | အထွေထွေ | General |
| settings.privacy | Privacy Policy | Privacy Policy |
| settings.terms | Terms of Service | Terms of Service |
| settings.title | ဆက်တင် | Settings |
| settings.viewPackages | ပက်ကေ့ချ်များ ကြည့်မည် | View Packages |

---

## Editing notes

- **Source of truth**: `miniapp/src/i18n/language.jsx`, `DICTIONARY.MM` /
  `DICTIONARY.EN` objects (lines ~12–307 as of 2026-08-16).
- **Placeholders** use `{name}` syntax (single braces), substituted via
  simple regex replace in `translate()` — same mechanism as the
  notification templates.
- **Fallback behavior**: if a key is missing in MM, it falls back to EN;
  if missing in both, the raw key string shows (so a typo'd key is visible
  in testing, not silently blank).
- Every string here appears in BOTH languages — if you edit Burmese text,
  consider whether the English needs a matching update for consistency
  (not strictly required, they're independent).
- **Not reseller-customizable** — unlike the 6 notification templates, this
  text is shared across every reseller's Mini App instance. Say the word if
  you want this to become per-reseller editable too.
