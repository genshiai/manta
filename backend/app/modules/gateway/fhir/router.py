"""FHIR ルーター (Step 0 + Step 1 + Step 2 + Step 3)。

サポートするインタラクション:
- GET  /fhir/metadata                                — CapabilityStatement
- GET  /fhir/Patient/{id}                            — Patient 読み取り
- POST /fhir/Patient                                 — Patient 作成
- PUT  /fhir/Patient/{id}                            — Patient 更新
- GET  /fhir/Encounter/{id}                          — Encounter 読み取り
- GET  /fhir/Encounter?patient=&date=                — searchset Bundle
- GET  /fhir/Composition/{id}                        — Composition 読み取り
- GET  /fhir/Composition?patient=&date=              — searchset Bundle
- GET  /fhir/Condition/{id}                          — Condition 読み取り
- GET  /fhir/Condition?patient={id}                  — searchset Bundle
- POST /fhir/Condition                               — Condition 作成
- PUT  /fhir/Condition/{id}                          — Condition 更新
- GET  /fhir/Observation/{id}                        — Observation 読み取り
- GET  /fhir/Observation?patient=&category=&code=&date= — searchset Bundle
- POST /fhir/Observation                             — Observation 作成
- PUT  /fhir/Observation/{id}                        — Observation 更新
- GET  /fhir/DiagnosticReport/{id}                  — DiagnosticReport 読み取り
- GET  /fhir/DiagnosticReport?patient=&category=&code=&date= — searchset Bundle
- GET  /fhir/ServiceRequest/{id}                     — ServiceRequest 読み取り
- GET  /fhir/ServiceRequest?patient=&category=&code= — searchset Bundle
- GET  /fhir/MedicationRequest/{id}                  — MedicationRequest 読み取り
- GET  /fhir/MedicationRequest?patient=&code=&authoredon= — searchset Bundle
- POST /fhir/MedicationRequest                       — MedicationRequest 作成
- PUT  /fhir/MedicationRequest/{id}                  — MedicationRequest 更新
- GET  /fhir/Appointment/{id}                        — Appointment 読み取り
- GET  /fhir/Appointment?patient=&date=              — searchset Bundle
- POST /fhir/Appointment                             — Appointment 作成
- PUT  /fhir/Appointment/{id}                        — Appointment 更新

DocumentReference などの添付文書系リソースは docs/FHIR_MIGRATION_PLAN.md §8 Step 8 以降で追加する。
"""

from __future__ import annotations

from typing import Type, TypeVar
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from datetime import date, datetime, time, timezone

from fhir.resources.R4B.bundle import Bundle, BundleEntry
from fhir.resources.R4B.appointment import Appointment as FhirAppointment
from fhir.resources.R4B.condition import Condition as FhirCondition
from fhir.resources.R4B.medicationrequest import (
    MedicationRequest as FhirMedicationRequest,
)
from fhir.resources.R4B.observation import Observation as FhirObservation
from fhir.resources.R4B.operationoutcome import (
    OperationOutcome,
    OperationOutcomeIssue,
)
from fhir.resources.R4B.patient import Patient as FhirPatient
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.modules.gateway.fhir.capability_statement import build_capability_statement
from app.modules.gateway.fhir.mappers.appointment import (
    apply_fhir_to_orm as apply_fhir_to_appointment,
    fhir_to_orm_create as fhir_to_appointment_create,
    orm_to_fhir as appointment_to_fhir,
)
from app.modules.gateway.fhir.mappers.condition import (
    apply_fhir_to_orm as apply_fhir_to_condition,
    fhir_to_orm_create as fhir_to_condition_create,
    orm_to_fhir as condition_to_fhir,
)
from app.modules.gateway.fhir.mappers.composition import orm_to_fhir as composition_to_fhir
from app.modules.gateway.fhir.mappers.diagnostic_report import (
    LAB_REPORT_CODE,
    build_diagnostic_report,
    diagnostic_report_id,
    group_lab_results_by_report_date,
)
from app.modules.gateway.fhir.mappers.encounter import patient_encounters_to_fhir
from app.modules.gateway.fhir.mappers.observation import (
    apply_fhir_to_orm as apply_fhir_to_observation,
    fhir_to_orm_create as fhir_to_observation_create,
    orm_to_fhir as observation_to_fhir,
)
from app.modules.gateway.fhir.mappers.medication_request import (
    apply_fhir_to_orm as apply_fhir_to_medication_request,
    fhir_to_orm_create as fhir_to_medication_request_create,
    orm_to_fhir as medication_request_to_fhir,
)
from app.modules.gateway.fhir.mappers.patient import (
    apply_fhir_to_orm,
    fhir_to_orm_create,
    orm_to_fhir,
)
from app.modules.gateway.fhir.mappers.service_request import (
    lab_order_to_fhir,
    patient_json_orders_to_fhir,
)
from app.modules.gateway.fhir.validators.jp_core import (
    FhirValidationError,
    validate_jp_appointment,
    validate_jp_condition,
    validate_jp_medication_request,
    validate_jp_observation,
    validate_jp_patient,
)
from app.modules.karte.models import (
    ChartNote,
    Condition,
    LabOrder,
    Observation,
    Patient,
    PrescriptionOrder,
    Reservation,
)
from app.modules.master_data.models import PrescriptionCatalogMaster


