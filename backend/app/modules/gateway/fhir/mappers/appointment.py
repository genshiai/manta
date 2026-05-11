"""Reservation ORM ⇔ FHIR R4B Appointment mapper (Step 5)."""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fhir.resources.R4B.appointment import Appointment, AppointmentParticipant
from fhir.resources.R4B.codeableconcept import CodeableConcept
from fhir.resources.R4B.identifier import Identifier
from fhir.resources.R4B.reference import Reference

from app.models import Reservation


APPOINTMENT_IDENTIFIER_SYSTEM = "urn:manta:reservation"
TOKYO_TZ = ZoneInfo("Asia/Tokyo")
_SCHEDULE_RE = re.compile(r"(\d{4})/(\d{2})/(\d{2}).*?(\d{2}):(\d{2})")
_WEEKDAYS = "月火水木金土日"


def _parse_scheduled_for(value: str | None) -> datetime | None:
    if not value:
        return None
    match = _SCHEDULE_RE.search(value)
    if not match:
        return None
    year, month, day, hour, minute = [int(part) for part in match.groups()]
    return datetime(year, month, day, hour, minute, tzinfo=TOKYO_TZ)


def _format_scheduled_for(value: datetime | None) -> str:
    if value is None:
        return ""
    local = value.astimezone(TOKYO_TZ)
    weekday = _WEEKDAYS[local.weekday()]
    return local.strftime(f"%Y/%m/%d（{weekday}） %H:%M")


def orm_to_fhir(row: Reservation) -> Appointment:
    start = _parse_scheduled_for(row.scheduled_for)
    resource = Appointment(
        id=str(row.id),
        identifier=[
            Identifier(
                system=APPOINTMENT_IDENTIFIER_SYSTEM,
                value=str(row.id),
            )
        ],
        status="booked",
        serviceType=[CodeableConcept(text=row.department)] if row.department else None,
        description=row.note or None,
        comment=row.note or None,
        minutesDuration=30,
        participant=[
            AppointmentParticipant(
                actor=Reference(reference=f"Patient/{row.patient_id}"),
                status="accepted",
            ),
            AppointmentParticipant(
                actor=Reference(display=row.doctor),
                status="accepted",
            ),
        ],
    )
    if row.slot_id:
        resource.slot = [Reference(reference=f"Slot/{row.slot_id}")]
    if start is not None:
        resource.start = start
        resource.end = start + timedelta(minutes=30)
    return resource


def _extract_patient_id(resource: Appointment) -> str | None:
    for participant in resource.participant or []:
        actor = participant.actor
        if actor is None or not actor.reference:
            continue
        ref = actor.reference.strip()
        prefix = "Patient/"
        if ref.startswith(prefix):
            return ref[len(prefix) :] or None
    return None


def _extract_doctor(resource: Appointment) -> str:
    for participant in resource.participant or []:
        actor = participant.actor
        if actor is None:
            continue
        if actor.reference and actor.reference.startswith("Patient/"):
            continue
        if actor.display:
            return actor.display
    return ""


def _extract_department(resource: Appointment) -> str:
    for service in resource.serviceType or []:
        if service.text:
            return service.text
        for coding in service.coding or []:
            if coding.display:
                return coding.display
            if coding.code:
                return coding.code
    return ""


def _extract_slot_id(resource: Appointment) -> str | None:
    if not resource.slot:
        return None
    reference = resource.slot[0].reference
    if not reference:
        return None
    prefix = "Slot/"
    if reference.startswith(prefix):
        return reference[len(prefix) :] or None
    return reference


def apply_fhir_to_orm(row: Reservation, resource: Appointment) -> Reservation:
    patient_id = _extract_patient_id(resource)
    if patient_id:
        row.patient_id = patient_id
    if resource.start is not None:
        row.scheduled_for = _format_scheduled_for(resource.start)
    elif row.scheduled_for is None:
        row.scheduled_for = ""
    row.department = _extract_department(resource) or row.department or ""
    row.doctor = _extract_doctor(resource) or row.doctor or ""
    row.note = resource.comment or resource.description or row.note or ""
    row.slot_id = _extract_slot_id(resource)
    return row


def fhir_to_orm_create(resource: Appointment) -> Reservation:
    row = Reservation(
        patient_id="",
        slot_id=None,
        scheduled_for="",
        department="",
        doctor="",
        note="",
    )
    return apply_fhir_to_orm(row, resource)
