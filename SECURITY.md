# Security Policy

## Supported versions

Threadshift is currently in beta. Security fixes are applied to the latest published beta only.

| Version | Supported |
|---|---|
| Latest `0.1.0-beta.*` | Yes |
| Older prereleases | No |

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository:

1. Open the repository's **Security** tab.
2. Select **Report a vulnerability**.
3. Provide a minimal description, affected version, impact, and reproduction steps.

Do not open a public issue for an undisclosed vulnerability.

Threadshift handoffs may contain sensitive conversations, source-code details, filesystem paths, and repository state. Do not include unredacted handoff documents, Pi session JSONL files, credentials, tokens, private keys, or proprietary source code in a report. Use synthetic data or the smallest redacted excerpt necessary.

## Response process

- Reports will be acknowledged as soon as practical.
- Reproduction and impact will be validated before a fix is prepared.
- Confirmed issues will be fixed privately and disclosed after an updated package is available.
- Credit will be provided when requested and appropriate.

## Security boundaries

Pi extensions execute with the user's operating-system permissions. Install Threadshift only from a source you trust. Threadshift reduces accidental disclosure through private file permissions and prompt guidance, but it cannot guarantee that a model provider, another local process with sufficient privileges, or user-configured output directory will keep handoff content confidential.