FHIR_JSON = "application/fhir+json"


def _fhir_response(resource, *, status_code: int = status.HTTP_200_OK) -> Response:
    return Response(
        content=resource.model_dump_json(exclude_none=True),
        media_type=FHIR_JSON,
        status_code=status_code,
    )


def _operation_outcome(
    issues: list[str],
    *,
    severity: str = "error",
    code: str = "invalid",
) -> OperationOutcome:
    return OperationOutcome(
        issue=[
            OperationOutcomeIssue(
                severity=severity,
                code=code,
                diagnostics=message,
            )
            for message in issues
        ]
    )


def _generate_patient_id() -> str:
    # 既存 id は "0009900040" 形式 (String(32))。衝突回避のため UUID4 hex を流用。
    return uuid4().hex


_ResourceT = TypeVar("_ResourceT", bound=BaseModel)


async def _parse_fhir_resource(
    request: Request, resource_cls: Type[_ResourceT], *, label: str
) -> _ResourceT:
    try:
        payload = await request.json()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_operation_outcome(["request body は JSON として解釈できません"]).model_dump(
                exclude_none=True
            ),
        )

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_operation_outcome(
                [f"FHIR {label} リソース (JSON object) が必要です"]
            ).model_dump(exclude_none=True),
        )

    try:
        return resource_cls.model_validate(payload)
    except ValidationError as exc:
        messages = [
            f"{'.'.join(str(part) for part in err.get('loc', []))}: {err.get('msg')}"
            for err in exc.errors()
        ]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_operation_outcome(messages or [f"FHIR {label} 構造検証に失敗しました"]).model_dump(
                exclude_none=True
            ),
        )


async def _parse_fhir_patient(request: Request) -> FhirPatient:
    return await _parse_fhir_resource(request, FhirPatient, label="Patient")


async def _parse_fhir_condition(request: Request) -> FhirCondition:
    return await _parse_fhir_resource(request, FhirCondition, label="Condition")


async def _parse_fhir_observation(request: Request) -> FhirObservation:
    return await _parse_fhir_resource(request, FhirObservation, label="Observation")


async def _parse_fhir_medication_request(request: Request) -> FhirMedicationRequest:
    return await _parse_fhir_resource(
        request, FhirMedicationRequest, label="MedicationRequest"
    )


async def _parse_fhir_appointment(request: Request) -> FhirAppointment:
    return await _parse_fhir_resource(request, FhirAppointment, label="Appointment")


router = APIRouter(prefix="/fhir", tags=["fhir"])


@router.get("/metadata")
def get_metadata() -> Response:
    return _fhir_response(build_capability_statement())


@router.get("/Patient/{patient_id}")
def read_patient(patient_id: str, db: Session = Depends(get_db)) -> Response:
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient/{patient_id} not found",
        )
    return _fhir_response(orm_to_fhir(patient))


@router.post("/Patient", status_code=status.HTTP_201_CREATED)
async def create_patient(request: Request, db: Session = Depends(get_db)) -> Response:
    resource = await _parse_fhir_patient(request)
    try:
        validate_jp_patient(resource)
    except FhirValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=_operation_outcome(exc.issues).model_dump(exclude_none=True),
        )

    new_id = _generate_patient_id()
    row = fhir_to_orm_create(resource, new_id=new_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _fhir_response(orm_to_fhir(row), status_code=status.HTTP_201_CREATED)


@router.put("/Patient/{patient_id}")
async def update_patient(
    patient_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    resource = await _parse_fhir_patient(request)
    if resource.id and resource.id != patient_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_operation_outcome(
                [
                    f"URL の id ({patient_id}) と body の id ({resource.id}) が一致しません",
                ]
            ).model_dump(exclude_none=True),
        )
    try:
        validate_jp_patient(resource)
    except FhirValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=_operation_outcome(exc.issues).model_dump(exclude_none=True),
        )

    row = db.get(Patient, patient_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient/{patient_id} not found",
        )
    apply_fhir_to_orm(row, resource)
    db.commit()
    db.refresh(row)
    return _fhir_response(orm_to_fhir(row))


# ---------------------------------------------------------------------------
# Encounter
# ---------------------------------------------------------------------------


