---
title: NovaNet MM Product & Technology
last_updated: 2026-08-10
audience: customer
consumers: [content-agent, rag-bot]
pillars: [Education, Trust, Convenience, How-To, Anti-Free-VPN]
tags: [outline, shadowsocks, google-jigsaw, protocol, technology, product]
source: production DB + `backend/src/services/*` + `marketing/novanet-user-manual.md`
---

# NovaNet MM Product & Technology

Explains what NovaNet MM sells, the technology underneath, and how the
customer's mental model works. Used to ground every educational, trust,
and how-to post.

## Facts (canonical values)

- **What NovaNet MM sells:** Outline VPN access — keys generated on
  our servers, delivered through the Telegram Bot + Mini App.
- **VPN client:** [Outline VPN](https://getoutline.org) — open-source
  VPN client built by [Google Jigsaw](https://jigsaw.google.com).
- **Encryption protocol:** [Shadowsocks](https://shadowsocks.org) — a
  lightweight open-source encryption protocol originally designed to
  work reliably in restrictive networks. Fast on mobile, hard to detect
  or block.
- **Server operator:** NovaNet MM runs the Outline servers on
  DigitalOcean droplets. We create, monitor, and maintain them.
- **Key delivery:** Telegram Bot + Telegram Mini App (self-serve, no
  admin required for known-good customers).
- **Supported client OS:** iOS, Android, Windows, macOS, Linux (all
  Outline-official platforms).
- **Sales domain:** `api.novanetmm.com` (backend), `app.novanetmm.com` (Mini App).
- **Customer domain:** access via Telegram Bot — never through web
  browser login.
- **Payment collected:** MMK only, via KBZPay (primary) and Wave Money.
  Package activates **immediately** on submit — admin verifies in the
  background for billing, but access is not gated on approval.
- **Dynamic key architecture:** Each customer has a single persistent
  Outline key (a dynamic subscription URL) issued at trial. That same
  key stays with the customer forever — through trial → paid, package
  renewals, package upgrades, server switches. Customer never needs to
  re-add a key except on a new device.

## FAQ (Burmese + English)

Q_MM: VPN ဆိုတာ တကယ်တော့ ဘာလုပ်ပေးလို့လဲ?
Q_EN: What does a VPN actually do?
A_MM: VPN က သင့်ရဲ့ အင်တာနက် data တွေကို encryption လုပ်ပြီး တခြားနိုင်ငံက server တစ်ခုကနေတဆင့် ဖြတ်ချိတ်ဆက်ပေးတဲ့ လုံခြုံတဲ့ လမ်းကြောင်း (tunnel) တစ်ခုလိုပါပဲ။ ISP နဲ့ တခြားသူတွေက သင်ဘယ်လို website တွေ ကြည့်နေတယ်ဆိုတာ မမြင်နိုင်တော့ဘူး၊ website တွေကလည်း သင့်ရဲ့ တကယ့် IP နဲ့ တည်နေရာကို မမြင်နိုင်တော့ပါဘူး။
A_EN: A VPN encrypts your internet traffic and routes it through a server in another country — like a secure tunnel. Your ISP and third parties can't see what you're browsing, and websites can't see your real IP or location.

Q_MM: Outline VPN ဆိုတာ ဘာလဲ? NovaNet MM နဲ့ ဘယ်လိုပတ်သက်တာလဲ?
Q_EN: What is Outline VPN, and how does it relate to NovaNet MM?
A_MM: Outline VPN ဆိုတာ Google Jigsaw က တီထွင်ထားတဲ့ open-source VPN app တစ်ခုပါ။ VPN ရဲ့ "အခွံ" (client app) သာဖြစ်ပြီး၊ အထဲကို "key" ထည့်လိုက်မှ VPN ကို အသုံးပြုလို့ရပါတယ်။ NovaNet MM ကတော့ Outline မှာ ချိတ်ဆက်ဖို့ လိုအပ်တဲ့ key တွေကို ကျွန်တော်တို့ရဲ့ server ကနေ ထုတ်ပေးပြီး Telegram Bot ကနေ လွယ်လွယ်ကူကူ လက်ခံရရှိအောင် ဝန်ဆောင်မှုပေးနေတာပါ။
A_EN: Outline VPN is an open-source VPN app made by Google Jigsaw. It's the client "shell" — you install it and paste in a key to make it work. NovaNet MM runs the servers behind those keys and delivers them through the Telegram Bot for easy access.

Q_MM: Shadowsocks ဆိုတာ ဘာလဲ?
Q_EN: What is Shadowsocks?
A_MM: Shadowsocks ဆိုတာ Outline က အသုံးပြုနေတဲ့ encryption protocol တစ်ခုပါ။ ကွန်ရက်တားဆီးမှုတွေကို ကျော်လွှားနိုင်ဖို့ ရည်ရွယ်ပြီး တီထွင်ခဲ့တာဖြစ်ပြီး၊ VPN traffic ကို ရိုးရိုးအင်တာနက် data လိုမျိုး ဟန်ဆောင်ပေးလို့ block ခံရဖို့ ခက်ပါတယ်။ Mobile network တွေမှာ လိုင်းအမြန်နှုန်း အလွန်ကောင်းပြီး၊ resource သိပ်မစားလို့ ဖုန်း battery ကိုလည်း သိပ်မကုန်စေပါဘူး။
A_EN: Shadowsocks is the encryption protocol Outline uses under the hood. Originally designed to bypass network censorship, it disguises VPN traffic to look like ordinary internet data, making it hard to detect or block. Very fast on mobile networks, and lightweight enough not to drain battery.

Q_MM: NovaNet MM ရဲ့ Outline က တခြား Outline provider တွေနဲ့ ဘယ်လိုကွာလဲ?
Q_EN: How is NovaNet MM's Outline different from other Outline providers?
A_MM:
(၁) **Device အလုံးရေ အကန့်အသတ်လုံးဝ မရှိပါ** — တစ်ခုတည်း သော key ကို Phone, Laptop, Mac အားလုံးမှာ တစ်ပြိုင်တည်း သုံးလို့ရပါတယ်။
(၂) **Dynamic Key နည်းပညာ** — Key တစ်ခုတည်းက Trial ကနေ Paid ကူးတိုင်း၊ Package အသစ်ဝယ်တိုင်း၊ Server ပြောင်းတိုင်း — အလိုအလျောက် အလုပ်လုပ်ပါလိမ့်မယ်။ Key အသစ် ခဏခဏ ထည့်စရာ မလိုပါ။
(၃) **Package ဝယ်ရင် ချက်ချင်း ရရှိ** — Payment upload လုပ်ပြီးတာနဲ့ ဝန်ဆောင်မှုက ချက်ချင်း စတင်ပါလိမ့်မယ်။ Admin approve စောင့်စရာ မလိုပါ။
(၄) Singapore နဲ့ Japan server ၂ ခုကို Mini App ကနေ ကိုယ်တိုင် အချိန်မရွေး ပြောင်းလို့ရပါတယ်။
(၅) Telegram Bot နဲ့ Mini App က ၂၄ နာရီ ဝန်ဆောင်ပေးနေတာမို့ Admin မစောင့်ဘဲ ကိုယ်တိုင် ဝယ်ယူ / key ရယူ / server ပြောင်း / data စစ်နိုင်ပါတယ်။
(၆) Payment ကို Myanmar customer အတွက် KBZPay နဲ့ Wave Money နဲ့ လက်ခံပါတယ်။
A_EN:
(1) **Unlimited devices** — one key works on Phone, Laptop, Mac all at the same time.
(2) **Dynamic Key technology** — the same key stays with you across trial-to-paid, package renewals, server switches. You never need to add a new key.
(3) **Immediate access after payment** — service starts the moment you submit payment; no waiting for admin approval.
(4) Two servers (Singapore + Japan) you can switch between anytime from the Mini App.
(5) 24/7 Telegram Bot + Mini App — no waiting for admin; self-serve buy, get key, switch server, check data.
(6) Local Myanmar payment via KBZPay and Wave Money.

Q_MM: NovaNet MM က ကျွန်တော့် data ကို သိမ်းထားပါသလား? တခြားသူ ဆီ ရောင်းလား?
Q_EN: Does NovaNet MM log my data or sell it?
A_MM: မဟုတ်ပါ။ ကျွန်တော်တို့က bandwidth usage (သုံးထားတဲ့ GB ပမာဏ) နဲ့ technical connection metadata တွေကိုသာ track လုပ်ပါတယ်။ သင်ဘယ်လို website တွေ ဝင်ကြည့်လဲ၊ ဘယ်လို app တွေ သုံးလဲ ဆိုတာကို ကျွန်တော်တို့ မမြင်နိုင်ပါ။ Outline သည် Google Jigsaw ရဲ့ open-source app ဖြစ်တဲ့အတွက် သူ့ရဲ့ code ကို ကမ္ဘာတဝှမ်းက developer တွေ လွတ်လပ်စွာ စစ်ဆေးထားပြီးသားပါ။
A_EN: No. We only track your bandwidth (GB used) and technical connection metadata. We do NOT see which websites you visit or which apps you use. Outline is Google Jigsaw's open-source client — its code has been publicly reviewed by developers worldwide.

Q_MM: NovaNet MM က Free VPN တွေနဲ့ ဘယ်လိုကွာလဲ?
Q_EN: How is NovaNet MM different from free VPNs?
A_MM: Free VPN အများစုမှာ ပြဿနာအမျိုးမျိုးရှိတတ်ပါတယ် — user data ကို ရောင်းစားခြင်း၊ ads အများကြီး ပြခြင်း၊ လိုင်း မကြာခဏ ဖြတ်တောက်ခြင်း စတာတွေပါ။ NovaNet MM ကတော့ Paid service ဖြစ်တဲ့အတွက် —
- စိတ်ချရတဲ့ server infrastructure
- ၂၄ နာရီ support
- Data privacy တကယ်ရှိတယ်
- Speed တည်ငြိမ်

ဈေးလည်း တစ်လကို **၄,၀၀၀ ကျပ်** ကနေ စတင်တာမို့ Free VPN သုံးရင်း စိတ်ညစ်နေတာထက် အများကြီး တွက်ခြေကိုက်ပါတယ်။
A_EN: Free VPNs often monetize by selling user data, showing lots of ads, or dropping the connection frequently. NovaNet MM is a paid service, so you get —
- Reliable server infrastructure
- 24/7 support
- Real data privacy
- Consistent speeds

Starts at just **4,000 MMK/month** — much better value than fighting with a free VPN daily.

## Content angles (for content agent)

Post ideas grounded in the tech story:

- **"Outline VPN ဆိုတာ ဘာလဲ" educational post** — explainer with metaphor
  ("VPN အခွံ" / "shell")
- **"Shadowsocks 101"** — infographic post showing encrypted-envelope
  metaphor of how the protocol hides traffic
- **"NovaNet MM နဲ့ Outline ကွာခြားချက်"** — Outline is the app; NovaNet
  MM provides the server + key — clarify the mental model
- **"Google Jigsaw က Outline ကို ဘယ်လို လုပ်ခဲ့တာလဲ"** — trust anchor
  through Google connection
- **"Free VPN နဲ့ Paid VPN ကွာခြားချက် — Technical"** — why paid
  infrastructure delivers what free can't
- **"ဘယ်လို data တွေ log လုပ်ပါသလဲ"** — transparency post about
  privacy (bandwidth only, no browsing data)
- **"Singapore + Japan server ၂ ခုက ဘယ်လို အသုံးဝင်လဲ"** — 2-country
  advantage explained (quality > quantity framing)
- **"Telegram Bot + Mini App = 24/7 self-serve"** — differentiate from
  Messenger-only competitors
- **"Package ဝယ်ရင် ချက်ချင်း ရရှိ" post** — real differentiator; most
  Myanmar VPN sellers make you wait hours after payment. Ours activates
  instantly.
- **"Dynamic Key" education post** — "key တစ်ချောင်းတည်းက trial ကနေ paid
  ကူးတိုင်း၊ package အသစ်ဝယ်တိုင်း အလုပ်လုပ်" — a mental-model shift most
  customers don't expect (competitors give a new key per purchase)

## Do NOT claim

- ❌ Do NOT claim total anonymity ("100% သင့်ကို ဘယ်သူမှ မမြင်နိုင်ပါ") —
  it's an overpromise; use "significantly more private" instead
- ❌ Do NOT claim we can unblock any specific service by name (Netflix
  US, YouTube TV, etc.) — geo-unblocking varies and we don't guarantee
- ❌ Do NOT claim NovaNet MM built Outline — Google Jigsaw built Outline;
  we operate servers and deliver keys
- ❌ Do NOT name specific competing VPN brands (Outline Private VPN,
  Next Outline VPN, PassThru VPN, isoogood, etc.) even in comparison
  posts — see `banned-claims.md`
- ❌ Do NOT claim we work in every country in the world — we operate a
  specific list (see `servers.md`)
- ❌ Do NOT use the words "bypass censorship" or "unblock banned sites"
  or anything political — safe framing is "improve connection quality"
  and "protect privacy" only
- ❌ Do NOT claim military-grade / bank-grade encryption specifically —
  Shadowsocks is strong but those adjectives are marketing bait
- ❌ Do NOT quote latency numbers for a country unless we've measured
  them recently for that country from Yangon
