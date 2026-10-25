"""Site memory: learned actions keyed by page type, plus named workflows built from them.

An action is (site, page template, intent) -> how to find the element again (role + label + kind). The page
template replaces IDs in the URL path with *, so "add to cart" learned on one product page applies to every
product page. Lookups hit an in-process dict; every change is written through to ~/.jev/memory/<site>.json
so memory survives restarts and is shared with other Claude sessions on their next load.

Only roles, labels and intents are stored. Text typed into fields is never stored unless a workflow step
spells it out; workflows should use {{param}} placeholders for anything personal.
"""

import json
import os
import re
import threading
import time
from pathlib import Path
from urllib.parse import urlparse

MEM_DIR = Path(os.environ.get("JEV_MEMORY_DIR", "~/.jev/memory")).expanduser()
ENABLED = os.environ.get("JEV_MEMORY", "on").lower() not in {"off", "0", "false", "no"}
_SITES = {}  # host -> {"actions": {template: {intent: entry}}, "workflows": {name: workflow}}
_LOCK = threading.RLock()
_ID = re.compile(r"^(?=.*\d)[\w-]{6,}$|^\d+$|^[0-9a-f-]{16,}$", re.I)


def page_key(url):
    """('shop.example.com', '/product/*/reviews') for https://shop.example.com/product/B0AB12CD34/reviews?x=1"""
    parsed = urlparse(url or "")
    host = (parsed.hostname or "").removeprefix("www.")
    parts = [("*" if _ID.match(p) else p.lower()) for p in parsed.path.split("/") if p]
    return host, "/" + "/".join(parts)


def norm(intent):
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", (intent or "").lower())).strip()


def _file(host):
    return MEM_DIR / f"{re.sub(r'[^a-z0-9.-]', '_', host)}.json"


def _site(host):
    with _LOCK:
        if host not in _SITES:
            try:
                _SITES[host] = json.loads(_file(host).read_text())
            except (OSError, ValueError):
                _SITES[host] = {}
            _SITES[host].setdefault("actions", {})
            _SITES[host].setdefault("workflows", {})
        return _SITES[host]


def _save(host):
    MEM_DIR.mkdir(parents=True, exist_ok=True)
    tmp = _file(host).with_suffix(".tmp")
    tmp.write_text(json.dumps(_SITES[host], indent=1, ensure_ascii=False))
    tmp.replace(_file(host))


def remember(url, intent, target):
    """Store or refresh how to find the element for intent on this page type."""
    host, template = page_key(url)
    key = norm(intent)
    if not host or not key or not target or not target.get("label"):
        return None
    with _LOCK:
        actions = _site(host)["actions"].setdefault(template, {})
        entry = actions.get(key) or _site_entry(host, key) or {"created": time.time(), "hits": 0}
        words = set(re.findall(r"\w+", target["label"].lower()))
        if entry.get("label") and entry["label"] != target["label"]:
            # Taught again with a different label (e.g. a product name inside it): keep the shared words.
            entry["core"] = sorted(set(entry.get("core") or re.findall(r"\w+", entry["label"].lower())) & words)
        entry = dict(entry)
        entry.update(role=target.get("role"), label=target["label"], kind=target.get("kind", "click"),
                     nth=target.get("nth", 0), zone=target.get("zone", "main"), intent=intent,
                     last_used=time.time())
        actions[key] = entry
        _save(host)
        return {"site": host, "page": template, "intent": key}


def _site_entry(host, key):
    """Same intent learned on another page type of this site, so shared words carry over."""
    found = [a[key] for a in _site(host)["actions"].values() if key in a]
    return max(found, key=lambda e: e.get("last_used", 0)) if found else None


def lookup(url, intent):
    """Entry for intent on this page type; falls back to the same intent learned elsewhere on the site."""
    host, template = page_key(url)
    key = norm(intent)
    with _LOCK:
        actions = _site(host)["actions"]
        if key in actions.get(template, {}):
            return {**actions[template][key], "page": template, "same_page": True}
        others = [(t, a[key]) for t, a in actions.items() if key in a]
        if others:
            t, entry = max(others, key=lambda o: o[1].get("last_used", 0))
            return {**entry, "page": t, "same_page": False}
        # Same meaning, different wording ("add to cart" vs "add to basket"): closest learned intent.
        want = _expand(set(key.split()))
        best = None
        for t, acts in actions.items():
            for k, entry in acts.items():
                have = _expand(set(k.split()))
                score = len(want & have) / max(len(want | have), 1)
                if score >= 0.5 and (best is None or (t == template, score) > (best[0] == template, best[2])):
                    best = (t, entry, score)
        if best:
            return {**best[1], "page": best[0], "same_page": best[0] == template, "matched_intent": best[1]["intent"]}
    return None


def _expand(words):
    from browser_tools import SYNONYMS  # shared vocabulary, imported lazily to avoid a cycle
    return set(words).union(*(SYNONYMS.get(w, set()) for w in words)) if words else set()


def hit(url, intent, page):
    host, _ = page_key(url)
    with _LOCK:
        entry = _site(host)["actions"].get(page, {}).get(norm(intent))
        if entry:
            entry["hits"] = entry.get("hits", 0) + 1
            entry["last_used"] = time.time()
            _save(host)


def forget(url, intent=None, workflow=None):
    host, template = page_key(url)
    removed = []
    with _LOCK:
        site = _site(host)
        if intent:
            for t, actions in site["actions"].items():
                if actions.pop(norm(intent), None):
                    removed.append(f"action {norm(intent)!r} on {t}")
        if workflow and site["workflows"].pop(workflow, None):
            removed.append(f"workflow {workflow!r}")
        _save(host)
    return {"site": host, "removed": removed}


def known(url):
    """What memory holds for this site: actions for this page type first, then the rest of the site."""
    host, template = page_key(url)
    with _LOCK:
        site = _site(host)
        here = sorted(site["actions"].get(template, {}))
        elsewhere = sorted({i for t, a in site["actions"].items() if t != template for i in a} - set(here))
        workflows = {n: {"description": w.get("description", ""), "params": w.get("params", []),
                         "steps": len(w.get("steps", []))} for n, w in site["workflows"].items()}
    return {"site": host, "page": template, "actions_here": here, "actions_elsewhere_on_site": elsewhere,
            "workflows": workflows}


def save_workflow(url, name, description, steps):
    host, _ = page_key(url)
    clean, params = [], []
    for step in steps:
        intent = step.get("intent") or step.get("navigate")
        if not intent:
            raise ValueError(f"Each step needs 'intent' (or 'navigate'): {step}")
        clean.append({k: v for k, v in step.items() if k in {"intent", "value", "navigate"}})
        for found in re.findall(r"\{\{(\w+)\}\}", json.dumps(step)):
            if found not in params:
                params.append(found)
    with _LOCK:
        _site(host)["workflows"][name] = {"description": description, "steps": clean, "params": params,
                                          "created": time.time()}
        _save(host)
    return {"site": host, "workflow": name, "steps": len(clean), "params": params}


def workflow(url, name):
    host, _ = page_key(url)
    with _LOCK:
        return _site(host)["workflows"].get(name), host
