"""Back-compat re-export shim.

SQLAlchemy models live in `app.modules.<domain>.models`. This module re-exports
them so existing imports (`from app.models import X`) continue to work and so
all model classes are registered on `Base.metadata` at import time.
"""

from __future__ import annotations

from .modules.auth.models import User
from .modules.common.models import AuditLog, utcnow
from .modules.gateway.orca.models import OrcaAdapterSetting
from .modules.inpatient.models import (
    Admission,
    BedMaster,
    InpatientAiSummaryReview,
    InpatientDischargePlan,
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
from .modules.karte.models import (
    ChartNote,
    Condition,
    LabOrder,
    Observation,
    Patient,
    PrescriptionOrder,
    Reservation,
)
from .modules.master_data.models import (
    ChartTemplateMaster,
    DiagnosisAliasMaster,
    DiagnosisMaster,
    HotDrugCodeMapping,
    LabSetMaster,
    PmdaDrugInteraction,
    PmdaDrugInteractionMatch,
    PmdaPackageInsertSection,
    PrescriptionCatalogMaster,
    PrescriptionSetMaster,
    ReceiptDrugMaster,
    ReceiptLongTermListedDrug,
    ReceiptMedicalPracticeMaster,
    ReceiptTransitionalDrug,
    ReservationSlotMaster,
    StandardUsageMaster,
)
from .modules.rececon.models import (
    ClaimDraft,
    ClaimDraftLine,
    ClaimLineAdjustment,
    ClaimReviewIssue,
    ClaimTransmission,
    FacilityClaimRule,
)

__all__ = [
    "Admission",
    "AuditLog",
    "BedMaster",
    "ChartNote",
    "ChartTemplateMaster",
    "ClaimDraft",
    "ClaimDraftLine",
    "ClaimLineAdjustment",
    "ClaimReviewIssue",
    "ClaimTransmission",
    "Condition",
    "DiagnosisAliasMaster",
    "DiagnosisMaster",
    "FacilityClaimRule",
    "HotDrugCodeMapping",
    "InpatientAiSummaryReview",
    "InpatientDischargePlan",
    "InpatientDocument",
    "InpatientEvent",
    "InpatientInstruction",
    "InpatientPathwayAssignment",
    "InpatientPathwayMaster",
    "InpatientPathwayTask",
    "InpatientPathwayTaskMaster",
    "LabOrder",
    "LabSetMaster",
    "NursingNote",
    "Observation",
    "OrcaAdapterSetting",
    "Patient",
    "PmdaDrugInteraction",
    "PmdaDrugInteractionMatch",
    "PmdaPackageInsertSection",
    "PrescriptionCatalogMaster",
    "PrescriptionOrder",
    "PrescriptionSetMaster",
    "ReceiptDrugMaster",
    "ReceiptLongTermListedDrug",
    "ReceiptMedicalPracticeMaster",
    "ReceiptTransitionalDrug",
    "Reservation",
    "ReservationSlotMaster",
    "StandardUsageMaster",
    "User",
    "WardMaster",
    "utcnow",
]
