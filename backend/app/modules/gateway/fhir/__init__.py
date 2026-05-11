"""FHIR 変換層 (Step 0 / 読み取り専用)。

docs/FHIR_MIGRATION_PLAN.md §8 Step 0 に従い、既存の /api/* を壊さずに
/fhir/metadata と GET /fhir/Patient/{id} だけを先行導入する境界層。

- DB スキーマは変更しない (現行 Patient ORM を best-effort で写像)
- 書き込み系 (POST/PUT) と他リソースは Step 1 以降で追加
"""
