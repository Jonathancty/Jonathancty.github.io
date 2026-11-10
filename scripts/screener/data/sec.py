"""SEC EDGAR access: fair-access User-Agent, rate limiting, dataset discovery and downloads.

SEC requires every automated request to identify itself with a contact email
(https://www.sec.gov/os/accessing-edgar-data). The email is read from the
SEC_CONTACT_EMAIL environment variable (a GitHub Actions secret), so it is never
committed to the public repo.
"""
import os
import re
import time
from datetime import datetime, timedelta

import requests

SEC_BASE = "https://www.sec.gov"


class SecClient:
    def __init__(self, cfg):
        sec_cfg = cfg["sec"]
        email = os.environ.get(sec_cfg["user_agent_env"], "").strip()
        if not email or "@" not in email:
            raise RuntimeError(
                f"Set the {sec_cfg['user_agent_env']} environment variable (GitHub secret) to a contact "
                "email. SEC blocks automated requests without one."
            )
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": f"{sec_cfg['app_name']} {email}",
            "Accept-Encoding": "gzip, deflate",
        })
        self.min_interval = 1.0 / float(sec_cfg["max_requests_per_second"])
        self._last = 0.0

    def _throttle(self):
        wait = self.min_interval - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()

    def get(self, url, stream=False, timeout=60, retries=4):
        for attempt in range(retries):
            self._throttle()
            try:
                r = self.session.get(url, stream=stream, timeout=timeout)
            except requests.RequestException as e:
                if attempt == retries - 1:
                    raise
                time.sleep(2 ** attempt * 2)
                continue
            if r.status_code in (429, 503) or (r.status_code == 403 and attempt < retries - 1):
                # 403 is SEC's rate-limit response too; back off hard
                time.sleep(10 * (attempt + 1))
                continue
            r.raise_for_status()
            return r
        r.raise_for_status()
        return r

    def get_json(self, url):
        return self.get(url).json()

    def exists(self, url, retries=4):
        """True if the URL serves a file (200), False on 404. Only response headers are read."""
        for attempt in range(retries):
            self._throttle()
            try:
                r = self.session.get(url, stream=True, timeout=30)
                r.close()
            except requests.RequestException:
                time.sleep(2 ** attempt * 2)
                continue
            if r.status_code == 200:
                return True
            if r.status_code == 404:
                return False
            time.sleep(10 * (attempt + 1))           # 403/429/503 = throttled: back off
        return False

    def download(self, url, dest):
        """Stream a (large) file to disk; skip if already present."""
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            return dest
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        tmp = dest + ".part"
        r = self.get(url, stream=True, timeout=300)
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
        os.replace(tmp, dest)
        return dest


# ---------------------------------------------------------------------------
# Dataset discovery (parses the SEC listing pages for zip links)
# ---------------------------------------------------------------------------
_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}


def parse_13f_zip_name(name):
    """Return (start, end_exclusive) of the filing window a 13F data-set zip covers.

    Formats: '2023q4_form13f.zip' (filed in that calendar quarter) and
    '01jun2026-31aug2026_form13f.zip' (3-month windows since 2024).
    """
    m = re.match(r"(\d{4})q([1-4])_form13f\.zip$", name)
    if m:
        y, q = int(m.group(1)), int(m.group(2))
        start = datetime(y, 3 * q - 2, 1)
        end = datetime(y + 1, 1, 1) if q == 4 else datetime(y, 3 * q + 1, 1)
        return start, end
    m = re.match(r"(\d{2})([a-z]{3})(\d{4})-(\d{2})([a-z]{3})(\d{4})_form13f\.zip$", name)
    if m:
        start = datetime(int(m.group(3)), _MONTHS[m.group(2)], int(m.group(1)))
        end = datetime(int(m.group(6)), _MONTHS[m.group(5)], int(m.group(4))) + timedelta(days=1)
        return start, end
    return None


def parse_nport_zip_name(name):
    m = re.match(r"(\d{4})q([1-4])_nport\.zip$", name)
    if not m:
        return None
    return int(m.group(1)), int(m.group(2))


def list_datasets(client, page_url, suffix):
    html = client.get(page_url).text
    hrefs = set(re.findall(r'href="([^"]+' + re.escape(suffix) + r')"', html))
    out = {}
    for h in hrefs:
        url = h if h.startswith("http") else SEC_BASE + h
        out[url.rsplit("/", 1)[-1]] = url
    return out


