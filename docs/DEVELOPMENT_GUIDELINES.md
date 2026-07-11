# Manta 開発指針 / Development Guidelines

本ドキュメントは、Manta プロジェクト全体の開発指針をまとめたものである。
デザイン・エンジニアリング・医療ドメイン固有のルールを一箇所に集約する。

技術スタックの詳細は `first/ARCHITECTURE.md` を参照。

---

## 1. 設計思想

### 「壊す」ためのプロジェクト

Manta は、日本の電子カルテ市場の以下の問題を解決するために存在する:

- ベンダーロックイン → **オープンソース（Apache 2.0、[ADR 0005](decisions/0005-oss-process-economy-and-license.md)）**
- 不透明な料金 → **無料**
- 2000年代のUI → **モダン SaaS 設計言語（Apple HIG + StyleSeed Notion skin）**
- AI非対応 → **LLM統合前提の設計**

### 判断の基準

迷ったときは、以下の順に優先する:

1. **患者安全** — 薬の用量、アレルギーチェック、取り違え防止
2. **データの正確性** — Decimal強制、型安全、監査ログ
3. **使いやすさ** — 医師が外来中に「考えずに使える」UI
4. **コントリビューターの参入しやすさ** — docker compose up で始められる
5. **コードの美しさ** — CIが守る。人間の規律に頼らない

---

## 2. デザイン指針

詳細・カラー値・トークン定義は [`docs/DESIGN_GUIDELINES.md`](DESIGN_GUIDELINES.md) を正とする。本セクションはエンジニア向けの要点のみ。

### 準拠するガイドライン

| ガイドライン | 用途 | 参照先 |
|---|---|---|
| **Apple Human Interface Guidelines (apple.com/jp 実測値)** | カラー・タイポ・ボタン形状 | [ADR 0003](decisions/0003-color-system-apple-hig.md) |
| **StyleSeed Notion skin + Tailwind v4** | コンポーネント基盤・設計ルール | [ADR 0002](decisions/0002-styleseed-adoption.md) |
| WCAG 2.2 AA | アクセシビリティ基準 | w3.org/TR/WCAG22 |

旧デジタル庁系デザインシステムからの離脱は [ADR 0001](decisions/0001-design-system-digital-cho-and-pivot.md) を参照。

### フォント

システムフォント only（ネット通信ゼロ、Apple HIG 準拠）:

```css
font-family:
  "SF Pro JP", "SF Pro Text", "SF Pro Icons",
  "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro W3",
  メイリオ, Meiryo, "ＭＳ Ｐゴシック",
  -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;

letter-spacing: -0.012em;       /* 本文（負トラッキング） */
font-feature-settings: normal;
```

Google Fonts / 外部 font link は使用しない。ヒラギノ角ゴは **Pro**（**ProN ではない**）。

### カラー

Apple HIG (apple.com/jp 実測値) を [`frontend/src/styles/theme.css`](../frontend/src/styles/theme.css) のトークンとして実装。直接 hex を書かず、必ずトークン参照を使う。

```
プライマリ:    Apple CTA Blue   #0071e3  (--brand)
ホバー/リンク:  Apple Link Blue  #0066cc  (--brand-hover)
テキスト主:    Apple Near Black #1d1d1f  (--text-primary)
背景:         Apple Section    #f5f5f7  (--background) / #ffffff (--card)
警告:         iOS Orange       #FF9500  (--warning)
エラー:       iOS Red          #FF3B30  (--destructive)
成功:         iOS Green        #34C759  (--success)
境界:         Apple Border     #D2D2D7  (--border)
```

純黒 (`#000000`)・純白背景 (`#ffffff`) + 純黒寄り文字の組み合わせは禁止。

### 医療情報のカラーコーディングはしない

旧 EMR の慣例（処方=青 / 検査=緑 / 画像=シアン …）は**採用しない**。情報タイプ別のカラーコーディングは絶対原則違反（[`DESIGN_GUIDELINES.md`](DESIGN_GUIDELINES.md) セクション 0）。

情報識別はアイコン・ラベル・タイポグラフィで行う。状態色（warning / destructive / success）は **状態通知専用**で、情報分類には使わない。

### コンポーネント設計

- StyleSeed の Radix ベース UI プリミティブ（`frontend/src/components/ui/`）を基盤に
- StyleSeed のトークン名（`--brand`, `--text-primary` 等）は維持し、値のみ Apple HIG に置換
- Tailwind CSS v4 の CSS-first 設定（`@theme inline`）でトークンをエイリアス
- 旧デジタル庁系コンポーネント（`frontend/src/vendor/dads/`）は新規開発で使用しない（後続 PR で削除予定）

### アクセシビリティ

- コントラスト比 4.5:1 以上（テキスト）
- タッチターゲット 44px 以上
- キーボード操作完全対応
- フォーカスインジケータ明示（Apple HIG: `box-shadow: 0 0 0 3px rgba(0,113,227,0.2)`）
- 色だけで情報を伝えない（アイコン・テキスト併用）
- WAI-ARIA 1.2 準拠

### 画面レイアウト原則

```
[グローバルナビ]  受付 | カルテ | 予約 | 設定
                        ↓ 患者を選択すると表示
[患者コンテキスト]  カルテ記載 | 指示歴 | 検査結果 | 患者情報
                        ↓
[3カラム]  左:患者情報・履歴 | 中央:メインコンテンツ | 右:オーダー
```

- **左サイドバー（300px固定）**: 患者デモグラフィクス、受診履歴、プロブレムリスト
- **中央（flex-grow）**: SOAP入力、検査結果、カルテ歴
- **右パネル（320px、折りたたみ可）**: 処方、検査オーダー、次回予約
- **ヘッダー（56px固定）**: ロゴ、グローバルナビ、検索、通知、ユーザー情報
- **ステータスバー（32px固定）**: 接続状態、最終保存時刻、現在の患者

