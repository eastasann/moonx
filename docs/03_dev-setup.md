# Dev Setup — moonx

- この文書が持つもの: 開発に要るツールとアカウント、ローカルで動かす手順、初回のクラウドのセットアップ、テストの回し方、ブランチ戦略、つまずいたときの対処
- アーキテクチャ・環境と命名・環境変数・make ターゲット・ADR の正は [System Design Doc（SDD）](02-01_system-design-doc.md)。ここには書き写さず、節へのリンクで参照する
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
| Docker（Docker Desktop・OrbStack など。Compose v2） | 最近の版 | ローカルの PostgreSQL 17（`make db-up`） | 全員 |
| Node.js | LTS（22 以上） | Expo CLI・Metro・EAS CLI が使う。Web と API は Bun だけで動く | スマホを触る人 |
| EAS CLI（`bun add -g eas-cli`） | `apps/mobile/eas.json` の `cli.version` を満たす版 | 開発ビルド・ストア用ビルド・提出・EAS Update | スマホを触る人 |
| Expo の開発ビルド（端末に入れるアプリ） | 開発中のコードと同じ runtime | 実機・エミュレーターで動かす（3.5） | スマホを触る人 |
| Xcode | 最新の安定版（macOS のみ） | iOS シミュレーター。任意（EAS の開発ビルドで代わりがきく） | 任意 |
| Android Studio | 最新の安定版 | Android エミュレーター。任意 | 任意 |
| Playwright のブラウザ | リポジトリの Playwright に合う版 | `make test-e2e`。初回だけ `bunx playwright install chromium` | E2E を回す人 |
| Google Cloud CLI（gcloud） | 最新 | 初回のセットアップ・ログの確認・緊急時の操作 | デプロイ・運用をする人 |
| wrangler | 4 以上（`bunx wrangler` で使う） | Worker のシークレット・ログ・ロールバック | デプロイ・運用をする人 |
| Terraform | 1.x の最新 | `make infra-plan` / `make infra-apply` | インフラを触る人 |
| GitHub CLI（gh） | 最新 | PR・昇格・ワークフローの確認 | 任意（あると速い） |
| PostgreSQL のクライアント（psql・pg_dump・pg_restore） | 17 | バックアップの復元の確認（05 6.2） | 運用をする人 |

### アカウント（デプロイ時に必要。ローカル開発は GitHub だけでよい）

| サービス | 用途 | 備考 |
|---|---|---|
| GitHub | リポジトリ・GitHub Actions | ローカル開発にも要る（リポジトリへの書き込み権限） |
| Google Cloud | Cloud Run・Artifact Registry・Secret Manager・Cloud Scheduler・Cloud Storage・Cloud Logging / Monitoring | プロジェクト `{GCP_PROJECT_ID}` を staging と production で共有する。請求先アカウントが要る |
| Google OAuth クライアント | Google ログイン | `{GCP_PROJECT_ID}` の中で環境ごとに作る（6章） |
| Cloudflare | `{DOMAIN}` の取得（Registrar）・DNS・Worker `moonx-web` | |
| Neon | PostgreSQL（プロジェクト `moonx`、ブランチ `production` / `staging`） | 無料プラン |
| Resend | 招待とパスワード再設定のメール | 無料プラン。`{DOMAIN}` の確認が要る |
| Sentry | エラーの追跡（プロジェクト web / mobile / api） | 無料プラン |
| Expo | EAS Build / Submit / Update | 無料プラン |
| Apple Developer Program | App Store・TestFlight | 年 $99。組織で登録する（D-U-N-S 番号が要る） |
| Google Play Console | Google Play | $25（1回）。組織で登録する（個人だと本番公開の前に長いクローズドテストが要る） |

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

# 依存の取得・.env の雛形のコピー・DB の起動・マイグレーション・シード・トークンの生成
make setup
```

`make setup` の中身は [SDD 2章「make ターゲット」](02-01_system-design-doc.md#make-ターゲット) を見る。

### 3.2 `.env` を埋める

`make setup` が雛形から `.env` を作る。値の正は [SDD 2章「環境変数」](02-01_system-design-doc.md#環境変数) の「local の値」の列。雛形のままでよいものが多い。

| 変数 | やること |
|---|---|
| `APP_ENV`・`PORT`・`DATABASE_URL`・`DATABASE_URL_DIRECT`・`BETTER_AUTH_URL`・`TRUSTED_ORIGINS`・`MAIL_TRANSPORT`・`MAIL_FROM`・`LOG_LEVEL` | 雛形のまま（local の値） |
| `BETTER_AUTH_SECRET` | 乱数を入れる: `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google ログインをローカルで試すときだけ。local 用の OAuth クライアントの値（6章） |
| `EXPO_PUBLIC_API_BASE_URL` | スマホで動かすときだけ。`http://<開発 PC の IP>:3000/api`（3.5） |
| `RESEND_API_KEY`・`PROXY_SHARED_SECRET`・`API_ORIGIN`・`CRON_OIDC_AUDIENCE`・`CRON_INVOKER_EMAIL`・`AVATAR_BUCKET`・`SENTRY_DSN` | 空のまま（local では使わない） |

