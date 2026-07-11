# Manta への貢献ガイド

Manta は医師 × 医療事務 × エンジニア × 投資家の 4 層で育てるプロセスエコノミーです。コードだけが貢献ではありません。**現場の業務知識は、コードと同じ重さで扱います。**

## コードを書かない貢献（医師・医療事務・看護師の方へ）

- 「現場のこの業務、こう作ってほしい」を [Issue](../../issues/new/choose) の **医療現場からの提案** テンプレートで教えてください
- 画面や動きへの違和感は、スクリーンショット付きで Issue に。専門用語の誤用の指摘は特に助かります
- 議論・雑談は [Discussions](../../discussions) へ

## 開発環境

```bash
git clone https://github.com/genshiai/manta.git
cd manta
docker compose up          # DB + API + Web が一発で立つ（デモデータ自動投入）
```

開発モード（ホットリロード）とバックエンド単体の起動は [README のクイックスタート](README.md#クイックスタート) を参照。

### 変更前後で必ず通すもの

```bash
# バックエンド（要 PostgreSQL: docker compose up -d db）
cd backend
uv run pytest -q           # 141 本
uv run lint-imports        # モジュール層契約（依存の逆流検出）

# フロントエンド
cd frontend
npx tsc --noEmit
npx biome lint src
npm run build

# 一括検証
python3 scripts/verify_local.py
```

## PR の作法

1. **1 タスク = 1 PR。** 小さく出してください。巨大 PR はレビューが止まります
2. **コミットは Conventional Commits + 日本語 subject**
   - 例: `feat(karte): 過去カルテをスクロール表示にする`
   - type は `feat` / `fix` / `docs` / `chore` / `refactor` / `test` / `perf`、scope はモジュール名（`karte` / `rececon` / `gateway` / `frontend` など）
3. **DCO（Developer Certificate of Origin）**: 全コミットに署名を付けてください
   ```bash
   git commit -s   # コミット末尾に Signed-off-by: が付きます
   ```
   CI が自動チェックします。あなたの貢献の著作権は**あなたに残ります**（CLA はありません）。プロジェクトには Apache 2.0 の許諾だけが渡ります（[ADR 0005](docs/decisions/0005-oss-process-economy-and-license.md)）
4. PR テンプレートのチェックリストを埋めて提出 → レビュー → マージ

## 設計を変えるときは ADR

アーキテクチャや方針に関わる変更は、実装の前に [docs/decisions/](docs/decisions/) に ADR を起票してください（[template.md](docs/decisions/template.md) をコピー）。外部コントリビューターも ADR の PR で意思決定に参加できます。これが Manta の「決定の透明性」の中核です。

方針文書に矛盾・両論併記を残さないこと。迷ったら「どちらに寄せるか」まで書いて提案してください。

## 触るときに壊してはいけないもの

- **API 契約**（フロント ↔ バックのパス・メソッド・スキーマ）。変更時は両側を同一 PR で
- **監査ログ**: 書き込み系エンドポイントの `log_audit` 呼び出しと同一トランザクション commit
- **マスタ取込スクリプト**（`backend/scripts/import_*.py`）とそのテスト。ここは本番品質
- **「AI は確定しない」原則**（[ADR 0004](docs/decisions/0004-receipt-gateway-and-ai-claims-assist.md)）: 会計送信・レセプト請求の確定を自動化する変更は受け付けません

## 実患者データは絶対に入れない

Manta は Pre-Alpha です。Issue・PR・スクリーンショットを含め、**実在の患者情報をこのリポジトリに持ち込まないでください**。デモデータはすべて架空です（鈴木花子・田中太郎ら）。

## 質問

どこから手を付けるか迷ったら、`good-first-issue` ラベルの Issue か、[Discussions](../../discussions) でどうぞ。
