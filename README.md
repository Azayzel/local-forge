# Local Forge

![Local Forge](public/icon.png)

Local Forge is a fast, local-first desktop workbench for open models. Chat with Ollama, generate images with local Diffusers models, train PEFT adapters, organize sessions, and inspect your machine. Data stays on your device unless you explicitly connect a remote MCP server.

> **Functional alpha:** local chat, MCP tools, image generation, QLoRA training, persistence, model management, hardware telemetry, and desktop packaging work. Image and training runtimes use your own Python environment and model files.

## Screenshots

### Workbench

![Local Forge Workbench using the Radiant theme](docs/assets/screenshots/workbench-radiant.png)

### Themes

![Local Forge theme picker showing all seven palettes](docs/assets/screenshots/theme-picker.png)

### MCP configuration

![Local Forge MCP server configuration at tablet width](docs/assets/screenshots/mcp-setup-tablet.png)

![Local Forge MCP server configuration at mobile width](docs/assets/screenshots/mcp-setup-mobile.png)

## Highlights

- Streamed Markdown chat with locally installed Ollama models
- Persistent sessions, image attachments, search, pinning, and deletion
- Local Diffusers and `.safetensors` / `.ckpt` model registration
- Cancellable image generation with live step progress and Library import
- Optional Face Fix, tiled 2x/4x UltraSharp upscaling, and saved NSFW region masks
- Cancellable QLoRA training with live progress and standard PEFT output
- Screenshot and reference-image imports shared by Studio and Library
- Live RAM and NVIDIA telemetry, with unavailable data left unknown
- Stdio and Streamable HTTP MCP servers with per-call approval
- Seven persistent interface themes
- Sandboxed Electron renderer with a narrow typed preload API

## Run locally

Requirements: Node.js 22.12+, npm, and [Ollama](https://ollama.com/). Python is only required for Studio generation and Tune training.

```powershell
ollama serve
npm ci
npm run dev
```

Opening Vite directly uses a browser preview adapter. Use the Electron window for filesystem imports, MCP servers, encrypted credential persistence, and real hardware data.

## Image and training runtime

Use Python 3.10-3.12 and install the PyTorch build appropriate for your hardware first. Then install either or both worker environments:

```powershell
python -m pip install -r runtime/requirements-image.txt
python -m pip install -r runtime/requirements-training.txt
```

Select that interpreter under **Settings > Runtimes > Python runtime**. Local Forge never installs Python packages or downloads model weights automatically.

Studio executes local Diffusers directories containing `model_index.json`. Registered `.safetensors` and `.ckpt` files remain visible for inventory but must be converted to Diffusers format before generation. Completed PNGs are added to Library and stored under Local Forge's user-data `outputs/images` directory. Optional NSFW segmentation writes one binary mask per detected region beside the completed image.

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

`npm run dist` builds an installer for the current platform. Successful test runs on `main` also publish unsigned Windows, macOS, and Linux prereleases through GitHub Actions.

## Project status

- Studio generation currently supports local Diffusers directories, not single-file checkpoints.
- Tune trains local Transformers directories and does not convert Ollama or GGUF models.
- Python dependencies and CUDA-compatible PyTorch builds are user-managed.
- Ollama endpoints must resolve to the local machine.
- Remote MCP servers can receive approved tool arguments and return data to the active model.
- NVIDIA telemetry requires `nvidia-smi`; other GPUs are not guessed.
- Automated builds are not signed or notarized yet.

See the [migration audit](docs/LAVELY_AUDIT.md), [contribution guide](CONTRIBUTING.md), [security policy](SECURITY.md), and [asset notes](docs/THIRD_PARTY_ASSETS.md) for details.

Local Forge is available under the [MIT License](LICENSE).
