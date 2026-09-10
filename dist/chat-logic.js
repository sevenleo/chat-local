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

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function safeUrl(value, image) {
        const url = String(value).trim().replace(/[\u0000-\u001f\u007f]/g, "");
        if (/^(https?:\/\/|mailto:|[\/#?])/i.test(url)) {
            if (!image || /^(https?:\/\/|\/)/i.test(url)) return url;
        }
        if (image && /^data:image\/(?:gif|jpe?g|png|webp);base64,/i.test(url)) return url;
        return null;
    }

    function renderInline(value) {
        let text = String(value ?? "");
        const tokens = [];
        const hold = html => {
            const token = "\u0000" + tokens.length + "\u0000";
            tokens.push(html);
            return token;
        };

        // ANSI is harmlessly mapped to local CSS classes instead of being emitted as HTML.
        text = text.replace(/\\(?:0*33|x1b|u001b)\[([0-9;]*)m/gi, "\u001b[$1m");
        let ansiOpen = false;
        text = text.replace(/\u001b\[([0-9;]*)m/g, (_, rawCodes) => {
            const codes = rawCodes ? rawCodes.split(";").map(Number) : [0];
            if (codes.includes(0)) {
                if (!ansiOpen) return "";
                ansiOpen = false;
                return hold("</span>");
            }

            const classes = [];
            if (codes.includes(1)) classes.push("ansi-bold");
            const foreground = codes.find(code => (code >= 30 && code <= 37) || (code >= 90 && code <= 97));
            const background = codes.find(code => (code >= 40 && code <= 47) || (code >= 100 && code <= 107));
            if (foreground !== undefined) classes.push("ansi-fg-" + foreground);
            if (background !== undefined) classes.push("ansi-bg-" + background);
            if (!classes.length) return "";
            if (ansiOpen) {
                ansiOpen = false;
                // The old span is closed before opening a new ANSI style.
                return hold("</span>") + hold('<span class="' + classes.join(" ") + '">');
            }
            ansiOpen = true;
            return hold('<span class="' + classes.join(" ") + '">');
        });
        if (ansiOpen) text += hold("</span>");

        // An escaped backtick must not become a code-span delimiter.
        text = text.replace(/\\`/g, () => hold("`"));

        // Protect code spans before parsing links/emphasis. Their contents stay literal.
        text = text.replace(/(`+)([\s\S]*?)\1/g, (_, ticks, code) => {
            let content = code.replace(/\r?\n/g, " ");
            if (content.startsWith(" ") && content.endsWith(" ") && content.trim()) {
                content = content.slice(1, -1);
            }
            return hold("<code>" + escapeHtml(content) + "</code>");
        });

        // Backslash escapes are Markdown syntax, not text to display.
        text = text.replace(/\\([!\"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~])/g,
            (_, character) => hold(escapeHtml(character)));

        // Only the small, harmless HTML subset needed by chat content is enabled.
        text = text.replace(/<u\s*>/gi, () => hold("<u>"));
        text = text.replace(/<\/u\s*>/gi, () => hold("</u>"));
        text = text.replace(/<br\s*\/?\s*>/gi, () => hold("<br>"));

        // Links and images are emitted only after their protocols are checked.
        text = text.replace(/!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+[\"']([^\"']*)[\"'])?\s*\)/g,
            (_, alt, rawUrl, title) => {
                const url = safeUrl(rawUrl.replace(/^<|>$/g, ""), true);
                if (!url) return hold(escapeHtml(alt));
                const titleAttr = title ? ' title="' + escapeHtml(title) + '"' : "";
                return hold('<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(alt) + '" loading="lazy" decoding="async"' + titleAttr + ">");
            });
        text = text.replace(/\[([^\]]+)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+[\"']([^\"']*)[\"'])?\s*\)/g,
            (_, label, rawUrl, title) => {
                const url = safeUrl(rawUrl.replace(/^<|>$/g, ""), false);
                if (!url) return hold(renderInline(label));
                const titleAttr = title ? ' title="' + escapeHtml(title) + '"' : "";
                return hold('<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer"' + titleAttr + '>' + renderInline(label) + "</a>");
            });
        text = text.replace(/<((?:https?:\/\/|mailto:)[^\s>]+)>/gi,
            (_, url) => hold('<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(url) + "</a>"));

        text = escapeHtml(text);

        // Common emphasis forms. Generated tags and protected tokens are already safe.
        text = text.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "<strong>$2</strong>");
        text = text.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
        text = text.replace(/(^|[^\w])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");
        text = text.replace(/(^|[^\w])_([^_\n]+?)_(?!\w)/g, "$1<em>$2</em>");

        return text.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)]);
    }

    function splitTableRow(line) {
        let value = line.trim();
        if (value.startsWith("|")) value = value.slice(1);
        if (value.endsWith("|") && !value.endsWith("\\|")) value = value.slice(0, -1);

        const cells = [];
        let cell = "";
        for (let i = 0; i < value.length; i++) {
            if (value[i] === "\\" && value[i + 1] === "|") {
                cell += "\\|";
                i++;
            } else if (value[i] === "|") {
                cells.push(cell.trim());
                cell = "";
            } else {
                cell += value[i];
            }
        }
        cells.push(cell.trim());
        return cells;
    }

    function normalizeEscapedMarkdown(value) {
        const text = String(value);
        const escapedMarkers = text.match(/\\[*_`\[\]()<>]/g) || [];
        if (escapedMarkers.length < 3) return text;

        // ponytail: heuristic for over-escaped model output; keep isolated
        // escapes literal, and replace with a full Markdown parser if formats expand.
        return text.replace(/\\([*_`\[\]()<>])/g, "$1");
    }

    function listMarker(line) {
        return line.match(/^\s{0,3}([-+*]|\d+[.)])\s+(.+)$/);
    }

    function isTableStart(lines, index) {
        if (index + 1 >= lines.length || !lines[index].includes("|")) return false;
        const separator = splitTableRow(lines[index + 1]);
        return separator.length > 0 && separator.every(cell => /^:?-{3,}:?$/.test(cell));
    }

    function renderMarkdown(markdown) {
        if (markdown === null || markdown === undefined) return "";
        const lines = normalizeEscapedMarkdown(markdown).replace(/\r\n?/g, "\n").split("\n");
        const blocks = [];

        function renderLines(linesToRender) {
            return linesToRender.map(renderInline).join("<br>\n");
        }

        for (let index = 0; index < lines.length;) {
            const line = lines[index];
            if (!line.trim()) {
                index++;
                continue;
            }

            const fence = line.match(/^\s{0,3}(`{3,}|~{3,})\s*([\w+-]*)\s*$/);
            if (fence) {
                const fenceText = fence[1];
                const codeLines = [];
                index++;
                while (index < lines.length && !new RegExp("^\\s{0,3}" + fenceText[0] + "{" + fenceText.length + ",}\\s*$").test(lines[index])) {
                    codeLines.push(lines[index++]);
                }
                if (index < lines.length) index++;
                const language = fence[2].replace(/[^\w+-]/g, "");
                const className = language ? ' class="language-' + language + '"' : "";
                blocks.push("<pre><code" + className + ">" + escapeHtml(codeLines.join("\n")) + "</code></pre>");
                continue;
            }

            const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
            if (heading) {
                const level = heading[1].length;
                blocks.push("<h" + level + ">" + renderInline(heading[2]) + "</h" + level + ">");
                index++;
                continue;
            }

            if (/^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(line)) {
                blocks.push("<hr>");
                index++;
                continue;
            }

            if (/^\s{0,3}>/.test(line)) {
                const quoteLines = [];
                while (index < lines.length && /^\s{0,3}>/.test(lines[index])) {
                    quoteLines.push(lines[index++].replace(/^\s{0,3}>\s?/, ""));
                }
                blocks.push("<blockquote>" + renderMarkdown(quoteLines.join("\n")) + "</blockquote>");
                continue;
            }

            if (isTableStart(lines, index)) {
                const headers = splitTableRow(lines[index++]);
                const separator = splitTableRow(lines[index++]);
                const alignments = separator.map(cell => cell.startsWith(":") && cell.endsWith(":")
                    ? "center"
                    : cell.endsWith(":") ? "right" : cell.startsWith(":") ? "left" : "");
                const rows = [];
                while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
                    rows.push(splitTableRow(lines[index++]));
                }
                const cell = (tag, value, cellIndex) => {
                    const alignment = alignments[cellIndex] ? ' class="align-' + alignments[cellIndex] + '"' : "";
                    return "<" + tag + alignment + ">" + renderInline(value) + "</" + tag + ">";
                };
                blocks.push("<table><thead><tr>" + headers.map((value, i) => cell("th", value, i)).join("") +
                    "</tr></thead><tbody>" + rows.map(row => "<tr>" + headers.map((_, i) => cell("td", row[i] || "", i)).join("") + "</tr>").join("") +
                    "</tbody></table>");
                continue;
            }

            const marker = listMarker(line);
            if (marker) {
                const ordered = /^\d/.test(marker[1]);
                const items = [];
                while (index < lines.length) {
                    const itemMarker = listMarker(lines[index]);
                    if (!itemMarker || /^\d/.test(itemMarker[1]) !== ordered) break;
                    const itemLines = [itemMarker[2]];
                    index++;
                    while (index < lines.length && /^\s{2,}\S/.test(lines[index]) && !listMarker(lines[index])) {
                        itemLines.push(lines[index++].trim());
                    }
                    items.push("<li>" + renderLines(itemLines) + "</li>");
                    while (index < lines.length && !lines[index].trim()) index++;
                }
                blocks.push("<" + (ordered ? "ol" : "ul") + ">" + items.join("") + "</" + (ordered ? "ol" : "ul") + ">");
                continue;
            }

            const paragraph = [line];
            index++;
            while (index < lines.length && lines[index].trim() &&
                !/^\s{0,3}(?:#{1,6}\s|>|```|~~~)/.test(lines[index]) &&
                !listMarker(lines[index]) && !isTableStart(lines, index) &&
                !/^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(lines[index])) {
                paragraph.push(lines[index++]);
            }
            blocks.push("<p>" + renderLines(paragraph) + "</p>");
        }

        return blocks.join("\n");
    }

    function buildPromptContent(userText, files, ocr, trans) {
        const content = [];
        const request = String(userText || "").trim();
        let instruction;

        if (ocr && !trans) {
            instruction = request
                ? "Extract all text from this image. Use the extracted text together with the user's request below to answer with full context."
                : "Extract all text from this image. Return only the text content, nothing else.";
        } else if (trans && !ocr) {
            instruction = request
                ? "Transcribe all speech from this audio. Use the transcription together with the user's request below to answer with full context."
                : "Transcribe all speech from this audio. Return only the transcription, nothing else.";
        } else if (ocr && trans) {
            instruction = request
                ? "Extract all text from this image AND transcribe all speech from this audio. Use both results together with the user's request below to answer with full context."
                : "Extract all text from this image AND transcribe all speech from this audio. Return both.";
        } else if (request && files.length) {
            instruction = "Use all attached media together with the user's request below to answer with full context.";
        } else {
            instruction = request || "Describe what is in this media.";
        }

        if (request && (ocr || trans || files.length)) {
            instruction += "\n\nUser request:\n" + request;
        }
        content.push({ type: "text", value: instruction });

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
        renderMarkdown,
        buildPromptContent,
        supportsMedia,
        isValidConversation,
        dequeue,
        removeQueuedItem,
        drainQueue,
        buildImportedPrompt,
    };
});
