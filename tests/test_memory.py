"""Platform checks without Chrome: encrypted memory, migration, tamper handling, no-keychain fallback, launcher.

    uv run --no-project --with "cryptography>=43,<51" --with "keyring>=25,<26" --with filelock python tests/test_memory.py
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
work = Path(tempfile.mkdtemp(prefix="jev-mem-"))
os.environ["JEV_MEMORY_DIR"] = str(work / "memory")
os.environ.setdefault("PYTHON_KEYRING_BACKEND", "keyring.backends.fail.Keyring")  # CI has no keychain
sys.path.insert(0, str(ROOT / "server"))
import memory as mem  # noqa: E402

FAILED = []


def check(name, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  ({detail})" if not ok else ""))
    if not ok:
        FAILED.append(name)


mem.MEM_DIR.mkdir(parents=True)
(mem.MEM_DIR / "shop.example.com.json").write_text(json.dumps(
    {"actions": {"/p/*": {"legacy": {"role": "button", "label": "Old", "kind": "left_click"}}}, "workflows": {}}))
mem.remember("https://shop.example.com/product/B0ABC12345", "add to cart", {"role": "button", "label": "Add to basket"})
files = sorted(p.name for p in mem.MEM_DIR.iterdir())
check("one encrypted file, legacy plaintext removed", len(files) == 1 and files[0].endswith(".jev"), files)
blob = (mem.MEM_DIR / files[0]).read_bytes()
check("no plaintext in file or name", not any(w in blob for w in (b"shop.example", b"basket", b"add to cart", b"legacy"))
      and "shop" not in files[0], files)
check("fallback key file exists", (work / "memory.key").exists())
if os.name == "posix":
    check("key file is private", oct((work / "memory.key").stat().st_mode & 0o777) == "0o600")

mem._SITES.clear()
entry = mem.lookup("https://shop.example.com/product/ZZ99887766", "add to cart")
check("reads back across page IDs", entry and entry["label"] == "Add to basket", entry)
check("legacy entry migrated", "legacy" in mem.known("https://shop.example.com/p/1")["actions_here"])
fuzzy = mem.lookup("https://shop.example.com/product/X1", "add to basket")
check("synonym intent matches", fuzzy and fuzzy["label"] == "Add to basket", fuzzy)

target = mem.MEM_DIR / files[0]
tampered = bytearray(target.read_bytes())
tampered[-1] ^= 1
target.write_bytes(bytes(tampered))
mem._SITES.clear()
check("tampered file is not trusted", mem.known("https://shop.example.com/x")["actions_here"] == [])
check("tampered file is kept aside", any(".unreadable-" in p.name for p in mem.MEM_DIR.iterdir()))

jev = work / "fake-jev"
jev.mkdir()
(jev / "pyproject.toml").write_text("[project]\nname='x'\n")
probe = subprocess.run([sys.executable, "-c", f"import sys; sys.path.insert(0, {str(ROOT / 'server')!r}); "
                        "import launch; print(launch.find_jev())"], env={**os.environ, "JEV_HOME": str(jev)},
                       capture_output=True, text=True)
check("launcher finds JEV_HOME", Path(probe.stdout.strip()) == jev, probe.stderr[-300:])

print("\nAll checks passed." if not FAILED else f"\n{len(FAILED)} failed.")
sys.exit(1 if FAILED else 0)
