# System Design Doc — moonx

- 入力: `docs/design-spec.md`（画面・UX の正）、`docs/screen_flow.mermaid`
- この文書が正として持つもの: アーキテクチャ、技術選定（ADR）、環境と命名・環境変数・CI のシークレット・make ターゲット、ルーティング、API、**データモデル**、権限マトリクス（API の単位）、セキュリティ、エラーハンドリング、i18n、テスト、モニタリング（監視の項目と閾値を含む）
- 画面の存在・目的・レイアウト・認証要否は design-spec が正。ここには転記せず、画面番号（例: 13 検証ホーム）で参照する
- デザイントークンの具体値は `docs/06_design-tokens.json` が正

---

## 1. Goal / Non-Goal

### Goal

- design-spec 3章の全画面・モーダル・パネルを **Web（ブラウザ）** で提供する。スマホでは同じ Web を PWA としてホーム画面に追加して使う（ADR-031）。スマホのネイティブアプリ（iOS / Android）は最初の範囲に入れず、PRD 6章のとおり Web のデザインが固まったあとの feature で、同じ API を使って作る（ADR-001・ADR-003。2026-10-11 のユーザーの決定）。
- 3工程（自己分析 → アイデア検証 → ビジネスプラン）の入力・その場の計算・確認項目6つの自動判定・プランへの引き継ぎ・実行管理・Pitch Deck（PDF）・AI 往復・決定ログ・コメント・変更履歴・運営者の管理画面をすべて動かす（design-spec 1.2 のスコープ）。
- 計算（損益分岐・シナリオ・投資回収・ROI）と確認項目の判定は、**Web と API で同じコード**を使い、入力した瞬間に結果を出す（のちのネイティブアプリも同じコードを使う）。
- 複数人が同じアイデアを編集しても、上書きで内容が消えない（項目単位の楽観ロックと変更履歴）。
- サーバーと外部サービスの運用費は **月 $0〜10**。初期は BCDX だけの招待制で、一般公開に向けて構成を変えずに広げられる。
- 依存先を乗り換えやすくする。DB は標準の PostgreSQL として使い（ADR-008）、Web は「`/*` は静的ファイル、`/api/*` は API」という形だけで配る（ADR-004。今は API と同じ Cloud Run のサービスが両方を返す）。

### Non-Goal

プロダクトとして作らないもの（AI の組み込み、メール通知、決済、Drive との連携など）は `01_prd.md` 6章が正。ここには、技術の上で作らない仕組みだけを書く。

- AI の API の呼び出し（サーバーにもクライアントにも置かない）
- リアルタイムの共同編集の仕組み（WebSocket・CRDT。同じ欄を同時に打つと、後から保存した人に衝突を知らせるだけ。ADR-019）
- プッシュ通知の仕組み（Web Push・APNs・FCM。通知はアプリ内の一覧と未読数の取得だけ）
- オフラインでの入力と閲覧（入力には接続が要る。保存できなかった入力は、ページ（タブ）を開いている間だけ再送する。ADR-021。PWA がキャッシュするのは画面の外側だけ。ADR-031）
- 2つ目以降の言語のカタログ（作りは残す。ADR-026）

---

## 2. アーキテクチャ概要

```
 Web ブラウザ（PWA を含む）
   │ HTTPS  https://{DOMAIN}/（staging は https://stg.{DOMAIN}/）
   │ DNS: Vercel の CNAME → ghs.googlehosted.com（Cloud Run のドメインマッピング）
   ▼
 ┌──────────────────── Google Cloud（asia-southeast1） ────────────────────┐
 │ Cloud Run「moonx-api-{env}」 ElysiaJS on Bun（0〜3台）                     │
 │  ├ /*           Web の静的ファイル（見つからない画面のパスは _shell.html）    │
 │  ├ /api/auth/*  Better Auth（メール＋パスワード、Google）                   │
 │  ├ /api/v1/*    アプリの REST API（Eden Treaty の型を Web へ公開）           │
 │  └ /api/health  死活確認                                                  │
 │ Secret Manager  Artifact Registry                                         │
 │ Cloud Storage（プロフィール写真）  Cloud Logging / Monitoring               │
 └───────┬──────────────────────────────┬────────────────────────────────────┘
         │ PostgreSQL プロトコル（TLS）     │ HTTPS
 ┌───────▼─────────────────────┐  ┌────────▼───────────────┐  ┌───────────────┐
 │ Neon PostgreSQL              │  │ Resend（メール）         │  │ Sentry         │
 │ ap-southeast-1               │  │ 招待・パスワード再設定    │  │ エラー追跡      │
 │ branch: production / staging │  └────────────────────────┘  │ （web / api）   │
 └──────────────────────────────┘                               └───────────────┘
```

### 通信フロー

1. **Web**: ブラウザは `https://{DOMAIN}/` から Web を読み込む。静的ファイルと API は同じ Cloud Run のサービスが返す（ADR-004）。データは同じオリジンの `/api/v1/*` を Eden Treaty で呼ぶ。ログインは Better Auth の HttpOnly Cookie（同じオリジンなので SameSite=Lax で足りる）。
2. **スマホ**: Web を PWA としてホーム画面に追加して使う（ADR-031）。通信は 1 と同じ。ネイティブアプリはPRD 6章のとおり Web のデザインが固まったあとの featureで作る（ADR-001・ADR-003）。
3. **Cloud Run の入口**: Google のフロントが TLS を終え、`X-Forwarded-For` に接続元の IP を付けて API に渡す。API は入口のプラグイン（ADR-029）で、呼び出し元の IP をリクエストごとに1回だけ決める（7.2「呼び出し元の IP」）。共有シークレットのような、前段のプロキシを確かめる仕組みは無い（前段が無いため）。
4. **メール**: API が Resend の HTTP API で送る（送信元 `no-reply@{DOMAIN}`）。
5. **計算**: 損益分岐・シナリオ・確認項目・F/A/U の内訳・工程は `packages/domain` の純粋関数で計算する。クライアントは入力のたびにその場で計算して表示し、API は一覧・ダッシュボード・決定ログのスナップショット・版の保存・PDF で同じ関数を使う。DB には保存しない（6章「保存しないもの」）。
6. **通知の受け取り**: 常時接続は使わない。クライアントは画面を開いたとき・タブが前面に戻ったとき・60秒ごと（画面が見えている間だけ）に未読数を取りに行く。

### インフラ管理

この表が、何をどこで管理するかの正。ADR-015 と 03_dev-setup.md はこの表を参照する。

| 対象 | 管理方法 |
|---|---|
| Google Cloud の環境ごとの資源（Cloud Run・Cloud Run のドメインマッピング（`{DOMAIN}`・`stg.{DOMAIN}`）・Secret Manager・写真のバケット・サービスアカウント。Monitoring のアラートは production だけ。11章） | **Terraform**（`infra/terraform/envs/{staging,production}/`） |
| Google Cloud の共有の資源（Artifact Registry のリポジトリ `moonx`・Workload Identity Federation・バックアップのバケット `{GCP_PROJECT_ID}-moonx-backups`・予算アラートと通知のチャンネル） | **Terraform**（`infra/terraform/envs/shared/`。状態は Cloud Storage のバケット `{GCP_PROJECT_ID}-tfstate`） |
| `dwnfrc.app` の DNS のレコード（Web の CNAME 2つ（`{DOMAIN}`・`stg.{DOMAIN}` → `ghs.googlehosted.com`）、Resend の MX と TXT、DMARC の TXT、Search Console の所有の確認の TXT） | **Vercel の画面で手で入れる**（`dwnfrc.app` は Vercel で登録し、DNS も Vercel。Vercel のトークンはチームの全プロジェクトを触れるので、Terraform にも手元にも持たせない。手順は 03_dev-setup.md） |
| Search Console での `dwnfrc.app` の所有の確認 | ドメインマッピングを作る Google のアカウント（`make infra-apply` を動かすアカウント）で確認する（03_dev-setup.md） |
| Google の OAuth の同意画面とクライアント | Google Cloud のコンソール（Terraform では作れないため。手順は 03_dev-setup.md） |
| Neon（プロジェクトとブランチ。DB 名 `moonx`） | Neon のコンソールで作り、接続文字列を Secret Manager に入れる（無料プランは Terraform の対象にしない。手順は 03_dev-setup.md） |
| Sentry のプロジェクト（`moonx-web`・`moonx-api`） | Sentry の画面（03_dev-setup.md） |
| Resend のドメインと API キー | Resend の画面。API キーは Secret Manager に入れる（03_dev-setup.md） |
| GitHub の環境（`staging`・`production`・`production-backup`）と承認の設定 | GitHub のリポジトリの設定（03_dev-setup.md） |
| DB のスキーマ | Drizzle のマイグレーション（`packages/db/migrations/`。CI がデプロイ前に適用する） |
| デプロイのきっかけ | `deploy/{staging,production}/version` の更新（GitHub Actions。04_deployment-procedure.md） |

### リポジトリ構成

Bun workspaces のモノレポ。実コマンドは `Makefile` が唯一の正で、ドキュメントはターゲット名だけを書く。

```
moonx/
├─ apps/
│  ├─ web/        TanStack Start（SPA モード）。public/ に静的なファイル（robots.txt など）。Service Worker（ADR-031）
│  └─ api/        ElysiaJS（Bun）。Better Auth・REST API・PDF・Web の静的ファイルの配信。Dockerfile（Web のビルドも入れる）
├─ packages/
│  ├─ domain/     計算・確認項目・F/A/U・工程・Pitch Deck の組み立て・AI 書き出し / 取り込みの書式（純粋関数）
│  ├─ schemas/    Zod のスキーマ（API の入出力とフォームの入力チェック）
│  ├─ db/         Drizzle のスキーマ・マイグレーション・シード・テンプレートの取り込みと公開（AD10・AD6）
│  ├─ i18n/       英語のメッセージカタログと書式（en-PH）
│  ├─ ui-tokens/  06_design-tokens.json から生成するテーマ（vanilla-extract・react-pdf 用）と PWA のアイコン・マニフェスト（生成物）
│  └─ ui-web/     Web の部品（React Aria Components ＋ vanilla-extract。design-spec 4.5 の部品）
├─ data/templates/bcdx/  BCDX のテンプレートのファイル（AD10 で取り込む。シードも使う。5.13）
├─ infra/terraform/  modules/ と envs/{shared,staging,production}/
├─ deploy/{staging,production}/version   デプロイする Git のコミット SHA（環境ごとに、最初の `make promote` が作る）
├─ e2e/           Playwright（Web）
├─ docker/        ローカルの PostgreSQL の初期化 SQL（docker-compose.yml が使う）
├─ scripts/       doc-lint、`.env` の作成（`make setup` が呼ぶ）、画面の検査（`style` 属性・JSX の生の文字列。`make lint` が呼ぶ）、マイグレーションの検査（`db-check`）、昇格（`promote`・`promote-check`）、無人ループの駆動（`draft-loop.sh`）
└─ Makefile
```

ネイティブアプリ（`apps/mobile`・`packages/ui-native`）はPRD 6章のとおり Web のデザインが固まったあとの featureで足す（ADR-001）。

### 環境と命名

| 項目 | local | staging | production |
|---|---|---|---|
| Web・API の URL | Web `http://localhost:5173`（Vite が `/api/` で始まるパスを API へ転送）・API `http://localhost:3000` | `https://stg.{DOMAIN}` | `https://{DOMAIN}` |
| Web と API（Cloud Run） | Web は `vite dev`、API は `bun --watch`（API は静的ファイルを返さない） | `moonx-api-staging`（Web も返す） | `moonx-api-production`（Web も返す） |
| DB | Docker の PostgreSQL 17（`localhost:5432`、DB 名 `moonx`） | Neon プロジェクト `moonx` のブランチ `staging` | 同じプロジェクトのブランチ `production` |
| メール | コンソールに出す | Resend（送信先は許可リストのメールだけ） | Resend |
| イメージ | — | `asia-southeast1-docker.pkg.dev/{GCP_PROJECT_ID}/moonx/api:<コミット SHA>`（Web と API を1つに入れ、両方の環境で同じイメージを使う） | 同左 |
| GitHub の環境 | — | `staging` | `production`（デプロイに承認を要する）と `production-backup`（承認なし。読み取り専用の接続だけを持ち、`db-backup.yml` と `kpi.yml` だけが使う） |
| Sentry の environment | なし | `staging` | `production` |

名前に使う「staging」は、URL のホスト名（`stg.{DOMAIN}`）を除いてそのまま使う（GitHub の環境・Neon のブランチ・Sentry の environment・Cloud Run のサービス名）。

GitHub の環境は3つとも `main` からだけ使える。Google Cloud への入口（Workload Identity Federation）も `main` で動くワークフローに限る（ADR-016・ADR-027）。

名前のプレースホルダ（ドキュメントの中ではプレースホルダのまま書く）:

| プレースホルダ | 値 | 決めた日・決める時期 |
|---|---|---|
| `{DOMAIN}` | `bcdx.dwnfrc.app`（既存の `dwnfrc.app` のサブドメイン。staging は `stg.{DOMAIN}`） | 2026-10-03 に決めた（ユーザーの決定。ADR-013） |
| `{GCP_PROJECT_ID}` | 未定（staging と production で1つのプロジェクトを共有する。世界で重複できず、あとから変えられない） | 最初の `make infra-apply`（Web の公開）の前にユーザーが決める |

ネイティブアプリの ID（`{APP_ID}`）は、ネイティブの feature で決める（案は 01_prd.md 6章）。

### 環境変数

| 変数 | 使う場所 | 内容 | local の値 | staging / production の置き場所 |
|---|---|---|---|---|
| `APP_ENV` | api | `local` / `staging` / `production`（結合テストは設定を直接組み立てて `test` を使うが、環境変数からは読まない）。必須で、無い値や知らない値では起動しない（local の動作はデプロイした環境では安全でないため、既定値を持たない）。staging・production では `WEB_DIST_DIR`・`MAIL_TRANSPORT=resend`・`BETTER_AUTH_URL`・`MAIL_FROM`・`TRUSTED_ORIGINS` も必須。Web へは、API が返す HTML の meta 要素で渡す（ADR-004） | `local` | Cloud Run の環境変数 |
| `APP_VERSION` | api | `/api/health` の `version`（コミット SHA） | 未設定なら `dev` | API の Dockerfile が `build-api-image` の build-arg から環境変数に入れる |
| `PORT` | api, web（開発サーバー） | 待ち受けるポート（未設定なら `3000`。1〜65535 の整数でなければ起動しない）。API は、local では `127.0.0.1` だけで待ち受け（同じネットワークのほかの端末からは開けない）、staging・production ではすべてのインターフェースで待ち受ける。local と e2e では、Vite の開発サーバーが `/api/` で始まるパスをこのポートへ転送する（API と同じ値を、Makefile が `.env` から、e2e は Playwright の `webServer` が渡す） | `3000` | Cloud Run が `8080` を渡す |
| `WEB_DIST_DIR` | api | Web のビルドの出力の置き場所。ここにあるファイルを API が `/*` で返す（ADR-004） | 未設定（静的ファイルを返さない。Web は Vite の開発サーバーが返す） | API の Dockerfile が入れる（イメージの中のパス） |
| `DATABASE_URL` | api, db | PostgreSQL の接続文字列（API は無ければ起動しない） | `postgres://moonx:moonx@localhost:5432/moonx` | Secret Manager `moonx-{env}-database-url`（Neon のプール接続） |
| `DATABASE_URL_DIRECT` | db（マイグレーション・バックアップ） | プールを通さない接続文字列 | `DATABASE_URL` と同じ | GitHub Actions の環境のシークレット |
| `DATABASE_URL_TEST` | api（`make test-api`・`make test-e2e`） | テスト用の DB（テストのたびに作り直してマイグレーションを当てる。作り直しはテーブルを全部消すので、DB の名前は `_test` で終わり、URL にクエリ文字列を付けないこと。作り直しは同じサーバーの `postgres` の DB につなぎ、その DB への接続を切って消してから作るので、ロールに CREATEDB の権限が要り、テスト用の DB の持ち主かスーパーユーザーでなければならない。local の Docker と CI のサービスコンテナのロールはスーパーユーザー） | `postgres://moonx:moonx@localhost:5432/moonx_test` | CI はサービスコンテナの DB |
| `BETTER_AUTH_SECRET` | api | セッションの署名鍵（32バイト以上の乱数。`openssl rand -base64 32` の出力。値が UTF-8 で32バイトに満たなければ起動しない） | `.env` に任意の値 | Secret Manager `moonx-{env}-better-auth-secret` |
| `BETTER_AUTH_URL` | api | 公開の URL（Cookie と OAuth のコールバックの基準） | `http://localhost:5173` | `https://stg.{DOMAIN}` / `https://{DOMAIN}` |
| `TRUSTED_ORIGINS` | api | 許可するオリジン（カンマ区切り。1つも無ければ起動しない） | `http://localhost:5173` | `https://stg.{DOMAIN}` / `https://{DOMAIN}` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | api | Google ログイン（OAuth クライアント。環境ごとに作る。片方だけ入れると起動しない。staging・production は空でも起動しない。local だけ空にでき、Google ログインだけが使えなくなる） | 開発用のクライアント | ID は環境変数、SECRET は Secret Manager `moonx-{env}-google-client-secret` |
| `MAIL_TRANSPORT` | api | `console` / `resend`（それ以外の値では起動しない。staging・production は `resend` でなければ起動しない。`console` は招待のリンクを含むメールの全文をログに出すので、local とテストだけで使う） | `console` | `resend` |
| `RESEND_API_KEY` | api | Resend の API キー（`MAIL_TRANSPORT=resend` のとき、空なら起動しない） | 不要 | Secret Manager `moonx-{env}-resend-api-key` |
| `MAIL_FROM` | api | 送信元 | `moonx <no-reply@localhost>` | `moonx <no-reply@{DOMAIN}>` |
| `MAIL_ALLOWLIST` | api | staging でだけ使う送信先の許可リスト（カンマ区切り。大文字小文字を区別しない）。staging では、ここに無い宛先にメールを送らない。空なら誰にも送らない（扱いは ADR-013）。local と production では読まない | 空 | staging だけ設定 |
| `AVATAR_BUCKET` | api | プロフィール写真のバケット（staging・production は空なら起動しない） | 空（local はディスク `./.data/avatars`。API が `/api/avatars/{name}` で返す。U9） | `{GCP_PROJECT_ID}-moonx-{env}-avatars` |
| `SENTRY_DSN` | api | Sentry（API。プロジェクト `moonx-api`） | 空 | Cloud Run の環境変数（Terraform の環境ごとの変数で入れる。DSN は秘密ではないので Secret Manager に置かない） |
| `WEB_SENTRY_DSN` | api | Sentry（Web。プロジェクト `moonx-web`）。API が Web の HTML の meta 要素 `moonx-sentry-dsn` で渡す（ADR-004） | 空（local の Web は Sentry に送らない） | Cloud Run の環境変数（`SENTRY_DSN` と同じく Terraform の環境ごとの変数で入れる） |
| `LOG_LEVEL` | api | `debug` / `info` / `warn` / `error`（それ以外の値では起動しない） | `debug` | `info` |

API は値の前後の空白を除き、空の値（空白だけの値を含む）を未設定として扱う。local で未設定の `BETTER_AUTH_URL`・`TRUSTED_ORIGINS`・`MAIL_TRANSPORT`・`MAIL_FROM`・`LOG_LEVEL` には、上の表の「local の値」を使う。staging・production で未設定の `LOG_LEVEL` は `info` にする（ほかの4つは必須）。

`.env` はリポジトリの直下に1つ置く。`make setup` が `.env.example` をコピーする。直下の `.env` は Makefile が読み込んで各コマンドに渡し、Vite は `envDir` をリポジトリの直下にする。Web はビルドに環境ごとの値を持たない（環境名と Sentry の DSN は、API が返す HTML から読む。local の Vite の開発サーバーでは meta 要素が無いので、環境名は `local`、Sentry は使わない）。

e2e（`make test-e2e`）は、開発サーバーと別に API（ポート 3100）と Web（ポート 5273）を起動し、次の値を上書きする: `PORT=3100`、`BETTER_AUTH_URL=http://localhost:5273`、`TRUSTED_ORIGINS=http://localhost:5273`、`DATABASE_URL` は `DATABASE_URL_TEST` の値（`e2e/playwright.config.ts` の `webServer`）。PWA の検査（10章）は、`make build-web` の結果を `WEB_DIST_DIR` で渡した API（ポート 3200。`BETTER_AUTH_URL`・`TRUSTED_ORIGINS` は `http://localhost:3200`）に対して行う。

**CI（GitHub Actions）のシークレットと変数**: 環境ごとに値が違うものは GitHub の環境（`staging` / `production` / `production-backup`）に、環境をまたいで同じものはリポジトリに置く。

| 名前 | 置き場所 | 用途 |
|---|---|---|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` / `GCP_DEPLOY_SERVICE_ACCOUNT`（変数） | リポジトリ | Workload Identity Federation で Google Cloud に入る（鍵を置かない。`main` で動くワークフローだけが入れる。ADR-027）。`build.yml` のイメージの作成、各環境のデプロイ、`db-backup.yml` のバックアップのバケットへの書き込みが使う |
| `SENTRY_AUTH_TOKEN`（シークレット） | リポジトリ | ソースマップのアップロード（Web と API。`make build-api-image` が上げる。04_deployment-procedure.md 2章） |
| `DATABASE_URL_DIRECT`（シークレット） | `staging` / `production`（マイグレーション）、`production-backup`（バックアップと KPI の集計。production の読み取り専用のロール `moonx_backup_ro` の接続文字列） | マイグレーション、バックアップ、KPI の集計（11章） |

### make ターゲット

| ターゲット | 内容 |
|---|---|
| `install` | 依存の取得だけ（`bun install --frozen-lockfile`）。CI が使う |
| `setup` | `install`、`.env` の雛形のコピー（`BETTER_AUTH_SECRET` が空なら乱数を入れる）、`db-up`、`db-migrate`、`db-seed`、`tokens`、Playwright のブラウザの取得、Git のフックの配線（`git config core.hooksPath .githooks`） |
| `dev` | API と Web を同時に起動（`dev-api` と `dev-web`） |
| `dev-api` / `dev-web` | それぞれを単独で起動 |
| `build` | 全パッケージの型チェックとビルド |
| `build-web SHA=...` | Web をビルドする。環境ごとの値は入れないので、1回のビルドを両方の環境で使う。入れるのは Sentry の `release` に使う版（SHA。省くと `dev`）だけ。`build-api-image` が使う |
| `build-api-image SHA=...` | `build-web` の結果と API を1つの Docker イメージにまとめて Artifact Registry に上げ、Web と API のソースマップを Sentry の `moonx-web`・`moonx-api` に上げる（`release` = SHA）。`build.yml` が `make test` の後に使う（04_deployment-procedure.md 2章） |
| `test` | `test-domain`・`test-api`・`test-web` をまとめて実行 |
| `test-domain` / `test-api` / `test-web` | 単体・結合テスト。`test-domain` は `packages/domain`・`packages/schemas`・`packages/i18n`・`packages/ui-tokens`（生成スクリプトと検査のテスト）・`scripts/`（画面の検査・`db-check`・`promote`・`promote-check`）、`test-api` は `apps/api` と `packages/db`（どちらも `DATABASE_URL_TEST` の DB を作り直し、マイグレーションを当てて使う）、`test-web` は `apps/web`・`packages/ui-web` |
| `test-e2e` | Playwright（Web。`DATABASE_URL_TEST` の DB で API と Web を起動して。PWA の検査は、先に `build-web SHA=dev` でビルドした Web を API から返す形で起動する）。ブラウザ（Chromium）が無ければ先に取得する（CI でも動くように） |
| `lint` / `format` / `typecheck` | Biome の検査・整形（`lint` は画面の検査スクリプト `scripts/check-screens.ts` も動かす）、TypeScript の型チェック |
| `db-up` / `db-down` | ローカルの PostgreSQL（Docker Compose）の起動・停止 |
| `db-generate` | Drizzle のスキーマからマイグレーションを作る |
| `db-check BASE=...` | マイグレーションが足すだけになっているかを、`BASE` から `HEAD` までの差分で検査する。`packages/db/migrations/` の既にあるファイルと `meta/_journal.json` の既にある行を変えていない・消していないこと、足した行の `when` が整数で、`BASE` のどの行よりも大きく、足した行どうしでも増えていくこと（同じ値も失敗）、足した行の `tag` がほかの行と重ならず、`BASE` の後に足した同じ名前の `.sql` のファイルを指すことを確かめる。`BASE` の journal に `when` が整数でない行があれば、比べられないので失敗する。`BASE` に journal が無ければ（最初のマイグレーション）、`when` は `BASE` と比べず、足した行どうしで増えていくことを確かめる（ADR-009）。`ci.yml` が使う（`BASE` は `promote-check` と同じ） |
| `db-migrate` | マイグレーションを適用する（`DATABASE_URL_DIRECT` か `DATABASE_URL`） |
| `db-seed` / `db-reset` | 全テーブルの中身を消してデモデータを入れる（design-spec 8章。テンプレートは `data/templates/bcdx/` のファイルを AD10 と同じ取り込みの処理で入れて公開する。`APP_ENV=local` のときだけ動く。何度動かしても行の id は変わらない。6.5）/ DB を作り直してシードまで |
| `db-studio` | Drizzle Studio |
| `tokens` | `docs/06_design-tokens.json` から `packages/ui-tokens` を生成する（テーマと、PWA のアイコン・マニフェスト。ADR-018・ADR-031） |
| `openapi` | API の OpenAPI 仕様を `apps/api/openapi.json` に書き出す。API を変えたら作り直してコミットする。CI（`ci.yml`）が作り直して差分が無いことを確かめる（`tokens` と同じ扱い。04_deployment-procedure.md 2章） |
| `kpi ENV=...` | `packages/db/queries/kpi.sql`（件数だけを数え、回答の中身は読まない）を `DATABASE_URL_DIRECT` の DB に流し、件数の表を出す（CI では実行の要約に書く）。書き込まないので、読み取り専用の接続で足りる。`kpi.yml` が production の読み取り専用のロールの接続で使う（11章） |
| `doc-lint` | ドキュメントと実体の食い違いを検査する（`scripts/doc-lint.sh --docs`: ドキュメントが参照する make ターゲットの実在・`docs/README.md` のリンク切れ・`docs/features/` の命名）。コミットの前の検査（`--staged`）は `.githooks/pre-commit` が動かす |
| `admin-create EMAIL=...` | 最初の運営者を作るための招待（ワークスペースなし、`grants_admin = true`）を発行し、リンクを表示する。同じメールあての有効な招待があれば、新しいリンクで作り直す。接続先は `DATABASE_URL`、リンクの基準は `BETTER_AUTH_URL`（staging / production では、この2つを上書きして手元から実行する。03_dev-setup.md） |
| `infra-plan ENV=...` / `infra-apply ENV=...` | Terraform の plan / apply（`ENV` は `shared` / `staging` / `production`） |
| `deploy-api ENV=... SHA=...` | マイグレーションの後、Cloud Run に新しいリビジョンを出す（イメージに Web も入っているので、Web もこれで出る。CI が使う）。戻すときは戻し先の古い版のこのターゲットが動くので、引数と、読む環境変数・シークレットの名前を変えるときは、戻せる版でも動くように段階を分ける（04_deployment-procedure.md 4.1） |
| `promote ENV=... [SHA=...]` | 昇格の PR（戻すときも同じ。ADR-016）を手元から作る。まず `git fetch origin` し、作業ツリーに変更が無く、`main` が `origin/main` と同じことを確かめる。`SHA` は短い形でもよく、完全な SHA に直して使う。省くと、staging は `deploy/` 以外を変えた `main` の最新のコミット、production は今の `deploy/staging/version`。省いた SHA が、今の版より古い（戻すことになる）か、その環境で前に戻した版（その環境の履歴にあって、今の版より新しい）なら、止めて `SHA` の指定を求める。確かめること: SHA が今の版と違う。その `build.yml` が成功し（gh）、イメージが Artifact Registry にある（gcloud）。production なら、その SHA を `deploy/staging/version` に書いたコミットの `deploy.yml` が成功している（gh）。そのあとブランチ `promote/{env}-<SHA の先頭7文字>` を作り（同じ名前のブランチが手元か origin に残っていれば、それを使う PR が開いているときは止め、そうでなければ消してから作る）、`deploy/{env}/version` を書いて（無ければ作る）コミットし、`promote-check BASE=origin/main` が通ったら push して PR を開く（gh）。件名は 03_dev-setup.md 9章「コミットメッセージ」の形（進めるときは promote、戻すときは roll back）。本文には、今の版と出す版の SHA・コミットの一覧・マイグレーションの一覧・戻し方（今の版の SHA で `promote` を動かす）を入れる。一覧の範囲は、いちばん先まで出した版（04_deployment-procedure.md 4.1）で決める。出す版がそれより新しいときは、コミットは今の版から出す版まで、マイグレーションはいちばん先まで出した版より後のもの（この昇格で新しく当たるもの）。古いときは、どちらも出す版から、いちばん先まで出した版まで（DB に当たっていて出す版に無いもの）とし、出す版が直前の版（同 4.1）かどうかも書く。その環境の前回の `deploy.yml`（今の版を書いたコミットのもの）が成功していなければ、本文の先頭にそう書き、Cloud Run で動いている版の SHA も出す（gcloud）。最初の昇格（今の版が無い）では、今の版は「なし」とし、コミットの一覧は省き、マイグレーションはすべて出す（04_deployment-procedure.md 4.2・5.1） |
| `promote-check BASE=...` | `BASE` から `HEAD` までの差分のうち `deploy/` を検査する。`deploy/` を変えていなければ何もしない。変えていれば、次をすべて満たさないと失敗する: 変えたファイルは `deploy/staging/version` か `deploy/production/version` のどちらか1つだけで、ほかのファイルを一緒に変えていない（消してもいない）。中身は完全な SHA が1行で、`BASE` の時点の `main` にあるコミット。その SHA が `BASE` の時点のその環境の版より古い（戻す）なら、その環境の `deploy/{env}/version` に `BASE` までに書かれたことがある（`BASE` にその環境のファイルが無ければ、この条件は無い）。production なら、`deploy/staging/version` に `BASE` までに書かれたことがある。`ci.yml`（`BASE` は、PR を検査するマージのコミットの1つ目の親）・`deploy.yml`（`BASE` は push の前のコミット）・`promote` が使う（04_deployment-procedure.md 2章） |
| `db-backup ENV=...` | `pg_dump -Fc` を取り、`gs://{GCP_PROJECT_ID}-moonx-backups/{env}/<日付>.dump` に上げる（バケットは30日で自動削除。定期実行の GitHub Actions が使う。05_operation-runbook.md） |

Google Cloud を使うターゲット（`build-api-image`・`deploy-api`・`infra-plan`・`infra-apply`・`db-backup`）は、プロジェクトを `gcloud config` のプロジェクトから取る（`GCP_PROJECT_ID=...` で上書きできる）。空なら動かずに止まる。Terraform のプロジェクト ID は各 `envs` の変数に書き（03_dev-setup.md 5.4）、make はこの値を tfstate のバケットの名前（`{GCP_PROJECT_ID}-tfstate`）にだけ使う（backend は変数を読めないため）。

---

## 3. 技術選定と判断理由（ADR）

技術スタックは Phase 3 でユーザーと決めた（2026-10-01）。ユーザーが指定・選択したものは、見出しと下の表に「（ユーザー指定）」と書く。

