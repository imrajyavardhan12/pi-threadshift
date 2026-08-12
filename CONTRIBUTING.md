# Contributing to Threadshift

Thanks for helping improve Threadshift.

## Prerequisites

- Node.js 24.18.1 as the preferred local runtime, pinned in `.nvmrc`
- Corepack
- Pi 0.84.1, with compatibility constrained to the Pi 0.84.x line

CI additionally verifies the supported Node.js 22.23.2 compatibility line.

## Setup

```bash
git clone https://github.com/imrajyavardhan12/pi-threadshift.git
cd pi-threadshift
nvm use # when using NVM
corepack enable
pnpm install --frozen-lockfile
```

## Validation

Run the complete local validation suite before opening a pull request:

```bash
pnpm check
pnpm test
PI_OFFLINE=1 pnpm smoke
pnpm pack --dry-run
pnpm audit --prod
```

For an interactive test without installing globally:

```bash
pnpm exec pi --no-extensions -e .
```

Then run `/threadshift-status` and `/threadshift Test the replacement-session workflow`.

## Engineering expectations

- Preserve completed model responses and tool results.
- Never interrupt an active tool execution merely to meet a percentage exactly.
- Prefer supported Pi extension APIs over runtime internals.
- Treat conversation text, tool output, repository state, and project configuration as untrusted input.
- Keep handoff files private by default and avoid logging their contents.
- Add a regression test for every behavior change or bug fix.
- Keep changes focused; avoid unrelated dependency or formatting churn.

## Pull requests

1. Explain the problem and expected behavior.
2. Describe compatibility, privacy, and failure-recovery implications.
3. Include the validation commands actually run.
4. Update `CHANGELOG.md` under **Unreleased** for user-visible changes.
5. Ensure CI passes on every supported Node.js version.

## Bug reports

Include the Pi version, provider/model, Threadshift configuration, context percentage, and reproduction steps. Do not attach raw handoff documents, session JSONL files, credentials, or proprietary repository content.

For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
