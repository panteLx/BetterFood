---
name: pr
description: Open a pull request for the current branch in this repo's house style — English sentence-style title, long-form body explaining the why. Use when the user asks to open a PR.
disable-model-invocation: true
---

Open a pull request for the current branch. Optional focus from the user: $ARGUMENTS

## Before writing anything

1. Verify the work first: `npx tsc --noEmit`, `npm run lint`, `npm run build`. If any fails, report the failure and stop — do not open a PR on red.
2. Read the actual change: `git diff main...HEAD --stat`, then the full diff for anything you did not write yourself in this session.
3. If the branch is `main`, stop and ask — work goes on a topic branch. Prefixes in use: `feat/`, `fix/`, `ci/`, `design/`; a bare kebab-case topic name (`receipt-import`, `slim-container-image`) is equally fine.
4. Read `git log --oneline -10` to match the current tone.

## Title

One English sentence, sentence case, no Conventional Commits prefix, no trailing period. It names the user-visible effect, not the file touched. The repo's own titles are the target:

- `Stop strangers from walking into the household`
- `Ship the app, not the workshop it was built in`
- `Import a whole shop from a PDF receipt, and learn where things go`

Squash-merging appends `(#N)` — do not write the number yourself.

## Body

Long-form English prose, not a bullet dump. Headings where the change has distinct parts. Cover, in whatever order fits:

- **Why** — the problem or the friction, before the solution. This is the part reviewers actually need.
- **What changed** — grouped by concern, referencing files with backticks.
- **Numbers** — before/after tables for anything measurable (image size, query count, bundle, render time). Only real measurements, never estimates.
- **Migrations** — if `src/db/schema.ts` changed, say so explicitly and name the generated SQL file.
- **Anything a reviewer would otherwise have to ask about**: env vars added, CSP changes, behavior under an existing deployment.

Everything in the PR is English, even though the app UI and code comments are German.

End the body with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Opening it

Push the branch, then `gh pr create` with the title and body (write the body via a heredoc file, not an inline `-b` string). Report the PR URL back.
