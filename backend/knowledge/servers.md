---
title: NovaNet MM Servers and Switching
last_updated: 2026-10-15
scope: production behavior unless explicitly labelled development
consumers: [content-agent-reference]
source: current backend/client source and read-only production audit
---

# NovaNet MM Servers and Switching

## Verified fleet snapshot

Read-only production inventory on 2026-10-15:

| Active server | Country | Tier |
| --- | --- | --- |
| Singapore #3 | Singapore | Premium |
| Singapore #4 | Singapore | Premium |
| Tokyo #1 | Japan | Premium |
| Singapore Trial | Singapore | Trial |

All active rows use Marzneshin. Names, availability, capacity and service memberships can change; use the current Mini App/backend server list. Retired Outline/Osaka/India rows are historical, not selectable live locations. Do not publish this snapshot as a permanent capacity or speed guarantee.

## Tier and protocol rules

- Trial packages can use eligible trial-tier capacity only.
- Paid new provisioning normally selects premium capacity.
- Paid manual switching may use any eligible active healthy server with capacity, including trial-tier overflow. The restriction is one-directional.
- A Shadowsocks switch changes the assigned server, retains package usage and carries remaining allowance to the new key.
- VLESS subscriptions contain configured nodes. The client chooses a node; the platform's provisioning assignment is not proof of the client's live connection.
- Eligibility is rechecked by the backend. A full, unhealthy, inactive, protocol-incompatible or exhausted target can be rejected.

Q_EN: Does switching servers give me another full package?
A_EN: No. The new key receives your remaining package allowance; earlier package usage stays counted.

Q_MM: ဆာဗာပြောင်းရင် ဒေတာပမာဏ အစက ပြန်ရမလား?
A_MM: မရပါ။ လက်ကျန်ဒေတာကိုသာ ဆက်လက်အသုံးပြုနိုင်ပြီး သုံးပြီးသားဒေတာကို ဆက်လက်ရေတွက်ပါသည်။

## Operator boundary

Automatic server provisioning/decommission endpoints currently return HTTP 410. Adding/removing nodes is a separately authorized operator workflow.
