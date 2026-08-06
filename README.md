# Threadshift for Pi

[![CI](https://github.com/imrajyavardhan12/pi-threadshift/actions/workflows/ci.yml/badge.svg)](https://github.com/imrajyavardhan12/pi-threadshift/actions/workflows/ci.yml)

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
4. The document is written atomically with file mode `0600` under `~/.pi/agent/threadshift/handoffs/` by default.
5. Pi's editor is prefilled with `/threadshift-continue "<path>"`.
6. Press **Enter once**. The command creates a new session with parent-session tracking and sends the handoff to the model automatically.

The threshold is a safe turn-boundary trigger, not a mid-operation kill switch. A single turn can carry usage beyond the configured percentage, but Threadshift does not interrupt an active model response or tool execution; it prevents the following turn instead. Completed responses and tool results remain in the handoff source context.

Pi exposes `ctx.newSession()` only to command contexts, not lifecycle events. The one-Enter boundary intentionally uses Pi's supported session-replacement API rather than unstable runtime internals.

If Pi's proactive compaction would run before the configured percentage, Threadshift prepares the handoff at that earlier safe boundary and cancels that one compaction. If generation fails, normal Pi compaction proceeds.

## Install

Until the first npm beta is published, install directly from GitHub:

```bash
pi install git:github.com/imrajyavardhan12/pi-threadshift
```

After `0.1.0-beta.1` is published:

```bash
pi install npm:pi-threadshift@beta
```

Restart Pi or run `/reload` after installation.

For local development:

```bash
pnpm install
pnpm check
pnpm test
pi install /Users/rvs/Developer/pi-threadshift
```

To test without installing:

```bash
pi -e /Users/rvs/Developer/pi-threadshift
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
  "autoContinue": true,
  "handoffDirectory": "~/.pi/agent/threadshift/handoffs",
  "maxOutputTokens": 8192,
  "generationTimeoutMs": 120000
}
```

- `thresholdPercent`: `10`–`95`
- `autoContinue`: when `false`, the replacement session opens with the continuation prompt in the editor instead of submitting it
- `handoffDirectory`: absolute, `~/...`, or relative to the current project
- `maxOutputTokens`: `1024`–`32768`
- `generationTimeoutMs`: `10000`–`600000`

Run `/reload` after changing configuration.

## Handoff contents

Threadshift distinguishes completed, in-progress, blocked, planned, and unverified work. Its handoffs include:

- Objective and user constraints
- Decisions and rationale
- Current implementation state
- Relevant files and existing artifacts
- Git status and diff statistics
- Validation actually performed
- Exact next steps and critical context
- Suggested skills for the replacement session

The continuation prompt tells the fresh agent to verify important claims against the repository instead of trusting the handoff blindly.

## Security and privacy

- Handoffs can contain sensitive conversation and repository information.
- New files use mode `0600`; newly created default directories use mode `0700` on POSIX systems.
- The summarizer is instructed not to reproduce credentials or secret values.
- Conversation and tool output are treated as untrusted source material to reduce prompt-injection risk.
- Project-local configuration is read only when Pi reports the project as trusted.
- Handoff documents are retained until you remove them.

## Publishing status

Threadshift is prepared for `0.1.0-beta.1` but has not yet been published to npm. The package name is currently unclaimed; availability is not a reservation.

The [`pi-package`](package.json) keyword makes published npm versions discoverable by the [Pi package gallery](https://pi.dev/packages). There is no separate gallery upload. See [the release guide](docs/RELEASING.md) for npm authentication, beta dist-tag policy, verification, and gallery-indexing details.

## Development

```bash
pnpm release:check
pnpm pack --dry-run
```

Development targets Pi `0.83.0`. Pi runtime libraries are peer dependencies, as recommended for distributed Pi packages.
