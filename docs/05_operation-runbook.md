# Operation Runbook — moonx

- この文書が持つもの: アラートを受けたときの確かめ方と対処、よくある障害の確かめ方と対処、ログの見方、エスカレーション、定期メンテナンスの頻度と手順（バックアップを戻す練習の頻度を含む）、DB のバックアップの確かめ方と戻し方
- 監視の項目と閾値の正は [SDD 11章](02-01_system-design-doc.md#11-モニタリングログ)、ログの項目は [ADR-023](02-01_system-design-doc.md#adr-023-監視とログは-sentry-と-cloud-logging)、ログのレベルは [SDD 8.3](02-01_system-design-doc.md#83-ログとの対応)。環境の名前・環境変数・CI のシークレットの正は [SDD 2章](02-01_system-design-doc.md#2-アーキテクチャ概要)
- デプロイとロールバックは [04_deployment-procedure.md](04_deployment-procedure.md)、初回のセットアップは [03_dev-setup.md](03_dev-setup.md) 5.4
- 表記: `{DOMAIN}`・`{GCP_PROJECT_ID}` は SDD 2章のプレースホルダ。`<...>` はその場で調べて入れる値。コマンドの例は production。staging は名前を読み替える
- gcloud は先に `gcloud config set project {GCP_PROJECT_ID}` をしておく

---

## 1. モニタリング・ログ設計

### ログ構成

| ソース | 出力先 | 保持期間 | 内容 |
|---|---|---|---|
| API（Cloud Run の標準出力） | Cloud Logging | SDD 11章（`_Default` バケット） | 1行1つの JSON（項目は ADR-023） |
| Cloud Run のリクエストのログ | Cloud Logging | API と同じ `_Default` バケット | URL・ステータス・時間。アプリのログが出ない失敗（起動の失敗・タイムアウト・メモリ不足）もここと system のログに出る |
| 稼働時間チェック | Cloud Monitoring | Cloud Monitoring の保持期間 | `https://{DOMAIN}/api/health` の結果 |
| エラー（Web・API） | Sentry の2つのプロジェクト（`moonx-web` / `moonx-api`） | Sentry の無料プランの保持期間 | 例外・リクエスト ID・リリース（版）・environment |
| メール | Resend の管理画面（Emails） | Resend のプランの保持期間（短い） | 送信・配達・バウンス |
| DB | Neon のコンソール（Monitoring・Usage） | Neon のプランによる | 接続数・容量・計算時間 |
| デプロイ・バックアップ・KPI のワークフローの実行記録 | GitHub Actions | 90日 | `deploy.yml`・`build.yml`・`db-backup.yml`・`kpi.yml` の記録 |

リクエスト ID がどこに入るかは [SDD 8.3](02-01_system-design-doc.md#83-ログとの対応)。利用者からエラーの連絡を受けたら、画面に出た `Ref`（リクエスト ID の先頭）をもらい、4章のコマンドで追う。

### ログレベル

どのレベルで何を出すかの正は [SDD 8.3](02-01_system-design-doc.md#83-ログとの対応)、出す範囲（`LOG_LEVEL`）の値は SDD 2章「環境変数」。読むときは次のように使う。

- 障害を探すときは `severity>=ERROR` から見る（4章）
- `warn` が出ていたら、SDD 8.3 で何が `warn` になるかを確かめて対処する（401・403 の多発なら、設定の誤り（3.11・3.12）か攻撃を疑う）。409 の衝突や招待の期限切れは、1件ずつは障害として扱わない

---

## 2. 監視ポイントとアラート

監視の項目・閾値・アラートを付ける環境の正は [SDD 11章](02-01_system-design-doc.md#11-モニタリングログ)。ここには、アラートや定期の確認で何を見て、どう対処するかだけを書く。

- アラートの定義は Terraform（Cloud Monitoring のアラートは `envs/production`、予算アラートと通知のチャンネルは `envs/shared`）。閾値を変えるときは、SDD 11章と Terraform を同じ PR で直す
- アラートの通知先は、一次対応の担当のメール（04 7章）。アラートを付けない環境（SDD 11章）は、Sentry の issue で見る
- 稼働時間チェックは `/api/health`（SDD 5.14 Z1）だけに向ける。`/api/health/db`（Z2）は、デプロイ後と障害の切り分けのときに手で呼ぶ

### アラートを受けたとき

| アラート（SDD 11章の項目） | まず見るもの | 対処 |
|---|---|---|
| 死活（稼働時間チェック） | 3.9 の切り分け（ドメインで呼ぶ・Cloud Run を直接呼ぶ・ドメインマッピングと DNS）。外部のサービスの障害（5章） | 3.9。API 側なら 3.5・3.7 |
| エラー率（5xx） | 4章の「5xx」のコマンド。直前にデプロイしていないか | 3.5。デプロイが原因なら戻す（04 5章） |
| レイテンシ | 4章の「遅いリクエスト」のコマンドで、遅いルートを探す | 0台からの起動なら 3.4、DB が休んでいた後なら 3.1、PDF なら 3.6 |
| メモリ | Cloud Monitoring の Cloud Run のメモリの使用率（`container/memory/utilizations`）。PDF の作成と重なっているか | 3.6 |
| 台数 | Cloud Monitoring の Cloud Run の台数（`container/instance_count`）と、同じ時間のリクエスト数。4章の Cloud Logging で、同じ呼び出しの繰り返しや攻撃が無いか | 遅いルートがあれば直す（3.5）。繰り返しや攻撃なら、ログで送り元と呼び先を特定して止める（回数制限は SDD 7.2）。利用が本当に増えたなら、上限の台数（ADR-007）を見直すかをユーザーと決める |
| API のエラー（Sentry の新しい issue） | Sentry の issue のリクエスト ID で Cloud Logging を追う（4章） | 3章の該当の項目 |
| 費用（予算アラート） | 6.1 の「費用の確認」の見る先 | 増えたサービスを特定して無料枠に戻す。戻せなければ、予算（SDD 1章 Goal）をユーザーと相談する |

### 定期に見るもの

頻度は 6.1（この文書が正）。比べる値は、SDD 11章にあるものは11章の値、無いものは各サービスの無料枠（それぞれの ADR）。

| 対象 | 見る先 | 比べるもの |
|---|---|---|
| DB の容量 | Neon のコンソール → Usage（production と staging のブランチの合計）。大きいテーブルは 3.3 の SQL | SDD 11章「DB の容量」 |
| Neon の計算時間 | Neon のコンソール → Usage（使い切ると DB が止まる。3.3） | SDD 11章「無料枠の使用量」 |
| ダッシュボードの遅さ | 4章の遅いリクエストのコマンド（ダッシュボードの `route`） | ADR-011 の「入れる条件」 |
| Sentry の使用量 | Sentry の使用量の画面 | SDD 11章「無料枠の使用量」 |
| Resend の送信数 | Resend の管理画面。まとめて招待する前にも見る | SDD 11章「無料枠の使用量」 |
| メールの送信の失敗と戻り（バウンス） | Resend の管理画面 → Emails | SDD 11章「メール」。あれば 3.13 |
| Cloud Run の無料枠 | 請求のレポート（6.1 の「費用の確認」） | SDD 11章「無料枠の使用量」 |

---

## 3. よくある障害と対処法

まずリクエスト ID でログを追う（4章）。直前にデプロイしていて原因がそれらしければ、調べる前に戻す（04 5章）。

### 3.1 Neon: 休んだ後の最初の応答が遅い・接続が切れる

**症状:** しばらく使われなかった後の最初のリクエストが1秒以上遅い。まれに、その直後に1回だけ接続が切れたエラーが出る。

**確認:** Neon のコンソール → Branches → `production` → Computes の状態（Idle / Active）。

**対処:**
- 遅いのは仕様（ADR-008。使われないと5分で休む。無料プランでは止められない）。Cloud Run の起動（3.4）と重なると数秒になる
- 休んだ後に接続が切れたエラーが出続けるなら、API の DB の接続のプールが、休む前の古い接続を使っている。接続を空けておく時間を Neon が休むまでより短くする（コードの修正）

### 3.2 Neon: 接続数の上限

**症状:** `too many connections`・`remaining connection slots are reserved` などのエラー。

**確認:**

```bash
# API がプール接続（ホスト名に -pooler）を使っているか。パスワードは伏せて表示する
gcloud secrets versions access latest --secret=moonx-production-database-url | sed -E 's#://[^@]+@#://***@#'
```

```sql
-- Neon の SQL Editor（production のブランチ）
select application_name, state, count(*) from pg_stat_activity group by 1, 2 order by 3 desc;
```

**対処:**
- API はプール接続を使う（ADR-008）。直接の接続になっていたら、プール接続の値を新しい版で入れ、新しいリビジョンを作る（3.14 の手順 1・2）
- プール接続で `prepared statement "..." does not exist` が出るなら、postgres.js の `prepare: false` が効いているか確かめる（ADR-008）
- 手元から直接の接続をつないだままにしない（`make db-studio` などを production に向けない）

### 3.3 Neon: 無料枠を使い切った（容量・計算時間）

**症状:**
- 容量: 書き込みが失敗し、`project size limit` を含むエラーが出る。読むことはできる
- 計算時間: DB に繋がらなくなる（月が変わるまで止まる）

**確認:** Neon のコンソール → Usage。どのテーブルが大きいかを見る。

```sql
select pg_size_pretty(pg_database_size(current_database()));

select relname, pg_size_pretty(pg_total_relation_size(relid)) as size
from pg_catalog.pg_statio_user_tables
order by pg_total_relation_size(relid) desc
limit 10;
```

**対処:**
1. すぐに戻すなら、Neon を有料プランに上げる（ADR-008）。費用は月の確認（6章）で見直す
2. 容量: `change_history` が大きい想定（ADR-008）。枠は staging のブランチと分け合う（ADR-008）ので、staging の要らないデータを消す。staging を production から作り直さない（実データが入る）
3. 計算時間: これも staging と分け合う。DB を起こし続けているもの（`/api/health` が DB に触れていないか（SDD 5.14 Z1）、稼働時間チェックが `/api/health/db` に向いていないか、手元からの接続の放置、staging での長い作業）を探す
4. 続くようなら、別の PostgreSQL への移行を考える（ADR-008）

### 3.4 Cloud Run: コールドスタートで遅い

**症状:** しばらく使われなかった後、最初のデータの読み込みに数秒かかる。Web の画面も同じ Cloud Run が返すので、Service Worker がまだ入っていない最初の表示も待つ（ADR-004）。

**確認:**

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="moonx-api-production" AND textPayload:"Starting new instance"' \
  --freshness=1d --limit=20
```

**対処:**
- 許容する（ADR-007）
- 利用者が遅いと感じるなら、ADR-007 のトレードオフのとおり Terraform の `min_instance_count` を変えるかをユーザーと決める。決めたら PR → `make infra-plan ENV=production` → `make infra-apply ENV=production`
- 急ぐときだけ CLI で先に変え、同じ値を Terraform にも入れる（入れないと次の apply で0台に戻る）

  ```bash
  gcloud run services update moonx-api-production --region=asia-southeast1 --min-instances=1
  ```

### 3.5 Cloud Run: 5xx が増えた

**確認:**

```bash
# アプリが返した 5xx
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="moonx-api-production" AND jsonPayload.status>=500' \
  --freshness=1h --limit=20 --format=json

# Cloud Run 自身が返した 5xx（アプリのログが無いもの）
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="moonx-api-production" AND logName:"run.googleapis.com%2Frequests" AND httpRequest.status>=500' \
  --freshness=1h --limit=20
```

**対処:**

| 見え方 | 主な原因 | 対処 |
|---|---|---|
| アプリのログに 500 と例外 | コードの不具合 | Sentry（`moonx-api`）で同じリクエスト ID を見る。直前のデプロイが原因なら戻す（04 5.1・5.2） |
| DB の接続のエラー | Neon | 3.1〜3.3 |
| リクエストのログだけに 503 | インスタンスが足りない（上限の台数。ADR-007）、起動の失敗 | 3.7。台数のグラフを見る |
| リクエストのログだけに 504 | タイムアウト（ADR-007） | `latencyMs` で遅いルートを探す。PDF なら 3.6 |
| メモリの上限のメッセージ | メモリ不足 | 3.6 |

### 3.6 Cloud Run: PDF の作成でメモリ不足

**症状:** Pitch Deck の PDF を出すと失敗する。ログに `Memory limit of <上限> MiB exceeded` が出る（上限は ADR-007）。

**確認:**

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="moonx-api-production" AND textPayload:"Memory limit"' \
  --freshness=1d --limit=10
```

Cloud Monitoring で Cloud Run のメモリの使用率も見る。

**対処:**
- 急ぐときはメモリを増やす。同じ値を Terraform にも入れ、ADR-007 の値も直す

  ```bash
  gcloud run services update moonx-api-production --region=asia-southeast1 --memory=<新しい上限>
  ```

- 原因を探す: 大きな画像、フォントの全体の埋め込み（ADR-012 では使った文字だけを埋め込む）、同時に作られる PDF の数
- メモリを増やすと無料枠（GiB 秒）を早く使うので、費用の確認（6章）で見る

### 3.7 Cloud Run: 新しいリビジョンが起動しない

**症状:** `deploy.yml` の `make deploy-api` が失敗する（`failed to start and listen on the port defined provided by the PORT=8080` など）。Cloud Run は前のリビジョンに流したままなので、利用者への影響は無い。

**確認:**

```bash
gcloud run revisions list --service=moonx-api-production --region=asia-southeast1
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.revision_name="<REVISION>"' \
  --freshness=1h --limit=50
```

**対処:**

| ログに出るもの | 原因 | 対処 |
|---|---|---|
| シークレットが見つからない・権限が無い | Secret Manager に値（有効な版）が無い、実行用のサービスアカウントの権限 | 値を入れる（03 5.4 I）。権限は Terraform で直す |
| 起動のときの設定の検査で終了する | 新しい環境変数を Terraform に入れ忘れた | Terraform に入れて `make infra-apply` → `deploy.yml` を再実行（`gh run rerun <RUN_ID>`） |
| `exec format error` | 手元（Apple シリコン）で `make build-api-image` を動かして作った arm64 のイメージ | イメージは `build.yml` が作ったものだけを使う |
| ポートで待ち受けていない | アプリが `PORT` を読んでいない | コードを直す |

### 3.8 DB のマイグレーションが失敗した

**症状:** `deploy.yml` の最初の段（`make deploy-api` の中のマイグレーション）で失敗する。API と Web は前の版のまま。

**確認:**

```bash
gh run view <RUN_ID> --log-failed
```

```sql
-- どこまで当たったか（Neon の SQL Editor）
select id, hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 5;
```

**対処:**
- Neon が休んでいた・一時的な接続の失敗なら、もう一度動かす: `gh run rerun <RUN_ID> --failed`
- SQL やデータが原因なら、当たったマイグレーションは書き換えず、直すマイグレーションを足して新しい SHA を昇格する（04 4.1 の expand / contract）

### 3.9 ドメインで繋がらない: ドメインマッピング・証明書・DNS

**症状:** `https://{DOMAIN}`（staging は `https://stg.{DOMAIN}`）で Web と API がすべて開かない（証明書のエラー・名前解決の失敗・404 など）。

**確認:** 順に見て切り分ける。

```bash
# 1. ドメインで呼ぶ
curl -sS -o /dev/null -w '%{http_code}\n' https://{DOMAIN}/api/health

# 2. Cloud Run を直接呼ぶ
run_url="$(gcloud run services describe moonx-api-production --region=asia-southeast1 --format='value(status.url)')"
curl -sS -o /dev/null -w '%{http_code}\n' "$run_url/api/health"

# 3. ドメインマッピングの状態（Ready と CertificateProvisioned）
gcloud beta run domain-mappings describe --domain={DOMAIN} --region=asia-southeast1

# 4. DNS（Vercel の CNAME）
dig +short CNAME {DOMAIN}
```

| 1（ドメイン） | 2（直接） | 3・4 | 原因 | 対処 |
|---|---|---|---|---|
| 失敗 | 成功 | CNAME が `ghs.googlehosted.com.` でない・無い | Vercel の DNS のレコードが消えた・変わった | 3.10 |
| 失敗 | 成功 | CNAME は正しく、証明書の条件が False | 証明書ができていない・更新に失敗した（DNS を変えた直後など） | DNS が正しいことを確かめて待つ（最大24時間）。直らなければ、Terraform でドメインマッピングを作り直す（`make infra-plan` で差分を確かめてから）。作り直しには Search Console の所有の確認が要る（3.10） |
| 失敗 | 成功 | ドメインマッピングが無い | Terraform の外で消した | `make infra-plan ENV=production` で差分を確かめ、`make infra-apply ENV=production` |
| 失敗 | 失敗（403） | — | Cloud Run が認証なしの呼び出しを受けない設定 | `gcloud run services get-iam-policy moonx-api-production --region=asia-southeast1` に `allUsers` の `roles/run.invoker` があるか。Terraform で直す |
| 失敗 | 失敗 | — | API 側の問題 | 3.5・3.7 |

ドメインマッピングは Google が Preview として出している機能で、遅延の問題から本番向けではないとしている（ADR-004。承知の上で選んだ）。遅さや不安定さが続くなら、ADR-004 の乗り換え先（ロードバランサ）をユーザーと相談する。

### 3.10 ドメインの DNS（Vercel）のレコードが消えた・変わった

**症状:** 次のどれか。ドメインで Web と API が開かない（3.9）。招待のメールが届かない・迷惑メールになる（3.13）。ドメインマッピングを作り直せない（所有の確認が外れた）。

**確認:** 03 5.4 A・F・J で入れたレコードがそろっているか。

```bash
dig +short CNAME {DOMAIN}                          # ghs.googlehosted.com.
dig +short CNAME stg.{DOMAIN}                      # ghs.googlehosted.com.
dig +short TXT dwnfrc.app | grep google-site-verification
dig +short TXT resend._domainkey.{DOMAIN}
dig +short MX send.{DOMAIN}
dig +short TXT _dmarc.{DOMAIN}
```

**対処:**
- 足りないレコードを Vercel の画面で入れ直す（値は 03 5.4 A・F・J の手順の画面で確かめる。Resend の値は Resend の Domains、Search Console の値は Search Console の所有権の確認）。Vercel のトークンは作らない（ADR-015）
- `dwnfrc.app` の DNS は同じ Vercel のアカウントの別のプロジェクトとも共有しているので、ほかのレコードは消さない・変えない
- 入れ直したら 3.9 の 1〜4 で確かめる

### 3.11 Google ログインの失敗

| 画面・ログ | 原因 | 対処 |
|---|---|---|
| Google の画面に `Error 400: redirect_uri_mismatch` | OAuth クライアントのリダイレクト URI が `BETTER_AUTH_URL` ＋ `/api/auth/callback/google` と違う | 03 6章の表に合わせる |
| `Error 403: access_denied` | 同意画面が「テスト」のまま | 「本番環境」にする（03 6章） |
| `Error 401: invalid_client` | `GOOGLE_CLIENT_ID` と SECRET の組が違う、Google 側で SECRET を消した | `moonx-{env}-google-client-secret` と Terraform の ID を確かめ、新しいリビジョンを作る（3.14） |
| API が起動せず、ログに `GOOGLE_CLIENT_ID is required in production`（staging も同じ形） | staging と production は、`GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` が無いと起動しない（SDD 2章「環境変数」） | `moonx-{env}-google-client-secret` と Terraform の ID を確かめ、新しいリビジョンを作る（3.14） |
| ログインの後「招待が無い」 | 招待制（ADR-010）。そのメールあての有効な招待（pending・期限内）が無い | 運営の画面で招待を確かめる。招待の画面から Google ログインを始めてもらう |

### 3.12 ログインできない・すぐにログアウトされる

| 症状 | 原因 | 対処 |
|---|---|---|
| ログインが 403 `Invalid origin`（`/api/auth/*`）、または保存が 403 `FORBIDDEN`（`/api/v1`。SDD 7.2 の CSRF の検査） | `TRUSTED_ORIGINS` にそのオリジンが無い | SDD 2章の値と比べ、Terraform で直して新しいリビジョン |
| ログインできたのに、すぐログイン画面に戻る | Cookie が保存されない（`BETTER_AUTH_URL` がそのドメインと違う） | 下の `curl` で `set-cookie` が返るか確かめ、下のコマンドで `BETTER_AUTH_URL` を確かめる |
| staging のログインが production に行く（その逆） | `BETTER_AUTH_URL` の取り違え | 下のコマンドで Cloud Run の環境変数を確かめる |
| 全員が急にログアウトされた | `BETTER_AUTH_SECRET` が変わった | 意図した入れ替えなら仕様（3.14）。意図しない新しい版なら、その版を無効にして新しいリビジョンを作る |

```bash
# Cookie が返るか（確認用のアカウントで）
curl -sS -i -X POST https://{DOMAIN}/api/auth/sign-in/email \
  -H 'content-type: application/json' -H 'origin: https://{DOMAIN}' \
  -d '{"email":"<確認用のメール>","password":"<パスワード>"}' | grep -i '^set-cookie'

# Cloud Run の環境変数
gcloud run services describe moonx-api-production --region=asia-southeast1 \
  --format="yaml(spec.template.spec.containers[0].env)"
```

### 3.13 招待のメールが届かない

上から順に確かめる。

1. Cloud Run の `MAIL_TRANSPORT` が `resend` か（3.12 のコマンド）
2. staging なら、宛先が `MAIL_ALLOWLIST` に入っているか（入っていなければ送らないのが仕様）
3. Resend の管理画面 → Emails に記録があるか。状態（Delivered・Bounced・Complained）を見る。記録が無ければ API 側で失敗している → Cloud Logging で `severity>=ERROR` を探す
4. Resend の管理画面 → Domains で `{DOMAIN}` が Verified か。DNS を確かめる

   ```bash
   dig +short TXT resend._domainkey.{DOMAIN}
   dig +short TXT _dmarc.{DOMAIN}
   ```

5. Resend の無料枠の上限（ADR-013）を超えていないか。超えると Resend が 429 を返す
6. 迷惑メールのフォルダに入っていないか

原因を直してから、招待を出し直す。

### 3.14 シークレットの入れ替え（漏れたときも）

Cloud Run はシークレットを起動のときに読む。値を変えたら新しいリビジョンを作る（Terraform がシークレットを `latest` の版で参照している前提）。

**共通の手順:**

1. 新しい値の版を足す（値を引数に書かない）

   ```bash
   read -rs VALUE; printf '%s' "$VALUE" | gcloud secrets versions add moonx-production-<名前> --data-file=-; unset VALUE
   ```

2. 同じイメージで新しいリビジョンを作る

   ```bash
   IMAGE="$(gcloud run services describe moonx-api-production --region=asia-southeast1 \
     --format='value(spec.template.spec.containers[0].image)')"
   gcloud run deploy moonx-api-production --image="$IMAGE" --region=asia-southeast1
   ```

3. 動作を確かめてから、古い版を無効にする（有効な版が増えると Secret Manager の費用が増える）

   ```bash
   gcloud secrets versions list moonx-production-<名前>
   gcloud secrets versions disable <VERSION> --secret=moonx-production-<名前>
   ```

4. 外部のサービスの側で、古い鍵を消す

**シークレットごとの違い:**

| シークレット | 入れ替えの影響と注意 |
|---|---|
| `BETTER_AUTH_SECRET`（`moonx-{env}-better-auth-secret`） | **全員がログアウトする**（ホーム画面に追加した PWA も）。漏れたときだけ替える。先に BCDX の窓口へ知らせる |
| `GOOGLE_CLIENT_SECRET`（`moonx-{env}-google-client-secret`） | 止まらない。Google のクライアントにシークレットを足す → 手順 1〜3 → Google 側で古いシークレットを無効にして消す |
| `RESEND_API_KEY`（`moonx-{env}-resend-api-key`） | 止まらない。Resend で新しいキー → 手順 1〜3 → Resend で古いキーを消す |
| `DATABASE_URL`・`DATABASE_URL_DIRECT`（Neon の所有者のロールのパスワード） | Neon でパスワードを替えると、古い接続文字列はすぐに使えない。替えたら直ちに `moonx-{env}-database-url`（手順 1）と、GitHub の環境 `{env}` の `DATABASE_URL_DIRECT`（`gh secret set DATABASE_URL_DIRECT --env {env}`。マイグレーション）を直し、手順 2 |
| production の読み取り専用のロールのパスワード（バックアップ） | 利用者には影響しない。下の「バックアップの読み取り専用のロールの入れ替え」 |

**CI のシークレットの入れ替え**（止まらない。Secret Manager の手順は要らない）: 置き場所の正は [SDD 2章「CI のシークレットと変数」](02-01_system-design-doc.md#環境変数)。下のコマンドはその置き場所に合わせている。どれも、各サービスで新しいトークンを作る → 入れる → 古いトークンを消す、の順。

| シークレット | 入れ方 |
|---|---|
| `SENTRY_AUTH_TOKEN`（リポジトリ） | `gh secret set SENTRY_AUTH_TOKEN` |

**バックアップの読み取り専用のロールの入れ替え:**

```bash
ro_password="$(openssl rand -hex 24)"
psql "<production の直接の接続文字列（所有者のロール）>" -v ro_password="$ro_password" <<'SQL'
ALTER ROLE moonx_backup_ro WITH PASSWORD :'ro_password';
SQL
echo "postgresql://moonx_backup_ro:${ro_password}@<直接の接続のホスト>/moonx?sslmode=require"
unset ro_password

gh secret set DATABASE_URL_DIRECT --env production-backup   # 上の接続文字列を貼る
gh workflow run db-backup.yml                               # 新しい値で取れることを確かめる（6.2）
```

### 3.15 停止した利用者がログインしたまま

**症状:** 運営者が停止した利用者が、まだ画面を使えている。

**確認:**
- 管理画面で、その利用者が停止（`suspended`）になっているか
- DB に、その利用者のセッションの行が残っていないか（Better Auth のセッションのテーブル。SDD 6章）
- 開いたままの画面は、読み込み済みのデータを表示しているだけのことがある（次の API の呼び出しで失敗する）

**対処:**
- セッションの行が残っていれば消す（停止の処理でセッションを消すのが仕様。ADR-010）。停止をやり直す
- Better Auth のセッションのキャッシュ（Cookie）を使っている場合、その有効期間は DB を見ずに通る。直らなければ不具合として直す

### 3.16 スマホ（PWA）: 古い画面のまま・ホーム画面のアプリでログインが続かない

| 見え方 | 原因 | 対処 |
|---|---|---|
| 新しい版を出したのに、古い画面のまま | Service Worker が新しい版を待っている（ADR-031） | 画面の再読み込みの案内から読み込み直してもらう。案内が出なければ、ブラウザかホーム画面のアプリを閉じて開き直す |
| 古い画面からの保存だけ失敗する | API が古い版の画面との互換を壊した（ADR-006） | API を直して互換を戻す（項目を戻す、`/api/v2` に分ける） |
| iPhone で、ホーム画面のアプリと Safari でログインの状態が違う | iPhone では、ホーム画面のアプリと Safari でログインが別になる（2026-10-11 にユーザーが承知した仕様。ADR-031） | それぞれでログインしてもらう。招待のメールのリンクは Safari で開く |
| ログインだけ失敗 | — | 3.11・3.12 |

---

## 4. ログ確認方法

### Cloud Logging（API）

```bash
SVC='resource.type="cloud_run_revision" AND resource.labels.service_name="moonx-api-production"'

# リクエスト ID で追う（利用者の画面の Ref は ID の先頭だけなので、部分一致の : で探す）
gcloud logging read "$SVC AND jsonPayload.requestId:\"<Ref>\"" --freshness=7d --format=json

# 利用者で追う
gcloud logging read "$SVC AND jsonPayload.userId=\"<USER_ID>\"" --freshness=1d --limit=50

# エラーだけ
gcloud logging read "$SVC AND severity>=ERROR" --freshness=1h --limit=20

# 5xx
gcloud logging read "$SVC AND jsonPayload.status>=500" --freshness=1h --limit=20

# 遅いリクエスト（ルートごとの遅さを見る）
gcloud logging read "$SVC AND jsonPayload.latencyMs>=1000" --freshness=1d --limit=50 \
  --format="table(timestamp,jsonPayload.route,jsonPayload.status,jsonPayload.latencyMs)"
```

### Cloud Run

```bash
# 直近のログ
gcloud run services logs read moonx-api-production --region=asia-southeast1 --limit=100

# 流しながら見る
gcloud beta run services logs tail moonx-api-production --region=asia-southeast1

# リビジョンとイメージ（SHA）
gcloud run revisions list --service=moonx-api-production --region=asia-southeast1 \
  --format="table(metadata.name,spec.containers[0].image,metadata.creationTimestamp)"

# どのリビジョンに流れているか
gcloud run services describe moonx-api-production --region=asia-southeast1 --format="yaml(status.traffic)"
```

### Neon

- コンソール → Monitoring: 接続数・CPU・休止の状態
- コンソール → Usage: 容量・計算時間
- コンソール → SQL Editor: 3.2・3.3 の SQL

### Sentry

- プロジェクト（`moonx-web` / `moonx-api`）と environment（`staging` / `production`）で絞る
- Issues の検索にリクエスト ID を入れて、Cloud Logging のログとつなげる（Sentry でのタグ名は SDD 11章）

### その他

- GCP コンソールのログ エクスプローラ: https://console.cloud.google.com/logs
- デプロイの記録: `gh run list --workflow=deploy.yml --limit=10`

---

## 5. エスカレーションフロー

連絡先は [04 7章](04_deployment-procedure.md)。アラートは一次対応の担当にメールで届く。

| 重さ | 例 | 動き出す目安 |
|---|---|---|
| S1 | 全員が使えない、データが消えた・漏れた | すぐ |
| S2 | 一部が使えない（メール・PDF・スマホだけ・Google ログインだけ） | 当日中 |
| S3 | staging だけ、見た目、回避できる | 次の作業日 |

### 流れ

1. 気づく（アラート・Sentry・利用者の連絡）。利用者からはリクエスト ID と時刻をもらう
2. 範囲を確かめる（04 6章の確認、3章の該当の項目）。外部のサービスの障害でないか下の表で見る
3. 止める: 直前のデプロイが原因なら戻す（04 5章）
4. S1・S2 は BCDX の窓口に知らせる
5. 直す（作業ブランチ → staging → production の昇格）
6. 記録する: 起きたこと・原因・直したこと・次に防ぐこと（issue に残す）

### データが消えた・壊れたとき

1. 壊し続けているなら、先に止める（API を前のリビジョンに戻す。04 5.2）
2. Neon で、壊れる前の時点から新しいブランチを作り、中身を比べる。必要な行だけを production に戻す
3. 全体を戻すときは、Neon の復元（Restore）で production のブランチを過去の時点に戻す。その時点より後に書かれたデータは消える。無料プランは戻せる期間が短い
4. 戻せる期間を過ぎていたら、`pg_dump` のバックアップから戻す（6.2）
5. 個人情報が漏れた可能性があれば、BCDX と相談して利用者に知らせる

### 外部のサービスの障害

| サービス | 確かめる先 |
|---|---|
| Google Cloud | https://status.cloud.google.com |
| Vercel（`dwnfrc.app` の DNS） | https://www.vercel-status.com |
| Neon | https://neonstatus.com |
| Sentry | https://status.sentry.io |
| GitHub | https://www.githubstatus.com |
| Resend | Resend のステータスページ |

---

## 6. 定期メンテナンス

### 6.1 一覧

| タスク | 頻度 | 手順 |
|---|---|---|
| 依存パッケージの更新 | 月1回 | 更新 → `make lint`・`make typecheck`・`make test` → PR → staging → production（04 4.2） |
| Better Auth のセキュリティ修正 | 公開されたら数日以内 | GitHub で better-auth の Releases と Security advisories を Watch し、Dependabot alerts を ON にしておく。上げたら staging でログイン・招待・パスワード再設定を確かめる（ADR-010） |
| DB のバックアップの確認 | 週1回 | `db-backup.yml` が毎回成功し、バケットにファイルが増えているか（6.2） |
| バックアップを戻す練習 | 四半期に1回 | 6.2 の「戻す練習」 |
| 使用量・無料枠・ダッシュボードの遅さの確認 | 週1回（Cloud Run の無料枠は月1回の費用の確認で見る） | 2章「定期に見るもの」 |
| KPI の集計の確認 | 月1回 | `kpi.yml` の月1回の実行が成功しているかを見て（`gh run list --workflow=kpi.yml --limit=1`）、実行の要約の件数を運営者に渡す（04 2章・SDD 11章）。失敗していたら `gh run view <RUN_ID> --log-failed` で原因を見る（接続の失敗なら 6.2 と同じ確かめ方） |
| `change_history` の増え方 | 月1回 | 3.3 の SQL で大きさを見る。前の月からの増え方で、無料プランの容量（ADR-008）に届く時期を見積もる。近ければ Neon の有料プランか移行を決める（ADR-008） |
| Sentry の issue の棚卸し | 週1回 | 新しい issue・増えている issue を見て、直すか無視するかを決める |
| Artifact Registry の整理 | 月1回 | 古いイメージが自動で消えているか確かめる（下）。`deploy/staging/version`・`deploy/production/version` の SHA と、それぞれの直前の版（いちばん使う戻し先。04 4.1）が消えていないこと |
| IaC のずれの確認 | 月1回 | `make infra-plan ENV=shared`・`ENV=staging`・`ENV=production` に差分が無いこと（あれば CLI で変えたものを Terraform に入れる） |
| 費用の確認 | 月1回 | 予算（SDD 1章 Goal。予算アラートの金額は SDD 11章）と比べる（下） |
| アラートの通知の確認 | 四半期に1回 | Cloud Monitoring・Sentry から試しの通知を出し、メールが届くか |
| シークレットの入れ替え | `GOOGLE_CLIENT_SECRET`・`RESEND_API_KEY` と CI のトークン（`SENTRY_AUTH_TOKEN`）は年1回、漏れたらすぐ。`BETTER_AUTH_SECRET` は漏れたときだけ | 3.14 |
| OAuth クライアントの確認 | 年1回 | 使っていないクライアントは Google 側で消されることがある（local 用に注意）。同意画面の情報が古くないか |
| ドメインの更新 | 年1回（期限の1か月前） | Vercel で `dwnfrc.app` の自動更新が ON か、支払い方法が有効か。切れるとメールもアプリも止まる（ADR-013） |
| ドメインマッピングの証明書 | 月1回 | `gcloud beta run domain-mappings describe --domain={DOMAIN} --region=asia-southeast1`（staging は `stg.{DOMAIN}`）で、`Ready` と `CertificateProvisioned` が `True` か。証明書は Google が自動で更新するが、DNS が変わると更新に失敗する（3.9） |
| Search Console の所有の確認 | 年1回 | `dwnfrc.app` の確認の TXT が Vercel の DNS に残っているか（3.10 の `dig`）。消えると、ドメインマッピングを作り直せなくなる |

**Artifact Registry の確認:**

リポジトリ `moonx` と古いイメージを消す決まりは Terraform の `envs/shared` が持つ。

```bash
gcloud artifacts docker images list asia-southeast1-docker.pkg.dev/{GCP_PROJECT_ID}/moonx/api --include-tags
gcloud artifacts repositories describe moonx --location=asia-southeast1
```

**費用の確認（月1回）:**

| 見る先 | 見ること |
|---|---|
| Google Cloud の請求のレポート | Cloud Run（無料枠。ADR-007）・Secret Manager（ADR-007）・Artifact Registry の保存量・Cloud Storage（写真のバケット（ADR-024）とバックアップのバケット）・ネットワーク。見込みの費用は各 ADR |
| Neon・Resend・Sentry の管理画面 | 無料枠の中か（2章「定期に見るもの」） |
| GitHub | Actions の利用時間（private のリポジトリの無料枠） |
| ドメイン | 更新の費用（ADR-013） |

### 6.2 DB のバックアップ（`pg_dump` → Cloud Storage）

バックアップの仕組み（取り方・置き場所・残す期間）の正は [ADR-028](02-01_system-design-doc.md#adr-028-db-のバックアップは毎日の-pg_dump) と [SDD 2章「make ターゲット」](02-01_system-design-doc.md#make-ターゲット) の `db-backup`。ワークフロー `db-backup.yml` の中身は 04 2章。ここには確かめ方と戻し方を書く。

**取れているかを確かめる**（頻度は 6.1）:

```bash
gh run list --workflow=db-backup.yml --limit=7                                  # 毎回成功しているか
gcloud storage ls "gs://{GCP_PROJECT_ID}-moonx-backups/production/" | tail -n 3  # 新しいファイルがあるか
```

失敗していたら `gh run view <RUN_ID> --log-failed` で原因を見る。接続で失敗しているなら、GitHub の環境 `production-backup` の `DATABASE_URL_DIRECT`（production の読み取り専用のロール。03 5.4 E・H）を確かめる（入れ替えは 3.14）。

**バケットの設定を確かめる**（Terraform の `envs/shared`。03 5.4 G で最初に確かめ、変えたときにも見る）: 公開されていないこと（個人情報を含む）、書けるのはバックアップのワークフローが使うサービスアカウントだけで、読めるのは運用の担当だけであること、古いファイルを消す期間が ADR-028 のとおりであること。

```bash
gcloud storage buckets describe gs://{GCP_PROJECT_ID}-moonx-backups
gcloud storage buckets get-iam-policy gs://{GCP_PROJECT_ID}-moonx-backups
```

**戻す練習**（頻度は 6.1。手元で行い、終わったら消す。ファイルの形式は SDD 2章「make ターゲット」の `db-backup`）:

```bash
gcloud storage ls "gs://{GCP_PROJECT_ID}-moonx-backups/production/" | tail -n 3
gcloud storage cp "<上で選んだファイルの gs:// の URL>" ./restore.dump

make db-up
psql "postgres://moonx:moonx@localhost:5432/moonx" -c 'create database moonx_restore'
pg_restore --no-owner --no-privileges \
  --dbname="postgres://moonx:moonx@localhost:5432/moonx_restore" ./restore.dump
psql "postgres://moonx:moonx@localhost:5432/moonx_restore" -c 'select count(*) from change_history'

# 終わったら消す（個人情報のため）
psql "postgres://moonx:moonx@localhost:5432/moonx" -c 'drop database moonx_restore'
rm ./restore.dump
```

**本番に戻すとき（最後の手段）:** バックアップより後に書かれたデータは消える。

1. Neon で新しいブランチを作って `pg_restore` し、中身を確かめる
2. そのブランチのプール接続を `moonx-production-database-url` に入れ（3.14 の手順 1）、直接の接続（所有者のロール）を GitHub の環境 `production` の `DATABASE_URL_DIRECT` に入れる（`gh secret set DATABASE_URL_DIRECT --env production`）
3. そのブランチに読み取り専用のロールが無ければ 03 5.4 E の SQL で作る。`pg_restore --no-privileges` では権限が戻らないので、すでにあるものへの権限を付ける SQL（03 5.4 E）も実行する。そのロールの直接の接続を GitHub の環境 `production-backup` の `DATABASE_URL_DIRECT` に入れる（`gh secret set DATABASE_URL_DIRECT --env production-backup`）。入れないと、次のバックアップは古いブランチを取る
4. 新しいリビジョンを作る（3.14 の手順 2）。`gh workflow run db-backup.yml` で、新しいブランチからバックアップが取れることを確かめる
