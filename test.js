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

console.log("OK: streaming chunk logic (incremental + accumulated)");
