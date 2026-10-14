---
title: NovaNet MM App Setup
last_updated: 2026-10-15
scope: production behavior unless explicitly labelled development
consumers: [content-agent-reference]
source: current backend/client source and read-only production audit
---

# NovaNet MM App Setup

## Choose the matching app family

Use the app guidance in the current bot/Mini App. Shadowsocks and VLESS import formats are not interchangeable.

| Access | Typical supported app family | Import |
| --- | --- | --- |
| Shadowsocks | Outline-compatible client | Current customer ssconf/config link |
| VLESS | Happ, Hiddify or V2Box-compatible client | Current panel subscription link |

1. Install a client using the current bot/app download guidance.
2. Get the current key/link from your own reseller account.
3. Copy/import that link in the matching client; use QR import when offered.
4. Refresh the subscription if necessary, select an included node for VLESS, then connect.

The Mini App currently offers a copy-link action. A compatible /open-key bridge remains available for Shadowsocks; it is not the only supported customer interaction.

## After a switch or renewal

Shadowsocks retains its customer endpoint while the backend updates assigned access. VLESS clients may need a subscription refresh. After changing protocol, obtain the new matching link and re-import if needed. Never promise that an old link of a different protocol will work unchanged.

Do not post access links, QR codes or credentials publicly. Device limits in the catalogue are metadata; do not claim a hard concurrency restriction or an unlimited-device guarantee unless separately verified.

Q_EN: Can I import a VLESS link into Outline?
A_EN: Use a VLESS-compatible client such as the one selected at checkout; Outline-family Shadowsocks links use a different format.

Q_MM: VLESS Link ကို Outline ထဲ ထည့်လို့ရလား?
A_MM: VLESS အတွက် ဝယ်ယူစဉ် ရွေးထားသော App ကို အသုံးပြုပါ။ Outline အတွက် Link ပုံစံနှင့် မတူပါ။
