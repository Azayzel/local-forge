# Security Policy

## Supported versions

Local Forge is pre-1.0. Only the latest commit on `main` and its newest automated prerelease are supported.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting feature in the repository Security tab. If that is unavailable, email `contact@lavely.io` with reproduction steps, impact, and any suggested mitigation.

Reports involving Electron IPC, filesystem access, attachment URLs, runtime URL validation, navigation, persistence, or dependency execution are in scope. Vulnerabilities in third-party model weights and issues requiring physical access to an unlocked machine are outside the project boundary unless Local Forge makes them exploitable.

Please allow maintainers time to confirm and address a report before public disclosure. Reporters may request credit or anonymity.

## MCP trust boundary

- A stdio MCP server is a program running with your operating-system account's permissions. Testing or enabling it starts that program; tool-call approval does not sandbox server startup.
- Every model-requested tool call requires explicit approval and displays its arguments. Approval applies once and is bound to the originating chat window.
- Remote MCP endpoints must use HTTPS. Plain HTTP is accepted only for `localhost` and loopback addresses.
- MCP environment and header values are encrypted in the desktop workspace with Electron `safeStorage` when platform encryption is available. Put credentials in those fields, not command arguments or URLs. Values are decrypted for the configured server at runtime.
- Remote tools may receive approved arguments and their results are sent to the active local Ollama model. Review both the server and arguments before approval.

## Release note

Current installers are automated but unsigned. Windows and macOS may display security warnings; this is a distribution limitation, not evidence that a downloaded binary is authentic. Verify that downloads come from this repository's GitHub Releases page.
