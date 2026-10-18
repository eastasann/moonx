# Dev Setup — moonx

- この文書が持つもの: 開発に要るツールとアカウント、ローカルで動かす手順、初回のクラウドのセットアップ、テストの回し方、ブランチ戦略、つまずいたときの対処
- アーキテクチャ・環境と命名・環境変数・CI のシークレットと変数（置き場所を含む）・make ターゲット・ADR の正は [System Design Doc（SDD）](02-01_system-design-doc.md)。ここには書き写さず、節へのリンクで参照する
- 画面と UX の正は [design-spec](design-spec.md)
- デプロイの手順は [04_deployment-procedure.md](04_deployment-procedure.md)、運用は [05_operation-runbook.md](05_operation-runbook.md)
- 表記: `{DOMAIN}`・`{GCP_PROJECT_ID}` は SDD 2章のプレースホルダ。`<...>` はその場で調べて入れる値

---

## 1. 必要なツール・アカウント

### ツール

| ツール | バージョン | 用途 | 要る人 |
|---|---|---|---|
| Git | 最近の版 | ソースの取得 | 全員 |
| make | OS 標準 | 実コマンドの入口（Windows は WSL2 を使う） | 全員 |
| Bun | 1.2 以上（CI と同じ版にそろえる） | パッケージ管理・API・テスト | 全員 |
| Docker（Docker Desktop・OrbStack など。Compose v2） | 最近の版 | ローカルの PostgreSQL 17（`make db-up`。開発用の DB `moonx` とテスト用の DB `moonx_test`） | 全員 |
| Playwright のブラウザ | リポジトリの Playwright に合う版 | `make test-e2e`（取得するターゲットは SDD 2章「make ターゲット」） | E2E を回す人 |
| Google Cloud CLI（gcloud） | 最新 | 初回のセットアップ・`make promote`（イメージの確認）・ログの確認・緊急時の操作 | デプロイ・運用をする人 |
| Terraform | 1.x の最新 | `make infra-plan` / `make infra-apply` | インフラを触る人 |
| GitHub CLI（gh） | 最新 | PR・`make promote`（昇格の PR の作成）・GitHub の環境の設定・ワークフローの確認 | デプロイ・運用をする人（ほかの人は任意） |
| PostgreSQL のクライアント（psql・pg_dump・pg_restore） | 17（サーバーと同じ版。古い版の pg_dump は 17 のサーバーに使えない） | `make test-api` のバックアップのテスト、バックアップの復元の確認（05 6.2） | 全員 |

### アカウント（デプロイ時に必要。ローカル開発は GitHub だけでよい）

| サービス | 用途 | 備考 |
|---|---|---|
| GitHub | リポジトリ・GitHub Actions | ローカル開発にも要る（リポジトリへの書き込み権限） |
| Google Cloud | Cloud Run・Artifact Registry・Secret Manager・Cloud Storage・Cloud Logging / Monitoring | プロジェクト `{GCP_PROJECT_ID}` を staging と production で共有する。請求先アカウントが要る |
| Google OAuth クライアント | Google ログイン | `{GCP_PROJECT_ID}` の中で環境ごとに、コンソールで作る（6章） |
| Vercel | `dwnfrc.app` の登録と DNS（`{DOMAIN}` と `stg.{DOMAIN}` の CNAME、メールと Search Console のレコード） | DNS のレコードを手で入れる権限が要る。Vercel のトークンは作らない（Terraform にも手元にも置かない。ADR-015） |
| Google Search Console | `dwnfrc.app` の所有の確認 | Cloud Run のドメインマッピングを作る Google アカウント（I で Terraform を動かすアカウント）で確かめる（5.4 A） |
| Neon | PostgreSQL（プロジェクト `moonx`、DB 名 `moonx`、ブランチ `production` / `staging`） | 無料プラン（枠の扱いは ADR-008） |
| Resend | 招待とパスワード再設定のメール | 無料プラン。`{DOMAIN}` の確認が要る |
| Sentry | エラーの追跡（プロジェクト `moonx-web` / `moonx-api`） | 無料プラン |

### Claude Code のプラグインとスキル

リポジトリの `.claude/settings.json` が次のプラグインを有効にする。リポジトリを信頼すると、手元のセッションに入る。

| プラグイン | マーケットプレイス（リポジトリ） | 用途 |
|---|---|---|
| draft | `draft-marketplace`（`dwnfrc/DWNFRC-DRAFT`） | 進め方（DRAFT のフェーズと補助のスキル） |
| frontend-design | `claude-plugins-official`（`anthropics/claude-plugins-official`） | 画面のデザインの方針を立て、作ったものを見直す手順 |
| taste-skill | `taste-skill`（`Leonxlnx/taste-skill`。MIT。13のスキル） | 既存の画面の点検と、見た目の方向の比較 |

クラウドのセッション（Claude Code on the web）は、リポジトリの設定で有効にしたプラグインを入れない（2026-10 時点の Claude Code の仕様）。クラウドでデザインのスキルを使う人は、claude.ai に自分のスキルとして入れる（claude.ai のスキルは手元とクラウドの両方に届く）。スキルのファイルはリポジトリに置かない（2026-10-11 の決定）。入れ方:

1. 下の使い分けの表で「今は使う場面が無い」以外のスキルのフォルダーを取ってくる。frontend-design は `anthropics/claude-plugins-official` の `plugins/frontend-design/skills/frontend-design/`、taste-skill は `Leonxlnx/taste-skill` の `skills/<フォルダー>/`（例: redesign-existing-projects は `skills/redesign-skill/`）
2. フォルダーごとに ZIP にする
3. claude.ai の Customize > Skills で「+」>「Create skill」>「Upload a skill」から入れる