def _encounter_matches_date(resource, date_values: list[str] | None) -> bool:
    if not date_values:
        return True
    if resource.period is None or resource.period.start is None:
        return False

    encounter_start = resource.period.start.astimezone(timezone.utc)
    for raw_date in date_values:
        prefix, start, end = _date_bounds(raw_date)
        if prefix == "eq":
            if not (start <= encounter_start <= (end or start)):
                return False
        elif prefix in {"ge", "gt"}:
            if encounter_start < start:
                return False
        elif prefix in {"le", "lt"}:
            if encounter_start > start:
                return False
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=_operation_outcome(
                    [f"date prefix '{prefix}' は未対応です (ge/le/eq のみ)"]
                ).model_dump(exclude_none=True),
            )
    return True


@router.get("/Encounter/{encounter_id}")
def read_encounter(encounter_id: str, db: Session = Depends(get_db)) -> Response:
    patients = db.scalars(select(Patient)).all()
    for patient_row in patients:
        for resource in patient_encounters_to_fhir(patient_row):
            if resource.id == encounter_id:
                return _fhir_response(resource)
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Encounter/{encounter_id} not found",
    )


@router.get("/Encounter")
def search_encounters(
    patient: str | None = Query(default=None),
    subject: str | None = Query(default=None),
    date_param: list[str] | None = Query(default=None, alias="date"),
    db: Session = Depends(get_db),
) -> Response:
    raw = subject or patient
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_operation_outcome(
                ["search には patient (または subject) パラメータが必要です"]
            ).model_dump(exclude_none=True),
        )

    patient_id = _normalize_patient_param(raw)
    row = db.get(Patient, patient_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient/{patient_id} not found",
        )

    resources = [
        resource
        for resource in patient_encounters_to_fhir(row)
        if _encounter_matches_date(resource, date_param)
    ]
    entries = [BundleEntry(resource=resource) for resource in resources]
    bundle = Bundle(type="searchset", total=len(entries), entry=entries or None)
    return _fhir_response(bundle)


# ---------------------------------------------------------------------------
# Composition
# ---------------------------------------------------------------------------


def _composition_matches_date(note: ChartNote, date_values: list[str] | None) -> bool:
    if not date_values:
        return True
    saved_at = note.saved_at
    if saved_at.tzinfo is None:
        saved_at = saved_at.replace(tzinfo=timezone.utc)
    saved_at = saved_at.astimezone(timezone.utc)

    for raw_date in date_values:
        prefix, start, end = _date_bounds(raw_date)
        if prefix == "eq":
            if not (start <= saved_at <= (end or start)):
                return False
        elif prefix in {"ge", "gt"}:
            if saved_at < start:
                return False
        elif prefix in {"le", "lt"}:
            if saved_at > start:
                return False
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=_operation_outcome(
                    [f"date prefix '{prefix}' は未対応です (ge/le/eq のみ)"]
                ).model_dump(exclude_none=True),
            )
    return True


@router.get("/Composition/{composition_id}")
def read_composition(composition_id: str, db: Session = Depends(get_db)) -> Response:
    try:
        note_id = int(composition_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Composition/{composition_id} not found",
        ) from exc

    note = db.get(ChartNote, note_id)
    if note is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Composition/{composition_id} not found",
        )
    return _fhir_response(composition_to_fhir(note, patient=db.get(Patient, note.patient_id)))


@router.get("/Composition")
def search_compositions(
    patient: str | None = Query(default=None),
    subject: str | None = Query(default=None),
    date_param: list[str] | None = Query(default=None, alias="date"),
    db: Session = Depends(get_db),
) -> Response:
    raw = subject or patient
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_operation_outcome(
                ["search には patient (または subject) パラメータが必要です"]
            ).model_dump(exclude_none=True),
        )

    patient_id = _normalize_patient_param(raw)
    patient_row = db.get(Patient, patient_id)
    if patient_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient/{patient_id} not found",
        )

    rows = db.scalars(
        select(ChartNote)
        .where(ChartNote.patient_id == patient_id)
        .order_by(ChartNote.saved_at.desc(), ChartNote.version.desc())
    ).all()
    entries = [
        BundleEntry(resource=composition_to_fhir(row, patient=patient_row))
        for row in rows
        if _composition_matches_date(row, date_param)
    ]
    bundle = Bundle(type="searchset", total=len(entries), entry=entries or None)
    return _fhir_response(bundle)


# ---------------------------------------------------------------------------
# Condition
# ---------------------------------------------------------------------------


def _require_patient(db: Session, patient_id: str) -> None:
    if db.get(Patient, patient_id) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=_operation_outcome(
                [f"subject で参照された Patient/{patient_id} が存在しません"]
            ).model_dump(exclude_none=True),
        )


def _normalize_patient_param(value: str) -> str:
    """`patient=Patient/abc` と `patient=abc` の両方を受け付ける。"""
    prefix = "Patient/"
    if value.startswith(prefix):
        return value[len(prefix) :]
    return value


