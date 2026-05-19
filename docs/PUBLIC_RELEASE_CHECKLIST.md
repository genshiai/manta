# Manta Public 化チェックリスト

private → public 化前に完了させる必須項目のリスト。
方針の Why は [decisions/0005-oss-process-economy-and-license.md](decisions/0005-oss-process-economy-and-license.md) を参照。

## Phase A: リスク監査 (公開前 必須)

### A1. シークレット監査

- [ ] `.env`, `.env.local`, `secrets.json`, `credentials.json` 系が git 履歴に含まれていないか確認
  - `git log --all --full-history --source -- '.env*'`
  - `git log --all -p -S 'password' -S 'api_key' -S 'BEGIN PRIVATE KEY'`
- [ ] [trufflehog](https://github.com/trufflesecurity/trufflehog) または [gitleaks](https://github.com/gitleaks/gitleaks) で全履歴スキャン
  - `gitleaks detect --source . --log-opts="--all"`
- [ ] 漏洩が見つかった場合: `git filter-repo` で履歴洗浄、漏洩したシークレットは即座にローテート
- [ ] `.gitignore` に環境変数ファイル、IDE 設定、OS ファイル、ローカル DB ダンプが含まれているか確認

### A2. 患者データ / 内部データ監査

- [ ] テストデータに実患者由来のデータが入っていないか (氏名、ID、生年月日、病名の組み合わせ)
- [ ] スクリーンショット (`docs/karte-images/`, `docs/mock-html/` 等) に実データの痕跡がないか目視確認
- [ ] 内部議事録、提携先社名、未公開ロードマップが docs に含まれていないか
- [ ] ダミーデータ生成方針を明文化 (例: `Faker` ベース、固定 seed、`patient_demo_*` プレフィックス)

### A3. コミット履歴のレビュー

- [ ] コミットメッセージに不適切な表現、内部ジョーク、機密情報がないか
- [ ] Author email が個人メール / 会社メールどちらで揃えるか方針決定
  - 推奨: GitHub の noreply email (`<user>@users.noreply.github.com`) または `<name>@genshi.ai`
- [ ] 過去 contributor の同意取得 (大塚氏など)

## Phase B: 必須ファイル整備

### B1. ライセンスファイル

- [ ] `LICENSE` (リポジトリルート): FSL-1.1-Apache-2.0 全文
- [ ] `licenses/connectors/LICENSE`: Apache 2.0 全文 (gateway 配下に適用)
- [ ] `licenses/design-tokens/LICENSE`: MIT 全文 (公開可能な UI 部分に適用)
- [ ] 各サブディレクトリの README に該当ライセンスを明記

### B2. ルートドキュメント

- [ ] `README.md` 刷新
  - プロジェクト概要 (1 文): 「医師が作る、AI ファーストの次世代カルテ + レセコン」
  - スクリーンショット 1-2 枚
  - 現在のステータス (Pre-Alpha / Alpha / Beta)
  - クイックスタート (docker compose up で動く)
  - ロードマップへのリンク
  - 貢献ガイド、行動規範、ライセンスへのリンク
  - GENSHI AI へのリンク、Discord 参加リンク
- [ ] `CONTRIBUTING.md`
  - 開発環境セットアップ
  - PR ルール (Conventional Commits + 日本語 subject、[feedback_commit_convention.md] 参照)
  - DCO (Signed-off-by) の説明
  - ADR の起票方法
  - レビュープロセス
- [ ] `CODE_OF_CONDUCT.md`
  - [Contributor Covenant 2.1](https://www.contributor-covenant.org/) 採用
  - 連絡先: conduct@genshi.ai (要セットアップ)
- [ ] `SECURITY.md`
  - 脆弱性報告先: security@genshi.ai (要セットアップ)
  - 対応 SLA (例: 初動 5 営業日、修正 30 日目安)
  - 患者データに影響する脆弱性は最優先
- [ ] `GOVERNANCE.md`
  - 現状は BDFL (GENSHI AI)
  - ADR ベースの意思決定
  - 将来のガバナンス進化方針
- [ ] `ROADMAP.md` (`docs/PDF_PROGRESS.md` / `docs/IMPLEMENTATION_PLAN.md` を外向きに再編)

### B3. .github/ ディレクトリ

- [ ] `.github/ISSUE_TEMPLATE/bug_report.md`
- [ ] `.github/ISSUE_TEMPLATE/feature_request.md`
- [ ] `.github/ISSUE_TEMPLATE/medical_workflow_proposal.md` (医師・医療事務向け)
- [ ] `.github/ISSUE_TEMPLATE/config.yml` (Discord / Discussions リンク)
- [ ] `.github/PULL_REQUEST_TEMPLATE.md` (Conventional Commits、DCO チェック、テスト方針)
- [ ] `.github/CODEOWNERS` (主要領域のレビュアー指定)
- [ ] `.github/workflows/dco.yml` (DCO 自動チェック)
- [ ] `.github/workflows/ci.yml` (lint, type-check, test)
- [ ] `.github/dependabot.yml` (依存更新自動化)

## Phase C: GitHub リポジトリ設定

- [ ] Visibility: public に切替
- [ ] Description, Website (https://manta.genshi.ai 想定), Topics 設定
- [ ] Topics 例: `medical-ai`, `electronic-health-record`, `rececon`, `fhir`, `japan-healthcare`, `fastapi`, `react`, `process-economy`, `genshi-ai`
- [ ] Branch protection (main):
  - PR 必須
  - レビュー 1 名以上
  - CI 通過必須
  - 直 push 禁止
- [ ] Discussions: 有効化、カテゴリ整備
  - 📣 Announcements (メンテナのみ投稿)
  - 💡 Ideas (機能提案)
  - 🩺 Clinical Workflows (医師・医療事務向け)
  - 🛠 Dev Q&A
  - 🎨 Design Reviews
- [ ] Projects: ロードマップを公開ボードとして可視化
- [ ] Labels 整備
  - `good-first-issue`, `help-wanted`, `clinical-feedback-needed`, `design`, `rececon`, `karte`, `gateway`, `infra`, `docs`
- [ ] `good-first-issue` を 5-10 個用意して公開時に飢餓状態を防ぐ
- [ ] Releases / Tags の運用方針決定 (semver 推奨)

## Phase D: コミュニケーション準備

### D1. 発信素材

- [ ] note 記事 第 1 弾「医師が、レセコンを 0 から作り直す理由」執筆
- [ ] X スレッド (10-15 ポスト) で公開告知
- [ ] Zenn 記事 第 1 弾「Manta アーキテクチャ概観 — モジュラーモノリスで作る次世代カルテ」
- [ ] 公開ドキュメントサイト `manta.genshi.ai/docs` セットアップ
  - **採用ツール**: [Zensical](https://zensical.org/) (Material for MkDocs 作者陣による次世代 SSG、Rust コア)
  - **フォールバック**: 問題が出たら `mkdocs.yml` 互換で Material for MkDocs に切替可
  - **ホスティング**: Cloudflare Pages (推奨) または GitHub Pages
  - **構造**: start / mission / roadmap / architecture / decisions (ADR) / wg (members, meetings) / contribute / glossary / faq
  - **Notion は使わない**: メンバー名簿・議事録も含め全て git/markdown で管理
- [ ] GitHub Discussions カテゴリを WG 構造に揃える
  - 📣 Announcements (メンテナのみ)
  - 🩺 臨床WG (医師・医療事務・看護師)
  - 🛠 技術WG (エンジニア・デザイナー)
  - 💼 経営WG (投資家・パートナー企業)
  - 💡 Ideas (誰でも)
  - 🎨 Design Reviews
- [ ] 月例 Zoom 会議の URL / 日程を docs サイトの `wg/meetings/` に固定
- [ ] Discord は Phase 1.5 (公開 2-4 週後) に導入。Phase D 段階ではサーバー雛形だけ設計しておく
  - チャネル設計案: #welcome, #announce, #events, #general, #show-and-tell, #clinical-wg, #tech-wg, #strategy-wg (招待制)
  - ボイス: 月例本会議 / もくもく会
  - カスタム絵文字: `:manta:` `:karte:` `:rezeko:` 等
  - 招待ページに「Discord は OSS コミュニティ標準のチャット、ゲームアプリではない」と一言添える

### D2. ステークホルダー事前共有

- [ ] 共同創業者 (大塚氏) に最終確認
- [ ] パートナー企業 (エーアイ・アンド等) に事前共有
- [ ] 投資家 / アドバイザーに事前共有
- [ ] 東大病院 AI チーム関係者に事前共有 (氏名や所属の公開可否確認)

### D3. KPI 設定

- [ ] 公開後 30 日の目標値を決める
  - 例: GitHub Stars 200, Discord 参加者 100, X バズ閾値 (公開告知 5,000 リポスト)
  - PR 受付 10 件、Issue 30 件、Discussion 20 件
- [ ] 計測手段: GitHub Insights, Discord Analytics, X Analytics

## Phase E: 公開当日 / 直後

- [ ] リポジトリを public に切替
- [ ] X 公開告知ポスト (画像 + スレッド)
- [ ] note 記事公開
- [ ] Zenn 記事公開
- [ ] GENSHI AI 公式サイト / Twitter からの言及
- [ ] manta.genshi.ai/docs・GitHub Discussions URL 配布
- [ ] HackerNews / Reddit r/medicine / r/programming への投稿検討 (英語素材も準備)

## Phase F: 公開後 30 日の運用

- [ ] 毎週月曜: 進捗 X スレッド投稿
- [ ] 隔週: Zenn 技術記事 1 本
- [ ] 月 1: note 物語記事 1 本
- [ ] PR / Issue / Discussion への 48 時間以内応答ルール
- [ ] **公開 2-4 週時点で Discord (Manta開発WG サーバー) 公開**
  - Discord 招待リンクを X / note / GENSHI AI 公式から配布
  - Discord で盛り上がった議論を Discussions に転記する運用ルールを最初に明文化
- [ ] 月 1: 月例 Zoom 本会議 (Notion で議題収集、議事録は公開)
- [ ] 30 日時点で KPI レビュー、戦略再調整

## 中止 / 延期判断のトリガー

以下が起きたら public 化を一旦止めて見直す:

- A1 / A2 でシークレットや患者データの履歴混入が発覚
- 共同創業者やパートナーが公開に懸念
- 直近 1 週間で重大な脆弱性が未修正
- 直前 1 週間で重大な医療安全に関わるバグが未修正
