from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.db import SessionLocal
from app.drug_import import sync_drug_master_records
from app.mhlw_drug_price_import import iter_mhlw_drug_price_records


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import MHLW drug price standard xlsx into prescription_catalog_masters.",
    )
    parser.add_argument("xlsx_file", type=Path, help="Path to the MHLW drug price xlsx file")
    parser.add_argument("--dry-run", action="store_true", help="Parse and diff without writing to the database")
    parser.add_argument(
        "--deactivate-missing",
        action="store_true",
        help="Deactivate active yj- rows that are not present in this full import file",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    records = iter_mhlw_drug_price_records(xlsx_file=args.xlsx_file)

    with SessionLocal() as db:
        summary = sync_drug_master_records(
            db,
            records,
            dry_run=args.dry_run,
            deactivate_missing=args.deactivate_missing,
            managed_id_prefixes=("yj-",),
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
