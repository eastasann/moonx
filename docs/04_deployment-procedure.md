# Deployment Procedure — moonx

- この文書が持つもの: デプロイの流れ（GitHub Actions）、リリース前の確認、昇格の PR、ストアへの公開、ロールバック、デプロイ後の確認、緊急時の連絡先
- 環境の名前・環境変数・make ターゲット・ADR の正は [SDD 2章](02-01_system-design-doc.md#2-アーキテクチャ概要) と [SDD 3章](02-01_system-design-doc.md#3-技術選定と判断理由adr)。ここには書き写さない
- 初回のクラウドのセットアップとブランチ戦略は [03_dev-setup.md](03_dev-setup.md)（5.4・9章）
- 表記: `{DOMAIN}`・`{GCP_PROJECT_ID}`・`{APP_ID}` は SDD 2章のプレースホルダ。`<...>` はその場で調べて入れる値。`$TARGET` は `staging` か `production`

---

## 1. 環境一覧

名前の正は [SDD 2章「環境と命名」](02-01_system-design-doc.md#環境と命名)。

| 環境 | URL | サービス | DB | デプロイ方法 |
|---|---|---|---|---|
| local | `http://localhost:5173`（API `http://localhost:3000`） | `make dev`・`make dev-mobile` | Docker の PostgreSQL 17 | 手元で起動 |
| staging | `https://staging.{DOMAIN}` | Cloud Run `moonx-api-staging`・Worker `moonx-web`（env: staging）・EAS チャンネル `staging`（`{APP_ID}.staging`。TestFlight / Play 内部テスト） | Neon `moonx` のブランチ `staging` | `deploy/staging/version` を変える昇格の PR をマージ |
| production | `https://{DOMAIN}` | Cloud Run `moonx-api-production`・Worker `moonx-web`（env: production）・EAS チャンネル `production`（`{APP_ID}`。App Store / Google Play） | Neon `moonx` のブランチ `production` | `deploy/production/version` を変える昇格の PR をマージ |

- Cloud Run と Cloud Scheduler のリージョンは asia-southeast1
- wrangler は環境ごとに別の Worker を作る。Cloudflare の画面では `moonx-web-staging` / `moonx-web-production` と表示される（`--env` を付ければ `moonx-web` で操作できる）

---

## 2. CI/CD パイプライン

リリースはブランチではなく、`deploy/{env}/version`（デプロイするコミット SHA）の変更をきっかけにする（ADR-016）。staging も production も、昇格の PR をマージしたときにだけデプロイする。

```
[作業ブランチの PR]
    └── ci.yml: make lint → make typecheck → make test → make build → make test-e2e
                ＋ make tokens の差分の確認

[main へ squash マージ]（deploy/ だけの変更は除く）
    └── build.yml: テスト → API のイメージを作って Artifact Registry へ push（タグ = コミット SHA）
                    → Web のビルドの確認

[昇格の PR（deploy/{env}/version = SHA）をマージ]
    └── deploy.yml（GitHub の environment: staging / production）
          1. DB のマイグレーション（make db-migrate）
          2. API: Cloud Run に新しいリビジョン（イメージ = その SHA）
          3. Web: 環境の値でビルド → wrangler deploy --env $TARGET
          4. スマホ: EAS Update（JS だけ）/ EAS Build ＋ Submit（ネイティブの変更）
          5. デプロイ後の確認（/api/health）
        （戻す = 昇格の PR を revert）
```

### CI/CD ワークフロー

| ワークフロー | きっかけ | やること |
|---|---|---|
| `ci.yml` | すべての PR | `make db-up` → `make db-migrate` → `make lint` → `make typecheck` → `make test` → `make build` → `make test-e2e`。`make tokens` で差分が出たら失敗（ADR-018） |
| `build.yml` | `main` への push（`deploy/**` だけの変更は除く） | テスト → API のイメージ `asia-southeast1-docker.pkg.dev/{GCP_PROJECT_ID}/moonx/api:<SHA>` を作って push → Web のビルドの確認 |
| `deploy.yml` | `main` への push で `deploy/staging/version` か `deploy/production/version` が変わったとき | 下の「deploy.yml の順番」。環境ごとに同時に1つだけ動かす（後から来たものは待つ）。1つのコミットで両方の環境のファイルが変わっていたら失敗させる |
| `db-backup.yml` | 毎日（schedule） | production の DB を `pg_dump` して Cloud Storage へ（05 6.2） |
| （Terraform） | — | CI では動かさない。人が `make infra-plan` / `make infra-apply` で動かす（03 5.2） |

Google Cloud へは Workload Identity Federation で入る（GitHub に鍵を置かない。ADR-007）。

### deploy.yml の順番

DB → API → Web → スマホの順。前の段が失敗したら、後の段は動かさない。

```bash
TARGET=staging                       # 変わったファイルで決まる
SHA="$(cat deploy/$TARGET/version)"
IMAGE="asia-southeast1-docker.pkg.dev/{GCP_PROJECT_ID}/moonx/api:$SHA"

# 0. その SHA のコードを取り、イメージがあることを確かめる
git checkout "$SHA"
gcloud artifacts docker images describe "$IMAGE"

# 1. DB のマイグレーション（DATABASE_URL_DIRECT は environment のシークレット）
make db-migrate

# 2. API。イメージだけを変える（他の設定は Terraform が持つ）
gcloud run deploy moonx-api-$TARGET --image="$IMAGE" --region=asia-southeast1 --quiet
curl -fsS https://staging.{DOMAIN}/api/health      # production は https://{DOMAIN}/api/health

# 3. Web。VITE_APP_ENV・VITE_SENTRY_DSN は environment の変数
make build
cd apps/web && bunx wrangler deploy --env $TARGET

# 4. スマホ（JS だけの変更のとき）
cd apps/mobile && eas update --channel $TARGET --message "$SHA" --non-interactive
```

- **1. マイグレーション**は「追加してから使い、使わなくなってから消す」で書いたものだけを流す（4.1）。これで、API を前のリビジョンに戻しても動く
- **2. API** の新しいリビジョンが起動しないときは、Cloud Run は前のリビジョンに流したままにする。`/api/health` が失敗したら 5.2 で戻す
- **3. Web** は main のビルドを使い回さず、同じ SHA から環境ごとに作る。`VITE_*` はビルドのときに埋め込まれ、環境ごとに値が違うため
- **4. スマホ**: ネイティブの部分（ネイティブのライブラリ・`app.config.ts` のネイティブの設定・Expo SDK）が変わったかで分ける

  | ネイティブの変更 | やること |
  |---|---|
  | 無い（同じ runtime のビルドがある） | `eas update --channel $TARGET`。開いている版のアプリに次の起動から届く |
  | ある | `eas build --platform all --profile $TARGET --auto-submit --non-interactive`。staging は TestFlight と Play 内部テストに届く。production は審査を経て公開する（4.3） |

- `eas update` は `eas.json` の profile の `env` を読まない。`EXPO_PUBLIC_API_BASE_URL`・`EXPO_PUBLIC_APP_ENV`・`EXPO_PUBLIC_SENTRY_DSN` を、その profile と同じ値で環境変数として渡す（値は SDD 2章「環境変数」）。渡し忘れると、届いたアプリが違う API を呼ぶ

---

## 3. 初回クラウドセットアップ（IaC）

手順は [03_dev-setup.md 5.4](03_dev-setup.md) のチェックリスト。Terraform と CI の分担は 03 5.2。ここには CI/CD が使う設定だけを書く。

### GitHub の environment とシークレット

| 置き場所 | 名前 | 種類 | 内容 | 名前の出どころ |
|---|---|---|---|---|
| environment `staging` / `production` | `DATABASE_URL_DIRECT` | シークレット | Neon のプールを通さない接続（マイグレーション用） | SDD 2章 |
| environment `staging` / `production` | `VITE_APP_ENV` | 変数 | `staging` / `production` | SDD 2章 |
| environment `staging` / `production` | `VITE_SENTRY_DSN` | 変数 | Sentry（web）の DSN | SDD 2章 |
| リポジトリ | `CLOUDFLARE_API_TOKEN` | シークレット | wrangler が使うトークン（Workers の編集） | wrangler が決めた名前。SDD 2章に未記載 |
| リポジトリ | `CLOUDFLARE_ACCOUNT_ID` | シークレット | Cloudflare のアカウント ID | 同上 |
| リポジトリ | `EXPO_TOKEN` | シークレット | EAS CLI が使うトークン | EAS CLI が決めた名前。SDD 2章に未記載 |
| `.github/workflows/` の中 | WIF のプロバイダ名・デプロイ用サービスアカウントのメール | 秘密ではない | Google Cloud への認証 | Terraform が作る（03 5.4 G） |

---

## 4. リリース前チェックリスト

### 4.1 チェックリスト

- [ ] 出す SHA で `ci.yml` と `build.yml` が成功している
- [ ] その SHA の API のイメージが Artifact Registry にある
- [ ] マイグレーションがある場合: `make db-generate` で作った SQL を読んだ。下の「expand / contract」に沿っている
- [ ] API の変更が、出回っているスマホの版を壊さない（項目の追加だけ。壊すなら `/api/v2`。ADR-006）
- [ ] 新しい環境変数・シークレットがある場合: SDD 2章の表に足し、Terraform・Secret Manager・`wrangler.jsonc`・`eas.json`・GitHub の environment に staging と production の両方で入れた
- [ ] `infra/terraform/` の変更がある場合: 先に `make infra-apply ENV=$TARGET` を済ませた
- [ ] ネイティブの変更の有無を確かめた。ある場合はストアの段取りを決めた（4.3）
- [ ] Better Auth の更新を含む場合: staging でログイン（メール・Google）・招待・パスワード再設定を確かめた
- [ ] 期限の通知に関わる変更の場合: staging でジョブを手で動かして確かめた（`gcloud scheduler jobs run moonx-staging-due-notifications --location=asia-southeast1`）
- [ ] staging でデプロイ後の確認（6章）が済んだ
- [ ] 昇格の PR に、対象の SHA・出す変更の一覧・staging での確認の結果・マイグレーションとネイティブの変更の有無・戻し方を書いた（`.github/PULL_REQUEST_TEMPLATE.md`）

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

`deploy.yml` が終わったら 6章の確認をする。

### 4.3 スマホのストアへの公開

ネイティブの変更があるとき、またはストアの版を上げるとき（`app.config.ts` の version）に行う。JS だけの修正は EAS Update で済む（2章）。

#### iOS

1. staging の昇格で TestFlight（`{APP_ID}.staging`）に届いた版を確かめる
2. production の昇格で `deploy.yml` が `{APP_ID}` をビルドし、TestFlight に提出する（手で動かすときは `eas build --platform ios --profile production` → `eas submit --platform ios --profile production --latest`）
3. TestFlight の内部テスターで、6章のスマホの確認をする
4. App Store Connect で新しい版を作る: リリースノート・スクリーンショット・App Review に関する情報（デモのアカウント。下）
5. 審査に出す。公開は「手動でリリース」＋「段階的リリース」にする

#### Android

1. staging の昇格で Play の内部テスト（`{APP_ID}.staging`）に届いた版を確かめる
2. production の昇格で `deploy.yml` が `{APP_ID}` をビルドし、内部テストのトラックに提出する（手で動かすときは `eas build --platform android --profile production` → `eas submit --platform android --profile production --latest`）
3. 内部テストで、6章のスマホの確認をする
4. Play Console で内部テストのリリースを製品版に昇格する。「アプリのアクセス権」にデモのアカウントを入れる
5. 審査のあと、段階的な公開（例: 20% → 100%）で出す

最初の1回だけは、ビルドした AAB を Play Console に手で上げる（EAS Submit は2回目から使える）。

#### 審査用のデモアカウント

招待制のため、審査をする人は自分で登録できない。production に審査専用のアカウントを用意する（ADR-003）。

- [ ] production に審査専用のワークスペースを作り、審査用のメールを招待して登録する（メール＋パスワード。Google ログインは使わない）
- [ ] そのワークスペースに、3工程（自己分析 → アイデア検証 → ビジネスプラン）を一通り見られるサンプルのデータを手で入れる（BCDX の実データは使わない。`make db-seed` は production に使わない）
- [ ] コメントなど複数人の機能を見せるため、同じワークスペースにもう1人のメンバーを入れておく
- [ ] ID とパスワードをパスワード管理に入れ、App Store Connect（App Review に関する情報）と Play Console（アプリのアクセス権）に書く
- [ ] 審査のメモに書く: BCDX 向けの招待制のアプリであること、デモのアカウントで全機能を見られること、Pitch Deck の PDF の出し方
- [ ] 審査のあとも消さない（版を出すたびに審査がある）。パスワードを変えたら両ストアも直す

#### 審査で求められるもの（出す前に確かめる）

| 項目 | iOS | Android |
|---|---|---|
| プライバシーポリシーの URL | 必須 | 必須 |
| 集めるデータの申告 | App のプライバシー | データ セーフティ |
| ログインが要るアプリのデモアカウント | App Review に関する情報 | アプリのアクセス権 |
| アカウントを作れるアプリの、アカウント削除の手段 | 必須。アプリ内で削除できること（ガイドライン 5.1.1(v)） | 必須。アプリ内の手段と、Web で申し込める URL |
| 第三者のログイン（Google）があるときの同等のログイン手段 | ガイドライン 4.8 で指摘されることがある。出す前に方針を決める | — |
| 暗号化の申告 | HTTPS だけなら輸出規制の対象外と答える | — |
| コンテンツのレーティング | 年齢の区分 | レーティングの質問票 |

---

## 5. ロールバック手順

### 5.1 通常のロールバック（昇格の PR の revert）

基本の戻し方。`deploy/{env}/version` を前の SHA に戻す PR をマージすると、デプロイと同じ `deploy.yml` が前の版を出す。

1. GitHub で、戻したい昇格の PR を開き「Revert」を押す（新しい PR ができる）
2. PR の本文に理由を書き、squash でマージする
3. 6章の確認をする

- マイグレーションは前の版に戻らない（新しい列などは残る）。expand / contract を守っていれば、前の版の API はそのまま動く
- スマホの JS は前の版の EAS Update が出る。ストアのバイナリは戻らない（5.5）

以下は、PR を待てない緊急時に CLI で直接戻す手順。戻したあとで、必ず 5.1 の revert もしてリポジトリと合わせる。

### 5.2 API（Cloud Run）

```bash
# リビジョンとイメージ（SHA）の一覧
gcloud run revisions list --service=moonx-api-production --region=asia-southeast1 \
  --format="table(metadata.name,spec.containers[0].image,metadata.creationTimestamp)"

# 前のリビジョンに 100% 流す
gcloud run services update-traffic moonx-api-production --region=asia-southeast1 \
  --to-revisions=<REVISION>=100
```

リビジョンを指定して流すと、次の `gcloud run deploy` で新しいリビジョンに流れなくなる。直した版を出すときは、最新に戻す。

```bash
gcloud run services update-traffic moonx-api-production --region=asia-southeast1 --to-latest
```

### 5.3 Web（Cloudflare Worker）

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

### 5.5 ストアのバイナリ

ストアに出たバイナリは戻せない。

1. 広がるのを止める: App Store は「段階的リリースを一時停止」、Google Play は「公開を停止」
2. JS だけで直せるなら、その runtime 向けに EAS Update を出す（5.4・2章）
3. ネイティブの修正が要るなら、版を上げて作り直して出す（4.3）。iOS は急ぎの審査（Expedited Review）を申し込める
4. API 側で古い版に合わせられるなら、先に API を直す（ADR-006）

### 5.6 DB

- 戻さない。直すマイグレーションを足して前へ進める（expand / contract）
- データが壊れた・消えたときは、Neon の復元か `pg_dump` のバックアップから戻す（05 5章・6.2）。戻した時点より後に書かれたデータは消えるので、まず影響の範囲を確かめる

### 5.7 インフラ（Terraform）

```bash
# Terraform の変更の PR を revert してマージしてから
git switch main && git pull
make infra-plan ENV=production    # 戻る差分を確かめる
make infra-apply ENV=production
```

---

## 6. デプロイ後確認

staging でも production でも同じことをする（URL とサービス名を読み替える）。

```bash
# 死活
curl -fsS https://{DOMAIN}/api/health

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

- [ ] `/api/health` が 200 を返す
- [ ] Cloud Run のイメージの SHA が `deploy/{env}/version` と同じで、最新のリビジョンに 100% 流れている
- [ ] Cloud Logging にエラーが増えていない。Sentry（web / mobile / api）に新しい issue が出ていない
- [ ] Web のトップ（ランディング）が出る
- [ ] メール＋パスワードでログインできる
- [ ] Google でログインできる
- [ ] コアの流れが通る（運営者自身の個人用ワークスペースで行い、終わったら消す）: アイデアを作る → コストを入れる → 経済性（損益分岐など）を見る → 判断を記録する → プランを作る → Pitch Deck の PDF を出す（開ける・16:9・文字化けしない）
- [ ] 招待のメールが届く（staging は `MAIL_ALLOWLIST` のメールで）
- [ ] スマホ（そのチャンネルのビルド）: ログイン → アイデアを開く → PDF を共有できる。EAS Update が届いている（アプリを2回起動し直す）
- [ ] staging だけ: `/api/docs` が開く。production: `/api/docs` が開かない（ADR-006）
- [ ] 期限の通知のジョブが次の回で成功している（05 4章）

---

## 7. 緊急時連絡先

| 役割 | 担当 | 連絡手段 | 持っている権限 |
|---|---|---|---|
| 開発・運用の担当（一次対応。アラートの通知先） | `<氏名>` | `<連絡手段>` | GitHub・Google Cloud・Cloudflare・Neon・Resend・Sentry・Expo |
| 予備の担当 | `<氏名>` | `<連絡手段>` | 同上（少なくとも Google Cloud と Cloudflare） |
| BCDX の窓口（利用者への連絡） | `<氏名>` | `<連絡手段>` | 運営者（アプリの管理画面） |
| Google Cloud の請求先の管理者 | `<氏名>` | `<連絡手段>` | 請求先アカウント |
| Cloudflare のアカウントの持ち主（`{DOMAIN}`） | `<氏名>` | `<連絡手段>` | Registrar・DNS |
| Apple Developer の Account Holder | `<氏名>` | `<連絡手段>` | App Store Connect・会員の更新 |
| Google Play Console のアカウントの持ち主 | `<氏名>` | `<連絡手段>` | Play Console |

- アラートは一次対応の担当にメールで届く（05 2章）。1人で運用するときは、予備の担当に少なくとも Google Cloud と Cloudflare の権限を渡しておく
- 外部サービスの障害の確かめ方は 05 5章
