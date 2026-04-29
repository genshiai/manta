# FHIR 移行計画 / FHIR Migration Plan

Manta を HL7 FHIR R4 / JP Core 準拠にするための移行計画。

---

## 1. 目的

- **相互運用性の確保**: 電子処方箋、電子カルテ情報共有サービス（EHR共有）、地域医療連携、マイナ保険証連携などと接続可能にする
- **国策準拠**: 厚労省「医療DX推進本部」が標準規格として HL7 FHIR JP Core を指定している流れに沿う
- **ベンダーロックイン回避**: 標準形式で出入りするデータ基盤を持つことで、将来の移行や統合の自由度を担保
- **AI / 分析基盤の入口を標準化**: FHIR で揃っていれば学習データも分析データも作りやすい

---

## 2. 基本方針（3行）

1. **FHIR は API 境界の規格である**。DB スキーマの規格ではない。
2. **内部は普通のリレーショナル DB**、外部は FHIR JSON。境界で変換する。
3. **全部いっぺんに作らない**。Patient → Condition → Observation → ... の順で1リソースずつ通す。

---

## 3. アーキテクチャ方針

```
┌──────────────────────────────────────────────────┐
│ 外部システム                                       │
│ (電子処方箋 / EHR共有 / 地域連携 / PHR / AI基盤)    │
└────────────────┬─────────────────────────────────┘
                 │ FHIR JSON (application/fhir+json)
                 ▼
┌──────────────────────────────────────────────────┐
│ [api/fhir/]  FHIR Router                         │
│   GET  /fhir/Patient/{id}                        │
│   POST /fhir/Patient                             │
│   GET  /fhir/metadata  (CapabilityStatement)     │
│   ...                                            │
└────────────────┬─────────────────────────────────┘
                 │ Pydantic (fhir.resources.R4)
                 ▼
┌──────────────────────────────────────────────────┐
│ [application/] ユースケース                       │
│   GetPatient / RegisterPatient / ...             │
└────────────────┬─────────────────────────────────┘
                 │ ドメインオブジェクト
                 ▼
┌──────────────────────────────────────────────────┐
│ [infrastructure/fhir/]  Mapper 層                │
│   patient_to_fhir(row)  ⇔  fhir_to_patient(res)  │
│   condition_to_fhir(row) ⇔ ...                   │
└────────────────┬─────────────────────────────────┘
                 │ SQLAlchemy モデル
                 ▼
┌──────────────────────────────────────────────────┐
│ [infrastructure/database/]  PostgreSQL           │
│   patients / conditions / observations /         │
│   encounters / medication_requests / ...         │
└──────────────────────────────────────────────────┘
```

内部 ORM モデルは **FHIR の "概念" には沿わせるが、"ツリー構造" は再現しない**。CodeableConcept / Coding は文字列カラム + マスター参照に展開する。

---

## 4. 技術選定

