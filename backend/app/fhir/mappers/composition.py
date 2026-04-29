from __future__ import annotations

from html import escape

from fhir.resources.R4B.codeableconcept import CodeableConcept
from fhir.resources.R4B.coding import Coding
from fhir.resources.R4B.composition import Composition, CompositionSection
from fhir.resources.R4B.identifier import Identifier
from fhir.resources.R4B.narrative import Narrative
from fhir.resources.R4B.reference import Reference

from app.models import ChartNote, Patient


COMPOSITION_IDENTIFIER_SYSTEM = "https://manta.local/fhir/identifier/composition"
LOINC_SYSTEM = "http://loinc.org"
PROGRESS_NOTE_CODE = "11506-3"


def _section(title: str, text: str) -> CompositionSection:
    escaped = escape(text or "")
    return CompositionSection(
        title=title,
        code=CodeableConcept(text=title),
        text=Narrative(
            status="generated",
            div=f'<div xmlns="http://www.w3.org/1999/xhtml"><p>{escaped}</p></div>',
        ),
    )


def orm_to_fhir(note: ChartNote, *, patient: Patient | None = None) -> Composition:
    composition_id = str(note.id)
    patient_name = patient.name if patient else None
    return Composition(
        id=composition_id,
        identifier=Identifier(
            system=COMPOSITION_IDENTIFIER_SYSTEM,
            value=composition_id,
        ),
        status="final",
        type=CodeableConcept(
            coding=[
                Coding(
                    system=LOINC_SYSTEM,
                    code=PROGRESS_NOTE_CODE,
                    display="Progress note",
                )
            ],
            text="診療録",
        ),
        subject=Reference(reference=f"Patient/{note.patient_id}", display=patient_name),
        date=note.saved_at,
        author=[Reference(display=note.saved_by)],
        title=f"SOAP v{note.version}",
        section=[
            _section("S", note.subjective),
            _section("O", note.objective),
            _section("A", note.assessment),
            _section("P", note.plan),
        ],
    )