各 ADR は「状態・日付 / 決定 / 理由 / 捨てた案 / トレードオフ」の欄で書く。状態は「採用」「廃止」「保留」。保留は、決めた内容を今の範囲では使わず、のちの feature で使うもの。保留の ADR は、保つ前提（のちの feature でもそのまま使う決定）と、feature で設計し直すものを分けて書く。決定を変えたときは、状態・日付に変えた日と前の決定を書く。比べた候補の記録が無いものは「比較の記録なし」と書き、後から理由を作らない。

| # | 領域 | 決定 |
|---|---|---|
| ADR-001 | クライアントの構成（ユーザー指定） | Web と共有パッケージは採用、ネイティブの部分は**保留**（PRD 6章）。今の範囲は Web だけ。計算・入力チェック・型・文言・トークンは共有パッケージに置き、Web と API が使う。のちのネイティブアプリは Web と別のコードで作り、同じパッケージを使う |
| ADR-002 | Web（ユーザー指定） | **TanStack Start**（SPA モード）＋ TanStack Form |
| ADR-003 | スマホ（ユーザー指定） | **保留**（PRD 6章）。Expo（React Native）＋ Expo Router で作ることは保つ。配り方などの詳細は feature で設計する |
| ADR-004 | Web の配信 | **`/*` は静的ファイル、`/api/*` は API** の形に固定し、API と同じ Cloud Run のサービスから配る。独自ドメインは Cloud Run のドメインマッピング |
| ADR-005 | API（ユーザー指定） | **ElysiaJS**（Bun） |
| ADR-006 | 通信方式（ユーザー指定） | **REST**。クライアントは **Eden Treaty**、仕様書は OpenAPI。常時接続は使わない |
| ADR-007 | API の実行環境（ユーザー指定） | **Cloud Run**（asia-southeast1、0〜3台） |
| ADR-008 | DB（ユーザー指定） | **Neon の PostgreSQL** を、Neon 独自の機能を使わない標準の PostgreSQL として使う |
| ADR-009 | ORM・入力チェック | **Drizzle ORM**（postgres.js。0.45 系に固定し、マイグレーションは足すだけ。`make db-check`）＋ **Zod v4** |
| ADR-010 | 認証（ユーザー指定） | **Better Auth**（メール＋パスワード、**Google ログイン**）。招待制はサーバーで強制する |
| ADR-011 | キャッシュ | サーバー側のキャッシュは置かない。クライアントは **TanStack Query** |
| ADR-012 | Pitch Deck の PDF | API サーバーで **react-pdf** を使って作る |
| ADR-013 | メール・ドメイン | **Resend** ＋ 既存の `dwnfrc.app` のサブドメイン（DNS は Vercel） |
| ADR-014 | 期限の通知 | 期限の通知と、それを作る定期実行（Cloud Scheduler・`/internal/cron`）を持たない（2026-10-03 のユーザーの決定） |
| ADR-015 | IaC（ユーザー指定） | **Terraform**（Google Cloud の資源とドメインマッピング）。DNS のレコードは Vercel で手で入れる。コンソールで管理するものは2章「インフラ管理」 |
| ADR-016 | 環境とリリース（ユーザー指定） | **staging ＋ production**。`deploy/{env}/version` による昇格（戻すときも戻し先の SHA を書く）。Web と API を1つのイメージにし、同じイメージを両方の環境に出す |
| ADR-017 | モノレポ | **Bun workspaces** ＋ Makefile |
| ADR-018 | デザインシステムとトークン（ユーザー指定） | **Adobe Spectrum の仕組み**を取り入れ、見た目は月相（design-spec 4.4）。06_design-tokens.json から Web（vanilla-extract）・PDF のテーマと PWA のアイコンを生成する。アイコンは Lucide |
| ADR-019 | 同時編集 | 項目単位の楽観ロック（`lock_version`）。衝突は 409 で返し、利用者に選ばせる |
| ADR-020 | 変更履歴の記録 | アプリのコードで、本体の更新と同じトランザクションの中で `change_history` に書く |
| ADR-021 | 保存できなかった入力の再送 | ページを開いている間だけ、メモリに持った最新の値を再送する。端末には残さない。オフラインのときは入力を止める |
| ADR-022 | テスト・リント | Bun test・Vitest・Playwright・axe・Biome |
| ADR-023 | 監視・ログ | Sentry ＋ Cloud Logging（構造化 JSON・リクエスト ID）＋ Cloud Monitoring の稼働時間チェック |
| ADR-024 | 画像の保存 | プロフィール写真は Cloud Storage |
| ADR-025 | 部品の作り方（ユーザー指定） | **Tailwind を使わない**。Web は振る舞いを **React Aria Components**、見た目を **vanilla-extract** で部品の中にだけ書き、画面にはスタイルを書かない。スマホの部品は**保留**（ネイティブは PRD 6章のとおり、Web のデザインが固まったあとの feature） |
| ADR-026 | i18n | **i18next**（英語だけで始め、多言語にできる作り）。書式は en-PH |
| ADR-027 | CI/CD とシークレット | **GitHub Actions** ＋ Workload Identity Federation（`main` で動くワークフローだけ）。シークレットは Secret Manager と GitHub（環境・リポジトリ）に置く |
| ADR-028 | DB のバックアップ | 毎日 **`pg_dump`** を Cloud Storage に30日残す |
| ADR-029 | API の回数制限 | Better Auth の設定 ＋ API の入口のプラグイン（同じ `rate_limits` テーブル）の2段 |
| ADR-030 | 言語（ユーザー指定） | **TypeScript**（アプリ・パッケージ・スクリプトのすべて） |
| ADR-031 | PWA | Web を **PWA** にする。Service Worker がキャッシュするのは画面の外側だけで、`/api/*` はキャッシュしない |

### ADR-001: Web とスマホを別々に作り、ロジックを共有する（ユーザー指定）

**状態・日付:** 採用（Web と共有パッケージの部分）。ネイティブの部分は保留（2026-10-11。ネイティブは PRD 6章のとおり、Web のデザインが固まったあとの feature で作る。ユーザーの決定）。前の決定（2026-10-01。2026-10-03 にスマホの E2E を Maestro にする決定を足した）は、最初の範囲で Web とスマホのネイティブアプリを別々のコードで作る、だった。

**決定:** 今の範囲は Web（`apps/web`）だけ。計算と判定（`domain`）、API の入出力とフォームの入力チェック（`schemas`）、API の型（Eden Treaty が `apps/api` の型を読む）、文言と書式（`i18n`）、デザイントークン（`ui-tokens`）は `packages/` に置き、Web と API が使う。スマホからは Web を PWA として使う（ADR-031）。のちのネイティブアプリのために、次の前提を保つ: Web と別のコードで作る、同じパッケージと同じ API（`/api/v1`）を使う、画面のパスを Web と同じにする（4章）、部品は Web と同じ名前と props にする（ADR-025）。ネイティブの詳細（前の決定）は、タグ `prototype-2026-10-11` の `docs/02-01_system-design-doc.md` の ADR-001・ADR-003・ADR-025 にある。

**理由:** ユーザーが「Web とスマホを別々に作る」を選んだ（2026-10-01）。その後、Web のデザインを固めてからネイティブを作ると決めた（2026-10-11）。ロジックを1か所に置けば、あとからネイティブを足しても計算と判定の結果が食い違わない。

**捨てた案:** Expo で Web も出す（Web の表やワークシートが作りにくい）、Web を Capacitor で包む（Apple の審査で「Web を包んだだけ」と判断される危険）。

**トレードオフ:** ネイティブを足すときに、画面をもう一度作る。それまでのスマホでの使い勝手は PWA の範囲に限られる（ADR-031）。

### ADR-002: Web は TanStack Start の SPA モード（ユーザー指定）

**状態・日付:** 採用（2026-10-01）

**決定:** `apps/web` は TanStack Start（React・TanStack Router・Vite）を **SPA モード**で使い、静的ファイルとして出力する。ランディング（1）と、プライバシーポリシー・サポート（29・30）だけはビルド時に HTML を作る（プリレンダー）。データはすべて API（Eden Treaty ＋ TanStack Query）から取る。TanStack Start のサーバー関数・サーバー描画は使わない。フォームは TanStack Form（Zod のスキーマをそのまま使う）。画面の部品は `packages/ui-web`（ADR-025）だけを使う。

**理由:** ユーザーが Next.js 以外として TanStack Start を選んだ。ログイン後の画面がほぼすべてで、検索エンジン向けのサーバー描画は要らない。データの取得口を Elysia の API 1つにまとめれば、のちのネイティブアプリも同じ API を使える。ルートの型安全（パスと検索パラメータ）が、画面数の多いアプリで効く。TanStack Form は Zod のスキーマ（Standard Schema）をそのまま検査に使え、React Native でも同じ書き方で動く。TanStack Query はキャッシュと再取得・楽観的更新をまとめて扱える（ADR-011。保存の再送は ADR-021 の仕組みで行い、TanStack Query の一時停止した変更の再開には頼らない）。

**捨てた案:** Next.js（ユーザーが候補から外した。比べた理由の記録なし）、フォームの React Hook Form（利用者が多いが、型の推論と Standard Schema の扱いで TanStack Form の方がそろえやすい）。

**トレードオフ:** TanStack Start は比較的新しく、情報が Next.js より少ない。サーバー描画を使わないので最初の表示は JS の読み込み待ちになる（ランディングはプリレンダーで補う）。将来サーバー描画が要るようになったら、TanStack Start のまま SSR モードに切り替えられる（そのときは同じ Cloud Run のサービスで描く。ADR-004 の「`/api/*` は API」の形は変わらない）。

### ADR-003: スマホのネイティブアプリは Expo（ユーザー指定）

**状態・日付:** 保留（2026-10-11。ネイティブは PRD 6章のとおり Web のデザインが固まったあとの feature で作る。Expo で作ることと配り方は保つ。ユーザーの決定）。前の決定（2026-10-01。2026-10-03 に配り方を変えた）は、最初の範囲で Expo（React Native）＋ Expo Router のアプリを作り、身内の間はストアに公開せず、Android は EAS の内部配布、iOS は TestFlight で配る、だった。

**決定:** ネイティブアプリは PRD 6章のとおり、Web のデザインが固まったあとの feature で作る。保つ前提: Expo（React Native）＋ Expo Router で作る（ユーザー指定）。配り方・開発中の確かめ方・Apple Developer Program の登録の時期・アプリの ID の案は PRD 6章にある。feature で設計し直すもの: 開発ビルド・EAS の設定・Universal Links・Apple の審査基準 4.8 の扱いなどの詳細。前の設計は、タグ `prototype-2026-10-11` の `docs/02-01_system-design-doc.md` の ADR-003 にあり、feature の設計で読み直して決める。

**理由:** ユーザーが「ネイティブアプリ」「iOS と Android の両方」を選び、Expo を指定した（2026-10-01）。Web のデザインの改修が固まってから、その内容でネイティブを作ると決めた（2026-10-11）。

**捨てた案:** 比較の記録なし（ユーザー指定。Web を包む案は ADR-001）。

**トレードオフ:** ネイティブができるまで、スマホでは PWA で使う。iPhone ではホーム画面に追加した Web と Safari でログインが別になる（ADR-031）。

### ADR-004: Web は「静的ファイル＋/api」の形で、API と同じ Cloud Run のサービスから配る

**状態・日付:** 採用（2026-10-03 に置き換えた。ユーザーの決定。ドキュメントへの反映は 2026-10-11）。前の決定（2026-10-01）は、Cloudflare の Worker の静的アセットで Web を配り、`/api/*` を Cloud Run へ転送し、Cloud Run を共有シークレットで守る、だった。

**決定:**

- 配信の形は「`/*` は静的ファイル、`/api/*` は API」に固定する（前と同じ）。
- 置き場所は API と同じ Cloud Run のサービス `moonx-api-{env}`。イメージに Web のビルドの出力を入れ（ADR-016）、API が `WEB_DIST_DIR` のファイルを返す。返し方: `/` はビルド時に作るランディング（`index.html`。ADR-002）、`/privacy`・`/support` はビルド時に作る HTML、ビルドの出力にあるファイルはそのまま、それ以外の GET の画面のパス（`/api/` で始まらず、`/assets/` の下でも拡張子の付いたパスでもないもの）は SPA の殻の `_shell.html`（200）。見つからないファイル（`/assets/` の下か拡張子の付いたパス）は 404。`WEB_DIST_DIR` の無い local では静的ファイルを返さない（Web は Vite の開発サーバーが返し、`/api` を API へ転送する）。
- キャッシュの見出し: ファイル名にハッシュの付いたアセットは `Cache-Control: public, max-age=31536000, immutable`。HTML・マニフェスト・Service Worker のファイルは `no-cache`（ADR-031）。アイコンなどハッシュの無いファイルは `public, max-age=86400`。API の応答は `no-store`（ADR-011）。
- 環境ごとに違う値はイメージに焼き込まない（staging で確かめたイメージをそのまま production に出すため。ADR-016）。API は起動のときに HTML のファイルを読み、`<head>` に `<meta name="moonx-app-env" content="{APP_ENV}">` と `<meta name="moonx-sentry-dsn" content="{WEB_SENTRY_DSN}">` を入れて返す。Web はこの2つを読んで環境名と Sentry を決める。インラインのスクリプトを使わないので、CSP の `script-src 'self'` を保てる（7.2）。
- セキュリティヘッダー（CSP・HSTS など）は API が付ける（7.2）。
- 独自ドメインは Cloud Run のドメインマッピングで付ける（production は `{DOMAIN}`、staging は `stg.{DOMAIN}`）。DNS は Vercel にあり、CNAME（`ghs.googlehosted.com`）を手で入れる（2章「インフラ管理」）。ドメインマッピングを作る Google のアカウントは、Search Console で `dwnfrc.app` の所有を確認しておく。
- Cloud Run は IAM の認証をかけない（誰でも呼べる設定）。前段のプロキシが無いので、共有シークレットは持たない。

**理由:** ユーザーが、管理するサービスを増やすほどの利点が無いとして、クラウドを Google Cloud にまとめると決めた（2026-10-03）。Web と API が同じオリジンになるので、ログインの Cookie が第三者 Cookie にならず、Safari でも動き、CORS も要らない（前と同じ）。配信の形を「静的ファイル＋`/api`」に限っているので、あとでロードバランサや別の配信先に移っても、アプリのコードは変わらない。

**捨てた案:**

- Cloudflare Workers（前の決定）: `dwnfrc.app` の DNS が Vercel にあるままでは、Worker に独自ドメインを付けられない。
- Cloudflare Pages: Vercel の DNS に CNAME を足せば付けられるが、管理するサービスが1つ増える。
- Firebase Hosting: Cloud Run へ転送するときに `__session` という名前以外の Cookie を落とすため、Better Auth のセッションと Google ログインの状態の Cookie が届かず使えない（2026-10-01 に分かった）。
- Google Cloud のロードバランサ＋Cloud CDN: 月 $18 程度かかり、予算（月 $5・$10 のアラート。11章）を超える。

**トレードオフ:**

- Cloud Run のドメインマッピングは Preview の機能で、Google は遅延の問題から本番向けではないとしている。ユーザーはこれを承知で選んだ。問題が出たら、外部アプリケーション ロードバランサ（サーバーレス NEG）に乗り換える。配信の形は同じなので、アプリのコードは変わらない。
- Cloud Run が0台のときは、最初の画面の表示も API の起動を待つ（数秒。7.3）。最小の台数は ADR-007 のまま（0台）で、遅く感じたら ADR-007 の手順で1台にする。
- CDN を通さないので、静的ファイルも asia-southeast1 から返る（利用者はフィリピンにいるので遅れは小さい）。静的ファイルのリクエストも Cloud Run の無料枠に数えられる。2回目からはブラウザと Service Worker のキャッシュから出る（ADR-031）。
- Cloud Run の URL（`*.run.app`）も公開のまま残る。ドメインの外から呼ばれても、認証・認可・回数制限は同じにかかり、ログインの Cookie は `{DOMAIN}` にしか送られない。

### ADR-005: API は ElysiaJS（Bun）（ユーザー指定）

**状態・日付:** 採用（2026-10-01）

**決定:** `apps/api` は ElysiaJS を Bun で動かす。ルートはドメイン（ワークスペース・アイデア・検証・プランなど）ごとのプラグインに分け、認証と権限の確認はプラグインの `derive` / `beforeHandle` でまとめて行う。各ルートは、誰が呼べるかをルートのオプション（`open` / `signedIn` / `operator` / `scoped` / `located`）で宣言し、宣言の無いルートがあれば API は起動しない（7.1 の表は表駆動の結合テストで確かめる）。入出力のスキーマは Zod v4（Standard Schema として Elysia に渡す）。Better Auth はハンドラーを `/api/auth/*` にマウントする。

**理由:** ユーザーが ElysiaJS を指定し、「Elysia の仕組み」（Eden Treaty の型共有）を使いたいとした。Bun で速く起動するので、Cloud Run の0台からの立ち上がりが短い。

**捨てた案:** 比較の記録なし（ユーザー指定。Express・Hono は下のトレードオフで利用者の数を比べただけ）。

**トレードオフ:** Bun 前提なので、Node.js 前提のライブラリで動かないものがまれにある（導入時に確かめる）。Express や Hono より利用者が少なく、情報も少ない。Zod を Standard Schema で使う機能は新しいため、OpenAPI の出力に問題があれば、API の境界だけ Elysia の `t`（TypeBox）に切り替える（共有の Zod スキーマとは変換で合わせる）。

### ADR-006: 通信は REST、クライアントは Eden Treaty（ユーザー指定）

**状態・日付:** 採用（2026-10-01。2026-10-15 に、仕様書を読む画面を API が返す Swagger UI にした）

**決定:** API は `/api/v1` の下の REST（JSON、項目名は camelCase）。Web は Eden Treaty（`treaty<App>()`）で型付きで呼ぶ（のちのネイティブアプリも同じ）。仕様書は `@elysiajs/openapi` で作り、staging だけ `/api/docs` で読める（production は出さない）。読む画面は、API が返す Swagger UI（`swagger-ui-dist` のファイル）と、それを始めるスクリプトのファイルにする。`@elysiajs/openapi` が用意する画面は CDN のスクリプトとインラインのスクリプトを使い、7.2 の CSP（`script-src 'self'`）で動かないため使わない。`make openapi` は、staging が `/api/docs/json` で返すのと同じ文書を `apps/api/openapi.json` に書き出す。常時接続（WebSocket・SSE）は使わず、通知の未読数は取りに行く（2章 通信フロー 6）。

**理由:** Web と、のちのネイティブアプリが同じ API を使うので、言語に依存しない REST にし、型は Eden で共有する。ユーザーが Elysia の仕組み（Eden）を使いたいとした。

**捨てた案:** 常時接続（WebSocket・SSE。共同編集の即時反映は Non-Goal なので、運用コストに見合わない）。REST 以外の方式は比較の記録なし（ユーザー指定）。

**トレードオフ:** Eden の型は `apps/api` の `App` 型に依存するため、API の変更でクライアントの型エラーがすぐ出る（利点でもある）。Web は最新の版を読み込むが、Service Worker の更新を待っている間（ADR-031）と、のちのネイティブアプリの古い版が残る間は、API の互換性を壊せない。壊す変更は `/api/v2` を作るか、項目の追加だけにする（受け取る側は知らない項目を無視する）。

### ADR-007: API は Cloud Run（asia-southeast1）（ユーザー指定）

**状態・日付:** 採用（2026-10-01）

**決定:** API のコンテナ（`oven/bun` の公式イメージがベース）を Cloud Run で動かす。リージョンは asia-southeast1（シンガポール。利用者のいるフィリピンと Neon に近い）。最小0台・最大3台、1 vCPU・1 GiB（PDF の作成に余裕を持たせる）、同時リクエスト 40、タイムアウト 60秒、CPU はリクエストの間だけ割り当てる。イメージは Artifact Registry（最新の30個と、90日以内のものを残し、それより古いものを自動で消す）。

**理由:** ユーザーが Cloud Run を選んだ。コンテナなので Bun と PDF のライブラリが制約なく動き、無料枠（月200万リクエスト、CPU 18万秒）に試運転は十分収まる。

**捨てた案:** 比較の記録なし（ユーザー指定）。

**トレードオフ:** 0台から起動するときに数秒待つ（コールドスタート）。最初の利用者が遅く感じたら、Terraform の `min_instance_count` を1にする（常に1台。月数ドルかかるので、予算と相談して決める。時間帯での自動の切り替えは作らない）。Secret Manager は無料枠（有効な版6つ）を超えるため、月 $1 程度かかる。ロールバック（戻し先の SHA の昇格の PR。ADR-016）で戻せるのは、イメージが残っている範囲（最新の30個か90日以内）まで。

### ADR-008: DB は Neon。ただし標準の PostgreSQL として使う（ユーザー指定）

**状態・日付:** 採用（2026-10-01）

**決定:** Neon（PostgreSQL 17、リージョン AWS ap-southeast-1）の無料プランを使う。プロジェクト `moonx` の中に `production` と `staging` のブランチを作る。local は Docker Compose の PostgreSQL 17（`make db-up`）で、テストは同じサーバーの別の DB（`DATABASE_URL_TEST`）を作り直して使う。**Neon 独自の機能は使わない**（専用のサーバーレスドライバ、Data API、Neon Auth）。接続は標準の PostgreSQL プロトコル（postgres.js）で、API は Neon のプール接続（PgBouncer。`prepare: false`）を使い、マイグレーションはプールを通さない接続を使う。

**理由:** 無料で、使われないときは休むので $0 で運用できる。ユーザーが「Neon を後から変えられるようにしたい」とした。接続文字列（`DATABASE_URL`）以外に Neon への依存を作らなければ、Cloud SQL・Supabase・自前の PostgreSQL へ、データを書き出して移し `DATABASE_URL` を変えるだけで乗り換えられる。

**捨てた案:** 比較の記録なし（ユーザー指定。Cloud SQL・Supabase・自前の PostgreSQL は乗り換え先として挙げたもので、比べて捨てたものではない）。

**トレードオフ:** しばらく使われないと DB が休み、最初の応答が1秒ほど遅れる。無料プランの容量（0.5 GB）と計算時間の枠は**プロジェクト単位**で、staging のブランチと分け合う。変更履歴（`change_history`）が増え続けると足りなくなる可能性がある（05_operation-runbook.md で容量を監視する。超えそうなら Neon の有料プランか、別の PostgreSQL へ移る）。ブランチは Neon の機能だが、staging 用の別 DB で代わりがきくので、乗り換えの妨げにはならない。local を Docker にするのは、オフラインで開発でき、Neon の無料枠を使わず、テストの DB を何度でも作り直せるため（Docker が要る。Neon のプール接続（PgBouncer・`prepare: false`）の挙動は local では再現できないので staging で確かめる）。

### ADR-009: ORM は Drizzle、入力チェックは Zod v4

**状態・日付:** 採用（2026-10-01。2026-10-12 にマイグレーションの検査を足した。ユーザーの決定）

**決定:** `packages/db` に Drizzle のスキーマ（6章のコード）を置き、drizzle-kit でマイグレーションの SQL を作る。ドライバは postgres.js。drizzle-orm は安定版の 0.45 系（drizzle-kit はそれに合う版）に固定する。マイグレーションは足すだけにし、CI が `make db-check` で確かめる（下のトレードオフ）。入力チェックは Zod v4 で `packages/schemas` に置き、API（Elysia）と Web のフォーム（TanStack Form）が同じスキーマを使う。DB の中身を手で見るときは Drizzle Studio（`make db-studio`）を使う。

**理由:** Drizzle は TypeScript でスキーマを書け、生成する SQL が素直で読める（乗り換えのときも普通の SQL として持ち出せる）。Better Auth に Drizzle 用のアダプターがある。Zod は Web と API（のちのネイティブも）で同じ入力チェックを使える。

**捨てた案:** 比較の記録なし（Prisma は下のトレードオフで抽象度を比べただけ。Zod と postgres.js の代わりの候補も記録なし）。

**トレードオフ:** Prisma より抽象度が低く、複雑な集計は SQL に近い書き方になる。Drizzle の破壊的な変更に追従する必要がある（バージョンを固定し、上げるときは差分を確かめる）。0.45 系は、DB に当たっている最新のマイグレーションより `when`（タイムスタンプ）が古いマイグレーションを、エラーを出さずに飛ばす（並行したブランチのマイグレーションが後からマージされたときに起きる）。名前で照合する v1 は 2026-10 時点で RC なので使わず、`make db-check` で古いタイムスタンプと既にあるマイグレーションの書き換えを止める。

### ADR-010: 認証は Better Auth。Google ログインを最初から入れ、招待制をサーバーで強制する（ユーザー指定）

**状態・日付:** 採用（2026-10-01。2026-10-11 にスマホのセッションの Expo プラグインを外した。ネイティブの feature で足す）

**決定:** Better Auth を API に組み込む（Drizzle アダプター、テーブルは6章）。ログインはメール＋パスワードと Google。プラグインは使わない。回数制限は本体の設定（`rateLimit`）で有効にする（保存先は DB。ADR-029）。呼び出し元の IP は、入口のプラグインが決めた値だけを読ませる（7.2「呼び出し元の IP」）。招待制は次のとおりサーバーで強制する:

- メール＋パスワードの新規登録は、Better Auth の公開エンドポイント（`sign-up/email`）に `emailAndPassword.disableSignUp` で断らせ、moonx の `POST /api/v1/invitations/by-token/{token}/sign-up`（5章 U5）だけから作る。メールは招待のメールに固定する。U5 は Better Auth のアダプターを通さず、招待の確認・ユーザーと個人用ワークスペースの作成を自前のトランザクションで行う（下の2つのフックは U5 では動かない）。
- Google の新規登録は、招待の画面からだけ `requestSignUp` 付きで始める（`disableImplicitSignUp`）。さらにユーザーを作る直前のフック（`databaseHooks.user.create.before`）で、**始めた画面の招待が有効で、そのメールあてであること**を確かめ、そうでなければ拒否する（有効 = pending・期限内。確かめ方は 5.4「新規登録の制限」）。
- Google の新規登録では、ユーザーを作った直後のフック（`databaseHooks.user.create.after`）で個人用ワークスペースを作る（design-spec 5章。U5 と同じ処理）。
- 運営者は `make admin-create EMAIL=...` が発行する招待（`invitations.grants_admin = true`。ワークスペースなし）から登録・受諾した人と、local のシードのデモの運営者だけがなる（`is_admin`）。AD9 のワークスペースなしの招待は `grants_admin = false` で、登録した人は個人用ワークスペースだけを持つ一般の利用者になる。同じメールあての有効なワークスペースなしの招待が AD9 で出ている状態で `make admin-create` を再実行すると、その招待に `grants_admin = true` を付けて新しいリンクを出す（前のリンクは無効になる）。`grants_admin` を付ける API は無い。
- 停止したユーザー（`status = suspended`）はセッションを消し、ログインのフックで拒否する。

**理由:** ユーザーが Better Auth で最初から Google ログインを入れると指定した。ライブラリなので $0 で、ユーザー情報は自分の DB に残り、乗り換えの妨げにならない。招待制のような独自の決まりを、フックで確実に組み込める。

**捨てた案:** 比較の記録なし（ユーザー指定）。

**トレードオフ:** 認証の画面（ログイン・新規登録・パスワード再設定）は自分で作る（design-spec 2 の仕様どおり）。Google の OAuth クライアントを環境ごとに作り、同意画面を設定する（03_dev-setup.md）。Better Auth の更新でセキュリティ修正が出たら速やかに上げる。

### ADR-011: サーバー側のキャッシュは置かない

**状態・日付:** 採用（2026-10-01。2026-10-11 に、M9 でログインし直したときはキャッシュを残すと変えた）

**決定:** Redis などのサーバー側のキャッシュは置かない。クライアントは TanStack Query でデータを持ち（画面の移動ではキャッシュを先に出し、裏で取り直す。保存したら関係するキーを無効にする。ログインの画面へ移るとき（401 で M9 を開かないときと、M9 から移るとき）、ログアウト、ログイン・新規登録・パスワードの再設定で別のセッションに入ったときは、キャッシュをすべて捨てる。キャッシュは1人の利用者のデータなので、次の人に見せない。M9 で同じアカウントにログインし直したときは残す（8.2。2026-10-11 に変えた））、API の応答は `Cache-Control: no-store`（個人のデータのため）。静的アセットは、ファイル名にハッシュを付けて長期キャッシュの見出しで返し（ADR-004）、ブラウザと Service Worker（ADR-031）が持つ。Better Auth の回数制限は DB に記録する。

**理由:** 利用者は BCDX の数人で、データ量も小さい。複数人が同じアイデアを編集するので、サーバー側のキャッシュは古い内容を見せる危険の方が大きい。重く見える計算（損益分岐・確認項目）は純粋関数で一瞬で終わる。

**捨てた案:** マネージドの Redis（Memorystore。月 $30 を超えて予算に合わない）。

**トレードオフ:** DB が休んでいた後の最初の応答の遅れ（ADR-008）は、キャッシュでは解決しない。**入れる条件**: ダッシュボード（5）の応答が p95 で 1秒を超えるようになったら、まず SQL とインデックスを見直し、それでも足りなければ Upstash Redis の無料枠で集計結果を短時間（30秒程度）キャッシュする。

### ADR-012: Pitch Deck の PDF は API サーバーで作る

**状態・日付:** 採用（2026-10-01）

**決定:** `GET /api/v1/plans/{planId}/pitch-deck.pdf` で、API サーバーが react-pdf（`@react-pdf/renderer`）を使って PDF を作って返す。スライドの中身は `packages/domain` の `buildPitchDeck()`（プランと検証からスライドの素材を組み立てる関数）が作り、画面の表示（Web）と PDF が同じ素材を使う。フォントは 06_design-tokens.json の PDF 用のフォント（`semantic.print`。日本語を含む代替フォントを含む）をコンテナに入れ、使った文字だけを PDF に埋め込む。PDF は常にライトの配色（design-spec 6.14）。フォントは npm の `@expo-google-fonts/{ibm-plex-sans,ibm-plex-mono,ibm-plex-sans-jp}`（SIL OFL 1.1。TTF）を API の依存に含めてコンテナに入れる（PDF には書体と太さごとに1つのファイルが要る。Web 用の `@fontsource` の日本語の書体は字の範囲ごとに分かれているので、PDF には使わない。ADR-018）。表・指標・金額の数字は、画面と同じく等幅の書体（`semantic.print.font.mono`）で書く（design-spec 4.4）（API の結合テストが PDF の字送りで確かめる。10章）。

**理由:** どのクライアント（のちのネイティブを含む）からも同じ PDF を作るには、作る場所を1つにするのが確実。react-pdf は Chromium を使わないので、コンテナが軽く、0台からの起動も遅くならない。

**捨てた案:** クライアントで PDF を作る（クライアントごとに作り直すことになり、日本語のフォントの埋め込みとスライドの寸法（`semantic.print.slide`）の再現がそろわない）、Chromium で HTML から PDF を作る（コンテナが重くなり、0台からの起動が遅くなる）。

**トレードオフ:** 画面のスライド（React）と PDF（react-pdf）で描画のコードが2つになる。見た目のずれは、素材とレイアウトの数値をトークンにまとめて減らす。PDF の作成は API の CPU を使うので、同時に大量に作られると遅くなる（利用者が少ないうちは問題にならない）。

### ADR-013: メールは Resend、ドメインは既存の dwnfrc.app のサブドメイン

**状態・日付:** 採用（2026-10-01。2026-10-03 にドメインの決定を変えた。ユーザーの決定。前は「独自ドメイン `{DOMAIN}` を Cloudflare Registrar で新しく取り、DNS も Cloudflare に置く」）

