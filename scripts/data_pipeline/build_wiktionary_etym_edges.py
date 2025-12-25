#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build etymology edges from frwiktionary extracted raw etym sections.

Input JSONL (from extract_frwiktionary_etym_raw.py):
  {"title":"accueil","etym_raw":"...","source":"frwiktionary"}

Output JSONL edges:
  {
    "source": "accueil",
    "target": "accueillir",
    "targetNorm": "accueillir",
    "lang": "fr",
    "direction": "derived_from",
    "confidence": 0.75,
    "evidence": {"provider":"wiktionary","title":"accueil","pattern":"lien","snippet":"..."}
  }

V2 features:
- Extract from {{étyl|...|fr|mot=...}} (high confidence)
- Extract from {{lien|...|xx}} (medium confidence)
- Extract from [[...]] links (low confidence; lang=unknown unless we can infer)
- Caps: per-source, optional per-pattern
- Allowlist langs
"""

import argparse
import json
import re
import sys
import unicodedata
from dataclasses import dataclass
from typing import Iterable, List, Optional, Set, Tuple, Dict


# ----------------------------
# Regexes
# ----------------------------

# {{étyl|la|fr|mot=lego|dif=lĕgĕre|...}}
ETYL_RE = re.compile(
    r"\{\{\s*étyl\s*\|\s*([^|}]+)\s*\|\s*fr\s*\|([^}]*)\}\}",
    re.IGNORECASE
)
KV_RE = re.compile(r"([a-zA-Z_]+)\s*=\s*([^|]+)")

# {{lien|encyclique|fr}} or {{lien|παιδεία|grc|...}}
LIEN_RE = re.compile(
    r"\{\{\s*lien\s*\|\s*([^|}]+)\s*\|\s*([^|}\s]+)(?:\|[^}]*)?\}\}",
    re.IGNORECASE
)

# [[mot]] or [[mot|affichage]]
WIKI_LINK_RE = re.compile(r"\[\[\s*([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\s*\]\]")

# Exclude namespaces / non-lemma targets
BAD_PREFIX_RE = re.compile(
    r"^(?:"
    r"Wiktionnaire|Aide|Catégorie|Portail|MediaWiki|Modèle|Annexe|"
    r"Fichier|File|Image|Special|Spécial|Discussion|Utilisateur|User"
    r")\s*:",
    re.IGNORECASE
)

# Some junk tokens often appear as template args
JUNK_TARGET_RE = re.compile(r"^(?:id\.|idem|ibid\.|voir|cf\.?)$", re.IGNORECASE)


# ----------------------------
# Normalization
# ----------------------------

def norm_text(s: str) -> str:
    s = (s or "").strip()
    s = s.replace("\u2019", "'")   # curly apostrophe
    s = s.replace("\u00A0", " ")   # nbsp
    s = re.sub(r"\s+", " ", s)
    return s

def norm_lemma(s: str) -> str:
    s = norm_text(s).lower()
    s = s.strip(" \t\n\r\"“”'’[]()")
    s = unicodedata.normalize("NFC", s)
    return s

def is_bad_target(t: str) -> bool:
    t = norm_text(t)
    if not t:
        return True
    if BAD_PREFIX_RE.match(t):
        return True
    if t.startswith("#"):
        return True
    if JUNK_TARGET_RE.match(t):
        return True
    # avoid crazy long stuff (often full phrases)
    if len(t) > 80:
        return True
    return False


# ----------------------------
# Extractors
# ----------------------------

@dataclass(frozen=True)
class Candidate:
    lang: str
    target: str
    pattern: str   # "etyl" | "lien" | "wikilink"
    confidence: float
    snippet: str

def snippet_around(text: str, start: int, end: int, radius: int = 90) -> str:
    s = max(0, start - radius)
    e = min(len(text), end + radius)
    return norm_text(text[s:e])[:300]

def extract_etyl(etym_raw: str) -> List[Candidate]:
    out: List[Candidate] = []
    for m in ETYL_RE.finditer(etym_raw):
        lang = norm_text(m.group(1))
        args = m.group(2) or ""
        kv = {k.lower(): norm_text(v) for k, v in KV_RE.findall(args)}
        target = kv.get("mot") or kv.get("dif") or ""
        target = norm_text(target)
        if is_bad_target(target):
            continue
        out.append(Candidate(
            lang=lang,
            target=target,
            pattern="etyl",
            confidence=0.90,
            snippet=snippet_around(etym_raw, m.start(), m.end())
        ))
    return out

def extract_lien(etym_raw: str) -> List[Candidate]:
    out: List[Candidate] = []
    for m in LIEN_RE.finditer(etym_raw):
        target = norm_text(m.group(1))
        lang = norm_text(m.group(2))
        if is_bad_target(target):
            continue
        out.append(Candidate(
            lang=lang,
            target=target,
            pattern="lien",
            confidence=0.75,
            snippet=snippet_around(etym_raw, m.start(), m.end())
        ))
    return out

def extract_wikilinks(etym_raw: str) -> List[Candidate]:
    out: List[Candidate] = []
    for m in WIKI_LINK_RE.finditer(etym_raw):
        target = norm_text(m.group(1))
        if is_bad_target(target):
            continue
        # For wikilinks, we often don't know the language; treat as unknown.
        out.append(Candidate(
            lang="unknown",
            target=target,
            pattern="wikilink",
            confidence=0.60,
            snippet=snippet_around(etym_raw, m.start(), m.end())
        ))
    return out


# ----------------------------
# Build edges
# ----------------------------

def build_edge(source_title: str, cand: Candidate, direction: str = "derived_from") -> dict:
    return {
        "source": norm_lemma(source_title),
        "target": cand.target,
        "targetNorm": norm_lemma(cand.target),
        "lang": norm_text(cand.lang),
        "direction": direction,
        "confidence": float(cand.confidence),
        "evidence": {
            "provider": "wiktionary",
            "title": source_title,
            "pattern": cand.pattern,
            "snippet": cand.snippet,
        },
    }

def iter_jsonl(path: str) -> Iterable[dict]:
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


# ----------------------------
# Main
# ----------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="data/wiktionary/fr_etym_raw.jsonl")
    ap.add_argument("--output", required=True, help="data/etym/lemma_etym_edges.jsonl")

    ap.add_argument("--cap-per-source", type=int, default=8, help="max edges per source lemma (after dedupe)")
    ap.add_argument("--cap-per-pattern", default="etyl=5,lien=3,wikilink=2",
                    help="per-pattern caps, e.g. 'etyl=5,lien=3,wikilink=2' (empty disables)")
    ap.add_argument("--min-target-len", type=int, default=2)
    ap.add_argument("--allow-langs", default="",
                    help="comma-separated lang codes to keep. "
                         "If empty: keep all. "
                         "Note: wikilink uses lang='unknown'.")

    args = ap.parse_args()

    allow_langs: Set[str] = set()
    if args.allow_langs.strip():
        allow_langs = {x.strip().lower() for x in args.allow_langs.split(",") if x.strip()}

    # parse cap-per-pattern
    cap_per_pattern: Dict[str, int] = {}
    if args.cap_per_pattern.strip():
        for part in args.cap_per_pattern.split(","):
            part = part.strip()
            if not part:
                continue
            if "=" not in part:
                continue
            k, v = part.split("=", 1)
            k = k.strip()
            try:
                cap_per_pattern[k] = int(v.strip())
            except ValueError:
                pass

    written = 0
    with open(args.output, "w", encoding="utf-8") as out:
        for obj in iter_jsonl(args.input):
            title = obj.get("title")
            etym_raw = obj.get("etym_raw")
            if not title or not etym_raw:
                continue

            # Collect candidates (ordered by reliability)
            candidates: List[Candidate] = []
            candidates.extend(extract_etyl(etym_raw))
            candidates.extend(extract_lien(etym_raw))
            candidates.extend(extract_wikilinks(etym_raw))

            if not candidates:
                continue

            # Dedupe by (langLower, targetNorm)
            seen: Set[Tuple[str, str]] = set()
            emitted_total = 0
            emitted_by_pattern: Dict[str, int] = {}

            for cand in candidates:
                tnorm = norm_lemma(cand.target)
                if len(tnorm) < args.min_target_len:
                    continue
                if is_bad_target(cand.target):
                    continue

                lang_key = cand.lang.lower()
                # Apply allow-langs
                if allow_langs and lang_key not in allow_langs:
                    # allow unknown only if explicitly allowed
                    continue

                key = (lang_key, tnorm)
                if key in seen:
                    continue
                seen.add(key)

                # per-pattern cap
                if cap_per_pattern:
                    cap = cap_per_pattern.get(cand.pattern)
                    if cap is not None:
                        cur = emitted_by_pattern.get(cand.pattern, 0)
                        if cur >= cap:
                            continue

                edge = build_edge(title, cand)
                out.write(json.dumps(edge, ensure_ascii=False) + "\n")
                written += 1

                emitted_total += 1
                emitted_by_pattern[cand.pattern] = emitted_by_pattern.get(cand.pattern, 0) + 1

                if emitted_total >= args.cap_per_source:
                    break

    print(f"✅ edges written: {written}", file=sys.stderr)

if __name__ == "__main__":
    main()
