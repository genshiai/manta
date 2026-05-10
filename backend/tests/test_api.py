from datetime import datetime, timezone
from copy import deepcopy
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import SessionLocal
from app.main import app
from app.models import (
    ChartTemplateMaster,
    BedMaster,
    ClaimDraft,
    DiagnosisAliasMaster,
    DiagnosisMaster,
    InpatientDocument,
    InpatientAiSummaryReview,
    InpatientDischargePlan,
    InpatientInstruction,
    InpatientPathwayAssignment,
    LabSetMaster,
    Patient,
    PmdaPackageInsertSection,
    PmdaDrugInteraction,
    PmdaDrugInteractionMatch,
    PrescriptionCatalogMaster,
    PrescriptionOrder,
    PrescriptionSetMaster,
    ReceiptLongTermListedDrug,
    ReceiptTransitionalDrug,
    Reservation,
    ReservationSlotMaster,
    StandardUsageMaster,
    User,
)
from app.seed import PATIENT_WORKSPACE_BY_ID


def login(client: TestClient, user_id: str, password: str) -> str:
    response = client.post(
        "/api/auth/login",
        json={"user_id": user_id, "password": password},
    )

    assert response.status_code == 200
    return response.json()["access_token"]


def cleanup_user(user_id: str) -> None:
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user is not None:
            db.delete(user)
            db.commit()


def cleanup_chart_order_masters(
    prescription_id: str,
    lab_set_id: str,
    slot_id: str,
    template_id: str | None = None,
    standard_usage_id: str | None = None,
    prescription_set_id: str | None = None,
) -> None:
    with SessionLocal() as db:
        prescription = db.get(PrescriptionCatalogMaster, prescription_id)
        if prescription is not None:
            db.delete(prescription)

        if standard_usage_id is not None:
            standard_usage = db.get(StandardUsageMaster, standard_usage_id)
            if standard_usage is not None:
                db.delete(standard_usage)

        if prescription_set_id is not None:
            prescription_set = db.get(PrescriptionSetMaster, prescription_set_id)
            if prescription_set is not None:
                db.delete(prescription_set)

        lab_set = db.get(LabSetMaster, lab_set_id)
        if lab_set is not None:
            db.delete(lab_set)

        slot = db.get(ReservationSlotMaster, slot_id)
        if slot is not None:
            db.delete(slot)

        if template_id is not None:
            template = db.get(ChartTemplateMaster, template_id)
            if template is not None:
                db.delete(template)

        db.commit()


def cleanup_diagnosis_master(management_number: str) -> None:
    with SessionLocal() as db:
        aliases = db.scalars(
            select(DiagnosisAliasMaster).where(DiagnosisAliasMaster.management_number == management_number)
        ).all()
        for alias in aliases:
            db.delete(alias)

        diagnosis = db.get(DiagnosisMaster, management_number)
        if diagnosis is not None:
            db.delete(diagnosis)
        db.commit()


def restore_patient_workspace(patient_id: str) -> None:
    workspace = PATIENT_WORKSPACE_BY_ID[patient_id]

    with SessionLocal() as db:
        patient = db.get(Patient, patient_id)
        if patient is None:
            return

        patient.profile_items = deepcopy(workspace["profile_items"])
        patient.problems = deepcopy(workspace["problems"])
        patient.imaging_orders = deepcopy(workspace["imaging_orders"])
        patient.procedure_orders = deepcopy(workspace["procedure_orders"])
        db.commit()


def cleanup_prescription_orders(patient_id: str, drug_name: str) -> None:
    with SessionLocal() as db:
        orders = db.scalars(
            select(PrescriptionOrder).where(
                PrescriptionOrder.patient_id == patient_id,
                PrescriptionOrder.drug_name == drug_name,
            )
        ).all()
        for order in orders:
            db.delete(order)
        db.commit()


def cleanup_pmda_sections(package_insert_no: str) -> None:
    with SessionLocal() as db:
        rows = db.scalars(
            select(PmdaPackageInsertSection).where(PmdaPackageInsertSection.package_insert_no == package_insert_no)
        ).all()
        for row in rows:
            db.delete(row)
        interactions = db.scalars(
            select(PmdaDrugInteraction).where(PmdaDrugInteraction.package_insert_no == package_insert_no)
        ).all()
        for row in interactions:
            db.delete(row)
        db.commit()


def test_healthcheck() -> None:
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_login_and_list_patients() -> None:
    with TestClient(app) as client:
        token = login(client, "dr.tanaka", "manta-demo")
        patients_response = client.get(
            "/api/patients",
            headers={"Authorization": f"Bearer {token}"},
        )
        master_response = client.get(
            "/api/masters/chart-order-config",
            headers={"Authorization": f"Bearer {token}"},
        )
        internal_master_response = client.get(
            "/api/masters/chart-order-config?department=内科",
            headers={"Authorization": f"Bearer {token}"},
        )
        me_response = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert patients_response.status_code == 200
    assert master_response.status_code == 200
    assert internal_master_response.status_code == 200
    assert me_response.status_code == 200
    assert me_response.json()["display_name"] == "田中 太郎"
    assert len(patients_response.json()) >= 4
    assert len(master_response.json()["prescription_catalog"]) >= 5
    assert len(master_response.json()["standard_usage_masters"]) >= 4
    assert len(master_response.json()["prescription_sets"]) >= 3
    assert len(master_response.json()["lab_set_options"]) >= 3
    assert len(master_response.json()["reservation_slots"]) >= 4
    assert len(master_response.json()["chart_templates"]) >= 3
    assert all(
        item["department"] in {"内科", "共通"} for item in internal_master_response.json()["prescription_sets"]
    )
    assert all(item["department"] == "内科" for item in internal_master_response.json()["reservation_slots"])
    assert all(item["department"] in {"内科", "共通"} for item in internal_master_response.json()["chart_templates"])