**決定:** 招待とパスワード再設定のメールは Resend の HTTP API で送る（無料枠: 月3,000通）。ドメインは新しく取らず、既存の `dwnfrc.app`（Vercel で登録し、DNS も Vercel）のサブドメインを使う: production は `{DOMAIN}` = `bcdx.dwnfrc.app`、staging は `stg.{DOMAIN}`。送信元は `no-reply@{DOMAIN}`。Resend のドメインの確認の MX と TXT（SPF・DKIM）と、DMARC の TXT は、Vercel の DNS に手で入れる（2章「インフラ管理」。03_dev-setup.md）。staging は `MAIL_ALLOWLIST` に入っているメールにだけ送る（空なら誰にも送らない）。許可リストに無い宛先は、送らずに送ったものとして扱う: 招待は作って成功を返し、API のログに「許可リストに無いので送らなかった」とだけ書く（宛先は書かない。7.2「個人情報」）。staging で確かめるときは、受け取る人のメールを先に許可リストに入れる（05_operation-runbook.md）。

**理由:** 招待制のアプリなので、任意のメールアドレスに確実に届く必要がある。Resend は独自ドメインを確認しないと任意の宛先に送れない。ユーザーがすでに持っている `dwnfrc.app` のサブドメインなら、新しいドメインの費用も、別の DNS の管理も要らない。

**捨てた案:** Amazon SES（安いが AWS のアカウントと送信制限の解除の申請が増える）、SendGrid・Postmark（無料枠が小さいか無い）。新しいドメインを取る（前の決定。既存のドメインのサブドメインで足りる）。

**トレードオフ:** `dwnfrc.app` の更新を忘れるとメールもアプリも止まる（Vercel で自動更新を有効にする）。DNS のレコードを手で入れるので、入れ間違いは 03_dev-setup.md の `dig` での確かめ方で見つける。Resend の無料枠は1日100通までなので、一般公開で招待が増えたら有料プランを検討する。

### ADR-014: 期限の通知と、そのための定期実行を持たない

**状態・日付:** 採用（2026-10-03。ユーザーの決定。前の決定（2026-10-01）は「Cloud Scheduler のジョブが1時間ごとに API の内部エンドポイント `/internal/cron/due-notifications` を OIDC トークン付きで呼び、実行管理の項目の期限の3日前・当日・期限切れの通知を作る」で、この日に置き換えた）

**決定:** 実行管理の項目の期限の通知を持たない。それを作るための定期実行（Cloud Scheduler のジョブと、API の `/internal/cron`）も持たない。範囲はこの通知だけで、DB のバックアップの定期実行（ADR-028）は別の決定。

**理由:** プランは北極星として使うもので、進捗の管理には使わない（ユーザーの判断）。担当・期限・状態は項目に残し、期限切れは画面の「Overdue」とダッシュボードの Due soon で見せる。通知で期限を追わせない。

**捨てた案:** 期限の通知を残す（前の決定。上の理由で外した）。

**トレードオフ:** 期限が近いことや過ぎたことには、22 実行管理か 5 ダッシュボードを開いたときにしか気づけない。

### ADR-015: IaC は Terraform（ユーザー指定）

**状態・日付:** 採用（2026-10-01。2026-10-03 に Cloudflare の設定を外し、Cloud Run のドメインマッピングを足した。ユーザーの決定）

**決定:** Google Cloud の資源を Terraform で管理する（`infra/terraform/modules/` と `envs/{shared,staging,production}/`。状態は Cloud Storage のバケット `{GCP_PROJECT_ID}-tfstate`）。`shared` は環境をまたぐ資源（Artifact Registry・Workload Identity Federation・バックアップのバケット・予算アラート）、`staging` / `production` は環境ごとの資源で、Cloud Run のドメインマッピング（production は `{DOMAIN}`、staging は `stg.{DOMAIN}`）もここに含む（2章「インフラ管理」）。Cloud Run のイメージは CI が出し、緊急時はトラフィックを人が CLI で前のリビジョンに向ける（04_deployment-procedure.md 5.2）ので、Terraform は `image` と `traffic` の変更を無視する（`lifecycle.ignore_changes`。無視しないと、緊急で戻したあとの apply がトラフィックを悪い版に戻す）。初回は、イメージとシークレットの値がまだ無いので、環境ごとに変数 `bootstrap` で apply を2回に分ける。1回目（`bootstrap = true`）はシークレットの入れ物・サービスアカウント・写真のバケットだけを作り、Cloud Run とドメインマッピングは作らない。2回目（`bootstrap = false` と、最初のイメージを入れた変数 `api_image`）で Cloud Run とドメインマッピングを作る。最初のイメージも `build.yml` が作る（手元では作らない。05_operation-runbook.md）。手順は 03_dev-setup.md 5.4 の G〜I。DNS のレコードは Terraform で持たず、Vercel の画面で手で入れる（Vercel のトークンはチームの全プロジェクトを触れるので、Terraform にも手元にも持たせない）。ドメインマッピングを作るには、`make infra-apply` を動かすアカウントが Search Console で `dwnfrc.app` の所有を確認している必要がある。コンソールで管理するもの（Terraform の外）は2章「インフラ管理」の表が正。

**理由:** ユーザーが Terraform を選んだ。環境を作り直せて、設定の変更をレビューできる。

**捨てた案:** 比較の記録なし（ユーザー指定）。Vercel の DNS を Terraform で持つ案は、上のトークンの理由で採らない。

**トレードオフ:** Terraform の学習コストがある。コンソールと Vercel の画面で管理するものは Terraform の外に残るので、手順を 03_dev-setup.md に書いて補う。ドメインマッピングの証明書は、DNS のレコードを入れてから作られるまで時間がかかる。最初のデプロイでドメインに届くのを確かめるのは、証明書ができてからにする（03_dev-setup.md 5.4）。

### ADR-016: staging と production の2環境。バージョン宣言ファイルで昇格する（ユーザー指定）

**状態・日付:** 採用（2026-10-01。2026-10-03 に Web を API と同じイメージに入れた。ユーザーの決定。2026-10-11 にスマホの昇格を外した。2026-10-12 に、戻し方を revert から戻し先の SHA の昇格の PR に変え、production に書ける SHA を絞り、GitHub の環境と Google Cloud への入口を `main` に限り、昇格の PR を `make promote` で作るようにした。ユーザーの決定）

**決定:** 環境は staging と production（2章「環境と命名」）。環境ごとのブランチは作らない。ブランチは GitHub Flow で、マージは常に squash（ブランチの運用は 03_dev-setup.md 9章）。`main` に入ると CI がテストし、Web と API を入れたイメージ（タグはコミット SHA。両方の環境で同じイメージを使う）を作る。デプロイは `deploy/{env}/version` にコミット SHA を書いた PR（昇格の PR。`make promote` で作る）をマージしたときに GitHub Actions が行う（順番とワークフローの中身は 04_deployment-procedure.md 2章）。

- production に書けるのは、`main` の `deploy/staging/version` に書かれたことのある SHA（staging に出したもの）だけ。昇格の PR の CI が `make promote-check` で確かめ、通らなければマージできない。`make promote` は、その SHA の staging へのデプロイが成功したことも確かめる。
- GitHub の環境は3つとも `main` からだけ使え、Google Cloud への入口（Workload Identity Federation）も `main` で動くワークフローに限る（ADR-027）。CI がデプロイする経路は、昇格の PR のマージだけにする（緊急時に人が CLI で戻す手順は 04_deployment-procedure.md 5.2）。
- 戻すときも、戻し先の SHA を書いた昇格の PR を出す（revert はしない）。戻せるのは、その環境に書かれたことのある版（CI が確かめる）。直前の版（04_deployment-procedure.md 4.1）でない古い版を出すときは、出す版に無いマイグレーションに contract が無いことを人が確かめる（同 5.1）。

Web は環境ごとの値をビルドに入れず、API が HTML の meta 要素で渡す（ADR-004）ので、staging で確かめたイメージをそのまま production に出せる。

**理由:** ユーザーが staging ＋ production を選び、環境をブランチではなく昇格の PR のマージで切り替えると決めた。BCDX の実データに触れずに確かめられる。どの環境にどの版が出ているかが、リポジトリのファイルで分かる。戻し先の SHA を書くと、戻し先が PR にそのまま見え、2つ以上前の版にも1回で戻れる。production の SHA を CI で確かめるのは、staging を通っていない版を書き間違いで出さないため。staging に出したことがあればよいので、production を戻すときに staging を先に戻さなくてよい。Google Cloud への入口も `main` に限るのは、GitHub の環境が守るのは環境のシークレットだけで、入口がリポジトリ全体に開いていると、作業ブランチのワークフローからでもデプロイできるため。マージを常に squash にするのは、`main` の1コミットが1つの PR になり、昇格の履歴（`deploy/{env}/version` の変更）をコミット1つの単位で読めるため。

**捨てた案:**

- 環境ごとのブランチ: ユーザーが選ばなかった。
- 昇格の PR の revert で戻す（2026-10-12 まで）: 戻れるのはその PR の直前の版だけで、戻し先が PR に見えない。
- production の SHA を今の staging の SHA に限る: production を戻すたびに、先に staging を戻す PR が要る。
- 昇格の PR をワークフローで作る: ワークフローの `GITHUB_TOKEN` で作った PR は、PR ごとに「Approve workflows to run」を押すまで `ci.yml` が動かない。押さずに済ませるには、GitHub App かアクセストークンをシークレットに置いて管理することになる。手元の `make promote` なら、どちらも要らない（ユーザーの決定）。

**トレードオフ:**

- 昇格の PR の分だけ手順が増え、`make promote` を動かす人の手元に gh と gcloud のログインが要る（障害のときも手元から戻す）。
- DB のマイグレーションは戻せないので、「追加してから使い、使わなくなってから消す」を別々の昇格で出す（04_deployment-procedure.md 4.1）。
- 直前の版でない古い版を出せるか（出す版に無いマイグレーションに contract があるか）は、CI では確かめられず人が読む。

### ADR-017: モノレポは Bun workspaces ＋ Makefile

**状態・日付:** 採用（2026-10-01。2026-10-11 に `bunfig.toml` の `linker = "hoisted"` を外した。Expo の Metro と jest-expo のための指定で、ネイティブを範囲から外したため。ネイティブの feature で要るか確かめ直す）

**決定:** Bun workspaces で `apps/*` と `packages/*` をまとめる。パッケージ名は `@moonx/*`。タスクの実行は Makefile に集め（2章「make ターゲット」）、CI もデプロイを含めて Makefile のターゲットを呼ぶ（GitHub Actions のワークフローの一覧と中身は 04_deployment-procedure.md 2章）。

**理由:** API が Bun で動くので、パッケージ管理も Bun にそろえる。Vite も Bun のワークスペースで動く。Makefile を正にすれば、ドキュメント・CI・CLAUDE.md がターゲット名だけを参照できる。

**捨てた案:** 比較の記録なし（パッケージ管理の pnpm・npm など）。Turborepo は捨てずに保留している（下のトレードオフ）。

**トレードオフ:** Turborepo のような差分ビルドのキャッシュは無い。ビルドが遅くなったら導入を考える。

### ADR-018: デザインシステムは Adobe Spectrum の仕組み、見た目は月相（ユーザー指定）

**状態・日付:** 採用（2026-10-01。2026-10-11 にスマホのテーマの生成を外し、PWA のアイコンとマニフェストの生成を足した。2026-10-12 に見た目を Hermes Teal から月相に替え、06 からネイティブ向けの値を外し、書体の読み込みを決めた）

**決定:**

- **参考にするもの**: Adobe Spectrum（Spectrum 2）の仕組みを取り入れ（ユーザーと合意、2026-10-01）、見た目は design-spec 4.4 の月相にする（2026-10-12 にユーザーと決めた）。取り入れる範囲は design-spec 4.4「デザインシステムの参考」、部品の一覧は design-spec 4.5 が正。この ADR は、それを実装する方法（トークンの階層・生成・ライト / ダーク）を決める。
- **トークン**: 正は `docs/06_design-tokens.json`（DTCG 形式）。Spectrum の3つの階層を、DRAFT の2層に次のように対応させる: Spectrum の global → `primitive`、alias（用途の名前）→ `semantic`、component（部品ごとの寸法）→ `semantic.scale.{medium,large}.component`。実装が参照してよいのは `semantic` だけ。`semantic` の値はエイリアスだけで、たどると必ず `primitive` に着く（書体のスタイルや密度は `semantic.scale.medium` を参照し、生成のときに large へ差し替える）。
- **生成**: `make tokens` が `packages/ui-tokens` に次を生成する（変換は自前の小さなスクリプト。Style Dictionary は使わない）。
  - Web: vanilla-extract のテーマ（`createGlobalThemeContract` の型付きの契約と、ライト / ダーク × medium / large の値。CSS 変数として出る）。画面のスライド表示（Slide）は `semantic.print`（ライト固定）を参照する
  - PDF: react-pdf 用の定数（常にライト。`semantic.print`）
  - PWA: アイコン（SVG と PNG）とマニフェスト（ADR-031）
  - 06 はネイティブ向けの値を持たない（2026-10-12 に外した。ネイティブの feature で要るものを足す）
- **ライト / ダーク**: セマンティック層の `light` / `dark` で切り替える。Web は 4 アカウント設定の System / Light / Dark に従い、Light と Dark は `<html data-theme="light|dark">` で固定し、System は属性を置かずに `prefers-color-scheme` に従う。
- **スケール（Web）**: 既定は `medium`。タッチ操作が主の端末（`@media (pointer: coarse)`）は `large` にする。`<html data-scale="medium|large">` で固定でき、固定が優先される。タッチパネル付きのノート PC も `pointer: coarse` に当たるときは `large` になる。
- **書体**: 書体の名前の正は 06 の `primitive.font.family`（self-host する書体はどれも SIL OFL 1.1。並びの残りは配らない OS の書体）。Web は npm の `@fontsource/ibm-plex-sans`・`@fontsource/ibm-plex-mono`・`@fontsource/ibm-plex-sans-jp` を依存に入れて self-host する（外部の CDN からは読まない）。読み込むのは 06 の `primitive.font.weight` の太さだけで、ファイルは woff2 だけを使う。日本語の書体は字の範囲（`unicode-range`）ごとに分かれたファイルのまま使い、画面に出た字のファイルだけをブラウザが読む。Service Worker でのキャッシュの仕方は ADR-031、PDF の書体は ADR-012。
- **アイコン**: Lucide（`lucide-react`）にそろえる。大きさは `semantic.scale.{medium,large}.component.icon.size`、線の太さは `semantic.icon` のトークン。

**理由:** ユーザーがデザインシステムの参考に Adobe Spectrum を指定し、見た目は moonx 独自のもの（2026-10-12 に月相に決めた）にすることを選んだ。Spectrum は部品・大きさ・スケール・密度・アクセシビリティの決まりが体系化されていて、のちのネイティブでも同じ考え方を使える。React Aria（ADR-025）は Spectrum を作っている Adobe の headless の部品なので、振る舞いの決まりがそのまま合う。スケールと密度の考え方で、design-spec 4.4 の「画面で密度を使い分け、スマホは一段ゆったり」をそのまま表せる。Lucide はネイティブ（`lucide-react-native`）にも同じ絵柄の版があり、線の太さと大きさを props で変えられる。変換を自前のスクリプトにするのは、出力が限られ（vanilla-extract・react-pdf・PWA のアイコン）、Spectrum の階層（scale・density・light/dark）の差し替えを素直に書けるため。

**捨てた案:** Spectrum の部品をそのまま使う（React Spectrum S2。配色と書体をほぼ変えられず、月相の見た目にできない）、Spectrum の Workflow アイコン（使わないとユーザーと合意した）、Style Dictionary（設定と拡張の方が大きくなる）。

**トレードオフ:** S2 をそのまま使う案に比べ、部品の見た目を自分で作る手間がかかる。アイコンの体系は Spectrum とずれる。生成スクリプトを保守する必要がある。生成物はコミットし、`make tokens` の実行忘れを CI で検出する（生成し直して差分が出たら失敗）。

### ADR-019: 同時編集は項目単位の楽観ロック

**状態・日付:** 採用（2026-10-01）

**決定:** 保存の単位の項目（回答・行・数字・アイデアの概要・プランのヘッダ）は `lock_version` を持つ。更新の API は、クライアントが持っている `lockVersion` を受け取り、DB の値と違えば **409 `CONFLICT`** と相手の内容（値・保存した人・日時）を返す。利用者が「自分の内容で上書きする」を選ぶと、クライアントは `force: true` で送り直す。どちらの内容も変更履歴に残る（design-spec 6.0.2）。

まとめて反映する操作（AI 取り込みの X3）は、1つでも古い `lockVersion` があれば何も変えずに **409 `CONFLICT_MULTI`** と衝突した項目の一覧を返す（全部反映するか、何もしない）。

この決まりの例外（キーで決まる項目を同時に作られて負けたときは `force` でも 409、H2 は衝突を確かめない、並べ替えの V17・P11 は版を上げない、など）は 5.1「同時編集」と各 API の表が正。

**理由:** 共同編集の即時反映は Non-Goal。項目が細かいので衝突はまれで、衝突したときだけ利用者に選ばせれば足りる。

**捨てた案:** 比較の記録なし。

**トレードオフ:** 同じ欄を同時に打っている2人には、後から保存した側にだけ衝突が出る。

### ADR-020: 変更履歴はアプリのコードで、同じトランザクションの中で書く

**状態・日付:** 採用（2026-10-01）

**決定:** 変更履歴の対象（design-spec 6.0.5）を更新する API は、本体の更新と `change_history` への書き込みを1つのトランザクションで行う。書き込みは共通の関数 `withHistory` だけを通す。`withHistory` は、書き込む画面（`container`）・変えた人・変更の種類（`source`）・1回の操作のまとまり（`batchId`）と、本体を変える処理を受け取る。本体を変える処理は変える前と後の値を返し、前と後が等しければ履歴を書かない（値を変えない保存は版も上げない）。`change_history` の各列をどこから決めるかは 6.3 の末尾。例外は作らない（作成の取り消しも `withHistory` で取り消しの行を書く。5.11）。

**理由:** 変更の種類（手入力・AI 取り込み・元に戻す・テンプレートの移行・複製・下書き作成）と、誰が変えたかはアプリしか知らない。

**捨てた案:** DB のトリガー（乗り換えのときに DB 側のロジックを持ち出す必要が出る）。

**トレードオフ:** 履歴を書き忘れる API を作る危険がある。対象のテーブルを更新するリポジトリ関数を `withHistory` 経由に限り、結合テストで「更新したら履歴が1件増える」を確かめる。

### ADR-021: 保存できなかった入力は、ページを開いている間だけ再送する

**状態・日付:** 採用（2026-10-11 に置き換えた。ユーザーの決定）。前の決定（2026-10-01）は、保存できなかった入力を端末の送信待ちの列（Web は IndexedDB、スマホは expo-sqlite）に残し、再接続したら送る、だった。PWA にすると決めたときに「入力には接続が要る（オフラインで入力して後で送る仕組みは作らない）」と決めたので（ADR-031）、それに合わせた。

**決定:**

- 自動保存（design-spec 6.0.2）は、項目ごとに、まだ保存できていない最新の値を1つだけメモリに持つ。端末の保存先（IndexedDB・localStorage など）には書かない。持つのはページ（タブ）を開いている間で、アプリの中で画面を移っても消えない。
- 一時的な失敗（通信の断・5xx・`UPSTREAM_UNAVAILABLE`）は、間隔を伸ばしながら自動で再送する。再送は持っている `lockVersion` で送り、衝突したら ADR-019 の選択を出す。
- オフラインになったら（ブラウザが `offline` を知らせたとき、または通信の失敗が続いたとき）、入力欄を読み取り専用にして入力を止める。戻ったら、持っている値を送ってから入力を戻す。表示と文言は design-spec 6.0.2・6.0.6 に従う。
- 恒久的な失敗（アーカイブ済み・権限がない・対象が無い）は、再送しても結果が同じなので自動では再送しない。Retry を押したときだけ送り直す。表示は design-spec 6.0.2 に従う。
- まだ保存できていない値があるまま、ページを閉じる・再読み込みする・アプリの外へ移るときは、ブラウザの離脱の確認（`beforeunload`）を出す。
- セッションが切れた（401）ときは、持っている値を捨てずに画面に残し、design-spec M9 でその場でログインし直させる。同じアカウントでログインし直したら送る。ログインの画面へ移る（401 で M9 を開かないとき、M9 から 2 へ移るとき。Google でのログイン・「Sign in on the login page」・アカウントの停止）・ログアウトしたときは捨てる（ログアウトの前の確認は design-spec 5章「共通ナビ」）（8.2。2026-10-11 のユーザーの決定。プロトタイプは端末に残して、同じ人がログインし直したら送っていた）。

**理由:** 入力には接続が要るという PWA の決定に合わせる。回答の内容を端末に残さずに済み、再接続したときに古い値を送って衝突させる扱いも要らない。通信の一瞬の途切れで入力が消えないことは、メモリの再送で足りる。

**捨てた案:** 前の決定（IndexedDB の送信待ちの列。ページを閉じても残るが、端末に回答が残り、再接続のときの衝突の扱いが増える）、TanStack Query の一時停止した変更の再開（保存先を足さない限りページを閉じると消え、項目ごとに最新の値だけを送る決まりを表しにくい）。

**トレードオフ:** 電波の弱い場所では入力が止まる。保存できていない値は、離脱の確認を無視してタブを閉じると消える。

### ADR-022: テストとリントのツール

**状態・日付:** 採用（2026-10-01。2026-10-11 にスマホのテスト（Jest（jest-expo）＋ React Native Testing Library、E2E の Maestro。Maestro は 2026-10-03 のユーザーの決定）を外した。ネイティブの feature で足す）

**決定:** Biome（リントと整形）、TypeScript の型チェック、`packages/domain`・`packages/schemas`・`packages/i18n`・`packages/ui-tokens`・`scripts/`・`packages/db`・`apps/api` は Bun test（`packages/db` と API は実際の PostgreSQL に対する結合テスト）、`apps/web` と `packages/ui-web` は Vitest ＋ Testing Library（部品は `@react-aria/test-utils` も）、E2E は Playwright、アクセシビリティの検査は axe（`@axe-core/playwright`。Playwright の E2E の中だけで使い、部品のテストでは使わない）。画面にスタイルを書かない決まり（ADR-025）は Biome の `noRestrictedImports`、JSX の中の生の文字列（9章）は Biome の規則で足りない分を CI の小さな検査スクリプトで見つける。詳細は10章。

**理由:** 実行環境（Bun・Vite）ごとに標準のツールを使うのが、一番つまずきが少ない。Biome は1つのツールで速い。

**捨てた案:** 比較の記録なし。

**トレードオフ:** テストのツールが Bun test と Vitest の2つになる。テストの書き方の違いは各パッケージの README で補う。

### ADR-023: 監視とログは Sentry と Cloud Logging

**状態・日付:** 採用（2026-10-01。2026-10-03 に Cloudflare の Workers Logs を外した。2026-10-11 にスマホの Sentry のプロジェクトを外した）

**決定:** エラーは Sentry（無料枠。プロジェクトは `moonx-web` と `moonx-api`）に送る。API のログは1行1つの JSON（`severity`・`message`・`requestId`・`userId`・`route`・`status`・`latencyMs`・`client`・`clientIp`）で標準出力に書き、Cloud Logging が集める。リクエスト ID は API が入口で作り（8.3）、エラーの応答と Sentry にも入れる。死活確認は Cloud Monitoring の稼働時間チェック（`/api/health`）。詳細は11章。

**理由:** どれも無料枠で足りる。リクエスト ID で、利用者が見たエラーとログ・Sentry をつなげられる。

**捨てた案:** Google Cloud の Error Reporting（無料だが、Web のエラーとソースマップを扱えず、API だけになる）。

**トレードオフ:** Sentry の無料枠（月5,000件）を超えると届かなくなる。同じエラーが大量に出たら Sentry の側で間引く。

### ADR-024: プロフィール写真は Cloud Storage

**状態・日付:** 採用（2026-10-01）

**決定:** 4 アカウント設定の写真は、API が受け取って sharp（libvips）で 512×512 の WebP に縮め、Cloud Storage のバケット `{GCP_PROJECT_ID}-moonx-{env}-avatars`（公開読み取り、ファイル名は推測できない乱数）に置く。URL を `users.avatar_url` に入れる。local はバケットを使わず、ディスク（`./.data/avatars`）に置いて、API が `GET /api/avatars/{name}`（U9。公開）で返す。

**理由:** 写真は任意で小さいので、費用は月 $0.1 未満（Cloud Storage の無料枠は米国の3リージョンだけなので、asia-southeast1 のバケットには少しかかる）。バケット名は全体で一意なので、ほかのバケットと同じくプロジェクト ID を前に付ける。

**捨てた案:** Cloudflare R2（無料枠はあるが、API から書き込む鍵を Cloud Run に置き、もう1つの保存先を管理することになる）、クライアントだけで縮める（のちのネイティブでもう一度作ることになる）。

**トレードオフ:** 公開読み取りなので、URL を知っていれば誰でも見られる（プロフィール写真なので許容する。乱数のファイル名で推測を防ぐ）。sharp はネイティブのライブラリで、Bun で動くことはプロトタイプのテストで確かめた。`oven/bun` のコンテナの中で動くことは、最初のイメージを作るときに確かめる。

### ADR-025: 部品は headless の部品＋自前のスタイル。Tailwind は使わない（ユーザー指定）

**状態・日付:** 採用（2026-10-01。Web の部分）。スマホの部分は保留（2026-10-11。ネイティブはPRD 6章のとおり Web のデザインが固まったあとの featureで作る。前の決定は @rn-primitives・@gorhom/bottom-sheet・react-native-unistyles。詳細はタグ `prototype-2026-10-11` の `docs/02-01_system-design-doc.md` の ADR-025）。

**決定:**

- **Web（`packages/ui-web`）**: 振る舞いとアクセシビリティは **React Aria Components**（キーボード操作・フォーカスの管理・ARIA・国際化された数値と日付の入力）。見た目は **vanilla-extract**（`*.css.ts` に型付きで書き、ビルド時に静的な CSS になる。実行時の処理なし）。大きさや種類の出し分けは `@vanilla-extract/recipes` の `recipe()`（例: `size: S | M | L | XL`、`variant: primary | secondary | negative`）。React Aria の状態は `data-*` 属性（`[data-hovered]`・`[data-pressed]`・`[data-focus-visible]`・`[data-disabled]` など）で書く。Popover と Tray の切り替えは、幅がトークンの `semantic.breakpoint.tablet` より狭いときに Tray（下からのシート）にする共通の部品で行う。
- **部品の名前と API**: design-spec 4.5 の Spectrum の名前にそろえる（例: `<Button variant="primary" size="M">`、`<StatusLight variant="partial">`）。のちのネイティブの部品も同じ名前と props にする。props の型は `packages/ui-web` で定義し、共通の部分（`size`・`variant` などの値の型）は `packages/ui-tokens` に手で書いて置く（`packages/ui-tokens/src/generated/` が `make tokens` の生成物、`src/types.ts` などそれ以外は手で書くファイル）。
- **画面にスタイルを書かない**: `apps/web` の画面は、部品と、レイアウトの部品（`Flex`・`Grid`。間隔はトークンの名前だけを受け取る。例: `gap="space-300"`）の組み合わせで作る。画面で vanilla-extract のパッケージ（`@vanilla-extract/css`・`@vanilla-extract/recipes` など `@vanilla-extract/` で始まるもの）を直接使うこと、`style` 属性に値を書くことは、Biome の `noRestrictedImports` と CI の検査で禁止する。必要な見た目が無ければ、design-spec 4.5 に部品を足してから `packages/ui-web` に作る。
- **スマホ（保留）**: ネイティブの feature で決める。部品の名前と props を Web にそろえる決まりは保つ。

**理由:** ユーザーが「Tailwind のクラスを画面に直接書かない」「React Aria などの headless の部品を使う」と指定した。振る舞いを実績のある部品に任せると、ダイアログのフォーカスの閉じ込め・キーボード操作・スクリーンリーダー対応を自分で作らずに済む（design-spec 4.1 の設問フォームのキーボード操作、6.0.6 のモーダルの決まり）。見た目を部品の中に閉じ込めると、画面ごとのばらつきが出ず、Spectrum を参考にしたデザインシステム（ADR-018）を守りやすい。vanilla-extract はトークンを型として扱えるので、`semantic` 以外の値を使うと型エラーになる。

**捨てた案:** Tailwind・NativeWind（ユーザーが、画面にクラスを直接書く形を使わないと指定した）、CSS-in-JS の実行時ライブラリ（比較の記録なし。vanilla-extract はビルド時に静的な CSS になり、実行時の処理が無い）。

**トレードオフ:** 部品のライブラリを最初に作る手間がかかり、画面を作る前に主要な部品（Button・TextField・TextArea・NumberField・Dialog / Tray・StatusLight・TableView など）をそろえる必要がある。vanilla-extract の Vite プラグインを TanStack Start のビルドに組み込む（動かない場合は、部品の CSS を `packages/ui-web` で事前にビルドして読み込む）。React Aria はネイティブでは動かないので、ネイティブを足すときは振る舞いの部品を別に選ぶ。

### ADR-026: i18n は i18next。英語だけで始め、多言語にできる作りにする

**状態・日付:** 採用（2026-10-01。2026-10-11 にスマホ（Hermes の `Intl` の確かめ）を外した。ネイティブの feature で確かめる）

**決定:** i18next ＋ react-i18next を Web で使い、API も同じカタログ（`packages/i18n`）を使う（通知の文・PDF の見出し・AI 書き出しの見出し・メール）。UI は英語だけで始め、文言はすべてカタログに置く。日付・数値・金額の書式は `Intl` を使う `packages/i18n` の関数に集め、初期は en-PH に固定する。詳細は9章。

**理由:** design-spec 1.2 で「UI は英語のみ。ただし多言語化できる作りは残す」と決めた。後から文言をカタログへ移すのは手間が大きいので、最初から分けておく。i18next は Web とサーバー（のちの React Native も）で同じライブラリとカタログを使え、複数形の規則も持つ。

**捨てた案:** FormatJS（react-intl。ICU の書式は強いが、サーバーとスマホでの使い方がそろえにくい）、Lingui（コンパイルの手順が増える）。

**トレードオフ:** 英語だけのうちは、カタログのキーを引く手間が増えるだけに見える。

### ADR-027: CI/CD は GitHub Actions、Google Cloud へは Workload Identity Federation

**状態・日付:** 採用（2026-10-01。2026-10-03 に Worker のシークレットを外し、2026-10-11 に EAS を外した。2026-10-12 に Workload Identity Federation と GitHub の環境を `main` に限った。ユーザーの決定）

**決定:** CI/CD は GitHub Actions（ワークフローは 04_deployment-procedure.md 2章）。Google Cloud へは Workload Identity Federation で入り、サービスアカウントの鍵を作らない。WIF のプロバイダの条件は、このリポジトリの `main` で動くワークフロー（OIDC トークンの `repository` が `<org>/moonx` で、`ref` が `refs/heads/main`）に限る。Google Cloud を使うワークフロー（`build.yml`・`deploy.yml`・`db-backup.yml`）はどれも `main` で動き、PR の `ci.yml` は Google Cloud を使わない。`pull_request_target` と `workflow_run` で動くワークフローは作らない（PR から始まっても `ref` が `main` になり、この条件を通ってしまうため）。GitHub の環境は `staging`・`production`（デプロイに承認を要する）・`production-backup`（バックアップと KPI の集計に使う読み取り専用の接続だけを持つ。承認なし）で、3つとも `main` からだけ使える（ADR-016）。依存の脆弱性は Dependabot のアラートで知る。シークレットの置き場所は次の2つに分ける: Cloud Run が使うものは Secret Manager、CI が使うものは GitHub の環境かリポジトリ（2章「CI のシークレットと変数」）。

