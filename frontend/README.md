# Frontend

Manta のフロントエンド実装です。

## 方針

- デジタル庁デザインシステムの React component source を `src/vendor/dads` に取り込み
- Tailwind theme plugin は同梱済みのローカル build を参照
- まずは外来カルテ画面の shell から実装

## 起動

```bash
docker compose up -d db api
cd frontend
npm install
npm run dev
```

preview 用にコンテナで起動する場合:

```bash
docker compose up -d --build web
```

## 現状の注意

- `npm install` には npm registry への到達が必要
- `docker compose up -d` には Docker daemon の起動が必要
- 現在は `npm run lint` と `npm run build` が通過している
- `VITE_API_BASE_URL` を省略した場合は同一 origin の `/api` を参照する
- `npm run dev` では Vite proxy が `http://localhost:8000` へ転送する
- `docker compose up -d --build web` では Nginx が `/api` と `/health` を backend へ reverse proxy する
- 認証は backend の JWT bearer を使い、画面再読込時は `GET /api/auth/me` で token を再検証する
- カルテ画面の患者情報タブでは、患者プロファイルとプロブレムを API 保存できる
- 受診履歴 / バイタル / 検査結果 / 指示歴サマリも API 由来の DB データを表示する
- 画像オーダーと処置 / 指導も API 保存できる
- 処方候補 / 検査セット / 予約枠も `GET /api/masters/chart-order-config` から取得する
- `設定` 画面では管理者が利用者・処方候補・検査セット・予約枠を編集できる
- PostgreSQL は `docker compose ps` で `healthy`、FastAPI は `http://localhost:8000/health` で疎通確認済み

## 確認コマンド

```bash
python3 scripts/verify_local.py
```

- `pytest`
- `lint`
- `build`
- `alembic upgrade head`
- `docker compose up -d --build api web`
- preview 経由の login / patient list / chart fetch
