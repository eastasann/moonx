# System Design Doc — moonx

- 入力: `docs/design-spec.md`（画面・UX の正）、`docs/screen_flow.mermaid`
- この文書が正として持つもの: アーキテクチャ、技術選定（ADR）、環境と命名・環境変数・CI のシークレット・make ターゲット、ルーティング、API、**データモデル**、権限マトリクス（API の単位）、セキュリティ、エラーハンドリング、i18n、テスト、モニタリング（監視の項目と閾値を含む）
- 画面の存在・目的・レイアウト・認証要否は design-spec が正。ここには転記せず、画面番号（例: 13 検証ホーム）で参照する
- デザイントークンの具体値は `docs/06_design-tokens.json` が正

---

## 1. Goal / Non-Goal

### Goal

- design-spec の28画面・モーダル8つ・パネル2つを、**Web（ブラウザ）とスマホのネイティブアプリ（iOS / Android）の両方**で提供する。どちらも同じ API を使う。
- 3工程（自己分析 → アイデア検証 → ビジネスプラン）の入力・その場の計算・確認項目6つの自動判定・プランへの引き継ぎ・実行管理・Pitch Deck（PDF）・AI 往復・決定ログ・コメント・変更履歴・運営者の管理画面をすべて動かす（design-spec 1.2 のスコープ）。
- 計算（損益分岐・シナリオ・投資回収・ROI）と確認項目の判定は、**Web・スマホ・API で同じコード**を使い、入力した瞬間に結果を出す。
- 複数人が同じアイデアを編集しても、上書きで内容が消えない（項目単位の楽観ロックと変更履歴）。
- サーバーと外部サービスの運用費は **月 $0〜10**（ストアの登録費は含めない）。初期は BCDX だけの招待制で、一般公開に向けて構成を変えずに広げられる。
- 依存先を乗り換えやすくする。DB は標準の PostgreSQL として使い（ADR-008）、Web は「静的ファイル＋`/api` の転送」だけで配る（ADR-004）。

### Non-Goal

プロダクトとして作らないもの（AI の組み込み、メール通知、決済、Drive との連携など）は `01_prd.md` 6章が正。ここには、技術の上で作らない仕組みだけを書く。

- AI の API の呼び出し（サーバーにもクライアントにも置かない）
- リアルタイムの共同編集の仕組み（WebSocket・CRDT。同じ欄を同時に打つと、後から保存した人に衝突を知らせるだけ。ADR-019）
- プッシュ通知の仕組み（APNs・FCM。通知はアプリ内の一覧と未読数の取得だけ）
- オフラインでの閲覧のための同期（保存できなかった入力の再送だけ。ADR-021）
- 2つ目以降の言語のカタログ（作りは残す。ADR-026）

---

## 2. アーキテクチャ概要

```
                    ┌───────────────────────── Cloudflare（DNS・CDN・無料枠）──────────────────────────┐
 Web ブラウザ ─────▶ │ Worker「moonx-web-{env}」                                                        │
                    │  ├ /*      → 静的アセット（apps/web の SPA。見つからないパスは _shell.html）       │
 スマホアプリ ─────▶ │  └ /api/*  → Cloud Run へ転送（Cookie・ヘッダーはそのまま。共有シークレットを付ける）│
 (Expo, iOS/Android) └──────────────────────────────────────────┬────────────────────────────────────┘
                                                                │ HTTPS
                    ┌───────────────────── Google Cloud（asia-southeast1）──────────────────────────┐
                    │ Cloud Run「moonx-api-{env}」 ElysiaJS on Bun（0〜3台）                            │
                    │  ├ /api/auth/*  Better Auth（メール＋パスワード、Google）                           │
                    │  ├ /api/v1/*    アプリの REST API（Eden Treaty の型を Web・スマホへ公開）             │
                    │  ├ /api/health  死活確認                                                           │
                    │  └ /internal/cron/*  Cloud Scheduler からだけ呼ばれる（OIDC で検証）                │
                    │ Cloud Scheduler（期限の通知: 1時間ごと）  Secret Manager  Artifact Registry         │
                    │ Cloud Storage（プロフィール写真）  Cloud Logging / Monitoring                        │
                    └───────┬──────────────────────────────┬───────────────────────────────────────────┘
                            │ PostgreSQL プロトコル（TLS）     │ HTTPS
                    ┌───────▼────────────┐        ┌────────▼──────────┐   ┌──────────────┐
                    │ Neon PostgreSQL     │        │ Resend（メール）    │   │ Sentry        │
                    │ ap-southeast-1      │        │ 招待・パスワード再設定 │   │ エラー追跡     │
                    │ branch: production / staging │ └───────────────────┘   │ (web/mobile/api)│
                    └────────────────────┘                                  └──────────────┘
 ストア配布: Expo EAS Build / Submit → App Store（TestFlight）・Google Play。JS だけの更新は EAS Update
```

### 通信フロー

1. **Web**: ブラウザは `https://{DOMAIN}/` から SPA を読み込む（Cloudflare の CDN。Worker は動かない）。データは同じオリジンの `/api/v1/*` を Eden Treaty で呼ぶ。ログインは Better Auth の HttpOnly Cookie（同じオリジンなので SameSite=Lax で足りる）。
2. **スマホ**: アプリは `https://{DOMAIN}/api/*` を直接呼ぶ。セッションは Better Auth の Expo プラグインが SecureStore に保存し、`Cookie` ヘッダーとして付ける。Google ログインはシステムのブラウザで行い、`moonx://` のディープリンクで戻る。
3. **Worker → Cloud Run**: Worker は `/api/*` を Cloud Run の URL へ転送し、`X-Moonx-Proxy-Secret`（共有シークレット）と `CF-Connecting-IP`（利用者の IP）を付ける。API は `/internal/*` と `/api/health` 以外で共有シークレットを確かめ、無い・違うリクエストを 403 `FORBIDDEN` で拒否する（IP の偽装を防ぐ）。`/api/docs`（staging）と `/api/health/db` も対象で、Worker 経由でだけ届く。
4. **定期実行**: Cloud Scheduler が1時間ごとに Cloud Run の `/internal/cron/due-notifications` を OIDC トークン付きで直接呼ぶ。API はトークンの発行者・audience・サービスアカウントを確かめる。
5. **メール**: API が Resend の HTTP API で送る（送信元 `no-reply@{DOMAIN}`）。
6. **計算**: 損益分岐・シナリオ・確認項目・F/A/U の内訳・工程は `packages/domain` の純粋関数で計算する。クライアントは入力のたびにその場で計算して表示し、API は一覧・ダッシュボード・決定ログのスナップショット・版の保存・PDF で同じ関数を使う。DB には保存しない（6章「保存しないもの」）。
7. **通知の受け取り**: 常時接続は使わない。クライアントは画面を開いたとき・アプリが前面に戻ったとき・60秒ごと（画面が見えている間だけ）に未読数を取りに行く。

### インフラ管理

| 対象 | 管理方法 |
|---|---|
| Google Cloud の環境ごとの資源（Cloud Run・Secret Manager・Cloud Scheduler・写真のバケット・サービスアカウント・Monitoring のアラート） | **Terraform**（`infra/terraform/envs/{staging,production}/`） |
| Google Cloud の共有の資源（Artifact Registry のリポジトリ `moonx`・Workload Identity Federation・バックアップのバケット `{GCP_PROJECT_ID}-moonx-backups`・予算アラートと通知のチャンネル） | **Terraform**（`infra/terraform/envs/shared/`。状態は Cloud Storage のバケット `{GCP_PROJECT_ID}-tfstate`） |
| Cloudflare のゾーンの設定（メールの SPF・DKIM・DMARC と Resend の確認のレコード、HSTS、`/api/auth/*` のレート制限ルール） | **Terraform**（Cloudflare provider。`envs/shared/`） |
| Cloudflare Worker・静的アセット・Web のドメイン（`{DOMAIN}` と `staging.{DOMAIN}` の DNS レコードは Worker のカスタムドメインが作る） | `apps/web/wrangler.jsonc`（デプロイは `make deploy-web`） |
| Google の OAuth の同意画面とクライアント | Google Cloud のコンソール（Terraform では作れないため。手順は 03_dev-setup.md） |
| Neon（プロジェクトとブランチ。DB 名 `moonx`） | Neon のコンソールで作り、接続文字列を Secret Manager に入れる（無料プランは Terraform の対象にしない。手順は 03_dev-setup.md） |
| スマホのビルドと配布 | `apps/mobile/eas.json`・`app.config.ts` |
| DB のスキーマ | Drizzle のマイグレーション（`packages/db/migrations/`。CI がデプロイ前に適用する） |
| デプロイのきっかけ | `deploy/{staging,production}/version` の更新（GitHub Actions。04_deployment-procedure.md） |

### リポジトリ構成

Bun workspaces のモノレポ。実コマンドは `Makefile` が唯一の正で、ドキュメントはターゲット名だけを書く。

```
moonx/
├─ apps/
│  ├─ web/        TanStack Start（SPA モード）。worker/ に Cloudflare Worker（/api の転送）、wrangler.jsonc
│  ├─ mobile/     Expo（Expo Router）。eas.json・app.config.ts
│  └─ api/        ElysiaJS（Bun）。Better Auth・REST API・cron・PDF。Dockerfile
├─ packages/
│  ├─ domain/     計算・確認項目・F/A/U・工程・Pitch Deck の組み立て・AI 書き出し / 取り込みの書式（純粋関数）
│  ├─ schemas/    Zod のスキーマ（API の入出力とフォームの入力チェック）
│  ├─ db/         Drizzle のスキーマ・マイグレーション・シード
│  ├─ i18n/       英語のメッセージカタログと書式（en-PH）
│  ├─ ui-tokens/  06_design-tokens.json から生成するテーマ（vanilla-extract・Unistyles・react-pdf 用。生成物）
│  ├─ ui-web/     Web の部品（React Aria Components ＋ vanilla-extract。design-spec 4.5 の部品）
│  └─ ui-native/  スマホの部品（@rn-primitives ＋ Unistyles ＋ @gorhom/bottom-sheet。同じ部品名）
├─ infra/terraform/  modules/ と envs/{shared,staging,production}/
├─ deploy/{staging,production}/version   デプロイする Git のコミット SHA
├─ e2e/           Playwright（Web）
├─ docker/        ローカルの PostgreSQL の初期化 SQL（docker-compose.yml が使う）
├─ scripts/       doc-lint と、画面の検査（`style` 属性・JSX の生の文字列。`make lint` が呼ぶ）
└─ Makefile
```

### 環境と命名

| 項目 | local | staging | production |
|---|---|---|---|
| Web・API の URL | Web `http://localhost:5173`（Vite が `/api` を API へ転送）・API `http://localhost:3000` | `https://staging.{DOMAIN}` | `https://{DOMAIN}` |
| API（Cloud Run） | `bun --watch` | `moonx-api-staging` | `moonx-api-production` |
| Cloudflare Worker | `vite dev` | `moonx-web-staging`（`wrangler.jsonc` の env `staging`） | `moonx-web-production`（env `production`） |
| DB | Docker の PostgreSQL 17（`localhost:5432`、DB 名 `moonx`） | Neon プロジェクト `moonx` のブランチ `staging` | 同じプロジェクトのブランチ `production` |
| メール | コンソールに出す | Resend（送信先は許可リストのメールだけ） | Resend |
| スマホ | Expo の開発ビルド（EAS の profile `development`） | EAS の profile `staging`・チャンネル `staging`・EAS の環境 `preview`。アプリ `{APP_ID}.staging`（TestFlight / Play の内部テスト） | profile `production`・チャンネル `production`・EAS の環境 `production`。アプリ `{APP_ID}`（App Store / Google Play） |
| API のイメージ | — | `asia-southeast1-docker.pkg.dev/{GCP_PROJECT_ID}/moonx/api:<コミット SHA>`（両方の環境で同じイメージ） | 同左 |
| GitHub の環境 | — | `staging` | `production`（デプロイに承認を要する）と `production-backup`（承認なし。`db-backup.yml` だけが使う） |
| Sentry の environment | なし | `staging` | `production` |

未確定の名前（決まったらこの表と、使っている箇所を一緒に置き換える）:

| プレースホルダ | 意味 | 決める時期 |
|---|---|---|
| `{DOMAIN}` | 独自ドメイン（例: moonx.app）。Cloudflare Registrar で取得し、DNS も Cloudflare | Phase 5 で最初にデプロイする前 |
| `{GCP_PROJECT_ID}` | Google Cloud のプロジェクト ID（staging と production で1つのプロジェクトを共有する） | 同上 |
| `{APP_ID}` | iOS の Bundle ID と Android の applicationId（例: com.bcdx.moonx）。staging の版は `{APP_ID}.staging` | ストアにアプリを登録する前（公開後は変えられない） |

### 環境変数

| 変数 | 使う場所 | 内容 | local の値 | staging / production の置き場所 |
|---|---|---|---|---|
| `APP_ENV` | api | `local` / `staging` / `production`（結合テストは設定を直接組み立てて `test` を使うが、環境変数からは読まない）。必須で、無い値や知らない値では起動しない（local の動作はデプロイした環境では安全でないため、既定値を持たない）。staging・production では `PROXY_SHARED_SECRET`・`MAIL_TRANSPORT=resend`・`BETTER_AUTH_URL`・`MAIL_FROM`・`TRUSTED_ORIGINS`・`CRON_OIDC_AUDIENCE`・`CRON_INVOKER_EMAIL` も必須 | `local` | Cloud Run の環境変数 |
| `APP_VERSION` | api | `/api/health` の `version`（コミット SHA） | 未設定なら `dev` | API の Dockerfile が `build-api-image` の build-arg から環境変数に入れる |
| `PORT` | api | 待ち受けるポート | `3000` | Cloud Run が `8080` を渡す |
| `DATABASE_URL` | api, db | PostgreSQL の接続文字列 | `postgres://moonx:moonx@localhost:5432/moonx` | Secret Manager `moonx-{env}-database-url`（Neon のプール接続） |
| `DATABASE_URL_DIRECT` | db（マイグレーション・バックアップ） | プールを通さない接続文字列 | `DATABASE_URL` と同じ | GitHub Actions の環境のシークレット |
| `DATABASE_URL_TEST` | api（`make test-api`・`make test-e2e`） | テスト用の DB（テストのたびに作り直す。作り直しはテーブルを全部消すので、DB の名前は `_test` で終わり、URL にクエリ文字列を付けないこと） | `postgres://moonx:moonx@localhost:5432/moonx_test` | CI はサービスコンテナの DB |
| `BETTER_AUTH_SECRET` | api | セッションの署名鍵（32文字以上の乱数。短ければ起動しない） | `.env` に任意の値 | Secret Manager `moonx-{env}-better-auth-secret` |
| `BETTER_AUTH_URL` | api | 公開の URL（Cookie と OAuth のコールバックの基準） | `http://localhost:5173` | `https://staging.{DOMAIN}` / `https://{DOMAIN}` |
| `TRUSTED_ORIGINS` | api | 許可するオリジン（カンマ区切り） | `http://localhost:5173,moonx://,exp://` | `https://{DOMAIN},moonx://`（staging は `https://staging.{DOMAIN},moonx-staging://`） |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | api | Google ログイン（OAuth クライアント。環境ごとに作る。どちらも空なら Google ログインだけが使えず、片方だけ入れると起動しない） | 開発用のクライアント | ID は環境変数、SECRET は Secret Manager `moonx-{env}-google-client-secret` |
| `MAIL_TRANSPORT` | api | `console` / `resend`（それ以外の値では起動しない。staging・production は `resend` でなければ起動しない。`console` は招待のリンクを含むメールの全文をログに出すので、local とテストだけで使う） | `console` | `resend` |
| `RESEND_API_KEY` | api | Resend の API キー | 不要 | Secret Manager `moonx-{env}-resend-api-key` |
| `MAIL_FROM` | api | 送信元 | `moonx <no-reply@localhost>` | `moonx <no-reply@{DOMAIN}>` |
| `MAIL_ALLOWLIST` | api | staging でだけ使う送信先の許可リスト（カンマ区切り。空なら制限なし） | 空 | staging だけ設定 |
| `PROXY_SHARED_SECRET` | api, Worker | Worker が付ける共有シークレット。API 側はカンマ区切りで2つまで受け付ける（ローテーションの間だけ新旧の両方を入れる。05_operation-runbook.md） | 空（local では検査しない。staging・production では空だと起動しない） | Secret Manager `moonx-{env}-proxy-shared-secret` と Worker のシークレット |
| `API_ORIGIN` | Worker | 転送先の Cloud Run の URL | 不要（Vite の転送を使う） | `wrangler.jsonc` の環境ごとの `vars` |
| `CRON_OIDC_AUDIENCE` | api | cron の OIDC トークンの audience。Cloud Run の決まった形の URL `https://moonx-api-{env}-{プロジェクト番号}.asia-southeast1.run.app`（Terraform がプロジェクト番号から組み立てる。サービス自身の出力を参照すると循環するため） | 空（local では `make cron-due` が直接呼ぶ） | Cloud Run の環境変数 |
| `CRON_INVOKER_EMAIL` | api | cron を呼ぶサービスアカウントのメール | 空 | Cloud Run の環境変数 |
| `AVATAR_BUCKET` | api | プロフィール写真のバケット（staging・production は空なら起動しない） | 空（local はディスク `./.data/avatars`。API が `/api/avatars/{name}` で返す） | `moonx-{env}-avatars` |
| `SENTRY_DSN` | api | Sentry（API） | 空 | Cloud Run の環境変数 |
| `LOG_LEVEL` | api | `debug` / `info` / `warn` / `error` | `debug` | `info` |
| `VITE_APP_ENV` / `VITE_SENTRY_DSN` | web（ビルド時） | 環境名と Sentry（Web）。ビルドに埋め込むので、Web はデプロイのときに環境ごとにビルドする（ADR-016） | `local` / 空 | GitHub Actions の環境の変数 |
| `EXPO_PUBLIC_API_BASE_URL` | mobile | API の基準 URL | `http://<開発 PC の IP>:3000/api`（`apps/mobile/.env`） | `https://staging.{DOMAIN}/api` / `https://{DOMAIN}/api`（EAS の環境変数。`preview` / `production`。`eas build` と `eas update --environment` の両方が読む） |
| `EXPO_PUBLIC_APP_ENV` / `EXPO_PUBLIC_SENTRY_DSN` | mobile | 環境名と Sentry（スマホ） | `local` / 空（`apps/mobile/.env`） | 同上（EAS の環境変数） |

`.env` の置き場所: `apps/mobile` 以外の変数はリポジトリの直下の `.env`、`EXPO_PUBLIC_*` は `apps/mobile/.env`（Expo が読む場所）。`make setup` が、それぞれの `.env.example` をコピーする。直下の `.env` は Makefile が読み込んで各コマンドに渡し、Vite は `envDir` をリポジトリの直下にする。

**CI（GitHub Actions）のシークレットと変数**: 環境ごとに値が違うものは GitHub の環境（`staging` / `production` / `production-backup`）に、環境をまたいで同じものはリポジトリに置く。

| 名前 | 置き場所 | 用途 |
|---|---|---|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` / `GCP_DEPLOY_SERVICE_ACCOUNT`（変数） | リポジトリ | Workload Identity Federation で Google Cloud に入る（鍵を置かない）。`build.yml` のイメージの作成、各環境のデプロイ、`db-backup.yml` のバックアップのバケットへの書き込みが使う |
| `SENTRY_AUTH_TOKEN`（シークレット） | リポジトリ（スマホのビルドは EAS で動くので、EAS の環境変数にも secret として置く） | ソースマップのアップロード（Web・スマホ・API） |
| `CLOUDFLARE_ACCOUNT_ID`（変数） | リポジトリ | `wrangler deploy` |
| `EXPO_TOKEN`（シークレット） | リポジトリ | EAS Build / Submit / Update |
| `DATABASE_URL_DIRECT`（シークレット） | `staging` / `production`（マイグレーション）、`production-backup`（バックアップ。production の読み取り専用のロール `moonx_backup_ro` の接続文字列） | マイグレーションとバックアップ |
| `CLOUDFLARE_API_TOKEN`（シークレット） | `staging` / `production` | `wrangler deploy`。権限は Workers のスクリプトの編集と、`{DOMAIN}` のゾーンの Workers のルート・カスタムドメイン・DNS の編集（カスタムドメインが DNS レコードを作るため）。Cloudflare のゾーンの設定（2章「インフラ管理」）用の Terraform のトークンは別（`envs/shared` の実行者だけが持つ） |
| `VITE_APP_ENV` / `VITE_SENTRY_DSN`（変数） | `staging` / `production` | Web のビルド |

ストアへの提出の鍵（App Store Connect の API キー、Google Play の提出用のサービスアカウントの JSON）は EAS に置く（`eas credentials`）。

### make ターゲット

| ターゲット | 内容 |
|---|---|
| `install` | 依存の取得だけ（`bun install --frozen-lockfile`）。CI が使う |
| `setup` | `install`、`.env` の雛形のコピー（直下と `apps/mobile`。直下の `BETTER_AUTH_SECRET` が空なら乱数を入れる）、`db-up`、`db-migrate`、`db-seed`、`tokens`、Playwright のブラウザの取得、Git のフックの配線（`git config core.hooksPath .githooks`） |
| `dev` | API と Web を同時に起動（`dev-api` と `dev-web`） |
| `dev-api` / `dev-web` / `dev-mobile` | それぞれを単独で起動（`dev-mobile` は Expo の開発サーバー） |
| `build` | 全パッケージの型チェックとビルド（Web は local の設定） |
| `build-web ENV=...` | Web を環境ごとにビルドする（`VITE_*` を埋め込む） |
| `build-api-image SHA=...` | API の Docker イメージを作って Artifact Registry に上げる |
| `test` | `test-domain`・`test-api`・`test-web`・`test-mobile` をまとめて実行 |
| `test-domain` / `test-api` / `test-web` / `test-mobile` | 単体・結合テスト。`test-domain` は `packages/domain`・`packages/schemas`・`packages/i18n`・`packages/ui-tokens`（生成スクリプトと検査のテスト）・`scripts/`（画面の検査スクリプト）、`test-api` は `apps/api`（`DATABASE_URL_TEST` の DB を作り直して使う）、`test-web` は `apps/web`・`packages/ui-web`、`test-mobile` は `apps/mobile`・`packages/ui-native` |
| `test-e2e` | Playwright（Web。`DATABASE_URL_TEST` の DB で API と Web を起動して）。ブラウザ（Chromium）が無ければ先に取得する（CI でも動くように） |
| `lint` / `format` / `typecheck` | Biome の検査・整形（`lint` は画面の検査スクリプト `scripts/check-screens.ts` も動かす）、TypeScript の型チェック |
| `db-up` / `db-down` | ローカルの PostgreSQL（Docker Compose）の起動・停止 |
| `db-generate` | Drizzle のスキーマからマイグレーションを作る |
| `db-migrate` | マイグレーションを適用する（`DATABASE_URL_DIRECT` か `DATABASE_URL`） |
| `db-seed` / `db-reset` | 全テーブルの中身を消してデモデータを入れる（デモのユーザーのログイン中のセッションだけは残す。design-spec 8章。`APP_ENV=local` のときだけ動く。何度動かしても行の id は変わらない）/ DB を作り直してシードまで |
| `db-studio` | Drizzle Studio |
| `tokens` | `docs/06_design-tokens.json` から `packages/ui-tokens` を生成する |
| `openapi` | API の OpenAPI 仕様を `apps/api/openapi.json` に書き出す |
| `doc-lint` | ドキュメントと実体の食い違いを検査する（`scripts/doc-lint.sh --docs`: ドキュメントが参照する make ターゲットの実在・`docs/README.md` のリンク切れ・`docs/features/` の命名）。コミットの前の検査（`--staged`）は `.githooks/pre-commit` が動かす |
| `cron-due` | 期限の通知の処理を手で1回動かす（local だけ。staging では Cloud Scheduler のジョブを手で実行する。04・05） |
| `admin-create EMAIL=...` | 最初の運営者を作るための招待（ワークスペースなし、`grants_admin = true`）を発行し、リンクを表示する。同じメールあての有効な招待があれば、新しいリンクで作り直す。接続先は `DATABASE_URL`、リンクの基準は `BETTER_AUTH_URL`（staging / production では、この2つを上書きして手元から実行する。03_dev-setup.md） |
| `infra-plan ENV=...` / `infra-apply ENV=...` | Terraform の plan / apply（`ENV` は `shared` / `staging` / `production`） |
| `deploy-api ENV=... SHA=...` | マイグレーションの後、Cloud Run に新しいリビジョンを出す（CI が使う） |
| `deploy-web ENV=...` | `build-web` の結果を `wrangler deploy --env` で出す（CI が使う） |
| `mobile-update ENV=...` / `mobile-build ENV=...` | EAS Update（JS だけ）/ EAS Build と Submit（ネイティブの変更があるとき）（CI か手元） |
| `db-backup ENV=...` | `pg_dump -Fc` を取り、`gs://{GCP_PROJECT_ID}-moonx-backups/{env}/<日付>.dump` に上げる（バケットは30日で自動削除。定期実行の GitHub Actions が使う。05_operation-runbook.md） |

---

## 3. 技術選定と判断理由（ADR）

技術スタックは Phase 3 でユーザーと決めた（2026-10-01）。ユーザーが指定・選択したものは、見出しと下の表に「（ユーザー指定）」と書く。

| # | 領域 | 決定 |
|---|---|---|
| ADR-001 | クライアントの構成（ユーザー指定） | Web とスマホのネイティブアプリを**別々のコード**で作り、計算・入力チェック・型・文言・トークンを共有パッケージで共有する |
| ADR-002 | Web（ユーザー指定） | **TanStack Start**（SPA モード）＋ TanStack Form |
| ADR-003 | スマホ（ユーザー指定） | **Expo**（React Native）＋ Expo Router。**iOS と Android を最初からストアで配る** |
| ADR-004 | Web の配信 | **静的ファイル＋`/api` の転送**の形に固定し、Cloudflare（Worker の静的アセット）で配る。Cloud Run は共有シークレットで守る |
| ADR-005 | API（ユーザー指定） | **ElysiaJS**（Bun） |
| ADR-006 | 通信方式（ユーザー指定） | **REST**。クライアントは **Eden Treaty**、仕様書は OpenAPI。常時接続は使わない |
| ADR-007 | API の実行環境（ユーザー指定） | **Cloud Run**（asia-southeast1、0〜3台） |
| ADR-008 | DB（ユーザー指定） | **Neon の PostgreSQL** を、Neon 独自の機能を使わない標準の PostgreSQL として使う |
| ADR-009 | ORM・入力チェック | **Drizzle ORM**（postgres.js）＋ **Zod v4** |
| ADR-010 | 認証（ユーザー指定） | **Better Auth**（メール＋パスワード、**Google ログイン**）。招待制はサーバーで強制する |
| ADR-011 | キャッシュ | サーバー側のキャッシュは置かない。クライアントは **TanStack Query** |
| ADR-012 | Pitch Deck の PDF | API サーバーで **react-pdf** を使って作る |
| ADR-013 | メール・ドメイン | **Resend** ＋ 独自ドメイン（Cloudflare Registrar） |
| ADR-014 | 定期実行 | **Cloud Scheduler** → API の内部エンドポイント |
| ADR-015 | IaC（ユーザー指定） | **Terraform**（GCP と Cloudflare のゾーンの設定）＋ wrangler / EAS の設定ファイル。コンソールで管理するものを明記 |
| ADR-016 | 環境とリリース（ユーザー指定） | **staging ＋ production**。`deploy/{env}/version` による昇格 |
| ADR-017 | モノレポ | **Bun workspaces** ＋ Makefile |
| ADR-018 | デザインシステムとトークン（ユーザー指定） | **Adobe Spectrum の仕組み**を取り入れ、見た目は Hermes Teal。06_design-tokens.json から Web（vanilla-extract）・スマホ（Unistyles）・PDF のテーマを生成する。アイコンは Lucide |
| ADR-019 | 同時編集 | 項目単位の楽観ロック（`lock_version`）。衝突は 409 で返し、利用者に選ばせる |
| ADR-020 | 変更履歴の記録 | アプリのコードで、本体の更新と同じトランザクションの中で `change_history` に書く |
| ADR-021 | 保存できなかった入力の再送 | クライアントの送信待ちの列（Web: IndexedDB、スマホ: SQLite）に残して再送する |
| ADR-022 | テスト・リント | Bun test・Vitest・Jest（jest-expo）・Playwright・Biome |
| ADR-023 | 監視・ログ | Sentry ＋ Cloud Logging（構造化 JSON・リクエスト ID）＋ Cloud Monitoring の稼働時間チェック ＋ Workers Logs |
| ADR-024 | 画像の保存 | プロフィール写真は Cloud Storage |
| ADR-025 | 部品の作り方（ユーザー指定） | **Tailwind を使わない**。振る舞いは headless の部品（Web は **React Aria Components**、スマホは **@rn-primitives** と **@gorhom/bottom-sheet**）、見た目は **vanilla-extract**（Web）と **Unistyles**（スマホ）で部品の中にだけ書き、画面にはスタイルを書かない |
| ADR-026 | i18n | **i18next**（英語だけで始め、多言語にできる作り）。書式は en-PH |
| ADR-027 | CI/CD とシークレット | **GitHub Actions** ＋ Workload Identity Federation。シークレットは Secret Manager・GitHub の環境・Worker・EAS に置く |
| ADR-028 | DB のバックアップ | 毎日 **`pg_dump`** を Cloud Storage に30日残す |
| ADR-029 | API の回数制限 | Better Auth の設定＋アプリの API の自前のミドルウェア（同じ `rate_limits` テーブル）＋ Cloudflare のルール |

