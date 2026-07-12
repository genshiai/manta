#!/usr/bin/env python3
"""PlemolJP35 を LP 用にサブセットして woff2 を生成する。

使い方:
    python3 lp/tools/build-fonts.py /path/to/PlemolJP_v3.0.0/PlemolJP35

- 文字集合 = lp/*.html + README.md + docs/**/*.md の全文字 + 常用記号レンジ。
  LP の文言を変えて未収録文字が出たら、これを再実行するだけでよい。
- 出典: PlemolJP (yuru7) — IBM Plex Mono + IBM Plex Sans JP 合成、SIL OFL 1.1。
  配布 woff2 と同じディレクトリに OFL.txt を必ず同梱すること。
"""

import sys
import glob
from pathlib import Path

from fontTools.subset import main as ss_main
from fontTools.ttLib import TTFont

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "lp" / "assets" / "fonts"

WEIGHTS = {
    "Regular": "plemoljp35-regular.woff2",
    "Medium": "plemoljp35-medium.woff2",
    "SemiBold": "plemoljp35-semibold.woff2",
    "Bold": "plemoljp35-bold.woff2",
}

# 本文コーパスに現れなくても常に確保しておく範囲
RANGES = (
    "U+0020-007E,U+00A0-00FF,U+2010-205E,U+20A9,U+2190-21FF,U+2318,U+2325,"
    "U+2500-257F,U+25A0-25FF,U+2600-26FF,U+2713-2718,U+2726,U+2E80-2E99,"
    "U+3000-303F,U+3041-3096,U+309B-30FF,U+31F0-31FF,U+3220-325F,U+FF00-FF65,"
    "U+FFE0-FFE5"
)


def corpus_chars() -> str:
    files = (
        list((REPO / "lp").glob("*.html"))
        + [REPO / "README.md"]
        + [Path(p) for p in glob.glob(str(REPO / "docs" / "**" / "*.md"), recursive=True)]
    )
    chars: set[str] = set()
    for f in files:
        try:
            chars.update(f.read_text(encoding="utf-8", errors="ignore"))
        except OSError:
            pass
    return "".join(sorted(c for c in chars if ord(c) >= 0x20))


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src_dir = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)

    text_file = OUT / ".subset-corpus.txt"
    text_file.write_text(corpus_chars(), encoding="utf-8")

    for weight, out_name in WEIGHTS.items():
        src = src_dir / f"PlemolJP35-{weight}.ttf"
        if not src.exists():
            sys.exit(f"not found: {src}")
        args = [
            str(src),
            f"--text-file={text_file}",
            f"--unicodes={RANGES}",
            "--layout-features+=palt,kern",
            "--name-IDs=*",  # 著作権・ライセンス表記を保持する
            "--flavor=woff2",
            f"--output-file={OUT / out_name}",
        ]
        ss_main(args)
        n_glyphs = len(TTFont(OUT / out_name).getGlyphOrder())
        size_kb = (OUT / out_name).stat().st_size // 1024
        print(f"{out_name}: {n_glyphs} glyphs, {size_kb} KB")

    text_file.unlink()


if __name__ == "__main__":
    main()
