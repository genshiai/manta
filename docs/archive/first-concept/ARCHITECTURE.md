> **アーカイブ**: 2026-04 の初期構想スナップショット。現在の正本は `docs/decisions/`（ADR）と各計画書。主な転換点は [README](README.md) 冒頭のバナーを参照。

# アーキテクチャ / Architecture

このドキュメントでは、Manta の全体設計と技術的な意思決定の背景を説明します。

---

## 設計原則

1. **`docker compose up` で始められること** — コントリビューターが10分で開発環境を立ち上げられなければ、OSSは死ぬ。
2. **型で守る、CIで強制する** — Pythonの柔軟性を活かしつつ、mypy --strict + Pydantic + Zod で型安全性を担保。人間の規律ではなく、機械が品質を守る。
3. **モジュラーモノリスから始める** — マイクロサービスは早すぎる。境界だけ定義し、必要になったら切り出す。
4. **フロントは切り替え可能** — Next.js に依存しない。SPA として独立し、Web と Tauri デスクトップで同一コードを共有する。
5. **医療データは特別扱い** — 全操作の監査ログ、ID の型安全性、数値の Decimal 強制。

---

## システム全体像

```
┌─────────────────────────────────────────────────────────┐
│                      クライアント                         │
│                                                          │
│   ┌──────────────┐          ┌──────────────────┐        │
│   │   Web (SPA)  │          │  Tauri Desktop   │        │
│   │  Vite+React  │          │  同一React SPA   │        │
│   └──────┬───────┘          └────────┬─────────┘        │
│          │                           │                   │
│          │   OpenAPI 自動生成クライアント                   │
│          └─────────┬─────────────────┘                   │
└────────────────────┼─────────────────────────────────────┘
                     │ HTTPS
                     ▼
┌─────────────────────────────────────────────────────────┐
│                FastAPI バックエンド                        │
│                                                          │
│   ┌─────────┐  ┌──────────────┐  ┌─────────────────┐   │
│   │   api/  │→│ application/ │→│    domain/       │   │
│   │ ルーター │  │ ユースケース  │  │ ビジネスロジック   │   │
│   └─────────┘  └──────────────┘  └─────────────────┘   │
│        │                                ↑ 依存方向       │
│        ▼                                │               │
│   ┌──────────────────────────────────────┘               │
│   │  infrastructure/                                     │
│   │  ├── database/  (SQLAlchemy + PostgreSQL)            │
│   │  ├── fhir/      (FHIR R4 クライアント)                │
│   │  └── ai/        (LLM統合インターフェース)              │
│   └──────────────────────────────────────────────────── │
└────────────────────┼─────────────────────────────────────┘
                     │
                     ▼
              ┌──────────────┐
              │  PostgreSQL  │
              │   + pgvector │
              └──────────────┘
```

---

## バックエンド設計

### なぜ Python (FastAPI) か

| 判断基準 | Python | TypeScript | Rust |
|---|---|---|---|
| Vibe Coder の参入障壁 | ◎ 最低 | ◎ 低い | ✕ 高い |
| AI コード生成の品質 | ◎ 最高 | ◎ 高い | △ 不安定 |
| 医療系ライブラリ | ◎ HL7/FHIR/DICOM | △ 少ない | ✕ ほぼない |
| 型安全性 | ○ mypy strict で担保 | ◎ ネイティブ | ◎◎ 最強 |
| AI/ML 統合 | ◎ エコシステム最大 | △ 限定的 | △ 限定的 |
| DI / バックエンド設計 | ◎ FastAPI Depends | △ 弱い | ◎ trait |

**結論**: AI統合を将来の中核機能とするプロジェクトで、かつ Vibe Coder（医師）の参加を最大化するなら、Python 一択。型安全性は mypy --strict と Pydantic v2 で補う。

### モジュラーモノリス

