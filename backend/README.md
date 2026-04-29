# Backend

Manta の FastAPI バックエンドです。

## 起動

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## API

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/masters/chart-order-config`
- `GET /api/masters/diagnoses/search`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/{user_id}`
- `POST /api/admin/users/{user_id}/reset-password`
- `POST /api/admin/masters/prescription-catalog`
- `PATCH /api/admin/masters/prescription-catalog/{master_id}`
- `POST /api/admin/masters/lab-sets`
- `PATCH /api/admin/masters/lab-sets/{master_id}`
- `POST /api/admin/masters/reservation-slots`
- `PATCH /api/admin/masters/reservation-slots/{master_id}`
- `GET /api/patients`
- `GET /api/patients/{patient_id}/chart`
- `PUT /api/patients/{patient_id}/context`
- `POST /api/patients/{patient_id}/chart/save`
- `POST /api/patients/{patient_id}/prescriptions`
- `POST /api/patients/{patient_id}/lab-orders`
- `POST /api/patients/{patient_id}/imaging-orders`
- `POST /api/patients/{patient_id}/procedure-orders`
- `POST /api/patients/{patient_id}/reservation`
- `POST /api/patients/{patient_id}/status`
- `GET /api/audit-logs`

## Auth

- Phase 1 の認証は FastAPI 内で自前実装する
- 認証は `利用者ID + パスワード` で行う
- パスワードは Argon2 でハッシュ化する
- ログイン成功時に JWT access token を返し、以後の API は `Authorization: Bearer <token>` を必須にする
- 起動時や画面再読込時は `GET /api/auth/me` で token を検証する
- パスワード有効期限は実行日の `today()` 基準で判定する
- 役割 (`医師` / `管理者`) は JWT に含める
- 管理者専用 API は `require_role("管理者")` で保護する

## Patient Context

- `patients.profile_items` と `patients.problems` を DB 正本にした
- `GET /api/patients/{patient_id}/chart` で患者プロファイルとプロブレムを返す
- `PUT /api/patients/{patient_id}/context` で患者プロファイルとプロブレムを更新する
- `patients.problems` には `ICD10 / 病名管理番号 / 主病名 or 副病名` を保持できる
- 受診履歴 / バイタル / 検査結果 / カルテ要約も `GET /api/patients/{patient_id}/chart` に含める
- 画像オーダー / 処置・指導も `GET /api/patients/{patient_id}/chart` に含め、追加 API を提供する
- 現在の demo では `patients.visit_history / patients.vitals / patients.lab_results / patients.chart_history` を seed / backfill 対象としている

## Chart Order Masters

- 処方候補は `prescription_catalog_masters`
- 検査セットは `lab_set_masters`
- 予約枠は `reservation_slot_masters`
- frontend は `GET /api/masters/chart-order-config` からこれらの master を取得する
- 管理者は create / update API でこれらの master を編集できる

## Diagnosis Masters

- `diagnosis_masters` は MEDIS-DC の `ICD10対応標準病名マスター` を取り込む前提
- preview では少量の demo diagnosis master を seed している
- 公式配布 zip を import する場合は次を使う

```bash
cd backend
uv run python scripts/import_standard_disease_master.py --zip-file /path/to/byomei517.zip
```

## Migration

- migration は DB スキーマ変更の履歴管理
- 現在は Alembic を使い、`alembic/versions/` に版管理する
- 新しいテーブルやカラム追加は `uv run alembic revision -m "..."` で作る
- 適用は `uv run alembic upgrade head`

## 前提

- PostgreSQL は root の `docker compose up -d` で起動する
- 環境変数 `MANTA_DATABASE_URL` を省略した場合は `postgresql+psycopg://manta:manta@localhost:5432/manta` を使う
- 環境変数 `MANTA_JWT_SECRET_KEY` は demo 以外で必ず差し替える
