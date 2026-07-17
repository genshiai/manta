from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...db import get_db
from ...security import get_current_user
from ..auth.models import User
from ..common.audit import log_audit
from ..karte.models import Patient
from .models import CommunicationMessage, CommunicationReadState, CommunicationThread
from .schemas import (
    CommunicationMessageCreateRequest,
    CommunicationMessageRead,
    CommunicationReadReceipt,
    CommunicationThreadRead,
)


router = APIRouter()


def _thread_or_404(db: Session, thread_id: str, user: User) -> CommunicationThread:
    thread = db.get(CommunicationThread, thread_id)
    if thread is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
    if thread.participant_user_ids and user.id not in thread.participant_user_ids and user.role != "管理者":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return thread


@router.get("/api/communications/threads", response_model=list[CommunicationThreadRead])
def list_threads(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CommunicationThreadRead]:
    threads = db.scalars(select(CommunicationThread).order_by(desc(CommunicationThread.updated_at))).all()
    visible = [
        thread for thread in threads
        if not thread.participant_user_ids or current_user.id in thread.participant_user_ids or current_user.role == "管理者"
    ]
    patient_ids = {thread.patient_id for thread in visible if thread.patient_id}
    patients = {
        patient.id: patient.name
        for patient in db.scalars(select(Patient).where(Patient.id.in_(patient_ids))).all()
    } if patient_ids else {}
    users = {user.id: user.display_name for user in db.scalars(select(User)).all()}
    result: list[CommunicationThreadRead] = []
    for thread in visible:
        latest = db.scalar(
            select(CommunicationMessage)
            .where(CommunicationMessage.thread_id == thread.id)
            .order_by(desc(CommunicationMessage.created_at), desc(CommunicationMessage.id))
            .limit(1)
        )
        read_state = db.scalar(
            select(CommunicationReadState).where(
                CommunicationReadState.thread_id == thread.id,
                CommunicationReadState.user_id == current_user.id,
            )
        )
        unread_query = select(func.count(CommunicationMessage.id)).where(
            CommunicationMessage.thread_id == thread.id,
            CommunicationMessage.author_user_id != current_user.id,
        )
        if read_state:
            unread_query = unread_query.where(CommunicationMessage.created_at > read_state.last_read_at)
        result.append(
            CommunicationThreadRead(
                id=thread.id,
                kind=thread.kind,
                title=thread.title,
                patient_id=thread.patient_id,
                patient_name=patients.get(thread.patient_id or ""),
                department=thread.department,
                participant_labels=[users.get(user_id, user_id) for user_id in thread.participant_user_ids],
                unread_count=int(db.scalar(unread_query) or 0),
                last_message=latest.body if latest else None,
                last_message_at=latest.created_at if latest else None,
            )
        )
    return result


@router.get("/api/communications/threads/{thread_id}/messages", response_model=list[CommunicationMessageRead])
def list_messages(
    thread_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CommunicationMessageRead]:
    _thread_or_404(db, thread_id, current_user)
    return list(db.scalars(
        select(CommunicationMessage)
        .where(CommunicationMessage.thread_id == thread_id)
        .order_by(CommunicationMessage.created_at, CommunicationMessage.id)
    ).all())


@router.post(
    "/api/communications/threads/{thread_id}/messages",
    response_model=CommunicationMessageRead,
    status_code=status.HTTP_201_CREATED,
)
def create_message(
    thread_id: str,
    request: CommunicationMessageCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommunicationMessage:
    thread = _thread_or_404(db, thread_id, current_user)
    body = request.body.strip()
    if not body:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Message is empty")
    message = CommunicationMessage(
        thread_id=thread.id,
        author_user_id=current_user.id,
        author_name=current_user.display_name,
        author_role=f"{current_user.role} · {current_user.department}",
        body=body,
    )
    thread.updated_at = datetime.now(timezone.utc)
    db.add(message)
    patient = db.get(Patient, thread.patient_id) if thread.patient_id else None
    log_audit(
        db,
        actor=current_user.display_name,
        action="院内連絡を送信",
        scope="system",
        detail=f"スレッド {thread.title} にメッセージを送信",
        patient=patient,
    )
    db.commit()
    db.refresh(message)
    return message


@router.post("/api/communications/threads/{thread_id}/read", response_model=CommunicationReadReceipt)
def mark_thread_read(
    thread_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CommunicationReadReceipt:
    _thread_or_404(db, thread_id, current_user)
    now = datetime.now(timezone.utc)
    read_state = db.scalar(select(CommunicationReadState).where(
        CommunicationReadState.thread_id == thread_id,
        CommunicationReadState.user_id == current_user.id,
    ))
    if read_state is None:
        read_state = CommunicationReadState(thread_id=thread_id, user_id=current_user.id, last_read_at=now)
        db.add(read_state)
    else:
        read_state.last_read_at = now
    try:
        db.commit()
    except IntegrityError:
        # 開発時の StrictMode や複数タブで同時に初回既読が走っても冪等にする。
        db.rollback()
        concurrent = db.scalar(select(CommunicationReadState).where(
            CommunicationReadState.thread_id == thread_id,
            CommunicationReadState.user_id == current_user.id,
        ))
        if concurrent is None:
            raise
        concurrent.last_read_at = now
        db.commit()
    return CommunicationReadReceipt(thread_id=thread_id, read_at=now)