claude.ai にも入れた人の手元では、プラグインのスキルと claude.ai のスキルが両方読み込まれる。手元ではプラグインのもの（`frontend-design:`・`taste-skill:` の付く名前）を使う。

デザインのスキルは次のように使い分ける（2026-10-11 の決定）。

| 場面 | 使うスキル |
|---|---|
| デザインの方針を立てる・見直す | frontend-design |
| 既存の画面を点検する（できあがった画面やプロトタイプを見直すときなど） | redesign-existing-projects（taste-skill） |
| 1 ランディングと 29・30 | 上の2つに加えて design-taste-frontend（taste-skill）。スキルの説明に「Not dashboards, not data tables, not multi-step product UI」とあり、業務の画面・表・ダッシュボードには使えない |
| 見た目の方向を比べる | minimalist-ui・high-end-visual-design・industrial-brutalist-ui・gpt-taste（taste-skill）。比べる材料にだけ使い、決めた方向に合わないものは使わない |
| 今は使う場面が無い | imagegen-frontend-web・imagegen-frontend-mobile・brandkit・image-to-code（画像を作る道具が要る）、stitch-design-taste（Google Stitch を前提にし、自分の `DESIGN.md` を正にする。moonx の正は design-spec 4.4 と 06）、design-taste-frontend-v1（新しい版がある）、full-output-enforcement（出力の省略を禁じるだけで、デザインに関わらない） |

表は目安で、禁止ではない（設定でも止めていない。2026-10-11 の決定）。表に無い場面でも、合うスキルがあれば使ってよい。使ったときは、どのスキルを何に使ったかをユーザーに伝える。

どのスキルの案も、design-spec の方針（4.4・4.5）と 06 に合うものだけを使う。方針を変える案は、先にユーザーと決めて design-spec と 06 を直してから実装する（見た目は 2026-10-12 に月相に作り直した）。実装では、design-spec と 06 と、画面にスタイルを書かない決まり（SDD ADR-018・ADR-025）を優先する。スキルが前提にしている技術のうち、Tailwind と、Tailwind を前提にする shadcn は ADR-025 で使わないと決めている。GSAP・motion など SDD に無い技術は、ADR を足すまで入れない。

画面を見る手段:

- 手元のセッション: Claude in Chrome（Chrome の拡張機能）で開発サーバーの画面を開いて確かめる。セッションは `claude --chrome` で始めるか、`/chrome` で既定にしておく
- クラウドのセッション: ブラウザを動かす道具は用意されていない（クラウドのセッションにブラウザの道具を求める要望 anthropics/claude-code#75632 は、2026-09 に入れられないまま閉じた）。プロジェクトの Playwright で開発サーバーのスクリーンショットを撮って確かめる（ブラウザの版は 11章の「Playwright のブラウザを取ってこられない」）
- 手元のセッションを別の端末から動かすときは Remote Control を使う。手元のプラグインと道具はそのまま使えるが、Chrome は `claude remote-control --chrome` で始めたときだけ使える（付けないと Chrome が切れた状態で始まる）

### 実装のエージェントの決まり

Claude Code で実装するときの決まり（2026-10-12 のユーザーの決定）。`CLAUDE.md` はここから作る。

- 仕様を弱める変更は、エージェントが自分で決めない。無人ループ（`/draft:implement loop`）でも同じ。機能・検査・制約・文言を減らす・緩める変更と、docs の記述を実装に合わせて弱める書き換えがこれにあたる。エージェントは手を止めて、弱める点・理由・選択肢を示す（無人ループではそのステップを `blocked` にする）。弱めずに直せる docs の欠けや食い違いは、`/draft:implement` の決まりどおりに扱う。ステップを分けて残りを新しいステップに書き出すのは、弱める変更にあたらない
- エージェントが docs に書かれていない細部を決めたら、完了報告とコミットの本文に、決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所をすべて書く。自分で決めてよいのは、画面と API の外から見える振る舞い（応答・状態・権限・文言の意味）を変えない細部だけ。変えるものは設計の不備として扱う
- 手元の Docker の DB（`moonx`・`moonx_test`）を消す make ターゲット（`db-seed`・`db-reset`、`test-api`・`test-e2e` のテスト用の DB の作り直しと、それらを呼ぶ `setup`・`test`）は、確認なしで動かしてよい。ほかの破壊的な操作は、実行の前にユーザーの確認を取る

---

## 2. リポジトリ構成