### 3.3 Web と API を動かす

```bash
make dev
```

| 確かめること | 方法 |
|---|---|
| API が動いている | `curl http://localhost:3000/api/health` |
| Web が開く | ブラウザで `http://localhost:5173`（`127.0.0.1` ではなく `localhost` で開く。Cookie のため） |
| デモのユーザーでログインできる | ユーザーとデータは design-spec 8章 |
| メールの中身 | local ではメールを送らない。招待やパスワード再設定のリンクは `make dev` の出力（API のログ）に出る |

### 3.4 最初の運営者を作る

```bash
make admin-create EMAIL=<自分のメール>
```

表示されたリンクを開いて登録すると、そのユーザーが運営者になる（ADR-010）。

### 3.5 スマホで動かす

1. 開発ビルドを端末に入れる（ネイティブの依存が変わったときだけ作り直す）。

   ```bash
   cd apps/mobile
   eas login

   # Android（実機・エミュレーター）
   eas build --profile development --platform android

   # iOS 実機（最初に端末を登録する。Apple Developer Program が要る）
   eas device:create
   eas build --profile development --platform ios
   ```

   ビルドが終わったら、EAS の画面の QR コードかリンクから端末に入れる。Xcode / Android Studio があれば手元でビルドしてもよい。

2. `.env` の `EXPO_PUBLIC_API_BASE_URL` を開発 PC の IP にする。

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

`EXPO_PUBLIC_*` は起動時に埋め込まれる。`.env` を変えたら `make dev-mobile` を起動し直す。

### 3.6 デモデータ

`make db-seed` が design-spec 8章のデモデータを入れる（`make setup` の中でも動く）。最初からやり直すときは `make db-reset`。

---

## 4. PostgreSQL コマンド一覧

