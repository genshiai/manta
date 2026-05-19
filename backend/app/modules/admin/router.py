from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from ...db import get_db
from ..auth.models import User
from ..common.models import AuditLog
from ..gateway.orca.models import OrcaAdapterSetting
from ..master_data.models import (
    ChartTemplateMaster,
    LabSetMaster,
    PrescriptionCatalogMaster,
    PrescriptionSetMaster,
    ReservationSlotMaster,
    StandardUsageMaster,
)
from ..rececon.models import FacilityClaimRule
from ...security import get_current_user, hash_password, require_role
from ..auth.schemas import UserSummaryRead
from ..auth.services import get_user_or_404, user_to_summary
from ..common.audit import log_audit
from ..common.schemas import AuditLogRead
from ..common.time import utcnow
from ..gateway.orca.client import orca_setting_to_read, test_orca_connection as run_test_orca_connection
from ..gateway.orca.schemas import (
    OrcaAdapterSettingRead,
    OrcaAdapterSettingUpdateRequest,
    OrcaConnectionTestRead,
)
from ..karte.services import (
    get_reservation_slot_counts,
    reservation_slot_to_read,
    resolve_pmda_info_url,
)
from ..master_data.schemas import (
    ChartTemplateCreateRequest,
    ChartTemplateRead,
    ChartTemplateUpdateRequest,
    LabSetOptionCreateRequest,
    LabSetOptionRead,
    LabSetOptionUpdateRequest,
    PrescriptionCatalogItemCreateRequest,
    PrescriptionCatalogItemRead,
    PrescriptionCatalogItemUpdateRequest,
    PrescriptionSetMasterCreateRequest,
    PrescriptionSetMasterRead,
    PrescriptionSetMasterUpdateRequest,
    ReservationSlotCreateRequest,
    ReservationSlotRead,
    ReservationSlotUpdateRequest,
    StandardUsageMasterCreateRequest,
    StandardUsageMasterRead,
    StandardUsageMasterUpdateRequest,
)
from ..master_data.services import (
    get_chart_template_master_or_404,
    get_lab_set_master_or_404,
    get_prescription_catalog_master_or_404,
    get_prescription_set_master_or_404,
    get_reservation_slot_master_or_404,
    get_standard_usage_master_or_404,
)
from ..rececon.schemas import (
    FacilityClaimRuleCreateRequest,
    FacilityClaimRuleRead,
    FacilityClaimRuleUpdateRequest,
)
from ..rececon.services import get_facility_claim_rule_or_404
from .schemas import UserCreateRequest, UserPasswordResetRequest, UserUpdateRequest


router = APIRouter()


