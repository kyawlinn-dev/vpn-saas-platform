---
title: NovaNet MM Free Trial
last_updated: 2026-10-15
scope: production behavior unless explicitly labelled development
consumers: [content-agent-reference]
source: current backend/client source and read-only production audit
---

# NovaNet MM Free Trial

## Eligibility and claim

- Trial availability, quota, duration and protocol are admin-managed settings on the customer's reseller workspace.
- The platform schema defaults trial_enabled to false. The observed enabled workspaces commonly use 5 GB / 7 days, but some workspaces disable trials. Read actual configuration before quoting an offer.
- /start links the Telegram account and shows navigation. It does not automatically issue trial access. The customer selects the explicit trial action when available.
- Production Telegram trial eligibility uses the existing reseller-scoped linked-account/trial history. Do not reset used history to issue another trial.
- Trial provisioning uses trial-only server capacity/service assignments. Trial customers cannot select premium capacity.
- Trial ends when its configured time or data is exhausted. There is no automatic charge or paid renewal.
- Trial-ending/expired and usage notifications exist, subject to delivery eligibility, pause, timing and deduplication. Do not guarantee a message will arrive.

## Customer steps

1. Open the correct reseller bot and use /start.
2. Choose the free-trial action if offered.
3. Follow the app/link guidance and import the current key.
4. After the trial, purchase a paid package to continue.

Q_EN: Why is there no trial button?
A_EN: The workspace may have trials disabled, or your existing account/order history may make another trial unavailable.

Q_MM: အခမဲ့စမ်းသုံးရန် ခလုတ် မတွေ့ရတာ ဘာကြောင့်လဲ?
A_MM: ဆိုင်၏ စမ်းသုံးခွင့်ကို ပိတ်ထားခြင်း သို့မဟုတ် သင့်အကောင့်တွင် စမ်းသုံးပြီးသား ဖြစ်ခြင်းကြောင့် ဖြစ်နိုင်ပါသည်။

## Development boundary

Customer-wide customer_trial_claims and retry/reconciliation RPCs (0033–0036) exist in development. They are not the verified production trial implementation. Messenger greetings never implicitly authorize trial creation.
