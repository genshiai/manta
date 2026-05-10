from __future__ import annotations

from datetime import date, datetime, timezone
import re
import unicodedata

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import (
    Admission,
    AuditLog,
    BedMaster,
    ChartNote,
    ChartTemplateMaster,
    Condition,
    DiagnosisMaster,
    InpatientInstruction,
    InpatientPathwayMaster,
    InpatientPathwayTaskMaster,
    LabOrder,
    LabSetMaster,
    NursingNote,
    Observation,
    Patient,
    PrescriptionCatalogMaster,
    PrescriptionSetMaster,
    PrescriptionOrder,
    ReceiptMedicalPracticeMaster,
    Reservation,
    ReservationSlotMaster,
    StandardUsageMaster,
    User,
    WardMaster,
    utcnow,
)
from .security import hash_password, password_needs_upgrade


DEMO_PRESCRIPTION_TIMESTAMPS = {
    ("0009900040", "メトホルミン塩酸塩錠 500mg"): datetime(2026, 3, 18, 1, 0, tzinfo=timezone.utc),
    ("0009900040", "アムロジピンOD錠 5mg"): datetime(2026, 3, 18, 1, 5, tzinfo=timezone.utc),
}


CHART_ORDER_MASTER_DATA = {
    "prescription_catalog": [
        {
            "id": "metformin-500",
            "sort_order": 10,
            "is_active": True,
            "drug_name": "メトホルミン塩酸塩錠 500mg",
            "category": "内服",
            "dosage_options": ["1回1錠 1日2回 朝夕食後", "1回1錠 1日1回 夕食後"],
            "generic_name": "メトホルミン塩酸塩",
            "name_kana": "メトホルミンエンサンエンジョウ",
            "aliases": ["メトホルミン", "糖尿病薬"],
            "yj_code": "DEMO-YJ-METFORMIN-500",
            "hot_code": "DEMO-HOT-METFORMIN-500",
            "dosage_form": "錠剤",
            "strength": "500mg",
            "standard_usage_code": "po-bid-after-meals",
            "default_days": "28",
            "pmda_info_url": None,
            "related_problem": "#1 2型糖尿病",
            "allergy_conflict_label": None,
        },
        {
            "id": "amlodipine-5",
            "sort_order": 20,
            "is_active": True,
            "drug_name": "アムロジピンOD錠 5mg",
            "category": "内服",
            "dosage_options": ["1回1錠 1日1回 朝食後"],
            "generic_name": "アムロジピンベシル酸塩",
            "name_kana": "アムロジピンオーディージョウ",
            "aliases": ["アムロジピン", "降圧薬"],
            "yj_code": "DEMO-YJ-AMLODIPINE-5",
            "hot_code": "DEMO-HOT-AMLODIPINE-5",
            "dosage_form": "OD錠",
            "strength": "5mg",
            "standard_usage_code": "po-qd-after-breakfast",
            "default_days": "28",
            "pmda_info_url": None,
            "related_problem": "#2 高血圧症",
            "allergy_conflict_label": None,
        },
        {
            "id": "rosuvastatin-25",
            "sort_order": 30,
            "is_active": True,
            "drug_name": "ロスバスタチン錠 2.5mg",
            "category": "内服",
            "dosage_options": ["1回1錠 1日1回 朝食後"],
            "generic_name": "ロスバスタチンカルシウム",
            "name_kana": "ロスバスタチンジョウ",
            "aliases": ["ロスバスタチン", "脂質異常症薬"],
            "yj_code": "DEMO-YJ-ROSUVASTATIN-25",
            "hot_code": "DEMO-HOT-ROSUVASTATIN-25",
            "dosage_form": "錠剤",
            "strength": "2.5mg",
            "standard_usage_code": "po-qd-after-breakfast",
            "default_days": "28",
            "pmda_info_url": None,
            "related_problem": "#3 脂質異常症",
            "allergy_conflict_label": None,
        },
        {
            "id": "amoxicillin-250",
            "sort_order": 40,
            "is_active": True,
            "drug_name": "アモキシシリンカプセル 250mg",
            "category": "内服",
            "dosage_options": ["1回2カプセル 1日3回 毎食後"],
            "generic_name": "アモキシシリン水和物",
            "name_kana": "アモキシシリンカプセル",
            "aliases": ["アモキシシリン", "抗菌薬"],
            "yj_code": "DEMO-YJ-AMOXICILLIN-250",
            "hot_code": "DEMO-HOT-AMOXICILLIN-250",
            "dosage_form": "カプセル",
            "strength": "250mg",
            "standard_usage_code": "po-tid-after-meals",
            "default_days": "5",
            "pmda_info_url": None,
            "related_problem": None,
            "allergy_conflict_label": "ペニシリンアレルギー",
        },
        {
            "id": "loxoprofen-60",
            "sort_order": 50,
            "is_active": True,
            "drug_name": "ロキソプロフェン錠 60mg",
            "category": "頓服",
            "dosage_options": ["疼痛時 1回1錠 1日3回まで"],
            "generic_name": "ロキソプロフェンナトリウム水和物",
            "name_kana": "ロキソプロフェンジョウ",
            "aliases": ["ロキソニン", "鎮痛薬"],
            "yj_code": "1149019F1560",
            "hot_code": "DEMO-HOT-LOXOPROFEN-60",
            "dosage_form": "錠剤",
            "strength": "60mg",
            "standard_usage_code": "prn-pain-max3",
            "default_days": "7",
            "pmda_info_url": None,
            "related_problem": None,
            "allergy_conflict_label": None,
        },
    ],
    "standard_usage_masters": [
        {
            "id": "po-bid-after-meals",
            "sort_order": 10,
            "is_active": True,
            "label": "内服 朝夕食後",
            "category": "内服",
            "instruction": "1回1錠 1日2回 朝夕食後",
            "default_days": "28",
            "note": "慢性疾患の継続処方向けの基本用法。",
        },
        {
            "id": "po-qd-after-breakfast",
            "sort_order": 20,
            "is_active": True,
            "label": "内服 朝食後 1日1回",
            "category": "内服",
            "instruction": "1回1錠 1日1回 朝食後",
            "default_days": "28",
            "note": "高血圧・脂質異常症などの定期処方向け。",
        },
        {
            "id": "po-tid-after-meals",
            "sort_order": 30,
            "is_active": True,
            "label": "内服 毎食後",
            "category": "内服",
            "instruction": "1回2カプセル 1日3回 毎食後",
            "default_days": "5",
            "note": "急性感染症の短期処方向け。",
        },
        {
            "id": "prn-pain-max3",
            "sort_order": 40,
            "is_active": True,
            "label": "頓服 疼痛時",
            "category": "頓服",
            "instruction": "疼痛時 1回1錠 1日3回まで",
            "default_days": "7",
            "note": "疼痛時の頓服基本用法。",
        },
    ],
    "prescription_sets": [
        {
            "id": "dm-follow-28",
            "sort_order": 10,
            "is_active": True,
            "label": "糖尿病定期フォロー 28日",
            "department": "内科",
            "related_problem": "#1 2型糖尿病",
            "note": "糖尿病定期受診時の継続薬セット。",
            "included_set_ids": [],
            "items": [
                {
                    "drug_id": "metformin-500",
                    "dosage": "1回1錠 1日2回 朝夕食後",
                    "days": "28",
                    "note": "継続薬",
                }
            ],
        },
        {
            "id": "dm-ht-follow-28",
            "sort_order": 20,
            "is_active": True,
            "label": "内科慢性疾患フォロー 28日",
            "department": "内科",
            "related_problem": "#2 高血圧症",
            "note": "糖尿病・高血圧・脂質異常症の定期フォロー向け。",
            "included_set_ids": [],
            "items": [
                {
                    "drug_id": "metformin-500",
                    "dosage": "1回1錠 1日2回 朝夕食後",
                    "days": "28",
                    "note": "糖尿病継続薬",
                },
                {
                    "drug_id": "amlodipine-5",
                    "dosage": "1回1錠 1日1回 朝食後",
                    "days": "28",
                    "note": "降圧薬",
                },
                {
                    "drug_id": "rosuvastatin-25",
                    "dosage": "1回1錠 1日1回 朝食後",
                    "days": "28",
                    "note": "脂質異常症薬",
                },
            ],
        },
        {
            "id": "acute-prn-7",
            "sort_order": 30,
            "is_active": True,
            "label": "疼痛時頓服 7日",
            "department": "総合診療科",
            "related_problem": None,
            "note": "急性症状時の頓服セット。",
            "included_set_ids": [],
            "items": [
                {
                    "drug_id": "loxoprofen-60",
                    "dosage": "疼痛時 1回1錠 1日3回まで",
                    "days": "7",
                    "note": "疼痛時",
                }
            ],
        },
        {
            "id": "metabolic-follow-28",
            "sort_order": 25,
            "is_active": True,
            "label": "代謝内科フォロー複合 28日",
            "department": "内科",
            "related_problem": "#1 2型糖尿病",
            "note": "糖尿病・高血圧・脂質異常症セットを束ねる複合セット。",
            "included_set_ids": ["dm-ht-follow-28"],
            "items": [],
        },
    ],
    "lab_set_options": [
        {
            "id": "dm-follow",
            "sort_order": 10,
            "is_active": True,
            "label": "糖尿病フォローセット",
            "items": ["HbA1c", "血糖", "脂質", "肝機能", "腎機能"],
            "included_set_ids": [],
        },
        {
            "id": "cbc-crp",
            "sort_order": 20,
            "is_active": True,
            "label": "炎症スクリーニング",
            "items": ["CBC", "CRP"],
            "included_set_ids": [],
        },
        {
            "id": "urine-basic",
            "sort_order": 30,
            "is_active": True,
            "label": "尿一般セット",
            "items": ["尿蛋白", "尿糖", "沈渣"],
            "included_set_ids": [],
        },
        {
            "id": "dm-renal-follow",
            "sort_order": 40,
            "is_active": True,
            "label": "糖尿病腎症フォロー複合",
            "items": ["尿アルブミン/Cr"],
            "included_set_ids": ["dm-follow", "urine-basic"],
        },
    ],
    "reservation_slots": [
        {
            "id": "2026-05-11-1000",
            "sort_order": 10,
            "is_active": True,
            "date": "2026/05/11（月）",
            "time": "10:00",
            "department": "内科",
            "doctor": "田中 太郎",
            "state": "available",
        },
        {
            "id": "2026-05-11-1030",
            "sort_order": 20,
            "is_active": True,
            "date": "2026/05/11（月）",
            "time": "10:30",
            "department": "内科",
            "doctor": "田中 太郎",
            "state": "few",
        },
        {
            "id": "2026-05-12-0900",
            "sort_order": 30,
            "is_active": True,
            "date": "2026/05/12（火）",
            "time": "09:00",
            "department": "内科",
            "doctor": "田中 太郎",
            "state": "full",
        },
        {
            "id": "2026-05-18-1000",
            "sort_order": 40,
            "is_active": True,
            "date": "2026/05/18（月）",
            "time": "10:00",
            "department": "内科",
            "doctor": "田中 太郎",
            "state": "available",
        },
    ],
    "chart_templates": [
        {
            "id": "dm-follow-note",
            "sort_order": 10,
            "is_active": True,
            "label": "糖尿病定期フォロー",
            "department": "内科",
            "subjective": "食事療法と運動療法の継続状況を確認。低血糖症状の有無、服薬アドヒアランスを聴取。",
            "objective": "バイタル確認。HbA1c、血糖、体重推移、足病変の有無を確認。",
            "assessment": "糖尿病コントロール推移を評価し、合併症リスクを再確認する。",
            "plan": "内服継続。次回まで食事記録と体重変化をセルフモニタリング。必要時に採血を追加。",
        },
        {
            "id": "ht-follow-note",
            "sort_order": 20,
            "is_active": True,
            "label": "高血圧定期フォロー",
            "department": "内科",
            "subjective": "家庭血圧、めまい、浮腫、服薬継続状況を確認。",
            "objective": "診察室血圧、脈拍、体重、腎機能関連データを確認。",
            "assessment": "降圧目標達成度と副作用の有無を評価する。",
            "plan": "降圧薬継続。家庭血圧を朝夕で記録し、次回持参。生活習慣指導を継続。",
        },
        {
            "id": "uri-acute-note",
            "sort_order": 30,
            "is_active": True,
            "label": "上気道炎初診",
            "department": "総合診療科",
            "subjective": "発熱、咽頭痛、咳嗽、鼻汁、周囲感染者の有無を聴取。",
            "objective": "体温、SpO2、咽頭所見、呼吸音、全身状態を確認。",
            "assessment": "ウイルス性上気道炎を第一に考え、肺炎や細菌感染の所見を除外する。",
            "plan": "対症療法で経過観察。増悪時や呼吸苦出現時は早期再診。必要時に検査追加。",
        },
    ],
}


