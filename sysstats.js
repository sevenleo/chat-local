/* ---------- Footer system stats ----------
   Auto-detects whether our python server.py is behind the page.

   /stats answers (python server.py running)
     → real system stats: CPU %, system RAM (needs psutil); GPU %, VRAM
       (needs nvidia-smi). Metrics the server can't read fall back to the
       browser source individually — the bar never lies and never shows "—".

   /stats absent (other server, file://, or server not started)
     → after 3 failed probes, polling stops and the whole bar stays hidden —
       the browser can only see page fps / this tab's heap, which are NOT
       system stats, so showing them would be misleading.

   ------------------------------------------------ */

(function systemStats() {
    "use strict";

    const bar    = document.getElementById("sysStats");
    const cpuEl  = document.getElementById("statCpu");
    const memEl  = document.getElementById("statMem");
    const gpuEl  = document.getElementById("statGpu");
    const vramEl = document.getElementById("statVram");
    if (!bar || !cpuEl) return;

    const fmtGB = bytes => (bytes / 1073741824).toFixed(1) + " GB";
    const fmtMB = bytes => {
        const mb = bytes / 1048576;
        return mb >= 1024 ? fmtGB(bytes) : Math.round(mb) + " MB";
    };

    function setChip(el, html, cls, title) {
        el.className = "stat stat--" + cls;
        el.innerHTML = html;
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
            setChip(cpuEl,
                "CPU " + "●".repeat(info.dots) + "○".repeat(4 - info.dots) +
                " " + info.label + " · " + fps + "fps",
                info.cls,
                "Browser load pressure (not system %). For real CPU %: python server.py + pip install psutil");
        } else if (fps > 0) {
            setChip(cpuEl,
                "CPU " + fps + "fps",
                fps >= 50 ? "ok" : fps >= 30 ? "warn" : "err",
                "Page frame rate — browser-only proxy. For real CPU %: python server.py + pip install psutil");
        }
        /* first second before any FPS sample: leave the HTML placeholder */
    }

    function renderMemBrowser() {
        const pm = performance.memory;
        if (pm && pm.usedJSHeapSize) {
            let txt = "MEM " + fmtMB(pm.usedJSHeapSize);
            if (navigator.deviceMemory) txt += " / " + navigator.deviceMemory + " GB";
            setChip(memEl, txt, "na",
                "JS heap of THIS TAB (not system RAM). For real system RAM: python server.py + pip install psutil");
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
            if (!d || d.error || typeof d.at !== "number") throw new Error("not chat-local /stats");
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

        /* No python server → hide the whole bar; the browser proxies
           (fps / tab heap) are not system stats, so we show nothing. */
        if (!hasCpu && !hasRam) {
            bar.hidden = true;
            cpuEl.hidden = true;
            memEl.hidden = true;
            gpuEl.hidden = true;
            vramEl.hidden = true;
            return;
        }

        bar.hidden = false;

        /* CPU: real % from server, else browser proxy (server up, psutil missing) */
        if (hasCpu) {
            setChip(cpuEl,
                "CPU " + Math.round(d.cpuPercent) + "%",
                loadPct(d.cpuPercent),
                "Total CPU usage — all cores (server.py + psutil)");
        } else {
            renderCpuBrowser();
        }

        /* RAM: real system RAM from server, else this tab's heap */
        if (hasRam) {
            const heap = performance.memory
                ? " · tab: " + fmtMB(performance.memory.usedJSHeapSize) : "";
            setChip(memEl,
                "RAM " + fmtGB(d.ramUsed) + " / " + fmtGB(d.ramTotal) +
                " (" + Math.round(d.ramPercent) + "%)",
                loadPct(d.ramPercent),
                "System memory used/total" + heap);
        } else {
            renderMemBrowser();
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

        bar.title = "Real system stats via server.py (missing metrics fall back to browser)";
    }

    /* ============ boot ============ */
    render(null);                          // immediate content, no empty bar
    (async function tick() {
        const d = serverAlive === false ? null : await pollServer();
        render(d);
        setTimeout(tick, 1000);            // keeps FPS/heap fresh even when polling stopped
    })();
})();
