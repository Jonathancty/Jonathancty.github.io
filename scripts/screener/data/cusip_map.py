"""CUSIP -> ticker mapping.

Primary source: the tickers mutual funds report next to each holding in N-PORT (free,
already downloaded). Fallback: OpenFIGI's free mapping API for widely held CUSIPs that
N-PORT didn't cover. Results are cached in _screener_cache/cusip_map.json.
"""
import json
import os
import time

import requests

OPENFIGI_URL = "https://api.openfigi.com/v3/mapping"


def load(path):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {}


def save(path, m):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(m, f, separators=(",", ":"), sort_keys=True)


def openfigi_lookup(cusips, api_key=None, max_lookups=2500):
    """Returns {cusip: ticker or None}. Free tier without a key: 25 requests/min, 10 jobs each;
    with a key: 25 requests / 6 s, 100 jobs each."""
    per_req = 100 if api_key else 10
    pause = 0.25 if api_key else 2.6
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-OPENFIGI-APIKEY"] = api_key
    out = {}
    cusips = list(cusips)[:max_lookups]
    for i in range(0, len(cusips), per_req):
        chunk = cusips[i:i + per_req]
        body = [{"idType": "ID_CUSIP", "idValue": c, "exchCode": "US"} for c in chunk]
        for attempt in range(3):
            try:
                r = requests.post(OPENFIGI_URL, json=body, headers=headers, timeout=30)
                if r.status_code == 429:
                    time.sleep(30)
                    continue
                r.raise_for_status()
                for c, res in zip(chunk, r.json()):
                    data = res.get("data") or []
                    common = [d for d in data if (d.get("securityType") or "").lower() in
                              ("common stock", "adr", "depositary receipt", "reit")] or data
                    t = common[0].get("ticker") if common else None
                    out[c] = t.replace("/", "-").replace(".", "-").upper() if t else None
                break
            except requests.RequestException as e:
                print(f"  openfigi: {e}")
                time.sleep(10)
        time.sleep(pause)
    return out


def update(path, nport_map, unmapped_widely_held, cfg):
    m = load(path)
    m.update({k: v for k, v in nport_map.items() if v})
    todo = [c for c in unmapped_widely_held if c not in m]
    if todo:
        key = os.environ.get(cfg["openfigi"]["api_key_env"]) or None
        print(f"OpenFIGI: looking up {min(len(todo), cfg['openfigi']['max_lookups_per_run'])} CUSIPs")
        m.update(openfigi_lookup(todo, key, cfg["openfigi"]["max_lookups_per_run"]))
    save(path, m)
    return m


def ticker_to_cusips(m):
    inv = {}
    for c, t in m.items():
        if t:
            inv.setdefault(t, []).append(c)
    return inv
