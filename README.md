# Chrome Local AI Chat

**v1.2.1**

A simple experimental project for testing **Chrome Built-in AI / Prompt API** with a locally executed language model.

The project provides a lightweight ChatGPT-style interface that communicates directly with the AI model available through Google Chrome's on-device AI capabilities.

No external AI API or API key is required.

## Features

- Local AI inference through Chrome's `LanguageModel` API
- Gemini Nano / Chrome Built-in AI support
- **Multimodal input**: attach images and audio — with text or alone
- **Paste & drag-drop**: `Ctrl+V` a screenshot, or drag media files onto the chat
- **OCR mode**: image attached → model returns only the extracted text
- **Transcribe mode**: audio attached → model returns only the speech transcription
- Streaming responses with correct incremental/accumulated chunk handling
- Stop/cancel generation mid-stream
- Model availability check with colored status pill
- Model download trigger with live progress percentage
- Refined dark chat UI — vanilla HTML/CSS/JS, no framework
- Attachment previews, in-message media rendering, typing indicator
- Auto-growing composer, welcome / empty state, responsive layout
- No backend AI service, no API key
- Local execution using the computer's available hardware acceleration

## Requirements

- Google Chrome (recent version)
- Enable the built-in AI flags:
  - `chrome://flags/# optimization-guide-on-device-model` → **Enabled beta**
  - `chrome://flags/#prompt-for-multimodal-genai` (if present in your build) → **Enabled**
- On first use, click **Download model** to fetch Gemini Nano (~a few hundred MB, one time)

## How to run

```bash
python server.py
```

Then open: **http://127.0.0.1:8000/chat.html**

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

## Project Structure

```text
chat-local/
├── chat.html      ← markup only (loads style.css + app.js)
├── style.css      ← design system: refined dark theme, no framework
├── app.js         ← chat logic: multimodal prompts, streaming, stop
├── test.js        ← streaming chunk-fold regression test (node test.js)
├── server.py      ← static file server (port 8000)
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
