"""Loads config.yaml and resolves repo-relative paths."""
import copy
import os
from functools import lru_cache

import yaml

SCREENER_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCREENER_DIR, "..", ".."))
CONFIG_PATH = os.path.join(SCREENER_DIR, "config.yaml")

INDICATORS = [
    "group_strength",
    "leader",
    "inst_trend",
    "added_owners",
    "sponsor_quality",
    "growth_fund",
    "not_crowded",
]


@lru_cache(maxsize=1)
def _load():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_config():
    """Return a fresh copy so callers (and tests) can mutate it safely."""
    return copy.deepcopy(_load())


def repo_path(*parts):
    return os.path.join(REPO_ROOT, *parts)


def cache_path(cfg, *parts):
    p = repo_path(cfg["paths"]["cache_dir"], *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def hist_path(cfg, *parts):
    p = repo_path(cfg["paths"]["hist_dir"], *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def cache_dir(cfg, *parts):
    p = repo_path(cfg["paths"]["cache_dir"], *parts)
    os.makedirs(p, exist_ok=True)
    return p


def hist_dir(cfg, *parts):
    p = repo_path(cfg["paths"]["hist_dir"], *parts)
    os.makedirs(p, exist_ok=True)
    return p


def output_path(cfg, *parts):
    p = repo_path(cfg["paths"]["output_dir"], *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p
