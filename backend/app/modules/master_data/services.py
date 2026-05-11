from __future__ import annotations

import unicodedata

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from .models import (
    ChartTemplateMaster,
    LabSetMaster,
    PrescriptionCatalogMaster,
    PrescriptionSetMaster,
    ReservationSlotMaster,
    StandardUsageMaster,
)


def get_prescription_catalog_master_or_404(db: Session, master_id: str) -> PrescriptionCatalogMaster:
    master = db.get(PrescriptionCatalogMaster, master_id)
    if master is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prescription catalog not found")
    return master


def get_standard_usage_master_or_404(db: Session, master_id: str) -> StandardUsageMaster:
    master = db.get(StandardUsageMaster, master_id)
    if master is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Standard usage not found")
    return master


def get_prescription_set_master_or_404(db: Session, master_id: str) -> PrescriptionSetMaster:
    master = db.get(PrescriptionSetMaster, master_id)
    if master is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prescription set not found")
    return master


def get_lab_set_master_or_404(db: Session, master_id: str) -> LabSetMaster:
    master = db.get(LabSetMaster, master_id)
    if master is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lab set not found")
    return master


def get_reservation_slot_master_or_404(db: Session, master_id: str) -> ReservationSlotMaster:
    master = db.get(ReservationSlotMaster, master_id)
    if master is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation slot not found")
    return master


def get_chart_template_master_or_404(db: Session, master_id: str) -> ChartTemplateMaster:
    master = db.get(ChartTemplateMaster, master_id)
    if master is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chart template not found")
    return master


def normalize_diagnosis_search_query(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).strip()
    return normalized.replace("　", " ")


def to_katakana(value: str) -> str:
    chars = []
    for char in value:
        if "ぁ" <= char <= "ゖ":
            chars.append(chr(ord(char) + 0x60))
        else:
            chars.append(char)
    return "".join(chars)


