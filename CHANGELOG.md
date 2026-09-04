# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/) and versioning follows [SemVer](https://semver.org/).

## [1.5.1] - 2026-09-03

### Fixed
- **Imported AI messages rendered empty**: `createMessage()` ignored its `text`
  argument (only the streaming path filled the bubble afterwards), so imported
  assistant turns appeared as blank bubbles while user messages showed fine.
  `createMessage()` now renders the text it was given.

## [1.5.0] - 2026-09-03

### Added
- **Export conversation** — "Export" button in the header downloads a self-contained
  JSON file (`chat-local-<timestamp>.json`): all messages, OCR/Transcribe mode flags,
  and image/audio attachments embedded as base64.
- **Import conversation** — "Import" button loads such a JSON: bubbles and media
  previews are rebuilt, and the session is recreated with `initialPrompts` so the
  model **continues the imported context**. If the Chrome build rejects multimodal
  `initialPrompts`, it falls back to a fresh session with a visible "context not kept"
  warning — the chat always stays usable.
- In-memory `transcript` is now the source of truth for the conversation (live blobs,
  zero base64 cost until export); AI turns are recorded even when stopped or errored.

### Changed
- `createUserMessage()` now takes a transcript entry — one renderer for both the
  send path and the import path.

## [1.4.0] - 2026-09-03

### Changed
- **Real responsive layout (mobile ↔ desktop)**:
  - `100dvh` body height — footer no longer hidden behind collapsing mobile URL bars.
  - `viewport-fit=cover` + `env(safe-area-inset-bottom)` — notch/gesture-bar aware.
  - New tablet breakpoint (≤900px); extended phone breakpoint (≤640px): header buttons
    flex full-width, status pill truncates, tool/attachment chips shrink, stats bar wraps.
  - `min(280px, 58vw)` message media — never overflows small screens.
  - `clamp()` welcome heading; 16px textarea on mobile (stops iOS focus-zoom).

## [1.3.0] - 2026-09-03

### Added
- **System stats bar** in the footer (`sysstats.js`) — browser-native only, no extension/native code:
  - **CPU** via the Compute Pressure API (load levels shown as `●●○○ idle/busy/loaded/maxed` + page FPS), with FPS-only fallback where the API is absent.
  - **MEM** via `performance.memory` (this tab's JS heap) + `navigator.deviceMemory` (device RAM).
  - **GPU** chip appears only if the browser honestly reports a GPU pressure signal; otherwise hidden.
  - Honest labeling via tooltips; missing APIs degrade to `—`, nothing throws.

## [1.2.2] - 2026-09-03

### Changed (UX polish — no structural changes)
- **Sticky auto-scroll**: while the AI streams, the view follows the output — but stops following if the user scrolls up to read earlier messages.
- **Streaming caret**: pulsing `▍` at the end of the AI bubble while the answer is being generated; removed on completion.
- **User bubbles hug content**: capped at 78% width so short messages no longer stretch edge to edge.
- **Attachment strip overflow**: more than a few chips now scroll inside a capped-height strip instead of pushing the composer off-screen.
- **Keyboard focus rings**: visible `:focus-visible` outline on all buttons/toggles for accessibility (textarea keeps its composer ring).
- **Send button stability**: fixed `min-width` so "Send"/"Stop" swap doesn't shift layout.
- **Scrollbar gutter**: `scrollbar-gutter: stable` prevents horizontal jump when the scrollbar appears.
- Send-button enable logic unified: `updateSendButton()` now also runs after model ready/download (previously only after text input or attachments).

## [1.2.1] - 2026-09-03

### Added
- **Clipboard paste** — press `Ctrl+V` anywhere to attach a copied image (screenshot-friendly: unnamed clipboard images get an auto-generated name).
- **Drag & drop** — drop image and audio files anywhere on the page to attach them; both types are detected by MIME type and routed to the right attachment list.
- Drop overlay: dashed highlight + hint text shown while dragging over the page.

### Fixed
- OCR / Transcribe toggles were always visible: author `display` rules overrode the UA `[hidden]` rule. Explicit `.tool-toggle[hidden]` / `#attachments[hidden]` rules added.

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
