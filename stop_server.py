"""Stop every running chat-local server started from this project.

Usage:
    python stop_server.py --dry-run
    python stop_server.py
"""
from pathlib import Path
import argparse
import os
import sys

try:
    import psutil
except ImportError:
    psutil = None


PROJECT_DIR = Path(__file__).resolve().parent
SERVER_FILE = (PROJECT_DIR / "server.py").resolve()


def _resolved_script_path(argument, cwd):
    path = Path(argument)
    if not path.is_absolute():
        if not cwd:
            return None
        path = Path(cwd) / path
    try:
        return path.resolve()
    except OSError:
        return None


def _is_project_server(process):
    try:
        info = process.as_dict(attrs=("cmdline", "cwd"))
    except (psutil.Error, OSError):
        return False

    command = info.get("cmdline") or []
    cwd = info.get("cwd")
    return any(
        _resolved_script_path(argument, cwd) == SERVER_FILE
        for argument in command[1:]
    )


def find_servers():
    return [
        process
        for process in psutil.process_iter()
        if process.pid != os.getpid() and _is_project_server(process)
    ]


def stop_servers(processes, dry_run=False):
    if not processes:
        print("Nenhuma sessão anterior do chat-local foi encontrada.")
        return 0

    for process in processes:
        print(f"{'Encontrada' if dry_run else 'Encerrando'} sessão PID {process.pid}")

    if dry_run:
        return 0

    for process in processes:
        try:
            process.terminate()
        except psutil.NoSuchProcess:
            pass

    _, alive = psutil.wait_procs(processes, timeout=3)
    for process in alive:
        print(f"PID {process.pid} não respondeu; forçando encerramento.")
        try:
            process.kill()
        except psutil.NoSuchProcess:
            pass

    print(f"{len(processes)} sessão(ões) encerrada(s).")
    return 0


def main():
    parser = argparse.ArgumentParser(description="Encerra servidores anteriores do chat-local")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="apenas lista as sessões encontradas",
    )
    args = parser.parse_args()

    if psutil is None:
        print(
            "Este script precisa do psutil. Instale com: "
            "python -m pip install psutil",
            file=sys.stderr,
        )
        return 1

    return stop_servers(find_servers(), args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