### ADR-001: Web とスマホを別々に作り、ロジックを共有する（ユーザー指定）

**決定:** Web（`apps/web`、TanStack Start）とスマホ（`apps/mobile`、Expo）を別々のコードで作る。画面は別々に作り、次のものは `packages/` で共有する: 計算と判定（`domain`）、API の入出力とフォームの入力チェック（`schemas`）、API の型（Eden Treaty が `apps/api` の型を読む）、文言と書式（`i18n`）、デザイントークン（`ui-tokens`）。

**理由:** ユーザーが「Web とスマホを別々に作る」を選んだ。design-spec は書く画面をスマホ基準、数字と表の画面を Web 基準で設計している（design-spec 1.2）。どちらにも最適な部品を使える（Web は DOM の表・キーボード操作、スマホはネイティブのキーボードとシート）。画面が違っても計算と判定の結果が食い違わないように、ロジックは1か所に置く。

**トレードオフ:** 28画面を2回作るので、開発と保守の手間は一体型（Expo で Web も出す）のほぼ2倍。Web とスマホで画面の挙動がずれる危険があるため、画面の仕様は design-spec だけを正とし、E2E は Web（Playwright）と、スマホのコアフロー（Maestro。Phase 5 で導入を判断）で確かめる。捨てた案: Expo で Web も出す（Web の表やワークシートが作りにくい）、Web を Capacitor で包む（Apple の審査で「Web を包んだだけ」と判断される危険）。

### ADR-002: Web は TanStack Start の SPA モード（ユーザー指定）

**決定:** `apps/web` は TanStack Start（React・TanStack Router・Vite）を **SPA モード**で使い、静的ファイルとして出力する。ランディング（1）だけはビルド時に HTML を作る（プリレンダー）。データはすべて API（Eden Treaty ＋ TanStack Query）から取る。TanStack Start のサーバー関数・サーバー描画は使わない。フォームは TanStack Form（Zod のスキーマをそのまま使う）。画面の部品は `packages/ui-web`（ADR-025）だけを使う。

**理由:** ユーザーが Next.js 以外として TanStack Start を選んだ。ログイン後の画面がほぼすべてで、検索エンジン向けのサーバー描画は要らない。データの取得口を Elysia の API 1つにまとめれば、スマホと同じ API を使える。ルートの型安全（パスと検索パラメータ）が、画面数の多いアプリで効く。TanStack Form は Zod のスキーマ（Standard Schema）をそのまま検査に使え、React Native でも同じ書き方で動くので、Web とスマホでフォームの作り方をそろえられる。TanStack Query はキャッシュと再取得・楽観的更新・オフラインからの復帰をまとめて扱え、Web とスマホの両方で使える（ADR-011）。

**トレードオフ:** TanStack Start は比較的新しく、情報が Next.js より少ない。サーバー描画を使わないので最初の表示は JS の読み込み待ちになる（ランディングはプリレンダーで補う）。将来サーバー描画が要るようになったら、TanStack Start のまま SSR モードに切り替えられる（そのときは Worker で動かす。ADR-004 の形は変わらない）。フォームの捨てた案: React Hook Form（利用者が多いが、型の推論と Standard Schema の扱いで TanStack Form の方がそろえやすい）。

### ADR-003: スマホは Expo、iOS と Android を最初からストアで配る（ユーザー指定）

**決定:** `apps/mobile` は Expo（React Native、New Architecture。開発ビルドを使い、Expo Go は使わない）＋ Expo Router。画面の部品は `packages/ui-native`（ADR-025）だけを使う。ビルドとストアへの提出は EAS Build / EAS Submit、JS だけの修正は EAS Update（チャンネル `staging` / `production`）。iOS（App Store・TestFlight）と Android（Google Play）を最初から両方配る。セッションは Better Auth の Expo プラグインで SecureStore に保存する。保存できなかった入力は expo-sqlite に残す（ADR-021）。PDF は API から受け取り、expo-sharing で共有する。

**理由:** ユーザーが「ネイティブアプリ」「最初から iOS と Android の両方」を選んだ。Expo は TypeScript・React で書けて Web と知識を共有でき、ネイティブのビルド環境（Mac など）を持たずにクラウドでビルド・提出できる。EAS の無料枠で試運転の規模は足りる。開発ビルドにするのは、Unistyles v3 と @gorhom/bottom-sheet がネイティブのモジュールを使い、Expo Go では動かないため（ADR-025）。フォームは Web と同じ TanStack Form と Zod のスキーマを使う。メールのリンク（招待・パスワード再設定）と通知のリンクを Web と同じパスで開けるように、iOS の Universal Links・Android の App Links（`https://{DOMAIN}/...`）と独自スキーム（`moonx://`、staging は `moonx-staging://`）でアプリを開く（4章）。

**トレードオフ:** ストアの審査があるので、修正の公開に1〜数日かかることがある（JS だけの修正は EAS Update で即時に出せる）。Apple の登録費（年 $99）と Google の登録費（$25 の1回だけ）がかかる（運用費の予算には含めない。ユーザーと合意済み）。招待制のアプリなので、審査用のデモアカウント（staging ではなく production の、審査専用のワークスペース）を用意する（04_deployment-procedure.md）。

**審査の判断（ユーザーと合意、2026-10-01）:**
- Apple の審査基準 4.8（他社のログインを出すアプリは、条件を満たす別のログインも並べる）に対して、Sign in with Apple は足さずに提出する（メール＋パスワードがあるため）。審査で求められたら、そのときに足すか、iOS はストアで配らず Web で使う（ユーザーはストアで配れなくても構わないとした）。
- Google Play は**個人の開発者アカウント**で登録する（ユーザーの選択。組織のアカウントに要る D-U-N-S 番号の取得を待たずに始められる。後で組織へ移すときは、アプリの移管の手続きが要る）。個人アカウントは、製品版の公開の前にクローズドテストが必須（条件と手順は 04_deployment-procedure.md 4.3）。
- Apple Developer Program の登録の区分（個人 / 組織）は、ストアにアプリを登録する前にユーザーが決める（個人はストアに個人名が出る。組織は D-U-N-S 番号が要る）。

### ADR-004: Web は「静的ファイル＋/api の転送」で配り、Cloudflare に置く

**決定:** Web の配信は「`/*` は静的ファイル（見つからないパスは `_shell.html`）、`/api/*` は API へ転送」という形に固定する。`index.html` はビルド時に作るランディング（ADR-002）で、SPA の殻は `_shell.html` に出力される。置き場所は Cloudflare の Worker（静的アセット機能）で、`/api/*` と、静的アセットに無い画面のパス（`_shell.html` を返す）だけ Worker のコード（`apps/web/worker/index.ts`）が動く。静的アセットのセキュリティヘッダーと、`/.well-known/apple-app-site-association` の Content-Type は、静的アセットの `_headers` ファイル（`apps/web/public/_headers`）で付ける（Worker のコードを動かさない）。スマホも同じ `https://{DOMAIN}/api` を使う。独自ドメインの DNS も Cloudflare に置く。

Cloud Run は IAM の認証をかけない（誰でも呼べる設定）にし、代わりに Worker が付ける共有シークレット（`X-Moonx-Proxy-Secret`）を API が確かめて、直接のアクセスを拒否する（2章 通信フロー 3）。例外は `/api/health`（監視）と `/internal/*`（OIDC で確かめる）。

**理由:** ユーザーの希望は「後から簡単に変えられること」。配信の役割をこの2つに限れば、どの配信先（Cloudflare、Netlify、nginx など）にも同じ形で移れて、アプリのコードは変わらない。Web と API が同じオリジンになるので、ログインの Cookie が第三者 Cookie にならず、Safari でも動き、CORS も要らない。Cloudflare の無料枠で静的アセットの配信は回数無制限、Worker は1日10万回まで（API の呼び出しだけが数える）で足りる。

**トレードオフ:** Google Cloud と Cloudflare の2つのアカウントを使う。最初の案だった Firebase Hosting は、Cloud Run へ転送するときに `__session` という名前以外の Cookie を落とすため、Better Auth のセッションと Google ログインの状態の Cookie が届かず使えないと分かり、やめた（2026-10-01）。Google Cloud のロードバランサ＋Cloud CDN は月 $18 程度かかり予算を超える。Cloud Run から Web も配る案は、API が休んでいると画面の表示まで数秒待たせるのでやめた。Cloud Run を IAM で守り、Worker が ID トークンを付けて呼ぶ案は、Worker に Google Cloud のサービスアカウントの鍵を置くことになるのでやめた。その代わり、共有シークレットを Secret Manager と Worker の2か所でそろえてローテーションする手間がかかる（05_operation-runbook.md）。

### ADR-005: API は ElysiaJS（Bun）（ユーザー指定）

**決定:** `apps/api` は ElysiaJS を Bun で動かす。ルートはドメイン（ワークスペース・アイデア・検証・プランなど）ごとのプラグインに分け、認証はプラグインの `derive` で行い、ワークスペースとロールの確認は各ハンドラーが `resolveScope` と `requireOwner` / `requireEditor` / `requireWritable` で行う（7.1 の表は表駆動の結合テストで確かめる）。入出力のスキーマは Zod v4（Standard Schema として Elysia に渡す）。Better Auth はハンドラーを `/api/auth/*` にマウントする。

**理由:** ユーザーが ElysiaJS を指定し、「Elysia の仕組み」（Eden Treaty の型共有）を使いたいとした。Bun で速く起動するので、Cloud Run の0台からの立ち上がりが短い。

**トレードオフ:** Bun 前提なので、Node.js 前提のライブラリで動かないものがまれにある（導入時に確かめる）。Express や Hono より利用者が少なく、情報も少ない。Zod を Standard Schema で使う機能は新しいため、OpenAPI の出力に問題があれば、API の境界だけ Elysia の `t`（TypeBox）に切り替える（共有の Zod スキーマとは変換で合わせる）。

### ADR-006: 通信は REST、クライアントは Eden Treaty（ユーザー指定）

**決定:** API は `/api/v1` の下の REST（JSON、項目名は camelCase）。Web とスマホは Eden Treaty（`treaty<App>()`）で型付きで呼ぶ。仕様書は `@elysiajs/openapi` で出す（staging は `/api/docs` で読める。production は出さない）。常時接続（WebSocket・SSE）は使わず、通知の未読数は取りに行く（2章 通信フロー 7）。

**理由:** Web とスマホの2つのクライアントが同じ API を使うので、言語に依存しない REST にし、型は Eden で共有する。ユーザーが Elysia の仕組み（Eden）を使いたいとした。共同編集の即時反映は Non-Goal なので、常時接続の運用コストに見合わない。

**トレードオフ:** Eden の型は `apps/api` の `App` 型に依存するため、API の変更でクライアントの型エラーがすぐ出る（利点でもある）。スマホの古い版が残る間は、API の互換性を壊せない。壊す変更は `/api/v2` を作るか、項目の追加だけにする（受け取る側は知らない項目を無視する）。

### ADR-007: API は Cloud Run（asia-southeast1）（ユーザー指定）

**決定:** API のコンテナ（`oven/bun` の公式イメージがベース）を Cloud Run で動かす。リージョンは asia-southeast1（シンガポール。利用者のいるフィリピンと Neon に近い）。最小0台・最大3台、1 vCPU・1 GiB（PDF の作成に余裕を持たせる）、同時リクエスト 40、タイムアウト 60秒、CPU はリクエストの間だけ割り当てる。イメージは Artifact Registry（最新の30個と、90日以内のものを残し、それより古いものを自動で消す）。

**理由:** ユーザーが Cloud Run を選んだ。コンテナなので Bun と PDF のライブラリが制約なく動き、無料枠（月200万リクエスト、CPU 18万秒）に試運転は十分収まる。

**トレードオフ:** 0台から起動するときに数秒待つ（コールドスタート）。最初の利用者が遅く感じたら、Terraform の `min_instance_count` を1にする（常に1台。月数ドルかかるので、予算と相談して決める。時間帯での自動の切り替えは作らない）。Secret Manager は無料枠（有効な版6つ）を超えるため、月 $1 程度かかる。昇格の PR の revert で戻せるのは、イメージが残っている範囲（最新の30個か90日以内）まで。

### ADR-008: DB は Neon。ただし標準の PostgreSQL として使う

**決定:** Neon（PostgreSQL 17、リージョン AWS ap-southeast-1）の無料プランを使う。プロジェクト `moonx` の中に `production` と `staging` のブランチを作る。local は Docker Compose の PostgreSQL 17（`make db-up`）で、テストは同じサーバーの別の DB（`DATABASE_URL_TEST`）を作り直して使う。**Neon 独自の機能（専用のサーバーレスドライバ、Data API、Neon Auth）は使わない。** 接続は標準の PostgreSQL プロトコル（postgres.js）で、API は Neon のプール接続（PgBouncer。`prepare: false`）を使い、マイグレーションはプールを通さない接続を使う。

**理由:** 無料で、使われないときは休むので $0 で運用できる。ユーザーが「Neon を後から変えられるようにしたい」とした。接続文字列（`DATABASE_URL`）以外に Neon への依存を作らなければ、Cloud SQL・Supabase・自前の PostgreSQL へ、データを書き出して移し `DATABASE_URL` を変えるだけで乗り換えられる。

**トレードオフ:** しばらく使われないと DB が休み、最初の応答が1秒ほど遅れる。無料プランの容量（0.5 GB）と計算時間の枠は**プロジェクト単位**で、staging のブランチと分け合う。変更履歴（`change_history`）が増え続けると足りなくなる可能性がある（05_operation-runbook.md で容量を監視する。超えそうなら Neon の有料プランか、別の PostgreSQL へ移る）。ブランチは Neon の機能だが、staging 用の別 DB で代わりがきくので、乗り換えの妨げにはならない。local を Docker にするのは、オフラインで開発でき、Neon の無料枠を使わず、テストの DB を何度でも作り直せるため（Docker が要る。Neon のプール接続（PgBouncer・`prepare: false`）の挙動は local では再現できないので staging で確かめる）。

### ADR-009: ORM は Drizzle、入力チェックは Zod v4

**決定:** `packages/db` に Drizzle のスキーマ（6章のコード）を置き、drizzle-kit でマイグレーションの SQL を作る。ドライバは postgres.js。入力チェックは Zod v4 で `packages/schemas` に置き、API（Elysia）とフォーム（Web もスマホも TanStack Form）が同じスキーマを使う。DB の中身を手で見るときは Drizzle Studio（`make db-studio`）を使う。

**理由:** Drizzle は TypeScript でスキーマを書け、生成する SQL が素直で読める（乗り換えのときも普通の SQL として持ち出せる）。Better Auth に Drizzle 用のアダプターがある。Zod は Web・スマホ・API の全部で同じ入力チェックを使える。

**トレードオフ:** Prisma より抽象度が低く、複雑な集計は SQL に近い書き方になる。Drizzle の破壊的な変更に追従する必要がある（バージョンを固定し、上げるときは差分を確かめる）。

### ADR-010: 認証は Better Auth。Google ログインを最初から入れ、招待制をサーバーで強制する（ユーザー指定）

**決定:** Better Auth を API に組み込む（Drizzle アダプター、テーブルは6章）。ログインはメール＋パスワードと Google。プラグインは Expo（スマホのセッション）。回数制限は本体の設定（`rateLimit`）で有効にする（保存先は DB。ADR-029）。招待制は次のとおりサーバーで強制する:

- メール＋パスワードの新規登録は Better Auth の公開エンドポイントを閉じ（`emailAndPassword.disableSignUp`）、moonx の `POST /api/v1/invitations/by-token/{token}/sign-up`（5章 U5）だけから作る。メールは招待のメールに固定する。
- Google の新規登録は、招待の画面からだけ `requestSignUp` 付きで始める（`disableImplicitSignUp`）。さらにユーザーを作る直前のフック（`databaseHooks.user.create.before`）で、**そのメールあての有効な招待（pending・期限内）があること**を確かめ、無ければ拒否する。
- ユーザーを作った直後のフックで、個人用ワークスペースを作る（design-spec 5章）。
- 運営者は `make admin-create EMAIL=...` が発行する招待（`invitations.grants_admin = true`。ワークスペースなし）から登録・受諾した人だけがなる（`is_admin`。design-spec 9.2 の既定案）。AD9 のワークスペースなしの招待は `grants_admin = false` で、登録した人は個人用ワークスペースだけを持つ一般の利用者になる。同じメールあての有効なワークスペースなしの招待が AD9 で出ている状態で `make admin-create` を再実行すると、その招待に `grants_admin = true` を付けて新しいリンクを出す（前のリンクは無効になる）。`grants_admin` を付ける API は無い。
- 停止したユーザー（`status = suspended`）はセッションを消し、ログインのフックで拒否する。

**理由:** ユーザーが Better Auth で最初から Google ログインを入れると指定した。ライブラリなので $0 で、ユーザー情報は自分の DB に残り、乗り換えの妨げにならない。招待制のような独自の決まりを、フックで確実に組み込める。

**トレードオフ:** 認証の画面（ログイン・新規登録・パスワード再設定）は自分で作る（design-spec 2 の仕様どおり）。Google の OAuth クライアントを環境ごとに作り、同意画面の設定と、スマホから戻るディープリンクの設定が要る。local の `BETTER_AUTH_URL`（localhost）では実機やエミュレータから Google ログインが戻れないので、スマホの Google ログインは staging で確かめる。Apple の審査基準 4.8 への対応は ADR-003 のとおり（Sign in with Apple は足さない）。Better Auth の更新でセキュリティ修正が出たら速やかに上げる。

### ADR-011: サーバー側のキャッシュは置かない

**決定:** Redis などのサーバー側のキャッシュは置かない。クライアントは TanStack Query でデータを持ち（画面の移動ではキャッシュを先に出し、裏で取り直す。保存したら関係するキーを無効にする）、API の応答は `Cache-Control: no-store`（個人のデータのため）。静的アセットは Cloudflare の CDN が持つ（ファイル名にハッシュを付けて長期キャッシュ）。Better Auth の回数制限は DB に記録する。

**理由:** 利用者は BCDX の数人で、データ量も小さい。複数人が同じアイデアを編集するので、サーバー側のキャッシュは古い内容を見せる危険の方が大きい。重く見える計算（損益分岐・確認項目）は純粋関数で一瞬で終わる。マネージドの Redis（Memorystore）は月 $30 を超えて予算に合わない。

**トレードオフ:** DB が休んでいた後の最初の応答の遅れ（ADR-008）は、キャッシュでは解決しない。**入れる条件**: ダッシュボード（5）の応答が p95 で 1秒を超えるようになったら、まず SQL とインデックスを見直し、それでも足りなければ Upstash Redis の無料枠で集計結果を短時間（30秒程度）キャッシュする。

### ADR-012: Pitch Deck の PDF は API サーバーで作る

**決定:** `GET /api/v1/plans/{planId}/pitch-deck.pdf` で、API サーバーが react-pdf（`@react-pdf/renderer`）を使って PDF を作って返す。スライドの中身は `packages/domain` の `buildPitchDeck()`（プランと検証からスライドの素材を組み立てる関数）が作り、画面の表示（Web・スマホ）と PDF が同じ素材を使う。フォントは 06_design-tokens.json の PDF 用のフォント（`semantic.print`。日本語を含む代替フォントを含む）をコンテナに入れ、使った文字だけを PDF に埋め込む。PDF は常にライトの配色（design-spec 6.14）。フォントは npm の `@expo-google-fonts/{fraunces,noto-sans,noto-sans-jp}`（SIL OFL 1.1。TTF）を API の依存に含めてコンテナに入れる。react-pdf は `font-variant-numeric` を持たないので、PDF では 06 の等幅数字（tabular）を適用できない。

**理由:** Web とスマホで同じ PDF を作るには、作る場所を1つにするのが確実。ブラウザ・スマホのどちらで作っても、日本語のフォントの埋め込みと16:9のページの再現がそろわない。react-pdf は Chromium を使わないので、コンテナが軽く、0台からの起動も遅くならない。

**トレードオフ:** 画面のスライド（React / React Native）と PDF（react-pdf）で描画のコードが2つになる。見た目のずれは、素材とレイアウトの数値をトークンにまとめて減らす。PDF の作成は API の CPU を使うので、同時に大量に作られると遅くなる（利用者が少ないうちは問題にならない）。

### ADR-013: メールは Resend、独自ドメインを持つ

**決定:** 招待とパスワード再設定のメールは Resend の HTTP API で送る（無料枠: 月3,000通）。送信元のドメインとして独自ドメイン `{DOMAIN}` を Cloudflare Registrar で取り、SPF・DKIM・DMARC を設定する。staging は `MAIL_ALLOWLIST` に入っているメールにだけ送る。

**理由:** 招待制のアプリなので、任意のメールアドレスに確実に届く必要がある。Resend は独自ドメインを確認しないと任意の宛先に送れない。ドメインは年 $10〜15 で予算に収まる（ストアの登録費を予算から外したため）。

**トレードオフ:** ドメインの更新を忘れるとメールもアプリも止まる（自動更新を有効にする）。Resend の無料枠は1日100通までなので、一般公開で招待が増えたら有料プランを検討する。捨てた案: Amazon SES（安いが AWS のアカウントと送信制限の解除の申請が増える）、SendGrid・Postmark（無料枠が小さいか無い）。

### ADR-014: 期限の通知は Cloud Scheduler から API を呼ぶ

**決定:** Cloud Scheduler（無料枠: 3ジョブ）のジョブ `moonx-{env}-due-notifications` が、1時間ごと（毎時0分）に `POST /internal/cron/due-notifications` を OIDC トークン付きで呼ぶ。API は、担当者のタイムゾーン（`users.timezone`）で**朝8時以降**になっている担当者について、「期限の3日前・当日・期限切れ」になった実行管理の項目の通知を作る（design-spec 6.13）。同じ段階の通知は `(execution_item_id, due_date, due_stage)` の一意制約で二重に作らない。

**理由:** Cloud Run は常駐しないので、定期実行は外から呼ぶ必要がある。Cloud Scheduler は同じ Google Cloud の中で完結し、OIDC で呼び出し元を確かめられる。

**トレードオフ:** 毎時の実行なので、朝8時ちょうどではなく8時台に届く。ジョブが失敗しても、次の回がその時点の段階の通知を作る（条件は「朝8時を過ぎていて、その段階をまだ通知していない」）。飛ばした前の段階は作らない（期限が昨日になった項目には「期限切れ」だけを出し、「3日前」「当日」は出さない）。捨てた案: Cloudflare Worker の Cron Triggers（Cloud Run まで共有シークレットで呼ぶことになり、OIDC で確かめられない）、GitHub Actions の schedule（実行が数十分遅れることがある）、Cloud Run jobs（API と別のコンテナの起動が要り、処理が API のコードと分かれる）。

### ADR-015: IaC は Terraform（ユーザー指定）

**決定:** Google Cloud の資源と Cloudflare の DNS（メールのレコード）を Terraform で管理する（`infra/terraform/modules/` と `envs/{shared,staging,production}/`。状態は Cloud Storage のバケット `{GCP_PROJECT_ID}-tfstate`）。`shared` は環境をまたぐ資源（Artifact Registry・Workload Identity Federation・バックアップのバケット・予算アラート・メールの DNS・Cloudflare のゾーンの設定（HSTS・`/api/auth/*` のレート制限ルール））、`staging` / `production` は環境ごとの資源（2章「インフラ管理」）。Cloud Run のイメージは CI が出すので、Terraform は `image` の変更を無視する（`lifecycle.ignore_changes`）。初回は、イメージとシークレットの値が無いので次の順に apply する: ① `ENV=shared`（Artifact Registry など）、② 環境ごとに変数 `bootstrap = true` で apply（シークレットの入れ物・サービスアカウント・写真のバケットだけを作り、Cloud Run と Scheduler は作らない）、③ シークレットの値を入れ、`make build-api-image` で最初のイメージを上げる、④ `bootstrap = false` と変数 `api_image`（最初のイメージ。以後は `ignore_changes` で無視される）で apply し、Cloud Run と Scheduler を作る。`CRON_OIDC_AUDIENCE` はプロジェクト番号から組み立てる（2章「環境変数」）。Cloudflare の Worker と Web のドメインは `wrangler.jsonc`、スマホのビルドは `eas.json` で管理する。コンソールで管理するもの（Terraform の外）: Neon、Google の OAuth の同意画面とクライアント、Sentry のプロジェクト、Resend のドメインと API キー、GitHub の環境と承認の設定、EAS の環境変数とストアの鍵、App Store Connect と Google Play Console。手順は 03_dev-setup.md。

**理由:** ユーザーが Terraform を選んだ。環境を作り直せて、設定の変更をレビューできる。

**トレードオフ:** Terraform の学習コストがある。上のコンソールで管理するものは Terraform の外に残るので、手順を 03_dev-setup.md に書いて補う。

### ADR-016: staging と production の2環境。バージョン宣言ファイルで昇格する（ユーザー指定）

**決定:** 環境は staging と production（2章「環境と命名」）。ブランチは GitHub Flow（`main` ＋作業ブランチ、マージは常に squash）。`main` に入ると CI がテストし、API のイメージ（タグはコミット SHA。両方の環境で同じイメージを使う）を作る。デプロイは `deploy/{env}/version` にコミット SHA を書いた PR（昇格の PR。ブランチ名 `promote/{env}-<SHA の先頭7文字>`）をマージしたときに GitHub Actions が行う（DB のマイグレーション → API → Web の順）。Web はビルドに環境の値（`VITE_*`）を埋め込むので、デプロイのときにその SHA から環境ごとにビルドする（`make build-web ENV=...`）。戻すときは昇格の PR を revert する。スマホは同じ昇格で出す。アプリの `runtimeVersion` は Expo の fingerprint の方針にし、`deploy.yml` はその SHA の fingerprint が、その環境で最後にビルドしたアプリと同じなら `make mobile-update`（JS だけ）、違えば `make mobile-build`（EAS Build と Submit。ストアの審査を待つ）を選ぶ。

**理由:** ユーザーが staging ＋ production を選んだ。BCDX の実データに触れずに確かめられる。どの環境にどの版が出ているかが、リポジトリのファイルで分かる。マージを常に squash にするのは、`main` の1コミットが1つの PR になり、昇格と revert をコミット1つの単位で扱えるため。

**トレードオフ:** 昇格の PR の分だけ手順が増える。DB のマイグレーションは戻せないので、「追加してから使い、使わなくなってから消す」の2段階で書く（04_deployment-procedure.md）。スマホは、戻し先の fingerprint が今のアプリと違うと EAS Update では戻せず、ストアの審査を待つ（ストアに出たアプリそのものは戻せないので、直した版を出す）。

### ADR-017: モノレポは Bun workspaces ＋ Makefile

**決定:** Bun workspaces で `apps/*` と `packages/*` をまとめる。パッケージ名は `@moonx/*`。タスクの実行は Makefile に集め（2章「make ターゲット」）、CI もデプロイを含めて Makefile のターゲットを呼ぶ（GitHub Actions のワークフローは `ci.yml`（PR）・`build.yml`（`main`）・`deploy.yml`（昇格）・`db-backup.yml`（定期のバックアップ））。`bunfig.toml` で `linker = "hoisted"` を指定する。

**理由:** API が Bun で動くので、パッケージ管理も Bun にそろえる。Expo と Vite も Bun のワークスペースで動く。Makefile を正にすれば、ドキュメント・CI・CLAUDE.md がターゲット名だけを参照できる。hoisted にするのは、Expo の Metro と jest-expo が `node_modules` の標準の配置を前提にしており、Bun の隔離された配置では `@react-native/*` の変換が外れてテストが落ちるため。

**トレードオフ:** Turborepo のような差分ビルドのキャッシュは無い。ビルドが遅くなったら導入を考える。

### ADR-018: デザインシステムは Adobe Spectrum の仕組み、見た目は Hermes Teal（ユーザー指定）

**決定:**

