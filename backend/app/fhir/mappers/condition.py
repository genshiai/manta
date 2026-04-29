"""Condition ORM ⇔ FHIR R4B Condition マッパー (Step 2)。

JP Core 病名プロファイル準拠を目標とする。内部 ORM は `CodeableConcept` ツリーを
展開せず、ICD10 と MEDIS-DC 病名管理番号を別カラムに持つ。mapper 層で FHIR の
CodeableConcept / Coding ツリーに組み立て直す。
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable
from uuid import uuid4

from fhir.resources.R4B.codeableconcept import CodeableConcept
from fhir.resources.R4B.coding import Coding
from fhir.resources.R4B.condition import Condition as FhirCondition
from fhir.resources.R4B.reference import Reference

from app.models import Condition as ConditionRow


# FHIR / JP Core 推奨の CodeSystem URI
ICD10_SYSTEM = "http://hl7.org/fhir/sid/icd-10"
MEDIS_MANAGEMENT_SYSTEM = "urn:oid:1.2.392.200119.4.101.5"
CLINICAL_STATUS_SYSTEM = "http://terminology.hl7.org/CodeSystem/condition-clinical"
VERIFICATION_STATUS_SYSTEM = "http://terminology.hl7.org/CodeSystem/condition-ver-status"
CATEGORY_SYSTEM = "http://terminology.hl7.org/CodeSystem/condition-category"


# ---------------------------------------------------------------------------
# Read: ORM → FHIR
# ---------------------------------------------------------------------------


def _codeable_concept_single(system: str, code: str, *, display: str | None = None) -> CodeableConcept:
    coding = Coding(system=system, code=code)
    if display:
        coding.display = display
    return CodeableConcept(coding=[coding])


def _build_condition_code(row: ConditionRow) -> CodeableConcept:
    codings: list[Coding] = []
    if row.icd10_code:
        codings.append(
            Coding(system=ICD10_SYSTEM, code=row.icd10_code, display=row.disease_name or None)
        )
    if row.management_number:
        codings.append(
            Coding(
                system=MEDIS_MANAGEMENT_SYSTEM,
                code=row.management_number,
                display=row.disease_name or None,
            )
        )
    return CodeableConcept(
        coding=codings or None,
        text=row.disease_name or None,
    )


def orm_to_fhir(row: ConditionRow) -> FhirCondition:
    resource = FhirCondition(
        id=row.id,
        subject=Reference(reference=f"Patient/{row.patient_id}"),
        clinicalStatus=_codeable_concept_single(CLINICAL_STATUS_SYSTEM, row.clinical_status),
        verificationStatus=_codeable_concept_single(
            VERIFICATION_STATUS_SYSTEM, row.verification_status
        ),
        category=[_codeable_concept_single(CATEGORY_SYSTEM, row.category)],
        code=_build_condition_code(row),
        recordedDate=row.recorded_date,
    )
    if row.onset_date is not None:
        resource.onsetDateTime = datetime.combine(
            row.onset_date, datetime.min.time(), tzinfo=timezone.utc
        )
    elif row.onset_text:
        resource.onsetString = row.onset_text
    if row.abatement_date is not None:
        resource.abatementDateTime = datetime.combine(
            row.abatement_date, datetime.min.time(), tzinfo=timezone.utc
        )
    if row.note:
        # note は Annotation[] 型。Step 2 ではテキストだけ保持する簡略形を使う。
        from fhir.resources.R4B.annotation import Annotation

        resource.note = [Annotation(text=row.note)]
    return resource


# ---------------------------------------------------------------------------
# Write: FHIR → ORM
# ---------------------------------------------------------------------------


def _extract_coding(
    concept: CodeableConcept | None, system: str | None = None
) -> Coding | None:
    if concept is None or not concept.coding:
        return None
    if system is None:
        return concept.coding[0]
    for coding in concept.coding:
        if coding.system == system:
            return coding
    return None


def _extract_code(concept: CodeableConcept | None, system: str | None = None) -> str | None:
    coding = _extract_coding(concept, system)
    return coding.code if coding else None


def _extract_subject_patient_id(resource: FhirCondition) -> str | None:
    if resource.subject is None or not resource.subject.reference:
        return None
    ref = resource.subject.reference.strip()
    prefix = "Patient/"
    if not ref.startswith(prefix):
        return None
    return ref[len(prefix) :] or None


def _extract_first_note(notes: Iterable | None) -> str | None:
    if not notes:
        return None
    for note in notes:
        text = getattr(note, "text", None)
        if text:
            return text
    return None


def apply_fhir_to_orm(row: ConditionRow, resource: FhirCondition) -> ConditionRow:
    patient_id = _extract_subject_patient_id(resource)
    if patient_id:
        row.patient_id = patient_id

    clinical = _extract_code(resource.clinicalStatus, CLINICAL_STATUS_SYSTEM) or _extract_code(
        resource.clinicalStatus
    )
    if clinical:
        row.clinical_status = clinical

    verification = _extract_code(
        resource.verificationStatus, VERIFICATION_STATUS_SYSTEM
    ) or _extract_code(resource.verificationStatus)
    if verification:
        row.verification_status = verification

    if resource.category:
        cat = _extract_code(resource.category[0], CATEGORY_SYSTEM) or _extract_code(
            resource.category[0]
        )
        if cat:
            row.category = cat

    if resource.code is not None:
        row.icd10_code = _extract_code(resource.code, ICD10_SYSTEM)
        row.management_number = _extract_code(resource.code, MEDIS_MANAGEMENT_SYSTEM)
        display_source = _extract_coding(resource.code, ICD10_SYSTEM) or _extract_coding(
            resource.code, MEDIS_MANAGEMENT_SYSTEM
        )
        display = resource.code.text or (display_source.display if display_source else None)
        row.disease_name = display or row.disease_name or ""

    if resource.onsetDateTime is not None:
        row.onset_date = resource.onsetDateTime.date()
        row.onset_text = None
    elif resource.onsetString is not None:
        row.onset_text = resource.onsetString
        row.onset_date = None

    if resource.abatementDateTime is not None:
        row.abatement_date = resource.abatementDateTime.date()

    if resource.recordedDate is not None:
        row.recorded_date = resource.recordedDate

    row.note = _extract_first_note(resource.note)
    return row


def fhir_to_orm_create(resource: FhirCondition, *, new_id: str | None = None) -> ConditionRow:
    """POST /fhir/Condition 用: 空行から構築する。"""
    row = ConditionRow(
        id=new_id or uuid4().hex,
        patient_id="",
        clinical_status="active",
        verification_status="confirmed",
        category="problem-list-item",
        disease_name="",
        recorded_date=datetime.now(timezone.utc),
    )
    return apply_fhir_to_orm(row, resource)
