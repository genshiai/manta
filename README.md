<!--
  このREADMEの「熱い思い」「作者の声」部分は たたき台 です。
  <!-- ▼ たたき台 --> 〜 <!-- ▲ --> で囲った範囲は、長島さんの声で自由に上書きしてください。
  （HTMLコメントは GitHub 上では表示されません）
  スクリーンショットは未挿入です（公開前に docs/ の実画面を差し込み）。
-->

<div align="center">

# Manta

**AI エージェントが動く、次世代のオープンソース電子カルテ**

医師が、OSS と AI の力でゼロから作り直す。FHIR で世界とつながり、レセコンまで内包する。

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-2563EB.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![Status: Pre-Alpha](https://img.shields.io/badge/status-Pre--Alpha-F59E0B.svg)](#-ステータスpre-alpha)
[![Process Economy](https://img.shields.io/badge/built_in-public-7C3AED.svg)](docs/decisions/0005-oss-process-economy-and-license.md)
[![Built by GENSHI AI](https://img.shields.io/badge/built_by-GENSHI_AI-111111.svg)](https://genshi.ai/)

[なぜ作るのか](#なぜ-manta-を作るのか) ・ [何を作っているか](#いま何を作っているのか) ・ [アーキテクチャ](#アーキテクチャ) ・ [クイックスタート](#クイックスタート) ・ [一緒に作る](#プロセスエコノミーとして一緒に作る)

</div>

---

## なぜ Manta を作るのか

<!-- ▼ たたき台: 長島さんの声で自由に上書きしてください -->

**AI エージェントが、当たり前に動くカルテを作りたい。** ——それが Manta の出発点です。

カルテに記録し、オーダを出し、病名を整理し、算定の不備を見つけ、レセプトを点検する。そうした仕事を、AI エージェントが人間の隣で動いてこなす。それを実現するには、データが標準規格で開かれていなければなりません。だから Manta は **FHIR** を土台に据え、外部システムと広くつながれる理想形を目指します。日本の医療を回すのに不可欠な **レセコン（医事会計・レセプト）** も、その上に内包します。

これは **実験** でもあります。AI コーディングが一般的になり、ごく少数の人間が AI の力を借りて、相当の分量と品質のソフトを現実に作れる——その可能性が、いま見えてきました。Manta は、それを本気で試すプロジェクトです。

そして私たちは、**オープンソースの系譜** の上に立っています。最も成功した OSS は、おそらく Linux でしょう。世界中のサーバーも、ほぼすべての Web サービスも、その上で動いている。このコードを記す Git でさえ、OSS の世界から生まれました。その巨人たちの肩の上で、OSS の力と AI のエンパワーメントを受けて、新しいカルテを作る。

正直に言えば、これで既存ベンダーをすぐ置き換える、なんてことは夢物語です。それでも——AI エージェントが自由に動く時代に、FHIR にもモダンウェブにも対応しないレガシーを、私たちはいつまで使い続けるのか。**その呪縛から、そろそろ離れていい。** Manta は、「カルテはこうあるべきだ」という理想の形を、動くコードで示す試みです。

だから、作る過程そのものを公開します（[プロセスエコノミー](docs/decisions/0005-oss-process-economy-and-license.md)）。医師・医療事務・エンジニア・投資家が、同じテーブルで一緒に作る。これはその **招待状** です。

> もっと長い「作者の意図」と、**なぜこの技術スタックを選んだのか** は、こちらに書きました。
> **→ [なぜ Manta を、医師がゼロから作るのか（設計思想と技術選定の記録）](docs/why-manta.md)**

<!-- ▲ たたき台ここまで -->

---

## いま何を作っているのか

Manta の主役は、**AI エージェントが動く電子カルテ** です。その上に、外部と広くつながるための **FHIR データ連携層** を重ね、日本の保険診療に不可欠な **レセコン** までを同じプラットフォームに内包します（→ [ADR 0004](docs/decisions/0004-receipt-gateway-and-ai-claims-assist.md)）。カルテが主役、FHIR が土台、レセコンは必要だから載せる——この順番を崩しません。

| プロダクト | 担うもの | 主な利用者 |
|---|---|---|
| **Manta カルテ** | 診療録・オーダ・病名・患者安全・医師向け AI | 医師 |
| **Manta レセコン** | 算定・会計・レセプト・返戻 / 査定レビュー・月次請求 | 医療事務 |
| **Manta 外部連携**（コード上は `gateway`） | ORCA（日レセ API）・FHIR・将来の他社レセコン / HIS 連携 | 連携先システム |

### 設計の芯にある 3 つの約束

- **正本はカルテ。** 会計やレセプト（`ClaimDraft`）は、カルテ・オーダ・病名から導かれる **派生データ** として扱います。医師の入力 UI を、レセコンの入力粒度に引っ張られないようにするためです。
- **AI は確定しない。** AI の役割は「算定漏れ・病名不足・コメント不足などの **候補生成とレビュー補助**」に限定します。会計送信・レセプト請求の **確定は、必ず人間** が行います。医療事務上のリスクを AI に丸投げしません。
- **決定の "なぜ" を残す。** 主要な意思決定はすべて [ADR](docs/decisions/) に積み上げ、後から「なぜそう決めたか」を追えるようにします。

---

## ⚠️ ステータス：Pre-Alpha

**まだ途中です。** Manta は現在 **Pre-Alpha**（公開によって一緒に育てていく段階）です。

🛑 **実患者データを入れないでください。** デモ／検証用です。本番の診療・請求にはまだ使えません。

> 全体像を図で見る → **[アーキテクチャ図（docs/architecture.html）](docs/architecture.html)**（ブラウザで開くと Mermaid 図が表示されます）

### 機能別の進捗

| 領域 | 状態 | いま出来ること → これから |
|---|---|---|
| 認証・権限 | 🟢 動く | JWT ログイン（Argon2）・ロール（医師/管理者）・監査ログ → 失敗ロック・外部 IdP 連携 |
| 外来カルテ | 🟢 動く | ドキュメント型 UI・SOAP 版管理・下書き自動退避・オーダ・処方コピー・PMDA 相互作用警告・次回予約 |
| 受付ボード | 🟢 動く | 外来 / 入院ビュー・検索 / フィルタ・最近開いたカルテ |
| 病棟 | 🟡 一部 | ベッドボード・転棟・看護記録・退院サマリ・クリニカルパス → 入退院の状態遷移 UI |
| レセコン | 🟡 一部 | 入院 claim draft・施設別ルール DSL・返戻 / 査定・月次クローズ → 外来レセ・点数計算・レセ電(UKE)生成 |
| AI 補助 | 🟠 デモ | 現状はルール生成・定型文（LLM 未接続） → 実 LLM 接続 |
| FHIR 連携 | 🟡 一部 | 9 リソースの read・5 リソースの write（要 JWT）→ JP Core 厳密検証・検索拡張 |
| ORCA 連携 | 🟠 デモ | mock アダプタ + レスポンス正規化 → 実 ORCA への送信 |
| マスタ取込 | 🟢 動く | 支払基金 / MEDIS / 厚労省 / PMDA の実ファイル取込スクリプト |

🟢 実データで動く ／ 🟡 一部実装 ／ 🟠 デモ（見せかけを含む）

### 直近の改善（2026-07）

初回の全面監査をもとに、**セキュリティ強化**（FHIR 認証必須化・パスワード保護・本番起動ガード・ORCA パスワード暗号化）、**データ喪失の解消**（カルテ下書きの自動保存・エラー通知トースト）、**見せかけ表示の正直化**（捏造データ削除・「概算」明示・AI がデモである旨の明記）、**臨床安全バグ修正**（検査の低値異常表示）を実施しました。→ 監査と修正の全記録：**[docs/AUDIT_2026-07-06_REMEDIATION.md](docs/AUDIT_2026-07-06_REMEDIATION.md)**

### 今後やること（コントリビュート歓迎）

- **外来レセプト** — 点数計算・患者負担金・レセ電（UKE）ファイル生成
- **AI の実接続** — カルテ下書き・算定補助を実 LLM に（現状はルール生成のデモ）
- **UI の作り込み** — 入退院の状態遷移・発行済みオーダの編集 / 取消
- **ORCA 実送信** — mock から実 API へ
- **テスト基盤** — フロントエンドのテスト整備

> 細かいロードマップ：[`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)・[`docs/PHASE3_PROGRESS.md`](docs/PHASE3_PROGRESS.md)・[`docs/PUBLIC_RELEASE_CHECKLIST.md`](docs/PUBLIC_RELEASE_CHECKLIST.md)

<!-- ▼ スクリーンショット挿入予定（公開前）
<div align="center">
  <img src="docs/screenshots/chart.png" width="800" alt="Manta カルテ画面" />
</div>
-->

---

## アーキテクチャ

Manta は **モノレポ** + **モジュラーモノリス** です。最初から物理分割はせず、レイヤーの境界だけを **機械的に強制** しています。

### モノレポ構成

```
manta/
├─ frontend/      React 18 + Vite + Tailwind v4 + Radix（StyleSeed / Apple HIG skin）
├─ backend/       FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL
├─ docs/          設計ドキュメント・ADR（意思決定の記録）
└─ compose.yaml   db + api + web を一発で起動
```

### バックエンドのレイヤー

8 つのドメインモジュールを、**依存は上から下への一方向のみ** に制限しています。下位ほど「基盤」、上位ほど「具体的なワークフロー」です。この依存方向は [import-linter](https://import-linter.readthedocs.io/) の契約として [`backend/pyproject.toml`](backend/pyproject.toml) に書かれ、**CI で逆流を検出** します（下位が上位を import したらビルドが落ちる）。

```
   admin          管理・マスタ運用（最上位）
     │  依存 ↓
   gateway        外部連携：FHIR マッパー / ORCA アダプタ
     │
   rececon        レセプト・算定・返戻・月次クローズ
     │
   inpatient      入院・病棟・退院ワークフロー
     │
   karte          外来カルテ・SOAP・オーダ
     │
   master_data    公的マスタ（病名 / 薬価 / 点数表 …）
     │
   auth           認証（JWT + Argon2）
     │
   common         監査ログ・時刻ユーティリティ等の基盤
```

### 相互運用は「ゲートウェイ」に閉じ込める

ここが Manta の設計判断の肝です。

- **FHIR はデータモデルではなく、ゲートウェイ。** 真実の源（source of truth）はドメイン固有の ORM（`patients` / `conditions` / `observations` / `chart_notes` / 各種オーダ …）です。[`gateway/fhir/`](backend/app/modules/gateway/fhir/) のマッパーが、必要なときだけ ORM ↔ FHIR R4B / JP Core を相互変換します。
- **ORCA も同じく外部アダプタ。** [`gateway/orca/`](backend/app/modules/gateway/orca/) が日レセ API への変換・送受信・ORCA 固有エラーの正規化を閉じ込めます。カルテ／レセコン本体は ORCA の都合を知りません。

```
  Manta カルテ / オーダ UI
        ↓
  Billing Core（算定候補・警告の生成）
        ↓
  レセコン連携層 / Receipt Gateway（送信前レビュー・送信・結果取得）
        ↓
  ORCA アダプタ  →  将来の他社レセコン / HIS アダプタ
```

> 各レイヤーの責務、なぜこの分割にしたのかは [ADR 0004（Manta レセコンと AI 算定補助層）](docs/decisions/0004-receipt-gateway-and-ai-claims-assist.md) に。

---

## 技術スタック

| 領域 | 採用技術 |
|---|---|
| フロントエンド | React 18・TypeScript・Vite・**Tailwind CSS v4**・Radix UI・class-variance-authority・Lucide。設計基盤は **StyleSeed（Apple HIG skin）** |
| バックエンド | Python・**FastAPI**・SQLAlchemy 2・Alembic・**PostgreSQL 16**。認証は JWT + Argon2 |
| 相互運用 | **FHIR R4B / JP Core**（`fhir.resources`）、**ORCA 日レセ API** アダプタ |
| 設計の規律 | **import-linter** によるレイヤー強制、**ADR** による意思決定記録、Conventional Commits + DCO |
| 開発・実行 | Docker Compose、**uv**（Python）、**Biome**（JS/TS の lint / format） |

> **なぜこの構成を選んだのか**（モジュラーモノリス、FHIR をゲートウェイに置く理由、デジタル庁デザインシステムから StyleSeed / Apple HIG skin へ乗り換えた経緯、Apache 2.0 を選んだ理由…）は **[docs/why-manta.md](docs/why-manta.md)** にまとめています。

---

## クイックスタート

### いちばん簡単：全部入りデモ

```bash
git clone <このリポジトリのURL> manta   # 公開後の URL に差し替えてください
cd manta
docker compose up
```

- 起動時に **Alembic マイグレーション** と **デモデータ投入** が自動で走ります。
- フロント → http://localhost:4173 ／ API → http://localhost:8000 （`/health` で疎通、`/docs` で API リファレンス）
- **デモログイン**
  - 医師：`dr.tanaka` / `manta-demo`
  - 管理者：`admin.sato` / `manta-admin`
- ⚠️ これはデモ用の認証情報です。ローカル以外で動かすときは **必ず `MANTA_JWT_SECRET_KEY` を差し替え** てください（[`backend/.env.example`](backend/.env.example)）。

### 開発モード（フロントをホットリロードで）

```bash
docker compose up -d db api          # DB と API はコンテナで
cd frontend && npm install && npm run dev   # http://localhost:5173（/api は :8000 にプロキシ）
```

<details>
<summary>バックエンド単体で動かす / ローカル一括検証</summary>

```bash
# バックエンドのみ（uv が必要）
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload

# ローカルの一括検証（pytest / lint / build / migration / compose 疎通）
python3 scripts/verify_local.py
```

公式マスタ（MEDIS-DC 標準病名マスター等）を取り込む場合は [`backend/README.md`](backend/README.md) を参照。デモでは少量のマスタを seed しています。
</details>

---

## プロセスエコノミーとして、一緒に作る

Manta は **医師 × 医療事務 × エンジニア × 投資家** の 4 層共創ネットワークで育てます。完成品を待つのではなく、**作る過程に参加してほしい** のです。

- 🩺 **臨床（医師・医療事務・看護）** — 「現場のこの業務、こう作ってほしい」を Issue / Discussions で。
- 🛠 **技術（エンジニア・デザイナー）** — コード、設計、UI。良い設計判断は [ADR](docs/decisions/) に残します。
- 💼 **経営（投資家・パートナー）** — 医療 IT の未来を一緒に。

### 貢献の流れ

1. [Issue / Discussions](../../issues) で提案・相談（機能投票・デザインレビューも公開で行います）
2. ブランチを切って実装。コミットは **Conventional Commits + 日本語の subject**（例：`feat(karte): 過去カルテをスクロール表示にする`）
3. **DCO**：コミットに署名を付けてください（`git commit -s` で `Signed-off-by` が付きます）
4. PR を出す。レビュー → マージ

> 詳しい開発環境・レビュープロセスをまとめた `CONTRIBUTING.md` ／ `CODE_OF_CONDUCT.md` ／ `SECURITY.md` は **公開準備中** です。意思決定の作法は [ADR の README](docs/decisions/README.md) を参照してください。

---

## ライセンスとブランド

- **Apache License 2.0**（リポジトリ全体で統一）。普及を最大化し、特許条項でコントリビューターを守るためです。
- **Powered by Manta** — fork や派生プロダクトには「Manta 由来であること」の明記をお願いします。`Based on Manta` / `Powered by Manta` の表記は商用サービスでも自由に使えます。名前を隠させるより、出典を明記してもらうことで、良い形が広く伝わると考えています。
- 「Manta」「GENSHI AI」の名称・ロゴは GENSHI AI 株式会社の商標です。

> 方針の全文と背景は [ADR 0005（プロセスエコノミーとしての OSS 公開とライセンス）](docs/decisions/0005-oss-process-economy-and-license.md) に。
> ライセンス本文（`LICENSE`）・`NOTICE`・`TRADEMARKS.md` は **公開準備中** です。

---

## リンク

- **GENSHI AI** — https://genshi.ai/ （[Team](https://genshi.ai/team) ／ [GENSHI Works](https://works.genshi.ai/)）
- **Zenn** — https://zenn.dev/p/genshi_ai ／ **note** — https://note.com/ikora
- **設計思想と技術選定の記録** — [docs/why-manta.md](docs/why-manta.md)
- **意思決定の記録（ADR）** — [docs/decisions/](docs/decisions/)

<div align="center">
<sub>Built in public with ❤️ and AI by <b>GENSHI AI</b> ・ Powered by Manta</sub>
</div>