- **参考にするもの**: Adobe Spectrum（Spectrum 2）の仕組みを取り入れ、見た目は Hermes Teal にする（ユーザーと合意、2026-10-01）。取り入れる範囲は design-spec 4.4「デザインシステムの参考」、部品の一覧は design-spec 4.5 が正。この ADR は、それを実装する方法（トークンの階層・生成・ライト / ダーク）を決める。
- **トークン**: 正は `docs/06_design-tokens.json`（DTCG 形式）。Spectrum の3つの階層を、DRAFT の2層に次のように対応させる: Spectrum の global → `primitive`、alias（用途の名前）→ `semantic`、component（部品ごとの寸法）→ `semantic.scale.{medium,large}.component`。実装が参照してよいのは `semantic` だけ。`semantic` の値はエイリアスだけで、たどると必ず `primitive` に着く（書体のスタイルや密度は `semantic.scale.medium` を参照し、生成のときに large へ差し替える）。
- **生成**: `make tokens` が `packages/ui-tokens` に次を生成する（変換は自前の小さなスクリプト。Style Dictionary は使わない）。
  - Web: vanilla-extract のテーマ（`createGlobalThemeContract` の型付きの契約と、ライト / ダーク × medium / large の値。CSS 変数として出る）。画面のスライド表示（Slide）は `semantic.print`（ライト固定）を参照する
  - スマホ: Unistyles のテーマ（ライト / ダーク）とブレークポイント。large のスケールを既定にする
  - PDF: react-pdf 用の定数（常にライト。`semantic.print`）
- **ライト / ダーク**: セマンティック層の `light` / `dark` で切り替える。Web は `<html data-theme>` と `prefers-color-scheme`、スマホは Unistyles の適応テーマ（4 アカウント設定の System / Light / Dark に従う）。
- **スケール（Web）**: 既定は `medium`。タッチ操作が主の端末（`@media (pointer: coarse)`）は `large` にする。`<html data-scale="medium|large">` で固定でき、固定が優先される。タッチパネル付きのノート PC も `pointer: coarse` に当たるときは `large` になる。
- **生成器が持つ値**: スマホの等幅書体（iOS は Menlo、Android は monospace。06 の `primitive.font.family.mono` の説明文にだけ書かれていて DTCG の型が無い）と、Unistyles が要求する先頭のブレークポイント `mobile: 0` は、06 ではなく生成のスクリプトが持つ。
- **アイコン**: Lucide（`lucide-react` / `lucide-react-native`）にそろえる。大きさは `semantic.scale.{medium,large}.component.icon.size`、線の太さは `semantic.icon` のトークン。

**理由:** ユーザーがデザインシステムの参考に Adobe Spectrum を指定し、見た目は Phase 2 で決めた Hermes Teal を保つことを選んだ。Spectrum は部品・大きさ・スケール・密度・アクセシビリティの決まりが体系化されていて、Web とスマホで同じ考え方を使える。React Aria（ADR-025）は Spectrum を作っている Adobe の headless の部品なので、振る舞いの決まりがそのまま合う。スケールと密度の考え方で、design-spec 4.4 の「画面で密度を使い分け、スマホは一段ゆったり」をそのまま表せる。Lucide は Web（`lucide-react`）とスマホ（`lucide-react-native`）に同じ絵柄の版があり、線の太さと大きさを props で変えられる（Spectrum の Workflow アイコンは使わないと合意した）。変換を自前のスクリプトにするのは、出力が3種類（vanilla-extract・Unistyles・react-pdf）に限られ、Spectrum の階層（scale・density・light/dark）の差し替えを素直に書けるため（Style Dictionary は設定と拡張の方が大きくなる）。

**トレードオフ:** Spectrum の部品をそのまま使う（React Spectrum S2）案に比べ、部品の見た目を自分で作る手間がかかる。アイコンの体系は Spectrum とずれる。S2 は配色と書体をほぼ変えられないので、Hermes Teal を保つためにこの手間を受け入れた。生成スクリプトを保守する必要がある。生成物はコミットし、`make tokens` の実行忘れを CI で検出する（生成し直して差分が出たら失敗）。

### ADR-019: 同時編集は項目単位の楽観ロック

**決定:** 保存の単位の項目（回答・行・数字・アイデアの概要・プランのヘッダ）は `lock_version` を持つ。更新の API は、クライアントが持っている `lockVersion` を受け取り、DB の値と違えば **409 `CONFLICT`** と相手の内容（値・保存した人・日時）を返す。利用者が「自分の内容で上書きする」を選ぶと、クライアントは `force: true` で送り直す。どちらの内容も変更履歴に残る（design-spec 6.0.2）。

まとめて反映する操作（AI 取り込みの X3）は、1つでも古い `lockVersion` があれば何も変えずに **409 `CONFLICT_MULTI`** と衝突した項目の一覧を返す（全部反映するか、何もしない）。

**理由:** 共同編集の即時反映は Non-Goal。項目が細かいので衝突はまれで、衝突したときだけ利用者に選ばせれば足りる。

**トレードオフ:** 同じ欄を同時に打っている2人には、後から保存した側にだけ衝突が出る。

### ADR-020: 変更履歴はアプリのコードで、同じトランザクションの中で書く

**決定:** 変更履歴の対象（design-spec 6.0.5）を更新する API は、本体の更新と `change_history` への書き込みを1つのトランザクションで行う。共通の関数 `withHistory(tx, { container, workspaceId, sectionKey, target: { type, id, key }, actor: { userId, client, source, batchId } }, mutate)` を通す。`mutate` は `{ result, before, after }` を返し、更新で `before` と `after` が等しければ履歴を書かない（値を変えない保存は版も上げない）。DB のトリガーは使わない。

**理由:** 変更の種類（手入力・AI 取り込み・元に戻す・テンプレートの移行・複製・下書き作成）と、誰が変えたかはアプリしか知らない。トリガーにすると、乗り換えのときに DB 側のロジックを持ち出す必要が出る。

**トレードオフ:** 履歴を書き忘れる API を作る危険がある。対象のテーブルを更新するリポジトリ関数を `withHistory` 経由に限り、結合テストで「更新したら履歴が1件増える」を確かめる。

### ADR-021: 保存できなかった入力はクライアントの送信待ちの列で再送する

**決定:** 自動保存（design-spec 6.0.2）が失敗したら、項目ごとに最新の入力だけを送信待ちの列に残し、再接続したとき・定期的に再送する。Web は IndexedDB、スマホは expo-sqlite に置く。送信待ちの列の項目は `lockVersion` を持ち、再送で衝突したら ADR-019 の選択を出す。

**理由:** design-spec で「保存できなかった入力は端末に残し、再接続したら送る」と決めた。スマホで電波が途切れても、書いた回答を失わない。

セッションが切れた（401）ときは列を残し、同じユーザーでログインし直したときだけ再送する（違うユーザーなら消す）。

**トレードオフ:** 端末に回答の内容が残る（ログアウトしたら消す）。オフラインでの閲覧（読み込み済みでない画面）は対象外。捨てた案: localStorage・AsyncStorage（容量が小さく、書き込みが同期で、項目ごとの更新に向かない）、MMKV（速いが、項目の一覧と並べ替えに SQL が使える expo-sqlite の方が扱いやすい）。

### ADR-022: テストとリントのツール

**決定:** Biome（リントと整形）、TypeScript の型チェック、`packages/domain` と `apps/api` は Bun test（API は実際の PostgreSQL に対する結合テスト）、`apps/web` と `packages/ui-web` は Vitest ＋ Testing Library（部品は `@react-aria/test-utils` も）、`apps/mobile` と `packages/ui-native` は Jest（jest-expo）＋ React Native Testing Library（v13。v14 は React 19.3 が要り、Expo SDK 57 が固定する React 19.2 と二重になる）、Web の E2E は Playwright、アクセシビリティの検査は axe（`@axe-core/playwright`）。画面にスタイルを書かない決まり（ADR-025）は Biome の `noRestrictedImports`、JSX の中の生の文字列（9章）は Biome の規則で足りない分を CI の小さな検査スクリプトで見つける。詳細は10章。

**理由:** 実行環境（Bun・Vite・React Native）ごとに標準のツールを使うのが、一番つまずきが少ない。Biome は1つのツールで速い。

**トレードオフ:** テストのツールが3つになる。テストの書き方の違いは各パッケージの README で補う。

### ADR-023: 監視とログは Sentry と Cloud Logging

**決定:** エラーは Sentry（無料枠。プロジェクトは `moonx-web` / `moonx-mobile` / `moonx-api` の3つ）に送る。API のログは1行1つの JSON（`severity`・`message`・`requestId`・`userId`・`route`・`status`・`latencyMs`・`client`・`appVersion`）で標準出力に書き、Cloud Logging が集める。リクエスト ID は Worker で付け（`X-Request-Id`）、エラーの応答と Sentry にも入れる。死活確認は Cloud Monitoring の稼働時間チェック（`/api/health`）。Worker の転送の失敗は Cloudflare の Workers Logs で見る。詳細は11章。

**理由:** どれも無料枠で足りる。リクエスト ID で、利用者が見たエラーとログ・Sentry をつなげられる。

**トレードオフ:** Sentry の無料枠（月5,000件）を超えると届かなくなる。同じエラーが大量に出たら Sentry の側で間引く。捨てた案: Google Cloud の Error Reporting（無料だが、Web とスマホのエラーとソースマップを扱えず、API だけになる）。

### ADR-024: プロフィール写真は Cloud Storage

**決定:** 4 アカウント設定の写真は、API が受け取って sharp（libvips）で 512×512 の WebP に縮め、Cloud Storage のバケット `moonx-{env}-avatars`（公開読み取り、ファイル名は推測できない乱数）に置く。URL を `users.avatar_url` に入れる。

**理由:** 写真は任意で小さいので、費用は月 $0.1 未満（Cloud Storage の無料枠は米国の3リージョンだけなので、asia-southeast1 のバケットには少しかかる）。

**トレードオフ:** 公開読み取りなので、URL を知っていれば誰でも見られる（プロフィール写真なので許容する。乱数のファイル名で推測を防ぐ）。sharp はネイティブのライブラリなので、`oven/bun` のイメージで動くことを最初に確かめる（動かなければ、スマホと Web の側で縮めてから送る）。捨てた案: Cloudflare R2（無料枠はあるが、API から書き込む鍵を Cloud Run に置き、もう1つの保存先を管理することになる）、クライアントだけで縮める（Web とスマホで2回作ることになる）。

### ADR-025: 部品は headless の部品＋自前のスタイル。Tailwind は使わない（ユーザー指定）

**決定:**

- **Web（`packages/ui-web`）**: 振る舞いとアクセシビリティは **React Aria Components**（キーボード操作・フォーカスの管理・ARIA・国際化された数値と日付の入力）。見た目は **vanilla-extract**（`*.css.ts` に型付きで書き、ビルド時に静的な CSS になる。実行時の処理なし）。大きさや種類の出し分けは `@vanilla-extract/recipes` の `recipe()`（例: `size: S | M | L | XL`、`variant: accent | primary | secondary | negative`）。React Aria の状態は `data-*` 属性（`[data-hovered]`・`[data-pressed]`・`[data-focus-visible]`・`[data-disabled]` など）で書く。Popover と Tray の切り替えは、幅がトークンの `semantic.breakpoint.tablet` より狭いときに Tray（下からのシート）にする共通の部品で行う。
- **スマホ（`packages/ui-native`）**: 振る舞いは **@rn-primitives**（Dialog・Popover・Select・Tabs・Checkbox・RadioGroup・Switch・Tooltip・Accordion など、見た目の無い部品）と、React Native 標準のアクセシビリティの属性（`accessibilityRole`・`accessibilityState` など）。トレイ（ボトムシート）は **@gorhom/bottom-sheet**。見た目は **react-native-unistyles**（v3。`StyleSheet.create` と同じ書き方でテーマとブレークポイントを使え、`variants` で大きさと種類を出し分ける）。
- **部品の名前と API**: design-spec 4.5 の Spectrum の名前にそろえ、Web とスマホで同じ props（例: `<Button variant="accent" size="M">`、`<StatusLight variant="positive">`）にする。props の型は `packages/ui-web` と `packages/ui-native` のそれぞれで定義し、共通の部分（`size`・`variant` などの値の型）は `packages/ui-tokens` に手で書いて置く（`packages/ui-tokens/src/generated/` が `make tokens` の生成物、`src/types.ts` などそれ以外は手で書くファイル）。
- **画面にスタイルを書かない**: `apps/web` と `apps/mobile` の画面は、部品と、レイアウトの部品（`Flex`・`Grid`・`View` 相当。間隔はトークンの名前だけを受け取る。例: `gap="space-300"`）の組み合わせで作る。画面で `@vanilla-extract/css`・`StyleSheet`・Unistyles を直接使うこと、`style` 属性に値を書くことは、Biome の `noRestrictedImports` と CI の検査で禁止する。必要な見た目が無ければ、design-spec 4.5 に部品を足してから `packages/ui-*` に作る。
- **Tailwind・NativeWind・CSS-in-JS の実行時ライブラリは使わない。**

**理由:** ユーザーが「Tailwind のクラスを画面に直接書かない」「React Aria などの headless の部品を使う」と指定した。振る舞いを実績のある部品に任せると、ダイアログのフォーカスの閉じ込め・キーボード操作・スクリーンリーダー対応を自分で作らずに済む（design-spec 4.1 の設問フォームのキーボード操作、6.0.6 のモーダルの決まり）。見た目を部品の中に閉じ込めると、画面ごとのばらつきが出ず、Spectrum を参考にしたデザインシステム（ADR-018）を守りやすい。vanilla-extract はトークンを型として扱えるので、`semantic` 以外の値を使うと型エラーになる。

**トレードオフ:** React Aria はスマホ（React Native）では動かないので、Web とスマホで振る舞いの部品が別になる（@rn-primitives は React Aria より機能が少なく、NumberField・DatePicker・ComboBox はスマホ側で自作する部分がある）。部品のライブラリを最初に作る手間がかかり、Phase 5 の最初のステップで主要な部品（Button・TextField・TextArea・NumberField・Dialog / Tray・StatusLight・TableView など）をそろえる必要がある。vanilla-extract の Vite プラグインを TanStack Start のビルドに組み込む（動かない場合は、部品の CSS を `packages/ui-web` で事前にビルドして読み込む）。Unistyles v3 は New Architecture と開発ビルドが前提。

### ADR-026: i18n は i18next。英語だけで始め、多言語にできる作りにする

**決定:** i18next ＋ react-i18next を Web とスマホで使い、API も同じカタログ（`packages/i18n`）を使う（通知の文・PDF の見出し・AI 書き出しの見出し・メール）。UI は英語だけで始め、文言はすべてカタログに置く。日付・数値・金額の書式は `Intl` を使う `packages/i18n` の関数に集め、初期は en-PH に固定する。詳細は9章。

**理由:** design-spec 1.2 で「UI は英語のみ。ただし多言語化できる作りは残す」と決めた。後から文言をカタログへ移すのは手間が大きいので、最初から分けておく。i18next は Web・React Native・サーバーのすべてで同じライブラリとカタログを使え、複数形の規則も持つ。

**トレードオフ:** 英語だけのうちは、カタログのキーを引く手間が増えるだけに見える。捨てた案: FormatJS（react-intl。ICU の書式は強いが、サーバーとスマホでの使い方がそろえにくい）、Lingui（コンパイルの手順が増える）。スマホの JavaScript エンジン（Hermes）の `Intl` の対応は、en-PH の書式で最初に確かめる。

### ADR-027: CI/CD は GitHub Actions、Google Cloud へは Workload Identity Federation

**決定:** CI/CD は GitHub Actions（ワークフローは ADR-017）。Google Cloud へは Workload Identity Federation で入り、サービスアカウントの鍵を作らない。GitHub の環境は `staging`・`production`（デプロイに承認を要する）・`production-backup`（バックアップ専用。承認なし）。依存の脆弱性は Dependabot のアラートで知る。シークレットの置き場所は次の4つに分ける: Cloud Run が使うものは Secret Manager、Worker が使うものは `wrangler secret`、CI が使うものは GitHub の環境かリポジトリ（2章「CI のシークレットと変数」）、スマホのビルドとストアの提出に使うものは EAS（環境変数とストアの鍵）。

**理由:** コードが GitHub にあり、PR・レビュー・昇格の PR とそのまま組み合わせられる。Workload Identity Federation なら、漏れると困る長期の鍵をどこにも置かない。シークレットは、それを使う実行環境のそばに置くのが一番漏れにくい。

**トレードオフ:** 非公開のリポジトリでは GitHub Actions の無料の実行時間に上限がある（スマホのビルドは EAS で動くので数えない）。シークレットの置き場所が4つに分かれるので、ローテーションの手順を 05_operation-runbook.md にまとめる。捨てた案: Cloud Build（Google Cloud の中で完結するが、Cloudflare と EAS への デプロイと PR の連携が GitHub Actions より手間）。

### ADR-028: DB のバックアップは毎日の pg_dump

**決定:** 定期実行の GitHub Actions（`db-backup.yml`。環境 `production-backup`）が毎日1回、production の DB を読み取り専用のロール `moonx_backup_ro` で `pg_dump -Fc` し、`gs://{GCP_PROJECT_ID}-moonx-backups/production/<日付>.dump` に上げる（`make db-backup ENV=production`）。バケットは30日で自動削除する。戻し方と、戻す練習（頻度を含む）は 05_operation-runbook.md。

**理由:** Neon の無料プランの履歴からの復元は期間が短い。標準の `pg_dump` なら、DB を乗り換えても同じ方法で取れて戻せる（ADR-008）。

**トレードオフ:** 失うかもしれないのは最大で約1日分。GitHub Actions の定期実行は遅れることがある。バックアップの取得で Neon の計算時間を使う。削除したアカウントの情報は、バックアップから消えるまで最大30日残る（7.2）。

### ADR-029: API の回数制限は3段にする

**決定:** ① Better Auth の回数制限（本体の `rateLimit` 設定。IP ごと。保存先は DB の `rate_limits`）を認証のエンドポイントにかける。② アプリの API（`/api/v1`）は、Elysia の自前のミドルウェアで、ユーザーごと・IP ごとの上限（招待の送信、PDF の作成、AI 書き出し・取り込み、アカウントの削除のパスワード確認、U5 の新規登録。7.2）を同じ `rate_limits` テーブルにキーの接頭辞（`app:`）を分けて記録する。③ 外側の守りとして、Cloudflare の無料のレート制限ルール1つを `/api/auth/*` にかける（Terraform の `envs/shared`）。

**理由:** Better Auth の回数制限は Better Auth のエンドポイントにしか効かない。アプリの API の上限は「誰が」で数える必要があり（Resend の1日100通や PDF の CPU を守る）、ログインの後にしか分からないので API の中で数える。DB に記録すれば、Cloud Run が複数台でも数がそろい、Redis が要らない（ADR-011）。

**トレードオフ:** 回数の記録のたびに DB への書き込みが増える（上限をかけるのは重い操作だけにして抑える）。Cloudflare の無料のルールは1つだけで、細かい条件は付けられない。

---

## 4. ルーティング

画面の存在・目的・レイアウト・認証要否は design-spec 3章が正。ここはルートと画面の対応だけを持つ。Web は TanStack Router のファイルルート、スマホは Expo Router のファイルルートで、**パスは Web とスマホで同じ**にする（招待やパスワード再設定のメールのリンク、通知のリンクを同じパスで開けるように）。スマホは `https://{DOMAIN}/...` のリンク（iOS の Universal Links・Android の App Links。必要なファイルは Worker が静的アセットとして配る）と `moonx://...`（staging は `moonx-staging://`）で開く。

- `$workspaceId` などは URL のパラメータ。ワークスペースに属する画面は `/w/$workspaceId/` の下に置き、他のワークスペースの URL を開いたら design-spec 6.0.6 の「権限がない」を出す。
- モーダル（M1〜M8）とパネル（PNL-1・PNL-2）はルートを作らず、検索パラメータで開く: `?modal=new-idea|evidence|save-version|go-no-go|create-plan|share|switch-workspace|update-template`、`?panel=comments|history&target=<targetType>:<targetId>[:<targetKey>]`。
- `target` の書式は2つ。項目は `<targetType>:<targetId>[:<targetKey>]`（`targetKey` に `:` を含んでもよい）で、コメント（C1）と項目の履歴（H1 の `targetType`・`targetId`・`targetKey`）に使う。画面全体の履歴は `container:<containerType>:<containerId>[:<sectionKey>]`（`containerType` は `self_analysis` / `validation` / `business_plan` / `idea`）で、H1 の `containerType`・`containerId`・`sectionKey` に渡す。画面全体にコメントの対象はなく、コメントを開けるのは項目と、`container:idea:<ideaId>`（アイデア `idea:<ideaId>` へのコメント）だけ。どちらにも当てはまらない値は、パネルを開かない。Web は `apps/web/src/lib/panel-target.tsx` の `parsePanelTarget` / `formatItemTarget` / `formatContainerTarget` で読み書きする。
- モーダルが対象の項目を持つとき（M2 の根拠シート）は `?modal=evidence&about=<targetType>:<targetId>[:<targetKey>]` とする。`about` の書式は `target` の項目と同じで、パネルの `target` と同時に使える（パネルを開いたまま根拠シートを開ける）。
- 認証が要るルートで未ログインなら `/login?next=<元のパス>` へ移る。
- `/dev/components` は部品の確認用ページで、開発サーバー（`import.meta.env.DEV`）だけで開く。本番のビルドには入らず、開くと Not Found になる。スマホには作らない（パスを Web とスマホで同じにする決まりの例外）。

| ルート | 画面（design-spec 参照） | 補足 |
|---|---|---|
| `/` | 1 ランディング | ビルド時に HTML を作る |
| `/login` | 2 ログイン / 新規登録（ログイン） | `?next=` |
| `/forgot-password` | 2（パスワード再設定のメールを送る） | |
| `/reset-password` | 2（新しいパスワードを決める） | `?token=`（メールのリンク） |
| `/invite/$token` | 2（新規登録）、または 3 の ①（ログイン済み） | 出し分けは design-spec 6.16 |
| `/welcome` | 3 オンボーディング | `?step=invite|profile|done&token=` |
| `/account` | 4 アカウント設定 | |
| `/notifications` | 8 通知 | `?filter=unread` |
| `/w/$workspaceId` | 5 ダッシュボード | |
| `/w/$workspaceId/ideas` | 6 アイデア一覧 | `?stage=&decision=&proposer=&archived=&sort=&q=&selected=` |
| `/w/$workspaceId/decisions` | 7 決定ログ | `?kind=&idea=&recordedBy=&from=&to=&selected=` |
| `/w/$workspaceId/settings` | 9 ワークスペース設定 | |
| `/w/$workspaceId/self-analysis` | 10 自己分析ホーム | |
| `/w/$workspaceId/self-analysis/$sectionKey` | 11 設問フォーム（自己分析） | `?q=<設問 ID>`（フォーカスする設問） |
| `/w/$workspaceId/team` | 12 メンバーの自己分析 | `/w/$workspaceId/team/$userId` で選んだ人を開く |
| `/w/$workspaceId/ideas/$ideaId` | 13 検証ホーム | |
| `/w/$workspaceId/ideas/$ideaId/questions/$sectionKey` | 11 設問フォーム（検証の 01 / 02 / 10） | `?q=` |
| `/w/$workspaceId/ideas/$ideaId/research` | 14 調査ログ | `?supports=&source=&entry=<research_log_entry の id>&new=1` |
| `/w/$workspaceId/ideas/$ideaId/competitors` | 15 競合・代替 | `?view=cards|table&q=V.04.SURVIVOR_PATTERNS&row=<competitor の id>` |
| `/w/$workspaceId/ideas/$ideaId/assumptions` | 16 前提・リスク | `?tab=assumptions|risks&row=<assumption か risk の id>` |
| `/w/$workspaceId/ideas/$ideaId/costs` | 17 費用 | `?row=<cost_item の id か template_key>&tab=initial|monthly_fixed|variable` |
| `/w/$workspaceId/ideas/$ideaId/economics` | 18 損益・シナリオ | `?field=` |
| `/w/$workspaceId/ideas/$ideaId/decide` | 19 判定 | |
| `/w/$workspaceId/ideas/$ideaId/plans/$planId` | 20 プランホーム | `?version=<plan_version の id>`（版の読み取り専用表示） |
| `/w/$workspaceId/ideas/$ideaId/plans/$planId/items/$itemNo` | 21 プラン項目の編集 | `$itemNo` は 1〜30。`?q=` |
| `/w/$workspaceId/ideas/$ideaId/plans/$planId/execution` | 22 実行管理 | `?tab=milestones|launch|kpis|questions|actions&item=` |
| `/w/$workspaceId/ideas/$ideaId/plans/$planId/pitch` | 23 Pitch Deck | `?variant=one|five&version=` |
| `/w/$workspaceId/ai/export` | 24 AI 書き出し | `?source=self_analysis|validation|business_plan&id=&scope=` |
| `/w/$workspaceId/ai/import` | 25 AI 取り込み | `?target=self_analysis|validation|business_plan&id=&scope=&returnTo=` |
| `/admin/templates` | 26 管理: テンプレート一覧 | `?kind=` |
| `/admin/templates/versions/$versionId` | 27 管理: テンプレート編集 | `?node=<section か question の id>` |
| `/admin/users` | 28 管理: ユーザーとワークスペース | `?tab=users|workspaces|invitations` |

API のルートは5章、Worker が配る静的なファイル（`/.well-known/apple-app-site-association`、`/.well-known/assetlinks.json`、`/robots.txt`）は `apps/web/public/` に置く。

## 5. API設計

### 5.1 共通の決まり

| 項目 | 決まり |
|---|---|
| 基準のパス | アプリの API は `/api/v1`、Better Auth は `/api/auth`、死活確認は `/api/health`、API の仕様書は `/api/docs`（staging だけ。ADR-006）、Cloud Scheduler 用は `/internal/cron`（Worker を通らない） |
| 値の正 | API が検査する期限・文字数・件数などの値（招待の期限7日、パスワード再設定のリンク1時間など）の正は design-spec。ここの値は design-spec に合わせ、変えるときは design-spec を先に直す |
| 認証 | Better Auth のセッション。Web は HttpOnly Cookie、スマホは Expo プラグインが付ける `Cookie` ヘッダー。公開と書いたもの以外はログインが要る（未ログインは 401 `UNAUTHENTICATED`） |
| 形式 | JSON（UTF-8）。項目名は camelCase。ID は UUID の文字列。日付だけの値は `"2026-10-01"`、日時は UTC の ISO 8601（表示はクライアントが利用者のタイムゾーンで行う） |
| 金額・率 | 金額は number（ワークスペースの通貨。自己分析は自己分析の通貨）。率は 0〜1 の小数（35% は `0.35`）。DB は numeric、API で number に変換する |
| 部分更新 | 1つの項目は `PATCH`（送った項目だけ変える）、キーで決まる項目（回答・数字）は `PUT .../{key}` で作るか更新する |
| 同時編集 | 項目を更新するリクエストは、読んだときの `lockVersion` を送る。違えば 409 `CONFLICT` と相手の内容を返す。「自分の内容で上書きする」は同じ内容に `force: true` を付けて送る（ADR-019）。まだ行が無い項目（未回答の設問など）の `lockVersion` は `0`。一覧に出る行（調査ログ・競合・費用行など）は作成時の `lockVersion` が 0、キーで決まる項目（回答・数字）は最初の保存で 1 になる。何も変えないリクエストは `lockVersion` を上げず、履歴も書かない。キーで決まる項目を同時に作られて負けたときは、`force: true` でも 409 `CONFLICT`（`current` を読んでからやり直す）。V4・V5 は根拠の付け外しのたびに、対象の項目の `lockVersion` を上げる |
| 一覧 | `?cursor=&limit=`（既定50、上限200）。応答は `{ items, nextCursor }`。`cursor` は並べ替えた結果へのオフセット（上限 1,000,000）で、読めない値は 422 `VALIDATION_FAILED`（`details[0].path` は `cursor`）。件数の少ない一覧（競合・費用行など）はページに分けず `{ items }` |
| 権限 | 下の表の記号。O = Owner、M = Member、V = Viewer（いずれもその資源が属するワークスペースのロール）、本人 = 自己分析の持ち主、Admin = 運営者、公開 = ログイン不要。足りなければ 403 `FORBIDDEN`、ワークスペースに所属していなければ 403 `NO_ACCESS`、無ければ 404 `NOT_FOUND`。権限の対応の全体は 7.1 |
| アーカイブ | アーカイブしたアイデア・プランの中身を変えるリクエスト（コメントを書く・元に戻すを含む）は 409 `ARCHIVED`（design-spec 6.8） |
| エラー | 8章の形式（`{ "error": { "code", "message", "requestId", ... } }`） |
| 計算 | 損益分岐・シナリオ・確認項目・F/A/U の内訳・工程は `packages/domain` の関数で計算して返す（保存しない）。クライアントは入力中は同じ関数で自分で計算し、保存の応答では計算結果を返さない（画面を開いたときと、保存の後に必要な画面だけ取り直す） |
| 変更履歴 | 変更履歴の対象（design-spec 6.0.5）を変える API は、すべて `change_history` に書く（ADR-020）。下の「履歴」列に書いた `source` を付ける |
| キャッシュ | 応答はすべて `Cache-Control: no-store`（ADR-011） |
| クライアントの種類 | Web とスマホは `X-Moonx-Client: web|ios|android` と `X-Moonx-App-Version`（スマホのアプリの版）を付ける。API は変更履歴の `client` に記録し（PRD の「スマホからの入力の割合」の集計に使う）、ログにも出す。古すぎるスマホの版は 426 `APP_UPDATE_REQUIRED` で更新を促す（最低の版は環境変数ではなくコードの定数で持つ）。`X-Moonx-Client` が `ios` / `android` で `X-Moonx-App-Version` が無い・読めないときも 426。それ以外の `X-Moonx-Client`（`web`、無い、不正な値）は 426 にならず、`web` 以外は `unknown` として記録する |

