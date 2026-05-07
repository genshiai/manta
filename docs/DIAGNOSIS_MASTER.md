# 標準病名マスター運用

Manta の `3.7 病名ツール` は、生の ICD-10 一覧ではなく、MEDIS-DC が配布する `ICD10対応標準病名マスター` を正本として扱います。

更新日: 2026-04-17

## 使うデータ

- 正式な配布元: MEDIS-DC `ICD10対応標準病名マスター`
- 配布形式: `byomei*.zip`
- 文字コード: `shift_jis (Windows-31J / MS932)`
- 現行実装で取り込む対象:
  - `option/ttl_main.txt`
  - `main/nmain*.txt`

## なぜ raw ICD-10 ではなく標準病名マスターか

- 日本の診療実務では、病名入力は ICD-10 単体より標準病名マスターの方が実運用に近い
- 標準病名マスターには `病名表記 / 病名管理番号 / 病名交換用コード / ICD10 / レセ電算コード` がまとまっている
- 今後のレセプト連携や検索支援にもつなげやすい

## import 手順

1. MEDIS-DC から `byomei*.zip` を取得する
2. backend で migration を適用する
3. import script を実行する

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run python scripts/import_standard_disease_master.py --zip-file /path/to/byomei517.zip
```

zip を展開済みなら、`ttl_main.txt` と `nmain*.txt` を直接渡してもよいです。

```bash
cd backend
uv run python scripts/import_standard_disease_master.py \
  --title-file /path/to/ttl_main.txt \
  --main-file /path/to/nmain517.txt \
  --alias-title-file /path/to/ttl_idx.txt \
  --alias-file /path/to/nidx517.txt \
  --alias-type index
```

## 現在の実装範囲

- DB: `diagnosis_masters`
- DB: `diagnosis_alias_masters`（索引用語 / 同義語 / 廃止病名移行候補）
- API: `GET /api/masters/diagnoses/search?q=...`
- chart UI:
  - 病名検索
  - 候補からプロブレムへ追加
  - `ICD10 / 病名管理番号 / 主病名 / 副病名` を保持
- preview 用に少量の demo disease master を seed している
- 2026-04-17 時点で `byomei517.zip` を取り込み、ローカル DB に 27,687 件の病名基本テーブルを投入済み
- `ttl_idx.txt` / `nidx*.txt` 形式の索引テーブルを import し、索引用語や同義語で標準病名を検索できる
- 公式 master が入った場合は demo diagnosis rows を除去し、既存 patient problem の `management_number / icd10_code` を公式 master に再対応付けする

## 運用上の注意

- raw master データは repo に commit しない
- preview の demo seed は説明用であり、実運用では必ず公式配布物を import する
- 履歴マスターも `diagnosis_alias_masters.alias_type=history` と `target_management_number` で受けられる設計にした。実データ投入時に title/data の列名揺れを確認して importer の alias を追加する
