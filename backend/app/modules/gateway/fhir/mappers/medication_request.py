"""PrescriptionOrder ORM ⇔ FHIR R4B MedicationRequest mapper (Step 4).

Phase 1 では既存の `prescription_orders` を正本のまま残し、FHIR 境界で
MedicationRequest に変換する。薬剤コードは master から HOT13 / YJ を補完する。
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from decimal import Decimal

from fhir.resources.R4B.codeableconcept import CodeableConcept
from fhir.resources.R4B.coding import Coding
from fhir.resources.R4B.dosage import Dosage
from fhir.resources.R4B.duration import Duration
from fhir.resources.R4B.identifier import Identifier
from fhir.resources.R4B.medicationrequest import (
    MedicationRequest as FhirMedicationRequest,
    MedicationRequestDispenseRequest,
)
from fhir.resources.R4B.reference import Reference

from app.modules.karte.models import PrescriptionOrder
from app.modules.master_data.models import PrescriptionCatalogMaster


HOT13_SYSTEM = "http://jpfhir.jp/fhir/core/CodeSystem/JP_MedicationCodeHOT13_CS"
YJ_SYSTEM = "http://jpfhir.jp/fhir/core/CodeSystem/JP_MedicationCodeYJ_CS"
MEDICATION_REQUEST_CATEGORY_SYSTEM = (
    "http://terminology.hl7.org/CodeSystem/medicationrequest-category"
)
PRESCRIPTION_ORDER_IDENTIFIER_SYSTEM = "urn:manta:prescription-order"
UCUM_SYSTEM = "http://unitsofmeasure.org"


_DAYS_RE = re.compile(r"(\d+)")


def _parse_days(value: str | None) -> Decimal | None:
    if not value:
        return None
    match = _DAYS_RE.search(value)
    if not match:
        return None
    return Decimal(match.group(1))


def _build_medication_code(
    order: PrescriptionOrder,
    catalog: PrescriptionCatalogMaster | None,
) -> CodeableConcept:
    codings: list[Coding] = []
    if catalog and catalog.hot_code:
        codings.append(
            Coding(
                system=HOT13_SYSTEM,
                code=catalog.hot_code,
                display=order.drug_name,
            )
        )
    if catalog and catalog.yj_code:
        codings.append(
            Coding(
                system=YJ_SYSTEM,
                code=catalog.yj_code,
                display=order.drug_name,
            )
        )
    return CodeableConcept(coding=codings or None, text=order.drug_name)


def _build_dispense_request(order: PrescriptionOrder) -> MedicationRequestDispenseRequest | None:
    days = _parse_days(order.days)
    if days is None:
        return None
    return MedicationRequestDispenseRequest(
        expectedSupplyDuration=Duration(
            value=days,
            unit="days",
            system=UCUM_SYSTEM,
            code="d",
        )
    )


def orm_to_fhir(
    order: PrescriptionOrder,
    *,
    catalog: PrescriptionCatalogMaster | None = None,
) -> FhirMedicationRequest:
    resource = FhirMedicationRequest(
        id=str(order.id),
        identifier=[
            Identifier(
                system=PRESCRIPTION_ORDER_IDENTIFIER_SYSTEM,
                value=str(order.id),
            )
        ],
        status="active",
        intent="order",
        category=[
            CodeableConcept(
                coding=[
                    Coding(
                        system=MEDICATION_REQUEST_CATEGORY_SYSTEM,
                        code="outpatient",
                    )
                ],
                text=order.type or "外来処方",
            )
        ],
        medicationCodeableConcept=_build_medication_code(order, catalog),
        subject=Reference(reference=f"Patient/{order.patient_id}"),
        authoredOn=order.created_at,
        dosageInstruction=[
            Dosage(
                sequence=1,
                text=order.dosage,
                patientInstruction=order.dosage,
            )
        ],
    )
    dispense = _build_dispense_request(order)
    if dispense is not None:
        resource.dispenseRequest = dispense
    return resource


def _extract_subject_patient_id(resource: FhirMedicationRequest) -> str | None:
    if resource.subject is None or not resource.subject.reference:
        return None
    ref = resource.subject.reference.strip()
    prefix = "Patient/"
    if not ref.startswith(prefix):
        return None
    return ref[len(prefix) :] or None


def _extract_drug_name(resource: FhirMedicationRequest) -> str:
    medication = resource.medicationCodeableConcept
    if medication is None:
        return ""
    if medication.text:
        return medication.text
    for coding in medication.coding or []:
        if coding.display:
            return coding.display
        if coding.code:
            return coding.code
    return ""


def _extract_dosage(resource: FhirMedicationRequest) -> str:
    for dosage in resource.dosageInstruction or []:
        if dosage.text:
            return dosage.text
        if dosage.patientInstruction:
            return dosage.patientInstruction
    return ""


def _extract_days(resource: FhirMedicationRequest) -> str:
    dispense = resource.dispenseRequest
    duration = dispense.expectedSupplyDuration if dispense else None
    value = duration.value if duration else None
    if value is not None:
        try:
            return f"{int(value)}日分"
        except (TypeError, ValueError):
            return f"{value}日分"
    return ""


def apply_fhir_to_orm(
    row: PrescriptionOrder,
    resource: FhirMedicationRequest,
) -> PrescriptionOrder:
    patient_id = _extract_subject_patient_id(resource)
    if patient_id:
        row.patient_id = patient_id
    drug_name = _extract_drug_name(resource)
    if drug_name:
        row.drug_name = drug_name
    dosage = _extract_dosage(resource)
    if dosage:
        row.dosage = dosage
    days = _extract_days(resource)
    if days:
        row.days = days
    if resource.authoredOn is not None:
        row.created_at = resource.authoredOn
    elif getattr(row, "created_at", None) is None:
        row.created_at = datetime.now(timezone.utc)
    row.type = row.type or "内服"
    return row


def fhir_to_orm_create(resource: FhirMedicationRequest) -> PrescriptionOrder:
    row = PrescriptionOrder(
        patient_id="",
        type="内服",
        days="",
        drug_name="",
        dosage="",
        created_at=datetime.now(timezone.utc),
    )
    return apply_fhir_to_orm(row, resource)
