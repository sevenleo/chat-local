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
- Simple ChatGPT-style interface
- No backend AI service
- No API key
- Local execution using the computer's available hardware acceleration

## Project Structure

```text
GITHUB/
├── chat.html
├── server.py
└── README.md