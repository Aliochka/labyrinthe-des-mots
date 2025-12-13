#!/usr/bin/env python3
import json, re, argparse
import pandas as pd

RE_NUMERIC = re.compile(r"^[+-]?\d+([.,]\d+)?$")
RE_DATE1 = re.compile(r"^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$")  # 12/03/1999
RE_DATE2 = re.compile(r"^\d{4}[/-]\d{1,2}[/-]\d{1,2}$")  # 1999-03-12
RE_DATE3 = re.compile(r"^\d{1,2}[.-]\d{1,2}[.-]\d{2,4}$")  # 12.03.1999
RE_TIME = re.compile(r"^\d{1,2}:\d{2}(:\d{2})?$")  # 12:30 or 12:30:00
RE_HAS_LETTER = re.compile(r"[a-zA-ZÀ-ÖØ-öø-ÿ]")  # broad letters


def reasons_for(lemma: str, relation_count: int) -> list[str]:
    r = []
    if RE_NUMERIC.match(lemma):
        r.append("numeric")
    if RE_DATE1.match(lemma) or RE_DATE2.match(lemma) or RE_DATE3.match(lemma):
        r.append("date_like")
    if RE_TIME.match(lemma):
        r.append("time_like")
    if not RE_HAS_LETTER.search(lemma):
        r.append("no_letter")
    if len(lemma) <= 2 and not RE_HAS_LETTER.search(lemma):
        r.append("too_short_nonalpha")
    # affix-ish (optional; comment out if too aggressive)
    if lemma.startswith("-") or lemma.endswith("-"):
        r.append("affix_like")
    if relation_count == 0:
        r.append("no_relations")
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--graph", required=True)
    ap.add_argument("--out", default="lemma_suspects.csv")
    ap.add_argument("--limit", type=int, default=200)
    args = ap.parse_args()

    with open(args.graph, "r", encoding="utf-8") as f:
        raw = json.load(f)

    nodes = raw["nodes"]
    rows = []
    for n in nodes:
        lemma = str(n.get("lemma", ""))
        rc = int(n.get("relationCount", 0))
        rs = reasons_for(lemma, rc)
        if rs:
            rows.append(
                {
                    "lemma": lemma,
                    "senseCount": n.get("senseCount", None),
                    "relationCount": rc,
                    "reasons": ",".join(rs),
                }
            )

    df = pd.DataFrame(rows).sort_values(
        ["relationCount", "senseCount"], ascending=[True, False]
    )

    df.to_csv(args.out, index=False)

    # console summary
    print("✅ Audit terminé")
    print(f"Total nodes: {len(nodes)}")
    print(f"Suspects: {len(df)}  ({(len(df) / len(nodes)) * 100:.2f}%)")
    print("\nTop reasons:")
    reason_counts = df["reasons"].str.split(",").explode().value_counts()
    print(reason_counts.head(20).to_string())

    print(f"\nExemples (top {args.limit}):")
    print(df.head(args.limit).to_string(index=False))

    print(f"\n→ CSV: {args.out}")


if __name__ == "__main__":
    main()
