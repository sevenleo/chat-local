/* =========================================================
   Local AI Chat — app.js
   Chrome Built-in AI · streaming · multimodal · no framework
   ========================================================= */

(function () {
    "use strict";

    const {
        foldChunk,
        buildPromptContent,
        supportsMedia,
        isValidConversation,
        dequeue,
        removeQueuedItem,
        drainQueue,
        buildImportedPrompt,
    } = window.ChatLocalLogic;

    /* ---------- State ---------- */
    let session = null;
    let controller = null;
    let generating = false;
    let importing = false;
    let attachedFiles = [];  // { id, type: "image"|"audio", blob, name, url }
    const pendingQueue = []; // { id, text, mode, ocr, trans, files, entry, bubbleEl }

    /*
    Source of truth for the conversation. Each entry:
      user → { role:"user", text, mode, media:[{type,blob,name,url}] }
      ai   → { role:"ai", text }
    Blobs stay live (no base64) until export serializes them.
    */
    const transcript = [];

    /* ---------- DOM refs ---------- */
    const chat                = document.getElementById("chat");
    const promptInput         = document.getElementById("prompt");
    const sendButton          = document.getElementById("send");
    const stopButton          = document.getElementById("stop");
    const clearQueueBtn       = document.getElementById("clearQueue");
    const statusEl            = document.getElementById("status");
    const checkModelButton    = document.getElementById("checkModel");
    const downloadModelButton = document.getElementById("downloadModel");

    const imageBtn      = document.getElementById("imageBtn");
    const audioBtn      = document.getElementById("audioBtn");
    const imageInput    = document.getElementById("imageInput");
    const audioInput    = document.getElementById("audioInput");
    const attachmentsEl = document.getElementById("attachments");
    const ocrCheck      = document.getElementById("ocrOnly");
    const transCheck    = document.getElementById("transcribeOnly");
    const ocrToggle     = document.getElementById("ocrToggle");
    const transToggle   = document.getElementById("transToggle");

    const exportBtn     = document.getElementById("exportBtn");
    const importBtn     = document.getElementById("importBtn");
    const importInput   = document.getElementById("importInput");

    /* ---------- Helpers ---------- */

    function setStatus(text, kind) {
        statusEl.textContent = text;
        statusEl.className = "status";
        if (kind) statusEl.classList.add("status--" + kind);
    }

    function autoGrowTextarea() {
        promptInput.style.height = "auto";
        const newHeight = Math.min(promptInput.scrollHeight, 200);
        promptInput.style.height = newHeight + "px";
    }

    function renderWelcome() {
        chat.innerHTML = "";
        transcript.length = 0;
        exportBtn.disabled = true;
        const div = document.createElement("div");
        div.className = "welcome";
        div.innerHTML =
            '<div class="welcome-icon">◆</div>' +
            "<h2>Local AI Chat</h2>" +
            "<p>Your browser&#8217;s built-in AI, right here. No API keys, no cloud — just you and Gemini Nano.</p>" +
            "<p style='margin-top:12px;font-size:13px;color:var(--text-faint)'>Attach images or audio, type a message, and go.</p>";
        chat.appendChild(div);
    }

    function removeWelcome() {
        const w = chat.querySelector(".welcome");
        if (w) w.remove();
    }

    /* ---------- Attachments ---------- */

    function renderAttachments() {
        if (attachedFiles.length === 0) {
            attachmentsEl.hidden = true;
            ocrToggle.hidden = true;
            transToggle.hidden = true;
            return;
        }

        attachmentsEl.hidden = false;
        attachmentsEl.innerHTML = "";

        let hasImage = false;
        let hasAudio = false;

        for (const f of attachedFiles) {
            const chip = document.createElement("div");
            chip.className = "attach-chip";

            if (f.type === "image") {
                hasImage = true;
                const image = document.createElement("img");
                image.src = f.url;
                image.alt = f.name;
                chip.appendChild(image);
            } else {
                hasAudio = true;
                const icon = document.createElement("span");
                icon.className = "attach-icon";
                icon.textContent = "🎵";
                chip.appendChild(icon);
            }

            const name = document.createElement("span");
            name.className = "attach-name";
            name.textContent = f.name;
            chip.appendChild(name);

            const remove = document.createElement("button");
            remove.className = "attach-remove";
            remove.type = "button";
            remove.textContent = "×";
            remove.title = "Remove attachment";
            remove.setAttribute("aria-label", "Remove attachment " + f.name);
            remove.addEventListener("click", () => removeFile(f.id));
            chip.appendChild(remove);

            attachmentsEl.appendChild(chip);
        }

        // Show OCR toggle only when images are attached, Transcribe only when audio
        ocrToggle.hidden = !hasImage;
        transToggle.hidden = !hasAudio;
    }

    function removeFile(id) {
        const f = attachedFiles.find(x => x.id === id);
        if (f) URL.revokeObjectURL(f.url);
        attachedFiles = attachedFiles.filter(x => x.id !== id);
        renderAttachments();
        // Re-check if send should be enabled
        updateSendButton();
    }

    function clearAttachments(revokeUrls = true) {
        if (revokeUrls) {
            for (const f of attachedFiles) URL.revokeObjectURL(f.url);
        }
        attachedFiles = [];
        ocrCheck.checked = false;
        transCheck.checked = false;
        renderAttachments();
    }

    function releaseMedia(entries) {
        const urls = new Set();
        for (const entry of entries) {
            if (entry.role !== "user") continue;
            for (const media of entry.media || []) {
                if (media.url) urls.add(media.url);
            }
        }
        for (const url of urls) URL.revokeObjectURL(url);
    }

    function addFiles(fileList, type) {
        for (const file of fileList) {
            attachedFiles.push({
                id: crypto.randomUUID(),
                type,
                blob: file,
                name: file.name,
                url: URL.createObjectURL(file),
            });
        }
        renderAttachments();
        updateSendButton();
    }

    function updateSendButton() {
        const hasText = promptInput.value.trim().length > 0;
        const hasFiles = attachedFiles.length > 0;
        sendButton.disabled = !(hasText || hasFiles) || !session;
        sendButton.textContent = generating ? "Queue" : "Send";
    }

    function mediaUnavailable() {
        setStatus("Media unavailable in text-only mode", "warn");
    }

    /* Sync everything that reflects the queue: Clear-queue visibility,
       Stop/Skip label, and the "(n queued)" counter in the status line. */
    function updateQueueUI() {
        clearQueueBtn.hidden = pendingQueue.length === 0;
        if (generating) {
            const hasQueue = pendingQueue.length > 0;
            stopButton.textContent = hasQueue ? "Skip ⏭" : "Stop";
            stopButton.title = hasQueue ? "Stop current and start next" : "Stop generation";
            setStatus(hasQueue ? "Thinking… (" + pendingQueue.length + " queued)" : "Thinking…", "idle");
        }
    }

    /* ---------- Create message bubble ---------- */

    function createMessage(type, text) {
        removeWelcome();
        const msg = document.createElement("div");
        msg.className = "message " + type;

        const content = document.createElement("div");
        content.className = "content";
        if (text) content.textContent = text;

        msg.appendChild(content);
        chat.appendChild(msg);

        chat.scrollTop = chat.scrollHeight;
        return content;
    }

    /**
     * Create a user bubble from a transcript entry.
     * entry: { text, mode: "ocr"|"transcribe"|"both"|null, media: [{type,name,url}] }
     * Both the send path and the import path build entries — one renderer.
     */
    function createUserMessage(entry) {
        removeWelcome();
        const msg = document.createElement("div");
        msg.className = "message user";

        const bubble = document.createElement("div");
        bubble.className = "content";

        // Attached media previews
        for (const f of entry.media) {
            if (f.type === "image") {
                const img = document.createElement("img");
                img.src = f.url;
                img.className = "msg-media";
                img.alt = f.name;
                bubble.appendChild(img);
            } else {
                const tag = document.createElement("div");
                tag.className = "msg-audio-tag";
                tag.textContent = "🎵 " + f.name;
                bubble.appendChild(tag);
            }
        }

        // Labels for OCR / Transcribe
        const labels = [];
        if (entry.mode === "ocr" || entry.mode === "both") labels.push("📝 OCR");
        if (entry.mode === "transcribe" || entry.mode === "both") labels.push("🎙️ Transcribe");
        if (labels.length) {
            const tag = document.createElement("div");
            tag.className = "msg-badge";
            tag.textContent = "Mode: " + labels.join(" + ");
            bubble.appendChild(tag);
        }

        // Text
        if (entry.text) {
            const t = document.createElement("div");
            t.className = "msg-text";
            t.textContent = entry.text;
            bubble.appendChild(t);
        }

        msg.appendChild(bubble);
        chat.appendChild(msg);
        chat.scrollTop = chat.scrollHeight;
        return msg;
    }

    /* ---------- Typing indicator ---------- */
    function showTyping(container) {
        const dots = document.createElement("div");
        dots.className = "typing";
        dots.innerHTML = "<span></span><span></span><span></span>";
        container.appendChild(dots);
        chat.scrollTop = chat.scrollHeight;
        return dots;
    }

    /** Sticky auto-scroll: follow the stream unless the user scrolled up. */
    function autoScroll() {
        const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 120;
        if (nearBottom) chat.scrollTop = chat.scrollHeight;
    }

    /* ---------- Model namespace resolution (Chrome / Edge / other Chromium) ---------- */

    /*
    Resolves the Prompt API namespace across browsers/builds:
      Chrome (newer):  LanguageModel
      Chrome/Edge (older origin trials): window.ai.languageModel
    Everything below goes through `LanguageModel` — a local alias set once at
    init — so the rest of the file doesn't care which spelling won.
    */
    let LanguageModel = null;

    function resolveLanguageModel() {
        const candidates = [
            window.LanguageModel,
            window.ai && window.ai.languageModel,
        ];
        for (const ns of candidates) {
            if (ns && typeof ns.availability === "function") return ns;
        }
        return null;
    }

    /* ---------- Check model ---------- */

    /*
    Cross-browser model config. Chrome/Edge builds differ in which modalities
    the built-in model accepts, so we probe configs from richest to plainest:
    the first config availability() accepts becomes the session config.
    */
    const MODEL_CONFIGS = [
        {   // full multimodal
            label: "text + image + audio",
            inputs: [
                { type: "text", languages: ["en"] },
                { type: "image" },
                { type: "audio" },
            ],
        },
        {   // text + image (many builds)
            label: "text + image",
            inputs: [
                { type: "text", languages: ["en"] },
                { type: "image" },
            ],
        },
        {   // text only — the universal floor
            label: "text only",
            inputs: [
                { type: "text", languages: ["en"] },
            ],
        },
    ];

    let activeConfig = null;   // winning entry from MODEL_CONFIGS

    function applyConfigToUI() {
        const allowImage = activeConfig && activeConfig.inputs.some(i => i.type === "image");
        const allowAudio = activeConfig && activeConfig.inputs.some(i => i.type === "audio");
        imageBtn.style.display = allowImage ? "" : "none";
        audioBtn.style.display = allowAudio ? "" : "none";
    }

    function sessionOptions(config, extra) {
        return Object.assign({
            expectedInputs: config.inputs,
            expectedOutputs: [{ type: "text", languages: ["en"] }],
        }, extra || {});
    }

    /*
    Create a session with progressive fallback: try the active config, then
    every smaller one. Edge builds can pass availability() yet still throw
    NotSupportedError at create() ("device is unable to create session") when
    hardware gates (NPU/VRAM/disk) block the requested modality stack — a
    smaller config may still create fine.
    */
    async function createSession(extra) {
        /* Walk configs richest → plainest (MODEL_CONFIGS order); availability()
           lies on Edge builds (hardware gates apply at create() time), so a
           create() failure just means "try the next, smaller one". */
        const attempts = [];

        const previousConfig = activeConfig;

        for (const config of MODEL_CONFIGS) {
            try {
                const session = await LanguageModel.create(sessionOptions(config, extra));
                activeConfig = config;      // remember what actually works
                applyConfigToUI();
                return session;
            } catch (error) {
                attempts.push(config.label + ": " + error.message);
            }
        }
        /* all configs failed — only now is it worth the noise */
        activeConfig = previousConfig;
        applyConfigToUI();
        console.error("create() failed for all configs —\n  " + attempts.join("\n  "));
        throw new Error("No session config could be created");
    }

    async function pickConfig() {
        // Most builds answer "unavailable" rather than throwing for modalities
        // they lack; availability() returning something non-error wins in order.
        for (const config of MODEL_CONFIGS) {
            try {
                const availability = await LanguageModel.availability(sessionOptions(config));
                if (availability !== "unavailable") return config;
            } catch (e) {
                /* this spelling/config rejected — try the next, smaller one */
            }
        }
        return null;
    }

    async function checkModel() {
        if (generating || pendingQueue.length || importing) return;
        checkModelButton.disabled = true;
        try {
            setStatus("Checking model…", "idle");

            const availability = await LanguageModel.availability(sessionOptions(activeConfig || MODEL_CONFIGS[MODEL_CONFIGS.length - 1]));

            switch (availability) {
                case "available":
                    if (!session) session = await createSession();
                    setStatus("Model ready (" + activeConfig.label + ")", "ok");
                    updateSendButton();
                    downloadModelButton.disabled = true;
                    break;

                case "downloadable":
                    setStatus("Model not installed", "warn");
                    downloadModelButton.disabled = false;
                    updateSendButton();
                    break;

                case "downloading":
                    setStatus("Download is in progress", "warn");
                    downloadModelButton.disabled = true;
                    updateSendButton();
                    break;

                case "unavailable":
                    setStatus("Model unavailable in this browser", "err");
                    updateSendButton();
                    console.warn(
                        "availability() = unavailable. Edge: needs edge://flags/#prompt-api-for-extensions " +
                        "(Canary/Dev) or Copilot+ hardware; Chrome: chrome://flags/#prompt-api-for-gemini-nano."
                    );
                    break;

                default:
                    setStatus(availability, "idle");
            }
        } catch (error) {
            console.error(error);
            setStatus("Error checking model", "err");
        } finally {
            checkModelButton.disabled = false;
        }
    }

    /* ---------- Download model ---------- */
    async function downloadModel() {
        if (session || generating || pendingQueue.length || importing) return;
        try {
            downloadModelButton.disabled = true;
            checkModelButton.disabled = true;

            setStatus("Starting download…", "warn");

            session = await createSession({
                monitor(monitor) {
                    monitor.addEventListener("downloadprogress", event => {
                        const percent = Math.round(event.loaded * 100 / event.total);
                        setStatus("Downloading model: " + percent + "%", "warn");
                    });
                }
            });

            setStatus("Model ready (" + activeConfig.label + ")", "ok");
            updateSendButton();
            console.log("Model downloaded:", session);
        } catch (error) {
            console.error(error);
            setStatus("Download error — device cannot run the model", "err");
        } finally {
            downloadModelButton.disabled = Boolean(session);
            checkModelButton.disabled = false;
        }
    }

    /* ---------- Message queue ---------- */

    function markQueued(item) {
        item.bubbleEl.classList.add("queued");
        const bubble = item.bubbleEl.querySelector(".content");
        const row = document.createElement("div");
        row.className = "queue-tag";

        const badge = document.createElement("span");
        badge.className = "queue-badge";
        badge.textContent = "⏳ queued";
        row.appendChild(badge);

        const cancel = document.createElement("button");
        cancel.className = "queue-cancel";
        cancel.textContent = "✕";
        cancel.title = "Cancel this queued message";
        cancel.setAttribute("aria-label", "Cancel this queued message");
        cancel.addEventListener("click", () => cancelQueued(item.id));
        row.appendChild(cancel);

        bubble.appendChild(row);
    }

    function cancelQueued(id) {
        const item = removeQueuedItem(pendingQueue, id);
        if (!item) return;
        for (const f of item.files) URL.revokeObjectURL(f.url);
        item.bubbleEl.remove();
        updateQueueUI();
    }

    function clearQueue() {
        for (const item of drainQueue(pendingQueue)) {
            for (const f of item.files) URL.revokeObjectURL(f.url);
            item.bubbleEl.remove();
        }
        updateQueueUI();
    }

    /* ---------- Send message ---------- */

    /*
    Capture input → render the user bubble immediately → enqueue. The
    transcript and the model only see the item when runQueue() picks it,
    so export order always matches what was actually asked.
    */
    function sendMessage() {
        const userText = promptInput.value.trim();
        const hasFiles = attachedFiles.length > 0;
        if (!userText && !hasFiles) return;
        if (!session) return;
        if (hasFiles && !supportsMedia(activeConfig, attachedFiles)) {
            mediaUnavailable();
            return;
        }

        removeWelcome();

        // Capture everything now — checkboxes/inputs reset before a queued
        // item ever reaches the model.
        const ocr = ocrCheck.checked;
        const trans = transCheck.checked;
        const mode = ocr && trans ? "both" : ocr ? "ocr" : trans ? "transcribe" : null;
        const files = attachedFiles.slice();
        const entry = { role: "user", text: userText, mode, media: files };

        const item = {
            id: crypto.randomUUID(),
            text: userText, mode, ocr, trans, files, entry,
            bubbleEl: createUserMessage(entry),
        };

        // Clear the composer for the next message right away
        promptInput.value = "";
        promptInput.style.height = "auto";
        // The message entry now owns these URLs until the conversation is released.
        clearAttachments(false);
        updateSendButton();

        pendingQueue.push(item);
        if (generating) {
            markQueued(item);
            updateQueueUI();
        } else {
            runQueue();
        }
    }

    async function runQueue() {
        if (generating) return;

        while (pendingQueue.length) {
            const item = dequeue(pendingQueue);
            // No longer queued: drop badge/cancel, join the transcript
            item.bubbleEl.classList.remove("queued");
            const tag = item.bubbleEl.querySelector(".queue-tag");
            if (tag) tag.remove();
            transcript.push(item.entry);
            exportBtn.disabled = false;
            updateQueueUI();

            await runGeneration(item);
        }
    }

    async function runGeneration(item) {
        generating = true;
        stopButton.style.display = "block";
        updateSendButton();
        updateQueueUI();   // sets "Thinking… (n queued)"

        const aiContent = createMessage("ai", "");
        const typingDots = showTyping(aiContent);

        controller = new AbortController();

        try {
            if (item.files.length && !supportsMedia(activeConfig, item.files)) {
                mediaUnavailable();
                aiContent.textContent = "Message not sent: this session accepts text only.";
                return;
            }

            // Build the multimodal prompt array; a text-only model gets a
            // plain string prompt (media can't be attached in that mode).
            let promptArg = item.text;
            if (item.files.length) {
                promptArg = [{ role: "user", content: buildPromptContent(item.text, item.files, item.ocr, item.trans) }];
            }

            const stream = session.promptStreaming(
                promptArg,
                { signal: controller.signal }
            );

            const foldState = { text: "" };

            aiContent.classList.add("streaming");

            for await (const chunk of stream) {
                const completa = foldChunk(foldState, chunk);

                if (typingDots.parentNode) typingDots.remove();
                aiContent.textContent = completa;
                autoScroll();
            }

            aiContent.classList.remove("streaming");
            setStatus("Model ready", "ok");
        } catch (error) {
            console.error("Generation error:", error);

            if (error.name === "AbortError") {
                aiContent.textContent += "\n\n[Generation stopped]";
                setStatus("Generation cancelled", "idle");
            } else {
                aiContent.textContent = "Error: " + error.message;
                setStatus("Generation error", "err");
            }
        } finally {
            if (typingDots.parentNode) typingDots.remove();

            // Record the AI turn (full, partial on stop, or error text)
            transcript.push({ role: "ai", text: aiContent.textContent });
            exportBtn.disabled = false;

            controller = null;
            generating = false;
            stopButton.style.display = "none";
            stopButton.textContent = "Stop";
            updateSendButton();
            // With a queue pending, runQueue() starts the next item right away
            if (!pendingQueue.length) promptInput.focus();
        }
    }

    /* ---------- Stop ---------- */
    function stopGeneration() {
        if (controller) controller.abort();
    }

    /* ---------- Export / Import conversation ---------- */

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    }

    async function dataUrlToBlob(dataUrl) {
        const res = await fetch(dataUrl);
        return res.blob();
    }

    async function stageConversation(obj) {
        const entries = [];
        const urls = new Set();
        const initialPrompts = [{
            role: "system",
            content: "You are a helpful assistant. Continue the conversation below naturally."
        }];

        try {
            for (const msg of obj.messages) {
                if (msg.role === "user") {
                    const entry = { role: "user", text: msg.text || "", mode: msg.mode || null, media: [] };
                    entries.push(entry);

                    for (const imported of (msg.media || [])) {
                        const mime = imported.mime || "application/octet-stream";
                        const blob = await dataUrlToBlob("data:" + mime + ";base64," + imported.data);
                        const media = {
                            type: imported.type,
                            blob,
                            name: imported.name || "file",
                            url: URL.createObjectURL(blob),
                        };
                        entry.media.push(media);
                        urls.add(media.url);
                    }

                    initialPrompts.push(buildImportedPrompt(entry, entry.media));
                } else {
                    const text = msg.text || "";
                    entries.push({ role: "ai", text });
                    initialPrompts.push({ role: "assistant", content: text });
                }
            }

            return { entries, initialPrompts, urls };
        } catch (error) {
            for (const url of urls) URL.revokeObjectURL(url);
            throw error;
        }
    }

    function timestampSlug() {
        const d = new Date();
        const p = n => String(n).padStart(2, "0");
        return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
               "-" + p(d.getHours()) + p(d.getMinutes());
    }

    async function exportConversation() {
        if (transcript.length === 0) return;

        try {
            const messages = [];
            for (const entry of transcript) {
                if (entry.role === "user") {
                    const media = [];
                    for (const f of entry.media) {
                        const dataUrl = await blobToDataUrl(f.blob);
                        media.push({
                            type: f.type,
                            name: f.name,
                            mime: f.blob.type,
                            data: dataUrl.split(",")[1]   // strip "data:...;base64,"
                        });
                    }
                    messages.push({ role: "user", text: entry.text, mode: entry.mode, media });
                } else {
                    messages.push({ role: "ai", text: entry.text });
                }
            }

            const payload = {
                app: "chat-local",
                version: 1,
                exportedAt: new Date().toISOString(),
                messages
            };

            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "chat-local-" + timestampSlug() + ".json";
            a.click();
            URL.revokeObjectURL(url);

            setStatus("Conversation exported", "ok");
        } catch (error) {
            console.error("Export error:", error);
            setStatus("Export error", "err");
        }
    }

    async function importConversation(file) {
        if (generating || pendingQueue.length || importing) return;
        importing = true;
        importBtn.disabled = true;

        let staged = null;
        let committed = false;
        try {
            let obj;
            try {
                obj = JSON.parse(await file.text());
            } catch (error) {
                console.error(error);
                setStatus("Invalid conversation file", "err");
                return;
            }

            if (!isValidConversation(obj)) {
                setStatus("Invalid conversation file", "err");
                return;
            }

            staged = await stageConversation(obj);

            let importedSession;
            let contextRestored = true;
            try {
                importedSession = await createSession({ initialPrompts: staged.initialPrompts });
            } catch (contextError) {
                console.warn("initialPrompts rejected, starting fresh session:", contextError);
                contextRestored = false;
                importedSession = await createSession();
            }

            releaseMedia(transcript);
            session = importedSession;
            chat.innerHTML = "";
            transcript.length = 0;
            transcript.push(...staged.entries);
            // Ownership moved to the new transcript; keep these URLs even if
            // a later DOM operation fails while rendering the imported view.
            committed = true;
            clearAttachments();

            for (const entry of transcript) {
                if (entry.role === "user") createUserMessage(entry);
                else createMessage("ai", entry.text);
            }

            exportBtn.disabled = transcript.length === 0;
            chat.scrollTop = chat.scrollHeight;
            setStatus(
                contextRestored ? "Conversation imported — context restored" : "Conversation imported (context not kept)",
                contextRestored ? "ok" : "warn"
            );
            updateSendButton();
            promptInput.focus();
        } catch (error) {
            console.error("Import error:", error);
            setStatus("Import error", "err");
        } finally {
            if (!committed && staged) {
                for (const url of staged.urls) URL.revokeObjectURL(url);
            }
            importing = false;
            importBtn.disabled = false;
        }
    }

    /* ---------- File picker triggers ---------- */
    imageBtn.addEventListener("click", () => imageInput.click());
    audioBtn.addEventListener("click", () => audioInput.click());

    imageInput.addEventListener("change", () => {
        if (imageInput.files.length) addFiles(imageInput.files, "image");
        imageInput.value = "";
    });

    audioInput.addEventListener("change", () => {
        if (audioInput.files.length) addFiles(audioInput.files, "audio");
        audioInput.value = "";
    });

    /* ---------- Paste image from clipboard ---------- */
    document.addEventListener("paste", event => {
        const items = event.clipboardData && event.clipboardData.items;
        if (!items) return;

        const images = [];
        for (const item of items) {
            if (item.kind === "file" && item.type.startsWith("image/")) {
                const file = item.getAsFile();
                if (file) {
                    /* Clipboard screenshots have no real name — give one. */
                    const named = file.name
                        ? file
                        : new File([file], "pasted-image-" +
                          new Date().toISOString().slice(11, 19).replace(/:/g, "") +
                          "." + (file.type.split("/")[1] || "png"), { type: file.type });
                    images.push(named);
                }
            }
        }

        if (images.length) {
            event.preventDefault();   // don't paste binary junk into the textarea
            addFiles(images, "image");
        }
    });

    /* ---------- Drag & drop images/audio ---------- */
    let dragCounter = 0;

    function hasMediaFiles(event) {
        if (!event.dataTransfer) return false;
        const types = event.dataTransfer.types;
        return types && Array.from(types).includes("Files");
    }

    function setDropActive(active) {
        document.body.classList.toggle("dropping", active);
    }

    /* Counter-based enter/leave: dragover fires for child elements too. */
    document.addEventListener("dragenter", event => {
        if (!hasMediaFiles(event)) return;
        event.preventDefault();
        dragCounter++;
        setDropActive(true);
    });

    document.addEventListener("dragover", event => {
        if (!hasMediaFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
    });

    document.addEventListener("dragleave", event => {
        if (!hasMediaFiles(event)) return;
        dragCounter = Math.max(0, dragCounter - 1);
        if (dragCounter === 0) setDropActive(false);
    });

    document.addEventListener("drop", event => {
        if (!hasMediaFiles(event)) return;
        event.preventDefault();
        dragCounter = 0;
        setDropActive(false);

        const images = [];
        const audios = [];
        for (const file of event.dataTransfer.files) {
            if (file.type.startsWith("image/")) images.push(file);
            else if (file.type.startsWith("audio/")) audios.push(file);
        }

        if (images.length) addFiles(images, "image");
        if (audios.length) addFiles(audios, "audio");
    });

    /* ---------- Events ---------- */
    sendButton.addEventListener("click", sendMessage);
    stopButton.addEventListener("click", stopGeneration);
    clearQueueBtn.addEventListener("click", clearQueue);
    checkModelButton.addEventListener("click", checkModel);
    downloadModelButton.addEventListener("click", downloadModel);
    exportBtn.addEventListener("click", exportConversation);
    importBtn.addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", () => {
        if (importInput.files.length) importConversation(importInput.files[0]);
        importInput.value = "";
    });

    promptInput.addEventListener("keydown", event => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    promptInput.addEventListener("input", () => {
        autoGrowTextarea();
        updateSendButton();
    });

    /* ---------- Init ---------- */
    async function init() {
        renderWelcome();

        LanguageModel = resolveLanguageModel();
        if (!LanguageModel) {
            setStatus("Built-in AI not available in this browser", "err");
            downloadModelButton.disabled = true;
            sendButton.disabled = true;
            console.error(
                "No Prompt API found (tried: LanguageModel, window.ai.languageModel). " +
                "Needs Chrome 138+ or Edge with Copilot+ features enabled."
            );
            return;
        }

        // pick the richest input config this browser/model actually accepts
        activeConfig = await pickConfig();
        applyConfigToUI();
        checkModel();
    }

    init();

})();
