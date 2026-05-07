from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.db import SessionLocal
from app.migrations import run_migrations
from app.pmda_import import parse_pmda_package_insert_xml_records, upsert_pmda_package_insert_data


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import PMDA package insert XML files.")
    parser.add_argument("--xml-file", type=Path, action="append", default=[], help="Path to a PMDA package insert XML")
    parser.add_argument("--directory", type=Path, help="Directory containing PMDA package insert XML files")
    parser.add_argument("--dry-run", action="store_true", help="Parse files but do not write to DB")
    return parser.parse_args()


def resolve_xml_files(args: argparse.Namespace) -> list[Path]:
    files = list(args.xml_file)
    if args.directory:
        files.extend(sorted(args.directory.rglob("*.xml")))
    if not files:
        raise SystemExit("specify --xml-file or --directory")
    return files


def main() -> int:
    args = parse_args()
    xml_files = resolve_xml_files(args)

    all_sections = []
    all_interactions = []
    failed_files: list[tuple[Path, str]] = []
    for xml_file in xml_files:
        try:
            sections, interactions = parse_pmda_package_insert_xml_records(xml_file)
        except Exception as error:
            failed_files.append((xml_file, str(error)))
            print(f"failed {xml_file}: {error}")
            continue
        all_sections.extend(sections)
        all_interactions.extend(interactions)
        yj_codes = sorted({record.yj_code for record in sections})
        print(
            f"parsed {xml_file}: sections={len(sections)} interactions={len(interactions)} "
            f"yj_codes={','.join(yj_codes)}"
        )

    if args.dry_run:
        print(
            f"dry-run summary: files={len(xml_files)} parsed={len(xml_files) - len(failed_files)} "
            f"failed={len(failed_files)} sections={len(all_sections)} interactions={len(all_interactions)}"
        )
        return 0

    run_migrations()
    with SessionLocal() as db:
        inserted, deleted, interaction_inserted, interaction_deleted = upsert_pmda_package_insert_data(
            db,
            sections=all_sections,
            interactions=all_interactions,
        )
        db.commit()

    print(
        "pmda package insert import completed: "
        f"files={len(xml_files)} parsed={len(xml_files) - len(failed_files)} failed={len(failed_files)} "
        f"sections_inserted={inserted} sections_replaced={deleted} "
        f"interactions_inserted={interaction_inserted} interactions_replaced={interaction_deleted}"
    )
    return 1 if failed_files else 0


if __name__ == "__main__":
    raise SystemExit(main())
