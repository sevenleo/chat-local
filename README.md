# Chrome Local AI Chat

**v1.7.2**

A simple experimental project for testing the **Built-in AI / Prompt API** (Gemini Nano) with a locally executed language model.

The project provides a lightweight ChatGPT-style interface that communicates directly with the AI model available through the browser's on-device AI capabilities — **Google Chrome** as the reference target, **Microsoft Edge** supported with automatic capability fallback.

No external AI API or API key is required.

## Features

- Local AI inference through the browser's `LanguageModel` API (Gemini Nano)
- **Cross-browser**: Chrome 138+ and Microsoft Edge — namespace and input-capability
  probing with progressive fallback (text+image+audio → text+image → text-only)
- **Multimodal input**: attach images and audio — with text or alone
- **Paste & drag-drop**: `Ctrl+V` a screenshot, or drag media files onto the chat
- **OCR mode**: image attached → model returns only the extracted text
- **Transcribe mode**: audio attached → model returns only the speech transcription
- Streaming responses with correct incremental/accumulated chunk handling
- Stop/cancel generation mid-stream
- **Message queue**: keep typing and sending while the model generates — messages are queued and processed in order; Stop becomes "Skip ⏭" to abort the current turn and start the next; cancel individual queued messages (✕ on the bubble) or all at once ("Clear queue")
- Model availability check with colored status pill
- Model download trigger with live progress percentage
- Refined dark chat UI — vanilla HTML/CSS/JS, no framework
- Attachment previews, in-message media rendering, typing indicator
- Auto-growing composer, welcome / empty state, responsive layout
- Sticky auto-scroll during streaming, streaming caret, keyboard focus rings
- Export / import conversations as self-contained JSON (media embedded, context restored on import)
- Footer status bar — browser CPU pressure/FPS and tab JS heap are always shown when available; real CPU %, system RAM, GPU % and VRAM appear through `server.py` + `psutil`/`nvidia-smi` and are hidden individually when unavailable
- No backend AI service, no API key
- Local execution using the computer's available hardware acceleration

## Requirements

- **Google Chrome 138+** (Prompt API stable) or **Microsoft Edge** (Canary/Dev
  recommended) with the on-device AI model enabled
- Enable the required flags:
  - `chrome://flags/#prompt-api-for-gemini-nano` (or Edge equivalent) → **Enabled**
  - `chrome://flags/#optimization-guide-on-device-model` → **Enabled BypassPerfRequirement**
  - `chrome://flags/#prompt-for-multimodal-genai` (if present) → **Enabled** —
    without it, the app auto-degrades to text-only chat
- On first use, click **Download model** to fetch Gemini Nano (one time)

The app automatically probes the Prompt API namespace (`LanguageModel`,
`window.ai.languageModel`) and the richest input configuration your browser
actually supports — media buttons hide when unsupported, and the chat keeps
working regardless of the browser's capability level.

## How to run

```bash
pip install psutil      # enables real system stats (CPU %, RAM) — recommended
python server.py        # add --port 9000 to change the port
```

Then open: **http://127.0.0.1:8000/chat.html**

The footer status bar always shows browser-only metrics when supported (tab JS
heap, page FPS and pressure levels). It also auto-detects whether `server.py`
is running behind the page: with it, you get real CPU %, system RAM and (on
NVIDIA GPUs, via `nvidia-smi`) GPU % / VRAM. Without it, only the Python-backed
chips stay hidden — nothing breaks, nothing pretends browser values are system
metrics.

## Usage

1. **Test model** — checks Gemini Nano availability; status pill turns green when ready.
2. **Download model** — triggers the one-time on-device model download (shows progress %).
3. Type a message and press **Enter** (or Shift+Enter for a newline).
4. Click **🖼️** to attach image(s) or **🎵** to attach audio file(s) —
   or simply **paste an image with Ctrl+V**, or **drag & drop** images/audio anywhere onto the page.
   - With an image attached, an **OCR** toggle appears — enable it for text-extraction only.
   - With audio attached, a **Transcribe** toggle appears — enable it for transcription only.
   - With neither toggled, media + your text are sent together as a normal question.
5. **Stop** appears while the model is generating, to cancel mid-stream.
   - You can keep typing and sending while the model works — extra messages are
     **queued** (shown with a "⏳ queued" badge) and processed in order.
   - With a queue pending, **Stop** becomes **Skip ⏭** — aborts the current
     reply and immediately starts the next queued message.
   - Cancel a queued message with the **✕** on its bubble, or all of them with
     **Clear queue**.

## Project Structure

```text
chat-local/
├── chat.html      ← markup only (loads style.css + app.js + sysstats.js)
├── style.css      ← design system: refined dark theme, no framework
├── app.js         ← chat logic: multimodal prompts, streaming, stop
├── sysstats.js    ← footer stats: browser metrics + optional /stats polling
├── test.js        ← streaming chunk-fold + export round-trip test (node test.js)
├── server.py      ← static file server + /stats system-stats endpoint (port 8000)
├── CHANGELOG.md   ← version history
└── README.md
```

## Development notes

- All logic lives in a single IIFE in `app.js` — no modules, no build step, no dependencies.
- The streaming handler supports both **incremental** and **accumulated** chunk formats
  emitted by `promptStreaming()`; `test.js` guards this with one runnable assert per mode.
- Multimodal input follows the Prompt API message format:
  `[{ role: "user", content: [{ type: "text"|"image"|"audio", value }] }]`
- OCR / Transcribe modes work by replacing the user's instruction with a strict
  extraction prompt — the model itself does the reading, nothing is processed in JS.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full version history.