@router.get("/api/admin/claim-rules", response_model=list[FacilityClaimRuleRead])
def list_facility_claim_rules(
    _: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> list[FacilityClaimRuleRead]:
    return [
        FacilityClaimRuleRead.model_validate(rule)
        for rule in db.scalars(
            select(FacilityClaimRule).order_by(FacilityClaimRule.sort_order, FacilityClaimRule.id)
        ).all()
    ]


@router.post("/api/admin/claim-rules", response_model=FacilityClaimRuleRead, status_code=status.HTTP_201_CREATED)
def create_facility_claim_rule(
    payload: FacilityClaimRuleCreateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> FacilityClaimRuleRead:
    if db.get(FacilityClaimRule, payload.id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Facility claim rule already exists")
    rule = FacilityClaimRule(**payload.model_dump())
    db.add(rule)
    log_audit(
        db,
        actor=current_user.display_name,
        action="施設別算定ルール作成",
        scope="system",
        detail=f"算定ルール {payload.id} / {payload.message} を作成しました。",
    )
    db.commit()
    db.refresh(rule)
    return FacilityClaimRuleRead.model_validate(rule)


@router.patch("/api/admin/claim-rules/{rule_id}", response_model=FacilityClaimRuleRead)
def update_facility_claim_rule(
    rule_id: str,
    payload: FacilityClaimRuleUpdateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> FacilityClaimRuleRead:
    rule = get_facility_claim_rule_or_404(db, rule_id)
    for key, value in payload.model_dump().items():
        setattr(rule, key, value)
    rule.updated_at = utcnow()
    log_audit(
        db,
        actor=current_user.display_name,
        action="施設別算定ルール更新",
        scope="system",
        detail=f"算定ルール {rule_id} を更新しました。",
    )
    db.commit()
    db.refresh(rule)
    return FacilityClaimRuleRead.model_validate(rule)


@router.get("/api/admin/claim-rules/export", response_model=dict[str, object])
def export_facility_claim_rules(
    _: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    rules = db.scalars(select(FacilityClaimRule).order_by(FacilityClaimRule.sort_order, FacilityClaimRule.id)).all()
    return {
        "format": "manta-facility-claim-rules-v1",
        "exported_at": utcnow().isoformat(),
        "rules": [FacilityClaimRuleRead.model_validate(rule).model_dump(mode="json") for rule in rules],
    }


@router.post("/api/admin/claim-rules/import", response_model=list[FacilityClaimRuleRead])
def import_facility_claim_rules(
    payload: dict[str, object] = Body(...),
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> list[FacilityClaimRuleRead]:
    raw_rules = payload.get("rules")
    if not isinstance(raw_rules, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="rules array is required")
    imported: list[FacilityClaimRule] = []
    for raw_rule in raw_rules:
        if not isinstance(raw_rule, dict):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="rule must be object")
        request = FacilityClaimRuleCreateRequest.model_validate(raw_rule)
        rule = db.get(FacilityClaimRule, request.id)
        if rule is None:
            rule = FacilityClaimRule(**request.model_dump())
            db.add(rule)
        else:
            for key, value in request.model_dump().items():
                setattr(rule, key, value)
            rule.updated_at = utcnow()
        imported.append(rule)
    log_audit(
        db,
        actor=current_user.display_name,
        action="施設別算定ルールimport",
        scope="system",
        detail=f"算定ルール {len(imported)}件を import しました。",
    )
    db.commit()
    return [FacilityClaimRuleRead.model_validate(rule) for rule in imported]


@router.get("/api/admin/orca/settings", response_model=OrcaAdapterSettingRead)
def get_orca_adapter_setting(
    _: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> OrcaAdapterSettingRead:
    setting = db.get(OrcaAdapterSetting, "default")
    if setting is None:
        setting = OrcaAdapterSetting(id="default", mode="mock", claim_endpoint="/api01rv2/claim")
        db.add(setting)
        db.commit()
        db.refresh(setting)
    return orca_setting_to_read(setting)


@router.put("/api/admin/orca/settings", response_model=OrcaAdapterSettingRead)
def update_orca_adapter_setting(
    payload: OrcaAdapterSettingUpdateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> OrcaAdapterSettingRead:
    setting = db.get(OrcaAdapterSetting, "default")
    if setting is None:
        setting = OrcaAdapterSetting(id="default")
        db.add(setting)
    values = payload.model_dump()
    password = values.pop("password", None)
    for key, value in values.items():
        setattr(setting, key, value)
    if password is not None:
        setting.password_secret = password or None
    setting.updated_by = current_user.display_name
    setting.updated_at = utcnow()
    log_audit(
        db,
        actor=current_user.display_name,
        action="ORCA接続設定更新",
        scope="system",
        detail=f"ORCA adapter setting を {payload.mode} で更新しました。",
    )
    db.commit()
    db.refresh(setting)
    return orca_setting_to_read(setting)


@router.post("/api/admin/orca/test-connection", response_model=OrcaConnectionTestRead)
def test_orca_connection(
    _: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> OrcaConnectionTestRead:
    return run_test_orca_connection(db)


@router.post(
    "/api/admin/masters/prescription-catalog",
    response_model=PrescriptionCatalogItemRead,
    status_code=status.HTTP_201_CREATED,
)
def create_prescription_catalog_item(
    payload: PrescriptionCatalogItemCreateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> PrescriptionCatalogItemRead:
    if db.get(PrescriptionCatalogMaster, payload.id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Prescription catalog already exists")

    master = PrescriptionCatalogMaster(
        id=payload.id,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
        drug_name=payload.drug_name,
        category=payload.category,
        dosage_options=payload.dosage_options,
        generic_name=payload.generic_name,
        name_kana=payload.name_kana,
        aliases=payload.aliases,
        yj_code=payload.yj_code,
        hot_code=payload.hot_code,
        dosage_form=payload.dosage_form,
        strength=payload.strength,
        standard_usage_code=payload.standard_usage_code,
        default_days=payload.default_days,
        pmda_info_url=resolve_pmda_info_url(payload.pmda_info_url, payload.yj_code),
        allergy_conflict_label=payload.allergy_conflict_label,
        related_problem=payload.related_problem,
        manufacturer=payload.manufacturer,
        drug_price=payload.drug_price,
        generic_reimbursement_flag=payload.generic_reimbursement_flag,
        brand_flag=payload.brand_flag,
        has_generic=payload.has_generic,
        transitional_expiry=payload.transitional_expiry,
        source_note=payload.source_note,
    )
    db.add(master)
    log_audit(
        db,
        actor=current_user.display_name,
        action="処方候補作成",
        scope="system",
        detail=f"処方候補 {payload.id} / {payload.drug_name} を作成しました。",
    )
    db.commit()
    db.refresh(master)
    return PrescriptionCatalogItemRead.model_validate(master)


@router.patch("/api/admin/masters/prescription-catalog/{master_id}", response_model=PrescriptionCatalogItemRead)
def update_prescription_catalog_item(
    master_id: str,
    payload: PrescriptionCatalogItemUpdateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> PrescriptionCatalogItemRead:
    master = get_prescription_catalog_master_or_404(db, master_id)
    master.sort_order = payload.sort_order
    master.is_active = payload.is_active
    master.drug_name = payload.drug_name
    master.category = payload.category
    master.dosage_options = payload.dosage_options
    master.generic_name = payload.generic_name
    master.name_kana = payload.name_kana
    master.aliases = payload.aliases
    master.yj_code = payload.yj_code
    master.hot_code = payload.hot_code
    master.dosage_form = payload.dosage_form
    master.strength = payload.strength
    master.standard_usage_code = payload.standard_usage_code
    master.default_days = payload.default_days
    master.pmda_info_url = resolve_pmda_info_url(payload.pmda_info_url, payload.yj_code)
    master.allergy_conflict_label = payload.allergy_conflict_label
    master.related_problem = payload.related_problem
    master.manufacturer = payload.manufacturer
    master.drug_price = payload.drug_price
    master.generic_reimbursement_flag = payload.generic_reimbursement_flag
    master.brand_flag = payload.brand_flag
    master.has_generic = payload.has_generic
    master.transitional_expiry = payload.transitional_expiry
    master.source_note = payload.source_note
    log_audit(
        db,
        actor=current_user.display_name,
        action="処方候補更新",
        scope="system",
        detail=f"処方候補 {master_id} を更新しました。",
    )
    db.commit()
    db.refresh(master)
    return PrescriptionCatalogItemRead.model_validate(master)


@router.post("/api/admin/masters/standard-usages", response_model=StandardUsageMasterRead, status_code=status.HTTP_201_CREATED)
def create_standard_usage(
    payload: StandardUsageMasterCreateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> StandardUsageMasterRead:
    if db.get(StandardUsageMaster, payload.id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Standard usage already exists")

    master = StandardUsageMaster(
        id=payload.id,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
        label=payload.label,
        category=payload.category,
        instruction=payload.instruction,
        default_days=payload.default_days,
        note=payload.note,
    )
    db.add(master)
    log_audit(
        db,
        actor=current_user.display_name,
        action="標準用法作成",
        scope="system",
        detail=f"標準用法 {payload.id} / {payload.label} を作成しました。",
    )
    db.commit()
    db.refresh(master)
    return StandardUsageMasterRead.model_validate(master)


@router.patch("/api/admin/masters/standard-usages/{master_id}", response_model=StandardUsageMasterRead)
def update_standard_usage(
    master_id: str,
    payload: StandardUsageMasterUpdateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> StandardUsageMasterRead:
    master = get_standard_usage_master_or_404(db, master_id)
    master.sort_order = payload.sort_order
    master.is_active = payload.is_active
    master.label = payload.label
    master.category = payload.category
    master.instruction = payload.instruction
    master.default_days = payload.default_days
    master.note = payload.note
    log_audit(
        db,
        actor=current_user.display_name,
        action="標準用法更新",
        scope="system",
        detail=f"標準用法 {master_id} を更新しました。",
    )
    db.commit()
    db.refresh(master)
    return StandardUsageMasterRead.model_validate(master)


@router.post("/api/admin/masters/prescription-sets", response_model=PrescriptionSetMasterRead, status_code=status.HTTP_201_CREATED)
def create_prescription_set(
    payload: PrescriptionSetMasterCreateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> PrescriptionSetMasterRead:
    if db.get(PrescriptionSetMaster, payload.id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Prescription set already exists")

    master = PrescriptionSetMaster(
        id=payload.id,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
        label=payload.label,
        department=payload.department,
        related_problem=payload.related_problem,
        note=payload.note,
        items=[item.model_dump() for item in payload.items],
        included_set_ids=payload.included_set_ids,
    )
    db.add(master)
    log_audit(
        db,
        actor=current_user.display_name,
        action="処方セット作成",
        scope="system",
        detail=f"処方セット {payload.id} / {payload.label} を作成しました。",
    )
    db.commit()
    db.refresh(master)
    return PrescriptionSetMasterRead.model_validate(master)


@router.patch("/api/admin/masters/prescription-sets/{master_id}", response_model=PrescriptionSetMasterRead)
def update_prescription_set(
    master_id: str,
    payload: PrescriptionSetMasterUpdateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> PrescriptionSetMasterRead:
    master = get_prescription_set_master_or_404(db, master_id)
    master.sort_order = payload.sort_order
    master.is_active = payload.is_active
    master.label = payload.label
    master.department = payload.department
    master.related_problem = payload.related_problem
    master.note = payload.note
    master.items = [item.model_dump() for item in payload.items]
    master.included_set_ids = payload.included_set_ids
    log_audit(
        db,
        actor=current_user.display_name,
        action="処方セット更新",
        scope="system",
        detail=f"処方セット {master_id} を更新しました。",
    )
    db.commit()
    db.refresh(master)
    return PrescriptionSetMasterRead.model_validate(master)


@router.post("/api/admin/masters/lab-sets", response_model=LabSetOptionRead, status_code=status.HTTP_201_CREATED)
def create_lab_set(
    payload: LabSetOptionCreateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> LabSetOptionRead:
    if db.get(LabSetMaster, payload.id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Lab set already exists")

    master = LabSetMaster(
        id=payload.id,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
        label=payload.label,
        items=payload.items,
        included_set_ids=payload.included_set_ids,
    )
    db.add(master)
    log_audit(
        db,
        actor=current_user.display_name,
        action="検査セット作成",
        scope="system",
        detail=f"検査セット {payload.id} / {payload.label} を作成しました。",
    )
    db.commit()
    db.refresh(master)
    return LabSetOptionRead.model_validate(master)


@router.patch("/api/admin/masters/lab-sets/{master_id}", response_model=LabSetOptionRead)
def update_lab_set(
    master_id: str,
    payload: LabSetOptionUpdateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> LabSetOptionRead:
    master = get_lab_set_master_or_404(db, master_id)
    master.sort_order = payload.sort_order
    master.is_active = payload.is_active
    master.label = payload.label
    master.items = payload.items
    master.included_set_ids = payload.included_set_ids
    log_audit(
        db,
        actor=current_user.display_name,
        action="検査セット更新",
        scope="system",
        detail=f"検査セット {master_id} を更新しました。",
    )
    db.commit()
    db.refresh(master)
    return LabSetOptionRead.model_validate(master)


@router.post(
    "/api/admin/masters/reservation-slots",
    response_model=ReservationSlotRead,
    status_code=status.HTTP_201_CREATED,
)
def create_reservation_slot(
    payload: ReservationSlotCreateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> ReservationSlotRead:
    if db.get(ReservationSlotMaster, payload.id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Reservation slot already exists")

    master = ReservationSlotMaster(
        id=payload.id,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
        date=payload.date,
        time=payload.time,
        department=payload.department,
        doctor=payload.doctor,
        state=payload.state,
        capacity=max(payload.capacity, 0),
    )
    db.add(master)
    log_audit(
        db,
        actor=current_user.display_name,
        action="予約枠作成",
        scope="system",
        detail=f"予約枠 {payload.id} / {payload.date} {payload.time} を作成しました。",
    )
    db.commit()
    db.refresh(master)
    return reservation_slot_to_read(master)


@router.patch("/api/admin/masters/reservation-slots/{master_id}", response_model=ReservationSlotRead)
def update_reservation_slot(
    master_id: str,
    payload: ReservationSlotUpdateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> ReservationSlotRead:
    master = get_reservation_slot_master_or_404(db, master_id)
    master.sort_order = payload.sort_order
    master.is_active = payload.is_active
    master.date = payload.date
    master.time = payload.time
    master.department = payload.department
    master.doctor = payload.doctor
    master.state = payload.state
    master.capacity = max(payload.capacity, 0)
    log_audit(
        db,
        actor=current_user.display_name,
        action="予約枠更新",
        scope="system",
        detail=f"予約枠 {master_id} を更新しました。",
    )
    db.commit()
    db.refresh(master)
    booked_count = get_reservation_slot_counts(db, [master.id]).get(master.id, 0)
    return reservation_slot_to_read(master, booked_count=booked_count)


@router.post("/api/admin/masters/chart-templates", response_model=ChartTemplateRead, status_code=status.HTTP_201_CREATED)
def create_chart_template(
    payload: ChartTemplateCreateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> ChartTemplateRead:
    if db.get(ChartTemplateMaster, payload.id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Chart template already exists")

    master = ChartTemplateMaster(
        id=payload.id,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
        label=payload.label,
        department=payload.department,
        subjective=payload.subjective,
        objective=payload.objective,
        assessment=payload.assessment,
        plan=payload.plan,
    )
    db.add(master)
    log_audit(
        db,
        actor=current_user.display_name,
        action="カルテテンプレート作成",
        scope="system",
        detail=f"カルテテンプレート {payload.id} / {payload.label} を作成しました。",
    )
    db.commit()
    db.refresh(master)
    return ChartTemplateRead.model_validate(master)


@router.patch("/api/admin/masters/chart-templates/{master_id}", response_model=ChartTemplateRead)
def update_chart_template(
    master_id: str,
    payload: ChartTemplateUpdateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> ChartTemplateRead:
    master = get_chart_template_master_or_404(db, master_id)
    master.sort_order = payload.sort_order
    master.is_active = payload.is_active
    master.label = payload.label
    master.department = payload.department
    master.subjective = payload.subjective
    master.objective = payload.objective
    master.assessment = payload.assessment
    master.plan = payload.plan
    log_audit(
        db,
        actor=current_user.display_name,
        action="カルテテンプレート更新",
        scope="system",
        detail=f"カルテテンプレート {master_id} を更新しました。",
    )
    db.commit()
    db.refresh(master)
    return ChartTemplateRead.model_validate(master)


@router.get("/api/admin/users", response_model=list[UserSummaryRead])
def list_users(
    _: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> list[UserSummaryRead]:
    users = db.scalars(select(User).order_by(User.department, User.display_name)).all()
    return [user_to_summary(user) for user in users]


@router.post("/api/admin/users", response_model=UserSummaryRead, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> UserSummaryRead:
    if db.get(User, payload.user_id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")

    user = User(
        id=payload.user_id,
        password=hash_password(payload.password),
        display_name=payload.display_name,
        department=payload.department,
        role=payload.role,
        password_expires_at=payload.password_expires_at,
    )
    db.add(user)
    log_audit(
        db,
        actor=current_user.display_name,
        action="利用者作成",
        scope="system",
        detail=f"利用者 {payload.user_id} / {payload.role} / {payload.department} を作成しました。",
    )
    db.commit()
    return user_to_summary(user)


@router.patch("/api/admin/users/{user_id}", response_model=UserSummaryRead)
def update_user(
    user_id: str,
    payload: UserUpdateRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> UserSummaryRead:
    user = get_user_or_404(db, user_id)
    user.display_name = payload.display_name
    user.department = payload.department
    user.role = payload.role
    user.password_expires_at = payload.password_expires_at
    log_audit(
        db,
        actor=current_user.display_name,
        action="利用者更新",
        scope="system",
        detail=f"利用者 {user_id} の所属・権限・有効期限を更新しました。",
    )
    db.commit()
    db.refresh(user)
    return user_to_summary(user)


@router.post("/api/admin/users/{user_id}/reset-password")
def reset_user_password(
    user_id: str,
    payload: UserPasswordResetRequest,
    current_user: User = Depends(require_role("管理者")),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    user = get_user_or_404(db, user_id)
    user.password = hash_password(payload.password)
    log_audit(
        db,
        actor=current_user.display_name,
        action="パスワード再設定",
        scope="system",
        detail=f"利用者 {user_id} のパスワードを再設定しました。",
    )
    db.commit()
    return {"user_id": user_id, "status": "updated"}


@router.get("/api/audit-logs", response_model=list[AuditLogRead])
def list_audit_logs(
    limit: int = Query(default=20, le=100),
    scope: str | None = Query(default=None),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AuditLogRead]:
    query = select(AuditLog).order_by(desc(AuditLog.created_at))
    if scope:
        query = query.where(AuditLog.scope == scope)
    return db.scalars(query.limit(limit)).all()
