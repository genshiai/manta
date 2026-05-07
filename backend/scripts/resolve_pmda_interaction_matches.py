from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.db import SessionLocal
from app.migrations import run_migrations
from app.pmda_interaction_match import sync_pmda_interaction_matches


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Resolve PMDA interaction drug names to local drug masters.")
    parser.add_argument("--dry-run", action="store_true", help="Resolve without writing match rows")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    run_migrations()
    with SessionLocal() as db:
        summary = sync_pmda_interaction_matches(db, dry_run=args.dry_run)
        if args.dry_run:
            db.rollback()
        else:
            db.commit()

    print(
        "pmda interaction match completed: "
        f"interactions={summary.interactions} created={summary.created} "
        f"replaced={summary.deleted} dry_run={summary.dry_run}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
