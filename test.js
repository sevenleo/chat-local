// test.js — one runnable test for the streaming chunk-fold logic (run: node test.js)
// ponytail: mirrors the inline logic in app.js sendMessage() — keep in sync
"use strict";

const assert = require("node:assert");

function fold(chunks) {
    let completa = "";
    let anterior = "";
    for (const chunk of chunks) {
        if (anterior && chunk.startsWith(anterior)) {
            completa = chunk;   // accumulated: chunk holds full text so far
        } else {
            completa += chunk;  // incremental: chunk is only the new delta
        }
        anterior = completa;
    }
    return completa;
}

// incremental chunks (Gemini Nano default): each chunk is a delta
assert.strictEqual(
    fold(["Hel", "lo, ", "wor", "ld!"]),
    "Hello, world!"
);

// accumulated chunks: each chunk repeats everything so far
assert.strictEqual(
    fold(["Hel", "Hello, ", "Hello, wor", "Hello, world!"]),
    "Hello, world!"
);

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

// ---- queue semantics: FIFO order, cancel-by-id, clear ----
// Mirrors the pendingQueue logic in app.js (send/runQueue/cancelQueued/clearQueue).
{
    const pendingQueue = [];
    const pushed = [];   // transcript order (what the model actually saw)
    const removed = [];  // bubbles removed from the "DOM"

    function enqueue(id, generating) {
        pendingQueue.push({ id });
        return generating ? "queued" : "run";
    }
    function cancelQueued(id) {
        const idx = pendingQueue.findIndex(i => i.id === id);
        if (idx === -1) return;
        const [item] = pendingQueue.splice(idx, 1);
        removed.push(item.id);
    }
    function clearQueue() {
        while (pendingQueue.length) cancelQueued(pendingQueue[0].id);
    }
    function runQueue() {
        while (pendingQueue.length) pushed.push(pendingQueue.shift().id);
    }

    // send while generating → queued; FIFO preserved
    assert.strictEqual(enqueue("a", true), "queued");
    assert.strictEqual(enqueue("b", true), "queued");
    // cancel the middle one of three
    enqueue("c", true);
    cancelQueued("b");
    assert.deepStrictEqual(pendingQueue.map(i => i.id), ["a", "c"]);
    // cancelled item never reaches the transcript
    runQueue();
    assert.deepStrictEqual(pushed, ["a", "c"]);

    // clear all
    enqueue("x", true); enqueue("y", true);
    clearQueue();
    assert.strictEqual(pendingQueue.length, 0);
    assert.deepStrictEqual(removed, ["b", "x", "y"]);

    // cancel on empty queue is a no-op
    cancelQueued("nope");
}

console.log("OK: streaming chunk logic + export/import payload round-trip + queue semantics");
