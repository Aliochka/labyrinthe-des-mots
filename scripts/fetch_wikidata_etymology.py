#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Fetch etymology edges from Wikidata Lexicographical Data (STRICT matching).

- For each French lemma, find Wikidata Lexeme(s) whose wikibase:lemma matches EXACTLY
  (spaces/underscores handled by preparing variants).
- Follow derived from lexeme (P5191): srcLexeme -> tgtLexeme
- Convert target language QID -> ISO code (P218 preferred, else P219, else P220).
- Output JSONL edges to data/etym/lemma_etym_edges.jsonl
- Also writes raw hits for debugging to data/etym/raw_hits.jsonl
"""

import argparse
import json
import os
import sys
import time
from typing import Dict, Iterable, List, Optional, Tuple, Set

import requests

WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
DEFAULT_UA = (
    "labyrinthe-des-mots/1.0 (contact: romain.chaffal@gmail.com) python-requests"
)

WD_FRENCH_LANG_QID = "Q150"
P_DERIVED_FROM_LEXEME = "P5191"  # derived from lexeme
P_ISO639_1 = "P218"
P_ISO639_2 = "P219"
P_ISO639_3 = "P220"


def normalize_lemma(s: str) -> str:
    """Must match your TS normalizeLemma() (as close as possible)."""
    import unicodedata

    s = s.lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")  # strip accents
    s = s.replace("’", "'").replace("`", "'")
    s = s.replace("''", "'")
    s = s.replace("'", "")  # remove apostrophes
    s = "_".join(s.split())
    return s.strip()


def chunked(xs: List[str], n: int) -> Iterable[List[str]]:
    for i in range(0, len(xs), n):
        yield xs[i : i + n]


def read_lemmas_from_graph(graph_path: str) -> List[str]:
    with open(graph_path, "r", encoding="utf-8") as f:
        g = json.load(f)
    lemmas = []
    for node in g.get("nodes", []):
        lemma = node.get("lemma")
        if isinstance(lemma, str) and lemma.strip():
            lemmas.append(lemma.strip())
    return lemmas


def read_lemmas_from_txt(txt_path: str) -> List[str]:
    lemmas = []
    with open(txt_path, "r", encoding="utf-8") as f:
        for line in f:
            t = line.strip()
            if not t or t.startswith("#"):
                continue
            lemmas.append(t)
    return lemmas


def sparql_query(query: str, session: requests.Session, max_retries: int = 5) -> Dict:
    headers = {
        "Accept": "application/sparql-results+json",
        "User-Agent": session.headers.get("User-Agent", DEFAULT_UA),
    }

    backoff = 2.0
    for attempt in range(1, max_retries + 1):
        try:
            r = session.get(
                WIKIDATA_SPARQL, params={"query": query}, headers=headers, timeout=90
            )
            if r.status_code == 429:
                wait = float(r.headers.get("Retry-After", backoff))
                time.sleep(wait)
                backoff *= 1.7
                continue
            r.raise_for_status()
            return r.json()
        except Exception:
            if attempt == max_retries:
                raise
            time.sleep(backoff)
            backoff *= 1.7

    raise RuntimeError("unreachable")


def qid_from_uri(uri: str) -> str:
    return uri.rsplit("/", 1)[-1]


def build_batch_query(fr_lemmas_norm: List[str]) -> Tuple[str, List[str]]:
    needles = []
    for l in fr_lemmas_norm:
        needles.append(l.replace("_", " "))
    needles = list(dict.fromkeys(needles))

    values = " ".join(json.dumps(v) for v in needles)

    query = f"""
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX ontolex: <http://www.w3.org/ns/lemon/ontolex#>

