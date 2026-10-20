---
title: proactive-gate vs Novu, Knock and Courier
description: What the hosted notification platforms document about throttling and send windows, and how proactive-gate differs in shape. Not measured.
---

Novu, Knock and Courier are notification platforms. This page quotes what their own documentation
says, as read on 20 October 2026. It is **not measured**: `docs/COMPARISON.md` has no rows for these
products, so this page carries no comparison numbers and makes no claim that one tool does better.

## What their documentation says

- Novu describes itself as "The open-source communication infrastructure for agents and
  products" ([github.com/novuhq/novu](https://github.com/novuhq/novu)). Its
  [throttle step](https://docs.novu.co/platform/workflow/throttle-step) "lets you limit the number of
  workflow executions within a specified time window", counted per subscriber. The page we read has
  no quiet-hours or send-window setting.
- Knock documents [send windows](https://docs.knock.app/designing-workflows/send-windows).
  "Send windows are evaluated in the recipient's timezone (when set)". "Messages generated outside of
  this window will be queued until the next open window."
- Courier documents a [throttle node](https://www.courier.com/docs/platform/automations/throttle)
  that "limits how many automation-triggered messages a user or group receives within a set
  timeframe". "Events that exceed the configured limit are dropped and do not pass to the next
  node." It also has a blog post, [How Top Notification Platforms Handle Quiet Hours & Delivery Windows in 2026](https://www.courier.com/blog/quiet-hours-delivery-windows),
  which we did not measure.

## How the shape differs

- proactive-gate runs inside your process and needs no account.
- proactive-gate decides and never sends. Every refusal names the check that refused and why, and a
  held message carries `nextAllowedAt` when the check can name the time.

## When to choose which

If your sends already go through one of these platforms, check its throttle or send window first.
Use proactive-gate when your own code sends and you want a decision with its reason, in TypeScript,
Python or Go.
