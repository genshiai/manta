from __future__ import annotations

import unicodedata

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ...models import (
    ChartTemplateMaster,
    LabSetMaster,
    PrescriptionCatalogMaster,
    PrescriptionSetMaster,
    Reservation,
    ReservationSlotMaster,
    StandardUsageMaster,
)
from ...schemas import (
    ChartOrderMasterRead,
    ChartTemplateRead,
    LabSetOptionRead,
    PrescriptionCatalogItemRead,
    PrescriptionSetMasterRead,
    ReservationSlotRead,
    StandardUsageMasterRead,
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


def computed_reservation_slot_state(*, capacity: int, booked_count: int) -> str:
    if capacity <= 0 or booked_count >= capacity:
        return "full"
    remaining_count = capacity - booked_count
    few_threshold = max(1, capacity // 4)
    if booked_count > 0 and remaining_count <= few_threshold:
        return "few"
    return "available"


def get_reservation_slot_counts(db: Session, slot_ids: list[str]) -> dict[str, int]:
    if not slot_ids:
        return {}
    rows = db.execute(
        select(Reservation.slot_id, func.count(Reservation.id))
        .where(Reservation.slot_id.in_(slot_ids))
        .group_by(Reservation.slot_id)
    ).all()
    return {str(slot_id): int(count) for slot_id, count in rows if slot_id is not None}


def reservation_slot_to_read(slot: ReservationSlotMaster, *, booked_count: int = 0) -> ReservationSlotRead:
    capacity = max(slot.capacity or 1, 0)
    remaining_count = max(capacity - booked_count, 0)
    return ReservationSlotRead(
        id=slot.id,
        sort_order=slot.sort_order,
        is_active=slot.is_active,
        date=slot.date,
        time=slot.time,
        department=slot.department,
        doctor=slot.doctor,
        state=computed_reservation_slot_state(capacity=capacity, booked_count=booked_count),
        capacity=capacity,
        booked_count=booked_count,
        remaining_count=remaining_count,
    )


def get_chart_order_masters_read(
    db: Session,
    *,
    include_inactive: bool = False,
    department: str | None = None,
) -> ChartOrderMasterRead:
    prescription_catalog_query = select(PrescriptionCatalogMaster).order_by(
        PrescriptionCatalogMaster.sort_order, PrescriptionCatalogMaster.id
    )
    if not include_inactive:
        prescription_catalog_query = prescription_catalog_query.where(PrescriptionCatalogMaster.is_active.is_(True))
    prescription_catalog = db.scalars(prescription_catalog_query).all()

    standard_usage_query = select(StandardUsageMaster).order_by(StandardUsageMaster.sort_order, StandardUsageMaster.id)
    if not include_inactive:
        standard_usage_query = standard_usage_query.where(StandardUsageMaster.is_active.is_(True))
    standard_usage_masters = db.scalars(standard_usage_query).all()

    prescription_set_query = select(PrescriptionSetMaster).order_by(
        PrescriptionSetMaster.sort_order, PrescriptionSetMaster.id
    )
    if not include_inactive:
        prescription_set_query = prescription_set_query.where(PrescriptionSetMaster.is_active.is_(True))
    if department:
        prescription_set_query = prescription_set_query.where(
            or_(PrescriptionSetMaster.department == department, PrescriptionSetMaster.department == "共通")
        )
    prescription_sets = db.scalars(prescription_set_query).all()

    lab_set_options_query = select(LabSetMaster).order_by(LabSetMaster.sort_order, LabSetMaster.id)
    if not include_inactive:
        lab_set_options_query = lab_set_options_query.where(LabSetMaster.is_active.is_(True))
    lab_set_options = db.scalars(lab_set_options_query).all()

    reservation_slots_query = select(ReservationSlotMaster).order_by(
        ReservationSlotMaster.sort_order, ReservationSlotMaster.id
    )
    if not include_inactive:
        reservation_slots_query = reservation_slots_query.where(ReservationSlotMaster.is_active.is_(True))
    if department:
        reservation_slots_query = reservation_slots_query.where(ReservationSlotMaster.department == department)
    reservation_slots = db.scalars(reservation_slots_query).all()
    reservation_slot_counts = get_reservation_slot_counts(db, [slot.id for slot in reservation_slots])

    chart_templates_query = select(ChartTemplateMaster).order_by(
        ChartTemplateMaster.sort_order, ChartTemplateMaster.id
    )
    if not include_inactive:
        chart_templates_query = chart_templates_query.where(ChartTemplateMaster.is_active.is_(True))
    if department:
        chart_templates_query = chart_templates_query.where(
            or_(ChartTemplateMaster.department == department, ChartTemplateMaster.department == "共通")
        )
    chart_templates = db.scalars(chart_templates_query).all()

    return ChartOrderMasterRead(
        prescription_catalog=[PrescriptionCatalogItemRead.model_validate(item) for item in prescription_catalog],
        standard_usage_masters=[StandardUsageMasterRead.model_validate(item) for item in standard_usage_masters],
        prescription_sets=[PrescriptionSetMasterRead.model_validate(item) for item in prescription_sets],
        lab_set_options=[LabSetOptionRead.model_validate(item) for item in lab_set_options],
        reservation_slots=[
            reservation_slot_to_read(item, booked_count=reservation_slot_counts.get(item.id, 0))
            for item in reservation_slots
        ],
        chart_templates=[ChartTemplateRead.model_validate(item) for item in chart_templates],
    )
