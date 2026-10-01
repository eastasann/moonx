# System Design Doc — moonx

- 入力: `docs/design-spec.md`（画面・UX の正）、`docs/screen_flow.mermaid`
- この文書が正として持つもの: アーキテクチャ、技術選定（ADR）、ルーティング、API、**データモデル**、セキュリティ、エラーハンドリング、i18n、テスト、モニタリング
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

- アプリへの AI の組み込み（AI の呼び出しは一切しない。外部の AI との往復だけを支える）
- リアルタイムの共同編集（同じ欄を同時に打つと、後から保存した人に衝突を知らせる。カーソルの共有や即時反映はしない）
- プッシュ通知・メール通知（通知はアプリ内だけ。メールは招待とパスワード再設定だけ）
- オフラインでの閲覧（保存できなかった入力の再送だけをする）
- 多言語の UI（初期は英語だけ。多言語化できる作りは残す。9章）
- 決済・課金、複数通貨の換算、Google Drive との連携
- 運営者がワークスペースの中身を見る機能

---

## 2. アーキテクチャ概要

```
                    ┌───────────────────────── Cloudflare（DNS・CDN・無料枠）──────────────────────────┐
 Web ブラウザ ─────▶ │ Worker「moonx-web」                                                              │
                    │  ├ /*      → 静的アセット（apps/web の SPA。見つからないパスは index.html）       │
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
3. **Worker → Cloud Run**: Worker は `/api/*` を Cloud Run の URL へ転送し、`X-Moonx-Proxy-Secret`（共有シークレット）と `CF-Connecting-IP`（利用者の IP）を付ける。API は `/internal/*` と `/api/health` 以外で共有シークレットを確かめ、直接のアクセスを拒否する（IP の偽装を防ぐ）。
4. **定期実行**: Cloud Scheduler が1時間ごとに Cloud Run の `/internal/cron/due-notifications` を OIDC トークン付きで直接呼ぶ。API はトークンの発行者・audience・サービスアカウントを確かめる。
5. **メール**: API が Resend の HTTP API で送る（送信元 `no-reply@{DOMAIN}`）。
6. **計算**: 損益分岐・シナリオ・確認項目・F/A/U の内訳・工程は `packages/domain` の純粋関数で計算する。クライアントは入力のたびにその場で計算して表示し、API は一覧・ダッシュボード・決定ログのスナップショット・版の保存・PDF で同じ関数を使う。DB には保存しない（6章「保存しないもの」）。
7. **通知の受け取り**: 常時接続は使わない。クライアントは画面を開いたとき・アプリが前面に戻ったとき・60秒ごと（画面が見えている間だけ）に未読数を取りに行く。

### インフラ管理

| 対象 | 管理方法 |
|---|---|
| Google Cloud（Cloud Run・Artifact Registry・Secret Manager・Cloud Scheduler・Cloud Storage・サービスアカウント・Workload Identity Federation・Monitoring のアラート） | **Terraform**（`infra/terraform/`。状態は Cloud Storage のバケットに置く） |
| Cloudflare（DNS レコード） | **Terraform**（Cloudflare provider） |
| Cloudflare Worker と静的アセット | `apps/web/wrangler.jsonc`（デプロイは `wrangler deploy`） |
| Neon（プロジェクトとブランチ） | Neon のコンソールで作り、接続文字列を Secret Manager に入れる（無料プランは Terraform の対象にしない。手順は 03_dev-setup.md） |
| スマホのビルドと配布 | `apps/mobile/eas.json`・`app.config.ts` |
| DB のスキーマ | Drizzle のマイグレーション（`packages/db/migrations/`。CI がデプロイ前に適用する） |
| デプロイのきっかけ | `deploy/{staging,production}/version` の更新（GitHub Actions。04_deployment-procedure.md） |

### リポジトリ構成

Bun workspaces のモノレポ。実コマンドは `Makefile` が唯一の正で、ドキュメントはターゲット名だけを書く。

```
moonx/
├─ apps/
│  ├─ web/        TanStack Start（SPA モード）。worker/ に Cloudflare Worker（/api の転送）、wrangler.jsonc
│  ├─ mobile/     Expo（Expo Router・NativeWind）。eas.json・app.config.ts
│  └─ api/        ElysiaJS（Bun）。Better Auth・REST API・cron・PDF。Dockerfile
├─ packages/
│  ├─ domain/     計算・確認項目・F/A/U・工程・Pitch Deck の組み立て・AI 書き出し / 取り込みの書式（純粋関数）
│  ├─ schemas/    Zod のスキーマ（API の入出力とフォームの入力チェック）
│  ├─ db/         Drizzle のスキーマ・マイグレーション・シード
│  ├─ i18n/       英語のメッセージカタログと書式（en-PH）
│  └─ ui-tokens/  06_design-tokens.json から生成する Tailwind / NativeWind のテーマ（生成物）
├─ infra/terraform/  modules/ と envs/{staging,production}/
├─ deploy/{staging,production}/version   デプロイする Git のコミット SHA
├─ e2e/           Playwright（Web）
└─ Makefile
```

### 環境と命名

| 項目 | local | staging | production |
|---|---|---|---|
| Web・API の URL | Web `http://localhost:5173`（Vite が `/api` を API へ転送）・API `http://localhost:3000` | `https://staging.{DOMAIN}` | `https://{DOMAIN}` |
| API（Cloud Run） | `bun --watch` | `moonx-api-staging` | `moonx-api-production` |
| Cloudflare Worker | `vite dev` | `moonx-web`（env: staging） | `moonx-web`（env: production） |
| DB | Docker の PostgreSQL 17（`localhost:5432`、DB 名 `moonx`） | Neon プロジェクト `moonx` のブランチ `staging` | 同じプロジェクトのブランチ `production` |
| メール | コンソールに出す | Resend（送信先は許可リストのメールだけ） | Resend |
| スマホ | Expo の開発ビルド | EAS のチャンネル `staging`（TestFlight / Play 内部テスト） | EAS のチャンネル `production`（App Store / Google Play） |
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
| `APP_ENV` | api | `local` / `staging` / `production` | `local` | Cloud Run の環境変数 |
| `PORT` | api | 待ち受けるポート | `3000` | Cloud Run が `8080` を渡す |
| `DATABASE_URL` | api, db | PostgreSQL の接続文字列 | `postgres://moonx:moonx@localhost:5432/moonx` | Secret Manager `moonx-{env}-database-url`（Neon のプール接続） |
| `DATABASE_URL_DIRECT` | db（マイグレーション） | プールを通さない接続文字列 | `DATABASE_URL` と同じ | GitHub Actions の環境のシークレット |
| `BETTER_AUTH_SECRET` | api | セッションの署名鍵（32バイト以上の乱数） | `.env` に任意の値 | Secret Manager `moonx-{env}-better-auth-secret` |
| `BETTER_AUTH_URL` | api | 公開の URL（Cookie と OAuth のコールバックの基準） | `http://localhost:5173` | `https://staging.{DOMAIN}` / `https://{DOMAIN}` |
| `TRUSTED_ORIGINS` | api | 許可するオリジン（カンマ区切り） | `http://localhost:5173,moonx://,exp://` | `https://{DOMAIN},moonx://`（staging は `https://staging.{DOMAIN},moonx-staging://`） |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | api | Google ログイン（OAuth クライアント。環境ごとに作る） | 開発用のクライアント | ID は環境変数、SECRET は Secret Manager `moonx-{env}-google-client-secret` |
| `MAIL_TRANSPORT` | api | `console` / `resend` | `console` | `resend` |
| `RESEND_API_KEY` | api | Resend の API キー | 不要 | Secret Manager `moonx-{env}-resend-api-key` |
| `MAIL_FROM` | api | 送信元 | `moonx <no-reply@localhost>` | `moonx <no-reply@{DOMAIN}>` |
| `MAIL_ALLOWLIST` | api | staging でだけ使う送信先の許可リスト（カンマ区切り。空なら制限なし） | 空 | staging だけ設定 |
| `PROXY_SHARED_SECRET` | api, Worker | Worker が付ける共有シークレット | 空（local では検査しない） | Secret Manager `moonx-{env}-proxy-shared-secret` と Worker のシークレット |
| `API_ORIGIN` | Worker | 転送先の Cloud Run の URL | 不要（Vite の転送を使う） | `wrangler.jsonc` の環境ごとの `vars` |
| `CRON_OIDC_AUDIENCE` | api | cron の OIDC トークンの audience（Cloud Run の URL） | 空（local では `make cron-due` が直接呼ぶ） | Cloud Run の環境変数 |
| `CRON_INVOKER_EMAIL` | api | cron を呼ぶサービスアカウントのメール | 空 | Cloud Run の環境変数 |
| `AVATAR_BUCKET` | api | プロフィール写真のバケット | 空（local はディスク `./.data/avatars`） | `moonx-{env}-avatars` |
| `SENTRY_DSN` | api | Sentry（API） | 空 | Cloud Run の環境変数 |
| `LOG_LEVEL` | api | `debug` / `info` / `warn` / `error` | `debug` | `info` |
| `VITE_APP_ENV` / `VITE_SENTRY_DSN` | web（ビルド時） | 環境名と Sentry（Web） | `local` / 空 | GitHub Actions の環境の変数 |
| `EXPO_PUBLIC_API_BASE_URL` | mobile | API の基準 URL | `http://<開発 PC の IP>:3000/api` | `https://staging.{DOMAIN}/api` / `https://{DOMAIN}/api`（eas.json の profile ごと） |
| `EXPO_PUBLIC_APP_ENV` / `EXPO_PUBLIC_SENTRY_DSN` | mobile | 環境名と Sentry（スマホ） | `local` / 空 | eas.json の profile ごと |

### make ターゲット

| ターゲット | 内容 |
|---|---|
| `setup` | 依存の取得（`bun install`）、`.env` の雛形のコピー、`db-up`、`db-migrate`、`db-seed`、`tokens` |
| `dev` | API と Web を同時に起動（`dev-api` と `dev-web`） |
| `dev-api` / `dev-web` / `dev-mobile` | それぞれを単独で起動（`dev-mobile` は Expo の開発サーバー） |
| `build` | 全パッケージの型チェックとビルド（API の Docker イメージは CI が作る） |
| `test` | `test-domain`・`test-api`・`test-web`・`test-mobile` をまとめて実行 |
| `test-domain` / `test-api` / `test-web` / `test-mobile` | 単体・結合テスト |
| `test-e2e` | Playwright（Web。API・DB を起動した状態で） |
| `lint` / `format` / `typecheck` | Biome の検査・整形、TypeScript の型チェック |
| `db-up` / `db-down` | ローカルの PostgreSQL（Docker Compose）の起動・停止 |
| `db-generate` | Drizzle のスキーマからマイグレーションを作る |
| `db-migrate` | マイグレーションを適用する（`DATABASE_URL_DIRECT` か `DATABASE_URL`） |
| `db-seed` / `db-reset` | デモデータを入れる（design-spec 8章）/ DB を作り直してシードまで |
| `db-studio` | Drizzle Studio |
| `tokens` | `docs/06_design-tokens.json` から `packages/ui-tokens` を生成する |
| `openapi` | API の OpenAPI 仕様を `apps/api/openapi.json` に書き出す |
| `cron-due` | 期限の通知の処理を手で1回動かす（local・staging の確認用） |
| `admin-create EMAIL=...` | 最初の運営者を作るための招待（ワークスペースなし）を発行し、リンクを表示する |
| `infra-plan ENV=...` / `infra-apply ENV=...` | Terraform の plan / apply |

---

## 3. 技術選定と判断理由（ADR）

技術スタックは Phase 3 でユーザーと決めた（2026-10-01）。ユーザーの指定は ADR ごとに「（ユーザー指定）」と書く。

| # | 領域 | 決定 |
|---|---|---|
| ADR-001 | クライアントの構成 | Web とスマホのネイティブアプリを**別々のコード**で作り、計算・入力チェック・型を共有パッケージで共有する |
| ADR-002 | Web | **TanStack Start**（SPA モード）＋ Tailwind CSS |
| ADR-003 | スマホ | **Expo**（React Native）＋ Expo Router ＋ NativeWind。**iOS と Android を最初からストアで配る** |
| ADR-004 | Web の配信 | **静的ファイル＋`/api` の転送**の形に固定し、Cloudflare（Worker の静的アセット）で配る |
| ADR-005 | API | **ElysiaJS**（Bun） |
| ADR-006 | 通信方式 | **REST**。クライアントは **Eden Treaty**、仕様書は OpenAPI。常時接続は使わない |
| ADR-007 | API の実行環境 | **Cloud Run**（asia-southeast1、0〜3台） |
| ADR-008 | DB | **Neon の PostgreSQL** を、Neon 独自の機能を使わない標準の PostgreSQL として使う |
| ADR-009 | ORM・入力チェック | **Drizzle ORM**（postgres.js）＋ **Zod v4** |
| ADR-010 | 認証 | **Better Auth**（メール＋パスワード、**Google ログイン**）。招待制はサーバーで強制する |
| ADR-011 | キャッシュ | サーバー側のキャッシュは置かない。クライアントは **TanStack Query** |
| ADR-012 | Pitch Deck の PDF | API サーバーで **react-pdf** を使って作る |
| ADR-013 | メール・ドメイン | **Resend** ＋ 独自ドメイン（Cloudflare Registrar） |
| ADR-014 | 定期実行 | **Cloud Scheduler** → API の内部エンドポイント |
| ADR-015 | IaC | **Terraform**（GCP と Cloudflare の DNS）＋ wrangler / EAS の設定ファイル |
| ADR-016 | 環境とリリース | **staging ＋ production**。`deploy/{env}/version` による昇格 |
| ADR-017 | モノレポ | **Bun workspaces** ＋ Makefile |
| ADR-018 | スタイルとデザイントークン | 06_design-tokens.json から Tailwind（Web）と NativeWind（スマホ）のテーマを生成する。アイコンは Lucide |
| ADR-019 | 同時編集 | 項目単位の楽観ロック（`lock_version`）。衝突は 409 で返し、利用者に選ばせる |
| ADR-020 | 変更履歴の記録 | アプリのコードで、本体の更新と同じトランザクションの中で `change_history` に書く |
| ADR-021 | 保存できなかった入力の再送 | クライアントの送信待ちの列（Web: IndexedDB、スマホ: SQLite）に残して再送する |
| ADR-022 | テスト・リント | Bun test・Vitest・Jest（jest-expo）・Playwright・Biome |
| ADR-023 | 監視・ログ | Sentry ＋ Cloud Logging（構造化 JSON・リクエスト ID） |
| ADR-024 | 画像の保存 | プロフィール写真は Cloud Storage |

### ADR-001: Web とスマホを別々に作り、ロジックを共有する（ユーザー指定）

**決定:** Web（`apps/web`、TanStack Start）とスマホ（`apps/mobile`、Expo）を別々のコードで作る。画面は別々に作り、次のものは `packages/` で共有する: 計算と判定（`domain`）、API の入出力とフォームの入力チェック（`schemas`）、API の型（Eden Treaty が `apps/api` の型を読む）、文言と書式（`i18n`）、デザイントークン（`ui-tokens`）。

**理由:** ユーザーが「Web とスマホを別々に作る」を選んだ。design-spec は書く画面をスマホ基準、数字と表の画面を Web 基準で設計している（design-spec 1.2）。どちらにも最適な部品を使える（Web は DOM の表・キーボード操作、スマホはネイティブのキーボードとシート）。画面が違っても計算と判定の結果が食い違わないように、ロジックは1か所に置く。

**トレードオフ:** 28画面を2回作るので、開発と保守の手間は一体型（Expo で Web も出す）のほぼ2倍。Web とスマホで画面の挙動がずれる危険があるため、画面の仕様は design-spec だけを正とし、E2E は Web（Playwright）と、スマホのコアフロー（Maestro。Phase 5 で導入を判断）で確かめる。捨てた案: Expo で Web も出す（Web の表やワークシートが作りにくい）、Web を Capacitor で包む（Apple の審査で「Web を包んだだけ」と判断される危険）。

### ADR-002: Web は TanStack Start の SPA モード（ユーザー指定）

**決定:** `apps/web` は TanStack Start（React・TanStack Router・Vite）を **SPA モード**で使い、静的ファイルとして出力する。ランディング（1）だけはビルド時に HTML を作る（プリレンダー）。データはすべて API（Eden Treaty ＋ TanStack Query）から取る。TanStack Start のサーバー関数・サーバー描画は使わない。フォームは TanStack Form（Zod のスキーマをそのまま使う）。UI 部品は Radix UI のプリミティブを土台に自作する（見た目は 06_design-tokens.json）。

**理由:** ユーザーが Next.js 以外として TanStack Start を選んだ。ログイン後の画面がほぼすべてで、検索エンジン向けのサーバー描画は要らない。データの取得口を Elysia の API 1つにまとめれば、スマホと同じ API を使える。ルートの型安全（パスと検索パラメータ）が、画面数の多いアプリで効く。

**トレードオフ:** TanStack Start は比較的新しく、情報が Next.js より少ない。サーバー描画を使わないので最初の表示は JS の読み込み待ちになる（ランディングはプリレンダーで補う）。将来サーバー描画が要るようになったら、TanStack Start のまま SSR モードに切り替えられる（そのときは Worker で動かす。ADR-004 の形は変わらない）。

### ADR-003: スマホは Expo、iOS と Android を最初からストアで配る（ユーザー指定）

**決定:** `apps/mobile` は Expo（React Native、New Architecture）＋ Expo Router ＋ NativeWind。ビルドとストアへの提出は EAS Build / EAS Submit、JS だけの修正は EAS Update（チャンネル `staging` / `production`）。iOS（App Store・TestFlight）と Android（Google Play）を最初から両方配る。セッションは Better Auth の Expo プラグインで SecureStore に保存する。保存できなかった入力は expo-sqlite に残す（ADR-021）。PDF は API から受け取り、expo-sharing で共有する。

**理由:** ユーザーが「ネイティブアプリ」「最初から iOS と Android の両方」を選んだ。Expo は TypeScript・React で書けて Web と知識を共有でき、ネイティブのビルド環境（Mac など）を持たずにクラウドでビルド・提出できる。EAS の無料枠で試運転の規模は足りる。

**トレードオフ:** ストアの審査があるので、修正の公開に1〜数日かかることがある（JS だけの修正は EAS Update で即時に出せる）。Apple の登録費（年 $99）と Google の登録費（$25 の1回だけ）がかかる（運用費の予算には含めない。ユーザーと合意済み）。招待制のアプリなので、審査用のデモアカウント（staging ではなく production の、審査専用のワークスペース）を用意する（04_deployment-procedure.md）。

### ADR-004: Web は「静的ファイル＋/api の転送」で配り、Cloudflare に置く

**決定:** Web の配信は「`/*` は静的ファイル（見つからないパスは `index.html`）、`/api/*` は API へ転送」という形に固定する。置き場所は Cloudflare の Worker（静的アセット機能）で、`/api/*` だけ Worker のコード（`apps/web/worker/index.ts`）が動いて Cloud Run へ転送する。スマホも同じ `https://{DOMAIN}/api` を使う。独自ドメインの DNS も Cloudflare に置く。

**理由:** ユーザーの希望は「後から簡単に変えられること」。配信の役割をこの2つに限れば、どの配信先（Cloudflare、Netlify、nginx など）にも同じ形で移れて、アプリのコードは変わらない。Web と API が同じオリジンになるので、ログインの Cookie が第三者 Cookie にならず、Safari でも動き、CORS も要らない。Cloudflare の無料枠で静的アセットの配信は回数無制限、Worker は1日10万回まで（API の呼び出しだけが数える）で足りる。

**トレードオフ:** Google Cloud と Cloudflare の2つのアカウントを使う。最初の案だった Firebase Hosting は、Cloud Run へ転送するときに `__session` という名前以外の Cookie を落とすため、Better Auth のセッションと Google ログインの状態の Cookie が届かず使えないと分かり、やめた（2026-10-01）。Google Cloud のロードバランサ＋Cloud CDN は月 $18 程度かかり予算を超える。Cloud Run から Web も配る案は、API が休んでいると画面の表示まで数秒待たせるのでやめた。

### ADR-005: API は ElysiaJS（Bun）（ユーザー指定）

**決定:** `apps/api` は ElysiaJS を Bun で動かす。ルートはドメイン（ワークスペース・アイデア・検証・プランなど）ごとのプラグインに分け、認証と権限の確認はプラグインの `derive` / `beforeHandle` でまとめて行う。入出力のスキーマは Zod v4（Standard Schema として Elysia に渡す）。Better Auth はハンドラーを `/api/auth/*` にマウントする。

**理由:** ユーザーが ElysiaJS を指定し、「Elysia の仕組み」（Eden Treaty の型共有）を使いたいとした。Bun で速く起動するので、Cloud Run の0台からの立ち上がりが短い。

**トレードオフ:** Bun 前提なので、Node.js 前提のライブラリで動かないものがまれにある（導入時に確かめる）。Express や Hono より利用者が少なく、情報も少ない。Zod を Standard Schema で使う機能は新しいため、OpenAPI の出力に問題があれば、API の境界だけ Elysia の `t`（TypeBox）に切り替える（共有の Zod スキーマとは変換で合わせる）。

### ADR-006: 通信は REST、クライアントは Eden Treaty（ユーザー指定）

**決定:** API は `/api/v1` の下の REST（JSON、項目名は camelCase）。Web とスマホは Eden Treaty（`treaty<App>()`）で型付きで呼ぶ。仕様書は `@elysiajs/openapi` で出す（staging は `/api/docs` で読める。production は出さない）。常時接続（WebSocket・SSE）は使わず、通知の未読数は取りに行く（2章 通信フロー 7）。

**理由:** Web とスマホの2つのクライアントが同じ API を使うので、言語に依存しない REST にし、型は Eden で共有する。ユーザーが Elysia の仕組み（Eden）を使いたいとした。共同編集の即時反映は Non-Goal なので、常時接続の運用コストに見合わない。

**トレードオフ:** Eden の型は `apps/api` の `App` 型に依存するため、API の変更でクライアントの型エラーがすぐ出る（利点でもある）。スマホの古い版が残る間は、API の互換性を壊せない。壊す変更は `/api/v2` を作るか、項目の追加だけにする（受け取る側は知らない項目を無視する）。

### ADR-007: API は Cloud Run（asia-southeast1）（ユーザー指定）

**決定:** API のコンテナ（`oven/bun` の公式イメージがベース）を Cloud Run で動かす。リージョンは asia-southeast1（シンガポール。利用者のいるフィリピンと Neon に近い）。最小0台・最大3台、1 vCPU・1 GiB（PDF の作成に余裕を持たせる）、同時リクエスト 40、タイムアウト 60秒、CPU はリクエストの間だけ割り当てる。イメージは Artifact Registry（古いイメージは自動で消す）。認証は Workload Identity Federation（GitHub Actions に鍵を置かない）。

**理由:** ユーザーが Cloud Run を選んだ。コンテナなので Bun と PDF のライブラリが制約なく動き、無料枠（月200万リクエスト、CPU 18万秒）に試運転は十分収まる。

**トレードオフ:** 0台から起動するときに数秒待つ（コールドスタート）。最初の利用者が遅く感じたら、営業時間だけ最小1台にする（月数ドル）。Secret Manager は無料枠（有効な版6つ）を超えるため、月 $1 程度かかる。

### ADR-008: DB は Neon。ただし標準の PostgreSQL として使う

**決定:** Neon（PostgreSQL 17、リージョン AWS ap-southeast-1）の無料プランを使う。プロジェクト `moonx` の中に `production` と `staging` のブランチを作る。**Neon 独自の機能（専用のサーバーレスドライバ、Data API、Neon Auth）は使わない。** 接続は標準の PostgreSQL プロトコル（postgres.js）で、API は Neon のプール接続（PgBouncer。`prepare: false`）を使い、マイグレーションはプールを通さない接続を使う。

**理由:** 無料で、使われないときは休むので $0 で運用できる。ユーザーが「Neon を後から変えられるようにしたい」とした。接続文字列（`DATABASE_URL`）以外に Neon への依存を作らなければ、Cloud SQL・Supabase・自前の PostgreSQL へ、データを書き出して移し `DATABASE_URL` を変えるだけで乗り換えられる。

**トレードオフ:** しばらく使われないと DB が休み、最初の応答が1秒ほど遅れる。無料プランの容量は 0.5 GB で、変更履歴（`change_history`）が増え続けると足りなくなる可能性がある（05_operation-runbook.md で容量を監視する。超えそうなら Neon の有料プランか、別の PostgreSQL へ移る）。ブランチは Neon の機能だが、staging 用の別 DB で代わりがきくので、乗り換えの妨げにはならない。

### ADR-009: ORM は Drizzle、入力チェックは Zod v4

**決定:** `packages/db` に Drizzle のスキーマ（6章のコード）を置き、drizzle-kit でマイグレーションの SQL を作る。ドライバは postgres.js。入力チェックは Zod v4 で `packages/schemas` に置き、API（Elysia）とフォーム（Web は TanStack Form、スマホも同じ）が同じスキーマを使う。

**理由:** Drizzle は TypeScript でスキーマを書け、生成する SQL が素直で読める（乗り換えのときも普通の SQL として持ち出せる）。Better Auth に Drizzle 用のアダプターがある。Zod は Web・スマホ・API の全部で同じ入力チェックを使える。

**トレードオフ:** Prisma より抽象度が低く、複雑な集計は SQL に近い書き方になる。Drizzle の破壊的な変更に追従する必要がある（バージョンを固定し、上げるときは差分を確かめる）。

### ADR-010: 認証は Better Auth。Google ログインを最初から入れ、招待制をサーバーで強制する（ユーザー指定）

**決定:** Better Auth を API に組み込む（Drizzle アダプター、テーブルは6章）。ログインはメール＋パスワードと Google。プラグインは Expo（スマホのセッション）と、Better Auth の回数制限（保存先は DB）。招待制は次のとおりサーバーで強制する:

- メール＋パスワードの新規登録は Better Auth の公開エンドポイントを閉じ（`emailAndPassword.disableSignUp`）、moonx の `POST /api/v1/invitations/{token}/sign-up` だけから作る。メールは招待のメールに固定する。
- Google の新規登録は、招待の画面からだけ `requestSignUp` 付きで始める（`disableImplicitSignUp`）。さらにユーザーを作る直前のフック（`databaseHooks.user.create.before`）で、**そのメールあての有効な招待（pending・期限内）があること**を確かめ、無ければ拒否する。
- ユーザーを作った直後のフックで、個人用ワークスペースを作る（design-spec 5章）。
- 最初の運営者は `make admin-create EMAIL=...` でワークスペースなしの招待を発行し、登録したユーザーを運営者にする（`is_admin`。design-spec 9.2 の既定案）。
- 停止したユーザー（`status = suspended`）はセッションを消し、ログインのフックで拒否する。

**理由:** ユーザーが Better Auth で最初から Google ログインを入れると指定した。ライブラリなので $0 で、ユーザー情報は自分の DB に残り、乗り換えの妨げにならない。招待制のような独自の決まりを、フックで確実に組み込める。

**トレードオフ:** 認証の画面（ログイン・新規登録・パスワード再設定）は自分で作る（design-spec 2 の仕様どおり）。Google の OAuth クライアントを環境ごとに作り、同意画面の設定と、スマホから戻るディープリンクの設定が要る。Better Auth の更新でセキュリティ修正が出たら速やかに上げる。

### ADR-011: サーバー側のキャッシュは置かない

**決定:** Redis などのサーバー側のキャッシュは置かない。クライアントは TanStack Query でデータを持ち（画面の移動ではキャッシュを先に出し、裏で取り直す。保存したら関係するキーを無効にする）、API の応答は `Cache-Control: no-store`（個人のデータのため）。静的アセットは Cloudflare の CDN が持つ（ファイル名にハッシュを付けて長期キャッシュ）。Better Auth の回数制限は DB に記録する。

**理由:** 利用者は BCDX の数人で、データ量も小さい。複数人が同じアイデアを編集するので、サーバー側のキャッシュは古い内容を見せる危険の方が大きい。重く見える計算（損益分岐・確認項目）は純粋関数で一瞬で終わる。マネージドの Redis（Memorystore）は月 $30 を超えて予算に合わない。

**トレードオフ:** DB が休んでいた後の最初の応答の遅れ（ADR-008）は、キャッシュでは解決しない。**入れる条件**: ダッシュボード（5）の応答が p95 で 1秒を超えるようになったら、まず SQL とインデックスを見直し、それでも足りなければ Upstash Redis の無料枠で集計結果を短時間（30秒程度）キャッシュする。

### ADR-012: Pitch Deck の PDF は API サーバーで作る

**決定:** `GET /api/v1/plans/{planId}/pitch-deck.pdf` で、API サーバーが react-pdf（`@react-pdf/renderer`）を使って PDF を作って返す。スライドの中身は `packages/domain` の `buildPitchDeck()`（プランと検証からスライドの素材を組み立てる関数）が作り、画面の表示（Web・スマホ）と PDF が同じ素材を使う。フォントは見出し用の表示用書体と、日本語を含む代替フォント（Noto Sans / Noto Sans JP）をコンテナに入れ、使った文字だけを PDF に埋め込む。PDF は常にライトの配色（design-spec 6.14）。

**理由:** Web とスマホで同じ PDF を作るには、作る場所を1つにするのが確実。ブラウザ・スマホのどちらで作っても、日本語のフォントの埋め込みと16:9のページの再現がそろわない。react-pdf は Chromium を使わないので、コンテナが軽く、0台からの起動も遅くならない。

**トレードオフ:** 画面のスライド（React / React Native）と PDF（react-pdf）で描画のコードが2つになる。見た目のずれは、素材とレイアウトの数値をトークンにまとめて減らす。PDF の作成は API の CPU を使うので、同時に大量に作られると遅くなる（利用者が少ないうちは問題にならない）。

### ADR-013: メールは Resend、独自ドメインを持つ

**決定:** 招待とパスワード再設定のメールは Resend の HTTP API で送る（無料枠: 月3,000通）。送信元のドメインとして独自ドメイン `{DOMAIN}` を Cloudflare Registrar で取り、SPF・DKIM・DMARC を設定する。staging は `MAIL_ALLOWLIST` に入っているメールにだけ送る。

**理由:** 招待制のアプリなので、任意のメールアドレスに確実に届く必要がある。Resend は独自ドメインを確認しないと任意の宛先に送れない。ドメインは年 $10〜15 で予算に収まる（ストアの登録費を予算から外したため）。

**トレードオフ:** ドメインの更新を忘れるとメールもアプリも止まる（自動更新を有効にする）。Resend の無料枠は1日100通までなので、一般公開で招待が増えたら有料プランを検討する。

### ADR-014: 期限の通知は Cloud Scheduler から API を呼ぶ

**決定:** Cloud Scheduler（無料枠: 3ジョブ）のジョブ `moonx-{env}-due-notifications` が、1時間ごと（毎時0分）に `POST /internal/cron/due-notifications` を OIDC トークン付きで呼ぶ。API は、利用者のタイムゾーン（`users.timezone`）で「期限の3日前・当日・超過」になった実行管理の項目について通知を作る（同じ段階の通知は `(execution_item_id, due_date, due_stage)` の一意制約で二重に作らない）。

**理由:** Cloud Run は常駐しないので、定期実行は外から呼ぶ必要がある。Cloud Scheduler は同じ Google Cloud の中で完結し、OIDC で呼び出し元を確かめられる。

**トレードオフ:** 毎時の実行なので、通知が届くのは条件を満たしてから最大1時間後。ジョブが失敗すると、その回の通知は次の回でまとめて作る（取りこぼさないように、条件は「その段階をまだ通知していない」で選ぶ）。

### ADR-015: IaC は Terraform（ユーザー指定）

**決定:** Google Cloud の資源と Cloudflare の DNS を Terraform で管理する（`infra/terraform/modules/` と `envs/{staging,production}/`。状態は Cloud Storage のバケット `{GCP_PROJECT_ID}-tfstate`）。Cloudflare の Worker は `wrangler.jsonc`、スマホのビルドは `eas.json`、Neon はコンソールで管理する。

**理由:** ユーザーが Terraform を選んだ。環境を作り直せて、設定の変更をレビューできる。

**トレードオフ:** Terraform の学習コストがある。Neon の無料プランと Expo は Terraform の外に残るので、手順を 03_dev-setup.md に書いて補う。

### ADR-016: staging と production の2環境。バージョン宣言ファイルで昇格する（ユーザー指定）

**決定:** 環境は staging と production（2章「環境と命名」）。ブランチは GitHub Flow（`main` ＋作業ブランチ、マージは常に squash）。`main` に入ると CI がテストし、API のイメージ（タグはコミット SHA）と Web のビルドを作る。デプロイは `deploy/{env}/version` にコミット SHA を書いた PR（昇格の PR）をマージしたときに GitHub Actions が行う（DB のマイグレーション → API → Web の順）。戻すときは昇格の PR を revert する。スマホは、ネイティブの変更があれば EAS Build と Submit、JS だけなら EAS Update を同じ昇格で出す。

**理由:** ユーザーが staging ＋ production を選んだ。BCDX の実データに触れずに確かめられる。どの環境にどの版が出ているかが、リポジトリのファイルで分かる。

**トレードオフ:** 昇格の PR の分だけ手順が増える。DB のマイグレーションは戻せないので、「追加してから使い、使わなくなってから消す」の2段階で書く（04_deployment-procedure.md）。

### ADR-017: モノレポは Bun workspaces ＋ Makefile

**決定:** Bun workspaces で `apps/*` と `packages/*` をまとめる。パッケージ名は `@moonx/*`。タスクの実行は Makefile に集め（2章「make ターゲット」）、CI も Makefile のターゲットを呼ぶ。

**理由:** API が Bun で動くので、パッケージ管理も Bun にそろえる。Expo と Vite も Bun のワークスペースで動く。Makefile を正にすれば、ドキュメント・CI・CLAUDE.md がターゲット名だけを参照できる。

**トレードオフ:** Turborepo のような差分ビルドのキャッシュは無い。ビルドが遅くなったら導入を考える。

### ADR-018: スタイルは 06_design-tokens.json から生成する

**決定:** デザイントークンの正は `docs/06_design-tokens.json`（DTCG 形式）。`make tokens` が、Web 用の Tailwind CSS v4 のテーマ（CSS 変数）と、スマホ用の NativeWind のテーマを `packages/ui-tokens` に生成する（変換は自前の小さなスクリプト。Style Dictionary は使わない）。ライト / ダークはトークンのセマンティック層の `light` / `dark` で切り替える。アイコンは Lucide（`lucide-react` / `lucide-react-native`）にそろえる。

**理由:** Web とスマホで見た目をそろえ、値の二重管理を避ける。Lucide は Web とスマホで同じ線のアイコンのセットを使える（design-spec 4.4「線のアイコンの1つのセット」）。

**トレードオフ:** 生成スクリプトを保守する必要がある。生成物はコミットし、`make tokens` の実行忘れを CI で検出する（生成し直して差分が出たら失敗）。

### ADR-019: 同時編集は項目単位の楽観ロック

**決定:** 保存の単位の項目（回答・行・数字・アイデアの概要・プランのヘッダ）は `lock_version` を持つ。更新の API は、クライアントが持っている `lockVersion` を受け取り、DB の値と違えば **409 `CONFLICT`** と相手の内容（値・保存した人・日時）を返す。利用者が「自分の内容で上書きする」を選ぶと、クライアントは `force: true` で送り直す。どちらの内容も変更履歴に残る（design-spec 6.0.2）。

**理由:** 共同編集の即時反映は Non-Goal。項目が細かいので衝突はまれで、衝突したときだけ利用者に選ばせれば足りる。

**トレードオフ:** 同じ欄を同時に打っている2人には、後から保存した側にだけ衝突が出る。

### ADR-020: 変更履歴はアプリのコードで、同じトランザクションの中で書く

**決定:** 変更履歴の対象（design-spec 6.0.5）を更新する API は、本体の更新と `change_history` への書き込みを1つのトランザクションで行う。共通の関数 `withHistory(tx, { targetType, targetId, targetKey, source }, mutate)` を通す。DB のトリガーは使わない。

**理由:** 変更の種類（手入力・AI 取り込み・元に戻す・テンプレートの移行・複製・下書き作成）と、誰が変えたかはアプリしか知らない。トリガーにすると、乗り換えのときに DB 側のロジックを持ち出す必要が出る。

**トレードオフ:** 履歴を書き忘れる API を作る危険がある。対象のテーブルを更新するリポジトリ関数を `withHistory` 経由に限り、結合テストで「更新したら履歴が1件増える」を確かめる。

### ADR-021: 保存できなかった入力はクライアントの送信待ちの列で再送する

**決定:** 自動保存（design-spec 6.0.2）が失敗したら、項目ごとに最新の入力だけを送信待ちの列に残し、再接続したとき・定期的に再送する。Web は IndexedDB、スマホは expo-sqlite に置く。送信待ちの列の項目は `lockVersion` を持ち、再送で衝突したら ADR-019 の選択を出す。

**理由:** design-spec で「保存できなかった入力は端末に残し、再接続したら送る」と決めた。スマホで電波が途切れても、書いた回答を失わない。

**トレードオフ:** 端末に回答の内容が残る（ログアウトしたら消す）。オフラインでの閲覧（読み込み済みでない画面）は対象外。

### ADR-022: テストとリントのツール

**決定:** Biome（リントと整形）、TypeScript の型チェック、`packages/domain` と `apps/api` は Bun test（API は実際の PostgreSQL に対する結合テスト）、`apps/web` は Vitest ＋ Testing Library、`apps/mobile` は Jest（jest-expo）＋ React Native Testing Library、Web の E2E は Playwright。詳細は10章。

**理由:** 実行環境（Bun・Vite・React Native）ごとに標準のツールを使うのが、一番つまずきが少ない。Biome は1つのツールで速い。

**トレードオフ:** テストのツールが3つになる。テストの書き方の違いは各パッケージの README で補う。

### ADR-023: 監視とログは Sentry と Cloud Logging

**決定:** エラーは Sentry（無料枠。プロジェクトは web / mobile / api の3つ）に送る。API のログは1行1つの JSON（`severity`・`message`・`requestId`・`userId`・`route`・`status`・`latencyMs`）で標準出力に書き、Cloud Logging が集める。リクエスト ID は Worker で付け（`X-Request-Id`）、エラーの応答と Sentry にも入れる。死活確認は Cloud Monitoring の稼働時間チェック（`/api/health`）。詳細は11章。

**理由:** どれも無料枠で足りる。リクエスト ID で、利用者が見たエラーとログ・Sentry をつなげられる。

**トレードオフ:** Sentry の無料枠（月5,000件）を超えると届かなくなる。同じエラーが大量に出たら Sentry の側で間引く。

### ADR-024: プロフィール写真は Cloud Storage

**決定:** 4 アカウント設定の写真は、API が受け取って 512×512 の WebP に縮め、Cloud Storage のバケット `moonx-{env}-avatars`（公開読み取り、ファイル名は推測できない乱数）に置く。URL を `users.avatar_url` に入れる。

**理由:** 写真は任意で小さいので、Cloud Storage の無料枠でほぼ $0。

**トレードオフ:** 公開読み取りなので、URL を知っていれば誰でも見られる（プロフィール写真なので許容する。乱数のファイル名で推測を防ぐ）。

---

## 4. ルーティング

（執筆中）

## 5. API設計

（執筆中）

## 6. データモデル

（執筆中）

## 7. セキュリティ・パフォーマンス

（執筆中）

## 8. エラーハンドリング

（執筆中）

## 9. i18n（国際化）

（執筆中）

## 10. テスト戦略

（執筆中）

## 11. モニタリング・ログ

（執筆中）