@router.get("/Condition/{condition_id}")
def read_condition(condition_id: str, db: Session = Depends(get_db)) -> Response:
    row = db.get(Condition, condition_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Condition/{condition_id} not found",
        )
    return _fhir_response(condition_to_fhir(row))


@router.get("/Condition")
def search_conditions(
    patient: str | None = Query(default=None),
    subject: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> Response:
    raw = subject or patient
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_operation_outcome(
                ["search には patient (または subject) パラメータが必要です"]
            ).model_dump(exclude_none=True),
        )
    patient_id = _normalize_patient_param(raw)
    rows = db.scalars(
        select(Condition)
        .where(Condition.patient_id == patient_id)
        .order_by(Condition.recorded_date.desc())
    ).all()

    entries = [BundleEntry(resource=condition_to_fhir(row)) for row in rows]
    bundle = Bundle(type="searchset", total=len(entries), entry=entries or None)
    return _fhir_response(bundle)


@router.post("/Condition", status_code=status.HTTP_201_CREATED)
async def create_condition(request: Request, db: Session = Depends(get_db)) -> Response:
    resource = await _parse_fhir_condition(request)
    try:
        validate_jp_condition(resource)
    except FhirValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=_operation_outcome(exc.issues).model_dump(exclude_none=True),
        )

    row = fhir_to_condition_create(resource)
    _require_patient(db, row.patient_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _fhir_response(condition_to_fhir(row), status_code=status.HTTP_201_CREATED)


@router.put("/Condition/{condition_id}")
async def update_condition(
    condition_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    resource = await _parse_fhir_condition(request)
    if resource.id and resource.id != condition_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_operation_outcome(
                [
                    f"URL の id ({condition_id}) と body の id ({resource.id}) が一致しません",
                ]
            ).model_dump(exclude_none=True),
        )
    try:
        validate_jp_condition(resource)
    except FhirValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=_operation_outcome(exc.issues).model_dump(exclude_none=True),
        )

    row = db.get(Condition, condition_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Condition/{condition_id} not found",
        )
    apply_fhir_to_condition(row, resource)
    _require_patient(db, row.patient_id)
    db.commit()
    db.refresh(row)
    return _fhir_response(condition_to_fhir(row))


# ---------------------------------------------------------------------------
# Observation
# ---------------------------------------------------------------------------


def _parse_fhir_date_prefix(raw: str) -> tuple[str, date]:
    """'ge2026-01-01' → ('ge', date(2026,1,1))。prefix なしは 'eq'。"""
    prefix = "eq"
    value = raw
    if len(raw) >= 2 and raw[:2] in {"eq", "ne", "ge", "le", "gt", "lt"}:
        prefix = raw[:2]
        value = raw[2:]
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_operation_outcome(
                [f"date パラメータが ISO-8601 日付ではありません: {raw}"]
            ).model_dump(exclude_none=True),
        ) from exc
    return prefix, parsed


def _extract_code_value(token: str) -> str:
    """'http://loinc.org|4548-4' → '4548-4'。'system|code' は code 側だけ使う。"""
    if "|" in token:
        return token.split("|", 1)[1]
    return token


@router.get("/Observation/{observation_id}")
def read_observation(observation_id: str, db: Session = Depends(get_db)) -> Response:
    row = db.get(Observation, observation_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Observation/{observation_id} not found",
        )
    return _fhir_response(observation_to_fhir(row))


@router.get("/Observation")
def search_observations(
    patient: str | None = Query(default=None),
    subject: str | None = Query(default=None),
    category: str | None = Query(default=None),
    code: str | None = Query(default=None),
    date_param: list[str] | None = Query(default=None, alias="date"),
    db: Session = Depends(get_db),
) -> Response:
    raw = subject or patient
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_operation_outcome(
                ["search には patient (または subject) パラメータが必要です"]
            ).model_dump(exclude_none=True),
        )
    patient_id = _normalize_patient_param(raw)

    stmt = select(Observation).where(Observation.patient_id == patient_id)
    if category:
        stmt = stmt.where(Observation.category == category)
    if code:
        stmt = stmt.where(Observation.code == _extract_code_value(code))
    for raw_date in date_param or []:
        prefix, parsed = _parse_fhir_date_prefix(raw_date)
        if prefix in {"ge", "gt"}:
            stmt = stmt.where(Observation.effective_datetime >= parsed)
        elif prefix in {"le", "lt"}:
            stmt = stmt.where(Observation.effective_datetime <= parsed)
        elif prefix == "eq":
            from datetime import datetime, time, timezone

            day_start = datetime.combine(parsed, time.min, tzinfo=timezone.utc)
            day_end = datetime.combine(parsed, time.max, tzinfo=timezone.utc)
            stmt = stmt.where(Observation.effective_datetime >= day_start).where(
                Observation.effective_datetime <= day_end
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=_operation_outcome(
                    [f"date prefix '{prefix}' は未対応です (ge/le/eq のみ)"]
                ).model_dump(exclude_none=True),
            )

    stmt = stmt.order_by(Observation.effective_datetime.desc())
    rows = db.scalars(stmt).all()

    entries = [BundleEntry(resource=observation_to_fhir(row)) for row in rows]
    bundle = Bundle(type="searchset", total=len(entries), entry=entries or None)
    return _fhir_response(bundle)


