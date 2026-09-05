# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/) and versioning follows [SemVer](https://semver.org/).

## [1.13.0] - 2026-09-05

### Added
- **New chat** button with confirmation dialog that clears the conversation, queue,
  draft and attachments, then creates a fresh Prompt API session.

### Changed
- Copy buttons now write the original user text or assistant Markdown to the
  clipboard, preserving links, images, formatting markers, code and lists.

## [1.12.0] - 2026-09-05

### Added
- Discreet copy buttons beside textual user and assistant messages.
- Copy feedback and clipboard error handling without adding runtime dependencies.

## [1.11.1] - 2026-09-05

### Fixed
- Versioned frontend assets prevent a cached `chat-logic.js` from being mixed
  with a newer `app.js`, which caused `renderMarkdown is not a function`.

## [1.11.0] - 2026-09-05

### Added
- Assistant responses now render common Markdown formatting during streaming
  and after import, including emphasis, lists, links, code, quotes, tables,
  underline, and ANSI colors.
- Markdown output is sanitized without adding a runtime dependency; unsafe
  HTML and link protocols remain escaped or rejected.

### Fixed
- Markdown markers were previously inserted with `textContent`, so formatting
  syntax appeared literally and imported assistant messages could not render.
- The original assistant Markdown is now preserved in the transcript and
  conversation exports instead of being replaced by rendered DOM text.
- Over-escaped Markdown emitted by some local models is normalized when the
  response clearly contains several escaped formatting markers.

## [1.10.1] - 2026-09-05

### Changed
- Neutralized the page background to a darker graphite tone and softened the
  emerald accents across controls, status indicators, and the favicon.

## [1.10.0] - 2026-09-05

### Added
- Retractable right-side menu for model testing, downloading, import and export.
- **Show performance metrics** checkbox that hides the footer metrics and pauses
  browser probes, FPS sampling, memory reads and `/stats` polling.
- Matching `favicon.svg` based on the Local AI Chat diamond mark.

### Changed
- Reduced the empty-state message to a shorter local-first introduction.
- Refined the dark emerald UI and responsive layout for a cleaner browser experience.

## [1.9.1] - 2026-09-05

### Fixed
- Server binds to `127.0.0.1` so the local static files and exported conversations
  are not exposed to the LAN by default.
- Text-only sessions now reject unsupported media before sending it to the Prompt API.
- Conversation imports stage media, context and session creation before replacing the
  current conversation; imported OCR/Transcribe prompts preserve their instructions.
- Sent-message Blob URLs remain valid for previews and are released when the
  conversation is replaced.
- Attachment names are rendered as text, and shared logic is now exercised directly
  by the Node test file.

## [1.9.0] - 2026-09-05

### Removed
- **Message avatars** ("AI" / "U" chips) — bubbles are now identified purely
  by alignment and color (user right/accent, AI left/surface).

### Fixed
- The `[hidden]` attribute was being overridden by `display:flex` on the stats
  bar and chips, so "GPU …"/"VRAM …" placeholders could show even without
  `server.py`. Added a global `[hidden] { display: none !important; }` guard.

## [1.8.1] - 2026-09-05

### Changed
- The system-stats bar is now **hidden entirely when `server.py` is not
  running** instead of showing browser-only proxies (page FPS / tab JS heap).
  Those numbers are not system stats and could be misleading; the bar only
  appears once `/stats` answers with real data.

## [1.8.0] - 2026-09-05

### Added
- **Message queue**: the composer never locks during generation. Sending while
  the model is streaming enqueues the message (bubble shown with a "⏳ queued"
  badge) and it is processed automatically as soon as the current turn ends.
- **Skip**: while a queue exists, the Stop button becomes "Skip ⏭" — aborts
  the current generation and immediately starts the next queued message.
- **Cancel queued message**: each queued bubble gets a ✕ button to remove it
  before it reaches the model (it never enters the transcript/export).
- **Clear queue**: a "Clear queue" button (visible only when the queue is
  non-empty) cancels all pending messages at once.

### Changed
- `sendMessage()` was split into enqueue (`sendMessage`), driver (`runQueue`)
  and executor (`runGeneration`). OCR/Transcribe flags are captured at enqueue
  time, and items only enter the transcript when they actually start
  generating — export order always matches what the model saw.

## [1.7.2] - 2026-09-04

### Changed
- `createSession()` no longer logs a `console.warn` per rejected config — those
  warnings during init are the **expected** Edge capability-probing flow (a
  multimodal config being refused before the text-only one succeeds) and looked
  like errors. Failures now accumulate silently and are only logged (as one
  `console.error`) if **every** config fails.

## [1.7.1] - 2026-09-04

