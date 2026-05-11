from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from ...models import (
    Admission,
    ClaimDraft,
    ClaimDraftLine,
    ClaimLineAdjustment,
    ClaimReviewIssue,
    ClaimTransmission,
    FacilityClaimRule,
    InpatientInstruction,
    LabOrder,
    Patient,
    PrescriptionOrder,
)
from ...schemas import (
    ClaimDraftLineRead,
    ClaimDraftRead,
    ClaimLineAdjustmentRead,
    ClaimReviewIssueRead,
    ClaimTransmissionRead,
)
from ..common.time import format_document_date
from ..inpatient.services import admission_stay_days


def get_facility_claim_rule_or_404(db: Session, rule_id: str) -> FacilityClaimRule:
    rule = db.get(FacilityClaimRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Facility claim rule not found")
    return rule


def _candidate_base_points(candidate: dict[str, str]) -> int:
    raw_points = str(candidate.get("receipt_points") or "").strip()
    if not raw_points:
        return 0
    try:
        return int(float(raw_points.replace(",", "")))
    except ValueError:
        return 0


def _candidate_points(candidate: dict[str, str], admission: Admission) -> int:
    raw_points = str(candidate.get("receipt_points") or "").strip()
    if not raw_points:
        return 0
    try:
        points = int(float(raw_points.replace(",", "")))
    except ValueError:
        return 0
    if candidate.get("id") == "admission-basic" and candidate.get("receipt_unit") == "日":
        return points * admission_stay_days(admission)
    return points


def claim_total_points(candidates: list[dict[str, str]], admission: Admission) -> int:
    return sum(_candidate_points(candidate, admission) for candidate in candidates)


def build_claim_draft_lines(
    *,
    claim_draft_id: int,
    admission: Admission,
    candidates: list[dict[str, str]],
    prescriptions: list[PrescriptionOrder],
    instructions: list[InpatientInstruction],
    lab_orders: list[LabOrder],
) -> list[ClaimDraftLine]:
    by_category = {candidate.get("category"): candidate for candidate in candidates}
    lines: list[ClaimDraftLine] = []

    admission_candidate = by_category.get("入院基本料")
    if admission_candidate:
        quantity = admission_stay_days(admission)
        lines.append(
            ClaimDraftLine(
                claim_draft_id=claim_draft_id,
                line_type="入院基本料",
                source_type="admission",
                source_id=str(admission.id),
                label=admission_candidate.get("label") or "入院基本料",
                receipt_code=admission_candidate.get("receipt_code") or None,
                receipt_name=admission_candidate.get("receipt_name") or None,
                points=_candidate_base_points(admission_candidate),
                quantity=quantity,
                unit=admission_candidate.get("receipt_unit") or "日",
                evidence=admission_candidate.get("evidence"),
                review_status=admission_candidate.get("status") or "candidate",
            )
        )

    prescription_candidate = by_category.get("投薬")
    for prescription in prescriptions[:20]:
        lines.append(
            ClaimDraftLine(
                claim_draft_id=claim_draft_id,
                line_type="投薬",
                source_type="prescription_order",
                source_id=str(prescription.id),
                label=f"{prescription.drug_name} {prescription.dosage} / {prescription.days}",
                receipt_code=prescription_candidate.get("receipt_code") if prescription_candidate else None,
                receipt_name=prescription_candidate.get("receipt_name") if prescription_candidate else None,
                points=_candidate_base_points(prescription_candidate or {}),
                quantity=1,
                unit=prescription_candidate.get("receipt_unit") if prescription_candidate else "回",
                evidence=f"処方日: {format_document_date(prescription.created_at)}",
                review_status="candidate",
            )
        )

    lab_candidate = by_category.get("検査")
    for order in lab_orders[:20]:
        for item in order.items:
            lines.append(
                ClaimDraftLine(
                    claim_draft_id=claim_draft_id,
                    line_type="検査",
                    source_type="lab_order",
                    source_id=str(order.id),
                    label=f"{order.category}: {item}",
                    receipt_code=lab_candidate.get("receipt_code") if lab_candidate else None,
                    receipt_name=lab_candidate.get("receipt_name") if lab_candidate else None,
                    points=_candidate_base_points(lab_candidate or {}),
                    quantity=1,
                    unit=lab_candidate.get("receipt_unit") if lab_candidate else "回",
                    evidence=f"オーダ日: {format_document_date(order.created_at)} / status={order.status}",
                    review_status="candidate" if order.status in {"ordered", "completed", "done"} else "needs_review",
                )
            )

    instruction_candidate = by_category.get("処置/指導") or by_category.get("退院支援")
    for instruction in instructions:
        if instruction.status != "done":
            continue
        lines.append(
            ClaimDraftLine(
                claim_draft_id=claim_draft_id,
                line_type=instruction.category,
                source_type="inpatient_instruction",
                source_id=str(instruction.id),
                label=instruction.title,
                receipt_code=instruction_candidate.get("receipt_code") if instruction_candidate else None,
                receipt_name=instruction_candidate.get("receipt_name") if instruction_candidate else None,
                points=_candidate_base_points(instruction_candidate or {}),
                quantity=1,
                unit=instruction_candidate.get("receipt_unit") if instruction_candidate else "回",
                evidence=f"実施済み指示: {format_document_date(instruction.due_at or instruction.created_at)}",
                review_status="candidate",
            )
        )
    return lines


def build_claim_review_issues(
    *,
    db: Session,
    claim_draft_id: int,
    admission: Admission,
    patient: Patient,
    candidates: list[dict[str, str]],
    prescriptions: list[PrescriptionOrder],
    instructions: list[InpatientInstruction],
    lab_orders: list[LabOrder],
) -> list[ClaimReviewIssue]:
    from sqlalchemy import true as sa_true

    issues: list[ClaimReviewIssue] = []
    for candidate in candidates:
        label = candidate.get("label") or candidate.get("category") or "会計候補"
        if not candidate.get("receipt_code"):
            issues.append(
                ClaimReviewIssue(
                    claim_draft_id=claim_draft_id,
                    issue_type="missing_receipt_code",
                    severity="warning",
                    message=f"{label} にレセ電コード候補がありません。",
                    evidence=candidate.get("evidence"),
                )
            )
        if candidate.get("status") == "needs_review":
            issues.append(
                ClaimReviewIssue(
                    claim_draft_id=claim_draft_id,
                    issue_type="candidate_needs_review",
                    severity="warning",
                    message=f"{label} は実施記録・算定条件の確認が必要です。",
                    evidence=candidate.get("evidence"),
                )
            )

    done_instructions = [instruction for instruction in instructions if instruction.status == "done"]
    rules = db.scalars(
        select(FacilityClaimRule)
        .where(FacilityClaimRule.is_active == sa_true())
        .order_by(FacilityClaimRule.sort_order, FacilityClaimRule.id)
    ).all()
    for rule in rules:
        matching_candidates = [candidate for candidate in candidates if candidate.get("category") == rule.target_category]
        if not matching_candidates:
            continue
        evidence = rule.evidence_hint
        passed = True
        if rule.rule_type == "requires_admission_dates":
            passed = admission.admitted_at is not None
            evidence = f"入院日: {format_document_date(admission.admitted_at)} / 退院日: {format_document_date(admission.discharged_at)}"
        elif rule.rule_type == "requires_done_instruction":
            passed = bool(done_instructions)
            evidence = " / ".join(f"{item.category}: {item.title}" for item in done_instructions[:4]) or rule.evidence_hint
        elif rule.rule_type == "requires_prescription":
            passed = bool(prescriptions)
            evidence = " / ".join(f"{item.drug_name} {item.dosage}" for item in prescriptions[:4]) or rule.evidence_hint
        elif rule.rule_type == "requires_lab_order":
            passed = bool(lab_orders)
            evidence = " / ".join(f"{item.category}: {', '.join(item.items[:4])}" for item in lab_orders[:3]) or rule.evidence_hint
        elif rule.rule_type == "requires_receipt_code":
            passed = all(candidate.get("receipt_code") for candidate in matching_candidates)
            evidence = rule.evidence_hint
        if not passed:
            issues.append(
                ClaimReviewIssue(
                    claim_draft_id=claim_draft_id,
                    issue_type=f"facility_rule:{rule.id}",
                    severity=rule.severity,
                    message=rule.message,
                    evidence=evidence,
                )
            )

    active_problems = [problem for problem in patient.problems or [] if problem.get("status") == "active"]
    if not active_problems:
        issues.append(
            ClaimReviewIssue(
                claim_draft_id=claim_draft_id,
                issue_type="missing_active_diagnosis",
                severity="error",
                message="請求前に有効な傷病名の登録が必要です。",
                evidence="患者プロブレムリストに active の傷病名がありません。",
            )
        )
    elif not any(problem.get("claim_code") or problem.get("management_number") for problem in active_problems):
        issues.append(
            ClaimReviewIssue(
                claim_draft_id=claim_draft_id,
                issue_type="diagnosis_claim_code_review",
                severity="warning",
                message="傷病名の請求コード確認が必要です。",
                evidence="有効傷病名に claim_code / management_number がありません。",
            )
        )
    return issues


def _claim_rule_matches_context(
    rule: FacilityClaimRule,
    *,
    line: ClaimDraftLine | None,
    patient: Patient,
    same_month_counts: dict[str, int],
) -> bool:
    conditions = rule.conditions or {}
    if line is not None:
        line_types = conditions.get("line_types")
        if isinstance(line_types, list) and line_types and line.line_type not in line_types:
            return False
        source_types = conditions.get("source_types")
        if isinstance(source_types, list) and source_types and line.source_type not in source_types:
            return False
        receipt_required = conditions.get("receipt_code_required")
        if receipt_required is True and not line.receipt_code:
            return False
        max_same_month = conditions.get("same_month_count_lte")
        if isinstance(max_same_month, int) and same_month_counts.get(line.line_type, 0) > max_same_month:
            return True
    required_problem = conditions.get("requires_problem")
    if isinstance(required_problem, str) and required_problem:
        active_names = [problem.get("name", "") for problem in patient.problems or [] if problem.get("status") == "active"]
        return not any(required_problem in name for name in active_names)
    return bool(conditions)


def build_claim_rule_adjustments(
    *,
    claim_draft_id: int,
    patient: Patient,
    lines: list[ClaimDraftLine],
    rules: list[FacilityClaimRule],
) -> tuple[list[ClaimLineAdjustment], list[ClaimReviewIssue]]:
    adjustments: list[ClaimLineAdjustment] = []
    issues: list[ClaimReviewIssue] = []
    same_month_counts: dict[str, int] = {}
    for line in lines:
        same_month_counts[line.line_type] = same_month_counts.get(line.line_type, 0) + 1

    for rule in rules:
        if not (rule.conditions or rule.actions):
            continue
        matched_any = False
        for line in lines:
            if not _claim_rule_matches_context(rule, line=line, patient=patient, same_month_counts=same_month_counts):
                continue
            matched_any = True
            actions = rule.actions or {}
            points_delta = actions.get("points_delta")
            comment = actions.get("comment")
            if isinstance(points_delta, int) or isinstance(comment, str):
                adjustments.append(
                    ClaimLineAdjustment(
                        claim_draft_id=claim_draft_id,
                        claim_draft_line_id=line.id,
                        rule_id=rule.id,
                        adjustment_type=str(actions.get("type") or "rule_suggestion"),
                        points_delta=points_delta if isinstance(points_delta, int) else 0,
                        comment=comment if isinstance(comment, str) else None,
                        reason=rule.message,
                    )
                )
            issue_type = actions.get("issue_type")
            if isinstance(issue_type, str):
                issues.append(
                    ClaimReviewIssue(
                        claim_draft_id=claim_draft_id,
                        issue_type=issue_type,
                        severity=rule.severity,
                        message=rule.message,
                        evidence=line.evidence or rule.evidence_hint,
                    )
                )
        if not matched_any and _claim_rule_matches_context(rule, line=None, patient=patient, same_month_counts=same_month_counts):
            actions = rule.actions or {}
            issue_type = actions.get("issue_type")
            if isinstance(issue_type, str):
                issues.append(
                    ClaimReviewIssue(
                        claim_draft_id=claim_draft_id,
                        issue_type=issue_type,
                        severity=rule.severity,
                        message=rule.message,
                        evidence=rule.evidence_hint,
                    )
                )
    return adjustments, issues


def claim_draft_to_read(db: Session, draft: ClaimDraft) -> ClaimDraftRead:
    lines = db.scalars(
        select(ClaimDraftLine)
        .where(ClaimDraftLine.claim_draft_id == draft.id)
        .order_by(ClaimDraftLine.id)
    ).all()
    issues = db.scalars(
        select(ClaimReviewIssue)
        .where(ClaimReviewIssue.claim_draft_id == draft.id)
        .order_by(ClaimReviewIssue.severity.desc(), ClaimReviewIssue.id)
    ).all()
    adjustments = db.scalars(
        select(ClaimLineAdjustment)
        .where(ClaimLineAdjustment.claim_draft_id == draft.id)
        .order_by(ClaimLineAdjustment.id)
    ).all()
    transmissions = db.scalars(
        select(ClaimTransmission)
        .where(ClaimTransmission.claim_draft_id == draft.id)
        .order_by(desc(ClaimTransmission.sent_at), desc(ClaimTransmission.id))
        .limit(5)
    ).all()
    return ClaimDraftRead(
        id=draft.id,
        patient_id=draft.patient_id,
        admission_id=draft.admission_id,
        status=draft.status,
        source_type=draft.source_type,
        billing_candidates=draft.billing_candidates,
        total_points=draft.total_points,
        created_by=draft.created_by,
        created_at=draft.created_at,
        updated_at=draft.updated_at,
        lines=[ClaimDraftLineRead.model_validate(line) for line in lines],
        adjustments=[ClaimLineAdjustmentRead.model_validate(item) for item in adjustments],
        issues=[ClaimReviewIssueRead.model_validate(issue) for issue in issues],
        transmissions=[ClaimTransmissionRead.model_validate(item) for item in transmissions],
    )
