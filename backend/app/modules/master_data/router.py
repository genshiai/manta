from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, or_, select
from sqlalchemy.orm import Session

from ...db import get_db
from ...security import get_current_user
from ..auth.models import User
from .models import DiagnosisAliasMaster, DiagnosisMaster, ReceiptCommentMaster
from .schemas import DiagnosisMasterRead, ReceiptCommentMasterRead
from .services import (
    normalize_diagnosis_search_query,
    to_katakana,
)


router = APIRouter()


@router.get("/api/masters/diagnoses/search", response_model=list[DiagnosisMasterRead])
def search_diagnosis_masters(
    q: str = Query(min_length=1),
    limit: int = Query(default=20, ge=1, le=50),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DiagnosisMasterRead]:
    normalized_query = normalize_diagnosis_search_query(q)
    if not normalized_query:
        return []

    normalized_code_query = normalized_query.replace(" ", "").upper()
    kana_query = to_katakana(normalized_query)
    name_prefix = f"{normalized_query}%"
    kana_prefix = f"{kana_query}%"
    name_contains = f"%{normalized_query}%"
    kana_contains = f"%{kana_query}%"
    code_prefix = f"{normalized_code_query}%"

    direct_statement = (
        select(DiagnosisMaster)
        .where(DiagnosisMaster.is_deleted.is_(False))
        .where(
            or_(
                DiagnosisMaster.disease_name.ilike(name_contains),
                DiagnosisMaster.disease_name_kana.ilike(kana_contains),
                DiagnosisMaster.icd10_code.ilike(code_prefix),
                DiagnosisMaster.claim_code.ilike(code_prefix),
                DiagnosisMaster.exchange_code.ilike(code_prefix),
            )
        )
        .order_by(
            case(
                (DiagnosisMaster.disease_name == normalized_query, 0),
                (DiagnosisMaster.disease_name.ilike(name_prefix), 1),
                (DiagnosisMaster.disease_name_kana.ilike(kana_prefix), 2),
                (DiagnosisMaster.disease_name.ilike(name_contains), 3),
                (DiagnosisMaster.disease_name_kana.ilike(kana_contains), 4),
                (DiagnosisMaster.icd10_code.ilike(code_prefix), 5),
                else_=6,
            ),
            DiagnosisMaster.disease_name,
            DiagnosisMaster.management_number,
        )
        .limit(limit * 2)
    )
    direct_items = db.scalars(direct_statement).all()

    alias_statement = (
        select(DiagnosisAliasMaster)
        .where(DiagnosisAliasMaster.is_deleted.is_(False))
        .where(
            or_(
                DiagnosisAliasMaster.alias.ilike(name_contains),
                DiagnosisAliasMaster.alias_kana.ilike(kana_contains),
            )
        )
        .order_by(
            case(
                (DiagnosisAliasMaster.alias == normalized_query, 0),
                (DiagnosisAliasMaster.alias.ilike(name_prefix), 1),
                (DiagnosisAliasMaster.alias_kana.ilike(kana_prefix), 2),
                (DiagnosisAliasMaster.alias.ilike(name_contains), 3),
                (DiagnosisAliasMaster.alias_kana.ilike(kana_contains), 4),
                else_=5,
            ),
            DiagnosisAliasMaster.alias,
            DiagnosisAliasMaster.management_number,
        )
        .limit(limit * 3)
    )
    alias_rows = db.scalars(alias_statement).all()
    alias_target_ids = {
        alias.target_management_number or alias.management_number
        for alias in alias_rows
        if alias.target_management_number or alias.management_number
    }
    alias_source_ids = {alias.management_number for alias in alias_rows}
    alias_targets = {
        item.management_number: item
        for item in db.scalars(
            select(DiagnosisMaster)
            .where(DiagnosisMaster.management_number.in_(alias_target_ids))
            .where(DiagnosisMaster.is_deleted.is_(False))
        ).all()
    }
    alias_sources = {
        item.management_number: item
        for item in db.scalars(select(DiagnosisMaster).where(DiagnosisMaster.management_number.in_(alias_source_ids))).all()
    }

    items_by_management_number: dict[str, DiagnosisMaster] = {}
    search_meta_by_management_number: dict[str, dict[str, str | None]] = {}
    for item in direct_items:
        items_by_management_number.setdefault(item.management_number, item)
    for alias in alias_rows:
        target_id = alias.target_management_number or alias.management_number
        target = alias_targets.get(target_id)
        if target is None:
            continue
        items_by_management_number.setdefault(target.management_number, target)
        source = alias_sources.get(alias.management_number)
        if target.management_number not in search_meta_by_management_number:
            search_meta_by_management_number[target.management_number] = {
                "matched_alias": alias.alias,
                "migration_source_management_number": alias.management_number if alias.target_management_number else None,
                "migration_source_name": source.disease_name if source and alias.target_management_number else None,
            }

    items = list(items_by_management_number.values())[:limit]
    return [
        DiagnosisMasterRead.model_validate(item).model_copy(
            update=search_meta_by_management_number.get(item.management_number, {})
        )
        for item in items
    ]


@router.get("/api/masters/receipt-comments/search", response_model=list[ReceiptCommentMasterRead])
def search_receipt_comment_masters(
    q: str = Query(min_length=1),
    limit: int = Query(default=20, ge=1, le=50),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ReceiptCommentMasterRead]:
    normalized_query = q.strip()
    if not normalized_query:
        return []

    code_query = normalized_query.replace("-", "").replace(" ", "")
    contains = f"%{normalized_query}%"
    code_prefix = f"{code_query}%"
    statement = (
        select(ReceiptCommentMaster)
        .where(
            or_(
                ReceiptCommentMaster.comment_code.ilike(code_prefix),
                ReceiptCommentMaster.text.ilike(contains),
                ReceiptCommentMaster.text_kana.ilike(contains),
            )
        )
        .order_by(
            case(
                (ReceiptCommentMaster.comment_code == code_query, 0),
                (ReceiptCommentMaster.comment_code.ilike(code_prefix), 1),
                (ReceiptCommentMaster.text.ilike(f"{normalized_query}%"), 2),
                (ReceiptCommentMaster.text.ilike(contains), 3),
                else_=4,
            ),
            ReceiptCommentMaster.comment_code,
        )
        .limit(limit)
    )
    return [ReceiptCommentMasterRead.model_validate(item) for item in db.scalars(statement).all()]
