# Auth Decision

## 結論

Phase 1 の Manta は、認証を FastAPI バックエンド内で自前実装する。

- 認証方式: `利用者ID + パスワード`
- パスワード保管: `Argon2`
- セッション方式: `JWT Bearer Token`
- 権限: `医師` / `管理者` の 2 ロール
- スキーマ管理: `Alembic`

## 根拠

- `karte-system.pdf` の P1 要件では、まず利用者 ID 認証が必要
- [requirements/PHASE_REQUIREMENTS.md](requirements/PHASE_REQUIREMENTS.md) では `ID/パスワード。JWT。権限は医師/管理者の2種で開始` と整理済み
- [first/ARCHITECTURE.md](first/ARCHITECTURE.md) では `FastAPI 側で認証を完結` とし、Phase 1 は `JWT ベースのシンプルな認証` を採る前提
- Tauri 化や院内端末配布を見ても、フロントごとに認証を分散させるより API 側で完結させた方が運用が単純
- Keycloak/Auth0/Clerk は SSO や組織横断統合には強いが、現段階の MVP には重い

## 今やること

1. FastAPI で `login` / `me` / role guard を持つ
2. JWT secret を環境変数で差し替える
3. 利用者マスタと権限を DB 管理する
4. 監査ログと保存者情報は token の利用者から決定する

## 後で検討すること

- 院内 AD / SSO 連携
- 多要素認証
- パスワード再設定フロー
- Keycloak 等への移行