```
backend/src/
├── domain/           # 外部依存禁止。純粋なビジネスロジック。
│   ├── patient/
│   │   ├── models.py       # Patient, PatientID
│   │   ├── events.py       # PatientAdmitted, PatientDischarged
│   │   └── rules.py        # ドメインルール（純粋関数）
│   ├── prescription/
│   │   ├── models.py
│   │   └── rules.py        # 禁忌チェック、用量上限
│   └── charting/
│       ├── models.py       # SOAPNote, Problem
│       └── rules.py
│
├── application/      # ユースケース。domain を組み合わせる。
│   ├── create_patient.py
│   ├── write_soap_note.py
│   └── prescribe.py
│
├── infrastructure/   # 外部世界との接点。
│   ├── database/
│   │   ├── repositories.py  # SQLAlchemy
│   │   └── migrations/      # Alembic
│   ├── fhir/
│   └── ai/
│       └── interfaces.py    # LLM統合のインターフェース（実装は後から）
│
└── api/              # FastAPI ルーター。薄いアダプター層。
    ├── patients.py
    ├── charts.py
    └── prescriptions.py
```

### 依存方向のルール

```
api/ → application/ → domain/
          ↓
     infrastructure/

domain/ は何にも依存しない（標準ライブラリ + pydantic のみ）
infrastructure/ は domain/ のインターフェースを実装する
```

このルールは `import-linter` でCIに強制されます:

```ini
# .importlinter
[importlinter]
root_packages = src

[importlinter:contract:domain-independence]
name = Domain must not import from infrastructure or api
type = forbidden
source_modules =
    src.domain
forbidden_modules =
    src.infrastructure
    src.api
    sqlalchemy
    fastapi
    httpx
```

### 型安全戦略

```python
# NewType で ID の取り違えを防ぐ
from typing import NewType
PatientID = NewType("PatientID", str)
DoctorID = NewType("DoctorID", str)

# Pydantic で全データモデルを定義
from pydantic import BaseModel, Field
from decimal import Decimal

class Dosage(BaseModel):
    value: Decimal = Field(gt=0, le=10000)
    unit: DosageUnit  # Enum

# mypy --strict で全てチェック
# CI で型エラー = マージ不可
```

### 型チェッカー: mypy → ty 移行計画

現時点では mypy --strict を採用。Astral 製の ty が production-ready になり次第、移行を検討する。pyproject.toml の設定を1行変えれば切り替わるように構成しておく。

---

## フロントエンド設計

### なぜ Next.js を使わないのか

Tauri デスクトップアプリも視野に入れるため、フロントを特定のフレームワークに結合させない。

Next.js の問題:
- Server Components / Server Actions がバックエンドロジックをフロントに侵食する
- Tauri で動かすとき Node.js サーバーが必要になる（本末転倒）
- API Routes と FastAPI でバックエンドが分散する
- 半年ごとに新パラダイムが来る（App Router, PPR...）

**結論**: Vite + React の SPA として、バックエンドと完全に分離する。

### 技術選択

| ライブラリ | 役割 | 選定理由 |
|---|---|---|
| Vite | ビルドツール | 高速、Tauri公式サポート |
| React | UIライブラリ | コントリビューター人口最大、AI生成品質最高 |
| TanStack Router | ルーティング | 型安全 |
| TanStack Query | サーバー状態管理 | キャッシュ、再取得、楽観的更新 |
| Zustand | クライアント状態管理 | 最小限のボイラープレート |
| React Hook Form + Zod | フォーム | カルテ入力の最重要UI |
| Biome | リント + フォーマット | ESLint + Prettier より高速 |

### 状態管理の設計

```
サーバー状態（90%）: TanStack Query
  └── 患者データ、カルテ、処方 → APIから取得・キャッシュ

クライアント状態（10%）: Zustand
  └── 選択中の患者、サイドバー状態、UIレイアウト

フォーム状態: React Hook Form + Zod
  └── カルテ入力、処方入力のバリデーション
```

### API クライアントの自動生成

```
FastAPI (Pydantic) → openapi.json → openapi-typescript → 型安全クライアント
                                   → openapi-zod-client → Zod スキーマ自動生成
```

バックエンドでエンドポイントを追加すると、フロントの型が自動更新される。手動で fetch を書く必要がない。CI で差分を検出し、更新漏れを防止。

---

## データベース設計

### なぜ PostgreSQL か

