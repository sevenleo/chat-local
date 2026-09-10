// test.js — runnable tests for shared chat logic (run: node test.js)
"use strict";

const assert = require("node:assert");
const {
    foldChunks,
    renderMarkdown,
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

// ---- Markdown rendering and safety ----
const markdown = renderMarkdown([
    "# Heading",
    "",
    "**bold** and *italic* with ~~strike~~",
    "",
    "- one",
    "- two",
    "",
    "1. first",
    "2. second",
    "",
    "> quoted",
    "",
    "```js",
    "const value = 1;",
    "```",
    "",
    "[link](https://example.com)",
    "",
    "<u>underlined</u>",
].join("\n"));
assert.match(markdown, /<h1>Heading<\/h1>/);
assert.match(markdown, /<strong>bold<\/strong>/);
assert.match(markdown, /<em>italic<\/em>/);
assert.match(markdown, /<del>strike<\/del>/);
assert.match(markdown, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
assert.match(markdown, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
assert.match(markdown, /<blockquote><p>quoted<\/p><\/blockquote>/);
assert.match(markdown, /<pre><code class="language-js">const value = 1;<\/code><\/pre>/);
assert.match(markdown, /<a href="https:\/\/example\.com"/);
assert.match(markdown, /<u>underlined<\/u>/);
assert.strictEqual(renderMarkdown(String.fromCharCode(92) + "*literal" + String.fromCharCode(92) + "*"), "<p>*literal*</p>");
assert.match(
    renderMarkdown(String.fromCharCode(92) + "*   " + String.fromCharCode(92) + "**literal" + String.fromCharCode(92) + "**"),
    /<ul><li><strong>literal<\/strong><\/li><\/ul>/
);
assert.match(renderMarkdown("<script>alert(1)</script>"), /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.doesNotMatch(renderMarkdown("[unsafe](javascript:alert(1))"), /href="javascript:/i);
assert.match(renderMarkdown(String.fromCharCode(92) + "033[31mred" + String.fromCharCode(92) + "033[0m"), /ansi-fg-31/);

// ---- shared prompt construction and capability checks ----
const image = { type: "image", blob: { name: "image" } };
const audio = { type: "audio", blob: { name: "audio" } };
const ocrPrompt = buildPromptContent("ignored", [image], true, false);
assert.match(ocrPrompt[0].value, /Use the extracted text together with the user's request/);
assert.match(ocrPrompt[0].value, /User request:\nignored/);
assert.strictEqual(ocrPrompt[1].type, "image");

const ocrOnlyPrompt = buildPromptContent("", [image], true, false);
assert.strictEqual(ocrOnlyPrompt[0].value, "Extract all text from this image. Return only the text content, nothing else.");
assert.strictEqual(ocrOnlyPrompt[1].type, "image");

const transcribePrompt = buildPromptContent("ignored", [audio], false, true);
assert.match(transcribePrompt[0].value, /Use the transcription together with the user's request/);
assert.match(transcribePrompt[0].value, /User request:\nignored/);
assert.strictEqual(transcribePrompt[1].type, "audio");

const bothPrompt = buildPromptContent("Summarize the findings", [image, audio], true, true);
assert.match(bothPrompt[0].value, /Use both results together with the user's request/);
assert.match(bothPrompt[0].value, /User request:\nSummarize the findings/);
assert.deepStrictEqual(bothPrompt.slice(1).map(item => item.type), ["image", "audio"]);

const imageWithTextPrompt = buildPromptContent("What does this document mean?", [image], false, false);
assert.match(imageWithTextPrompt[0].value, /Use all attached media together with the user's request/);
assert.match(imageWithTextPrompt[0].value, /User request:\nWhat does this document mean\?/);
assert.strictEqual(imageWithTextPrompt[1].type, "image");

const audioWithTextPrompt = buildPromptContent("Summarize the spoken content", [audio], false, false);
assert.match(audioWithTextPrompt[0].value, /Use all attached media together with the user's request/);
assert.match(audioWithTextPrompt[0].value, /User request:\nSummarize the spoken content/);
assert.strictEqual(audioWithTextPrompt[1].type, "audio");

const importedPrompt = buildImportedPrompt(
    { text: "ignored", mode: "both" },
    [image, audio]
);
assert.strictEqual(importedPrompt.role, "user");
assert.match(importedPrompt.content[0].value, /Use both results together with the user's request/);
assert.match(importedPrompt.content[0].value, /User request:\nignored/);
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