ターゲットの定義は [SDD 2章「make ターゲット」](02-01_system-design-doc.md#make-ターゲット)。ここでは使う場面だけを書く。

| 場面 | コマンド |
|---|---|
| DB を起動する / 止める | `make db-up` / `make db-down` |
| `packages/db` のスキーマを変えた | `make db-generate` → できた SQL を読んで確かめる → `make db-migrate` |
| 他の人のマイグレーションを取り込んだ | `make db-migrate` |
| デモデータを入れ直したい | `make db-seed` |
| DB を作り直したい（ローカルのデータは消える） | `make db-reset` |
| 中身を見たい | `make db-studio` |
| staging / production に当てる | 手では当てない。デプロイのときに CI が `make db-migrate` を動かす（04 2章） |

マイグレーションは「追加してから使い、使わなくなってから消す」の2段階で書く（ADR-016。04 4.1）。適用済みのマイグレーションの SQL は書き換えない。

---

## 5. IaC と初回のクラウドセットアップ

### 5.1 ローカルでの使い方

Terraform は `infra/terraform/`（`modules/` と `envs/{staging,production}/`）。直接 `terraform` を打たず、make から動かす。

```bash
# 認証（初回だけ）
gcloud auth login
gcloud auth application-default login
gcloud auth application-default set-quota-project {GCP_PROJECT_ID}

# Cloudflare の DNS を扱うためのトークン（シェルにだけ置く。ファイルに書かない）
read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN

make infra-plan ENV=staging     # 差分の確認
make infra-apply ENV=staging    # 適用
```

### 5.2 CI/CD との関係

| 対象 | 誰が変えるか |
|---|---|
| `infra/terraform/` | 人が PR に `make infra-plan` の結果を貼り、マージ後に `make infra-apply` を手で動かす。CI は Terraform を動かさない |
| Cloud Run のイメージ（リビジョン） | CI（`gcloud run deploy`）。Terraform はイメージの差分を無視する設定にする（そうしないと apply でイメージが戻る） |
| Cloud Run のそれ以外の設定（環境変数・シークレットの参照・台数・メモリ） | Terraform。緊急で `gcloud` から変えたら、あとで Terraform にも同じ変更を入れる |
| Worker と静的アセット | CI（`wrangler deploy`）。設定は `apps/web/wrangler.jsonc` |
| スマホのビルドと配布 | CI と人（EAS。04 2章・4.3） |

### 5.3 tfstate の管理

状態は Cloud Storage のバケット `{GCP_PROJECT_ID}-tfstate` に置く（ADR-015）。バケットは Terraform の前に手で作る（5.4 B）。バージョニングを有効にして、壊れたら前の版に戻せるようにする。

### 5.4 初回セットアップのチェックリスト（最初のデプロイの前に1回）

上から順に進める。環境ごとに分かれる手順（G・H・I・M）は、staging で通してから production でくり返す（`staging` を `production` に読み替える）。

#### A. アカウントとドメイン

- [ ] 1章のアカウントを作る（Apple と Google Play は組織で登録する。審査に数日かかるので早めに）
- [ ] Cloudflare Registrar で `{DOMAIN}` を取る（ゾーンが自動で作られる）。自動更新を ON にする
- [ ] Cloudflare で API トークンを2つ作る: Terraform 用（対象ゾーンの DNS の編集）と CI 用（Workers の編集。「Edit Cloudflare Workers」のテンプレート）

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

- [ ] 同意画面と、環境ごとの OAuth クライアントを作る（6章）

#### D. Sentry

- [ ] 組織とプロジェクト web / mobile / api を作る（ADR-023）
- [ ] 各プロジェクトの DSN を控える（web → GitHub の変数 `VITE_SENTRY_DSN`、mobile → `eas.json` の `EXPO_PUBLIC_SENTRY_DSN`、api → Cloud Run の `SENTRY_DSN`）
- [ ] 新しい issue のメール通知と、急増の抑制（Spike Protection）を ON にする

#### E. Neon（コンソールで操作する）

- [ ] プロジェクト `moonx` を作る（PostgreSQL 17、リージョン AWS Asia Pacific（Singapore）= ap-southeast-1）
- [ ] 既定のブランチの名前を `production` にする
- [ ] `production` から `staging` ブランチを作る（このときはまだ空）。自動で作られた別のブランチがあれば消す
- [ ] 各ブランチの「Connect」で接続文字列を2種類控える

  | 種類 | 見分け方 | 入れる先 |
  |---|---|---|
  | プール接続 | Connection pooling を ON。ホスト名に `-pooler` が付く | Secret Manager `moonx-{env}-database-url`（`DATABASE_URL`） |
  | 直接の接続 | Connection pooling を OFF | GitHub の environment のシークレット `DATABASE_URL_DIRECT`（マイグレーション用） |

#### F. Resend（ドメインの追加）

- [ ] Resend でドメイン `{DOMAIN}` を追加する（送る相手に近いリージョンを選ぶ。あとから変えられない）
- [ ] 画面に出る DNS レコード（MX・SPF の TXT・DKIM の TXT）を、Terraform の Cloudflare DNS の定義に加える
- [ ] DMARC のレコードを同じく加える: 名前 `_dmarc`、TXT `v=DMARC1; p=none; rua=mailto:<受け取るメール>`（様子を見て `p=quarantine` に上げる）
- [ ] 環境ごとに API キー（送信だけ・`{DOMAIN}` に限る）を作り、控える

#### G. Terraform

- [ ] `infra/terraform/envs/staging/` の変数に、秘密でない値を入れる（`{GCP_PROJECT_ID}`・`{DOMAIN}`・`GOOGLE_CLIENT_ID`・`SENTRY_DSN`・アラートの通知先など）
- [ ] `make infra-plan ENV=staging` で差分を読み、`make infra-apply ENV=staging`
- [ ] Cloud Run の作成が、シークレットの値が無いために失敗することがある。そのときは H で値を入れてから、もう一度 `make infra-apply ENV=staging`
- [ ] Workload Identity Federation（GitHub Actions 用）ができたことを確かめる

  ```bash
  gcloud iam workload-identity-pools list --location=global
  gcloud iam workload-identity-pools providers list \
    --workload-identity-pool=<POOL_ID> --location=global \
    --format="value(name,attributeCondition)"
  gcloud iam service-accounts list --format="value(email)"
  ```

  `attributeCondition` がこのリポジトリ（`<org>/moonx`）に限っていること。プロバイダ名とデプロイ用サービスアカウントのメールは秘密ではないので、`.github/workflows/` の認証の設定に直接書く（GitHub に鍵は置かない。ADR-007）。

- [ ] Resend の画面でドメインの確認（Verify）が通ったことを確かめる

  ```bash
  dig +short TXT resend._domainkey.{DOMAIN}
  dig +short TXT _dmarc.{DOMAIN}
  ```


#### H. シークレットの値（Secret Manager）

Terraform はシークレットの入れ物だけを作る。値は手で入れる（tfstate に値を残さないため）。値をコマンドの引数に書かない（シェルの履歴に残る）。

```bash
TARGET=staging   # production のときは production

# Neon のプール接続・Google の client secret・Resend の API キー（貼り付けて Enter。画面には出ない）
read -rs VALUE; printf '%s' "$VALUE" | gcloud secrets versions add moonx-$TARGET-database-url --data-file=-; unset VALUE
read -rs VALUE; printf '%s' "$VALUE" | gcloud secrets versions add moonx-$TARGET-google-client-secret --data-file=-; unset VALUE
read -rs VALUE; printf '%s' "$VALUE" | gcloud secrets versions add moonx-$TARGET-resend-api-key --data-file=-; unset VALUE

# セッションの署名鍵（入れ替えると全員がログアウトする。05 3.15）
openssl rand -base64 32 | tr -d '\n' | gcloud secrets versions add moonx-$TARGET-better-auth-secret --data-file=-

# Worker と API の共有シークレット（同じ値を Worker にも入れる。I）
proxy_secret="$(openssl rand -hex 32)"
printf '%s' "$proxy_secret" | gcloud secrets versions add moonx-$TARGET-proxy-shared-secret --data-file=-
```

#### I. Cloudflare Worker

- [ ] H と同じシェルで、共有シークレットを Worker に入れる

  ```bash
  cd apps/web
  bunx wrangler login
  printf '%s' "$proxy_secret" | bunx wrangler secret put PROXY_SHARED_SECRET --env $TARGET
  unset proxy_secret
  ```

- [ ] Cloud Run の URL を `apps/web/wrangler.jsonc` の環境ごとの `vars` の `API_ORIGIN` に書き、PR で入れる

  ```bash
  gcloud run services describe moonx-api-$TARGET --region=asia-southeast1 --format="value(status.url)"
  ```

- [ ] `wrangler.jsonc` で `staging.{DOMAIN}` / `{DOMAIN}` を Worker に向ける。同じホスト名の DNS レコードを Terraform でも作らない（二重に作らない）

#### J. GitHub

- [ ] マージを squash だけにし、マージしたブランチを消す

  ```bash
  gh repo edit <org>/moonx \
    --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false \
    --delete-branch-on-merge
  ```

- [ ] Settings → Rules で `main` を守る（PR 必須・`ci.yml` の成功が必須・直接 push しない）
- [ ] environment `staging` と `production` を作り、値を入れる（一覧は 04 3章）

  ```bash
  gh api -X PUT repos/<org>/moonx/environments/staging
  gh api -X PUT repos/<org>/moonx/environments/production

  gh secret set DATABASE_URL_DIRECT --env staging        # 値を聞かれるので貼る
  gh variable set VITE_APP_ENV --env staging --body staging
  gh variable set VITE_SENTRY_DSN --env staging --body '<Sentry web の DSN>'
  # production も同じように入れる（VITE_APP_ENV の値は production）

  gh secret set CLOUDFLARE_API_TOKEN     # A で作った CI 用のトークン
  gh secret set CLOUDFLARE_ACCOUNT_ID
  gh secret set EXPO_TOKEN               # K で作る
  ```

#### K. Expo / EAS とストア

- [ ] EAS のプロジェクトを作り、チャンネルを用意する

  ```bash
  cd apps/mobile
  eas login
  eas init        # 表示された projectId を app.config.ts に設定する
  eas channel:create staging
  eas channel:create production
  ```

- [ ] expo.dev の Access tokens で CI 用のトークンを作り、`gh secret set EXPO_TOKEN` で入れる
- [ ] `eas.json` の profile ごとに `EXPO_PUBLIC_API_BASE_URL`・`EXPO_PUBLIC_APP_ENV`・`EXPO_PUBLIC_SENTRY_DSN` を入れる（値は SDD 2章「環境変数」）
- [ ] App Store Connect でアプリを2つ作る: `{APP_ID}`（production）と `{APP_ID}.staging`（staging。TestFlight だけで使う）
- [ ] App Store Connect の API キー（App Manager）を作り、EAS に登録する: `eas credentials --platform ios`
- [ ] Google Play Console でアプリを2つ作る: `{APP_ID}` と `{APP_ID}.staging`
- [ ] Google Play に提出するためのサービスアカウントと JSON 鍵を作り、Play Console の「ユーザーと権限」で招待し、EAS に登録する: `eas credentials --platform android`（鍵は EAS にだけ置き、手元のファイルは消す）
- [ ] Android の最初の1回は、Play Console に手で上げる（EAS Submit は2回目から使える。04 4.3）

#### L. 予算と通知

- [ ] Cloud Billing の予算を作る（月 $10、50%・90%・100% でメール）

  ```bash
  gcloud billing budgets create \
    --billing-account=<BILLING_ACCOUNT_ID> \
    --display-name="moonx monthly" \
    --budget-amount=10USD \
    --threshold-rule=percent=0.5 \
    --threshold-rule=percent=0.9 \
    --threshold-rule=percent=1.0
  ```

- [ ] Terraform が作った稼働時間チェックとアラートの通知先（メール）を、Cloud Monitoring の画面で確かめる（05 2章）

#### M. 最初のデプロイと運営者

- [ ] `main` にマージして `build.yml` が API のイメージを作ったことを確かめる
- [ ] staging の昇格の PR を出してマージし、デプロイ後の確認をする（04 4.2・6章）
- [ ] staging の運営者を作る（リンクが staging の URL になっていることを確かめる）

  ```bash
  DATABASE_URL="$(gcloud secrets versions access latest --secret=moonx-staging-database-url)" \
  BETTER_AUTH_URL="https://staging.{DOMAIN}" \
  make admin-create EMAIL=<運営者のメール>
  ```

- [ ] staging の `MAIL_ALLOWLIST` に、確かめに使うメールを入れる（Terraform の変数）
- [ ] production でも昇格と運営者の作成をする（`moonx-production-database-url`・`https://{DOMAIN}`）

---

## 6. OAuth のセットアップ（Google）

Google ログインは API（Better Auth）を通る。スマホもシステムのブラウザで同じ流れを使い、`moonx://`（staging は `moonx-staging://`）で戻る。そのため OAuth クライアントは「ウェブ アプリケーション」だけを作り、iOS / Android 用のクライアントは作らない。

### 同意画面（プロジェクトに1つ）

1. Google Cloud Console → Google Auth Platform（旧: OAuth 同意画面）
2. ブランディング: アプリ名 `moonx`、サポートのメール、承認済みドメイン `{DOMAIN}`
3. 対象: 外部。公開ステータスを「本番環境」にする（「テスト」のままだと、登録したテストユーザーしかログインできない）
4. スコープ: `openid`・`email`・`profile` だけ

### クライアント（環境ごと）

Google Auth Platform → クライアント → クライアントを作成 → 種類「ウェブ アプリケーション」。

| 環境 | 承認済みの JavaScript 生成元 | 承認済みのリダイレクト URI | ID / SECRET の置き場所 |
|---|---|---|---|
| local | `http://localhost:5173` | `http://localhost:5173/api/auth/callback/google` | `.env` の `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` |
| staging | `https://staging.{DOMAIN}` | `https://staging.{DOMAIN}/api/auth/callback/google` | ID は Terraform の変数、SECRET は `moonx-staging-google-client-secret` |
| production | `https://{DOMAIN}` | `https://{DOMAIN}/api/auth/callback/google` | ID は Terraform の変数、SECRET は `moonx-production-google-client-secret` |

- リダイレクト URI は `BETTER_AUTH_URL` ＋ `/api/auth/callback/google` と1文字も違わないこと
- local の Google ログインはブラウザ（と iOS シミュレーター）でだけ確かめる。実機と Android エミュレーターでは `localhost` に戻れない（11章）。スマホの Google ログインは staging で確かめる

---

## 7. テスト実行

```bash
make test          # test-domain・test-api・test-web・test-mobile をまとめて
make test-domain   # 計算と判定（packages/domain）
make test-api      # API の結合テスト。ローカルの PostgreSQL を使う（make db-up 済みであること）
make test-web      # Web（Vitest）
make test-mobile   # スマホ（Jest）

# E2E（Playwright）。別のターミナルで make dev を動かしておく
make test-e2e

make lint          # Biome の検査
make format        # Biome の整形
make typecheck     # TypeScript の型チェック
```

ツールの選定は ADR-022、テストの方針は SDD 10章。PR では CI が同じターゲットを動かす（04 2章）。

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
                          └─ 昇格の PR（deploy/production/version = 同じ SHA）─▶ production
```

| ブランチ | 用途 |
|---|---|
| `main` | 唯一の長く残るブランチ。直接 push しない |
| `feature/xxx` | 新しい機能。例: `feature/pitch-deck-pdf` |
| `fix/xxx` | バグの修正。例: `fix/invite-expiry` |
| `promote/{env}-<短い SHA>` | 昇格の PR。`deploy/{env}/version` だけを変える |

### マージの方式

- コードの PR（feature / fix → main）は**常に squash マージ**。1 PR = 1 コミット = 1 つの意図
- 環境ごとのブランチ（develop など）は使わない。環境の差はバージョン宣言ファイルだけで表す

### リリースフロー（環境の昇格）

1. `main` に squash マージ → `build.yml` がテストし、API のイメージ（タグ = コミット SHA）を Artifact Registry に置く
2. その SHA を `deploy/staging/version` に書いた昇格の PR をマージ → staging にデプロイ
3. staging で確かめたら、同じ SHA を `deploy/production/version` に書いた昇格の PR をマージ → production にデプロイ
4. 戻すときは昇格の PR を revert する

版の呼び方は、Web と API がコミット SHA。スマホのストアの版は `app.config.ts` の version（SemVer）。手順の詳細は [04_deployment-procedure.md](04_deployment-procedure.md)。

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
| デザイントークンの生成物 | `packages/ui-tokens` が `docs/06_design-tokens.json` と合っているか | CI が `make tokens` を動かし、差分が出たら失敗（ADR-018） | — |

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
| ログインやフォームが 403 `Invalid origin` | `TRUSTED_ORIGINS` にオリジンが無い | `.env` を local の値に戻す |
| Google ログインで `redirect_uri_mismatch` | local 用の OAuth クライアントにリダイレクト URI が無い | `http://localhost:5173/api/auth/callback/google` を登録する（6章） |
| Google ログインで `Error 403: access_denied` | 同意画面が「テスト」で、自分がテストユーザーでない | 同意画面を「本番環境」にするか、テストユーザーに足す |
| Google ログインが「招待が無い」で止まる | 招待制（ADR-010）。そのメールあての有効な招待が無い | 招待を出してから、招待の画面から Google ログインを始める |
| スマホの実機で Google ログインから戻らない | `BETTER_AUTH_URL` が `localhost` で、実機から届かない | ローカルではメール＋パスワードで確かめる。Google ログインは staging で確かめる |
| スマホから API に繋がらない | IP が違う、別の Wi-Fi、PC のファイアウォール | `EXPO_PUBLIC_API_BASE_URL` を見直し、`make dev-mobile` を起動し直す。端末のブラウザで `http://<開発 PC の IP>:3000/api/health` が開くか確かめる |
| iPhone から API に繋がらない（IP は正しい） | ローカルネットワークの許可が無い | iPhone の設定 → プライバシーとセキュリティ → ローカルネットワークで開発ビルドを許可する |
| スマホで `http://` に繋がらない | ストア用（release）のビルドで動かしている | 開発ビルド（`--profile development`）を使う |
| 開発ビルドで「ネイティブのモジュールが無い」 | ネイティブの依存が変わった | 開発ビルドを作り直す（3.5 の `eas build --profile development`） |
| `.env` を変えてもスマホに反映されない | `EXPO_PUBLIC_*` は起動時に埋め込まれる | `make dev-mobile` を起動し直す |
| 招待やパスワード再設定のメールが来ない | local はメールを送らない（`MAIL_TRANSPORT=console`） | `make dev` の出力（API のログ）に出るリンクを使う |
| 期限の通知を試したい | 定期実行は local に無い | `make cron-due` |
| 色や余白が古いまま | トークンの生成物が古い | `make tokens` |
| CI が「トークンの差分」で落ちる | `make tokens` の実行を忘れた | `make tokens` を動かしてコミットする |
| API を変えたら Web・スマホで型エラー | Eden Treaty の型が変わった（ADR-006） | `make typecheck` で場所を確かめて直す |
| `make test-api` が DB に繋がらない | DB が起動していない | `make db-up` |
| `make test-e2e` でブラウザが無い | Playwright のブラウザが入っていない | `bunx playwright install chromium` |
| `bun install` で lockfile に差分が出る | Bun の版が CI と違う | CI と同じ版の Bun にする |