---

## 3. エンジニアリング指針

### バックエンド（Python / FastAPI）

- **型は必須**: `mypy --strict` を CI で強制
- **Pydantic v2 で全データモデル定義**: dict を直接使わない
- **NewType で ID の取り違え防止**: `PatientID` と `DoctorID` を混ぜない
- **数値は Decimal**: `float` は domain/ 内で禁止
- **依存方向**: `api/ → application/ → domain/` のみ。`domain/` は何にも依存しない
- **import-linter で CI 強制**

### フロントエンド（TypeScript / React）

- **Biome** でリント・フォーマット
- **TanStack Router** で型安全ルーティング
- **TanStack Query** でサーバー状態管理（90%の状態はここ）
- **Zustand** でクライアント状態（UI状態のみ、最小限）
- **React Hook Form + Zod** でフォームバリデーション
- **OpenAPI → クライアント自動生成**: 手動 fetch 禁止

### API設計

- RESTful（OpenAPI spec 駆動）
- エンドポイントは日本語を避け、英語で命名
- バージョニング: `/api/v1/`
- ページネーション: cursor-based
- エラーレスポンス: RFC 7807 Problem Details

### テスト方針

| 対象 | 方針 | カバレッジ |
|---|---|---|
| domain/（ビジネスロジック） | テストファースト推奨 | 90%+ |
| application/ | 実装後テスト | 70%+ |
| api/ | 統合テスト | 50%+ |
| フロントエンド | 型 + Zod で担保、テスト最小限 | — |

**テストファースト必須の領域**:
- 禁忌薬チェック
- 用量上限チェック
- アレルギーチェック
- 権限制御
- 患者ID一意性

### Git 運用

- **ブランチ**: `main` から feature ブランチ
- **命名**: `feature/受付患者一覧`, `fix/処方バリデーション`
- **CI 必須**: 全チェック通過 + 1 approve → マージ
- **コミット**: Conventional Commits 推奨
- **Vibe Coding 推奨**: AI ツールで書いたコードも CI を通ればOK

---

## 4. 医療ドメイン固有のルール

### 3省2ガイドライン準拠

電子カルテは厚労省・経産省・総務省の「3省2ガイドライン」に準拠する必要がある:

- **真正性**: 全操作の監査ログ（誰が・いつ・何を）
- **見読性**: いつでもデータを読める状態を維持
- **保存性**: 法定保存期間（5年〜）の担保

### 監査ログ

全てのデータ変更は、変更不可能な監査ログとして記録する:

```
誰が（actor_id） + いつ（timestamp） + 何を（resource） + どうした（action）
+ 変更前（before） + 変更後（after）
```

### カルテの版数管理

- カルテは上書きではなく版数で管理する（仕様書 3.2）
- 削除は論理削除（消し線表示）
- 旧版と最新版を色分け表示できること

### 患者安全

- 同姓同名患者の警告表示（仕様書 2.9(15)(16)）
- アレルギー情報の常時表示（仕様書 2.9(17)）
- カルテを開く前に患者ID・氏名を確認表示（仕様書 2.9(1)）
- 処方時のアレルギーチェック自動実行（仕様書 5.1）

---

## 5. ドキュメント構成

```
docs/
├── Plan.md                                  # 開発計画（4軸の現在地ダッシュボード含む）
├── DEVELOPMENT_GUIDELINES.md                # 本ドキュメント
├── DESIGN_GUIDELINES.md                     # デザイン詳細（Apple HIG カラーコード等）
├── IMPLEMENTATION_PLAN.md                   # PDF準拠の実装実行計画（Wave 0-5）
├── IMPLEMENTATION_PLAN_UI_REFRESH.md        # UI リフレッシュ計画（Phase 1-5 完了済み）
├── BACKEND_MODULE_RESTRUCTURE_PLAN.md       # backend モジュール分割方針
├── RECEIPT_GATEWAY_STRATEGY.md              # Mantaレセコン / レセコン連携 / AI算定補助
├── FHIR_MIGRATION_PLAN.md                   # FHIR R4 (JP Core) 移行計画
├── PDF_PROGRESS.md                          # 仕様書ベースの実装進捗スナップショット
├── PDF_ACTION_BACKLOG.md                    # 仕様書を実装単位に落とした作業一覧
├── AUTH_DECISION.md                         # FastAPI 自前認証の方針
├── PMDA_SYNC_STRATEGY.md                    # PMDA電子添文の同期方針
├── PRESCRIPTION_SEARCH_UX.md                # 処方検索 / サジェスト UX 方針
├── decisions/                               # ADR（技術・設計の意思決定記録）
│   ├── 0001-design-system-digital-cho-and-pivot.md   # デジタル庁系離脱（Superseded）
│   ├── 0002-styleseed-adoption.md                    # StyleSeed + Notion skin + Tailwind v4
│   ├── 0003-color-system-apple-hig.md                # Apple HIG カラー / タイポ / ボタン
│   └── 0004-receipt-gateway-and-ai-claims-assist.md  # Mantaレセコン 3 層設計
├── requirements/
│   └── PHASE_REQUIREMENTS.md                # Phase別要件一覧（原本仕様書は私的保管）
├── design-reference/
│   └── apple-jp-design.md                   # apple.com/jp 実測値仕様
├── mock-html/                               # UIプロトタイプ・比較モック
└── archive/
    └── first-concept/                       # 初期構想スナップショット（2026-04、AGPL/Tauri 時代）
```

注: `docs/design-system/`（旧デジタル庁系コンポーネント実装）は履歴として残置。frontend からの参照は切れている（[ADR 0002](decisions/0002-styleseed-adoption.md)）。
