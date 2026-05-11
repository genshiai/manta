from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

from fhir.resources.R4B.codeableconcept import CodeableConcept
from fhir.resources.R4B.coding import Coding
from fhir.resources.R4B.diagnosticreport import DiagnosticReport
from fhir.resources.R4B.identifier import Identifier
from fhir.resources.R4B.reference import Reference

from app.modules.gateway.fhir.loinc import LOINC_SYSTEM
from app.models import Patient


DIAGNOSTIC_REPORT_IDENTIFIER_SYSTEM = "https://manta.local/fhir/identifier/diagnostic-report"
LAB_REPORT_CODE = "11502-2"
LAB_REPORT_DISPLAY = "Laboratory report"


def _parse_jp_date(raw: str | None) -> datetime | None:
    if not raw:
        return None
    head = str(raw).split()[0].split("(")[0].strip()
    for fmt in ("%Y/%m/%d", "%Y-%m-%d", "%Y.%m.%d"):
        try:
            return datetime.strptime(head, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _date_token(raw: str | None) -> str:
    parsed = _parse_jp_date(raw)
    if parsed is not None:
        return parsed.strftime("%Y%m%d")
    return "current"


def diagnostic_report_id(patient_id: str, reported_at: str | None) -> str:
    return f"diagnostic-report-{patient_id}-{_date_token(reported_at)}"


def group_lab_results_by_report_date(patient: Patient) -> list[tuple[str | None, list[dict]]]:
    grouped: dict[str | None, list[dict]] = defaultdict(list)
    ordered_keys: list[str | None] = []

    for item in patient.lab_results or []:
        if not isinstance(item, dict):
            continue
        report_date = item.get("reported_at") if isinstance(item.get("reported_at"), str) else None
        if report_date not in grouped:
            ordered_keys.append(report_date)
        grouped[report_date].append(item)

    return [(key, grouped[key]) for key in ordered_keys]


def _build_conclusion(items: list[dict]) -> str | None:
    abnormal = [str(item.get("item")) for item in items if item.get("flag") == "high"]
    if abnormal:
        return f"要フォロー {len(abnormal)}項目: {', '.join(abnormal)}"
    if items:
        return f"検査 {len(items)}項目"
    return None


def build_diagnostic_report(
    *,
    patient: Patient,
    reported_at: str | None,
    items: list[dict],
    observation_refs_by_item: dict[str, str],
) -> DiagnosticReport:
    report_id = diagnostic_report_id(patient.id, reported_at)
    effective = _parse_jp_date(reported_at)
    result_refs = [
        Reference(reference=f"Observation/{observation_refs_by_item[item_name]}", display=item_name)
        for item in items
        if isinstance((item_name := item.get("item")), str) and item_name in observation_refs_by_item
    ]

    return DiagnosticReport(
        id=report_id,
        identifier=[
            Identifier(
                system=DIAGNOSTIC_REPORT_IDENTIFIER_SYSTEM,
                value=report_id,
            )
        ],
        status="final",
        category=[CodeableConcept(text="laboratory")],
        code=CodeableConcept(
            coding=[
                Coding(
                    system=LOINC_SYSTEM,
                    code=LAB_REPORT_CODE,
                    display=LAB_REPORT_DISPLAY,
                )
            ],
            text="検体検査レポート",
        ),
        subject=Reference(reference=f"Patient/{patient.id}", display=patient.name),
        effectiveDateTime=effective,
        issued=effective,
        result=result_refs or None,
        conclusion=_build_conclusion(items),
    )