@router.post("/Observation", status_code=status.HTTP_201_CREATED)
async def create_observation(request: Request, db: Session = Depends(get_db)) -> Response:
    resource = await _parse_fhir_observation(request)
    try:
        validate_jp_observation(resource)
    except FhirValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=_operation_outcome(exc.issues).model_dump(exclude_none=True),
        )

    row = fhir_to_observation_create(resource)
    _require_patient(db, row.patient_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _fhir_response(observation_to_fhir(row), status_code=status.HTTP_201_CREATED)


@router.put("/Observation/{observation_id}")
async def update_observation(
    observation_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    resource = await _parse_fhir_observation(request)
    if resource.id and resource.id != observation_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_operation_outcome(
                [
                    f"URL の id ({observation_id}) と body の id ({resource.id}) が一致しません",
                ]
            ).model_dump(exclude_none=True),
        )
    try:
        validate_jp_observation(resource)
    except FhirValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=_operation_outcome(exc.issues).model_dump(exclude_none=True),
        )

    row = db.get(Observation, observation_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Observation/{observation_id} not found",
        )
    apply_fhir_to_observation(row, resource)
    _require_patient(db, row.patient_id)
    db.commit()
    db.refresh(row)
    return _fhir_response(observation_to_fhir(row))


# ---------------------------------------------------------------------------
# MedicationRequest
# ---------------------------------------------------------------------------


def _parse_medication_request_id(raw: str) -> int:
    try:
        return int(raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"MedicationRequest/{raw} not found",
        ) from exc


def _find_prescription_catalog(
    db: Session, order: PrescriptionOrder
) -> PrescriptionCatalogMaster | None:
    return db.scalar(
        select(PrescriptionCatalogMaster)
        .where(PrescriptionCatalogMaster.drug_name == order.drug_name)
        .limit(1)
    )


def _catalogs_by_drug_name(
    db: Session, orders: list[PrescriptionOrder]
) -> dict[str, PrescriptionCatalogMaster]:
    drug_names = sorted({order.drug_name for order in orders if order.drug_name})
    if not drug_names:
        return {}
    rows = db.scalars(
        select(PrescriptionCatalogMaster).where(
            PrescriptionCatalogMaster.drug_name.in_(drug_names)
        )
    ).all()
    return {row.drug_name: row for row in rows}


def _medication_code_matches(
    order: PrescriptionOrder,
    catalog: PrescriptionCatalogMaster | None,
    code_token: str,
) -> bool:
    code = _extract_code_value(code_token)
    if order.drug_name == code:
        return True
    if catalog is None:
        return False
    return code in {catalog.yj_code, catalog.hot_code, catalog.drug_name}


def _date_bounds(raw_date: str) -> tuple[str, datetime, datetime | None]:
    prefix, parsed = _parse_fhir_date_prefix(raw_date)
    day_start = datetime.combine(parsed, time.min, tzinfo=timezone.utc)
    day_end = datetime.combine(parsed, time.max, tzinfo=timezone.utc)
    if prefix == "eq":
        return prefix, day_start, day_end
    return prefix, day_start, None


def _apply_authoredon_filters(stmt, authoredon_values: list[str] | None):
    for raw_date in authoredon_values or []:
        prefix, start, end = _date_bounds(raw_date)
        if prefix == "eq":
            stmt = stmt.where(PrescriptionOrder.created_at >= start).where(
                PrescriptionOrder.created_at <= end
            )
        elif prefix in {"ge", "gt"}:
            stmt = stmt.where(PrescriptionOrder.created_at >= start)
        elif prefix in {"le", "lt"}:
            stmt = stmt.where(PrescriptionOrder.created_at <= start)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=_operation_outcome(
                    [f"authoredon prefix '{prefix}' は未対応です (ge/le/eq のみ)"]
                ).model_dump(exclude_none=True),
            )
    return stmt


# ---------------------------------------------------------------------------
# DiagnosticReport
# ---------------------------------------------------------------------------


