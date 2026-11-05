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

リリースはブランチではなく、`deploy/{env}/version`（デプロイするコミット SHA）の変更をきっかけにする（ADR-016）。staging も production も、昇格の PR をマージしたときにだけデプロイする。戻すときも、戻し先の SHA を書いた昇格の PR をマージする（5.1）。CI はデプロイを含めて make のターゲットを呼ぶ（ADR-017。ターゲットの中身は [SDD 2章「make ターゲット」](02-01_system-design-doc.md#make-ターゲット)）。

```
[作業ブランチの PR・昇格の PR]
    └── ci.yml: make promote-check（deploy/ を変えていない PR では何もしない）
                deploy/ だけを変える PR（昇格の PR）はここまで。ほかの PR は続けて
                make install → make db-check → make lint → make typecheck → make test → make build → make test-e2e
                ＋ make tokens・make openapi の差分の確認（PostgreSQL 17 のクライアントを入れて動かす）

[main へ squash マージ]（deploy/ だけの変更は除く）
    └── build.yml（GitHub の環境は使わない）: make test → make build-api-image SHA=<SHA>
                （Web もビルドして同じイメージに入れ、ファイルにする）→ make push-api-image SHA=<SHA>

[昇格の PR（deploy/{env}/version = SHA）をマージ]
    └── deploy.yml
          検査のジョブ（GitHub の環境は使わない）: 環境を決め、make promote-check
          イメージのジョブ（GitHub の環境は使わない）: その SHA のイメージがあるかを gcloud で確かめ、
            make deploy-record KIND=migrating（デプロイの記録の「当てたかもしれない」）
          マイグレーションのジョブ（GitHub の環境 staging / production。production は承認を待つ）:
            その SHA のコードで make install → make db-migrate
          デプロイのジョブ（同じ環境。production はもう一度承認を待つ）:
            1. make deploy-api ENV=$TARGET SHA=$SHA（Web も同じイメージ）
            2. デプロイ後の確認（サービスの URL で /api/health の版と /api/health/db）
            3. make deploy-record KIND=deployed（デプロイの記録の「出した」）
        （戻す = 戻し先の SHA を書いた昇格の PR をマージ。5.1）

[毎日]
    └── db-backup.yml（GitHub の環境 production-backup）: make db-backup ENV=production

[毎月]
    └── kpi.yml（GitHub の環境 production-backup）: make kpi ENV=production
```

### CI/CD ワークフロー

| ワークフロー | きっかけ | やること |
|---|---|---|
| `ci.yml` | すべての PR | 初めに `make promote-check BASE=<PR を検査するマージのコミットの1つ目の親>` で `deploy/` の変更を検査する（依存を入れずに、`make install` の前に動く。`deploy/` を変えていない PR では何もしない）。`deploy/` の履歴を読むので、チェックアウトは全履歴（`fetch-depth: 0`）。`deploy/` だけを変える PR（昇格の PR）はここで終える（コードは変わらず、出す版はそれぞれの PR と `build.yml` でテスト済み。戻すときに待たないため）。ほかの PR は続けて `make install` → `make db-check BASE=<promote-check と同じ>` → `make lint` → `make typecheck` → `make test` → `make build` → `make test-e2e`。`DATABASE_URL_TEST` はサービスコンテナの PostgreSQL 17。`.env` は `make setup` と同じく `.env.example` から作る（`make env-file`。`DATABASE_URL_TEST` もこの値でサービスコンテナを指す）。`make test-e2e` の前に、Chromium が要るライブラリを入れる（`playwright install-deps chromium`。ブラウザは `make test-e2e` が取ってくる）。同じ PR に新しい push があれば、古い実行は取り消す。ランナーに PostgreSQL 17 のクライアント（`pg_dump`）を入れる（バックアップのテストが使う。古い版の `pg_dump` は 17 のサーバーに使えない）。`make tokens` で差分が出たら失敗（ADR-018）。`make openapi` で `apps/api/openapi.json` に差分が出たら失敗（API を変えた PR は、作り直した `openapi.json` を含める） |
| `build.yml` | `main` への push（`deploy/**` だけの変更は除く） | 3つのジョブを順に動かす。テストのジョブ: `make test`。`ci.yml` と同じく、`DATABASE_URL_TEST` のサービスコンテナの PostgreSQL 17 と、ランナーの PostgreSQL 17 のクライアントと、`.env` を用意する（バックアップと KPI の集計のテスト）。E2E は PR の `ci.yml` で通っているので動かさない。イメージのジョブ: `make install` → `make build-api-image SHA=<SHA>`。Web もビルドして同じイメージに入れ（ADR-004）、ソースマップを Sentry の `moonx-web` と `moonx-api` に上げ（`release` = SHA。`SENTRY_AUTH_TOKEN`）、イメージをファイルにしてワークフローの成果物（artifact。1日で消える）に置く。push のジョブ: 成果物のイメージを `make push-api-image SHA=<SHA>` で Artifact Registry に上げる（イメージの名前は SDD 2章「環境と命名」）。Workload Identity Federation で Google Cloud に入るのは push のジョブだけで、テストとイメージのジョブは `id-token: write` を持たない（テスト・ビルド・sentry-cli は依存のコードを動かす。下の「Google Cloud のトークンを作れるジョブ」）。push のジョブは `make install` も Bun も動かさない。ソースマップはイメージのジョブで上がるので、ソースマップの無いイメージは上がらない。GitHub の環境を使わないので、リポジトリの変数とシークレットだけを読む（3章） |
| `deploy.yml` | `main` への push で `deploy/staging/version` か `deploy/production/version` が変わったとき | 下の「deploy.yml の順番」。4つのジョブに分ける。検査のジョブとイメージのジョブは GitHub の環境を使わずに、環境のジョブより先に動く（承認する人が検査済みの変更だけを承認するように）。検査のジョブ（`id-token: write` なし）は、変わったファイルから環境を決めて `make promote-check BASE=<push の前のコミット>` を動かす（`promote-check` は履歴を読むので、チェックアウトは全履歴（`fetch-depth: 0`））。イメージのジョブ（Google Cloud に入る）は、その SHA のイメージが Artifact Registry にあるかを gcloud で確かめ、デプロイの記録の「当てたかもしれない」を書く（下の「デプロイの記録」。チェックアウトは `deploy.yml` が動いているコミットで、その Makefile の `make deploy-record` だけを使い、Bun は入れない）。マイグレーションのジョブ（`id-token: write` なし）とデプロイのジョブ（Google Cloud に入る）は、どちらも GitHub の環境 `staging` / `production` で動き、`production` はジョブごとに承認されるまで待つ（下の「production の承認」）。2つのジョブは同じ `concurrency` の group（`deploy-$TARGET`）を使い、環境ごとに同時に1つのジョブだけを動かし、待っているものは取り消さずに順に動かす（`queue: max`。既定では待っているものが取り消される）。どちらのジョブも初めに、`main` の今の `deploy/$TARGET/version` がまだ `$SHA` かを確かめ、違えば（後の昇格が先に入った・古い実行を再実行した）何もせずに終える。マイグレーションのジョブで終えれば、デプロイのジョブは動かない。マイグレーションのジョブの後で後の昇格が先に入ると、その版はマイグレーションが当たったまま出ずに終わる（いちばん先まで出した版より新しければ、4.1 の「マイグレーションが当たったかもしれない版」になる）。デプロイのジョブは、確認が通ったら最後にデプロイの記録の「出した」を書く。検査で止まった・承認されなかった・デプロイに失敗したときは、`deploy/{env}/version` が出ていない SHA を指したままになるので、正しい SHA で新しい昇格の PR を出して直す（`make promote` は本文にそのことを書く） |
| `db-backup.yml` | 毎日（schedule）と、手で（`workflow_dispatch`。`gh workflow run db-backup.yml`） | GitHub の環境 `production-backup`（承認なし）で `make db-backup ENV=production`。`DATABASE_URL_DIRECT` は production の読み取り専用のロールの接続文字列（03 5.4 E・H）。`pg_dump` は PostgreSQL 17 のクライアントを使う（サーバーより古い版は使えない）。確かめ方と戻し方は 05 6.2 |
| `kpi.yml` | 毎月1日（schedule）と、手で（`workflow_dispatch`。`gh workflow run kpi.yml`） | GitHub の環境 `production-backup`（承認なし）で、`db-backup.yml` と同じ読み取り専用の接続（`DATABASE_URL_DIRECT`）を使い、`make kpi ENV=production` で KPI の SQL（SDD 11章）を production に流す。デプロイ後の確認専用のワークスペースの ID は、同じ環境の変数 `CHECK_WORKSPACE_ID` から渡す（03 5.4 K）。件数だけを実行の要約（`$GITHUB_STEP_SUMMARY`）に出し、回答の中身は出さない。結果の見方は 05 6.1 |
| （Terraform） | — | CI では動かさない。人が `make infra-plan` / `make infra-apply`（`ENV` は `shared` / `staging` / `production`）で動かす（03 5.2） |

Google Cloud へは Workload Identity Federation で入る（ADR-027）。WIF の変数はリポジトリにあるので、`build.yml`・`deploy.yml`・`db-backup.yml` のどれからも読める。入れるのは `main` で動くワークフローだけ（3章）。

**Google Cloud のトークンを作れるジョブ**: `id-token: write` を持つジョブでは、Bun もリポジトリの依存のコード（`make install` が入れるもの）も動かさない（ADR-027）。`id-token: write` はジョブのどのステップからでもトークンを作れ、デプロイ用のサービスアカウントは1つで production にも出せるため。依存を動かす作業（テスト・ビルド・ソースマップのアップロード・マイグレーション）と Bun を使う作業（`promote-check`）はトークンの無いジョブで行う。トークンを持つジョブが使う make のターゲットは、gcloud・Docker・curl・PostgreSQL のクライアントだけを使うもの（`push-api-image`・`deploy-api`・`deploy-record`・`db-backup`）に限る。トークンを持つジョブは `build.yml` の push・`deploy.yml` のイメージとデプロイ・`db-backup.yml` のジョブで、`scripts/workflows.test.ts` がこの決まりを確かめる（使う action と make のターゲットが決まったものだけで、そのターゲットのコマンドにも Bun と依存が出てこないこと）。

**deploy.yml の Bun**: `deploy.yml` のジョブは、Bun を Actions のキャッシュから戻さず、Bun のリリースから入れる（setup-bun の `no-cache: true`）。`build.yml` のジョブは依存のコードを動かした後で Bun をキャッシュに保存するので、キャッシュの Bun は差し替えられているかもしれない。`deploy.yml` のジョブは何を出すかを決め（検査のジョブ）、環境のシークレットを持つ（マイグレーションのジョブ）ので、それを使わない。

**production の承認**: GitHub は、環境を使うジョブごとに承認を求める。マイグレーションのジョブとデプロイのジョブはどちらも環境 `production` を使うので、production への1回の昇格で2回（マイグレーションの前とデプロイの前）承認する。再実行したときも、再実行したジョブがまた承認を待つ（デプロイのジョブだけを再実行しても同じ）。デプロイのジョブを環境の外に置くと、そのジョブだけの再実行が承認なしで production に出せてしまうので、環境を使う（マイグレーションのジョブも、production の `DATABASE_URL_DIRECT` を読むために環境を使う）。イメージのジョブは記録のバケットに書くだけで、環境のシークレットを読まず、production にも出さないので、環境を使わない（承認は2回のまま）。

**デプロイの記録**: `make promote` は、どの版が出たか・どの版のマイグレーションが当たったかもしれないか（4.1）を、`deploy.yml` が Cloud Storage のバケット `{GCP_PROJECT_ID}-moonx-deploys` に書く記録から決める（GitHub の実行の記録は、保持期間を過ぎると消えるため。ADR-016）。記録は `make deploy-record`（SDD 2章「make ターゲット」）で、その SHA を `deploy/$TARGET/version` に書いたコミット（`deploy.yml` が動いているコミット。`$GITHUB_SHA`）ごとに書く。

- 当てたかもしれない（`migrating`）: イメージのジョブが、イメージを確かめた後に書く。マイグレーションのジョブはイメージのジョブの後にしか動かないので、書けなければマイグレーションは始まらない。承認・`concurrency` の順番・`main` の読み直しより前に書くので、承認されなかった・後の昇格に追い越されて当てずに終えた実行にも残る（4.1 で、マイグレーションが当たったかもしれない版に数える）
- 出した（`deployed`）: デプロイのジョブが、最後の段で、確認（`/api/health` の版と `/api/health/db`）が通った後に書く。後の昇格に追い越されてデプロイを飛ばしたジョブは書かない。最後の段なので、デプロイのジョブが成功したことと、出した記録があることは同じになる（記録が書けなければ、確認で失敗したときと同じくジョブが失敗し、`make promote` はその版を出していないものとして扱う。デプロイのジョブを再実行すると、出し直して記録を書く）
- どちらも、`deploy.yml` が動いているコミットの Makefile で書く（戻すときも、戻し先の古い版の Makefile ではない）。`make promote` はこれまでに書かれたすべての記録を読むので、記録の名前の形を変えるときは、古い形も読めるようにする
- 書くアカウントは作成しかできず、記録を消せない・上書きできない。記録は自動では消さず、手でも消さない（ADR-016）
- `make promote` は、どの書き込みのものか分からない記録（その環境の `deploy/{env}/version` を書いていないコミットのもの、書いたのと違う SHA のもの）があると止まる。`main` は PR の squash マージだけで変わり、直接 push しない（03 9章・5.4 H）ので、記録か `main` の履歴が壊れたときにだけ起きる

### deploy.yml の順番

DB → API の順。Web は API と同じイメージに入っているので、API の新しいリビジョンと一緒に切り替わる（ADR-004）。前の段が失敗したら、後の段は動かさない。

```bash
# 検査のジョブ（GitHub の環境なし。id-token: write なし）。main の最新のコードで動かす（戻し先の古い版の
# Makefile には promote-check が無いことがある）
TARGET=staging                       # 変わったファイルで決まる
SHA="$(cat deploy/$TARGET/version)"
make promote-check BASE=<push の前のコミットの SHA>

# イメージのジョブ（GitHub の環境なし。Google Cloud に入る。deploy.yml が動いているコミットの Makefile だけを使い、
# Bun は入れない）
gcloud artifacts docker images describe "asia-southeast1-docker.pkg.dev/{GCP_PROJECT_ID}/moonx/api:$SHA"
# デプロイの記録の「当てたかもしれない」。書けなければ、マイグレーションのジョブは動かない
make deploy-record ENV=$TARGET SHA=$SHA WRITE=$GITHUB_SHA KIND=migrating

# マイグレーションのジョブ（GitHub の環境 $TARGET。production は承認のあと。id-token: write なし）
# 後の昇格が先に入っていたら（古い実行の再実行も）、古い版を出さずに終える
# （チェックアウトにトークンを残さないので、main の今のファイルは GitHub の API で読む）
[ "$(gh api -H 'Accept: application/vnd.github.raw' "repos/$GITHUB_REPOSITORY/contents/deploy/$TARGET/version?ref=main")" = "$SHA" ] || exit 0
# その SHA のコードと依存（Bun もその SHA が指定する版）で（DATABASE_URL_DIRECT は環境のシークレット）
git checkout "$SHA"
make install
make db-migrate

# デプロイのジョブ（同じ環境。production はもう一度承認のあと。Google Cloud に入る）
# 待つ間に後の昇格が先に入っていたら、同じく終える
[ "$(gh api -H 'Accept: application/vnd.github.raw' "repos/$GITHUB_REPOSITORY/contents/deploy/$TARGET/version?ref=main")" = "$SHA" ] || exit 0
# 1. その SHA の Makefile で API の新しいリビジョン（Bun と依存は入れない）
git checkout "$SHA"
make deploy-api ENV=$TARGET SHA=$SHA

# 2. デプロイ後の確認。新しい版にトラフィックが流れていることと、マイグレーションのあとで DB に繋がること
#    （SDD 5.14 Z1・Z2）。ドメイン（stg.{DOMAIN}・{DOMAIN}）ではなくサービスの URL で確かめる。DNS と
#    ドメインマッピングに頼らないので、ドメインの準備（03 5.4 J）の前の最初のデプロイでも通る
BASE_URL="$(gcloud run services describe moonx-api-$TARGET --region=asia-southeast1 --format='value(status.url)')"
test "$(curl -fsS "$BASE_URL/api/health" | jq -r .version)" = "$SHA"
curl -fsS "$BASE_URL/api/health/db"

# 3. デプロイの記録の「出した」。イメージのジョブと同じく、deploy.yml が動いているコミットの Makefile で
#    （そのコミットを別のフォルダにチェックアウトして、そこで動かす）
make deploy-record ENV=$TARGET SHA=$SHA WRITE=$GITHUB_SHA KIND=deployed
```

- **マイグレーション**（マイグレーションのジョブ。デプロイのジョブより先に動く）は「追加してから使い、使わなくなってから消す」で書いたものだけを流す（4.1）。これで、API を前のリビジョンに戻しても動く。マイグレーションのジョブが失敗したら、デプロイのジョブは動かない
- **依存**は、その SHA の lockfile で入れ直す（マイグレーションのジョブの `make install`）。戻すときに、新しい版の依存（マイグレーションの道具など）で古い版を動かさないため。戻すときも、マイグレーションとデプロイは戻し先の版の Makefile の `db-migrate` と `deploy-api` で動く
- **1. API** の新しいリビジョンが起動しないときは、Cloud Run は前のリビジョンに流したままにする（05 3.7）
- **2. 確認**: `/api/health` の `version` が `$SHA` でなければ、トラフィックが新しいリビジョンに流れていない（5.2 で前のリビジョンに固定したままなど）。新しいリビジョンが起動していることを確かめてから 5.2 の `--to-latest` で最新に戻し、`deploy.yml` を再実行する（production では、再実行したジョブがまた承認を待つ）。`/api/health` が失敗したら 5.2 で戻す。`/api/health/db` が 503 なら、新しいリビジョンが DB に繋がっていない。05 3.1〜3.3 で切り分け、新しいリビジョンが原因なら 5.2 で戻す
- **Web** は staging で確かめたイメージをそのまま production に出す（ADR-016）。環境ごとに違う値の渡し方は ADR-004

---

## 3. 初回クラウドセットアップ（IaC）

手順は [03_dev-setup.md 5.4](03_dev-setup.md) のチェックリスト。Terraform と CI の分担は 03 5.2。

### CI が使う値の置き場所

名前・置き場所（リポジトリか、GitHub の環境 `staging` / `production` / `production-backup` のどれか）・用途の正は [SDD 2章「CI のシークレットと変数」](02-01_system-design-doc.md#環境変数) の表。入れ方は 03 5.4 H。ここにはデプロイに関わる注意だけを書く。

- `build.yml` は GitHub の環境を使わないので、表で「リポジトリ」のものだけを読める。リポジトリに置くものを環境に移さない
- 環境は3つとも `main` からだけ使え、Google Cloud への入口（WIF）も `main` で動くワークフローに限る（ADR-016・ADR-027。03 5.4 G・H）。作業ブランチや PR で動くワークフローは、環境のシークレットを読めず、Google Cloud にも入れない
- 環境 `production` はデプロイに承認を要する。承認する人は 03 5.4 H で入れる
- 環境 `production-backup` は `db-backup.yml` と `kpi.yml` だけが使う。デプロイのワークフローから参照しない
- `GCP_WORKLOAD_IDENTITY_PROVIDER` / `GCP_DEPLOY_SERVICE_ACCOUNT` の値は、Terraform の `envs/shared` が作ったもの（03 5.4 G）
- `dwnfrc.app` の DNS（Vercel）のトークンは作らない。GitHub にも Terraform にも置かない（ADR-015。レコードは 03 5.4 で手で入れる）

---

## 4. リリース前チェックリスト

### 4.1 チェックリスト

- [ ] 出す SHA で `ci.yml` と `build.yml` が成功している（`make promote` は、`build.yml` がテストの後に上げるイメージがあることで確かめる。ADR-016）
- [ ] その SHA の API のイメージが Artifact Registry にある（`make promote` も確かめる）
- [ ] マイグレーションがある場合: `make db-generate` で作った SQL を読んだ。下の「expand / contract」に沿っている
- [ ] 昇格の PR の本文のマイグレーション（この昇格で新しく当たるもの）が、下の「expand / contract」に沿い、今その環境で動いている版の API がそのまま動くものだけ
- [ ] API の変更が、開いたままの古い画面（Service Worker が持っている前の版の画面を含む。ADR-031）を壊さない（項目の追加だけ。壊すなら `/api/v2`。ADR-006）
- [ ] 新しい環境変数・シークレットがある場合: SDD 2章の表に足し、Terraform・Secret Manager・GitHub（SDD の表の置き場所。リポジトリか環境か）に、staging と production の両方で入れた
- [ ] 環境変数・シークレットを消す・名前を変える場合: 新しい名前を先に足し、今その環境で動いている版と直前の版（下）の両方が古い名前を使わなくなってから（新しい名前だけを使う版の、次の昇格のあとで）、Terraform・Secret Manager・GitHub から消す
- [ ] `make db-migrate`・`make deploy-api` の引数や、それらが読む環境変数・シークレットの名前を変える場合: 戻せる版の Makefile でも `deploy.yml` から動くように、段階を分けた（SDD 2章「make ターゲット」）
- [ ] `infra/terraform/` の変更がある場合: 先に `make infra-apply ENV=$TARGET`（`shared` の変更なら `ENV=shared`）を済ませた
- [ ] Better Auth の更新を含む場合: staging でログイン（メール・Google）・招待・パスワード再設定を確かめた
- [ ] 29 プライバシーポリシーと 30 サポートの本文が入っている（BCDX が用意する。design-spec 9.2。本文が無いまま production に出さない）
- [ ] staging でデプロイ後の確認（6章）が済んだ
- [ ] 昇格の PR の本文（`make promote` が作る）を読み、production への昇格では staging での確認の結果（6章）を足した
- [ ] production の昇格は、承認する人が `deploy.yml` を2回（マイグレーションの前とデプロイの前。2章「production の承認」）承認できる時間に出す

#### マイグレーションの書き方（expand / contract）

DB は戻せない（ADR-016）。1回の昇格で新しく当たるマイグレーション（`make promote` が PR の本文に出す）は、**今その環境で動いている版の API がそのまま動くもの**だけにする。マイグレーションは API より先に当たるので、デプロイの間も今の版が動き続ける必要がある。

- 下の表の段階は、それぞれ別々の昇格でその環境に出す。次の段階は、前の段階（コードだけの変更も含む）を含む版がその環境で動いてから出す。
- production には staging に出した版しか出せないので、staging でも段階ごとに別々の昇格で出す。
- `make promote` の既定の SHA（最新）が、まだその環境に出ていない前の段階と次の段階をまとめて含むときは、`SHA=` で前の段階までの版を指定する（4.2）。

こう書いていれば、直前の版には戻せる。いちばん先まで出した版より古い版を出すとき、それが直前の版でなければ、5.1 の 3 で確かめる。

どの版が出たか・マイグレーションを始めたかは、`deploy.yml` が書くデプロイの記録（2章「デプロイの記録」）で決める。記録は、その SHA を `deploy/{env}/version` に書いたコミットごとに「当てたかもしれない」と「出した」があり、消えない（ADR-016）。前に読んでいた GitHub の実行の記録と同じ強さで決められる: 「出した」はデプロイのジョブの最後の段なので、デプロイのジョブが確認まで成功したことと同じ。マイグレーションのジョブは「当てたかもしれない」を書いたイメージのジョブの後にしか動かないので、その記録の無い書き込みはマイグレーションを始めていない（その段が動いた実行を数えていた前より、多めに数える）。記録は消えないので、記録が消えて分からない版は無い。

- いちばん先まで出した版: その環境の `deploy/{env}/version` に書かれた SHA のうち、実際に出たもの（それを書いたコミットのどれかに「出した」記録がある。デプロイのジョブが確認まで成功したときだけ書かれ、後の昇格が先に入って `make deploy-api` の段を飛ばしたジョブでは書かれない。2章）で、`main` の履歴でいちばん新しいもの。DB には、この版までのマイグレーションが当たっている。書かれたが出なかった版（検査で止まった・承認されなかった・失敗した・後の昇格に追い越された）は数えない
- 直前の版: いちばん先まで出した版を初めて出す前に、その環境に出ていた版（いちばん先まで出した版を初めて出した書き込みから古い方へたどって、最初に「出した」記録がある書き込みの版）
- マイグレーションが当たったかもしれない版: その環境に書かれた SHA のうち、いちばん先まで出した版より `main` の履歴で新しく、それを書いたコミットのどれかに「当てたかもしれない」記録があるもの（「出した」記録はどの書き込みにも無い）。マイグレーションは版ごとにまとめて当たるか、まったく当たらないかで、記録からは当たったかどうか分からない。DB は戻せないので、当たったかもしれないものとして扱う（ADR-016）
  - 「当てたかもしれない」記録は、イメージのジョブがマイグレーションのジョブより前（production では承認の前）に書く。そのため、マイグレーションが当たった・失敗した・取り消された・まだ動いている実行に加えて、承認を待っている・承認されなかった・後の昇格に追い越されて当てずに終えた実行の版も入る（多めに数えるので、安全な側）。記録の無い書き込み（検査かイメージのジョブで止まった、まだそこまで動いていない）は、マイグレーションを始めていない

  記録を書く前の実行（検査やイメージのジョブを待っている）は、当てていないものとして数える。その実行は記録を書いてからマイグレーションを始めるので、昇格の PR を出した後で記録が書かれたら、PR の本文は古くなる。`make promote` で作り直す

  `make promote` は、出す版がこの版より古ければ、出す版に無いこの版までのマイグレーションを「DB に当たっているかもしれず、出す版に無いもの」として本文に出す

| 変えたいこと | 1回目の昇格（expand） | 次以降の昇格（contract） |
|---|---|---|
| 列を足す | NULL を許すか、既定値を付けて足す | 全行が埋まってから、必要なら NOT NULL にする |
| 列の名前・型を変える | 新しい列を足し、両方に書く。古い行を埋める | 読む先を新しい列に変える（両方に書き続ける） → さらに次で古い列を消す |
| 列・テーブルを消す | コードから使うのをやめる | 次の昇格で消す |
| 制約を足す（一意・外部キー） | 先にデータを直す | 制約を足す |
| 値の種類を足す（DB の列挙型・JSON の中の値） | 新しい値を読めるようにする（列挙型なら値も足す） | 新しい値を書き始める |

### 4.2 昇格の PR の手順

昇格の PR は `make promote` で作る（確かめることと本文の中身は [SDD 2章「make ターゲット」](02-01_system-design-doc.md#make-ターゲット)）。手元に gh と gcloud のログインが要る（03 1章）。PR を作ったら、本文のマイグレーションの一覧を 4.1 の「expand / contract」と照らす。まだその環境に出ていない前の段階と次の段階が一緒に入っていたら、PR を閉じ、`SHA=` で前の段階までの版を指定して作り直す。出す版が、いちばん先まで出した版（4.1）より古く、直前の版でもないとき（戻したあとで、その間の版を出すときなど）は、5.1 の 3 と同じことを確かめる。

#### staging へ

```bash
git switch main && git pull
make promote ENV=staging     # SHA を省くと main の最新（deploy/ だけの変更は除く）
```

#### production へ

staging で確かめた SHA だけを出す（staging に出していない SHA は、`make promote` と CI が通さない）。

```bash
git switch main && git pull
make promote ENV=production  # SHA を省くと今の staging の版
```

PR の本文に、staging での確認の結果（6章）を足す。

#### マージとデプロイの確認

```bash
gh pr merge --squash --delete-branch
gh run list --workflow=deploy.yml --limit=1
gh run watch <RUN_ID>
```

production の `deploy.yml` は、GitHub の環境 `production` の承認を待って止まる。マイグレーションのジョブの前と、デプロイのジョブの前の2回止まる（2章「production の承認」）。どちらも GitHub の Actions のその実行の画面で「Review deployments」から承認する。`deploy.yml` が終わったら 6章の確認をする。

#### 最初のリリースのあとで: テンプレートを入れる

テンプレート（自己分析・検証・プラン）の中身は組織（BCDX）のもので、マイグレーションにもシードにも入れない。環境ごとに、最初のリリースのあとで運営者が1回だけ取り込む。公開するまで、その環境ではアイデアも自己分析も作れない。staging で済ませてから production でも行う。

1. 運営者を作る（03 5.4 K）
2. 運営者でログインし、テンプレートの管理（26・27）で、`data/templates/bcdx/` の3つのファイル（`self-analysis.json`・`validation.json`・`plan.json`）を1つずつ取り込む（SDD 5.13 AD10。取り込むと下書きの版ができる）
3. 下書きごとに公開の前の検査（AD6 validate）を動かし、エラーが無いことを確かめてから公開する（AD6 publish）。検証はプランより先に公開する（プランの数字の小項目が名前を出す費用行は、公開済みの検証のテンプレートの初期行だけを受け付ける。SDD 5.13 AD6 の `unknown_metric_key`）
4. 自己分析（10）が開けることを確かめる（アイデアの作成は、デプロイ後の確認（6章）で確かめる）

---

## 5. ロールバック手順

### 5.1 通常のロールバック（戻し先の SHA の昇格の PR）

基本の戻し方。戻し先の SHA を `deploy/$TARGET/version` に書いた昇格の PR をマージすると、デプロイと同じ `deploy.yml` がその版を出す。revert はしない（ADR-016）。イメージはすでにあるので、ビルドは要らない。

1. 戻し先を決める。戻せるのは、その環境に書かれたことのある版で、イメージが残っているもの（最新の30個か90日以内。ADR-007）

   ```bash
   git switch main && git pull
   # その環境に書かれた版（日付と SHA。新しい順）
   git log --format='%h %ad' --date=short -- deploy/$TARGET/version |
     while read -r c d; do echo "$d $(git show "$c:deploy/$TARGET/version")"; done
   ```

2. `make promote ENV=$TARGET SHA=<戻し先の短い SHA>` で PR を作る（件名は `roll back`）
3. 戻し先が直前の版（4.1）でなければ、PR の本文のマイグレーションの一覧（DB に当たっていて、戻し先の版に無いもの）に contract（4.1 の表の右の列）が無いことを確かめる。あれば、戻し先の版は今の DB で動かないことがある。PR を閉じ、その contract より後の版に戻すか、直した版を出して前に進める。新しい値を書き始めた変更（4.1 の表の最後の行）はマイグレーションに出ないことがあるので、コミットの一覧でも確かめる
4. PR の本文に、戻す理由と、3 で確かめた結果（直前の版でないとき）を書き、squash でマージする（production は `deploy.yml` の承認が、マイグレーションのジョブとデプロイのジョブで1回ずつ要る。2章「production の承認」）
5. 6章の確認をする

- マイグレーションは戻らない（新しい列などは残る）。戻し先の版のマイグレーションはすべて当たり済みなので、マイグレーションのジョブの `make db-migrate` は何も当てず、DB を変えない
- Web は API と同じイメージなので、一緒に戻る
- production を戻しても staging はそのまま。直した版は、いつもどおり staging から出す。それまで、`make promote ENV=production` は `SHA` を省くと止まる（今の staging の版は、production で戻した版のため）

以下は、PR を待てない緊急時（承認する人がすぐにいないときを含む）に CLI で直接戻す手順。戻したあとで、必ず 5.1 の PR（戻した版の SHA）もマージして `deploy/{env}/version` を実際に出ている版と合わせ、5.2 の最後のとおりトラフィックを最新に戻す。

### 5.2 API（Cloud Run）

```bash
# リビジョンとイメージ（SHA）の一覧
gcloud run revisions list --service=moonx-api-production --region=asia-southeast1 \
  --format="table(metadata.name,spec.containers[0].image,metadata.creationTimestamp)"

# 前のリビジョンに 100% 流す
gcloud run services update-traffic moonx-api-production --region=asia-southeast1 \
  --to-revisions=<REVISION>=100
```

リビジョンを指定して流すと、そのあとの `make deploy-api` で出た新しいリビジョンには流れない。5.1 の PR（戻した版の SHA）は、固定したリビジョンと同じ版なので `deploy.yml` の確認は通るが、別の版の昇格は確認で失敗する（`/api/health` の版が合わない。2章）。5.1 の PR の `deploy.yml` が新しいリビジョンを出したら、すぐに最新に戻す（最新は戻した版と同じイメージなので、悪い版には戻らない）。

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

staging でも production でも同じことをする（URL とサービス名を読み替える）。確認は、その環境の運営者のアカウント（03 5.4 K で作り、確認用のワークスペースを作ったアカウント）で行い、確認のためにほかのアカウントを作らない（登録の KPI（K-11・K-12）は運営者を数えないので、確認が登録の数に入らない。SDD 11章「KPI の数え方」）。

```bash
BASE_URL=https://{DOMAIN}            # staging は https://stg.{DOMAIN}

# 死活と DB（SDD 5.14 Z1・Z2。/api/health/db はマイグレーションのあとで DB に繋がるか）
curl -fsS "$BASE_URL/api/health"
curl -fsS "$BASE_URL/api/health/db"

# 出ているイメージが deploy/production/version の SHA か
gcloud run services describe moonx-api-production --region=asia-southeast1 \
  --format="value(spec.template.spec.containers[0].image)"
cat deploy/production/version

# deploy.yml がデプロイの記録の「出した」を書いたか（make promote が読む。2章「デプロイの記録」）。
# この書き込みの記録が -migrating と -deployed の2つ以上あること
gcloud storage ls "gs://{GCP_PROJECT_ID}-moonx-deploys/production/$(cat deploy/production/version)/$(git log -1 --format=%H -- deploy/production/version)/**"

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
- [ ] `deploy.yml` のデプロイのジョブが成功し、この書き込みの「出した」記録（`-deployed`）がある（2章「デプロイの記録」）
- [ ] Cloud Logging にエラーが増えていない。Sentry（`moonx-web` / `moonx-api`）に新しい issue が出ていない
- [ ] ドメインマッピングの証明書が有効で、`https://{DOMAIN}`（staging は `https://stg.{DOMAIN}`）で Web と API の両方が開く
- [ ] Web のトップ（ランディング）が出る。画面の HTML がマニフェストを指し、マニフェストと Service Worker のファイル（パスは ADR-031）が 200 で返る
- [ ] セキュリティヘッダー（CSP・HSTS など。SDD 7.2）が画面の応答に付いている
- [ ] メール＋パスワードでログインできる
- [ ] Google でログインできる（運営者のメールの Google のアカウントで。招待から登録したアカウントには、同じメールの Google のログインがつながる。SDD 5.4 U5）
- [ ] コアの流れが通る（確認専用のワークスペースで行う。03 5.4 K で環境ごとに1つ作り、毎回それを使う）: アイデアを作る → コストを入れる → 経済性（損益分岐など）を見る → 判断を記録する → プランを作る → Pitch Deck の PDF を出す（開ける・16:9・文字化けしない）。アイデアとプランは消せないので、終わったら作ったアイデアをアーカイブする
- [ ] 招待のメールが届く: 確認用のワークスペースの 9 から自分の別のメールあてに招待を出し（staging は `MAIL_ALLOWLIST` のメールあて）、届いたら 9 で取り消す（受けない。受けると確認だけのアカウントができ、登録の KPI に入る）
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
