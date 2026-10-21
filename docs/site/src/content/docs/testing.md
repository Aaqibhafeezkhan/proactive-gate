---
title: Test your own policy
description: Keep your quiet hours and daily limits from drifting by running fixtures against your policy in CI.
---

A policy is a JSON document, so it can be tested the way any other data-driven rule can. A fixture
holds a `policy` and a list of `tests`. Each test has an `input` (a user, a candidate and a `now`)
and the outcome you expect. `replay --fixtures <dir>` evaluates every test and exits with status 1
when one does not match, so a change that moves a quiet-hours window or a daily limit fails the
build instead of reaching a user.

This is the same mechanism the conformance suite uses; the format is described in
[`spec/CONFORMANCE.md`](https://github.com/Bubblegunn/proactive-gate/blob/main/spec/CONFORMANCE.md).
[Open Policy Agent users do the same with `opa test`](https://www.openpolicyagent.org/docs/policy-testing).

## A fixture

[`examples/policy-tests/night-and-budget.json`](https://github.com/Bubblegunn/proactive-gate/blob/main/examples/policy-tests/night-and-budget.json)
holds a policy with consent, quiet hours (22:00 to 08:00 in the user's own time zone) and a daily
limit of 2, and two tests:

- At 03:00 in Istanbul a normal-priority message is held by `quietHours`, and `nextAllowedAt` is
  05:00 UTC, which is 08:00 in Istanbul.
- At midday it is allowed, and the trace lists the checks that ran.

Run it:

```
npx proactive-gate replay --fixtures examples/policy-tests
```

It prints one line per fixture and a final count such as `1 passed, 0 failed, 0 skipped`.

## What a test can assert

`allowed`, `rejectedBy`, `deferredBy`, `trace` (the ordered check ids that ran), `nextAllowedAt`
and `reason_pattern` (a regular expression the reason must match). The full table is in
`spec/CONFORMANCE.md`.

## Run it in GitHub Actions

Put your fixtures in `tests/policy/` and add this workflow. Install the package first with `npm i -D proactive-gate`, so `npx --no` finds the installed copy.

```yaml
# Run `npm i -D proactive-gate` first so `npx --no` finds the installed copy.
name: policy-tests
on: [push, pull_request]
permissions:
  contents: read
jobs:
  policy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - run: npm ci
      - run: npx --no -- proactive-gate replay --fixtures tests/policy
```

`--no` makes `npx` use the version your lockfile installed instead of downloading the latest.
