# 🦐 Manta — オープンソース電子カルテ

**Manta** は、医師が作り、医師のために設計されたオープンソースの電子カルテシステムです。

既存の電子カルテはベンダーロックイン、不透明な料金体系、時代遅れのUI、AIとの統合不可——これらすべてを壊すために、Manta は生まれました。

> **「マンタ開いて」——それだけで始まる、新しい電子カルテ。**

---

## なぜ Manta か

日本の電子カルテ市場は壊れています。

- 初期導入費 **数百万〜数千万円**
- ベンダー独自フォーマットで **データのポータビリティがない**
- UIは **2000年代のまま** 止まっている
- AIとの統合？ **考慮されていない**

Manta はこれらの問題を、オープンソースで解決します。

## 特徴

- **完全オープンソース** — AGPL-3.0 ライセンス
- **SOAP形式カルテ記載** — S（主訴）O（所見）A（評価）P（計画）
- **プロブレムリスト管理** — 患者の問題を一覧で把握
- **処方・オーダー入力** — 安全な投薬管理
- **監査ログ** — 全操作の記録（3省2ガイドライン準拠）
- **AI統合準備** — 将来的なLLM連携のためのインターフェース設計
- **マルチプラットフォーム** — Web（SPA）+ デスクトップ（Tauri）

## 技術スタック

| レイヤー | 技術 | 選定理由 |
|---|---|---|
| バックエンド | Python (FastAPI) | AI統合に最適、Vibe Coderに優しい |
| フロントエンド | Vite + React + TanStack | SPA、Tauri共有可能 |
| デスクトップ | Tauri v2 | 同一フロントを内包 |
| データベース | PostgreSQL | 枯れた技術、pgvector対応 |
| 型安全 | mypy --strict + Pydantic v2 + Zod | フロント〜バックエンド一貫した型 |
| API契約 | OpenAPI spec → クライアント自動生成 | 型の乖離を防止 |
| CI | mypy, ruff, import-linter, Biome, Vitest | 品質の門番 |

技術選定の詳細は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) を参照。

## クイックスタート

### 前提条件

- Docker & Docker Compose
- Node.js 22+
- Python 3.12+

### 起動

```bash
git clone https://github.com/manta-karute/manta.git
cd manta
docker compose up -d     # PostgreSQL起動
cd backend && pip install -e ".[dev]" && uvicorn main:app --reload  # バックエンド
cd frontend && npm install && npm run dev  # フロントエンド
```

ブラウザで `http://localhost:5173` を開く。

### デモ環境

🌐 **https://demo.mantakarute.dev** （準備中）

ダミーデータで自由に触れます。ログイン不要。

## ロードマップ

```
Phase 0 ← 今ここ
  ├── プロジェクト基盤（リポジトリ、CI、ドキュメント）
  ├── ドメイン取得・デモサイト準備
  └── Discord コミュニティ開設

Phase 1（MVP）
  ├── 患者登録・一覧・検索
  ├── SOAP カルテ記載
  ├── 監査ログ
  └── デモサイト公開

Phase 2
  ├── プロブレムリスト
  ├── 処方オーダー
  ├── テンプレート機能（診療科別）
  └── FHIR R4 基盤

Phase 3
  ├── AI要約・サジェスト（LLM統合）
  ├── DICOM連携
  ├── Tauriデスクトップアプリ
  └── マルチテナント対応
```

## コントリビューション

**医師、エンジニア、デザイナー、誰でも歓迎です。**

コーディングは Cursor / Claude Code 等のAIツールを使った Vibe Coding を推奨しています。CIが品質を守るので、安心してコードを書いてください。

詳しくは [CONTRIBUTING.md](CONTRIBUTING.md) を参照。

## コミュニティ

- **Discord**: [参加する]（準備中）— リアルタイムの議論
- **GitHub Discussions**: 技術的な議論・提案
- **X (Twitter)**: [@manta_karute]（準備中）— 進捗共有

## ライセンス

[AGPL-3.0](LICENSE) — フォーク・改変自由。ただしソースコードの公開義務あり。

OSSとして永続的にオープンであり続けるために、AGPL を選択しました。

---

**Manta は、医療を変えるためのプロジェクトです。一緒に作りましょう。**

---

# 🦐 Manta — Open Source Electronic Medical Record (EN)

**Manta** is an open-source electronic medical record system, built by physicians, for physicians.

Born in Japan, designed to break free from vendor lock-in, opaque pricing, outdated UIs, and lack of AI integration that plague the current EMR landscape.

For details, see the Japanese documentation above. English documentation will be expanded as the project grows.

**License:** AGPL-3.0 | **Stack:** FastAPI + React + PostgreSQL | **Desktop:** Tauri v2
