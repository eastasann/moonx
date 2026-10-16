# @moonx/db

Drizzle のスキーマ・マイグレーション・シード、テンプレートの取り込みと公開、テスト用の DB の作り直し。役割は [SDD 2章「リポジトリ構成」](../../docs/02-01_system-design-doc.md#リポジトリ構成)。

## 中身

- `src/schema.ts`: SDD 6.3 のコード（コメントは英語に直してある）。スキーマを変えるときは SDD 6.3 と一緒に直し、`make db-generate` でマイグレーションを作る（どちらかを忘れると `make test-api` が失敗する）
- `src/relations.ts`: 外部キーごとの `relations()`（名前の付け方はファイルの先頭）
- `src/client.ts`: `connectDatabase(url)`。postgres.js のプールと Drizzle のクライアント（SDD 7.3）
- `src/migrate.ts`: `migrateDatabase(url)`。`make db-migrate` と同じ Drizzle の migrator でマイグレーションを当てる
- `src/templates.ts`: テンプレートのファイルの取り込み（AD10）・公開の前の検査と公開（AD6）。運営者の API とシードが同じものを使う（SDD 5.13）。ファイルの形の検査は `packages/schemas` の `templateFileSchema`。検査と公開は、プランのテンプレートの Pitch Deck を組むための PDF のフォントの測り方（`MeasureText`）を引数に取る。フォントを読むのは API なので（ADR-012）、呼ぶ側が渡す
- `src/invitations.ts`: `hashInvitationToken(token)`。`invitations.token_hash` に入れる値（SHA-256 の16進の小文字）。招待を出す処理・受ける処理とシードが同じものを使う
- `src/seed/`: design-spec 8章のデモデータ。`seed/index.ts` の `seedDatabase(db, { now, measure })` が、1つのトランザクションで全テーブルを空にしてから入れる。`make db-seed` の入口は、フォントの測り方を渡すために API の側にある（`apps/api/scripts/seed.ts`。`APP_ENV=local` でなければ、DB に触れずにエラーで止まる。終了コード 1）
  - `index.ts`: 入れる順番（テンプレート → 人 → 自己分析 → アイデアごとの検証・判定・プラン → コメント → 変更履歴）
  - `data/`: アイデアとプランの中身。ほかのファイルは、中身を行に書く処理
  - 行の id は名前から決める（`ids.ts` の `seedId`。UUID v5）。テンプレートの取り込みが作る行だけは、ファイルが決める順番の番号から決める（`seedIdSequence`）。日時はシードを動かした時刻からの相対（`clock.ts`。日付は Asia/Manila の暦）
  - 保存の1回ごとに変更履歴の行を書き、`lock_version` は保存の回数に合わせる。判定と版のスナップショットは `packages/domain` の関数で、その時点の検証とプランから作る
- `migrations/`: `make db-generate` が作る。drizzle-kit が書いたままコミットする（Biome の対象外）。`main` にあるものは書き換えない・消さない（`make db-check`）

## テスト

Bun test で書き、実際の PostgreSQL に対して動かす（ADR-022）。

- import: `import { describe, expect, test } from "bun:test"`
- 置き場所: 対象のファイルの隣に `*.test.ts`
- 実行: `make test-api`（`apps/api` のテストと一緒に動く）。先に `DATABASE_URL_TEST` の DB を作り直してマイグレーションを当てるので、`make db-up` で DB を起動しておく
- スキーマの検査（`migrations.test.ts`・`relations.test.ts`）: `make test-api` が用意した `DATABASE_URL_TEST` の DB を読む。比べるために作る一時的なテーブルは、トランザクションの終わりで消える
- DB を作り直すテストと、テンプレートの表を空にするテスト（`templates.test.ts`）: `DATABASE_URL_TEST` の DB をほかのテストが使っているので、名前が `_test` で終わる別の DB を作って使い、終わったら消す
- `bcdx-templates.test.ts`: `data/templates/bcdx/` のファイルを Drive の原本の写し（`docs/drive-templates/`）と design-spec に突き合わせる。DB は使わない
- `templates.test.ts`・`seed.test.ts` のフォントの測り方: どの文字も幅0（どの文も折り返さない）にして渡す。PDF のフォントでの検査は `apps/api` のテスト（`pitch-fit.test.ts`・`admin-templates.test.ts`・`seed-flow.test.ts`）が確かめる
- `seed.test.ts`: シードを入れた DB が design-spec 8章の状態（ユーザー・招待・自己分析・各アイデアの確認項目・工程・判定・プランの版・コメント・通知・変更履歴）になっていること、2回入れても id が変わらないこと、`APP_ENV=local` 以外で動かないことを確かめる。全テーブルを空にするので、名前が `_test` で終わる別の DB を使う。API のステップは、自分の対象の行がシードとその API の書く形で同じかを、ここに足して確かめる