def _diagnostic_reports_for_patient(db: Session, patient_id: str):
    patient_row = db.get(Patient, patient_id)
    if patient_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient/{patient_id} not found",
        )

    observations = db.scalars(
        select(Observation)
        .where(
            Observation.patient_id == patient_id,
            Observation.category == "laboratory",
        )
        .order_by(Observation.effective_datetime.desc(), Observation.issued_datetime.desc())
    ).all()
    observation_ids_by_key: dict[tuple[str, str], str] = {}
    for row in observations:
        if not row.code_text or row.effective_datetime is None:
            continue
        report_key = row.effective_datetime.astimezone(timezone.utc).strftime("%Y%m%d")
        observation_ids_by_key.setdefault((report_key, row.code_text), row.id)

    resources = []
    for reported_at, items in group_lab_results_by_report_date(patient_row):
        report_key = diagnostic_report_id(patient_row.id, reported_at).rsplit("-", 1)[1]
        refs_by_item = {
            str(item_name): observation_id
            for (date_key, item_name), observation_id in observation_ids_by_key.items()
            if date_key == report_key
        }
        resources.append(
            build_diagnostic_report(
                patient=patient_row,
                reported_at=reported_at,
                items=items,
                observation_refs_by_item=refs_by_item,
            )
        )
    return resources


def _diagnostic_report_matches_category(resource, category: str | None) -> bool:
    if not category:
        return True
    expected = _extract_code_value(category).lower()
    for item in resource.category or []:
        if item.text and item.text.lower() == expected:
            return True
        if item.coding and any(coding.code and coding.code.lower() == expected for coding in item.coding):
            return True
    return False


def _diagnostic_report_matches_code(resource, code: str | None) -> bool:
    if not code:
        return True
    expected = _extract_code_value(code)
    if resource.code is None:
        return False
    if resource.code.text == expected:
        return True
    return bool(resource.code.coding and any(coding.code == expected for coding in resource.code.coding))


@router.get("/DiagnosticReport/{report_id}")
def read_diagnostic_report(report_id: str, db: Session = Depends(get_db)) -> Response:
    if report_id.startswith("diagnostic-report-"):
        remainder = report_id.removeprefix("diagnostic-report-")
        if "-" in remainder:
            patient_id = remainder.rsplit("-", 1)[0]
            for resource in _diagnostic_reports_for_patient(db, patient_id):
                if resource.id == report_id:
                    return _fhir_response(resource)

    for patient_row in db.scalars(select(Patient)).all():
        for resource in _diagnostic_reports_for_patient(db, patient_row.id):
            if resource.id == report_id:
                return _fhir_response(resource)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"DiagnosticReport/{report_id} not found",
    )


@router.get("/DiagnosticReport")
def search_diagnostic_reports(
    patient: str | None = Query(default=None),
    subject: str | None = Query(default=None),
    category: str | None = Query(default=None),
    code: str | None = Query(default=None),
    date_param: list[str] | None = Query(default=None, alias="date"),
    db: Session = Depends(get_db),
) -> Response:
    raw = subject or patient
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_operation_outcome(
                ["search には patient (または subject) パラメータが必要です"]
            ).model_dump(exclude_none=True),
        )

    resources = [
        resource
        for resource in _diagnostic_reports_for_patient(db, _normalize_patient_param(raw))
        if _diagnostic_report_matches_category(resource, category)
        and _diagnostic_report_matches_code(resource, code)
        and _datetime_matches_filters(resource.effectiveDateTime, date_param, label="date")
    ]
    entries = [BundleEntry(resource=resource) for resource in resources]
    bundle = Bundle(type="searchset", total=len(entries), entry=entries or None)
    return _fhir_response(bundle)


# ---------------------------------------------------------------------------
# ServiceRequest
# ---------------------------------------------------------------------------


def _service_requests_for_patient(db: Session, patient_id: str):
    patient_row = db.get(Patient, patient_id)
    if patient_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient/{patient_id} not found",
        )

    lab_orders = db.scalars(
        select(LabOrder)
        .where(LabOrder.patient_id == patient_id)
        .order_by(LabOrder.created_at.desc(), LabOrder.id.desc())
    ).all()
    resources = [lab_order_to_fhir(order, patient=patient_row) for order in lab_orders]
    resources.extend(patient_json_orders_to_fhir(patient_row))
    return resources


def _service_request_matches_category(resource, category: str | None) -> bool:
    if not category:
        return True
    expected = _extract_code_value(category).lower()
    for item in resource.category or []:
        if item.text and item.text.lower() == expected:
            return True
        if item.coding and any(coding.code and coding.code.lower() == expected for coding in item.coding):
            return True
    return False


def _service_request_matches_code(resource, code: str | None) -> bool:
    if not code:
        return True
    expected = _extract_code_value(code)
    resource_code = resource.code
    if resource_code is None:
        return False
    if resource_code.text == expected:
        return True
    return bool(resource_code.coding and any(coding.code == expected for coding in resource_code.coding))


