"""JP Core v1.x 必須項目バリデータ。

Step 1 では Patient のみ。Step 2 以降でリソースごとに関数を追加する。
FastAPI 経路では ``FhirValidationError`` を投げ、ルーター側で OperationOutcome
に整形して 422 を返す。
"""

from __future__ import annotations

from fhir.resources.R4B.appointment import Appointment as FhirAppointment
from fhir.resources.R4B.condition import Condition as FhirCondition
from fhir.resources.R4B.medicationrequest import (
    MedicationRequest as FhirMedicationRequest,
)
from fhir.resources.R4B.observation import Observation as FhirObservation
from fhir.resources.R4B.patient import Patient as FhirPatient


class FhirValidationError(Exception):
    """JP Core 必須項目違反。ルーター側で 422 + OperationOutcome に変換する。"""

    def __init__(self, issues: list[str]):
        self.issues = issues
        super().__init__("; ".join(issues))


def validate_jp_patient(resource: FhirPatient) -> None:
    """JP Core Patient プロファイルの必須項目を検査する。

    規定:
    - identifier は 1 件以上 (JP Core Patient 必須。院内ID / 保険者番号等)
    - identifier.system と identifier.value は必須
    - name は 1 件以上
    - use=official の HumanName が 1 件以上必要 (漢字氏名を官公庁仕様に沿って)
    - 上記 official には family (姓) を必須
    """
    issues: list[str] = []

    identifiers = resource.identifier or []
    if len(identifiers) == 0:
        issues.append("Patient.identifier は必須です (JP Core Patient)")
    for index, ident in enumerate(identifiers):
        if not ident.system:
            issues.append(f"Patient.identifier[{index}].system は必須です")
        if not ident.value:
            issues.append(f"Patient.identifier[{index}].value は必須です")

    names = resource.name or []
    if len(names) == 0:
        issues.append("Patient.name は必須です (JP Core Patient)")
    else:
        official_names = [n for n in names if n.use == "official"]
        if not official_names:
            issues.append(
                "Patient.name に use=official (漢字氏名) を 1 件以上含めてください"
            )
        for index, n in enumerate(official_names):
            if not n.family:
                issues.append(
                    f"Patient.name[use=official][{index}].family (姓) は必須です"
                )

    if issues:
        raise FhirValidationError(issues)


def validate_jp_observation(resource: FhirObservation) -> None:
    """JP Core Observation プロファイルの必須項目を検査する。

    規定:
    - subject は必須、reference は "Patient/{id}" 形式
    - status は必須
    - code は必須 (text または coding)
    - value[x] または dataAbsentReason のいずれかが必須 (Step 3 では value[x] を強制)
    """
    issues: list[str] = []

    subject = resource.subject
    if subject is None or not subject.reference:
        issues.append("Observation.subject.reference は必須です (Patient/{id})")
    elif not subject.reference.startswith("Patient/"):
        issues.append("Observation.subject.reference は Patient/{id} 形式である必要があります")

    if not resource.status:
        issues.append("Observation.status は必須です")

    code = resource.code
    if code is None:
        issues.append("Observation.code は必須です")
    else:
        has_coding = bool(code.coding and any(c.code and c.system for c in code.coding))
        if not code.text and not has_coding:
            issues.append(
                "Observation.code には text か coding(system+code) のいずれかが必要です"
            )

    has_value = (
        resource.valueQuantity is not None
        or resource.valueString is not None
        or resource.valueCodeableConcept is not None
        or resource.valueBoolean is not None
        or resource.valueInteger is not None
        or resource.valueRange is not None
        or resource.valueRatio is not None
    )
    if not has_value and resource.dataAbsentReason is None:
        issues.append(
            "Observation には value[x] (Quantity/String/CodeableConcept/... いずれか) "
            "または dataAbsentReason が必要です"
        )

    if issues:
        raise FhirValidationError(issues)


def validate_jp_condition(resource: FhirCondition) -> None:
    """JP Core Condition プロファイルの必須項目を検査する。

    規定:
    - subject は必須、reference は "Patient/{id}" 形式
    - clinicalStatus は必須 (コードが 1 つ以上)
    - code は必須 (text か coding のいずれか)
    """
    issues: list[str] = []

    subject = resource.subject
    if subject is None or not subject.reference:
        issues.append("Condition.subject.reference は必須です (Patient/{id})")
    elif not subject.reference.startswith("Patient/"):
        issues.append("Condition.subject.reference は Patient/{id} 形式である必要があります")

    clinical = resource.clinicalStatus
    if clinical is None or not clinical.coding or not any(c.code for c in clinical.coding):
        issues.append("Condition.clinicalStatus はコード必須です")

    code = resource.code
    if code is None:
        issues.append("Condition.code は必須です")
    else:
        has_coding = bool(code.coding and any(c.code and c.system for c in code.coding))
        if not code.text and not has_coding:
            issues.append(
                "Condition.code には text か coding(system+code) のいずれかが必要です"
            )

    if issues:
        raise FhirValidationError(issues)


def validate_jp_medication_request(resource: FhirMedicationRequest) -> None:
    """JP Core MedicationRequest プロファイルの Phase 1 最小検査。

    規定:
    - subject は必須、reference は "Patient/{id}" 形式
    - status / intent は必須
    - medicationCodeableConcept は text または coding を持つ
    - dosageInstruction は 1 件以上必要
    """
    issues: list[str] = []

    subject = resource.subject
    if subject is None or not subject.reference:
        issues.append("MedicationRequest.subject.reference は必須です (Patient/{id})")
    elif not subject.reference.startswith("Patient/"):
        issues.append(
            "MedicationRequest.subject.reference は Patient/{id} 形式である必要があります"
        )

    if not resource.status:
        issues.append("MedicationRequest.status は必須です")
    if not resource.intent:
        issues.append("MedicationRequest.intent は必須です")

    medication = resource.medicationCodeableConcept
    if medication is None:
        issues.append("MedicationRequest.medicationCodeableConcept は必須です")
    else:
        has_coding = bool(
            medication.coding and any(c.code and c.system for c in medication.coding)
        )
        if not medication.text and not has_coding:
            issues.append(
                "MedicationRequest.medicationCodeableConcept には text か "
                "coding(system+code) のいずれかが必要です"
            )

    dosage = resource.dosageInstruction or []
    if len(dosage) == 0:
        issues.append("MedicationRequest.dosageInstruction は 1 件以上必要です")

    if issues:
        raise FhirValidationError(issues)


def validate_jp_appointment(resource: FhirAppointment) -> None:
    """JP Core Appointment の Phase 1 最小検査。

    JP Core の厳格運用は Step 5 以降で拡張する。Phase 1 では再診予約連携に必要な
    status / start / Patient participant を必須にする。
    """
    issues: list[str] = []

    if not resource.status:
        issues.append("Appointment.status は必須です")
    if resource.start is None and not resource.requestedPeriod:
        issues.append("Appointment.start または requestedPeriod は必須です")

    participants = resource.participant or []
    if not participants:
        issues.append("Appointment.participant は 1 件以上必要です")
    has_patient = False
    for participant in participants:
        actor = participant.actor
        if actor and actor.reference and actor.reference.startswith("Patient/"):
            has_patient = True
    if not has_patient:
        issues.append("Appointment.participant に Patient/{id} 参照が必要です")

    if issues:
        raise FhirValidationError(issues)
