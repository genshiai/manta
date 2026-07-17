# Combined image for the Manta public demo: builds the SPA, then runs the API
# which also serves the built SPA (same origin, no CORS). DB is external (Neon).
# Build from the repo root: `docker build -t manta-demo .`

# ---- Stage 1: build the SPA ----
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
WORKDIR /app
COPY frontend ./frontend
COPY docs ./docs
WORKDIR /app/frontend
# Same-origin in the demo: the API serves the SPA, so the API base URL is empty.
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

# ---- Stage 2: API runtime that also serves the built SPA ----
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MANTA_STATIC_DIR=/app/static
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock backend/README.md backend/alembic.ini ./
RUN pip install --no-cache-dir uv && uv sync --no-dev --frozen
COPY backend/app ./app
COPY backend/alembic ./alembic
COPY --from=frontend /app/frontend/dist ./static
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