- Web アプリの同時書き込みに強い
- NUMERIC 型で Decimal 強制（ADR-0003）
- 枯れた技術、周辺ツールが豊富
- 監査ログの大量書き込みに耐えうる

> **注**: pgvector は採用しない。AI 用ベクトル検索が必要になった場合は専用のベクトルDB（Qdrant 等）を別サービスとして検討する。

### デプロイ構成

```
クラウド（デモ・Phase 1）:
  Cloudflare Pages (SPA) + Fly.io (FastAPI) + Neon (PostgreSQL 無料枠)

オンプレ（小規模医院）:
  Docker Compose 1台: PostgreSQL + FastAPI（SPA静的ファイル同梱）

中〜大規模病院（Phase 3以降）:
  Gunicorn + Uvicorn worker 複数本 → 必要に応じてリバースプロキシ検討
```

### スケーリング計画

```
Phase 1: PostgreSQL 単体（Neon 無料枠 or Docker）
Phase 2: PgBouncer（コネクションプーリング）追加
Phase 3: リードレプリカ + 必要に応じてリバースプロキシ（Caddy/Nginx）
```

### Tauri デスクトップでの DB

Tauri デスクトップ版ではローカル SQLite を使用し、オフライン動作を可能にする。Web版の PostgreSQL とは API 層で吸収する。

---

## AI 統合設計

### 今やること

domain/ 内に AI サービスのインターフェース（Protocol）だけ定義する。実装はしない。

```python
# domain/ai/interfaces.py
from typing import Protocol

class ChartSummarizer(Protocol):
    async def summarize(self, soap_notes: list[SOAPNote]) -> str: ...

class DrugInteractionChecker(Protocol):
    async def check(self, drugs: list[DrugCode]) -> list[Interaction]: ...
```

### 将来やること

```
Phase 3 で実装:
  ├── LLM によるカルテ要約
  ├── AI 処方サジェスト
  ├── 自然言語でのカルテ検索
  └── 音声入力 → 構造化データ変換

必要になったらマイクロサービスとして切り出す:
  Main App (FastAPI) ←→ AI Service (Python/LLM)
  通信: gRPC or メッセージキュー (NATS / Redis Streams)
```

---

## セキュリティ・コンプライアンス

### 3省2ガイドライン準拠

- **真正性**: 全操作の監査ログ（誰が、いつ、何を）
- **見読性**: いつでもデータを読める状態を維持
- **保存性**: 法定保存期間（5年〜）の担保

### 監査ログ

全てのデータ変更操作は、変更不可能な監査ログとして記録する。

```python
class AuditLog(BaseModel):
    timestamp: datetime
    actor_id: DoctorID
    action: AuditAction  # Enum: CREATE, UPDATE, DELETE, VIEW
    resource_type: str
    resource_id: str
    before: dict | None
    after: dict | None
```

### 認証

FastAPI 側で認証を完結させる（Tauri でも同じフローを使うため）。Keycloak または Auth.js を候補とし、Phase 1 では JWT ベースのシンプルな認証から始める。

---

## デプロイ

### ローカル開発

```
docker compose up  →  PostgreSQL + (将来: Redis, MinIO)
```

### デモ・本番環境

```
フロントエンド (SPA): Cloudflare Pages（エッジ配信、無料枠大）
バックエンド (FastAPI): Fly.io（Docker、東京リージョン）
DB: Fly.io PostgreSQL or Neon（サーバーレス PostgreSQL）
```

### CI/CD

```
PR → GitHub Actions CI（全チェック通過 + 1 approve）→ main マージ
main マージ → 自動デプロイ（デモ環境）
タグ (v0.x.0) → 本番デプロイ
```

---

## 設計判断記録（ADR）

主要な技術的意思決定は [docs/adr/](adr/) に ADR として記録しています。

- [ADR-0001: Python (FastAPI) をバックエンドに採用](adr/0001-python-fastapi-backend.md)
- [ADR-0002: Vite + React SPA（Next.js 不採用）](adr/0002-vite-react-spa.md)
- [ADR-0003: 数値に Decimal を強制](adr/0003-decimal-for-numeric-values.md)
- [ADR-0004: モジュラーモノリス採用](adr/0004-modular-monolith.md)
