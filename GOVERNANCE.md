# Manta のガバナンス

## 意思決定の主体

Manta は現在 **BDFL 型**で運営しています。最終決定者は **GENSHI AI 株式会社**（代表・長島大智 [@iKora128](https://github.com/iKora128)）です。

- リポジトリの管理、マージ権限、リリース判断、ロードマップの最終決定は GENSHI AI が持ちます
- 著作権管理の主体も GENSHI AI 株式会社です。コントリビューターの著作権は各自に残り（DCO・CLA なし）、プロジェクトには Apache 2.0 の許諾が付与されます（[ADR 0005](docs/decisions/0005-oss-process-economy-and-license.md)）

## 意思決定の方法: ADR

アーキテクチャ・方針の決定は [ADR（Architecture Decision Records）](docs/decisions/) に 1 ファイル 1 決定で記録します。

- 誰でも ADR の PR を出して意思決定に参加できます
- 決定には「なぜ」「何を捨てたか（Alternatives Considered）」を必ず残します
- 方針転換は隠しません。旧 ADR は `Superseded by NNNN` でリンクし、紆余曲折ごと公開します

## 変更の取り込み

- すべての変更は PR 経由。レビューとマージは現状 GENSHI AI が行います
- 「AI は確定しない」（ADR 0004）などプロジェクトの根幹原則に反する変更は、実装の質にかかわらず取り込みません
- 継続的に良い貢献をいただいた方には、領域ごとのレビュー権限（CODEOWNERS）を段階的にお願いしていく方針です

## 将来の進化

コミュニティが育った段階（目安: 定常的なコントリビューターが複数領域に存在）で、Steering Committee 型への移行を別 ADR として起票・公開議論します。それまでは、速度と一貫性を優先して BDFL 型を維持します。
