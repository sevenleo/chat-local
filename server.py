"""
server.py — static file server + local system-stats endpoint for chat-local.

Usage:
    python server.py                  → http://localhost:8000/chat.html
    python server.py --port 9000

Optional (enables the footer's real system stats):
    pip install psutil                → CPU %, system RAM
    nvidia-smi on PATH (NVIDIA GPU)   → GPU util %, VRAM

Without them, /stats still answers with whatever it can read and the page
falls back to browser-only proxies. Nothing else changes.
"""
import argparse
import atexit
import json
import shutil
import signal
import subprocess
import threading
import time
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

try:
    import psutil
except ImportError:
    psutil = None


class Stats:
    """Samples system metrics. Thread-safe; called by the polling frontend."""

    def __init__(self):
        self._gpu_lock = threading.Lock()
        self._gpu_cache = None        # (dict|None, expires_at)
        self._gpu_dead_until = 0.0    # back off if nvidia-smi is absent
        if psutil is not None:
            psutil.cpu_percent(interval=None)  # prime the non-blocking counter

    # ---------- CPU / RAM (psutil) ----------
    def cpu_ram(self):
        if psutil is None:
            return {}
        vm = psutil.virtual_memory()
        return {
            "cpuPercent": round(psutil.cpu_percent(interval=None), 1),
            "ramUsed": vm.used,
            "ramTotal": vm.total,
            "ramPercent": vm.percent,
        }

    # ---------- GPU / VRAM (nvidia-smi, best effort) ----------
    def gpu(self):
        now = time.time()
        with self._gpu_lock:
            if self._gpu_cache and self._gpu_cache[1] > now:
                return self._gpu_cache[0]
            if now < self._gpu_dead_until:
                return {}

            out = {}
            try:
                res = subprocess.run(
                    ["nvidia-smi",
                     "--query-gpu=name,utilization.gpu,memory.used,memory.total",
                     "--format=csv,noheader,nounits"],
                    capture_output=True, text=True, timeout=2.0,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
                if res.returncode == 0:
                    # Take the first (primary) GPU of the system.
                    name, util, used, total = res.stdout.strip().splitlines()[0].split(", ")
                    out = {
                        "gpuName": name.strip(),
                        "gpuPercent": float(util),
                        "vramUsed": int(float(used)) * 1048576,   # MiB → bytes
                        "vramTotal": int(float(total)) * 1048576,
                    }
                else:
                    self._gpu_dead_until = now + 60
            except (OSError, ValueError, IndexError):
                # nvidia-smi missing / unexpected output — don't retry too often
                self._gpu_dead_until = now + 60

            self._gpu_cache = (out, now + 1.0)   # cache 1s (frontend polls 1s)
            return out

    def snapshot(self):
        data = {"app": "chat-local", "at": time.time()}
        data.update(self.cpu_ram())
        data.update(self.gpu())
        return data


stats = Stats()


class Handler(SimpleHTTPRequestHandler):

    def log_message(self, fmt, *args):
        # keep the console quiet: don't log the 1-per-second stats polling.
        # fmt may carry non-string objects (e.g. HTTPStatus in error paths),
        # so stringify everything before matching.
        first = str(args[0]) if args else ""
        if "/stats" not in first and "favicon" not in first:
            super().log_message(fmt, *args)

    def do_GET(self):
        if self.path.split("?")[0] == "/stats":
            try:
                body = json.dumps(stats.snapshot()).encode("utf-8")
            except Exception as error:            # never take the page down
                body = json.dumps({"error": str(error)}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


def main():
    parser = argparse.ArgumentParser(description="Serve chat-local")
    parser.add_argument("--port", type=int, default=8000, help="port (default: 8000)")
    args = parser.parse_args()

    handler = partial(Handler, directory=".")
    # Keep the local chat and exported conversations off the LAN by default.
    httpd = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    httpd.daemon_threads = True

    print(f"Serving at http://localhost:{args.port}/chat.html")
    print(f"  psutil: {'yes' if psutil else 'NO — pip install psutil (system CPU/RAM)'}")
    print(f"  nvidia-smi: {'found' if shutil.which('nvidia-smi') else 'not found (GPU/VRAM unavailable)'}")

    # ---------- single-owner shutdown ----------
    # One exit path for every stop signal (Ctrl+C, taskkill, window close,
    # unhandled crash): closes the listening socket — releasing the port —
    # and lets daemon threads die with the process. No orphan listeners.
    stopping = threading.Event()

    def shutdown(*_):
        if stopping.is_set():
            return
        stopping.set()
        # serve_forever() polls every 0.5s and returns → main() exits normally
        threading.Thread(target=httpd.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, shutdown)   # Ctrl+C (Windows + Unix)
    signal.signal(signal.SIGTERM, shutdown)  # taskkill / PID-based stops
    # On Windows, closing the console window kills without signals; on Unix
    # SIGHUP covers it. Register when available.
    if hasattr(signal, "SIGHUP"):
        signal.signal(signal.SIGHUP, shutdown)

    # If something kills us the hard way, still close the socket at exit.
    atexit.register(lambda: (httpd.server_close() if not stopping.is_set() else None))

    try:
        httpd.serve_forever(poll_interval=0.5)
    finally:
        httpd.server_close()
        print("\nServer stopped — port released.")

    # python instances left over from earlier test runs (e.g. ports 8202/8203)
    # are separate processes: use  taskkill /F /IM python.exe  to clear them.
    # This script can only guarantee ITS OWN port closes when IT stops.


if __name__ == "__main__":
    main()
