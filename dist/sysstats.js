/* ---------- Footer system stats ----------
   The performance toggle controls both the visible bar and every probe behind
   it. Python-backed metrics appear only when server.py answers /stats.
   ------------------------------------------------ */

(function systemStats() {
    "use strict";

    const bar           = document.getElementById("sysStats");
    const statsToggle   = document.getElementById("statsToggle");
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

    const LEVELS = {
        nominal:  { label: "idle",   dots: 1, cls: "ok"   },
        fair:     { label: "busy",   dots: 2, cls: "ok"   },
        serious:  { label: "loaded", dots: 3, cls: "warn" },
        critical: { label: "maxed",  dots: 4, cls: "err"  },
    };
    const pressure = { cpu: "nominal" };
    const canProbe = location.protocol.startsWith("http");

    let enabled = false;
    let pressureOk = false;
    let pressureObserver = null;
    let frameId = null;
    let tickTimer = null;
    let fetchController = null;
    let runId = 0;
    let fps = 0;
    let frames = 0;
    let lastFpsAt = 0;
    let serverAlive = null;
    let failCount = 0;

    function startBrowserProbes() {
        pressureOk = false;
        pressureObserver = null;
        if ("ComputePressureObserver" in window && window.isSecureContext) {
            try {
                pressureObserver = new ComputePressureObserver(records => {
                    for (const record of records) {
                        if (record.cpuSignal !== undefined) pressure.cpu = record.cpuSignal;
                    }
                });
                pressureObserver.observe({ sources: { cpu: { min: 0.5, max: 0.75 } } }, ["cpu"]);
                pressureOk = true;
            } catch (e) {
                pressureObserver = null;
            }
        }

        fps = 0;
        frames = 0;
        lastFpsAt = performance.now();
        const loop = () => {
            if (!enabled) {
                frameId = null;
                return;
            }

            frames++;
            const now = performance.now();
            if (now - lastFpsAt >= 1000) {
                fps = Math.round(frames * 1000 / (now - lastFpsAt));
                frames = 0;
                lastFpsAt = now;
            }
            frameId = requestAnimationFrame(loop);
        };
        frameId = requestAnimationFrame(loop);
    }

    function stopBrowserProbes() {
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = null;
        if (pressureObserver) pressureObserver.disconnect();
        pressureObserver = null;
        pressureOk = false;
    }

    function renderCpuBrowser() {
        if (serverAlive === false || !pressureOk) {
            if (fps > 0) {
                setChip(browserCpuEl,
                    "FPS: " + fps,
                    fps >= 50 ? "ok" : fps >= 30 ? "warn" : "err",
                    "Page frame rate");
            }
        } else {
            const info = LEVELS[pressure.cpu] || LEVELS.nominal;
            setChip(browserCpuEl,
                "CPU browser " + "●".repeat(info.dots) + "○".repeat(4 - info.dots) +
                " " + info.label + " · " + fps + "fps",
                info.cls,
                "Browser load pressure (not system %). For real CPU %: python server.py + pip install psutil");
        }
    }

    function renderMemBrowser() {
        const pm = performance.memory;
        if (pm && pm.usedJSHeapSize) {
            setChip(browserMemEl, "TAB: " + fmtMB(pm.usedJSHeapSize), "na", "Tab memory");
        } else {
            browserMemEl.hidden = true;
        }
    }

    async function pollServer(run) {
        if (!enabled || !canProbe) return null;

        const requestController = new AbortController();
        fetchController = requestController;
        try {
            const res = await fetch("stats", {
                cache: "no-store",
                signal: requestController.signal,
            });
            if (!res.ok) throw new Error(String(res.status));
            const data = await res.json();
            if (!data || data.app !== "chat-local" || data.error || !Number.isFinite(data.at)) {
                throw new Error("not chat-local /stats");
            }
            if (!enabled || run !== runId) return null;
            serverAlive = true;
            failCount = 0;
            return data;
        } catch (e) {
            if (enabled && run === runId && e.name !== "AbortError") {
                if (++failCount >= 3) serverAlive = false;
            }
            return null;
        } finally {
            if (fetchController === requestController) fetchController = null;
        }
    }

    function render(data) {
        if (!enabled) return;

        const hasCpu  = data && typeof data.cpuPercent === "number";
        const hasRam  = data && typeof data.ramUsed === "number";
        const hasGpu  = data && typeof data.gpuPercent === "number";
        const hasVram = data && typeof data.vramUsed === "number";

        bar.hidden = false;
        renderCpuBrowser();
        renderMemBrowser();

        if (hasCpu) {
            setChip(cpuEl,
                "CPU " + Math.round(data.cpuPercent) + "%",
                loadPct(data.cpuPercent),
                "Total CPU usage — all cores (server.py + psutil)");
        } else {
            cpuEl.hidden = true;
        }

        if (hasRam) {
            setChip(memEl,
                "RAM: " + fmtGB(data.ramUsed) + " / " + fmtGB(data.ramTotal),
                loadPct(data.ramPercent),
                "System memory used/total");
        } else {
            memEl.hidden = true;
        }

        if (hasGpu) {
            setChip(gpuEl,
                "GPU " + Math.round(data.gpuPercent) + "%",
                loadPct(data.gpuPercent),
                (data.gpuName || "GPU") + " — utilization (nvidia-smi)");
        } else {
            gpuEl.hidden = true;
        }

        if (hasVram) {
            const pct = data.vramTotal ? data.vramUsed / data.vramTotal * 100 : 0;
            setChip(vramEl,
                "VRAM " + fmtGB(data.vramUsed) + " / " + fmtGB(data.vramTotal),
                loadPct(pct),
                "Graphics memory used/total (nvidia-smi)");
        } else {
            vramEl.hidden = true;
        }

        bar.title = "Browser metrics and optional system stats from server.py";
    }

    async function tick(run) {
        if (!enabled || run !== runId) return;
        const data = serverAlive === false ? null : await pollServer(run);
        if (!enabled || run !== runId) return;
        render(data);
        tickTimer = setTimeout(() => tick(run), 1000);
    }

    function setEnabled(next) {
        if (enabled === next && (next ? tickTimer !== null || frameId !== null : bar.hidden)) return;

        enabled = next;
        runId++;
        if (tickTimer !== null) clearTimeout(tickTimer);
        tickTimer = null;
        if (fetchController) fetchController.abort();
        stopBrowserProbes();

        if (!enabled) {
            bar.hidden = true;
            return;
        }

        serverAlive = null;
        failCount = 0;
        startBrowserProbes();
        render(null);
        tick(runId);
    }

    if (statsToggle) {
        statsToggle.addEventListener("change", () => setEnabled(statsToggle.checked));
    }
    setEnabled(statsToggle ? statsToggle.checked : true);
})();
