from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.db import SessionLocal
from app.hot_drug_import import iter_hot_drug_code_mapping_records, sync_hot_drug_code_mapping_records


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import MEDIS HOT CSV into hot_drug_code_mappings.")
    parser.add_argument("csv_file", type=Path, help="Path to A_YYYYMMDD_1.txt or A_YYYYMMDD_2.txt")
    parser.add_argument("--dry-run", action="store_true", help="Parse and diff without writing to the database")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    records = iter_hot_drug_code_mapping_records(file_path=args.csv_file)

    with SessionLocal() as db:
        summary = sync_hot_drug_code_mapping_records(db, records, dry_run=args.dry_run)
        if args.dry_run:
            db.rollback()
        else:
            db.commit()

    print(
        "import completed: "
        f"total={summary.total} created={summary.created} updated={summary.updated} "
        f"unchanged={summary.unchanged} dry_run={summary.dry_run}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