SELECT ?srcLexeme ?srcLemma ?tgtLexeme ?tgtLemma ?tgtLang WHERE {{
  VALUES ?needle {{ {values} }}

  ?srcLexeme a ontolex:LexicalEntry ;
            dct:language wd:{WD_FRENCH_LANG_QID} ;
            wikibase:lemma ?srcLemma .

  FILTER(STR(?srcLemma) = ?needle)

  ?srcLexeme wdt:{P_DERIVED_FROM_LEXEME} ?tgtLexeme .
  ?tgtLexeme wikibase:lemma ?tgtLemma ;
             dct:language ?tgtLang .
}}
"""
    return query, needles


def build_language_map_query(lang_qids: List[str]) -> str:
    """
    Map language item QIDs to ISO codes:
    Prefer ISO 639-1 (P218), else ISO 639-2 (P219), else ISO 639-3 (P220).
    """
    # VALUES wd:Qxxx ...
    values = " ".join(f"wd:{qid}" for qid in lang_qids)

    return f"""
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>

SELECT ?lang ?iso1 ?iso2 ?iso3 WHERE {{
  VALUES ?lang {{ {values} }}
  OPTIONAL {{ ?lang wdt:{P_ISO639_1} ?iso1 . }}
  OPTIONAL {{ ?lang wdt:{P_ISO639_2} ?iso2 . }}
  OPTIONAL {{ ?lang wdt:{P_ISO639_3} ?iso3 . }}
}}
"""


def ensure_dir(p: str) -> None:
    os.makedirs(p, exist_ok=True)


def choose_iso(iso1: Optional[str], iso2: Optional[str], iso3: Optional[str]) -> str:
    # iso2 sometimes returns "lat" for Latin (ok but you asked for "la" if exists)
    if iso1 and iso1.strip():
        return iso1.strip()
    if iso2 and iso2.strip():
        return iso2.strip()
    if iso3 and iso3.strip():
        return iso3.strip()
    return "und"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--graph", help="Path to lemma graph JSON (FR nodes).")
    ap.add_argument("--lemmas", help="Path to lemmas_fr.txt (one per line).")
    ap.add_argument("--out", default="./data/etym/lemma_etym_edges.jsonl")
    ap.add_argument("--raw", default="./data/etym/raw_hits.jsonl")
    ap.add_argument("--batch", type=int, default=50, help="SPARQL batch size (lemmas).")
    ap.add_argument(
        "--max", type=int, default=0, help="Max lemmas to process (0 = all)."
    )
    ap.add_argument(
        "--capPerSource", type=int, default=5, help="Max etym edges per FR lemma."
    )
    ap.add_argument(
        "--sleep", type=float, default=0.25, help="Polite delay between queries."
    )
    ap.add_argument("--userAgent", default=DEFAULT_UA)
    args = ap.parse_args()

    if not args.graph and not args.lemmas:
        print("❌ Provide --graph or --lemmas", file=sys.stderr)
        sys.exit(1)

    # Load lemma list
    if args.graph:
        fr_lemmas = read_lemmas_from_graph(args.graph)
    else:
        fr_lemmas = read_lemmas_from_txt(args.lemmas)

    # Dedup
    fr_lemmas = [l.strip() for l in fr_lemmas if l.strip()]
    fr_lemmas = list(dict.fromkeys(fr_lemmas))

    if args.max and args.max > 0:
        fr_lemmas = fr_lemmas[: args.max]

    ensure_dir(os.path.dirname(args.out))
    ensure_dir(os.path.dirname(args.raw))

    session = requests.Session()
    session.headers["User-Agent"] = args.userAgent

    # Collect edges grouped by normalized FR lemma
    collected: Dict[str, List[dict]] = {}
    seen_edges: Set[Tuple[str, str, str]] = (
        set()
    )  # (srcNorm, tgtNormWithLang, direction)

    # Collect language QIDs encountered
    lang_qids_seen: Set[str] = set()

    raw_f = open(args.raw, "w", encoding="utf-8")
    out_f = open(args.out, "w", encoding="utf-8")

    try:
        total_lemmas = 0
        total_links = 0

        for batch in chunked(fr_lemmas, args.batch):
            total_lemmas += len(batch)

            query, needles = build_batch_query(batch)
            data = sparql_query(query, session=session)

            raw_f.write(
                json.dumps({"needles": needles, "results": data}, ensure_ascii=False)
                + "\n"
            )
            raw_f.flush()

            bindings = data.get("results", {}).get("bindings", [])
            for b in bindings:
                src_lemma = b["srcLemma"]["value"]
                src_norm = normalize_lemma(src_lemma)

                tgt_lemma = b["tgtLemma"]["value"]
                tgt_norm = normalize_lemma(tgt_lemma)

                tgt_lang_uri = b["tgtLang"]["value"]
                tgt_lang_qid = qid_from_uri(tgt_lang_uri)
                lang_qids_seen.add(tgt_lang_qid)

                direction = "derived_from"
                confidence = 1.0

                # temporary key (will be finalized after lang mapping)
                # dedupe only on qid for now + tgt lemma norm
                tgt_key_temp = f"{tgt_lang_qid}:{tgt_norm}"
                sig = (src_norm, tgt_key_temp, direction)
                if sig in seen_edges:
                    continue
                seen_edges.add(sig)

                edge = {
                    "source": src_norm,
                    "target": tgt_lemma,  # keep original spelling for display
                    "targetNorm": tgt_norm,  # normalized for merge
                    "langQid": tgt_lang_qid,  # will map to ISO
                    "lang": "und",  # filled later
                    "direction": direction,
                    "confidence": confidence,
                    "evidence": {
                        "provider": "wikidata",
                        "property": P_DERIVED_FROM_LEXEME,
                        "srcLexeme": qid_from_uri(b["srcLexeme"]["value"]),
                        "tgtLexeme": qid_from_uri(b["tgtLexeme"]["value"]),
                        "retrieved_at": time.strftime("%Y-%m-%d"),
                    },
                }

                collected.setdefault(src_norm, []).append(edge)
                total_links += 1

            time.sleep(args.sleep)

        print(
            f"📌 Strict fetch done. Lemmas processed={total_lemmas}, raw etym links={total_links}"
        )
        print(f"🌐 Distinct target language QIDs found: {len(lang_qids_seen)}")

        # Build language QID -> ISO code map
        lang_map: Dict[str, str] = {}
        if lang_qids_seen:
            qids = sorted(lang_qids_seen)
            # Query in chunks (just in case)
            for qchunk in chunked(qids, 100):
                q = build_language_map_query(qchunk)
                d = sparql_query(q, session=session)

                for b in d.get("results", {}).get("bindings", []):
                    qid = qid_from_uri(b["lang"]["value"])
                    iso1 = b.get("iso1", {}).get("value")
                    iso2 = b.get("iso2", {}).get("value")
                    iso3 = b.get("iso3", {}).get("value")
                    lang_map[qid] = choose_iso(iso1, iso2, iso3)

                time.sleep(args.sleep)

        # Write final edges with ISO lang + capPerSource
        written = 0
        for src_norm, edges in collected.items():
            # sort by confidence desc (all 1.0 for strict mode)
            edges_sorted = sorted(
                edges, key=lambda e: e.get("confidence", 1.0), reverse=True
            )
            kept = edges_sorted[: max(0, args.capPerSource)]

            for e in kept:
                qid = e.get("langQid", "")
                e["lang"] = lang_map.get(qid, "und")

                # For merge convenience, keep target as display, but we also provide normalized target
                # Merge script can use `targetNorm` + `lang`.
                out_f.write(json.dumps(e, ensure_ascii=False) + "\n")
                written += 1

        out_f.flush()

        print("✅ Done.")
        print(f"  edges written (capPerSource={args.capPerSource}): {written}")
        print(f"  out: {os.path.abspath(args.out)}")
        print(f"  raw: {os.path.abspath(args.raw)}")
        print(
            "  note: target lemma kept as display; use targetNorm + lang for stable ids in merge."
        )

    finally:
        raw_f.close()
        out_f.close()


if __name__ == "__main__":
    main()
