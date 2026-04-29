# コントリビューションガイド / Contributing Guide

Manta への貢献に感謝します。このドキュメントでは、開発環境の構築からPRのルールまでを説明します。

---

## 誰が貢献できるか

**全員です。** 医師、エンジニア、デザイナー、テクニカルライター、学生——どんなバックグラウンドでも歓迎します。

特に以下のような方を求めています:

- **医師・医療従事者**: ドメイン知識、UI/UXフィードバック、テンプレート作成
- **エンジニア**: コード貢献、レビュー、インフラ
- **デザイナー**: UIデザイン、ロゴ、ブランディング
- **Vibe Coder**: Cursor / Claude Code でのAI活用コーディング大歓迎

## Vibe Coding について

Manta は Vibe Coding（AIアシスタントを活用した開発）を積極的に推奨します。Cursor、Claude Code、GitHub Copilot、なんでもOK。

**「AIが書いたコードだから品質が低い」ということはありません。** CIが品質を担保します。AIで書こうが手で書こうが、CIを通ればマージできます。

---

## 開発環境の構築

### 前提条件

- Python 3.12+
- Node.js 22+
- Docker & Docker Compose
- Git

### セットアップ

```bash
# 1. リポジトリをクローン
git clone https://github.com/manta-karute/manta.git
cd manta

# 2. データベース起動
docker compose up -d

# 3. バックエンド
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
uvicorn main:app --reload

# 4. フロントエンド（別ターミナル）
cd frontend
npm install
npm run dev
```

### 動作確認

- フロントエンド: http://localhost:5173
- バックエンド API: http://localhost:8000
- API ドキュメント: http://localhost:8000/docs

---

## コーディング規約

### バックエンド（Python）

**型は必須です。** mypy --strict を通さないとマージできません。

```python
# ❌ ダメ
def get_patient(id):
    ...

# ✅ 良い
def get_patient(patient_id: PatientID) -> Patient:
    ...
```

**Pydantic モデルで全てのデータを定義します。**

```python
# ❌ dictを直接使わない
patient = {"name": "田中", "age": 45}

# ✅ Pydanticモデルを使う
class Patient(BaseModel):
    name: str
    age: int = Field(ge=0, le=150)
```

**NewType で ID の取り違えを防ぎます。**

```python
from typing import NewType

PatientID = NewType("PatientID", str)
DoctorID = NewType("DoctorID", str)

# PatientID と DoctorID を間違えて渡すと mypy が怒る
```

**数値には Decimal を使います（float 禁止）。**

```python
from decimal import Decimal

# ❌ 用量に float を使わない（0.1 + 0.2 = 0.30000000000000004）
dosage = 0.5

# ✅ Decimal を使う
dosage = Decimal("0.5")
```

### フロントエンド（TypeScript/React）

- **Biome** でリント・フォーマット（ESLint + Prettier の代替）
- **Zod** でフォームバリデーション
- **TanStack Query** でサーバー状態管理
- **Zustand** でクライアント状態管理（最小限）

### ツールチェイン一覧

| ツール | 用途 | 設定 |
|---|---|---|
| ruff | Python リント + フォーマット | `pyproject.toml` |
| mypy | Python 型チェック（--strict） | `pyproject.toml` |
| import-linter | Python 依存方向の強制 | `.importlinter` |
| Biome | TypeScript リント + フォーマット | `biome.json` |
| Vitest | フロントエンドテスト | `vitest.config.ts` |
| pytest | バックエンドテスト | `pyproject.toml` |

---

## ディレクトリ構造

```
manta/
├── backend/
│   ├── src/
│   │   ├── domain/           # ビジネスロジック（外部依存禁止）
│   │   ├── application/      # ユースケース
│   │   ├── infrastructure/   # DB、外部API
│   │   └── api/              # FastAPI エンドポイント
│   ├── tests/
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── api/              # OpenAPIから自動生成されたクライアント
│   │   ├── components/       # UIコンポーネント
│   │   ├── pages/            # ページ
│   │   ├── stores/           # Zustand ストア
│   │   └── schemas/          # Zod スキーマ
│   ├── package.json
│   └── biome.json
├── docs/
│   ├── ARCHITECTURE.md
│   └── adr/
├── compose.yaml
├── README.md
├── CONTRIBUTING.md
└── LICENSE
```

### 重要なルール: domain/ の依存制限

`backend/src/domain/` 内のコードは、以下のみ import できます:

- Python 標準ライブラリ
- `domain/` 内の他のモジュール
- `pydantic`（型定義のため）

**FastAPI、SQLAlchemy、外部APIクライアント等は domain/ に入れてはいけません。**

これは `import-linter` でCIにより自動検証されます。

---

## テスト方針

全てにTDDを適用するのではなく、**リスクの高い場所にテストを集中**させます。

| 対象 | テスト方法 | カバレッジ目標 |
|---|---|---|
| domain/（ビジネスロジック） | テストファースト推奨 | 90%+ |
| application/（ユースケース） | 実装後にテスト | 70%+ |
| api/（エンドポイント） | 統合テスト | 50%+ |
| infrastructure/ | テスト不要（モック対象） | — |
| フロントエンド | TypeScript + Zod で型担保、テスト最小限 | — |

### 何をテストファーストで書くべきか

**患者安全に直結するロジック** は、テストを先に書いてから実装してください:

- 禁忌薬チェック
- 用量上限チェック
- 権限制御（誰が何を見れるか）
- 患者IDの一意性

---

## PR（プルリクエスト）のルール

### ブランチ命名

```
feature/患者一覧画面
fix/処方バリデーションバグ
docs/ARCHITECTURE更新
```

### PR の流れ

1. `main` から feature ブランチを切る
2. 実装する
3. CI が全部通ることを確認
4. PR を出す（テンプレートに従う）
5. 1人以上の approve を得る
6. マージ

### CI チェック項目

PR を出すと、以下が自動実行されます:

**バックエンド:**
- `ruff check` — リント
- `ruff format --check` — フォーマット
- `mypy --strict` — 型チェック
- `lint-imports` — 依存方向チェック
- `pytest` — テスト
- `bandit` — セキュリティスキャン

**フロントエンド:**
- `biome ci` — リント + フォーマット
- `tsc --noEmit` — 型チェック
- `vitest run` — テスト
- `npm run build` — ビルド確認

**API契約:**
- OpenAPI spec の差分チェック（バックエンドとフロントの型の乖離を検出）

**全て通らないとマージできません。**

---

## コミュニケーション

- **Discord**: リアルタイムの質問・雑談
- **GitHub Issues**: バグ報告、機能要望
- **GitHub Discussions**: 設計議論、提案
- **PR コメント**: コードレビュー

### 行動規範

- 敬意を持って接する
- 医療に関わるプロジェクトであることを意識する
- 「動くコード」より「安全なコード」を優先する
- 分からないことは聞く。聞かれたら丁寧に答える

---

## 初めての貢献

何から始めればいいか分からない場合は:

1. **`good first issue`** ラベルの Issue を探す
2. Discord で「初めてです」と声をかける
3. ドキュメントの誤字修正でもOK

**どんな小さな貢献も、Manta を前に進めます。ありがとうございます。**
