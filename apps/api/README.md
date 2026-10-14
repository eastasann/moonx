# @moonx/api

ElysiaJS（Bun）の API。役割は [SDD 2章「リポジトリ構成」](../../docs/02-01_system-design-doc.md#リポジトリ構成)、読む環境変数は [SDD 2章「環境変数」](../../docs/02-01_system-design-doc.md#環境変数)。

## テスト

Bun test で書く（ADR-022）。`apps/web` と `packages/ui-web` の Vitest とは別のツールなので、書き方が違う。

- import: `import { describe, expect, test } from "bun:test"`
- 置き場所: 対象のファイルの隣に `*.test.ts`
- 実行: `make test-api`（`packages/db` のテストと一緒に動く）。先に `DATABASE_URL_TEST` の DB を作り直すので、`make db-up` で DB を起動しておく
- 設定: 環境変数から読まず、`Config`（`appEnv: "test"`）を組み立てて `createApp()` に渡す
- 起動の処理（`src/index.ts`）: リポジトリの外を作業ディレクトリにした子プロセスで確かめる。リポジトリの中で動かすと、Bun が直下の `.env` を読む
