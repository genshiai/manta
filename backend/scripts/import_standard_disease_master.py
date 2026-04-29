from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path
from zipfile import ZipFile

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.db import SessionLocal
from app.diagnosis_import import iter_diagnosis_main_records, upsert_diagnosis_main_records
from app.migrations import run_migrations


def resolve_member_names_from_zip(zip_file: Path) -> tuple[str, str]:
    with ZipFile(zip_file) as archive:
        title_name = next(
            (name for name in archive.namelist() if name.endswith("ttl_main.txt")),
            None,
        )
        main_name = next(
            (name for name in archive.namelist() if "/main/" in name and Path(name).name.startswith("nmain")),
            None,
        )
        if title_name is None or main_name is None:
            raise ValueError("zip file does not contain ttl_main.txt and nmain*.txt")
        return title_name, main_name


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import MEDIS standard disease master into diagnosis_masters.")
    parser.add_argument("--zip-file", type=Path, help="Path to byomei*.zip downloaded from MEDIS")
    parser.add_argument("--title-file", type=Path, help="Path to ttl_main.txt")
    parser.add_argument("--main-file", type=Path, help="Path to nmain*.txt")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if args.zip_file:
        member_names = resolve_member_names_from_zip(args.zip_file)
        with tempfile.TemporaryDirectory(prefix="manta-diagnosis-master-") as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            with ZipFile(args.zip_file) as archive:
                title_file = Path(archive.extract(member_names[0], path=temp_dir))
                main_file = Path(archive.extract(member_names[1], path=temp_dir))
            return run_import(title_file=title_file, main_file=main_file)
    elif args.title_file and args.main_file:
        title_file = args.title_file
        main_file = args.main_file
    else:
        raise SystemExit("specify either --zip-file or both --title-file and --main-file")

    return run_import(title_file=title_file, main_file=main_file)


def run_import(*, title_file: Path, main_file: Path) -> int:
    run_migrations()
    with SessionLocal() as db:
        created, updated = upsert_diagnosis_main_records(
            db,
            iter_diagnosis_main_records(title_file=title_file, main_file=main_file),
        )
        db.commit()

    print(
        f"diagnosis master import completed: created={created} updated={updated} "
        f"title_file={title_file} main_file={main_file}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
