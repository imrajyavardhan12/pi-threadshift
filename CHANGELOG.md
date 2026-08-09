# Changelog

All notable changes to Threadshift are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/imrajyavardhan12/pi-threadshift/compare/v0.1.0-beta.1...HEAD
[0.1.0-beta.1]: https://github.com/imrajyavardhan12/pi-threadshift/releases/tag/v0.1.0-beta.1
