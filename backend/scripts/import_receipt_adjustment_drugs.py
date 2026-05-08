from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.db import SessionLocal
from app.migrations import run_migrations
from app.receipt_adjustment_import import (
    iter_receipt_long_term_listed_drug_records,
    iter_receipt_transitional_drug_records,
    sync_receipt_long_term_listed_drug_records,
    sync_receipt_transitional_drug_records,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import receipt transitional and long-term listed drug xlsx files.")
    parser.add_argument("--transitional-xlsx", type=Path, help="Path to keikasoti_R08_*.xlsx")
    parser.add_argument("--long-term-xlsx", type=Path, help="Path to sentei_*.xlsx")
    parser.add_argument("--dry-run", action="store_true", help="Parse and diff without writing to the database")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.transitional_xlsx and not args.long_term_xlsx:
        raise SystemExit("specify --transitional-xlsx and/or --long-term-xlsx")

    run_migrations()
    with SessionLocal() as db:
        if args.transitional_xlsx:
            records = iter_receipt_transitional_drug_records(xlsx_file=args.transitional_xlsx)
            summary = sync_receipt_transitional_drug_records(db, records, dry_run=args.dry_run)
            print(
                "transitional import: "
                f"total={summary.total} created={summary.created} updated={summary.updated} "
                f"unchanged={summary.unchanged} dry_run={summary.dry_run}"
            )
        if args.long_term_xlsx:
            records = iter_receipt_long_term_listed_drug_records(xlsx_file=args.long_term_xlsx)
            summary = sync_receipt_long_term_listed_drug_records(db, records, dry_run=args.dry_run)
            print(
                "long-term listed import: "
                f"total={summary.total} created={summary.created} updated={summary.updated} "
                f"unchanged={summary.unchanged} dry_run={summary.dry_run}"
            )
        if args.dry_run:
            db.rollback()
        else:
            db.commit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
