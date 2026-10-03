# Deployment Procedure — moonx

- この文書が持つもの: デプロイの流れ（GitHub Actions）、リリース前の確認、昇格の PR、スマホの配布、ロールバック、デプロイ後の確認、緊急時の連絡先
- 環境の名前・環境変数（CI のシークレットを含む）・make ターゲット・ADR の正は [SDD 2章](02-01_system-design-doc.md#2-アーキテクチャ概要) と [SDD 3章](02-01_system-design-doc.md#3-技術選定と判断理由adr)。ここには書き写さない
- 初回のクラウドのセットアップとブランチ戦略は [03_dev-setup.md](03_dev-setup.md)（5.4・9章）
- 表記: `{DOMAIN}`・`{GCP_PROJECT_ID}`・`{APP_ID}` は SDD 2章のプレースホルダ。`<...>` はその場で調べて入れる値。`$TARGET` は `staging` か `production`

---

## 1. 環境一覧

環境ごとの URL・サービス・DB・アプリの名前の正は [SDD 2章「環境と命名」](02-01_system-design-doc.md#環境と命名)。ここには、それぞれの環境へのデプロイの方法だけを書く。

| 環境 | デプロイの方法 |
|---|---|
| local | 手元で起動する（03 3章） |
| staging | `deploy/staging/version` を変える昇格の PR をマージする（4.2）。`deploy.yml` が GitHub の環境 `staging` で動く |
| production | `deploy/production/version` を変える昇格の PR をマージし、GitHub の環境 `production` で承認する（4.2） |

- GitHub の環境 `production-backup` はデプロイには使わない（`db-backup.yml` だけ。2章）
- wrangler で Worker を手で操作するときは、`apps/web` で `--env staging` / `--env production` を付ける（`wrangler.jsonc` の env から Worker の名前が決まる）

---

## 2. CI/CD パイプライン

リリースはブランチではなく、`deploy/{env}/version`（デプロイするコミット SHA）の変更をきっかけにする（ADR-016）。staging も production も、昇格の PR をマージしたときにだけデプロイする。CI はデプロイを含めて make のターゲットを呼ぶ（ADR-017。ターゲットの中身は [SDD 2章「make ターゲット」](02-01_system-design-doc.md#make-ターゲット)）。

```
[作業ブランチの PR]
    └── ci.yml: make install → make lint → make typecheck → make test → make build → make test-e2e
                ＋ make tokens の差分の確認

[main へ squash マージ]（deploy/ だけの変更は除く）
    └── build.yml（GitHub の環境は使わない）: テスト → make build-api-image SHA=<SHA>

[昇格の PR（deploy/{env}/version = SHA）をマージ]
    └── deploy.yml（GitHub の環境 staging / production。production は承認を待つ）
          1. make deploy-api ENV=$TARGET SHA=$SHA（マイグレーションを含む）
          2. デプロイ後の確認（/api/health と /api/health/db）
          3. make build-web ENV=$TARGET → make deploy-web ENV=$TARGET
          4. スマホ: Expo の fingerprint で選ぶ（その環境で最後にビルドしたアプリと同じなら
             make mobile-update ENV=$TARGET、違えば make mobile-build ENV=$TARGET）
        （戻す = 昇格の PR を revert）

[毎日]
    └── db-backup.yml（GitHub の環境 production-backup）: make db-backup ENV=production
```

### CI/CD ワークフロー

| ワークフロー | きっかけ | やること |
|---|---|---|
| `ci.yml` | すべての PR | `make install` → `make lint` → `make typecheck` → `make test` → `make build` → `make test-e2e`。`DATABASE_URL_TEST` はサービスコンテナの PostgreSQL。`make tokens` で差分が出たら失敗（ADR-018） |
| `build.yml` | `main` への push（`deploy/**` だけの変更は除く） | テスト → `make build-api-image SHA=<SHA>`（イメージの名前は SDD 2章「環境と命名」）。GitHub の環境を使わないので、リポジトリの変数とシークレットだけを読む（3章） |
| `deploy.yml` | `main` への push で `deploy/staging/version` か `deploy/production/version` が変わったとき | 下の「deploy.yml の順番」。GitHub の環境 `staging` / `production` で動き、`production` は承認されるまで待つ。環境ごとに同時に1つだけ動かす（後から来たものは待つ）。1つのコミットで両方の環境のファイルが変わっていたら失敗させる |
| `db-backup.yml` | 毎日（schedule）と、手で（`workflow_dispatch`。`gh workflow run db-backup.yml`） | GitHub の環境 `production-backup`（承認なし）で `make db-backup ENV=production`。`DATABASE_URL_DIRECT` は production の読み取り専用のロールの接続文字列（03 5.4 E・H）。`pg_dump` は PostgreSQL 17 のクライアントを使う（サーバーより古い版は使えない）。確かめ方と戻し方は 05 6.2 |
| （Terraform） | — | CI では動かさない。人が `make infra-plan` / `make infra-apply`（`ENV` は `shared` / `staging` / `production`）で動かす（03 5.2） |

Google Cloud へは Workload Identity Federation で入る（ADR-027）。WIF の変数はリポジトリにあるので、`build.yml`・`deploy.yml`・`db-backup.yml` のどれからも読める。

### deploy.yml の順番

DB → API → Web → スマホの順。前の段が失敗したら、後の段は動かさない。

```bash
TARGET=staging                       # 変わったファイルで決まる
SHA="$(cat deploy/$TARGET/version)"

# 0. その SHA のコードを取り、イメージがあることを確かめる
git checkout "$SHA"
gcloud artifacts docker images describe "asia-southeast1-docker.pkg.dev/{GCP_PROJECT_ID}/moonx/api:$SHA"

BASE_URL=https://staging.{DOMAIN}    # production は https://{DOMAIN}

# 1. マイグレーションと API の新しいリビジョン（DATABASE_URL_DIRECT は環境のシークレット）
make deploy-api ENV=$TARGET SHA=$SHA

# 2. デプロイ後の確認。API が動くことと、マイグレーションのあとで DB に繋がること（SDD 5.14 Z1・Z2）
curl -fsS "$BASE_URL/api/health"
curl -fsS "$BASE_URL/api/health/db"

# 3. Web。その SHA から環境の値（VITE_*。環境の変数）でビルドして出す
make build-web ENV=$TARGET
make deploy-web ENV=$TARGET
curl -fsS "$BASE_URL/api/health"       # 新しい Worker を通して届くこと

# 4. スマホ。Expo の fingerprint で自動で選ぶ（ADR-016）
#    その SHA の fingerprint が、その環境で最後にビルドしたアプリと同じ → make mobile-update ENV=$TARGET
#    違う                                                           → make mobile-build ENV=$TARGET
```

- **1. マイグレーション**（`make deploy-api` の中で API より先に動く）は「追加してから使い、使わなくなってから消す」で書いたものだけを流す（4.1）。これで、API を前のリビジョンに戻しても動く
- **1. API** の新しいリビジョンが起動しないときは、Cloud Run は前のリビジョンに流したままにする（05 3.7）
- **2. 確認**: `/api/health` が失敗したら 5.2 で戻す。`/api/health/db` が 503 なら、新しいリビジョンが DB に繋がっていない。05 3.1〜3.3 で切り分け、新しいリビジョンが原因なら 5.2 で戻す
- **3. Web** は同じ SHA から環境ごとにビルドする（ADR-016）。最初の `make deploy-web` で Worker のカスタムドメインができる（03 5.4 J）
- **4. スマホ**: fingerprint はネイティブの部分（ネイティブのライブラリ・`app.config.ts` のネイティブの設定・Expo SDK）が変わると変わる

  | fingerprint | `deploy.yml` が動かすもの | 届き方 |
  |---|---|---|
  | その環境で最後にビルドしたアプリと同じ | `make mobile-update ENV=$TARGET`（EAS Update。チャンネル `$TARGET`） | 同じ fingerprint のアプリに、次の起動から届く |
  | 違う | `make mobile-build ENV=$TARGET`（EAS Build ＋ iOS だけ Submit） | Android は新しいビルドのリンク、iOS は TestFlight に届く。利用者へ配り直す（4.3） |

- スマホの環境変数（`EXPO_PUBLIC_*`・`SENTRY_AUTH_TOKEN`）は EAS の環境変数にある（置き場所の正は SDD 2章「環境変数」「CI のシークレットと変数」）。値を変えるときは EAS の環境変数を直してから出す（03 5.4 K）

---

## 3. 初回クラウドセットアップ（IaC）

手順は [03_dev-setup.md 5.4](03_dev-setup.md) のチェックリスト。Terraform と CI の分担は 03 5.2。

### CI が使う値の置き場所

名前・置き場所（リポジトリか、GitHub の環境 `staging` / `production` / `production-backup` のどれか）・用途の正は [SDD 2章「CI のシークレットと変数」](02-01_system-design-doc.md#環境変数) の表。入れ方は 03 5.4 H・K。ここにはデプロイに関わる注意だけを書く。

- `build.yml` は GitHub の環境を使わないので、表で「リポジトリ」のものだけを読める。リポジトリに置くものを環境に移さない
- 環境 `production` はデプロイに承認を要する。承認する人は 03 5.4 H で入れる
- 環境 `production-backup` は `db-backup.yml` だけが使う。デプロイのワークフローから参照しない
- `GCP_WORKLOAD_IDENTITY_PROVIDER` / `GCP_DEPLOY_SERVICE_ACCOUNT` の値は、Terraform の `envs/shared` が作ったもの（03 5.4 G）
- CI 用の Cloudflare のトークンの権限は SDD の表の `CLOUDFLARE_API_TOKEN` の行のとおり。`envs/shared` の Terraform 用のトークン（Cloudflare のゾーンの設定を扱う。SDD 2章「インフラ管理」）は GitHub に置かない（03 5.1・5.4 A）
- スマホの環境変数と TestFlight への提出の鍵は EAS に置く（SDD 2章）

---

## 4. リリース前チェックリスト

### 4.1 チェックリスト

- [ ] 出す SHA で `ci.yml` と `build.yml` が成功している
- [ ] その SHA の API のイメージが Artifact Registry にある
- [ ] マイグレーションがある場合: `make db-generate` で作った SQL を読んだ。下の「expand / contract」に沿っている
- [ ] API の変更が、出回っているスマホの版を壊さない（項目の追加だけ。壊すなら `/api/v2`。ADR-006）
- [ ] 新しい環境変数・シークレットがある場合: SDD 2章の表に足し、Terraform・Secret Manager・`wrangler.jsonc`・EAS の環境変数（`preview` / `production`）・GitHub（SDD の表の置き場所。リポジトリか環境か）に、staging と production の両方で入れた
- [ ] `infra/terraform/` の変更がある場合: 先に `make infra-apply ENV=$TARGET`（`shared` の変更なら `ENV=shared`）を済ませた
- [ ] スマホの fingerprint が変わるか（ネイティブの変更があるか）を確かめた。変わるなら `deploy.yml` が `make mobile-build` を選ぶので、利用者への配り直しの段取りを決めた（4.3）
- [ ] スマホのネイティブの変更を含む場合: `apps/mobile/.maestro/` のコアフローを、開発ビルドを入れたシミュレーター / エミュレーターで通した（SDD 10章）
- [ ] Better Auth の更新を含む場合: staging でログイン（メール・Google）・招待・パスワード再設定を確かめた
- [ ] staging でデプロイ後の確認（6章）が済んだ
- [ ] 昇格の PR に、対象の SHA・出す変更の一覧・staging での確認の結果・マイグレーションとネイティブの変更の有無・戻し方を書いた（`.github/PULL_REQUEST_TEMPLATE.md`）
- [ ] production の昇格は、承認する人が `deploy.yml` を承認できる時間に出す

#### マイグレーションの書き方（expand / contract）

DB は戻せない（ADR-016）。1回のリリースのマイグレーションは、**前の版の API がそのまま動くもの**だけにする。

| 変えたいこと | 1回目のリリース（expand） | 次以降のリリース（contract） |
|---|---|---|
| 列を足す | NULL を許すか、既定値を付けて足す | 全行が埋まってから、必要なら NOT NULL にする |
| 列の名前・型を変える | 新しい列を足し、両方に書く。古い行を埋める | 読む先を新しい列に変える → さらに次で古い列を消す |
| 列・テーブルを消す | コードから使うのをやめる | 次のリリースで消す |
| 制約を足す（一意・外部キー） | 先にデータを直す | 制約を足す |

デプロイした版がまだ無い間（`deploy/{staging,production}/version` が無く、前の版の API が動いている環境が無い間）は、前の版に戻す先が無いので、使わなくなったものを、使うのをやめる変更と同じ変更で消してよい。最初のリリースのあとは、上の表のとおり2回に分ける。

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

### 4.3 スマホの配布

昇格で `deploy.yml` が `make mobile-build` を選んだとき（fingerprint が変わったとき。2章）、または `app.config.ts` の version を上げるときに行う。手元から出すときも `make mobile-build ENV=...`。fingerprint が同じなら EAS Update で届くので、ここの手順は要らない（2章）。

身内だけが使う間は、App Store にも Google Play にも公開しない（ADR-003）。

| | Android | iOS |
|---|---|---|
| 配り方 | EAS の内部配布（`eas.json` の profile `staging`・`production` の `distribution: internal`、APK）。ビルドのインストール用のリンクを渡す | TestFlight の社内テスト（`make mobile-build` が EAS Submit で提出する）。端末を登録した内部配布も使える（下） |
| 新しい人の追加 | 最新のビルドのインストール用のリンクを渡す（下） | App Store Connect でその人の Apple ID をユーザーに招待し、TestFlight の内部テスターのグループに入れる（上限100人） |
| 更新の届き方 | 新しいビルドのリンクを渡し直し、入れ直してもらう。JS だけの変更は EAS Update | TestFlight の通知。JS だけの変更は EAS Update |

#### Android

1. staging の昇格で `deploy.yml` が `make mobile-build ENV=staging` を選ぶと、`{APP_ID}.staging` の APK がビルドされる。EAS のビルドのページ（expo.dev のプロジェクトの Builds）の Install のリンクから端末に入れて確かめる
2. production の昇格（または手元の `make mobile-build ENV=production`）で `{APP_ID}` の APK をビルドする。6章のスマホの確認をする
3. 利用者にリンクを渡す。最新のビルドのページの URL は `eas build:list --platform android --build-profile production --status finished --limit 1` で出せる。リンクが無効になっているときは、同じ SHA で `make mobile-build ENV=production` をやり直す
4. 受け取った人は、端末でリンクを開いて APK をダウンロードし、提供元不明のアプリのインストールを許可して入れる。前の版が入っていれば上書きされる（署名の鍵は EAS が持つ）

版は `app.config.ts` の version（SemVer）を上げる。versionCode は `eas.json` の `appVersionSource: remote` で EAS が増やす。古いビルドを使えなくするときは、API の最低の版を上げる（426。SDD 5.1）。

#### iOS（TestFlight）

1. staging の昇格で `deploy.yml` が `make mobile-build ENV=staging` を選ぶと、`{APP_ID}.staging` がビルドされて TestFlight に提出される。TestFlight の内部テスターで確かめる
2. production の昇格（または手元の `make mobile-build ENV=production`）で、`{APP_ID}` がビルドされて TestFlight に提出される。6章のスマホの確認をする
3. 新しい人は、App Store Connect の「ユーザーとアクセス」で Apple ID を招待する（TestFlight だけに使うので、権限の弱いロールにする）。招待を受けた人が、TestFlight の内部テスターのグループに入ったあと、TestFlight アプリから入れる
4. TestFlight のビルドは90日で期限が切れる。使い続けるときは、期限の前に `make mobile-build ENV=production` で新しいビルドを提出する

#### iOS（端末を登録した内部配布）

TestFlight を使えない人がいるときの代わりの配り方。Apple Developer Program の登録（個人）で使える。

1. `eas device:create` を動かし、表示された登録用のリンクをその人に送る。端末の UDID が登録される
2. `eas.json` の profile の `ios.distribution` を `internal` にして `make mobile-build` で作り直す。内部配布のビルドは TestFlight に提出できないので、`Makefile` の iOS の `--auto-submit` も外す。同じ環境で TestFlight と併用しない
3. ビルドのインストール用のリンクを、Android と同じように渡す。端末を足すたびに、1 に戻って作り直す

#### JS だけの変更

fingerprint が同じなら `deploy.yml` が `make mobile-update ENV=$TARGET` を選び、EAS Update で届く。入れてある人には、アプリを開いたあとの次の起動で届く。

#### ストアに公開するとき

今はストアに公開しない。公開すると決めたときは、ユーザーが決めた時点で ADR-003 を書き換え、この節に公開の手順を足す。

---

## 5. ロールバック手順

### 5.1 通常のロールバック（昇格の PR の revert）

基本の戻し方。`deploy/{env}/version` を前の SHA に戻す PR をマージすると、デプロイと同じ `deploy.yml` が前の版を出す。

1. GitHub で、戻したい昇格の PR を開き「Revert」を押す（新しい PR ができる）
2. PR の本文に理由を書き、squash でマージする（production は `deploy.yml` の承認が要る）
3. 6章の確認をする

- マイグレーションは前の版に戻らない（新しい列などは残る）。expand / contract を守っていれば、前の版の API はそのまま動く
- スマホは、戻し先の SHA の fingerprint がその環境で最後にビルドしたアプリと同じなら、`deploy.yml` が `make mobile-update` で前の版の JS を出す。違えば `make mobile-build` を選び、新しいビルドを配り直すことになる（ADR-016）。配ったバイナリは戻らない（5.5）

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

### 5.3 Web（Cloudflare Worker）

Worker `moonx-web-production`（staging は `--env staging` で `moonx-web-staging`）。

```bash
cd apps/web
bunx wrangler deployments list --env production

# 1つ前の版に戻す（静的アセットも一緒に戻る）
bunx wrangler rollback --env production --message "rollback: <理由>"

# 版を指定して戻す
bunx wrangler rollback <VERSION_ID> --env production --message "rollback: <理由>"
```

### 5.4 スマホ（EAS Update）

```bash
cd apps/mobile
eas update:list --branch production --limit 5

# 前の更新をもう一度出す
eas update:republish --group <前の GROUP_ID> --message "rollback to <短い SHA>"
```

端末に届くのは、アプリを開いたあとの次の起動のとき。

### 5.5 配ったバイナリ

配ったバイナリは戻せない。

1. 広がるのを止める: 問題の版のリンクを新しく渡さない。TestFlight は App Store Connect で問題のビルドを期限切れにする。入れてしまった人には直接連絡する。使えなくするときは API の最低の版を上げる（426。SDD 5.1）
2. JS だけで直せるなら、その runtime 向けに EAS Update を出す（5.4・2章）
3. ネイティブの修正が要るなら、版を上げて `make mobile-build ENV=production` で作り直して配る（4.3）
4. API 側で古い版に合わせられるなら、先に API を直す（ADR-006）

### 5.6 DB

- 戻さない。直すマイグレーションを足して前へ進める（expand / contract）
- データが壊れた・消えたときは、Neon の復元か、バケット `{GCP_PROJECT_ID}-moonx-backups` の `pg_dump` のバックアップから戻す（05 5章・6.2）。戻した時点より後に書かれたデータは消えるので、まず影響の範囲を確かめる

### 5.7 インフラ（Terraform）

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
BASE_URL=https://{DOMAIN}            # staging は https://staging.{DOMAIN}

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

# Web の版
(cd apps/web && bunx wrangler deployments list --env production)

# この15分のエラー
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="moonx-api-production" AND severity>=ERROR' \
  --freshness=15m --limit=20
```

- [ ] `/api/health` と `/api/health/db` が 200 を返す
- [ ] Cloud Run のイメージの SHA が `deploy/{env}/version` と同じで、最新のリビジョンに 100% 流れている
- [ ] Cloud Logging にエラーが増えていない。Sentry（web / mobile / api）に新しい issue が出ていない
- [ ] Web のトップ（ランディング）が出る
- [ ] メール＋パスワードでログインできる
- [ ] Google でログインできる
- [ ] コアの流れが通る（確認専用のワークスペースで行う。03 5.4 L で環境ごとに1つ作り、毎回それを使う）: アイデアを作る → コストを入れる → 経済性（損益分岐など）を見る → 判断を記録する → プランを作る → Pitch Deck の PDF を出す（開ける・16:9・文字化けしない）。アイデアとプランは消せないので、終わったら作ったアイデアをアーカイブする
- [ ] 招待のメールが届く（staging は `MAIL_ALLOWLIST` のメールで）
- [ ] スマホ（そのチャンネルのビルド）: ログイン → アイデアを開く → PDF を共有できる。EAS Update が届いている（アプリを2回起動し直す）
- [ ] staging だけ: `/api/docs` が開く。production: `/api/docs` が開かない（ADR-006）

---

## 7. 緊急時連絡先

| 役割 | 担当 | 連絡手段 | 持っている権限 |
|---|---|---|---|
| 開発・運用の担当（一次対応。アラートの通知先） | `<氏名>` | `<連絡手段>` | GitHub・Google Cloud・Cloudflare・Neon・Resend・Sentry・Expo |
| 予備の担当 | `<氏名>` | `<連絡手段>` | 同上（少なくとも Google Cloud と Cloudflare）。GitHub の環境 `production` の承認者にも入れておく |
| BCDX の窓口（利用者への連絡） | `<氏名>` | `<連絡手段>` | 運営者（アプリの管理画面） |
| Google Cloud の請求先の管理者 | `<氏名>` | `<連絡手段>` | 請求先アカウント |
| Cloudflare のアカウントの持ち主（`{DOMAIN}`） | `<氏名>` | `<連絡手段>` | Registrar・DNS |
| Apple Developer の Account Holder | `<氏名>` | `<連絡手段>` | App Store Connect（TestFlight）・会員の更新 |

- アラートは一次対応の担当にメールで届く（05 2章）。1人で運用するときは、予備の担当に少なくとも Google Cloud と Cloudflare の権限を渡しておく
- 外部サービスの障害の確かめ方は 05 5章
