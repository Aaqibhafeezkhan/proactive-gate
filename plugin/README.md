# proactive-gate, Claude Code plugin

This folder is the Claude Code plugin of [proactive-gate](https://github.com/Bubblegunn/proactive-gate). It holds one skill and nothing else. The library itself (TypeScript, Python and Go) and its tests live in the rest of the repository and are not part of the plugin.

Install:

```
/plugin marketplace add Bubblegunn/proactive-gate
/plugin install proactive-gate@proactive-gate
```

## What the plugin contains

- `skills/proactive-gate/SKILL.md`: instructions that tell a coding agent to put quiet hours, message budgets, consent and snooze in front of any message an AI agent sends on its own, using the `proactive-gate` library. When the agent follows the skill it may suggest `npm install proactive-gate` or `pip install proactive-gate` in your project, and it may run `npx proactive-gate init` to write a policy file. Those commands download the package from npm or PyPI. The plugin itself runs nothing.

The plugin has no hooks, no MCP server and no scripts. It sends no data anywhere and changes no permission setting.

## Licence

MIT, see `LICENSE`.