**理由:** コードが GitHub にあり、PR・レビュー・昇格の PR とそのまま組み合わせられる。Workload Identity Federation なら、漏れると困る長期の鍵をどこにも置かない。シークレットは、それを使う実行環境のそばに置くのが一番漏れにくい。

**捨てた案:** Cloud Build（Google Cloud の中で完結するが、PR との連携が GitHub Actions より手間）。

**トレードオフ:** 非公開のリポジトリでは GitHub Actions の無料の実行時間に上限がある。シークレットの置き場所が2つに分かれるので、ローテーションの手順を 05_operation-runbook.md にまとめる。

### ADR-028: DB のバックアップは毎日の pg_dump

**状態・日付:** 採用（2026-10-01）

**決定:** 定期実行の GitHub Actions（`db-backup.yml`。環境 `production-backup`）が毎日1回、production の DB を読み取り専用のロール `moonx_backup_ro` で `pg_dump -Fc` し、`gs://{GCP_PROJECT_ID}-moonx-backups/production/<日付>.dump` に上げる（`make db-backup ENV=production`）。バケットは30日で自動削除する。戻し方と、戻す練習（頻度を含む）は 05_operation-runbook.md。

**理由:** 標準の `pg_dump` なら、DB を乗り換えても同じ方法で取れて戻せる（ADR-008）。

**捨てた案:** Neon の履歴からの復元だけに頼る（無料プランでは戻せる期間が短い）。

**トレードオフ:** 失うかもしれないのは最大で約1日分。GitHub Actions の定期実行は遅れることがある。バックアップの取得で Neon の計算時間を使う。削除したアカウントの情報は、バックアップから消えるまで最大30日残る（7.2）。

### ADR-029: API の回数制限は2段にする

**状態・日付:** 採用（2026-10-03 に3段から2段にした。ドキュメントへの反映は 2026-10-11）。前の決定（2026-10-01）の③（外側の守りとして Cloudflare の無料のレート制限ルール1つを `/api/auth/*` にかける）は、Cloudflare をやめたので無くなった（ADR-004。ユーザー承知）。

**決定:** 回数は、API の入口のプラグイン（以下「入口のプラグイン」）と Better Auth の2つが、同じ DB のテーブル `rate_limits` に記録して数える。

- ① **Better Auth の回数制限**（本体の `rateLimit` 設定。IP ごと）: 秘密を受け取らない認証のパス（`get-session` など）にかける。キーは Better Auth が決める（接頭辞 `app:` を使わない）。
- ② **入口のプラグイン**（Elysia のプラグイン）: すべてのリクエスト（`/api/*` と静的ファイル）の前に入り、呼び出し元の IP（7.2）とリクエスト ID（8.3）を決め、アクセスログを書く。`/api/auth/*` の本体の大きさ（1MB。超えたら 413 `PAYLOAD_TOO_LARGE`）も確かめる。回数を数えるのは、下に挙げるパスだけ。キーは接頭辞 `app:` で始め、Better Auth のキーとぶつからない。
  - IP ごと: 秘密を受け取る認証のパス（Better Auth の6つのパス。5.4）と U5（招待からの新規登録）を、パスをまたいで1つの枠で数える（キー `app:ip:auth:<IP>`）。Better Auth はパスごとにしか数えられないので、これらのパスでは Better Auth の数え方を止める（5.4）。DB の死活確認（Z2）も IP ごとに数える（キー `app:ip:health-db:<IP>`）。
  - ユーザーごと: 招待の送信・再送（W4・W5・AD9）、PDF の作成、AI 書き出し・取り込み、アカウントの削除のパスワード確認（キー `app:user:<上限の名前>:<userId>`）。
  - 上限の回数と時間の幅は 7.2「レート制限」に書く。
- IP は、入口のプラグインがリクエストごとに1回だけ決めた値（7.2「呼び出し元の IP」）を、① と ② の両方が使う。キーの `<IP>` には、IPv6 なら先頭の /64 にまとめた値を入れる（7.2「レート制限」）。

**理由:** Better Auth の回数制限は Better Auth のエンドポイントにしか効かない。アプリの API の上限は「誰が」で数える必要があり（Resend の1日100通や PDF の CPU を守る）、ログインの後にしか分からないので API の中で数える。DB に記録すれば、Cloud Run が複数台でも数がそろい、Redis が要らない（ADR-011）。

**捨てた案:** 比較の記録なし（前の決定の③は、上の「状態・日付」のとおり Cloudflare をやめたので外した）。

**トレードオフ:** 回数の記録のたびに DB への書き込みが増える（上限をかけるのは重い操作と秘密を受け取るパスだけにして抑える）。前段で数える守りが無いので、大量のリクエストは Cloud Run まで届く（台数の上限は3台。ADR-007）。

### ADR-030: 言語は TypeScript（ユーザー指定）

**状態・日付:** 採用（2026-10-01。この ADR を書いたのは 2026-10-11。それまでは他の ADR の前提としてだけ書かれていた）

**決定:** アプリ（`apps/*`）・共有パッケージ（`packages/*`）・スクリプト（`scripts/`）は TypeScript で書く。例外は `scripts/doc-lint.sh` と `.githooks/pre-commit`（DRAFT が配る検出点）と `scripts/draft-loop.sh`（DRAFT の無人ループの駆動スクリプト）で、シェルのまま使う。型チェックは `make typecheck`。

**理由:** ユーザーの希望（design-spec 9.3）。Eden Treaty の型の共有（ADR-006）、Drizzle のスキーマ（ADR-009）、トークンの型（ADR-025）も、どれも TypeScript を前提にしている。

**捨てた案:** 比較の記録なし（ユーザー指定）。

**トレードオフ:** 型チェックの時間が CI にかかる。

### ADR-031: Web を PWA にする

**状態・日付:** 採用（2026-10-11。ユーザーの決定）

**決定:**

- **マニフェスト**（`/manifest.webmanifest`）: `name` と `short_name` は下の「名前」、`display` は `standalone`、`start_url` と `scope` は `/`、`theme_color` と `background_color` はトークン（`semantic` の地の色）から作る。`make tokens` が生成する（ADR-018）。
- **アイコン**: 形と色は design-spec 4.4「アプリのアイコン」に従う。ここは作り方だけを持つ: `make tokens` がトークンから SVG を作り、PNG（favicon 32、`apple-touch-icon` 180、192、512、maskable 512）は SVG から sharp で作る。生成物（`packages/ui-tokens/src/generated/pwa/`）は手で直さず、Web のビルドが `/icons/` に出す。
- **Service Worker**（`/sw.js`。`apps/web` の Service Worker のソースに、ビルドしたアセットの一覧を vite-plugin-pwa の `injectManifest` で埋め込む）:
  - キャッシュするのは画面の外側だけ: `_shell.html`、ビルドしたアセット、フォント、アイコン。ランディング（`index.html`）と 29・30 の HTML はキャッシュしない。フォントのうち事前にキャッシュする（インストールのときに取る）のは欧文と等幅の書体の woff2 だけ。日本語の書体の字の範囲ごとのファイル（1つの太さで100を超える）は事前にキャッシュせず、使われたときに実行時にキャッシュする（CacheFirst。ADR-018）。
  - `/api/*` はキャッシュせず、必ずネットワークに出す（オフラインでも代わりの応答を返さない）。
  - 画面のパスへのナビゲーションはネットワークを先に使い、オフラインのときだけキャッシュした `_shell.html` を返す（API が meta を入れた最新の HTML を使うため）。
  - 入力をオフラインで受けて後で送る仕組みは作らない（入力には接続が要る。ADR-021）。
  - 新しい版の Service Worker が待っているときは、design-spec の表示で再読み込みを促し、利用者が選んだときだけ切り替える（`skipWaiting` を自動では呼ばない）。
  - 登録は本番のビルドだけで行い、Vite の開発サーバーでは登録しない。
- **パスと見出し**（API が返す。ADR-004）:

  | パス | Content-Type | Cache-Control |
  |---|---|---|
  | `/manifest.webmanifest` | `application/manifest+json` | `no-cache` |
  | `/sw.js` | `text/javascript; charset=utf-8` | `no-cache`（新しい版をすぐ見つけるため） |
  | `/icons/icon-192.png`・`/icons/icon-512.png`・`/icons/icon-maskable-512.png`・`/icons/apple-touch-icon.png`・`/icons/favicon.png`・`/icons/icon.svg` | `image/png`・`image/svg+xml` | `public, max-age=86400` |

- **iPhone の案内**: iPhone の Safari で開いたときだけ、「ホーム画面に追加」の手順を案内する（閉じられる。場所と文面は design-spec）。iPhone はインストールを勧める表示を自動では出さないため。
- **名前**: マニフェストの `name` と `short_name` はサービス名（design-spec 1.2「配り方と名前」）。

**理由:** 最初に公開するのは Web だけで、スマホではホーム画面に追加して使う（2026-10-11 のユーザーの決定）。画面の外側だけをキャッシュすれば、起動が速くなり、オフラインでも「オフライン」と出せる。データをキャッシュしないので、古い内容や他の人のデータを見せる危険が無い（ADR-011）。

**捨てた案:** データもキャッシュしてオフラインで読めるようにする（古い内容を見せる危険と、キャッシュを人ごとに分ける手間が大きい）、Service Worker を置かずマニフェストだけにする（ホーム画面に追加はできるが、オフラインのときに何も出せない）。Service Worker の作り方の vite-plugin-pwa の `generateSW` は、比較の記録なし（`/api/*` を必ずネットワークに出す決まりを自前のコードで書くため、`injectManifest` にした）。

**トレードオフ:** iPhone では、メールの招待のリンクはホーム画面のアプリではなく Safari で開く。ホーム画面のアプリと Safari ではログインが別になる（ユーザー承知）。Service Worker の更新を利用者が選ぶまで、古い版の画面が残る。

---

## 4. ルーティング

画面の存在・目的・レイアウト・認証要否は design-spec 3章が正。ここはルートと画面の対応だけを持つ。Web は TanStack Router のファイルルート。のちのネイティブアプリも**同じパス**にする（招待やパスワード再設定のメールのリンク、通知のリンクを同じパスで開けるように。ADR-001）。

- `$workspaceId` などは URL のパラメータ。ワークスペースに属する画面は `/w/$workspaceId/` の下に置き、他のワークスペースの URL を開いたら design-spec 6.0.6 の「権限がない」を出す。
- 自己分析（10・11）は本人のもので、どのワークスペースのパスから開いても中身は同じ。Viewer として開いているワークスペースの `/w/$workspaceId/self-analysis...` を開いたら、自分の個人用ワークスペースの同じパスへ移す（design-spec 6.11）。
- 作成の取り消し（5.11）で論理削除したアイデア・プランのパスは、無いものとして design-spec 6.0.6「見つからない」を出す。
- モーダル（M1〜M8）とパネル（PNL-1・PNL-2）はルートを作らず、検索パラメータで開く: `?modal=new-idea|evidence|save-version|go-no-go|create-plan|share|switch-workspace|update-template`、`?panel=comments|history&target=<targetType>:<targetId>[:<targetKey>]`。
- M9（ログインし直し）は 401 のときにだけ開くので、ルートも検索パラメータも持たない（8.2）。
- `target` の書式は2つ。項目は `<targetType>:<targetId>[:<targetKey>]`（`targetKey` に `:` を含んでもよい）で、その項目のコメントのスレッド（C1）と項目の履歴（H1 の `targetType`・`targetId`・`targetKey`）に使う。画面全体は `container:<containerType>:<containerId>[:<sectionKey>,...]`（`containerType` は `self_analysis` / `validation` / `business_plan` / `idea`。`sectionKey` は画面が持つ節のキーで、複数ならカンマでつなぐ。画面と節の対応は 6.3 の末尾）で、画面全体の履歴（H1）と、画面のコメントの一覧（C1）に使う。画面のコメントの一覧は、その画面の項目のスレッドと、アイデアの中の画面ではアイデアへのコメント（対象 `idea:<ideaId>`）をまとめて出す（ヘッダーの 💬。design-spec 6.0.1・6.0.4）。どちらにも当てはまらない値は、パネルを開かない。
- モーダルが対象の項目を持つとき（M2 の根拠シート）は `?modal=evidence&about=<targetType>:<targetId>[:<targetKey>]` とする。`about` の書式は `target` の項目と同じで、パネルの `target` と同時に使える（パネルを開いたまま根拠シートを開ける）。
- M8 は `?modal=update-template&about=<templateKind>:<targetId>`（`templateKind` は `self_analysis` / `validation` / `business_plan`、`targetId` は自己分析・検証・プランの id）で開く。`about` が無いとき、画面の対象と食い違うとき、操作できない人が開いたときは、何も出さない。
- 認証が要るルートで未ログインなら `/login?next=<元のパス>` へ移る。
- `/dev/components` は部品の確認用ページ。開発サーバー（`import.meta.env.DEV`）だけで開き、本番のビルドには入らず、開くと Not Found になる。

| ルート | 画面（design-spec 参照） | 補足 |
|---|---|---|
| `/` | 1 ランディング | ビルド時に HTML を作る |
| `/privacy` | 29 プライバシーポリシー | 公開。ビルド時に HTML を作る。本文は BCDX が用意する文章（9章「規約のページの本文」） |
| `/support` | 30 サポート | 同上 |
| `/login` | 2 ログイン / 新規登録（ログイン） | `?next=<戻る先のパス>&error=<エラーコード>&requestId=<…>`（`error` は 2 に出す状態。例: `ACCOUNT_SUSPENDED`、Google のログインの失敗。`requestId` は、Google のログインの失敗の転送に API が付ける、その転送の応答のリクエスト ID（8.3）。想定外のエラーの `Ref` に使う。5.4） |
| `/forgot-password` | 2（パスワード再設定のメールを送る） | |
| `/reset-password` | 2（新しいパスワードを決める） | `?token=`（メールのリンク） |
| `/invite/$token` | 2（新規登録）、または 3 の ①（ログイン済み） | 出し分けは design-spec 6.16 |
| `/welcome` | 3 オンボーディング | `?step=invite|profile|done&token=&new=1`（`new=1` は招待から登録した直後の人。① を済みにして ② ③ を出す。付かなければ ① だけ（既存のアカウント）か、② ③（ワークスペースなしの招待）。6.16） |
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
| `/w/$workspaceId/ideas/$ideaId/research` | 14 調査ログ | `?supports=&source=&entry=<research_log_entry の id>&new=1&presetSupports=`（`new=1` で新しい調査ログの入力を開き、`presetSupports` の確認項目のタグを付けておく。`supports` は一覧の絞り込み） |
| `/w/$workspaceId/ideas/$ideaId/competitors` | 15 競合・代替 | `?view=cards|table&q=V.04.SURVIVOR_PATTERNS&row=<competitor の id>` |
| `/w/$workspaceId/ideas/$ideaId/assumptions` | 16 前提・リスク | `?tab=assumptions|risks&row=<assumption か risk の id>` |
| `/w/$workspaceId/ideas/$ideaId/costs` | 17 費用 | `?row=<cost_item の id か template_key>&tab=initial|monthly_fixed|variable` |
| `/w/$workspaceId/ideas/$ideaId/economics` | 18 損益・シナリオ | `?field=` |
| `/w/$workspaceId/ideas/$ideaId/decide` | 19 判定 | |
| `/w/$workspaceId/ideas/$ideaId/plans/$planId` | 20 プランホーム | `?version=<plan_version の id>`（版の読み取り専用表示） |
| `/w/$workspaceId/ideas/$ideaId/plans/$planId/items/$itemNo` | 21 プラン項目の編集 | `$itemNo` は 1〜30。`?q=&version=<plan_version の id>`（P4 の `versionId`。版の読み取り専用表示から項目を開くとき） |
| `/w/$workspaceId/ideas/$ideaId/plans/$planId/execution` | 22 実行管理 | `?tab=milestones|launch|kpis|questions|actions&item=&assignee=me|<user の id>&status=` |
| `/w/$workspaceId/ideas/$ideaId/plans/$planId/pitch` | 23 Pitch Deck | `?variant=one|five&version=` |
| `/w/$workspaceId/ai/export` | 24 AI 書き出し | `?source=self_analysis|validation|business_plan&id=&scope=&returnTo=` |
| `/w/$workspaceId/ai/import` | 25 AI 取り込み | `?target=self_analysis|validation|business_plan&id=&scope=&returnTo=` |
| `/admin/templates` | 26 管理: テンプレート一覧 | `?kind=` |
| `/admin/templates/versions/$versionId` | 27 管理: テンプレート編集 | `?node=<section か question の id>`、または設定のノード `ai-prompt`（自己分析のテンプレートだけ。ほかの版で指定されたら何も選ばない） / `cost-defaults` / `check-rules` / `execution-presets` |
| `/admin/users` | 28 管理: ユーザーとワークスペース | `?tab=users|workspaces|invitations` |

API のルートは5章。API が返す Web の静的なファイルのうち、画面でないもの: `/robots.txt`（`apps/web/public/`。`/`・`/privacy`・`/support` だけを許し、ほかはクロールさせない）、`/manifest.webmanifest`・`/sw.js`・`/icons/*`（ADR-031）。返し方とキャッシュの見出しは ADR-004。

## 5. API設計

### 5.1 共通の決まり

| 項目 | 決まり |
|---|---|
| 基準のパス | アプリの API は `/api/v1`、Better Auth は `/api/auth`、死活確認は `/api/health`、API の仕様書は `/api/docs`（staging だけ。文書の JSON は `/api/docs/json`。ADR-006） |
| 値の正 | API が検査する入力の値（必須・文字数・範囲・形式・ファイルの種類と大きさ）の正は design-spec 6.0.8「入力の規則」。この章の API の表と 6.3 の check 制約は値を書かずに 6.0.8 を参照する（check 制約が値を持つときは 6.0.8 と同じ値にする）。期限（招待・パスワード再設定のリンク・再認証）と、画面に出す件数の正も design-spec（6.16・各画面）。変えるときは design-spec を先に直す |
| 認証 | Better Auth のセッション（HttpOnly Cookie）。公開と書いたもの以外はログインが要る（未ログインは 401 `UNAUTHENTICATED`） |
| 形式 | JSON（UTF-8）。項目名は camelCase。ID は UUID の文字列。日付だけの値は `"2026-10-01"`、日時は UTC の ISO 8601 で、ミリ秒の3桁と `Z` を付ける（`"2026-10-01T02:00:00.000Z"`。表示はクライアントが利用者のタイムゾーンで行う） |
| 金額・率 | 金額は number（ワークスペースの通貨。自己分析は自己分析の通貨）。率は 0〜1 の小数（35% は `0.35`）。DB は numeric、API で number に変換する |
| 部分更新 | 1つの項目は `PATCH`（送った項目だけ変える）、キーで決まる項目（回答・数字）は `PUT .../{key}` で作るか更新する |
| 同時編集 | 項目を更新するリクエストは、読んだときの `lockVersion` を送る。違えば 409 `CONFLICT` と相手の内容を返す。「自分の内容で上書きする」は同じ内容に `force: true` を付けて送る（ADR-019）。まだ行が無い項目（未回答の設問など）の `lockVersion` は `0`。一覧に出る行（調査ログ・競合・費用行など）は作成時の `lockVersion` が 0、キーで決まる項目（回答・数字）は最初の保存で 1 になる。何も変えないリクエストは `lockVersion` を上げず、履歴も書かない。キーで決まる項目を同時に作られて負けたときは、`force: true` でも 409 `CONFLICT`（`current` を読んでからやり直す）。V4・V5 は根拠の付け外しのたびに、対象の項目の `lockVersion` を上げる |
| 一覧 | `?cursor=&limit=`（既定50、上限200）。応答は `{ items, nextCursor }`。`cursor` は並べ替えた結果へのオフセット（上限 1,000,000）で、読めない値は 422 `VALIDATION_FAILED`（`details[0].path` は `cursor`）。件数の少ない一覧（競合・費用行など）はページに分けず `{ items }` |
| 権限 | 下の表の記号。O = Owner、M = Member、V = Viewer（いずれもその資源が属するワークスペースのロール）、本人 = 自分のもの（自己分析は持ち主、アカウントと通知は自分）、書いた人 = そのコメントを書いた人、対象を読める人 = その項目を読めるロール（自己分析は本人と、共有先のワークスペースの O・M）、コメントできる人 = その対象に C1 の POST ができる人（7.1）、Admin = 運営者、ログイン = ログインしていれば誰でも、公開 = ログイン不要。足りなければ 403 `FORBIDDEN`、ワークスペースに所属していなければ 403 `NO_ACCESS`、無ければ 404 `NOT_FOUND`。権限の対応の全体は 7.1 |
| アーカイブ | アーカイブしたアイデア・プランの中身を変えるリクエスト（コメントを書く・元に戻すを含む）は、ロールにかかわらず 409 `ARCHIVED`（design-spec 6.8） |
| エラー | 8章の形式（`{ "error": { "code", "message", "requestId", ... } }`） |
| 論理削除したアイデア・プラン | 作成の取り消し（5.11）で論理削除したアイデア・プラン（`deleted_at` がある）は、どの API でも無いものとして扱う（読む・書く・一覧・計算のすべて。404 `NOT_FOUND`） |
| 計算 | 損益分岐・シナリオ・確認項目・F/A/U の内訳・工程は `packages/domain` の関数で計算して返す（保存しない）。クライアントは入力中は同じ関数で自分で計算し、保存の応答では計算結果を返さない（画面を開いたときと、保存の後に必要な画面だけ取り直す） |
| 変更履歴 | 変更履歴の対象（design-spec 6.0.5）を変える API は、すべて `change_history` に書く（ADR-020）。下の「履歴」列に書いた `source` を付ける |
| キャッシュ | 応答はすべて `Cache-Control: no-store`（ADR-011） |
| クライアントの種類 | Web は、保存のたびに `X-Moonx-Client` を付ける。そのときの画面の幅がトークンの `semantic.breakpoint.tablet` より狭ければ `web_mobile`、それ以外は `web`。API は変更履歴の `client` とログに記録する（PRD の K-08・K-16「スマホの幅の画面からの入力の割合」の集計に使う）。値が無い・知らない値なら `unknown` と記録し、拒否はしない。ネイティブの値（`ios`・`android`）は、ネイティブの feature で足す |

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
  newEntry?: boolean; presetSupports?: SupportsCheck[];   // 14 の新しい調査ログの入力を開き、裏付ける確認項目のタグを付けておく（Next steps の「Check permits」など）
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
interface TemplateSection {
  key: string; part: "a" | "b" | null; title: string;
  subtitle: string | null;        // 見出しの横の短い言い換え（自己分析の「Why do I want this?」など。design-spec 6.2・9.3）
  guidance: string | null; questions: TemplateQuestion[];
}
interface TemplateRef { versionId: UUID; versionNumber: number; newerVersion: { versionId: UUID; versionNumber: number } | null; }

// ---- 計算結果（packages/domain。design-spec 6.4 の計算仕様） ----
type MetricReason = "needs_price" | "needs_monthly_costs" | "needs_expected_sales" | "needs_startup_costs"
  | "margin_not_positive" | "target_margin_unreachable" | "not_recovered"
  | "empty" | "unknown";                       // unknown は、入力そのものを出す主要指標（selling_price・capacity_units_day・cost_row:*）の入力が Unknown のとき
interface MetricValue {
  value: number | null;                       // 丸める前の値。計算できなければ null
  bound: "exact" | "lower" | "upper" | "approximate";   // lower = 「+」、upper = 「≤」（費用に未入力・Unknown の行があるとき）、approximate = 「≈」（どちらにずれるか決まらないとき。design-spec 6.4 の損失の ROI）
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
  params: Record<string, number>;              // テンプレートの基準値。competitors は { min, max }（min はテンプレートの基準値。max は目安の上限で、テンプレートに持たず常に 5 を返す。design-spec 6.1）、local_price は { pricedCompetitors, researchLogs }、permits と demand_signal は { researchLogs }、costs と break_even は {}（例: 競合 { min: 3, max: 5 }）
  detail: { emptyRows?: number; missing?: ("price" | "monthly_costs" | "initial_amount" | "monthly_amount")[] } | null;
  link: LinkTarget | null;        // NextStep.link と同じく、呼んだ人が入れない行き先は null（design-spec 6.1）
}
interface NextStep {
  kind: "add_evidence" | "classify" | "start_customer_problem" | "check" | "start_section" | "check_unknowns" | "ready_to_decide";
  count: number | null; checkKey: CheckKey | null; sectionKey: string | null;   // count は、add_evidence・classify・check_unknowns では該当の件数、check では costs の未入力の行数（0 のときは null）と competitors の基準値 min、それ以外は null
  link: LinkTarget | null;        // 呼んだ人が入れない行き先（Viewer の 19、14 の新しい調査ログの入力）は null。クライアントはリンクにせず文として出す（design-spec 6.1）
}

