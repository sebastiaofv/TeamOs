---
name: factory
description: Run or inspect software-factory jobs when the user requests the factory pipeline, a factory run for an issue, job status, or feedback on an escalated factory job.
---

# Factory

Use the shared CLI runner from the repository root. It owns scheduling, model
selection, job state, checks, Git commits, pushes, PRs, and merging. Claude Code
and Codex are entry points to the same workflow; each stage's CLI and model come
from `factory/config.json`.

## Run and inspect

- Run the queue: `factory/bin/factory run`.
- Run one labeled issue: `factory/bin/factory run <issue-number>`.
- Check installation and subscription logins: `factory/bin/factory doctor`.
- Show jobs and usage: `factory/bin/factory status`.

Execute the requested command and report its result. Keep the runner attached to
an active terminal session until it exits, communicating meaningful progress.
On a failure, report the cause and log directory. Resume by rerunning the same
command after fixing the cause. The runner reuses validated stage artifacts.
Do not bypass a refused transition or independently spawn factory agents.

## Feedback and questions

For a status question, use `factory/bin/job summary` and the job's files. Read
`decision.md` for an escalation and `intake.md` for an unanswered question.

For feedback on a `needs-human` job, pass the user's text verbatim on stdin to
`factory/bin/job feedback <job-or-issue>`, then run that issue through the runner.
For rejection, pass the user's reason on stdin to
`factory/bin/job reject <job-or-issue>`; this posts the reason and closes its PR.
Use a quoted heredoc or a file for multiline text.

For an answer to a `needs-info` question, post the user's answer to its issue
using `gh issue comment <issue> --body-file <file>`, then run that issue again.
Create and label a new issue only when the user asks you to file or build it.

## Scope

A factory run opens real PRs and can merge approved work. Use the user's
requested queue or issue; do not start unrelated jobs while inspecting status.
Only `factory/bin/job` writes job.json. Keep prompts and reviews in their
expected files, and let the runner enforce the pipeline. For setup, configuration,
permissions, and recovery details, consult the project's factory instructions in
AGENTS.md. In the reference repository, INSTALL.md and DESIGN.md provide details.
