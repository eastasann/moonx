# Operation Runbook — moonx

- この文書が持つもの: 監視の項目と閾値、よくある障害の確かめ方と対処、ログの見方、エスカレーション、定期メンテナンス、DB のバックアップ
- ログの形式・監視の方針の正は [SDD 3章 ADR-023](02-01_system-design-doc.md#3-技術選定と判断理由adr) と SDD 11章。環境の名前・環境変数の正は [SDD 2章](02-01_system-design-doc.md#2-アーキテクチャ概要)
- デプロイとロールバックは [04_deployment-procedure.md](04_deployment-procedure.md)、初回のセットアップは [03_dev-setup.md](03_dev-setup.md) 5.4
- 表記: `{DOMAIN}`・`{GCP_PROJECT_ID}`・`{APP_ID}` は SDD 2章のプレースホルダ。`<...>` はその場で調べて入れる値。コマンドの例は production。staging は名前を読み替える
- gcloud は先に `gcloud config set project {GCP_PROJECT_ID}` をしておく

---

## 1. モニタリング・ログ設計

### ログ構成

| ソース | 出力先 | 保持期間 | 内容 |
|---|---|---|---|
| API（Cloud Run の標準出力） | Cloud Logging | 30日（`_Default` バケット） | 1行1つの JSON。`severity`・`message`・`requestId`・`userId`・`route`・`status`・`latencyMs`（ADR-023） |
| Cloud Run のリクエストのログ | Cloud Logging | 30日 | URL・ステータス・時間。アプリのログが出ない失敗（起動の失敗・タイムアウト・メモリ不足）もここと system のログに出る |
| Cloud Scheduler | Cloud Logging | 30日 | ジョブ `moonx-{env}-due-notifications` の実行の結果 |
| 稼働時間チェック | Cloud Monitoring | Cloud Monitoring の保持期間 | `https://{DOMAIN}/api/health` の結果 |
| Worker（`moonx-web`） | `wrangler tail`（その場で見るだけ） | 保存しない | 転送の失敗・例外 |
| エラー（web / mobile / api） | Sentry の3つのプロジェクト | Sentry の無料プランの保持期間 | 例外・リクエスト ID・リリース（版）・environment |
| メール | Resend の管理画面（Emails） | Resend のプランの保持期間（短い） | 送信・配達・バウンス |
| DB | Neon のコンソール（Monitoring・Usage） | Neon のプランによる | 接続数・容量・計算時間 |
| デプロイ | GitHub Actions | 90日 | `deploy.yml`・`build.yml` の記録 |

リクエスト ID は Worker が付け（`X-Request-Id`）、エラーの応答・Cloud Logging・Sentry に入る（ADR-023）。利用者からエラーの連絡を受けたら、画面に出たリクエスト ID をもらう。

### ログレベル

レベルは `LOG_LEVEL` で決まる（値は SDD 2章「環境変数」。staging / production は `info`）。どのレベルで何を出すかの正は SDD 11章。下は運用で読むときの目安。

| レベル | 用途 | 本番で出力 |
|---|---|---|
| `error` | 例外、DB のエラー、外部サービス（Resend・Google）の失敗 | ✅ |
| `warn` | 回数制限、楽観ロックの衝突（409）、招待の期限切れ、cron の認証の失敗 | ✅ |
| `info` | リクエストの概要（1リクエスト1行）、cron の実行の結果、メールの送信 | ✅ |
| `debug` | 詳しいリクエスト・SQL | ❌（local だけ） |

---

## 2. 監視ポイントとアラート

アラートの定義は Terraform（Cloud Monitoring）。閾値を変えたら、この表と Terraform を同じ PR で直す。アラート先はすべて、一次対応の担当のメール（04 7章）。

| 監視対象 | メトリクス | 閾値 | アラート先 / 確かめ方 |
|---|---|---|---|
| API の死活（production） | 稼働時間チェック `https://{DOMAIN}/api/health`（5分ごと。Worker を通して Cloud Run まで届く） | 2つ以上の地域で失敗が5分続く | メール |
| API のエラー | Cloud Run の `request_count`（`response_code_class` = 5xx） | 10分間に5件以上 | メール |
| API の遅さ | Cloud Run の `request_latencies` の p95 | 3秒を超えて15分続く | メール |
| ダッシュボードの遅さ | ログの `latencyMs`（ダッシュボードの `route`） | p95 が 1秒を超える（ADR-011 の見直しの条件） | 週1回、4章のコマンドで見る |
| Cloud Run のメモリ | `container/memory/utilizations` | 90% を超える（PDF の作成。3.6） | メール |
| Cloud Run の台数 | `container/instance_count` | 上限の3台が10分続く | メール |
| 期限の通知のジョブ | Cloud Scheduler のログ（失敗） | 2回続けて失敗（取りこぼしは次の回で作られるので、1回は待つ） | メール |
| 新しいエラー | Sentry の新しい issue | 新しい issue が出たら | Sentry からメール |
| Sentry の枠 | 月のイベント数（無料枠 5,000） | 4,000 を超える | Sentry の使用量の通知・週1回 |
| Neon の容量 | Storage（無料枠 0.5 GB。production と staging のブランチの合計） | 0.4 GB を超える | 週1回、Neon のコンソール |
| Neon の計算時間 | Compute（無料枠。使い切ると DB が止まる） | 月の枠の 80% を超える | 週1回、Neon のコンソール |
| Resend の送信数 | 1日の送信数（無料枠 1日100通・月3,000通） | 1日80通・月2,400通を超える | 週1回と、まとめて招待する前に Resend の管理画面 |
| Worker のリクエスト数 | 1日のリクエスト数（無料枠 10万。`/api` だけが数える） | 1日7万を超える | 週1回、Cloudflare の管理画面 |
| Cloud Run の無料枠 | リクエスト（月200万）・vCPU 秒（18万）・GiB 秒（36万） | 枠の 80% を超える | 月1回、請求のレポート |
| 費用 | Cloud Billing の予算（月 $10） | 50%・90%・100% | メール（03 5.4 L） |

- 稼働時間チェックの `/api/health` は DB に触れないこと。触れると Neon が休めず、無料枠の計算時間を使い切る
- staging にはアラートを付けない（Sentry の issue だけ見る）

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
- API はプール接続を使う（ADR-008）。直接の接続になっていたら、プール接続の値を新しい版で入れ、新しいリビジョンを作る（3.15 の手順 1・2）
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
2. 容量: `change_history` が大きい想定（ADR-008）。staging のブランチの分も同じ枠に入るので、staging の要らないデータを消す。staging を production から作り直さない（実データが入る）
3. 計算時間: DB を起こし続けているもの（`/api/health` が DB に触れていないか、手元からの接続の放置）を探す
4. 続くようなら、別の PostgreSQL への移行を考える（ADR-008）

### 3.4 Cloud Run: コールドスタートで遅い

**症状:** しばらく使われなかった後、最初のデータの読み込みに数秒かかる（Web の画面自体は Cloudflare から出るので速い）。

**確認:**

```bash
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="moonx-api-production" AND textPayload:"Starting new instance"' \
  --freshness=1d --limit=20
```

**対処:**
- 許容する（ADR-007）
- 利用者が遅いと感じるなら最小1台にする（月数ドル。ADR-007）。急ぐときは CLI で変え、同じ値を Terraform にも入れる

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
| アプリのログに 500 と例外 | コードの不具合 | Sentry（api）で同じリクエスト ID を見る。直前のデプロイが原因なら戻す（04 5.1・5.2） |
| DB の接続のエラー | Neon | 3.1〜3.3 |
| リクエストのログだけに 503 | インスタンスが足りない（最大3台）、起動の失敗 | 3.7。台数のグラフを見る |
| リクエストのログだけに 504 | 60秒のタイムアウト（ADR-007） | `latencyMs` で遅いルートを探す。PDF なら 3.6 |
| メモリの上限のメッセージ | メモリ不足 | 3.6 |

### 3.6 Cloud Run: PDF の作成でメモリ不足

**症状:** Pitch Deck の PDF を出すと失敗する。ログに `Memory limit of 1024 MiB exceeded` が出る。

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
  gcloud run services update moonx-api-production --region=asia-southeast1 --memory=2Gi
  ```

- 原因を探す: 大きな画像、フォントの全体の埋め込み（ADR-012 では使った文字だけを埋め込む）、同時に作られる PDF の数
- メモリを増やすと無料枠（GiB 秒）を早く使うので、費用の確認（6章）で見る

### 3.7 Cloud Run: 新しいリビジョンが起動しない

**症状:** `deploy.yml` の `gcloud run deploy` が失敗する（`failed to start and listen on the port defined provided by the PORT=8080` など）。Cloud Run は前のリビジョンに流したままなので、利用者への影響は無い。

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
| シークレットが見つからない・権限が無い | Secret Manager に値（有効な版）が無い、実行用のサービスアカウントの権限 | 値を入れる（03 5.4 H）。権限は Terraform で直す |
| 起動のときの設定の検査で終了する | 新しい環境変数を Terraform に入れ忘れた | Terraform に入れて `make infra-apply` → `deploy.yml` を再実行（`gh run rerun <RUN_ID>`） |
| `exec format error` | 手元（Apple シリコン）で作った arm64 のイメージ | イメージは `build.yml` が作ったものだけを使う |
| ポートで待ち受けていない | アプリが `PORT` を読んでいない | コードを直す |

### 3.8 DB のマイグレーションが失敗した

**症状:** `deploy.yml` の最初の段（`make db-migrate`）で失敗する。API・Web・スマホは前の版のまま。

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

### 3.9 Worker: 502・共有シークレットの不一致・`API_ORIGIN` の誤り

**症状:** Web とスマホの `/api` がすべて失敗する（502・403・404 など）。

**確認:** 3つを順に見て切り分ける。

```bash
# 1. Worker を通す
curl -sS -o /dev/null -w '%{http_code}\n' https://{DOMAIN}/api/health

# 2. Cloud Run を直接呼ぶ
run_url="$(gcloud run services describe moonx-api-production --region=asia-southeast1 --format='value(status.url)')"
curl -sS -o /dev/null -w '%{http_code}\n' "$run_url/api/health"

# 3. Worker のログ
cd apps/web && bunx wrangler tail moonx-web --env production --status=error --format=pretty
```

| 1（Worker） | 2（直接） | ほかの `/api` | 原因 | 対処 |
|---|---|---|---|---|
| 失敗 | 成功 | — | 転送先（`API_ORIGIN`）が違う、Worker の例外 | `wrangler.jsonc` の production の `API_ORIGIN` を 2 の URL と比べ、直して PR → 昇格。急ぐなら前の Worker に戻す（04 5.3） |
| 成功 | 成功 | 拒否される | 共有シークレットの不一致（`X-Moonx-Proxy-Secret`）。`/api/health` は検査しないので通る | Worker と Secret Manager の `PROXY_SHARED_SECRET` をそろえる。Worker のシークレットは読み出せないので、新しい値で両方を入れ直す（3.15） |
| 失敗 | 失敗（403） | — | Cloud Run が認証なしの呼び出しを受けない設定 | `gcloud run services get-iam-policy moonx-api-production --region=asia-southeast1` に `allUsers` の `roles/run.invoker` があるか。Terraform で直す |
| 失敗 | 失敗 | — | API 側の問題 | 3.5・3.7 |

### 3.10 Worker: 1日の上限を超えた

**症状:** `/api` が Cloudflare のエラー（1027）になる。

**確認:** Cloudflare の管理画面 → Workers & Pages → `moonx-web-production` → Metrics。

**対処:**
- 無料枠は UTC の0時まで戻らない。すぐに戻すなら Workers の有料プラン（月 $5。予算の中）に上げる
- 増えた原因（スマホが同じ API を繰り返し呼んでいる、攻撃）を `wrangler tail` で探す

### 3.11 Google ログインの失敗

| 画面・ログ | 原因 | 対処 |
|---|---|---|
| Google の画面に `Error 400: redirect_uri_mismatch` | OAuth クライアントのリダイレクト URI が `BETTER_AUTH_URL` ＋ `/api/auth/callback/google` と違う | 03 6章の表に合わせる |
| `Error 403: access_denied` | 同意画面が「テスト」のまま | 「本番環境」にする（03 6章） |
| `Error 401: invalid_client` | `GOOGLE_CLIENT_ID` と SECRET の組が違う、Google 側で SECRET を消した | `moonx-{env}-google-client-secret` と Terraform の ID を確かめ、新しいリビジョンを作る（3.15） |
| ログインの後「招待が無い」 | 招待制（ADR-010）。そのメールあての有効な招待（pending・期限内）が無い | 運営の画面で招待を確かめる。招待の画面から Google ログインを始めてもらう |
| スマホで Google の後にアプリへ戻らない | `TRUSTED_ORIGINS` にアプリの scheme（`moonx://`。staging は `moonx-staging://`）が無い、ビルドの scheme が違う | `TRUSTED_ORIGINS` と `app.config.ts` の scheme を比べる |

### 3.12 ログインできない・すぐにログアウトされる

| 症状 | 原因 | 対処 |
|---|---|---|
| ログインやフォームが 403 `Invalid origin` | `TRUSTED_ORIGINS` にそのオリジンが無い | SDD 2章の値と比べ、Terraform で直して新しいリビジョン |
| ログインできたのに、すぐログイン画面に戻る | Cookie が保存されない（`BETTER_AUTH_URL` がそのドメインと違う、Worker が `Set-Cookie` を落としている・まとめている） | 下の `curl` で `set-cookie` が複数そのまま返るか確かめる |
| staging のログインが production に行く（その逆） | `BETTER_AUTH_URL` の取り違え | 下のコマンドで Cloud Run の環境変数を確かめる |
| 全員が急にログアウトされた | `BETTER_AUTH_SECRET` が変わった | 意図した入れ替えなら仕様（3.15）。意図しない新しい版なら、その版を無効にして新しいリビジョンを作る |

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

5. Resend の上限（1日100通・月3,000通）を超えていないか。超えると Resend が 429 を返す
6. 迷惑メールのフォルダに入っていないか

原因を直してから、招待を出し直す。

### 3.14 期限の通知が作られない

**確認:**

```bash
gcloud scheduler jobs describe moonx-production-due-notifications --location=asia-southeast1 \
  --format="yaml(state,schedule,lastAttemptTime,status,httpTarget.uri,httpTarget.oidcToken)"

gcloud logging read \
  'resource.type="cloud_scheduler_job" AND resource.labels.job_id="moonx-production-due-notifications"' \
  --freshness=1d --limit=10

gcloud run services describe moonx-api-production --region=asia-southeast1 \
  --format="yaml(spec.template.spec.containers[0].env)" | grep -A1 -E 'CRON_OIDC_AUDIENCE|CRON_INVOKER_EMAIL'
```

**対処:**

| 見え方 | 原因 | 対処 |
|---|---|---|
| ジョブの `state` が `PAUSED` | 止めたまま | `gcloud scheduler jobs resume moonx-production-due-notifications --location=asia-southeast1` |
| 401 / 403 | OIDC の audience が `CRON_OIDC_AUDIENCE` と違う（audience を省くと URL 全体（パス付き）になる）、呼び出し元が `CRON_INVOKER_EMAIL` と違う | ジョブの `oidcToken` の `audience` と `serviceAccountEmail` を、Cloud Run の環境変数と比べる。Terraform で直す |
| 404 | ジョブの URL が違う | `httpTarget.uri` が Cloud Run の URL ＋ `/internal/cron/due-notifications` か |
| 200 なのに通知が無い | 条件に合う項目が無い。担当者のタイムゾーン（`users.timezone`）でまだ朝8時より前（ADR-014） | 期限・担当者・`users.timezone` を確かめる。staging で再現する |
| 5xx・タイムアウト | API か DB の問題 | 3.1〜3.7 |

直したら手で1回動かす。取りこぼした分は次の回でまとめて作られる（ADR-014）。

```bash
gcloud scheduler jobs run moonx-production-due-notifications --location=asia-southeast1
```

### 3.15 シークレットの入れ替え（漏れたときも）

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
| `BETTER_AUTH_SECRET`（`moonx-{env}-better-auth-secret`） | **全員がログアウトする**（Web もスマホも）。漏れたときだけ替える。先に BCDX の窓口へ知らせる |
| `PROXY_SHARED_SECRET`（Secret Manager と Worker） | 両方を替え終わるまで `/api` が拒否される（API は1つの値しか受けない）。使われていない時間に、手順 1・2 の直後に Worker を替える（下） |
| `GOOGLE_CLIENT_SECRET`（`moonx-{env}-google-client-secret`） | 止まらない。Google のクライアントにシークレットを足す → 手順 1〜3 → Google 側で古いシークレットを無効にして消す |
| `RESEND_API_KEY`（`moonx-{env}-resend-api-key`） | 止まらない。Resend で新しいキー → 手順 1〜3 → Resend で古いキーを消す |
| `DATABASE_URL`（Neon のロールのパスワード） | Neon でパスワードを替えると、古い接続文字列はすぐに使えない。替えたら直ちに `moonx-{env}-database-url` と GitHub の `DATABASE_URL_DIRECT` を直し、手順 2 |

```bash
# PROXY_SHARED_SECRET
proxy_secret="$(openssl rand -hex 32)"
printf '%s' "$proxy_secret" | gcloud secrets versions add moonx-production-proxy-shared-secret --data-file=-
# ここで共通の手順 2（新しいリビジョン）。終わったらすぐに Worker を替える
(cd apps/web && printf '%s' "$proxy_secret" | bunx wrangler secret put PROXY_SHARED_SECRET --env production)
unset proxy_secret
```

### 3.16 停止した利用者がログインしたまま

**症状:** 運営者が停止した利用者が、まだ画面を使えている。

**確認:**
- 管理画面で、その利用者が停止（`suspended`）になっているか
- DB に、その利用者のセッションの行が残っていないか（Better Auth のセッションのテーブル。SDD 6章）
- スマホは、読み込み済みのデータを表示しているだけのことがある（次の API の呼び出しで失敗する）

**対処:**
- セッションの行が残っていれば消す（停止の処理でセッションを消すのが仕様。ADR-010）。停止をやり直す
- Better Auth のセッションのキャッシュ（Cookie）を使っている場合、その有効期間は DB を見ずに通る。直らなければ不具合として直す

### 3.17 スマホから API に繋がらない・古い版のアプリが動かない

| 見え方 | 原因 | 対処 |
|---|---|---|
| スマホだけ、すべての通信が失敗（Web は動く） | アプリに埋め込まれた `EXPO_PUBLIC_API_BASE_URL` が違う（EAS Update で値を渡し忘れた。04 2章） | Sentry（mobile）で呼んでいる URL を確かめる。前の更新に戻す（04 5.4）→ 正しい値で出し直す |
| staging のアプリが production を呼ぶ（その逆） | profile とチャンネルの取り違え | `eas channel:view staging`・`eas update:list --branch staging` で確かめる |
| 特定の古い版だけ失敗する | API が古い版との互換を壊した（ADR-006） | Sentry（mobile）のリリース（版）で範囲を確かめる。API を直して互換を戻す（項目を戻す、`/api/v2` に分ける）。古い版の利用者にストアでの更新をお願いする |
| 新しい EAS Update が届かない | runtime が違う（ネイティブの変更の後の更新は、新しいバイナリにしか届かない） | `eas update:list --branch production` で runtime を確かめる |
| ログインだけ失敗 | — | 3.11・3.12 |

---

## 4. ログ確認方法

### Cloud Logging（API）

```bash
SVC='resource.type="cloud_run_revision" AND resource.labels.service_name="moonx-api-production"'

# リクエスト ID で追う（利用者からもらった ID）
gcloud logging read "$SVC AND jsonPayload.requestId=\"<REQUEST_ID>\"" --freshness=7d --format=json

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

### Cloud Scheduler

```bash
gcloud scheduler jobs describe moonx-production-due-notifications --location=asia-southeast1
gcloud logging read \
  'resource.type="cloud_scheduler_job" AND resource.labels.job_id="moonx-production-due-notifications"' \
  --freshness=1d --limit=20
```

### Worker（Cloudflare）

```bash
cd apps/web
bunx wrangler tail moonx-web --env production --format=pretty
bunx wrangler tail moonx-web --env production --status=error
bunx wrangler deployments list --env production
```

`wrangler tail` はその場で流れるものだけを見せる。過去のログは残らない。

### Neon

- コンソール → Monitoring: 接続数・CPU・休止の状態
- コンソール → Usage: 容量・計算時間
- コンソール → SQL Editor: 3.2・3.3 の SQL

### Sentry

- プロジェクト（web / mobile / api）と environment（`staging` / `production`）で絞る
- Issues の検索にリクエスト ID を入れて、Cloud Logging のログとつなげる（Sentry でのタグ名は SDD 11章）
- mobile はリリース（アプリの版）ごとに見て、古い版だけのエラーかを確かめる

### その他

- GCP コンソールのログ エクスプローラ: https://console.cloud.google.com/logs
- デプロイの記録: `gh run list --workflow=deploy.yml --limit=10`

---

## 5. エスカレーションフロー

連絡先は [04 7章](04_deployment-procedure.md)。アラートは一次対応の担当にメールで届く。

| 重さ | 例 | 動き出す目安 |
|---|---|---|
| S1 | 全員が使えない、データが消えた・漏れた | すぐ |
| S2 | 一部が使えない（メール・期限の通知・PDF・スマホだけ・Google ログインだけ） | 当日中 |
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
| Cloudflare | https://www.cloudflarestatus.com |
| Neon | https://neonstatus.com |
| Expo（EAS） | https://status.expo.dev |
| Sentry | https://status.sentry.io |
| GitHub | https://www.githubstatus.com |
| Apple（App Store Connect・TestFlight） | https://developer.apple.com/system-status/ |
| Resend | Resend のステータスページ |

---

## 6. 定期メンテナンス

### 6.1 一覧

| タスク | 頻度 | 手順 |
|---|---|---|
| 依存パッケージの更新 | 月1回 | 更新 → `make lint`・`make typecheck`・`make test` → PR → staging → production（04 4.2） |
| Better Auth のセキュリティ修正 | 公開されたら数日以内 | GitHub で better-auth の Releases と Security advisories を Watch し、Dependabot alerts を ON にしておく。上げたら staging でログイン・招待・パスワード再設定を確かめる（ADR-010） |
| Expo SDK の更新 | 新しい SDK が出たら検討。遅くとも年1回 | ネイティブの変更になる。EAS Build ＋ ストアへの提出（04 4.3） |
| ストアの要件への追従 | 年1回 | Google Play の target API level の期限（毎年8月末）と、Apple の新しい SDK でのビルドの要件を、Expo SDK の更新で満たす |
| DB のバックアップの確認 | 週1回（バックアップ自体は毎日） | `db-backup.yml` が成功しているか。四半期に1回は復元を試す（6.2） |
| Neon の容量・計算時間 | 週1回 | 2章の閾値と比べる |
| `change_history` の増え方 | 月1回 | 3.3 の SQL で大きさを見る。前の月からの増え方で、0.5 GB に届く時期を見積もる。近ければ Neon の有料プランか移行を決める（ADR-008） |
| Sentry の issue の棚卸し | 週1回 | 新しい issue・増えている issue を見て、直すか無視するかを決める |
| ダッシュボードの遅さ | 週1回 | 4章の遅いリクエストのコマンド。p95 が 1秒を超えたら ADR-011 の手順 |
| Artifact Registry の整理 | 月1回 | 古いイメージが自動で消えているか確かめる（下）。`deploy/staging/version`・`deploy/production/version` の SHA と、戻し先の直前の版が消えていないこと |
| IaC のずれの確認 | 月1回 | `make infra-plan ENV=staging`・`make infra-plan ENV=production` に差分が無いこと（あれば CLI で変えたものを Terraform に入れる） |
| 費用の確認 | 月1回 | 予算 月 $0〜10（ストアの登録費は含めない）と比べる（下） |
| アラートの通知の確認 | 四半期に1回 | Cloud Monitoring・Sentry から試しの通知を出し、メールが届くか |
| 古いスマホの版の確認 | 月1回 | Sentry（mobile）のリリースごとの利用を見て、API の互換を外してよいかを決める（ADR-006） |
| シークレットの入れ替え | `GOOGLE_CLIENT_SECRET`・`RESEND_API_KEY`・`PROXY_SHARED_SECRET` は年1回、漏れたらすぐ。`BETTER_AUTH_SECRET` は漏れたときだけ | 3.15 |
| OAuth クライアントの確認 | 年1回 | 使っていないクライアントは Google 側で消されることがある（local 用に注意）。同意画面の情報が古くないか |
| ドメインの更新 | 年1回（期限の1か月前） | Cloudflare Registrar で自動更新が ON か、支払い方法が有効か。切れるとメールもアプリも止まる（ADR-013） |
| Apple Developer Program の更新 | 年1回 | 自動更新が ON か。切れるとアプリがストアから消える |
| Apple の配布証明書 | 年1回 | EAS が管理する（`eas credentials --platform ios`）。期限切れはビルドのときに分かる。公開済みのアプリには影響しない |

**Artifact Registry の確認:**

```bash
gcloud artifacts docker images list asia-southeast1-docker.pkg.dev/{GCP_PROJECT_ID}/moonx/api --include-tags
gcloud artifacts repositories describe moonx --location=asia-southeast1
```

**費用の確認（月1回）:**

| 見る先 | 見ること |
|---|---|
| Google Cloud の請求のレポート | Cloud Run（無料枠）・Secret Manager（月 $1 程度。ADR-007）・Artifact Registry の保存量・Cloud Storage・ネットワーク |
| Neon・Cloudflare・Resend・Sentry・Expo の管理画面 | 無料枠の中か（2章の閾値） |
| GitHub | Actions の利用時間（private のリポジトリの無料枠） |
| ドメイン | 年 $10〜15（ADR-013） |

### 6.2 DB のバックアップ（`pg_dump` → Cloud Storage）

Neon の無料プランは、過去の時点に戻せる期間が短い。そのため production の DB を毎日 `pg_dump` し、Cloud Storage に残す。動かすのは GitHub Actions の定期実行のワークフロー `db-backup.yml`。

**ワークフローがすること（毎日1回）:**

1. Workload Identity Federation で Google Cloud に入る
2. environment `production` のシークレット `DATABASE_URL_DIRECT` で `pg_dump` する（PostgreSQL 17 のクライアントを使う。サーバーより古い版は使えない）

   ```bash
   pg_dump --format=custom --no-owner --no-privileges \
     --file=moonx-production.dump "$DATABASE_URL_DIRECT"
   ```

3. バックアップ用のバケットに置く

   ```bash
   gcloud storage cp moonx-production.dump \
     "gs://<バックアップ用のバケット>/production/$(date -u +%Y%m%dT%H%MZ).dump"
   ```

**バケットの決まり:**
- 公開しない（個人情報を含む）。均一なアクセス制御・公開アクセスの防止を ON
- 書けるのはバックアップのワークフローのサービスアカウントだけ。読めるのは運用の担当だけ
- 古いものはライフサイクルで消す（例: 90日）

**復元の練習（四半期に1回。手元で行い、終わったら消す）:**

```bash
gcloud storage ls "gs://<バックアップ用のバケット>/production/" | tail -n 3
gcloud storage cp "gs://<バックアップ用のバケット>/production/<ファイル>.dump" ./restore.dump

make db-up
psql "postgres://moonx:moonx@localhost:5432/moonx" -c 'create database moonx_restore'
pg_restore --no-owner --no-privileges \
  --dbname="postgres://moonx:moonx@localhost:5432/moonx_restore" ./restore.dump
psql "postgres://moonx:moonx@localhost:5432/moonx_restore" -c 'select count(*) from change_history'

# 終わったら消す（個人情報のため）
psql "postgres://moonx:moonx@localhost:5432/moonx" -c 'drop database moonx_restore'
rm ./restore.dump
```

**本番に戻すとき（最後の手段）:** Neon で新しいブランチを作って `pg_restore` し、中身を確かめてから、そのブランチの接続文字列を `moonx-production-database-url` と `DATABASE_URL_DIRECT` に入れて新しいリビジョンを作る（3.15 の手順 2）。バックアップより後に書かれたデータは消える。
