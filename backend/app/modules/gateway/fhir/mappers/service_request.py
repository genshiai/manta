from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from fhir.resources.R4B.annotation import Annotation
from fhir.resources.R4B.codeableconcept import CodeableConcept
from fhir.resources.R4B.identifier import Identifier
from fhir.resources.R4B.reference import Reference
from fhir.resources.R4B.servicerequest import ServiceRequest

from app.modules.karte.models import LabOrder, Patient


SERVICE_REQUEST_IDENTIFIER_SYSTEM = "https://manta.local/fhir/identifier/service-request"
TOKYO_TZ = ZoneInfo("Asia/Tokyo")


def _category(text: str) -> list[CodeableConcept]:
    return [CodeableConcept(text=text)]


def _patient_reference(patient_id: str, patient: Patient | None = None) -> Reference:
    return Reference(reference=f"Patient/{patient_id}", display=patient.name if patient else None)


def _requester(patient: Patient | None) -> Reference | None:
    if patient is None or not patient.doctor:
        return None
    return Reference(display=patient.doctor)


def _note(text: str | None) -> list[Annotation] | None:
    if not text:
        return None
    return [Annotation(text=text)]


def _parse_local_datetime(value: str | None) -> datetime | None:
    if not value or value == "未確定":
        return None
    for fmt in ("%Y/%m/%d %H:%M", "%Y-%m-%d %H:%M", "%Y/%m/%d"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=TOKYO_TZ)
        except ValueError:
            continue
    return None


def lab_order_to_fhir(order: LabOrder, *, patient: Patient | None = None) -> ServiceRequest:
    request_id = f"lab-{order.id}"
    urgency_note = f"緊急度: {order.urgency}" if order.urgency else None
    return ServiceRequest(
        id=request_id,
        identifier=[
            Identifier(
                system=SERVICE_REQUEST_IDENTIFIER_SYSTEM,
                value=request_id,
            )
        ],
        status="completed" if order.status == "done" else "active",
        intent="order",
        category=_category("laboratory"),
        priority="urgent" if order.urgency == "至急" else "routine",
        code=CodeableConcept(text=order.category),
        orderDetail=[CodeableConcept(text=item) for item in order.items],
        subject=_patient_reference(order.patient_id, patient),
        authoredOn=order.created_at,
        requester=_requester(patient),
        note=_note(urgency_note),
    )


def imaging_order_to_fhir(patient: Patient, order: dict, index: int) -> ServiceRequest:
    request_id = f"imaging-{patient.id}-{index + 1}"
    status = "draft" if order.get("status") == "draft" else "active"
    return ServiceRequest(
        id=request_id,
        identifier=[
            Identifier(
                system=SERVICE_REQUEST_IDENTIFIER_SYSTEM,
                value=request_id,
            )
        ],
        status=status,
        intent="order",
        category=_category("imaging"),
        code=CodeableConcept(text=str(order.get("category") or "画像検査")),
        subject=_patient_reference(patient.id, patient),
        occurrenceDateTime=_parse_local_datetime(order.get("scheduled_at")),
        requester=_requester(patient),
        note=_note(order.get("note")),
    )


def procedure_order_to_fhir(patient: Patient, order: dict, index: int) -> ServiceRequest:
    request_id = f"procedure-{patient.id}-{index + 1}"
    status = "completed" if order.get("status") == "done" else "active"
    return ServiceRequest(
        id=request_id,
        identifier=[
            Identifier(
                system=SERVICE_REQUEST_IDENTIFIER_SYSTEM,
                value=request_id,
            )
        ],
        status=status,
        intent="order",
        category=_category("procedure"),
        code=CodeableConcept(text=str(order.get("title") or "処置")),
        subject=_patient_reference(patient.id, patient),
        requester=_requester(patient),
        note=_note(order.get("note")),
    )


def patient_json_orders_to_fhir(patient: Patient) -> list[ServiceRequest]:
    resources: list[ServiceRequest] = []
    for index, order in enumerate(patient.imaging_orders or []):
        if isinstance(order, dict):
            resources.append(imaging_order_to_fhir(patient, order, index))
    for index, order in enumerate(patient.procedure_orders or []):
        if isinstance(order, dict):
            resources.append(procedure_order_to_fhir(patient, order, index))
    return resources
