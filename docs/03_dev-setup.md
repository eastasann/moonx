# Dev Setup — moonx

- この文書が持つもの: 開発に要るツールとアカウント、ローカルで動かす手順、初回のクラウドのセットアップ、テストの回し方、ブランチ戦略、つまずいたときの対処
- アーキテクチャ・環境と命名・環境変数・CI のシークレットと変数（置き場所を含む）・make ターゲット・ADR の正は [System Design Doc（SDD）](02-01_system-design-doc.md)。ここには書き写さず、節へのリンクで参照する
- 画面と UX の正は [design-spec](design-spec.md)
- デプロイの手順は [04_deployment-procedure.md](04_deployment-procedure.md)、運用は [05_operation-runbook.md](05_operation-runbook.md)
- 表記: `{DOMAIN}`・`{GCP_PROJECT_ID}`・`{APP_ID}` は SDD 2章のプレースホルダ。`<...>` はその場で調べて入れる値

---

## 1. 必要なツール・アカウント

### ツール

| ツール | バージョン | 用途 | 要る人 |
|---|---|---|---|
| Git | 最近の版 | ソースの取得 | 全員 |
| make | OS 標準 | 実コマンドの入口（Windows は WSL2 を使う） | 全員 |
| Bun | 1.2 以上（CI と同じ版にそろえる） | パッケージ管理・API・テスト | 全員 |
| Docker（Docker Desktop・OrbStack など。Compose v2） | 最近の版 | ローカルの PostgreSQL 17（`make db-up`。開発用の DB `moonx` とテスト用の DB `moonx_test`） | 全員 |
| Node.js | LTS（22 以上） | Expo CLI・Metro・EAS CLI が使う。Web と API は Bun だけで動く | スマホを触る人 |
| EAS CLI（`bun add -g eas-cli`） | `apps/mobile/eas.json` の `cli.version` を満たす版 | 開発ビルド・EAS の環境変数・ストアの鍵（`eas credentials`）。ストア用のビルドと EAS Update は `make mobile-build` / `make mobile-update` から使う | スマホを触る人 |
| Expo の開発ビルド（端末に入れるアプリ） | 開発中のコードと同じ runtime | 実機・エミュレーターで動かす（3.5）。Expo Go は使わない（ADR-003） | スマホを触る人 |
| Xcode | 最新の安定版（macOS のみ） | iOS シミュレーター。任意（EAS の開発ビルドで代わりがきく） | 任意 |
| Android Studio | 最新の安定版 | Android エミュレーター。任意 | 任意 |
| Playwright のブラウザ | リポジトリの Playwright に合う版 | `make test-e2e`（取得するターゲットは SDD 2章「make ターゲット」） | E2E を回す人 |
| Google Cloud CLI（gcloud） | 最新 | 初回のセットアップ・ログの確認・緊急時の操作 | デプロイ・運用をする人 |
| wrangler | 4 以上（`bunx wrangler` で使う） | Worker のシークレット・ログ・ロールバック（デプロイは `make deploy-web`） | デプロイ・運用をする人 |
| Terraform | 1.x の最新 | `make infra-plan` / `make infra-apply` | インフラを触る人 |
| GitHub CLI（gh） | 最新 | PR・昇格・GitHub の環境の設定・ワークフローの確認 | 任意（あると速い） |
| PostgreSQL のクライアント（psql・pg_dump・pg_restore） | 17 | バックアップの復元の確認（05 6.2） | 運用をする人 |

### アカウント（デプロイ時に必要。ローカル開発は GitHub だけでよい。スマホを触る人は Expo も要る）

| サービス | 用途 | 備考 |
|---|---|---|
| GitHub | リポジトリ・GitHub Actions | ローカル開発にも要る（リポジトリへの書き込み権限） |
| Google Cloud | Cloud Run・Artifact Registry・Secret Manager・Cloud Scheduler・Cloud Storage・Cloud Logging / Monitoring | プロジェクト `{GCP_PROJECT_ID}` を staging と production で共有する。請求先アカウントが要る |
| Google OAuth クライアント | Google ログイン | `{GCP_PROJECT_ID}` の中で環境ごとに、コンソールで作る（6章） |
| Cloudflare | `{DOMAIN}` の取得（Registrar）・DNS・Worker `moonx-web-staging` / `moonx-web-production` | |
| Neon | PostgreSQL（プロジェクト `moonx`、DB 名 `moonx`、ブランチ `production` / `staging`） | 無料プラン（枠の扱いは ADR-008） |
| Resend | 招待とパスワード再設定のメール | 無料プラン。`{DOMAIN}` の確認が要る |
| Sentry | エラーの追跡（プロジェクト web / mobile / api） | 無料プラン |
| Expo | EAS Build / Submit / Update・開発ビルド | 無料プラン。スマホを触る人はローカル開発でも要る（開発ビルドを EAS で作るため） |
| Apple Developer Program | App Store・TestFlight | 年会費がかかる（ADR-003）。登録の区分（個人 / 組織）は、登録の前にユーザーが決める（ADR-003。5.4 A） |
| Google Play Console | Google Play | 登録費がかかる（ADR-003）。**個人の開発者アカウント**で登録する（ADR-003）。製品版の最初の公開の前にクローズドテストが要る（条件と手順は 04 4.3） |

---

## 2. リポジトリ構成

