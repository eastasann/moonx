# @moonx/db

Drizzle のスキーマ・マイグレーション・シードと、テスト用の DB の作り直し。役割は [SDD 2章「リポジトリ構成」](../../docs/02-01_system-design-doc.md#リポジトリ構成)。

## テスト

Bun test で書き、実際の PostgreSQL に対して動かす（ADR-022）。

- import: `import { describe, expect, test } from "bun:test"`
- 置き場所: 対象のファイルの隣に `*.test.ts`
- 実行: `make test-api`（`apps/api` のテストと一緒に動く）。先に `DATABASE_URL_TEST` の DB を作り直すので、`make db-up` で DB を起動しておく
- DB を作り直すテスト: `DATABASE_URL_TEST` の DB をほかのテストが使っているので、名前が `_test` で終わる別の DB を作って使い、終わったら消す