**対象の指し方（TargetRef）**: コメント・変更履歴・根拠は、同じ形で項目を指す。

| `type` | `id` | `key` |
|---|---|---|
| `self_analysis_answer` | 自己分析の id | 設問 ID（例: `SA.WHY.1`） |
| `validation_answer` | 検証の id | 設問 ID（例: `V.01.WHO`、`V.08.WORTH`） |
| `economics_input` | 検証の id | `field_key`（例: `selling_price`） |
| `plan_answer` | プランの id | 設問 ID（例: `P.01.1`） |
| `pitch_slide` | プランの id | `{版の種類}.{スライドのキー}`（例: `five.market`） |
| `idea` | アイデアの id | なし（アイデアの概要） |
| `business_plan` | プランの id | なし（プランのヘッダ。変更履歴だけ） |
| `template_version` | 自己分析・検証・プランの id | `self_analysis` / `validation` / `business_plan`（固定している版。テンプレートの移行の履歴だけ） |
| `research_log_entry` / `competitor` / `assumption` / `risk` / `cost_item` / `execution_item` | 行の id | なし |

キーで決まる項目は、まだ行が無くても（未回答でも）指せる。

### 5.2 共通の型

```ts
// ---- 基本 ----
type UUID = string;
type DateOnly = string;   // "2026-10-01"
type DateTime = string;   // "2026-10-01T02:00:00.000Z"
type Role = "owner" | "member" | "viewer";
type Fau = "fact" | "assumption" | "unknown";
type FauState = "empty" | "unclassified" | "fact" | "fact_no_evidence" | "assumption" | "unknown"; // design-spec 6.0.3
type Confidence = "low" | "medium" | "high";
type DecisionValue = "proceed" | "hold" | "drop";
type GoNoGoValue = "launch" | "delay" | "stop";
type Stage = "validation" | "planning" | "launch_prep";
type CheckKey = "competitors" | "local_price" | "costs" | "break_even" | "permits" | "demand_signal";
type CheckState = "not_started" | "partial" | "done";
type SupportsCheck = "local_price" | "permits" | "demand_signal";
type SourceType = "google_maps_reviews" | "website" | "social_media" | "public_data" | "news_report" | "store_observation" | "price_check" | "other";
type CostCategory = "initial" | "monthly_fixed" | "variable";
type EconomicsField = "selling_price" | "operating_days" | "target_margin" | "units_conservative" | "units_expected" | "units_strong" | "units_capacity";
type ExecutionType = "milestone" | "launch" | "kpi" | "open_question" | "next_action";
type ExecutionStatus = "todo" | "doing" | "done" | "open" | "resolved";
type LaunchTiming = "t_minus_30" | "t_minus_7" | "launch_day" | "first_30" | "days_31_90" | "other";
type TemplateKind = "self_analysis" | "validation" | "business_plan";
type AnswerType = "long_text" | "short_text" | "choice" | "amount_with_reason" | "table" | "linked_metric" | "execution_view";
type HistorySource = "manual" | "ai_import" | "revert" | "template_migration" | "duplicate" | "plan_draft";
type TargetType = "self_analysis_answer" | "validation_answer" | "economics_input" | "plan_answer" | "pitch_slide" | "idea"
  | "research_log_entry" | "competitor" | "assumption" | "risk" | "cost_item" | "execution_item"
  | "business_plan"       // プランのヘッダ（案の名前・Business Name・Prepared By）。変更履歴だけ
  | "template_version";   // 自己分析・検証・プランが固定しているテンプレートの版。テンプレートの移行の履歴だけ

interface TargetRef { type: TargetType; id: UUID; key?: string | null; }
interface Page<T> { items: T[]; nextCursor: string | null; }

interface UserRef {
  id: UUID; displayName: string; avatarUrl: string | null;
  badge: null | "former_member" | "suspended" | "deleted";   // 名前に添える表示（design-spec 6.16・6.17）。deleted のとき displayName は "Deleted user"
}

interface Versioned { lockVersion: number; updatedAt: DateTime | null; updatedBy: UserRef | null; }

// 画面の移動先。クライアントが4章のルートに変換する
interface LinkTarget {
  screen: number;                 // design-spec の画面番号
  workspaceId?: UUID; ideaId?: UUID; planId?: UUID; userId?: UUID;
  sectionKey?: string; questionKey?: string; rowId?: UUID; field?: EconomicsField;
  tab?: string; itemNo?: number; panel?: "comments" | "history"; target?: TargetRef;
}

// ---- F/A/U と根拠 ----
interface Evidence {
  id: UUID;                                   // evidence_links.id
  kind: "research_log" | "url";
  researchLog: { id: UUID; observedOn: DateOnly | null; topic: string; sourceType: SourceType | null; deleted: boolean } | null;
  url: string | null;
  note: string | null;
}
interface Classification {
  fau: Fau | null;
  confidence: Confidence | null;              // fau = "assumption" のときだけ
  state: FauState;                            // 値の有無・fau・有効な根拠の数から決まる
  evidence: Evidence[];                       // 削除済みの調査ログを指すものも含む（deleted: true）
}
interface ClassificationInput { fau: Fau | null; confidence?: Confidence | null; }
interface FauBreakdown {
  fact: number; factNoEvidence: number;        // factNoEvidence は fact の内数
  assumption: { total: number; low: number; medium: number; high: number };
  unknown: number; unclassified: number; empty: number;
}

// ---- テンプレート ----
interface TemplateQuestion {
  key: string;                    // 設問 ID（design-spec 6.6）
  sectionKey: string;
  title: string; prompt: string; example: string | null; hint: string | null;
  answerType: AnswerType;
  options: QuestionOptions | null;
  displayCondition: Record<string, string[]> | null;  // 例: { "V.02.OCEAN": ["Red", "Mixed"] }
  hasFau: boolean;
}
type QuestionOptions =
  | { kind: "choice"; choices: string[] }                                   // 例: ["Red", "Blue", "Mixed"]
  | { kind: "table"; columns: { key: string; label: string; type: "text" | "number" | "percent" | "money" }[] }   // percent は 0〜1 の小数で持つ（5.1）。money はワークスペースの通貨の金額
  | { kind: "linked_metric"; metricKeys: string[] }                         // design-spec 6.4 の主要指標のキー
  | { kind: "execution_view"; executionType: ExecutionType };
interface TemplateSection { key: string; part: "a" | "b" | null; title: string; guidance: string | null; questions: TemplateQuestion[]; }
interface TemplateRef { versionId: UUID; versionNumber: number; newerVersion: { versionId: UUID; versionNumber: number } | null; }

// ---- 計算結果（packages/domain。design-spec 6.4 の計算仕様） ----
type MetricReason = "needs_price" | "needs_monthly_costs" | "needs_expected_sales" | "needs_startup_costs"
  | "margin_not_positive" | "target_margin_unreachable" | "not_recovered" | "empty";
interface MetricValue {
  value: number | null;                       // 丸める前の値。計算できなければ null
  bound: "exact" | "lower" | "upper";         // lower = 「+」、upper = 「≤」（費用に未入力・Unknown の行があるとき）
  reason: MetricReason | null;                // value が null の理由。value も reason も null は、売上 0 の営業利益率で、ダッシュ記号で表示する
}
interface CostTotal { amount: number | null; isLowerBound: boolean; unknownRows: number; emptyRows: number; }
interface ScenarioColumn {
  key: "break_even" | "conservative" | "expected" | "strong" | "capacity";
  unitsPerDay: MetricValue; unitsPerMonth: MetricValue; revenue: MetricValue;
  variableCostTotal: MetricValue; operatingProfit: MetricValue; operatingMargin: MetricValue;
  exceedsCapacity: boolean;
}
interface EconomicsResult {
  variableCostPerUnit: MetricValue; contributionMargin: MetricValue; contributionMarginRate: MetricValue;
  breakEvenUnitsMonth: MetricValue; breakEvenUnitsDay: MetricValue; breakEvenRevenue: MetricValue;
  targetMarginUnitsMonth: MetricValue; targetMarginUnitsDay: MetricValue;
  scenarios: ScenarioColumn[];                 // 5列
  paybackMonths: MetricValue; simpleRoi: MetricValue;
  totals: { initial: CostTotal; monthlyFixed: CostTotal; variablePerUnit: CostTotal };
  defaultsUsed: { operatingDays: boolean; targetMargin: boolean };
  warnings: ("margin_not_positive" | "target_margin_unreachable" | "break_even_above_capacity"
    | "conservative_exceeds_capacity" | "expected_exceeds_capacity" | "strong_exceeds_capacity" | "costs_incomplete")[];
}
type KeyMetrics = Record<string, MetricValue>;   // キーは design-spec 6.4「主要指標」の1つの値のもの（initial_cost_total など）。scenario_table と scenario:* は表の形なので EconomicsResult.scenarios から読む

// ---- 確認項目と Next steps（design-spec 6.1） ----
interface CheckResult {
  key: CheckKey; state: CheckState;
  count: number | null;                        // 競合の件数・シグナルの件数など
  params: Record<string, number>;              // テンプレートの基準値。competitors は { min, max }、local_price は { pricedCompetitors, researchLogs }、permits と demand_signal は { researchLogs }、costs と break_even は {}（例: 競合 { min: 3, max: 5 }）
  detail: { emptyRows?: number; missing?: ("price" | "monthly_costs" | "initial_amount" | "monthly_amount")[] } | null;
  link: LinkTarget;
}
interface NextStep {
  kind: "add_evidence" | "classify" | "start_customer_problem" | "check" | "start_section" | "check_unknowns" | "ready_to_decide";
  count: number | null; checkKey: CheckKey | null; sectionKey: string | null;   // count は、add_evidence・classify・check_unknowns では該当の件数、check では costs の未入力の行数（0 のときは null）と competitors の基準値 min、それ以外は null
  link: LinkTarget;
}

// ---- 衝突（409 CONFLICT の error.current） ----
interface ConflictCurrent { value: unknown; lockVersion: number; updatedAt: DateTime; updatedBy: UserRef | null; }
```

### 5.3 エンドポイント一覧

| # | メソッド | パス | 権限 | 画面 |
|---|---|---|---|---|
| **認証（Better Auth。5.4）** | | | | |
| A1 | POST | `/api/auth/sign-in/email` | 公開 | 2 |
| A2 | POST | `/api/auth/sign-in/social` | 公開 | 2 |
| A3 | GET | `/api/auth/callback/google` | 公開 | — |
| A4 | POST | `/api/auth/sign-out` | ログイン | 共通ナビ・4 |
| A5 | GET | `/api/auth/get-session` | ログイン | 共通 |
| A6 | POST | `/api/auth/request-password-reset` | 公開 | 2 |
| A7 | POST | `/api/auth/reset-password` | 公開（トークン） | 2 |
| A8 | POST | `/api/auth/change-password` | ログイン（パスワードがある人） | 4 |
| U8 | POST | `/api/v1/me/password` | ログイン（パスワードが無い人） | 4 |
| **アカウントと招待（5.4）** | | | | |
| U1 | GET | `/api/v1/me` | ログイン | 共通・4 |
| U2 | PATCH | `/api/v1/me` | ログイン | 3・4 |
| U3 | PUT / DELETE | `/api/v1/me/avatar` | ログイン | 3・4 |
| U3 | GET | `/api/avatars/{name}` | 公開（local だけ。staging・production は Cloud Storage の URL を直接開く） | 3・4 |
| U4 | GET | `/api/v1/invitations/by-token/{token}` | 公開 | 2・3 |
| U5 | POST | `/api/v1/invitations/by-token/{token}/sign-up` | 公開 | 2 |
| U6 | POST | `/api/v1/invitations/by-token/{token}/accept` | ログイン | 3 |
| U7 | POST | `/api/v1/me/delete` | ログイン（本人） | 4 |
| **ワークスペース（5.5）** | | | | |
| W0 | POST | `/api/v1/workspaces` | ログイン | M7 |
| W1 | GET / PATCH | `/api/v1/workspaces/{workspaceId}` | O,M,V / O | 9・M7 |
| W2 | GET | `/api/v1/workspaces/{workspaceId}/members` | O,M,V | 9・22 |
| W3 | PATCH / DELETE | `/api/v1/workspaces/{workspaceId}/members/{userId}` | O（DELETE は本人も。`userId` に `me`） | 4・9 |
| W4 | GET / POST | `/api/v1/workspaces/{workspaceId}/invitations` | O | 9 |
| W5 | POST | `/api/v1/invitations/{invitationId}/resend` | O・Admin | 9・28 |
| W6 | POST | `/api/v1/invitations/{invitationId}/link` | O・Admin | 9・28 |
| W7 | DELETE | `/api/v1/invitations/{invitationId}` | O・Admin | 9・28 |
| W8 | GET | `/api/v1/workspaces/{workspaceId}/mention-candidates` | O,M,V | PNL-1 |
| **ダッシュボードとアイデア（5.6）** | | | | |
| D1 | GET | `/api/v1/workspaces/{workspaceId}/dashboard/ideas` | O,M,V | 5 |
| D2 | GET | `/api/v1/workspaces/{workspaceId}/dashboard/self-analyses` | O,M | 5 |
| D3 | GET | `/api/v1/workspaces/{workspaceId}/dashboard/due-soon` | O,M,V | 5 |
| D4 | GET | `/api/v1/workspaces/{workspaceId}/dashboard/activity` | O,M,V | 5 |
| I1 | GET / POST | `/api/v1/workspaces/{workspaceId}/ideas` | O,M,V / O,M | 6・M1 |
| I2 | GET / PATCH | `/api/v1/ideas/{ideaId}` | O,M,V / O,M | 6・13 |
| I3 | POST | `/api/v1/ideas/{ideaId}/duplicate` | O,M | 6・13 |
| I4 | POST | `/api/v1/ideas/{ideaId}/archive`・`/restore` | O,M | 6・13 |
| **検証（5.7）** | | | | |
| V1 | GET | `/api/v1/ideas/{ideaId}/validation` | O,M,V | 13 |
| V2 | GET | `/api/v1/validations/{validationId}/questions/{sectionKey}` | O,M,V | 11 |
| V3 | PUT | `/api/v1/validations/{validationId}/answers/{questionKey}` | O,M | 11・15・18 |
| V4 | POST | `/api/v1/validations/{validationId}/evidence` | O,M | M2 |
| V5 | DELETE | `/api/v1/evidence/{evidenceId}` | O,M | M2 |
| V6 | GET / POST | `/api/v1/validations/{validationId}/research-log` | O,M,V / O,M | 14・M2 |
| V7 | GET / PATCH / DELETE | `/api/v1/research-log/{entryId}` | O,M,V / O,M / O,M | 14 |
| V8 | GET / POST | `/api/v1/validations/{validationId}/competitors` | O,M,V / O,M | 15 |
| V9 | PATCH / DELETE | `/api/v1/competitors/{competitorId}` | O,M | 15 |
| V10 | GET / POST | `/api/v1/validations/{validationId}/assumptions`・`/risks` | O,M,V / O,M | 16 |
| V11 | PATCH / DELETE | `/api/v1/assumptions/{id}`・`/api/v1/risks/{id}` | O,M | 16 |
| V12 | GET | `/api/v1/validations/{validationId}/costs` | O,M,V | 17 |
| V13 | POST | `/api/v1/validations/{validationId}/cost-items` | O,M | 17 |
| V14 | PATCH / DELETE | `/api/v1/cost-items/{costItemId}` | O,M | 17 |
| V15 | GET | `/api/v1/validations/{validationId}/economics` | O,M,V | 18 |
| V16 | PUT | `/api/v1/validations/{validationId}/economics/{fieldKey}` | O,M | 18 |
| V17 | PUT | `/api/v1/validations/{validationId}/{list}/order`（`list` = `competitors` / `assumptions` / `risks` / `cost-items`） | O,M | 15・16・17 |
| V18 | GET | `/api/v1/ideas/{ideaId}/decision-context` | O,M | 19 |
| V19 | POST | `/api/v1/ideas/{ideaId}/decisions` | O,M | 19 |
| **自己分析（5.8）** | | | | |
| S1 | GET / PATCH | `/api/v1/me/self-analysis` | 本人 | 10 |
| S2 | GET | `/api/v1/me/self-analysis/sections/{sectionKey}` | 本人 | 11 |
| S3 | PUT | `/api/v1/me/self-analysis/answers/{questionKey}` | 本人 | 11 |
| S4 | POST | `/api/v1/me/self-analysis/complete`・`/reopen` | 本人 | 10 |
| S5 | PUT | `/api/v1/me/self-analysis/shares` | 本人 | M6 |
| S6 | GET | `/api/v1/workspaces/{workspaceId}/self-analyses` | O,M | 12 |
| S7 | GET | `/api/v1/workspaces/{workspaceId}/self-analyses/{userId}` | O,M（共有済みのみ） | 12 |
| **プラン（5.9）** | | | | |
| P1 | GET / POST | `/api/v1/ideas/{ideaId}/plans` | O,M,V / O,M | 13・20・M5 |
| P2 | GET / PATCH | `/api/v1/plans/{planId}` | O,M,V / O,M | 20 |
| P3 | POST | `/api/v1/plans/{planId}/archive`・`/restore` | O,M | 20 |
| P4 | GET | `/api/v1/plans/{planId}/items/{itemNo}` | O,M,V | 21 |
| P5 | PUT | `/api/v1/plans/{planId}/answers/{questionKey}` | O,M | 21 |
| P6 | GET / POST | `/api/v1/plans/{planId}/versions` | O,M,V / O,M | 20・M3 |
| P7 | GET | `/api/v1/plans/{planId}/go-no-go-context` | O,M | M4 |
| P8 | POST | `/api/v1/plans/{planId}/go-no-go` | O,M | M4 |
| P9 | GET / POST | `/api/v1/plans/{planId}/execution-items` | O,M,V / O,M | 21・22 |
| P10 | PATCH / DELETE | `/api/v1/execution-items/{itemId}` | O,M | 21・22 |
| P11 | PUT | `/api/v1/plans/{planId}/execution-items/order` | O,M | 22 |
| P12 | GET | `/api/v1/plans/{planId}/pitch-deck` | O,M,V | 23 |
| P13 | GET | `/api/v1/plans/{planId}/pitch-deck.pdf` | O,M,V | 23 |
| **AI 往復（5.10）** | | | | |
| X1 | GET | `/api/v1/ai/export` | O,M（自己分析は本人） | 24 |
| X2 | GET | `/api/v1/ai/import/context` | O,M（自己分析は本人） | 25 |
| X3 | POST | `/api/v1/ai/import/apply` | O,M（自己分析は本人） | 25 |
| **決定ログ・コメント・履歴・通知（5.11）** | | | | |
| L1 | GET | `/api/v1/workspaces/{workspaceId}/decision-log` | O,M,V | 7・13 |
| L2 | GET | `/api/v1/decision-log/{entryId}` | O,M,V | 7 |
| C1 | GET / POST | `/api/v1/comments` | 対象を読める人 | PNL-1 |
| C2 | PATCH / DELETE | `/api/v1/comments/{commentId}` | 書いた人 | PNL-1 |
| C3 | POST / DELETE | `/api/v1/comments/{commentId}/resolve` | コメントできる人 | PNL-1 |
| H1 | GET | `/api/v1/history` | 対象を読める人（自己分析は本人だけ） | PNL-2 |
| H2 | POST | `/api/v1/history/{entryId}/revert` | O,M（自己分析は本人） | PNL-2 |
| H3 | POST | `/api/v1/history/batches/{batchId}/revert` | O,M（自己分析は本人） | PNL-2・M8 |
| N1 | GET | `/api/v1/notifications` | ログイン | 8 |
| N2 | GET | `/api/v1/notifications/unread-count` | ログイン | 共通ナビ |
| N3 | POST | `/api/v1/notifications/{id}/read`・`/api/v1/notifications/read-all` | ログイン | 8 |
| **テンプレートの移行（5.12）** | | | | |
| T1 | GET | `/api/v1/template-migrations/preview` | O,M（自己分析は本人） | M8 |
| T2 | POST | `/api/v1/template-migrations` | O,M（自己分析は本人） | M8 |
| **運営者（5.13）** | | | | |
| AD1 | GET | `/api/v1/admin/templates` | Admin | 26 |
| AD2 | POST | `/api/v1/admin/template-versions/{versionId}/draft` | Admin | 26 |
| AD3 | GET / PATCH | `/api/v1/admin/template-versions/{versionId}` | Admin | 27 |
| AD4 | POST / PATCH / DELETE | `/api/v1/admin/template-versions/{versionId}/sections`、`/api/v1/admin/template-sections/{id}`、`/api/v1/admin/template-sections/{id}/questions`、`/api/v1/admin/template-questions/{id}` | Admin | 27 |
| AD5 | PUT | `/api/v1/admin/template-versions/{versionId}/order`・`/cost-defaults`・`/check-rules`・`/execution-presets` | Admin | 27 |
| AD6 | POST | `/api/v1/admin/template-versions/{versionId}/validate`・`/publish` | Admin | 27 |
| AD7 | GET | `/api/v1/admin/users`・`/api/v1/admin/workspaces`・`/api/v1/admin/invitations` | Admin | 28 |
| AD8 | POST | `/api/v1/admin/users/{userId}/suspend`・`/reactivate` | Admin | 28 |
| AD9 | POST | `/api/v1/admin/invitations` | Admin | 28 |
| **内部** | | | | |
| Z1 | GET | `/api/health` | 公開（DB に触れない） | 監視 |
| Z2 | GET | `/api/health/db` | 公開（Worker の共有シークレットが要る） | デプロイ後の確認 |
| Z3 | POST | `/internal/cron/due-notifications` | Cloud Scheduler（OIDC） | — |

### 5.4 認証・アカウント・招待

**Better Auth のエンドポイント（A1〜A8）**: 本体と応答の形は Better Auth が決める（版で名前が変わることがあるので、実装時は使う版のドキュメントに合わせる）。moonx の設定は次のとおり。

| 項目 | 設定 |
|---|---|
| メール＋パスワード | 有効。`disableSignUp: true`（新規登録は U5 だけ）。パスワードは8文字以上・128文字以下。パスワード再設定のリンクの期限は1時間（design-spec 6.16）。再設定すると他のセッションを消し、`hooks.after`（`/reset-password`）でそのユーザーの新しいセッションを作って Cookie を返す（ログインした状態で 5 へ。design-spec 6.16） |
| Google | 有効。`disableImplicitSignUp: true`。新規登録は招待の画面（`/invite/$token`）からだけ `requestSignUp: true` で始め、`callbackURL` を `/welcome?step=invite&token=…`、`errorCallbackURL` を `/login?error=…` にする |
| 新規登録の制限 | `databaseHooks.user.create.before`: そのメールあての有効な招待（`pending` かつ期限内。大文字小文字を区別しない）が無いか、メールが確認済みでなければ（Google が `email_verified` を返さない）`INVITATION_REQUIRED` で拒否する |
| 登録の後 | `databaseHooks.user.create.after`: 個人用ワークスペース（名前「{表示名}'s workspace」、通貨 PHP、本人が Owner）を作り、`last_workspace_id` に入れる。そのメールあてのワークスペースなしの招待があれば、その招待を受諾済みにし（3 の ① を飛ばすため、U6 は呼ばれない）、`grants_admin` が true のときだけ運営者にする |
| ログインの制限 | `databaseHooks.session.create.before`: `users.status` が `active` 以外（停止・削除）なら `ACCOUNT_SUSPENDED` で拒否する |
| セッション | 有効期限30日、毎日更新。Cookie は `__Secure-` 接頭辞・HttpOnly・Secure・SameSite=Lax（local は Secure なし）。`change-password` はクライアントの指定にかかわらず他のセッションを消す（`revokeOtherSessions`）。Better Auth の `update-user`・`delete-user`・`change-email` は閉じて 404 を返す（プロフィールと削除は U2・U3・U7 だけから行う） |
| 回数制限 | 有効。保存先は DB（`rate_limits`）。秘密を受け取る5つのパス（`sign-in/email`・`sign-in/social`・`request-password-reset`・`reset-password`・`sign-up/email`）は、パスごとに IP あたり1分10回。それ以外のパスは Better Auth の既定（IP あたり1分100回）。U5 も IP あたり1分10回を同じテーブルで数える |
| 信頼するオリジン | `TRUSTED_ORIGINS`（2章） |
| IP の取得 | `CF-Connecting-IP`（Worker が付ける。2章 通信フロー 3） |

エラーの対応（文言は design-spec 6.16「状態とエラー」）:

| Better Auth の応答 | design-spec 6.16 の状態 |
|---|---|
| メールかパスワードが違う | 2 の認証の失敗 |
| `ACCOUNT_SUSPENDED` | 2 の停止されたユーザー |
| `INVITATION_REQUIRED`（Google の新規登録） | 2 の招待リンクが無効・期限切れ |

**U1 `GET /api/v1/me`** → `200 Me`

```ts
interface Me {
  id: UUID; email: string; displayName: string; avatarUrl: string | null;
  timezone: string;                 // IANA 名
  theme: "system" | "light" | "dark";
  isAdmin: boolean;
  hasPassword: boolean;             // Google だけで登録した人は false（4 では「パスワードを設定する」に変わる）
  lastWorkspaceId: UUID | null;
  memberships: { workspace: { id: UUID; name: string; isPersonal: boolean; currency: string }; role: Role }[];
}
```

**U2 `PATCH /api/v1/me`** 本体 `{ displayName?: string (1〜60文字); timezone?: string; theme?: "system" | "light" | "dark"; lastWorkspaceId?: UUID }` → `200 Me`。`lastWorkspaceId` は所属するワークスペースだけ（違えば 422 `VALIDATION_FAILED`）。

**U3 `PUT /api/v1/me/avatar`** 本体は `multipart/form-data` の `file`（JPEG / PNG / WebP、5MB まで）→ `200 { avatarUrl: string }`。512×512 の WebP に縮めて保存する（ADR-024）。ファイルの中身が画像でなければ `422 VALIDATION_FAILED`（`details` の `path` は `file`）、5MB を超えれば `413 PAYLOAD_TOO_LARGE`。古い写真のファイルは新しい写真を保存してから消す。`DELETE` → `204`。local だけ、API が `GET /api/avatars/{name}`（公開。名前は32桁の16進＋`.webp`）で保存したファイルを返す。

**U4 `GET /api/v1/invitations/by-token/{token}`**（公開）→ `200 InvitationPreview`。トークンが見つからない・取り消し・期限切れは `410 INVITATION_INVALID`。

```ts
interface InvitationPreview {
  status: "pending" | "accepted";
  email: string;
  workspace: { id: UUID; name: string } | null;   // ワークスペースなしの招待は null
  role: Role | null;
  invitedBy: { displayName: string } | null;       // `make admin-create` の招待は null
  expiresAt: DateTime;
  accountExists: boolean;                          // そのメールのアカウントがあればログインへ案内する
}
```

**U5 `POST /api/v1/invitations/by-token/{token}/sign-up`**（公開）本体 `{ displayName: string; password: string; timezone: string }` → `201 { me: Me }` と、ログインした状態のセッション Cookie（スマホは Better Auth の Expo プラグインが受け取る）。メールは招待のメールに固定し、1つのトランザクションで `users`・`accounts`（credential）・個人用ワークスペースを作ってから Better Auth の `signInEmail` でセッションを作る。ワークスペースのある招待はまだ受諾しない（3 の ① で U6）。ワークスペースなしの招待は、登録の時点で受諾済みにする。`grants_admin` が true なら運営者にもする（上の「登録の後」）。エラー: `410 INVITATION_INVALID`、`409 EMAIL_TAKEN`（「ログインしてから招待を開く」へ案内）、`422 VALIDATION_FAILED`。

**U6 `POST /api/v1/invitations/by-token/{token}/accept`** 本体なし → `200 { workspaceId: UUID | null; alreadyMember: boolean }`。所属を作り（すでにメンバーならロールを変えない）、招待を `accepted` にする。ワークスペースなしの招待は、`grants_admin` が true のときだけ受諾した人を運営者にする。エラー: `410 INVITATION_INVALID`、`409 INVITATION_ALREADY_ACCEPTED`、`403 INVITATION_EMAIL_MISMATCH`（`error.invitedEmail` を付ける。「This invitation was sent to {email}. Log in with that email.」）。

**U8 `POST /api/v1/me/password`**（Set password。design-spec 6.16）本体 `{ newPassword: string }` → `204`。Google だけで登録した人（`hasPassword: false`）がパスワードを足す。パスワードがある人は `409 PASSWORD_ALREADY_SET`（A8 で変える）。セッションが10分以内に作られたものでなければ `403 REAUTH_REQUIRED`。サーバーから Better Auth の `setPassword` を呼び、この要求のセッション以外を消す。