| 役割 | 採用 | 理由 |
|---|---|---|
| FHIR Pydantic モデル | [`fhir.resources`](https://pypi.org/project/fhir.resources/) R4 | Pydantic v2 完全対応、HL7 FHIR R4 全リソース定義済み、型チェック強力 |
| JP Core プロファイル検証 | 自作バリデーター（独自 Pydantic validator） | `fhir.resources` は base R4 のみ。JP Core 固有の必須項目は [`docs/requirements/`](requirements/) 配下に定義と検証を置く |
| FHIR Search 実装 | FastAPI + SQLAlchemy フィルタ | 最低限 `_id / subject / patient / code / date` をサポート |
| CapabilityStatement 生成 | 手書き（YAML → Pydantic） | リソース追加時に書き足す運用。自動生成はやりすぎ |
| JSON ContentType | `application/fhir+json` | FHIR 規格準拠。通常 REST の `application/json` と併存 |

**JP Core 定義の参照先**: `../iryodx/docs/hl7fhir/definitions.json/` に JP Core v1.x の全 StructureDefinition / ValueSet / CodeSystem がある。バリデーターの根拠として読み込む。

---

## 5. 実装パターン（コード例）

### 5.1 ディレクトリ配置（[ARCHITECTURE.md](first/ARCHITECTURE.md) の4層構造に準拠）

```
backend/app/
├── domain/
│   └── patient/
│       ├── models.py          # Patient ドメインオブジェクト（内部表現）
│       └── rules.py           # 年齢計算、氏名整形等の純粋関数
├── application/
│   ├── get_patient.py         # ユースケース
│   └── register_patient.py
├── infrastructure/
│   ├── database/
│   │   ├── orm/
│   │   │   └── patient.py     # SQLAlchemy モデル
│   │   └── repositories/
│   │       └── patient.py     # CRUD
│   └── fhir/
│       ├── mappers/
│       │   ├── patient.py     # Pydantic(FHIR) ⇔ ドメイン ⇔ ORM
│       │   ├── condition.py
│       │   └── observation.py
│       ├── validators/
│       │   └── jp_core.py     # JP Core 必須項目の検証
│       └── capability_statement.py
└── api/
    ├── internal/              # 既存の独自 API はここに退避
    │   └── patients.py
    └── fhir/                  # FHIR 準拠 API
        ├── patient.py
        ├── condition.py
        └── metadata.py
```

### 5.2 Mapper の具体例（Patient）

```python
# infrastructure/fhir/mappers/patient.py
from datetime import date
from fhir.resources.R4B.patient import Patient as FhirPatient
from fhir.resources.R4B.humanname import HumanName
from fhir.resources.R4B.identifier import Identifier
from app.infrastructure.database.orm.patient import PatientRow


def orm_to_fhir(row: PatientRow) -> FhirPatient:
    return FhirPatient(
        id=row.id,
        identifier=[
            Identifier(
                system="http://jpfhir.jp/fhir/core/IdSystem/insurance-card-number",
                value=row.insurance_number,
            ),
            Identifier(
                system=f"urn:oid:{row.hospital_oid}",  # 院内ID
                value=row.medical_record_number,
            ),
        ],
        name=[
            HumanName(use="official", family=row.family_name, given=[row.given_name]),
            HumanName(use="usual",    family=row.family_name_kana, given=[row.given_name_kana]),
        ],
        gender=row.gender,          # "male" | "female" | "other" | "unknown"
        birthDate=row.birth_date,   # date 型
        active=row.is_active,
    )


def fhir_to_orm(fhir_patient: FhirPatient) -> PatientRow:
    official = next((n for n in fhir_patient.name if n.use == "official"), None)
    kana     = next((n for n in fhir_patient.name if n.use == "usual"),    None)
    insurance = next(
        (i for i in (fhir_patient.identifier or []) if "insurance" in (i.system or "")),
        None,
    )
    return PatientRow(
        id=fhir_patient.id,
        family_name=official.family if official else "",
        given_name=(official.given[0] if official and official.given else ""),
        family_name_kana=kana.family if kana else "",
        given_name_kana=(kana.given[0] if kana and kana.given else ""),
        gender=fhir_patient.gender,
        birth_date=fhir_patient.birthDate,
        insurance_number=insurance.value if insurance else None,
        is_active=fhir_patient.active if fhir_patient.active is not None else True,
    )
```

### 5.3 FHIR ルーター例

```python
# api/fhir/patient.py
from fastapi import APIRouter, Depends, Response
from fhir.resources.R4B.patient import Patient as FhirPatient
from app.infrastructure.database.repositories.patient import PatientRepo
from app.infrastructure.fhir.mappers.patient import orm_to_fhir, fhir_to_orm
from app.infrastructure.fhir.validators.jp_core import validate_jp_patient

router = APIRouter(prefix="/fhir", tags=["fhir"])
FHIR_JSON = "application/fhir+json"


@router.get("/Patient/{patient_id}")
def read_patient(patient_id: str, repo: PatientRepo = Depends()):
    row = repo.get_or_404(patient_id)
    resource = orm_to_fhir(row)
    return Response(
        content=resource.model_dump_json(exclude_none=True),
        media_type=FHIR_JSON,
    )


@router.post("/Patient", status_code=201)
def create_patient(payload: dict, repo: PatientRepo = Depends()):
    resource = FhirPatient.model_validate(payload)   # FHIR 構造検証
    validate_jp_patient(resource)                    # JP Core 必須項目検証
    row = fhir_to_orm(resource)
    saved = repo.create(row)
    return Response(
        content=orm_to_fhir(saved).model_dump_json(exclude_none=True),
        media_type=FHIR_JSON,
        status_code=201,
    )
```

### 5.4 JP Core 検証例

```python
# infrastructure/fhir/validators/jp_core.py
from fhir.resources.R4B.patient import Patient
from fastapi import HTTPException


def validate_jp_patient(p: Patient) -> None:
    """JP Core Patient プロファイル必須項目の検証"""
    if not p.identifier or len(p.identifier) == 0:
        raise HTTPException(422, "JP Core: Patient.identifier は必須 (保険証番号など)")
    for ident in p.identifier:
        if not ident.system or not ident.value:
            raise HTTPException(422, "JP Core: identifier は system + value のペア必須")

    if not p.name or len(p.name) == 0:
        raise HTTPException(422, "JP Core: Patient.name は必須")
    has_official = any(n.use == "official" for n in p.name)
    if not has_official:
        raise HTTPException(422, "JP Core: 漢字氏名 (use=official) が必要")
```

---

## 6. リソースマッピング（現行 → FHIR）

| 現行（[backend/app/models.py](../backend/app/models.py)） | FHIR リソース | 備考 |
|---|---|---|
| `Patient.name / kana` | `Patient.name[]` (HumanName × 2) | `use: official` = 漢字、`use: usual` = カナ |
| `Patient.age: str` | `Patient.birthDate` | `age` は廃止、誕生日から計算 |
| `Patient.sex: str` | `Patient.gender` | Enum 化: male/female/other/unknown |
| `Patient.reception_number` | `Encounter.identifier` | Patient から剥がす |
| `Patient.reservation_time` | `Appointment.start` | Patient から剥がす |
| `Patient.status` | `Encounter.status` | Patient から剥がす |
| `Patient.elapsed / lab_progress` | （破棄 / UI 計算） | DB に持たない |
| `Patient.demographics / alerts / profile_items` | `Patient.extension` または `Observation` | 項目次第。JP Core 拡張で対応 |
| `Patient.problems: JSON` | `Condition` テーブル新設 | ICD10 コードを `Condition.code.coding` に |
| `Patient.visit_history` | `Encounter` | Phase 1 は read adapter、Phase 2 でテーブル新設 |
| `Patient.vitals: JSON` | `Observation` テーブル新設 | LOINC コード、`category=vital-signs` |
| `Patient.lab_results: JSON` | `Observation` + `DiagnosticReport` | 個別値は Observation、報告書は DiagnosticReport |
| `Patient.chart_history` | `Composition` | SOAP ノートは FHIR では Composition |
| `Patient.imaging_orders` | `ServiceRequest` + `ImagingStudy` | |
| `Patient.procedure_orders` | `ServiceRequest` + `Procedure` | |
| `ChartNote` (SOAP) | `Composition` + `DocumentReference` | 本文は Composition、添付は DocumentReference |
| `PrescriptionOrder` | `MedicationRequest` | HOT コード + Rp番号/剤グループ連番 |
| `LabOrder` | `ServiceRequest` | category=laboratory |
| `Reservation` | `Appointment` | |
| `PrescriptionCatalogMaster` | `Medication` (masterdata) | 既存の HOT/YJ はそのまま使える |
| `DiagnosisMaster` (ICD10) | `CodeSystem` / `ValueSet` 参照 | MEDIS-DC のまま、FHIR は参照するだけ |

---

## 7. DB 再設計（骨子）

### 変更後のテーブル構成

```
patients
  id (PK)
  identifier_json           -- Identifier[] を JSONB で持つ（保険証/院内/マイナ等）
  family_name, given_name
  family_name_kana, given_name_kana
  gender                    -- 'male' | 'female' | 'other' | 'unknown'
  birth_date                -- DATE 型
  is_active
  created_at, updated_at

encounters                  -- 新設
  id (PK)
  patient_id (FK)
  status                    -- FHIR Encounter.status
  class_code                -- AMB / IMP / EMER / HH
  service_type
  period_start, period_end
  reception_number

conditions                  -- 新設（旧 patients.problems を分離）
  id (PK)
  patient_id (FK)
  encounter_id (FK, nullable)
  icd10_code
  disease_name
  clinical_status           -- active/resolved...
  verification_status       -- confirmed/provisional...
  category                  -- problem-list-item | encounter-diagnosis
  onset_date, abatement_date
  recorded_date

observations                -- 新設（旧 vitals / lab_results を分離）
  id (PK)
  patient_id (FK)
  encounter_id (FK, nullable)
  status                    -- final/preliminary...
  category                  -- vital-signs | laboratory | ...
  loinc_code
  code_display
  value_quantity_numeric
  value_quantity_unit
  value_codeable_text
  effective_datetime
  issued_datetime

medication_requests         -- 新設（旧 prescription_orders）
  id (PK)
  patient_id (FK)
  encounter_id (FK)
  medication_hot_code
  medication_yj_code
  rp_number                 -- JP Core 必須
  rp_group_index            -- JP Core 必須
  prescription_id
  status, intent
  authored_on
  dosage_json               -- Dosage[] を JSONB（JP Core 拡張多数のため）
  substitution_allowed

appointments                -- 新設（旧 reservations）
  id (PK)
  patient_id (FK)
  start_datetime, end_datetime
  status
  slot_id

audit_logs                  -- 既存そのまま（FHIR AuditEvent と将来マッピング）
```

既存の `PrescriptionCatalogMaster / DiagnosisMaster / LabSetMaster / ReservationSlotMaster / StandardUsageMaster` はマスター系なのでそのまま維持。FHIR 的には `Medication` / `CodeSystem` 参照として使う。

---

## 8. 実行フェーズ

### Step 0: 読み取り変換層を Phase 1 内に先行導入（非破壊）

Phase 2 本編に入る前に、**既存コード・DB・`/api/*` を一切壊さずに** FHIR 変換層の足場を作る。目的は以下。

- 「FHIR 境界はあくまでアダプタ層である」という本計画の基本方針（§2, §3）を、コード上の物理境界として先に確立する
- 外部連携（電子処方箋・EHR共有・地域連携・PHR・AI基盤）接続の着手時期を、DB 再設計完了まで待たずに前倒しする
- `fhir.resources` の型モデル・JSON 出力・`application/fhir+json` contentType を実運用で確認しておき、Step 1 以降の DB 再設計を据えた書き込み対応でつまずかない

やること:

- [x] `fhir.resources` 依存追加（R4B を採用。§10 の未決 #1 を R4B 側に確定）
- [x] `backend/app/fhir/` パッケージ新設（`main.py` / `models.py` / `/api/*` に手を入れない）
- [x] `app/fhir/mappers/patient.py` — 既存 `Patient` ORM を best-effort で `FhirPatient` に変換（`name` の単一文字列を空白で家族名/名前に分割、`sex` を FHIR gender に写像、`demographics` JSON から `birthDate` を抽出）
- [x] `app/fhir/capability_statement.py` — 最小 CapabilityStatement（`kind=instance`, `fhirVersion=4.0.1`, `Patient.read` のみ）
- [x] `app/fhir/router.py` — `GET /fhir/metadata` / `GET /fhir/Patient/{id}` のみ
- [x] `main.py` から `include_router` で組み込み
- [x] ラウンドトリップ・404・CapabilityStatement のテスト

やらないこと（Step 1 以降に回す）:

- `POST /fhir/Patient` / `PUT /fhir/Patient/{id}`（書き込みは Step 1 で DB にカラム足してから）
- `patients` テーブル再設計（既存スキーマのまま読み取りだけ写像）
- `app/` の4層アーキ分割（1リソース書く時に当該範囲だけ切り出す）
- JP Core 厳格バリデーション（読み取り側は現 DB 不足分を厳格強制できないため）

### Step 1: Patient を JP Core 必須項目に寄せる（書き込み対応）

- [x] `patients` に `birth_date / gender / family_name / given_name / family_name_kana / given_name_kana / identifier_json` を**追加**（既存 `age / sex / name / kana` は並走。後で剥がす）
- [x] Alembic マイグレーション + バックフィル（既存 demo データの `name` / `demographics` から抽出 / `alembic/versions/20260419_0010_patient_fhir_columns.py`）
- [x] mapper を新カラム参照に差し替え、Step 0 の best-effort ロジックは fallback として残置
- [x] `POST /fhir/Patient` / `PUT /fhir/Patient/{id}`
- [x] JP Core Patient バリデーター（identifier + name.official 必須。`app/fhir/validators/jp_core.py`）
- [x] 既存 `/api/patients/*` は触らない（書き込み経路で legacy name/kana/sex を双方向同期）

### Step 2: Condition（病名）

- [x] `conditions` テーブル新設 + `patients.problems` JSON からバックフィル（`alembic/versions/20260419_0011_conditions_table.py`）
- [x] `Condition` ORM モデル + `seed.backfill_conditions_from_patient_problems` で初回投入経路もカバー
- [x] mapper（`app/fhir/mappers/condition.py`）— ICD10 (`http://hl7.org/fhir/sid/icd-10`) と MEDIS-DC 病名管理番号 (`urn:oid:1.2.392.200119.4.101.5`) を CodeableConcept.coding に展開、`onset_date` / `onset_text` を `onsetDateTime` / `onsetString` に振り分け
- [x] JP Core バリデーター（subject/clinicalStatus/code 必須、subject は `Patient/{id}` 形式）
- [x] ルーター
  - `GET  /fhir/Condition/{id}`
  - `GET  /fhir/Condition?patient=<id>`（`subject=Patient/<id>` も受容。searchset Bundle で返却）
  - `POST /fhir/Condition`
  - `PUT  /fhir/Condition/{id}`
- [x] CapabilityStatement に Condition (read/create/update/search-type + searchParam: patient/subject) 追加
- [x] 旧 `patients.problems` JSON は温存（/api/* 継続動作）

### Step 3: Observation（バイタル + 検体検査）

- [x] `observations` テーブル新設 + `patients.vitals` / `patients.lab_results` JSON からバックフィル（`alembic/versions/20260419_0012_observations_table.py`）
  - vital-signs: 1 label = 1 Observation 行、LOINC + UCUM を自動付与
  - laboratory: `history[]` の各エントリ = 1 Observation 行（時系列を保持）
- [x] `Observation` ORM モデル（vital-signs / laboratory を共通テーブルで）
- [x] Japanese label → LOINC / UCUM ルックアップ（`app/fhir/loinc.py`）— 脈拍 / 体温 / SpO2 / 体重 / 身長 / BMI / HbA1c / 空腹時血糖 / LDL-C / HDL-C / AST / ALT / γ-GTP / クレアチニン / eGFR / CBC 一式
- [x] `seed.backfill_observations_from_patient_json` で初回投入経路もカバー
- [x] mapper（`app/fhir/mappers/observation.py`）— `valueQuantity` / `valueString`（血圧等の複合値）/ `interpretation` (H/L/N/HH/LL) / `referenceRange.text` 対応。`Decimal` を float に通さず精度を維持
- [x] JP Core バリデーター（subject/status/code/value[x] いずれか必須）
- [x] ルーター
  - `GET  /fhir/Observation/{id}`
  - `GET  /fhir/Observation?patient=&subject=&category=&code=&date=` — `code` は `system|code` 形式を受容、`date` は `ge/le/eq/gt/lt` prefix 対応、複数 date で範囲指定（searchset Bundle）
  - `POST /fhir/Observation`
  - `PUT  /fhir/Observation/{id}`
- [x] CapabilityStatement に Observation (read/create/update/search-type + searchParam: patient/subject/category/code/date) 追加
- [x] 旧 `patients.vitals` / `patients.lab_results` JSON は温存（/api/* 継続動作）

**残課題**: 血圧 (LOINC 85354-9) は Step 3 では `valueString` で暫定保持。Observation.component (systolic 8480-6 / diastolic 8462-4) への分解は Step 4 以降で実施する。

### Step 4: MedicationRequest（処方）

- [x] 既存 `prescription_orders` を正本のまま使い、FHIR 境界で MedicationRequest に変換
  - Phase 1 では DB 破壊的変更を避けるため、`medication_requests` 新テーブルは作らない
  - Step 6 以降で Encounter 関連、Rp番号 / 剤グループ連番 / 一包化等を持つ正規化テーブルへ移行する
- [x] mapper（`app/fhir/mappers/medication_request.py`）
  - `PrescriptionOrder.drug_name` → `MedicationRequest.medicationCodeableConcept.text`
  - `PrescriptionCatalogMaster.hot_code` → `JP_MedicationCodeHOT13_CS`
  - `PrescriptionCatalogMaster.yj_code` → `JP_MedicationCodeYJ_CS`
  - `PrescriptionOrder.dosage` → `dosageInstruction.text`
  - `PrescriptionOrder.days` → `dispenseRequest.expectedSupplyDuration`
- [x] JP Core バリデーター
  - `subject` / `status` / `intent` / `medicationCodeableConcept` / `dosageInstruction` を Phase 1 必須として検査
- [x] ルーター
  - `GET  /fhir/MedicationRequest/{id}`
  - `GET  /fhir/MedicationRequest?patient=&subject=&code=&authoredon=`
  - `POST /fhir/MedicationRequest`
  - `PUT  /fhir/MedicationRequest/{id}`
- [x] CapabilityStatement に MedicationRequest を追加
- [x] preview reverse proxy / smoke test に `/fhir/*` を追加

**残課題**: JP Core の処方詳細では Rp番号、剤グループ連番、投与経路、JAMI 標準用法、電子処方箋向け情報が重要。Phase 1 では既存処方 UI の export/import を優先し、正規化は Step 5 で行う。

### Step 5: Appointment（再診予約）

- [x] 既存 `reservations` を正本のまま使い、FHIR 境界で Appointment に変換
- [x] mapper（`app/fhir/mappers/appointment.py`）
  - `Reservation.scheduled_for` → `Appointment.start / end`
  - `Reservation.patient_id` → `Appointment.participant.actor = Patient/{id}`
  - `Reservation.department` → `Appointment.serviceType.text`
  - `Reservation.slot_id` → `Appointment.slot`
  - `Reservation.note` → `Appointment.comment`
- [x] JP Core バリデーター
  - `status` / `start` / Patient participant を Phase 1 必須として検査
- [x] ルーター
  - `GET  /fhir/Appointment/{id}`
  - `GET  /fhir/Appointment?patient=&actor=&date=`
  - `POST /fhir/Appointment`
  - `PUT  /fhir/Appointment/{id}`
- [x] CapabilityStatement に Appointment を追加

**残課題**: 現行 `reservations.patient_id` は unique なので、Phase 1 は「患者ごとの次回予約 1 件」を表す。複数予約、検査予約、日未定予約、予約キャンセル理由は予約テーブル正規化時に拡張する。

### Step 6: Encounter（受診履歴）

- [x] Phase 1 read adapter として、既存 `patients.visit_history` JSON を Encounter に変換
  - DB 破壊的変更を避けるため、`encounters` 新テーブルは Phase 2 に回す
  - `active: true` の受診履歴は `Encounter.status=in-progress`、それ以外は `finished`
  - `Encounter.class` は外来を表す `AMB`
  - `department` は `serviceType.text`、`summary` は `type.text` に写像
- [x] ルーター
  - `GET  /fhir/Encounter/{id}`
  - `GET  /fhir/Encounter?patient=&subject=&date=`
- [x] CapabilityStatement に Encounter (read/search-type + searchParam: patient/subject/date) を追加
- [x] preview smoke test に `/fhir/Encounter?patient=` を追加

**残課題**: Phase 2 では `encounters` テーブルを新設し、受付番号、来院状態、診療科、担当者、期間、予約/カルテ/オーダとの関連を正規化する。POST/PUT はその時点で追加する。

### Step 7: Composition（SOAP / 診療録）

- [x] Phase 1 read adapter として、既存 `chart_notes` を Composition に変換
  - `subjective / objective / assessment / plan` を `Composition.section` の S/O/A/P に写像
  - `type` は LOINC `11506-3` (Progress note)
  - `subject` は `Patient/{id}`、`date` は `saved_at`、`author` は `saved_by`
- [x] ルーター
  - `GET  /fhir/Composition/{id}`
  - `GET  /fhir/Composition?patient=&subject=&date=`
- [x] CapabilityStatement に Composition (read/search-type + searchParam: patient/subject/date) を追加
- [x] preview smoke test に `/fhir/Composition?patient=` を追加

**残課題**: 文書添付、署名、真正性、外部文書 URI は `DocumentReference` / `Binary` / 監査連携で扱う。SOAP の POST/PUT を FHIR 側から受けるかは、内部 `/api/*` のカルテ保存責務と衝突しないよう Phase 2 で判断する。

### Step 8: ServiceRequest（検査 / 画像 / 処置オーダ）

- [x] Phase 2 入口の read adapter として、既存オーダを ServiceRequest に変換
  - `lab_orders` は `category=laboratory`、`code.text=category`、`orderDetail[]` に検査項目を写像
  - `patients.imaging_orders` JSON は `category=imaging`、`code.text=category`、`occurrenceDateTime` に予定日時を写像
  - `patients.procedure_orders` JSON は `category=procedure`、`code.text=title` に写像
  - 書き込みは既存 `/api/patients/{id}/lab-orders` / imaging / procedure API を正本として維持
- [x] ルーター
  - `GET  /fhir/ServiceRequest/{id}`
  - `GET  /fhir/ServiceRequest?patient=&subject=&category=&code=&authored=&occurrence=`
- [x] CapabilityStatement に ServiceRequest (read/search-type + searchParam: patient/subject/category/code/authored/occurrence) を追加
- [x] preview smoke test に `/fhir/ServiceRequest?patient=` を追加

**残課題**: Phase 2 では画像・処置オーダも JSON から正規化テーブルに分離し、FHIR POST/PUT を受けるか判断する。

### Step 9: DiagnosticReport（検査結果レポート）

- [x] Phase 2 入口の read adapter として、既存 `patients.lab_results` を DiagnosticReport に変換
  - `reported_at` ごとにレポートを束ねる
  - `code` は LOINC `11502-2` (Laboratory report)
  - 同日の Observation を `result[]` に参照し、異常項目を `conclusion` に要約する
- [x] ルーター
  - `GET  /fhir/DiagnosticReport/{id}`
  - `GET  /fhir/DiagnosticReport?patient=&subject=&category=&code=&date=`
- [x] CapabilityStatement に DiagnosticReport (read/search-type + searchParam: patient/subject/category/code/date) を追加
- [x] preview smoke test に `/fhir/DiagnosticReport?patient=` を追加

**残課題**: 現時点では `patients.lab_results` の現在スナップショットをレポート化している。長期履歴のレポート正本、`presentedForm`、PDF/外部帳票、検査部門連携は Phase 2 後半で詰める。

### Step 10 以降: 1リソース = 1 PR

DocumentReference の順。各ステップで当該リソース分だけ以下を行う:

1. ORM テーブル新設 + Alembic
2. 既存 JSON 列からのバックフィル（`patients.problems` は Step 2、`prescription_orders` は Step 4、`reservations` は Step 5 で済）
3. mapper（`app/fhir/mappers/{resource}.py`）
4. ルーター（`GET/POST/PUT /fhir/{Resource}` + search）
5. JP Core バリデーター
6. 既存 `/api/*` は当面残置

### Step 最終: Bundle / Search / CapabilityStatement 完成

- [ ] Search Parameter (`_id / subject / patient / code / date / _lastUpdated`)
- [ ] `Bundle` endpoint（batch 先行、transaction は §10 未決 #6 の結論次第）
- [ ] CapabilityStatement を完成形で公開
- [ ] JP Core v1.x 自動検証を CI に組み込み
- [ ] `/api/*` を内部用途限定の判断（§10 未決 #3）に沿って段階廃止 or 残置を決定

---

## 9. JP Core 準拠の扱い

「JP Core 準拠」を名乗る条件は、v1.x StructureDefinition の **必須項目 (`min: 1`)** と **mustSupport** を満たすこと。

検証方針：

1. **構造検証**: `fhir.resources` が base R4 を型で保証
2. **JP Core 固有検証**: `infrastructure/fhir/validators/jp_core.py` に関数を置き、各エンドポイントで呼ぶ
3. **定義根拠**: `../iryodx/docs/hl7fhir/definitions.json/StructureDefinition-jp-*.json` を参照（必要なら manta に複製）
4. **CapabilityStatement**: `instantiates` や `implementationGuide` に JP Core v1.x の URL を記載

---

## 10. 未決事項

- [x] **fhir.resources R4 vs R4B**: **R4B 採用**。JP Core v1.x の Patient/Condition/Observation/MedicationRequest はいずれも R4B 側でも構造互換（差分は `CompositionX` 等の一部リソースのみ）で、かつ `fhir.resources` の `R4B` サブパッケージがメンテ対象として継続している
- [ ] **JP Core 定義ファイルの置き場所**: `../iryodx/` を参照か、`backend/app/infrastructure/fhir/jp_core/` にコピーするか
- [ ] **既存 `/api/*` エンドポイントの扱い**: Step 0-1 の間は温存。Step 最終で段階廃止 or 内部用残置を判断
- [ ] **Search の粒度**: 最小セットで始めるが、将来 `_include / _revinclude` まで広げるか
- [ ] **SMART on FHIR（OAuth2 拡張）対応**: Phase 3 以降で検討
- [ ] **Bundle transaction の範囲**: batch のみ先行、transaction は後回しでよいか

---

## 11. 参考

- [HL7 FHIR R4 仕様](https://hl7.org/fhir/R4/)
- [JP Core Implementation Guide v1.x](https://jami-fhir-jp-wg.github.io/jp-core-v1xpages/jpcore-r4/develop/index.html)
- [fhir.resources (Pydantic FHIR)](https://github.com/nazrulworld/fhir.resources)
- [iryodx 内の JP Core 定義](../../iryodx/docs/hl7fhir/) — StructureDefinition / ValueSet / CodeSystem
- [HAPI FHIR](https://hapifhir.io/) — Java 実装参考
- [Medplum](https://www.medplum.com/) — TypeScript 実装参考（アーキ参考）
- 厚労省 医療DX推進本部 — FHIR を標準規格として指定
- [ARCHITECTURE.md](first/ARCHITECTURE.md) — Manta 全体アーキテクチャ
- [Plan.md](Plan.md) — Phase 2 に「FHIR R4 基盤」を記載
