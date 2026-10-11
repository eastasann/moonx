# Deployment Procedure — moonx

- この文書が持つもの: デプロイの流れ（GitHub Actions）、リリース前の確認、昇格の PR、ロールバック、デプロイ後の確認、緊急時の連絡先
- 環境の名前・環境変数（CI のシークレットを含む）・make ターゲット・ADR の正は [SDD 2章](02-01_system-design-doc.md#2-アーキテクチャ概要) と [SDD 3章](02-01_system-design-doc.md#3-技術選定と判断理由adr)。ここには書き写さない
- 初回のクラウドのセットアップとブランチ戦略は [03_dev-setup.md](03_dev-setup.md)（5.4・9章）
- 表記: `{DOMAIN}`・`{GCP_PROJECT_ID}` は SDD 2章のプレースホルダ。`<...>` はその場で調べて入れる値。`$TARGET` は `staging` か `production`

---

## 1. 環境一覧

環境ごとの URL・サービス・DB の名前の正は [SDD 2章「環境と命名」](02-01_system-design-doc.md#環境と命名)。ここには、それぞれの環境へのデプロイの方法だけを書く。

| 環境 | デプロイの方法 |
|---|---|
| local | 手元で起動する（03 3章） |
| staging | `deploy/staging/version` を変える昇格の PR をマージする（4.2）。`deploy.yml` が GitHub の環境 `staging` で動く |
| production | `deploy/production/version` を変える昇格の PR をマージし、GitHub の環境 `production` で承認する（4.2） |

- GitHub の環境 `production-backup` はデプロイには使わない（`db-backup.yml` と `kpi.yml` だけ。2章）

---

## 2. CI/CD パイプライン

リリースはブランチではなく、`deploy/{env}/version`（デプロイするコミット SHA）の変更をきっかけにする（ADR-016）。staging も production も、昇格の PR をマージしたときにだけデプロイする。CI はデプロイを含めて make のターゲットを呼ぶ（ADR-017。ターゲットの中身は [SDD 2章「make ターゲット」](02-01_system-design-doc.md#make-ターゲット)）。

```
[作業ブランチの PR]
    └── ci.yml: make install → make lint → make typecheck → make test → make build → make test-e2e
                ＋ make tokens・make openapi の差分の確認（PostgreSQL 17 のクライアントを入れて動かす）

[main へ squash マージ]（deploy/ だけの変更は除く）
    └── build.yml（GitHub の環境は使わない）: make test → make build-api-image SHA=<SHA>
                （Web もビルドして同じイメージに入れる）

[昇格の PR（deploy/{env}/version = SHA）をマージ]
    └── deploy.yml（GitHub の環境 staging / production。production は承認を待つ）
          1. make deploy-api ENV=$TARGET SHA=$SHA（マイグレーションを含む。Web も同じイメージ）
          2. デプロイ後の確認（サービスの URL で /api/health と /api/health/db）
        （戻す = 昇格の PR を revert）

[毎日]
    └── db-backup.yml（GitHub の環境 production-backup）: make db-backup ENV=production

[毎月]
    └── kpi.yml（GitHub の環境 production-backup）: make kpi ENV=production
```

### CI/CD ワークフロー

| ワークフロー | きっかけ | やること |
|---|---|---|
| `ci.yml` | すべての PR | `make install` → `make lint` → `make typecheck` → `make test` → `make build` → `make test-e2e`。`DATABASE_URL_TEST` はサービスコンテナの PostgreSQL 17。ランナーに PostgreSQL 17 のクライアント（`pg_dump`）を入れる（バックアップのテストが使う。古い版の `pg_dump` は 17 のサーバーに使えない）。`make tokens` で差分が出たら失敗（ADR-018）。`make openapi` で `apps/api/openapi.json` に差分が出たら失敗（API を変えた PR は、作り直した `openapi.json` を含める） |
| `build.yml` | `main` への push（`deploy/**` だけの変更は除く） | `make test` → `make build-api-image SHA=<SHA>`（イメージの名前は SDD 2章「環境と命名」）。E2E は PR の `ci.yml` で通っているので動かさない。`make build-api-image` は Web もビルドして同じイメージに入れ（ADR-004）、ソースマップを Sentry の `moonx-web` と `moonx-api` に上げる（`release` = SHA。`SENTRY_AUTH_TOKEN`）。GitHub の環境を使わないので、リポジトリの変数とシークレットだけを読む（3章） |
| `deploy.yml` | `main` への push で `deploy/staging/version` か `deploy/production/version` が変わったとき | 下の「deploy.yml の順番」。GitHub の環境 `staging` / `production` で動き、`production` は承認されるまで待つ。環境ごとに同時に1つだけ動かす（後から来たものは待つ）。1つのコミットで両方の環境のファイルが変わっていたら失敗させる |
| `db-backup.yml` | 毎日（schedule）と、手で（`workflow_dispatch`。`gh workflow run db-backup.yml`） | GitHub の環境 `production-backup`（承認なし）で `make db-backup ENV=production`。`DATABASE_URL_DIRECT` は production の読み取り専用のロールの接続文字列（03 5.4 E・H）。`pg_dump` は PostgreSQL 17 のクライアントを使う（サーバーより古い版は使えない）。確かめ方と戻し方は 05 6.2 |
| `kpi.yml` | 毎月1日（schedule）と、手で（`workflow_dispatch`。`gh workflow run kpi.yml`） | GitHub の環境 `production-backup`（承認なし）で、`db-backup.yml` と同じ読み取り専用の接続（`DATABASE_URL_DIRECT`）を使い、`make kpi ENV=production` で KPI の SQL（SDD 11章）を production に流す。件数だけを実行の要約（`$GITHUB_STEP_SUMMARY`）に出し、回答の中身は出さない。結果の見方は 05 6.1 |
| （Terraform） | — | CI では動かさない。人が `make infra-plan` / `make infra-apply`（`ENV` は `shared` / `staging` / `production`）で動かす（03 5.2） |

Google Cloud へは Workload Identity Federation で入る（ADR-027）。WIF の変数はリポジトリにあるので、`build.yml`・`deploy.yml`・`db-backup.yml` のどれからも読める。

### deploy.yml の順番

DB → API の順。Web は API と同じイメージに入っているので、API の新しいリビジョンと一緒に切り替わる（ADR-004）。前の段が失敗したら、後の段は動かさない。

```bash
TARGET=staging                       # 変わったファイルで決まる
SHA="$(cat deploy/$TARGET/version)"

# 0. その SHA のコードを取り、イメージがあることを確かめる
git checkout "$SHA"
gcloud artifacts docker images describe "asia-southeast1-docker.pkg.dev/{GCP_PROJECT_ID}/moonx/api:$SHA"

# 1. マイグレーションと API の新しいリビジョン（DATABASE_URL_DIRECT は環境のシークレット）
make deploy-api ENV=$TARGET SHA=$SHA

# 2. デプロイ後の確認。API が動くことと、マイグレーションのあとで DB に繋がること（SDD 5.14 Z1・Z2）
#    ドメイン（stg.{DOMAIN}・{DOMAIN}）ではなくサービスの URL で確かめる。DNS とドメインマッピングに
#    頼らないので、ドメインの準備（03 5.4 J）の前の最初のデプロイでも通る
BASE_URL="$(gcloud run services describe moonx-api-$TARGET --region=asia-southeast1 --format='value(status.url)')"
curl -fsS "$BASE_URL/api/health"
curl -fsS "$BASE_URL/api/health/db"
```

- **1. マイグレーション**（`make deploy-api` の中で API より先に動く）は「追加してから使い、使わなくなってから消す」で書いたものだけを流す（4.1）。これで、API を前のリビジョンに戻しても動く
- **1. API** の新しいリビジョンが起動しないときは、Cloud Run は前のリビジョンに流したままにする（05 3.7）
- **2. 確認**: `/api/health` が失敗したら 5.2 で戻す。`/api/health/db` が 503 なら、新しいリビジョンが DB に繋がっていない。05 3.1〜3.3 で切り分け、新しいリビジョンが原因なら 5.2 で戻す
- **Web** は staging で確かめたイメージをそのまま production に出す（ADR-016）。環境ごとに違う値の渡し方は ADR-004

---

## 3. 初回クラウドセットアップ（IaC）

手順は [03_dev-setup.md 5.4](03_dev-setup.md) のチェックリスト。Terraform と CI の分担は 03 5.2。

### CI が使う値の置き場所

名前・置き場所（リポジトリか、GitHub の環境 `staging` / `production` / `production-backup` のどれか）・用途の正は [SDD 2章「CI のシークレットと変数」](02-01_system-design-doc.md#環境変数) の表。入れ方は 03 5.4 H。ここにはデプロイに関わる注意だけを書く。

- `build.yml` は GitHub の環境を使わないので、表で「リポジトリ」のものだけを読める。リポジトリに置くものを環境に移さない
- 環境 `production` はデプロイに承認を要する。承認する人は 03 5.4 H で入れる
- 環境 `production-backup` は `db-backup.yml` と `kpi.yml` だけが使う。デプロイのワークフローから参照しない
- `GCP_WORKLOAD_IDENTITY_PROVIDER` / `GCP_DEPLOY_SERVICE_ACCOUNT` の値は、Terraform の `envs/shared` が作ったもの（03 5.4 G）
- `dwnfrc.app` の DNS（Vercel）のトークンは作らない。GitHub にも Terraform にも置かない（ADR-015。レコードは 03 5.4 で手で入れる）

---

## 4. リリース前チェックリスト

### 4.1 チェックリスト

- [ ] 出す SHA で `ci.yml` と `build.yml` が成功している
- [ ] その SHA の API のイメージが Artifact Registry にある
- [ ] マイグレーションがある場合: `make db-generate` で作った SQL を読んだ。下の「expand / contract」に沿っている
- [ ] API の変更が、開いたままの古い画面（Service Worker が持っている前の版の画面を含む。ADR-031）を壊さない（項目の追加だけ。壊すなら `/api/v2`。ADR-006）
- [ ] 新しい環境変数・シークレットがある場合: SDD 2章の表に足し、Terraform・Secret Manager・GitHub（SDD の表の置き場所。リポジトリか環境か）に、staging と production の両方で入れた
- [ ] `infra/terraform/` の変更がある場合: 先に `make infra-apply ENV=$TARGET`（`shared` の変更なら `ENV=shared`）を済ませた
- [ ] Better Auth の更新を含む場合: staging でログイン（メール・Google）・招待・パスワード再設定を確かめた
- [ ] 29 プライバシーポリシーと 30 サポートの本文が入っている（BCDX が用意する。design-spec 9.2。本文が無いまま production に出さない）
- [ ] staging でデプロイ後の確認（6章）が済んだ
- [ ] 昇格の PR に、対象の SHA・出す変更の一覧・staging での確認の結果・マイグレーションの有無・戻し方を書いた（`.github/PULL_REQUEST_TEMPLATE.md`）
- [ ] production の昇格は、承認する人が `deploy.yml` を承認できる時間に出す

#### マイグレーションの書き方（expand / contract）

DB は戻せない（ADR-016）。1回のリリースのマイグレーションは、**前の版の API がそのまま動くもの**だけにする。

| 変えたいこと | 1回目のリリース（expand） | 次以降のリリース（contract） |
|---|---|---|
| 列を足す | NULL を許すか、既定値を付けて足す | 全行が埋まってから、必要なら NOT NULL にする |
| 列の名前・型を変える | 新しい列を足し、両方に書く。古い行を埋める | 読む先を新しい列に変える → さらに次で古い列を消す |
| 列・テーブルを消す | コードから使うのをやめる | 次のリリースで消す |
| 制約を足す（一意・外部キー） | 先にデータを直す | 制約を足す |

### 4.2 昇格の PR の手順

#### staging へ

```bash
git switch main && git pull

# deploy/ 以外を変えた最新のコミット（= build.yml がイメージを作ったコミット）
SHA="$(git log -1 --format=%H -- . ':(exclude)deploy')"

gh run list --workflow=build.yml --commit "$SHA"     # 成功していること
gcloud artifacts docker images describe \
  "asia-southeast1-docker.pkg.dev/{GCP_PROJECT_ID}/moonx/api:$SHA"

git switch -c "promote/staging-${SHA:0:7}"
printf '%s\n' "$SHA" > deploy/staging/version
git add deploy/staging/version
git commit -m "chore(deploy): promote staging to ${SHA:0:7}"
git push -u origin HEAD
gh pr create --title "chore(deploy): promote staging to ${SHA:0:7}"
```

#### production へ

staging で確かめた SHA だけを出す。

```bash
git switch main && git pull
SHA="$(cat deploy/staging/version)"

# 出す変更の一覧（PR の本文に貼る）
git log --oneline "$(cat deploy/production/version)..$SHA"

git switch -c "promote/production-${SHA:0:7}"
printf '%s\n' "$SHA" > deploy/production/version
git add deploy/production/version
git commit -m "chore(deploy): promote production to ${SHA:0:7}"
git push -u origin HEAD
gh pr create --title "chore(deploy): promote production to ${SHA:0:7}"
```

#### マージとデプロイの確認

```bash
gh pr merge --squash
gh run list --workflow=deploy.yml --limit=1
gh run watch <RUN_ID>
```

production の `deploy.yml` は、GitHub の環境 `production` の承認を待って止まる。GitHub の Actions のその実行の画面で「Review deployments」から承認する。`deploy.yml` が終わったら 6章の確認をする。

#### 最初のリリースのあとで: テンプレートを入れる

テンプレート（自己分析・検証・プラン）の中身は組織（BCDX）のもので、マイグレーションにもシードにも入れない。環境ごとに、最初のリリースのあとで運営者が1回だけ取り込む。公開するまで、その環境ではアイデアも自己分析も作れない。staging で済ませてから production でも行う。

1. 運営者を作る（03 5.4 K）
2. 運営者でログインし、テンプレートの管理（26・27）で、`data/templates/bcdx/` の3つのファイル（`self-analysis.json`・`validation.json`・`plan.json`）を1つずつ取り込む（SDD 5.13 AD10。取り込むと下書きの版ができる）
3. 下書きごとに公開の前の検査（AD6 validate）を動かし、エラーが無いことを確かめてから公開する（AD6 publish）
4. 自己分析（10）が開けることを確かめる（アイデアの作成は、デプロイ後の確認（6章）で確かめる）

---

## 5. ロールバック手順

### 5.1 通常のロールバック（昇格の PR の revert）

基本の戻し方。`deploy/{env}/version` を前の SHA に戻す PR をマージすると、デプロイと同じ `deploy.yml` が前の版を出す。

1. GitHub で、戻したい昇格の PR を開き「Revert」を押す（新しい PR ができる）
2. PR の本文に理由を書き、squash でマージする（production は `deploy.yml` の承認が要る）
3. 6章の確認をする

- マイグレーションは前の版に戻らない（新しい列などは残る）。expand / contract を守っていれば、前の版の API はそのまま動く
- Web は API と同じイメージなので、一緒に前の版に戻る

以下は、PR を待てない緊急時（承認する人がすぐにいないときを含む）に CLI で直接戻す手順。戻したあとで、必ず 5.1 の revert もしてリポジトリと合わせる。

### 5.2 API（Cloud Run）

```bash
# リビジョンとイメージ（SHA）の一覧
gcloud run revisions list --service=moonx-api-production --region=asia-southeast1 \
  --format="table(metadata.name,spec.containers[0].image,metadata.creationTimestamp)"

# 前のリビジョンに 100% 流す
gcloud run services update-traffic moonx-api-production --region=asia-southeast1 \
  --to-revisions=<REVISION>=100
```

リビジョンを指定して流すと、次の `make deploy-api` で出た新しいリビジョンに流れなくなる。直した版を出すときは、最新に戻す。

```bash
gcloud run services update-traffic moonx-api-production --region=asia-southeast1 --to-latest
```

### 5.3 Web

Web は API と同じイメージに入っているので、5.2 で API と一緒に戻る。開いている画面は、Service Worker が新しい版（戻した版）を見つけたときに再読み込みを促す（ADR-031）。

### 5.4 DB

- 戻さない。直すマイグレーションを足して前へ進める（expand / contract）
- データが壊れた・消えたときは、Neon の復元か、バケット `{GCP_PROJECT_ID}-moonx-backups` の `pg_dump` のバックアップから戻す（05 5章・6.2）。戻した時点より後に書かれたデータは消えるので、まず影響の範囲を確かめる

### 5.5 インフラ（Terraform）

```bash
# Terraform の変更の PR を revert してマージしてから
git switch main && git pull
make infra-plan ENV=production    # 戻る差分を確かめる（shared の変更なら ENV=shared）
make infra-apply ENV=production
```

---

## 6. デプロイ後確認

staging でも production でも同じことをする（URL とサービス名を読み替える）。

```bash
BASE_URL=https://{DOMAIN}            # staging は https://stg.{DOMAIN}

# 死活と DB（SDD 5.14 Z1・Z2。/api/health/db はマイグレーションのあとで DB に繋がるか）
curl -fsS "$BASE_URL/api/health"
curl -fsS "$BASE_URL/api/health/db"

# 出ているイメージが deploy/production/version の SHA か
gcloud run services describe moonx-api-production --region=asia-southeast1 \
  --format="value(spec.template.spec.containers[0].image)"
cat deploy/production/version

# トラフィックが最新のリビジョンに 100% か
gcloud run services describe moonx-api-production --region=asia-southeast1 \
  --format="yaml(status.traffic)"

# Web: 画面の HTML がマニフェストを指し、セキュリティヘッダー（SDD 7.2）が付いているか
curl -fsS "$BASE_URL/" | grep -o '<link rel="manifest"[^>]*>'
curl -sI "$BASE_URL/" | grep -i -E '^(content-security-policy|strict-transport-security|x-content-type-options):'

# ドメインマッピングの証明書（Ready と CertificateProvisioned が True。staging は stg.{DOMAIN}）
gcloud beta run domain-mappings describe --domain={DOMAIN} --region=asia-southeast1

# この15分のエラー
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="moonx-api-production" AND severity>=ERROR' \
  --freshness=15m --limit=20
```

- [ ] `/api/health` と `/api/health/db` が 200 を返す
- [ ] Cloud Run のイメージの SHA が `deploy/{env}/version` と同じで、最新のリビジョンに 100% 流れている
- [ ] Cloud Logging にエラーが増えていない。Sentry（`moonx-web` / `moonx-api`）に新しい issue が出ていない
- [ ] ドメインマッピングの証明書が有効で、`https://{DOMAIN}`（staging は `https://stg.{DOMAIN}`）で Web と API の両方が開く
- [ ] Web のトップ（ランディング）が出る。画面の HTML がマニフェストを指し、マニフェストと Service Worker のファイル（パスは ADR-031）が 200 で返る
- [ ] セキュリティヘッダー（CSP・HSTS など。SDD 7.2）が画面の応答に付いている
- [ ] メール＋パスワードでログインできる
- [ ] Google でログインできる
- [ ] コアの流れが通る（確認専用のワークスペースで行う。03 5.4 K で環境ごとに1つ作り、毎回それを使う）: アイデアを作る → コストを入れる → 経済性（損益分岐など）を見る → 判断を記録する → プランを作る → Pitch Deck の PDF を出す（開ける・16:9・文字化けしない）。アイデアとプランは消せないので、終わったら作ったアイデアをアーカイブする
- [ ] 招待のメールが届く（staging は `MAIL_ALLOWLIST` のメールで）
- [ ] スマホ（PWA）: ホーム画面に追加して開き、ログイン → アイデアを開く → PDF を開ける
- [ ] staging だけ: 呼び出し元の IP の決め方（SDD 7.2）を確かめる。`X-Forwarded-For` の左側に偽の値を付けたリクエストを送り、API のログに記録された呼び出し元の IP が、偽の値ではなく自分の IP になっていること（初回と、Cloud Run の前に何かを置くように変えたとき）

  ```bash
  curl -fsS -D - -o /dev/null -H 'X-Forwarded-For: 203.0.113.7' "https://stg.{DOMAIN}/api/health" | grep -i '^x-request-id:'
  gcloud logging read \
    'resource.type="cloud_run_revision" AND resource.labels.service_name="moonx-api-staging" AND jsonPayload.requestId="<上の ID>"' \
    --freshness=10m --limit=5
  ```
- [ ] staging だけ: `/api/docs` が開く。production: `/api/docs` が開かない（ADR-006）

---

## 7. 緊急時連絡先

| 役割 | 担当 | 連絡手段 | 持っている権限 |
|---|---|---|---|
| 開発・運用の担当（一次対応。アラートの通知先） | `<氏名>` | `<連絡手段>` | GitHub・Google Cloud・Vercel（`dwnfrc.app` の DNS）・Neon・Resend・Sentry |
| 予備の担当 | `<氏名>` | `<連絡手段>` | 同上（少なくとも Google Cloud と Vercel の DNS）。GitHub の環境 `production` の承認者にも入れておく |
| BCDX の窓口（利用者への連絡） | `<氏名>` | `<連絡手段>` | 運営者（アプリの管理画面） |
| Google Cloud の請求先の管理者 | `<氏名>` | `<連絡手段>` | 請求先アカウント |
| Vercel のアカウントの持ち主（`dwnfrc.app`） | `<氏名>` | `<連絡手段>` | ドメインの登録と更新・DNS |

- アラートは一次対応の担当にメールで届く（05 2章）。1人で運用するときは、予備の担当に少なくとも Google Cloud と Vercel の DNS の権限を渡しておく
- 外部サービスの障害の確かめ方は 05 5章
