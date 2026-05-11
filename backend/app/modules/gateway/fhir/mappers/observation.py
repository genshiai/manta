"""Observation ORM ⇔ FHIR R4B Observation マッパー (Step 3)。

ORM は vital-signs と laboratory を共通テーブルで扱う。FHIR 側の `category` で
区別する。血圧のような複合値は現 ORM に component カラムを持たないため、
`valueString` に保持する (Step 4 以降で Observation.component へ展開)。
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Iterable
from uuid import uuid4

from fhir.resources.R4B.codeableconcept import CodeableConcept
from fhir.resources.R4B.coding import Coding
from fhir.resources.R4B.observation import Observation as FhirObservation
from fhir.resources.R4B.quantity import Quantity
from fhir.resources.R4B.reference import Reference

from app.modules.gateway.fhir.loinc import LOINC_SYSTEM, UCUM_SYSTEM
from app.models import Observation as ObservationRow


CATEGORY_SYSTEM = "http://terminology.hl7.org/CodeSystem/observation-category"
INTERPRETATION_SYSTEM = "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation"


# ---------------------------------------------------------------------------
# Read: ORM → FHIR
# ---------------------------------------------------------------------------


def _build_code(row: ObservationRow) -> CodeableConcept:
    codings: list[Coding] = []
    if row.code and row.code_system:
        codings.append(
            Coding(system=row.code_system, code=row.code, display=row.code_display or None)
        )
    return CodeableConcept(coding=codings or None, text=row.code_text or row.code_display or None)


def _build_value_quantity(row: ObservationRow) -> Quantity | None:
    if row.value_quantity_value is None:
        return None
    # Decimal のまま渡す (float 経由で 7.2 → 7.2000...5 にならないように)
    quantity = Quantity(value=row.value_quantity_value)
    if row.value_quantity_unit:
        quantity.unit = row.value_quantity_unit
    if row.value_quantity_system:
        quantity.system = row.value_quantity_system
    if row.value_quantity_code:
        quantity.code = row.value_quantity_code
    return quantity


def _build_interpretation(row: ObservationRow) -> list[CodeableConcept] | None:
    if not row.interpretation_code:
        return None
    return [
        CodeableConcept(
            coding=[Coding(system=INTERPRETATION_SYSTEM, code=row.interpretation_code)]
        )
    ]


def _build_reference_range(row: ObservationRow):
    if not row.reference_range_text:
        return None
    from fhir.resources.R4B.observation import ObservationReferenceRange

    return [ObservationReferenceRange(text=row.reference_range_text)]


def orm_to_fhir(row: ObservationRow) -> FhirObservation:
    resource = FhirObservation(
        id=row.id,
        status=row.status,
        category=[
            CodeableConcept(
                coding=[Coding(system=CATEGORY_SYSTEM, code=row.category)],
            )
        ],
        code=_build_code(row),
        subject=Reference(reference=f"Patient/{row.patient_id}"),
    )
    if row.effective_datetime is not None:
        resource.effectiveDateTime = row.effective_datetime
    if row.issued_datetime is not None:
        resource.issued = row.issued_datetime
    quantity = _build_value_quantity(row)
    if quantity is not None:
        resource.valueQuantity = quantity
    elif row.value_string is not None:
        resource.valueString = row.value_string
    interpretation = _build_interpretation(row)
    if interpretation:
        resource.interpretation = interpretation
    ref_range = _build_reference_range(row)
    if ref_range:
        resource.referenceRange = ref_range
    if row.note:
        from fhir.resources.R4B.annotation import Annotation

        resource.note = [Annotation(text=row.note)]
    return resource


# ---------------------------------------------------------------------------
# Write: FHIR → ORM
# ---------------------------------------------------------------------------


def _first_coding(concept: CodeableConcept | None, system: str | None = None) -> Coding | None:
    if concept is None or not concept.coding:
        return None
    if system is None:
        return concept.coding[0]
    for coding in concept.coding:
        if coding.system == system:
            return coding
    return None


def _extract_patient_id(resource: FhirObservation) -> str | None:
    if resource.subject is None or not resource.subject.reference:
        return None
    ref = resource.subject.reference.strip()
    prefix = "Patient/"
    if not ref.startswith(prefix):
        return None
    return ref[len(prefix) :] or None


def _extract_category(categories: Iterable[CodeableConcept] | None) -> str | None:
    if not categories:
        return None
    for concept in categories:
        coding = _first_coding(concept, CATEGORY_SYSTEM) or _first_coding(concept)
        if coding and coding.code:
            return coding.code
    return None


def _extract_interpretation(concepts: Iterable[CodeableConcept] | None) -> str | None:
    if not concepts:
        return None
    for concept in concepts:
        coding = _first_coding(concept, INTERPRETATION_SYSTEM) or _first_coding(concept)
        if coding and coding.code:
            return coding.code
    return None


def _extract_reference_range_text(ranges) -> str | None:
    if not ranges:
        return None
    for entry in ranges:
        text = getattr(entry, "text", None)
        if text:
            return text
    return None


def _extract_note(notes) -> str | None:
    if not notes:
        return None
    for note in notes:
        text = getattr(note, "text", None)
        if text:
            return text
    return None


def apply_fhir_to_orm(row: ObservationRow, resource: FhirObservation) -> ObservationRow:
    patient_id = _extract_patient_id(resource)
    if patient_id:
        row.patient_id = patient_id

    if resource.status:
        row.status = resource.status

    category = _extract_category(resource.category) or row.category
    if category:
        row.category = category

    if resource.code is not None:
        primary = _first_coding(resource.code, LOINC_SYSTEM) or _first_coding(resource.code)
        row.code_system = primary.system if primary else None
        row.code = primary.code if primary else None
        row.code_display = primary.display if primary else None
        row.code_text = resource.code.text or (primary.display if primary else None)

    if resource.valueQuantity is not None:
        q = resource.valueQuantity
        row.value_quantity_value = Decimal(str(q.value)) if q.value is not None else None
        row.value_quantity_unit = q.unit
        row.value_quantity_system = q.system or (UCUM_SYSTEM if q.code else None)
        row.value_quantity_code = q.code
        row.value_string = None
    elif resource.valueString is not None:
        row.value_string = resource.valueString
        row.value_quantity_value = None
        row.value_quantity_unit = None
        row.value_quantity_system = None
        row.value_quantity_code = None

    row.interpretation_code = _extract_interpretation(resource.interpretation)
    row.reference_range_text = _extract_reference_range_text(resource.referenceRange)

    if resource.effectiveDateTime is not None:
        row.effective_datetime = resource.effectiveDateTime
    if resource.issued is not None:
        row.issued_datetime = resource.issued

    row.note = _extract_note(resource.note)
    return row


def fhir_to_orm_create(resource: FhirObservation, *, new_id: str | None = None) -> ObservationRow:
    row = ObservationRow(
        id=new_id or uuid4().hex,
        patient_id="",
        status="final",
        category="laboratory",
    )
    row.effective_datetime = datetime.now(timezone.utc)
    return apply_fhir_to_orm(row, resource)
