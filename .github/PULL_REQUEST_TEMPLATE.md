## 何を変えたか

<!-- 1 PR = 1 タスク。何と、なぜを簡潔に -->

## 関連 Issue / ADR

<!-- 例: Closes #12 / ADR 0007 -->

## チェックリスト

- [ ] コミットは Conventional Commits + 日本語 subject(例: `feat(karte): 過去カルテをスクロール表示にする`)
- [ ] 全コミットに DCO 署名がある(`git commit -s`)
- [ ] バックエンドを触った → `uv run pytest -q` と `uv run lint-imports` が緑
- [ ] フロントエンドを触った → `npx tsc --noEmit`・`npx biome lint src`・`npm run build` が緑
- [ ] API 契約(パス・メソッド・スキーマ)を変えた → フロント・バック両方を本 PR で更新した
- [ ] 設計方針に関わる → ADR を起票 or 更新した(docs/decisions/)
- [ ] 実患者データ・秘密情報を含んでいない
