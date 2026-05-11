from __future__ import annotations

from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from ..karte.models import LabOrder, Observation, Patient, PrescriptionOrder
from ..master_data.models import ReceiptMedicalPracticeMaster
from .models import (
    Admission,
    BedMaster,
    InpatientDocument,
    InpatientEvent,
    InpatientInstruction,
    InpatientPathwayAssignment,
    InpatientPathwayMaster,
    InpatientPathwayTask,
    InpatientPathwayTaskMaster,
    NursingNote,
    WardMaster,
)
from ..common.time import (
    TOKYO_TZ,
    format_document_date,
    format_progress_date,
    utcnow,
)
from ..karte.services import format_lab_value, get_patient_or_404, patient_to_read
from .schemas import (
    AdmissionRead,
    BedBoardItemRead,
    InpatientPathwayMasterRead,
    InpatientPathwayRead,
    InpatientPathwayTaskMasterRead,
    InpatientPathwayTaskRead,
    InpatientProgressDateRow,
    InpatientProgressRead,
    InpatientSummaryDraftRead,
)


INPATIENT_DOCUMENT_TITLES = {
    "admission_care_plan": "入院診療計画書",
    "discharge_summary": "退院サマリ",
    "discharge_instruction": "退院時指導文書",
}


STANDARD_PATHWAY_TASKS = [
    (0, "入院", "入院時評価、持参薬確認、転倒リスク評価"),
    (0, "検査", "入院時採血・画像・感染症確認"),
    (1, "治療", "初期治療反応と指示内容の再評価"),
    (2, "看護", "セルフケア、疼痛、栄養、排泄状況の評価"),
    (3, "退院支援", "退院目標、家族説明、地域連携の確認"),
    (5, "退院支援", "退院時処方、指導文書、次回外来の確認"),
]


def get_admission_or_404(db: Session, admission_id: int) -> Admission:
    admission = db.get(Admission, admission_id)
    if admission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admission not found")
    return admission


def get_ward_or_404(db: Session, ward_id: str) -> WardMaster:
    ward = db.get(WardMaster, ward_id)
    if ward is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ward not found")
    return ward


def get_bed_or_404(db: Session, bed_id: str) -> BedMaster:
    bed = db.get(BedMaster, bed_id)
    if bed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bed not found")
    return bed


def get_inpatient_instruction_or_404(db: Session, instruction_id: int) -> InpatientInstruction:
    instruction = db.get(InpatientInstruction, instruction_id)
    if instruction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inpatient instruction not found")
    return instruction


