/* =========================================================
   Local AI Chat — app.js
   Chrome Built-in AI · streaming · IIFE · no framework
   ========================================================= */

(function () {
    "use strict";

    /* ---------- State ---------- */
    let session = null;
    let controller = null;
    let generating = false;

    /* ---------- DOM refs ---------- */
    const chat              = document.getElementById("chat");
    const promptInput       = document.getElementById("prompt");
    const sendButton        = document.getElementById("send");
    const stopButton        = document.getElementById("stop");
    const statusEl          = document.getElementById("status");
    const checkModelButton  = document.getElementById("checkModel");
    const downloadModelButton = document.getElementById("downloadModel");

    /* ---------- Helpers ---------- */

    /** Set status text and its visual state class. */
    function setStatus(text, kind) {
        statusEl.textContent = text;
        statusEl.className = "status";
        if (kind) statusEl.classList.add("status--" + kind);
    }

    /** Auto-grow the textarea to fit content (capped). */
    function autoGrowTextarea() {
        promptInput.style.height = "auto";
        const newHeight = Math.min(promptInput.scrollHeight, 200);
        promptInput.style.height = newHeight + "px";
    }

    /** Render the welcome / empty-state when chat has no messages. */
    function renderWelcome() {
        chat.innerHTML = "";
        const div = document.createElement("div");
        div.className = "welcome";
        div.innerHTML =
            '<div class="welcome-icon">◆</div>' +
            "<h2>Local AI Chat</h2>" +
            "<p>Your browser&#8217;s built-in AI, right here. No API keys, no cloud — just you and Gemini Nano.</p>" +
            "<p style='margin-top:12px;font-size:13px;color:var(--text-faint)'>Check the model status above, then start typing.</p>";
        chat.appendChild(div);
    }

    /** Remove the welcome block once the first message arrives. */
    function removeWelcome() {
        const welcome = chat.querySelector(".welcome");
        if (welcome) welcome.remove();
    }

    /* ---------- Create message bubble ---------- */
    function createMessage(type, text) {
        removeWelcome();

        const message = document.createElement("div");
        message.className = "message " + type;

        const avatar = document.createElement("div");
        avatar.className = "avatar";
        avatar.textContent = type === "ai" ? "AI" : "U";

        const content = document.createElement("div");
        content.className = "content";
        content.textContent = text;

        message.appendChild(avatar);
        message.appendChild(content);
        chat.appendChild(message);

        chat.scrollTop = chat.scrollHeight;
        return content;
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

    /* ---------- Check model ---------- */
    async function checkModel() {
        try {
            setStatus("Checking model…", "idle");

            const availability = await LanguageModel.availability({
                expectedOutputs: [{ type: "text", languages: ["en"] }]
            });

            switch (availability) {
                case "available":
                    setStatus("Model ready", "ok");
                    session = await LanguageModel.create({
                        expectedOutputs: [{ type: "text", languages: ["en"] }]
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

            /*
            Creating a session triggers the model download
            if it's not yet installed.
            */
            session = await LanguageModel.create({
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
        const prompt = promptInput.value.trim();
        if (!prompt || !session || generating) return;

        generating = true;
        removeWelcome();

        createMessage("user", prompt);
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
            const stream = session.promptStreaming(prompt, {
                signal: controller.signal
            });

            let respostaCompleta = "";
            let respostaAnterior  = "";

            for await (const chunk of stream) {
                /*
                Support both incremental chunks and
                accumulated chunks.
                */
                if (respostaAnterior && chunk.startsWith(respostaAnterior)) {
                    respostaCompleta = chunk;     // accumulated: chunk holds full text so far
                } else {
                    respostaCompleta += chunk;    // incremental: chunk is only the new delta
                }
                respostaAnterior = respostaCompleta;

                /* Remove typing dots on first content */
                if (typingDots.parentNode) typingDots.remove();

                aiContent.textContent = respostaCompleta;
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

    promptInput.addEventListener("input", autoGrowTextarea);

    /* ---------- Init ---------- */
    renderWelcome();
    checkModel();

})();