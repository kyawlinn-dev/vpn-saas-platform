---
title: NovaNet MM Product and Technology
last_updated: 2026-10-15
scope: production behavior unless explicitly labelled development
consumers: [content-agent-reference]
source: current backend/client source and read-only production audit
---

# NovaNet MM Product and Technology

## Current facts

- NovaNet MM is a multi-tenant reseller platform. Customers use their reseller's branded Telegram bot/Mini App, payment details and support contact.
- Active VPN access is managed by Marzneshin/Marznode. Customers choose Shadowsocks (Outline-compatible app family) or VLESS (Happ/Hiddify/V2Box-compatible app family). Outline Manager servers are retired.
- Initial customer purchases provide access after receipt submission, pending review. Buying another package during confirmed active paid access queues one future package; it does not refill the current package immediately.
- Package data and dates come from the order snapshot. Usage includes server-switch history within that package, not only the current key.
- Shadowsocks keeps a permanent customer ssconf endpoint. VLESS uses its panel subscription. Protocol changes can change the type of import link; do not promise every link survives every reprovisioning unchanged.
- Platforms/client choices are those shown by current app guidance. Do not promise unlimited enforced devices, universal network access, speeds, logging/privacy guarantees or support hours based only on code.

## Customer FAQ

Q_EN: Does payment confirmation mean access starts only then?
A_EN: An initial purchase can already be active while payment is awaiting review. A queued next package starts after the current package ends.

Q_MM: ငွေပေးချေမှု အတည်ပြုပြီးမှ VPN သုံးလို့ရမှာလား?
A_MM: ပထမဆုံးဝယ်ယူမှုမှာ ငွေပေးချေမှုစစ်ဆေးနေစဉ် VPN ကို အသုံးပြုနိုင်ပါသည်။ ကြိုတင်ဝယ်ထားသော နောက်ပက်ကေ့ချ်က လက်ရှိပက်ကေ့ချ် ကုန်ဆုံးပြီးမှ စတင်ပါသည်။

Q_EN: Why can a new server key show a smaller allowance?
A_EN: It carries the package's remaining balance. The package total is unchanged; use the Mini App's canonical package quota.

## Development boundary

Messenger/shared purchase operations and durable cross-channel delivery are implemented locally and require a separate production release. Do not advertise them as current customer channels.
