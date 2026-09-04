# Chrome Local AI Chat

A simple experimental project for testing **Chrome Built-in AI / Prompt API** with a locally executed language model.

The project provides a lightweight ChatGPT-style interface that communicates directly with the AI model available through Google Chrome's on-device AI capabilities.

No external AI API or API key is required.

## Features

- Local AI inference through Chrome's `LanguageModel` API
- Gemini Nano / Chrome Built-in AI support
- Streaming responses
- Stop/cancel generation
- Model availability check
- Model download trigger
- Refined dark chat UI (no framework, vanilla CSS/JS)
- Welcome / empty state
- No backend AI service
- No API key
- Local execution using the computer's available hardware acceleration

## Project Structure

```text
GITHUB/
├── chat.html      ← markup only (loads style.css + app.js)
├── style.css      ← design system: refined dark theme, no framework
├── app.js         ← chat logic: Chrome Built-in AI, streaming, stop
├── server.py      ← static file server (port 8000)
└── README.md
```