// ---- 衝突（409 CONFLICT の error.current） ----
interface ConflictCurrent { value: unknown; lockVersion: number; updatedAt: DateTime; updatedBy: UserRef | null; }
```

### 5.3 エンドポイント一覧

| # | メソッド | パス | 権限 | 画面 |
|---|---|---|---|---|
| 認証（Better Auth。5.4） | | | | |
| A1 | POST | `/api/auth/sign-in/email` | 公開 | 2 |
| A2 | POST | `/api/auth/sign-in/social` | 公開 | 2 |
| A3 | GET | `/api/auth/callback/google` | 公開 | — |
| A4 | POST | `/api/auth/sign-out` | ログイン | 共通ナビ・4 |
| A5 | GET | `/api/auth/get-session` | ログイン | 共通 |
| A6 | POST | `/api/auth/request-password-reset` | 公開 | 2 |
| A7 | POST | `/api/auth/reset-password` | 公開（トークン） | 2 |
| A8 | POST | `/api/auth/change-password` | ログイン（パスワードがある人） | 4 |
| U8 | POST | `/api/v1/me/password` | ログイン（パスワードが無い人） | 4 |
| アカウントと招待（5.4） | | | | |
| U1 | GET | `/api/v1/me` | ログイン | 共通・4 |
| U2 | PATCH | `/api/v1/me` | ログイン | 3・4 |
| U3 | PUT / DELETE | `/api/v1/me/avatar` | ログイン | 3・4 |
| U9 | GET | `/api/avatars/{name}` | 公開（local だけ。staging・production は Cloud Storage の URL を直接開く） | 3・4 |
| U4 | GET | `/api/v1/invitations/by-token/{token}` | 公開 | 2・3 |
| U5 | POST | `/api/v1/invitations/by-token/{token}/sign-up` | 公開 | 2 |
| U6 | POST | `/api/v1/invitations/by-token/{token}/accept` | ログイン | 3 |
| U7 | POST | `/api/v1/me/delete` | ログイン（本人） | 4 |
| ワークスペース（5.5） | | | | |
| W0 | POST | `/api/v1/workspaces` | ログイン | M7 |
| W1 | GET / PATCH | `/api/v1/workspaces/{workspaceId}` | O,M,V / O | 9・M7 |
| W2 | GET | `/api/v1/workspaces/{workspaceId}/members` | O,M,V | 9・22 |
| W3 | PATCH / DELETE | `/api/v1/workspaces/{workspaceId}/members/{userId}` | O（DELETE は本人も。`userId` に `me`） | 4・9 |
| W4 | GET / POST | `/api/v1/workspaces/{workspaceId}/invitations` | O | 9 |
| W5 | POST | `/api/v1/invitations/{invitationId}/resend` | O・Admin | 9・28 |
| W7 | DELETE | `/api/v1/invitations/{invitationId}` | O・Admin | 9・28 |
| W8 | GET | `/api/v1/workspaces/{workspaceId}/mention-candidates` | O,M,V（自己分析の対象は O,M だけ） | PNL-1 |
| ダッシュボードとアイデア（5.6） | | | | |
| D1 | GET | `/api/v1/workspaces/{workspaceId}/dashboard/ideas` | O,M,V | 5 |
| D2 | GET | `/api/v1/workspaces/{workspaceId}/dashboard/self-analyses` | O,M | 5 |
| D3 | GET | `/api/v1/workspaces/{workspaceId}/dashboard/due-soon` | O,M,V | 5 |
| D4 | GET | `/api/v1/workspaces/{workspaceId}/dashboard/activity` | O,M,V | 5 |
| I1 | GET / POST | `/api/v1/workspaces/{workspaceId}/ideas` | O,M,V / O,M | 6・M1 |
| I2 | GET / PATCH | `/api/v1/ideas/{ideaId}` | O,M,V / O,M | 6・13 |
| I3 | POST | `/api/v1/ideas/{ideaId}/duplicate` | O,M | 6・13 |
| I4 | POST | `/api/v1/ideas/{ideaId}/archive`・`/restore` | O,M | 6・13 |
| 検証（5.7） | | | | |
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
| 自己分析（5.8） | | | | |
| S1 | GET / PATCH | `/api/v1/me/self-analysis` | 本人 | 10 |
| S2 | GET | `/api/v1/me/self-analysis/sections/{sectionKey}` | 本人 | 11 |
| S3 | PUT | `/api/v1/me/self-analysis/answers/{questionKey}` | 本人 | 11 |
| S4 | POST | `/api/v1/me/self-analysis/complete`・`/reopen` | 本人 | 10 |
| S5 | PUT | `/api/v1/me/self-analysis/shares` | 本人 | M6 |
| S6 | GET | `/api/v1/workspaces/{workspaceId}/self-analyses` | O,M | 12 |
| S7 | GET | `/api/v1/workspaces/{workspaceId}/self-analyses/{userId}` | O,M（共有済みのみ） | 12 |
| プラン（5.9） | | | | |
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
| AI 往復（5.10） | | | | |
| X1 | GET | `/api/v1/ai/export` | O,M（自己分析は本人） | 24 |
| X2 | GET | `/api/v1/ai/import/context` | O,M（自己分析は本人） | 24・25 |
| X3 | POST | `/api/v1/ai/import/apply` | O,M（自己分析は本人） | 25 |
| 決定ログ・コメント・履歴・通知（5.11） | | | | |
| L1 | GET | `/api/v1/workspaces/{workspaceId}/decision-log` | O,M,V | 7・13 |
| L2 | GET | `/api/v1/decision-log/{entryId}` | O,M,V | 7 |
| C1 | GET / POST | `/api/v1/comments` | 対象を読める人 | PNL-1 |
| C2 | PATCH / DELETE | `/api/v1/comments/{commentId}` | 書いた人 | PNL-1 |
| C3 | POST / DELETE | `/api/v1/comments/{commentId}/resolve` | コメントできる人（自己分析へのコメントは Viewer を除く） | PNL-1 |
| H1 | GET | `/api/v1/history` | 対象を読める人（自己分析は本人だけ） | PNL-2 |
| H2 | POST | `/api/v1/history/{entryId}/revert` | O,M（自己分析は本人） | PNL-2 |
| H3 | POST | `/api/v1/history/batches/{batchId}/revert` | O,M（自己分析は本人） | PNL-2・M8 |
| N1 | GET | `/api/v1/notifications` | ログイン | 8 |
| N2 | GET | `/api/v1/notifications/unread-count` | ログイン | 共通ナビ |
| N3 | POST | `/api/v1/notifications/{id}/read`・`/api/v1/notifications/read-all` | ログイン | 8 |
| テンプレートの移行（5.12） | | | | |
| T1 | GET | `/api/v1/template-migrations/preview` | O,M（自己分析は本人） | M8 |
| T2 | POST | `/api/v1/template-migrations` | O,M（自己分析は本人） | M8 |
| 運営者（5.13） | | | | |
| AD1 | GET | `/api/v1/admin/templates` | Admin | 26 |
| AD2 | POST | `/api/v1/admin/template-versions/{versionId}/draft` | Admin | 26 |
| AD3 | GET / PATCH | `/api/v1/admin/template-versions/{versionId}` | Admin | 27 |
| AD4 | POST / PATCH / DELETE | `/api/v1/admin/template-versions/{versionId}/sections`、`/api/v1/admin/template-sections/{id}`、`/api/v1/admin/template-sections/{id}/questions`、`/api/v1/admin/template-questions/{id}` | Admin | 27 |
| AD5 | PUT | `/api/v1/admin/template-versions/{versionId}/order`・`/cost-defaults`・`/check-rules`・`/execution-presets` | Admin | 27 |
| AD6 | POST | `/api/v1/admin/template-versions/{versionId}/validate`・`/publish` | Admin | 27 |
| AD7 | GET | `/api/v1/admin/users`・`/api/v1/admin/workspaces`・`/api/v1/admin/invitations` | Admin | 28 |
| AD8 | POST | `/api/v1/admin/users/{userId}/suspend`・`/reactivate` | Admin | 28 |
| AD9 | POST | `/api/v1/admin/invitations` | Admin | 28 |
| AD10 | POST | `/api/v1/admin/templates/import` | Admin | 26 |
| 内部 | | | | |
| Z1 | GET | `/api/health` | 公開（DB に触れない） | 監視 |
| Z2 | GET | `/api/health/db` | 公開（IP ごとの回数制限。7.2） | デプロイ後の確認 |
| Z3 | GET | `/api/docs`・`/api/docs/*`（文書の JSON `/api/docs/json` と、画面のファイル） | 公開（staging だけ。production は出さない。ADR-006） | 開発 |

### 5.4 認証・アカウント・招待

**Better Auth のエンドポイント（A1〜A8）**: 本体と応答の形は Better Auth が決める（版で名前が変わることがあるので、実装時は使う版のドキュメントに合わせる）。moonx の設定は次のとおり。

| 項目 | 設定 |
|---|---|
| メール＋パスワード | 有効。`disableSignUp: true`（新規登録は U5 だけ）。パスワードの規則は design-spec 6.0.8。Better Auth は長さを UTF-16 の単位で数え、6.0.8 は文字で数えるので、Better Auth の `minPasswordLength` は 8、`maxPasswordLength` は 256（128文字の倍）にして規則に合うパスワードを拒まない幅にし、新しいパスワード（A7・A8 の `newPassword`）は `hooks.before` で 6.0.8 の規則（`packages/schemas` の `passwordSchema`）で確かめる（合わなければ 422 `VALIDATION_FAILED`。Better Auth の形）。パスワード再設定のリンクの期限は design-spec 6.16。リンクは `BETTER_AUTH_URL` の `/reset-password?token=…`（4章）で、メールの文面は design-spec 6.16。メールが送れなくても A6 の応答は変えず（登録の有無を明かさないため。送るのは登録のあるメールだけなので、応答を変えると分かってしまう）、API のログに `error` で書く。同じ理由で、A6 は登録の有無にかかわらず、受け取ってから2秒たってから答える（送信を待つ時間で登録の有無が分からないように）。送信はその2秒の中で終える（Cloud Run は応答の後に CPU を割り当てないので、応答の後に続けた送信は止まりうる。ADR-007）。2秒で終わらなければ送信をやめ、送れなかったときと同じく API のログに `error` で書く（Resend が受け取っていれば届く）。Google だけで登録した人も、A6・A7 でパスワードを作れる（メールを受け取れることで本人を確かめる。U8 の再認証の時間は、ログイン中の端末から作るときの決まり）。再設定すると他のセッションを消し、`hooks.after`（`/reset-password`）でそのユーザーの新しいセッションを作って Cookie を返す（ログインした状態で 5 へ。design-spec 6.16） |
| Google | 有効。`disableImplicitSignUp: true`。新規登録は招待の画面（`/invite/$token`）からだけ `requestSignUp: true` と `additionalData: { invitationToken: <その画面のトークン> }` で始め、`callbackURL` を `/welcome?step=invite&token=…&new=1`、`errorCallbackURL` を `/login?error=…` にする。2 からのログインは、`callbackURL` を `next` の値（無ければ最後に開いたワークスペースの 5）にする。`errorCallbackURL` を持たない失敗（OAuth の state が期限切れ・偽物）も `onAPIError.errorURL` で `/login?error=…` へ送る（Better Auth のエラーのページを使わない）。Google のトークン（アクセス・リフレッシュ・ID）は持たない（ログインにしか使わないため。`accounts` の該当の列は空にし、ログインのたびに書き直す設定（`updateAccountOnSignIn`）も止める） |
| 新規登録の制限 | Google の新規登録だけで動く（U5 はアダプターを通さず、自分で招待を確かめる。ADR-010）。`databaseHooks.user.create.before`: 始めた画面の招待（`additionalData.invitationToken` のトークンの招待。クライアントが送る値なので、招待を引く鍵にだけ使う）が有効（`pending` かつ期限内）で、そのメールが Google のメールと同じ（大文字小文字を区別しない）でなければ、またメールが確認済みでなければ（Google が `email_verified` を返さない）`INVITATION_REQUIRED` で拒否する（design-spec 6.16 の「招待のメールと同じメールの Google アカウントだけ」）。招待は、Google のプロフィールを受け取ったとき（Google の設定の `mapProfileToUser`。ユーザーを作るトランザクションの前）に引いて確かめ、`databaseHooks.user.create.before` はその結果で拒否する。このフックは Better Auth がユーザーを作るトランザクションの中で動くので、そこで DB を読むと、そのトランザクションの接続とは別の接続が要り、同時の登録がプールの接続（5本。7.3）を使い切って止まる。トークンを持たないので、ID トークンでの新規登録（A2 の `idToken`）はできない。表示名は Google の名前の前後の空白を除いて60文字（design-spec 6.0.8）までに、文字の切れ目で切る。名前が無ければメールの `@` の前を使う（3 の ② で本人が直せる）。Google の写真は使わない（写真は U3 で上げたものだけ。ADR-024） |
| 登録の後 | Google の新規登録だけで動く（U5 は同じ処理を自前のトランザクションで行う）。`databaseHooks.user.create.after`: 個人用ワークスペース（名前と通貨は design-spec 5章「登録時」。本人が Owner）を作り、`last_workspace_id` に入れる。そのメールあてのワークスペースなしの招待があれば、その招待を受諾済みにし（3 の ① を飛ばすため、U6 は呼ばれない）、`grants_admin` が true のときだけ運営者にする。この処理は1つのトランザクションで行う。このフックは `users` の行を書いたトランザクションのコミットの後に動くので、失敗したとき（途中でインスタンスが止まったときも）は、ワークスペースの無い `users` の行が残る（Google の転送は `/login?error=unable_to_create_user`）。そのため、セッションを作る前（下の「ログインの制限」のフック）にも、個人用ワークスペースが無ければ同じ処理を行い、次のログインで整える（ユーザーの行をロックして確かめるので、同時のログインでも1つしか作らない） |
| ログインの制限 | `databaseHooks.session.create.before`: `users.status` が `active` 以外（停止・削除）なら `ACCOUNT_SUSPENDED` で拒否する。続けて、上の「登録の後」の処理を、個人用ワークスペースが無いときだけ行う。A7 も、`hooks.before` でリンクのトークンのユーザーを引き、`active` 以外なら、パスワードを変えずに（トークンも使わずに）`ACCOUNT_SUSPENDED` で拒否する（停止の間にパスワードが変わらないように。再開で元どおりになる。design-spec 6.17「停止の効果」）。A6 は応答を変えられないので、停止したユーザーにもメールを送る |
| セッション | 有効期限30日、毎日更新。Cookie は `__Secure-` 接頭辞・HttpOnly・Secure・SameSite=Lax（local は Secure なし。staging・production は `useSecureCookies` で必ず Secure にする）。Cookie の名前の接頭辞は `moonx`（`moonx.session_token`。localhost の Cookie はポートをまたいで共有されるので、Better Auth の既定の名前のままだと、同じ手元で動くほかのアプリの Cookie とぶつかる）。`change-password` はクライアントの指定にかかわらず他のセッションを消す（`revokeOtherSessions`）。`/api/auth/*` は A1〜A8 と、断るだけの `sign-up/email` だけを開け、Better Auth のほかのパス（`update-user`・`delete-user`・`change-email`・`verify-password`・`unlink-account`・`list-sessions` など）は閉じて 404 `NOT_FOUND`（Better Auth の形）を返す（プロフィールと削除は U2・U3・U7 だけから行う。`verify-password` はパスワードを試す入口になる）。サーバーの中から呼ぶ `auth.api` は閉じない（ただし A6・A7 は、2秒の応答と再設定の後のログインに `/api/auth/*` のリクエストが要るので、`/api/auth/*` からだけ動き、`auth.api` からは拒否する） |
| 回数制限 | 有効。保存先は DB（`rate_limits`）。秘密を受け取るパス（`sign-in/email`・`sign-in/social`・`sign-up/email`・`request-password-reset`・`reset-password`・`change-password`）と U5 は、パスをまたいで IP ごとに1つの枠で1分10回。入口のプラグイン（ADR-029）が数え、Better Auth 側ではこれらのパスの `customRules` を `false` にしてパスごとの数え方を止める。それ以外のパス（`get-session` など）は Better Auth が IP とパスごとに1分100回（本体の設定の `window`・`max`。1.7 の既定は10秒100回なので、設定で変える）。Better Auth の回数の保存先は、Better Auth の DB の保存先（`storage: "database"`）ではなく、入口のプラグインと同じ数え方で `rate_limits` に書く `customStorage` にする。Better Auth の DB の保存先は、自分の最も長い時間の幅（60秒）を過ぎた行を、接頭辞を問わず消すので、`app:` の1時間の枠（7.2）を数え直させてしまう。Better Auth の 429 は `code` を持たないので、`{ code: "RATE_LIMITED", message }` に直して返す（`X-Retry-After` はそのまま） |
| 信頼するオリジン | `TRUSTED_ORIGINS`（2章） |
| IP の取得 | 入口のプラグインが決めた値だけを読ませる（7.2「呼び出し元の IP」。Better Auth の IP のヘッダーの設定は、入口のプラグインが付け直す `X-Moonx-Client-Ip` だけにする） |

エラーの対応（文言は design-spec 6.16「状態とエラー」）:

| Better Auth の応答 | design-spec 6.16 の状態 |
|---|---|
| メールかパスワードが違う | 2 の認証の失敗。M9 では M9 の「Password is incorrect」 |
| 回数の上限（429） | 2 と M9 の回数の上限（design-spec 6.0.6。M9 は開いたまま、値を持ち続ける） |
| `ACCOUNT_SUSPENDED` | 2 の停止されたユーザー。M9 で返ったときも、保存できていない値とキャッシュを捨てて 2 へ移り、同じ文言を出す |
| `INVITATION_REQUIRED`（Google の新規登録） | 2 の招待リンクが無効・期限切れ |
| `signup_disabled`（Google の転送の `error`。アカウントの無い Google でログインした・新規登録で `requestSignUp` が無い） | 2 の招待なしに Google で新規登録しようとした（招待リンクが無効・期限切れと同じ文言） |
| `INVALID_TOKEN`（A7） | 2 の再設定のリンクが期限切れ・使用済み・無効 |
| Google の転送のほかの `error`（`unable_to_create_user`・`state_mismatch` など） | design-spec 6.0.6 の想定外のエラー。`Ref` は転送の URL の `requestId`（4章 `/login`）の先頭8文字。API は Better Auth の転送のうち `error` を持つものに、その応答のリクエスト ID を `requestId` として付ける |

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

**U2 `PATCH /api/v1/me`** 本体 `{ displayName?: string (design-spec 6.0.8); timezone?: string; theme?: "system" | "light" | "dark"; lastWorkspaceId?: UUID }` → `200 Me`。`lastWorkspaceId` は所属するワークスペースだけ（違えば 422 `VALIDATION_FAILED`）。

**U3 `PUT /api/v1/me/avatar`** 本体は `multipart/form-data` の `file`（受け付ける形式と大きさは design-spec 6.0.8）→ `200 { avatarUrl: string }`。512×512 の WebP に縮めて保存する（ADR-024）。ファイルの中身が受け付ける形式の画像でなければ `422 VALIDATION_FAILED`（`details` の `path` は `file`）、大きさの上限を超えれば `413 PAYLOAD_TOO_LARGE`。古い写真のファイルは新しい写真を保存してから消す。`DELETE` → `204`。

**U9 `GET /api/avatars/{name}`**（公開。local だけ）: 保存したファイルを返す。名前は32桁の16進＋`.webp`（それ以外は `404 NOT_FOUND`）。staging・production には無く、写真は Cloud Storage の URL を直接開く（ADR-024）。

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

**U5**（公開）`POST /api/v1/invitations/by-token/{token}/sign-up`。本体 `{ displayName: string; password: string; timezone: string }` → `201 { me: Me }` と、ログインした状態のセッション Cookie。メールは招待のメールに固定し、1つのトランザクションで `users`・`accounts`（credential）・個人用ワークスペースを作ってから Better Auth の `signInEmail` でセッションを作る。`users.email_verified` は true にする（招待のメールのリンクから登録したので、メールは確かめてある。Better Auth は、メールが確認済みのアカウントにだけ、同じメールの Google のログインを連携させる）。ワークスペースのある招待はまだ受諾しない（3 の ① で U6）。ワークスペースなしの招待は、登録の時点で受諾済みにする。`grants_admin` が true なら運営者にもする（上の「登録の後」）。エラー: `410 INVITATION_INVALID`、`409 EMAIL_TAKEN`（「ログインしてから招待を開く」へ案内）、`422 VALIDATION_FAILED`。

**U6** `POST /api/v1/invitations/by-token/{token}/accept`。本体なし → `200 { workspaceId: UUID | null; alreadyMember: boolean }`。所属を作り（すでにメンバーならロールを変えない）、招待を `accepted` にする。ワークスペースなしの招待は、`grants_admin` が true のときだけ受諾した人を運営者にする。エラー: `410 INVITATION_INVALID`、`409 INVITATION_ALREADY_ACCEPTED`、`403 INVITATION_EMAIL_MISMATCH`（`error.invitedEmail` を付ける。「This invitation was sent to {email}. Log in with that email.」）。

**U8 `POST /api/v1/me/password`**（Set password。design-spec 6.16）本体 `{ newPassword: string }` → `204`。Google だけで登録した人（`hasPassword: false`）がパスワードを足す。パスワードがある人は `409 PASSWORD_ALREADY_SET`（A8 で変える）。新しいパスワードの規則は design-spec 6.0.8。セッションが design-spec 6.16 の再認証の時間の中で作られたものでなければ `403 REAUTH_REQUIRED`。サーバーから Better Auth の `setPassword` を呼び、この要求のセッション以外を消す。

**U7 `POST /api/v1/me/delete`**（アカウントの削除。design-spec 6.16）本体 `{ confirmEmail: string; password?: string }` → `204`（セッションの Cookie を消す）。
- `confirmEmail` が自分のメールと違えば `422 CONFIRMATION_MISMATCH`。パスワードがある人は `password` が必須で、違えば `403 INVALID_PASSWORD`（ユーザーごとに10分5回まで。超えたら `429 RATE_LIMITED`）。パスワードが無い人（Google だけ）は、セッションが design-spec 6.16 の再認証の時間の中で作られたものでなければ `403 REAUTH_REQUIRED`。
- ほかにメンバーのいるワークスペースで最後の Owner なら `409 LAST_OWNER`（`error.workspaces: { id; name }[]`）。
- 何を消し何を残すかは design-spec 6.16 の表のとおり。1つのトランザクションで行い、この文書に固有の扱いは次のとおり: `users` の行は残して列を置き換える（`email` を `deleted+{id}@deleted.invalid`、`display_name` を `Deleted user`、`avatar_url` を null、`status` を `deleted`）。`sessions`・`accounts`・パスワード再設定のトークン（`verifications`）は行を消す。所属を外す処理は W3 DELETE と同じ。トランザクションをコミットしてから、保存した写真を消す（Cloud Storage または local のディスク）。
- Better Auth の `deleteUser`（行ごと消す）は使わない（チームの記録が `users` を参照しているため）。

### 5.5 ワークスペース・メンバー・招待

```ts
interface Workspace { id: UUID; name: string; currency: string; isPersonal: boolean; myRole: Role; memberCount: number; }
interface Member { user: UserRef; email: string | null /* Owner にだけ返す */; role: Role; joinedAt: DateTime; isPersonalOwner: boolean /* 個人用ワークスペースの持ち主。ほかの Owner は降格も削除もできない（W3） */ }
interface Invitation {
  id: UUID; email: string; role: Role | null;
  workspace: { id: UUID; name: string } | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedBy: UserRef | null; createdAt: DateTime; expiresAt: DateTime; acceptedAt: DateTime | null;
}
```

| API | 本体 | 応答 | エラーと副作用 |
|---|---|---|---|
| W0 | `{ name: string (design-spec 6.0.8); currency?: string (ISO 4217。既定 PHP) }` | `201 Workspace` | 作った人を Owner にし、`last_workspace_id` を新しいワークスペースにする（`is_personal = false`） |
| W1 GET | — | `200 Workspace` | |
| W1 PATCH | `{ name?: string (design-spec 6.0.8); currency?: string (ISO 4217) }` | `200 Workspace` | 通貨を変えても金額は換算しない |
| W2 GET | — | `200 { items: Member[] }` | |
| W3 PATCH | `{ role: Role }` | `200 Member` | `409 LAST_OWNER`（最後の Owner を降格できない）、`409 PERSONAL_OWNER`（個人用ワークスペースの持ち主は、ほかの Owner も降格できない。持ち主は `is_personal` のワークスペースの `created_by_id`）。Viewer に降格したら design-spec 6.16 の表のとおり処理する（自己分析の共有を解除、担当を名前に置き換え。担当の置き換えは実行管理の項目の変更履歴 `manual` に残す）。`userId` は UUID だけを受け付ける。対象がメンバーでなければ `404 NOT_FOUND`、ロールが同じなら何も変えず 200 |
| W3 DELETE | — | `204` | `409 LAST_OWNER`、`409 CANNOT_LEAVE_PERSONAL`（本人が個人用ワークスペースから Leave する）、`409 PERSONAL_OWNER`（ほかの Owner が個人用ワークスペースの持ち主を外す）。外れたときの処理は design-spec 6.16 の表（担当の置き換えは W3 PATCH と同じ。`last_workspace_id` が外れたワークスペースなら個人用ワークスペースに戻す） |
| W4 GET | `?status=pending|all` | `200 { items: Invitation[] }` | `status` の既定は `pending`: 受諾できるものだけ（期限切れは含まない）。`all` は受諾・取り消し・期限切れも返す。期限を過ぎた `pending` は `status: "expired"` として返す |
| W4 POST | `{ email: string; role: Role }`（メールの形式は design-spec 6.0.8） | `201 { invitation: Invitation }` | 招待のメールを送る。招待のリンクは応答に含めない（招待した人が相手のメールで先にアカウントを作れてしまうため。リンクは招待されたメールにだけ届く。local は API のログ）。`409 ALREADY_MEMBER`、`409 INVITATION_PENDING`（同じメールの有効な招待がある。`error.invitationId` に付ける id の招待を W5 で再送する）。メールの送信は招待を作るトランザクションの中で行い、Resend に届かなければ招待も作らず `503 UPSTREAM_UNAVAILABLE` を返す（利用者は再試行する）。同じワークスペースへの招待は、ワークスペースの id で取る advisory lock（`pg_advisory_xact_lock`。トランザクションの終わりで外れる）で直列にする。トランザクションが Resend の応答を待つので、ワークスペースの行を `FOR UPDATE` で押さえると、そのあいだ中身の書き込みがすべて止まる。W5・AD9 と合わせて1時間20回まで（7.2。超えたら `429 RATE_LIMITED`） |
| W5 | — | `200 { invitation: Invitation }` | トークンを作り直してメールを再送する（前のリンクは無効。リンクは応答に含めない）。期限は再送した時点から数え直す（期限の長さは design-spec 6.16）。期限切れの招待も再送できる。受諾済みは `409 INVITATION_ALREADY_ACCEPTED`、取り消し済みは `410 INVITATION_INVALID`（W7 も同じ）。招待のワークスペースに所属しない人は `403 NO_ACCESS`、所属していても Owner でなければ `403 FORBIDDEN`（Admin は除く） |
| W7 | — | `204` | `revoked` にする |
| W8 | `?targetType=&targetId=` | `200 { items: UserRef[] }` | 自己分析への対象は、そのワークスペースの Owner / Member だけが呼べる（Viewer は `403 FORBIDDEN`。自己分析へのコメントを書けないため。design-spec 6.0.4）。候補も、その自己分析を読める Owner / Member だけ。その自己分析がこのワークスペースに共有されていなければ `403 NOT_SHARED`、設問が無ければ `404 NOT_FOUND` |

招待のリンクは `https://{DOMAIN}/invite/{token}`。トークンは32バイトの乱数で、DB には SHA-256 のハッシュだけを持つ。リンクを API の応答で返すのは、運営者の AD9 と `make admin-create` だけ（運営者はサービスの管理者で、信頼する前提。2026-10-03 のユーザーの決定。7.1）。W4・W5・招待の一覧（W4 GET・AD7）はリンクもトークンも返さない。リンクのコピー用の API（旧 W6）は無い。

### 5.6 ダッシュボードとアイデア