def _datetime_matches_filters(value: datetime | None, date_values: list[str] | None, *, label: str) -> bool:
    if not date_values:
        return True
    if value is None:
        return False
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    target = value.astimezone(timezone.utc)
    for raw_date in date_values:
        prefix, start, end = _date_bounds(raw_date)
        if prefix == "eq":
            if not (start <= target <= (end or start)):
                return False
        elif prefix in {"ge", "gt"}:
            if target < start:
                return False
        elif prefix in {"le", "lt"}:
            if target > start:
                return False
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=_operation_outcome(
                    [f"{label} prefix '{prefix}' は未対応です (ge/le/eq のみ)"]
                ).model_dump(exclude_none=True),
            )
    return True


def _service_request_matches_dates(
    resource,
    *,
    authored_values: list[str] | None,
    occurrence_values: list[str] | None,
) -> bool:
    authored = resource.authoredOn
    occurrence = resource.occurrenceDateTime
    return _datetime_matches_filters(authored, authored_values, label="authored") and _datetime_matches_filters(
        occurrence, occurrence_values, label="occurrence"
    )


@router.get("/ServiceRequest/{request_id}")
def read_service_request(request_id: str, db: Session = Depends(get_db)) -> Response:
    if request_id.startswith("lab-"):
        try:
            order_id = int(request_id.removeprefix("lab-"))
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"ServiceRequest/{request_id} not found",
            ) from exc
        row = db.get(LabOrder, order_id)
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"ServiceRequest/{request_id} not found",
            )
        return _fhir_response(lab_order_to_fhir(row, patient=db.get(Patient, row.patient_id)))

    for patient_row in db.scalars(select(Patient)).all():
        for resource in patient_json_orders_to_fhir(patient_row):
            if resource.id == request_id:
                return _fhir_response(resource)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"ServiceRequest/{request_id} not found",
    )


@router.get("/ServiceRequest")
def search_service_requests(
    patient: str | None = Query(default=None),
    subject: str | None = Query(default=None),
    category: str | None = Query(default=None),
    code: str | None = Query(default=None),
    authored: list[str] | None = Query(default=None),
    occurrence: list[str] | None = Query(default=None),
    db: Session = Depends(get_db),
) -> Response:
    raw = subject or patient
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_operation_outcome(
                ["search には patient (または subject) パラメータが必要です"]
            ).model_dump(exclude_none=True),
        )

    resources = [
        resource
        for resource in _service_requests_for_patient(db, _normalize_patient_param(raw))
        if _service_request_matches_category(resource, category)
        and _service_request_matches_code(resource, code)
        and _service_request_matches_dates(resource, authored_values=authored, occurrence_values=occurrence)
    ]
    entries = [BundleEntry(resource=resource) for resource in resources]
    bundle = Bundle(type="searchset", total=len(entries), entry=entries or None)
    return _fhir_response(bundle)


@router.get("/MedicationRequest/{request_id}")
def read_medication_request(request_id: str, db: Session = Depends(get_db)) -> Response:
    row = db.get(PrescriptionOrder, _parse_medication_request_id(request_id))
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"MedicationRequest/{request_id} not found",
        )
    return _fhir_response(
        medication_request_to_fhir(row, catalog=_find_prescription_catalog(db, row))
    )


# ---------------------------------------------------------------------------
# Appointment
# ---------------------------------------------------------------------------


def _parse_appointment_id(raw: str) -> int:
    try:
        return int(raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Appointment/{raw} not found",
        ) from exc


def _appointment_patient_matches(row: Reservation, raw: str | None) -> bool:
    if not raw:
        return True
    return row.patient_id == _normalize_patient_param(raw)


@router.get("/Appointment/{appointment_id}")
def read_appointment(appointment_id: str, db: Session = Depends(get_db)) -> Response:
    row = db.get(Reservation, _parse_appointment_id(appointment_id))
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Appointment/{appointment_id} not found",
        )
    return _fhir_response(appointment_to_fhir(row))


@router.get("/Appointment")
def search_appointments(
    patient: str | None = Query(default=None),
    actor: str | None = Query(default=None),
    date_param: list[str] | None = Query(default=None, alias="date"),
    db: Session = Depends(get_db),
) -> Response:
    raw = actor or patient
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_operation_outcome(
                ["search には patient (または actor) パラメータが必要です"]
            ).model_dump(exclude_none=True),
        )

    stmt = select(Reservation).where(
        Reservation.patient_id == _normalize_patient_param(raw)
    )
    rows = db.scalars(stmt.order_by(Reservation.updated_at.desc())).all()

    date_filters = date_param or []
    if date_filters:
        filtered: list[Reservation] = []
        for row in rows:
            resource = appointment_to_fhir(row)
            if resource.start is None:
                continue
            keep = True
            for raw_date in date_filters:
                prefix, start, end = _date_bounds(raw_date)
                appointment_start = resource.start.astimezone(timezone.utc)
                if prefix == "eq":
                    keep = keep and start <= appointment_start <= (end or start)
                elif prefix in {"ge", "gt"}:
                    keep = keep and appointment_start >= start
                elif prefix in {"le", "lt"}:
                    keep = keep and appointment_start <= start
                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=_operation_outcome(
                            [f"date prefix '{prefix}' は未対応です (ge/le/eq のみ)"]
                        ).model_dump(exclude_none=True),
                    )
            if keep:
                filtered.append(row)
        rows = filtered

    entries = [BundleEntry(resource=appointment_to_fhir(row)) for row in rows]
    bundle = Bundle(type="searchset", total=len(entries), entry=entries or None)
    return _fhir_response(bundle)


