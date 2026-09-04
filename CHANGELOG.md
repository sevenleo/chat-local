# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/) and versioning follows [SemVer](https://semver.org/).

## [1.2.0] - 2026-09-03

### Added
- **Image input** — attach one or more images via the 🖼️ picker; previews render inside the user bubble.
- **Audio input** — attach audio files via the 🎵 picker; shown as a file chip in the bubble.
- **OCR mode** — with an image attached, an `OCR` toggle makes the model return only extracted text.
- **Transcribe mode** — with audio attached, a `Transcribe` toggle makes the model return only the speech transcription.
- Multimodal session: `expectedInputs` now declares `text`, `image` and `audio` in `LanguageModel.availability()` and `create()`.
- Prompts sent in the Prompt API multimodal message format (`role`/`content` parts array).
- Attachment chips with thumbnails and per-file remove buttons.
- Send button now activates with attachments even when the text box is empty.
- Mode badges (`OCR` / `Transcribe`) displayed on the sent message.

## [1.1.1] - 2026-09-03

### Fixed
- **Streaming regression**: dropped `respostaAnterior` update caused every chunk to overwrite
  the displayed text — words replaced each other and the final paragraph was never shown.
  The chunk-fold now correctly distinguishes incremental vs accumulated chunks
  (empty-prefix guard added).
- Added `test.js` — runnable regression test covering both chunk formats (`node test.js`).

## [1.1.0] - 2026-09-03

### Added
- Split the monolithic `chat.html` into `chat.html` + `style.css` + `app.js`.
- Design system in `style.css`: CSS custom properties, refined dark theme, subtle emerald accent.
- Status pill with visual states (ready / warn / error / idle) and pulsing indicator dot.
- Typing indicator (animated dots) shown while the model thinks.
- Welcome / empty-state screen for new conversations.
- Auto-growing composer textarea.
- Glassy sticky header/footer (`backdrop-filter`), themed scrollbar, entrance animations.
- Responsive layout (mobile breakpoint at 640px) and `prefers-reduced-motion` support.

### Changed
- All JS wrapped in an IIFE with `"use strict"` — no globals leak.
- `setStatus()` helper replaces scattered status-text assignments.

## [1.0.0] - initial release

### Added
- ChatGPT-style single-file interface using Chrome Built-in AI (`LanguageModel` / Prompt API).
- Streaming responses with incremental + accumulated chunk support.
- Stop/cancel generation via `AbortController`.
- Model availability check and download trigger with progress.
- Minimal threaded Python static server (`server.py`, port 8000).