```ts
interface IdeaSummary {
  id: UUID; name: string; oneLineConcept: string;
  proposer: UserRef; stage: Stage; latestDecision: DecisionValue | null; archived: boolean;
  checks: { key: CheckKey; state: CheckState; params: Record<string, number> }[];   // 6つ。合計や点数は返さない。params は CheckResult（5.2）と同じ基準値（一覧が競合の範囲「Competitors (3–5)」を出すため）
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
| D3 | — | `200 { items: DueItem[] }` | 対象の期間は design-spec 6.9（Due soon）。期限（`due_date`）のある実行管理の項目（milestone・launch・open_question・next_action。kpi は期限を持たない）から、Done / Resolved のもの、アーカイブ・論理削除したものを除く。自分の担当を先、次に期限順。「今日」は利用者の `users.timezone` の日付で、`overdue` と期間もそれで決める |
| D4 | — | `200 { items: Activity[] }` | 件数は design-spec 6.9。自己分析に関わる動きは除く。変更・コメント・決定ログを合わせて新しい順に並べる。`batch_id` のある変更は1回の操作を1件にまとめる（複製は新しいアイデアの行で示す）。同じ人が同じ項目を続けて変えたものは、design-spec 6.9 の時間の幅の中なら1件にまとめ、最後の時刻で出す（自動保存のたびに履歴が1行増えるため。履歴の行そのものは1件ずつ残る）。削除した行へのコメントは除く |
| I1 GET | `?stage=&decision=not_dropped|all|undecided|proceed|hold|drop&proposerId=&includeArchived=true&sort=updated|created|name&q=&cursor=&limit=` | `200 Page<IdeaSummary> & { hiddenDroppedCount: number }` | `decision` の既定は `not_dropped`。`q` は名前と一行コンセプトの部分一致（大文字小文字を区別しない）。`hiddenDroppedCount` は `decision=not_dropped` のときだけ数え、他は 0 |
| I1 POST | `{ name: string; oneLineConcept: string; proposedSolution?: string }`（値は design-spec 6.0.8） | `201 IdeaDetail` | 最新の公開済みの検証のテンプレートの版で検証を作り、費用の初期行を Empty で作る（履歴なし: 作成の記録だけ）。公開済みの版が無ければ `409 TEMPLATE_NOT_PUBLISHED`（運営者がまだテンプレートを取り込んでいない。AD10）。`proposedSolution` は空白だけなら null |
| I2 GET | — | `200 IdeaDetail` | |
| I2 PATCH | `{ name?; oneLineConcept?; proposedSolution?; lockVersion: number; force?: boolean }` | `200 IdeaDetail` | 履歴 `manual`（対象 `idea`） |
| I3 | `{ name?: string }`（既定「{元の名前} (copy)」） | `201 IdeaDetail & { batchId: UUID }`（トーストの「Undo」が H3 に渡す） | design-spec 6.8 の複製。履歴 `duplicate`: 新しいアイデアの作成と、コピーした記録対象の項目（回答・数字・調査ログ・競合・前提・リスク・費用行）それぞれの作成を、同じ `batchId` で1行ずつ残す（履歴で1回の操作としてまとめて見せるため。H3 で作成ごと取り消せる。条件と扱いは H3）。既定の名前は名前の上限（design-spec 6.0.8）に収める |
| I4 | — | `200 IdeaDetail` | すでにその状態なら何もせず 200。履歴は書かず、`updatedAt` と `updatedBy` も変えない（`lastActivityAt` だけ更新する） |

### 5.7 検証

```ts
interface ValidationHome {
  validationId: UUID; idea: IdeaDetail; template: TemplateRef;
  summary: { customer: string | null; problem: string | null; solution: string | null; marketType: string | null };
  keyMetrics: Pick<KeyMetrics, "initial_cost_total" | "break_even_units_day" | "expected_operating_profit" | "payback_months">;
  economicsWarnings: EconomicsResult["warnings"];
  nextSteps: NextStep[];                     // 件数は design-spec 6.1
  checks: CheckResult[];                     // 6つ
  fau: FauBreakdown;
  sections: {
    key: "01" | "02" | "03" | "04" | "05" | "06-08" | "09" | "10";
    title: string;
    answered: number | null; total: number | null;   // 03 / 04 / 09 は null（件数だけ）
    count: number | null;                             // 03 / 04 / 09 の件数（09 は前提とリスクの2つ: countB）
    countB?: number | null;
    fau: FauBreakdown | null;                        // 13 の画面では使わない（design-spec 6.1。2026-10-12）
  }[];
  decisions: DecisionLogSummary[];           // 新しい順。件数は design-spec 6.1
  plans: PlanSummary[];                      // アーカイブした案を除く
  archivedPlanCount: number;                 // アーカイブした案の数（13 の「n archived plans · Show」。Show で P1 GET `?includeArchived=true` を呼ぶ）
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
| V1 | — | `200 ValidationHome` | 確認項目・Next steps・F/A/U・主要指標は `packages/domain` で計算する。`sections[].title` は番号を含む名前。出どころの決まりは design-spec 6.1（設問のセクションはテンプレートの版の題、画面のセクションはカタログ `validation:sections.<key>` の固定のラベル） |
| V2 | — | `200 { section: TemplateSection; answers: ValidationAnswer[] }` | `sectionKey` は `01` / `02` / `10`（`04` のパターンと `08` は V8・V15 が返す。それ以外の値は `404 NOT_FOUND`）。設問ごとに必ず1件返す（未回答は `text: null`, `lockVersion: 0`。出し分けで隠れる設問も `hidden: true` で返す） |
| V3 | `{ text?: string | null; classification?: ClassificationInput; lockVersion: number; force?: boolean }` | `200 ValidationAnswer` | `422 FACT_REQUIRES_EVIDENCE`（有効な根拠が無いのに `fact`。Fact は V4 の `setFact` で付ける）、`422 CONFIDENCE_REQUIRED`、`422 INVALID_CHOICE`（選択の設問）、`422 QUESTION_NOT_FOUND`（テンプレートの版に無い設問 ID。`V.04.SURVIVOR_PATTERNS`・`V.04.FAILURE_PATTERNS`・`V.08.WORTH` も V3 で答える）。`text` の長さは design-spec 6.0.8（超えたら `422 VALIDATION_FAILED`）。`text` を null か空白にすると F/A/U も外す（`unknown` を除く）。答えの行を作るときの `lockVersion` は 0 で、作られた行は 1 から始まる。履歴 `manual` |
| V4 | `{ target: TargetRef; researchLogEntryId?: UUID; newResearchLog?: ResearchLogInput; url?: string; note?: string; setFact?: boolean; lockVersion: number; force?: boolean }` | `201 { evidence: Evidence; classification: Classification; lockVersion: number }` | `researchLogEntryId` / `newResearchLog` / `url` のどれか1つ。`setFact: true` なら対象を Fact にする（M2 で根拠を付けて閉じたとき）。対象は `validation_answer` / `economics_input` / `cost_item` / `competitor` / `assumption`（`lockVersion` は対象の項目の版）。同じ調査ログを同じ対象に2回付けると `422 VALIDATION_FAILED`。値の無い対象や F/A/U を持たない対象（競合・前提）への `setFact` も `422 VALIDATION_FAILED`（`details[0].path` は `setFact`）。`url` と `note` の値は design-spec 6.0.8。対象の版が食い違えば `409 CONFLICT`、`force: true` で上書きする（ADR-019）。履歴は対象の項目に1行（`newResearchLog` のときは調査ログの作成も1行）。`manual` |
| V5 | `?lockVersion=` | `200 { classification: Classification; lockVersion: number }` | Fact の最後の根拠を外すと未分類に戻す（クライアントは事前に確認を出す）。`?force=true` で版の食い違いを上書きする。履歴は対象の項目に1行（`manual`） |
| V6 GET | `?supports=&sourceType=&q=&cursor=&limit=` | `200 Page<ResearchLogEntry>` | `observedOn` の新しい順（日付なしは末尾）、同じなら作成の新しい順。`q` は topic と observation の部分一致 |
| V6 POST | `ResearchLogInput`（値は design-spec 6.0.8） | `201 ResearchLogEntry` | 履歴 `manual` |
| V7 GET | — | `200 ResearchLogEntry & { usages: EvidenceUsage[] }` | |
| V7 PATCH | `Partial<ResearchLogInput> & { lockVersion; force? }` | `200 ResearchLogEntry` | 履歴 `manual` |
| V7 DELETE | — | `200 { affected: EvidenceUsage[] }` | 論理削除。`affected` はその調査ログを根拠にしているすべての項目（`isOnlyEvidenceOfFact` でそれが唯一の根拠かを示す）。根拠の紐づけは残し、数えなくなる。その根拠しかなかった Fact は「Fact（根拠なし）」になる（design-spec 6.0.3）。クライアントは事前に V7 GET の `usages` で確認を出す。履歴 `manual`（`delete`） |
| V8 GET | — | `200 { items: Competitor[]; patterns: { question: TemplateQuestion; answer: ValidationAnswer }[]; guidance: { min: number; max: number } }` | `patterns` は `V.04.SURVIVOR_PATTERNS` と `V.04.FAILURE_PATTERNS` の設問（問い・EXAMPLE・ヒント。15 に出す。design-spec 6.10）と回答（更新は V3）。`items` は `sortOrder` の順 |
| V8 POST | `{ name: string; type?; targetCustomer?; offering?; typicalPrice?: number; priceNote?; strength?; weakness?; whyChosen?; whySurvive? }`（値は design-spec 6.0.8） | `201 Competitor` | 新しい行は末尾に付く。履歴 `manual` |
| V9 PATCH | 上の項目の一部 ＋ `{ lockVersion; force? }`（値は design-spec 6.0.8） | `200 Competitor` | 履歴 `manual` |
| V9 DELETE | — | `204` | 論理削除（行へのコメントも隠れる）。履歴 `manual`（`delete`） |
| V10 GET | — | `200 { items: Assumption[] }` / `200 { items: Risk[] }` | Risks は並び順を適用済み: 手の並び（`sort_order`）のある行が先で、無い行は Impact → Probability の高い順（同順位は作成順）。手の並びのある一覧に足したリスクは末尾に付く |
| V10 POST | 前提: `{ statement; whyBelieve?; evidenceNote?; confidence?; disproveCondition?; nextCheck? }`。リスク: `{ statement; probability?; impact?; whyMatters?; mitigation?; howToValidate? }` | `201 Assumption` / `201 Risk` | 新しい行は末尾に付く（リスクは手の並びのときだけ末尾に付き、そうでなければ `sortOrder` は null）。必須の `statement` が空白だけなら `422 VALIDATION_FAILED`。任意の文章の項目は、空白だけなら null で保存する（V11 も同じ）。値は design-spec 6.0.8。履歴 `manual` |
| V11 | PATCH: 上の項目の一部 ＋ `{ lockVersion; force? }`。DELETE: なし | `200` / `204` | 履歴 `manual` |
| V12 | — | `200 { items: CostItem[]; result: EconomicsResult; economicsInputs: EconomicsInput[] }` | `result` は Totals と 18 の損益分岐の表示用。`economicsInputs` はクライアントがその場で計算し直すために返す |
| V13 | `{ category: CostCategory; name: string (空も可。上限は design-spec 6.0.8) }` | `201 CostItem` | 表の末尾に Empty の行を作る（名前は空でよい。「+ Add row」は空の名前で呼ぶ）。履歴 `manual` |
| V14 PATCH | `{ name? (空も可); inputMode?; amount?: number | null; percent?: number | null (0〜1 の小数。5.1); isLumpSum?; whyNeeded?; canReduce?; notes?; classification?; lockVersion; force? }`（値の範囲は design-spec 6.0.8） | `200 CostItem` | `422 PERCENT_ONLY_FOR_VARIABLE`、`422 OUT_OF_RANGE`、F/A/U の決まりは V3 と同じ。`unknown` にすると金額と % を null にする（Unknown の数字に値を入れると未分類になる）。使わない入力方式の値を送ると `422 VALIDATION_FAILED`、`inputMode` を切り替えると使わなくなった側の値を null にする。履歴 `manual` |
| V14 DELETE | — | `204` | 論理削除。履歴 `manual`（`delete`） |
| V15 | — | `200 { inputs: EconomicsInput[]; worth: ValidationAnswer; result: EconomicsResult; costItems: CostItem[] }` | `inputs` は7つすべて（未入力は `value: null`）。`worth` は `V.08.WORTH`（更新は V3） |
| V16 | `{ value: number | null; classification?: ClassificationInput; lockVersion; force? }` | `200 EconomicsInput` | 範囲は design-spec 6.0.8。外れたら `422 OUT_OF_RANGE`。値も F/A/U も変わらないリクエストは行を作らず、履歴も書かない。履歴 `manual` |
| V17 | `{ ids: UUID[]; category?: CostCategory }`（費用行は表ごと） | `204` | `ids` はその一覧の（論理削除を除く）全件と一致すること（違えば `422 VALIDATION_FAILED`）。`sort_order` を振り直す（リスクは手の並びに切り替わる）。履歴は残さず、`lockVersion` と `updated_at` も変えない（並べ替えは対象外で、開いている編集と衝突させない） |
| V18 | — | `200 DecisionContext` | |
| V19 | `{ value: DecisionValue; reason: string; basedOnDecisionId: UUID | null; confirmNewer?: boolean }`（`reason` の長さは design-spec 6.0.8） | `201 { entry: DecisionLogEntry; latestDecision: DecisionValue; canCreatePlan: boolean }` | 画面を開いた後に別の判定が記録されていて `confirmNewer` が無ければ `409 DECISION_CHANGED`（`error.latest: DecisionLogSummary`）。決定ログに記録し、`ideas.latest_decision` を変え、ワークスペースの他のメンバー（停止・削除したユーザーを除く Owner / Member / Viewer）に通知（`decision`）を作る。通知の開き先は 13（`{ screen: 13, workspaceId, ideaId }`。Go / No-Go は 20）。`recordedAt` は idea の行を押さえた後に決め、先に確定した記録より後になるようにする |

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
  shareableWorkspaces: { id: UUID; name: string }[];   // 自分が Owner / Member の、個人用以外のワークスペース（他人の個人用ワークスペースも含めない）
}
interface SelfAnalysisAnswer extends Versioned {
  questionKey: string; text: string | null; amount: number | null;   // amount は金額＋理由の設問だけ
  commentCounts: { workspaceId: UUID; workspaceName: string; count: number }[];  // 本人には共有先ごとの件数
}
```

| API | 本体 | 応答 | エラー・副作用 |
|---|---|---|---|
| S1 GET | — | `200 SelfAnalysisHome` | 初めて開いたときに自己分析を作る（最新の公開済みの版、`not_started`）。運営者も同じ（design-spec 2.1）。公開済みの版が無ければ `409 TEMPLATE_NOT_PUBLISHED` |
| S1 PATCH | `{ currency: string }` | `200 SelfAnalysisHome` | 換算しない |
| S2 | — | `200 { section: TemplateSection; answers: SelfAnalysisAnswer[] }` | |
| S3 | `{ text?: string | null; amount?: number | null; lockVersion; force? }`（値は design-spec 6.0.8） | `200 SelfAnalysisAnswer` | 最初の回答で `in_progress` にする。金額を送れるのは金額＋理由の設問だけ（それ以外は `422 VALIDATION_FAILED`）。存在しない設問は `422 QUESTION_NOT_FOUND`。履歴 `manual`（本人だけが見られる） |
| S4 complete | `{ confirmEmpty?: boolean }` | `200 SelfAnalysisHome` | 未回答があり `confirmEmpty` が無ければ `409 HAS_EMPTY_QUESTIONS`（`error.emptyCount`） |
| S4 reopen | — | `200 SelfAnalysisHome` | 共有は続く |
| S5 | `{ workspaceIds: UUID[] }`（共有先の全体） | `200 SelfAnalysisHome` | 新しく足すのは `done` のときだけ（`422 MUST_BE_DONE_TO_SHARE`）。外すのはいつでも。Owner / Member でないワークスペースと、個人用ワークスペース（自分のものも他人のものも）は `422 NOT_SHAREABLE`（design-spec 6.11） |
| S6 | — | `200 { items: { user: UserRef; shared: boolean; status: "not_started" | "in_progress" | "done" | null }[] }` | 今のワークスペースの Owner / Member |
| S7 | — | `200 { id: UUID; user: UserRef; status; currency: string; sections: (TemplateSection & { answers: { questionKey: string; text: string | null; amount: number | null; commentCount: number }[] })[] }` | `id` は自己分析の ID で、回答へのコメント（C1）の `targetId` に使う。今のワークスペースに共有済みでなければ `403 NOT_SHARED`。変更履歴は返さない |

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
  ideaArchived: boolean;                       // アイデアがアーカイブ済み。20〜23 を読み取り専用にする
  draftOnly: boolean;                          // 回答がすべて下書き作成時のコピーのままで、実行管理の初期行も未変更（20 の「Start with…」の表示に使う。版の表示中も今の内容で決める）
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
  rows: Record<string, string | number | null>[] | null;   // 表の小項目（§11・§13・§21・§22）。列のキーはテンプレートの options.columns（移行で消えた列の値も残る）
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
| P1 POST（M5） | `{ name: string }`（値は design-spec 6.0.8） | `201 PlanHome` | 最新の判定が Proceed でなければ `409 DECISION_NOT_PROCEED`。公開済みのプランのテンプレートが無ければ `409 TEMPLATE_NOT_PUBLISHED`。名前の重複は `409 NAME_TAKEN`（アーカイブした案の名前は数え、作成を取り消した案の名前は数えない）。テンプレートの `copy_from` で検証から文章をコピーし（文字数の上限を超えても切らない。6.3 末尾）、実行管理の初期行を作る。`created_from_decision_id` に最新の Proceed を入れる。履歴 `plan_draft`（1つの `batchId`。H3 で作成ごと取り消せる。条件と扱いは H3） |
| P2 GET | `?versionId=` | `200 PlanHome` | 版を指定したら、`parts` などを版のスナップショットから作る |
| P2 PATCH | `{ name?; businessName?; preparedBy?; lockVersion; force? }`（値は design-spec 6.0.8） | `200 PlanHome` | 名前の重複は `409 NAME_TAKEN`（数え方は P1 POST と同じ）。履歴 `manual` |
| P3 | — | `200 PlanSummary` | |
| P4 | `?versionId=` | `200 PlanItem` | `itemNo` は 1〜30 |
| P5 | `{ text?: string | null; rows?: Record<string, string | number | null>[] | null; lockVersion; force? }`（文章と表のセルの値は design-spec 6.0.8） | `200 PlanAnswer` | 数字・実行管理の小項目は `422 NOT_EDITABLE`。存在しない設問は `422 QUESTION_NOT_FOUND`、選択肢にない値は `422 INVALID_CHOICE`。表の列にないキー（ただし、テンプレートの移行で消えた列のキーは、保存済みの行にあるときだけ、保存済みの値か null で受け付ける。P4 は消えた列の値も行に含めて返し、クライアントは表示せずにそのまま送り返す）・型の合わない値・表に `text`・表以外に `rows`・design-spec 6.0.8 の長さを超える文章は `422 VALIDATION_FAILED`。表の長さは、保存済みの値から変えたセルだけを検査する（下書きの作成で写して上限を超えたセルを残したまま、ほかのセルと行を保存できる。6.3 末尾）。履歴 `manual` |
| P6 GET | — | `200 { items: PlanVersionSummary[] }` | |
| P6 POST（M3） | `{ name: string }`（値は design-spec 6.0.8） | `201 PlanVersionSummary` | スナップショット（中身は 6.3 の末尾）を保存し、決定ログに `version_saved` を記録して通知する |
| P7 | — | `200 { conditions: { launchIf: string | null; delayIf: string | null; stopIf: string | null }; keyMetrics: KeyMetrics; currentVersion: PlanVersionSummary | null; hasChangesSinceVersion: boolean; history: DecisionLogSummary[] }` | |
| P8（M4） | `{ value: GoNoGoValue; reason: string }`（`reason` の長さは design-spec 6.0.8） | `201 { entry: DecisionLogEntry; stage: Stage }` | 対象の版は最新の保存済みの版（無ければ null）。決定ログに `go_no_go` を記録して通知する |
| P9 GET | `?type=&assignee=me|<userId>&status=` | `200 { items: ExecutionItem[] }` | Next Actions は期限順（期限なしは最後）。それ以外の種類は `sortOrder` の順（P11 で並べ替えた順。ローンチは区分の中、KPI は Area の中。design-spec 6.13） |
| P9 POST | `ExecutionItemInput & { type: ExecutionType; title: string }` | `201 ExecutionItem` | `dueDate` は milestone・launch・open_question・next_action で任意（ローンチの行も日付を持てる。design-spec 6.13）。kpi に送ると `422 VALIDATION_FAILED`。新しい行はその種類の末尾に付く。担当のメンバーは Owner / Member だけ（`422 INVALID_ASSIGNEE`）。状態は種類ごとの値だけ（`422 INVALID_STATUS`。milestone / launch / next_action は todo・doing・done、open_question は open・resolved、kpi は null）。履歴 `manual` |
| P10 | PATCH: `ExecutionItemInput & { lockVersion; force? }`（値は design-spec 6.0.8。P9 POST も同じ）。DELETE: なし（ロックを持たない論理削除） | `200 ExecutionItem` / `204` | 種類に無い列を送ると `422 VALIDATION_FAILED`（担当は `assigneeUserId` と `assigneeName` の一方だけ）。`done` / `resolved` にしたら `completed_at` を入れる。`kpiActual` を変えたら `kpi_actual_updated_at` を入れる。履歴 `manual` |
| P11 | `{ type: ExecutionType; ids: UUID[] }` | `204` | `type` は `milestone` / `launch` / `kpi` / `open_question`（Next Actions は期限順に並べるので並べ替えない。`next_action` は `422 VALIDATION_FAILED`。design-spec 6.13）。`ids` はその種類の（論理削除を除く）全件と一致すること（違えば `422 VALIDATION_FAILED`）。`sort_order` を振り直す。履歴は残さず、`lockVersion` と `updated_at` も変えない（V17 と同じ） |
| P12 | `?variant=one|five&versionId=` | `200 PitchDeck` | `packages/domain` の `buildPitchDeck()` |
| P13 | 同上 | `200 application/pdf`（`Content-Disposition: attachment; filename="{businessName}-{one|five}-{版の名前|draft}-{日付}.pdf"`） | ADR-012。常にライトの配色。回数制限は 7.2（超えたら `429 RATE_LIMITED`） |

### 5.10 AI 往復

書き出しの Markdown と JSON の書式、設問 ID、取り込みの振り分けの決まりは design-spec 6.6・6.7 が正。貼り付けた内容の解析と振り分けは、クライアントが `packages/domain` の `parseAiReply()` と `matchBlocks()` で行い（貼り付けた全文をサーバーに送らない）、反映（X3）でサーバーがもう一度検査する。

| API | 本体・クエリ | 応答 | エラー・副作用 |
|---|---|---|---|
| X1 | `?source=self_analysis|validation|business_plan&id=<検証かプランの id。自己分析は省く>&sections=01,02&items=1,3&part=a|b&includeEmpty=true&includeExamples=true&includeReference=true` | `200 { markdown: string; json: object; fileBaseName: string; questionCount: number; allEmpty: boolean }` | `json` は design-spec 6.6 の `moonx-export`。範囲が空なら `422 EMPTY_SCOPE`。記録しない。回数制限は 7.2（超えたら `429 RATE_LIMITED`） |
| X2 | `?target=self_analysis|validation|business_plan&id=` | `200 ImportContext` | アーカイブ中のアイデア・プランも読める（X1 も同じ）。`target.archived` で 24・25 が操作を止め、X3 は 409 `ARCHIVED` |
| X3 | `{ target: { type: TemplateKind; id?: UUID }; changes: ImportChange[] }` | `200 { applied: number; needsClassification: number; batchId: UUID }` | 1つのトランザクションで全部反映するか、何もしない。どれかの `baseLockVersion` が古ければ `409 CONFLICT_MULTI`（`error.conflicts: { questionKey; current: ConflictCurrent }[]`）。取り込めない設問・隠れた設問は `422 NOT_IMPORTABLE`、存在しない設問は `422 QUESTION_NOT_FOUND`、金額・選択の値が読めない・同じ設問が2回ある・回答の長さや金額の範囲が design-spec 6.0.8（11・21 の行）に合わなければ `422 VALIDATION_FAILED`。`applied` は内容が変わった回答の数（変わらないものは数えない）。`conflicts[].current.value` は `{ text, amount }`。検証の回答で本文が変わったものは F/A/U を外して未分類にする（`classification` を送ったらそれを使う。`fact` は根拠が残っているときだけ）。回数制限は 7.2（超えたら `429 RATE_LIMITED`）。履歴 `ai_import`（1つの `batchId`） |

```ts
interface ImportContext {
  target: { type: TemplateKind; id: UUID; name: string; workspaceId: UUID | null; ideaId: UUID | null; currency: string | null; archived: boolean };  // workspaceId は検証・プランのワークスペース（24・25 は URL のワークスペースと食い違えば「You don't have access」を出す。自己分析は null）。ideaId は検証・プランの親のアイデア（取り込み後に開く画面）。currency は金額の表示用。archived はアイデアかプランがアーカイブ中（24・25 は書き出し・取り込みの操作を出さない）
  sections: { key: string; title: string; part: "a" | "b" | null; importable: boolean }[];  // テンプレートの全セクション（順）。importable は取り込める型の設問を1つ以上持つ。24 の範囲の選択肢と 25 の範囲の判定に使う
  questions: {
    questionKey: string; title: string; sectionKey: string;
    answerType: AnswerType; options: QuestionOptions | null;
    importable: boolean;                   // 表・数字・実行管理は false
    hidden: boolean;                       // OCEAN の出し分け・移行で隠れている。移行で隠れた設問は、保存済みの回答がある取り込める型のものだけを、その設問を持っていた版の定義（sectionKey も）で載せる
    current: { text: string | null; amount: number | null; classification: Classification | null } & Versioned;
  }[];
}
interface ImportChange {
  questionKey: string;
  text?: string | null; amount?: number | null;            // 金額＋理由は amount と text（理由）。書き出しの JSON の `amount`・`reason`（design-spec 6.6）を、クライアントがこの形に変えて送る
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
    planVersion?: { id: UUID; name: string } | null;  // go_no_go・version_saved
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
  source: HistorySource;   // 作成の取り消しの行は source が revert、action が delete、target.type が idea か business_plan の組み合わせ。画面はこの組み合わせで「作成の取り消し」と出す（design-spec 6.0.5）
  before: unknown | null; after: unknown | null;   // 本文・数字・F/A/U・確信度・根拠の id の一覧など（差分の強調はクライアント）
  changedBy: UserRef; changedAt: DateTime;
  revertible: boolean;   // 呼んだ人がこの行を戻せる（Viewer・アーカイブ済みは false）。`template_version` の行は H2 では戻せないが、H3 で操作全体を戻せるときは true。`duplicate`・`plan_draft` の行は作成の取り消し（H3）の対象で、条件を満たすかは確かめずに true（呼んだ人の権限だけで決める）。作成の取り消しで書いた行（下の「作成の取り消し」）は false
}
interface Notification {
  id: UUID; kind: "mention" | "comment" | "decision";
  workspace: { id: UUID; name: string }; actor: UserRef | null;
  title: string;          // 表示用の短い文（英語。どこでを含める。例: "Paolo mentioned you on WHO · Piaya Gift Box Delivery"）
  excerpt: string | null; // コメント・メンションは本文の冒頭、判定・Go / No-Go は理由の冒頭。版の保存は null（design-spec 6.15）
  link: LinkTarget;
  accessible: boolean;    // 外れた・権限がなくなったら false（「You no longer have access」）
  readAt: DateTime | null; createdAt: DateTime;
}
```

| API | 本体・クエリ | 応答 | エラー・副作用 |
|---|---|---|---|
| L1 | `?kind=&ideaId=&planId=&recordedBy=&from=&to=&cursor=&limit=` | `200 Page<DecisionLogSummary>` | 新しい順 |
| L2 | — | `200 DecisionLogEntry` | 更新・削除の API は無い |
| C1 GET | 項目: `?targetType=&targetId=&targetKey=&workspaceId=`。画面: `?containerType=&containerId=&sectionKeys=&workspaceId=`（`sectionKeys` はカンマ区切り。画面と節の対応は 6.3 の末尾） | `200 { threads: { root: Comment; replies: Comment[] }[]; unresolvedCount: number }` | 画面の指定では、その画面の項目のスレッドと、アイデアの中の画面ではアイデアへのコメント（対象 `idea`）をまとめて返す（ヘッダーの 💬 のパネル。`unresolvedCount` は解決していないスレッドの数で、💬 の件数に使う。design-spec 6.0.1・6.0.4）。自己分析の回答へのコメントは、共有先の Owner / Member には `workspaceId` のワークスペースの分だけ、本人には全部を返す。削除した行へのコメントは返さない |
| C1 POST | `{ workspaceId: UUID; target: TargetRef; parentId?: UUID; body: string; mentionUserIds: UUID[] }`（`body` の長さは design-spec 6.0.8） | `201 Comment` | 返信は1段まで（`422 REPLY_DEPTH`）。メンションできない人は `422 INVALID_MENTION`。対象から画面（`container_type`・`container_id`・`section_key`）を決めて保存する。通知（`mention` / `comment`）を design-spec 6.15 の条件で作る（プランの項目へのコメントは、プランを作った人とアイデアを提案した人の両方。受け取る人が重なれば1人に1件） |
| C2 PATCH | `{ body: string; mentionUserIds: UUID[] }` | `200 Comment` | 新しくメンションした人にだけ通知する |
| C2 DELETE | — | `204` | 「deleted」として残す |
| C3 | — | `200 Comment` | スレッドの最初のコメントだけ |
| H1 | 項目: `?targetType=&targetId=&targetKey=&cursor=`。画面全体: `?containerType=self_analysis|validation|business_plan|idea&containerId=&sectionKeys=&cursor=`（`sectionKeys` はカンマ区切り。画面と節の対応は 6.3 の末尾。省くと画面全体） | `200 Page<HistoryEntry>` | 新しい順。`containerType=idea`（13）は、アイデア自身の行に加え、そのアイデアの検証のテンプレートの版の行（テンプレートの移行。design-spec 6.0.7）と、作成の取り消しの行も返す。項目の指定と `sectionKeys` の指定では、テンプレートの版の行を返さない |
| H2 | — | `200 { entry: HistoryEntry; target: unknown }` | その項目を、その変更の直後の状態に戻す（`delete` の行は削除を取り消す）。戻したことも履歴 `revert` で残す。衝突の検査はしない（戻すのは意図した上書き）。`template_version` の行は `422 VALIDATION_FAILED`（H3 で戻す）。作成の取り消しで書いた行も `422 VALIDATION_FAILED`（取り消したものは戻さない） |
| H3 | — | `200 { reverted: number; batchId: UUID }` | AI 取り込み・テンプレートの移行・元に戻す操作を、1回の操作の単位でまとめて戻す。すでに戻した操作は、戻したことを取り消すまで `409 ALREADY_REVERTED`。複製（`duplicate`）と下書き作成（`plan_draft`）は、戻すのではなく作ったものを論理削除する「作成の取り消し」になる（下の「作成の取り消し」） |
| N1 | `?filter=all|unread&cursor=&limit=` | `200 Page<Notification>` | ワークスペースをまたいで新しい順 |
| N2 | — | `200 { total: number }` | クライアントは画面を開いたとき・前面に戻ったとき・60秒ごとに呼ぶ |
| N3 | — | `204` | |

**作成の取り消し（H3 の `duplicate` と `plan_draft`）:** 複製したアイデア、または下書きのプランを、作った操作の単位で取り消す（2026-10-03 のユーザーの決定）。作ったものは論理削除し、変更履歴は消さずに残す（2026-10-11 のユーザーの決定）。一般の削除ではない（design-spec 6.8 の「アイデア・プランの削除は初期リリースでは作らない」は変えない）。
- 条件: 作ったあとに何も足されていないこと。次のどれかがあれば、何も変えずに `409 UNDO_BLOCKED` を返す（文言は design-spec 6.0.5）。(1) その操作の行以外の変更履歴（作ったアイデアなら `idea`・`validation` の画面、プランなら `business_plan` の画面。AI 取り込み・移行・元に戻すを含む）。(2) 作ったものの項目（アイデア・検証・各行、プラン・実行管理の項目）へのコメント（消したコメントを含む）。(3) 決定ログの行（アイデアの判定、プランの Go / No-Go と版の保存）。(4) 作ったアイデアに付いたプラン、作ったプランに保存した版。(5) 作ったアイデアを複製元にしたアイデア。作ったあとの仕事を巻き込んで隠さないための条件で、足されたものを個別に片づける処理は持たない。
- 論理削除するもの: 作ったアイデア（`ideas.deleted_at`）、または作ったプラン（`business_plans.deleted_at`）。子の行（検証・回答・調査ログ・競合・前提・リスク・費用行・数字・根拠の紐づけ、プランの回答・実行管理の項目）は変えずに残す。親が論理削除されたものは、どの API でも無いものとして扱う（5.1）。論理削除したアイデア・プランを戻す操作は作らない。
- 履歴の扱い: 取り消しは `withHistory` を通して書く（ADR-020 の例外を作らない）。書く先は元の側の画面で、複製はコピー元のアイデア、下書き作成はそのプランのアイデア（どちらも `containerType = idea`）。対象は作ったアイデア（`idea`）かプラン（`business_plan`）、`action` は `delete`、`source` は `revert`、`revertedFromId` は取り消した操作の作成の行。この行は H2 で戻せない（`revertible: false`）。その操作の `batchId` の行はそのまま残る。同じ `batchId` をもう一度呼ぶと `409 ALREADY_REVERTED`。
- 応答: `reverted` は取り消した操作の履歴の行の数（行は消さない）、`batchId` は取り消した操作の `batchId`。
- 実行: 1つのトランザクションで、`batchId` の advisory lock、アイデアの行（プランの取り消しはそのプランの行も）の `FOR UPDATE NOWAIT`、条件の確認、論理削除と履歴の書き込みの順に行う。ロックを持ったまま別のロックを待たないので、進行中の書き込みがデッドロックの犠牲になることはない。ほかの書き込みがその行を持っていれば、取り消しはすぐに `409 BUSY`（文言は design-spec 6.0.5）を返す。取り消しの完了を待っていた書き込みは、`resolveScope` と書き込みの最後の確認（アーカイブの確認と同じ場所。7.1）で親の `deleted_at` を見て `404 NOT_FOUND` になり、足されたものは残らない。ワークスペースの最終更新を更新する。
- 権限: 戻す操作の `need` と同じ（Owner / Member。アーカイブ済みのアイデアの中身は `409 ARCHIVED`）。作ったアイデア自身がアーカイブ済みなら取り消せない。

### 5.12 テンプレートの移行（M8）

| API | 本体・クエリ | 応答 | エラー・副作用 |
|---|---|---|---|
| T1 | `?targetType=self_analysis|validation|business_plan&targetId=` | `200 { from: { versionNumber: number }; to: { versionId: UUID; versionNumber: number }; carried: number; hiddenQuestions: { questionKey: string; title: string; hasAnswer: boolean }[]; addedQuestions: number; addedCostRows: string[] }` | 新しい版が無ければ `409 ALREADY_LATEST` |
| T2 | `{ targetType; targetId; toVersionId: UUID }` | `200 { batchId: UUID; template: TemplateRef }` | design-spec 6.0.7 の表のとおり移す。履歴 `template_migration`（1つの `batchId`。H3 で戻せる）。費用の初期行: 新しい版の初期行のキー（`template_key`）について、そのキーの行が無ければ足す。そのキーの行が論理削除されていて、その削除が移行を戻した操作（H3。`source = revert` で、`revertedFromId` が `template_migration` の行）によるものなら、新しい行として足し直す。利用者が消した行（`source = manual` の `delete`）しか無ければ足さない（design-spec 6.0.7）。移行を H3 で戻すと、その移行で足した費用の行は論理削除する |

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

**テンプレートのファイル（AD10）:** 運営する組織のテンプレートは、アプリのコードと分けてファイルで持つ。BCDX のファイルは `data/templates/bcdx/{self-analysis,validation,plan}.json` に置く（中身は Drive の原本の写し `docs/drive-templates/` から転記する。design-spec 9.3）。staging・production には、リリースの手順で運営者が 26 から取り込み、27 で検査して公開する（04_deployment-procedure.md）。local は `make db-seed` が同じ取り込みの関数で入れて公開する（6.5）。形の検査は `packages/schemas` の Zod スキーマで、AD10 とシードが同じものを使う。

```ts
interface TemplateFile {
  format: "moonx-template"; formatVersion: 1;
  kind: TemplateKind;
  name: string;                       // templates.name。テンプレートがまだ無いときに使う
  aiPrompt: string;                   // 検証とプランは ""（用意しない。2026-10-02 のユーザーの決定。design-spec 8.4）
  sections: {
    key: string; part: "a" | "b" | null; title: string; subtitle: string | null; guidance: string | null;
    questions: {
      key: string; title: string; prompt: string; example: string | null; hint: string | null;
      answerType: AnswerType; options: QuestionOptions | null;
      displayCondition: Record<string, string[]> | null; hasFau: boolean;
      copyFrom: string[] | null; reference: unknown[] | null;   // プランだけ。形は 6.3 の末尾
    }[];
  }[];                                 // 並びはファイルの順
  costDefaults: { category: CostCategory; key: string; name: string }[];                     // 検証だけ（他は []）
  checkRules: { checkKey: CheckKey; params: Record<string, number> }[];                       // 検証だけ（他は []）
  executionPresets: { type: "milestone" | "launch" | "kpi"; title: string; area: string | null; launchTiming: LaunchTiming | null }[];   // プランだけ（他は []）。area は KPI だけ、launchTiming はローンチだけで必須
}
```

`AdminUser.lastActiveAt` は `users.last_active_at` で、ログイン中のユーザーの API 呼び出しが書く。書き込みは、前回の値から5分以上たっているときだけにする（呼び出しのたびに users を更新しないため）。表示は最大5分遅れる。書くのは Better Auth の `hooks.after` で、セッションを読むか作った呼び出しのたびに動く（ログイン・`get-session` など）。`/api/v1` は呼び出した人のセッションを Better Auth の `auth.api.getSession` で読み、このフックを通す。

| API | 本体・クエリ | 応答 | エラー・副作用 |
|---|---|---|---|
| AD1 | — | `200 { items: { kind: TemplateKind; name: string | null; versions: { id: UUID; versionNumber: number; status: "draft" | "published"; publishedAt: DateTime | null; publishedBy: UserRef | null; usageCount: number }[] }[] }` | 3つの種類を必ず返す。まだ取り込んでいない種類は `name: null`・`versions: []`（26 の空の状態。design-spec 6.17） |
| AD2 | — | `201 { id: UUID }` | その版をコピーした下書きを作る。下書きがすでにあれば `409 DRAFT_EXISTS` |
| AD3 GET | — | `200 TemplateVersionDetail` | |
| AD3 PATCH | `{ aiPrompt: string }` | `200 TemplateVersionDetail` | 検証とプランの版に空でない値を送ると `422 VALIDATION_FAILED`（AI 用プロンプトを持つのは自己分析だけ。design-spec 6.17）。公開済みの版は `409 PUBLISHED_READ_ONLY`（AD4・AD5・AD6 publish も同じ。AD6 validate は書き込まないので公開済みの版にも使える） |
| AD4 | セクション: `{ key; title; subtitle?; guidance?; part? }`。設問: `{ key; title; prompt; example?; hint?; answerType; options?; displayCondition?; hasFau?; copyFrom?; reference? }`（`reference` は 27 の画面からは送らない。変えるのは AD10 の取り込みだけ。design-spec 6.17。PATCH は一部。文字の値は design-spec 6.0.8） | `201` / `200` / `204` | 設問 ID の形式（design-spec 6.6）を検査する（`422 INVALID_QUESTION_KEY`） |
| AD5 | order: `{ sections: { id: UUID; questionIds: UUID[] }[] }`。cost-defaults: `{ items: { category; key; name }[] }`。check-rules: `{ items: { checkKey; params }[] }`（基準値は design-spec 6.0.8）。execution-presets: `{ items: { type; title; area?; launchTiming? }[] }` | `200 TemplateVersionDetail` | 一覧ごと置き換える |
| AD6 validate | — | `200 { errors: { code: string; message: string; nodeId: UUID | null }[]; warnings: { code: "removed_keys"; keys: string[] }[] }` | 公開をふさぐエラー: 設問が0件（`no_questions`）、セクションの `part` の過不足（`invalid_part`。プランは A / B が必須、他は無し）、設問 ID の形式（`invalid_question_key`）・セクションとの不一致（`question_key_section_mismatch`）・重複（`duplicate_question_key`）、`answerType` と `options` の食い違い（`options_mismatch`。選択肢・表の列・主要指標が空のときも）、`displayCondition` が存在しない設問を指す（`unknown_condition_key`）。警告: 前の版から消えた ID |
| AD6 publish | — | `200 { versionNumber: number; publishedAt: DateTime }` | 検査のエラーがあれば `422 TEMPLATE_INVALID`。既存の回答は変わらない |
| AD7 users | `?q=&status=&cursor=` | `200 Page<AdminUser>` | 中身（アイデア・回答）は返さない |
| AD7 workspaces | `?q=&cursor=` | `200 Page<AdminWorkspace>` | |
| AD7 invitations | `?status=&cursor=` | `200 Page<Invitation>` | |
| AD8 | — | `200 AdminUser` | 停止: セッションを全部消す。通知を作らない。再開で元どおり。自分自身は停止できない（`422 CANNOT_SUSPEND_SELF`） |
| AD9 | `{ email: string; workspaceId?: UUID; role?: Role }` | `201 { invitation: Invitation; link: string }` | `workspaceId` があれば `role` は必須。`workspaceId` なしの招待は `grantsAdmin = false`（受諾した人は運営者にならない）。招待のメールを送り、リンクは応答にも返す（運営者が直接渡せる。2026-10-03 のユーザーの決定。5.5）。期限・メールの送り方・エラー・回数制限は W4 POST と同じ: 期限は design-spec 6.16、`409 ALREADY_MEMBER`（`workspaceId` があり、すでにメンバー）、`409 INVITATION_PENDING`（同じメールあての、同じワークスペース（またはワークスペースなし）の有効な招待がある）、Resend に届かなければ招待も作らず `503 UPSTREAM_UNAVAILABLE`、運営者ごとに W4・W5 と合わせて1時間20回（7.2） |
| AD10 | `?kind=<TemplateKind>`（26 で選んだテンプレート）。本体は下の「テンプレートのファイル」（`Content-Type: application/json`。大きさは design-spec 6.0.8） | `201 { versionId: UUID; kind: TemplateKind; versionNumber: number }` | ファイルの中身で、そのテンプレートの下書きの版を作る（26 は作った下書きを 27 で開く）。テンプレートの行がまだ無ければ作る（名前はファイルの `name`）。版が1つも無ければ v1 の下書き、あれば次の番号の下書き。直したファイルの取り込み直しもできる: 下書きが無ければ、前の版から何もコピーせずにファイルの中身だけで新しい下書きを作る。下書きがすでにあれば `409 DRAFT_EXISTS`（下書きは1つのテンプレートに1つまで。その下書きを 27 で直して公開してからでないと取り込めない。design-spec 6.17）。ファイルの `kind` が `?kind=` と違う・形が違えば `422 VALIDATION_FAILED`（`details` に場所）。各値の長さと範囲は design-spec 6.0.8 の 27 の行で検査し、検証とプランのファイルの `aiPrompt` が空でなければ `422 VALIDATION_FAILED`（AI 用プロンプトを持つのは自己分析だけ）。中身の検査と公開は AD6（検査のエラーがあれば公開できない） |

### 5.14 死活確認

| API | 本体 | 応答 | 補足 |
|---|---|---|---|
| Z1 `GET /api/health` | — | `200 { status: "ok"; version: string /* コミット SHA */; env: string }` | **DB に触れない**（監視のたびに Neon を起こさないため。ADR-008） |
| Z2 `GET /api/health/db` | — | `200 { status: "ok"; latencyMs: number }` / `503` | デプロイ後の確認に使う。`503` は 8.1 の形式で `UPSTREAM_UNAVAILABLE` |

## 6. データモデル

**データモデルの正はこの章。** Phase 2 の design-spec 7章（論理設計）を Phase 3 で引き継いだ。スキーマを変えるときはこの章と `packages/db/src/schema.ts` を一緒に更新し、`make db-generate` でマイグレーションを作る。`make test-api` が、6.3 のコードと `schema.ts` がコメントと整形を除いて同じであること、`make db-generate` が新しいマイグレーションを作らないこと、マイグレーションを当てた DB が `schema.ts` のとおりであることを確かめる（10章）。

### 6.1 ER図

```
users ─┬─ 1:N sessions / accounts（Better Auth）        verifications（Better Auth。単独）・rate_limits（Better Auth と入口のプラグインが共有。ADR-029。単独）
       ├─ N:M workspaces（中間: memberships。role = owner / member / viewer）
       ├─ 1:0..1 self_analyses ─┬─ 1:N self_analysis_answers
       │                        └─ N:M workspaces（中間: self_analysis_shares）
       └─ 1:N notifications ─┬─ N:1 workspaces
                             ├─ N:0..1 comments（コメント・メンションの通知）
                             └─ N:0..1 decision_log_entries（判定の通知）

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
            │             │                      ├─ 1:N execution_items
            │             │                      └─ N:0..1 decision_log_entries（created_from_decision_id: 下書きのもとの Proceed）
            │             └─ 0..1 ideas（duplicated_from: 複製元）
            ├─ 1:N decision_log_entries（idea・business_plan・plan_version を参照）
            ├─ 1:N comments ─ 1:N comment_mentions（画面の一覧のために container_type・container_id・section_key を持つ）
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
| `sessions`・`accounts`・`verifications`・`rate_limits` | 追加 | Better Auth のテーブル（`rate_limits` は入口のプラグインも、キーの接頭辞 `app:` を分けて使う。ADR-029） |
| 版を持つ項目のテーブル | `updated_by_id` を足す | 衝突のときに「Paolo updated this answer…」を出す（design-spec 6.0.2） |
| `template_questions` | `template_version_id` を足す | 版の中で設問 ID を一意にする制約のため |
| `evidence_links` | `validation_id`・`target_key`・`deleted_at` を足す | 回答・数字を「検証の id ＋ キー」で指す（5.1 TargetRef）。根拠の付け外しを履歴から戻せるようにする |
| `change_history` | `container_type`・`container_id`・`section_key`・`batch_id`・`client` を足す | 画面全体の履歴（design-spec 6.0.5）、1回の操作の単位で戻す（AI 取り込み・移行）、スマホの幅の画面からの入力の割合（PRD の K-08・K-16。5.1「クライアントの種類」） |
| `risks.sort_order` | null を許す | null は自動の並び（Impact → Probability） |
| `workspaces` | ユーザーが作るチームのワークスペースは `is_personal = false` | M7 の「New workspace」（Phase 3 で追加） |
| `ideas`・`business_plans` | `deleted_at` を足す | 作成の取り消し（5.11）で論理削除する。戻さない |
| `template_sections` | `subtitle` を足す | 自己分析の見出しの横の短い言い換え（design-spec 9.3）をガイダンスと分けて持つ |
| `comments` | `container_type`・`container_id`・`section_key` を足す | ヘッダーの 💬 で、画面のコメントをまとめて出す（design-spec 6.0.1） |
| `invitations.status` | `expired` を保存しない | 期限切れは `pending` と `expires_at` から決める（書き込む契機が無いため） |