INPATIENT_PATHWAY_MASTER_DATA = [
    {
        "id": "internal-standard",
        "sort_order": 10,
        "is_active": True,
        "name": "内科標準入院パス",
        "department": "内科",
        "primary_diagnosis": None,
        "expected_days": 7,
        "note": "内科一般入院の初期評価、治療反応、退院支援を標準化するパス。",
        "tasks": [
            {"id": "internal-standard-001", "sort_order": 10, "day_offset": 0, "category": "入院", "title": "入院時評価、持参薬確認、転倒リスク評価", "role": "医師/看護", "due_time": "午前"},
            {"id": "internal-standard-002", "sort_order": 20, "day_offset": 0, "category": "検査", "title": "入院時採血・画像・感染症確認", "role": "医師", "due_time": "午前"},
            {"id": "internal-standard-003", "sort_order": 30, "day_offset": 1, "category": "治療", "title": "初期治療反応と指示内容の再評価", "role": "医師", "due_time": "午前"},
            {"id": "internal-standard-004", "sort_order": 40, "day_offset": 2, "category": "看護", "title": "セルフケア、疼痛、栄養、排泄状況の評価", "role": "看護", "due_time": "午後"},
            {"id": "internal-standard-005", "sort_order": 50, "day_offset": 3, "category": "退院支援", "title": "退院目標、家族説明、地域連携の確認", "role": "MSW/看護", "due_time": "午後"},
            {"id": "internal-standard-006", "sort_order": 60, "day_offset": 5, "category": "退院支援", "title": "退院時処方、指導文書、次回外来の確認", "role": "医師/看護", "due_time": "午前"},
        ],
    },
    {
        "id": "diabetes-education",
        "sort_order": 20,
        "is_active": True,
        "name": "糖尿病教育入院パス",
        "department": "内科",
        "primary_diagnosis": "2型糖尿病",
        "expected_days": 10,
        "note": "糖尿病教育入院の検査、栄養指導、自己注射/自己測定確認を管理するパス。",
        "tasks": [
            {"id": "diabetes-education-001", "sort_order": 10, "day_offset": 0, "category": "入院", "title": "糖尿病教育入院オリエンテーション", "role": "看護", "due_time": "午後"},
            {"id": "diabetes-education-002", "sort_order": 20, "day_offset": 1, "category": "検査", "title": "血糖推移、HbA1c、腎機能、尿検査の確認", "role": "医師", "due_time": "午前"},
            {"id": "diabetes-education-003", "sort_order": 30, "day_offset": 2, "category": "栄養", "title": "管理栄養士による食事指導", "role": "栄養", "due_time": "午後"},
            {"id": "diabetes-education-004", "sort_order": 40, "day_offset": 3, "category": "指導", "title": "低血糖対応とシックデイルール説明", "role": "看護", "due_time": "午後"},
            {"id": "diabetes-education-005", "sort_order": 50, "day_offset": 5, "category": "治療", "title": "退院後薬物療法と自己管理目標の調整", "role": "医師", "due_time": "午前"},
            {"id": "diabetes-education-006", "sort_order": 60, "day_offset": 8, "category": "退院支援", "title": "退院後外来、療養指導、処方確認", "role": "医師/看護", "due_time": "午前"},
        ],
    },
]

RECEIPT_MEDICAL_PRACTICE_MASTER_DATA = [
    {
        "receipt_code": "A000001",
        "name": "入院基本料（候補）",
        "name_kana": "ニュウインキホンリョウ",
        "category": "入院基本料",
        "points": 1000,
        "unit_name": "日",
        "effective_from": "20260401",
        "effective_to": None,
        "source_file": "demo",
    },
    {
        "receipt_code": "B001001",
        "name": "退院時共同指導料・退院支援候補",
        "name_kana": "タイインシエン",
        "category": "退院支援",
        "points": 400,
        "unit_name": "回",
        "effective_from": "20260401",
        "effective_to": None,
        "source_file": "demo",
    },
    {
        "receipt_code": "F000001",
        "name": "退院時処方料候補",
        "name_kana": "タイインジショホウ",
        "category": "投薬",
        "points": 42,
        "unit_name": "回",
        "effective_from": "20260401",
        "effective_to": None,
        "source_file": "demo",
    },
    {
        "receipt_code": "D000001",
        "name": "検体検査実施料候補",
        "name_kana": "ケンタイケンサ",
        "category": "検査",
        "points": 100,
        "unit_name": "回",
        "effective_from": "20260401",
        "effective_to": None,
        "source_file": "demo",
    },
    {
        "receipt_code": "J000001",
        "name": "処置・指導料候補",
        "name_kana": "ショチシドウ",
        "category": "処置/指導",
        "points": 100,
        "unit_name": "回",
        "effective_from": "20260401",
        "effective_to": None,
        "source_file": "demo",
    },
]

