from __future__ import annotations

from datetime import datetime, time
from zoneinfo import ZoneInfo

from fhir.resources.R4B.codeableconcept import CodeableConcept
from fhir.resources.R4B.coding import Coding
from fhir.resources.R4B.encounter import Encounter, EncounterParticipant
from fhir.resources.R4B.identifier import Identifier
from fhir.resources.R4B.period import Period
from fhir.resources.R4B.reference import Reference

from app.models import Patient


ACT_CODE_SYSTEM = "http://terminology.hl7.org/CodeSystem/v3-ActCode"
ENCOUNTER_IDENTIFIER_SYSTEM = "https://manta.local/fhir/identifier/encounter"
TOKYO_TZ = ZoneInfo("Asia/Tokyo")


def encounter_id_for_visit(patient: Patient, visit: dict, index: int) -> str:
    date_token = str(visit.get("date") or "unknown").replace("/", "").replace("-", "")
    return f"{patient.id}-{date_token}-{index + 1}"


def _parse_visit_start(visit: dict, *, fallback_time: str | None = None) -> datetime | None:
    raw_date = visit.get("date")
    if not isinstance(raw_date, str) or not raw_date:
        return None

    normalized_date = raw_date.replace("/", "-")
    raw_time = fallback_time if isinstance(fallback_time, str) and fallback_time else "09:00"
    try:
        parsed_date = datetime.strptime(normalized_date, "%Y-%m-%d").date()
    except ValueError:
        return None

    try:
        parsed_time = datetime.strptime(raw_time, "%H:%M").time()
    except ValueError:
        parsed_time = time(hour=9)

    return datetime.combine(parsed_date, parsed_time, tzinfo=TOKYO_TZ)


def _status_for_visit(visit: dict) -> str:
    return "in-progress" if visit.get("active") is True else "finished"


def orm_visit_to_fhir(patient: Patient, visit: dict, index: int) -> Encounter:
    encounter_id = encounter_id_for_visit(patient, visit, index)
    is_active = visit.get("active") is True
    period_start = _parse_visit_start(
        visit,
        fallback_time=patient.reception_time if is_active else None,
    )
    summary = visit.get("summary") if isinstance(visit.get("summary"), str) else None
    department = visit.get("department") if isinstance(visit.get("department"), str) else patient.department

    return Encounter(
        id=encounter_id,
        identifier=[
            Identifier(
                system=ENCOUNTER_IDENTIFIER_SYSTEM,
                value=encounter_id,
            )
        ],
        status=_status_for_visit(visit),
        class_fhir=Coding(
            system=ACT_CODE_SYSTEM,
            code="AMB",
            display="ambulatory",
        ),
        type=[CodeableConcept(text=summary)] if summary else None,
        serviceType=CodeableConcept(text=department),
        subject=Reference(reference=f"Patient/{patient.id}", display=patient.name),
        participant=[
            EncounterParticipant(
                individual=Reference(display=patient.doctor),
            )
        ]
        if patient.doctor
        else None,
        period=Period(start=period_start) if period_start else None,
    )


def patient_encounters_to_fhir(patient: Patient) -> list[Encounter]:
    encounters: list[Encounter] = []
    for index, visit in enumerate(patient.visit_history or []):
        if not isinstance(visit, dict):
            continue
        encounters.append(orm_visit_to_fhir(patient, visit, index))
    return encounters
