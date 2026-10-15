---
title: NovaNet MM Troubleshooting
last_updated: 2026-10-15
scope: production behavior unless explicitly labelled development
consumers: [content-agent-reference]
source: current backend/client source and read-only production audit
---

# NovaNet MM Troubleshooting

## Check the same account and package first

- Confirm the bot/Mini App belongs to the intended reseller.
- Check access state, inclusive expiry date, protocol, and current-package quota.
- A pending review can coexist with active initial access. A queued purchase is the next package, not current extra data.
- Use the current matching import link. Refresh/re-import after protocol changes or stale subscription data.
- Shadowsocks users may choose another eligible server through existing controls. VLESS users select among included nodes in their client.
- Trial packages cannot use premium servers. Paid users may manually select eligible trial-tier overflow.
- Usage is synced periodically, not live on every screen. The reseller usage-bar denominator regression is a known open display issue; support should compare the backend quota rather than tell a customer their package is exhausted from that bar alone.

## Common purchase results

| Result | Meaning |
| --- | --- |
| PURCHASE_UNDER_REVIEW | Existing active purchase still awaits payment review |
| QUEUED_PACKAGE_EXISTS | One next package is already scheduled |
| DATA_LIMIT_REACHED | Canonical package allowance is exhausted |
| Capacity/provider availability error | Do not repeatedly provision or create duplicate orders; contact support |

For failed/ambiguous provisioning, preserve the existing order/payment and request support reconciliation. Never clear trial-used history, manually reset usage or create repeated paid submissions as troubleshooting.

## Escalation

Provide the order ID/time, chosen app, error screenshot and location name. Do not send public access links, raw Telegram init data, passwords or receipt storage URLs. Device-specific third-party client faults require current client guidance; this document makes no blanket reset/reinstall recommendation.

Q_EN: Two screens show different usage. Which value should support check?
A_EN: Compare the backend's current package quota for the same order and sync snapshot, including total, used and remaining.

Q_MM: ဒေတာပမာဏ မတူဘဲ ပြနေတယ်ဆိုရင် ဘာကို စစ်ရမလဲ?
A_MM: တူညီသော အော်ဒါအတွက် ပက်ကေ့ချ်၏ စုစုပေါင်းဒေတာ၊ သုံးပြီးဒေတာနှင့် လက်ကျန်ဒေတာကို Support မှ စစ်ဆေးပေးရန် တောင်းဆိုပါ။
