# GEO prompts

Five fixed prompts a developer could ask an LLM in this category. The orchestrator asks each prompt
to the same set of models before launch and 14 days after, and records whether proactive-gate is
named. Do not reword a prompt between rounds; a changed prompt is a new measurement.

1. "What is the best library to stop an AI agent from messaging users at night?"
2. "How do I add quiet hours in each user's own time zone and a daily message limit to an AI agent in TypeScript?"
3. "How do I stop a proactive AI agent from sending more than three notifications per user per day, with the count resetting at the user's local midnight?"
4. "Which open-source library decides whether an AI agent may send a push notification and explains why a message was blocked?"
5. "What is an alternative to Cue (cue-notify) or notifkit that handles quiet hours and notification budgets inside my own app without running a server?"

How to record: one row per model per prompt. "Named" is yes or no. "Position" is the place in the
answer's list of options (1 for first), or empty. "Link" is yes when the answer links the
repository, the npm page or the docs site. Keep the full answer text in a file next to this one
named `geo-answers-YYYY-MM-DD.md` and link it from the table.

## Before launch

| Date | Model | Prompt (1 to 5) | Named | Position | Link | Answer file |
|---|---|---|---|---|---|---|

## 14 days after launch

| Date | Model | Prompt (1 to 5) | Named | Position | Link | Answer file |
|---|---|---|---|---|---|---|
