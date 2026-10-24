# Privacy

Last reviewed: 2026-10-24, for proactive-gate 0.9.0.

proactive-gate does not collect, store or send your data to its author or to any third party. It has no account, no telemetry and no analytics.

## The Claude Code plugin

- The plugin holds one skill, which is text. It has no hooks, no MCP server and no scripts, and it changes no permission setting. The plugin itself runs nothing.
- When the agent follows the skill, it may suggest `npm install proactive-gate` or `pip install proactive-gate` in your project, run `npx proactive-gate init` to write a policy file, or register the local MCP server (`npx proactive-gate mcp`). The agent does this in your project, under your permission settings.

## The library and command line tool

- The gate is a function in your own process. It decides from the policy and the events you pass in, and it sends nothing anywhere.
- `init` writes a policy file in your project. `replay` and `simulate` read the files you name and print a result. Writing a result file happens only when you pass an output path.
- The gate keeps its counters in the store you choose: memory, SQLite, or a Postgres or Redis client that you pass in. The library opens no connection of its own, and nothing is sent elsewhere.
- `simulate --dump-events <file>` writes the events it generated to the file you name.
- `proactive-gate mcp` serves the gate over standard input and output to the agent that started it. It opens no network port.

## What does touch the network

- `npm install`, `pip install` and `npx` download packages from the npm registry or PyPI, under their own privacy terms.

## Contact

Questions: https://github.com/Bubblegunn/proactive-gate/issues
