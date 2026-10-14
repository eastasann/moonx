# @moonx/db

Drizzle のスキーマ・マイグレーション・シード、テンプレートの取り込みと公開、テスト用の DB の作り直し。役割は [SDD 2章「リポジトリ構成」](../../docs/02-01_system-design-doc.md#リポジトリ構成)。

## 中身

- `src/schema.ts`: SDD 6.3 のコード（コメントは英語に直してある）。スキーマを変えるときは SDD 6.3 と一緒に直し、`make db-generate` でマイグレーションを作る（どちらかを忘れると `make test-api` が失敗する）
- `src/relations.ts`: 外部キーごとの `relations()`（名前の付け方はファイルの先頭）
- `src/client.ts`: `connectDatabase(url)`。postgres.js のプールと Drizzle のクライアント（SDD 7.3）
- `src/migrate.ts`: `migrateDatabase(url)`。`make db-migrate` と同じ Drizzle の migrator でマイグレーションを当てる
- `src/templates.ts`: テンプレートのファイルの取り込み（AD10）・公開の前の検査と公開（AD6）。運営者の API とシードが同じものを使う（SDD 5.13）。ファイルの形の検査は `packages/schemas` の `templateFileSchema`
- `migrations/`: `make db-generate` が作る。drizzle-kit が書いたままコミットする（Biome の対象外）。`main` にあるものは書き換えない・消さない（`make db-check`）

## テスト

Bun test で書き、実際の PostgreSQL に対して動かす（ADR-022）。

- import: `import { describe, expect, test } from "bun:test"`
- 置き場所: 対象のファイルの隣に `*.test.ts`
- 実行: `make test-api`（`apps/api` のテストと一緒に動く）。先に `DATABASE_URL_TEST` の DB を作り直してマイグレーションを当てるので、`make db-up` で DB を起動しておく
- スキーマの検査（`migrations.test.ts`・`relations.test.ts`）: `make test-api` が用意した `DATABASE_URL_TEST` の DB を読む。比べるために作る一時的なテーブルは、トランザクションの終わりで消える
- DB を作り直すテストと、テンプレートの表を空にするテスト（`templates.test.ts`）: `DATABASE_URL_TEST` の DB をほかのテストが使っているので、名前が `_test` で終わる別の DB を作って使い、終わったら消す
- `bcdx-templates.test.ts`: `data/templates/bcdx/` のファイルを Drive の原本の写し（`docs/drive-templates/`）と design-spec に突き合わせる。DB は使わない