**U7 `POST /api/v1/me/delete`**（アカウントの削除。design-spec 6.16）本体 `{ confirmEmail: string; password?: string }` → `204`（セッションの Cookie を消す）。
- `confirmEmail` が自分のメールと違えば `422 CONFIRMATION_MISMATCH`。パスワードがある人は `password` が必須で、違えば `403 INVALID_PASSWORD`（ユーザーごとに10分5回まで。超えたら `429 RATE_LIMITED`）。パスワードが無い人（Google だけ）は、セッションが10分以内に作られたものでなければ `403 REAUTH_REQUIRED`。
- ほかにメンバーのいるワークスペースで最後の Owner なら `409 LAST_OWNER`（`error.workspaces: { id; name }[]`）。
- 1つのトランザクションで次を行う: `users` の行は残して個人の情報を消す（`email` を `deleted+{id}@deleted.invalid`、`display_name` を `Deleted user`、`avatar_url` を null、`status` を `deleted`）。`sessions`・`accounts`・自己分析（回答・共有・その回答へのコメントと履歴）・本人あての通知を消す。本人しかいないワークスペース（個人用もチーム用も）を中身ごと消す。ほかのワークスペースは所属を外す（W3 DELETE と同じ処理。担当は名前「Deleted user」）。本人が送った有効な招待を取り消す。パスワード再設定のトークン（`verifications`）を消す。トランザクションをコミットしてから、保存した写真を消す（Cloud Storage または local のディスク）。
- Better Auth の `deleteUser`（行ごと消す）は使わない（チームの記録が `users` を参照しているため）。

### 5.5 ワークスペース・メンバー・招待

```ts
interface Workspace { id: UUID; name: string; currency: string; isPersonal: boolean; myRole: Role; memberCount: number; }
interface Member { user: UserRef; email: string | null /* Owner にだけ返す */; role: Role; joinedAt: DateTime; }
interface Invitation {
  id: UUID; email: string; role: Role | null;
  workspace: { id: UUID; name: string } | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedBy: UserRef | null; createdAt: DateTime; expiresAt: DateTime; acceptedAt: DateTime | null;
}
```

| API | 本体 | 応答 | エラーと副作用 |
|---|---|---|---|
| W0 | `{ name: string (1〜60); currency?: string (ISO 4217。既定 PHP) }` | `201 Workspace` | 作った人を Owner にし、`last_workspace_id` を新しいワークスペースにする（`is_personal = false`） |
| W1 GET | — | `200 Workspace` | |
| W1 PATCH | `{ name?: string (1〜60); currency?: string (ISO 4217) }` | `200 Workspace` | 通貨を変えても金額は換算しない |
| W2 GET | — | `200 { items: Member[] }` | |
| W3 PATCH | `{ role: Role }` | `200 Member` | `409 LAST_OWNER`（最後の Owner を降格できない）。Viewer に降格したら design-spec 6.16 の表のとおり処理する（自己分析の共有を解除、担当を名前に置き換え。担当の置き換えは実行管理の項目の変更履歴 `manual` に残す）。`userId` は UUID だけを受け付ける。対象がメンバーでなければ `404 NOT_FOUND`、ロールが同じなら何も変えず 200 |
| W3 DELETE | — | `204` | `409 LAST_OWNER`、`409 CANNOT_LEAVE_PERSONAL`。外れたときの処理は design-spec 6.16 の表（担当の置き換えは W3 PATCH と同じ。`last_workspace_id` が外れたワークスペースなら個人用ワークスペースに戻す） |
| W4 GET | `?status=pending|all` | `200 { items: Invitation[] }` | `status` の既定は `pending`: 受諾できるものだけ（期限切れは含まない）。`all` は受諾・取り消し・期限切れも返す。期限を過ぎた `pending` は `status: "expired"` として返す |
| W4 POST | `{ email: string; role: Role }` | `201 { invitation: Invitation; link: string }` | 招待のメールを送る。`409 ALREADY_MEMBER`、`409 INVITATION_PENDING`（同じメールの有効な招待がある。`error.invitationId` に付ける id の招待を W5 で再送する）。メールの送信は招待を作るトランザクションの中で行い、Resend に届かなければ招待も作らず `503 UPSTREAM_UNAVAILABLE` を返す（利用者は再試行する）。同じワークスペースへの招待はワークスペースの行を `FOR UPDATE` で押さえて直列にする。W5 と合わせて1時間20回まで（7.2。超えたら `429 RATE_LIMITED`） |
| W5 | — | `200 { invitation: Invitation; link: string }` | トークンを作り直してメールを再送する（前のリンクは無効）。期限を7日に延ばし、期限切れの招待は `pending` に戻す。受諾済みは `409 INVITATION_ALREADY_ACCEPTED`、取り消し済みは `410 INVITATION_INVALID`（W6・W7 も同じ）。招待のワークスペースに所属しない人は `403 NO_ACCESS`、所属していても Owner でなければ `403 FORBIDDEN`（Admin は除く） |
| W6 | — | `200 { link: string }` | トークンを作り直し、期限を7日に延ばす（メールは送らず、回数の上限にも数えない） |
| W7 | — | `204` | `revoked` にする |
| W8 | `?targetType=&targetId=` | `200 { items: UserRef[] }` | 自己分析への対象なら、その自己分析を読める Owner / Member だけ（design-spec 6.0.4）。その自己分析がこのワークスペースに共有されていなければ `403 NOT_SHARED`、設問が無ければ `404 NOT_FOUND` |

招待のリンクは `https://{DOMAIN}/invite/{token}`。トークンは32バイトの乱数で、DB には SHA-256 のハッシュだけを持つ。

### 5.6 ダッシュボードとアイデア

```ts
interface IdeaSummary {
  id: UUID; name: string; oneLineConcept: string;
  proposer: UserRef; stage: Stage; latestDecision: DecisionValue | null; archived: boolean;
  checks: { key: CheckKey; state: CheckState }[];          // 6つ。合計や点数は返さない
  keyMetrics: Pick<KeyMetrics, "initial_cost_total" | "break_even_units_day" | "expected_operating_profit" | "payback_months">;
  plans: { id: UUID; name: string; latestVersionName: string | null; latestGoNoGo: GoNoGoValue | null }[];
  lastActivityAt: DateTime; createdAt: DateTime;
}
interface IdeaDetail extends IdeaSummary, Versioned {
  workspaceId: UUID; validationId: UUID; proposedSolution: string | null;
  duplicatedFrom: { id: UUID; name: string } | null;
}
interface DueItem {
  id: UUID; type: ExecutionType; title: string; dueDate: DateOnly; overdue: boolean;
  assignee: { user: UserRef } | { name: string } | null; isMine: boolean;
  idea: { id: UUID; name: string }; plan: { id: UUID; name: string };
}
interface Activity {
  kind: "change" | "comment" | "decision" | "go_no_go" | "version_saved";
  actor: UserRef; at: DateTime; summary: string /* 動きの対象のラベル。change・comment は項目のラベル（"01 WHO"・"Costs · Rent"）かアイデア名、decision・go_no_go は記録した値、version_saved は版の名前。文はクライアントが kind・actor・summary から組み立てる */;
  idea: { id: UUID; name: string } | null; plan: { id: UUID; name: string } | null; link: LinkTarget;
}
```

| API | 本体・クエリ | 応答 | 補足 |
|---|---|---|---|
| D1 | — | `200 { items: IdeaSummary[]; droppedCount: number }` | アーカイブ・Drop を除く。更新順。`droppedCount` はアーカイブしていない Drop の件数 |
| D2 | — | `200 { items: { user: UserRef; shared: boolean; status: "not_started" | "in_progress" | "done" | null }[] }` | Owner / Member の一覧。共有していない人の `status` は null（進み具合を見せない） |
| D3 | — | `200 { items: DueItem[] }` | 期限切れか7日以内、Done / Resolved でない、アーカイブを除く。自分の担当を先、次に期限順。「今日」は利用者の `users.timezone` の日付で、`overdue` と7日の範囲もそれで決める |
| D4 | — | `200 { items: Activity[] }` | 直近20件。自己分析に関わる動きは除く。変更・コメント・決定ログを合わせて新しい順に並べ、`batch_id` のある変更は1回の操作を1件にまとめる（複製は新しいアイデアの行で示す）。削除した行へのコメントは除く |
| I1 GET | `?stage=&decision=not_dropped|all|undecided|proceed|hold|drop&proposerId=&includeArchived=true&sort=updated|created|name&q=&cursor=&limit=` | `200 Page<IdeaSummary> & { hiddenDroppedCount: number }` | `decision` の既定は `not_dropped`。`q` は名前と一行コンセプトの部分一致（大文字小文字を区別しない）。`hiddenDroppedCount` は `decision=not_dropped` のときだけ数え、他は 0 |
| I1 POST | `{ name: string (1〜100); oneLineConcept: string (1〜200); proposedSolution?: string }` | `201 IdeaDetail` | 最新の検証のテンプレートの版で検証を作り、費用の初期行を Empty で作る（履歴なし: 作成の記録だけ）。`proposedSolution` は20,000字まで、空白だけなら null |
| I2 GET | — | `200 IdeaDetail` | |
| I2 PATCH | `{ name?; oneLineConcept?; proposedSolution?; lockVersion: number; force?: boolean }` | `200 IdeaDetail` | 履歴 `manual`（対象 `idea`） |
| I3 | `{ name?: string }`（既定「{元の名前} (copy)」） | `201 IdeaDetail` | design-spec 6.8 の複製。履歴 `duplicate`: 新しいアイデアの作成と、コピーした記録対象の項目（回答・数字・調査ログ・競合・前提・リスク・費用行）それぞれの作成を、同じ `batchId` で1行ずつ残す（履歴で1回の操作としてまとめて見せるため。H3 では戻せない。複製したアイデアはアーカイブで片づける）。既定の名前は100字に収める |
| I4 | — | `200 IdeaDetail` | すでにその状態なら何もせず 200。履歴は書かず、`updatedAt` と `updatedBy` も変えない（`lastActivityAt` だけ更新する） |

### 5.7 検証

```ts
interface ValidationHome {
  validationId: UUID; idea: IdeaDetail; template: TemplateRef;
  summary: { customer: string | null; problem: string | null; solution: string | null; marketType: string | null };
  keyMetrics: Pick<KeyMetrics, "initial_cost_total" | "break_even_units_day" | "expected_operating_profit" | "payback_months">;
  economicsWarnings: EconomicsResult["warnings"];
  nextSteps: NextStep[];                     // 最大3件
  checks: CheckResult[];                     // 6つ
  fau: FauBreakdown;
  sections: {
    key: "01" | "02" | "03" | "04" | "05" | "06-08" | "09" | "10";
    title: string;
    answered: number | null; total: number | null;   // 03 / 04 / 09 は null（件数だけ）
    count: number | null;                             // 03 / 04 / 09 の件数（09 は前提とリスクの2つ: countB）
    countB?: number | null;
    fau: FauBreakdown | null;
  }[];
  decisions: DecisionLogSummary[];           // 新しい順に最大5件
  plans: PlanSummary[];                      // アーカイブした案を除く
  canAddPlan: boolean;                       // 最新の判定が Proceed で、アーカイブしていない
}
interface ValidationAnswer extends Versioned {
  questionKey: string; text: string | null;
  classification: Classification;
  hidden: boolean;                           // 02 OCEAN の出し分け・テンプレートの移行で隠れている
  commentCount: number;
}
interface ResearchLogInput {
  observedOn?: DateOnly | null; topic: string; observation?: string | null;
  sourceType?: SourceType | null; sourceUrl?: string | null;
  supportsChecks?: SupportsCheck[]; supportsNote?: string | null;
}
interface ResearchLogEntry extends Versioned {
  id: UUID; observedOn: DateOnly | null; topic: string; observation: string | null;
  sourceType: SourceType | null; sourceUrl: string | null;
  supportsChecks: SupportsCheck[]; supportsNote: string | null;
  createdBy: UserRef; usedAsEvidenceCount: number; commentCount: number;
}
interface EvidenceUsage { target: TargetRef; label: string; link: LinkTarget; isOnlyEvidenceOfFact: boolean; }
interface Competitor extends Versioned {
  id: UUID; name: string; type: "direct" | "indirect" | "substitute" | null;
  targetCustomer: string | null; offering: string | null;
  typicalPrice: number | null; priceNote: string | null;
  strength: string | null; weakness: string | null; whyChosen: string | null; whySurvive: string | null;
  evidence: Evidence[]; sortOrder: number; commentCount: number;
}
interface Assumption extends Versioned {
  id: UUID; statement: string; whyBelieve: string | null;
  evidence: Evidence[]; evidenceNote: string | null;
  confidence: Confidence | null; disproveCondition: string | null; nextCheck: string | null;
  sortOrder: number; commentCount: number;
}
interface Risk extends Versioned {
  id: UUID; statement: string; probability: Confidence | null; impact: Confidence | null;
  whyMatters: string | null; mitigation: string | null; howToValidate: string | null;
  sortOrder: number | null; commentCount: number;   // null = 自動の並び（Impact → Probability の高い順）
}
interface CostItem extends Versioned {
  id: UUID; category: CostCategory; templateKey: string | null; name: string;
  inputMode: "amount" | "percent_of_price";          // percent_of_price は variable だけ
  amount: number | null; percent: number | null;      // percent は 0〜1
  isLumpSum: boolean; whyNeeded: string | null; canReduce: "yes" | "partly" | "no" | null; notes: string | null;
  classification: Classification; sortOrder: number; commentCount: number;
}
interface EconomicsInput extends Versioned {
  fieldKey: EconomicsField; value: number | null; classification: Classification; commentCount: number;
}
```

| API | 本体・クエリ | 応答 | エラー・副作用 |
|---|---|---|---|
| V1 | — | `200 ValidationHome` | 確認項目・Next steps・F/A/U・主要指標は `packages/domain` で計算する。`sections[].title` は番号を含む固定のラベル（カタログ `validation:sections.<key>`。テンプレートの節の題とは独立） |
| V2 | — | `200 { section: TemplateSection; answers: ValidationAnswer[] }` | `sectionKey` は `01` / `02` / `10`（`04` のパターンと `08` は V8・V15 が返す。それ以外の値は `404 NOT_FOUND`）。設問ごとに必ず1件返す（未回答は `text: null`, `lockVersion: 0`。出し分けで隠れる設問も `hidden: true` で返す） |
| V3 | `{ text?: string | null; classification?: ClassificationInput; lockVersion: number; force?: boolean }` | `200 ValidationAnswer` | `422 FACT_REQUIRES_EVIDENCE`（有効な根拠が無いのに `fact`。Fact は V4 の `setFact` で付ける）、`422 CONFIDENCE_REQUIRED`、`422 INVALID_CHOICE`（選択の設問）、`422 QUESTION_NOT_FOUND`（テンプレートの版に無い設問 ID。`V.04.SURVIVOR_PATTERNS`・`V.04.FAILURE_PATTERNS`・`V.08.WORTH` も V3 で答える）。`text` は `short_text` の設問で200字、それ以外は20,000字まで（超えたら `422 VALIDATION_FAILED`）。`text` を null か空白にすると F/A/U も外す（`unknown` を除く）。答えの行を作るときの `lockVersion` は 0 で、作られた行は 1 から始まる。履歴 `manual` |
| V4 | `{ target: TargetRef; researchLogEntryId?: UUID; newResearchLog?: ResearchLogInput; url?: string; note?: string; setFact?: boolean; lockVersion: number }` | `201 { evidence: Evidence; classification: Classification; lockVersion: number }` | `researchLogEntryId` / `newResearchLog` / `url` のどれか1つ。`setFact: true` なら対象を Fact にする（M2 で根拠を付けて閉じたとき）。対象は `validation_answer` / `economics_input` / `cost_item` / `competitor` / `assumption`（`lockVersion` は対象の項目の版）。同じ調査ログを同じ対象に2回付けると `422 VALIDATION_FAILED`。値の無い対象や F/A/U を持たない対象（競合・前提）への `setFact` も `422 VALIDATION_FAILED`（`details[0].path` は `setFact`）。`url` と `note` は2,000字まで。履歴は対象の項目に1行（`newResearchLog` のときは調査ログの作成も1行）。`manual` |
| V5 | `?lockVersion=` | `200 { classification: Classification; lockVersion: number }` | Fact の最後の根拠を外すと未分類に戻す（クライアントは事前に確認を出す）。`?force=true` で版の食い違いを上書きする。履歴は対象の項目に1行（`manual`） |
| V6 GET | `?supports=&sourceType=&q=&cursor=&limit=` | `200 Page<ResearchLogEntry>` | `observedOn` の新しい順（日付なしは末尾）、同じなら作成の新しい順。`q` は topic と observation の部分一致 |
| V6 POST | `ResearchLogInput` | `201 ResearchLogEntry` | 履歴 `manual` |
| V7 GET | — | `200 ResearchLogEntry & { usages: EvidenceUsage[] }` | |
| V7 PATCH | `Partial<ResearchLogInput> & { lockVersion; force? }` | `200 ResearchLogEntry` | 履歴 `manual` |
| V7 DELETE | — | `200 { affected: EvidenceUsage[] }` | 論理削除。`affected` はその調査ログを根拠にしているすべての項目（`isOnlyEvidenceOfFact` でそれが唯一の根拠かを示す）。根拠の紐づけは残し、数えなくなる。その根拠しかなかった Fact は「Fact（根拠なし）」になる（design-spec 6.0.3）。クライアントは事前に V7 GET の `usages` で確認を出す。履歴 `manual`（`delete`） |
| V8 GET | — | `200 { items: Competitor[]; patterns: ValidationAnswer[]; guidance: { min: number; max: number } }` | `patterns` は `V.04.SURVIVOR_PATTERNS` と `V.04.FAILURE_PATTERNS`（更新は V3） |
| V8 POST | `{ name: string; type?; targetCustomer?; offering?; typicalPrice?: number (≥0); priceNote?; strength?; weakness?; whyChosen?; whySurvive? }` | `201 Competitor` | 履歴 `manual` |
| V9 PATCH | 上の項目の一部 ＋ `{ lockVersion; force? }` | `200 Competitor` | 履歴 `manual` |
| V9 DELETE | — | `204` | 論理削除（行へのコメントも隠れる）。履歴 `manual`（`delete`） |
| V10 GET | — | `200 { items: Assumption[] }` / `200 { items: Risk[] }` | Risks は並び順を適用済み: 手の並び（`sort_order`）のある行が先で、無い行は Impact → Probability の高い順（同順位は作成順）。手の並びのある一覧に足したリスクは末尾に付く |
| V10 POST | 前提: `{ statement; whyBelieve?; evidenceNote?; confidence?; disproveCondition?; nextCheck? }`。リスク: `{ statement; probability?; impact?; whyMatters?; mitigation?; howToValidate? }` | `201 Assumption` / `201 Risk` | 新しい行は末尾に付く（リスクは手の並びのときだけ末尾に付き、そうでなければ `sortOrder` は null）。空白だけの文章の項目は null で保存する。履歴 `manual` |
| V11 | PATCH: 上の項目の一部 ＋ `{ lockVersion; force? }`。DELETE: なし | `200` / `204` | 履歴 `manual` |
| V12 | — | `200 { items: CostItem[]; result: EconomicsResult; economicsInputs: EconomicsInput[] }` | `result` は Totals と 18 の損益分岐の表示用。`economicsInputs` はクライアントがその場で計算し直すために返す |
| V13 | `{ category: CostCategory; name: string }` | `201 CostItem` | 表の末尾に Empty の行を作る。履歴 `manual` |
| V14 PATCH | `{ name?; inputMode?; amount?: number | null (≥0); percent?: number | null (0〜1); isLumpSum?; whyNeeded?; canReduce?; notes?; classification?; lockVersion; force? }` | `200 CostItem` | `422 PERCENT_ONLY_FOR_VARIABLE`、`422 OUT_OF_RANGE`、F/A/U の決まりは V3 と同じ。`unknown` にすると金額と % を null にする（Unknown の数字に値を入れると未分類になる）。使わない入力方式の値を送ると `422 VALIDATION_FAILED`、`inputMode` を切り替えると使わなくなった側の値を null にする。履歴 `manual` |
| V14 DELETE | — | `204` | 論理削除。履歴 `manual`（`delete`） |
| V15 | — | `200 { inputs: EconomicsInput[]; worth: ValidationAnswer; result: EconomicsResult; costItems: CostItem[] }` | `inputs` は7つすべて（未入力は `value: null`）。`worth` は `V.08.WORTH`（更新は V3） |
| V16 | `{ value: number | null; classification?: ClassificationInput; lockVersion; force? }` | `200 EconomicsInput` | 範囲は design-spec 6.4（価格 > 0、営業日数は整数 1〜31、目標利益率 0〜0.99、販売数 ≥ 0）。外れたら `422 OUT_OF_RANGE`。値も F/A/U も変わらないリクエストは行を作らず、履歴も書かない。履歴 `manual` |
| V17 | `{ ids: UUID[]; category?: CostCategory }`（費用行は表ごと） | `204` | `ids` はその一覧の（論理削除を除く）全件と一致すること（違えば `422 VALIDATION_FAILED`）。`sort_order` を振り直す（リスクは手の並びに切り替わる）。履歴は残さず、`lockVersion` と `updated_at` も変えない（並べ替えは対象外で、開いている編集と衝突させない） |
| V18 | — | `200 DecisionContext` | |
| V19 | `{ value: DecisionValue; reason: string (1〜5000); basedOnDecisionId: UUID | null; confirmNewer?: boolean }` | `201 { entry: DecisionLogEntry; latestDecision: DecisionValue; canCreatePlan: boolean }` | 画面を開いた後に別の判定が記録されていて `confirmNewer` が無ければ `409 DECISION_CHANGED`（`error.latest: DecisionLogSummary`）。決定ログに記録し、`ideas.latest_decision` を変え、ワークスペースの他のメンバー（停止・削除したユーザーを除く Owner / Member / Viewer）に通知（`decision`）を作る。通知の開き先は 13（`{ screen: 13, workspaceId, ideaId }`。Go / No-Go は 20）。`recordedAt` は idea の行を押さえた後に決め、先に確定した記録より後になるようにする |

```ts
interface DecisionContext {
  summary: { oneLineConcept: string; customer: string | null; problem: string | null; solution: string | null;
             marketType: string | null; biggestOpportunity: string | null; biggestRisk: string | null; biggestUnknown: string | null };
  keyMetrics: Pick<KeyMetrics, "initial_cost_total" | "break_even_units_day" | "expected_operating_profit" | "payback_months" | "simple_roi">;
  missingChecks: CheckResult[];          // 達成していないものだけ
  fau: FauBreakdown;
  lastDecision: DecisionLogSummary | null;
}
```

### 5.8 自己分析

```ts
interface SelfAnalysisHome {
  id: UUID; status: "not_started" | "in_progress" | "done"; completedAt: DateTime | null;
  currency: string; template: TemplateRef;
  answered: number; total: number;
  sections: { key: string; title: string; answered: number; total: number }[];
  firstUnanswered: { sectionKey: string; questionKey: string } | null;
  shares: { workspace: { id: UUID; name: string }; sharedAt: DateTime }[];
  shareableWorkspaces: { id: UUID; name: string }[];   // 自分が Owner / Member の、個人用以外のワークスペース
}
interface SelfAnalysisAnswer extends Versioned {
  questionKey: string; text: string | null; amount: number | null;   // amount は金額＋理由の設問だけ
  commentCounts: { workspaceId: UUID; workspaceName: string; count: number }[];  // 本人には共有先ごとの件数
}
```

| API | 本体 | 応答 | エラー・副作用 |
|---|---|---|---|
| S1 GET | — | `200 SelfAnalysisHome` | 初めて開いたときに自己分析を作る（最新の版、`not_started`） |
| S1 PATCH | `{ currency: string }` | `200 SelfAnalysisHome` | 換算しない |
| S2 | — | `200 { section: TemplateSection; answers: SelfAnalysisAnswer[] }` | |
| S3 | `{ text?: string | null; amount?: number | null (≥0); lockVersion; force? }` | `200 SelfAnalysisAnswer` | 最初の回答で `in_progress` にする。金額を送れるのは金額＋理由の設問だけ（それ以外は `422 VALIDATION_FAILED`）。短文は200字まで。存在しない設問は `422 QUESTION_NOT_FOUND`。履歴 `manual`（本人だけが見られる） |
| S4 complete | `{ confirmEmpty?: boolean }` | `200 SelfAnalysisHome` | 未回答があり `confirmEmpty` が無ければ `409 HAS_EMPTY_QUESTIONS`（`error.emptyCount`） |
| S4 reopen | — | `200 SelfAnalysisHome` | 共有は続く |
| S5 | `{ workspaceIds: UUID[] }`（共有先の全体） | `200 SelfAnalysisHome` | 新しく足すのは `done` のときだけ（`422 MUST_BE_DONE_TO_SHARE`）。外すのはいつでも。Owner / Member でないワークスペースは `422 NOT_SHAREABLE` |
| S6 | — | `200 { items: { user: UserRef; shared: boolean; status: "not_started" | "in_progress" | "done" | null }[] }` | 今のワークスペースの Owner / Member |
| S7 | — | `200 { user: UserRef; status; currency: string; sections: (TemplateSection & { answers: { questionKey: string; text: string | null; amount: number | null; commentCount: number }[] })[] }` | 今のワークスペースに共有済みでなければ `403 NOT_SHARED`。変更履歴は返さない |

### 5.9 プラン

```ts
interface PlanSummary {
  id: UUID; name: string; archived: boolean;
  latestVersion: { id: UUID; name: string; savedAt: DateTime } | null;
  hasChangesSinceVersion: boolean;
  latestGoNoGo: { value: GoNoGoValue; recordedAt: DateTime; recordedBy: UserRef } | null;
}
interface PlanHome extends PlanSummary, Versioned {   // Versioned はヘッダ（名前・Business Name・Prepared By）
  ideaId: UUID; workspaceId: UUID; template: TemplateRef;
  businessName: string; preparedBy: string; date: DateTime;   // 最終更新日（版の表示中は保存日）
  latestDecision: DecisionValue | null;
  viewingVersion: { id: UUID; name: string; savedAt: DateTime } | null;   // ?versionId= のとき
  keyMetrics: Pick<KeyMetrics, "initial_cost_total" | "break_even_units_day" | "expected_operating_profit" | "payback_months">;
  versions: PlanVersionSummary[];
  execution: { dueSoon: number; overdue: number };   // 版の表示中も今の実行管理から数える
  parts: { part: "a" | "b"; completeItems: number; totalItems: number;
           items: { itemNo: number; title: string; marks: ("V" | "S")[]; filled: number; total: number; commentCount: number }[] }[];
}
interface PlanVersionSummary { id: UUID; versionNumber: number; name: string; savedBy: UserRef; savedAt: DateTime; }
interface PlanAnswer extends Versioned {
  questionKey: string;
  text: string | null;
  rows: Record<string, string | number | null>[] | null;   // 表の小項目（§11・§13・§21・§22）。列のキーはテンプレートの options.columns
  copiedFrom: { source: string; copiedAt: DateTime } | null;
  commentCount: number;
}
interface PlanReference {
  kind: "validation_answers" | "competitors" | "cost_rows" | "research_log" | "decision_log"
      | "self_analysis" | "metrics" | "assumptions" | "risks" | "go_no_go_history" | "totals";
  title: string;
  data: unknown;           // kind ごとの形（例: cost_rows は CostItem の一部の配列、self_analysis は { user, sections }[]）
  link: LinkTarget | null;
}
interface PlanItem {
  itemNo: number; title: string; guidance: string | null; readOnly: boolean;   // 版の表示中・アーカイブ・Viewer
  prompts: TemplateQuestion[]; answers: PlanAnswer[];
  metrics: KeyMetrics;                          // linked_metric の小項目が使う主要指標（版の表示中はスナップショットの値）
  scenarios: ScenarioColumn[];                  // `scenario:*` の小項目が使うシナリオ表（metrics は1つの値だけを持つため。同上）
  execution: ExecutionItem[];                   // execution_view の小項目の種類の項目
  references: PlanReference[];                  // [S] の自己分析は Owner / Member にだけ返す
}
interface ExecutionItem extends Versioned {
  id: UUID; type: ExecutionType; title: string;
  assignee: { user: UserRef } | { name: string } | null;
  dueDate: DateOnly | null; status: ExecutionStatus | null; overdue: boolean;
  goal: string | null; exitCondition: string | null;                       // milestone
  launchTiming: LaunchTiming | null; actions: string | null; completionCriteria: string | null;  // launch
  kpiArea: string | null; kpiTarget: string | null; kpiReviewFrequency: string | null;
  kpiActual: string | null; kpiActualUpdatedAt: DateTime | null;           // kpi
  whyItMatters: string | null; answer: string | null;                      // open_question
  fromPreset: boolean; completedAt: DateTime | null; sortOrder: number; commentCount: number;
}
interface ExecutionItemInput {
  title?: string; assigneeUserId?: UUID | null; assigneeName?: string | null;   // どちらか一方
  dueDate?: DateOnly | null; status?: ExecutionStatus | null;
  goal?; exitCondition?; launchTiming?: LaunchTiming; actions?; completionCriteria?;
  kpiArea?; kpiTarget?; kpiReviewFrequency?; kpiActual?; whyItMatters?; answer?;
}
interface PitchDeck {
  variant: "one" | "five";
  source: { kind: "latest" } | { kind: "version"; versionId: UUID; name: string; savedAt: DateTime };
  businessName: string; generatedAt: DateTime;
  footer: { businessName: string; versionLabel: string /* 版の名前か "Draft" */; date: DateOnly };
  speakerNotes: string | null;                 // §30 の One-minute / Five-minute explanation（PDF には入れない）
  slides: {
    key: string;                               // design-spec 6.14 のキー（title / problem / …）
    type: "title" | "text" | "number" | "table";
    title: string; subtitle?: string | null;
    bullets?: { text: string; empty: boolean }[];
    numbers?: { label: string; metricKey: string; value: MetricValue }[];
    table?: { columns: string[]; rows: (string | null)[][] };
    emptySources: string[];                    // 「Not written yet」を出す素材の名前
    overflow: boolean;                         // 収まらず「…」で切った（アプリの表示だけに注意を出す）
    editSource: { itemNo: number } | null; editInValidation: "costs" | "economics" | null;
    commentCount: number;
  }[];
}
```

