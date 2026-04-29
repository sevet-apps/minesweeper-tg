#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build two dictionaries for the Russian Wordle clone in Spark Games.

Outputs (next to this script):
  wordle_dict.txt     — valid-guess pool (large; used to validate user input)
  wordle_answers.txt  — answer pool (smaller; words that get picked as the puzzle)

Sources:
  1. danakt/russian-words            — base wordlist (windows-1251)
  2. OpenCorpora dict.opcorpora      — morphology, used for noun lemmas + exclusion tags
  3. hermitdave/FrequencyWords       — subtitle frequency, top 20k
  4. RNC / Lyashevskaya–Sharov 2011  — corpus frequency, top 10k common nouns

Usage:
    python build_wordle_dicts.py

Roughly 200-400 MB of downloads, run-once. Cached in ./_wordle_cache.
Run takes ~1-3 minutes depending on network.
"""

import os
import re
import sys
import io
import zipfile
import unicodedata
import urllib.request
import urllib.error
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = HERE / "_wordle_cache"
CACHE.mkdir(exist_ok=True)

OUT_VALID    = HERE / "wordle_dict.txt"     # large pool (validation)
OUT_ANSWERS  = HERE / "wordle_answers.txt"  # small pool (answers)

URLS = {
    "danakt":     "https://raw.githubusercontent.com/danakt/russian-words/master/russian.txt",
    "opcorpora":  "https://opencorpora.org/files/export/dict/dict.opcorpora.txt.zip",
    "hermit":     "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/ru/ru_50k.txt",
    "rnc":        "http://dict.ruslang.ru/Freq2011.zip",
}

# OpenCorpora tags whose presence on a lemma DISQUALIFIES it from being an answer
# (we don't want proper names, abbreviations, surnames, geo, etc.)
BAD_TAGS = {"Name", "Surn", "Patr", "Geox", "Orgn", "Abbr", "Init", "Trad"}

# Manual blocklist: vulgarities, slurs, awkward words, etc. Add freely.
BLOCKLIST = {
    "хохол", "хохлы", "пидор", "пидар", "сучка", "блядь", "хуйня", "хуйло",
    "пизда", "ебать", "ёбарь", "мразь", "гнида",
    # Add more as you find unwanted answers in production
}

# Letters Wordle expects. Yo (ё) is folded to е (standard convention).
ALLOWED_LETTERS = set("абвгдежзийклмнопрстуфхцчшщъыьэюя")


def normalize(word: str) -> str:
    """Lowercase, strip, fold ё→е, NFC."""
    w = unicodedata.normalize("NFC", word).strip().lower()
    w = w.replace("ё", "е")
    return w


def is_clean_word(word: str) -> bool:
    """Russian-letters-only, no whitespace/punctuation, length 5."""
    if len(word) != 5:
        return False
    return all(ch in ALLOWED_LETTERS for ch in word)


# -------- downloads --------------------------------------------------------

def download(name: str) -> Path:
    url = URLS[name]
    ext = ".txt.zip" if name in ("opcorpora", "rnc") else ".txt"
    dest = CACHE / f"{name}{ext}"
    if dest.exists() and dest.stat().st_size > 1024:
        print(f"  [cache] {name}: {dest.name} ({dest.stat().st_size//1024} KB)")
        return dest
    print(f"  [http]  {name}: GET {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 wordle-dict-builder"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
    except urllib.error.URLError as e:
        print(f"  [error] {name}: {e}")
        sys.exit(1)
    dest.write_bytes(data)
    print(f"  [done]  {name}: {dest.stat().st_size//1024} KB")
    return dest


# -------- parsers ----------------------------------------------------------

def load_danakt() -> set:
    p = download("danakt")
    out = set()
    raw = p.read_bytes()
    # File is windows-1251
    text = raw.decode("windows-1251", errors="ignore")
    for line in text.splitlines():
        w = normalize(line)
        if is_clean_word(w):
            out.add(w)
    print(f"  danakt: {len(out)} 5-letter clean words")
    return out


def load_opcorpora() -> tuple[set, dict]:
    """
    Returns (all_5letter_words_set, lemma_to_tags_dict).
    The text format is paragraph-per-lemma: header line is "<id>\\nLEMMA  TAGS\\nFORM TAGS\\n..."
    """
    p = download("opcorpora")
    valid = set()
    lemma_tags = {}
    with zipfile.ZipFile(p) as z:
        # Single .txt inside
        member = next((m for m in z.namelist() if m.endswith(".txt")), None)
        if not member:
            print(f"  [error] opcorpora: no .txt in zip")
            sys.exit(1)
        with z.open(member) as fh:
            current_lemma = None
            for line_b in fh:
                line = line_b.decode("utf-8", errors="ignore").rstrip("\n").rstrip("\r")
                if not line.strip():
                    current_lemma = None
                    continue
                # Header is just a number
                if line.strip().isdigit():
                    current_lemma = "__pending__"
                    continue
                # Tab-separated: WORD\tTAGS
                parts = line.split("\t", 1)
                if len(parts) < 2:
                    continue
                word_raw, tags_raw = parts[0], parts[1]
                word = normalize(word_raw)
                tags = set(tag.strip() for tag in tags_raw.replace(",", " ").split() if tag.strip())
                # First non-numeric line in a block = lemma
                if current_lemma == "__pending__":
                    current_lemma = word
                    if is_clean_word(word):
                        lemma_tags.setdefault(word, set()).update(tags)
                # Every form contributes to valid-pool
                if is_clean_word(word):
                    valid.add(word)
    print(f"  opcorpora: {len(valid)} 5-letter forms, {len(lemma_tags)} 5-letter lemmas")
    return valid, lemma_tags


def load_hermit_top(n: int = 20000) -> set:
    p = download("hermit")
    out = set()
    text = p.read_text("utf-8", errors="ignore")
    for i, line in enumerate(text.splitlines()):
        if i >= n:
            break
        # Format: "слово 1234"
        parts = line.split()
        if not parts:
            continue
        w = normalize(parts[0])
        out.add(w)
    print(f"  hermit (top {n}): {len(out)} unique normalized words")
    return out


def load_rnc_top_nouns(n: int = 10000) -> set:
    """
    freqrnc2011.csv columns: Lemma  PoS  Freq(ipm)  R  D  Doc
    PoS=s — common nouns. We take the top n by ipm.
    """
    p = download("rnc")
    out = set()
    rows = []
    with zipfile.ZipFile(p) as z:
        member = next((m for m in z.namelist() if m.lower().endswith(".csv")), None)
        if not member:
            print(f"  [error] rnc: no .csv in zip")
            sys.exit(1)
        with z.open(member) as fh:
            raw = fh.read()
    # Encoding is usually CP1251 in this archive
    text = None
    for enc in ("windows-1251", "utf-8", "utf-8-sig"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        print(f"  [error] rnc: cannot decode csv")
        sys.exit(1)
    # Tab- or comma-separated; we'll be lenient
    sep = "\t" if "\t" in text.splitlines()[0] else ","
    for i, line in enumerate(text.splitlines()):
        if i == 0:
            continue
        parts = line.split(sep)
        if len(parts) < 3:
            continue
        lemma = normalize(parts[0])
        pos = parts[1].strip().lower()
        try:
            ipm = float(parts[2].replace(",", "."))
        except ValueError:
            continue
        if pos != "s":
            continue
        rows.append((ipm, lemma))
    rows.sort(reverse=True)
    for _, lemma in rows[:n]:
        if is_clean_word(lemma):
            out.add(lemma)
    print(f"  rnc (top {n} nouns): {len(out)} 5-letter")
    return out


# -------- main pipeline ----------------------------------------------------

def main():
    print("\n=== Downloading sources ===")
    danakt = load_danakt()
    op_valid, op_lemmas = load_opcorpora()
    hermit_top = load_hermit_top(20000)
    rnc_nouns = load_rnc_top_nouns(10000)

    print("\n=== Building VALID pool (any 5-letter Russian word) ===")
    valid_pool = set()
    valid_pool |= danakt
    valid_pool |= op_valid
    # hermit/rnc are noisy on their own (truncated etc.); we only add their entries
    # if they also passed danakt/opcorpora — which is automatic via intersection.
    valid_pool |= (hermit_top & (danakt | op_valid))
    valid_pool |= (rnc_nouns & (danakt | op_valid))
    valid_pool = {w for w in valid_pool if is_clean_word(w)}
    print(f"  valid pool: {len(valid_pool)} words")

    print("\n=== Building ANSWER pool (frequent common-noun lemmas) ===")
    # Lemma must be a noun in OpenCorpora and not have any BAD_TAGS
    noun_lemmas = set()
    for lemma, tags in op_lemmas.items():
        if "NOUN" not in tags:
            continue
        if tags & BAD_TAGS:
            continue
        noun_lemmas.add(lemma)
    print(f"  opcorpora clean-noun lemmas (5L): {len(noun_lemmas)}")

    frequent = hermit_top | rnc_nouns
    answer_pool = (noun_lemmas & valid_pool & frequent) - BLOCKLIST
    print(f"  answer pool: {len(answer_pool)}")

    # Belt-and-suspenders sanity
    answer_pool = {w for w in answer_pool if is_clean_word(w)}
    valid_pool  = {w for w in valid_pool  if is_clean_word(w)}
    valid_pool |= answer_pool  # ensure all answers are valid guesses

    print("\n=== Writing files ===")
    OUT_VALID.write_text("\n".join(sorted(valid_pool)) + "\n", encoding="utf-8")
    OUT_ANSWERS.write_text("\n".join(sorted(answer_pool)) + "\n", encoding="utf-8")
    print(f"  -> {OUT_VALID.name}: {len(valid_pool)} words ({OUT_VALID.stat().st_size//1024} KB)")
    print(f"  -> {OUT_ANSWERS.name}: {len(answer_pool)} words ({OUT_ANSWERS.stat().st_size//1024} KB)")
    print("\nDone. Commit both files to your repo (next to index.html).")
    print("If you want to remove specific words from answers, add them to BLOCKLIST and re-run.")


if __name__ == "__main__":
    main()