INPATIENT_DEMO_DATA = {
    "wards": [
        {
            "id": "ward-5e",
            "sort_order": 10,
            "is_active": True,
            "name": "5東病棟",
            "floor": "5F",
            "department": "内科",
            "note": "内科急性期・糖尿病教育入院。",
        },
        {
            "id": "ward-3w",
            "sort_order": 20,
            "is_active": True,
            "name": "3西病棟",
            "floor": "3F",
            "department": "循環器内科",
            "note": "循環器内科・心不全管理。",
        },
        {
            "id": "ward-icu",
            "sort_order": 30,
            "is_active": True,
            "name": "ICU",
            "floor": "2F",
            "department": "集中治療",
            "note": "重症患者管理。",
        },
    ],
    "beds": [
        {
            "id": "bed-5e-512-a",
            "ward_id": "ward-5e",
            "sort_order": 10,
            "is_active": True,
            "room_number": "512",
            "bed_number": "A",
            "bed_label": "512-A",
            "status": "occupied",
            "note": None,
        },
        {
            "id": "bed-5e-512-b",
            "ward_id": "ward-5e",
            "sort_order": 20,
            "is_active": True,
            "room_number": "512",
            "bed_number": "B",
            "bed_label": "512-B",
            "status": "available",
            "note": None,
        },
        {
            "id": "bed-3w-318-a",
            "ward_id": "ward-3w",
            "sort_order": 30,
            "is_active": True,
            "room_number": "318",
            "bed_number": "A",
            "bed_label": "318-A",
            "status": "occupied",
            "note": None,
        },
        {
            "id": "bed-icu-02",
            "ward_id": "ward-icu",
            "sort_order": 40,
            "is_active": True,
            "room_number": "ICU",
            "bed_number": "02",
            "bed_label": "ICU-02",
            "status": "available",
            "note": "救急受入予備。",
        },
    ],
    "admissions": [
        {
            "patient_id": "0009900040",
            "status": "active",
            "requested_at": datetime(2026, 5, 2, 1, 0, tzinfo=timezone.utc),
            "admitted_at": datetime(2026, 5, 2, 2, 30, tzinfo=timezone.utc),
            "ward_id": "ward-5e",
            "bed_id": "bed-5e-512-a",
            "attending_doctor": "田中 太郎",
            "team": "内科Aチーム",
            "primary_diagnosis": "2型糖尿病 教育入院",
            "care_level": "一般",
            "note": "血糖自己管理と薬剤調整。",
        },
        {
            "patient_id": "0007712301",
            "status": "active",
            "requested_at": datetime(2026, 5, 5, 0, 30, tzinfo=timezone.utc),
            "admitted_at": datetime(2026, 5, 5, 3, 0, tzinfo=timezone.utc),
            "ward_id": "ward-3w",
            "bed_id": "bed-3w-318-a",
            "attending_doctor": "石川 圭介",
            "team": "循環器チーム",
            "primary_diagnosis": "胸部圧迫感 精査入院",
            "care_level": "モニタ管理",
            "note": "心電図・採血フォロー、冠動脈評価予定。",
        },
    ],
    "instructions": [
        {
            "patient_id": "0009900040",
            "category": "測定",
            "title": "血糖 1日4検",
            "status": "pending",
            "due_at": datetime(2026, 5, 8, 12, 0, tzinfo=timezone.utc),
            "created_by": "田中 太郎",
        },
        {
            "patient_id": "0009900040",
            "category": "指導",
            "title": "糖尿病療養指導",
            "status": "pending",
            "due_at": datetime(2026, 5, 9, 1, 0, tzinfo=timezone.utc),
            "created_by": "田中 太郎",
        },
        {
            "patient_id": "0007712301",
            "category": "検査",
            "title": "心電図再検",
            "status": "pending",
            "due_at": datetime(2026, 5, 8, 4, 0, tzinfo=timezone.utc),
            "created_by": "石川 圭介",
        },
    ],
    "nursing_notes": [
        {
            "patient_id": "0009900040",
            "note_type": "SOAP",
            "focus": "血糖自己管理",
            "subjective": "間食を控えたいが夕方に空腹感がある。",
            "objective": "夕食前血糖 168 mg/dL。自己注射手技は見守りで実施可能。",
            "assessment": "退院後の自己管理に向けて反復練習が必要。",
            "plan": "明日も自己注射手技を確認し、低血糖時対応を説明する。",
            "recorded_by": "看護師A",
            "recorded_at": datetime(2026, 5, 8, 1, 15, tzinfo=timezone.utc),
        },
        {
            "patient_id": "0007712301",
            "note_type": "SOAP",
            "focus": "胸部症状",
            "subjective": "安静時の胸部圧迫感は軽快。",
            "objective": "SpO2 98%、血圧 138/82、冷汗なし。",
            "assessment": "症状は落ち着いているが再燃に注意。",
            "plan": "胸痛再燃時は直ちに医師へ報告。モニタ継続。",
            "recorded_by": "看護師B",
            "recorded_at": datetime(2026, 5, 8, 0, 45, tzinfo=timezone.utc),
        },
    ],
}

DIAGNOSIS_MASTER_DATA = [
    {
        "management_number": "DEMO000000000001",
        "change_type": "0",
        "disease_name": "2型糖尿病",
        "disease_name_kana": "ニガタトウニョウビョウ",
        "adoption_level": "1",
        "exchange_code": "DME11",
        "icd10_code": "E11",
        "icd10_subcode": None,
        "claim_code": None,
        "is_deleted": False,
        "updated_at_master": "20260101",
    },
    {
        "management_number": "DEMO000000000002",
        "change_type": "0",
        "disease_name": "高血圧症",
        "disease_name_kana": "コウケツアツショウ",
        "adoption_level": "1",
        "exchange_code": "HTI10",
        "icd10_code": "I10",
        "icd10_subcode": None,
        "claim_code": None,
        "is_deleted": False,
        "updated_at_master": "20260101",
    },
    {
        "management_number": "DEMO000000000003",
        "change_type": "0",
        "disease_name": "脂質異常症",
        "disease_name_kana": "シシツイジョウショウ",
        "adoption_level": "1",
        "exchange_code": "LPE78",
        "icd10_code": "E78.5",
        "icd10_subcode": None,
        "claim_code": None,
        "is_deleted": False,
        "updated_at_master": "20260101",
    },
    {
        "management_number": "DEMO000000000004",
        "change_type": "0",
        "disease_name": "接触皮膚炎",
        "disease_name_kana": "セッショクヒフエン",
        "adoption_level": "1",
        "exchange_code": "CDL25",
        "icd10_code": "L25.9",
        "icd10_subcode": None,
        "claim_code": None,
        "is_deleted": False,
        "updated_at_master": "20260101",
    },
    {
        "management_number": "DEMO000000000005",
        "change_type": "0",
        "disease_name": "アトピー性皮膚炎",
        "disease_name_kana": "アトピーセイヒフエン",
        "adoption_level": "1",
        "exchange_code": "ADL20",
        "icd10_code": "L20.9",
        "icd10_subcode": None,
        "claim_code": None,
        "is_deleted": False,
        "updated_at_master": "20260101",
    },
    {
        "management_number": "DEMO000000000006",
        "change_type": "0",
        "disease_name": "胸部圧迫感",
        "disease_name_kana": "キョウブアッパクカン",
        "adoption_level": "1",
        "exchange_code": "CPR078",
        "icd10_code": "R07.8",
        "icd10_subcode": None,
        "claim_code": None,
        "is_deleted": False,
        "updated_at_master": "20260101",
    },
    {
        "management_number": "DEMO000000000007",
        "change_type": "0",
        "disease_name": "感冒後咳嗽",
        "disease_name_kana": "カンボウゴガイソウ",
        "adoption_level": "1",
        "exchange_code": "CCR05",
        "icd10_code": "R05",
        "icd10_subcode": None,
        "claim_code": None,
        "is_deleted": False,
        "updated_at_master": "20260101",
    },
    {
        "management_number": "DEMO000000000008",
        "change_type": "0",
        "disease_name": "妊娠",
        "disease_name_kana": "ニンシン",
        "adoption_level": "1",
        "exchange_code": "PGZ33",
        "icd10_code": "Z33",
        "icd10_subcode": None,
        "claim_code": None,
        "is_deleted": False,
        "updated_at_master": "20260101",
    },
]