| API | 本体・クエリ | 応答 | エラー・副作用 |
|---|---|---|---|
| P1 GET | `?includeArchived=true` | `200 { items: PlanSummary[] }` | |
| P1 POST（M5） | `{ name: string }` | `201 PlanHome` | 最新の判定が Proceed でなければ `409 DECISION_NOT_PROCEED`。名前の重複は `409 NAME_TAKEN`（アーカイブした案の名前も数える）。テンプレートの `copy_from` で検証から文章をコピーし、実行管理の初期行を作る。`created_from_decision_id` に最新の Proceed を入れる。履歴 `plan_draft`（1つの `batchId`） |
| P2 GET | `?versionId=` | `200 PlanHome` | 版を指定したら、`parts` などを版のスナップショットから作る |
| P2 PATCH | `{ name?; businessName?; preparedBy?; lockVersion; force? }` | `200 PlanHome` | 名前の重複は `409 NAME_TAKEN`。履歴 `manual` |
| P3 | — | `200 PlanSummary` | |
| P4 | `?versionId=` | `200 PlanItem` | `itemNo` は 1〜30 |
| P5 | `{ text?: string | null; rows?: Record<string, string | number | null>[] | null; lockVersion; force? }` | `200 PlanAnswer` | 数字・実行管理の小項目は `422 NOT_EDITABLE`。存在しない設問は `422 QUESTION_NOT_FOUND`、選択肢にない値は `422 INVALID_CHOICE`。表の列にないキー・型の合わない値・表に `text`・表以外に `rows`・200字を超える短文は `422 VALIDATION_FAILED`。履歴 `manual` |
| P6 GET | — | `200 { items: PlanVersionSummary[] }` | |
| P6 POST（M3） | `{ name: string (1〜80) }` | `201 PlanVersionSummary` | スナップショット（30項目の回答・主要指標・シナリオ表・実行管理の項目・検証の競合の上位5件）を保存し、決定ログに `version_saved` を記録して通知する |
| P7 | — | `200 { conditions: { launchIf: string | null; delayIf: string | null; stopIf: string | null }; keyMetrics: KeyMetrics; currentVersion: PlanVersionSummary | null; hasChangesSinceVersion: boolean; history: DecisionLogSummary[] }` | |
| P8（M4） | `{ value: GoNoGoValue; reason: string (1〜5000) }` | `201 { entry: DecisionLogEntry; stage: Stage }` | 対象の版は最新の保存済みの版（無ければ null）。決定ログに `go_no_go` を記録して通知する |
| P9 GET | `?type=&assignee=me|<userId>&status=` | `200 { items: ExecutionItem[] }` | Next Actions は期限順、ローンチは区分ごと、KPI は Area ごとに並べて返す |
| P9 POST | `ExecutionItemInput & { type: ExecutionType; title: string }` | `201 ExecutionItem` | 担当のメンバーは Owner / Member だけ（`422 INVALID_ASSIGNEE`）。状態は種類ごとの値だけ（`422 INVALID_STATUS`。milestone / launch / next_action は todo・doing・done、open_question は open・resolved、kpi は null）。履歴 `manual` |
| P10 | PATCH: `ExecutionItemInput & { lockVersion; force? }`。DELETE: なし（ロックを持たない論理削除） | `200 ExecutionItem` / `204` | 種類に無い列を送ると `422 VALIDATION_FAILED`（担当は `assigneeUserId` と `assigneeName` の一方だけ）。`done` / `resolved` にしたら `completed_at` を入れる。期限を変えたら期限の通知を送り直せるようにする。`kpiActual` を変えたら `kpi_actual_updated_at` を入れる。履歴 `manual` |
| P11 | `{ type: ExecutionType; ids: UUID[] }` | `204` | |
| P12 | `?variant=one|five&versionId=` | `200 PitchDeck` | `packages/domain` の `buildPitchDeck()` |
| P13 | 同上 | `200 application/pdf`（`Content-Disposition: attachment; filename="{businessName}-{one|five}-{版の名前|draft}-{日付}.pdf"`） | ADR-012。常にライトの配色 |

### 5.10 AI 往復

書き出しの Markdown と JSON の書式、設問 ID、取り込みの振り分けの決まりは design-spec 6.6・6.7 が正。貼り付けた内容の解析と振り分けは、クライアントが `packages/domain` の `parseAiReply()` と `matchBlocks()` で行い（貼り付けた全文をサーバーに送らない）、反映（X3）でサーバーがもう一度検査する。

| API | 本体・クエリ | 応答 | エラー・副作用 |
|---|---|---|---|
| X1 | `?source=self_analysis|validation|business_plan&id=<検証かプランの id。自己分析は省く>&sections=01,02&items=1,3&part=a|b&includeEmpty=true&includeExamples=true&includeReference=true` | `200 { markdown: string; json: object; fileBaseName: string; questionCount: number; allEmpty: boolean }` | `json` は design-spec 6.6 の `moonx-export`。範囲が空なら `422 EMPTY_SCOPE`。記録しない |
| X2 | `?target=self_analysis|validation|business_plan&id=` | `200 ImportContext` | アーカイブ中のアイデア・プランも読める（X1 も同じ）。`target.archived` で 24・25 が操作を止め、X3 は 409 `ARCHIVED` |
| X3 | `{ target: { type: TemplateKind; id?: UUID }; changes: ImportChange[] }` | `200 { applied: number; needsClassification: number; batchId: UUID }` | 1つのトランザクションで全部反映するか、何もしない。どれかの `baseLockVersion` が古ければ `409 CONFLICT_MULTI`（`error.conflicts: { questionKey; current: ConflictCurrent }[]`）。取り込めない設問・隠れた設問は `422 NOT_IMPORTABLE`、存在しない設問は `422 QUESTION_NOT_FOUND`、金額・選択の値が読めない・同じ設問が2回あれば `422 VALIDATION_FAILED`。`applied` は内容が変わった回答の数（変わらないものは数えない）。`conflicts[].current.value` は `{ text, amount }`。検証の回答で本文が変わったものは F/A/U を外して未分類にする（`classification` を送ったらそれを使う。`fact` は根拠が残っているときだけ）。履歴 `ai_import`（1つの `batchId`） |

```ts
interface ImportContext {
  target: { type: TemplateKind; id: UUID; name: string; workspaceId: UUID | null; ideaId: UUID | null; currency: string | null; archived: boolean };  // workspaceId は検証・プランのワークスペース（24・25 は URL のワークスペースと食い違えば「You don't have access」を出す。自己分析は null）。ideaId は検証・プランの親のアイデア（取り込み後に開く画面）。currency は金額の表示用。archived はアイデアかプランがアーカイブ中（24・25 は書き出し・取り込みの操作を出さない）
  sections: { key: string; title: string; part: "a" | "b" | null; importable: boolean }[];  // テンプレートの全セクション（順）。importable は取り込める型の設問を1つ以上持つ。24 の範囲の選択肢と 25 の範囲の判定に使う
  questions: {
    questionKey: string; title: string; sectionKey: string;
    answerType: AnswerType; options: QuestionOptions | null;
    importable: boolean;                   // 表・数字・実行管理は false
    hidden: boolean;                       // OCEAN の出し分け・移行で隠れている
    current: { text: string | null; amount: number | null; classification: Classification | null } & Versioned;
  }[];
}
interface ImportChange {
  questionKey: string;
  text?: string | null; amount?: number | null;            // 金額＋理由は amount と text（理由）
  classification?: ClassificationInput;                      // 検証で差分確認のときに付け直したとき
  baseLockVersion: number;
}
```

### 5.11 決定ログ・コメント・変更履歴・通知

```ts
interface DecisionLogSummary {
  id: UUID; kind: "validation_decision" | "go_no_go" | "version_saved";
  value: DecisionValue | GoNoGoValue | null; versionName: string | null;
  idea: { id: UUID; name: string }; plan: { id: UUID; name: string } | null;
  reasonExcerpt: string | null; recordedBy: UserRef; recordedAt: DateTime;
}
interface DecisionLogEntry extends DecisionLogSummary {
  reason: string | null;
  snapshot: {
    missingChecks: CheckResult[]; keyMetrics: KeyMetrics; fau: FauBreakdown;
    conditions?: { launchIf: string | null; delayIf: string | null; stopIf: string | null };  // go_no_go
    planVersion?: { id: UUID; name: string } | null;
  };
}
interface Comment {
  id: UUID; workspace: { id: UUID; name: string }; target: TargetRef;
  parentId: UUID | null; author: UserRef; body: string; mentions: UserRef[];
  resolvedAt: DateTime | null; resolvedBy: UserRef | null;
  editedAt: DateTime | null; deleted: boolean; createdAt: DateTime;
}
interface HistoryEntry {
  id: UUID; batchId: UUID | null; target: TargetRef; label: string;   // 例: "01 WHO"、"Costs · Rent"
  action: "create" | "update" | "delete" | "restore";
  source: HistorySource;
  before: unknown | null; after: unknown | null;   // 本文・数字・F/A/U・確信度・根拠の id の一覧など（差分の強調はクライアント）
  changedBy: UserRef; changedAt: DateTime; revertible: boolean;
}
interface Notification {
  id: UUID; kind: "mention" | "comment" | "decision" | "due";
  workspace: { id: UUID; name: string }; actor: UserRef | null;
  title: string;          // 表示用の短い文（英語。例: "Paolo mentioned you on WHO"）
  excerpt: string | null; link: LinkTarget;
  accessible: boolean;    // 外れた・権限がなくなったら false（「You no longer have access」）
  readAt: DateTime | null; createdAt: DateTime;
}
```

| API | 本体・クエリ | 応答 | エラー・副作用 |
|---|---|---|---|
| L1 | `?kind=&ideaId=&planId=&recordedBy=&from=&to=&cursor=&limit=` | `200 Page<DecisionLogSummary>` | 新しい順 |
| L2 | — | `200 DecisionLogEntry` | 更新・削除の API は無い |
| C1 GET | `?targetType=&targetId=&targetKey=&workspaceId=` | `200 { threads: { root: Comment; replies: Comment[] }[] }` | 自己分析の回答へのコメントは、共有先の Owner / Member には `workspaceId` のワークスペースの分だけ、本人には全部を返す。削除した行へのコメントは返さない |
| C1 POST | `{ workspaceId: UUID; target: TargetRef; parentId?: UUID; body: string (1〜5000); mentionUserIds: UUID[] }` | `201 Comment` | 返信は1段まで（`422 REPLY_DEPTH`）。メンションできない人は `422 INVALID_MENTION`。通知（`mention` / `comment`）を作る（design-spec 6.15 の条件） |
| C2 PATCH | `{ body: string; mentionUserIds: UUID[] }` | `200 Comment` | 新しくメンションした人にだけ通知する |
| C2 DELETE | — | `204` | 「deleted」として残す |
| C3 | — | `200 Comment` | スレッドの最初のコメントだけ |
| H1 | 項目: `?targetType=&targetId=&targetKey=&cursor=`。画面全体: `?containerType=self_analysis|validation|business_plan|idea&containerId=&sectionKey=&cursor=` | `200 Page<HistoryEntry>` | 新しい順 |
| H2 | — | `200 { entry: HistoryEntry; target: unknown }` | その項目を、その変更の直後の状態に戻す（`delete` の行は削除を取り消す）。戻したことも履歴 `revert` で残す。衝突の検査はしない（戻すのは意図した上書き） |
| H3 | — | `200 { reverted: number; batchId: UUID }` | AI 取り込み・テンプレートの移行・元に戻す操作を、1回の操作の単位でまとめて戻す。すでに戻した操作は、戻したことを取り消すまで `409 CONFLICT`。下書き作成と複製は作ったレコードごと消すことになるため戻せず、`422 VALIDATION_FAILED` |
| N1 | `?filter=all|unread&cursor=&limit=` | `200 Page<Notification>` | ワークスペースをまたいで新しい順 |
| N2 | — | `200 { total: number }` | クライアントは画面を開いたとき・前面に戻ったとき・60秒ごとに呼ぶ |
| N3 | — | `204` | |

### 5.12 テンプレートの移行（M8）

| API | 本体・クエリ | 応答 | エラー・副作用 |
|---|---|---|---|
| T1 | `?targetType=self_analysis|validation|business_plan&targetId=` | `200 { from: { versionNumber: number }; to: { versionId: UUID; versionNumber: number }; carried: number; hiddenQuestions: { questionKey: string; title: string; hasAnswer: boolean }[]; addedQuestions: number; addedCostRows: string[] }` | 新しい版が無ければ `409 ALREADY_LATEST` |
| T2 | `{ targetType; targetId; toVersionId: UUID }` | `200 { batchId: UUID; template: TemplateRef }` | design-spec 6.0.7 の表のとおり移す。履歴 `template_migration`（1つの `batchId`。H3 で戻せる） |

### 5.13 運営者

```ts
interface TemplateVersionDetail {
  id: UUID; kind: TemplateKind; versionNumber: number; status: "draft" | "published"; aiPrompt: string;
  sections: (Omit<TemplateSection, "questions"> & { id: UUID; sortOrder: number;
    questions: (TemplateQuestion & { id: UUID; sortOrder: number; copyFrom: unknown | null; reference: unknown | null })[] })[];
  costDefaults: { id: UUID; category: CostCategory; key: string; name: string; sortOrder: number }[];
  checkRules: { checkKey: CheckKey; params: Record<string, number> }[];
  executionPresets: { id: UUID; type: "milestone" | "launch" | "kpi"; title: string; area: string | null; launchTiming: LaunchTiming | null; sortOrder: number }[];
}
interface AdminUser { id: UUID; displayName: string; email: string; createdAt: DateTime; lastActiveAt: DateTime | null;
  workspaceCount: number; status: "active" | "suspended" | "deleted"; isAdmin: boolean; }   // deleted は一覧の末尾に「Deleted user」として出し、操作を出さない
interface AdminWorkspace { id: UUID; name: string; isPersonal: boolean; owners: UserRef[]; memberCount: number; ideaCount: number; lastActiveAt: DateTime | null; }
```

| API | 本体・クエリ | 応答 | エラー・副作用 |
|---|---|---|---|
| AD1 | — | `200 { items: { kind: TemplateKind; name: string; versions: { id: UUID; versionNumber: number; status: "draft" | "published"; publishedAt: DateTime | null; publishedBy: UserRef | null; usageCount: number }[] }[] }` | |
| AD2 | — | `201 { id: UUID }` | その版をコピーした下書きを作る。下書きがすでにあれば `409 DRAFT_EXISTS` |
| AD3 GET | — | `200 TemplateVersionDetail` | |
| AD3 PATCH | `{ aiPrompt: string }` | `200 TemplateVersionDetail` | 公開済みの版は `409 PUBLISHED_READ_ONLY`（AD4・AD5・AD6 publish も同じ。AD6 validate は書き込まないので公開済みの版にも使える） |
| AD4 | セクション: `{ key; title; guidance?; part? }`。設問: `{ key; title; prompt; example?; hint?; answerType; options?; displayCondition?; hasFau?; copyFrom?; reference? }`（PATCH は一部） | `201` / `200` / `204` | 設問 ID の形式（design-spec 6.6）を検査する（`422 INVALID_QUESTION_KEY`） |
| AD5 | order: `{ sections: { id: UUID; questionIds: UUID[] }[] }`。cost-defaults: `{ items: { category; key; name }[] }`。check-rules: `{ items: { checkKey; params }[] }`。execution-presets: `{ items: { type; title; area?; launchTiming? }[] }` | `200 TemplateVersionDetail` | 一覧ごと置き換える |
| AD6 validate | — | `200 { errors: { code: string; message: string; nodeId: UUID | null }[]; warnings: { code: "removed_keys"; keys: string[] }[] }` | 公開をふさぐエラー: 設問が0件（`no_questions`）、セクションの `part` の過不足（`invalid_part`。プランは A / B が必須、他は無し）、設問 ID の形式（`invalid_question_key`）・セクションとの不一致（`question_key_section_mismatch`）・重複（`duplicate_question_key`）、`answerType` と `options` の食い違い（`options_mismatch`）、`displayCondition` が存在しない設問を指す（`unknown_condition_key`）。警告: 前の版から消えた ID |
| AD6 publish | — | `200 { versionNumber: number; publishedAt: DateTime }` | 検査のエラーがあれば `422 TEMPLATE_INVALID`。既存の回答は変わらない |
| AD7 users | `?q=&status=&cursor=` | `200 Page<AdminUser>` | 中身（アイデア・回答）は返さない |
| AD7 workspaces | `?q=&cursor=` | `200 Page<AdminWorkspace>` | |
| AD7 invitations | `?status=&cursor=` | `200 Page<Invitation>` | |
| AD8 | — | `200 AdminUser` | 停止: セッションを全部消す。通知を作らない。再開で元どおり。自分自身は停止できない（`422 CANNOT_SUSPEND_SELF`） |
| AD9 | `{ email: string; workspaceId?: UUID; role?: Role }` | `201 { invitation: Invitation; link: string }` | `workspaceId` があれば `role` は必須。`workspaceId` なしの招待は `grantsAdmin = false`（受諾した人は運営者にならない） |

### 5.14 内部・死活確認

| API | 本体 | 応答 | 補足 |
|---|---|---|---|
| Z1 `GET /api/health` | — | `200 { status: "ok"; version: string /* コミット SHA */; env: string }` | **DB に触れない**（監視のたびに Neon を起こさないため。ADR-008） |
| Z2 `GET /api/health/db` | — | `200 { status: "ok"; latencyMs: number }` / `503` | デプロイ後の確認に使う。`503` は 8.1 の形式で `UPSTREAM_UNAVAILABLE` |
| Z3 `POST /internal/cron/due-notifications` | — | `200 { checkedItems: number; created: number }` | `Authorization: Bearer <OIDC トークン>` の発行者（`https://accounts.google.com`）・audience（`CRON_OIDC_AUDIENCE`）・メール（`CRON_INVOKER_EMAIL`）を確かめる。発行者・audience・署名・期限が合わなければ `401 UNAUTHENTICATED`、署名は正しいが別のサービスアカウントなら `403 FORBIDDEN`（鍵は `https://www.googleapis.com/oauth2/v3/certs` から取り、`Cache-Control` の間だけ覚える）。対象は ADR-014。停止されたユーザー・アーカイブしたアイデアとプランの項目・担当が名前だけの項目は除く |

## 6. データモデル

**データモデルの正はこの章。** Phase 2 の design-spec 7章（論理設計）を Phase 3 で引き継いだ。スキーマを変えるときはこの章と `packages/db/src/schema.ts` を一緒に更新し、`make db-generate` でマイグレーションを作る。

### 6.1 ER図

```
users ─┬─ 1:N sessions / accounts（Better Auth）        verifications・rate_limits（Better Auth。単独）
       ├─ N:M workspaces（中間: memberships。role = owner / member / viewer）
       ├─ 1:0..1 self_analyses ─┬─ 1:N self_analysis_answers
       │                        └─ N:M workspaces（中間: self_analysis_shares）
       └─ 1:N notifications

workspaces ─┬─ 1:N invitations（ワークスペースなしの招待は workspace_id = null）
            ├─ 1:N ideas ─┬─ 1:1 validations ─┬─ 1:N validation_answers
            │             │                   ├─ 1:N research_log_entries
            │             │                   ├─ 1:N competitors
            │             │                   ├─ 1:N assumptions
            │             │                   ├─ 1:N risks
            │             │                   ├─ 1:N cost_items
            │             │                   ├─ 1:N economics_inputs（field_key で一意）
            │             │                   └─ 1:N evidence_links ─ N:1 research_log_entries（または URL）
            │             │                        （対象: validation_answer / cost_item / economics_input / competitor / assumption）
            │             ├─ 1:N business_plans ─┬─ 1:N plan_answers
            │             │                      ├─ 1:N plan_versions
            │             │                      └─ 1:N execution_items
            │             └─ 0..1 ideas（duplicated_from: 複製元）
            ├─ 1:N decision_log_entries（idea・business_plan・plan_version を参照）
            ├─ 1:N comments ─ 1:N comment_mentions
            └─ 1:N change_history（自己分析の履歴は workspace_id = null、owner_user_id = 本人）

templates ─ 1:N template_versions ─┬─ 1:N template_sections ─ 1:N template_questions
                                   ├─ 1:N template_cost_defaults（検証）
                                   ├─ 1:N template_check_rules（検証）
                                   └─ 1:N template_execution_presets（プラン）
self_analyses / validations / business_plans ─ N:1 template_versions（作成時の版に固定。移行で変わる）
```

### 6.2 Phase 2 の論理設計（移管前の design-spec 7章）からの変更

| 対象 | 変更 | 理由 |
|---|---|---|
| `users` | `password_hash` をやめ、パスワードは `accounts.password` に置く。`email_verified` を足す。`display_name` / `avatar_url` は Better Auth の `name` / `image` に対応させる。`status` に `deleted` を足す | Better Auth（ADR-010）。アカウントの削除（design-spec 6.16） |
| `sessions`・`accounts`・`verifications`・`rate_limits` | 追加 | Better Auth のテーブル |
| 版を持つ項目のテーブル | `updated_by_id` を足す | 衝突のときに「Paolo updated this answer…」を出す（design-spec 6.0.2） |
| `template_questions` | `template_version_id` を足す | 版の中で設問 ID を一意にする制約のため |
| `evidence_links` | `validation_id`・`target_key`・`deleted_at` を足す | 回答・数字を「検証の id ＋ キー」で指す（5.1 TargetRef）。根拠の付け外しを履歴から戻せるようにする |
| `change_history` | `container_type`・`container_id`・`section_key`・`batch_id`・`client` を足す | 画面全体の履歴（design-spec 6.0.5）、1回の操作の単位で戻す（AI 取り込み・移行）、スマホからの入力の割合（PRD の KPI） |
| `risks.sort_order` | null を許す | null は自動の並び（Impact → Probability） |
| `workspaces` | ユーザーが作るチームのワークスペースは `is_personal = false` | M7 の「New workspace」（Phase 3 で追加） |

### 6.3 Drizzle のスキーマ（`packages/db/src/schema.ts`）

`drizzle.config.ts` と `drizzle()` の初期化で `casing: "snake_case"` を指定する（TypeScript の camelCase がそのまま snake_case の列名になる）。リレーションの定義（`relations()`）は `packages/db/src/relations.ts` に置く（外部キーと同じ対応なので省略する）。

```ts
// packages/db/src/schema.ts
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn, bigint, boolean, check, date, index, integer, jsonb, numeric,
  pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

// ---------- 共通の列 ----------
const pk = () => uuid().primaryKey().defaultRandom();
const ts = () => timestamp({ withTimezone: true });
const timestamps = () => ({
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow().$onUpdate(() => new Date()),
});
// 版を持つ項目（ADR-019）
const versioned = () => ({
  lockVersion: integer().notNull().default(0),
  updatedById: uuid().references((): AnyPgColumn => users.id, { onDelete: "set null" }),
});
const money = () => numeric({ precision: 15, scale: 2, mode: "number" });    // 金額
const ratio = () => numeric({ precision: 7, scale: 4, mode: "number" });     // 0.3500 = 35%

// ---------- enum ----------
export const userStatus = pgEnum("user_status", ["active", "suspended", "deleted"]);
export const themePref = pgEnum("theme_pref", ["system", "light", "dark"]);
export const workspaceRole = pgEnum("workspace_role", ["owner", "member", "viewer"]);
export const invitationStatus = pgEnum("invitation_status", ["pending", "accepted", "revoked", "expired"]);
export const templateKind = pgEnum("template_kind", ["self_analysis", "validation", "business_plan"]);
export const templateVersionStatus = pgEnum("template_version_status", ["draft", "published"]);
export const planPart = pgEnum("plan_part", ["a", "b"]);
export const answerType = pgEnum("answer_type", [
  "long_text", "short_text", "choice", "amount_with_reason", "table", "linked_metric", "execution_view",
]);
export const costCategory = pgEnum("cost_category", ["initial", "monthly_fixed", "variable"]);
export const checkKey = pgEnum("check_key", ["competitors", "local_price", "costs", "break_even", "permits", "demand_signal"]);
export const executionType = pgEnum("execution_type", ["milestone", "launch", "kpi", "open_question", "next_action"]);
export const presetType = pgEnum("preset_type", ["milestone", "launch", "kpi"]);
export const launchTiming = pgEnum("launch_timing", ["t_minus_30", "t_minus_7", "launch_day", "first_30", "days_31_90", "other"]);
export const selfAnalysisStatus = pgEnum("self_analysis_status", ["not_started", "in_progress", "done"]);
export const decisionValue = pgEnum("decision_value", ["proceed", "hold", "drop"]);
export const fau = pgEnum("fau", ["fact", "assumption", "unknown"]);
export const level = pgEnum("level", ["low", "medium", "high"]);          // 確信度・確率・影響
export const sourceType = pgEnum("source_type", [
  "google_maps_reviews", "website", "social_media", "public_data", "news_report", "store_observation", "price_check", "other",
]);
export const supportsCheck = pgEnum("supports_check", ["local_price", "permits", "demand_signal"]);
export const competitorType = pgEnum("competitor_type", ["direct", "indirect", "substitute"]);
export const canReduce = pgEnum("can_reduce", ["yes", "partly", "no"]);
export const costInputMode = pgEnum("cost_input_mode", ["amount", "percent_of_price"]);
export const economicsField = pgEnum("economics_field", [
  "selling_price", "operating_days", "target_margin",
  "units_conservative", "units_expected", "units_strong", "units_capacity",
]);
export const evidenceTargetType = pgEnum("evidence_target_type", [
  "validation_answer", "cost_item", "economics_input", "competitor", "assumption",
]);
export const executionStatus = pgEnum("execution_status", ["todo", "doing", "done", "open", "resolved"]);
export const decisionKind = pgEnum("decision_kind", ["validation_decision", "go_no_go", "version_saved"]);
export const decisionLogValue = pgEnum("decision_log_value", ["proceed", "hold", "drop", "launch", "delay", "stop"]);
export const commentTargetType = pgEnum("comment_target_type", [
  "self_analysis_answer", "validation_answer", "research_log_entry", "competitor", "assumption", "risk",
  "cost_item", "economics_input", "plan_answer", "execution_item", "pitch_slide", "idea",
]);
export const notificationKind = pgEnum("notification_kind", ["mention", "comment", "decision", "due"]);
export const dueStage = pgEnum("due_stage", ["three_days_before", "due_day", "overdue"]);
export const historyAction = pgEnum("history_action", ["create", "update", "delete", "restore"]);
export const historySource = pgEnum("history_source", [
  "manual", "ai_import", "revert", "template_migration", "duplicate", "plan_draft",
]);
export const historyContainer = pgEnum("history_container", ["self_analysis", "validation", "business_plan", "idea"]);
export const clientKind = pgEnum("client_kind", ["web", "ios", "android", "unknown"]);

// ---------- 認証（Better Auth。auth の設定で列名を対応させる） ----------
export const users = pgTable("users", {
  id: pk(),
  email: text().notNull(),
  emailVerified: boolean().notNull().default(false),
  displayName: text().notNull(),                  // Better Auth の name
  avatarUrl: text(),                              // Better Auth の image
  isAdmin: boolean().notNull().default(false),
  status: userStatus().notNull().default("active"),
  theme: themePref().notNull().default("system"),
  timezone: text().notNull().default("Asia/Manila"),   // IANA 名。登録時に端末から取る
  lastWorkspaceId: uuid().references((): AnyPgColumn => workspaces.id, { onDelete: "set null" }),
  lastActiveAt: ts(),
  ...timestamps(),
}, (t) => [uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`)]);

