from __future__ import annotations

import argparse
from pathlib import Path

from app.db import SessionLocal
from app.drug_import import iter_drug_master_records, sync_drug_master_records


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import drug master CSV into prescription_catalog_masters.")
    parser.add_argument("csv_file", type=Path, help="Path to the normalized drug master CSV file")
    parser.add_argument("--dry-run", action="store_true", help="Parse and diff without writing to the database")
    parser.add_argument(
        "--deactivate-missing",
        action="store_true",
        help="Deactivate active yj-/hot- rows that are not present in this full import file",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    with SessionLocal() as db:
        summary = sync_drug_master_records(
            db,
            iter_drug_master_records(csv_file=args.csv_file),
            dry_run=args.dry_run,
            deactivate_missing=args.deactivate_missing,
        )
        if args.dry_run:
            db.rollback()
        else:
            db.commit()

    print(
        "import completed: "
        f"total={summary.total} created={summary.created} updated={summary.updated} "
        f"unchanged={summary.unchanged} deactivated={summary.deactivated} dry_run={summary.dry_run}"
    )
    if summary.invalid_yj_codes:
        print("invalid yj codes:")
        for item in summary.invalid_yj_codes:
            print(f"  {item}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
