# ADR-0003: 数値に Decimal 型を強制する

## ステータス

承認済

## 背景

電子カルテでは、薬剤の用量、検査値、体重など、数値データを頻繁に扱う。浮動小数点数（float）は2進数で表現されるため、10進数の正確な表現ができない。

```python
>>> 0.1 + 0.2
0.30000000000000004
```

医療においてこの誤差は許容できない。例えば、用量計算で `0.1mg + 0.2mg = 0.30000000000000004mg` と表示される、あるいは内部的にこの値で計算が進むことは、患者安全上のリスクとなる。

## 決定

**全ての用量・数量・金額は `decimal.Decimal` で扱う。`float` の使用は CI で禁止する。**

## 実装

### Pydantic モデル

```python
from decimal import Decimal
from pydantic import BaseModel, Field

class Dosage(BaseModel):
    value: Decimal = Field(gt=0, le=10000)
    unit: DosageUnit
```

### CI での float 検出

ruff のカスタムルールまたは grep ベースのチェックで、domain/ 内の float リテラルを検出する。

### データベース

PostgreSQL の `NUMERIC` 型を使用する。`FLOAT` / `DOUBLE PRECISION` は禁止。

### フロントエンド

Zod スキーマでも `z.number()` ではなく文字列として受け取り、バックエンドの Decimal に変換するパターンを推奨。

## 帰結

- Pydantic モデルで Decimal を強制
- DB カラムは NUMERIC 型
- フロントからの数値は文字列で送受信し、バックエンドで Decimal に変換
- float を domain/ 内で使用すると CI が失敗する
