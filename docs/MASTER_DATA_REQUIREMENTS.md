# Master Data Requirements

更新日: 2026-05-07

Phase 2 を完了品質へ近づけるために必要なデータの一覧。

具体的なダウンロード先、ファイル名、コード体系の違いは [MASTER_DATA_DOWNLOADS.md](MASTER_DATA_DOWNLOADS.md) にまとめる。

ここでは次の 2 種類を分けて扱う。

- **外部標準データ**: 薬剤、電子添文、標準病名、検査項目など。外部配布物を取得して import する。
- **Manta 内で作る運用データ**: 予約枠、セット、テンプレート、文書テンプレートなど。基本はアプリ内 UI / AI 生成で作る。CSV / JSON は初期投入や既存システム移行のためだけに使う。

原本データは repo に commit せず、import script で DB へ投入する。

## 外部標準データ

### 必須度 A: 薬剤マスタ

目的: 薬剤検索、YJ / HOT 参照、PMDA 添文リンク、用量チェック、同一成分重複チェック。

望ましい形式: CSV。

必要カラム:

- `drug_id`
- `drug_name`
- `generic_name`
- `name_kana`
- `aliases`
- `category`
- `yj_code`
- `hot_code`
- `dosage_form`
- `strength`
- `standard_usage_code`
- `default_days`
- `pmda_info_url`
- `allergy_conflict_label`
- `related_problem`
- `active_ingredient_code`
- `active_ingredient_name`
- `max_daily_dose`
- `max_days`
- `contraindicated_problem_keywords`
- `renal_dose_note`
- `pregnancy_warning`
- `insurance_note`

現状: 基本項目の import は実装済み。安全チェック拡張用カラムは次の migration で追加する。

### 必須度 A: PMDA / 電子添文データ

目的: 禁忌、慎重投与、相互作用、妊婦、高齢者、腎機能、用法用量の根拠表示。

望ましい形式: 公式配布に合わせた XML または JSON。なければ CSV へ正規化したもの。

PMDA の `PackIns` XML は Manta で直接 import できる。

```bash
cd backend
uv run python scripts/import_pmda_package_insert.py \
  --xml-file /path/to/430574_1149019C1149_1_13.xml
```

ディレクトリ単位でまとめて取り込む場合:

```bash
cd backend
uv run python scripts/import_pmda_package_insert.py \
  --directory /path/to/pmda-xml-directory
```

取り込み先:

- DB: `pmda_package_insert_sections`
- 単位: `YJコード × 添付文書番号 × セクション`
- 対応済みセクション: 禁忌、用法及び用量、用法用量関連注意、重要な基本的注意、腎機能、肝機能、妊婦、授乳婦、小児、高齢者、相互作用

最低限ほしい正規化 CSV:

- `yj_code`
- `section`
- `severity`
- `keyword`
- `text`
- `source_updated_at`
- `source_url`

### 必須度 A: 標準病名マスタ

目的: ICD10 病名検索、同義語検索、廃止病名移行。

望ましい形式: MEDIS-DC `byomei*.zip`、または展開済み CP932 text。

必要ファイル:

- `ttl_main.txt`
- `nmain*.txt`
- `ttl_idx.txt`
- `nidx*.txt`
- 履歴 master の title/data ファイル

現状: main と index/synonym は import 可能。履歴 master は受け皿あり、実データ列確認後に importer を合わせる。

### 必須度 B: 検査項目マスタ

目的: 検査セット、基準値、単位、異常判定、長期トレンドの軸固定。

望ましい形式: CSV。

必要カラム:

- `test_code`
- `display_name`
- `loinc_code`
- `unit`
- `reference_low`
- `reference_high`
- `reference_text`
- `specimen`
- `department`
- `sort_order`

## Manta 内で作る運用データ

この領域は「外から欲しいマスタ」ではない。Manta が画面や AI で作成・編集できるようにする。
CSV / JSON は、既存病院システムから移行する場合や、デモ環境へ初期データを投入する場合のための補助口。

### 予約枠 / 診療枠

意味: 医師・診療科・検査種別ごとの「予約を入れられる時間帯」。

例:

- 内科 田中医師: 2026/05/11 10:00、10:30、11:00
- 皮膚科 佐藤医師: 2026/05/12 09:00、09:15、09:30
- 検査予約枠: 採血、心電図、エコーなどの実施枠

目的: Phase 2 のカレンダー予約、日未定予約、検査予約連動。

作るべきもの:

- 予約カレンダー UI
- 医師 / 診療科 / 検査種別ごとの枠作成 UI
- 空き枠、残りわずか、満枠の自動表示
- 日未定予約の仮置き
- 検査オーダから検査予約枠へつなぐ導線

CSV が必要なケース: 既存システムの診療枠を移行する場合だけ。

### セット / テンプレート運用

意味: 医師がよく使う処方セット、検査セット、SOAP テンプレート、診療科別の定型文。

これは基本的に Manta 内で作る。AI が初案を作り、医師 / 管理者が確認して有効化するのが望ましい。

作るべきもの:

- AI による SOAP テンプレート生成
- AI による診療科別セット案生成
- 管理者による承認 / 公開
- 個人用、診療科共有、全院共有の公開範囲
- セット展開後に編集してから確定する UI
- 展開ルール、除外ルール、注意文の管理

JSON / CSV が必要なケース: 初期デモセットをまとめて投入する場合、または既存システムからセットを移行する場合だけ。

### 文書テンプレート

目的: 紹介状、診断書、説明文書など Phase 2 文書作成。

これも基本的に Manta 内で作る。AI が文面案を作り、施設標準テンプレートとして承認する。

作るべきもの:

- 文書テンプレート作成 UI
- 患者情報 / 病名 / 処方 / 検査結果の差し込み変数
- DOCX / PDF 出力
- 診療科別・文書種別ごとのテンプレート管理
