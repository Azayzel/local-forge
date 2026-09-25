# Lavely-LLM audit and Local Forge migration

## Verdict

Lavely-LLM proved that local chat, image generation, fine-tuning, retrieval, model downloads, and GPU diagnostics could live behind one desktop surface. It also accumulated the usual cost of proving everything at once: several runtimes, a large dependency graph, duplicated lifecycle code, generated artifacts beside source, and a UI architecture that made every new workflow harder to make coherent.

Local Forge keeps the product idea and replaces the operating model. The first release is intentionally narrower and honest about unfinished executors.

## What Lavely-LLM got right

- **Local-first was a product constraint, not a slogan.** Inference and training were designed around local hardware.
- **It shipped useful engine work.** Streaming chat, SDXL previews, tiled upscaling, face refinement, QLoRA, RAG, and benchmarking were substantive capabilities.
- **It acknowledged constrained GPUs.** CPU offload, quantization, gradient checkpointing, and tiling were practical decisions.
- **It exposed diagnostics.** GPU memory, temperature, utilization, and service state belong in a serious local-model tool.
- **It separated Python bridge processes from the renderer.** The typed preload and process boundary were the right security direction.
- **It documented the system.** Setup, architecture, feature, packaging, and CLI material existed instead of living only in code.

Those are the parts worth preserving.

## The roast

### 1. “All in one” became “all coupled together”

Four long-lived Python bridges, Electron IPC, newline-delimited protocols, model management, persistence, and a hand-managed renderer created too many places to represent progress, cancellation, failure, and restart behavior. Each feature brought another lifecycle rather than reusing one task model.

**Local Forge decision:** one desktop host and one runtime integration first. Future image and training engines must implement a shared executor contract rather than add feature-specific bridge behavior directly to views.

### 2. The repository stopped being a source boundary

The working tree contains model weights, generated output, logs, a virtual environment, documentation build output, benchmark output, datasets, and application source. Even when ignored, that layout makes ownership, backups, packaging, and cleanup harder to reason about.

**Local Forge decision:** source stays small. Runtime state belongs in Electron `userData`; Ollama owns chat models, while registered image models remain in user-selected external folders and only their paths are persisted.

### 3. Hardware assumptions leaked into product truth

The original product was tuned around a 6 GB RTX 2060, which was useful engineering context but too easy to turn into UI assumptions and catalog policy. A desktop tool must report the machine it is actually running on.

**Local Forge decision:** native telemetry comes from the host on every poll. Browser preview reports no sampled hardware. On the current machine the packaged app reports `NVIDIA GeForce RTX 3090` and 24 GB VRAM from `nvidia-smi`; that string is not present in source.

### 4. Breadth outran interaction quality

Chat, generation, training, RAG, model downloads, diagnostics, galleries, and CLIs created impressive breadth, but the UI had to expose many unrelated states and setup paths at once. The app behaved more like a control panel for subsystems than one coherent workbench.

**Local Forge decision:** Workbench is the primary surface. Models, runtime, context, and hardware remain visible around the work. Studio, Tune, Library, and Activity share the same shell and state vocabulary.

### 5. Capability labels could get ahead of execution

A queue-looking UI is misleading when no executor owns the job. Controls that imply work without causing work erode trust quickly.

**Local Forge decision:** unsupported image and training actions create `draft` records labeled “Awaiting executor.” Legacy prototype `queued` image and tune records migrate to drafts on load.

### 6. Large payloads did not belong in JSON state

Persisting attached images as base64 inside session JSON makes state writes large, slow, and easy to break with arbitrary size limits.

**Local Forge decision:** selected images are copied into a private attachment directory. Chat and Library records persist validated app URLs; the Electron host reads and encodes bytes only at the runtime boundary.

### 7. The frontend stack made refinement expensive

A vanilla TypeScript renderer can be excellent, but manual DOM and state coordination become costly across seven stateful application views. That cost shows up as duplicated interaction logic and reluctance to add robust empty, loading, and failure states.

**Local Forge decision:** React owns composition and state transitions; TypeScript contracts span renderer, preload, and main. Oxlint, Vitest, and production builds are release gates.

## What changed

| Concern | Lavely-LLM | Local Forge 0.1 |
| --- | --- | --- |
| Renderer | Vanilla TypeScript and webpack | React 19 and Vite |
| Local chat | Python LLM bridge | Ollama HTTP streaming |
| Desktop boundary | Broad feature IPC | Narrow typed preload API |
| Persistence | Multiple stores and repo-adjacent output | Versioned workspace plus private attachments |
| Hardware | Product centered on a 6 GB target | Live host probe; no preview fabrication |
| Image generation | Working SDXL pipeline | Selectable local models and recipe drafts; no executor |
| Fine-tuning | Working QLoRA bridge | Recipe drafts only |
| RAG | BookMind and MongoDB Atlas | Not migrated |
| Model management | Hugging Face catalog and downloads | Ollama pulls plus an external image-model registry |
| Image library | Generated-output gallery | Bundled samples plus imported local references |
| Activity | Feature-specific progress | Shared run record vocabulary |
| Packaging | Existing Electron build | Branded native builds and automated GitHub prereleases |

## Deliberately not copied

- Python environments and model weights inside the desktop project
- Four bespoke process protocols
- A catalog that hides choices based on one reference GPU
- Fake queue progress or pretend completion
- Browser-preview hardware fixtures
- Base64 image payloads in durable workspace state
- RAG credentials and cloud dependencies in the core desktop path

## Lost opportunities now visible

### P0: make drafts executable

Define an executor interface with start, progress, cancel, result, and recovery semantics. Implement image generation as the first plugin. Activity should become the authoritative task surface, and Library should index executor outputs rather than bundled samples.

### P0: make installation trustworthy

Automated native prereleases now follow successful `main` quality gates. Add Windows signing, Apple signing and notarization, release provenance, update metadata, and an explicit stable-version process before calling distribution production-ready.

### P1: import valuable Lavely work

Move the strongest SDXL, upscaling, detailer, and QLoRA logic behind versioned worker APIs. Do not reconnect old scripts directly to view components. Add cancellation, capability discovery, structured errors, and fixture-backed contract tests first.

### P1: graduate persistence

Workspace JSON is appropriate at this scale. Before adding output indexing, training history, or large metadata, move records to SQLite and keep files content-addressed. Add orphan cleanup and export/import.

### P1: support hardware beyond NVIDIA

Introduce platform adapters for AMD, Intel, Apple Silicon, and CPU-only systems. Unknown hardware must remain unknown; estimates should carry their source and confidence.

### P2: restore retrieval as a plugin

BookMind was useful but should not force MongoDB or embedding dependencies into the core app. A retrieval provider contract can support local indexes and remote services without changing Workbench.

### P2: evaluate the experience, not only inference

Retain the old benchmark discipline, then add startup time, first-token latency, cancellation latency, memory growth, recovery after runtime loss, and accessibility checks.

## Definition of done for parity

Local Forge should not claim Lavely-LLM feature parity until all of the following are true:

1. Studio can execute, cancel, recover, and persist image jobs.
2. Tune can validate datasets, execute training, stream metrics, and manage artifacts.
3. Library indexes real outputs and can reveal their full provenance.
4. At least one retrieval provider is integrated and grounded-output tests pass.
5. Hardware support and estimates are derived from detected capabilities.
6. Installers are signed or notarized and promoted through an explicit stable release channel.
7. Migration tooling can import useful Lavely history and output without copying its runtime baggage.

The rewrite is already cleaner and more trustworthy, but it is a foundation, not a declaration of feature parity.