@router.post("/Appointment", status_code=status.HTTP_201_CREATED)
async def create_appointment(
    request: Request, db: Session = Depends(get_db)
) -> Response:
    resource = await _parse_fhir_appointment(request)
    try:
        validate_jp_appointment(resource)
    except FhirValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=_operation_outcome(exc.issues).model_dump(exclude_none=True),
        )

    row = fhir_to_appointment_create(resource)
    _require_patient(db, row.patient_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _fhir_response(appointment_to_fhir(row), status_code=status.HTTP_201_CREATED)


@router.put("/Appointment/{appointment_id}")
async def update_appointment(
    appointment_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    resource = await _parse_fhir_appointment(request)
    if resource.id and resource.id != appointment_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_operation_outcome(
                [
                    f"URL の id ({appointment_id}) と body の id ({resource.id}) が一致しません",
                ]
            ).model_dump(exclude_none=True),
        )
    try:
        validate_jp_appointment(resource)
    except FhirValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=_operation_outcome(exc.issues).model_dump(exclude_none=True),
        )

    row = db.get(Reservation, _parse_appointment_id(appointment_id))
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Appointment/{appointment_id} not found",
        )
    apply_fhir_to_appointment(row, resource)
    _require_patient(db, row.patient_id)
    db.commit()
    db.refresh(row)
    return _fhir_response(appointment_to_fhir(row))


@router.get("/MedicationRequest")
def search_medication_requests(
    patient: str | None = Query(default=None),
    subject: str | None = Query(default=None),
    code: str | None = Query(default=None),
    authoredon: list[str] | None = Query(default=None),
    db: Session = Depends(get_db),
) -> Response:
    raw = subject or patient
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_operation_outcome(
                ["search には patient (または subject) パラメータが必要です"]
            ).model_dump(exclude_none=True),
        )
    patient_id = _normalize_patient_param(raw)

    stmt = select(PrescriptionOrder).where(PrescriptionOrder.patient_id == patient_id)
    stmt = _apply_authoredon_filters(stmt, authoredon)
    rows = db.scalars(stmt.order_by(PrescriptionOrder.created_at.desc())).all()
    catalogs = _catalogs_by_drug_name(db, rows)
    if code:
        rows = [
            row
            for row in rows
            if _medication_code_matches(row, catalogs.get(row.drug_name), code)
        ]

    entries = [
        BundleEntry(
            resource=medication_request_to_fhir(
                row, catalog=catalogs.get(row.drug_name)
            )
        )
        for row in rows
    ]
    bundle = Bundle(type="searchset", total=len(entries), entry=entries or None)
    return _fhir_response(bundle)


@router.post("/MedicationRequest", status_code=status.HTTP_201_CREATED)
async def create_medication_request(
    request: Request, db: Session = Depends(get_db)
) -> Response:
    resource = await _parse_fhir_medication_request(request)
    try:
        validate_jp_medication_request(resource)
    except FhirValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=_operation_outcome(exc.issues).model_dump(exclude_none=True),
        )

    row = fhir_to_medication_request_create(resource)
    _require_patient(db, row.patient_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _fhir_response(
        medication_request_to_fhir(row, catalog=_find_prescription_catalog(db, row)),
        status_code=status.HTTP_201_CREATED,
    )


@router.put("/MedicationRequest/{request_id}")
async def update_medication_request(
    request_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    resource = await _parse_fhir_medication_request(request)
    if resource.id and resource.id != request_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_operation_outcome(
                [
                    f"URL の id ({request_id}) と body の id ({resource.id}) が一致しません",
                ]
            ).model_dump(exclude_none=True),
        )
    try:
        validate_jp_medication_request(resource)
    except FhirValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=_operation_outcome(exc.issues).model_dump(exclude_none=True),
        )

    row = db.get(PrescriptionOrder, _parse_medication_request_id(request_id))
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"MedicationRequest/{request_id} not found",
        )
    apply_fhir_to_medication_request(row, resource)
    _require_patient(db, row.patient_id)
    db.commit()
    db.refresh(row)
    return _fhir_response(
        medication_request_to_fhir(row, catalog=_find_prescription_catalog(db, row))
    )
