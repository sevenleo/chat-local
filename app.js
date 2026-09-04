/* =========================================================
   Local AI Chat — app.js
   Chrome Built-in AI · streaming · multimodal · no framework
   ========================================================= */

(function () {
    "use strict";

    /* ---------- State ---------- */
    let session = null;
    let controller = null;
    let generating = false;
    let attachedFiles = [];  // { id, type: "image"|"audio", blob, name, url }

    /* ---------- DOM refs ---------- */
    const chat                = document.getElementById("chat");
    const promptInput         = document.getElementById("prompt");
    const sendButton          = document.getElementById("send");
    const stopButton          = document.getElementById("stop");
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
                chip.innerHTML = `<img src="${f.url}" alt="">`;
            } else {
                hasAudio = true;
                chip.innerHTML = `<span class="attach-icon">🎵</span>`;
            }

            chip.innerHTML += `<span class="attach-name">${f.name}</span>`;
            chip.innerHTML += `<button class="attach-remove" data-id="${f.id}">&times;</button>`;
            chip.querySelector(".attach-remove").addEventListener("click", () => removeFile(f.id));

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

    function clearAttachments() {
        for (const f of attachedFiles) URL.revokeObjectURL(f.url);
        attachedFiles = [];
        ocrCheck.checked = false;
        transCheck.checked = false;
        renderAttachments();
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
        sendButton.disabled = !(hasText || hasFiles) || !session || generating;
    }

    /* ---------- Create message bubble ---------- */

    function createMessage(type, text) {
        removeWelcome();
        const msg = document.createElement("div");
        msg.className = "message " + type;

        const avatar = document.createElement("div");
        avatar.className = "avatar";
        avatar.textContent = type === "ai" ? "AI" : "U";

        const content = document.createElement("div");
        content.className = "content";

        msg.appendChild(avatar);
        msg.appendChild(content);
        chat.appendChild(msg);

        chat.scrollTop = chat.scrollHeight;
        return content;
    }

    /** Create a user message bubble that shows media previews + text. */
    function createUserMessage(text) {
        removeWelcome();
        const msg = document.createElement("div");
        msg.className = "message user";

        const avatar = document.createElement("div");
        avatar.className = "avatar";
        avatar.textContent = "U";

        const bubble = document.createElement("div");
        bubble.className = "content";

        // Attached media previews
        for (const f of attachedFiles) {
            if (f.type === "image") {
                const img = document.createElement("img");
                img.src = f.url;
                img.className = "msg-media";
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
        if (ocrCheck.checked) labels.push("📝 OCR");
        if (transCheck.checked) labels.push("🎙️ Transcribe");
        if (labels.length) {
            const tag = document.createElement("div");
            tag.className = "msg-badge";
            tag.textContent = "Mode: " + labels.join(" + ");
            bubble.appendChild(tag);
        }

        // Text
        if (text) {
            const t = document.createElement("div");
            t.className = "msg-text";
            t.textContent = text;
            bubble.appendChild(t);
        }

        msg.appendChild(avatar);
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

    /* ---------- Build multimodal prompt ---------- */

    function buildPromptContent(userText) {
        const content = [];

        // Build the text prompt
        const ocr = ocrCheck.checked;
        const trans = transCheck.checked;

        if (ocr && !trans) {
            // OCR-only mode — ignore user text for the instruction
            content.push({ type: "text", value: "Extract all text from this image. Return only the text content, nothing else." });
        } else if (trans && !ocr) {
            // Transcribe-only mode
            content.push({ type: "text", value: "Transcribe all speech from this audio. Return only the transcription, nothing else." });
        } else if (ocr && trans) {
            // Both — ask for both
            content.push({ type: "text", value: "Extract all text from this image AND transcribe all speech from this audio. Return both." });
        } else {
            // Normal mode — use user's text, or a default prompt if only media
            content.push({ type: "text", value: userText || "Describe what is in this media." });
        }

        // Attach files
        for (const f of attachedFiles) {
            content.push({ type: f.type, value: f.blob });
        }

        return content;
    }

    /* ---------- Check model ---------- */
    async function checkModel() {
        try {
            setStatus("Checking model…", "idle");

            const availability = await LanguageModel.availability({
                expectedInputs: [
                    { type: "text", languages: ["en"] },
                    { type: "image" },
                    { type: "audio" },
                ],
                expectedOutputs: [{ type: "text", languages: ["en"] }],
            });

            switch (availability) {
                case "available":
                    setStatus("Model ready", "ok");
                    session = await LanguageModel.create({
                        expectedInputs: [
                            { type: "text", languages: ["en"] },
                            { type: "image" },
                            { type: "audio" },
                        ],
                        expectedOutputs: [{ type: "text", languages: ["en"] }],
                    });
                    sendButton.disabled = false;
                    downloadModelButton.disabled = true;
                    break;

                case "downloadable":
                    setStatus("Model not installed", "warn");
                    downloadModelButton.disabled = false;
                    sendButton.disabled = true;
                    break;

                case "downloading":
                    setStatus("Download is in progress", "warn");
                    downloadModelButton.disabled = true;
                    sendButton.disabled = true;
                    break;

                case "unavailable":
                    setStatus("Model unavailable", "err");
                    sendButton.disabled = true;
                    break;

                default:
                    setStatus(availability, "idle");
            }
        } catch (error) {
            console.error(error);
            setStatus("Error checking model", "err");
        }
    }

    /* ---------- Download model ---------- */
    async function downloadModel() {
        try {
            downloadModelButton.disabled = true;
            checkModelButton.disabled = true;

            setStatus("Starting download…", "warn");

            session = await LanguageModel.create({
                expectedInputs: [
                    { type: "text", languages: ["en"] },
                    { type: "image" },
                    { type: "audio" },
                ],
                expectedOutputs: [{ type: "text", languages: ["en"] }],
                monitor(monitor) {
                    monitor.addEventListener("downloadprogress", event => {
                        const percent = Math.round(event.loaded * 100 / event.total);
                        setStatus("Downloading model: " + percent + "%", "warn");
                    });
                }
            });

            setStatus("Model ready", "ok");
            sendButton.disabled = false;
            console.log("Model downloaded:", session);
        } catch (error) {
            console.error(error);
            setStatus("Download error", "err");
        } finally {
            downloadModelButton.disabled = false;
            checkModelButton.disabled = false;
        }
    }

    /* ---------- Send message ---------- */
    async function sendMessage() {
        const userText = promptInput.value.trim();
        const hasFiles = attachedFiles.length > 0;
        if (!userText && !hasFiles) return;
        if (!session || generating) return;

        generating = true;
        removeWelcome();

        // Render user message with media previews
        createUserMessage(userText);

        // Clear input
        promptInput.value = "";
        promptInput.style.height = "auto";
        promptInput.disabled = true;
        sendButton.disabled = true;
        stopButton.style.display = "block";
        setStatus("Thinking…", "idle");

        const aiContent = createMessage("ai", "");
        const typingDots = showTyping(aiContent);

        controller = new AbortController();

        try {
            // Build the multimodal prompt array
            const promptContent = buildPromptContent(userText);
            // Clear attachments from UI now that they're in the prompt
            clearAttachments();

            const stream = session.promptStreaming(
                [{ role: "user", content: promptContent }],
                { signal: controller.signal }
            );

            let completa = "";
            let anterior = "";

            for await (const chunk of stream) {
                if (anterior && chunk.startsWith(anterior)) {
                    completa = chunk;
                } else {
                    completa += chunk;
                }
                anterior = completa;

                if (typingDots.parentNode) typingDots.remove();
                aiContent.textContent = completa;
                chat.scrollTop = chat.scrollHeight;
            }

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
            attachedFiles = [];    // already cleared above, but safety
            controller = null;
            generating = false;
            promptInput.disabled = false;
            sendButton.disabled = false;
            stopButton.style.display = "none";
            promptInput.focus();
        }
    }

    /* ---------- Stop ---------- */
    function stopGeneration() {
        if (controller) controller.abort();
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
    checkModelButton.addEventListener("click", checkModel);
    downloadModelButton.addEventListener("click", downloadModel);

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
    renderWelcome();
    checkModel();

})();