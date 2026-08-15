# Changelog

All notable changes to Threadshift are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Default `autoContinue` to `false`, adding a review/edit boundary before the replacement session submits generated context. Configurations that omit the setting adopt the safe default; explicit `autoContinue: true` configurations remain automatic.
- Separate user-authorized work, assistant proposals, and approval-required actions in generated handoffs to prevent recommendation-to-requirement collapse.
- Preserve deterministic source provenance for user-role messages, assistant output, generated summaries, extension messages, tool output, shell transcripts, and prior Threadshift continuations before LLM classification; XML-escape tagged source fields so untrusted data cannot forge provenance boundaries.
- Add a fixed continuation safety policy that treats handoffs as untrusted status reports and requires fresh approval for sensitive external or identity-bearing actions, including in automatic compatibility mode; XML-escape the staged path and handoff body inside that boundary.

## [0.1.0-beta.2] - 2026-08-12

### Added

- Protected npm trusted publishing through GitHub Actions OIDC, with provenance, release identity checks, and a manual deployment gate.
- A canonical pi.dev package-page link in the README.

### Changed

- Pin the development runtime in `.nvmrc` without changing the supported Node.js range.
- Refresh Vitest and Node.js type definitions within their supported major versions.
- Document protected pull-request releases, npm dist-tag policy, registry verification, and pi.dev browse-index limitations.

## [0.1.0-beta.1] - 2026-08-06

### Added

- Configurable automatic handoffs at 70% context usage by default.
- Turn-boundary protection that pauses continuing work before another model request without interrupting active model responses or tools.
- Structured, model-generated Markdown handoffs with repository status and explicit next steps.
- Atomic private handoff files and trusted global/project configuration.
- Persistent ready, consumed, dismissed, and failed lifecycle state.
- Stale-handoff detection, parent-session tracking, and automatic continuation.
- Manual generation, continuation, dismissal, and status commands.
- Context-scoped suppression that prevents duplicate handoffs without permanently disabling resumed source sessions.
- Lifecycle-aware staging-file cleanup after successful continuation, dismissal, or regeneration, with opt-in archival retention.
- Type checking, unit and extension-event regression tests, package smoke tests, and multi-version CI.

### Changed

- Read and validate each handoff through one opened file handle.
- Require Pi `0.84.x`, develop against Pi `0.84.1`, and raise Node.js validation baselines to `22.23.2` and `24.18.1`.
- Clarify that cleanup removes only tracked staging files while handoff content remains in Pi session storage.

[Unreleased]: https://github.com/imrajyavardhan12/pi-threadshift/compare/v0.1.0-beta.2...HEAD
[0.1.0-beta.2]: https://github.com/imrajyavardhan12/pi-threadshift/compare/v0.1.0-beta.1...v0.1.0-beta.2
[0.1.0-beta.1]: https://github.com/imrajyavardhan12/pi-threadshift/releases/tag/v0.1.0-beta.1
