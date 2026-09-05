// test.js — runnable tests for shared chat logic (run: node test.js)
"use strict";

const assert = require("node:assert");
const {
    foldChunks,
    buildPromptContent,
    buildImportedPrompt,
    supportsMedia,
    isValidConversation,
    dequeue,
    removeQueuedItem,
    drainQueue,
} = require("./chat-logic.js");

// incremental chunks (Gemini Nano default): each chunk is a delta
assert.strictEqual(
    foldChunks(["Hel", "lo, ", "wor", "ld!"]),
    "Hello, world!"
);

// accumulated chunks: each chunk repeats everything so far
assert.strictEqual(
    foldChunks(["Hel", "Hello, ", "Hello, wor", "Hello, world!"]),
    "Hello, world!"
);

// ---- shared prompt construction and capability checks ----
const image = { type: "image", blob: { name: "image" } };
const audio = { type: "audio", blob: { name: "audio" } };
const ocrPrompt = buildPromptContent("ignored", [image], true, false);
assert.strictEqual(ocrPrompt[0].value, "Extract all text from this image. Return only the text content, nothing else.");
assert.strictEqual(ocrPrompt[1].type, "image");

const transcribePrompt = buildPromptContent("ignored", [audio], false, true);
assert.strictEqual(transcribePrompt[0].value, "Transcribe all speech from this audio. Return only the transcription, nothing else.");
assert.strictEqual(transcribePrompt[1].type, "audio");

const importedPrompt = buildImportedPrompt(
    { text: "ignored", mode: "both" },
    [image, audio]
);
assert.strictEqual(importedPrompt.role, "user");
assert.strictEqual(importedPrompt.content[0].value, "Extract all text from this image AND transcribe all speech from this audio. Return both.");
assert.deepStrictEqual(importedPrompt.content.slice(1).map(item => item.type), ["image", "audio"]);

const textOnly = { inputs: [{ type: "text" }] };
const multimodal = { inputs: [{ type: "text" }, { type: "image" }, { type: "audio" }] };
assert.strictEqual(supportsMedia(textOnly, []), true);
assert.strictEqual(supportsMedia(textOnly, [image]), false);
assert.strictEqual(supportsMedia(multimodal, [image, audio]), true);
assert.strictEqual(isValidConversation({ app: "chat-local", messages: [] }), true);
assert.strictEqual(isValidConversation({ app: "chat-local", version: 2, messages: [] }), false);
assert.strictEqual(isValidConversation({ app: "chat-local", messages: [{ role: "user", mode: "unknown" }] }), false);
assert.strictEqual(isValidConversation({ app: "chat-local", messages: [{ role: "user", media: [{ type: "video", data: "x" }] }] }), false);

// ---- export/import round-trip: payload shape ----
// Mirrors the schema in app.js exportConversation/importConversation.
const payload = {
    app: "chat-local",
    version: 1,
    exportedAt: new Date().toISOString(),
    messages: [
        {
            role: "user",
            text: "what is this?",
            mode: "ocr",
            media: [{ type: "image", name: "x.png", mime: "image/png", data: Buffer.from("png").toString("base64") }]
        },
        { role: "ai", text: "it is an image" }
    ]
};
const parsed = JSON.parse(JSON.stringify(payload));
assert.strictEqual(parsed.app, "chat-local");
assert.ok(Array.isArray(parsed.messages) && parsed.messages.length === 2);
assert.strictEqual(parsed.messages[0].media[0].data, "cG5n");
assert.deepStrictEqual(
    Buffer.from(parsed.messages[0].media[0].data, "base64").toString(),
    "png"
);

// ---- queue semantics: helpers used by app.js ----
{
    const pendingQueue = [{ id: "a" }, { id: "b" }, { id: "c" }];
    assert.strictEqual(dequeue(pendingQueue).id, "a");
    assert.strictEqual(removeQueuedItem(pendingQueue, "b").id, "b");
    assert.deepStrictEqual(pendingQueue.map(item => item.id), ["c"]);
    assert.strictEqual(removeQueuedItem(pendingQueue, "nope"), null);
    pendingQueue.push({ id: "x" }, { id: "y" });
    assert.deepStrictEqual(drainQueue(pendingQueue).map(item => item.id), ["c", "x", "y"]);
    assert.strictEqual(pendingQueue.length, 0);
}

console.log("OK: shared streaming, prompt, capability, export/import payload, and queue logic");
