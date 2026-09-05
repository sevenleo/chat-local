/* Shared pure logic for the browser app and the Node smoke tests. */
(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.ChatLocalLogic = factory();
    }
})(typeof window !== "undefined" ? window : globalThis, function () {
    "use strict";

    function foldChunk(state, chunk) {
        if (state.text && chunk.startsWith(state.text)) {
            state.text = chunk;
        } else {
            state.text += chunk;
        }
        return state.text;
    }

    function foldChunks(chunks) {
        const state = { text: "" };
        for (const chunk of chunks) foldChunk(state, chunk);
        return state.text;
    }

    function buildPromptContent(userText, files, ocr, trans) {
        const content = [];

        if (ocr && !trans) {
            content.push({ type: "text", value: "Extract all text from this image. Return only the text content, nothing else." });
        } else if (trans && !ocr) {
            content.push({ type: "text", value: "Transcribe all speech from this audio. Return only the transcription, nothing else." });
        } else if (ocr && trans) {
            content.push({ type: "text", value: "Extract all text from this image AND transcribe all speech from this audio. Return both." });
        } else {
            content.push({ type: "text", value: userText || "Describe what is in this media." });
        }

        for (const file of files) {
            content.push({ type: file.type, value: file.blob });
        }

        return content;
    }

    function supportsMedia(config, files) {
        if (!files.length) return true;
        if (!config || !Array.isArray(config.inputs)) return false;
        return files.every(file => config.inputs.some(input => input.type === file.type));
    }

    function isValidConversation(obj) {
        if (!obj || obj.app !== "chat-local" || !Array.isArray(obj.messages)) return false;
        if (obj.version !== undefined && obj.version !== 1) return false;

        return obj.messages.every(message => {
            if (!message || (message.role !== "user" && message.role !== "ai")) return false;
            if (message.text !== undefined && typeof message.text !== "string") return false;
            if (message.role === "ai") return true;
            if (message.mode !== undefined && message.mode !== null &&
                !["ocr", "transcribe", "both"].includes(message.mode)) return false;
            if (message.media !== undefined && !Array.isArray(message.media)) return false;
            return (message.media || []).every(media =>
                media &&
                (media.type === "image" || media.type === "audio") &&
                typeof media.data === "string" &&
                media.data.length > 0 &&
                (media.name === undefined || typeof media.name === "string") &&
                (media.mime === undefined || typeof media.mime === "string")
            );
        });
    }

    function dequeue(queue) {
        return queue.shift();
    }

    function removeQueuedItem(queue, id) {
        const index = queue.findIndex(item => item.id === id);
        return index === -1 ? null : queue.splice(index, 1)[0];
    }

    function drainQueue(queue) {
        return queue.splice(0, queue.length);
    }

    function buildImportedPrompt(message, media) {
        const mode = ["ocr", "transcribe", "both"].includes(message.mode)
            ? message.mode
            : null;
        return {
            role: "user",
            content: buildPromptContent(
                message.text || "",
                media,
                mode === "ocr" || mode === "both",
                mode === "transcribe" || mode === "both"
            )
        };
    }

    return {
        foldChunk,
        foldChunks,
        buildPromptContent,
        supportsMedia,
        isValidConversation,
        dequeue,
        removeQueuedItem,
        drainQueue,
        buildImportedPrompt,
    };
});
