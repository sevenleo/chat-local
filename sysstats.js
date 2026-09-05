/* ---------- Footer system stats ----------
   Browser metrics are always available when the browser exposes them.
   Python-backed system metrics appear only when our server.py answers /stats.

   /stats answers (python server.py running)
     → real system stats: CPU %, system RAM (needs psutil); GPU %, VRAM
       (needs nvidia-smi). Missing Python metrics stay hidden individually.

   /stats absent (other server, file://, or server not started)
     → Python-only chips stay hidden while browser CPU pressure/FPS and tab
       heap continue to be shown when supported.

   ------------------------------------------------ */

(function systemStats() {
    "use strict";

    const bar           = document.getElementById("sysStats");
    const browserCpuEl  = document.getElementById("statBrowserCpu");
    const browserMemEl  = document.getElementById("statBrowserMem");
    const cpuEl         = document.getElementById("statCpu");
    const memEl         = document.getElementById("statMem");
    const gpuEl         = document.getElementById("statGpu");
    const vramEl        = document.getElementById("statVram");
    if (!bar || !browserCpuEl || !browserMemEl || !cpuEl || !memEl || !gpuEl || !vramEl) return;

    const fmtGB = bytes => (bytes / 1073741824).toFixed(1) + " GB";
    const fmtMB = bytes => {
        const mb = bytes / 1048576;
        return mb >= 1024 ? fmtGB(bytes) : Math.round(mb) + " MB";
    };

    function setChip(el, text, cls, title) {
        el.className = "stat stat--" + cls;
        el.textContent = text;
        el.title = title;
        el.hidden = false;
    }

    function loadPct(p) {
        if (p >= 85) return "err";
        if (p >= 55) return "warn";
        return "ok";
    }

    /* ============ browser probes (always running) ============ */

    const LEVELS = {
        nominal:  { label: "idle",   dots: 1, cls: "ok"   },
        fair:     { label: "busy",   dots: 2, cls: "ok"   },
        serious:  { label: "loaded", dots: 3, cls: "warn" },
        critical: { label: "maxed",  dots: 4, cls: "err"  },
    };
    const pressure = { cpu: "nominal" };
    let pressureOk = false;

    if ("ComputePressureObserver" in window && window.isSecureContext) {
        try {
            const obs = new ComputePressureObserver(records => {
                for (const r of records) {
                    if (r.cpuSignal !== undefined) pressure.cpu = r.cpuSignal;
                }
            });
            obs.observe({ sources: { cpu: { min: 0.5, max: 0.75 } } }, ["cpu"]);
            pressureOk = true;
        } catch (e) {
            pressureOk = false;
        }
    }

    /* FPS proxy */
    let fps = 0, frames = 0, lastFpsAt = performance.now();
    (function loop() {
        frames++;
        const now = performance.now();
        if (now - lastFpsAt >= 1000) {
            fps = Math.round(frames * 1000 / (now - lastFpsAt));
            frames = 0;
            lastFpsAt = now;
        }
        requestAnimationFrame(loop);
    })();

    function renderCpuBrowser() {
        if (pressureOk) {
            const info = LEVELS[pressure.cpu] || LEVELS.nominal;
            setChip(browserCpuEl,
                "CPU browser " + "●".repeat(info.dots) + "○".repeat(4 - info.dots) +
                " " + info.label + " · " + fps + "fps",
                info.cls,
                "Browser load pressure (not system %). For real CPU %: python server.py + pip install psutil");
        } else if (fps > 0) {
            setChip(browserCpuEl,
                "CPU browser " + fps + "fps",
                fps >= 50 ? "ok" : fps >= 30 ? "warn" : "err",
                "Page frame rate — browser-only proxy. For real CPU %: python server.py + pip install psutil");
        }
        /* first second before any FPS sample: leave the HTML placeholder */
    }

    function renderMemBrowser() {
        const pm = performance.memory;
        if (pm && pm.usedJSHeapSize) {
            let txt = "MEM aba " + fmtMB(pm.usedJSHeapSize);
            if (navigator.deviceMemory) txt += " / " + navigator.deviceMemory + " GB";
            setChip(browserMemEl, txt, "na",
                "JS heap of THIS TAB (not system RAM). For real system RAM: python server.py + pip install psutil");
        } else {
            browserMemEl.hidden = true;
        }
    }

    /* ============ server probe ============ */

    /* file:// pages can never reach a server — fetch from origin "null" is
       CORS-blocked before it starts, so skip probing entirely (no console
       noise) and keep the bar hidden. */
    const canProbe = location.protocol.startsWith("http");

    let serverAlive = null;   // null = unproven, true = /stats is ours, false = decided, no server
    let failCount = 0;

    async function pollServer() {
        if (!canProbe) return null;
        try {
            const res = await fetch("stats", { cache: "no-store" });
            if (!res.ok) throw new Error(String(res.status));
            const d = await res.json();
            /* shape-check so another server's 404-JSON/endpoint can't fool us */
            if (!d || d.app !== "chat-local" || d.error || !Number.isFinite(d.at)) {
                throw new Error("not chat-local /stats");
            }
            serverAlive = true;
            failCount = 0;
            return d;
        } catch (e) {
            if (++failCount >= 3) serverAlive = false;   // stop polling after 3 strikes
            return null;
        }
    }

    /* ============ render one tick ============ */

    function render(d) {
        const hasCpu  = d && typeof d.cpuPercent === "number";
        const hasRam  = d && typeof d.ramUsed === "number";
        const hasGpu  = d && typeof d.gpuPercent === "number";
        const hasVram = d && typeof d.vramUsed === "number";

        /* Browser metrics are independent of Python and must remain visible. */
        bar.hidden = false;
        renderCpuBrowser();
        renderMemBrowser();

        /* Python metrics are independent chips and hide individually when absent. */
        if (hasCpu) {
            setChip(cpuEl,
                "CPU " + Math.round(d.cpuPercent) + "%",
                loadPct(d.cpuPercent),
                "Total CPU usage — all cores (server.py + psutil)");
        } else {
            cpuEl.hidden = true;
        }

        /* RAM: real system RAM is a separate Python chip; tab heap stays above. */
        if (hasRam) {
            const heap = performance.memory
                ? " · tab: " + fmtMB(performance.memory.usedJSHeapSize) : "";
            setChip(memEl,
                "RAM " + fmtGB(d.ramUsed) + " / " + fmtGB(d.ramTotal) +
                " (" + Math.round(d.ramPercent) + "%)",
                loadPct(d.ramPercent),
                "System memory used/total" + heap);
        } else {
            memEl.hidden = true;
        }

        /* GPU / VRAM: server-only — hidden when absent, never faked */
        if (hasGpu) {
            setChip(gpuEl,
                "GPU " + Math.round(d.gpuPercent) + "%",
                loadPct(d.gpuPercent),
                (d.gpuName || "GPU") + " — utilization (nvidia-smi)");
        } else {
            gpuEl.hidden = true;
        }

        if (hasVram) {
            const pct = d.vramTotal ? d.vramUsed / d.vramTotal * 100 : 0;
            setChip(vramEl,
                "VRAM " + fmtGB(d.vramUsed) + " / " + fmtGB(d.vramTotal),
                loadPct(pct),
                "Graphics memory used/total (nvidia-smi)");
        } else {
            vramEl.hidden = true;
        }

        bar.title = "Browser metrics always shown; real system stats via server.py when available";
    }

    /* ============ boot ============ */
    render(null);                          // immediate content, no empty bar
    (async function tick() {
        const d = serverAlive === false ? null : await pollServer();
        render(d);
        setTimeout(tick, 1000);            // keeps FPS/heap fresh even when polling stopped
    })();
})();