def get_inpatient_document_or_404(db: Session, document_id: int) -> InpatientDocument:
    document = db.get(InpatientDocument, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inpatient document not found")
    return document


def get_inpatient_pathway_task_or_404(db: Session, task_id: int) -> InpatientPathwayTask:
    task = db.get(InpatientPathwayTask, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inpatient pathway task not found")
    return task


def get_pathway_master_or_404(db: Session, master_id: str) -> InpatientPathwayMaster:
    master = db.get(InpatientPathwayMaster, master_id)
    if master is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inpatient pathway master not found")
    return master


def add_inpatient_event(
    db: Session,
    *,
    admission_id: int,
    event_type: str,
    title: str,
    actor: str,
    detail: str | None = None,
) -> None:
    db.add(
        InpatientEvent(
            admission_id=admission_id,
            event_type=event_type,
            title=title,
            detail=detail,
            actor=actor,
        )
    )


def admission_stay_days(admission: Admission) -> int:
    start = admission.admitted_at or admission.requested_at
    end = admission.discharged_at or utcnow()
    start_date = start.astimezone(TOKYO_TZ).date()
    end_date = end.astimezone(TOKYO_TZ).date()
    return max((end_date - start_date).days + 1, 1)


def admission_to_read(
    db: Session,
    admission: Admission,
    *,
    patient: Patient | None = None,
    ward: WardMaster | None = None,
    bed: BedMaster | None = None,
) -> AdmissionRead:
    patient = patient or get_patient_or_404(db, admission.patient_id)
    ward = ward if ward is not None else (db.get(WardMaster, admission.ward_id) if admission.ward_id else None)
    bed = bed if bed is not None else (db.get(BedMaster, admission.bed_id) if admission.bed_id else None)
    pending_instruction_count = int(
        db.scalar(
            select(func.count(InpatientInstruction.id)).where(
                InpatientInstruction.admission_id == admission.id,
                InpatientInstruction.status == "pending",
            )
        )
        or 0
    )
    latest_nursing_note = db.scalar(
        select(NursingNote)
        .where(NursingNote.admission_id == admission.id)
        .order_by(desc(NursingNote.recorded_at), desc(NursingNote.id))
    )

    return AdmissionRead(
        id=admission.id,
        patient=patient_to_read(patient),
        status=admission.status,  # type: ignore[arg-type]
        requested_at=admission.requested_at,
        admitted_at=admission.admitted_at,
        discharge_permitted_at=admission.discharge_permitted_at,
        discharged_at=admission.discharged_at,
        ward=ward,
        bed=bed,
        attending_doctor=admission.attending_doctor,
        team=admission.team,
        primary_diagnosis=admission.primary_diagnosis,
        care_level=admission.care_level,
        note=admission.note,
        stay_days=admission_stay_days(admission),
        pending_instruction_count=pending_instruction_count,
        latest_nursing_note=latest_nursing_note,
        updated_at=admission.updated_at,
    )


def bed_board_item_to_read(
    db: Session,
    *,
    bed: BedMaster,
    ward: WardMaster,
    admission: Admission | None,
    patient: Patient | None,
) -> BedBoardItemRead:
    return BedBoardItemRead(
        bed=bed,
        ward=ward,
        current_admission_id=admission.id if admission else None,
        current_patient=patient_to_read(patient) if patient else None,
        stay_days=admission_stay_days(admission) if admission else None,
    )


def inpatient_pathway_to_read(
    assignment: InpatientPathwayAssignment,
    tasks: list[InpatientPathwayTask],
) -> InpatientPathwayRead:
    return InpatientPathwayRead(
        id=assignment.id,
        admission_id=assignment.admission_id,
        pathway_master_id=assignment.pathway_master_id,
        pathway_name=assignment.pathway_name,
        status=assignment.status,
        started_on=assignment.started_on,
        assigned_by=assignment.assigned_by,
        created_at=assignment.created_at,
        updated_at=assignment.updated_at,
        tasks=[InpatientPathwayTaskRead.model_validate(task) for task in tasks],
    )


def inpatient_pathway_master_to_read(
    master: InpatientPathwayMaster,
    tasks: list[InpatientPathwayTaskMaster],
) -> InpatientPathwayMasterRead:
    return InpatientPathwayMasterRead(
        id=master.id,
        sort_order=master.sort_order,
        is_active=master.is_active,
        name=master.name,
        department=master.department,
        primary_diagnosis=master.primary_diagnosis,
        expected_days=master.expected_days,
        note=master.note,
        tasks=[InpatientPathwayTaskMasterRead.model_validate(task) for task in tasks],
    )


def build_inpatient_progress(
    *,
    admission: Admission,
    observations: list[Observation],
    prescriptions: list[PrescriptionOrder],
    lab_orders: list[LabOrder],
    instructions: list[InpatientInstruction],
    nursing_notes: list[NursingNote],
) -> InpatientProgressRead:
    from datetime import datetime

    rows_by_date: dict[str, dict[str, list[str]]] = {}

    def row_for(date_key: str) -> dict[str, list[str]]:
        return rows_by_date.setdefault(
            date_key,
            {
                "vitals": [],
                "labs": [],
                "prescriptions": [],
                "lab_orders": [],
                "instructions": [],
                "nursing_notes": [],
            },
        )

    for observation in observations:
        date_key = format_progress_date(observation.effective_datetime)
        label = observation.code_text or observation.code_display or observation.code or "観察"
        value = format_lab_value(observation)
        if observation.category == "vital-signs":
            row_for(date_key)["vitals"].append(f"{label}: {value}".strip())
        elif observation.category == "laboratory":
            row_for(date_key)["labs"].append(f"{label}: {value}".strip())

    for prescription in prescriptions:
        date_key = format_progress_date(prescription.created_at)
        row_for(date_key)["prescriptions"].append(
            f"{prescription.drug_name} {prescription.dosage} / {prescription.days}"
        )

    for order in lab_orders:
        date_key = format_progress_date(order.created_at)
        urgency = f"{order.urgency} " if order.urgency else ""
        row_for(date_key)["lab_orders"].append(f"{urgency}{order.category}: {', '.join(order.items)}")

    for instruction in instructions:
        date_key = format_progress_date(instruction.due_at or instruction.created_at)
        row_for(date_key)["instructions"].append(
            f"[{instruction.status}] {instruction.category}: {instruction.title}"
        )

    for note in nursing_notes:
        date_key = format_progress_date(note.recorded_at)
        focus = f"{note.focus}: " if note.focus else ""
        row_for(date_key)["nursing_notes"].append(f"{focus}{note.assessment or note.plan or note.objective}")

    sorted_dates = sorted(
        rows_by_date,
        key=lambda value: datetime.strptime(value, "%Y/%m/%d") if value != "日付未設定" else datetime.min,
        reverse=True,
    )
    return InpatientProgressRead(
        admission_id=admission.id,
        patient_id=admission.patient_id,
        rows=[
            InpatientProgressDateRow(date=date_key, **rows_by_date[date_key])
            for date_key in sorted_dates
        ],
    )


def _patient_active_problem_labels(patient: Patient) -> list[str]:
    labels: list[str] = []
    for problem in patient.problems or []:
        if not isinstance(problem, dict):
            continue
        name = problem.get("name")
        problem_status = problem.get("status")
        if isinstance(name, str) and name and problem_status != "resolved":
            labels.append(name)
    return labels


def _latest_inpatient_records(
    db: Session,
    *,
    admission: Admission,
) -> tuple[list[InpatientInstruction], list[NursingNote], list[PrescriptionOrder], list[LabOrder]]:
    instructions = db.scalars(
        select(InpatientInstruction)
        .where(InpatientInstruction.admission_id == admission.id)
        .order_by(desc(InpatientInstruction.created_at))
        .limit(8)
    ).all()
    nursing_notes = db.scalars(
        select(NursingNote)
        .where(NursingNote.admission_id == admission.id)
        .order_by(desc(NursingNote.recorded_at), desc(NursingNote.id))
        .limit(6)
    ).all()
    prescriptions = db.scalars(
        select(PrescriptionOrder)
        .where(PrescriptionOrder.patient_id == admission.patient_id)
        .order_by(desc(PrescriptionOrder.created_at))
        .limit(8)
    ).all()
    lab_orders = db.scalars(
        select(LabOrder)
        .where(LabOrder.patient_id == admission.patient_id)
        .order_by(desc(LabOrder.created_at))
        .limit(6)
    ).all()
    return instructions, nursing_notes, prescriptions, lab_orders


def build_inpatient_document_body(
    db: Session,
    *,
    admission: Admission,
    patient: Patient,
    document_type: str,
) -> str:
    instructions, nursing_notes, prescriptions, lab_orders = _latest_inpatient_records(db, admission=admission)
    diagnosis = admission.primary_diagnosis or ", ".join(_patient_active_problem_labels(patient)[:3]) or "未設定"
    admission_period = f"{format_document_date(admission.admitted_at or admission.requested_at)} - {format_document_date(admission.discharged_at)}"
    ward = db.get(WardMaster, admission.ward_id) if admission.ward_id else None
    bed = db.get(BedMaster, admission.bed_id) if admission.bed_id else None
    ward_label = " ".join(
        item
        for item in [
            ward.name if ward else None,
            bed.bed_label if bed else None,
        ]
        if item
    ) or "未設定"
    latest_note = nursing_notes[0] if nursing_notes else None
    latest_note_summary = (
        f"{latest_note.focus or latest_note.note_type}: {latest_note.assessment or latest_note.plan or latest_note.objective}"
        if latest_note
        else "看護記録なし"
    )
    instruction_lines = [
        f"- [{item.status}] {item.category}: {item.title}"
        for item in instructions[:5]
    ] or ["- 指示なし"]
    prescription_lines = [
        f"- {item.drug_name} {item.dosage} / {item.days}"
        for item in prescriptions[:5]
    ] or ["- 処方なし"]
    lab_order_lines = [
        f"- {item.category}: {', '.join(item.items)}"
        for item in lab_orders[:4]
    ] or ["- 検査オーダなし"]

    if document_type == "admission_care_plan":
        return "\n".join(
            [
                "【患者情報】",
                f"患者: {patient.name} ({patient.id}) / {patient.age} / {patient.sex}",
                f"病棟・病床: {ward_label}",
                f"主治医: {admission.attending_doctor}",
                "",
                "【入院目的・主病名】",
                f"主病名: {diagnosis}",
                f"入院目的: {admission.note or diagnosis}",
                "",
                "【治療計画】",
                *instruction_lines,
                "",
                "【検査・観察計画】",
                *lab_order_lines,
                "",
                "【看護計画】",
                f"- {latest_note_summary}",
                f"- 看護必要度・ケア区分: {admission.care_level or '未設定'}",
                "",
                "【退院目標】",
                "- 症状安定、内服・生活指導の理解、退院後フォロー方針の確認",
            ]
        )

    if document_type == "discharge_instruction":
        return "\n".join(
            [
                "【退院後の方針】",
                f"患者: {patient.name} ({patient.id})",
                f"主病名: {diagnosis}",
                "",
                "【服薬】",
                *prescription_lines,
                "",
                "【生活上の注意】",
                "- 発熱、呼吸苦、強い疼痛、食事摂取困難、意識変容があれば早めに受診",
                "- 次回受診日、検査予定、訪問看護・介護連携の有無を確認",
                "",
                "【連絡・再診】",
                f"- 主治医: {admission.attending_doctor}",
                "- 緊急時は救急外来または地域連携窓口へ連絡",
            ]
        )

    return "\n".join(
        [
            "【入院概要】",
            f"患者: {patient.name} ({patient.id}) / {patient.age} / {patient.sex}",
            f"入院期間: {admission_period}",
            f"主病名: {diagnosis}",
            f"担当: {admission.attending_doctor} / {admission.team or 'チーム未設定'}",
            "",
            "【入院経過】",
            f"- {latest_note_summary}",
            *(f"- {item.assessment or item.plan or item.objective}" for item in nursing_notes[1:4]),
            "",
            "【主な指示・処置】",
            *instruction_lines,
            "",
            "【処方】",
            *prescription_lines,
            "",
            "【検査】",
            *lab_order_lines,
            "",
            "【退院時方針】",
            f"- {admission.note or '退院後フォロー、服薬継続、必要時再診を確認'}",
        ]
    )


def build_inpatient_summary_draft(
    *,
    admission: Admission,
    patient: Patient,
    observations: list[Observation],
    prescriptions: list[PrescriptionOrder],
    lab_orders: list[LabOrder],
    instructions: list[InpatientInstruction],
    nursing_notes: list[NursingNote],
    days: int,
) -> InpatientSummaryDraftRead:
    generated_at = utcnow()
    since = generated_at - timedelta(days=days)
    period_start = max(admission.admitted_at or admission.requested_at, since)
    period_label = f"{format_document_date(period_start)} - {format_document_date(generated_at)}"
    diagnosis = admission.primary_diagnosis or ", ".join(_patient_active_problem_labels(patient)[:3]) or "未設定"
    latest_notes = nursing_notes[:5]
    latest_labs = [
        observation
        for observation in observations
        if observation.category == "laboratory"
    ][:6]
    latest_vitals = [
        observation
        for observation in observations
        if observation.category == "vital-signs"
    ][:4]
    active_instructions = [instruction for instruction in instructions if instruction.status == "pending"]
    done_instructions = [instruction for instruction in instructions if instruction.status == "done"]
    key_events: list[str] = []
    if admission.admitted_at:
        key_events.append(f"{format_document_date(admission.admitted_at)} 入院")
    if admission.discharge_permitted_at:
        key_events.append(f"{format_document_date(admission.discharge_permitted_at)} 退院許可")
    if admission.discharged_at:
        key_events.append(f"{format_document_date(admission.discharged_at)} 退院")
    key_events.extend(
        f"{format_document_date(note.recorded_at)} {note.focus or note.note_type}: {note.assessment or note.plan or note.objective}"
        for note in latest_notes[:3]
        if note.assessment or note.plan or note.objective
    )
    note_lines = [
        f"- {format_document_date(note.recorded_at)} {note.focus or note.note_type}: {note.assessment or note.plan or note.objective}"
        for note in latest_notes
    ] or ["- 看護記録なし"]
    lab_lines = [
        f"- {format_document_date(item.effective_datetime)} {item.code_text or item.code_display or item.code or '検査'}: {format_lab_value(item)}"
        for item in latest_labs
    ] or ["- 検査結果なし"]
    vital_lines = [
        f"- {format_document_date(item.effective_datetime)} {item.code_text or item.code_display or item.code or 'バイタル'}: {format_lab_value(item)}"
        for item in latest_vitals
    ] or ["- バイタルなし"]
    prescription_lines = [
        f"- {format_document_date(item.created_at)} {item.drug_name} {item.dosage} / {item.days}"
        for item in prescriptions[:8]
    ] or ["- 処方なし"]
    instruction_lines = [
        f"- 未実施: {item.category} / {item.title}"
        for item in active_instructions[:6]
    ] or ["- 未実施指示なし"]
    done_instruction_lines = [
        f"- 実施済: {item.category} / {item.title}"
        for item in done_instructions[:4]
    ]
    body = "\n".join(
        [
            "【入院経過要約案】",
            f"患者: {patient.name} ({patient.id})",
            f"対象期間: {period_label}",
            f"主病名: {diagnosis}",
            f"担当: {admission.attending_doctor} / {admission.team or 'チーム未設定'}",
            "",
            "【経過】",
            *note_lines,
            "",
            "【検査・バイタル】",
            *vital_lines,
            *lab_lines,
            "",
            "【処方】",
            *prescription_lines,
            "",
            "【指示】",
            *instruction_lines,
            *done_instruction_lines,
            "",
            "【評価と方針】",
            f"- {latest_notes[0].assessment if latest_notes and latest_notes[0].assessment else admission.note or '経過安定性、退院可否、外来フォローを確認'}",
            "- この要約案は記録からの機械的抽出です。医師が確認してから文書へ確定してください。",
        ]
    )
    return InpatientSummaryDraftRead(
        admission_id=admission.id,
        patient_id=patient.id,
        title=f"{patient.name} 入院経過要約案",
        period_label=period_label,
        source_counts={
            "nursing_notes": len(nursing_notes),
            "observations": len(observations),
            "prescriptions": len(prescriptions),
            "lab_orders": len(lab_orders),
            "instructions": len(instructions),
        },
        key_events=key_events[:8],
        body=body,
        generated_at=generated_at,
    )


def _receipt_practice_candidate(
    db: Session,
    *,
    category: str,
) -> dict[str, str] | None:
    master = db.scalar(
        select(ReceiptMedicalPracticeMaster)
        .where(ReceiptMedicalPracticeMaster.category == category)
        .order_by(ReceiptMedicalPracticeMaster.receipt_code)
    )
    if master is None:
        return None
    return {
        "receipt_code": master.receipt_code,
        "receipt_name": master.name,
        "receipt_points": str(master.points) if master.points is not None else "",
        "receipt_unit": master.unit_name or "",
    }


def _with_receipt_practice(
    db: Session,
    candidate: dict[str, str],
    *,
    category: str,
) -> dict[str, str]:
    receipt_candidate = _receipt_practice_candidate(db, category=category)
    if receipt_candidate is None:
        return candidate
    return {**candidate, **receipt_candidate}


def build_discharge_plan_defaults(
    db: Session,
    *,
    admission: Admission,
    prescriptions: list[PrescriptionOrder],
    instructions: list[InpatientInstruction],
    lab_orders: list[LabOrder],
) -> tuple[str, list[dict[str, str]], str]:
    latest_by_drug: dict[str, PrescriptionOrder] = {}
    for prescription in prescriptions:
        latest_by_drug.setdefault(prescription.drug_name, prescription)
    medication_note = "\n".join(
        f"- {item.drug_name} {item.dosage} / {item.days}"
        for item in latest_by_drug.values()
    ) or "- 退院時処方候補なし"
    candidates = [
        _with_receipt_practice(
            db,
            {
                "id": "admission-basic",
                "category": "入院基本料",
                "label": f"{admission.ward_id or '病棟未設定'} 入院日数 {admission_stay_days(admission)}日",
                "source": "admission",
                "evidence": f"入院日: {format_document_date(admission.admitted_at or admission.requested_at)} / 退院日: {format_document_date(admission.discharged_at)}",
                "status": "candidate",
                "confidence": "high",
            },
            category="入院基本料",
        ),
        _with_receipt_practice(
            db,
            {
                "id": "discharge-support",
                "category": "退院支援",
                "label": "退院支援・退院時指導の算定候補を確認",
                "source": "discharge",
                "evidence": admission.note or "退院計画・退院時指導文書・次回外来の確認が必要",
                "status": "candidate",
                "confidence": "medium",
            },
            category="退院支援",
        ),
    ]
    if prescriptions:
        candidates.append(
            _with_receipt_practice(
                db,
                {
                    "id": "discharge-medication",
                    "category": "投薬",
                    "label": "退院時処方料・薬剤料候補",
                    "source": "prescription",
                    "evidence": " / ".join(
                        f"{item.drug_name} {item.dosage} {item.days}" for item in list(latest_by_drug.values())[:4]
                    ),
                    "status": "candidate",
                    "confidence": "medium",
                },
                category="投薬",
            )
        )
    done_instructions = [instruction for instruction in instructions if instruction.status == "done"]
    if done_instructions:
        candidates.append(
            _with_receipt_practice(
                db,
                {
                    "id": "completed-instructions",
                    "category": "処置/指導",
                    "label": "実施済み入院指示から算定候補を確認",
                    "source": "instruction",
                    "evidence": " / ".join(f"{item.category}: {item.title}" for item in done_instructions[:4]),
                    "status": "needs_review",
                    "confidence": "medium",
                },
                category="処置/指導",
            )
        )
    if lab_orders:
        candidates.append(
            _with_receipt_practice(
                db,
                {
                    "id": "lab-orders",
                    "category": "検査",
                    "label": "入院中検査オーダの会計反映を確認",
                    "source": "lab_order",
                    "evidence": " / ".join(f"{item.category}: {', '.join(item.items[:4])}" for item in lab_orders[:3]),
                    "status": "needs_review",
                    "confidence": "medium",
                },
                category="検査",
            )
        )
    follow_up = admission.note or "退院後外来、再診、検査予定、地域連携の確認"
    return medication_note, candidates, follow_up