### 6.3 Drizzle のスキーマ（`packages/db/src/schema.ts`）

`drizzle.config.ts` と `drizzle()` の初期化で `casing: "snake_case"` を指定する（TypeScript の camelCase がそのまま snake_case の列名になる）。リレーションの定義（`relations()`）は `packages/db/src/relations.ts` に置く（外部キーと同じ対応なので省略する）。

```ts
// packages/db/src/schema.ts
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn, bigint, boolean, check, date, foreignKey, index, integer, jsonb, numeric,
  pgEnum, pgTable, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

// ---------- 共通の列 ----------
const pk = () => uuid().primaryKey().defaultRandom();
const ts = () => timestamp({ withTimezone: true });
// updated_at は、リポジトリの関数が内容を変えたときにだけ入れる（$onUpdate は使わない。
// 並べ替え（V17・P11）・アーカイブ（I4）など、内容でない更新で updated_at を変えないため）
const timestamps = () => ({
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
});
// 版を持つ項目（ADR-019）
const versioned = () => ({
  lockVersion: integer().notNull().default(0),
  updatedById: uuid().references((): AnyPgColumn => users.id, { onDelete: "set null" }),
});
// 金額。上限と桁数（小数第2位まで）は design-spec 6.0.8 で、API が検査する（この型はそれより大きい値まで持てるので、桁あふれの前に 422 になる）
const money = () => numeric({ precision: 15, scale: 2, mode: "number" });
// 率。0.3500 = 35%。% の入力は小数第2位まで（design-spec 6.0.8）なので、率は小数第4位までで丸めずに持てる
const ratio = () => numeric({ precision: 7, scale: 4, mode: "number" });
// 次の2種類の制約とインデックスには、下のコードで名前を付ける:
// - drizzle-kit が付ける名前が PostgreSQL の上限（63バイト）を超えるもの: 超えた名前は PostgreSQL が切り詰め、DB と
//   drizzle-kit のスナップショットが食い違う。外部キーは foreignKey() で名前を付ける
// - 2語以上の列の unique(): drizzle-orm は snake_case に直す前の列名で invitations_tokenHash_unique のように名前を付け、
//   DB の名前に大文字が混ざってほかの名前とそろわない

// ---------- enum ----------
export const userStatus = pgEnum("user_status", ["active", "suspended", "deleted"]);
export const themePref = pgEnum("theme_pref", ["system", "light", "dark"]);
export const workspaceRole = pgEnum("workspace_role", ["owner", "member", "viewer"]);
// 期限切れは保存しない。pending で expires_at を過ぎたものを API が "expired" として返す（W4 GET）
export const invitationStatus = pgEnum("invitation_status", ["pending", "accepted", "revoked"]);
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
export const notificationKind = pgEnum("notification_kind", ["mention", "comment", "decision"]);
export const historyAction = pgEnum("history_action", ["create", "update", "delete", "restore"]);
export const historySource = pgEnum("history_source", [
  "manual", "ai_import", "revert", "template_migration", "duplicate", "plan_draft",
]);
export const historyContainer = pgEnum("history_container", ["self_analysis", "validation", "business_plan", "idea"]);   // 画面の単位。change_history と comments が使う
export const clientKind = pgEnum("client_kind", ["web", "web_mobile", "unknown"]);   // 5.1「クライアントの種類」。ネイティブの feature で ios・android を足す

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

export const rateLimits = pgTable("rate_limits", {   // Better Auth と入口のプラグインが共有する。入口のプラグインのキーは `app:` で始まる（ADR-029）
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
  tokenHash: text().notNull().unique("invitations_token_hash_unique"),   // SHA-256。トークンそのものは持たない
  invitedById: uuid().references(() => users.id),   // null = `make admin-create` の招待（運営者がまだ居ない）
  status: invitationStatus().notNull().default("pending"),
  expiresAt: ts().notNull(),                      // 発行（再送）から数える。長さは design-spec 6.16
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
  subtitle: text(),                               // 見出しの横の短い言い換え（自己分析の「Why do I want this?」など）
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
  templateVersionId: uuid().notNull(),            // 外部キーは末尾（63バイトに収まる名前を付ける）
  category: costCategory().notNull(),
  key: text().notNull(),                          // 例: "initial.permits"、"monthly.rent"
  name: text().notNull(),
  sortOrder: integer().notNull(),
  ...timestamps(),
}, (t) => [
  uniqueIndex().on(t.templateVersionId, t.key),
  foreignKey({ name: "template_cost_defaults_template_version_id_fk", columns: [t.templateVersionId], foreignColumns: [templateVersions.id] })
    .onDelete("cascade"),
]);

export const templateCheckRules = pgTable("template_check_rules", {
  id: pk(),
  templateVersionId: uuid().notNull(),            // 外部キーは末尾（63バイトに収まる名前を付ける）
  checkKey: checkKey().notNull(),
  params: jsonb().notNull(),                      // 基準値。例: competitors は { "min": 3 }（目安の上限 5 は持たない。5.2 の CheckResult）
  ...timestamps(),
}, (t) => [
  uniqueIndex().on(t.templateVersionId, t.checkKey),
  foreignKey({ name: "template_check_rules_template_version_id_fk", columns: [t.templateVersionId], foreignColumns: [templateVersions.id] })
    .onDelete("cascade"),
]);

export const templateExecutionPresets = pgTable("template_execution_presets", {
  id: pk(),
  templateVersionId: uuid().notNull(),            // 外部キーは末尾（63バイトに収まる名前を付ける）
  type: presetType().notNull(),
  title: text().notNull(),                        // 例: "Business decision"、"30 days before launch"、"Revenue"
  area: text(),                                   // KPI だけ（Financial / Customer / Operations）
  launchTiming: launchTiming(),                   // ローンチだけ
  sortOrder: integer().notNull(),
  ...timestamps(),
}, (t) => [
  foreignKey({ name: "template_execution_presets_template_version_id_fk", columns: [t.templateVersionId], foreignColumns: [templateVersions.id] })
    .onDelete("cascade"),
]);

// ---------- 自己分析 ----------
export const selfAnalyses = pgTable("self_analyses", {
  id: pk(),
  userId: uuid().notNull().unique("self_analyses_user_id_unique").references(() => users.id, { onDelete: "cascade" }),
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
  deletedAt: ts(),                                // 作成の取り消し（5.11）でだけ入れる。戻さない
  lastActivityAt: ts().notNull().defaultNow(),
  ...versioned(),                                 // 概要の同時編集
  ...timestamps(),
}, (t) => [index().on(t.workspaceId, t.lastActivityAt)]);
// 工程（stage）は保存しない（プランの有無と Go / No-Go から毎回決める）

export const validations = pgTable("validations", {
  id: pk(),
  ideaId: uuid().notNull().unique("validations_idea_id_unique").references(() => ideas.id, { onDelete: "cascade" }),
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
  value: numeric({ precision: 17, scale: 4, mode: "number" }),   // null = 未入力。target_margin は 0.15 = 15%。価格・販売数は小数第2位まで（design-spec 6.0.8）
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
  createdFromDecisionId: uuid(),                  // 外部キーは末尾（63バイトに収まる名前を付ける）
  archivedAt: ts(),
  deletedAt: ts(),                                // 作成の取り消し（5.11）でだけ入れる。戻さない
  lastActivityAt: ts().notNull().defaultNow(),
  createdById: uuid().notNull().references(() => users.id),
  ...versioned(),                                 // ヘッダの同時編集
  ...timestamps(),
}, (t) => [
  // 作成を取り消した案の名前は、見えない名前とぶつからないように数えない（design-spec 6.0.8）
  uniqueIndex("business_plans_name_uq").on(t.ideaId, t.name).where(sql`${t.deletedAt} is null`),
  foreignKey({ name: "business_plans_created_from_decision_id_fk", columns: [t.createdFromDecisionId], foreignColumns: [decisionLogEntries.id] }),
]);

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
  snapshot: jsonb().notNull(),                    // 形は 6.3 の末尾
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
  planVersionId: uuid().references((): AnyPgColumn => planVersions.id),
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
  containerType: historyContainer().notNull(),    // 画面のコメントの一覧（C1 の画面の指定）を引くため。対象から決める
  containerId: uuid().notNull(),
  sectionKey: text(),                             // change_history.section_key と同じ値（下の「画面と節の対応」）
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
}, (t) => [
  index().on(t.targetType, t.targetId, t.targetKey),
  index().on(t.containerType, t.containerId, t.sectionKey),
  index().on(t.workspaceId, t.createdAt),
]);

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
  link: jsonb().notNull(),                        // 開く先（5.2 LinkTarget）
  readAt: ts(),
  createdAt: ts().notNull().defaultNow(),
}, (t) => [
  index().on(t.userId, t.createdAt),
  index("notifications_unread_idx").on(t.userId).where(sql`${t.readAt} is null`),
]);

export const changeHistory = pgTable("change_history", {
  id: pk(),
  workspaceId: uuid().references(() => workspaces.id, { onDelete: "cascade" }),     // 自己分析の履歴は null
  ownerUserId: uuid().references(() => users.id, { onDelete: "cascade" }),          // 自己分析の履歴の持ち主
  containerType: historyContainer().notNull(),    // 画面全体の履歴を引くため
  containerId: uuid().notNull(),
  sectionKey: text(),                             // 値と画面との対応は下の「画面と節の対応」
  targetType: text().notNull(),                   // 5.1 TargetRef の type
  targetId: uuid().notNull(),
  targetKey: text(),
  action: historyAction().notNull(),
  before: jsonb(),
  after: jsonb(),
  source: historySource().notNull(),
  batchId: uuid(),                                // 1回の操作（AI 取り込み・移行・下書き作成・複製・それらを戻す操作）のまとまり
  client: clientKind().notNull().default("unknown"),   // 保存したときの画面の幅（5.1「クライアントの種類」。K-08・K-16）
  revertedFromId: uuid().references((): AnyPgColumn => changeHistory.id),
  changedById: uuid().notNull().references(() => users.id),
  changedAt: ts().notNull().defaultNow(),
}, (t) => [
  index("change_history_target_idx").on(t.targetType, t.targetId, t.targetKey, t.changedAt),
  index().on(t.containerType, t.containerId, t.changedAt),
  index().on(t.workspaceId, t.changedAt),
  index().on(t.batchId),
]);
```

`template_questions` の `copy_from` と `reference` の形（どちらもプランの小項目だけが持つ）:

- `copy_from`: 文字列の配列。要素は設問 ID（`V.01.WHO`）か疑似キー（`IDEA.ONE_LINE_CONCEPT`・`IDEA.PROPOSED_SOLUTION`・`LIST.ASSUMPTIONS`・`LIST.RISKS`）。要素が複数なら、書かれた順に空行でつないで1つの文章にする。`LIST.*` は表の小項目の `rows` にする（`LIST.RISKS` の Trigger / Indicator は null）。空の回答は飛ばす。写した文章が design-spec 6.0.8 の上限を超えても切らずに保存する。その欄の P5 は、上限以内に短くした内容だけを受け付ける（超えたままなら `422 VALIDATION_FAILED`。同じ項目のほかの欄は保存でき、表は変えたセルだけを検査する）
- `reference`: 次の指定の配列。項目の参照は、その項目の小項目の `reference` の和集合で、各指定は最も関係の深い小項目に置く。`kind` は 5.9 の `PlanReference.kind` と同じ

| 指定 | 内容 |
|---|---|
| `{ kind: "validation_answers", section?, keys? }` | 検証の回答。`section`（`"01"`）か `keys`（設問 ID の配列）のどちらか一方 |
| `{ kind: "competitors", limit }` | 検証の競合の上位 `limit` 件（1以上の整数。V17 で並べた `sortOrder` の順。Pitch Deck の競合のスライドも同じ順） |
| `{ kind: "cost_rows", keys }` | 費用行。`keys` はテンプレートの費用行のキー（`initial.permits`） |
| `{ kind: "research_log", tag }` | 調査ログのうち `tag`（`local_price` / `permits` / `demand_signal`）が付いたもの |
| `{ kind: "self_analysis", sections }` | 共有された自己分析のセクション（`WHY` など） |
| `{ kind: "metrics", keys }` | 主要指標（design-spec 6.4 のキー） |
| `{ kind: "decision_log" \| "go_no_go_history" \| "assumptions" \| "risks" \| "totals" }` | キーを持たない参照。`totals` は表の小項目の持分と出資の合計 |

`plan_versions.snapshot` の形: `{ header: { name, businessName, preparedBy }, answers: { questionKey, text, rows }[], keyMetrics, scenarios, execution: { type, title, status, dueDate, assigneeUserId, assigneeName, ... }[], competitors: { name, type, typicalPrice, strength, weakness }[] }`。`answers` は版を保存した時点の30項目の文章で、`keyMetrics` は `buildKeyMetrics()`、`scenarios` は `EconomicsResult.scenarios`、`competitors` は検証の上位5件（`sortOrder` の順）。スナップショットに何を持つかの正はここ（design-spec の M3 はここを参照する）。「+ changes」（5.9 `hasChangesSinceVersion`）は、版の保存より後に更新された回答・表・ヘッダ・実行管理の項目があるか（`updated_at` と `saved_at` の比較）で決める。

**画面と節の対応**（`change_history.section_key`・`comments.section_key`。H1 と C1 の画面の指定で、`sectionKeys` に渡す値）:

| 画面 | `containerType` | `sectionKeys` |
|---|---|---|
| 10 自己分析ホーム | `self_analysis` | 省く（自己分析の全体） |
| 11 設問フォーム（自己分析）・12 メンバーの自己分析 | `self_analysis` | そのセクションのキー（`WHY` など。12 はコメントだけで、履歴は出さない） |
| 13 検証ホーム | `idea` | 省く（アイデアの概要・テンプレートの版・作成の取り消しの行と、アイデアへのコメント） |
| 11 設問フォーム（検証） | `validation` | `01` / `02` / `10` |
| 14 調査ログ | `validation` | `research_log` |
| 15 競合・代替 | `validation` | `04`,`competitors` |
| 16 前提・リスク | `validation` | `assumptions_risks` |
| 17 費用 | `validation` | `costs` |
| 18 損益・シナリオ | `validation` | `08`,`economics` |
| 20 プランホーム | `business_plan` | 省く（プランの全体） |
| 21 プラン項目の編集 | `business_plan` | 項目のセクションのキー（`01`〜`30`） |
| 22 実行管理 | `business_plan` | `execution` |
| 23 Pitch Deck | `business_plan` | `pitch`（スライドへのコメントだけ。変更履歴は無い） |

検証の回答の `section_key` は設問 ID の節（`V.04.SURVIVOR_PATTERNS` なら `04`）。

**`change_history` の列の決め方**（ADR-020 の `withHistory`）: `workspace_id` と `owner_user_id` は画面（`container`）から決める（自己分析は `workspace_id` が null で `owner_user_id` が持ち主、それ以外は `workspace_id` が画面のワークスペースで `owner_user_id` は null）。`container_type`・`container_id`・`section_key` は対象から決める（上の表）。`action`（作成・更新・論理削除・削除の取り消し）・`source`・`batch_id`・`client`・`changed_by_id` は呼び出し元が渡す。`reverted_from_id` は H2・H3 だけが渡す（戻した元の行）。`before`・`after` は本体を変える処理が返した値。

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
- **論理削除**: `deleted_at` を持つテーブルは論理削除で、一覧・計算・確認項目の判定では数えない。履歴の対象の行は履歴から戻せる。例外: `comments` は履歴の対象外で、削除は「deleted」の表示として残る（戻さない）。`ideas`・`business_plans` の論理削除は作成の取り消し（5.11）でだけ起き、戻さない。
- **選択肢の値は原本を踏襲する。** 判定 Proceed / Hold / Drop、市場の種類 Red / Blue / Mixed、確信度 Low / Medium / High、Can Reduce? Yes / Partly / No、競合の種類 Direct / Indirect / Substitute、出典の種類（design-spec 6.10）。
- **ワークスペースの通貨を変えても金額は換算しない。**
- **アカウントの削除**: `users` の行は残して個人の情報を消す（5.4 U7）。外部キーは `users` を参照し続ける。
- **シード**: `make db-seed` は全テーブルを空にして design-spec 8章のデモデータを入れる（`APP_ENV=local` 以外では動かない）。行の id は名前から決まるので、何度動かしても同じ id の行になる（パスワードのハッシュは毎回変わり、日時はシードを動かした日からの相対になる）。テンプレートは、BCDX のテンプレートのファイル（`data/templates/bcdx/`。5.13）を AD10 と同じ取り込みの関数で入れて公開する。シードはテンプレートを staging・production に入れる手段ではない（そちらはリリースの手順で運営者が取り込む。04_deployment-procedure.md）。
- **AI 用プロンプト**: 検証とプランのテンプレートは AI 用プロンプトを持たない（空の文字列。2026-10-02 のユーザーの決定。design-spec 8.4）。空のときは AI 書き出しに `# Prompt` の節と `json.prompt` を出さない。

---

## 7. セキュリティ・パフォーマンス

### 7.1 認可（権限マトリクス）

design-spec 2.1（ロール）・2.2（権限マトリクス）・3章（認証要否）と同じ内容を、API の単位で書く。実装後の独立レビュー（認可漏れの確認）はこの表と照らし合わせる。○ = できる、× = できない（未認証の列は 401 `UNAUTHENTICATED`、それ以外の列は 403）、本人 = 自分のものだけ。

| リソース / 操作（API） | 未認証 | Viewer | Member | Owner | Admin（運営者） |
|---|---|---|---|---|---|
| ログイン・パスワード再設定・招待の内容・招待からの新規登録（A1〜A3・A6・A7・U4・U5） | ○ | ○ | ○ | ○ | ○ |
| 死活確認（Z1）・local の写真の配信（U9）・API の仕様書（Z3。staging だけ） | ○ | ○ | ○ | ○ | ○ |
| 自分のアカウント（U1〜U3・U7・U8・A4・A5・A8）・招待の受諾（U6。招待のメールと同じ人だけ） | × | 本人 | 本人 | 本人 | 本人 |
| ワークスペースの作成（W0） | × | ○ | ○ | ○ | ○ |
| ワークスペースの閲覧・メンバー一覧（W1 GET・W2） | × | ○ | ○ | ○ | 所属していれば、そのロールのとおり |
| メンションの候補（W8） | × | ○（自己分析の対象は ×） | ○ | ○ | 所属していれば、そのロールのとおり |
| ワークスペースの設定・ロール変更・メンバーの削除・招待（W1 PATCH・W3・W4・W5・W7） | × | 自分の Leave だけ | 自分の Leave だけ | ○ | W5・W7 はすべての招待（運営者が出した招待を含む）。ほかは所属していれば、そのロールのとおり |
| ダッシュボード（D1・D3・D4） | × | ○ | ○ | ○ | 所属していれば |
| ダッシュボードの自己分析（D2）・メンバーの自己分析（S6・S7。S7 は共有済みのみ） | × | × | ○ | ○ | 所属していれば |
| アイデア・検証・プラン・実行管理・Pitch Deck・決定ログの閲覧（I1 GET・I2 GET・V1・V2・V6 GET・V7 GET・V8 GET・V10 GET・V12・V15・P1 GET・P2 GET・P4・P6 GET・P9 GET・P12・P13・L1・L2） | × | ○ | ○ | ○ | 所属していれば |
| アイデア・検証・プラン・実行管理の作成と編集（I1 POST・I2 PATCH・I3・I4・V3〜V17 の書き込み・P1 POST・P2 PATCH・P3・P5・P9 POST・P10・P11） | × | × | ○ | ○ | 所属していれば |
| 判定・版の保存・Go / No-Go（V18・V19・P6 POST・P7・P8） | × | × | ○ | ○ | 所属していれば |
| AI 往復・テンプレートの移行（検証・プラン）（X1〜X3・T1・T2） | × | × | ○ | ○ | 所属していれば |
| 自分の自己分析（S1〜S5、自己分析の X1〜X3・T1・T2・H1〜H3） | × | 本人 | 本人 | 本人 | 本人 |
| コメントを読む・書く・スレッドの解決（C1・C3。自己分析へのコメントを除く） | × | ○ | ○ | ○ | 所属していれば |
| 自己分析へのコメントとスレッドの解決（C1・C3） | × | × | ○（共有先のワークスペースで） | ○（同左） | 所属していれば |
| コメントの編集・削除（C2） | × | 本人 | 本人 | 本人 | 本人 |
| 変更履歴の閲覧（H1。自己分析の履歴は本人だけ） | × | ○ | ○ | ○ | 所属していれば |
| 変更履歴から戻す（H2・H3） | × | × | ○ | ○ | 所属していれば |
| 通知（N1〜N3） | × | 本人 | 本人 | 本人 | 本人 |
| テンプレート・ユーザー・ワークスペース・招待の管理（AD1〜AD10） | × | × | × | × | ○ |
| DB の死活確認（Z2。IP ごとの回数制限。7.2） | ○ | ○ | ○ | ○ | ○ |

追加の決まり:

- **アーカイブ**: アーカイブしたアイデア・プランの中身を変える操作は、ロールにかかわらず 409 `ARCHIVED`（コメントを書く・元に戻すを含む。Viewer の編集も 403 ではなく 409。design-spec 6.8）。ただしワークスペースのメンバーではない人には、先に 403 `NO_ACCESS` を返す。確認は書き込みの最後（更新日時の更新）でもう一度行い、確認と書き込みのあいだにアーカイブされても書き込みは残らない。読む・複製・Restore・Pitch Deck はできる。
- **運営者**: `is_admin` で開けるのは運営者の画面（AD1〜AD10）と、すべての招待の再送・取り消し（W5・W7）だけ。ワークスペースの中身は、そのワークスペースに所属しているときだけ、所属のロールのとおりに見られる（design-spec 2.1）。運営者はサービスの管理者で、信頼する前提にする（2026-10-03 のユーザーの決定）: 運営者は AD9 で自分あてに、ワークスペースを指定した招待を出し、そのリンクから受諾すれば、そのワークスペースの Member 以上に入れる（AD9 は運営者にリンクを返す。5.5）。これを塞ぐ仕組みは作らない。見られるのは、入ったあとの所属のロールの範囲になる。`is_admin` を直接変える API は無い。付くのは `make admin-create` の招待（`grants_admin = true`）から登録・受諾したときとシードだけで、AD9 の招待では付かず、外す API も無い。
- **停止・削除したユーザー**: セッションを消し、ログインを拒否する。残ったリクエストも、認証のミドルウェアが `users.status` を確かめて 401 にする。
- **実装**: 認可は、ルートごとの宣言でまとめて行う。`scoped: { to, need }` は、`to` でリソースの引き方（パスのパラメーターの名前、または Query・本文から引く関数）を宣言し、プラグインが共通の関数 `resolveScope`（例: `resolveScope({ ideaId })` → `{ workspaceId, role, ideaArchived, planArchived }`）でワークスペースとロールを求め、`need`（読む / 書く / アーカイブ済みでなければ書く / Owner）を満たさなければ拒否してから、ハンドラーに `scope` を渡す。プランのアーカイブと復元だけは、そのプラン自身のアーカイブ済みの印では止めず、アイデアのアーカイブ済みでは止める。`resolveScope` は、論理削除したアイデア・プラン（作成の取り消し。5.11）を無いものとして 404 にし、書き込みの最後の確認でも同じに扱う。自己分析のようにワークスペースを持たないものがあるルートは `located`（`scope` が null になりうる）を使う。ワークスペースを持たない他のルートは `open`（セッション不要）・`signedIn`（自分のデータだけ）・`operator`（運営者）を宣言する。宣言の無いルートがあれば API は起動しない。クエリは必ずそのワークスペースで絞る（他のワークスペースの ID を指定しても読めないようにする）。自己分析は `self_analyses.user_id = ログイン中のユーザー` で絞る。結合テストで、この表のエンドポイント × ロールをすべて確かめる（10章）。

### 7.2 その他の設計判断

