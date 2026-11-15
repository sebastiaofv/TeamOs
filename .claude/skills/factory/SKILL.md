---
name: factory
description: Run the software factory, inspect its jobs, or give feedback on an escalated job when the user invokes /factory.
---

# Factory

Read [the shared factory workflow](../../../.agents/skills/factory/SKILL.md)
and follow it. `/factory run`, `/factory run <issue>`, and factory questions
all use the shared CLI runner. It selects Claude Code or Codex independently
for each step from `factory/config.json`.
