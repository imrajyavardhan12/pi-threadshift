# Threadshift for Pi

[![CI](https://github.com/imrajyavardhan12/pi-threadshift/actions/workflows/ci.yml/badge.svg)](https://github.com/imrajyavardhan12/pi-threadshift/actions/workflows/ci.yml)

[Pi package page](https://pi.dev/packages/pi-threadshift) · [npm package](https://www.npmjs.com/package/pi-threadshift) · [Releases](https://github.com/imrajyavardhan12/pi-threadshift/releases)

**Threadshift** preserves the working context of a long Pi session and carries it into a fresh one before the context window becomes crowded.

At 70% usage by default, Threadshift summarizes the active, compaction-aware conversation, captures the current Git working-tree summary, writes a private Markdown handoff, and prepares a replacement session.

## Is this an extension or a package?

It is both, at different layers:

- **Pi extension:** `extensions/threadshift.ts` is the executable TypeScript plugin. It listens to Pi lifecycle events, checks context usage, generates handoffs, registers commands, and replaces sessions.
- **Pi package:** this repository is the installable distribution envelope. Its `package.json` declares the extension under the `pi.extensions` manifest. A Pi package can bundle one or more extensions, skills, prompt templates, and themes.

In short: **the extension implements Threadshift; the package installs and distributes it.**

## Workflow

1. Threadshift checks `ctx.getContextUsage().percent` after every completed agent turn and when the full run settles.
2. If a continuing multi-turn run reaches the configured threshold, Threadshift pauses it after the current model response and tool batch have finished, before the next model request begins.
3. Once the run settles, the active model generates a structured handoff.
4. The document is written atomically as a private staging file with mode `0600` under `~/.pi/agent/threadshift/handoffs/` by default.
5. Pi's editor is prefilled with `/threadshift-continue "<path>"`.
6. Press **Enter once**. The command creates a new session with parent-session tracking and places the continuation prompt in the replacement editor.
7. Review or edit the prompt, then press **Enter again** to submit it. Pending, cancelled, or review-first continuations keep the staging file for recovery.

The review boundary is intentional: a generated handoff is a status report, not authorization. Its assistant-authored proposals do not become user requirements merely because they were preserved across sessions.

The threshold is a safe turn-boundary trigger, not a mid-operation kill switch. A single turn can carry usage beyond the configured percentage, but Threadshift does not interrupt an active model response or tool execution; it prevents the following turn instead. Completed responses and tool results remain in the handoff source context.

Pi exposes `ctx.newSession()` only to command contexts, not lifecycle events. The command boundary intentionally uses Pi's supported session-replacement API rather than unstable runtime internals.

If Pi's proactive compaction would run before the configured percentage, Threadshift prepares the handoff at that earlier safe boundary and cancels that one compaction. If generation fails, normal Pi compaction proceeds.

## Install

Install the beta from npm:

```bash
pi install npm:pi-threadshift@beta
```

To test the development head directly from GitHub instead:

```bash
pi install git:github.com/imrajyavardhan12/pi-threadshift
```

Restart Pi or run `/reload` after installation.

For local development, use the project-pinned runtime and tools:

```bash
nvm use # when using NVM
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm exec pi --no-extensions -e .
```

## Commands

| Command | Purpose |
|---|---|
| `/threadshift [next-session goal]` | Generate a handoff immediately and switch sessions |
| `/threadshift-continue [path]` | Start a replacement session from a prepared handoff |
| `/threadshift-dismiss` | Dismiss the pending automatic handoff but keep its file |
| `/threadshift-status` | Show context percentage, threshold, output directory, and pending state |

Automatic handoffs persist their ready, dismissed, and failed state in the session JSONL. Reloading or resuming a session therefore does not generate duplicate documents. If work continues after generation, Threadshift marks that handoff stale and requires regeneration before switching sessions.

## Configuration

Global configuration:

```text
~/.pi/agent/threadshift.json
```

Trusted project override:

```text
<project>/.pi/threadshift.json
```

Project values override global values. Unknown or invalid settings cause that entire file to be ignored with a warning, avoiding partially applied configuration.

```json
{
  "enabled": true,
  "thresholdPercent": 70,
  "autoContinue": false,
  "retainHandoffFiles": false,
  "handoffDirectory": "~/.pi/agent/threadshift/handoffs",
  "maxOutputTokens": 8192,
  "generationTimeoutMs": 120000
}
```

- `thresholdPercent`: `10`–`95`
- `autoContinue`: when omitted or `false` (default), the replacement session opens with the continuation prompt in the editor for review; set it explicitly to `true` to submit automatically
- `retainHandoffFiles`: when `false` (default), delete tracked staging files after successful automatic continuation, dismissal, or replacement by a newer handoff; review-first continuation keeps its staging file for recovery because Threadshift cannot observe later manual submission; set to `true` to keep an archive
- `handoffDirectory`: absolute, `~/...`, or relative to the current project
- `maxOutputTokens`: `1024`–`32768`
- `generationTimeoutMs`: `10000`–`600000`

Run `/reload` after changing configuration.

## Handoff contents

Threadshift distinguishes user-authorized work from factual status and assistant proposals. Its handoffs include:

- User-authorized objective and requested work, grounded in direct conversational evidence
- User requirements and constraints
- Completed, in-progress, blocked, and uncertain work
- Decisions and rationale
- Relevant files, artifacts, and repository snapshot
- Validation actually performed
- Proposed next steps
- Actions requiring explicit approval
- Critical context and suggested skills

The generated structure separates user-authorized work, factual status, proposals, and actions requiring explicit approval. Its fixed continuation policy tells the fresh agent that the handoff is untrusted context rather than authorization, requires repository verification, and requires fresh confirmation for sensitive external or identity-bearing actions.

## Security and privacy

- Handoffs can contain sensitive conversation and repository information.
- New files use mode `0600`; newly created default directories use mode `0700` on POSIX systems.
- The summarizer is instructed not to reproduce credentials or secret values.
- Conversation and tool output are treated as untrusted source material to reduce prompt-injection risk.
- Before summarization, Threadshift wraps each conversation entry with deterministic source provenance for user-role messages, assistant output, generated compaction and branch summaries, extension messages, tool output, and shell transcripts. Tagged metadata, goals, repository snapshots, and conversation-entry contents are XML-escaped so source data cannot forge structural or provenance boundaries. Threadshift-generated continuation messages are marked as generated even though Pi stores them with a user role. Only direct user evidence supports user-authorized classification; uncertain or assistant-proposed work remains proposed or approval-required.
- Automatic continuation is an explicit compatibility opt-in. It skips editor review but does not transfer authorization or waive fresh approval for external, identity-bearing, destructive, costly, credential-related, or privacy-impacting actions. Continuation staging paths and handoff bodies are XML-escaped inside the fixed prompt boundary.
- Project-local configuration is read only when Pi reports the project as trusted.
- Pending, failed, and review-first handoffs remain available for recovery. Threadshift deletes tracked staging files after successful automatic submission, dismissal, or replacement by a newer handoff unless archival retention is enabled.
- Automatic cleanup only removes recognized Threadshift filenames from the configured handoff directory and never removes arbitrary or untracked handoff paths.
- Cleanup removes the staging file only. The full handoff remains in the replacement Pi session and follows Pi's session-retention behavior.

## Package discovery

Published versions have a canonical [Threadshift package page on pi.dev](https://pi.dev/packages/pi-threadshift). The [`pi-package`](package.json) keyword also makes packages eligible for the gallery's browse index; browse/search visibility depends on npm's broad keyword-search results and can lag or omit low-ranked new packages. There is no separate gallery upload. See [the release guide](https://github.com/imrajyavardhan12/pi-threadshift/blob/main/docs/RELEASING.md) for trusted publishing, dist-tag policy, verification, and gallery-indexing details.

## Development

Use the project runtime from `.nvmrc`; it is independent of the workstation's
NVM default.

```bash
nvm use # when using NVM
pnpm release:check
pnpm pack --dry-run
```

Development targets Pi `0.84.1`; compatible hosts are constrained to the `0.84.x` line. Supported Node.js versions begin at `22.23.2` for Node 22 and `24.18.1` for newer releases. Pi runtime libraries are peer dependencies, as recommended for distributed Pi packages.