| 項目 | 決定 |
|---|---|
| 入力バリデーション | API は必須（`packages/schemas` の Zod。範囲・長さ・形式・列挙）。クライアントは同じスキーマで入力中に補助として検査する。最後の守りは DB の check 制約（6.3）。値（必須・文字数・範囲・形式）の正は design-spec 6.0.8 で、`packages/schemas` はそこから写す |
| シークレット | 置き場所の方針は ADR-027、CI の置き場所の一覧は2章「CI のシークレットと変数」が正。local は `.env`（コミットしない。`.env.example` だけコミットする）。staging / production の API のシークレットは Secret Manager から Cloud Run の環境変数として渡す。ローテーションの手順は 05_operation-runbook.md |
| CSRF | Better Auth はオリジンを確かめる（`TRUSTED_ORIGINS`）。`/api/v1` の状態を変えるリクエストは `Content-Type: application/json`（写真は `multipart/form-data`）に限り、`Origin` ヘッダーがあれば `TRUSTED_ORIGINS` と一致するかを確かめる（合わなければ 403 `FORBIDDEN`）。本体の無い POST・DELETE にも同じ決まりを適用する（Web のクライアントは、本文が無くても `application/json` を付ける）。`multipart/form-data` は `PUT /api/v1/me/avatar`（U3）だけに許す。JSON の1MB は `Content-Length` と実際に読んだ長さの両方で確かめる（`/api/auth/*` は入口のプラグインが確かめる。ADR-029）。Cookie は SameSite=Lax |
| CORS | 使わない（Web と API は同じオリジン。ADR-004）。CORS のヘッダーを返さないので、他のオリジン（Cloud Run の `*.run.app` の URL を含む）からのブラウザのリクエストは届かない。local は Vite の転送で同じオリジンにする |
| レート制限 | 仕組みは ADR-029（Better Auth と入口のプラグインの2段）。秘密を受け取る認証のパス（Better Auth の6パスと U5。5.4）は、IP ごとに1つの枠で1分10回（DB に記録）。DB の死活確認（Z2）は IP ごとに1分10回。アプリの API は、次の上限を同じ仕組みで持つ。ユーザーごと: 招待の送信・再送（W4・W5・AD9）1時間20回（Resend の1日100通を守る）、PDF の作成 1時間30回、AI 書き出し・取り込み 1時間60回（数えるのは X1 と X3。X2 は既存の内容を読むだけなので数えない）、アカウントの削除のパスワード確認（U7）10分5回。超えたら 429 `RATE_LIMITED`。入口のプラグインも Better Auth と同じ数え方をする。許したリクエストのたびに枠をそこから時間の幅だけ延ばし、許したリクエストの無いまま時間の幅が過ぎたら数え直す。こうすると、どの時間の幅の中でも上限を超えて通さない（最初のリクエストで枠を決めると、枠の境目で上限の倍近くを通してしまう）。`retryAfterSeconds` には、最後に許したリクエストから時間の幅が過ぎるまでの秒数を切り上げて入れる。IP ごとの上限は、Better Auth の既定と同じく、IPv6 のアドレスを先頭の /64 にまとめ、IPv4 射影アドレス（`::ffff:` で始まる）を IPv4 のアドレスとして数える（回線にはふつう /64 が割り当てられるので、その中でアドレスを変えても数え直しにならない）。時間の幅を過ぎた `app:` の行は、入口のプラグインが Cloud Run のインスタンスごと・上限ごとに、時間の幅に1回消す（残っていても無い行と同じに数えるので、結果は変わらない）。Better Auth の行（`app:` で始まらない）は、Better Auth の回数の保存先（5.4「回数制限」）が、インスタンスごとに Better Auth の最も長い時間の幅に1回、その幅を過ぎた行だけを消す |
| 呼び出し元の IP | 入口のプラグインが、リクエストごとに1回だけ決める: `X-Forwarded-For` の右端の値。無ければ接続元のアドレス。決めた値は、回数制限（ADR-029）・Better Auth（`X-Moonx-Client-Ip` に付け直して読ませる。クライアントが同じ名前のヘッダーを送っても上書きする。決まらないときはヘッダーを消す。決まらないのは接続の無い呼び出し（テストの `app.handle`）だけ）・アクセスログの `clientIp`（8.3）・セッションの IP のすべてが使う。セッションの IP は、Better Auth が回数制限のキーと同じ形で持つ（IPv6 は先頭の /64 にまとめ、残りを 0 にする）。左側の値はクライアントが自由に書けるので使わない。Google は公式の説明（Cloud Run functions のリクエストのヘッダー）で「`X-Forwarded-For` は経路の IP の一覧で、最初の値はふつうクライアント」とだけ書き、クライアントが送った値に Cloud Run が足すのかは書いていない。右端の値は、Cloud Run が足す場合も置き換える場合も、Cloud Run が見た接続元になる。インフラを作るステップで、staging に偽の `X-Forwarded-For` を付けたリクエストを送り、ログの `clientIp` が偽の値でないことを確かめてから使う（04_deployment-procedure.md）。local と e2e は前段が無く、Vite の転送も値を足さない（`xfwd` を付けない）ので、送った `X-Forwarded-For` の右端の値がそのまま使われる。e2e はテストごとに値を変えて送り、別の IP として数えさせる（03_dev-setup.md） |
| セッション | HttpOnly・Secure・SameSite=Lax の Cookie。パスワードの再設定・変更、停止、アカウントの削除でセッションを消す。ログアウトしたら、まだ保存できていない値（ADR-021）も捨てる |
| アップロード | プロフィール写真だけ。種類はファイルの中身で確かめ（拡張子を信じない）、形式と大きさは design-spec 6.0.8。sharp で 512×512 の WebP に変換し、位置情報などのメタデータを落とす |
| セキュリティヘッダー | API が、静的ファイルを含むすべての応答に付ける（ADR-004）: `Content-Security-Policy`（`default-src 'self'; script-src 'self'; img-src 'self' data: https://storage.googleapis.com; connect-src 'self' https://*.ingest.sentry.io; style-src 'self' 'unsafe-inline'; font-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'`）、`X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`、`Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=(), usb=()`（アプリが使わない機能を止める。写真はファイルの選択で受け取るので、カメラの API は使わない）、`Strict-Transport-Security: max-age=31536000; includeSubDomains`（staging・production だけ。local は HTTP なので付けない）。環境ごとの値は meta 要素で渡し、インラインのスクリプトを使わない（ADR-004） |
| 個人情報 | 持つもの: メール・表示名・写真・タイムゾーン・セッションの IP と User-Agent・アクセスログの呼び出し元の IP（Cloud Logging。保持は30日。11章）・自己分析の回答（収入の希望額など、本人にとって機微な内容）・事業のアイデアと数字。通信は TLS、保存時の暗号化は Neon と Google Cloud の標準に任せ、列ごとの暗号化はしない（Google のログインのトークンは持たない。5.4「Google」。運営者も、ワークスペースに所属していなければアプリから中身を見られない。自分あての招待で所属できることは 7.1「運営者」。DB に入れるのは開発者1〜2人に限り、Neon・Google Cloud・Vercel（DNS）のアカウントは2段階認証を必須にする）。ログと Sentry には本文・回答・メールを出さない（`userId` だけ。Sentry は、利用者の情報・Cookie・ヘッダー・本文・クエリ・DB の値・スタックの変数をすべて集めない設定にする（設定の名前は使う版のドキュメントに合わせる）。さらにブレッドクラム（画面遷移の URL を記録する）はすべて捨て、イベントのリクエストのヘッダー・Cookie・クエリ文字列は消す。イベントに載る URL は、クエリ・フラグメント・招待のトークン（`/invite/<token>` のパス）を持たない）。アカウントの削除は U7。バックアップは30日で消える（ADR-028）ので、削除した情報は30日以内にバックアップからも消える |
| 依存の脆弱性 | GitHub の Dependabot のアラートを有効にする。Better Auth・Elysia・Drizzle のセキュリティ修正は速やかに取り込む（05_operation-runbook.md） |

### 7.3 パフォーマンス

想定の規模: 初期は BCDX の数人、ワークスペース数個、アイデア数十件、変更履歴は数万行まで。過剰な仕組みは入れない（ADR-011）。

| 対象 | 目標 | 守る設計 |
|---|---|---|
| 項目の保存（V3・V14・V16 など） | p95 300ms 以内（コールドスタートを除く） | 1項目＋変更履歴の1トランザクション。クライアントは表示を先に変え（楽観的更新）、design-spec 6.0.2 の保存のタイミングで送る |
| ハブの画面（V1・P2・D1） | p95 800ms 以内 | 検証1件分のデータを決まった数のクエリでまとめて読み（N+1 をしない）、`packages/domain` でメモリ上で計算する。アイデアの一覧は検証ごとのデータを `IN (...)` でまとめて読む。一覧はページに分ける（I1 は50件） |
| 0台からの最初の応答 | 5秒以内（Cloud Run の起動＋Neon の起動） | Bun で起動を速くし、Cloud Run の起動時の CPU ブーストを有効にする。死活確認（Z1）は DB に触れない |
| Web の最初の表示 | 4G のミドルクラスのスマホで LCP 2.5秒以内（Cloud Run が0台のときは、上の「0台からの最初の応答」の分を足す） | ランディングはプリレンダー。アプリはルートごとにコードを分割し、静的アセットはハッシュ付きのファイル名で長期キャッシュ（ADR-004）。2回目からは Service Worker のキャッシュから画面の外側を出す（ADR-031） |
| PDF の作成（P13） | 5秒以内（12枚） | react-pdf をサーバーで実行。フォントは起動時に読み込んでおく |
| DB の接続 | Neon のプールの上限を超えない | postgres.js のプールはインスタンスごとに最大5。Cloud Run は最大3台なので最大15接続 |
| クライアントのデータ | 画面の移動を速くする | TanStack Query。一覧は `staleTime` 30秒、編集中の画面は保存の応答で該当のキャッシュだけを更新する。通知の未読数は60秒ごと |

インデックスは 6.3 のスキーマに書いたもの。遅いクエリが見つかったら、Cloud Logging の `latencyMs` とクエリの実行計画で確かめてから足す。

---

## 8. エラーハンドリング

### 8.1 APIエラーレスポンス

すべてのエラーを同じ形で返す。Better Auth の `/api/auth/*` は Better Auth の形（`{ code, message }`）のまま返し、クライアントが 5.4 の表で対応させる。このパスで入口のプラグイン（ADR-029）が拒否する 429 `RATE_LIMITED` と 413 `PAYLOAD_TOO_LARGE` も `{ code, message }` で返し、429 には Better Auth と同じ `X-Retry-After`（秒）を付ける。

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
| 403 | `FORBIDDEN` | ロールが足りない（例: Viewer の編集）、Origin が合わない |
| 403 | `NO_ACCESS` | そのワークスペースに所属していない |
| 403 | `INVITATION_EMAIL_MISMATCH`・`INVALID_PASSWORD`・`REAUTH_REQUIRED`・`NOT_SHARED` | 5章の各 API |
| 403 | `INVITATION_REQUIRED`・`ACCOUNT_SUSPENDED` | Better Auth のフックで拒否したとき（Google の招待の無い新規登録、停止・削除したユーザーのログイン。Better Auth の形 `{ code, message }` で返る。5.4） |
| 404 | `NOT_FOUND` | 資源が無い |
| 409 | `CONFLICT`・`CONFLICT_MULTI` | 同時編集の衝突（ADR-019）。この2つは衝突だけに使う |
| 409 | `ALREADY_REVERTED`・`UNDO_BLOCKED`・`BUSY` | 元に戻す操作（H3）を受け付けない: すでに戻した操作、作成の取り消しの条件を満たさない、対象を別の書き込みが持っている（5.11。文言は design-spec 6.0.5） |
| 409 | `TEMPLATE_NOT_PUBLISHED` | 公開済みのテンプレートの版が無い（運営者がまだ取り込んでいない。I1 POST・S1 GET・P1 POST。AD10） |
| 409 | `ARCHIVED` | アーカイブしたものを変えようとした |
| 409 | `LAST_OWNER`・`CANNOT_LEAVE_PERSONAL`・`PERSONAL_OWNER`・`ALREADY_MEMBER`・`INVITATION_PENDING`・`INVITATION_ALREADY_ACCEPTED`・`EMAIL_TAKEN`・`PASSWORD_ALREADY_SET`・`DECISION_CHANGED`・`DECISION_NOT_PROCEED`・`NAME_TAKEN`・`HAS_EMPTY_QUESTIONS`・`ALREADY_LATEST`・`DRAFT_EXISTS`・`PUBLISHED_READ_ONLY` | 状態がその操作を許さない（5章） |
| 410 | `INVITATION_INVALID` | 招待のトークンが無い・取り消し・期限切れ |
| 413 | `PAYLOAD_TOO_LARGE` | 本体が大きすぎる（JSON は1MB、写真は design-spec 6.0.8 の上限。`Content-Length` が無い分割転送でも読んだ量で数える） |
| 422 | `VALIDATION_FAILED` | 入力の検査に失敗（`details` に項目ごとの `path`・Zod の `code`・`message`。入力の値そのものは返さない） |
| 422 | `FACT_REQUIRES_EVIDENCE`・`CONFIDENCE_REQUIRED`・`INVALID_CHOICE`・`QUESTION_NOT_FOUND`・`PERCENT_ONLY_FOR_VARIABLE`・`OUT_OF_RANGE`・`NOT_EDITABLE`・`INVALID_ASSIGNEE`・`INVALID_STATUS`・`MUST_BE_DONE_TO_SHARE`・`NOT_SHAREABLE`・`EMPTY_SCOPE`・`NOT_IMPORTABLE`・`REPLY_DEPTH`・`INVALID_MENTION`・`INVALID_QUESTION_KEY`・`TEMPLATE_INVALID`・`CANNOT_SUSPEND_SELF`・`CONFIRMATION_MISMATCH` | 業務の決まりに合わない（5章） |
| 429 | `RATE_LIMITED` | 7.2 のレート制限 |
| 500 | `INTERNAL` | 想定外のエラー（詳細は返さない） |
| 502 / 503 / 504 | `UPSTREAM_UNAVAILABLE` | API が必要な依存先に届かないとき（Z2 の DB、招待のメールの送信）に API が 503 で返す。Cloud Run の前段が返す 502・503・504（本体がこの形でないもの。起動の失敗・タイムアウトなど）は、クライアントが `UPSTREAM_UNAVAILABLE` として扱う |

コードの一覧は `packages/schemas/src/errors.ts` に型として置き、API とクライアントが共有する。Better Auth のフックで拒否するとき（`INVITATION_REQUIRED`・`ACCOUNT_SUSPENDED`）は、Better Auth のエラーの `code` に同じ名前を入れる。

### 8.2 フロントエンドでの表示方針

文言と置き場所は design-spec 6.0.6 と各画面の「状態」が正。ここはエラーの種類から表示の方法への対応だけを決める。

| エラー種別 | 表示方法（文言は design-spec の該当の状態） |
|---|---|
| バリデーションエラー（422 `VALIDATION_FAILED` など） | 入力欄の下に理由を出し、保存しない（design-spec 6.0.6「入力値が範囲外」）。クライアントの Zod の検査で送る前に止めるのが基本で、API の 422 は最後の守り |
| 業務の決まり（409・422 の個別のコード） | コードごとに design-spec の各画面の「状態」の文言を出す。対応はカタログのキー `errors:<CODE>`（9章）。`TEMPLATE_NOT_PUBLISHED` は design-spec 6.0.6 の文言を出す。画面が送る前に防いでいて、ふつうは返らないコードが返ったら、想定外のエラー（下）として出す |
| 同時編集の衝突（409 `CONFLICT` / `CONFLICT_MULTI`） | design-spec 6.0.2 の確認 |
| 通信・サーバーエラー（ネットワーク断・5xx・`UPSTREAM_UNAVAILABLE`） | 保存: design-spec 6.0.2 の保存エラー（ページを開いている間、まだ保存できていない値を自動で再送する。オフラインなら入力を止める。ADR-021）。読み込み: design-spec 6.0.6「読み込みエラー」（ブロックごと） |
| 認証エラー（401） | まだ保存できていない値があれば、design-spec M9 を開く。M9 は今のアカウントのメールで Better Auth のメールのログインを呼び、成功したらキャッシュを残したまま保存できていない値を送る（ADR-021）。値が無いとき、M9 から 2 へ移るとき、Google でログインするときは、クライアントのクエリのキャッシュと保存できていない値をすべて捨ててから `/login?next=<今のパス>` へ移る（アカウントの停止で移るときは `&error=ACCOUNT_SUSPENDED` を付ける）（design-spec 5章「認証」。ログイン・新規登録・パスワードの再設定でも同じく捨てる。次に入るのが別の人でも、前の人のデータが残らない） |
| 認可エラー（403 `FORBIDDEN` / `NO_ACCESS`） | design-spec 6.0.6「権限がない」。編集の途中で権限が変わったときは、読み取りの表示に切り替える |
| 見つからない（404） | design-spec 6.0.6「見つからない」 |
| アーカイブ（409 `ARCHIVED`） | design-spec 6.1「アーカイブ済み」の表示に切り替える |
| 回数制限（429） | design-spec 6.0.6「回数の上限」。待ち時間は応答の `retryAfterSeconds`（Better Auth のパスは `X-Retry-After`）から `packages/i18n` の書式で出す（上限の時間の幅は 7.2 で操作ごとに違うため）。どちらも無い 429 は、待ち時間の無い文言を出す |
| モーダル・パネルの中の失敗（描画エラー、想定外のエラー） | 枠・ナビ・背後の画面は残し、モーダルやパネルの代わりに小さなダイアログ「Something went wrong」を出す。`Ref`（下の行と同じ番号）、Retry（描画をやり直す）、Close（閉じる）を持つ（design-spec 6.0.6）。モーダルとパネルのそれぞれにエラーの境界を置き、開くものが変わったら境界も作り直す |
| 想定外のエラー（500 など） | design-spec 6.0.6「想定外のエラー」。`Ref` には `requestId` の先頭8文字を出す。画面の描画が失敗したとき（API の応答が無いとき）は `requestId` が無いので、Sentry のイベント ID の先頭8文字を出す。画面のブロックごとにエラーの境界（Error Boundary）を置き、1つの失敗で全体を壊さない。Sentry に送る |

### 8.3 ログとの対応

- **リクエスト ID**: API の入口のプラグインがリクエストごとに UUID を作る（クライアントが送った `X-Request-Id` は使わない。ログに偽の値を入れさせないため）。全ログ行・エラーの応答・Sentry のタグに同じ値を入れ、応答のヘッダー `X-Request-Id` にも返す。
- **アクセスログ**: 1リクエストに1行（`message: "request"`）。項目は ADR-023 のとおりで、`clientIp` は入口のプラグインが決めた呼び出し元の IP（7.2「呼び出し元の IP」）、`client` は 5.1「クライアントの種類」の値。
- **レベル**: 4xx は `info`、5xx は `error`。ただし同じ IP からの 401・403 が1分に10回を超えたら、その後の 401・403 のアクセスログの行は `warn` にする（その応答を含めて直近の1分の数で決める。IP は 7.2「レート制限」と同じくまとめる。Cloud Run のインスタンスごとに数える。ログの水準を決めるだけなので、インスタンス間で数は合わせない）。5xx は、アクセスログの行（`message: "request"`）とは別に、`message: "request failed"` の行を `requestId`・`errorCode`・`errorName`・`errorMessage`・`stack` 付きで書く。DB のエラーは `pgCode` と `constraint` だけを出し、SQL とパラメーターは出さない（利用者の入力が入るため）。Sentry に送るのは 5xx とクライアントの想定外のエラーだけ。Better Auth が自分で 5xx を返したとき（Better Auth の 5xx の `APIError`）も、入口のプラグインが `INTERNAL` として同じく扱い、その `APIError` を原因として失敗のログと Sentry に入れる。Better Auth の中で投げられた、Better Auth の応答でないエラーも同じく 500 `INTERNAL` になる。Better Auth が転送の応答に変えて返す失敗（Google の新規登録の後の処理の失敗は `/login?error=unable_to_create_user` への転送になる）は 5xx でないので Sentry に送らず、下の「Better Auth のログ」の行に `error` で残る。
- **Better Auth のログ**: Better Auth の `logger` を API のロガーに通し、1行1つの JSON で `requestId` を付け、`message` を `better-auth: ` で始める。引数のエラーは `request failed` の行と同じ項目だけを出し、ほかの引数は出さない（利用者の値やメールが入りうるため）。
- **探し方**: 利用者の画面の `Ref` → Cloud Logging で `jsonPayload.requestId` を検索 → 同じ ID の Sentry のイベント。手順は 05_operation-runbook.md。

---

## 9. i18n（国際化）

**決定: UI は英語のみで始める。ただし多言語化できる作りにする**（design-spec 1.2）。回答の言語は自由で、アプリは翻訳しない。

| 項目 | 決定 |
|---|---|
| ライブラリ | i18next ＋ react-i18next（Web）。API も同じカタログを使う（通知の文・PDF の見出し・AI 書き出しの見出し・メール） |
| カタログ | `packages/i18n/locales/en/*.json`。ファイル名がネームスペースで、画面と部品のまとまりごとに分ける（例: `validation`・`errors`・`mail`）。キーは画面と部品ごと（例: `validation:home.nextSteps.addEvidence`）。どの画面でも同じ、列挙の値（5.2）の表示名は `common` に置き、キーは `<まとまり>.<値>`（例: `common:stage.launch_prep`・`common:checkState.not_started`・`common:decision.proceed`）。キーの語は camelCase にし、API の値（列挙の値・`error.code`・セクションのキー）はそのまま使う（例: `common:check.competitorsRange`・`errors:VALIDATION_FAILED`）。複数形は i18next の複数形の規則。UI の文言はすべてカタログに置き、コードに直接書かない（JSX の中の生の文字列は lint で見つける） |
| エラーの文言 | API の `error.code`（8.1）からカタログのキー `errors:<CODE>` を引く |
| 入力の検査の文言 | クライアントの Zod の検査（8.2）の issue の `code` から選ぶ。`too_small`・`too_big` は `origin`（文字数か数か）と `minimum`・`maximum`、`invalid_format` は `format`（`email`・`url`・`date`・`datetime`、テンプレートのファイルの `question_key`・`copy_source` など）、`invalid_type` は `expected`（`int` は整数でない数。ほかは型の違い）、`invalid_value` は選択肢に無い値、`packages/schemas` の自前の検査（`custom`）は `params.rule`（`InputRule` の型: `required`・`decimals`・`positive`・`nul_character`・`number_format`・`currency`・`time_zone`・`lone_surrogate`・`unique`（テンプレートのファイルで、キーや選択肢が重なる））を見て、カタログの文言を出す。26 のファイルの取り込み（AD10）は、`path` が `kind` の issue を「テンプレートの種類が違う」、それ以外の issue を「書式が読めない」としてまとめ、`path` で場所を添える（design-spec 6.17）。issue の `message` は開発者向けで、画面に出さない |
| 書式 | 書式と端数の規則の正は design-spec 1.2（ロケールと日付）と 6.4（端数・下限と上限の記号）。`packages/i18n` の書式関数（`formatMoney(amount, currency)`・`formatUnits()`・`formatCount()`（バッジの件数。99 を超えたら「99+」）・`formatMonths()`・`formatPercent()`（計算した率）・`formatInputPercent()`・`formatInputNumber()`（入力どおりに出す値）・`formatDate()`・`formatTime()`・`formatIsoDate()`・`formatRelativeTime()`・`formatOverdue()`（期限切れの日数）・`formatWaitTime()`（回数制限の待ち時間）・`formatCheckName()`（確認項目の名前。競合の基準値の幅を付ける）に集め、画面・PDF・AI 書き出しのすべてがこれを使う。相対時刻を使う範囲、年を省く条件、負の金額の形は design-spec 1.2 |
| タイムゾーン | 表示は `users.timezone`（既定は登録時に端末から取ったもの）。DB は UTC。期限は日付だけで持つ |
| 実行環境 | `Intl.NumberFormat` / `Intl.DateTimeFormat` を使う（ブラウザと Bun） |
| 文字の表示 | 日本語・タガログ語・Hiligaynon の混在を表示できるフォント（06_design-tokens.json の代替フォント。PDF にも埋め込む。ADR-012） |
| テンプレートの中身 | 設問・EXAMPLE・ガイダンスは1言語（英語）でテンプレートに持ち、UI の多言語化とは別に扱う（design-spec 1.2） |
| 規約のページの本文 | 29 プライバシーポリシーと 30 サポートの本文は、BCDX が用意する英語の文章をそのまま Markdown のファイルで持つ（`apps/web/src/content/`。ビルド時に HTML にする）。法的な文章を1つのまとまりで扱うため、カタログに分けて入れない。見出し・ナビ・リンクの文言はカタログに置く |
| 確認用ページ | `packages/ui-web/src/preview/`（`/dev/components`）は開発専用で、英語の文字列を直接持つ。この章の「UI の文言はカタログに置く」の対象外（`scripts/check-screens.ts` は `apps/web/src` だけを見る） |
| 言語を足すとき | `locales/<lang>/` を足し、`users.locale` 列と 4 アカウント設定の言語の選択を足す（今は作らない） |

---

## 10. テスト戦略

| レイヤー | ツール | カバレッジ目標 | 対象 |
|---|---|---|---|
| 計算と判定（`packages/domain`） | Bun test | 行 95% 以上 | 損益分岐・シナリオ・投資回収・ROI（design-spec 8.3 の検算データを期待値どおりに再現する固定のテスト）、下限・上限の伝播、端数、確認項目6つの全状態、Next steps の優先順、F/A/U の状態と内訳、工程、`buildPitchDeck()`、AI 書き出しの Markdown / JSON の生成と `parseAiReply()` / `matchBlocks()` |
| 入力のスキーマ（`packages/schemas`） | Bun test | 主要なスキーマの境界値 | 範囲（金額・%・営業日数）、文字数、列挙 |
| DB のスキーマとマイグレーション（`packages/db`・`scripts/db-check.ts`） | Bun test ＋ 実際の PostgreSQL（`db-check` は一時的な Git のリポジトリ） | — | 6.3 のコードと `schema.ts` がコメントと整形を除いて同じこと、`make db-generate` が新しいマイグレーションを作らないこと、マイグレーションを当てた DB の列・制約・インデックス・列挙が `schema.ts` から作った一時的なテーブルと PostgreSQL の表記で一致すること、`relations()` が外部キーと1対1に対応し、名前が `relations.ts` の先頭に書いた規則に従うこと、テスト用の DB の作り直しが `_test` で終わらない名前とクエリ文字列を拒むこと、`db-check` が2章の失敗の場合をすべて捕まえること |
| API の結合（`apps/api`） | Bun test ＋ 実際の PostgreSQL（CI はサービスコンテナ） | 行と関数がそれぞれ 80% 以上（Bun test が測れるもの。分岐は測れないため、2026-10-12 に分岐 80% から変えた。ユーザーの決定） | 全エンドポイントの正常系、**7.1 の権限マトリクスの表駆動テスト（エンドポイント × ロール → 期待するステータス）**、変更履歴が1件ずつ増えること、楽観ロックの衝突、アーカイブ、招待（メール＋パスワード・Google のフック）、アカウントの削除、テンプレートの取り込み（AD10）・移行と戻し、作成の取り消し、バックアップ（`db-backup` と同じ `pg_dump -Fc` で PostgreSQL 17 のテスト用の DB から取れて、`pg_restore` で別の DB に戻せること。手元と CI に PostgreSQL 17 のクライアントが要る。03・04）、PDF が作れること（ページ数と文字の抽出）と数字の字送りが等幅であること（ADR-012） |
| Web の部品（`packages/ui-web`） | Vitest ＋ Testing Library ＋ `@react-aria/test-utils` | 部品ごとに主要な状態 | design-spec 4.5 の各部品の種類・大きさ・状態（hover・pressed・focus-visible・disabled）、Popover と Tray の切り替え、キーボード操作（axe の検査は E2E で行う。ADR-022） |
| Web（`apps/web`） | Vitest ＋ Testing Library | 主要な部品 60% 以上 | 設問フォームのフォーカス、F/A/U のボタンと M2、費用のワークシートの合計、自動保存と再送（ADR-021。オフラインで入力を止めること、離脱の確認）、衝突の確認、権限による表示の出し分け、保存のときの `X-Moonx-Client`（画面の幅で `web` / `web_mobile`） |
| E2E（Web） | Playwright（Chromium。`e2e/`） | コアフローとロールの代表 | コアフロー（アイデアの作成 → 回答と根拠 → 費用 → 損益 → 判定 → プラン下書き → 版の保存 → Go / No-Go → Pitch Deck の PDF）、招待からの新規登録、Viewer の読み取り専用、AI 書き出し → 取り込み、アカウントの削除。主要な画面で axe のアクセシビリティ検査 |
| PWA と配信（`apps/web`・`apps/api`） | Playwright（Chromium。`make build-web` の結果を `WEB_DIST_DIR` で渡した API に対して。2章「環境変数」）と Bun test（API の静的ファイルの配信） | — | マニフェストの中身（ADR-031）、Service Worker が `/api/*` をキャッシュしないこと、新しい版の再読み込みの表示、iPhone の追加の案内が iPhone の Safari のときだけ出ること（User-Agent を変えて確かめる）、CDP の `Page.getInstallabilityErrors` が空であること。API が返すもの: 画面のパスに `_shell.html`、見つからないファイルに 404、ADR-004 と ADR-031 の Content-Type とキャッシュの見出し、7.2 のセキュリティヘッダー、HTML の meta 要素の値、`X-Forwarded-For` の左側を偽っても回数制限を逃れられないこと |
| デザイントークン | Bun test（`make test-domain`）と `make tokens` の検査 | — | エイリアスの参照先が実在すること・循環しないこと・`semantic` がエイリアスだけであること、意味色のコントラスト（WCAG AA。検査の対象に無い色の組が増えたら失敗）、生成物が 06 と一致すること、Web のテーマが vanilla-extract でコンパイルできること、`packages/ui-tokens/src/types.ts` の値が 06 と合っていること |

CI（GitHub Actions）が PR ごとに動かすターゲットは 04_deployment-procedure.md 2章（`ci.yml`）が正。`main` への取り込みは、すべて通ったときだけ。

---

## 11. モニタリング・ログ

Cloud Monitoring のアラート（死活・エラー率・レイテンシ・メモリ・台数）は production だけに付ける。staging には付けない（Terraform の `envs/production` だけが持つ）。予算アラートはプロジェクト全体に1つ（`envs/shared`）。

| 項目 | ツール | 設定 |
|---|---|---|
| API のエラー | Sentry（プロジェクト `moonx-api`） | `environment` = staging / production、`release` = コミット SHA、タグに `requestId`・`route`。ユーザーは `userId` だけ。新しい issue でメール通知。ソースマップは `make build-api-image` が上げる（2章「make ターゲット」） |
| Web のエラー | Sentry（プロジェクト `moonx-web`） | `environment` と DSN は API が HTML の meta 要素で渡す（ADR-004）。`release` = コミット SHA（`build-web` が入れる）。ソースマップは `make build-api-image` が上げる（2章「make ターゲット」） |
| API のログ | Cloud Logging | 標準出力に1行1つの JSON（`severity`・`message`・`requestId`・`userId`・`route`・`status`・`latencyMs`・`client`・`clientIp`。8.3）。保持は既定の30日 |
| 死活 | Cloud Monitoring の稼働時間チェック | `https://{DOMAIN}/api/health`（Z1。DB に触れない）を5分ごと、3つの地域から。2つ以上の地域で失敗が5分続いたらメール。最初の構築では、証明書ができるまで作らない（03 5.4 I・J） |
| エラー率 | Cloud Monitoring（ログベースの指標） | 5xx が10分間で全体の1%を超える、または5分で5件を超えたらメール |
| レイテンシ | Cloud Run の指標 | リクエストの p95 が15分続けて3秒を超えたらメール（0台からの起動を含むため、目標の 7.3 より緩くする） |
| メモリ | Cloud Run の指標 | メモリの使用率が5分続けて90%を超えたらメール（PDF の作成で足りなくなる兆し） |
| 台数 | Cloud Run の指標 | 台数が上限の3台に10分続けて張り付いたらメール |
| DB の容量 | Neon のコンソール | 無料プランの 0.5GB に対して 400MB を超えたら対応する（確かめ方は 05_operation-runbook.md） |
| メール | Resend のダッシュボード | 送信の失敗と戻り（バウンス）。API のログにも送信の失敗を出す |
| 無料枠の使用量（手で見る。頻度は 05_operation-runbook.md 6.1。アラートは付けない） | 各サービスのダッシュボード | 次の目安を超えたら、05_operation-runbook.md の手順で原因を探し、有料プランか構成の見直しを検討する: Sentry 月4,000件（無料枠の80%）、Neon の計算時間 80%、Resend 1日80通・月2,400通、Cloud Run の無料枠 80%（静的ファイルのリクエストも数える。ADR-004） |
| 費用 | Google Cloud の予算アラート（Terraform） | 月 $5 と $10 でメール |
| KPI（01_prd.md） | `packages/db/queries/kpi.sql` と GitHub Actions の `kpi.yml` | 件数だけを数える SQL（回答の中身は読まない）。K-08・K-16（スマホの幅の画面からの入力の割合）は、回答の手入力の変更履歴（`change_history` の `target_type` が `self_analysis_answer`・`validation_answer`・`plan_answer` で `source = manual` の行）のうち、`client = web_mobile` の行の割合（5.1「クライアントの種類」）。`kpi.yml` が毎月1回と手で動かしたときに、GitHub の環境 `production-backup` の読み取り専用の接続で `make kpi ENV=production` を動かし、件数を実行の要約に出す（ワークフローは 04_deployment-procedure.md 2章）。本番の接続を手元に持たない。結果を見て運営者に渡す手順は 05_operation-runbook.md 6.1 |
