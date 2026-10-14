---
title: NovaNet MM Plans
last_updated: 2026-10-15
scope: production behavior unless explicitly labelled development
consumers: [content-agent-reference]
source: current backend/client source and read-only production audit
---

# NovaNet MM Plans

## Production catalogue snapshot

Read-only verification on 2026-10-15. All six paid packages below were active. Fetch the live catalogue before quoting a new sale.

| Plan family | Allowance | Duration | Price |
| --- | --- | --- | --- |
| Basic | 50 GB | 30 days | 4,000 MMK |
| Premium | 100 GB | 30 days | 5,000 MMK |
| Max | 200 GB | 30 days | 8,000 MMK |
| Basic | 150 GB | 90 days | 11,000 MMK |
| Premium | 300 GB | 90 days | 13,000 MMK |
| Max | 600 GB | 90 days | 22,000 MMK |

A Trial catalogue row exists, but actual trial enablement/data/duration/protocol come from the reseller workspace. Do not promise every customer 5 GB / 7 days. Catalogue max_devices values are metadata (Basic 2, Premium 3, Max 5; trial 1), not proof of enforced client concurrency.

## Existing orders and future purchases

An existing order uses its snapshotted allowance/price and recorded payment package data where available. Do not change historical facts when catalogue prices or names change. Zero catalogue data_limit_gb means unlimited, but missing order quota is not automatically unlimited.

An initial purchase can activate pending review. A confirmed active package can have one queued next package. A queue starts fresh when current access ends; it does not immediately add its allowance to the current usage bar.
The queued purchase's payment is reviewed separately. Once confirmed, its money is recorded while the package waits. The confirmed package starts automatically after the current package stops or expires, without paying again.

Q_EN: Does buying 100 GB while I still have data add it to today's balance?
A_EN: It queues the next package if eligible; the existing package keeps its own allowance, usage and expiry.

Q_MM: လက်ကျန်ရှိနေတုန်း ပက်ကေ့ချ်ထပ်ဝယ်ရင် ချက်ချင်းပေါင်းပေးမလား?
A_MM: မပေါင်းပေးပါ။ သတ်မှတ်ချက်များ ပြည့်မီပါက လက်ရှိပက်ကေ့ချ် ကုန်ဆုံးပြီးမှ စတင်မည့် နောက်ပက်ကေ့ချ်အဖြစ် ထားရှိပါသည်။
