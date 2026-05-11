from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import SessionLocal
from .fhir.router import router as fhir_router
from .migrations import run_migrations
from .modules.admin.router import router as admin_router
from .modules.auth.router import router as auth_router
from .modules.inpatient.router import router as inpatient_router
from .modules.karte.router import router as karte_router
from .modules.master_data.router import router as master_data_router
from .modules.rececon.router import router as rececon_router
from .seed import seed_demo_data


@asynccontextmanager
async def lifespan(_: FastAPI):
    run_migrations()
    with SessionLocal() as db:
        seed_demo_data(db)
    yield


settings = get_settings()
app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(fhir_router)
app.include_router(auth_router)
app.include_router(master_data_router)
app.include_router(karte_router)
app.include_router(inpatient_router)
app.include_router(rececon_router)
app.include_router(admin_router)


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