def normalize_diagnosis_name(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip()


PATIENT_WORKSPACE_BY_ID = {
    "0009900040": {
        "profile_items": [
            {"label": "既往歴", "value": "2型糖尿病、高血圧症、脂質異常症"},
            {"label": "生活歴", "value": "朝30分散歩。喫煙歴なし。飲酒は機会飲酒。"},
            {"label": "家族歴", "value": "父に糖尿病、母に高血圧あり。"},
            {"label": "感染症", "value": "特記事項なし"},
            {"label": "服薬アドヒアランス", "value": "概ね良好。飲み忘れは月1回程度。"},
        ],
        "problems": [
            {
                "name": "#1 2型糖尿病",
                "since": "2018/05 〜",
                "status": "active",
                "management_number": "DEMO000000000001",
                "icd10_code": "E11",
                "diagnosis_type": "principal",
            },
            {
                "name": "#2 高血圧症",
                "since": "2019/11 〜",
                "status": "active",
                "management_number": "DEMO000000000002",
                "icd10_code": "I10",
                "diagnosis_type": "secondary",
            },
            {
                "name": "#3 脂質異常症",
                "since": "2020/02 〜",
                "status": "active",
                "management_number": "DEMO000000000003",
                "icd10_code": "E78.5",
                "diagnosis_type": "secondary",
            },
            {"name": "#4 腰椎椎間板ヘルニア", "since": "2025/12 〜 2026/02 (軽快)", "status": "resolved"},
        ],
        "visit_history": [
            {"date": "2026/04/13", "department": "内科", "summary": "定期検診・血糖コントロール", "active": True},
            {"date": "2026/03/16", "department": "内科", "summary": "HbA1c フォロー"},
            {"date": "2026/02/10", "department": "眼科", "summary": "糖尿病性網膜症スクリーニング"},
            {"date": "2026/01/14", "department": "内科", "summary": "血糖・脂質検査"},
            {"date": "2025/12/08", "department": "整形外科", "summary": "腰痛精査"},
        ],
        "vitals": [
            {"label": "血圧", "value": "132 / 78", "unit": "mmHg"},
            {"label": "脈拍", "value": "72", "unit": "bpm"},
            {"label": "体温", "value": "36.4", "unit": "°C"},
            {"label": "SpO2", "value": "98", "unit": "%"},
            {"label": "体重", "value": "52.3", "unit": "kg"},
            {"label": "BMI", "value": "21.8", "unit": ""},
        ],
        "lab_results": [
            {
                "item": "HbA1c",
                "result": "7.2%",
                "baseline": "4.6〜6.2%",
                "previous": "7.5%",
                "flag": "high",
                "reported_at": "2026/04/13",
                "history": [
                    {"date": "2026/01/14", "value": "7.8%", "flag": "high"},
                    {"date": "2026/03/16", "value": "7.5%", "flag": "high"},
                    {"date": "2026/04/13", "value": "7.2%", "flag": "high"},
                ],
            },
            {
                "item": "空腹時血糖",
                "result": "138 mg/dL",
                "baseline": "70〜110 mg/dL",
                "previous": "145 mg/dL",
                "flag": "high",
                "reported_at": "2026/04/13",
                "history": [
                    {"date": "2026/01/14", "value": "152 mg/dL", "flag": "high"},
                    {"date": "2026/03/16", "value": "145 mg/dL", "flag": "high"},
                    {"date": "2026/04/13", "value": "138 mg/dL", "flag": "high"},
                ],
            },
            {
                "item": "LDL-C",
                "result": "118 mg/dL",
                "baseline": "70〜139 mg/dL",
                "previous": "125 mg/dL",
                "flag": "normal",
                "reported_at": "2026/04/13",
                "history": [
                    {"date": "2026/01/14", "value": "132 mg/dL", "flag": "normal"},
                    {"date": "2026/03/16", "value": "125 mg/dL", "flag": "normal"},
                    {"date": "2026/04/13", "value": "118 mg/dL", "flag": "normal"},
                ],
            },
            {
                "item": "HDL-C",
                "result": "55 mg/dL",
                "baseline": "40〜77 mg/dL",
                "previous": "52 mg/dL",
                "flag": "normal",
                "reported_at": "2026/04/13",
                "history": [
                    {"date": "2026/01/14", "value": "49 mg/dL", "flag": "normal"},
                    {"date": "2026/03/16", "value": "52 mg/dL", "flag": "normal"},
                    {"date": "2026/04/13", "value": "55 mg/dL", "flag": "normal"},
                ],
            },
            {
                "item": "AST (GOT)",
                "result": "24 U/L",
                "baseline": "13〜33 U/L",
                "previous": "22 U/L",
                "flag": "normal",
                "reported_at": "2026/04/13",
                "history": [
                    {"date": "2026/01/14", "value": "20 U/L", "flag": "normal"},
                    {"date": "2026/03/16", "value": "22 U/L", "flag": "normal"},
                    {"date": "2026/04/13", "value": "24 U/L", "flag": "normal"},
                ],
            },
            {
                "item": "ALT (GPT)",
                "result": "28 U/L",
                "baseline": "8〜42 U/L",
                "previous": "25 U/L",
                "flag": "normal",
                "reported_at": "2026/04/13",
                "history": [
                    {"date": "2026/01/14", "value": "23 U/L", "flag": "normal"},
                    {"date": "2026/03/16", "value": "25 U/L", "flag": "normal"},
                    {"date": "2026/04/13", "value": "28 U/L", "flag": "normal"},
                ],
            },
            {
                "item": "Cr",
                "result": "0.72 mg/dL",
                "baseline": "0.46〜0.79 mg/dL",
                "previous": "0.70 mg/dL",
                "flag": "normal",
                "reported_at": "2026/04/13",
                "history": [
                    {"date": "2026/01/14", "value": "0.68 mg/dL", "flag": "normal"},
                    {"date": "2026/03/16", "value": "0.70 mg/dL", "flag": "normal"},
                    {"date": "2026/04/13", "value": "0.72 mg/dL", "flag": "normal"},
                ],
            },
            {
                "item": "eGFR",
                "result": "72.5 mL/min",
                "baseline": "≥60 mL/min",
                "previous": "74.1 mL/min",
                "flag": "normal",
                "reported_at": "2026/04/13",
                "history": [
                    {"date": "2026/01/14", "value": "75.2 mL/min", "flag": "normal"},
                    {"date": "2026/03/16", "value": "74.1 mL/min", "flag": "normal"},
                    {"date": "2026/04/13", "value": "72.5 mL/min", "flag": "normal"},
                ],
            },
        ],
        "chart_history": [
            {
                "date": "2026/04/13",
                "department": "内科",
                "title": "定期検診",
                "summary": "HbA1c 改善傾向。メトホルミン継続。1ヶ月後再診。",
            },
            {
                "date": "2026/03/16",
                "department": "内科",
                "title": "糖尿病フォロー",
                "summary": "間食習慣あり。運動開始を提案。採血オーダー実施。",
            },
            {
                "date": "2026/02/10",
                "department": "眼科",
                "title": "眼科連携",
                "summary": "糖尿病性網膜症スクリーニング。明らかな進行所見なし。",
            },
        ],
        "imaging_orders": [
            {
                "category": "胸部X線",
                "status": "scheduled",
                "scheduled_at": "2026/04/14 11:20",
                "note": "慢性咳嗽フォロー。外来撮影予約済み。",
            },
            {
                "category": "腹部エコー",
                "status": "draft",
                "scheduled_at": "未確定",
                "note": "次回予約時に同日実施候補。",
            },
        ],
        "procedure_orders": [
            {
                "title": "生活指導",
                "status": "done",
                "note": "食事療法と散歩継続を説明済み。",
            },
            {
                "title": "フットチェック",
                "status": "planned",
                "note": "次回診察で末梢神経障害評価予定。",
            },
        ],
    },
    "0009900041": {
        "profile_items": [
            {"label": "既往歴", "value": "アトピー性皮膚炎、接触皮膚炎"},
            {"label": "生活歴", "value": "保育士。手洗い回数が多く、洗剤接触が多い。"},
            {"label": "家族歴", "value": "母に気管支喘息。"},
            {"label": "感染症", "value": "特記事項なし"},
            {"label": "服薬アドヒアランス", "value": "外用は休日に塗り忘れあり。"},
        ],
        "problems": [
            {
                "name": "#1 接触皮膚炎",
                "since": "2026/03 〜",
                "status": "active",
                "management_number": "DEMO000000000004",
                "icd10_code": "L25.9",
                "diagnosis_type": "principal",
            },
            {
                "name": "#2 アトピー性皮膚炎",
                "since": "小児期〜",
                "status": "active",
                "management_number": "DEMO000000000005",
                "icd10_code": "L20.9",
                "diagnosis_type": "secondary",
            },
        ],
        "visit_history": [
            {"date": "2026/04/15", "department": "皮膚科", "summary": "湿疹増悪。外用調整", "active": True},
            {"date": "2026/03/25", "department": "皮膚科", "summary": "接触皮膚炎フォロー"},
            {"date": "2026/01/19", "department": "アレルギー科", "summary": "花粉症シーズン前評価"},
        ],
        "vitals": [
            {"label": "血圧", "value": "118 / 72", "unit": "mmHg"},
            {"label": "脈拍", "value": "78", "unit": "bpm"},
            {"label": "体温", "value": "36.8", "unit": "°C"},
            {"label": "SpO2", "value": "99", "unit": "%"},
            {"label": "体重", "value": "53.8", "unit": "kg"},
            {"label": "BMI", "value": "20.7", "unit": ""},
        ],
        "lab_results": [
            {
                "item": "好酸球",
                "result": "4.8%",
                "baseline": "0.0〜6.0%",
                "previous": "5.2%",
                "flag": "normal",
                "reported_at": "2026/04/15",
                "history": [
                    {"date": "2026/01/19", "value": "5.5%", "flag": "normal"},
                    {"date": "2026/03/25", "value": "5.2%", "flag": "normal"},
                    {"date": "2026/04/15", "value": "4.8%", "flag": "normal"},
                ],
            },
            {
                "item": "CRP",
                "result": "0.03 mg/dL",
                "baseline": "0.00〜0.30 mg/dL",
                "previous": "0.04 mg/dL",
                "flag": "normal",
                "reported_at": "2026/04/15",
                "history": [
                    {"date": "2026/01/19", "value": "0.05 mg/dL", "flag": "normal"},
                    {"date": "2026/03/25", "value": "0.04 mg/dL", "flag": "normal"},
                    {"date": "2026/04/15", "value": "0.03 mg/dL", "flag": "normal"},
                ],
            },
            {
                "item": "IgE",
                "result": "188 IU/mL",
                "baseline": "0〜170 IU/mL",
                "previous": "201 IU/mL",
                "flag": "high",
                "reported_at": "2026/04/15",
                "history": [
                    {"date": "2026/01/19", "value": "214 IU/mL", "flag": "high"},
                    {"date": "2026/03/25", "value": "201 IU/mL", "flag": "high"},
                    {"date": "2026/04/15", "value": "188 IU/mL", "flag": "high"},
                ],
            },
        ],
        "chart_history": [
            {
                "date": "2026/04/15",
                "department": "皮膚科",
                "title": "湿疹増悪",
                "summary": "接触皮膚炎再燃。ステロイド外用の強度を見直し。",
            },
            {
                "date": "2026/03/25",
                "department": "皮膚科",
                "title": "初診フォロー",
                "summary": "手洗い回数が多く、保湿指導を実施。",
            },
        ],
        "imaging_orders": [],
        "procedure_orders": [
            {
                "title": "スキンケア指導",
                "status": "done",
                "note": "保湿剤の塗布タイミングを指導。",
            },
        ],
    },
    "0007712301": {
        "profile_items": [
            {"label": "既往歴", "value": "高血圧症、脂質異常症"},
            {"label": "生活歴", "value": "デスクワーク中心。週末にゴルフ。喫煙は10年前に中止。"},
            {"label": "家族歴", "value": "父に心筋梗塞既往あり。"},
            {"label": "感染症", "value": "B型肝炎・C型肝炎とも既往なし"},
            {"label": "服薬アドヒアランス", "value": "朝薬は良好、夜薬の飲み忘れが時々ある。"},
        ],
        "problems": [
            {
                "name": "#1 胸部圧迫感",
                "since": "2026/04 〜",
                "status": "active",
                "management_number": "DEMO000000000006",
                "icd10_code": "R07.8",
                "diagnosis_type": "principal",
            },
            {
                "name": "#2 高血圧症",
                "since": "2021/08 〜",
                "status": "active",
                "management_number": "DEMO000000000002",
                "icd10_code": "I10",
                "diagnosis_type": "secondary",
            },
        ],
        "visit_history": [
            {"date": "2026/04/16", "department": "循環器内科", "summary": "胸部圧迫感で当日受診", "active": True},
            {"date": "2026/03/12", "department": "循環器内科", "summary": "高血圧フォロー"},
            {"date": "2025/12/18", "department": "放射線科", "summary": "冠動脈CT 説明外来"},
        ],
        "vitals": [
            {"label": "血圧", "value": "148 / 92", "unit": "mmHg"},
            {"label": "脈拍", "value": "88", "unit": "bpm"},
            {"label": "体温", "value": "36.2", "unit": "°C"},
            {"label": "SpO2", "value": "97", "unit": "%"},
            {"label": "体重", "value": "74.1", "unit": "kg"},
            {"label": "BMI", "value": "25.0", "unit": ""},
        ],
        "lab_results": [
            {
                "item": "Troponin I",
                "result": "0.011 ng/mL",
                "baseline": "0.000〜0.034 ng/mL",
                "previous": "0.010 ng/mL",
                "flag": "normal",
                "reported_at": "2026/04/16",
                "history": [
                    {"date": "2025/12/18", "value": "0.009 ng/mL", "flag": "normal"},
                    {"date": "2026/03/12", "value": "0.010 ng/mL", "flag": "normal"},
                    {"date": "2026/04/16", "value": "0.011 ng/mL", "flag": "normal"},
                ],
            },
            {
                "item": "BNP",
                "result": "46 pg/mL",
                "baseline": "0〜18.4 pg/mL",
                "previous": "42 pg/mL",
                "flag": "high",
                "reported_at": "2026/04/16",
                "history": [
                    {"date": "2025/12/18", "value": "38 pg/mL", "flag": "high"},
                    {"date": "2026/03/12", "value": "42 pg/mL", "flag": "high"},
                    {"date": "2026/04/16", "value": "46 pg/mL", "flag": "high"},
                ],
            },
            {
                "item": "LDL-C",
                "result": "136 mg/dL",
                "baseline": "70〜139 mg/dL",
                "previous": "142 mg/dL",
                "flag": "normal",
                "reported_at": "2026/04/16",
                "history": [
                    {"date": "2025/12/18", "value": "148 mg/dL", "flag": "high"},
                    {"date": "2026/03/12", "value": "142 mg/dL", "flag": "high"},
                    {"date": "2026/04/16", "value": "136 mg/dL", "flag": "normal"},
                ],
            },
        ],
        "chart_history": [
            {
                "date": "2026/04/16",
                "department": "循環器内科",
                "title": "胸部圧迫感評価",
                "summary": "心電図確認後に追加採血。虚血評価を継続。",
            },
            {
                "date": "2026/03/12",
                "department": "循環器内科",
                "title": "高血圧定期受診",
                "summary": "家庭血圧はやや高値。減塩と内服継続を指示。",
            },
        ],
        "imaging_orders": [
            {
                "category": "心エコー",
                "status": "scheduled",
                "scheduled_at": "2026/04/16 14:00",
                "note": "胸部症状精査として同日実施予定。",
            },
        ],
        "procedure_orders": [
            {
                "title": "心電図説明",
                "status": "done",
                "note": "波形所見と追加検査方針を説明。",
            },
        ],
    },
    "0005520007": {
        "profile_items": [
            {"label": "既往歴", "value": "気管支喘息（小児期）、季節性アレルギー性鼻炎"},
            {"label": "生活歴", "value": "会社員。妊娠中で睡眠不足あり。喫煙歴なし。"},
            {"label": "家族歴", "value": "母に花粉症。"},
            {"label": "感染症", "value": "特記事項なし"},
            {"label": "服薬アドヒアランス", "value": "処方開始直後のため未評価。"},
        ],
        "problems": [
            {
                "name": "#1 感冒後咳嗽",
                "since": "2026/04 〜",
                "status": "active",
                "management_number": "DEMO000000000007",
                "icd10_code": "R05",
                "diagnosis_type": "principal",
            },
            {
                "name": "#2 妊娠",
                "since": "2025/11 〜",
                "status": "active",
                "management_number": "DEMO000000000008",
                "icd10_code": "Z33",
                "diagnosis_type": "secondary",
            },
        ],
        "visit_history": [
            {"date": "2026/04/16", "department": "内科", "summary": "感冒後咳嗽。処方後会計待ち", "active": True},
            {"date": "2026/02/22", "department": "産婦人科", "summary": "妊婦健診 24週"},
            {"date": "2025/12/02", "department": "耳鼻咽喉科", "summary": "アレルギー性鼻炎フォロー"},
        ],
        "vitals": [
            {"label": "血圧", "value": "110 / 66", "unit": "mmHg"},
            {"label": "脈拍", "value": "84", "unit": "bpm"},
            {"label": "体温", "value": "36.7", "unit": "°C"},
            {"label": "SpO2", "value": "98", "unit": "%"},
            {"label": "体重", "value": "49.2", "unit": "kg"},
            {"label": "BMI", "value": "19.6", "unit": ""},
        ],
        "lab_results": [
            {
                "item": "WBC",
                "result": "7,800 /μL",
                "baseline": "3,300〜8,600 /μL",
                "previous": "7,500 /μL",
                "flag": "normal",
                "reported_at": "2026/04/16",
                "history": [
                    {"date": "2025/12/02", "value": "7,200 /μL", "flag": "normal"},
                    {"date": "2026/02/22", "value": "7,500 /μL", "flag": "normal"},
                    {"date": "2026/04/16", "value": "7,800 /μL", "flag": "normal"},
                ],
            },
            {
                "item": "CRP",
                "result": "0.18 mg/dL",
                "baseline": "0.00〜0.30 mg/dL",
                "previous": "0.05 mg/dL",
                "flag": "normal",
                "reported_at": "2026/04/16",
                "history": [
                    {"date": "2025/12/02", "value": "0.04 mg/dL", "flag": "normal"},
                    {"date": "2026/02/22", "value": "0.05 mg/dL", "flag": "normal"},
                    {"date": "2026/04/16", "value": "0.18 mg/dL", "flag": "normal"},
                ],
            },
            {
                "item": "FeNO",
                "result": "27 ppb",
                "baseline": "0〜37 ppb",
                "previous": "31 ppb",
                "flag": "normal",
                "reported_at": "2026/04/16",
                "history": [
                    {"date": "2025/12/02", "value": "35 ppb", "flag": "normal"},
                    {"date": "2026/02/22", "value": "31 ppb", "flag": "normal"},
                    {"date": "2026/04/16", "value": "27 ppb", "flag": "normal"},
                ],
            },
        ],
        "chart_history": [
            {
                "date": "2026/04/16",
                "department": "内科",
                "title": "感冒後咳嗽",
                "summary": "妊娠中のため安全性を確認しつつ鎮咳薬を調整。",
            },
            {
                "date": "2026/02/22",
                "department": "産婦人科",
                "title": "妊婦健診",
                "summary": "経過良好。大きな合併症なし。",
            },
        ],
        "imaging_orders": [],
        "procedure_orders": [
            {
                "title": "吸入指導",
                "status": "planned",
                "note": "必要時に妊娠中でも使える薬剤で説明予定。",
            },
        ],
    },
}


def backfill_patient_workspace(db: Session) -> bool:
    updated = False

    for patient in db.scalars(select(Patient)).all():
        workspace = PATIENT_WORKSPACE_BY_ID.get(patient.id)
        if workspace is None:
            continue

        if not patient.profile_items:
            patient.profile_items = workspace["profile_items"]
            updated = True

        if not patient.problems:
            patient.problems = workspace["problems"]
            updated = True
        else:
            problem_by_name = {
                item["name"]: item
                for item in workspace["problems"]
                if item.get("management_number") or item.get("icd10_code") or item.get("diagnosis_type")
            }
            next_problems = []
            has_problem_metadata_update = False
            for item in patient.problems:
                defaults = problem_by_name.get(item.get("name", ""))
                if defaults is None:
                    next_problems.append(item)
                    continue

                merged = dict(item)
                for field_name in ("management_number", "icd10_code", "diagnosis_type"):
                    if not merged.get(field_name) and defaults.get(field_name):
                        merged[field_name] = defaults[field_name]
                        has_problem_metadata_update = True
                next_problems.append(merged)

            if has_problem_metadata_update:
                patient.problems = next_problems
                updated = True

        if not patient.visit_history:
            patient.visit_history = workspace["visit_history"]
            updated = True

        if not patient.vitals:
            patient.vitals = workspace["vitals"]
            updated = True

        if not patient.lab_results:
            patient.lab_results = workspace["lab_results"]
            updated = True
        else:
            seeded_lab_results = {item["item"]: item for item in workspace["lab_results"]}
            next_lab_results = []
            has_lab_result_update = False
            for item in patient.lab_results:
                defaults = seeded_lab_results.get(item.get("item", ""))
                if defaults is None:
                    next_lab_results.append(item)
                    continue

                merged = dict(item)
                if not merged.get("reported_at") and defaults.get("reported_at"):
                    merged["reported_at"] = defaults["reported_at"]
                    has_lab_result_update = True
                if not merged.get("history") and defaults.get("history"):
                    merged["history"] = defaults["history"]
                    has_lab_result_update = True
                next_lab_results.append(merged)

            if has_lab_result_update:
                patient.lab_results = next_lab_results
                updated = True

        if not patient.chart_history:
            patient.chart_history = workspace["chart_history"]
            updated = True

        if not patient.imaging_orders:
            patient.imaging_orders = workspace["imaging_orders"]
            updated = True

        if not patient.procedure_orders:
            patient.procedure_orders = workspace["procedure_orders"]
            updated = True

    return updated


def sync_chart_order_masters(db: Session) -> bool:
    updated = False

    for item in CHART_ORDER_MASTER_DATA["prescription_catalog"]:
        existing = db.get(PrescriptionCatalogMaster, item["id"])
        if existing is None:
            db.add(PrescriptionCatalogMaster(**item))
            updated = True
            continue

        if (
            existing.sort_order != item["sort_order"]
            or existing.is_active != item["is_active"]
            or existing.drug_name != item["drug_name"]
            or existing.category != item["category"]
            or existing.dosage_options != item["dosage_options"]
            or existing.generic_name != item["generic_name"]
            or existing.name_kana != item["name_kana"]
            or existing.aliases != item["aliases"]
            or existing.yj_code != item["yj_code"]
            or existing.hot_code != item["hot_code"]
            or existing.dosage_form != item["dosage_form"]
            or existing.strength != item["strength"]
            or existing.standard_usage_code != item["standard_usage_code"]
            or existing.default_days != item["default_days"]
            or existing.pmda_info_url != item["pmda_info_url"]
            or existing.related_problem != item["related_problem"]
            or existing.allergy_conflict_label != item["allergy_conflict_label"]
        ):
            existing.sort_order = item["sort_order"]
            existing.is_active = item["is_active"]
            existing.drug_name = item["drug_name"]
            existing.category = item["category"]
            existing.dosage_options = item["dosage_options"]
            existing.generic_name = item["generic_name"]
            existing.name_kana = item["name_kana"]
            existing.aliases = item["aliases"]
            existing.yj_code = item["yj_code"]
            existing.hot_code = item["hot_code"]
            existing.dosage_form = item["dosage_form"]
            existing.strength = item["strength"]
            existing.standard_usage_code = item["standard_usage_code"]
            existing.default_days = item["default_days"]
            existing.pmda_info_url = item["pmda_info_url"]
            existing.related_problem = item["related_problem"]
            existing.allergy_conflict_label = item["allergy_conflict_label"]
            updated = True

    for item in CHART_ORDER_MASTER_DATA["standard_usage_masters"]:
        existing = db.get(StandardUsageMaster, item["id"])
        if existing is None:
            db.add(StandardUsageMaster(**item))
            updated = True
            continue

        if (
            existing.sort_order != item["sort_order"]
            or existing.is_active != item["is_active"]
            or existing.label != item["label"]
            or existing.category != item["category"]
            or existing.instruction != item["instruction"]
            or existing.default_days != item["default_days"]
            or existing.note != item["note"]
        ):
            existing.sort_order = item["sort_order"]
            existing.is_active = item["is_active"]
            existing.label = item["label"]
            existing.category = item["category"]
            existing.instruction = item["instruction"]
            existing.default_days = item["default_days"]
            existing.note = item["note"]
            updated = True

    for item in CHART_ORDER_MASTER_DATA["prescription_sets"]:
        existing = db.get(PrescriptionSetMaster, item["id"])
        if existing is None:
            db.add(PrescriptionSetMaster(**item))
            updated = True
            continue

        if (
            existing.sort_order != item["sort_order"]
            or existing.is_active != item["is_active"]
            or existing.label != item["label"]
            or existing.department != item["department"]
            or existing.related_problem != item["related_problem"]
            or existing.note != item["note"]
            or existing.items != item["items"]
            or existing.included_set_ids != item["included_set_ids"]
        ):
            existing.sort_order = item["sort_order"]
            existing.is_active = item["is_active"]
            existing.label = item["label"]
            existing.department = item["department"]
            existing.related_problem = item["related_problem"]
            existing.note = item["note"]
            existing.items = item["items"]
            existing.included_set_ids = item["included_set_ids"]
            updated = True

    for item in CHART_ORDER_MASTER_DATA["lab_set_options"]:
        existing = db.get(LabSetMaster, item["id"])
        if existing is None:
            db.add(LabSetMaster(**item))
            updated = True
            continue

        if (
            existing.sort_order != item["sort_order"]
            or existing.is_active != item["is_active"]
            or existing.label != item["label"]
            or existing.items != item["items"]
            or existing.included_set_ids != item["included_set_ids"]
        ):
            existing.sort_order = item["sort_order"]
            existing.is_active = item["is_active"]
            existing.label = item["label"]
            existing.items = item["items"]
            existing.included_set_ids = item["included_set_ids"]
            updated = True

    for item in CHART_ORDER_MASTER_DATA["reservation_slots"]:
        existing = db.get(ReservationSlotMaster, item["id"])
        if existing is None:
            db.add(ReservationSlotMaster(**item))
            updated = True
            continue

        if (
            existing.sort_order != item["sort_order"]
            or existing.is_active != item["is_active"]
            or existing.date != item["date"]
            or existing.time != item["time"]
            or existing.department != item["department"]
            or existing.doctor != item["doctor"]
            or existing.state != item["state"]
        ):
            existing.sort_order = item["sort_order"]
            existing.is_active = item["is_active"]
            existing.date = item["date"]
            existing.time = item["time"]
            existing.department = item["department"]
            existing.doctor = item["doctor"]
            existing.state = item["state"]
            updated = True

    for item in CHART_ORDER_MASTER_DATA["chart_templates"]:
        existing = db.get(ChartTemplateMaster, item["id"])
        if existing is None:
            db.add(ChartTemplateMaster(**item))
            updated = True
            continue

        if (
            existing.sort_order != item["sort_order"]
            or existing.is_active != item["is_active"]
            or existing.label != item["label"]
            or existing.department != item["department"]
            or existing.subjective != item["subjective"]
            or existing.objective != item["objective"]
            or existing.assessment != item["assessment"]
            or existing.plan != item["plan"]
        ):
            existing.sort_order = item["sort_order"]
            existing.is_active = item["is_active"]
            existing.label = item["label"]
            existing.department = item["department"]
            existing.subjective = item["subjective"]
            existing.objective = item["objective"]
            existing.assessment = item["assessment"]
            existing.plan = item["plan"]
            updated = True

    return updated


def sync_inpatient_pathway_masters(db: Session) -> bool:
    updated = False

    for item in INPATIENT_PATHWAY_MASTER_DATA:
        tasks = item["tasks"]
        master_payload = {key: value for key, value in item.items() if key != "tasks"}
        existing = db.get(InpatientPathwayMaster, master_payload["id"])
        if existing is None:
            db.add(InpatientPathwayMaster(**master_payload))
            updated = True
        else:
            for key, value in master_payload.items():
                if getattr(existing, key) != value:
                    setattr(existing, key, value)
                    updated = True

        for task in tasks:
            task_payload = {**task, "pathway_master_id": master_payload["id"]}
            existing_task = db.get(InpatientPathwayTaskMaster, task_payload["id"])
            if existing_task is None:
                db.add(InpatientPathwayTaskMaster(**task_payload))
                updated = True
                continue
            for key, value in task_payload.items():
                if getattr(existing_task, key) != value:
                    setattr(existing_task, key, value)
                    updated = True

    return updated


def sync_receipt_medical_practice_masters(db: Session) -> bool:
    updated = False
    for item in RECEIPT_MEDICAL_PRACTICE_MASTER_DATA:
        existing = db.get(ReceiptMedicalPracticeMaster, item["receipt_code"])
        if existing is None:
            db.add(ReceiptMedicalPracticeMaster(**item))
            updated = True
            continue
        for key, value in item.items():
            if getattr(existing, key) != value:
                setattr(existing, key, value)
                updated = True
    return updated


def backfill_demo_prescription_history(db: Session) -> bool:
    updated = False

    orders = db.scalars(
        select(PrescriptionOrder).where(PrescriptionOrder.patient_id == "0009900040")
    ).all()
    if len(orders) == 0:
        return False

    for order in orders:
        target_timestamp = DEMO_PRESCRIPTION_TIMESTAMPS.get((order.patient_id, order.drug_name))
        if target_timestamp is None:
            continue
        if order.created_at != target_timestamp:
            order.created_at = target_timestamp
            updated = True

    return updated


def sync_diagnosis_masters(db: Session) -> bool:
    updated = False
    official_count = db.scalar(
        select(func.count()).select_from(DiagnosisMaster).where(~DiagnosisMaster.management_number.like("DEMO%"))
    )
    if official_count:
        official_rows = db.scalars(
            select(DiagnosisMaster).where(~DiagnosisMaster.management_number.like("DEMO%"))
        ).all()
        official_by_name = {normalize_diagnosis_name(row.disease_name): row for row in official_rows}
        for patient in db.scalars(select(Patient)).all():
            has_patient_update = False
            next_problems = []
            for item in patient.problems:
                management_number = item.get("management_number")
                if management_number and management_number.startswith("DEMO"):
                    disease_name = normalize_diagnosis_name(re.sub(r"^#\d+\s*", "", item.get("name", "")))
                    official = official_by_name.get(disease_name)
                    if official is not None:
                        next_item = dict(item)
                        next_item["management_number"] = official.management_number
                        next_item["icd10_code"] = official.icd10_code
                        next_problems.append(next_item)
                        has_patient_update = True
                        continue
                next_problems.append(item)

            if has_patient_update:
                patient.problems = next_problems
                updated = True

        demo_rows = db.scalars(
            select(DiagnosisMaster).where(DiagnosisMaster.management_number.like("DEMO%"))
        ).all()
        for demo_row in demo_rows:
            db.delete(demo_row)
            updated = True
        return updated

    for item in DIAGNOSIS_MASTER_DATA:
        existing = db.get(DiagnosisMaster, item["management_number"])
        if existing is None:
            db.add(DiagnosisMaster(**item))
            updated = True
            continue

        if any(getattr(existing, key) != value for key, value in item.items() if key != "management_number"):
            for key, value in item.items():
                if key == "management_number":
                    continue
                setattr(existing, key, value)
            updated = True

    return updated


_FHIR_GENDER_MAP = {
    "男性": "male",
    "女性": "female",
    "男": "male",
    "女": "female",
    "その他": "other",
    "不明": "unknown",
}

_FHIR_MRN_SYSTEM = "urn:manta:demo:hospital-mrn"


def _split_japanese_name(value: str | None) -> tuple[str | None, str | None]:
    if not value:
        return None, None
    normalized = value.replace("\u3000", " ").strip()
    if not normalized:
        return None, None
    parts = normalized.split(" ", 1)
    family = parts[0].strip() or None
    given = parts[1].strip() if len(parts) == 2 else None
    return family, given or None


def _parse_birth_date_from_demographics(demographics) -> date | None:
    if not isinstance(demographics, list):
        return None
    for item in demographics:
        if not isinstance(item, dict):
            continue
        label = item.get("label") or ""
        value = item.get("value") or ""
        if "生年月日" not in label or not value:
            continue
        head = value.split()[0].split("(")[0].strip()
        for fmt in ("%Y/%m/%d", "%Y-%m-%d", "%Y.%m.%d"):
            try:
                return datetime.strptime(head, fmt).date()
            except ValueError:
                continue
    return None


def _strip_problem_prefix(name: str) -> str:
    return re.sub(r"^#\d+\s*", "", name or "").strip()


def backfill_observations_from_patient_json(db: Session) -> bool:
    """patients.vitals / patients.lab_results JSON を observations に移送する (Step 3)。

    既にその患者の observations 行がある場合はスキップする (重複挿入しない)。
    """
    from uuid import uuid4

    from .fhir.loinc import (
        INTERPRETATION_MAP,
        LOINC_SYSTEM,
        UCUM_SYSTEM,
        lookup_lab,
        lookup_vital,
        parse_quantity,
    )

    updated = False
    now = datetime.now(timezone.utc)

    for patient in db.scalars(select(Patient)).all():
        has_obs = db.scalar(
            select(func.count(Observation.id)).where(Observation.patient_id == patient.id)
        )
        if has_obs:
            continue

        for vital in patient.vitals or []:
            if not isinstance(vital, dict):
                continue
            label = (vital.get("label") or "").strip()
            if not label:
                continue
            raw_value = vital.get("value")
            value_num, parsed_unit = parse_quantity(raw_value)
            unit = (vital.get("unit") or parsed_unit or "") or None
            coding = lookup_vital(label)
            ucum_code = None
            code_system = code = display = None
            if coding:
                code, display = coding.loinc, coding.display
                code_system = LOINC_SYSTEM
                if not unit and coding.ucum_unit:
                    unit = coding.ucum_unit
                ucum_code = coding.ucum_code
            db.add(
                Observation(
                    id=uuid4().hex,
                    patient_id=patient.id,
                    status="final",
                    category="vital-signs",
                    code_system=code_system,
                    code=code,
                    code_display=display,
                    code_text=label,
                    value_quantity_value=value_num,
                    value_quantity_unit=unit,
                    value_quantity_system=UCUM_SYSTEM if ucum_code else None,
                    value_quantity_code=ucum_code,
                    value_string=raw_value if value_num is None else None,
                    effective_datetime=now,
                    issued_datetime=now,
                )
            )
            updated = True

        for lab in patient.lab_results or []:
            if not isinstance(lab, dict):
                continue
            item = (lab.get("item") or "").strip()
            if not item:
                continue
            coding = lookup_lab(item)
            code = coding.loinc if coding else None
            display = coding.display if coding else None
            reference_range = lab.get("baseline") or None
            history = lab.get("history") or [
                {
                    "date": lab.get("reported_at"),
                    "value": lab.get("result"),
                    "flag": lab.get("flag"),
                }
            ]
            for entry in history:
                if not isinstance(entry, dict):
                    continue
                raw_value = entry.get("value")
                value_num, parsed_unit = parse_quantity(raw_value)
                effective = _parse_jp_date(entry.get("date")) or now
                db.add(
                    Observation(
                        id=uuid4().hex,
                        patient_id=patient.id,
                        status="final",
                        category="laboratory",
                        code_system=LOINC_SYSTEM if code else None,
                        code=code,
                        code_display=display,
                        code_text=item,
                        value_quantity_value=value_num,
                        value_quantity_unit=parsed_unit,
                        value_string=raw_value if value_num is None else None,
                        interpretation_code=INTERPRETATION_MAP.get(
                            (entry.get("flag") or "").strip()
                        ),
                        reference_range_text=reference_range,
                        effective_datetime=effective,
                        issued_datetime=effective,
                    )
                )
                updated = True
    return updated


def _parse_jp_date(raw: str | None) -> datetime | None:
    if not raw:
        return None
    head = raw.split()[0].split("(")[0].strip()
    for fmt in ("%Y/%m/%d", "%Y-%m-%d", "%Y.%m.%d"):
        try:
            return datetime.strptime(head, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def backfill_conditions_from_patient_problems(db: Session) -> bool:
    """patients.problems JSON の内容を conditions テーブルへ反映する (Step 2)。

    既に当該患者の conditions 行がある場合はスキップ (重複挿入しない)。
    旧 JSON はそのまま残し、/api/* のダウンタイムなしで Step 最終まで並走する。
    """
    from uuid import uuid4

    updated = False
    patients_with_problems = db.scalars(select(Patient)).all()
    for patient in patients_with_problems:
        has_conditions = db.scalar(
            select(func.count(Condition.id)).where(Condition.patient_id == patient.id)
        )
        if has_conditions:
            continue
        problems = patient.problems or []
        if not isinstance(problems, list):
            continue
        for problem in problems:
            if not isinstance(problem, dict):
                continue
            raw_name = (problem.get("name") or "").strip()
            if not raw_name:
                continue
            db.add(
                Condition(
                    id=uuid4().hex,
                    patient_id=patient.id,
                    clinical_status=(problem.get("status") or "active").strip() or "active",
                    verification_status="confirmed",
                    category="problem-list-item",
                    icd10_code=problem.get("icd10_code") or None,
                    management_number=problem.get("management_number") or None,
                    disease_name=_strip_problem_prefix(raw_name),
                    onset_text=problem.get("since") or None,
                )
            )
            updated = True
    return updated


def sync_inpatient_demo_data(db: Session) -> bool:
    updated = False

    for item in INPATIENT_DEMO_DATA["wards"]:
        existing = db.get(WardMaster, item["id"])
        if existing is None:
            db.add(WardMaster(**item))
            updated = True
            continue
        for key, value in item.items():
            if getattr(existing, key) != value:
                setattr(existing, key, value)
                updated = True

    db.flush()

    for item in INPATIENT_DEMO_DATA["beds"]:
        existing = db.get(BedMaster, item["id"])
        if existing is None:
            db.add(BedMaster(**item))
            updated = True
            continue
        for key, value in item.items():
            if getattr(existing, key) != value:
                setattr(existing, key, value)
                updated = True

    db.flush()

    admissions_by_patient: dict[str, Admission] = {}
    for item in INPATIENT_DEMO_DATA["admissions"]:
        patient_id = item["patient_id"]
        existing = db.scalar(
            select(Admission).where(
                Admission.patient_id == patient_id,
                Admission.status.in_(["planned", "active", "discharge_permitted"]),
            )
        )
        if existing is None:
            existing = Admission(**item, updated_at=utcnow())
            db.add(existing)
            updated = True
        else:
            for key, value in item.items():
                if getattr(existing, key) != value:
                    setattr(existing, key, value)
                    updated = True
            if updated:
                existing.updated_at = utcnow()
        admissions_by_patient[patient_id] = existing

    db.flush()

    for item in INPATIENT_DEMO_DATA["instructions"]:
        admission = admissions_by_patient.get(item["patient_id"])
        if admission is None:
            continue
        exists = db.scalar(
            select(InpatientInstruction).where(
                InpatientInstruction.admission_id == admission.id,
                InpatientInstruction.title == item["title"],
            )
        )
        if exists is None:
            payload = {key: value for key, value in item.items() if key != "patient_id"}
            db.add(InpatientInstruction(admission_id=admission.id, **payload))
            updated = True

    for item in INPATIENT_DEMO_DATA["nursing_notes"]:
        admission = admissions_by_patient.get(item["patient_id"])
        if admission is None:
            continue
        exists = db.scalar(
            select(NursingNote).where(
                NursingNote.admission_id == admission.id,
                NursingNote.focus == item["focus"],
                NursingNote.recorded_at == item["recorded_at"],
            )
        )
        if exists is None:
            payload = {key: value for key, value in item.items() if key != "patient_id"}
            db.add(NursingNote(admission_id=admission.id, **payload))
            updated = True

    return updated


def backfill_patient_fhir_columns(db: Session) -> bool:
    """新設 FHIR カラムが NULL の Patient 行に対し legacy フィールドから補填する。

    migration 20260419_0010 で既存行は backfill 済みだが、seed 初回投入や
    テストで直接 Patient(...) を生成する経路をカバーするための補助。
    """
    updated = False
    for patient in db.scalars(select(Patient)).all():
        if patient.family_name is None and patient.given_name is None:
            family, given = _split_japanese_name(patient.name)
            patient.family_name = family
            patient.given_name = given
            updated = True
        if patient.family_name_kana is None and patient.given_name_kana is None:
            family_kana, given_kana = _split_japanese_name(patient.kana)
            patient.family_name_kana = family_kana
            patient.given_name_kana = given_kana
            updated = True
        if patient.gender is None:
            patient.gender = _FHIR_GENDER_MAP.get((patient.sex or "").strip(), "unknown")
            updated = True
        if patient.birth_date is None:
            patient.birth_date = _parse_birth_date_from_demographics(patient.demographics)
            if patient.birth_date is not None:
                updated = True
        if not patient.identifier_json:
            patient.identifier_json = [{"system": _FHIR_MRN_SYSTEM, "value": patient.id}]
            updated = True
    return updated


def seed_demo_data(db: Session) -> None:
    existing_users = db.scalars(select(User)).all()
    if existing_users:
        updated = False
        for user in existing_users:
            if password_needs_upgrade(user.password):
                user.password = hash_password(user.password)
                updated = True

        if backfill_patient_workspace(db):
            updated = True

        if backfill_patient_fhir_columns(db):
            updated = True

        if backfill_conditions_from_patient_problems(db):
            updated = True

        if backfill_observations_from_patient_json(db):
            updated = True

        if sync_chart_order_masters(db):
            updated = True

        if sync_inpatient_pathway_masters(db):
            updated = True

        if sync_receipt_medical_practice_masters(db):
            updated = True

        if sync_diagnosis_masters(db):
            updated = True

        if sync_inpatient_demo_data(db):
            updated = True

        if backfill_demo_prescription_history(db):
            updated = True

        if updated:
            db.commit()
        return

    db.add_all(
        [
            User(
                id="dr.tanaka",
                password=hash_password("manta-demo"),
                display_name="田中 太郎",
                department="内科",
                role="医師",
                password_expires_at=date(2026, 6, 30),
            ),
            User(
                id="admin.sato",
                password=hash_password("manta-admin"),
                display_name="佐藤 美紀",
                department="医事課",
                role="管理者",
                password_expires_at=date(2026, 12, 31),
            ),
        ]
    )
    sync_chart_order_masters(db)
    sync_inpatient_pathway_masters(db)
    sync_receipt_medical_practice_masters(db)
    sync_diagnosis_masters(db)

    patients = [
        Patient(
            id="0009900040",
            name="鈴木 花子",
            kana="スズキ ハナコ",
            age="68歳",
            sex="女性",
            department="内科",
            doctor="田中 太郎",
            reception_number="12",
            reservation_time="10:00",
            reception_time="09:42",
            status="診察中",
            elapsed="34分",
            lab_progress="結果到着",
            same_name_duplicate_count=2,
            comment="HbA1c・血糖フォロー。前回処方の継続希望あり。",
            demographics=[
                {"label": "生年月日", "value": "1958/03/15 (68歳)"},
                {"label": "血液型", "value": "A型 Rh(+)"},
                {"label": "身長 / 体重", "value": "155.0cm / 52.3kg"},
                {"label": "保険", "value": "国民健康保険"},
            ],
            alerts=[
                {"label": "ペニシリンアレルギー", "color": "red"},
                {"label": "糖尿病", "color": "yellow"},
            ],
            profile_items=PATIENT_WORKSPACE_BY_ID["0009900040"]["profile_items"],
            problems=PATIENT_WORKSPACE_BY_ID["0009900040"]["problems"],
            visit_history=PATIENT_WORKSPACE_BY_ID["0009900040"]["visit_history"],
            vitals=PATIENT_WORKSPACE_BY_ID["0009900040"]["vitals"],
            lab_results=PATIENT_WORKSPACE_BY_ID["0009900040"]["lab_results"],
            chart_history=PATIENT_WORKSPACE_BY_ID["0009900040"]["chart_history"],
            imaging_orders=PATIENT_WORKSPACE_BY_ID["0009900040"]["imaging_orders"],
            procedure_orders=PATIENT_WORKSPACE_BY_ID["0009900040"]["procedure_orders"],
        ),
        Patient(
            id="0009900041",
            name="鈴木 花子",
            kana="スズキ ハナコ",
            age="41歳",
            sex="女性",
            department="皮膚科",
            doctor="山本 奈緒",
            reception_number="16",
            reservation_time="10:30",
            reception_time="10:11",
            status="来院済",
            elapsed="19分",
            lab_progress="未依頼",
            same_name_duplicate_count=2,
            comment="湿疹悪化。前回外用で改善乏しい。",
            demographics=[
                {"label": "生年月日", "value": "1984/09/22 (41歳)"},
                {"label": "血液型", "value": "O型 Rh(+)"},
                {"label": "身長 / 体重", "value": "161.2cm / 53.8kg"},
                {"label": "保険", "value": "協会けんぽ"},
            ],
            alerts=[{"label": "ラテックス注意", "color": "yellow"}],
            profile_items=PATIENT_WORKSPACE_BY_ID["0009900041"]["profile_items"],
            problems=PATIENT_WORKSPACE_BY_ID["0009900041"]["problems"],
            visit_history=PATIENT_WORKSPACE_BY_ID["0009900041"]["visit_history"],
            vitals=PATIENT_WORKSPACE_BY_ID["0009900041"]["vitals"],
            lab_results=PATIENT_WORKSPACE_BY_ID["0009900041"]["lab_results"],
            chart_history=PATIENT_WORKSPACE_BY_ID["0009900041"]["chart_history"],
            imaging_orders=PATIENT_WORKSPACE_BY_ID["0009900041"]["imaging_orders"],
            procedure_orders=PATIENT_WORKSPACE_BY_ID["0009900041"]["procedure_orders"],
        ),
        Patient(
            id="0007712301",
            name="佐藤 次郎",
            kana="サトウ ジロウ",
            age="57歳",
            sex="男性",
            department="循環器内科",
            doctor="石川 圭介",
            reception_number="08",
            reservation_time="09:30",
            reception_time="09:18",
            status="問診済",
            elapsed="58分",
            lab_progress="一部結果",
            same_name_duplicate_count=1,
            comment="胸部圧迫感あり。心電図後に診察。",
            demographics=[
                {"label": "生年月日", "value": "1968/01/30 (57歳)"},
                {"label": "血液型", "value": "B型 Rh(+)"},
                {"label": "身長 / 体重", "value": "172.0cm / 74.1kg"},
                {"label": "保険", "value": "組合健保"},
            ],
            alerts=[
                {"label": "造影剤副反応歴", "color": "red"},
                {"label": "高血圧", "color": "yellow"},
            ],
            profile_items=PATIENT_WORKSPACE_BY_ID["0007712301"]["profile_items"],
            problems=PATIENT_WORKSPACE_BY_ID["0007712301"]["problems"],
            visit_history=PATIENT_WORKSPACE_BY_ID["0007712301"]["visit_history"],
            vitals=PATIENT_WORKSPACE_BY_ID["0007712301"]["vitals"],
            lab_results=PATIENT_WORKSPACE_BY_ID["0007712301"]["lab_results"],
            chart_history=PATIENT_WORKSPACE_BY_ID["0007712301"]["chart_history"],
            imaging_orders=PATIENT_WORKSPACE_BY_ID["0007712301"]["imaging_orders"],
            procedure_orders=PATIENT_WORKSPACE_BY_ID["0007712301"]["procedure_orders"],
        ),
        Patient(
            id="0005520007",
            name="小林 絵美",
            kana="コバヤシ エミ",
            age="33歳",
            sex="女性",
            department="内科",
            doctor="田中 太郎",
            reception_number="19",
            reservation_time="11:00",
            reception_time="10:47",
            status="診察終了",
            elapsed="12分",
            lab_progress="依頼中",
            same_name_duplicate_count=1,
            comment="感冒後咳嗽。処方後会計待ち。",
            demographics=[
                {"label": "生年月日", "value": "1993/08/19 (33歳)"},
                {"label": "血液型", "value": "AB型 Rh(+)"},
                {"label": "身長 / 体重", "value": "158.4cm / 49.2kg"},
                {"label": "保険", "value": "国民健康保険"},
            ],
            alerts=[{"label": "妊娠中", "color": "orange"}],
            profile_items=PATIENT_WORKSPACE_BY_ID["0005520007"]["profile_items"],
            problems=PATIENT_WORKSPACE_BY_ID["0005520007"]["problems"],
            visit_history=PATIENT_WORKSPACE_BY_ID["0005520007"]["visit_history"],
            vitals=PATIENT_WORKSPACE_BY_ID["0005520007"]["vitals"],
            lab_results=PATIENT_WORKSPACE_BY_ID["0005520007"]["lab_results"],
            chart_history=PATIENT_WORKSPACE_BY_ID["0005520007"]["chart_history"],
            imaging_orders=PATIENT_WORKSPACE_BY_ID["0005520007"]["imaging_orders"],
            procedure_orders=PATIENT_WORKSPACE_BY_ID["0005520007"]["procedure_orders"],
        ),
    ]
    db.add_all(patients)
    db.flush()

    db.add_all(
        [
            ChartNote(
                patient_id="0009900040",
                subjective="特に自覚症状なし。食事療法は継続中。朝の散歩を継続。",
                objective="血圧 132/78 mmHg、HbA1c 7.2%。",
                assessment="#1 2型糖尿病 改善傾向。#2 高血圧症 コントロール良好。",
                plan="メトホルミン継続。1ヶ月後に再診。",
                version=1,
                saved_by="田中 太郎",
            ),
            PrescriptionOrder(
                patient_id="0009900040",
                type="内服",
                days="28日分",
                drug_name="メトホルミン塩酸塩錠 500mg",
                dosage="1回1錠 1日2回 朝夕食後",
                created_at=DEMO_PRESCRIPTION_TIMESTAMPS[("0009900040", "メトホルミン塩酸塩錠 500mg")],
            ),
            PrescriptionOrder(
                patient_id="0009900040",
                type="内服",
                days="28日分",
                drug_name="アムロジピンOD錠 5mg",
                dosage="1回1錠 1日1回 朝食後",
                created_at=DEMO_PRESCRIPTION_TIMESTAMPS[("0009900040", "アムロジピンOD錠 5mg")],
            ),
            LabOrder(
                patient_id="0009900040",
                category="血液検査",
                status="done",
                urgency="通常",
                items=["HbA1c", "血糖", "脂質", "肝機能", "腎機能", "CBC"],
            ),
            Reservation(
                patient_id="0009900040",
                slot_id="2026-05-11-1000",
                scheduled_for="2026/05/11（月） 10:00",
                department="内科",
                doctor="田中 太郎",
                note="HbA1c・血糖フォロー",
            ),
            AuditLog(
                actor="田中 太郎",
                action="初期シード",
                scope="system",
                detail="デモデータを投入しました。",
                patient_id="0009900040",
                patient_name="鈴木 花子",
            ),
        ]
    )

    db.flush()
    backfill_patient_fhir_columns(db)
    backfill_conditions_from_patient_problems(db)
    backfill_observations_from_patient_json(db)
    sync_inpatient_demo_data(db)
    sync_inpatient_pathway_masters(db)
    sync_receipt_medical_practice_masters(db)
    db.commit()
