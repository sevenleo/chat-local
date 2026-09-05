# Chrome Local AI Chat

**v1.15.0**

A small, local-first chat interface for testing the browser's built-in **Prompt API** with Gemini Nano. The browser runs the model on-device; this project provides the UI, media handling, conversation queue, import/export, and optional local system metrics.

No external AI service or API key is required.

## Contents

- [Features](#features)
- [Tech stack and constraints](#tech-stack-and-constraints)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [How to use](#how-to-use)
- [How it works](#how-it-works)
- [Project structure](#project-structure)
- [Conversation files](#conversation-files)
- [Optional system metrics](#optional-system-metrics)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Privacy and security](#privacy-and-security)
- [Known limitations](#known-limitations)
- [Changelog](#changelog)

## Features

- On-device text generation through `LanguageModel` / `window.ai.languageModel`.
- Progressive capability detection: `text + image + audio`, then `text + image`, then `text only`.
- Chrome and compatible Edge/Chromium builds, with automatic namespace and capability fallback.
- Streaming responses with support for both incremental and accumulated chunks.
- Discreet copy buttons for every textual user and assistant message; assistant
  copies preserve the original Markdown, including links, images, code and lists.
- Assistant responses render common Markdown: headings, emphasis, lists, links, code, quotes, tables, underline, and ANSI colors.
- Stop generation while a response is streaming.
- Message queue: keep sending while the model is busy, skip the current response, cancel individual queued messages, or clear the whole queue.
- Image and audio attachments through file pickers, clipboard paste, or drag and drop.
- OCR mode for image-only text extraction.
- Transcribe mode for audio-only speech transcription.
- Mixed OCR + transcription mode when both media types are attached.
- Retractable menu with model checks, model download, import, export, Chrome on-device internals shortcut, and performance-metric controls.
- Self-contained JSON conversation export with media embedded as base64.
- Conversation import that attempts to restore the model context through `initialPrompts`.
- Responsive dark interface with keyboard focus states, sticky streaming scroll, attachment previews, and a matching favicon.
- Optional browser and local system metrics; metrics collection can be paused completely.

## Tech stack and constraints

- **Frontend:** plain HTML, CSS, and browser JavaScript.
- **AI runtime:** browser-provided Prompt API and Gemini Nano.
- **Local server:** Python standard library `http.server`.
- **Optional metrics:** `psutil` for CPU/RAM and `nvidia-smi` for NVIDIA GPU/VRAM.
- **Server cleanup:** `stop_server.py` uses `psutil` to find project server processes.
- **Tests:** Node.js built-in `assert` module.
- **Build system:** none.
- **Runtime dependencies:** none for chat; `psutil` is optional for real CPU/RAM metrics.

The app is a static page. `server.py` is only needed for convenient local hosting and the optional `/stats` endpoint; it is not an AI backend.

## Requirements

### Browser and model

- Google Chrome 138+ is the reference target for the current Prompt API.
- Microsoft Edge and other Chromium builds may work when their on-device AI features are enabled; Edge Canary/Dev or Copilot+ hardware may be required depending on the build.
- The browser must expose either `window.LanguageModel` or `window.ai.languageModel`.
- Gemini Nano must be available locally in the browser. The first run may require downloading the model.

Enable the relevant browser flags when your build requires them:

1. `chrome://flags/#prompt-api-for-gemini-nano` (or the equivalent Edge flag) — **Enabled**.
2. `chrome://flags/#optimization-guide-on-device-model` — **Enabled BypassPerfRequirement**.
3. `chrome://flags/#prompt-for-multimodal-genai` — **Enabled** when present and when image/audio input is needed.

Restart the browser after changing flags. If multimodal support is unavailable, the app keeps text chat working and hides unsupported attachment buttons.

### Local tools

- Python 3 for `server.py`.
- Node.js for `node test.js`.
- `psutil` is optional and only enables real system CPU/RAM values in the footer.
- `nvidia-smi` on `PATH` is optional and only enables the first NVIDIA GPU's utilization and VRAM values.

## Quick start

From the project directory:

```bash
python server.py
```

Open [http://127.0.0.1:8000/chat.html](http://127.0.0.1:8000/chat.html).

To use a different local port:

```bash
python server.py --port 9000
```

The server binds to loopback (`127.0.0.1`), so the page and files it serves are not exposed to the LAN by default.

To enable real CPU/RAM metrics:

```bash
python -m pip install psutil
python server.py
```

The chat itself does not require `psutil`. Without it, the browser metrics remain available and the unavailable system chips stay hidden.

To find and stop server sessions left running in the background:

```bash
python stop_server.py --dry-run
python stop_server.py
```

The script only targets Python processes running this project's `server.py`, including instances using another port.

### Opening without Python

The static files can be served by another local HTTP server. The chat still works if the browser exposes the Prompt API, but `server.py`-backed CPU/RAM/GPU/VRAM metrics will not be available. Opening `chat.html` directly with `file://` is also possible for basic static inspection, although browser security and Prompt API restrictions may prevent model access.

## How to use

1. Open the menu button in the upper-right corner.
2. Select **Test model** to check availability. A successful check creates a session and reports the active capability level.
3. If the model is downloadable, select **Download model** and wait for the progress percentage to finish.
4. Type a prompt and press **Enter**. Use **Shift+Enter** for a newline.
5. Add media with **🖼️** or **🎵**, paste a screenshot with `Ctrl+V`, or drag image/audio files anywhere onto the page.
6. Enable **OCR** for image text extraction, **Transcribe** for audio transcription, or both when both media types are attached.
7. Send the message. The assistant response streams into the chat.
8. Use the copy button beside any textual message to copy its original text or Markdown to the clipboard, including URLs and formatting markers.

### Queue controls

The composer remains usable while the model is generating:

- A message sent during generation is shown with an `⏳ queued` badge.
- Queued messages run in order after the current turn finishes.
- **Stop** cancels the current generation.
- When messages are waiting, **Stop** becomes **Skip ⏭**: it cancels the current response and starts the next queued item.
- The `✕` button cancels one queued message.
- **Clear queue** cancels every queued message.
- Queued messages are captured with their text, media, and OCR/Transcribe state at send time, so later composer changes do not alter them.

### Menu actions

- **Test model:** checks model availability and creates a session if the model is already installed.
- **Download model:** creates a session with a download-progress monitor.
- **Export:** downloads the current transcript as `chat-local-YYYY-MM-DD-HHmm.json`.
- **Import:** loads a compatible JSON conversation and tries to restore its context.
- **On-device internals:** shows Chrome's `chrome://on-device-internals/` diagnostics URL and copies it for pasting into the address bar; web pages cannot navigate directly to privileged `chrome://` pages.
- **New chat:** opens a confirmation dialog, then clears the conversation, queued messages,
  unsent draft and attachments before creating a fresh model session. If a response is
  generating, it is stopped first.
- **Finish chat:** opens a confirmation dialog, stops generation, destroys the active model
  session, clears the chat and best-effort site storage cleanup, then attempts to close the tab.
  The browser-controlled Gemini Nano model cache cannot be deleted by page JavaScript.
- **Show performance metrics:** toggles the footer and pauses or resumes every browser probe and `/stats` request.

## How it works

### Model capability negotiation

At startup, `app.js` resolves the first supported Prompt API namespace:

```text
window.LanguageModel
        or
window.ai.languageModel
```

It then probes configurations from richest to simplest:

| Configuration | Inputs | UI result |
| --- | --- | --- |
| Full multimodal | text, image, audio | Text, image, and audio controls are shown |
| Image multimodal | text, image | Text and image controls are shown |
| Text only | text | Media controls are hidden |

Some Edge builds report a configuration as available but reject it during `create()`. The app therefore retries all configurations during session creation as well as during availability checks. The first configuration that actually creates a session becomes the active configuration.

When no Prompt API namespace exists, the page remains visible but model actions are disabled and the status pill explains that built-in AI is unavailable.

### Message and streaming flow

```text
Composer input
  → capture text/media/mode
  → render user bubble
  → enqueue when another turn is active
  → build string or multimodal Prompt API input
  → session.promptStreaming()
  → fold incremental or accumulated chunks
  → render sanitized Markdown in the assistant bubble
  → append the completed/partial/error turn to the transcript
```

`chat-logic.js` contains the pure helpers shared by the browser and `test.js`:

- streaming chunk folding;
- Prompt API content construction;
- media capability checks;
- import validation and prompt reconstruction;
- sanitized Markdown rendering;
- queue operations.

### Assistant response formatting

Assistant messages are stored and exported as their original Markdown text, then rendered in the browser. Supported formatting includes headings, bold, italic, strikethrough, unordered and ordered lists, links, fenced code blocks, blockquotes, tables, <u>/<br>, images with safe URLs, emojis, and common ANSI foreground/background colors.

HTML is escaped by default. Only <u> and <br> are allowed through, and links/images reject unsafe protocols such as `javascript:`. Responses with several escaped Markdown markers, a pattern produced by some local models, are normalized for compatibility; isolated escapes remain literal. Markdown rendering is dependency-free and works during streaming as the response grows.

### Media and modes

Normal prompts use the user's text, or `Describe what is in this media.` when media is attached without text. OCR and Transcribe replace that instruction with a strict extraction prompt. The browser does not perform OCR or speech recognition itself; the on-device model receives the media and performs the interpretation.

Before sending, the app checks the active session's `expectedInputs`. Unsupported media is rejected locally instead of being sent to a text-only session.

### Transcript ownership

The in-memory `transcript` is the source of truth for the visible conversation and export. Media stays as `Blob` objects while the chat is open and is converted to base64 only during export. Object URLs are released when attachments are removed or the conversation is replaced.

Import is staged before the current conversation is replaced:

1. Parse and validate the JSON.
2. Recreate media blobs and object URLs.
3. Create a session with `initialPrompts` containing the imported conversation.
4. Replace the visible transcript only after staging succeeds.
5. If the browser rejects `initialPrompts`, create a fresh session and show a warning that context was not kept.

## Project structure

```text
chat-local/
├── chat.html       # Page structure, controls, file inputs, and script loading
├── style.css       # Responsive graphite/emerald UI; no CSS framework
├── favicon.svg     # Local AI Chat diamond favicon
├── app.js          # UI state, model sessions, media, streaming, queue, import/export
├── chat-logic.js   # Pure shared helpers for app.js and test.js
├── sysstats.js     # Browser probes and optional same-origin /stats polling
├── server.py       # Loopback static server and /stats endpoint
├── test.js         # Node smoke tests for shared logic
├── CHANGELOG.md    # Version history
└── README.md       # Project documentation
```

There is no bundler, package manifest, database, authentication layer, or application API server.

## Conversation files

Exported conversations are JSON files with embedded media. The current format is version `1`:

```json
{
  "app": "chat-local",
  "version": 1,
  "exportedAt": "2026-09-05T12:00:00.000Z",
  "messages": [
    {
      "role": "user",
      "text": "What is in this image?",
      "mode": null,
      "media": [
        {
          "type": "image",
          "name": "photo.png",
          "mime": "image/png",
          "data": "<base64 data>"
        }
      ]
    },
    {
      "role": "ai",
      "text": "..."
    }
  ]
}
```

Valid values are:

- `app`: `chat-local`;
- `version`: `1` when present;
- `role`: `user` or `ai`;
- user `mode`: `ocr`, `transcribe`, or `both` when present;
- media `type`: `image` or `audio`;
- media `data`: non-empty base64 text.

The entire media payload is embedded in the file, so large conversations can produce large downloads. Exported JSON may contain private text and media; protect or delete it like any other personal data. Files matching `chat-local-*.json` are ignored by Git through `.gitignore`.

## Optional system metrics

When **Show performance metrics** is enabled, `sysstats.js` shows browser metrics and polls the same-origin `stats` endpoint once per second while `server.py` is reachable.

### Browser metrics

- Browser CPU pressure and page FPS when `ComputePressureObserver` is available in a secure context.
- FPS-only fallback when browser CPU pressure is unavailable.
- Current tab JavaScript heap when `performance.memory` is available.

These are browser/tab signals, not system-wide CPU or RAM percentages.

### `/stats` endpoint

`GET /stats` returns JSON with the following base fields:

| Field | Source | Availability |
| --- | --- | --- |
| `app` | server | Always `chat-local` for this endpoint |
| `at` | server | Unix timestamp in seconds |
| `cpuPercent` | `psutil` | Optional, total CPU usage |
| `ramUsed`, `ramTotal`, `ramPercent` | `psutil` | Optional, system memory |
| `gpuName`, `gpuPercent` | `nvidia-smi` | Optional, first NVIDIA GPU |
| `vramUsed`, `vramTotal` | `nvidia-smi` | Optional, first NVIDIA GPU memory |

Unavailable fields are omitted. The frontend validates the response shape and hides each unavailable chip individually. If three consecutive probes fail, it stops polling and keeps only browser metrics until the setting is toggled again.

The endpoint does not receive prompts, conversation content, or media.

## Development

### Run the smoke tests

```bash
node test.js
```

Expected output:

```text
OK: shared streaming, prompt, capability, export/import payload, and queue logic
```

The tests cover both streaming chunk styles, OCR/Transcribe prompt construction, media capability checks, import validation, the export payload shape, and queue semantics. They do not require a browser or a downloaded model.

### Inspect the local server options

```bash
python server.py --help
```

### Manual browser verification

1. Start `python server.py`.
2. Open `http://127.0.0.1:8000/chat.html` in a supported browser.
3. Test the model status and download flow.
4. Verify text generation, Stop, and queued messages.
5. Verify image/audio attachment behavior at the active capability level.
6. Export and re-import a conversation containing text and media.
7. Toggle performance metrics and confirm polling stops when disabled.

Keep the implementation dependency-free. If a change touches shared logic, add or update the smallest runnable assertion in `test.js`.

## Troubleshooting

### “Built-in AI not available in this browser”

The page could not find `window.LanguageModel` or `window.ai.languageModel`.

- Use a supported Chrome build or an Edge build with its on-device AI features enabled.
- Check the Prompt API flags and restart the browser.
- Confirm that the browser is not blocking the local page's required capabilities.

### “Model unavailable in this browser”

The Prompt API exists, but the browser reports no usable model configuration.

- Confirm the Gemini Nano/on-device model flags.
- On Edge, availability depends on the specific build and hardware; Canary/Dev or Copilot+ support may be required.
- Check the browser console for the exact flag guidance emitted by `app.js`.

### The model is downloadable but generation fails

Use **Download model** and wait for the status to become **Model ready**. If session creation fails for multimodal input, the app automatically retries a smaller input configuration. If all configurations fail, check available disk space, device support, and browser model download status.

### Image or audio buttons are missing

The active session is text-only or image-only. This is intentional capability fallback. Enable multimodal browser flags when supported; the app cannot add a modality that the browser/model does not expose.

### “Media unavailable in text-only mode”

The current session accepts text but not the attached file type. Remove the unsupported media or restart in a browser/model configuration that supports it.

### System metric chips are missing

This is expected when the corresponding source is unavailable:

- Install `psutil` for CPU/RAM.
- Install NVIDIA drivers and make `nvidia-smi` available for GPU/VRAM.
- Confirm the page is opened from the same local server as `/stats`.
- Make sure **Show performance metrics** is enabled.

The chat does not depend on system metrics.

### Imported context was not kept

The browser accepted the file but rejected `initialPrompts`. The UI creates a fresh session so the transcript remains visible and usable, but the model will not have the imported conversation in its internal context. This is a browser/model limitation, not a malformed export.

### Port already in use

Start the server on another port:

```bash
python server.py --port 9000
```

Open the matching URL. Each server process owns only its own port; stopping one process cannot close a separate process left over from an earlier run.

## Privacy and security

- Prompts and media are sent to the browser's local on-device model through the Prompt API.
- The project has no external AI API, analytics, database, login, or cloud conversation store.
- `server.py` binds to `127.0.0.1` and serves files from the project directory; browser downloads are controlled by the browser's download location.
- `/stats` reports local machine metrics only; it does not inspect chat content.
- Conversations remain in memory until exported or replaced.
- Export files contain the full transcript and embedded media in base64. Do not share them unless that content is intended to be shared.
- The local server is intentionally minimal. Do not expose it to a network without adding authentication, access controls, and a deliberate deployment design.

## Known limitations

- Prompt API availability, model download state, hardware requirements, and supported input types are controlled by the browser.
- OCR and transcription quality depend on Gemini Nano and the browser's on-device model.
- The model configuration requests English text input/output (`languages: ["en"]`).
- GPU/VRAM metrics support the first GPU reported by `nvidia-smi`; other GPU vendors are not queried.
- Export/import is currently format version `1`; invalid or unsupported JSON is rejected.
- There is no persistent conversation database. Refreshing the page loses the in-memory conversation unless it was exported.
- The app is designed for local experimentation, not multi-user hosting or production deployment.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the complete version history and release notes.