def test_list_inpatient_admissions() -> None:
    with TestClient(app) as client:
        token = login(client, "dr.tanaka", "manta-demo")
        response = client.get(
            "/api/inpatient/admissions",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    admissions = response.json()
    assert len(admissions) >= 1
    assert admissions[0]["patient"]["id"]
    assert admissions[0]["stay_days"] >= 1
    assert "pending_instruction_count" in admissions[0]


def test_update_inpatient_instruction_status() -> None:
    with TestClient(app) as client:
        token = login(client, "dr.tanaka", "manta-demo")
        with SessionLocal() as db:
            instruction = db.scalar(select(InpatientInstruction).where(InpatientInstruction.status == "pending"))
            assert instruction is not None
            instruction_id = instruction.id

        response = client.patch(
            f"/api/inpatient/instructions/{instruction_id}",
            json={"status": "done"},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert response.json()["status"] == "done"

    with SessionLocal() as db:
        instruction = db.get(InpatientInstruction, instruction_id)
        assert instruction is not None
        instruction.status = "pending"
        db.commit()


def test_list_and_update_inpatient_beds() -> None:
    with TestClient(app) as client:
        token = login(client, "dr.tanaka", "manta-demo")
        beds_response = client.get(
            "/api/inpatient/beds",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert beds_response.status_code == 200
        beds = beds_response.json()
        assert len(beds) >= 1
        cleaning_bed = next((item for item in beds if item["bed"]["status"] == "cleaning"), None)
        target_bed = cleaning_bed or next(item for item in beds if item["current_admission_id"] is None)
        target_status = "available" if target_bed["bed"]["status"] != "available" else "blocked"
        update_response = client.patch(
            f"/api/inpatient/beds/{target_bed['bed']['id']}",
            json={"status": target_status, "note": "test"},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert update_response.status_code == 200
    assert update_response.json()["bed"]["status"] == target_status

    with SessionLocal() as db:
        bed_id = target_bed["bed"]["id"]
        bed = db.get(BedMaster, bed_id)
        assert bed is not None
        bed.status = target_bed["bed"]["status"]
        bed.note = target_bed["bed"]["note"]
        db.commit()


def test_get_inpatient_progress() -> None:
    with TestClient(app) as client:
        token = login(client, "dr.tanaka", "manta-demo")
        admissions_response = client.get(
            "/api/inpatient/admissions",
            headers={"Authorization": f"Bearer {token}"},
        )
        admission_id = admissions_response.json()[0]["id"]
        response = client.get(
            f"/api/inpatient/admissions/{admission_id}/progress",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["admission_id"] == admission_id
    assert isinstance(payload["rows"], list)
    assert payload["rows"]
    assert {"date", "vitals", "labs", "prescriptions", "lab_orders", "instructions", "nursing_notes"} <= set(
        payload["rows"][0]
    )


def test_create_and_sign_inpatient_document() -> None:
    document_id: int | None = None
    with TestClient(app) as client:
        token = login(client, "dr.tanaka", "manta-demo")
        admissions_response = client.get(
            "/api/inpatient/admissions",
            headers={"Authorization": f"Bearer {token}"},
        )
        admission_id = admissions_response.json()[0]["id"]
        create_response = client.post(
            f"/api/inpatient/admissions/{admission_id}/documents",
            json={"document_type": "admission_care_plan"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert create_response.status_code == 201
        document = create_response.json()
        document_id = document["id"]
        list_response = client.get(
            f"/api/inpatient/admissions/{admission_id}/documents",
            headers={"Authorization": f"Bearer {token}"},
        )
        sign_response = client.patch(
            f"/api/inpatient/documents/{document_id}",
            json={"status": "signed"},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert document["document_type"] == "admission_care_plan"
    assert document["title"] == "入院診療計画書"
    assert "【患者情報】" in document["body"]
    assert list_response.status_code == 200
    assert any(item["id"] == document_id for item in list_response.json())
    assert sign_response.status_code == 200
    assert sign_response.json()["status"] == "signed"

    if document_id is not None:
        with SessionLocal() as db:
            persisted = db.get(InpatientDocument, document_id)
            if persisted is not None:
                db.delete(persisted)
                db.commit()


def test_get_inpatient_summary_draft() -> None:
    with TestClient(app) as client:
        token = login(client, "dr.tanaka", "manta-demo")
        admissions_response = client.get(
            "/api/inpatient/admissions",
            headers={"Authorization": f"Bearer {token}"},
        )
        admission_id = admissions_response.json()[0]["id"]
        response = client.get(
            f"/api/inpatient/admissions/{admission_id}/summary-draft?days=30",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["admission_id"] == admission_id
    assert payload["title"]
    assert "【入院経過要約案】" in payload["body"]
    assert payload["source_counts"]["nursing_notes"] >= 0
    assert isinstance(payload["key_events"], list)


def test_inpatient_pathway_and_events() -> None:
    pathway_id: int | None = None
    with TestClient(app) as client:
        token = login(client, "dr.tanaka", "manta-demo")
        admissions_response = client.get(
            "/api/inpatient/admissions",
            headers={"Authorization": f"Bearer {token}"},
        )
        admission_id = admissions_response.json()[0]["id"]
        masters_response = client.get(
            "/api/inpatient/pathway-masters",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert masters_response.status_code == 200
        pathway_master_id = masters_response.json()[0]["id"]
        create_response = client.post(
            f"/api/inpatient/admissions/{admission_id}/pathway",
            json={"pathway_master_id": pathway_master_id, "pathway_name": "テスト標準パス"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert create_response.status_code == 201
        pathway = create_response.json()
        pathway_id = pathway["id"]
        task_id = pathway["tasks"][0]["id"]
        task_response = client.patch(
            f"/api/inpatient/pathway-tasks/{task_id}",
            json={"status": "variance", "variance_note": "検査延期"},
            headers={"Authorization": f"Bearer {token}"},
        )
        events_response = client.get(
            f"/api/inpatient/admissions/{admission_id}/events",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert pathway["pathway_master_id"] == pathway_master_id
    assert len(pathway["tasks"]) >= 3
    assert pathway["tasks"][0]["due_on"]
    assert pathway["tasks"][0]["role"]
    assert task_response.status_code == 200
    assert task_response.json()["status"] == "variance"
    assert events_response.status_code == 200
    assert any(item["event_type"] == "pathway_variance" for item in events_response.json())

    if pathway_id is not None:
        with SessionLocal() as db:
            pathway = db.get(InpatientPathwayAssignment, pathway_id)
            if pathway is not None:
                db.delete(pathway)
                db.commit()


def test_create_inpatient_summary_review() -> None:
    review_id: int | None = None
    with TestClient(app) as client:
        token = login(client, "dr.tanaka", "manta-demo")
        admissions_response = client.get(
            "/api/inpatient/admissions",
            headers={"Authorization": f"Bearer {token}"},
        )
        admission_id = admissions_response.json()[0]["id"]
        response = client.post(
            f"/api/inpatient/admissions/{admission_id}/summary-reviews",
            json={
                "summary_title": "テスト要約",
                "summary_body": "要約本文",
                "status": "accepted",
                "source_counts": {
                    "nursing_notes": 1,
                    "observations": 2,
                    "prescriptions": 3,
                    "lab_orders": 4,
                    "instructions": 5,
                },
                "review_note": "採用",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 201
        review = response.json()
        review_id = review["id"]
        list_response = client.get(
            f"/api/inpatient/admissions/{admission_id}/summary-reviews",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert review["status"] == "accepted"
    assert list_response.status_code == 200
    assert any(item["id"] == review_id for item in list_response.json())

    if review_id is not None:
        with SessionLocal() as db:
            persisted = db.get(InpatientAiSummaryReview, review_id)
            if persisted is not None:
                db.delete(persisted)
                db.commit()


def test_get_and_update_inpatient_discharge_plan() -> None:
    plan_id: int | None = None
    with TestClient(app) as client:
        token = login(client, "dr.tanaka", "manta-demo")
        admissions_response = client.get(
            "/api/inpatient/admissions",
            headers={"Authorization": f"Bearer {token}"},
        )
        admission_id = admissions_response.json()[0]["id"]
        get_response = client.get(
            f"/api/inpatient/admissions/{admission_id}/discharge-plan",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert get_response.status_code == 200
        draft = get_response.json()
        update_response = client.put(
            f"/api/inpatient/admissions/{admission_id}/discharge-plan",
            json={
                "status": "ready",
                "discharge_medication_note": draft["discharge_medication_note"],
                "billing_candidates": draft["billing_candidates"],
                "follow_up_note": "次回外来を予約",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        assert update_response.status_code == 200
        plan = update_response.json()
        plan_id = plan["id"]

    assert draft["status"] == "draft"
    assert draft["billing_candidates"]
    assert {"id", "category", "label", "source", "evidence", "status", "confidence"} <= set(
        draft["billing_candidates"][0]
    )
    assert "receipt_code" in draft["billing_candidates"][0]
    assert plan["status"] == "ready"
    assert plan["follow_up_note"] == "次回外来を予約"

    if plan_id is not None:
        with SessionLocal() as db:
            persisted = db.get(InpatientDischargePlan, plan_id)
            if persisted is not None:
                db.delete(persisted)
                db.commit()


def test_create_and_update_inpatient_claim_draft() -> None:
    draft_id: int | None = None
    with TestClient(app) as client:
        token = login(client, "dr.tanaka", "manta-demo")
        admissions_response = client.get(
            "/api/inpatient/admissions",
            headers={"Authorization": f"Bearer {token}"},
        )
        admission_id = admissions_response.json()[0]["id"]
        create_response = client.post(
            f"/api/inpatient/admissions/{admission_id}/claim-draft",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert create_response.status_code == 201
        draft = create_response.json()
        draft_id = draft["id"]
        get_response = client.get(
            f"/api/inpatient/admissions/{admission_id}/claim-draft",
            headers={"Authorization": f"Bearer {token}"},
        )
        update_response = client.patch(
            f"/api/claim-drafts/{draft_id}",
            json={"status": "ready"},
            headers={"Authorization": f"Bearer {token}"},
        )
        transmit_response = client.post(
            f"/api/claim-drafts/{draft_id}/transmissions/orca",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert draft["status"] == "draft"
    assert draft["admission_id"] == admission_id
    assert draft["billing_candidates"]
    assert isinstance(draft["total_points"], int)
    assert "issues" in draft
    assert get_response.status_code == 200
    assert get_response.json()["id"] == draft_id
    assert update_response.status_code == 200
    assert update_response.json()["status"] == "ready"
    assert transmit_response.status_code == 201
    assert transmit_response.json()["adapter"] == "orca"
    assert transmit_response.json()["status"] in {"accepted", "rejected"}

    if draft_id is not None:
        with SessionLocal() as db:
            persisted = db.get(ClaimDraft, draft_id)
            if persisted is not None:
                db.delete(persisted)
                db.commit()


def test_reject_patients_without_token() -> None:
    with TestClient(app) as client:
        response = client.get("/api/patients")

    assert response.status_code == 401


def test_admin_users_requires_admin_role() -> None:
    with TestClient(app) as client:
        doctor_token = login(client, "dr.tanaka", "manta-demo")
        admin_token = login(client, "admin.sato", "manta-admin")
        forbidden_response = client.get(
            "/api/admin/users",
            headers={"Authorization": f"Bearer {doctor_token}"},
        )
        admin_response = client.get(
            "/api/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

    assert forbidden_response.status_code == 403
    assert admin_response.status_code == 200
    assert {user["role"] for user in admin_response.json()} == {"医師", "管理者"}


def test_admin_can_create_update_and_reset_user() -> None:
    unique_user_id = f"doctor.{uuid4().hex[:8]}"

    try:
        with TestClient(app) as client:
            admin_token = login(client, "admin.sato", "manta-admin")
            create_response = client.post(
                "/api/admin/users",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "user_id": unique_user_id,
                    "password": "TempPass123",
                    "display_name": "中村 由紀",
                    "department": "総合診療科",
                    "role": "医師",
                    "password_expires_at": "2026-12-31",
                },
            )
            update_response = client.patch(
                f"/api/admin/users/{unique_user_id}",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "display_name": "中村 由紀",
                    "department": "地域医療連携室",
                    "role": "管理者",
                    "password_expires_at": "2027-03-31",
                },
            )
            reset_response = client.post(
                f"/api/admin/users/{unique_user_id}/reset-password",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"password": "NewPass456"},
            )
            login_response = client.post(
                "/api/auth/login",
                json={"user_id": unique_user_id, "password": "NewPass456"},
            )
    finally:
        cleanup_user(unique_user_id)

    assert create_response.status_code == 201
    assert create_response.json()["role"] == "医師"
    assert update_response.status_code == 200
    assert update_response.json()["role"] == "管理者"
    assert update_response.json()["department"] == "地域医療連携室"
    assert reset_response.status_code == 200
    assert reset_response.json() == {"user_id": unique_user_id, "status": "updated"}
    assert login_response.status_code == 200
    assert login_response.json()["user"]["role"] == "管理者"


def test_admin_can_manage_chart_order_masters() -> None:
    unique_suffix = uuid4().hex[:6]
    prescription_id = f"test-rx-{unique_suffix}"
    standard_usage_id = f"test-usage-{unique_suffix}"
    prescription_set_id = f"test-set-{unique_suffix}"
    lab_set_id = f"test-lab-{unique_suffix}"
    slot_id = f"2099-12-31-0900-{unique_suffix}"
    template_id = f"test-template-{unique_suffix}"

    try:
        with TestClient(app) as client:
            doctor_token = login(client, "dr.tanaka", "manta-demo")
            admin_token = login(client, "admin.sato", "manta-admin")
            create_prescription_response = client.post(
                "/api/admin/masters/prescription-catalog",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "id": prescription_id,
                    "sort_order": 999,
                    "is_active": True,
                    "drug_name": "テスト配合錠",
                    "category": "内服",
                    "dosage_options": ["1回1錠 1日1回 朝食後"],
                    "yj_code": "1234567A1234",
                    "hot_code": "1234567890123",
                    "allergy_conflict_label": None,
                    "related_problem": "#99 テスト病名",
                },
            )
            update_prescription_response = client.patch(
                f"/api/admin/masters/prescription-catalog/{prescription_id}",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "sort_order": 998,
                    "is_active": False,
                    "drug_name": "テスト配合錠 改",
                    "category": "内服",
                    "dosage_options": ["1回2錠 1日1回 朝食後"],
                    "generic_name": "テスト一般名 改",
                    "name_kana": "テストイッパンメイカイ",
                    "aliases": ["テスト薬", "改訂版"],
                    "yj_code": "DEMO-YJ-TEST-RX",
                    "hot_code": "DEMO-HOT-TEST-RX",
                    "dosage_form": "錠剤",
                    "strength": "10mg",
                    "standard_usage_code": "po-qd-after-breakfast",
                    "default_days": "28",
                    "pmda_info_url": "https://example.test/pmda",
                    "allergy_conflict_label": "テスト禁忌",
                    "related_problem": "#99 テスト病名",
                },
            )
            create_standard_usage_response = client.post(
                "/api/admin/masters/standard-usages",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "id": standard_usage_id,
                    "sort_order": 999,
                    "is_active": True,
                    "label": "テスト用法",
                    "category": "内服",
                    "instruction": "1回1錠 1日2回 朝夕食後",
                    "default_days": "28",
                    "note": "テストメモ",
                },
            )
            update_standard_usage_response = client.patch(
                f"/api/admin/masters/standard-usages/{standard_usage_id}",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "sort_order": 997,
                    "is_active": False,
                    "label": "テスト用法改",
                    "category": "頓服",
                    "instruction": "疼痛時 1回1錠 1日3回まで",
                    "default_days": "7",
                    "note": "更新メモ",
                },
            )
            create_prescription_set_response = client.post(
                "/api/admin/masters/prescription-sets",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "id": prescription_set_id,
                    "sort_order": 999,
                    "is_active": True,
                    "label": "テスト処方セット",
                    "department": "総合診療科",
                    "related_problem": "#99 テスト病名",
                    "note": "セット備考",
                    "included_set_ids": ["dm-follow-28"],
                    "items": [
                        {
                            "drug_id": "metformin-500",
                            "dosage": "1回1錠 1日2回 朝夕食後",
                            "days": "28",
                            "note": "継続薬",
                        }
                    ],
                },
            )
            update_prescription_set_response = client.patch(
                f"/api/admin/masters/prescription-sets/{prescription_set_id}",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "sort_order": 996,
                    "is_active": False,
                    "label": "テスト処方セット改",
                    "department": "内科",
                    "related_problem": "#99 テスト病名",
                    "note": "セット備考更新",
                    "included_set_ids": ["dm-ht-follow-28"],
                    "items": [
                        {
                            "drug_id": "amlodipine-5",
                            "dosage": "1回1錠 1日1回 朝食後",
                            "days": "14",
                            "note": "降圧薬",
                        }
                    ],
                },
            )
            create_lab_set_response = client.post(
                "/api/admin/masters/lab-sets",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "id": lab_set_id,
                    "sort_order": 999,
                    "is_active": True,
                    "label": "テストセット",
                    "items": ["AST", "ALT"],
                    "included_set_ids": ["dm-follow"],
                },
            )
            update_lab_set_response = client.patch(
                f"/api/admin/masters/lab-sets/{lab_set_id}",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "sort_order": 995,
                    "is_active": False,
                    "label": "テストセット改",
                    "items": ["AST", "ALT", "ALP"],
                    "included_set_ids": ["urine-basic"],
                },
            )
            create_slot_response = client.post(
                "/api/admin/masters/reservation-slots",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "id": slot_id,
                    "sort_order": 999,
                    "is_active": True,
                    "date": "2099/12/31（木）",
                    "time": "09:00",
                    "department": "総合診療科",
                    "doctor": "テスト 医師",
                    "state": "available",
                },
            )
            update_slot_response = client.patch(
                f"/api/admin/masters/reservation-slots/{slot_id}",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "sort_order": 990,
                    "is_active": False,
                    "date": "2099/12/31（木）",
                    "time": "09:30",
                    "department": "総合診療科",
                    "doctor": "テスト 医師",
                    "state": "few",
                },
            )
            create_template_response = client.post(
                "/api/admin/masters/chart-templates",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "id": template_id,
                    "sort_order": 999,
                    "is_active": True,
                    "label": "テストテンプレート",
                    "department": "総合診療科",
                    "subjective": "S テスト",
                    "objective": "O テスト",
                    "assessment": "A テスト",
                    "plan": "P テスト",
                },
            )
            update_template_response = client.patch(
                f"/api/admin/masters/chart-templates/{template_id}",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "sort_order": 980,
                    "is_active": False,
                    "label": "テストテンプレート改",
                    "department": "総合診療科",
                    "subjective": "S テスト改",
                    "objective": "O テスト改",
                    "assessment": "A テスト改",
                    "plan": "P テスト改",
                },
            )
            public_master_response = client.get(
                "/api/masters/chart-order-config",
                headers={"Authorization": f"Bearer {doctor_token}"},
            )
            forbidden_inactive_response = client.get(
                "/api/masters/chart-order-config?include_inactive=true",
                headers={"Authorization": f"Bearer {doctor_token}"},
            )
            admin_inactive_response = client.get(
                "/api/masters/chart-order-config?include_inactive=true",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            system_audit_response = client.get(
                "/api/audit-logs?scope=system&limit=100",
                headers={"Authorization": f"Bearer {admin_token}"},
            )
    finally:
        cleanup_chart_order_masters(
            prescription_id,
            lab_set_id,
            slot_id,
            template_id,
            standard_usage_id,
            prescription_set_id,
        )

    assert create_prescription_response.status_code == 201
    assert create_prescription_response.json()["pmda_info_url"] == (
        "https://www.pmda.go.jp/PmdaSearch/rdSearch/02/1234567A1234?user=1"
    )
    assert update_prescription_response.status_code == 200
    assert update_prescription_response.json()["drug_name"] == "テスト配合錠 改"
    assert update_prescription_response.json()["sort_order"] == 998
    assert update_prescription_response.json()["is_active"] is False
    assert update_prescription_response.json()["generic_name"] == "テスト一般名 改"
    assert update_prescription_response.json()["standard_usage_code"] == "po-qd-after-breakfast"
    assert create_standard_usage_response.status_code == 201
    assert update_standard_usage_response.status_code == 200
    assert update_standard_usage_response.json()["label"] == "テスト用法改"
    assert update_standard_usage_response.json()["is_active"] is False
    assert create_prescription_set_response.status_code == 201
    assert update_prescription_set_response.status_code == 200
    assert update_prescription_set_response.json()["label"] == "テスト処方セット改"
    assert update_prescription_set_response.json()["is_active"] is False
    assert update_prescription_set_response.json()["items"][0]["drug_id"] == "amlodipine-5"
    assert update_prescription_set_response.json()["included_set_ids"] == ["dm-ht-follow-28"]
    assert create_lab_set_response.status_code == 201
    assert update_lab_set_response.status_code == 200
    assert update_lab_set_response.json()["label"] == "テストセット改"
    assert update_lab_set_response.json()["is_active"] is False
    assert update_lab_set_response.json()["included_set_ids"] == ["urine-basic"]
    assert create_slot_response.status_code == 201
    assert update_slot_response.status_code == 200
    assert update_slot_response.json()["time"] == "09:30"
    assert update_slot_response.json()["is_active"] is False
    assert create_template_response.status_code == 201
    assert update_template_response.status_code == 200
    assert update_template_response.json()["label"] == "テストテンプレート改"
    assert update_template_response.json()["is_active"] is False
    assert public_master_response.status_code == 200
    assert forbidden_inactive_response.status_code == 403
    assert admin_inactive_response.status_code == 200
    assert system_audit_response.status_code == 200
    assert not any(item["id"] == prescription_id for item in public_master_response.json()["prescription_catalog"])
    assert not any(item["id"] == standard_usage_id for item in public_master_response.json()["standard_usage_masters"])
    assert not any(item["id"] == prescription_set_id for item in public_master_response.json()["prescription_sets"])
    assert not any(item["id"] == lab_set_id for item in public_master_response.json()["lab_set_options"])
    assert not any(item["id"] == slot_id for item in public_master_response.json()["reservation_slots"])
    assert not any(item["id"] == template_id for item in public_master_response.json()["chart_templates"])
    assert any(
        item["id"] == prescription_id and item["is_active"] is False
        for item in admin_inactive_response.json()["prescription_catalog"]
    )
    assert any(
        item["id"] == standard_usage_id and item["is_active"] is False
        for item in admin_inactive_response.json()["standard_usage_masters"]
    )
    assert any(
        item["id"] == prescription_set_id and item["is_active"] is False
        for item in admin_inactive_response.json()["prescription_sets"]
    )
    assert any(
        item["id"] == lab_set_id and item["is_active"] is False
        for item in admin_inactive_response.json()["lab_set_options"]
    )
    assert any(
        item["id"] == slot_id and item["is_active"] is False
        for item in admin_inactive_response.json()["reservation_slots"]
    )
    assert any(
        item["id"] == template_id and item["is_active"] is False
        for item in admin_inactive_response.json()["chart_templates"]
    )
    assert all(item["scope"] == "system" for item in system_audit_response.json())
    assert any(item["action"] == "処方候補更新" for item in system_audit_response.json())
    assert any(item["action"] == "標準用法更新" for item in system_audit_response.json())
    assert any(item["action"] == "処方セット更新" for item in system_audit_response.json())
    assert any(item["action"] == "検査セット更新" for item in system_audit_response.json())
    assert any(item["action"] == "予約枠更新" for item in system_audit_response.json())
    assert any(item["action"] == "カルテテンプレート更新" for item in system_audit_response.json())


def test_diagnosis_master_search_requires_auth_and_supports_name_and_code() -> None:
    with TestClient(app) as client:
        no_auth_response = client.get("/api/masters/diagnoses/search?q=糖尿病")
        doctor_token = login(client, "dr.tanaka", "manta-demo")
        name_search_response = client.get(
            "/api/masters/diagnoses/search?q=糖尿病",
            headers={"Authorization": f"Bearer {doctor_token}"},
        )
        code_search_response = client.get(
            "/api/masters/diagnoses/search?q=E11",
            headers={"Authorization": f"Bearer {doctor_token}"},
        )

    assert no_auth_response.status_code == 401
    assert name_search_response.status_code == 200
    assert code_search_response.status_code == 200
    assert len(name_search_response.json()) >= 1
    assert any("糖尿病" in item["disease_name"] for item in name_search_response.json())
    assert any((item["icd10_code"] or "").startswith("E11") for item in code_search_response.json())


def test_diagnosis_master_search_supports_alias_hits() -> None:
    management_number = f"T{uuid4().hex[:15]}"
    alias = f"テスト同義語{uuid4().hex[:6]}"

    try:
        with TestClient(app) as client:
            doctor_token = login(client, "dr.tanaka", "manta-demo")

            with SessionLocal() as db:
                db.add(
                    DiagnosisMaster(
                        management_number=management_number,
                        change_type="0",
                        disease_name="標準テスト病名",
                        disease_name_kana="ヒョウジュンテストビョウメイ",
                        adoption_level="1",
                        exchange_code="TALIAS",
                        icd10_code="A09",
                        icd10_subcode=None,
                        claim_code="1234567",
                        is_deleted=False,
                        updated_at_master="20260505",
                    )
                )
                db.flush()
                db.add(
                    DiagnosisAliasMaster(
                        management_number=management_number,
                        alias=alias,
                        alias_kana="テストドウギゴ",
                        alias_type="synonym",
                        is_deleted=False,
                    )
                )
                db.commit()

            response = client.get(
                f"/api/masters/diagnoses/search?q={alias}",
                headers={"Authorization": f"Bearer {doctor_token}"},
            )

        assert response.status_code == 200
        assert any(item["management_number"] == management_number for item in response.json())
    finally:
        cleanup_diagnosis_master(management_number)


def test_diagnosis_master_search_returns_migration_target_for_deprecated_alias() -> None:
    suffix = uuid4().hex[:8]
    old_management_number = f"O{suffix}0000000"[:16]
    new_management_number = f"N{suffix}0000000"[:16]
    alias = f"旧称テスト病名{suffix}"

    try:
        with TestClient(app) as client:
            doctor_token = login(client, "dr.tanaka", "manta-demo")

            with SessionLocal() as db:
                db.add(
                    DiagnosisMaster(
                        management_number=old_management_number,
                        change_type="9",
                        disease_name="廃止テスト病名",
                        disease_name_kana="ハイシテストビョウメイ",
                        adoption_level="9",
                        exchange_code="OLDTEST",
                        icd10_code="B99",
                        icd10_subcode=None,
                        claim_code="7654321",
                        is_deleted=True,
                        updated_at_master="20260505",
                    )
                )
                db.add(
                    DiagnosisMaster(
                        management_number=new_management_number,
                        change_type="0",
                        disease_name="現行テスト病名",
                        disease_name_kana="ゲンコウテストビョウメイ",
                        adoption_level="1",
                        exchange_code="NEWTEST",
                        icd10_code="B99",
                        icd10_subcode=None,
                        claim_code="7654322",
                        is_deleted=False,
                        updated_at_master="20260505",
                    )
                )
                db.flush()
                db.add(
                    DiagnosisAliasMaster(
                        management_number=old_management_number,
                        alias=alias,
                        alias_kana="キュウショウテストビョウメイ",
                        alias_type="migration",
                        target_management_number=new_management_number,
                        is_deleted=False,
                    )
                )
                db.commit()

            response = client.get(
                f"/api/masters/diagnoses/search?q={alias}",
                headers={"Authorization": f"Bearer {doctor_token}"},
            )

        assert response.status_code == 200
        payload = response.json()[0]
        assert payload["management_number"] == new_management_number
        assert payload["matched_alias"] == alias
        assert payload["migration_source_management_number"] == old_management_number
        assert payload["migration_source_name"] == "廃止テスト病名"
    finally:
        cleanup_diagnosis_master(old_management_number)
        cleanup_diagnosis_master(new_management_number)


def test_doctor_can_update_patient_context() -> None:
    unique_problem_name = f"#9 テスト病名 {uuid4().hex[:6]}"

    try:
        with TestClient(app) as client:
            doctor_token = login(client, "dr.tanaka", "manta-demo")
            update_response = client.put(
                "/api/patients/0009900041/context",
                headers={"Authorization": f"Bearer {doctor_token}"},
                json={
                    "patient_profile": [
                        {"label": "既往歴", "value": "接触皮膚炎、アレルギー性鼻炎"},
                        {"label": "生活歴", "value": "夜勤あり。保湿剤は持参。"},
                    ],
                    "problems": [
                        {"name": unique_problem_name, "since": "2026/04 〜", "status": "active"},
                        {"name": "#2 アトピー性皮膚炎", "since": "小児期〜", "status": "resolved"},
                    ],
                },
            )
            chart_response = client.get(
                "/api/patients/0009900041/chart",
                headers={"Authorization": f"Bearer {doctor_token}"},
            )
    finally:
        restore_patient_workspace("0009900041")

    assert update_response.status_code == 200
    assert chart_response.status_code == 200
    assert chart_response.json()["patient_profile"][0]["value"] == "接触皮膚炎、アレルギー性鼻炎"
    assert {problem["name"] for problem in chart_response.json()["problems"]} == {
        unique_problem_name,
        "#2 アトピー性皮膚炎",
    }


def test_chart_workspace_includes_db_backed_snapshot_data() -> None:
    with TestClient(app) as client:
        doctor_token = login(client, "dr.tanaka", "manta-demo")
        chart_response = client.get(
            "/api/patients/0009900040/chart",
            headers={"Authorization": f"Bearer {doctor_token}"},
        )

    assert chart_response.status_code == 200
    payload = chart_response.json()
    assert payload["visit_history"][0]["department"] == "内科"
    assert payload["visit_history"][0]["active"] is True
    assert any(vital["label"] == "血圧" for vital in payload["vitals"])
    assert any(result["item"] == "HbA1c" for result in payload["lab_results"])
    hba1c = next(result for result in payload["lab_results"] if result["item"] == "HbA1c")
    assert hba1c["reported_at"] == "2026/04/13"
    assert len(hba1c["history"]) >= 3
    assert hba1c["history"][-1]["value"] == "7.2%"
    assert any(history["title"] == "定期検診" for history in payload["chart_history"])
    assert len(payload["prescription_history"]) >= 1
    assert payload["prescription_history"][0]["item_count"] >= 1
    assert any(order["category"] == "胸部X線" for order in payload["imaging_orders"])
    assert any(order["title"] == "生活指導" for order in payload["procedure_orders"])


def test_lab_trends_endpoint_returns_observation_backed_long_trends() -> None:
    with TestClient(app) as client:
        doctor_token = login(client, "dr.tanaka", "manta-demo")
        response = client.get(
            "/api/patients/0009900040/lab-trends",
            headers={"Authorization": f"Bearer {doctor_token}"},
        )

    assert response.status_code == 200
    payload = response.json()
    hba1c = next(item for item in payload if item["item"] == "HbA1c")
    assert hba1c["point_count"] >= 3
    assert hba1c["latest_value"] == "7.2 %"
    assert hba1c["previous_value"] == "7.5 %"
    assert hba1c["delta_label"] == "-0.3"
    assert hba1c["abnormal_count"] >= 3
    assert hba1c["points"][-1]["date"] == "2026/04/13"
    assert hba1c["points"][-1]["observation_id"]


def test_prescription_history_endpoint_returns_grouped_orders() -> None:
    with TestClient(app) as client:
        doctor_token = login(client, "dr.tanaka", "manta-demo")
        response = client.get(
            "/api/patients/0009900040/prescription-history",
            headers={"Authorization": f"Bearer {doctor_token}"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) >= 1
    assert payload[0]["label"].endswith("処方")
    assert payload[0]["item_count"] == len(payload[0]["items"])
    assert any(item["drug_name"] == "メトホルミン塩酸塩錠 500mg" for item in payload[0]["items"])


def test_prescription_timeline_and_copy_last_endpoint() -> None:
    suffix = uuid4().hex[:6]
    drug_names = [f"テスト前回薬A {suffix}", f"テスト前回薬B {suffix}"]
    source_date = "2026/03/01"

    try:
        with SessionLocal() as db:
            for index, drug_name in enumerate(drug_names):
                db.add(
                    PrescriptionOrder(
                        patient_id="0009900041",
                        type="内服",
                        days="14日分",
                        drug_name=drug_name,
                        dosage=f"1回1錠 1日{index + 1}回 食後",
                        created_at=datetime(2026, 3, 1, index, 0, tzinfo=timezone.utc),
                    )
                )
            db.commit()

        with TestClient(app) as client:
            doctor_token = login(client, "dr.tanaka", "manta-demo")
            timeline_response = client.get(
                "/api/patients/0009900041/prescription-timeline",
                headers={"Authorization": f"Bearer {doctor_token}"},
            )
            preview_response = client.post(
                "/api/patients/0009900041/prescriptions/copy-preview",
                headers={"Authorization": f"Bearer {doctor_token}"},
                json={"actor": "田中 太郎", "source_date": source_date},
            )
            copy_response = client.post(
                "/api/patients/0009900041/prescriptions/copy-last",
                headers={"Authorization": f"Bearer {doctor_token}"},
                json={"actor": "田中 太郎", "source_date": source_date},
            )
            duplicate_copy_response = client.post(
                "/api/patients/0009900041/prescriptions/copy-last",
                headers={"Authorization": f"Bearer {doctor_token}"},
                json={"actor": "田中 太郎", "source_date": source_date},
            )

        assert timeline_response.status_code == 200
        assert any(group["date"] == source_date for group in timeline_response.json())
        assert preview_response.status_code == 200
        assert preview_response.json()["source_date"] == source_date
        assert preview_response.json()["planned_count"] == 2
        assert {item["status"] for item in preview_response.json()["diff_items"]} == {"to_copy"}
        assert copy_response.status_code == 200
        assert copy_response.json()["source_date"] == source_date
        assert copy_response.json()["copied_count"] == 2
        assert {item["drug_name"] for item in copy_response.json()["copied_items"]} == set(drug_names)
        assert duplicate_copy_response.status_code == 200
        assert duplicate_copy_response.json()["copied_count"] == 0
        assert duplicate_copy_response.json()["skipped_count"] == 2
        assert all("本日すでに" in item["reason"] for item in duplicate_copy_response.json()["skipped_items"])
    finally:
        for drug_name in drug_names:
            cleanup_prescription_orders("0009900041", drug_name)


def test_doctor_can_represcribe_same_drug_on_later_day() -> None:
    drug_name = f"テスト継続薬 {uuid4().hex[:6]}"

    try:
        with SessionLocal() as db:
            db.add(
                PrescriptionOrder(
                    patient_id="0009900041",
                    type="内服",
                    days="14日分",
                    drug_name=drug_name,
                    dosage="1回1錠 1日1回 朝食後",
                    created_at=datetime(2026, 3, 1, 0, 0, tzinfo=timezone.utc),
                )
            )
            db.commit()

        with TestClient(app) as client:
            doctor_token = login(client, "dr.tanaka", "manta-demo")
            response = client.post(
                "/api/patients/0009900041/prescriptions",
                headers={"Authorization": f"Bearer {doctor_token}"},
                json={
                    "type": "内服",
                    "days": "28日分",
                    "drug_name": drug_name,
                    "dosage": "1回1錠 1日1回 朝食後",
                    "actor": "田中 太郎",
                },
            )
    finally:
        cleanup_prescription_orders("0009900041", drug_name)

    assert response.status_code == 200
    assert response.json()["drug_name"] == drug_name


def test_add_prescription_returns_safety_warnings() -> None:
    drug_name = "ロスバスタチン錠 2.5mg"

    try:
        cleanup_prescription_orders("0009900041", drug_name)

        with TestClient(app) as client:
            doctor_token = login(client, "dr.tanaka", "manta-demo")
            response = client.post(
                "/api/patients/0009900041/prescriptions",
                headers={"Authorization": f"Bearer {doctor_token}"},
                json={
                    "type": "内服",
                    "days": "90日分",
                    "drug_name": drug_name,
                    "dosage": "1回2錠 1日2回 朝夕食後",
                    "actor": "田中 太郎",
                },
            )
    finally:
        cleanup_prescription_orders("0009900041", drug_name)

    assert response.status_code == 200
    assert response.json()["drug_name"] == drug_name
    assert any("関連病名" in warning for warning in response.json()["warnings"])
    assert any("標準用法候補" in warning for warning in response.json()["warnings"])
    assert any("標準日数" in warning for warning in response.json()["warnings"])


def test_add_prescription_returns_pmda_pregnancy_warning() -> None:
    suffix = uuid4().hex[:8]
    drug_id = f"pmda-preg-{suffix}"
    drug_name = f"PMDA妊婦注意薬 {suffix}"
    yj_code = f"PMDA{suffix.upper()}"
    package_insert_no = f"PMDA-TEST-{suffix}"

    try:
        with SessionLocal() as db:
            db.add(
                PrescriptionCatalogMaster(
                    id=drug_id,
                    sort_order=9999,
                    is_active=True,
                    drug_name=drug_name,
                    category="内服",
                    dosage_options=["1回1錠 1日1回 朝食後"],
                    generic_name="PMDAテスト一般名",
                    name_kana="PMDAテスト",
                    aliases=[],
                    yj_code=yj_code,
                    hot_code=None,
                    dosage_form="錠剤",
                    strength="1mg",
                    standard_usage_code=None,
                    default_days="7",
                    pmda_info_url=None,
                    allergy_conflict_label=None,
                    related_problem=None,
                )
            )
            db.add(
                PmdaPackageInsertSection(
                    yj_code=yj_code,
                    package_insert_no=package_insert_no,
                    brand_name=drug_name,
                    generic_name="PMDAテスト一般名",
                    section_code="pregnancy",
                    section_heading="妊婦",
                    severity="contraindication",
                    text="妊娠後期の女性には投与しないこと。",
                    source_xml="pmda-test.xml",
                    source_updated_at="2026-05",
                )
            )
            db.commit()

        with TestClient(app) as client:
            doctor_token = login(client, "dr.tanaka", "manta-demo")
            response = client.post(
                "/api/patients/0005520007/prescriptions",
                headers={"Authorization": f"Bearer {doctor_token}"},
                json={
                    "type": "内服",
                    "days": "7日分",
                    "drug_name": drug_name,
                    "dosage": "1回1錠 1日1回 朝食後",
                    "actor": "田中 太郎",
                },
            )
    finally:
        cleanup_prescription_orders("0005520007", drug_name)
        cleanup_pmda_sections(package_insert_no)
        cleanup_chart_order_masters(drug_id, "unused-lab-set", "unused-slot")

    assert response.status_code == 200
    assert any("PMDA妊婦注意" in warning for warning in response.json()["warnings"])
    assert any(detail["source"] == "PMDA 電子添文 / 妊婦" for detail in response.json()["warning_details"])


def test_add_prescription_uses_resolved_pmda_interaction_match() -> None:
    suffix = uuid4().hex[:8]
    patient_id = "0009900041"
    base_drug_id = f"warfarin-{suffix}"
    base_drug_name = f"ワルファリン錠1mg {suffix}"
    base_yj_code = f"7654321C{suffix[:4].upper()}"
    new_drug_id = f"pmda-int-{suffix}"
    new_drug_name = f"PMDA相互作用テスト薬 {suffix}"
    new_yj_code = f"1234567D{suffix[:4].upper()}"
    package_insert_no = f"PMDA-INT-{suffix}"

    try:
        with SessionLocal() as db:
            db.add(
                PrescriptionCatalogMaster(
                    id=base_drug_id,
                    sort_order=9998,
                    is_active=True,
                    drug_name=base_drug_name,
                    category="内服",
                    dosage_options=["1回1錠 1日1回 朝食後"],
                    generic_name="ワルファリン",
                    name_kana=None,
                    aliases=[],
                    yj_code=base_yj_code,
                    hot_code=None,
                    dosage_form="錠剤",
                    strength="1mg",
                    standard_usage_code=None,
                    default_days="7",
                    pmda_info_url=None,
                    allergy_conflict_label=None,
                    related_problem=None,
                )
            )
            db.add(
                PrescriptionCatalogMaster(
                    id=new_drug_id,
                    sort_order=9999,
                    is_active=True,
                    drug_name=new_drug_name,
                    category="内服",
                    dosage_options=["1回1錠 1日1回 朝食後"],
                    generic_name="PMDA相互作用テスト一般名",
                    name_kana=None,
                    aliases=[],
                    yj_code=new_yj_code,
                    hot_code=None,
                    dosage_form="錠剤",
                    strength="1mg",
                    standard_usage_code=None,
                    default_days="7",
                    pmda_info_url=None,
                    allergy_conflict_label=None,
                    related_problem=None,
                )
            )
            interaction = PmdaDrugInteraction(
                yj_code=new_yj_code,
                package_insert_no=package_insert_no,
                brand_name=new_drug_name,
                interacting_drug="ワルファリン",
                clinical_effects="出血傾向が増強することがある。",
                mechanism="抗凝固作用が増強する。",
                source_xml="pmda-test.xml",
                source_updated_at="2026-05",
            )
            db.add(interaction)
            db.flush()
            db.add(
                PmdaDrugInteractionMatch(
                    interaction_id=interaction.id,
                    interacting_drug_normalized="ワルファリン",
                    matched_yj_code=base_yj_code,
                    matched_drug_name=base_drug_name,
                    match_source="catalog",
                    match_confidence=100,
                    source_code=base_drug_id,
                )
            )
            db.commit()

        with TestClient(app) as client:
            doctor_token = login(client, "dr.tanaka", "manta-demo")
            base_response = client.post(
                f"/api/patients/{patient_id}/prescriptions",
                headers={"Authorization": f"Bearer {doctor_token}"},
                json={
                    "type": "内服",
                    "days": "7日分",
                    "drug_name": base_drug_name,
                    "dosage": "1回1錠 1日1回 朝食後",
                    "actor": "田中 太郎",
                },
            )
            response = client.post(
                f"/api/patients/{patient_id}/prescriptions",
                headers={"Authorization": f"Bearer {doctor_token}"},
                json={
                    "type": "内服",
                    "days": "7日分",
                    "drug_name": new_drug_name,
                    "dosage": "1回1錠 1日1回 朝食後",
                    "actor": "田中 太郎",
                },
            )
    finally:
        cleanup_prescription_orders(patient_id, base_drug_name)
        cleanup_prescription_orders(patient_id, new_drug_name)
        cleanup_pmda_sections(package_insert_no)
        cleanup_chart_order_masters(base_drug_id, "unused-lab-set", "unused-slot")
        cleanup_chart_order_masters(new_drug_id, "unused-lab-set", "unused-slot")

    assert base_response.status_code == 200
    assert response.status_code == 200
    assert any("PMDA相互作用" in warning and "照合:" in warning for warning in response.json()["warnings"])


def test_add_prescription_returns_receipt_policy_warnings() -> None:
    suffix = uuid4().hex[:8]
    patient_id = "0009900041"
    drug_id = f"receipt-policy-{suffix}"
    drug_name = f"経過措置選定療養テスト薬 {suffix}"
    yj_code = f"1124001F{suffix[:4].upper()}"
    receipt_drug_code = f"62{suffix[:7]}"

    try:
        with SessionLocal() as db:
            db.add(
                PrescriptionCatalogMaster(
                    id=drug_id,
                    sort_order=9999,
                    is_active=True,
                    drug_name=drug_name,
                    category="内服",
                    dosage_options=["1回1錠 1日1回 朝食後"],
                    generic_name=None,
                    name_kana=None,
                    aliases=[],
                    yj_code=yj_code,
                    hot_code=None,
                    dosage_form="錠剤",
                    strength="1mg",
                    standard_usage_code=None,
                    default_days="7",
                    pmda_info_url=None,
                    allergy_conflict_label=None,
                    related_problem=None,
                )
            )
            db.add(
                ReceiptTransitionalDrug(
                    receipt_drug_code=receipt_drug_code,
                    dosage_form="内",
                    yj_code=yj_code,
                    name=drug_name,
                    unit_name="錠",
                    price=None,
                    brand_related_flag="0",
                    non_listed_brand_name=None,
                    transitional_expiry="20270331",
                    note="テスト告示",
                    source_file="keikasoti-test.xlsx",
                )
            )
            db.add(
                ReceiptLongTermListedDrug(
                    yj_code=yj_code,
                    row_number=1,
                    dosage_form="内",
                    medical_necessity_receipt_code=receipt_drug_code,
                    medical_necessity_name=drug_name,
                    patient_request_receipt_code=f"67{suffix[:7]}",
                    patient_request_name=f"{drug_name}（選）",
                    source_file="sentei-test.xlsx",
                )
            )
            db.commit()

        with TestClient(app) as client:
            doctor_token = login(client, "dr.tanaka", "manta-demo")
            response = client.post(
                f"/api/patients/{patient_id}/prescriptions",
                headers={"Authorization": f"Bearer {doctor_token}"},
                json={
                    "type": "内服",
                    "days": "7日分",
                    "drug_name": drug_name,
                    "dosage": "1回1錠 1日1回 朝食後",
                    "actor": "田中 太郎",
                },
            )
    finally:
        cleanup_prescription_orders(patient_id, drug_name)
        with SessionLocal() as db:
            transitional = db.get(ReceiptTransitionalDrug, receipt_drug_code)
            if transitional is not None:
                db.delete(transitional)
            long_term = db.get(ReceiptLongTermListedDrug, yj_code)
            if long_term is not None:
                db.delete(long_term)
            db.commit()
        cleanup_chart_order_masters(drug_id, "unused-lab-set", "unused-slot")

    assert response.status_code == 200
    warnings = response.json()["warnings"]
    assert any("経過措置対象" in warning for warning in warnings)
    assert any("長期収載品・選定療養対象" in warning for warning in warnings)
    warning_details = response.json()["warning_details"]
    assert any(detail["source"] == "支払基金 基本マスター / 経過措置" for detail in warning_details)
    assert any(
        detail["source"] == "支払基金 基本マスター / 長期収載品・選定療養" for detail in warning_details
    )


def test_doctor_can_save_unscheduled_reservation() -> None:
    patient_id = "0009900041"
    original: dict[str, str | int | None] | None = None
    try:
        with SessionLocal() as db:
            reservation = db.scalar(select(Reservation).where(Reservation.patient_id == patient_id))
            if reservation is not None:
                original = {
                    "id": reservation.id,
                    "slot_id": reservation.slot_id,
                    "scheduled_for": reservation.scheduled_for,
                    "department": reservation.department,
                    "doctor": reservation.doctor,
                    "note": reservation.note,
                }

        with TestClient(app) as client:
            doctor_token = login(client, "dr.tanaka", "manta-demo")
            response = client.post(
                f"/api/patients/{patient_id}/reservation",
                headers={"Authorization": f"Bearer {doctor_token}"},
                json={
                    "slot_id": None,
                    "scheduled_for": "日未定",
                    "department": "内科",
                    "doctor": "田中 太郎",
                    "note": "検査結果確認後に日程調整",
                    "actor": "田中 太郎",
                },
            )
    finally:
        with SessionLocal() as db:
            reservation = db.scalar(select(Reservation).where(Reservation.patient_id == patient_id))
            if reservation is not None:
                if original is None:
                    db.delete(reservation)
                else:
                    reservation.slot_id = original["slot_id"] if isinstance(original["slot_id"], str) else None
                    reservation.scheduled_for = str(original["scheduled_for"])
                    reservation.department = str(original["department"])
                    reservation.doctor = str(original["doctor"])
                    reservation.note = str(original["note"])
                db.commit()

    assert response.status_code == 200
    assert response.json()["slot_id"] is None
    assert response.json()["scheduled_for"] == "日未定"


def test_reservation_slot_state_uses_live_booking_count() -> None:
    suffix = uuid4().hex[:8]
    slot_id = f"capacity-{suffix}"
    patient_id = "0009900041"
    blocked_patient_id = "0005520007"
    originals: dict[str, dict[str, str | int | None] | None] = {}

    try:
        with SessionLocal() as db:
            db.add(
                ReservationSlotMaster(
                    id=slot_id,
                    sort_order=9999,
                    is_active=True,
                    date="2099/12/31（木）",
                    time="10:00",
                    department="内科",
                    doctor="田中 太郎",
                    state="available",
                    capacity=1,
                )
            )
            for target_patient_id in [patient_id, blocked_patient_id]:
                reservation = db.scalar(select(Reservation).where(Reservation.patient_id == target_patient_id))
                originals[target_patient_id] = (
                    {
                        "id": reservation.id,
                        "slot_id": reservation.slot_id,
                        "scheduled_for": reservation.scheduled_for,
                        "department": reservation.department,
                        "doctor": reservation.doctor,
                        "note": reservation.note,
                    }
                    if reservation is not None
                    else None
                )
            db.commit()

        with TestClient(app) as client:
            doctor_token = login(client, "dr.tanaka", "manta-demo")
            first_response = client.post(
                f"/api/patients/{patient_id}/reservation",
                headers={"Authorization": f"Bearer {doctor_token}"},
                json={
                    "slot_id": slot_id,
                    "scheduled_for": "2099/12/31（木） 10:00",
                    "department": "内科",
                    "doctor": "田中 太郎",
                    "note": "",
                    "actor": "田中 太郎",
                },
            )
            blocked_response = client.post(
                f"/api/patients/{blocked_patient_id}/reservation",
                headers={"Authorization": f"Bearer {doctor_token}"},
                json={
                    "slot_id": slot_id,
                    "scheduled_for": "2099/12/31（木） 10:00",
                    "department": "内科",
                    "doctor": "田中 太郎",
                    "note": "",
                    "actor": "田中 太郎",
                },
            )
            masters_response = client.get(
                "/api/masters/chart-order-config?department=内科",
                headers={"Authorization": f"Bearer {doctor_token}"},
            )
    finally:
        with SessionLocal() as db:
            for target_patient_id, original in originals.items():
                reservation = db.scalar(select(Reservation).where(Reservation.patient_id == target_patient_id))
                if reservation is not None:
                    if original is None:
                        db.delete(reservation)
                    else:
                        reservation.slot_id = original["slot_id"] if isinstance(original["slot_id"], str) else None
                        reservation.scheduled_for = str(original["scheduled_for"])
                        reservation.department = str(original["department"])
                        reservation.doctor = str(original["doctor"])
                        reservation.note = str(original["note"])
            slot = db.get(ReservationSlotMaster, slot_id)
            if slot is not None:
                db.delete(slot)
            db.commit()

    assert first_response.status_code == 200
    assert blocked_response.status_code == 409
    slot_payload = next(item for item in masters_response.json()["reservation_slots"] if item["id"] == slot_id)
    assert slot_payload["capacity"] == 1
    assert slot_payload["booked_count"] == 1
    assert slot_payload["remaining_count"] == 0
    assert slot_payload["state"] == "full"


def test_doctor_can_add_imaging_and_procedure_orders() -> None:
    try:
        with TestClient(app) as client:
            doctor_token = login(client, "dr.tanaka", "manta-demo")
            imaging_response = client.post(
                "/api/patients/0009900041/imaging-orders",
                headers={"Authorization": f"Bearer {doctor_token}"},
                json={
                    "category": "皮膚エコー",
                    "status": "draft",
                    "scheduled_at": "未確定",
                    "note": "必要時に当日追加予定。",
                    "actor": "田中 太郎",
                },
            )
            procedure_response = client.post(
                "/api/patients/0009900041/procedure-orders",
                headers={"Authorization": f"Bearer {doctor_token}"},
                json={
                    "title": "保湿指導",
                    "status": "planned",
                    "note": "入浴後5分以内の塗布を説明予定。",
                    "actor": "田中 太郎",
                },
            )
            chart_response = client.get(
                "/api/patients/0009900041/chart",
                headers={"Authorization": f"Bearer {doctor_token}"},
            )
    finally:
        restore_patient_workspace("0009900041")

    assert imaging_response.status_code == 200
    assert imaging_response.json()["category"] == "皮膚エコー"
    assert procedure_response.status_code == 200
    assert procedure_response.json()["title"] == "保湿指導"
    assert chart_response.status_code == 200
    assert chart_response.json()["imaging_orders"][0]["category"] == "皮膚エコー"
    assert chart_response.json()["procedure_orders"][0]["title"] == "保湿指導"
