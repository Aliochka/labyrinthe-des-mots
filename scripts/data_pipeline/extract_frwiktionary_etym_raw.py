# scripts/extract_frwiktionary_etym_raw.py
import bz2, json, re
import mwxml

LANG_FR_PATTERNS = [
    re.compile(r"^==\s*\{\{\s*langue\s*\|\s*fr\s*\}\}\s*==\s*$", re.I),
    re.compile(r"^==\s*français\s*==\s*$", re.I),
]
ETYMO_HEADING_PATTERNS = [
    re.compile(r"^===\s*\{\{\s*S\s*\|\s*étymologie\s*\}\}\s*===\s*$", re.I),
    re.compile(r"^===\s*étymologie\s*===\s*$", re.I),
]

REDIRECT_RE = re.compile(r"(?im)^\s*#redirect\s*\[\[(.*?)\]\]\s*$")

def is_main_title(title: str) -> bool:
    return ":" not in title  # skip namespaces

def get_last_revision_text(page) -> str | None:
    last = None
    for rev in page:  # mwxml Page is iterable over revisions
        last = rev
    if last is None:
        return None
    return last.text

def find_section_lines(lines, start_idx):
    out = []
    i = start_idx + 1
    while i < len(lines):
        line = lines[i]
        # stop at next heading of same or higher level
        if line.startswith("===") and not line.startswith("===="):
            break
        if line.startswith("==") and not line.startswith("==="):
            break
        out.append(line)
        i += 1
    return "\n".join(out).strip()

def extract_fr_etym(text: str):
    # skip redirects fast
    if REDIRECT_RE.search(text):
        return None

    lines = text.splitlines()
    in_fr = False

    for i, raw in enumerate(lines):
        line = raw.strip()

        # enter FR section
        if any(p.match(line) for p in LANG_FR_PATTERNS):
            in_fr = True
            continue

        # leave FR section at next level-2 heading
        if in_fr and line.startswith("==") and not line.startswith("==="):
            if not any(p.match(line) for p in LANG_FR_PATTERNS):
                in_fr = False

        # inside FR section: look for Etymology heading
        if in_fr and any(p.match(line) for p in ETYMO_HEADING_PATTERNS):
            et = find_section_lines(lines, i)
            return et if et else None

    return None

def main(dump_bz2_path: str, out_path: str):
    with bz2.open(dump_bz2_path, "rb") as f, open(out_path, "w", encoding="utf-8") as out:
        dump = mwxml.Dump.from_file(f)
        for page in dump:
            title = page.title
            if not is_main_title(title):
                continue

            text = get_last_revision_text(page)
            if not text:
                continue

            et = extract_fr_etym(text)
            if not et:
                continue

            out.write(json.dumps(
                {"title": title, "etym_raw": et, "source": "frwiktionary"},
                ensure_ascii=False
            ) + "\n")

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python extract_frwiktionary_etym_raw.py <dump.xml.bz2> <out.jsonl>")
    main(sys.argv[1], sys.argv[2])
