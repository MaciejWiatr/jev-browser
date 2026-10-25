"""Start the jev MCP server inside the Jev Ultrafast uv project. Works on macOS, Linux and Windows.

Finds Jev at $JEV_HOME, ~/.jev/jev-ultrafast or ~/Apps/jev-ultrafast (first that exists), then runs
jev_mcp.py there with the extra packages the plugin needs. stdin/stdout pass straight through (MCP over stdio).
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXTRAS = ["mcp>=1.2,<2", "pillow>=11,<13", "cryptography>=43,<51", "keyring>=25,<26", "filelock>=3.12,<4"]


def find_jev():
    candidates = [os.environ.get("JEV_HOME"), Path.home() / ".jev" / "jev-ultrafast", Path.home() / "Apps" / "jev-ultrafast"]
    for candidate in candidates:
        if candidate and (Path(candidate).expanduser() / "pyproject.toml").exists():
            return Path(candidate).expanduser()
    sys.exit("jev: Jev Ultrafast not found. Run install.sh / install.ps1 from the jev-browser repo, or set JEV_HOME.")


def main():
    jev_home = find_jev()
    uv = shutil.which("uv") or next((str(p) for p in (Path.home() / ".local" / "bin" / "uv",
                                                     Path.home() / ".cargo" / "bin" / "uv") if p.exists()), None)
    if not uv:
        sys.exit("jev: uv not found on PATH. Install it: https://docs.astral.sh/uv/")
    cmd = [uv, "run", "--quiet", "--project", str(jev_home)]
    if (jev_home / ".env").exists():
        cmd += ["--env-file", str(jev_home / ".env")]
    for extra in EXTRAS:
        cmd += ["--with", extra]
    cmd += ["python", str(HERE / "jev_mcp.py")]
    env = {**os.environ, "JEV_HOME": str(jev_home)}
    env.pop("VIRTUAL_ENV", None)  # the launcher's own environment must not leak into Jev's
    if os.name == "posix":
        os.execve(uv, cmd, env)  # become the server, so Claude Code's SIGTERM reaches it directly
    sys.exit(subprocess.call(cmd, env=env))


if __name__ == "__main__":
    main()