# ---------------------------------------------------------------------------
# Fallback discovery: SEC's listing pages can 404/403 for automated clients, but the zip
# files follow fixed naming patterns. Build the expected names and probe which exist.
# ---------------------------------------------------------------------------
_MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
F13_DIRS = ["/files/datastandardsinnovation/data/form-13f-data-sets/", "/files/structureddata/data/form-13f-data-sets/"]
NPORT_DIRS = ["/files/dera/data/form-n-port-data-sets/", "/files/datastandardsinnovation/data/form-n-port-data-sets/",
              "/files/structureddata/data/form-n-port-data-sets/"]


def _last_day(y, m):
    return (datetime(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)).day


def candidate_13f_names(today):
    """Expected 13F zip names, oldest first, for windows that have already ended."""
    names = [f"{y}q{q}_form13f.zip" for y in range(2013, 2024) for q in range(1, 5) if (y, q) >= (2013, 2)]
    names.append("01jan2024-29feb2024_form13f.zip")
    y = 2024
    while True:
        for sm in (3, 6, 9, 12):
            em, ey = (sm + 2 - 1) % 12 + 1, y + (sm + 2 > 12)
            end = datetime(ey, em, _last_day(ey, em))
            if end >= today:
                return names
            names.append(f"01{_MON[sm - 1]}{y}-{_last_day(ey, em):02d}{_MON[em - 1]}{ey}_form13f.zip")
        y += 1


def candidate_nport_names(today):
    out = []
    for y in range(2019, today.year + 1):
        for q in range(1, 5):
            if (y, q) < (2019, 4):
                continue
            if datetime(y, 3 * q, _last_day(y, 3 * q)) >= today:
                return out
            out.append(f"{y}q{q}_nport.zip")
    return out


def probe_datasets(client, names, dirs, cache_file):
    """Find each name under one of `dirs`; results are cached because published files never move."""
    import json
    known = {}
    if cache_file and os.path.exists(cache_file):
        with open(cache_file) as f:
            known = json.load(f)
    found = {}
    for name in names:
        if name in known:
            found[name] = known[name]
            continue
        for d in dirs:
            url = SEC_BASE + d + name
            if client.exists(url):
                found[name] = known[name] = url
                break
    if cache_file:
        os.makedirs(os.path.dirname(cache_file), exist_ok=True)
        with open(cache_file, "w") as f:
            json.dump(known, f, indent=1, sort_keys=True)
    print(f"  probed {len(names)} expected file names, found {len(found)}")
    return found


def _discover(client, page_url, suffix, names, dirs, cache_file):
    try:
        found = list_datasets(client, page_url, suffix)
        if found:
            return found
        print(f"  listing page had no {suffix} links; probing file names instead")
    except requests.RequestException as e:
        print(f"  listing page unavailable ({e}); probing file names instead")
    return probe_datasets(client, names, dirs, cache_file)


def list_13f_datasets(client, cfg, recent=None, cache_file=None):
    """recent=N limits probing to the newest N expected files (live mode)."""
    names = candidate_13f_names(datetime.now())
    if recent:
        names = names[-recent:]
    found = _discover(client, cfg["sec"]["datasets_13f_page"], "_form13f.zip", names, F13_DIRS, cache_file)
    rows = []
    for name, url in found.items():
        win = parse_13f_zip_name(name)
        if win:
            rows.append({"name": name, "url": url, "start": win[0], "end": win[1]})
    return sorted(rows, key=lambda r: r["start"])


def list_nport_datasets(client, cfg, recent=None, cache_file=None):
    names = candidate_nport_names(datetime.now())
    if recent:
        names = names[-recent:]
    found = _discover(client, cfg["sec"]["datasets_nport_page"], "_nport.zip", names, NPORT_DIRS, cache_file)
    rows = []
    for name, url in found.items():
        yq = parse_nport_zip_name(name)
        if yq:
            rows.append({"name": name, "url": url, "year": yq[0], "quarter": yq[1]})
    return sorted(rows, key=lambda r: (r["year"], r["quarter"]))


def company_tickers(client):
    """SEC's ticker -> CIK map (https://www.sec.gov/files/company_tickers.json)."""
    data = client.get_json(SEC_BASE + "/files/company_tickers.json")
    return {v["ticker"].upper().replace(".", "-"): int(v["cik_str"]) for v in data.values()}
