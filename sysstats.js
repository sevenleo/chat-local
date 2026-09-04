/* ---------- Footer system stats (browser-native only) ----------
   What a plain web page CAN honestly know (no extensions):

   • CPU  → "Compute Pressure" spec level (nominal/fair/serious/critical)
            = how loaded/throttled the browser's compute is, plus our own
            frame-loop FPS as a responsiveness proxy.
   • MEM  → performance.memory (usedJSHeapSize) = THIS TAB's JS heap,
            plus navigator.deviceMemory = total device RAM (static, GB).
   • GPU  → Compute Pressure "gpu" scope if supported (Chrome-only,
            origin-trial/rolling area — may be absent).

   NOT possible from a web page: true system-wide CPU%, process RAM,
   real GPU utilization% (those need chrome.system.* (extension API)
   or native code). We display page/approximate metrics, honestly
    labelled. If an API is missing, that stat shows as unavailable.
   --------------------------------------------------------------- */

(function systemStats() {
    "use strict";

    const bar    = document.getElementById("sysStats");
    const cpuEl  = document.getElementById("statCpu");
    const memEl  = document.getElementById("statMem");
    const gpuEl  = document.getElementById("statGpu");
    if (!bar || !cpuEl) return;

    const LEVELS = {
        nominal:  { label: "idle",    dots: 1, cls: "stat--ok"   },
        fair:     { label: "busy",    dots: 2, cls: "stat--ok"   },
        serious:  { label: "loaded",  dots: 3, cls: "stat--warn" },
        critical: { label: "maxed",   dots: 4, cls: "stat--err"  },
    };

    function renderLevel(el, level, extra) {
        const info = LEVELS[level] || LEVELS.nominal;
        el.className = "stat " + info.cls;
        el.innerHTML =
            '<span class="stat-dots">' + "●".repeat(info.dots) +
            "○".repeat(4 - info.dots) + "</span> " +
            info.label + (extra ? " · " + extra : "");
    }

    /* ---------- Compute Pressure (CPU + GPU scopes) ----------
       observe(source, scopes) — spec shape:
         observe({ sources: { cpu: { min, max } } }, ["cpu"])
       Chrome currently supports "cpu" only; "gpu" throws NotSupportedError,
       so we try both and fall back gracefully. Requires secure context
       (127.0.0.1 counts) + enabled flag/origin trial; wrapped in try/catch. */
    const pressure = { cpu: "nominal", gpu: null };
    let pressureOk = false;

    if ("ComputePressureObserver" in window && window.isSecureContext) {
        try {
            const obs = new ComputePressureObserver(records => {
                for (const r of records) {
                    if (r.cpuSignal !== undefined) pressure.cpu = r.cpuSignal;
                    if (r.gpuSignal !== undefined) pressure.gpu = r.gpuSignal;
                }
                update();
            });

            function tryObserve(scopes) {
                const sources = {};
                for (const s of scopes) sources[s] = { min: 0.5, max: 0.75 };
                obs.observe({ sources }, scopes);
            }

            try { tryObserve(["cpu", "gpu"]); }
            catch (e) {
                try { tryObserve(["cpu"]); }
                catch (e2) { /* no pressure support at all */ }
            }
            pressureOk = true;
        } catch (e) {
            pressureOk = false;
        }
    }

    /* ---------- FPS proxy for the CPU stat ---------- */
    let fps = 0;
    let frames = 0;
    let lastFpsAt = performance.now();

    (function loop() {
        frames++;
        const now = performance.now();
        if (now - lastFpsAt >= 1000) {
            fps = Math.round(frames * 1000 / (now - lastFpsAt));
            frames = 0;
            lastFpsAt = now;
            update();
        }
        requestAnimationFrame(loop);
    })();

    /* ---------- Memory ---------- */
    function fmtMB(bytes) {
        const mb = bytes / 1048576;
        return (mb >= 1024 ? (mb / 1024).toFixed(1) + " GB" : Math.round(mb) + " MB");
    }

    function updateMem() {
        const pm = performance.memory;
        if (pm && pm.usedJSHeapSize) {
            let txt = fmtMB(pm.usedJSHeapSize);
            if (navigator.deviceMemory) txt += " / " + navigator.deviceMemory + " GB";
            memEl.innerHTML = txt;
            memEl.title = "JS heap used by this tab (heap limit " +
                          fmtMB(pm.jsHeapSizeLimit) + ") · total device RAM";
            memEl.classList.remove("stat--na");
        } else {
            memEl.textContent = "MEM —";
            memEl.classList.add("stat--na");
        }
    }
    setInterval(updateMem, 2000);
    updateMem();

    /* ---------- Render ---------- */
    function update() {
        if (pressureOk) {
            renderLevel(cpuEl, pressure.cpu, fps + "fps");
            cpuEl.title = "Compute pressure (browser load) · page frame-rate";
        } else {
            cpuEl.innerHTML = fmtFpsFallback();
        }

        if (pressure.gpu) {
            renderLevel(gpuEl, pressure.gpu);
            gpuEl.title = "GPU compute pressure";
            gpuEl.hidden = false;
        } else {
            gpuEl.hidden = true;   // no honest GPU metric available
        }
    }

    function fmtFpsFallback() {
        const cls = fps >= 50 ? "stat--ok" : fps >= 30 ? "stat--warn" : "stat--err";
        cpuEl.className = "stat " + cls;
        cpuEl.title = "Page frame rate (proxy for CPU pressure)";
        return cpuEl.innerHTML = "▶ " + fps + "fps";
    }

    update();
    setInterval(update, 1000);
})();