構成の正は [SDD 2章「リポジトリ構成」](02-01_system-design-doc.md#リポジトリ構成)。何をどこで管理するかは [SDD 2章「インフラ管理」](02-01_system-design-doc.md#インフラ管理) を見る。

---

## 3. 環境構築手順（30分以内）

ツール（1章）が入っていれば、ここまで30分で Web と API が動く。

### 3.1 取得とセットアップ

```bash
git clone git@github.com:<org>/moonx.git
cd moonx
make setup
```

`make setup` の中身は [SDD 2章「make ターゲット」](02-01_system-design-doc.md#make-ターゲット) を見る。

### 3.2 `.env` を埋める

`.env` の置き場所と値の正は [SDD 2章「環境変数」](02-01_system-design-doc.md#環境変数)（値は「local の値」の列）。雛形のままでよいものが多く、`make setup` のあとで次だけを埋める（`BETTER_AUTH_SECRET` は `make setup` が入れるので確認だけ）。

| ファイル | 変数 | やること |
|---|---|---|
| `.env` | `BETTER_AUTH_SECRET` | `make setup` が乱数を入れる。空のままだと API が起動しないので、`.env` を手で作った場合は `openssl rand -base64 32` の値を入れる |
| `.env` | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google ログインをローカルで試すときだけ。local 用の OAuth クライアントの値（6章） |
| `.env` | 上の2つ以外 | 雛形のまま（local の値）。`DATABASE_URL_TEST` はテスト用の DB `moonx_test`（7章）。`RESEND_API_KEY` など local で使わないものは空のまま |

staging / production の値は `.env` に書かない（置き場所は同じ表の右の列）。

`.env` の行は `KEY=値` の形で書く（`export` や `=` の前後の空白は使えない）。空白を含む値は引用符で囲む。`#` から後ろはコメントになる。値に `$` を入れること、引用符の中に `#` や `\` を入れること、引用符を閉じずに次の行へ続けること、バッククォートで囲むことはできない（Makefile と Bun で読み方が変わるので、`make` がその行の番号を出して止まる）。

### 3.3 Web と API を動かす

```bash
make dev
```

| 確かめること | 方法 |
|---|---|
| API が動いている | `curl http://localhost:3000/api/health` |
| Web が開く | ブラウザで `http://localhost:5173`（`127.0.0.1` ではなく `localhost` で開く。Cookie のため） |
| 部品を確かめる | ブラウザで `http://localhost:5173/dev/components`（開発サーバーだけ。本番のビルドには入らず、開くと Not Found）。全部品の種類・大きさ・状態を並べ、ページ上部でテーマ（System / Light / Dark）とスケール（Auto / Medium / Large）を切り替えられる。Popover と Tray はウィンドウの幅を `semantic.breakpoint.tablet` の前後に動かして確かめる。`?screen=`（`s05-dashboard` など `docs/mockups` のファイル名。一覧はページの末尾の「Mockup screens」）を付けると、その画面を部品で組み直したものだけをウィンドウいっぱいに描き、`&theme=dark` でダークにする。`docs/mockups` を静的なサーバーで配り（`docs/mockups/README.md`）、同じ幅で並べて見比べる |
| デモのユーザーでログインできる | ユーザーとデータは design-spec 8章 |
| メールの中身 | local ではメールを送らない。招待やパスワード再設定のリンクは `make dev` の出力（API のログ）に出る |

### 3.4 最初の運営者を作る

```bash
make admin-create EMAIL=<自分のメール>
```

表示されたリンクを開いて登録すると、そのユーザーが運営者になる（ADR-010）。staging / production の運営者の作り方は 5.4 K。

### 3.5 スマホの幅で確かめる

初期リリースのスマホは、Web を PWA としてホーム画面に追加して使う（ADR-031。ネイティブのアプリは、Web のデザインが固まったあとの変更で作る。PRD 6章）。

- スマホの幅の画面は、ブラウザの開発者ツールの端末表示で確かめる（`http://localhost:5173`）
- 実機でのホーム画面への追加と Service Worker は staging（`https://stg.{DOMAIN}`）で確かめる。Service Worker は HTTPS（と `localhost`）でしか動かないので、開発 PC の IP で開いた実機では確かめられない

### 3.6 デモデータ

デモデータ（design-spec 8章）を入れ直すときは `make db-seed`、DB を最初からやり直すときは `make db-reset`。どちらもローカルで作ったデータを消す。何を入れるか・どの環境で動くかは [SDD 2章「make ターゲット」](02-01_system-design-doc.md#make-ターゲット)。

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

make infra-plan ENV=staging     # 差分の確認（ENV は shared / staging / production）
make infra-apply ENV=staging    # 適用
```

### 5.2 CI/CD との関係

| 対象 | 誰が変えるか |
|---|---|
| `infra/terraform/`（`shared`・`staging`・`production`） | 人が PR に `make infra-plan` の結果を貼り、マージ後に `make infra-apply` を手で動かす。CI は Terraform を動かさない |
| Cloud Run のイメージ（リビジョン）とトラフィック | イメージは CI（`deploy.yml` の `make deploy-api`）。トラフィックは、緊急時だけ人が `gcloud` で変える（04 5.2）。Terraform はどちらの変更も無視する（`lifecycle.ignore_changes`。ADR-015） |
| Cloud Run のそれ以外の設定（環境変数・シークレットの参照・台数・メモリ） | Terraform。緊急で `gcloud` から変えたら、あとで Terraform にも同じ変更を入れる（入れないと次の apply で戻る） |
| Web の静的ファイル | CI（`build.yml` の `make build-api-image` が Web もビルドして API のイメージに入れる。ADR-004） |
| Cloud Run のドメインマッピング（`{DOMAIN}`・`stg.{DOMAIN}`） | Terraform（環境ごと。正は [SDD 2章「インフラ管理」](02-01_system-design-doc.md#インフラ管理)） |
| `dwnfrc.app` の DNS のレコード（Web の CNAME・メール・Search Console） | 人が Vercel の画面で入れる（5.4 A・F・J）。Terraform では作らない（Vercel のトークンを持たせない。ADR-015） |
| Google の OAuth の同意画面とクライアント・Neon | コンソール（6章・5.4 E） |

### 5.3 tfstate の管理

状態は Cloud Storage のバケット `{GCP_PROJECT_ID}-tfstate` に置く（`shared`・`staging`・`production` とも。ADR-015）。バケットは Terraform の前に手で作る（5.4 B）。バージョニングを有効にして、壊れたら前の版に戻せるようにする。

### 5.4 初回セットアップのチェックリスト（最初のデプロイの前に1回）

上から順に進める。環境ごとに分かれる手順（I・J・K）は、staging で通してから production でくり返す（`staging` を `production` に読み替える）。`shared`（G）は1回だけ。

#### A. アカウントとドメイン

- [ ] 1章のアカウントを作る（本人確認と審査に数日かかるので早めに）
- [ ] Vercel で `dwnfrc.app` の DNS のレコードを足せることを確かめる（ドメインは新しく取らない。ADR-013）。Vercel では、レコードの名前を `dwnfrc.app` からの相対で入れる（`.dwnfrc.app` を除いた部分だけを入れる）
- [ ] Search Console で `dwnfrc.app` の所有を確かめる（ドメイン プロパティ）。Search Console が出す TXT のレコードを Vercel の DNS の `dwnfrc.app` に入れ、確認を押す。確かめる Google アカウントは、I で Terraform を動かし、ドメインマッピングを作るアカウントにする（所有を確かめていないアカウントではドメインマッピングを作れない）

  ```bash
  dig +short TXT dwnfrc.app | grep google-site-verification
  ```

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

- [ ] 組織とプロジェクト `moonx-web` / `moonx-api` を作る（ADR-023）
- [ ] 各プロジェクトの DSN を控える。どちらも Cloud Run の環境変数で、Terraform の変数として入れる（I）。`moonx-api` は API の DSN、`moonx-web` は API が画面に渡す Web の DSN（環境変数の名前の正は [SDD 2章「環境変数」](02-01_system-design-doc.md#環境変数)）
- [ ] ソースマップのアップロード用の Auth Token を作る（`SENTRY_AUTH_TOKEN`。リポジトリのシークレット。H。置き場所の正は [SDD 2章「CI のシークレットと変数」](02-01_system-design-doc.md#環境変数)）
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
- [ ] 画面に出る DNS レコード（MX・SPF の TXT・DKIM の TXT）を、Vercel の DNS（`dwnfrc.app`）に手で入れる（名前は A のとおり相対で入れる）
- [ ] DMARC のレコードを同じく入れる: 名前 `_dmarc.{DOMAIN}`、TXT `v=DMARC1; p=none; rua=mailto:<受け取るメール>`（様子を見て `p=quarantine` に上げる）
- [ ] 環境ごとに API キー（送信だけ・`{DOMAIN}` に限る）を作り、控える

#### G. Terraform（`shared`。1回だけ）

`shared` が作るものは [SDD 2章「インフラ管理」](02-01_system-design-doc.md#インフラ管理)（Google Cloud の共有の資源）。環境ごとの Terraform（I）より先に動かす。

- [ ] `infra/terraform/envs/shared/` の変数に、秘密でない値を入れる（`{GCP_PROJECT_ID}`・請求先アカウントの ID・アラートの通知先のメール・GitHub のリポジトリ `<org>/moonx` など）
- [ ] `make infra-plan ENV=shared` で差分を読み、`make infra-apply ENV=shared`
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
  - WIF の `attributeCondition` が、このリポジトリ（`<org>/moonx`）の `main` で動くワークフローに限っていること（`assertion.repository == '<org>/moonx' && assertion.ref == 'refs/heads/main'`。ADR-027）。プロバイダの `name` とデプロイ用のサービスアカウントのメールは、リポジトリの変数 `GCP_WORKLOAD_IDENTITY_PROVIDER` / `GCP_DEPLOY_SERVICE_ACCOUNT` に入れる（H。鍵は作らない。ADR-027）

- [ ] Resend の画面でドメインの確認（Verify）が通ったことを確かめる

  ```bash
  dig +short TXT resend._domainkey.{DOMAIN}
  dig +short TXT _dmarc.{DOMAIN}
  dig +short MX send.{DOMAIN}
  ```

#### H. GitHub

- [ ] マージを squash だけにし、マージしたブランチを消す

  ```bash
  gh repo edit <org>/moonx \
    --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false \
    --delete-branch-on-merge
  ```

- [ ] Settings → Rules で `main` を守る（PR 必須・`ci.yml` の成功が必須・直接 push しない）
- [ ] Dependabot のアラートを有効にする（ADR-027）
- [ ] GitHub の環境を3つ作る（名前と役割は [SDD 2章「環境と命名」](02-01_system-design-doc.md#環境と命名) の「GitHub の環境」の行）。3つとも `main` からだけ使えるようにする。`production` はデプロイに承認を要する（1人で運用するときは自分を承認者にする）。`production-backup` は承認を付けない。環境・環境のシークレット・承認・ブランチの制限は、公開のリポジトリなら無料のプランで使える。非公開にすると、環境とそのシークレットとブランチの制限は Pro か Team 以上、承認は Enterprise のプランが要る（GitHub の「Deployments and environments」）

  ```bash
  BRANCH_POLICY='"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}'
  gh api -X PUT repos/<org>/moonx/environments/staging --input - <<EOF
  {$BRANCH_POLICY}
  EOF
  gh api -X PUT repos/<org>/moonx/environments/production --input - <<EOF
  {"reviewers":[{"type":"User","id":$(gh api user --jq .id)}],$BRANCH_POLICY}
  EOF
  gh api -X PUT repos/<org>/moonx/environments/production-backup --input - <<EOF
  {$BRANCH_POLICY}
  EOF
  for ENV_NAME in staging production production-backup; do
    gh api -X POST repos/<org>/moonx/environments/$ENV_NAME/deployment-branch-policies \
      -f name=main -f type=branch
  done
  ```

- [ ] CI のシークレットと変数を入れる。名前・置き場所（リポジトリか、どの環境か）・用途の正は [SDD 2章「CI のシークレットと変数」](02-01_system-design-doc.md#環境変数) の表。下のコマンドはその置き場所に合わせている。`build.yml` は GitHub の環境を使わずに動くので、リポジトリに置いたものだけを読む

  ```bash
  # リポジトリ（値を聞かれるものは貼る）
  gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --body '<G で確かめたプロバイダの name>'
  gh variable set GCP_DEPLOY_SERVICE_ACCOUNT     --body '<デプロイ用のサービスアカウントのメール>'
  gh secret set   SENTRY_AUTH_TOKEN              # D の Auth Token

  # 環境 staging / production
  TARGET=staging   # production でもくり返す（値は環境ごとのもの）
  gh secret set   DATABASE_URL_DIRECT  --env $TARGET   # E の直接の接続（所有者のロール）

  # 環境 production-backup（db-backup.yml と kpi.yml だけが使う）
  gh secret set   DATABASE_URL_DIRECT --env production-backup   # E の読み取り専用のロールの接続文字列

  gh variable list && gh secret list
  gh secret list --env production-backup
  ```

#### I. Terraform（`staging` / `production`。初回は2回に分けて apply する）

初回は API のイメージとシークレットの値がまだ無いので、2回に分ける（ADR-015）。1回目でシークレットの入れ物などを作り、値とイメージを入れてから、2回目で Cloud Run を作る。

1. - [ ] `infra/terraform/envs/staging/` の変数に、秘密でない値を入れる（`{GCP_PROJECT_ID}`・`{DOMAIN}`・`GOOGLE_CLIENT_ID`・API と Web の Sentry の DSN（D）・staging の `MAIL_ALLOWLIST` など）と、`bootstrap = true`
2. - [ ] 1回目: `make infra-plan ENV=staging` で差分を読み、`make infra-apply ENV=staging`（シークレットの入れ物・サービスアカウント・写真のバケットができる。Cloud Run はまだ作らない）
3. - [ ] シークレットの値を入れる（下の「シークレットの値」）
4. - [ ] API のイメージがあることを確かめる。H のあとで `main` にマージすると、`build.yml` が作って Artifact Registry に置く（`build.yml` はリポジトリの変数の WIF で入る。H。production は staging と同じイメージを使う）

   ```bash
   gcloud artifacts docker images list \
     asia-southeast1-docker.pkg.dev/{GCP_PROJECT_ID}/moonx/api --include-tags
   ```

5. - [ ] 2回目: `bootstrap = false` と、変数 `api_image` に 4 のイメージを入れて `make infra-apply ENV=staging`。Cloud Run `moonx-api-staging` と、ドメインマッピング `stg.{DOMAIN}`（production は `{DOMAIN}`）ができる。ドメインマッピングは、A で `dwnfrc.app` の所有を確かめたアカウントで動かす。以後のイメージは CI が出す（ADR-015）
6. - [ ] アラートを付ける環境（SDD 11章）だけ: Terraform が作った稼働時間チェックとアラートが、G の通知のチャンネル（メール）に向いていることを Cloud Monitoring の画面で確かめる（05 2章）。稼働時間チェックはドメインを開くので、J で証明書ができるまでは失敗する。最初の構築では変数 `uptime_check_enabled = false` で作らずにおき、J のあとで有効にする

**シークレットの値（Secret Manager）**

Terraform はシークレットの入れ物だけを作る。値は手で入れる（tfstate に値を残さないため）。値をコマンドの引数に書かない（シェルの履歴に残る）。

```bash
TARGET=staging   # production のときは production

# Neon のプール接続・Google の client secret・Resend の API キー（貼り付けて Enter。画面には出ない）
read -rs VALUE; printf '%s' "$VALUE" | gcloud secrets versions add moonx-$TARGET-database-url --data-file=-; unset VALUE
read -rs VALUE; printf '%s' "$VALUE" | gcloud secrets versions add moonx-$TARGET-google-client-secret --data-file=-; unset VALUE
read -rs VALUE; printf '%s' "$VALUE" | gcloud secrets versions add moonx-$TARGET-resend-api-key --data-file=-; unset VALUE

# セッションの署名鍵（入れ替えると全員がログアウトする。05 3.14）
openssl rand -base64 32 | tr -d '\n' | gcloud secrets versions add moonx-$TARGET-better-auth-secret --data-file=-

```

#### J. Web のドメイン（Vercel の DNS。環境ごと）

I の 5 でドメインマッピングができてから行う。最初の昇格（K）より先に済ませる（`deploy.yml` の確認はドメインに頼らないが、運営者の作成と 04 6章の確認はドメインで開く）。

- [ ] Vercel の DNS（`dwnfrc.app`）に CNAME を入れる: `stg.{DOMAIN}`（production は `{DOMAIN}`）→ `ghs.googlehosted.com`（名前は A のとおり相対で入れる）

  ```bash
  dig +short CNAME stg.{DOMAIN}   # ghs.googlehosted.com. が返る
  ```

- [ ] 証明書ができるのを待つ（Google が DNS を確かめてから作る。数分から最大で24時間）。条件の `Ready` と `CertificateProvisioned` が `True` になったら次へ

  ```bash
  gcloud beta run domain-mappings describe --domain=stg.{DOMAIN} --region=asia-southeast1
  curl -fsS https://stg.{DOMAIN}/api/health
  ```

- [ ] アラートを付ける環境（SDD 11章）だけ: 変数 `uptime_check_enabled = true` にして `make infra-apply ENV=$TARGET`（I の 6。稼働時間チェックがドメインで成功することを Cloud Monitoring の画面で確かめる）

#### K. 最初のデプロイと運営者

- [ ] `build.yml` が API のイメージを作ったことを確かめる（I の 4）
- [ ] staging の昇格の PR を出してマージする（04 4.2）
- [ ] staging の運営者を作る。`make admin-create` は `DATABASE_URL` と `BETTER_AUTH_URL` を使うので、この2つを上書きして手元から動かす（リンクが staging の URL になっていることを確かめる）

  ```bash
  DATABASE_URL="$(gcloud secrets versions access latest --secret=moonx-staging-database-url)" \
  BETTER_AUTH_URL="https://stg.{DOMAIN}" \
  make admin-create EMAIL=<運営者のメール>
  ```

- [ ] 運営者でログインし、BCDX のテンプレートを取り込んで公開する（04 4.2「最初のリリースのあとで: テンプレートを入れる」）。公開するまで、その環境ではアイデアも自己分析も作れない
- [ ] デプロイ後の確認（04 6章）だけに使うワークスペースを1つ作る（M7）。以後の確認は毎回このワークスペースで行う
- [ ] staging の `MAIL_ALLOWLIST` に、確かめに使うメールを入れる（Terraform の変数。`make infra-apply ENV=staging`）
- [ ] デプロイ後の確認をする（04 6章）
- [ ] production でも、昇格（GitHub の環境 `production` の承認が要る）・運営者の作成（`moonx-production-database-url`・`https://{DOMAIN}`）・テンプレートの取り込みと公開・確認用のワークスペースの作成・デプロイ後の確認をする
- [ ] production の最初のデプロイのあとで、`db-backup.yml` を手で1回動かし、バックアップができることを確かめる（GitHub の環境 `production-backup` の確認を兼ねる。05 6.2）

  ```bash
  gh workflow run db-backup.yml
  gh run list --workflow=db-backup.yml --limit=1
  ```

---

## 6. OAuth のセットアップ（Google）

Google ログインは API（Better Auth）を通る。スマホも PWA なので同じ Web の流れを使う。OAuth クライアントは「ウェブ アプリケーション」だけを作る。同意画面とクライアントは Terraform では作れないので、コンソールで管理する（[SDD 2章「インフラ管理」](02-01_system-design-doc.md#インフラ管理)）。

### 同意画面（プロジェクトに1つ）

1. Google Cloud Console → Google Auth Platform（旧: OAuth 同意画面）
2. ブランディング: アプリ名 `moonx`、サポートのメール、プライバシーポリシーの URL `https://{DOMAIN}/privacy`（design-spec 3.1 の 29）、承認済みドメイン `dwnfrc.app`（同意画面の承認済みドメインは最上位のドメインで登録する。`{DOMAIN}` と `stg.{DOMAIN}` はこれに含まれる）
3. 対象: 外部。公開ステータスを「本番環境」にする（「テスト」のままだと、登録したテストユーザーしかログインできない）
4. スコープ: `openid`・`email`・`profile` だけ

### クライアント（環境ごと）

Google Auth Platform → クライアント → クライアントを作成 → 種類「ウェブ アプリケーション」。

| 環境 | 承認済みの JavaScript 生成元 | 承認済みのリダイレクト URI | ID / SECRET の置き場所 |
|---|---|---|---|
| local | `http://localhost:5173` | `http://localhost:5173/api/auth/callback/google` | 直下の `.env` の `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` |
| staging | `https://stg.{DOMAIN}` | `https://stg.{DOMAIN}/api/auth/callback/google` | ID は Terraform の変数、SECRET は `moonx-staging-google-client-secret` |
| production | `https://{DOMAIN}` | `https://{DOMAIN}/api/auth/callback/google` | ID は Terraform の変数、SECRET は `moonx-production-google-client-secret` |

- リダイレクト URI は `BETTER_AUTH_URL` ＋ `/api/auth/callback/google` と1文字も違わないこと
- local の Google ログインは、開発 PC のブラウザでだけ確かめる（実機からは `localhost` に戻れない。11章）。スマホ（PWA）の Google ログインは staging で確かめる

---

## 7. テスト実行

```bash
make db-up         # test-api・test-e2e の前に（DB が起動していなければ）

make test
make test-domain
make test-api
make test-web
make test-e2e

make lint
make format
make typecheck
```

`make test-e2e` は `e2e/playwright.config.ts` の `webServer` で、API（ポート 3100）と Web（ポート 5273）を専用に起動する。開発サーバー（3000・5173）は止めなくてよい。実行のたびに `DATABASE_URL_TEST` の DB を作り直してデモデータを入れる（`e2e/global-setup.ts`）。入口のプラグインがログインの回数を IP ごとに数える（SDD ADR-029）ので、テストは `X-Forwarded-For` の値をテストごとに変えて送る（`e2e/fixtures.ts`）。local と e2e には前に立つプロキシが無いので、送った値がそのまま右端の値になる（呼び出し元の IP の決め方は SDD 7.2）。

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

GitHub Flow ＋ バージョン宣言ファイルによる環境の昇格（ADR-016）。長く残るブランチは `main` だけ。リリースもロールバックもブランチではなく、`deploy/{staging,production}/version`（デプロイするコミット SHA）を変える昇格の PR のマージで行う。

```
feature/xxx ──squash──▶ main ──build.yml──▶ API のイメージ（タグ = コミット SHA）
fix/xxx     ──squash──▶   │
                          ├─ 昇格の PR（deploy/staging/version = SHA）────────▶ staging
                          └─ 昇格の PR（deploy/production/version = 同じ SHA）─▶ production（承認のあと）
                             戻すときも昇格の PR（deploy/{env}/version = 戻し先の SHA）
```

| ブランチ | 用途 |
|---|---|
| `main` | 唯一の長く残るブランチ。直接 push しない |
| `feature/xxx` | 新しい機能。例: `feature/pitch-deck-pdf` |
| `fix/xxx` | バグの修正。例: `fix/invite-expiry` |
| `promote/{env}-<SHA の先頭7文字>` | 昇格の PR（進めるときも戻すときも）。`make promote` が作り、`deploy/{env}/version` だけを変える |

### マージの方式

- コードの PR（feature / fix → main）は**常に squash マージ**。1 PR = 1 コミット = 1 つの意図
- 環境ごとのブランチ（develop など）は使わない。環境の差はバージョン宣言ファイルだけで表す

### リリースフロー（環境の昇格）

1. `main` に squash マージ → `build.yml` がテストし、API のイメージ（タグ = コミット SHA）を Artifact Registry に置く（`make build-api-image`）
2. `make promote ENV=staging` で、その SHA を `deploy/staging/version` に書いた昇格の PR を作ってマージ → `deploy.yml` が staging にデプロイする（マイグレーション → API。Web は同じイメージに入っている。ADR-004）
3. staging で確かめたら、`make promote ENV=production` で同じ SHA を `deploy/production/version` に書いた昇格の PR を作ってマージ → GitHub の環境 `production` の承認のあと、production にデプロイする。staging に出していない SHA（`deploy/staging/version` に書かれたことの無いもの）は、CI（`make promote-check`）が通さない
4. 戻すときは、`make promote ENV=<環境> SHA=<戻し先の SHA>` で戻し先の SHA を書いた昇格の PR を作ってマージする（revert はしない。戻せる範囲は 04 5.1）

版の呼び方はコミット SHA（Web と API は同じイメージ）。手順の詳細は [04_deployment-procedure.md](04_deployment-procedure.md)。

### PR のルール

- `main` へのマージは PR 必須（squash）。CI（`ci.yml`）が通ること
- 1人のときはセルフレビューでよい
- PR は `.github/PULL_REQUEST_TEMPLATE.md` に従って書く。昇格の PR の本文は `make promote` が作る。人が足すものは 04 4.2・5.1
- squash したコミットの件名は PR のタイトルになる。PR のタイトルもコミットの規約に合わせる

### コミットメッセージ

- Conventional Commits（`feat:`・`fix:`・`refactor:`・`docs:`・`test:`・`chore:`）。範囲が分かるときは付ける（例: `feat(api):`・`fix(web):`）。昇格は `chore(deploy): promote {env} to <短い SHA>`、戻すときは `chore(deploy): roll back {env} to <短い SHA>`（`{env}` は `staging` か `production`。どちらも `make promote` が付ける）
- 言語は既存のコミットに合わせる（履歴が無ければ英語）
- トレーラー（`Co-Authored-By`、セッションの URL など）は付けない。ツールが既定で付けようとしても、この規約を優先する
- 件名は50字を目安に、72字を超えない。本文は件名との間に空行を置き、表示幅72カラムで折り返す（全角は2カラム）
- 本文には diff から分からないこと（なぜ変えたか・採らなかった案・確かめた範囲）だけを書く。変更したファイルの一覧は書かない

---

## 10. Linter / Formatter

| ツール | 対象 | 実行 | 設定 |
|---|---|---|---|
| Biome | TypeScript・TSX・JSON の検査と整形（生成物の `apps/web/src/routeTree.gen.ts` と `packages/db/migrations/` は除く。TanStack Router と drizzle-kit が Biome の規則に合わない形で書くため。マイグレーションは drizzle-kit が書いたままコミットする） | `make lint` / `make format` | リポジトリのルートの Biome の設定 |
| TypeScript | 全パッケージの型チェック（Eden Treaty の型を含む） | `make typecheck` | 各パッケージの tsconfig |
| 画面のスタイルの禁止 | `apps/web` の画面で vanilla-extract のパッケージ（`@vanilla-extract/` で始まるもの）を直接使わない、`style` 属性に値を書かない（見た目は `packages/ui-web` の部品だけで作る。ADR-025） | `make lint`（何を動かすかは SDD 2章「make ターゲット」） | リポジトリのルートの Biome の設定と `scripts/check-screens.ts` |
| デザイントークンの生成物 | `packages/ui-tokens`（vanilla-extract・react-pdf のテーマと、PWA のアイコンとマニフェスト）が `docs/06_design-tokens.json` と合っているか | CI が `make tokens` を動かし、差分が出たら失敗（ADR-018） | — |
| ルートの生成物（`apps/web/src/routeTree.gen.ts`） | TanStack Router の Vite プラグインが `src/routes/` から作る生成物。手で直さず、ルートを足したら作り直したもの（`make dev-web` か `make build-web` で作られる）をコミットする。古いままだと `make typecheck` が失敗する | `make dev-web` / `make build-web` | — |
| API の仕様の書き出し | `apps/api/openapi.json` が API と合っているか。API を変えたら `make openapi` で作り直して同じ PR に含める | CI が `make openapi` を動かし、差分が出たら失敗（04 2章） | — |
| doc-lint | コミットの前: 先送りのマーカー・不要な `.gitkeep`・`.env` や既知の形式のトークン・ドキュメントの文体（本文の em dash・表の1列目の太字・長すぎる太字）。随時: ドキュメントと実体の食い違い（検査の中身は SDD 2章「make ターゲット」の `doc-lint`） | コミットのたびに `.githooks/pre-commit`（`make setup` が配線する）、随時 `make doc-lint` | `scripts/doc-lint.sh` |

エディタは Biome の拡張を入れ、保存のときに整形する。

コメント: 公開する関数と型の説明は TSDoc（`/** */`）。`NOTE:` などの前置きは付けない。言語は英語（コミットメッセージと同じ）。書くのはコードから読み取れないこと（なぜその実装か・不変条件・外部の制約・呼び出し側との約束）だけ。

---

## 11. よくあるトラブルシューティング

| 問題 | 原因 | 解決策 |
|---|---|---|
| `make db-up` が失敗する | Docker が起動していない | Docker を起動し、`docker info` が通るのを確かめる |
| `make db-up` でポート 5432 が使われている。またはテストが古い版の PostgreSQL に繋がる | OS に入っている PostgreSQL（Homebrew など）が 5432 を使っていて、Docker の PostgreSQL 17 が起動しない | `lsof -nP -iTCP:5432 -sTCP:LISTEN` で確かめて止める（例: `brew services stop postgresql@17`）。止めたら `make db-up` をやり直す |
| `make test-api` のバックアップのテストが pg_dump で落ちる | 手元の pg_dump が 17 より古い（古い版の pg_dump はサーバーより新しい版に使えない） | PostgreSQL 17 のクライアントを入れて PATH に足す（1章。例: Homebrew の `postgresql@17`） |
| `relation "..." does not exist` | マイグレーションが当たっていない | `make db-migrate` |
| マイグレーションが途中で失敗する・順番が合わない | 手で SQL を直した、ブランチを行き来した | `make db-reset`（ローカルのデータは消える） |
| `make dev` で 3000 / 5173 が使われている | 前のプロセスが残っている | `lsof -nP -iTCP:3000 -sTCP:LISTEN` で確かめて止める |
| Web で API が 404・接続できない | `make dev-web` だけを起動している | `make dev`（API も起動する）。`curl http://localhost:3000/api/health` |
| ログインしても戻される・Cookie が残らない | `http://127.0.0.1:5173` で開いている | `http://localhost:5173` で開く（`BETTER_AUTH_URL` と `TRUSTED_ORIGINS` に合わせる） |
| ログインやフォームが 403 `Invalid origin` | `TRUSTED_ORIGINS` にオリジンが無い | 直下の `.env` を local の値に戻す |
| Google ログインで `redirect_uri_mismatch` | local 用の OAuth クライアントにリダイレクト URI が無い | `http://localhost:5173/api/auth/callback/google` を登録する（6章） |
| Google ログインで `Error 403: access_denied` | 同意画面が「テスト」で、自分がテストユーザーでない | 同意画面を「本番環境」にするか、テストユーザーに足す |
| Google ログインが「招待が無い」で止まる | 招待制（ADR-010）。そのメールあての有効な招待が無い | 招待を出してから、招待の画面から Google ログインを始める |
| スマホの実機で Google ログインから戻らない | `BETTER_AUTH_URL` が `localhost` で、実機から届かない | ローカルではメール＋パスワードで確かめる。Google ログインは staging で確かめる（3.5） |
| 招待やパスワード再設定のメールが来ない | local はメールを送らない（`MAIL_TRANSPORT=console`） | `make dev` の出力（API のログ）に出るリンクを使う |
| 色や余白が古いまま | トークンの生成物が古い | `make tokens` |
| CI が「トークンの差分」で落ちる | `make tokens` の実行を忘れた | `make tokens` を動かしてコミットする |
| `make lint` が画面のスタイルで落ちる | 画面で `@vanilla-extract/css`・`style` 属性を使った（ADR-025） | 部品（`packages/ui-web`）を使う。要る見た目が無ければ、design-spec 4.5 に部品を足してから作る |
| API を変えたら Web で型エラー | Eden Treaty の型が変わった（ADR-006） | `make typecheck` で場所を確かめて直す |
| `make test-api` が DB に繋がらない | DB が起動していない、直下の `.env` に `DATABASE_URL_TEST` が無い | `make db-up`。`.env` に雛形の `DATABASE_URL_TEST` があるか確かめる |
| `make test-e2e` でブラウザが無い | Playwright のブラウザが入っていない（Playwright の版を上げた） | `bunx playwright install chromium` |
| クラウドの開発環境（Claude Code のクラウドのセッションなど）で、Playwright のブラウザを取ってこられない | その環境から `cdn.playwright.dev` に届かない | その環境に入っている Chromium に合う版の Playwright で動かす（プロトタイプでは revision 1194 の Chromium に合わせて 1.56.1 にした）。手元と CI はブラウザを取ってこられるので、リポジトリの版は固定しない |
| Web のテストで、オーバーレイ（ダイアログ・シートなど）を開くと固まる | テストでアプリを div の中に描いている。TanStack Router のルート（`__root`）が `html` と `body` を描くので、div の中では壊れる | テストではアプリを `document` に描く |
| Draft の無人ループ（`/draft:implement` の loop）の子のセッションが、長く動くと止まる | 子のセッションの待ち時間の上限（600秒）に掛かる | 子のセッションに `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` を渡す |
| Draft の無人ループの駆動スクリプト（`run-loop.sh`）が途中で止まる | blocked のステップが1つでもあると止まる作り | blocked のステップの理由を確かめて解いてから、動かし直す |
| `bun install` で lockfile に差分が出る | Bun の版が CI と違う | CI と同じ版の Bun にする |
