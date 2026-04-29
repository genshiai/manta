#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def run_step(title: str, command: list[str], cwd: Path) -> None:
    print(f"\n==> {title}")
    subprocess.run(command, cwd=cwd, check=True)


def get_json(url: str, *, headers: dict[str, str] | None = None, method: str = "GET", body: dict | None = None):
    request = urllib.request.Request(
        url,
        method=method,
        headers={"Content-Type": "application/json", **(headers or {})},
        data=json.dumps(body).encode() if body is not None else None,
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)


def wait_for_health(url: str, timeout_seconds: int = 60) -> None:
    deadline = time.time() + timeout_seconds
    last_error = None
    while time.time() < deadline:
        try:
            payload = get_json(url)
            if payload == {"status": "ok"}:
                return
        except Exception as error:  # noqa: BLE001
            last_error = error
        time.sleep(1)
    raise RuntimeError(f"healthcheck timeout: {url} ({last_error})")


def verify_preview() -> None:
    print("\n==> preview smoke")
    wait_for_health("http://localhost:4173/health")
    login_payload = get_json(
        "http://localhost:4173/api/auth/login",
        method="POST",
        body={"user_id": "dr.tanaka", "password": "manta-demo"},
    )
    token = login_payload["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    patients = get_json("http://localhost:4173/api/patients", headers=headers)
    masters = get_json("http://localhost:4173/api/masters/chart-order-config", headers=headers)
    diagnoses = get_json("http://localhost:4173/api/masters/diagnoses/search?q=%E7%B3%96%E5%B0%BF%E7%97%85", headers=headers)
    chart = get_json("http://localhost:4173/api/patients/0009900040/chart", headers=headers)
    lab_trends = get_json("http://localhost:4173/api/patients/0009900040/lab-trends", headers=headers)
    prescription_timeline = get_json(
        "http://localhost:4173/api/patients/0009900040/prescription-timeline",
        headers=headers,
    )
    fhir_metadata = get_json("http://localhost:4173/fhir/metadata")
    fhir_patient = get_json("http://localhost:4173/fhir/Patient/0009900040")
    fhir_encounters = get_json("http://localhost:4173/fhir/Encounter?patient=0009900040")
    fhir_compositions = get_json("http://localhost:4173/fhir/Composition?patient=0009900040")
    fhir_diagnostic_reports = get_json("http://localhost:4173/fhir/DiagnosticReport?patient=0009900040")
    fhir_service_requests = get_json("http://localhost:4173/fhir/ServiceRequest?patient=0009900040")
    fhir_medications = get_json("http://localhost:4173/fhir/MedicationRequest?patient=0009900040")
    fhir_appointments = get_json("http://localhost:4173/fhir/Appointment?patient=0009900040")

    assert len(patients) >= 4
    assert len(masters["prescription_catalog"]) >= 5
    assert len(masters["standard_usage_masters"]) >= 4
    assert len(masters["prescription_sets"]) >= 3
    assert len(masters["lab_set_options"]) >= 3
    assert len(masters["reservation_slots"]) >= 4
    assert len(masters["chart_templates"]) >= 3
    assert len(diagnoses) >= 1
    assert len(chart["visit_history"]) >= 1
    assert len(chart["vitals"]) >= 1
    assert len(chart["lab_results"]) >= 1
    assert chart["lab_results"][0].get("history")
    assert len(lab_trends) >= 1
    assert lab_trends[0]["point_count"] == len(lab_trends[0]["points"])
    assert "imaging_orders" in chart
    assert "procedure_orders" in chart
    assert len(prescription_timeline) >= 1
    assert prescription_timeline[0]["item_count"] == len(prescription_timeline[0]["items"])
    assert fhir_metadata["resourceType"] == "CapabilityStatement"
    assert fhir_patient["resourceType"] == "Patient"
    assert fhir_encounters["resourceType"] == "Bundle"
    assert fhir_encounters["total"] >= 1
    assert fhir_compositions["resourceType"] == "Bundle"
    assert fhir_compositions["total"] >= 1
    assert fhir_diagnostic_reports["resourceType"] == "Bundle"
    assert fhir_diagnostic_reports["total"] >= 1
    assert fhir_service_requests["resourceType"] == "Bundle"
    assert fhir_service_requests["total"] >= 1
    assert fhir_medications["resourceType"] == "Bundle"
    assert fhir_medications["total"] >= 1
    assert fhir_appointments["resourceType"] == "Bundle"
    assert fhir_appointments["total"] >= 1

    summary = {
        "patients": len(patients),
        "prescription_catalog": len(masters["prescription_catalog"]),
        "standard_usage_masters": len(masters["standard_usage_masters"]),
        "prescription_sets": len(masters["prescription_sets"]),
        "lab_set_options": len(masters["lab_set_options"]),
        "reservation_slots": len(masters["reservation_slots"]),
        "chart_templates": len(masters["chart_templates"]),
        "diagnosis_results": len(diagnoses),
        "visit_history": len(chart["visit_history"]),
        "vitals": len(chart["vitals"]),
        "lab_results": len(chart["lab_results"]),
        "lab_result_history_points": len(chart["lab_results"][0]["history"]),
        "lab_trend_items": len(lab_trends),
        "lab_trend_points": sum(item["point_count"] for item in lab_trends),
        "imaging_orders": len(chart["imaging_orders"]),
        "procedure_orders": len(chart["procedure_orders"]),
        "prescription_timeline_groups": len(prescription_timeline),
        "prescription_timeline_items": sum(group["item_count"] for group in prescription_timeline),
        "fhir_resources": [
            resource["type"] for resource in fhir_metadata["rest"][0]["resource"]
        ],
        "fhir_encounters": fhir_encounters["total"],
        "fhir_compositions": fhir_compositions["total"],
        "fhir_diagnostic_reports": fhir_diagnostic_reports["total"],
        "fhir_service_requests": fhir_service_requests["total"],
        "fhir_medication_requests": fhir_medications["total"],
        "fhir_appointments": fhir_appointments["total"],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


def main() -> int:
    try:
        run_step("backend pytest", ["uv", "run", "pytest"], ROOT / "backend")
        run_step("frontend lint", ["npm", "run", "lint"], ROOT / "frontend")
        run_step("frontend build", ["npm", "run", "build"], ROOT / "frontend")
        run_step("backend migrations", ["uv", "run", "alembic", "upgrade", "head"], ROOT / "backend")
        run_step("docker compose up", ["docker", "compose", "up", "-d", "--build", "api", "web"], ROOT)
        verify_preview()
    except (subprocess.CalledProcessError, RuntimeError, AssertionError, urllib.error.URLError) as error:
        print(f"\nverification failed: {error}", file=sys.stderr)
        return 1

    print("\nverification completed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