### Fixed
- **`NotSupportedError` ("device is unable to create session") on Edge**: Edge can
  report `availability()` as OK yet still reject `create()` when hardware gates
  (NPU/VRAM/disk) block the requested input stack. All session creation now goes
  through `createSession()`, which **retries every config from richest to
  text-only at create() time** — if multimodal is blocked but text works, you get
  a text chat instead of a dead end.
- Status now names the working mode: "Model ready (text + image)" etc.
- "unavailable" logs the exact Edge/Chrome flag URLs needed to enable the API.
- Import path uses the same resilient `createSession()`.

### Notes
- On Edge stable without the Prompt API flags (or non-Copilot+ hardware), the
  honest result is "Model unavailable in this browser" — no page code can
  install Microsoft's model. Enable: `edge://flags` →
  `#prompt-api-for-gemini-nano` + `#optimizer-on-device-model`
  (`BypassPerfRequirement`), then restart Edge. Chrome remains the reference target.

## [1.7.0] - 2026-09-04

### Changed
- **Cross-browser Prompt API compatibility** (fixes "Model unavailable" on Edge):
  - The namespace is now **resolved at init** across known spellings —
    `window.LanguageModel` (Chrome 138+) and `window.ai.languageModel` (older
    Chromium/Edge origin-trial builds). All calls go through the resolved alias.
  - **Input-config probing**: availability()/create() are tried against configs
    from richest to plainest — text+image+audio → text+image → text-only — and
    the first one the browser accepts becomes the session config. Edge builds
    whose Gemini Nano lacks multimodal capability now fall back to a working
    text chat instead of a hard "Model unavailable".
  - Image/audio attach buttons hide automatically when the active config
    doesn't support that modality; prompts degrade to a plain string for
    text-only sessions.
  - Clear error message (status bar + console) when no Prompt API exists at
    all, naming the supported browsers.

## [1.6.3] - 2026-09-04

### Fixed
- **Crash in the request logger** on 404 paths (`favicon.ico`): `SimpleHTTPRequestHandler.log_error`
  passes an `HTTPStatus` object as the first log arg, and the "/stats" filter called
  `in` on it → `TypeError: argument of type 'HTTPStatus' is not iterable`. Args are
  now stringified before matching, so error logging works again.
- **`favicon.ico` 404 noise** eliminated at the source: the page now declares
  `<link rel="icon" href="data:,">` (empty inline icon), so the browser stops
  requesting the file; stray favicon 404s are also kept out of the console log.

## [1.6.2] - 2026-09-03

### Fixed
- **Guaranteed single-port cleanup on every stop path**: `server.py` now routes
  SIGINT (Ctrl+C), SIGTERM (taskkill/PID stops) and SIGHUP (console close, Unix)
  through one shutdown handler that stops `serve_forever()` and closes the
  listening socket — the port is released promptly instead of lingering until
  process GC. Verified on Git Bash: SIGTERM closes the port in ≤0.5 s.
- Note: one port per process by design — each `python server.py` instance owns
  exactly its own `--port`. Stray instances from earlier manual runs are separate
  processes (`taskkill /F /IM python.exe` clears them); this change guarantees
  *its own* port always closes when *it* stops.

## [1.6.1] - 2026-09-03

### Fixed
- **Stats bar now adapts when `python server.py` is not running** (other static
  server, `file://`, or no server): after 3 failed `/stats` probes, polling stops
  and the bar switches permanently to browser-only mode —
  - CPU: Compute Pressure levels or page-FPS proxy (no more "—" / stale spinner).
  - RAM: this tab's JS heap + device RAM.
  - GPU / VRAM: hidden entirely — a browser cannot measure them, so nothing fake
    or broken-looking is shown.
  - Each metric is still individually browser-fallback'able when the server
    answers but lacks psutil/nvidia-smi.
- `/stats` responses are shape-validated (`app` + numeric `at`), so an unrelated
  server's 404-JSON page can't be mistaken for our endpoint.
- Browser-only mode dims the stat bar slightly (visual cue) with the run
  instructions in its tooltip; hover each chip for its exact source.

## [1.6.0] - 2026-09-03

### Changed
- **Footer stats now show REAL system metrics** (CPU %, system RAM, GPU %, VRAM).
  A web page can't read these from the OS — so `server.py` now exposes a same-origin
  `GET /stats` endpoint using `psutil` (CPU/RAM) and `nvidia-smi` (GPU/VRAM), polled
  by `sysstats.js` once per second.
  - **Setup:** `pip install psutil`, then run `python server.py` (as usual).
    Optional `--port N` flag.
  - Graceful degradation: without psutil → tab-heap fallback; without nvidia-smi →
    GPU/VRAM chips show a dim "—" with the reason in the tooltip; opening the page
    without server.py (double-click) → everything falls back to the old
    browser-only proxies. `/stats` polling is excluded from server access logs.
  - New **VRAM** chip; **RAM** chip now shows system used/total (+ %) with the
    tab's JS heap moved to the tooltip.

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
