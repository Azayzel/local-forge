# Runtime and project guide

## Image and training runtime

Use Python 3.10-3.12 and install the PyTorch build appropriate for your hardware first. Then install either or both worker environments:

```powershell
python -m pip install -r runtime/requirements-image.txt
python -m pip install -r runtime/requirements-training.txt
```

Select that interpreter under **Settings > Runtimes > Python runtime**. Local Forge never installs Python packages or downloads model weights automatically.

Studio executes local Diffusers directories containing `model_index.json`. Registered `.safetensors` and `.ckpt` files remain visible for inventory but must be converted to Diffusers format before generation. Completed PNGs are added to Library and stored under Local Forge's user-data `outputs/images` directory. Optional NSFW segmentation writes one binary mask per detected region beside the completed image.

The Studio **Describe image** and **Create prompt** actions use the Ollama model currently selected in Workbench. That model must advertise Ollama's `vision` capability. Local Forge does not pre-classify or block adult images; description quality and model-level refusals depend on the selected vision model.

Tune requires a local Hugging Face Transformers model directory containing `config.json`; Ollama tags and GGUF files are inference artifacts and are not offered as trainable base models. Datasets may be JSON, JSONL, or CSV and should contain either a `text` field or chat `messages`. Completed adapters use standard PEFT format under `outputs/adapters`.

Closing Local Forge cancels active workers. Runs still marked active after an abnormal shutdown are restored as interrupted failures rather than resumed.

## MCP servers

Open **Settings > MCP servers**, add either a local process or Streamable HTTP endpoint, test the connection, then enable it. Arguments, environment variables, and request headers use one `KEY=value` or argument per line. Ollama models must support tool calling.

Local Forge shows the requested tool and arguments before every call. Stdio servers run with your user account's permissions, so only configure commands you trust. Remote endpoints require HTTPS; unencrypted HTTP is limited to loopback. Environment and header values are encrypted at rest by Electron on supported desktop systems.

## Validate

```powershell
npm test
npm run lint
npm run build
```

`npm run dist` builds an installer for the current platform.

## Automated releases

Every push to `main` (including a merged pull request) runs tests, lint, and the application build. After those checks pass, GitHub Actions packages that exact commit for Windows x64 (`.exe`), one universal macOS `.dmg` that runs on both Intel and Apple Silicon, and Linux x64 (`.AppImage`).

Download installers from [GitHub Releases](https://github.com/Azayzel/local-forge/releases). Each main build is an unsigned prerelease, tagged `v<package-version>-main.<test-run-number>` (for example, `v0.1.0-main.42`). The installer version matches the tag without its `v` prefix. These alpha builds are not marked as the latest stable release.

All three installers and `SHA256SUMS.txt` are uploaded before the release is published. To verify a download, compare its SHA-256 hash with the matching entry in that file:

```powershell
Get-FileHash .\Local-Forge-0.1.0-main.42-win-x64.exe -Algorithm SHA256
```

Use your downloaded installer's actual filename. On Linux, download all three installers and the checksum file into one directory and run `sha256sum --check SHA256SUMS.txt`; on macOS run `shasum -a 256 ./Local-Forge-0.1.0-main.42-mac-universal.dmg` and compare the hash it prints with the matching line in `SHA256SUMS.txt`.

Windows and macOS may show security warnings: these builds are not yet signed or notarized. See [release maintenance](../CONTRIBUTING.md#release-maintenance) for setup, versioning, and retries.

## Project status

- Studio generation currently supports local Diffusers directories, not single-file checkpoints.
- Tune trains local Transformers directories and does not convert Ollama or GGUF models.
- Python dependencies and CUDA-compatible PyTorch builds are user-managed.
- Ollama endpoints must resolve to the local machine.
- Remote MCP servers can receive approved tool arguments and return data to the active model.
- NVIDIA telemetry requires `nvidia-smi`; other GPUs are not guessed.
- Automated builds are not signed or notarized yet.

See the [contribution guide](../CONTRIBUTING.md), [security policy](../SECURITY.md), and [asset notes](THIRD_PARTY_ASSETS.md) for details.

Local Forge is available under the [MIT License](../LICENSE).
