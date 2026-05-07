from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.db import SessionLocal
from app.receipt_drug_import import iter_receipt_drug_master_records, sync_receipt_drug_master_records


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import receipt computer drug master into receipt_drug_masters.")
    parser.add_argument("file_path", type=Path, help="Path to y_ALL*.zip or extracted y_ALL*.csv")
    parser.add_argument("--dry-run", action="store_true", help="Parse and diff without writing to the database")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    records = iter_receipt_drug_master_records(file_path=args.file_path)

    with SessionLocal() as db:
        summary = sync_receipt_drug_master_records(db, records, dry_run=args.dry_run)
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
