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

console.log("OK: streaming chunk logic + export/import payload round-trip");
