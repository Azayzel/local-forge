# Contributing to Local Forge

Local Forge welcomes focused bug fixes, tests, documentation, accessibility improvements, and cross-platform feedback.

## Before you start

- Read and follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Use GitHub Discussions or an issue for larger design changes before investing in an implementation.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).

## Development

Install Node.js 22.12 or newer, npm, and Ollama. Then run:

```powershell
npm ci
npm run dev
```

The renderer is React and TypeScript. Filesystem, process, and native host access must remain in Electron main behind the typed preload API. Ollama endpoints remain loopback-only. MCP transport changes require explicit URL validation, per-call approval, process cleanup, and integration coverage using a real fixture server.

Image and training workers live in `runtime/` and communicate through newline-delimited JSON. Keep model loading offline, spawn without a shell, validate all paths in Electron main, bound diagnostic output, and add fixture coverage for progress, completion, failure, and cancellation. Do not make package installation or model downloads implicit.

Before opening a pull request, run:

```powershell
npm test
npm run lint
npm run build
```

## Pull requests

1. Branch from `main` and keep the change focused.
2. Add or update tests for behavior changes.
3. Update public documentation when contracts or workflows change.
4. Explain user-visible behavior, tradeoffs, and validation in the pull request.

The Tests workflow runs on pull requests and pushes to `main`. A successful push to `main` triggers unsigned native prerelease builds. Do not commit `dist/`, `dist-electron/`, `release/`, local models, imported images, or workspace data.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
