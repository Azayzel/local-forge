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

The Tests workflow runs on pull requests and pushes to `main`. A successful push to `main` triggers unsigned native prerelease builds. New main commits do not cancel checks for earlier commits; obsolete pull-request checks are cancelled. Do not commit `dist/`, `dist-electron/`, `release/`, local models, imported images, or workspace data.

## Release maintenance

- Enable GitHub Actions and allow the actions used by the workflows. The publish job requests `contents: write` for the automatic `GITHUB_TOKEN`; repository or organization policy must permit that permission. No personal access token or publishing secret is required.
- Protect `main` with pull requests and the **Test, lint, and build** required check. Direct pushes also release, so restrict them if releases should only follow merges.
- The Release workflow accepts only successful Tests runs from pushes to this repository's `main`. Pull-request runs, including forks, never publish. Packaging checks out the tested SHA, not the current branch tip.
- The numeric base version comes from `package.json`; any existing prerelease/build suffix is replaced with `-main.<Tests run number>`. To advance the base version, use `npm version <version> --no-git-tag-version` locally and commit both `package.json` and `package-lock.json` in a pull request. CI sets the matching installer version only in its build workspace; it does not push version commits or trigger a release loop.
- Packaging jobs have read-only repository access and explicitly disable electron-builder publishing. Only the final publish job has write access. A release remains a draft until all three non-empty installers and their SHA-256 checksums have been uploaded.
- If packaging or publishing fails, rerun failed jobs from the **Release** workflow in Actions. A full rerun is also safe. Rerunning the same Tests run retains its run number and therefore its release tag. An incomplete draft is reused and its assets replaced; an already published release is left unchanged.
- Installers are retained as workflow artifacts for seven days; published release assets persist. If artifacts have expired, rerun all Release jobs to rebuild them.
- Signing and macOS notarization are not configured. Keep these builds as prereleases until signing credentials and a stable-release policy are established; the pipeline deliberately does not replace the latest stable release.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