export const sessions = pgTable("sessions", {
  id: pk(),
  userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text().notNull().unique(),
  expiresAt: ts().notNull(),
  ipAddress: text(),
  userAgent: text(),
  ...timestamps(),
}, (t) => [index().on(t.userId)]);

export const accounts = pgTable("accounts", {
  id: pk(),
  userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: text().notNull(),                    // プロバイダ側の ID
  providerId: text().notNull(),                   // "credential" | "google"
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: ts(),
  refreshTokenExpiresAt: ts(),
  scope: text(),
  password: text(),                               // ハッシュ（credential のときだけ）
  ...timestamps(),
}, (t) => [uniqueIndex().on(t.providerId, t.accountId), index().on(t.userId)]);

export const verifications = pgTable("verifications", {
  id: pk(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: ts().notNull(),
  ...timestamps(),
}, (t) => [index().on(t.identifier)]);

export const rateLimits = pgTable("rate_limits", {
  id: pk(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});

// ---------- ワークスペース ----------
export const workspaces = pgTable("workspaces", {
  id: pk(),
  name: text().notNull(),
  currency: text().notNull().default("PHP"),      // ISO 4217
  isPersonal: boolean().notNull().default(false),
  createdById: uuid().notNull().references((): AnyPgColumn => users.id),
  lastActiveAt: ts(),                             // 中の何かが最後に変わった日時（28）
  ...timestamps(),
});

export const memberships = pgTable("memberships", {
  id: pk(),
  workspaceId: uuid().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  role: workspaceRole().notNull(),
  ...timestamps(),
}, (t) => [uniqueIndex().on(t.workspaceId, t.userId), index().on(t.userId)]);

export const invitations = pgTable("invitations", {
  id: pk(),
  workspaceId: uuid().references(() => workspaces.id, { onDelete: "cascade" }),   // null = ワークスペースなしの招待
  email: text().notNull(),
  role: workspaceRole(),
  grantsAdmin: boolean().notNull().default(false),   // true = 受諾した人を運営者にする。`make admin-create` だけが付ける（ワークスペースなしのときだけ）
  tokenHash: text().notNull().unique(),           // SHA-256。トークンそのものは持たない
  invitedById: uuid().references(() => users.id),   // null = `make admin-create` の招待（運営者がまだ居ない）
  status: invitationStatus().notNull().default("pending"),
  expiresAt: ts().notNull(),                      // 発行（再送）から7日
  acceptedById: uuid().references(() => users.id),
  acceptedAt: ts(),
  ...timestamps(),
}, (t) => [
  index().on(t.workspaceId),
  index("invitations_email_lower_idx").on(sql`lower(${t.email})`),
  check("invitations_role_required", sql`${t.workspaceId} is null or ${t.role} is not null`),
  check("invitations_admin_without_workspace", sql`not ${t.grantsAdmin} or ${t.workspaceId} is null`),
]);

// ---------- テンプレート ----------
export const templates = pgTable("templates", {
  id: pk(),
  kind: templateKind().notNull().unique(),
  name: text().notNull(),
  ...timestamps(),
});

export const templateVersions = pgTable("template_versions", {
  id: pk(),
  templateId: uuid().notNull().references(() => templates.id),
  versionNumber: integer().notNull(),
  status: templateVersionStatus().notNull().default("draft"),
  aiPrompt: text().notNull().default(""),
  publishedAt: ts(),
  publishedById: uuid().references(() => users.id),
  ...timestamps(),
}, (t) => [
  uniqueIndex().on(t.templateId, t.versionNumber),
  uniqueIndex("template_versions_one_draft_uq").on(t.templateId).where(sql`${t.status} = 'draft'`),
]);

export const templateSections = pgTable("template_sections", {
  id: pk(),
  templateVersionId: uuid().notNull().references(() => templateVersions.id, { onDelete: "cascade" }),
  key: text().notNull(),                          // 例: "WHY"、"01"、プランは "01"〜"30"
  part: planPart(),                               // プランだけ
  title: text().notNull(),
  guidance: text(),
  sortOrder: integer().notNull(),
  ...timestamps(),
}, (t) => [uniqueIndex().on(t.templateVersionId, t.key)]);

export const templateQuestions = pgTable("template_questions", {
  id: pk(),
  templateVersionId: uuid().notNull().references(() => templateVersions.id, { onDelete: "cascade" }),
  templateSectionId: uuid().notNull().references(() => templateSections.id, { onDelete: "cascade" }),
  questionKey: text().notNull(),                  // 設問 ID（design-spec 6.6）。公開後は変えない
  title: text().notNull(),
  prompt: text().notNull(),
  example: text(),
  hint: text(),
  answerType: answerType().notNull(),
  options: jsonb(),                               // 5.2 QuestionOptions
  displayCondition: jsonb(),                      // 例: { "V.02.OCEAN": ["Red", "Mixed"] }
  hasFau: boolean().notNull().default(false),
  copyFrom: jsonb(),                              // プラン: 下書きでコピーする元（文字列の配列。形は 6.3 の末尾）
  reference: jsonb(),                             // プラン: 参照に出すもの（形は 6.3 の末尾）
  sortOrder: integer().notNull(),
  ...timestamps(),
}, (t) => [uniqueIndex().on(t.templateVersionId, t.questionKey), index().on(t.templateSectionId)]);

export const templateCostDefaults = pgTable("template_cost_defaults", {
  id: pk(),
  templateVersionId: uuid().notNull().references(() => templateVersions.id, { onDelete: "cascade" }),
  category: costCategory().notNull(),
  key: text().notNull(),                          // 例: "initial.permits"、"monthly.rent"
  name: text().notNull(),
  sortOrder: integer().notNull(),
  ...timestamps(),
}, (t) => [uniqueIndex().on(t.templateVersionId, t.key)]);

export const templateCheckRules = pgTable("template_check_rules", {
  id: pk(),
  templateVersionId: uuid().notNull().references(() => templateVersions.id, { onDelete: "cascade" }),
  checkKey: checkKey().notNull(),
  params: jsonb().notNull(),                      // 基準値。例: { "min": 3, "max": 5 }
  ...timestamps(),
}, (t) => [uniqueIndex().on(t.templateVersionId, t.checkKey)]);

export const templateExecutionPresets = pgTable("template_execution_presets", {
  id: pk(),
  templateVersionId: uuid().notNull().references(() => templateVersions.id, { onDelete: "cascade" }),
  type: presetType().notNull(),
  title: text().notNull(),                        // 例: "Business decision"、"30 days before launch"、"Revenue"
  area: text(),                                   // KPI だけ（Financial / Customer / Operations）
  launchTiming: launchTiming(),                   // ローンチだけ
  sortOrder: integer().notNull(),
  ...timestamps(),
});

// ---------- 自己分析 ----------
export const selfAnalyses = pgTable("self_analyses", {
  id: pk(),
  userId: uuid().notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  templateVersionId: uuid().notNull().references(() => templateVersions.id),
  currency: text().notNull().default("PHP"),
  status: selfAnalysisStatus().notNull().default("not_started"),
  completedAt: ts(),
  ...timestamps(),
});

export const selfAnalysisAnswers = pgTable("self_analysis_answers", {
  id: pk(),
  selfAnalysisId: uuid().notNull().references(() => selfAnalyses.id, { onDelete: "cascade" }),
  questionKey: text().notNull(),                  // 例: "SA.INCOME.1"
  text: text(),                                   // 金額＋理由の設問では理由
  amount: money(),                                // 金額＋理由の設問だけ
  ...versioned(),
  ...timestamps(),
}, (t) => [uniqueIndex().on(t.selfAnalysisId, t.questionKey)]);

export const selfAnalysisShares = pgTable("self_analysis_shares", {
  id: pk(),
  selfAnalysisId: uuid().notNull().references(() => selfAnalyses.id, { onDelete: "cascade" }),
  workspaceId: uuid().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  sharedAt: ts().notNull().defaultNow(),
  ...timestamps(),
}, (t) => [uniqueIndex().on(t.selfAnalysisId, t.workspaceId), index().on(t.workspaceId)]);

// ---------- アイデアと検証 ----------
export const ideas = pgTable("ideas", {
  id: pk(),
  workspaceId: uuid().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text().notNull(),
  oneLineConcept: text().notNull(),
  proposedSolution: text(),
  proposerId: uuid().notNull().references(() => users.id),
  duplicatedFromId: uuid().references((): AnyPgColumn => ideas.id, { onDelete: "set null" }),
  latestDecision: decisionValue(),                // null = 未判定。決定ログの最新を写した値
  archivedAt: ts(),
  lastActivityAt: ts().notNull().defaultNow(),
  ...versioned(),                                 // 概要の同時編集
  ...timestamps(),
}, (t) => [index().on(t.workspaceId, t.lastActivityAt)]);
// 工程（stage）は保存しない（プランの有無と Go / No-Go から毎回決める）

export const validations = pgTable("validations", {
  id: pk(),
  ideaId: uuid().notNull().unique().references(() => ideas.id, { onDelete: "cascade" }),
  templateVersionId: uuid().notNull().references(() => templateVersions.id),
  ...timestamps(),
});

const fauColumns = () => ({ fau: fau(), confidence: level() });   // fau = null は未分類か未入力
const fauCheck = (name: string, t: { fau: AnyPgColumn; confidence: AnyPgColumn }) =>
  check(name, sql`(coalesce(${t.fau}::text, '') = 'assumption') = (${t.confidence} is not null)`);

export const validationAnswers = pgTable("validation_answers", {
  id: pk(),
  validationId: uuid().notNull().references(() => validations.id, { onDelete: "cascade" }),
  questionKey: text().notNull(),                  // 例: "V.01.WHO"、"V.08.WORTH"
  text: text(),                                   // 選択の設問は選んだ値
  ...fauColumns(),
  ...versioned(),
  ...timestamps(),
}, (t) => [uniqueIndex().on(t.validationId, t.questionKey), fauCheck("validation_answers_confidence", t)]);

export const researchLogEntries = pgTable("research_log_entries", {
  id: pk(),
  validationId: uuid().notNull().references(() => validations.id, { onDelete: "cascade" }),
  observedOn: date({ mode: "string" }),
  topic: text().notNull(),
  observation: text(),
  sourceType: sourceType(),
  sourceUrl: text(),
  supportsChecks: supportsCheck().array().notNull().default(sql`'{}'`),   // 裏付ける確認項目
  supportsNote: text(),                           // What It Supports（自由記述）
  createdById: uuid().notNull().references(() => users.id),
  deletedAt: ts(),
  ...versioned(),
  ...timestamps(),
}, (t) => [index().on(t.validationId, t.observedOn)]);

export const competitors = pgTable("competitors", {
  id: pk(),
  validationId: uuid().notNull().references(() => validations.id, { onDelete: "cascade" }),
  name: text().notNull(),
  type: competitorType(),
  targetCustomer: text(),
  offering: text(),
  typicalPrice: money(),
  priceNote: text(),                              // 例: "per box"
  strength: text(),
  weakness: text(),
  whyChosen: text(),
  whySurvive: text(),
  sortOrder: integer().notNull(),
  deletedAt: ts(),
  ...versioned(),
  ...timestamps(),
}, (t) => [index().on(t.validationId)]);

export const assumptions = pgTable("assumptions", {
  id: pk(),
  validationId: uuid().notNull().references(() => validations.id, { onDelete: "cascade" }),
  statement: text().notNull(),
  whyBelieve: text(),
  evidenceNote: text(),                           // 根拠（evidence_links）とは別の自由記述
  confidence: level(),
  disproveCondition: text(),
  nextCheck: text(),
  sortOrder: integer().notNull(),
  deletedAt: ts(),
  ...versioned(),
  ...timestamps(),
}, (t) => [index().on(t.validationId)]);

export const risks = pgTable("risks", {
  id: pk(),
  validationId: uuid().notNull().references(() => validations.id, { onDelete: "cascade" }),
  statement: text().notNull(),
  probability: level(),
  impact: level(),
  whyMatters: text(),
  mitigation: text(),
  howToValidate: text(),
  sortOrder: integer(),                           // null = 自動の並び（Impact → Probability の高い順）
  deletedAt: ts(),
  ...versioned(),
  ...timestamps(),
}, (t) => [index().on(t.validationId)]);

export const costItems = pgTable("cost_items", {
  id: pk(),
  validationId: uuid().notNull().references(() => validations.id, { onDelete: "cascade" }),
  category: costCategory().notNull(),
  templateKey: text(),                            // テンプレートの初期行のキー。追加した行は null
  name: text().notNull(),
  inputMode: costInputMode().notNull().default("amount"),
  amount: money(),
  percent: ratio(),                               // 0〜1
  isLumpSum: boolean().notNull().default(false),
  whyNeeded: text(),                              // initial
  canReduce: canReduce(),                         // initial
  notes: text(),
  ...fauColumns(),
  sortOrder: integer().notNull(),
  deletedAt: ts(),
  ...versioned(),
  ...timestamps(),
}, (t) => [
  index().on(t.validationId, t.category),
  fauCheck("cost_items_confidence", t),
  check("cost_items_percent_variable", sql`${t.inputMode} = 'amount' or ${t.category} = 'variable'`),
  check("cost_items_unknown_no_value", sql`coalesce(${t.fau}::text, '') <> 'unknown' or (${t.amount} is null and ${t.percent} is null)`),
  check("cost_items_ranges", sql`(${t.amount} is null or ${t.amount} >= 0) and (${t.percent} is null or (${t.percent} >= 0 and ${t.percent} <= 1))`),
]);

export const economicsInputs = pgTable("economics_inputs", {
  id: pk(),
  validationId: uuid().notNull().references(() => validations.id, { onDelete: "cascade" }),
  fieldKey: economicsField().notNull(),
  value: numeric({ precision: 17, scale: 4, mode: "number" }),   // null = 未入力。target_margin は 0.15 = 15%
  ...fauColumns(),
  ...versioned(),
  ...timestamps(),
}, (t) => [
  uniqueIndex().on(t.validationId, t.fieldKey),
  fauCheck("economics_inputs_confidence", t),
  check("economics_inputs_unknown_no_value", sql`coalesce(${t.fau}::text, '') <> 'unknown' or ${t.value} is null`),
]);

export const evidenceLinks = pgTable("evidence_links", {
  id: pk(),
  workspaceId: uuid().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  validationId: uuid().notNull().references(() => validations.id, { onDelete: "cascade" }),
  targetType: evidenceTargetType().notNull(),
  targetId: uuid().notNull(),                     // 回答・数字は検証の id、行は行の id（5.1 TargetRef）
  targetKey: text(),                              // 回答は設問 ID、数字は field_key
  researchLogEntryId: uuid().references(() => researchLogEntries.id),
  url: text(),
  note: text(),
  createdById: uuid().notNull().references(() => users.id),
  deletedAt: ts(),                                // 根拠を外したとき（履歴から戻せる）
  ...timestamps(),
}, (t) => [
  index().on(t.targetType, t.targetId, t.targetKey),
  index().on(t.researchLogEntryId),
  check("evidence_links_one_source", sql`(${t.researchLogEntryId} is not null) <> (${t.url} is not null)`),
]);

// ---------- プランと実行管理 ----------
export const businessPlans = pgTable("business_plans", {
  id: pk(),
  ideaId: uuid().notNull().references(() => ideas.id, { onDelete: "cascade" }),
  name: text().notNull(),                         // 案の名前（Plan A など）
  businessName: text().notNull(),
  preparedBy: text().notNull(),
  templateVersionId: uuid().notNull().references(() => templateVersions.id),
  createdFromDecisionId: uuid().references((): AnyPgColumn => decisionLogEntries.id),
  archivedAt: ts(),
  lastActivityAt: ts().notNull().defaultNow(),
  createdById: uuid().notNull().references(() => users.id),
  ...versioned(),                                 // ヘッダの同時編集
  ...timestamps(),
}, (t) => [uniqueIndex().on(t.ideaId, t.name)]);

export const planAnswers = pgTable("plan_answers", {
  id: pk(),
  businessPlanId: uuid().notNull().references(() => businessPlans.id, { onDelete: "cascade" }),
  questionKey: text().notNull(),                  // 例: "P.01.1"
  text: text(),
  rows: jsonb(),                                  // 表の小項目（§11・§13・§21・§22）の行の配列
  copiedFrom: jsonb(),                            // { source, copiedAt }
  ...versioned(),
  ...timestamps(),
}, (t) => [uniqueIndex().on(t.businessPlanId, t.questionKey)]);

export const planVersions = pgTable("plan_versions", {
  id: pk(),
  businessPlanId: uuid().notNull().references(() => businessPlans.id, { onDelete: "cascade" }),
  versionNumber: integer().notNull(),
  name: text().notNull(),                         // 例: "v1 For advisors"
  snapshot: jsonb().notNull(),                    // 30項目の回答・主要指標・シナリオ表・実行管理の項目・競合の上位5件
  savedById: uuid().notNull().references(() => users.id),
  savedAt: ts().notNull().defaultNow(),
  ...timestamps(),
}, (t) => [uniqueIndex().on(t.businessPlanId, t.versionNumber)]);

export const executionItems = pgTable("execution_items", {
  id: pk(),
  businessPlanId: uuid().notNull().references(() => businessPlans.id, { onDelete: "cascade" }),
  type: executionType().notNull(),
  title: text().notNull(),                        // Milestone / Timing / KPI / Open Question / Action の文言
  assigneeUserId: uuid().references(() => users.id, { onDelete: "set null" }),
  assigneeName: text(),                           // 担当を自由に書いたとき
  dueDate: date({ mode: "string" }),
  status: executionStatus(),                      // 種類ごとに使う値が決まる。KPI は null
  goal: text(),                                   // milestone
  exitCondition: text(),                          // milestone
  launchTiming: launchTiming(),                   // launch
  actions: text(),                                // launch
  completionCriteria: text(),                     // launch
  kpiArea: text(),                                // kpi
  kpiTarget: text(),                              // kpi（原本どおり文章）
  kpiReviewFrequency: text(),                     // kpi
  kpiActual: text(),                              // kpi（アプリで足した実績）
  kpiActualUpdatedAt: ts(),
  whyItMatters: text(),                           // open_question
  answer: text(),                                 // open_question
  fromPreset: boolean().notNull().default(false),
  completedAt: ts(),
  sortOrder: integer().notNull(),
  deletedAt: ts(),
  ...versioned(),
  ...timestamps(),
}, (t) => [
  index().on(t.businessPlanId, t.type),
  index("execution_items_due_idx").on(t.dueDate).where(sql`${t.dueDate} is not null and ${t.deletedAt} is null`),
  check("execution_items_one_assignee", sql`${t.assigneeUserId} is null or ${t.assigneeName} is null`),
]);

// ---------- 決定ログ・コメント・通知・変更履歴 ----------
export const decisionLogEntries = pgTable("decision_log_entries", {
  id: pk(),
  workspaceId: uuid().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  ideaId: uuid().notNull().references(() => ideas.id, { onDelete: "cascade" }),
  businessPlanId: uuid().references((): AnyPgColumn => businessPlans.id, { onDelete: "cascade" }),
  planVersionId: uuid().references(() => planVersions.id),
  kind: decisionKind().notNull(),
  value: decisionLogValue(),                      // version_saved は null
  reason: text(),                                 // 判定と Go / No-Go は必須（API で検査）
  snapshot: jsonb().notNull(),                    // 不足項目・主要指標・F/A/U の内訳（Go / No-Go は §24 の条件も）
  recordedById: uuid().notNull().references(() => users.id),
  recordedAt: ts().notNull().defaultNow(),
  createdAt: ts().notNull().defaultNow(),         // 追記だけ（updatedAt を持たない）
}, (t) => [index().on(t.workspaceId, t.recordedAt), index().on(t.ideaId, t.recordedAt), index().on(t.businessPlanId)]);

export const comments = pgTable("comments", {
  id: pk(),
  workspaceId: uuid().notNull().references(() => workspaces.id, { onDelete: "cascade" }),  // 自己分析へのコメントは共有先
  targetType: commentTargetType().notNull(),
  targetId: uuid().notNull(),
  targetKey: text(),
  parentId: uuid().references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),  // 返信（1段まで）
  authorId: uuid().notNull().references(() => users.id),
  body: text().notNull(),
  resolvedAt: ts(),
  resolvedById: uuid().references(() => users.id),
  editedAt: ts(),
  deletedAt: ts(),
  ...timestamps(),
}, (t) => [index().on(t.targetType, t.targetId, t.targetKey), index().on(t.workspaceId, t.createdAt)]);

export const commentMentions = pgTable("comment_mentions", {
  id: pk(),
  commentId: uuid().notNull().references(() => comments.id, { onDelete: "cascade" }),
  userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: ts().notNull().defaultNow(),
}, (t) => [uniqueIndex().on(t.commentId, t.userId)]);

export const notifications = pgTable("notifications", {
  id: pk(),
  userId: uuid().notNull().references(() => users.id, { onDelete: "cascade" }),     // 受け取る人
  workspaceId: uuid().notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  kind: notificationKind().notNull(),
  actorId: uuid().references(() => users.id),
  commentId: uuid().references(() => comments.id, { onDelete: "cascade" }),
  decisionLogEntryId: uuid().references(() => decisionLogEntries.id, { onDelete: "cascade" }),
  executionItemId: uuid().references(() => executionItems.id, { onDelete: "cascade" }),
  dueStage: dueStage(),                           // kind = due のとき
  dueDate: date({ mode: "string" }),              // kind = due のとき（期限を変えたら新しい日付で送り直す）
  link: jsonb().notNull(),                        // 開く先（5.2 LinkTarget）
  readAt: ts(),
  createdAt: ts().notNull().defaultNow(),
}, (t) => [
  index().on(t.userId, t.createdAt),
  index("notifications_unread_idx").on(t.userId).where(sql`${t.readAt} is null`),
  uniqueIndex("notifications_due_once_uq").on(t.executionItemId, t.dueDate, t.dueStage).where(sql`${t.kind} = 'due'`),
]);

export const changeHistory = pgTable("change_history", {
  id: pk(),
  workspaceId: uuid().references(() => workspaces.id, { onDelete: "cascade" }),     // 自己分析の履歴は null
  ownerUserId: uuid().references(() => users.id, { onDelete: "cascade" }),          // 自己分析の履歴の持ち主
  containerType: historyContainer().notNull(),    // 画面全体の履歴を引くため
  containerId: uuid().notNull(),
  sectionKey: text(),                             // 検証: 回答は設問の節（"01"・"02"・"04"・"08"・"10"）、"research_log"・"competitors"・"assumptions_risks"・"costs"・"economics"。プラン: 項目番号。実行管理: "execution"
  targetType: text().notNull(),                   // 5.1 TargetRef の type
  targetId: uuid().notNull(),
  targetKey: text(),
  action: historyAction().notNull(),
  before: jsonb(),
  after: jsonb(),
  source: historySource().notNull(),
  batchId: uuid(),                                // 1回の操作（AI 取り込み・移行・下書き作成・複製）のまとまり
  client: clientKind().notNull().default("unknown"),
  revertedFromId: uuid().references((): AnyPgColumn => changeHistory.id),
  changedById: uuid().notNull().references(() => users.id),
  changedAt: ts().notNull().defaultNow(),
}, (t) => [
  index().on(t.targetType, t.targetId, t.targetKey, t.changedAt),
  index().on(t.containerType, t.containerId, t.changedAt),
  index().on(t.workspaceId, t.changedAt),
  index().on(t.batchId),
]);
```

`template_questions` の `copy_from` と `reference` の形（どちらもプランの小項目だけが持つ）:

- `copy_from`: 文字列の配列。要素は設問 ID（`V.01.WHO`）か疑似キー（`IDEA.ONE_LINE_CONCEPT`・`IDEA.PROPOSED_SOLUTION`・`LIST.ASSUMPTIONS`・`LIST.RISKS`）。要素が複数なら、書かれた順に空行でつないで1つの文章にする。`LIST.*` は表の小項目の `rows` にする（`LIST.RISKS` の Trigger / Indicator は null）。空の回答は飛ばす
- `reference`: 次の指定の配列。項目の参照は、その項目の小項目の `reference` の和集合で、各指定は最も関係の深い小項目に置く。`kind` は 5.9 の `PlanReference.kind` と同じ

| 指定 | 内容 |
|---|---|
| `{ kind: "validation_answers", section?, keys? }` | 検証の回答。`section`（`"01"`）か `keys`（設問 ID の配列） |
| `{ kind: "competitors", limit }` | 検証の競合の上位 `limit` 件 |
| `{ kind: "cost_rows", keys }` | 費用行。`keys` はテンプレートの費用行のキー（`initial.permits`） |
| `{ kind: "research_log", tag }` | 調査ログのうち `tag`（`local_price` / `permits` / `demand_signal`）が付いたもの |
| `{ kind: "self_analysis", sections }` | 共有された自己分析のセクション（`WHY` など） |
| `{ kind: "metrics", keys }` | 主要指標（design-spec 6.4 のキー） |
| `{ kind: "decision_log" \| "go_no_go_history" \| "assumptions" \| "risks" \| "totals" }` | キーを持たない参照。`totals` は表の小項目の持分と出資の合計 |

`plan_versions.snapshot` の形: `{ header: { name, businessName, preparedBy }, answers: { questionKey, text, rows }[], keyMetrics, scenarios, execution: { type, title, status, dueDate, assigneeUserId, assigneeName, ... }[], competitors: { name, type, typicalPrice, strength, weakness }[] }`。`answers` は版を保存した時点の文章で、`keyMetrics` は `buildKeyMetrics()`、`scenarios` は `EconomicsResult.scenarios`、`competitors` は検証の上位5件。「+ changes」（5.9 `hasChangesSinceVersion`）は、版の保存より後に更新された回答・表・ヘッダ・実行管理の項目があるか（`updated_at` と `saved_at` の比較）で決める。

### 6.4 保存しないもの（毎回計算・生成する）

- 損益分岐・シナリオ表・投資回収・ROI（design-spec 6.4）
- 確認項目の状態・Next steps・F/A/U の内訳（design-spec 6.1）
- アイデアの工程（プランの有無と、アーカイブしていない案の最新の Go / No-Go から決める）
- プランに表示する検証の数字（常に検証から読む）
- Pitch Deck（PDF を含む）
- 例外: 決定ログ（`decision_log_entries.snapshot`）と版（`plan_versions.snapshot`）には、その時点の値を残す

### 6.5 データのルール

- **数字の正は検証に置く。** プランは数字を持たず、検証を参照する。数字の違う案は「アイデアを複製」して別の検証にする。
- **テンプレートを改訂しても、既存の回答は作成時の版に固定する。** 最新版への移行は任意で、設問 ID が一致する回答を引き継ぐ（design-spec 6.0.7）。
- **変更はすべて履歴に残す。** 対象は自己分析・検証・プラン・実行管理。自己分析の履歴は本人だけが見られる（ADR-020）。
- **決定ログは追記だけ。** 更新・削除しない（API を作らない。アカウントの削除でも記録者は「Deleted user」として残す）。
- **Fact には根拠が必須**（Fact にするときに、有効な `evidence_links` が1件以上）。例外は、調査ログの削除で根拠が0件になった「Fact（根拠なし）」で、警告の状態として残す。Assumption にだけ確信度を付ける（DB の check 制約でも守る）。数字の Unknown は値を持たない（同上）。
- **論理削除**: `deleted_at` を持つテーブルは論理削除で、履歴から戻せる。一覧・計算・確認項目の判定では数えない。
- **選択肢の値は原本を踏襲する。** 判定 Proceed / Hold / Drop、市場の種類 Red / Blue / Mixed、確信度 Low / Medium / High、Can Reduce? Yes / Partly / No、競合の種類 Direct / Indirect / Substitute、出典の種類（design-spec 6.10）。
- **ワークスペースの通貨を変えても金額は換算しない。**
- **アカウントの削除**: `users` の行は残して個人の情報を消す（5.4 U7）。外部キーは `users` を参照し続ける。
- **シード**: `make db-seed` は全テーブルを空にして design-spec 8章のデモデータを入れる（`APP_ENV=local` 以外では動かない。デモのユーザーのログイン中のセッションだけは残す。テストが1件ごとに入れ直しても、ログインが外れないため）。行の id は名前から決まるので、何度動かしても同じ id の行になる（パスワードのハッシュは毎回変わり、日時はシードを動かした日からの相対になる）。テンプレート v1 の中身は Drive の原本から転記したもの（design-spec 9.3）を `packages/db/seed/templates/` に置く。検証とプランの AI 用プロンプトは原本に無いので空で入れ、運営者が 27 で書く。

---

## 7. セキュリティ・パフォーマンス

### 7.1 認可（権限マトリクス）

design-spec 2.1（ロール）・2.2（権限マトリクス）・3章（認証要否）と同じ内容を、API の単位で書く。実装後の独立レビュー（認可漏れの確認）はこの表と照らし合わせる。○ = できる、— = できない（403）、本人 = 自分のものだけ。

| リソース / 操作（API） | 未認証 | Viewer | Member | Owner | Admin（運営者） |
|---|---|---|---|---|---|
| ログイン・パスワード再設定・招待の内容・招待からの新規登録（A1〜A3・A6・A7・U4・U5） | ○ | ○ | ○ | ○ | ○ |
| 死活確認（Z1） | ○ | ○ | ○ | ○ | ○ |
| 自分のアカウント（U1〜U3・U7・A4・A5・A8）・招待の受諾（U6。招待のメールと同じ人だけ） | — | 本人 | 本人 | 本人 | 本人 |
| ワークスペースの作成（W0） | — | ○ | ○ | ○ | ○ |
| ワークスペースの閲覧・メンバー一覧・メンションの候補（W1 GET・W2・W8） | — | ○ | ○ | ○ | 所属していれば、そのロールのとおり |
| ワークスペースの設定・ロール変更・メンバーの削除・招待（W1 PATCH・W3・W4〜W7） | — | 自分の Leave だけ | 自分の Leave だけ | ○ | W5〜W7 だけ（運営者が出した招待を含むすべての招待） |
| ダッシュボード（D1・D3・D4） | — | ○ | ○ | ○ | 所属していれば |
| ダッシュボードの自己分析（D2）・メンバーの自己分析（S6・S7。S7 は共有済みのみ） | — | — | ○ | ○ | 所属していれば |
| アイデア・検証・プラン・実行管理・Pitch Deck・決定ログの閲覧（I1 GET・I2 GET・V1・V2・V6 GET・V7 GET・V8 GET・V10 GET・V12・V15・P1 GET・P2 GET・P4・P6 GET・P9 GET・P12・P13・L1・L2） | — | ○ | ○ | ○ | 所属していれば |
| アイデア・検証・プラン・実行管理の作成と編集（I1 POST・I2 PATCH・I3・I4・V3〜V17 の書き込み・P1 POST・P2 PATCH・P3・P5・P9 POST・P10・P11） | — | — | ○ | ○ | 所属していれば |
| 判定・版の保存・Go / No-Go（V18・V19・P6 POST・P7・P8） | — | — | ○ | ○ | 所属していれば |
| AI 往復・テンプレートの移行（検証・プラン）（X1〜X3・T1・T2） | — | — | ○ | ○ | 所属していれば |
| 自分の自己分析（S1〜S5、自己分析の X1〜X3・T1・T2・H1〜H3） | — | 本人 | 本人 | 本人 | 本人 |
| コメントを読む・書く（C1。自己分析へのコメントを除く） | — | ○ | ○ | ○ | 所属していれば |
| 自己分析へのコメント（C1） | — | — | ○（共有先のワークスペースで） | ○（同左） | 所属していれば |
| コメントの編集・削除（C2） | — | 本人 | 本人 | 本人 | 本人 |
| スレッドの解決（C3） | — | ○ | ○ | ○ | 所属していれば |
| 変更履歴の閲覧（H1。自己分析の履歴は本人だけ） | — | ○ | ○ | ○ | 所属していれば |
| 変更履歴から戻す（H2・H3） | — | — | ○ | ○ | 所属していれば |
| 通知（N1〜N3） | — | 本人 | 本人 | 本人 | 本人 |
| テンプレート・ユーザー・ワークスペース・招待の管理（AD1〜AD9） | — | — | — | — | ○ |
| DB の死活確認（Z2） | Worker の共有シークレットがあるときだけ | | | | |
| 期限の通知の処理（Z3） | Cloud Scheduler の OIDC トークンだけ | | | | |

追加の決まり:

- **アーカイブ**: アーカイブしたアイデア・プランの中身を変える操作は 409 `ARCHIVED`（コメントを書く・元に戻すを含む。design-spec 6.8）。ロールが足りない人には先に 403 を返す（Viewer の編集は、アーカイブ中でも 403）。確認は書き込みの最後（更新日時の更新）でもう一度行い、確認と書き込みのあいだにアーカイブされても書き込みは残らない。読む・複製・Restore・Pitch Deck はできる。
- **運営者**: `is_admin` で開けるのは運営者の画面（AD1〜AD9）だけ。ワークスペースの中身は、そのワークスペースに所属しているときだけ、所属のロールのとおりに見られる（design-spec 2.1）。`is_admin` を直接変える API は無い。付くのは `make admin-create` の招待（`grants_admin = true`）から登録・受諾したときとシードだけで、AD9 の招待では付かず、外す API も無い。
- **停止・削除したユーザー**: セッションを消し、ログインを拒否する。残ったリクエストも、認証のミドルウェアが `users.status` を確かめて 401 にする。
- **実装**: 認可は、リソースからワークスペースを引く共通の関数（例: `resolveScope({ ideaId })` → `{ workspaceId, role, ideaArchived, planArchived }`）を通して判定し、クエリは必ずそのワークスペースで絞る（他のワークスペースの ID を指定しても読めないようにする）。自己分析は `self_analyses.user_id = ログイン中のユーザー` で絞る。結合テストで、この表のエンドポイント × ロールをすべて確かめる（10章）。

### 7.2 その他の設計判断

| 項目 | 決定 |
|---|---|
| 入力バリデーション | API は必須（`packages/schemas` の Zod。範囲・長さ・形式・列挙）。クライアントは同じスキーマで入力中に補助として検査する。最後の守りは DB の check 制約（6.3）。文字列の長さの上限は、短文200字・長文20,000字・理由とコメント5,000字 |
| シークレット | 置き場所の方針は ADR-027、CI の置き場所の一覧は2章「CI のシークレットと変数」が正。local は `.env`（コミットしない。`.env.example` だけコミットする）。staging / production の API のシークレットは Secret Manager から Cloud Run の環境変数として渡す。ローテーションの手順は 05_operation-runbook.md |
| CSRF | Better Auth はオリジンを確かめる（`TRUSTED_ORIGINS`）。`/api/v1` の状態を変えるリクエストは `Content-Type: application/json`（写真は `multipart/form-data`）に限り、`Origin` ヘッダーがあれば `TRUSTED_ORIGINS` と一致するかを確かめる（合わなければ 403 `FORBIDDEN`）。Content-Type の決まりは本体のあるリクエストに適用し、本体の無い POST・DELETE は Content-Type が無くてよい。JSON の1MB は `Content-Length` と実際に読んだ長さの両方で確かめる。Cookie は SameSite=Lax。スマホは `Origin` を送らないが、Cookie を自動では送らない（SecureStore から付ける）ので対象外 |
| CORS | 使わない（Web と API は同じオリジン。ADR-004）。CORS のヘッダーを返さないので、他のオリジンからのブラウザのリクエストは届かない。local は Vite の転送で同じオリジンにする |
| レート制限 | 仕組みは ADR-029。認証（Better Auth）は、秘密を受け取るパスごとに IP あたり1分10回（DB に記録。5.4）。アプリの API は、次の上限を同じ仕組みで持つ。ユーザーごと: 招待の送信・再送 1時間20回（Resend の1日100通を守る）、PDF の作成 1時間30回、AI 書き出し・取り込み 1時間60回（数えるのは X1 と X3。X2 は既存の内容を読むだけなので数えない）、アカウントの削除のパスワード確認（U7）10分5回。IP ごと: U5 の新規登録 1分10回（アカウントがまだ無いため）。超えたら 429 `RATE_LIMITED`。外側の守りとして、Cloudflare の無料のレート制限ルール1つを `/api/auth/*` に付ける |
| 直接のアクセス | Cloud Run の URL を直接呼ばれないように、Worker の共有シークレットを確かめる（2章 通信フロー 3）。`CF-Connecting-IP` は、共有シークレットのあるリクエストのときだけ信じる |
| セッション | HttpOnly・Secure・SameSite=Lax の Cookie。パスワードの再設定・変更、停止、アカウントの削除でセッションを消す。スマホは SecureStore。ログアウトしたら送信待ちの列（ADR-021）も消す |
| アップロード | プロフィール写真だけ。種類はファイルの中身で確かめ（拡張子を信じない）、5MB まで。sharp で 512×512 の WebP に変換し、位置情報などのメタデータを落とす |
| セキュリティヘッダー | 静的アセットの `_headers` ファイル（`apps/web/public/_headers`。ADR-004）で付ける: `Content-Security-Policy`（`default-src 'self'; img-src 'self' data: https://storage.googleapis.com; connect-src 'self' https://*.ingest.sentry.io; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'`）、`X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`、`Permissions-Policy`。HSTS は Cloudflare で有効にする |
| 個人情報 | 持つもの: メール・表示名・写真・タイムゾーン・セッションの IP と User-Agent・自己分析の回答（収入の希望額など、本人にとって機微な内容）・事業のアイデアと数字。通信は TLS、保存時の暗号化は Neon と Google Cloud の標準に任せ、列ごとの暗号化はしない（運営者もアプリからは中身を見られない。DB に入れるのは開発者1〜2人に限り、Neon・Google Cloud・Cloudflare のアカウントは2段階認証を必須にする）。ログと Sentry には本文・回答・メールを出さない（`userId` だけ。Sentry は `dataCollection` で利用者の情報・Cookie・ヘッダー・本文・クエリ・DB の値・スタックの変数をすべて集めない設定にする（Sentry v11 では `sendDefaultPii` の代わり））。アカウントの削除は U7。バックアップは30日で消える（ADR-028）ので、削除した情報は30日以内にバックアップからも消える |
| ストアの要件 | プライバシーポリシー（`/privacy`）とサポート（`/support`）の静的ページを Worker で配る（`apps/web/public/`。中身はストアへの提出までに用意する）。App Store のプライバシーの申告と Google Play のデータセーフティは、上の「個人情報」に合わせて書く。アプリ内のアカウント削除（U7）と、Google Play 向けの Web の削除の入口（`/account`）を用意する |
| 依存の脆弱性 | GitHub の Dependabot のアラートを有効にする。Better Auth・Elysia・Drizzle のセキュリティ修正は速やかに取り込む（05_operation-runbook.md） |

### 7.3 パフォーマンス

想定の規模: 初期は BCDX の数人、ワークスペース数個、アイデア数十件、変更履歴は数万行まで。過剰な仕組みは入れない（ADR-011）。

| 対象 | 目標 | 守る設計 |
|---|---|---|
| 項目の保存（V3・V14・V16 など） | p95 300ms 以内（コールドスタートを除く） | 1項目＋変更履歴の1トランザクション。クライアントは表示を先に変え（楽観的更新）、約1秒の入力の止まりで送る（design-spec 6.0.2） |
| ハブの画面（V1・P2・D1） | p95 800ms 以内 | 検証1件分のデータを決まった数のクエリでまとめて読み（N+1 をしない）、`packages/domain` でメモリ上で計算する。アイデアの一覧は検証ごとのデータを `IN (...)` でまとめて読む。一覧はページに分ける（I1 は50件） |
| 0台からの最初の応答 | 5秒以内（Cloud Run の起動＋Neon の起動） | Bun で起動を速くし、Cloud Run の起動時の CPU ブーストを有効にする。死活確認（Z1）は DB に触れない |
| Web の最初の表示 | 4G のミドルクラスのスマホで LCP 2.5秒以内 | ランディングはプリレンダー。アプリはルートごとにコードを分割し、静的アセットは CDN で長期キャッシュ |
| PDF の作成（P13） | 5秒以内（12枚） | react-pdf をサーバーで実行。フォントは起動時に読み込んでおく |
| DB の接続 | Neon のプールの上限を超えない | postgres.js のプールはインスタンスごとに最大5。Cloud Run は最大3台なので最大15接続 |
| クライアントのデータ | 画面の移動を速くする | TanStack Query。一覧は `staleTime` 30秒、編集中の画面は保存の応答で該当のキャッシュだけを更新する。通知の未読数は60秒ごと |

インデックスは 6.3 のスキーマに書いたもの。遅いクエリが見つかったら、Cloud Logging の `latencyMs` とクエリの実行計画で確かめてから足す。

---

## 8. エラーハンドリング

### 8.1 APIエラーレスポンス

すべてのエラーを同じ形で返す（Better Auth の `/api/auth/*` は Better Auth の形のまま。クライアントが 5.4 の表で対応させる）。

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "amount must be greater than or equal to 0",
    "requestId": "8f14e45f-ea9e-4c5b-9a1f-2c7e1d5a3b6c",
    "details": [{ "path": "amount", "code": "too_small", "message": "Must be 0 or more" }]
  }
}
```

- `code`: 機械が読むコード（下の表）。クライアントはこのコードで画面の文言を決める（`message` を画面に出さない）。
- `message`: 開発者向けの英語の説明（ログと同じ）。
- `requestId`: 8.3。
- エラーごとの追加の項目: `current`（`CONFLICT`）、`conflicts`（`CONFLICT_MULTI`）、`latest`（`DECISION_CHANGED`）、`invitedEmail`（`INVITATION_EMAIL_MISMATCH`）、`emptyCount`（`HAS_EMPTY_QUESTIONS`）、`workspaces`（アカウントの削除の `LAST_OWNER`）、`retryAfterSeconds`（`RATE_LIMITED`）、`invitationId`（`INVITATION_PENDING`）。`details` は `OUT_OF_RANGE` にも付く（`VALIDATION_FAILED` と同じ形）。

| HTTP | コード | 使う場面 |
|---|---|---|
| 400 | `BAD_REQUEST` | JSON として読めない、`Content-Type` が違う |
| 401 | `UNAUTHENTICATED` | 未ログイン、セッション切れ、停止・削除されたユーザー |
| 403 | `FORBIDDEN` | ロールが足りない（例: Viewer の編集）、共有シークレットが合わない、Origin が合わない |
| 403 | `NO_ACCESS` | そのワークスペースに所属していない |
| 403 | `INVITATION_EMAIL_MISMATCH`・`INVALID_PASSWORD`・`REAUTH_REQUIRED`・`NOT_SHARED` | 5章の各 API |
| 404 | `NOT_FOUND` | 資源が無い |
| 409 | `CONFLICT`・`CONFLICT_MULTI` | 同時編集の衝突（ADR-019） |
| 409 | `ARCHIVED` | アーカイブしたものを変えようとした |
| 409 | `LAST_OWNER`・`CANNOT_LEAVE_PERSONAL`・`ALREADY_MEMBER`・`INVITATION_PENDING`・`INVITATION_ALREADY_ACCEPTED`・`EMAIL_TAKEN`・`PASSWORD_ALREADY_SET`・`DECISION_CHANGED`・`DECISION_NOT_PROCEED`・`NAME_TAKEN`・`HAS_EMPTY_QUESTIONS`・`ALREADY_LATEST`・`DRAFT_EXISTS`・`PUBLISHED_READ_ONLY` | 状態がその操作を許さない（5章） |
| 410 | `INVITATION_INVALID` | 招待のトークンが無い・取り消し・期限切れ |
| 413 | `PAYLOAD_TOO_LARGE` | 本体が大きすぎる（JSON は1MB、写真は5MB。`Content-Length` が無い分割転送でも読んだ量で数える） |
| 422 | `VALIDATION_FAILED` | 入力の検査に失敗（`details` に項目ごとの `path`・Zod の `code`・`message`。入力の値そのものは返さない） |
| 422 | `FACT_REQUIRES_EVIDENCE`・`CONFIDENCE_REQUIRED`・`INVALID_CHOICE`・`QUESTION_NOT_FOUND`・`PERCENT_ONLY_FOR_VARIABLE`・`OUT_OF_RANGE`・`NOT_EDITABLE`・`INVALID_ASSIGNEE`・`INVALID_STATUS`・`MUST_BE_DONE_TO_SHARE`・`NOT_SHAREABLE`・`EMPTY_SCOPE`・`NOT_IMPORTABLE`・`REPLY_DEPTH`・`INVALID_MENTION`・`INVALID_QUESTION_KEY`・`TEMPLATE_INVALID`・`CANNOT_SUSPEND_SELF`・`CONFIRMATION_MISMATCH` | 業務の決まりに合わない（5章） |
| 426 | `APP_UPDATE_REQUIRED` | スマホのアプリの版が古すぎる（5.1） |
| 429 | `RATE_LIMITED` | 7.2 のレート制限 |
| 500 | `INTERNAL` | 想定外のエラー（詳細は返さない） |
| 502 / 503 / 504 | `UPSTREAM_UNAVAILABLE` | Worker が API に届かない・タイムアウト（Worker が同じ形で返す）。API が必要な依存先に届かないとき（Z2 の DB、招待のメールの送信）は API が 503 を返す |

コードの一覧は `packages/schemas/src/errors.ts` に型として置き、API とクライアントが共有する。Better Auth のフックで拒否するとき（`INVITATION_REQUIRED`・`ACCOUNT_SUSPENDED`）は、Better Auth のエラーの `code` に同じ名前を入れる。

### 8.2 フロントエンドでの表示方針

文言と置き場所は design-spec 6.0.6 と各画面の「状態」が正。ここはエラーの種類から表示の方法への対応だけを決める。

| エラー種別 | 表示方法（文言は design-spec の該当の状態） |
|---|---|
| バリデーションエラー（422 `VALIDATION_FAILED` など） | 入力欄の下に理由を出し、保存しない（design-spec 6.0.6「入力値が範囲外」）。クライアントの Zod の検査で送る前に止めるのが基本で、API の 422 は最後の守り |
| 業務の決まり（409・422 の個別のコード） | コードごとに design-spec の各画面の「状態」の文言を出す。対応はカタログのキー `errors.<CODE>`（9章） |
| 同時編集の衝突（409 `CONFLICT` / `CONFLICT_MULTI`） | design-spec 6.0.2 の確認 |
| 通信・サーバーエラー（ネットワーク断・5xx・`UPSTREAM_UNAVAILABLE`） | 保存: design-spec 6.0.2 の保存エラー（入力は送信待ちの列に残して自動で再送する。ADR-021）。読み込み: design-spec 6.0.6「読み込みエラー」（ブロックごと） |
| 認証エラー（401） | `/login?next=<今のパス>` へ移る（design-spec 5章「認証」）。送信待ちの列の扱いは ADR-021 |
| 認可エラー（403 `FORBIDDEN` / `NO_ACCESS`） | design-spec 6.0.6「権限がない」。編集の途中で権限が変わったときは、読み取りの表示に切り替える |
| 見つからない（404） | design-spec 6.0.6「見つからない」 |
| アーカイブ（409 `ARCHIVED`） | design-spec 6.1「アーカイブ済み」の表示に切り替える |
| アプリの更新が必要（426） | design-spec 6.0.6「アプリの更新が必要」 |
| 回数制限（429） | design-spec 6.0.6「回数の上限」 |
| 想定外のエラー（500 など） | design-spec 6.0.6「想定外のエラー」。`Ref` には `requestId` の先頭8文字を出す。画面の描画が失敗したとき（API の応答が無いとき）は `requestId` が無いので、Sentry のイベント ID の先頭8文字を出す。画面のブロックごとにエラーの境界（Error Boundary）を置き、1つの失敗で全体を壊さない。Sentry に送る |

### 8.3 ログとの対応

- **リクエスト ID**: Worker が `X-Request-Id`（無ければ UUID を作る）を付けて API へ渡す。API は全ログ行・エラーの応答・Sentry のタグに同じ値を入れ、応答のヘッダーにも返す。スマホも Worker を通るので同じ。Cloud Scheduler からの呼び出しは API が作る。
- **レベル**: 4xx は `info`（401・403 の多発は、ログの `status` を集計して見つける）、5xx は `error`。5xx は、アクセスログの行（`message: "request"`）とは別に、`message: "request failed"` の行を `requestId`・`errorCode`・`errorName`・`errorMessage`・`stack` 付きで書く。DB のエラーは `pgCode` と `constraint` だけを出し、SQL とパラメーターは出さない（利用者の入力が入るため）。Sentry に送るのは 5xx とクライアントの想定外のエラーだけ。
- **探し方**: 利用者の画面の `Ref` → Cloud Logging で `jsonPayload.requestId` を検索 → 同じ ID の Sentry のイベント。手順は 05_operation-runbook.md。

---

## 9. i18n（国際化）

**決定: UI は英語のみで始める。ただし多言語化できる作りにする**（design-spec 1.2）。回答の言語は自由で、アプリは翻訳しない。

| 項目 | 決定 |
|---|---|
| ライブラリ | i18next ＋ react-i18next（Web とスマホで同じ）。API も同じカタログを使う（通知の文・PDF の見出し・AI 書き出しの見出し・メール） |
| カタログ | `packages/i18n/locales/en/*.json`。ファイル名がネームスペース（`common`・`errors`・`mail`・`validation`）で、キーは画面と部品ごと（例: `validation:home.nextSteps.addEvidence`）。複数形は i18next の複数形の規則。UI の文言はすべてカタログに置き、コードに直接書かない（JSX の中の生の文字列は lint で見つける） |
| エラーの文言 | API の `error.code`（8.1）からカタログのキー `errors:<CODE>` を引く |
| 書式 | 書式と端数の規則の正は design-spec 1.2（ロケールと日付）と 6.4（端数・下限と上限の記号）。`packages/i18n` の書式関数（`formatMoney(amount, currency)`・`formatUnits()`・`formatPercent()`・`formatDate()`・`formatTime()`・`formatIsoDate()`・`formatRelativeTime()`）に集め、画面・PDF・AI 書き出しのすべてがこれを使う。`formatRelativeTime()` は1週間未満を「3 min. ago」のような相対表記にし、1週間以上前は日付にする |
| タイムゾーン | 表示は `users.timezone`（既定は登録時に端末から取ったもの）。DB は UTC。期限は日付だけで持つ |
| 実行環境 | `Intl.NumberFormat` / `Intl.DateTimeFormat` を使う（スマホの Hermes も対応）。金額の入力は桁区切りのカンマを受け付ける |
| 文字の表示 | 日本語・タガログ語・Hiligaynon の混在を表示できるフォント（06_design-tokens.json の代替フォント。PDF にも埋め込む。ADR-012） |
| テンプレートの中身 | 設問・EXAMPLE・ガイダンスは1言語（英語）でテンプレートに持ち、UI の多言語化とは別に扱う（design-spec 1.2） |
| 確認用ページ | `packages/ui-web/src/preview/`（`/dev/components`）は開発専用で、英語の文字列を直接持つ。この章の「UI の文言はカタログに置く」の対象外（`scripts/check-screens.ts` は `apps/web/src`・`apps/mobile/app` だけを見る） |
| 言語を足すとき | `locales/<lang>/` を足し、`users.locale` 列と 4 アカウント設定の言語の選択を足す（今は作らない） |

---

## 10. テスト戦略

| レイヤー | ツール | カバレッジ目標 | 対象 |
|---|---|---|---|
| 計算と判定（`packages/domain`） | Bun test | 行 95% 以上 | 損益分岐・シナリオ・投資回収・ROI（design-spec 8.3 の検算データを期待値どおりに再現する固定のテスト）、下限・上限の伝播、端数、確認項目6つの全状態、Next steps の優先順、F/A/U の状態と内訳、工程、`buildPitchDeck()`、AI 書き出しの Markdown / JSON の生成と `parseAiReply()` / `matchBlocks()` |
| 入力のスキーマ（`packages/schemas`） | Bun test | 主要なスキーマの境界値 | 範囲（金額・%・営業日数）、文字数、列挙 |
| API の結合（`apps/api`） | Bun test ＋ 実際の PostgreSQL（CI はサービスコンテナ） | 分岐 80% 以上 | 全エンドポイントの正常系、**7.1 の権限マトリクスの表駆動テスト（エンドポイント × ロール → 期待するステータス）**、変更履歴が1件ずつ増えること、楽観ロックの衝突、アーカイブ、招待（メール＋パスワード・Google のフック）、アカウントの削除、cron の重複防止、テンプレートの移行と戻し、PDF が作れること（ページ数と文字の抽出） |
| Web の部品（`packages/ui-web`） | Vitest ＋ Testing Library ＋ `@react-aria/test-utils` | 部品ごとに主要な状態 | design-spec 4.5 の各部品の種類・大きさ・状態（hover・pressed・focus-visible・disabled）、Popover と Tray の切り替え、キーボード操作、axe の検査 |
| スマホの部品（`packages/ui-native`） | Jest（jest-expo）＋ React Native Testing Library | 部品ごとに主要な状態 | 同じ名前の部品の種類・大きさ・アクセシビリティの属性、トレイの開閉 |
| Web（`apps/web`） | Vitest ＋ Testing Library | 主要な部品 60% 以上 | 設問フォームのフォーカス、F/A/U のボタンと M2、費用のワークシートの合計、自動保存と送信待ちの列、衝突の確認、権限による表示の出し分け |
| スマホ（`apps/mobile`） | Jest（jest-expo）＋ React Native Testing Library | 主要な部品 50% 以上 | 1問ずつのカード、ボトムシートでの行の編集、自動保存と送信待ちの列、セッションの保存 |
| E2E（Web） | Playwright（Chromium。`e2e/`） | コアフローとロールの代表 | コアフロー（アイデアの作成 → 回答と根拠 → 費用 → 損益 → 判定 → プラン下書き → 版の保存 → Go / No-Go → Pitch Deck の PDF）、招待からの新規登録、Viewer の読み取り専用、AI 書き出し → 取り込み、アカウントの削除。主要な画面で axe のアクセシビリティ検査 |
| E2E（スマホ） | Phase 5 で Maestro の導入を判断する（ADR-001）。それまでは、ストアへの提出前に TestFlight / Play の内部テストで手で確かめる（04_deployment-procedure.md のチェックリスト） | — | コアフロー |
| デザイントークン | Bun test（`make test-domain`）と `make tokens` の検査 | — | エイリアスの参照先が実在すること・循環しないこと・`semantic` がエイリアスだけであること、意味色のコントラスト（WCAG AA。検査の対象に無い色の組が増えたら失敗）、生成物が 06 と一致すること、Web のテーマが vanilla-extract でコンパイルできること、`packages/ui-tokens/src/types.ts` の値が 06 と合っていること |

CI（GitHub Actions）が PR ごとに動かすターゲットは 04_deployment-procedure.md 2章（`ci.yml`）が正。`main` への取り込みは、すべて通ったときだけ。

---

## 11. モニタリング・ログ

| 項目 | ツール | 設定 |
|---|---|---|
| API のエラー | Sentry（プロジェクト `moonx-api`） | `environment` = staging / production、`release` = コミット SHA、タグに `requestId`・`route`。ユーザーは `userId` だけ。新しい issue でメール通知 |
| Web・スマホのエラー | Sentry（`moonx-web` / `moonx-mobile`） | CI でソースマップを上げる。スマホの `release` はアプリの版、`dist` は EAS Update の ID |
| API のログ | Cloud Logging | 標準出力に1行1つの JSON（`severity`・`message`・`requestId`・`userId`・`route`・`status`・`latencyMs`・`client`・`appVersion`）。保持は既定の30日 |
| Worker のログ | Cloudflare Workers Logs（`wrangler.jsonc` の `observability` を有効にする。無料プランの保持は3日） | `/api/*` の転送の失敗（`UPSTREAM_UNAVAILABLE`）を見る。その場で追うときは `wrangler tail` |
| 死活 | Cloud Monitoring の稼働時間チェック | `https://{DOMAIN}/api/health`（Z1。DB に触れない）を5分ごと、3つの地域から。2つ以上の地域で失敗が5分続いたらメール |
| エラー率 | Cloud Monitoring（ログベースの指標） | 5xx が10分間で全体の1%を超える、または5分で5件を超えたらメール |
| レイテンシ | Cloud Run の指標 | リクエストの p95 が15分続けて3秒を超えたらメール（0台からの起動を含むため、目標の 7.3 より緩くする） |
| 定期実行 | Cloud Scheduler のジョブの結果（ログベースの指標） | production の `moonx-production-due-notifications` が2回続けて失敗したらメール（staging にはアラートを付けない） |
| メモリ | Cloud Run の指標 | メモリの使用率が5分続けて90%を超えたらメール（PDF の作成で足りなくなる兆し） |
| 台数 | Cloud Run の指標 | 台数が上限の3台に10分続けて張り付いたらメール |
| DB の容量 | Neon のコンソール | 無料プランの 0.5GB に対して 400MB を超えたら対応する（確かめ方は 05_operation-runbook.md） |
| メール | Resend のダッシュボード | 送信の失敗と戻り（バウンス）。API のログにも送信の失敗を出す |
| 無料枠の使用量（週1回、手で見る。アラートは付けない） | 各サービスのダッシュボード | 次の目安を超えたら、05_operation-runbook.md の手順で原因を探し、有料プランか構成の見直しを検討する: Sentry 月4,000件（無料枠の80%）、Neon の計算時間 80%、Resend 1日80通・月2,400通、Worker 1日7万回、Cloud Run の無料枠 80% |
| 費用 | Google Cloud の予算アラート（Terraform） | 月 $5 と $10 でメール（予算にストアの登録費は含めない） |
| KPI（01_prd.md） | `packages/db/queries/kpi.sql` | 件数だけを数える SQL（回答の中身は読まない）。DB に入れる開発者（7.2）が月に1回、production に読み取り専用の接続で実行し、件数だけを運営者に渡す |
