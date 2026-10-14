---
title: NovaNet MM Purchase and Payment
last_updated: 2026-10-15
scope: production behavior unless explicitly labelled development
consumers: [content-agent-reference]
source: current backend/client source and read-only production audit
---

# NovaNet MM Purchase and Payment

## Sources and purchase flow

Accepted payment methods/accounts come from the current reseller_miniapps.payment_info. Do not reuse another reseller's account details or hardcode one platform-wide transfer account.

Mini App: choose an app/protocol and plan, read the displayed payment details, transfer, upload the receipt and submit. Telegram: follow the inline app/plan/payment steps and upload the receipt photo when asked. Copy transfer instructions exactly; do not invent payment processing or automatic bank verification.

## Three different facts

- Access: pending, active, scheduled/queued, expired or stopped.
- Payment review: pending_review, confirmed or rejected.
- Payment application: pending, applied, failed or reversed.

An initial customer purchase can be active while review is pending. Another purchase is blocked while an active purchase awaits review. Once confirmed, the active paid package can have one scheduled next purchase. That queued package has no new key until the current package ends by time/data. A second queued purchase is rejected.

Payment history records each event in order_payments. Confirmed and applied events drive recognized revenue/commission; submitted receipts are not automatically confirmed revenue. Staff-created orders follow their existing activation policy, not the customer immediate-access promise.

Successful review confirmation of a queued purchase records the money received and counts its revenue/commission while the package remains queued. Payment application means payment recording, not activation. The confirmed queued package starts automatically after the current package stops or expires; starting it does not require another payment or count the sale again.

Renewal of stopped/expired access starts a new package period. Keep previous orders/payments as history. A rejected queued purchase does not change a separate current package's status.

## Customer FAQ

Q_EN: Will a new purchase immediately add data to my active package?
A_EN: No. It becomes the next queued package, provided your current payment has been confirmed and no package is already queued.

Q_MM: လက်ရှိပက်ကေ့ချ်ရှိနေတုန်း ထပ်ဝယ်ရင် ဒေတာ ချက်ချင်းပေါင်းပေးမလား?
A_MM: မပေါင်းပေးပါ။ လက်ရှိငွေပေးချေမှု အတည်ပြုပြီး နောက်ပက်ကေ့ချ် မရှိသေးပါက ကြိုတင်ဝယ်ယူမှုအဖြစ် ထားရှိပါသည်။

Q_EN: My payment says awaiting review but VPN works. Is that an error?
A_EN: Initial access is delivered before receipt review. The reseller still needs to confirm the payment.

## Notifications and recovery

Production dashboard reviews can be picked up by scheduled Telegram recovery; some Telegram callback paths send immediately. The local shared immediate-delivery service is not yet a production promise. For an uncertain purchase, ask support to inspect the existing order/payment before submitting another receipt.
