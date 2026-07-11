> **アーカイブ**: 2026-04 の初期構想スナップショット。現在の正本は `docs/decisions/`（ADR）と各計画書。主な転換点は [README](README.md) 冒頭のバナーを参照。

# ADR-0001: Python (FastAPI) をバックエンドに採用

## ステータス

承認済

## 背景

オープンソース電子カルテのバックエンド言語として、Python、TypeScript、Rust、Go を検討した。以下の要件を重視した:

1. **Vibe Coder（医師）の参入障壁が低いこと** — AI コーディングツール（Cursor, Claude Code）で最も高品質なコードが生成される言語
2. **AI/ML 統合が自然であること** — LLM、ベクトル検索、医療 NLP を将来組み込む
3. **医療系ライブラリが存在すること** — HL7 FHIR、DICOM 等
4. **型安全性を担保できること** — 医療データの取り扱いにおいて型エラーは許されない

## 決定

**Python (FastAPI) を採用する。** 型安全性は mypy --strict + Pydantic v2 で担保する。

## 理由

- AI コード生成の品質が Python で最も高く、Vibe Coder の参入障壁が最も低い
- FastAPI の Depends() による依存性注入は DDD のポート&アダプターと自然に噛み合う
- Python の AI/ML エコシステム（LangChain, LlamaIndex, transformers）が将来の AI 統合に必須
- mypy --strict を CI で強制することで、Python の動的型付けの弱点を補える
- TypeScript はバックエンドの DI や設計パターンの表現力に限界がある
- Rust は型安全性最強だが、コントリビューター人口が少なすぎる

## 帰結

- mypy --strict を CI で必須とする（型エラー = マージ不可）
- 全データモデルは Pydantic v2 で定義する
- NewType で ID の取り違えを防ぐ
- 数値には Decimal を強制する（ADR-0003 参照）
- パフォーマンスクリティカルな処理（DICOM 画像処理等）は将来的に Rust + PyO3 で補う可能性がある

## 代替案

- **TypeScript フルスタック**: 型安全性はネイティブだが、バックエンドの DI が弱く、AI/ML エコシステムが限定的
- **Rust**: 型安全性最強だが、学習曲線が急すぎて OSS コントリビューターが集まらない
- **Go**: シンプルだが、AI/ML ライブラリが貧弱で将来の AI 統合に不利