構成の正は [SDD 2章「リポジトリ構成」](02-01_system-design-doc.md#リポジトリ構成)。何をどこで管理するかは [SDD 2章「インフラ管理」](02-01_system-design-doc.md#インフラ管理) を見る。

---

## 3. 環境構築手順（30分以内）

ツール（1章）が入っていれば、ここまで30分で Web とスマホが動く。

### 3.1 取得とセットアップ

```bash
git clone git@github.com:<org>/moonx.git
cd moonx
make setup
```

`make setup` の中身は [SDD 2章「make ターゲット」](02-01_system-design-doc.md#make-ターゲット) を見る。

### 3.2 `.env` を埋める

`.env` の置き場所（2つある）と値の正は [SDD 2章「環境変数」](02-01_system-design-doc.md#環境変数)（値は「local の値」の列）。雛形のままでよいものが多く、`make setup` のあとで次だけを埋める（`BETTER_AUTH_SECRET` は `make setup` が入れるので確認だけ）。

| ファイル | 変数 | やること |
|---|---|---|
| `.env` | `BETTER_AUTH_SECRET` | `make setup` が乱数を入れる。空のままだと API が起動しないので、`.env` を手で作った場合は `openssl rand -base64 32` の値を入れる |
| `.env` | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google ログインをローカルで試すときだけ。local 用の OAuth クライアントの値（6章） |
| `.env` | 上の2つ以外 | 雛形のまま（local の値）。`DATABASE_URL_TEST` はテスト用の DB `moonx_test`（7章）。`RESEND_API_KEY`・`PROXY_SHARED_SECRET`・`CRON_OIDC_AUDIENCE` など local で使わないものは空のまま |
| `apps/mobile/.env` | `EXPO_PUBLIC_API_BASE_URL` | スマホで動かすときだけ。開発 PC の IP にする（3.5） |
| `apps/mobile/.env` | `EXPO_PUBLIC_APP_ENV`・`EXPO_PUBLIC_SENTRY_DSN` | 雛形のまま（`local` / 空） |

staging / production の値は `.env` に書かない（置き場所は同じ表の右の列）。

### 3.3 Web と API を動かす

```bash
make dev
```

| 確かめること | 方法 |
|---|---|
| API が動いている | `curl http://localhost:3000/api/health` |
| Web が開く | ブラウザで `http://localhost:5173`（`127.0.0.1` ではなく `localhost` で開く。Cookie のため） |
| 部品を確かめる | ブラウザで `http://localhost:5173/dev/components`（開発サーバーだけ。本番のビルドには入らず、開くと Not Found）。全部品の種類・大きさ・状態を並べ、ページ上部でテーマ（System / Light / Dark）とスケール（Auto / Medium / Large）を切り替えられる。Popover と Tray はウィンドウの幅を `semantic.breakpoint.tablet` の前後に動かして確かめる |
| スマホの部品を確かめる | 開発ビルドを入れた端末かエミュレーターで `moonx://dev/components` を開く（`__DEV__` が真の版だけ。それ以外のビルド（staging・production など）は `/` へ戻す）。Web と同じ並びで全部品を出し、ページ上部でテーマ（System / Light / Dark）を切り替えられる |
| デモのユーザーでログインできる | ユーザーとデータは design-spec 8章 |
| メールの中身 | local ではメールを送らない。招待やパスワード再設定のリンクは `make dev` の出力（API のログ）に出る |

### 3.4 最初の運営者を作る

```bash
make admin-create EMAIL=<自分のメール>
```

表示されたリンクを開いて登録すると、そのユーザーが運営者になる（ADR-010）。staging / production の運営者の作り方は 5.4 L。

### 3.5 スマホで動かす

スマホは Expo の開発ビルド（EAS の profile `development`）で動かす。Expo Go は使わない（ADR-003）。

1. 開発ビルドを端末に入れる（ネイティブの依存が変わったときだけ作り直す）。

   ```bash
   cd apps/mobile
   eas login

   # Android（実機・エミュレーター）
   eas build --profile development --platform android

   # iOS 実機（最初に端末を登録する。Apple Developer Program が要る）
   eas device:create
   eas build --profile development --platform ios

   # iOS シミュレーター（端末の登録は要らない）
   eas build --profile development-simulator --platform ios
   ```

   ビルドが終わったら、EAS の画面の QR コードかリンクから端末に入れる。Xcode / Android Studio があれば手元でビルドしてもよい。

2. `apps/mobile/.env` の `EXPO_PUBLIC_API_BASE_URL` を開発 PC の IP にする。

   ```bash
   # macOS
   ipconfig getifaddr en0
   # Linux
   hostname -I
   ```

   | 動かす先 | `EXPO_PUBLIC_API_BASE_URL` |
   |---|---|
   | 実機（PC と同じ Wi-Fi） | `http://<開発 PC の IP>:3000/api` |
   | Android エミュレーター | `http://10.0.2.2:3000/api` |
   | iOS シミュレーター | `http://localhost:3000/api` でも届く |

3. API と Expo の開発サーバーを起動し、端末の開発ビルドから接続する。

   ```bash
   # リポジトリのルートで
   make dev          # ターミナル1（API と Web）
   make dev-mobile   # ターミナル2（Expo の開発サーバー。QR コードが出る）
   ```

`EXPO_PUBLIC_*` は Metro がバンドルを作るときに埋め込まれる。`apps/mobile/.env` を変えたら `make dev-mobile` を起動し直す。

### 3.6 デモデータ

デモデータ（design-spec 8章）を入れ直すときは `make db-seed`、DB を最初からやり直すときは `make db-reset`。`make db-seed` は全テーブルの中身を消してから入れるので、ローカルで作ったデータは残らない（デモのユーザーのログイン中のセッションだけは残る）。`APP_ENV=local` 以外では動かない。

デモのユーザーでのサインイン、招待の受諾に使うトークンは design-spec 8.1。

---

## 4. PostgreSQL コマンド一覧

ターゲットの定義は [SDD 2章「make ターゲット」](02-01_system-design-doc.md#make-ターゲット)。ここでは使う場面だけを書く。

| 場面 | コマンド |
|---|---|
| DB を起動する / 止める | `make db-up` / `make db-down` |
| `packages/db` のスキーマを変えた | `make db-generate` → できた SQL を読んで確かめる → `make db-migrate` |
| 他の人のマイグレーションを取り込んだ | `make db-migrate` |
| デモデータを入れ直したい（ローカルのデータは消える） | `make db-seed` |
| DB を作り直したい（ローカルのデータは消える） | `make db-reset` |
| 中身を見たい | `make db-studio` |
| テストを動かす | `make test-api`・`make test-e2e`（テスト用の DB `DATABASE_URL_TEST` を使う。開発用の DB `moonx` のデータは消えない。7章） |
| staging / production に当てる | 手では当てない。昇格のときに `deploy.yml` が `make deploy-api` の中でマイグレーションを当てる（04 2章） |

マイグレーションは「追加してから使い、使わなくなってから消す」の2段階で書く（ADR-016。04 4.1）。適用済みのマイグレーションの SQL は書き換えない。

---

## 5. IaC と初回のクラウドセットアップ

### 5.1 ローカルでの使い方

Terraform は `infra/terraform/`（`modules/` と `envs/{shared,staging,production}/`）。`shared` は環境をまたぐ資源、`staging` / `production` は環境ごとの資源（[SDD 2章「インフラ管理」](02-01_system-design-doc.md#インフラ管理)）。直接 `terraform` を打たず、make から動かす。

```bash
# 認証（初回だけ）
gcloud auth login
gcloud auth application-default login
gcloud auth application-default set-quota-project {GCP_PROJECT_ID}

# ENV=shared のときだけ: Cloudflare のゾーンの設定（SDD 2章「インフラ管理」）を扱う
# Terraform 用の Cloudflare のトークン（5.4 A。CI 用とは別。シェルにだけ置き、ファイルに書かない）
read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN

make infra-plan ENV=staging     # 差分の確認（ENV は shared / staging / production）
make infra-apply ENV=staging    # 適用
```

### 5.2 CI/CD との関係

| 対象 | 誰が変えるか |
|---|---|
| `infra/terraform/`（`shared`・`staging`・`production`） | 人が PR に `make infra-plan` の結果を貼り、マージ後に `make infra-apply` を手で動かす。CI は Terraform を動かさない |
| Cloud Run のイメージ（リビジョン） | CI（`deploy.yml` の `make deploy-api`）。Terraform はイメージの変更を無視する（`lifecycle.ignore_changes`。ADR-015） |
| Cloud Run のそれ以外の設定（環境変数・シークレットの参照・台数・メモリ） | Terraform。緊急で `gcloud` から変えたら、あとで Terraform にも同じ変更を入れる（入れないと次の apply で戻る） |
| Worker・静的アセット・Web のドメイン | CI（`deploy.yml` の `make build-web` → `make deploy-web`）。設定は `apps/web/wrangler.jsonc`。`{DOMAIN}` と `staging.{DOMAIN}` の DNS レコードは Worker のカスタムドメインが作る |
| Cloudflare のゾーンの設定（メールの DNS レコード・HSTS・`/api/auth/*` のレート制限ルール。正は [SDD 2章「インフラ管理」](02-01_system-design-doc.md#インフラ管理)） | Terraform（`envs/shared`。Terraform 用の Cloudflare のトークンで動かす。5.1） |
| Google の OAuth の同意画面とクライアント・Neon | コンソール（6章・5.4 E） |
| スマホのビルドと配布 | CI と人（`make mobile-update` / `make mobile-build`。04 2章・4.3） |

### 5.3 tfstate の管理

状態は Cloud Storage のバケット `{GCP_PROJECT_ID}-tfstate` に置く（`shared`・`staging`・`production` とも。ADR-015）。バケットは Terraform の前に手で作る（5.4 B）。バージョニングを有効にして、壊れたら前の版に戻せるようにする。

### 5.4 初回セットアップのチェックリスト（最初のデプロイの前に1回）

上から順に進める。環境ごとに分かれる手順（I・J・L）は、staging で通してから production でくり返す（`staging` を `production` に読み替える）。`shared`（G）は1回だけ。

#### A. アカウントとドメイン

- [ ] 1章のアカウントを作る（本人確認と審査に数日かかるので早めに）。Google Play は個人の開発者アカウントで登録する（ADR-003）
- [ ] Apple Developer Program は、登録の区分（個人 / 組織）をユーザーに決めてもらってから登録する（ADR-003。ストアにアプリを登録する（K）より前に決める）。区分ごとに要るもの:

  | 区分 | 要るもの |
  |---|---|
  | 個人 | 本人の Apple Account（2ファクタ認証を ON）と本人確認。ストアの販売元に個人名が出る |
  | 組織 | 組織の D-U-N-S 番号（取得に日数がかかる）、組織を代表して契約できる権限、組織のウェブサイト |

- [ ] Cloudflare Registrar で `{DOMAIN}` を取る（ゾーンが自動で作られる）。自動更新を ON にする
- [ ] Cloudflare で API トークンを2つ作る（どちらも対象のゾーンは `{DOMAIN}` だけにする）
  - Terraform 用: `envs/shared` が管理する Cloudflare のゾーンの設定（[SDD 2章「インフラ管理」](02-01_system-design-doc.md#インフラ管理) の Cloudflare の行。メールの DNS レコード・HSTS・`/api/auth/*` のレート制限ルール）をすべて変えられる権限にする。`ENV=shared` を動かす人だけが持ち、GitHub には置かない（5.1）
  - CI 用: 権限は [SDD 2章「CI のシークレットと変数」](02-01_system-design-doc.md#環境変数) の `CLOUDFLARE_API_TOKEN` の行のとおり。H で入れる

#### B. Google Cloud の土台

- [ ] プロジェクトを作り、請求先をつなぐ

  ```bash
  gcloud projects create {GCP_PROJECT_ID} --name="moonx"
  gcloud config set project {GCP_PROJECT_ID}
  gcloud billing accounts list
  gcloud billing projects link {GCP_PROJECT_ID} --billing-account=<BILLING_ACCOUNT_ID>
  ```

- [ ] API を有効にする

  ```bash
  gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    secretmanager.googleapis.com \
    cloudscheduler.googleapis.com \
    storage.googleapis.com \
    iam.googleapis.com \
    iamcredentials.googleapis.com \
    sts.googleapis.com \
    cloudresourcemanager.googleapis.com \
    logging.googleapis.com \
    monitoring.googleapis.com \
    billingbudgets.googleapis.com
  ```

- [ ] Terraform の状態のバケットを作る

  ```bash
  gcloud storage buckets create gs://{GCP_PROJECT_ID}-tfstate \
    --location=asia-southeast1 \
    --uniform-bucket-level-access \
    --public-access-prevention
  gcloud storage buckets update gs://{GCP_PROJECT_ID}-tfstate --versioning
  ```

#### C. Google OAuth

- [ ] 同意画面と、環境ごとの OAuth クライアントをコンソールで作る（6章。Terraform では作れない）

#### D. Sentry

- [ ] 組織とプロジェクト web / mobile / api を作る（ADR-023）
- [ ] 各プロジェクトの DSN を控える（web → GitHub の環境の変数 `VITE_SENTRY_DSN`（H）、mobile → EAS の環境変数 `EXPO_PUBLIC_SENTRY_DSN`（K）、api → Cloud Run の `SENTRY_DSN`（Terraform の変数。I））
- [ ] ソースマップのアップロード用の Auth Token を作る（`SENTRY_AUTH_TOKEN`。リポジトリのシークレット（H）と EAS の環境変数（K）の両方に入れる。置き場所の正は [SDD 2章「CI のシークレットと変数」](02-01_system-design-doc.md#環境変数)）
- [ ] 新しい issue のメール通知と、急増の抑制（Spike Protection）を ON にする

#### E. Neon（コンソールで操作する）

- [ ] プロジェクト `moonx` を作る（PostgreSQL 17、リージョン AWS Asia Pacific（Singapore）= ap-southeast-1、DB 名 `moonx`）
- [ ] 既定のブランチの名前を `production` にする
- [ ] `production` から `staging` ブランチを作る（このときはまだ空）。自動で作られた別のブランチがあれば消す
- [ ] 各ブランチの「Connect」で、DB `moonx` への接続文字列を2種類控える

  | 種類 | 見分け方 | 入れる先 |
  |---|---|---|
  | プール接続 | Connection pooling を ON。ホスト名に `-pooler` が付く | Secret Manager `moonx-{env}-database-url`（`DATABASE_URL`。I） |
  | 直接の接続 | Connection pooling を OFF | GitHub の環境 `staging` / `production` のシークレット `DATABASE_URL_DIRECT`（H） |

- [ ] production のブランチに、バックアップ用の読み取り専用のロールを作る（ADR-028。接続文字列は GitHub の環境 `production-backup` の `DATABASE_URL_DIRECT` に入れる。H）。Neon のコンソールの Roles で作ったロールは書き込みもできるので、SQL で作る。`moonx_backup_ro` はロールの名前（ここで決める）。上で控えた production の直接の接続（所有者のロール。マイグレーションを当てるロール）で実行する。`ALTER DEFAULT PRIVILEGES` は実行したロールがこれから作るもの（マイグレーションで作るスキーマ・テーブル・シーケンス）に効く

  ```bash
  ro_password="$(openssl rand -hex 24)"
  psql "<production の直接の接続文字列>" -v ro_password="$ro_password" <<'SQL'
  CREATE ROLE moonx_backup_ro WITH LOGIN PASSWORD :'ro_password';
  GRANT CONNECT ON DATABASE moonx TO moonx_backup_ro;
  GRANT USAGE ON SCHEMA public TO moonx_backup_ro;
  ALTER DEFAULT PRIVILEGES GRANT USAGE ON SCHEMAS TO moonx_backup_ro;
  ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO moonx_backup_ro;
  ALTER DEFAULT PRIVILEGES GRANT SELECT ON SEQUENCES TO moonx_backup_ro;
  SQL

  # H で production-backup に入れる接続文字列（ホストは上の直接の接続と同じ）。控えたら変数を消す
  echo "postgresql://moonx_backup_ro:${ro_password}@<直接の接続のホスト>/moonx?sslmode=require"
  unset ro_password

  # 書けないことを確かめる（permission denied になること）
  psql "<上の接続文字列>" -c 'create table ro_check (x int)'
  ```

  テーブルがすでにある DB に後から作るとき（05 6.2 の戻し方など）は、すでにあるものにも権限を付ける:

  ```sql
  GRANT USAGE ON SCHEMA public, drizzle TO moonx_backup_ro;
  GRANT SELECT ON ALL TABLES IN SCHEMA public, drizzle TO moonx_backup_ro;
  GRANT SELECT ON ALL SEQUENCES IN SCHEMA public, drizzle TO moonx_backup_ro;
  ```

#### F. Resend（ドメインの追加）

- [ ] Resend でドメイン `{DOMAIN}` を追加する（送る相手に近いリージョンを選ぶ。あとから変えられない）
- [ ] 画面に出る DNS レコード（MX・SPF の TXT・DKIM の TXT）を、`envs/shared` の Cloudflare DNS の定義に加える
- [ ] DMARC のレコードを同じく加える: 名前 `_dmarc`、TXT `v=DMARC1; p=none; rua=mailto:<受け取るメール>`（様子を見て `p=quarantine` に上げる）
- [ ] 環境ごとに API キー（送信だけ・`{DOMAIN}` に限る）を作り、控える

#### G. Terraform（`shared`。1回だけ）

`shared` が作るものは [SDD 2章「インフラ管理」](02-01_system-design-doc.md#インフラ管理)（Google Cloud の共有の資源と、Cloudflare のゾーンの設定）。環境ごとの Terraform（I）より先に動かす。

- [ ] `infra/terraform/envs/shared/` の変数に、秘密でない値を入れる（`{GCP_PROJECT_ID}`・`{DOMAIN}`・請求先アカウントの ID・アラートの通知先のメール・GitHub のリポジトリ `<org>/moonx`・F の DNS レコードの値など）
- [ ] Terraform 用の Cloudflare のトークンをシェルに入れ（5.1）、`make infra-plan ENV=shared` で差分を読み、`make infra-apply ENV=shared`
- [ ] できたものを確かめる

  ```bash
  gcloud artifacts repositories describe moonx --location=asia-southeast1
  gcloud storage buckets describe gs://{GCP_PROJECT_ID}-moonx-backups
  gcloud billing budgets list --billing-account=<BILLING_ACCOUNT_ID>

  gcloud iam workload-identity-pools list --location=global
  gcloud iam workload-identity-pools providers list \
    --workload-identity-pool=<POOL_ID> --location=global \
    --format="value(name,attributeCondition)"
  gcloud iam service-accounts list --format="value(email)"
  ```

  - バックアップのバケットが公開されない設定になっていること（05 6.2）
  - 予算アラートの金額が SDD 11章のとおりであること
  - WIF の `attributeCondition` がこのリポジトリ（`<org>/moonx`）に限っていること。プロバイダの `name` とデプロイ用のサービスアカウントのメールは、リポジトリの変数 `GCP_WORKLOAD_IDENTITY_PROVIDER` / `GCP_DEPLOY_SERVICE_ACCOUNT` に入れる（H。鍵は作らない。ADR-027）

- [ ] Cloudflare のダッシュボードで、`{DOMAIN}` のゾーンに SDD 2章「インフラ管理」の設定（HSTS・`/api/auth/*` のレート制限ルール）ができていることを確かめる
- [ ] Resend の画面でドメインの確認（Verify）が通ったことを確かめる

  ```bash
  dig +short TXT resend._domainkey.{DOMAIN}
  dig +short TXT _dmarc.{DOMAIN}
  ```

#### H. GitHub

- [ ] マージを squash だけにし、マージしたブランチを消す

  ```bash
  gh repo edit <org>/moonx \
    --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false \
    --delete-branch-on-merge
  ```

- [ ] Settings → Rules で `main` を守る（PR 必須・`ci.yml` の成功が必須・直接 push しない）
- [ ] GitHub の環境を3つ作る（名前と役割は [SDD 2章「環境と命名」](02-01_system-design-doc.md#環境と命名) の「GitHub の環境」の行）。`production` はデプロイに承認を要する（1人で運用するときは自分を承認者にする）。`production-backup` は承認を付けず、`main` からだけ使えるようにする（`db-backup.yml` は `main` で動く）

  ```bash
  gh api -X PUT repos/<org>/moonx/environments/staging
  gh api -X PUT repos/<org>/moonx/environments/production --input - <<EOF
  {"reviewers":[{"type":"User","id":$(gh api user --jq .id)}]}
  EOF
  gh api -X PUT repos/<org>/moonx/environments/production-backup --input - <<EOF
  {"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
  EOF
  gh api -X POST repos/<org>/moonx/environments/production-backup/deployment-branch-policies \
    -f name=main -f type=branch
  ```

- [ ] CI のシークレットと変数を入れる。名前・置き場所（リポジトリか、どの環境か）・用途の正は [SDD 2章「CI のシークレットと変数」](02-01_system-design-doc.md#環境変数) の表。下のコマンドはその置き場所に合わせている。`build.yml` は GitHub の環境を使わずに動くので、リポジトリに置いたものだけを読む

  ```bash
  # リポジトリ（値を聞かれるものは貼る）
  gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --body '<G で確かめたプロバイダの name>'
  gh variable set GCP_DEPLOY_SERVICE_ACCOUNT     --body '<デプロイ用のサービスアカウントのメール>'
  gh variable set CLOUDFLARE_ACCOUNT_ID          --body '<Cloudflare のアカウント ID>'
  gh secret set   SENTRY_AUTH_TOKEN              # D の Auth Token（EAS にも入れる。K）
  # EXPO_TOKEN は K で入れる

  # 環境 staging / production
  TARGET=staging   # production でもくり返す（値は環境ごとのもの）
  gh secret set   DATABASE_URL_DIRECT  --env $TARGET   # E の直接の接続（所有者のロール）
  gh secret set   CLOUDFLARE_API_TOKEN --env $TARGET   # A の CI 用のトークン
  gh variable set VITE_SENTRY_DSN      --env $TARGET --body '<Sentry web の DSN>'
  gh variable set VITE_APP_ENV         --env $TARGET --body "$TARGET"

  # 環境 production-backup（db-backup.yml だけが使う）
  gh secret set   DATABASE_URL_DIRECT --env production-backup   # E の読み取り専用のロールの接続文字列

  gh variable list && gh secret list
  gh secret list --env production-backup
  ```

#### I. Terraform（`staging` / `production`。初回は2回に分けて apply する）

初回は API のイメージとシークレットの値がまだ無いので、2回に分ける（ADR-015）。1回目でシークレットの入れ物などを作り、値とイメージを入れてから、2回目で Cloud Run と Cloud Scheduler を作る。

1. - [ ] `infra/terraform/envs/staging/` の変数に、秘密でない値を入れる（`{GCP_PROJECT_ID}`・`{DOMAIN}`・`GOOGLE_CLIENT_ID`・`SENTRY_DSN`・staging の `MAIL_ALLOWLIST` など）と、`bootstrap = true`
2. - [ ] 1回目: `make infra-plan ENV=staging` で差分を読み、`make infra-apply ENV=staging`（できるものは ADR-015 の②）
3. - [ ] シークレットの値を入れる（下の「シークレットの値」）
4. - [ ] API のイメージがあることを確かめる。H のあとで `main` にマージすると、`build.yml` が作って Artifact Registry に置く（`build.yml` はリポジトリの変数の WIF で入る。H。production は staging と同じイメージを使う）

   ```bash
   gcloud artifacts docker images list \
     asia-southeast1-docker.pkg.dev/{GCP_PROJECT_ID}/moonx/api --include-tags
   ```

5. - [ ] 2回目: `bootstrap = false` と、変数 `api_image` に 4 のイメージを入れて `make infra-apply ENV=staging`。Cloud Run `moonx-api-staging` と Cloud Scheduler のジョブ `moonx-staging-due-notifications` ができる。以後のイメージは CI が出す（ADR-015）
6. - [ ] cron の設定を確かめる。Cloud Run の環境変数 `CRON_OIDC_AUDIENCE` と、ジョブの `oidcToken.audience` が1文字も違わないこと（値の決まりは [SDD 2章「環境変数」](02-01_system-design-doc.md#環境変数)）。ジョブの `oidcToken.serviceAccountEmail` が `CRON_INVOKER_EMAIL` と同じこと。ジョブを手で1回動かし、成功を確かめる

   ```bash
   gcloud run services describe moonx-api-staging --region=asia-southeast1 \
     --format="yaml(spec.template.spec.containers[0].env)" | grep -A1 -E 'CRON_OIDC_AUDIENCE|CRON_INVOKER_EMAIL'
   gcloud scheduler jobs describe moonx-staging-due-notifications --location=asia-southeast1 \
     --format="yaml(httpTarget.uri,httpTarget.oidcToken)"
   gcloud scheduler jobs run moonx-staging-due-notifications --location=asia-southeast1
   ```

7. - [ ] production だけ: Terraform が作った稼働時間チェックとアラートが、G の通知のチャンネル（メール）に向いていることを Cloud Monitoring の画面で確かめる（05 2章）

**シークレットの値（Secret Manager）**

Terraform はシークレットの入れ物だけを作る。値は手で入れる（tfstate に値を残さないため）。値をコマンドの引数に書かない（シェルの履歴に残る）。

```bash
TARGET=staging   # production のときは production

# Neon のプール接続・Google の client secret・Resend の API キー（貼り付けて Enter。画面には出ない）
read -rs VALUE; printf '%s' "$VALUE" | gcloud secrets versions add moonx-$TARGET-database-url --data-file=-; unset VALUE
read -rs VALUE; printf '%s' "$VALUE" | gcloud secrets versions add moonx-$TARGET-google-client-secret --data-file=-; unset VALUE
read -rs VALUE; printf '%s' "$VALUE" | gcloud secrets versions add moonx-$TARGET-resend-api-key --data-file=-; unset VALUE

# セッションの署名鍵（入れ替えると全員がログアウトする。05 3.15）
openssl rand -base64 32 | tr -d '\n' | gcloud secrets versions add moonx-$TARGET-better-auth-secret --data-file=-

# Worker と API の共有シークレット（同じ値を Worker にも入れる。J）。初回は1つの値だけ
proxy_secret="$(openssl rand -hex 32)"
printf '%s' "$proxy_secret" | gcloud secrets versions add moonx-$TARGET-proxy-shared-secret --data-file=-
```

#### J. Cloudflare Worker

- [ ] I と同じシェルで、共有シークレットを Worker `moonx-web-staging` に入れる（Worker がまだ無ければ、作るかを聞かれるので作る）

  ```bash
  cd apps/web
  bunx wrangler login
  printf '%s' "$proxy_secret" | bunx wrangler secret put PROXY_SHARED_SECRET --env $TARGET
  unset proxy_secret
  ```

- [ ] Cloud Run の URL を `apps/web/wrangler.jsonc` の env `staging` の `vars` の `API_ORIGIN` に書き、PR で入れる

  ```bash
  gcloud run services describe moonx-api-$TARGET --region=asia-southeast1 --format="value(status.url)"
  ```

- [ ] `wrangler.jsonc` の env `staging` に、カスタムドメイン `staging.{DOMAIN}`（production は `{DOMAIN}`）を書く。DNS レコードは、最初の `make deploy-web` のときに Worker のカスタムドメインが作る。同じホスト名のレコードを Terraform では作らない（二重に作らない）

#### K. Expo / EAS とストア（1回だけ）

- [ ] EAS のプロジェクトを作り、チャンネルを用意する

  ```bash
  cd apps/mobile
  eas login
  eas init        # 表示された projectId を app.config.ts に設定する
  eas channel:create staging
  eas channel:create production
  ```

- [ ] `eas.json` の profile・チャンネル・EAS の環境を、[SDD 2章「環境と命名」](02-01_system-design-doc.md#環境と命名) の「スマホ」の行に合わせる
- [ ] EAS の環境変数を、`preview` と `production` の両方に入れる。名前と値の正は [SDD 2章「環境変数」](02-01_system-design-doc.md#環境変数)（`EXPO_PUBLIC_*`）と「CI のシークレットと変数」（`SENTRY_AUTH_TOKEN`）

  ```bash
  # staging（EAS の環境 preview）
  eas env:create --environment preview --name EXPO_PUBLIC_API_BASE_URL --value "https://staging.{DOMAIN}/api" --visibility plaintext
  eas env:create --environment preview --name EXPO_PUBLIC_APP_ENV --value staging --visibility plaintext
  eas env:create --environment preview --name EXPO_PUBLIC_SENTRY_DSN --value '<Sentry mobile の DSN>' --visibility plaintext
  # production（EAS の環境 production）も同じく入れる。URL は https://{DOMAIN}/api、APP_ENV は production

  # SENTRY_AUTH_TOKEN（D の Auth Token。visibility は secret。両方の環境に入れる）
  read -rs VALUE
  eas env:create --environment preview    --name SENTRY_AUTH_TOKEN --value "$VALUE" --visibility secret
  eas env:create --environment production --name SENTRY_AUTH_TOKEN --value "$VALUE" --visibility secret
  unset VALUE

  eas env:list --environment preview
  eas env:list --environment production
  ```

- [ ] expo.dev の Access tokens で CI 用のトークンを作り、リポジトリのシークレットに入れる: `gh secret set EXPO_TOKEN`
- [ ] App Store Connect でアプリを2つ作る（A で決めた区分で Apple Developer Program に登録してから）: `{APP_ID}`（production）と `{APP_ID}.staging`（staging。TestFlight だけで使う）
- [ ] App Store Connect の API キー（App Manager）を作り、EAS に登録する: `eas credentials --platform ios`
- [ ] Google Play Console（個人の開発者アカウント）でアプリを2つ作る: `{APP_ID}` と `{APP_ID}.staging`（staging は内部テストだけで使う）
- [ ] Google Play に提出するためのサービスアカウントと JSON 鍵を作り、Play Console の「ユーザーと権限」で招待し、EAS に登録する: `eas credentials --platform android`（鍵は EAS にだけ置き、手元のファイルは消す）
- [ ] Android の最初の1回は、それぞれのアプリで Play Console に手で上げる（EAS Submit は2回目から使える。04 4.3）
- [ ] `{APP_ID}` のクローズドテストのテスターを集め始める（条件と段取りは 04 4.3）

#### L. 最初のデプロイと運営者

- [ ] `build.yml` が API のイメージを作ったことを確かめる（I の 4）
- [ ] staging の昇格の PR を出してマージする（04 4.2）。最初の `make deploy-web` で `staging.{DOMAIN}` のカスタムドメインができる
- [ ] staging の運営者を作る。`make admin-create` は `DATABASE_URL` と `BETTER_AUTH_URL` を使うので、この2つを上書きして手元から動かす（リンクが staging の URL になっていることを確かめる）

  ```bash
  DATABASE_URL="$(gcloud secrets versions access latest --secret=moonx-staging-database-url)" \
  BETTER_AUTH_URL="https://staging.{DOMAIN}" \
  make admin-create EMAIL=<運営者のメール>
  ```

- [ ] 運営者でログインし、デプロイ後の確認（04 6章）だけに使うワークスペースを1つ作る（M7）。以後の確認は毎回このワークスペースで行う。審査用のワークスペース（04 4.3）とは別にする
- [ ] staging の `MAIL_ALLOWLIST` に、確かめに使うメールを入れる（Terraform の変数。`make infra-apply ENV=staging`）
- [ ] デプロイ後の確認をする（04 6章）
- [ ] production でも、昇格（GitHub の環境 `production` の承認が要る）・運営者の作成（`moonx-production-database-url`・`https://{DOMAIN}`）・確認用のワークスペースの作成・デプロイ後の確認をする
- [ ] production の最初のデプロイのあとで、`db-backup.yml` を手で1回動かし、バックアップができることを確かめる（GitHub の環境 `production-backup` の確認を兼ねる。05 6.2）

  ```bash
  gh workflow run db-backup.yml
  gh run list --workflow=db-backup.yml --limit=1
  ```

---

## 6. OAuth のセットアップ（Google）

Google ログインは API（Better Auth）を通る。スマホもシステムのブラウザで同じ流れを使い、`moonx://`（staging は `moonx-staging://`）で戻る。そのため OAuth クライアントは「ウェブ アプリケーション」だけを作り、iOS / Android 用のクライアントは作らない。同意画面とクライアントは Terraform では作れないので、コンソールで管理する（[SDD 2章「インフラ管理」](02-01_system-design-doc.md#インフラ管理)）。

### 同意画面（プロジェクトに1つ）

1. Google Cloud Console → Google Auth Platform（旧: OAuth 同意画面）
2. ブランディング: アプリ名 `moonx`、サポートのメール、承認済みドメイン `{DOMAIN}`
3. 対象: 外部。公開ステータスを「本番環境」にする（「テスト」のままだと、登録したテストユーザーしかログインできない）
4. スコープ: `openid`・`email`・`profile` だけ

### クライアント（環境ごと）

Google Auth Platform → クライアント → クライアントを作成 → 種類「ウェブ アプリケーション」。

| 環境 | 承認済みの JavaScript 生成元 | 承認済みのリダイレクト URI | ID / SECRET の置き場所 |
|---|---|---|---|
| local | `http://localhost:5173` | `http://localhost:5173/api/auth/callback/google` | 直下の `.env` の `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` |
| staging | `https://staging.{DOMAIN}` | `https://staging.{DOMAIN}/api/auth/callback/google` | ID は Terraform の変数、SECRET は `moonx-staging-google-client-secret` |
| production | `https://{DOMAIN}` | `https://{DOMAIN}/api/auth/callback/google` | ID は Terraform の変数、SECRET は `moonx-production-google-client-secret` |

- リダイレクト URI は `BETTER_AUTH_URL` ＋ `/api/auth/callback/google` と1文字も違わないこと
- local の Google ログインはブラウザ（と iOS シミュレーター）でだけ確かめる。実機と Android エミュレーターでは `localhost` に戻れない（11章）。スマホの Google ログインは staging で確かめる

---

## 7. テスト実行

```bash
make db-up         # test-api・test-e2e の前に（DB が起動していなければ）

make test
make test-domain
make test-api
make test-web
make test-mobile
make test-e2e

make lint
make format
make typecheck
```

`make test-e2e` は `e2e/playwright.config.ts` の `webServer` で、API（ポート 3100）と Web（ポート 5273）を専用に起動する。開発サーバー（3000・5173）は止めなくてよい。実行のたびに `DATABASE_URL_TEST` の DB を作り直してデモデータを入れる（`e2e/global-setup.ts`）。Better Auth はログインの回数をアドレスごとに数えるので、テストは `CF-Connecting-IP` をテストごとに変えて送る（`e2e/fixtures.ts`）。

各ターゲットが何を動かすかは [SDD 2章「make ターゲット」](02-01_system-design-doc.md#make-ターゲット)、テスト用の DB（`DATABASE_URL_TEST`）は SDD 2章「環境変数」、ツールの選定は ADR-022、テストの方針は SDD 10章。PR では CI が同じターゲットを動かす（04 2章）。

---

## 8. 主要コマンド（Makefile）

**Makefile が実コマンドの唯一の正。** ターゲットの一覧と内容は [SDD 2章「make ターゲット」](02-01_system-design-doc.md#make-ターゲット) にだけ書く（ここには書き写さない）。

- ドキュメント・CI・実装の指示は、ターゲット名だけを書く
- コマンドを変えるときは Makefile だけを直す
- ターゲットを足すときは、Makefile と SDD 2章の表を同じ PR で直す
- makeは macOS / Linux に標準で入っている。Windows では WSL2 を使う

---

## 9. ブランチ戦略・リリースフロー

GitHub Flow ＋ バージョン宣言ファイルによる環境の昇格（ADR-016）。長く残るブランチは `main` だけ。リリースはブランチではなく、`deploy/{staging,production}/version`（デプロイするコミット SHA）で管理する。

```
feature/xxx ──squash──▶ main ──build.yml──▶ API のイメージ（タグ = コミット SHA）
fix/xxx     ──squash──▶   │
                          ├─ 昇格の PR（deploy/staging/version = SHA）────────▶ staging
                          └─ 昇格の PR（deploy/production/version = 同じ SHA）─▶ production（承認のあと）
```

| ブランチ | 用途 |
|---|---|
| `main` | 唯一の長く残るブランチ。直接 push しない |
| `feature/xxx` | 新しい機能。例: `feature/pitch-deck-pdf` |
| `fix/xxx` | バグの修正。例: `fix/invite-expiry` |
| `promote/{env}-<SHA の先頭7文字>` | 昇格の PR。`deploy/{env}/version` だけを変える |

### マージの方式

- コードの PR（feature / fix → main）は**常に squash マージ**。1 PR = 1 コミット = 1 つの意図
- 環境ごとのブランチ（develop など）は使わない。環境の差はバージョン宣言ファイルだけで表す

### リリースフロー（環境の昇格）

1. `main` に squash マージ → `build.yml` がテストし、API のイメージ（タグ = コミット SHA）を Artifact Registry に置く（`make build-api-image`）
2. その SHA を `deploy/staging/version` に書いた昇格の PR をマージ → `deploy.yml` が staging にデプロイする（マイグレーション → API → Web。Web はその SHA から環境ごとにビルドする）
3. staging で確かめたら、同じ SHA を `deploy/production/version` に書いた昇格の PR をマージ → GitHub の環境 `production` の承認のあと、production にデプロイする
4. 戻すときは昇格の PR を revert する

スマホも同じ昇格で出す（EAS Update か、EAS Build と Submit かは、`deploy.yml` が Expo の fingerprint で選ぶ。04 2章）。版の呼び方は、Web と API がコミット SHA。スマホのストアの版は `app.config.ts` の version（SemVer）。手順の詳細は [04_deployment-procedure.md](04_deployment-procedure.md)。

### PR のルール

- `main` へのマージは PR 必須（squash）。CI（`ci.yml`）が通ること
- 1人のときはセルフレビューでよい
- PR は `.github/PULL_REQUEST_TEMPLATE.md` に従って書く。昇格の PR には、対象の SHA・staging での確認の結果・マイグレーションとネイティブの変更の有無・戻し方を書く（04 4.2）
- squash したコミットの件名は PR のタイトルになる。PR のタイトルもコミットの規約に合わせる

### コミットメッセージ

- Conventional Commits（`feat:`・`fix:`・`refactor:`・`docs:`・`test:`・`chore:`）。範囲が分かるときは付ける（例: `feat(api):`・`fix(mobile):`）。昇格は `chore(deploy): promote production to <短い SHA>`
- 言語は既存のコミットに合わせる（履歴が無ければ英語）
- トレーラー（`Co-Authored-By`、セッションの URL など）は付けない。ツールが既定で付けようとしても、この規約を優先する
- 件名は50字を目安に、72字を超えない。本文は件名との間に空行を置き、表示幅72カラムで折り返す（全角は2カラム）
- 本文には diff から分からないこと（なぜ変えたか・採らなかった案・確かめた範囲）だけを書く。変更したファイルの一覧は書かない

---

## 10. Linter / Formatter

| ツール | 対象 | 実行 | 設定 |
|---|---|---|---|
| Biome | TypeScript・TSX・JSON の検査と整形 | `make lint` / `make format` | リポジトリのルートの Biome の設定 |
| TypeScript | 全パッケージの型チェック（Eden Treaty の型を含む） | `make typecheck` | 各パッケージの tsconfig |
| 画面のスタイルの禁止 | `apps/web`・`apps/mobile` の画面で `@vanilla-extract/css`・`StyleSheet`・Unistyles を直接使わない、`style` 属性に値を書かない（見た目は `packages/ui-web` / `packages/ui-native` の部品だけで作る。ADR-025） | `make lint`（Biome の `noRestrictedImports`）と CI の検査 | リポジトリのルートの Biome の設定 |
| デザイントークンの生成物 | `packages/ui-tokens`（vanilla-extract・Unistyles・react-pdf のテーマ）が `docs/06_design-tokens.json` と合っているか | CI が `make tokens` を動かし、差分が出たら失敗（ADR-018） | — |
| doc-lint | コミットの前: 先送りのマーカー・不要な `.gitkeep`・`.env` や既知の形式のトークン・ドキュメントの文体（本文の em dash・表の1列目の太字・長すぎる太字）。随時: ドキュメントと実体の食い違い（存在しない make ターゲットの参照・`docs/README.md` のリンク切れ） | コミットのたびに `.githooks/pre-commit`（`make setup` が配線する）、随時 `make doc-lint` | `scripts/doc-lint.sh` |

エディタは Biome の拡張を入れ、保存のときに整形する。

---

## 11. よくあるトラブルシューティング

| 問題 | 原因 | 解決策 |
|---|---|---|
| `make db-up` が失敗する | Docker が起動していない | Docker を起動し、`docker info` が通るのを確かめる |
| `make db-up` でポート 5432 が使われている | 別の PostgreSQL（Homebrew など）が動いている | `lsof -nP -iTCP:5432 -sTCP:LISTEN` で確かめて止める（例: `brew services stop postgresql@17`） |
| `relation "..." does not exist` | マイグレーションが当たっていない | `make db-migrate` |
| マイグレーションが途中で失敗する・順番が合わない | 手で SQL を直した、ブランチを行き来した | `make db-reset`（ローカルのデータは消える） |
| `make dev` で 3000 / 5173 が使われている | 前のプロセスが残っている | `lsof -nP -iTCP:3000 -sTCP:LISTEN` で確かめて止める |
| Web で API が 404・接続できない | `make dev-web` だけを起動している | `make dev`（API も起動する）。`curl http://localhost:3000/api/health` |
| ログインしても戻される・Cookie が残らない | `http://127.0.0.1:5173` で開いている | `http://localhost:5173` で開く（`BETTER_AUTH_URL` と `TRUSTED_ORIGINS` に合わせる） |
| ログインやフォームが 403 `Invalid origin` | `TRUSTED_ORIGINS` にオリジンが無い | 直下の `.env` を local の値に戻す |
| Google ログインで `redirect_uri_mismatch` | local 用の OAuth クライアントにリダイレクト URI が無い | `http://localhost:5173/api/auth/callback/google` を登録する（6章） |
| Google ログインで `Error 403: access_denied` | 同意画面が「テスト」で、自分がテストユーザーでない | 同意画面を「本番環境」にするか、テストユーザーに足す |
| Google ログインが「招待が無い」で止まる | 招待制（ADR-010）。そのメールあての有効な招待が無い | 招待を出してから、招待の画面から Google ログインを始める |
| スマホの実機で Google ログインから戻らない | `BETTER_AUTH_URL` が `localhost` で、実機から届かない | ローカルではメール＋パスワードで確かめる。Google ログインは staging で確かめる |
| スマホから API に繋がらない | IP が違う、別の Wi-Fi、PC のファイアウォール | `apps/mobile/.env` の `EXPO_PUBLIC_API_BASE_URL` を見直し、`make dev-mobile` を起動し直す。端末のブラウザで `http://<開発 PC の IP>:3000/api/health` が開くか確かめる |
| iPhone から API に繋がらない（IP は正しい） | ローカルネットワークの許可が無い | iPhone の設定 → プライバシーとセキュリティ → ローカルネットワークで開発ビルドを許可する |
| Expo Go で開くと動かない（Unistyles などのエラー） | Expo Go は使わない作り（ADR-003） | 開発ビルドで開く（3.5） |
| スマホで `http://` に繋がらない | ストア用（release）のビルドで動かしている | 開発ビルド（`--profile development`）を使う |
| 開発ビルドで「ネイティブのモジュールが無い」 | ネイティブの依存が変わった | 開発ビルドを作り直す（3.5 の `eas build --profile development`） |
| `.env` を変えてもスマホに反映されない | `EXPO_PUBLIC_*` を直下の `.env` に書いた、Metro を起動し直していない | `apps/mobile/.env` に書き、`make dev-mobile` を起動し直す |
| 招待やパスワード再設定のメールが来ない | local はメールを送らない（`MAIL_TRANSPORT=console`） | `make dev` の出力（API のログ）に出るリンクを使う |
| 期限の通知を試したい | 定期実行は local に無い | `make cron-due`（local だけ。staging ではジョブを手で実行する。04 4.1） |
| 色や余白が古いまま | トークンの生成物が古い | `make tokens` |
| CI が「トークンの差分」で落ちる | `make tokens` の実行を忘れた | `make tokens` を動かしてコミットする |
| `make lint` が画面のスタイルで落ちる | 画面で `StyleSheet`・`@vanilla-extract/css`・Unistyles・`style` 属性を使った（ADR-025） | 部品（`packages/ui-web` / `packages/ui-native`）を使う。要る見た目が無ければ、design-spec 4.5 に部品を足してから作る |
| API を変えたら Web・スマホで型エラー | Eden Treaty の型が変わった（ADR-006） | `make typecheck` で場所を確かめて直す |
| `make test-api` が DB に繋がらない | DB が起動していない、直下の `.env` に `DATABASE_URL_TEST` が無い | `make db-up`。`.env` に雛形の `DATABASE_URL_TEST` があるか確かめる |
| `make test-e2e` でブラウザが無い | Playwright のブラウザが入っていない（Playwright の版を上げた） | `bunx playwright install chromium` |
| `bun install` で lockfile に差分が出る | Bun の版が CI と違う | CI と同じ版の Bun にする |
